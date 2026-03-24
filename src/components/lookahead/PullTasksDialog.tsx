import { useState, useEffect, useMemo } from "react";
import { format, addDays, subDays, parseISO, isBefore, isAfter, differenceInCalendarDays } from "date-fns";
import { CalendarIcon, Download, ChevronRight, ChevronDown, Filter, Search, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

interface VersionInfo {
  id: string;
  versionNumber: number | null;
  totalCount: number;
  datedCount: number;
  minStart: string | null;
  maxFinish: string | null;
}

export function PullTasksDialog({ projectId, lookaheadId, companyId, existingTaskIds, dates, onTasksPulled }: PullTasksDialogProps) {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<TaskPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [versionLoading, setVersionLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("browse");

  // Date filter state
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [includeBuffer, setIncludeBuffer] = useState(true);
  const [dateSearched, setDateSearched] = useState(false);
  const [dateTasks, setDateTasks] = useState<TaskPreview[]>([]);

  const { toast } = useToast();

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

  // Load version info when dialog opens
  useEffect(() => {
    if (!open) return;
    loadVersionInfo();
  }, [open, projectId]);

  const loadVersionInfo = async () => {
    setVersionLoading(true);
    const { data: versions } = await supabase
      .from("schedule_versions")
      .select("id, version_number")
      .eq("project_id", projectId)
      .order("version_number", { ascending: false })
      .limit(1);

    if (!versions?.length) {
      setVersionInfo(null);
      setVersionLoading(false);
      return;
    }

    const version = versions[0];
    const { data: allTasks } = await supabase
      .from("tasks")
      .select("*")
      .eq("schedule_version_id", version.id);

    const taskList = allTasks || [];
    let minStart: string | null = null;
    let maxFinish: string | null = null;
    let datedCount = 0;

    taskList.forEach((t) => {
      if (t.start_date || t.finish_date) {
        datedCount++;
        if (t.start_date && (!minStart || t.start_date < minStart)) minStart = t.start_date;
        if (t.finish_date && (!maxFinish || t.finish_date > maxFinish)) maxFinish = t.finish_date;
      }
    });

    setVersionInfo({
      id: version.id,
      versionNumber: version.version_number ?? null,
      totalCount: taskList.length,
      datedCount,
      minStart,
      maxFinish,
    });

    // Build browse-all tree
    const tree = buildTaskTree(taskList);
    setTasks(tree);

    // Auto-select browse tab if no dated tasks
    if (datedCount === 0) {
      setActiveTab("browse");
    }

    setVersionLoading(false);
  };

  const buildTaskTree = (rawTasks: any[]): TaskPreview[] => {
    const taskMap = new Map<string, TaskPreview>();
    rawTasks.forEach((t) => {
      taskMap.set(t.id, {
        id: t.id,
        name: t.name,
        start_date: t.start_date,
        finish_date: t.finish_date,
        tags: (t.tags as string[]) || [],
        parent_id: t.parent_id,
        selected: !existingTaskIds.has(t.id),
        children: [],
        overlapDays: computeOverlapDays(t.start_date, t.finish_date),
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
    topLevel.forEach((t) => { if (t.children.length > 0) expanded.add(t.id); });
    setExpandedIds(expanded);

    return topLevel;
  };

  // Filter tasks by search query
  const filterTasks = (items: TaskPreview[], query: string): TaskPreview[] => {
    if (!query) return items;
    const lower = query.toLowerCase();
    return items
      .map((task) => {
        const childrenMatch = filterTasks(task.children, query);
        const selfMatch = task.name.toLowerCase().includes(lower) ||
          task.tags.some((tag) => tag.toLowerCase().includes(lower));
        if (selfMatch || childrenMatch.length > 0) {
          return { ...task, children: selfMatch ? task.children : childrenMatch };
        }
        return null;
      })
      .filter(Boolean) as TaskPreview[];
  };

  const displayedBrowseTasks = useMemo(
    () => filterTasks(tasks, searchQuery),
    [tasks, searchQuery]
  );

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Date-range search
  const handleDateSearch = async () => {
    if (!startDate || !endDate || !versionInfo) return;
    setLoading(true);
    setDateSearched(false);
    setDateTasks([]);

    const searchStart = includeBuffer ? subDays(startDate, 14) : startDate;
    const searchEnd = includeBuffer ? addDays(endDate, 14) : endDate;

    const { data: allTasks } = await supabase
      .from("tasks")
      .select("*")
      .eq("schedule_version_id", versionInfo.id);

    const all = allTasks || [];
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

    const resultIds = new Set([...overlapping, ...parentIds]);
    const filtered = all.filter((t) => resultIds.has(t.id));
    const tree = buildDateTaskTree(filtered);

    setDateTasks(tree);
    setDateSearched(true);
    setLoading(false);
  };

  const buildDateTaskTree = (rawTasks: any[]): TaskPreview[] => {
    const taskMap = new Map<string, TaskPreview>();
    rawTasks.forEach((t) => {
      taskMap.set(t.id, {
        id: t.id,
        name: t.name,
        start_date: t.start_date,
        finish_date: t.finish_date,
        tags: (t.tags as string[]) || [],
        parent_id: t.parent_id,
        selected: !existingTaskIds.has(t.id),
        children: [],
        overlapDays: computeOverlapDays(t.start_date, t.finish_date),
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
    return topLevel;
  };

  const getAllFlat = (items: TaskPreview[]): TaskPreview[] => {
    const result: TaskPreview[] = [];
    items.forEach((task) => {
      result.push(task);
      result.push(...getAllFlat(task.children));
    });
    return result;
  };

  const currentTasks = activeTab === "browse" ? displayedBrowseTasks : dateTasks;
  const allFlat = getAllFlat(activeTab === "browse" ? tasks : dateTasks);
  const selectable = allFlat.filter((t) => !existingTaskIds.has(t.id));
  const selectedCount = allFlat.filter((t) => t.selected && !existingTaskIds.has(t.id)).length;

  const toggleTask = (id: string, checked: boolean, source: "browse" | "date") => {
    const setter = source === "browse" ? setTasks : setDateTasks;
    const updateTree = (items: TaskPreview[]): TaskPreview[] =>
      items.map((task) => {
        if (task.id === id) {
          return {
            ...task,
            selected: existingTaskIds.has(task.id) ? false : checked,
            children: task.children.map((c) => ({
              ...c,
              selected: existingTaskIds.has(c.id) ? false : checked,
            })),
          };
        }
        const updatedChildren = task.children.map((child) =>
          child.id === id ? { ...child, selected: existingTaskIds.has(child.id) ? false : checked } : child
        );
        if (updatedChildren !== task.children) {
          return { ...task, children: updateTree(task.children) };
        }
        return { ...task, children: updatedChildren };
      });
    setter((prev) => updateTree(prev));
  };

  const toggleAll = (checked: boolean) => {
    const setter = activeTab === "browse" ? setTasks : setDateTasks;
    const updateTree = (items: TaskPreview[]): TaskPreview[] =>
      items.map((task) => ({
        ...task,
        selected: existingTaskIds.has(task.id) ? false : checked,
        children: updateTree(task.children),
      }));
    setter((prev) => updateTree(prev));
  };

  const handlePull = async () => {
    const selected = allFlat.filter((t) => t.selected && !existingTaskIds.has(t.id));
    if (!selected.length) return;
    setPulling(true);

    const { data: templates } = await supabase
      .from("task_templates")
      .select("*")
      .eq("company_id", companyId);
    const templateMap = new Map<string, any>();
    (templates || []).forEach((t) => templateMap.set(t.tag.toLowerCase(), t));

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
        : "No date overlap — mark statuses manually.",
    });

    onTasksPulled();
  };

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
            onCheckedChange={(checked) => toggleTask(task.id, !!checked, activeTab as "browse" | "date")}
          />
          <div className="flex-1 min-w-0">
            <span className={cn("truncate block", hasChildren && "font-medium")}>{task.name}</span>
            {task.start_date && (
              <span className="text-xs text-muted-foreground">
                {format(parseISO(task.start_date), "MMM d")} — {task.finish_date ? format(parseISO(task.finish_date), "MMM d") : "?"}
              </span>
            )}
            {!task.start_date && !task.finish_date && (
              <span className="text-xs text-muted-foreground italic">No dates</span>
            )}
          </div>
          {renderOverlapBadge(task.overlapDays)}
          {alreadyExists && <span className="text-xs text-muted-foreground italic">Already added</span>}
          {hasChildren && <span className="text-xs text-muted-foreground">{task.children.length} sub</span>}
        </div>
        {hasChildren && isExpanded && task.children.map((child) => renderTask(child, depth + 1))}
      </div>
    );
  };

  const renderTaskList = (taskList: TaskPreview[]) => (
    <>
      <div className="flex items-center justify-between p-2 border-b bg-muted/30 gap-2">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={selectedCount === selectable.length && selectedCount > 0}
            onCheckedChange={(checked) => toggleAll(!!checked)}
          />
          <span className="text-xs font-medium">{selectedCount} selected</span>
        </div>
        <span className="text-xs text-muted-foreground">{getAllFlat(taskList).length} tasks</span>
      </div>
      <div className="max-h-[300px] overflow-auto">
        {taskList.map((task) => renderTask(task))}
      </div>
    </>
  );

  const renderNoSchedule = () => (
    <div className="text-center py-8 text-muted-foreground text-sm border rounded-md">
      <p className="mb-1 font-medium">No schedule uploaded</p>
      <p>Upload a master schedule on the project page first, or use "Add Line" to create tasks manually.</p>
    </div>
  );

  const renderNoTasks = () => (
    <div className="text-center py-8 text-muted-foreground text-sm border rounded-md">
      <p className="mb-1 font-medium">No tasks extracted</p>
      <p>The schedule was processed but no tasks were extracted. Try re-uploading.</p>
    </div>
  );

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
          <DialogDescription>
            Select tasks from your master schedule to add to this look-ahead.
          </DialogDescription>
        </DialogHeader>

        {versionLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            Loading schedule...
          </div>
        ) : !versionInfo ? (
          renderNoSchedule()
        ) : versionInfo.totalCount === 0 ? (
          renderNoTasks()
        ) : (
          <>
            <div className="text-xs text-muted-foreground mb-1">
              Schedule v{versionInfo.versionNumber ?? "?"} · {versionInfo.totalCount} tasks
              {versionInfo.datedCount > 0 && ` · ${versionInfo.datedCount} with dates`}
              {versionInfo.minStart && versionInfo.maxFinish && (
                <> · {format(parseISO(versionInfo.minStart), "MMM d, yyyy")} — {format(parseISO(versionInfo.maxFinish), "MMM d, yyyy")}</>
              )}
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="w-full">
                <TabsTrigger value="browse" className="flex-1">Browse All Tasks</TabsTrigger>
                <TabsTrigger value="date" className="flex-1" disabled={versionInfo.datedCount === 0}>
                  Filter by Date Range
                </TabsTrigger>
              </TabsList>

              {versionInfo.datedCount === 0 && (
                <div className="flex items-center gap-2 mt-2 px-2 py-1.5 rounded-md bg-yellow-100/50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  No tasks have dates — use Browse All to select tasks.
                </div>
              )}

              <TabsContent value="browse" className="flex-1 flex flex-col overflow-hidden mt-2">
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search by task name or tag..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-9 text-sm"
                  />
                </div>

                {displayedBrowseTasks.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm border rounded-md">
                    {searchQuery ? "No tasks match your search." : "No tasks available."}
                  </div>
                ) : (
                  <div className="border rounded-md overflow-hidden flex-1 flex flex-col">
                    {renderTaskList(displayedBrowseTasks)}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="date" className="flex-1 flex flex-col overflow-hidden mt-2">
                <div className="flex items-end gap-3 flex-wrap mb-2">
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
                  <Button size="sm" onClick={handleDateSearch} disabled={!startDate || !endDate || loading}>
                    {loading ? "Searching..." : "Find Tasks"}
                  </Button>
                </div>

                {dateSearched && dateTasks.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm border rounded-md">
                    No tasks matched this date range.
                  </div>
                )}

                {dateTasks.length > 0 && (
                  <div className="border rounded-md overflow-hidden flex-1 flex flex-col">
                    {renderTaskList(dateTasks)}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {selectedCount > 0 && (
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={handlePull} disabled={pulling}>
                  {pulling ? "Pulling..." : `Pull ${selectedCount} Tasks`}
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
