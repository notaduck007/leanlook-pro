import { useState } from "react";
import { format, addDays, subDays, parseISO, isBefore, isAfter, differenceInCalendarDays } from "date-fns";
import { CalendarIcon, Download, ChevronRight, ChevronDown, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  overlapDays: number;
}

interface SearchMeta {
  versionNumber: number | null;
  minStart: string | null;
  maxFinish: string | null;
  overlapCount: number;
  totalCount: number;
}

type FilterMode = "all" | "overlapping";

export function PullTasksDialog({ projectId, lookaheadId, companyId, existingTaskIds, dates, onTasksPulled }: PullTasksDialogProps) {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [includeBuffer, setIncludeBuffer] = useState(true);
  const [tasks, setTasks] = useState<TaskPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [searched, setSearched] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [searchMeta, setSearchMeta] = useState<SearchMeta | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const { toast } = useToast();

  // Compute the lookahead 2-week window from dates prop
  const lookaheadStart = dates.length > 0 ? parseISO(dates[0]) : null;
  const lookaheadEnd = dates.length > 0 ? parseISO(dates[dates.length - 1]) : null;

  const computeOverlapDays = (taskStartStr: string | null, taskFinishStr: string | null): number => {
    if (!lookaheadStart || !lookaheadEnd || (!taskStartStr && !taskFinishStr)) return 0;
    const taskStart = taskStartStr ? parseISO(taskStartStr) : null;
    const taskEnd = taskFinishStr ? parseISO(taskFinishStr) : taskStart;
    if (!taskStart || !taskEnd) return 0;

    const overlapStart = isBefore(taskStart, lookaheadStart) ? lookaheadStart : taskStart;
    const overlapEnd = isAfter(taskEnd, lookaheadEnd) ? lookaheadEnd : taskEnd;

    if (isAfter(overlapStart, overlapEnd)) return 0;
    return differenceInCalendarDays(overlapEnd, overlapStart) + 1;
  };

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
    setSearched(false);
    setTasks([]);
    setExpandedIds(new Set());
    setSearchMeta(null);
    setFilterMode("all");

    const searchStart = includeBuffer ? subDays(startDate, 14) : startDate;
    const searchEnd = includeBuffer ? addDays(endDate, 14) : endDate;

    const { data: versions } = await supabase
      .from("schedule_versions")
      .select("id, version_number, uploaded_at")
      .eq("project_id", projectId)
      .order("version_number", { ascending: false });

    if (!versions?.length) {
      setSearched(true);
      setLoading(false);
      return;
    }

    const versionIds = versions.map((version) => version.id);
    const { data: allTasks } = await supabase
      .from("tasks")
      .select("*")
      .in("schedule_version_id", versionIds);

    const tasksByVersion = new Map<string, any[]>();
    versions.forEach((version) => tasksByVersion.set(version.id, []));
    (allTasks || []).forEach((task) => {
      const bucket = tasksByVersion.get(task.schedule_version_id);
      if (bucket) bucket.push(task);
    });

    const versionSummaries = versions.map((version) => {
      const versionTasks = tasksByVersion.get(version.id) || [];
      let minStart: string | null = null;
      let maxFinish: string | null = null;
      let overlapCount = 0;

      versionTasks.forEach((task) => {
        if (task.start_date && (!minStart || task.start_date < minStart)) minStart = task.start_date;
        if (task.finish_date && (!maxFinish || task.finish_date > maxFinish)) maxFinish = task.finish_date;

        if (!task.start_date && !task.finish_date) return;

        const taskStart = task.start_date ? parseISO(task.start_date) : null;
        const taskEnd = task.finish_date ? parseISO(task.finish_date) : taskStart;
        if (!taskStart && !taskEnd) return;

        if ((!taskStart || !isAfter(taskStart, searchEnd)) && (!taskEnd || !isBefore(taskEnd, searchStart))) {
          overlapCount += 1;
        }
      });

      return {
        id: version.id,
        versionNumber: version.version_number ?? null,
        minStart,
        maxFinish,
        overlapCount,
        totalCount: versionTasks.length,
        hasDatedTasks: Boolean(minStart || maxFinish),
      };
    });

    const activeVersion =
      versionSummaries.find((summary) => summary.overlapCount > 0) ||
      versionSummaries.find((summary) => summary.hasDatedTasks) ||
      versionSummaries[0];

    const all = tasksByVersion.get(activeVersion.id) || [];

    const overlapping = new Set<string>();
    all.forEach((task) => {
      if (!task.start_date && !task.finish_date) return;
      const taskStart = task.start_date ? parseISO(task.start_date) : null;
      const taskEnd = task.finish_date ? parseISO(task.finish_date) : taskStart;
      if (!taskStart && !taskEnd) return;

      if ((!taskStart || !isAfter(taskStart, searchEnd)) && (!taskEnd || !isBefore(taskEnd, searchStart))) {
        overlapping.add(task.id);
      }
    });

    const parentIds = new Set<string>();
    all.forEach((task) => {
      if (overlapping.has(task.id) && task.parent_id) parentIds.add(task.parent_id);
    });

    all.forEach((task) => {
      if (task.parent_id && overlapping.has(task.parent_id)) overlapping.add(task.id);
    });

    const taskMap = new Map<string, TaskPreview>();
    const resultIds = new Set([...overlapping, ...parentIds]);

    all
      .filter((task) => resultIds.has(task.id))
      .forEach((task) => {
        taskMap.set(task.id, {
          id: task.id,
          name: task.name,
          start_date: task.start_date,
          finish_date: task.finish_date,
          tags: (task.tags as string[]) || [],
          parent_id: task.parent_id,
          selected: !existingTaskIds.has(task.id),
          children: [],
          overlapDays: computeOverlapDays(task.start_date, task.finish_date),
        });
      });

    const topLevel: TaskPreview[] = [];
    taskMap.forEach((task) => {
      if (task.parent_id && taskMap.has(task.parent_id)) {
        taskMap.get(task.parent_id)!.children.push(task);
      } else {
        topLevel.push(task);
      }
    });

    const expanded = new Set<string>();
    topLevel.forEach((task) => {
      if (task.children.length > 0) expanded.add(task.id);
    });

    setExpandedIds(expanded);
    setTasks(topLevel);
    setSearchMeta({
      versionNumber: activeVersion.versionNumber,
      minStart: activeVersion.minStart,
      maxFinish: activeVersion.maxFinish,
      overlapCount: activeVersion.overlapCount,
      totalCount: activeVersion.totalCount,
    });
    setSearched(true);
    setLoading(false);
  };

  const getAllFlat = (items: TaskPreview[]): TaskPreview[] => {
    const result: TaskPreview[] = [];
    items.forEach((task) => {
      result.push(task);
      result.push(...task.children);
    });
    return result;
  };

  const handlePull = async () => {
    const allFlat = getAllFlat(tasks);
    const selected = allFlat.filter((task) => task.selected && !existingTaskIds.has(task.id));
    if (!selected.length) return;
    setPulling(true);

    const { data: templates } = await supabase
      .from("task_templates")
      .select("*")
      .eq("company_id", companyId);
    const templateMap = new Map<string, any>();
    (templates || []).forEach((template) => templateMap.set(template.tag.toLowerCase(), template));

    let plannedCellCount = 0;

    const inserts = selected.map((task, i) => {
      const taskTags = task.tags || [];
      let materials: string | null = null;
      let constraints: string | null = null;
      for (const tag of taskTags) {
        const template = templateMap.get(tag.toLowerCase());
        if (template) {
          const items = (template.checklist_items as any[]) || [];
          materials = items.filter((item: any) => item.type === "material").map((item: any) => item.text).join(", ") || null;
          constraints = items.filter((item: any) => item.type === "constraint").map((item: any) => item.text).join(", ") || null;
          break;
        }
      }

      const statusPerDay: Record<string, string> = {};
      if (task.start_date && task.finish_date) {
        for (const date of dates) {
          const currentDate = parseISO(date);
          const taskStart = parseISO(task.start_date);
          const taskEnd = parseISO(task.finish_date);
          if (!isBefore(currentDate, taskStart) && !isAfter(currentDate, taskEnd)) {
            statusPerDay[date] = "planned";
            plannedCellCount++;
          }
        }
      }

      return {
        lookahead_id: lookaheadId,
        company_id: companyId,
        task_id: task.id,
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

    toast({
      title: `Pulled ${selected.length} tasks`,
      description: plannedCellCount > 0
        ? `${plannedCellCount} cells auto-marked as planned based on schedule dates.`
        : "No date overlap with this 2-week window — mark statuses manually.",
    });

    onTasksPulled();
  };

  const toggleTask = (id: string, checked: boolean) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id === id) {
          const newChildren = task.children.map((child) => ({
            ...child,
            selected: existingTaskIds.has(child.id) ? false : checked,
          }));
          return { ...task, selected: existingTaskIds.has(task.id) ? false : checked, children: newChildren };
        }

        const newChildren = task.children.map((child) =>
          child.id === id ? { ...child, selected: existingTaskIds.has(child.id) ? false : checked } : child
        );
        return { ...task, children: newChildren };
      })
    );
  };

  const toggleAll = (checked: boolean) => {
    setTasks((prev) =>
      prev.map((task) => ({
        ...task,
        selected: existingTaskIds.has(task.id) ? false : checked,
        children: task.children.map((child) => ({
          ...child,
          selected: existingTaskIds.has(child.id) ? false : checked,
        })),
      }))
    );
  };

  const selectOverlappingOnly = () => {
    setTasks((prev) =>
      prev.map((task) => ({
        ...task,
        selected: existingTaskIds.has(task.id) ? false : task.overlapDays > 0,
        children: task.children.map((child) => ({
          ...child,
          selected: existingTaskIds.has(child.id) ? false : child.overlapDays > 0,
        })),
      }))
    );
    setFilterMode("overlapping");
  };

  const selectAll = () => {
    toggleAll(true);
    setFilterMode("all");
  };

  const allFlat = getAllFlat(tasks);
  const selectable = allFlat.filter((task) => !existingTaskIds.has(task.id));
  const selectedCount = allFlat.filter((task) => task.selected && !existingTaskIds.has(task.id)).length;
  const overlappingCount = allFlat.filter((t) => t.overlapDays > 0 && !existingTaskIds.has(t.id)).length;

  const renderOverlapBadge = (overlapDays: number) => {
    if (overlapDays === 0) return null;
    const totalDays = dates.length;
    const pct = Math.round((overlapDays / totalDays) * 100);
    return (
      <span className={cn(
        "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0",
        pct >= 75 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
        pct >= 30 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
        "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
      )}>
        {overlapDays}/{totalDays}d
      </span>
    );
  };

  const renderTask = (task: TaskPreview, depth: number = 0) => {
    const alreadyExists = existingTaskIds.has(task.id);
    const hasChildren = task.children.length > 0;
    const isExpanded = expandedIds.has(task.id);

    return (
      <div key={task.id}>
        <div
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 border-b last:border-0 text-sm",
            alreadyExists && "opacity-50"
          )}
          style={{ paddingLeft: `${8 + depth * 20}px` }}
        >
          {hasChildren ? (
            <button type="button" onClick={() => toggleExpand(task.id)} className="p-0.5 hover:bg-muted rounded">
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <span className="w-5" />
          )}
          <Checkbox
            checked={task.selected}
            disabled={alreadyExists}
            onCheckedChange={(checked) => toggleTask(task.id, !!checked)}
          />
          <div className="flex-1 min-w-0">
            <span className={cn("truncate block", hasChildren && "font-medium")}>{task.name}</span>
            {task.start_date && (
              <span className="text-xs text-muted-foreground">
                {format(parseISO(task.start_date), "MMM d")} — {task.finish_date ? format(parseISO(task.finish_date), "MMM d") : "?"}
              </span>
            )}
          </div>
          {renderOverlapBadge(task.overlapDays)}
          {alreadyExists && <span className="text-xs text-muted-foreground italic">Already added</span>}
          {hasChildren && <span className="text-xs text-muted-foreground">{task.children.length} subtasks</span>}
        </div>
        {hasChildren && isExpanded && task.children.map((child) => renderTask(child, depth + 1))}
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
            <Checkbox id="buffer" checked={includeBuffer} onCheckedChange={(checked) => setIncludeBuffer(!!checked)} />
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

        {searchMeta?.minStart && searchMeta?.maxFinish && (
          <p className="text-xs text-muted-foreground">
            Using schedule v{searchMeta.versionNumber ?? "?"} · imported task dates {format(parseISO(searchMeta.minStart), "MMM d, yyyy")} — {format(parseISO(searchMeta.maxFinish), "MMM d, yyyy")}
          </p>
        )}

        {searched && tasks.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm border rounded-md mt-2">
            No tasks matched this range.
            {searchMeta?.minStart && searchMeta?.maxFinish
              ? ` The imported schedule currently spans ${format(parseISO(searchMeta.minStart), "MMM d, yyyy")} — ${format(parseISO(searchMeta.maxFinish), "MMM d, yyyy")}.`
              : " This schedule version does not currently contain dated tasks."}
          </div>
        )}

        {tasks.length > 0 && (
          <div className="flex-1 overflow-auto border rounded-md mt-2">
            <div className="flex items-center justify-between p-2 border-b bg-muted/30 gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedCount === selectable.length && selectedCount > 0}
                  onCheckedChange={(checked) => toggleAll(!!checked)}
                />
                <span className="text-xs font-medium">{selectedCount} selected</span>
              </div>
              <div className="flex items-center gap-1.5">
                {overlappingCount > 0 && overlappingCount < selectable.length && (
                  <>
                    <Button
                      variant={filterMode === "overlapping" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-6 text-[11px] px-2"
                      onClick={selectOverlappingOnly}
                    >
                      <Filter className="mr-1 h-3 w-3" />
                      This window only ({overlappingCount})
                    </Button>
                    <Button
                      variant={filterMode === "all" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-6 text-[11px] px-2"
                      onClick={selectAll}
                    >
                      Select all ({selectable.length})
                    </Button>
                  </>
                )}
                <span className="text-xs text-muted-foreground">{allFlat.length} tasks found</span>
              </div>
            </div>
            <div className="max-h-[300px] overflow-auto">
              {tasks.map((task) => renderTask(task))}
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
