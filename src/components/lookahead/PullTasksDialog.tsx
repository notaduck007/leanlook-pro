import { useState } from "react";
import { format, addDays, subDays, parseISO, isBefore, isAfter } from "date-fns";
import { CalendarIcon, Download, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";

interface PullTasksDialogProps {
  projectId: string;
  lookaheadId: string;
  companyId: string;
  existingTaskIds: Set<string | null>;
  dates: string[];
  onTasksPulled: () => void;
}

interface TaskPreview {
  id: string;
  name: string;
  start_date: string | null;
  finish_date: string | null;
  tags: string[];
  parent_id: string | null;
  selected: boolean;
  children: TaskPreview[];
}

export function PullTasksDialog({ projectId, lookaheadId, companyId, existingTaskIds, dates, onTasksPulled }: PullTasksDialogProps) {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [includeBuffer, setIncludeBuffer] = useState(true);
  const [tasks, setTasks] = useState<TaskPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSearch = async () => {
    if (!startDate || !endDate) return;
    setLoading(true);

    const searchStart = includeBuffer ? subDays(startDate, 14) : startDate;
    const searchEnd = includeBuffer ? addDays(endDate, 14) : endDate;

    const { data: versions } = await supabase
      .from("schedule_versions")
      .select("id")
      .eq("project_id", projectId)
      .order("version_number", { ascending: false })
      .limit(1);

    if (!versions?.length) { setLoading(false); return; }

    const { data: allTasks } = await supabase
      .from("tasks")
      .select("*")
      .eq("schedule_version_id", versions[0].id);

    const all = allTasks || [];

    // Filter tasks that overlap the date range
    const overlapping = new Set<string>();
    all.forEach((t) => {
      if (!t.start_date && !t.finish_date) return;
      const ts = t.start_date ? parseISO(t.start_date) : null;
      const te = t.finish_date ? parseISO(t.finish_date) : ts;
      if (!ts && !te) return;
      if ((!ts || !isAfter(ts, searchEnd)) && (!te || !isBefore(te, searchStart))) {
        overlapping.add(t.id);
      }
    });

    // Also include parents of overlapping tasks, and children of overlapping parents
    const parentIds = new Set<string>();
    all.forEach((t) => {
      if (overlapping.has(t.id) && t.parent_id) parentIds.add(t.parent_id);
    });
    // Include children whose parent is in the overlapping set
    all.forEach((t) => {
      if (t.parent_id && overlapping.has(t.parent_id)) overlapping.add(t.id);
    });

    // Build hierarchy: top-level = no parent or parent not in result set
    const taskMap = new Map<string, TaskPreview>();
    const resultIds = new Set([...overlapping, ...parentIds]);

    all.filter((t) => resultIds.has(t.id)).forEach((t) => {
      taskMap.set(t.id, {
        id: t.id,
        name: t.name,
        start_date: t.start_date,
        finish_date: t.finish_date,
        tags: (t.tags as string[]) || [],
        parent_id: t.parent_id,
        selected: !existingTaskIds.has(t.id),
        children: [],
      });
    });

    // Nest children under parents
    const topLevel: TaskPreview[] = [];
    taskMap.forEach((t) => {
      if (t.parent_id && taskMap.has(t.parent_id)) {
        taskMap.get(t.parent_id)!.children.push(t);
      } else {
        topLevel.push(t);
      }
    });

    // Auto-expand parents with children
    const expanded = new Set<string>();
    topLevel.forEach((t) => { if (t.children.length > 0) expanded.add(t.id); });
    setExpandedIds(expanded);

    setTasks(topLevel);
    setLoading(false);
  };

  const getAllFlat = (items: TaskPreview[]): TaskPreview[] => {
    const result: TaskPreview[] = [];
    items.forEach((t) => {
      result.push(t);
      result.push(...t.children);
    });
    return result;
  };

  const handlePull = async () => {
    const allFlat = getAllFlat(tasks);
    const selected = allFlat.filter((t) => t.selected && !existingTaskIds.has(t.id));
    if (!selected.length) return;
    setPulling(true);

    const { data: templates } = await supabase
      .from("task_templates")
      .select("*")
      .eq("company_id", companyId);
    const templateMap = new Map<string, any>();
    (templates || []).forEach((t) => templateMap.set(t.tag.toLowerCase(), t));

    const inserts = selected.map((t, i) => {
      const taskTags = t.tags || [];
      let materials: string | null = null;
      let constraints: string | null = null;
      for (const tag of taskTags) {
        const tmpl = templateMap.get(tag.toLowerCase());
        if (tmpl) {
          const items = (tmpl.checklist_items as any[]) || [];
          materials = items.filter((c: any) => c.type === "material").map((c: any) => c.text).join(", ") || null;
          constraints = items.filter((c: any) => c.type === "constraint").map((c: any) => c.text).join(", ") || null;
          break;
        }
      }

      const statusPerDay: Record<string, string> = {};
      if (t.start_date && t.finish_date) {
        for (const d of dates) {
          const dp = parseISO(d);
          const ts = parseISO(t.start_date);
          const te = parseISO(t.finish_date);
          if (!isBefore(dp, ts) && !isAfter(dp, te)) {
            statusPerDay[d] = "planned";
          }
        }
      }

      return {
        lookahead_id: lookaheadId,
        company_id: companyId,
        task_id: t.id,
        sort_order: i,
        status_per_day: statusPerDay,
        assigned_trade: taskTags.join(", ") || null,
        materials_needed: materials,
        constraints,
      };
    });

    await supabase.from("lookahead_lines").insert(inserts);
    setPulling(false);
    setOpen(false);
    onTasksPulled();
  };

  const toggleTask = (id: string, checked: boolean) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          // Toggle parent + all children together
          const newChildren = t.children.map((c) => ({
            ...c,
            selected: existingTaskIds.has(c.id) ? false : checked,
          }));
          return { ...t, selected: existingTaskIds.has(t.id) ? false : checked, children: newChildren };
        }
        // Check if it's a child
        const newChildren = t.children.map((c) =>
          c.id === id ? { ...c, selected: existingTaskIds.has(c.id) ? false : checked } : c
        );
        return { ...t, children: newChildren };
      })
    );
  };

  const toggleAll = (checked: boolean) => {
    setTasks((prev) =>
      prev.map((t) => ({
        ...t,
        selected: existingTaskIds.has(t.id) ? false : checked,
        children: t.children.map((c) => ({
          ...c,
          selected: existingTaskIds.has(c.id) ? false : checked,
        })),
      }))
    );
  };

  const allFlat = getAllFlat(tasks);
  const selectable = allFlat.filter((t) => !existingTaskIds.has(t.id));
  const selectedCount = allFlat.filter((t) => t.selected && !existingTaskIds.has(t.id)).length;

  const renderTask = (t: TaskPreview, depth: number = 0) => {
    const alreadyExists = existingTaskIds.has(t.id);
    const hasChildren = t.children.length > 0;
    const isExpanded = expandedIds.has(t.id);

    return (
      <div key={t.id}>
        <div
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 border-b last:border-0 text-sm",
            alreadyExists && "opacity-50"
          )}
          style={{ paddingLeft: `${8 + depth * 20}px` }}
        >
          {hasChildren ? (
            <button onClick={() => toggleExpand(t.id)} className="p-0.5 hover:bg-muted rounded">
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <span className="w-5" />
          )}
          <Checkbox
            checked={t.selected}
            disabled={alreadyExists}
            onCheckedChange={(c) => toggleTask(t.id, !!c)}
          />
          <div className="flex-1 min-w-0">
            <span className={cn("truncate block", hasChildren && "font-medium")}>{t.name}</span>
            {t.start_date && (
              <span className="text-xs text-muted-foreground">
                {format(parseISO(t.start_date), "MMM d")} — {t.finish_date ? format(parseISO(t.finish_date), "MMM d") : "?"}
              </span>
            )}
          </div>
          {alreadyExists && <span className="text-xs text-muted-foreground italic">Already added</span>}
          {hasChildren && <span className="text-xs text-muted-foreground">{t.children.length} subtasks</span>}
        </div>
        {hasChildren && isExpanded && t.children.map((c) => renderTask(c, depth + 1))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="mr-1 h-3.5 w-3.5" /> Pull Tasks
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Pull Tasks from Schedule</DialogTitle>
          <DialogDescription>Select a date range to find overlapping tasks and subtasks from the master schedule.</DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Start Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                  {startDate ? format(startDate, "MMM d, yyyy") : "Pick date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={startDate} onSelect={setStartDate} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">End Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                  {endDate ? format(endDate, "MMM d, yyyy") : "Pick date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={endDate} onSelect={setEndDate} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-2 pb-1">
            <Checkbox id="buffer" checked={includeBuffer} onCheckedChange={(c) => setIncludeBuffer(!!c)} />
            <label htmlFor="buffer" className="text-xs">±2 weeks buffer</label>
          </div>

          <Button size="sm" onClick={handleSearch} disabled={!startDate || !endDate || loading}>
            {loading ? "Searching..." : "Find Tasks"}
          </Button>
        </div>

        {includeBuffer && startDate && endDate && (
          <p className="text-xs text-muted-foreground">
            Searching {format(subDays(startDate, 14), "MMM d")} — {format(addDays(endDate, 14), "MMM d, yyyy")} (including ±2 week buffer)
          </p>
        )}

        {tasks.length > 0 && (
          <div className="flex-1 overflow-auto border rounded-md mt-2">
            <div className="flex items-center justify-between p-2 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedCount === selectable.length && selectedCount > 0}
                  onCheckedChange={(c) => toggleAll(!!c)}
                />
                <span className="text-xs font-medium">{selectedCount} selected</span>
              </div>
              <span className="text-xs text-muted-foreground">{allFlat.length} tasks found</span>
            </div>
            <div className="max-h-[300px] overflow-auto">
              {tasks.map((t) => renderTask(t))}
            </div>
          </div>
        )}

        {tasks.length > 0 && (
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handlePull} disabled={pulling || selectedCount === 0}>
              {pulling ? "Pulling..." : `Pull ${selectedCount} Tasks`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
