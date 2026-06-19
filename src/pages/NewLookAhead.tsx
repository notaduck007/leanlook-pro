import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CalendarDays, CalendarIcon, Loader2 } from "lucide-react";
import { format, startOfWeek, addWeeks, addDays, parseISO, isBefore, isAfter } from "date-fns";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DayStatus } from "@/components/lookahead/StatusCell";

interface CarryOverTask {
  id: string;
  task_name: string;
  assigned_trade: string | null;
  task_id: string | null;
  custom_text: string | null;
  materials_needed: string | null;
  constraints: string | null;
  notes: string | null;
  percent_complete: number;
  expected_completion_date: string | null;
  status_per_day: Record<string, string>;
  selected: boolean;
  subtasks: CarryOverSubtask[];
  // Carry-over progress data
  previous_percent_complete: number;
  previous_status_summary: Record<string, number>;
  carry_over_reason: string;
}

interface CarryOverSubtask {
  id: string;
  custom_text: string | null;
  task_id: string | null;
  assigned_trade: string | null;
  materials_needed: string | null;
  constraints: string | null;
  notes: string | null;
  percent_complete: number;
  expected_completion_date: string | null;
  status_per_day: Record<string, string>;
  is_complete: boolean;
  previous_percent_complete: number;
  previous_status_summary: Record<string, number>;
}

function calculateLineProgress(statusPerDay: Record<string, string>) {
  const statuses = Object.values(statusPerDay);
  const Y = statuses.filter(s => s === "Y").length;
  const N = statuses.filter(s => s === "N").length;
  const fifty = statuses.filter(s => s === "50").length;
  const progress = statuses.filter(s => s === "progress").length;
  const planned = statuses.filter(s => s === "planned").length;
  const totalPlanned = Y + N + fifty + progress + planned;
  const pctComplete = totalPlanned > 0 ? Math.round((Y / totalPlanned) * 100) : 0;
  const isComplete = totalPlanned > 0 && Y === totalPlanned;
  return { Y, N, fifty, progress, planned, totalPlanned, pctComplete, isComplete };
}

export default function NewLookAhead() {
  const { id: projectId } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [project, setProject] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [weekStart, setWeekStart] = useState("");
  const [taskCount, setTaskCount] = useState(0);
  const [previousLookahead, setPreviousLookahead] = useState<any>(null);
  const [carryOverTasks, setCarryOverTasks] = useState<CarryOverTask[]>([]);
  const [showCarryOverDialog, setShowCarryOverDialog] = useState(false);
  const [pendingCreate, setPendingCreate] = useState(false);
  const [recommendedWeekStart, setRecommendedWeekStart] = useState("");

  // Load project and latest lookahead to determine next week start
  useEffect(() => {
    if (!projectId) return;
    supabase.from("projects").select("*").eq("id", projectId).single().then(({ data }) => setProject(data));

    supabase
      .from("look_aheads")
      .select("*")
      .eq("project_id", projectId)
      .order("week_start_date", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data?.length) {
          const latest = data[0];
          setPreviousLookahead(latest);
          const prevStart = parseISO(latest.week_start_date);
          const nextStart = addDays(prevStart, 7);
          const formatted = format(nextStart, "yyyy-MM-dd");
          setWeekStart(formatted);
          setRecommendedWeekStart(formatted);
        } else {
          const next = startOfWeek(addWeeks(new Date(), 1), { weekStartsOn: 1 });
          const formatted = format(next, "yyyy-MM-dd");
          setWeekStart(formatted);
          setRecommendedWeekStart(formatted);
        }
      });
  }, [projectId]);

  // Count tasks overlapping the 2-week window
  useEffect(() => {
    if (!projectId || !weekStart) return;
    const end = format(addWeeks(new Date(weekStart), 2), "yyyy-MM-dd");
    supabase
      .from("schedule_versions")
      .select("id")
      .eq("project_id", projectId)
      .order("version_number", { ascending: false })
      .limit(1)
      .then(({ data: versions }) => {
        if (!versions?.length) { setTaskCount(0); return; }
        supabase
          .from("tasks")
          .select("id", { count: "exact" })
          .eq("schedule_version_id", versions[0].id)
          .lte("start_date", end)
          .gte("finish_date", weekStart)
          .then(({ count }) => setTaskCount(count || 0));
      });
  }, [projectId, weekStart]);

  // Load carry-over candidates from previous lookahead with progress data
  useEffect(() => {
    if (!previousLookahead) return;

    const loadCarryOver = async () => {
      const prevStart = parseISO(previousLookahead.week_start_date);
      const newEndDate = weekStart ? addDays(parseISO(weekStart), 13) : null;

      const { data: prevLines } = await supabase
        .from("lookahead_lines")
        .select("*")
        .eq("lookahead_id", previousLookahead.id);

      if (!prevLines?.length) return;

      // Get task names
      const taskIds = prevLines.filter((l) => l.task_id).map((l) => l.task_id!);
      let taskMap: Record<string, any> = {};
      if (taskIds.length > 0) {
        const { data: tasks } = await supabase
          .from("tasks")
          .select("id, name")
          .in("id", taskIds);
        taskMap = (tasks || []).reduce((acc, t) => ({ ...acc, [t.id]: t }), {});
      }

      // Separate parent lines and child lines
      const parentLines = prevLines.filter((l) => !l.parent_line_id);
      const childLines = prevLines.filter((l) => l.parent_line_id);

      // Build parent → children map
      const childrenByParent = new Map<string, typeof prevLines>();
      childLines.forEach((c) => {
        const existing = childrenByParent.get(c.parent_line_id!) || [];
        existing.push(c);
        childrenByParent.set(c.parent_line_id!, existing);
      });

      const candidates: CarryOverTask[] = [];
      for (const line of parentLines) {
        const statusPerDay = (line.status_per_day as Record<string, string>) || {};
        const parentProgress = calculateLineProgress(statusPerDay);

        const lineChildren = childrenByParent.get(line.id) || [];

        // Calculate progress for each child
        const childProgressList = lineChildren.map((child) => {
          const childSpd = (child.status_per_day as Record<string, string>) || {};
          const prog = calculateLineProgress(childSpd);
          return { child, progress: prog };
        });

        // Determine if this parent qualifies for carry-over
        let qualifies = false;

        if (lineChildren.length > 0) {
          // Parent with children: qualifies if ANY child is incomplete
          const hasIncompleteChild = childProgressList.some(({ progress }) => !progress.isComplete);
          qualifies = hasIncompleteChild;
        } else {
          // Standalone task: qualifies if incomplete
          qualifies = !parentProgress.isComplete && parentProgress.totalPlanned > 0;
        }

        // Also check expected_completion_date
        const expectedDate = line.expected_completion_date ? parseISO(line.expected_completion_date) : null;
        const exceedsNewWindow = expectedDate && newEndDate ? isAfter(expectedDate, newEndDate) : false;
        if (exceedsNewWindow) qualifies = true;

        // Also qualify if parent has zero planned but children have work
        if (!qualifies && lineChildren.length === 0 && parentProgress.totalPlanned === 0) {
          // Task with no statuses set at all — skip
          continue;
        }

        if (qualifies) {
          // For tasks with children: only carry over INCOMPLETE children
          const incompleteChildren = childProgressList.filter(({ progress }) => !progress.isComplete);
          const completeChildCount = childProgressList.filter(({ progress }) => progress.isComplete).length;

          const subtasks: CarryOverSubtask[] = (lineChildren.length > 0 ? incompleteChildren : []).map(({ child, progress }) => ({
            id: child.id,
            custom_text: child.custom_text,
            task_id: child.task_id,
            assigned_trade: child.assigned_trade,
            materials_needed: child.materials_needed,
            constraints: child.constraints,
            notes: child.notes,
            percent_complete: child.percent_complete || 0,
            expected_completion_date: child.expected_completion_date || null,
            status_per_day: (child.status_per_day as Record<string, string>) || {},
            is_complete: progress.isComplete,
            previous_percent_complete: progress.pctComplete,
            previous_status_summary: { Y: progress.Y, N: progress.N, "50": progress.fifty, progress: progress.progress, planned: progress.planned },
          }));

          candidates.push({
            id: line.id,
            task_name: line.task_id ? taskMap[line.task_id]?.name || "Unknown" : line.custom_text || "Custom Task",
            assigned_trade: line.assigned_trade,
            task_id: line.task_id,
            custom_text: line.custom_text,
            materials_needed: line.materials_needed,
            constraints: line.constraints,
            notes: line.notes,
            percent_complete: line.percent_complete || 0,
            expected_completion_date: line.expected_completion_date || null,
            status_per_day: statusPerDay,
            selected: true,
            subtasks,
            previous_percent_complete: parentProgress.pctComplete,
            previous_status_summary: { Y: parentProgress.Y, N: parentProgress.N, "50": parentProgress.fifty, progress: parentProgress.progress, planned: parentProgress.planned },
            carry_over_reason: parentProgress.pctComplete === 0 ? "not_started" : "incomplete",
          });
        }
      }

      // Handle orphaned subtasks (parent not in this lookahead)
      const parentIdsInLines = new Set(parentLines.map(l => l.id));
      childLines.forEach((child) => {
        if (!parentIdsInLines.has(child.parent_line_id!)) {
          console.warn(`Orphaned subtask ${child.id} — parent ${child.parent_line_id} not found in lookahead`);
          const childSpd = (child.status_per_day as Record<string, string>) || {};
          const prog = calculateLineProgress(childSpd);
          if (!prog.isComplete && prog.totalPlanned > 0) {
            candidates.push({
              id: child.id,
              task_name: child.custom_text || "Orphaned Subtask",
              assigned_trade: child.assigned_trade,
              task_id: child.task_id,
              custom_text: child.custom_text,
              materials_needed: child.materials_needed,
              constraints: child.constraints,
              notes: child.notes,
              percent_complete: child.percent_complete || 0,
              expected_completion_date: child.expected_completion_date || null,
              status_per_day: childSpd,
              selected: true,
              subtasks: [],
              previous_percent_complete: prog.pctComplete,
              previous_status_summary: { Y: prog.Y, N: prog.N, "50": prog.fifty, progress: prog.progress, planned: prog.planned },
              carry_over_reason: prog.pctComplete === 0 ? "not_started" : "incomplete",
            });
          }
        }
      });

      setCarryOverTasks(candidates);
    };

    loadCarryOver();
  }, [previousLookahead, weekStart]);

  const handleCreate = async () => {
    if (!projectId || !user || !profile?.company_id) return;

    if (carryOverTasks.length > 0 && !pendingCreate) {
      setShowCarryOverDialog(true);
      return;
    }

    setCreating(true);

    const { data: la, error } = await supabase
      .from("look_aheads")
      .insert({
        project_id: projectId,
        company_id: profile.company_id,
        super_id: user.id,
        week_start_date: weekStart,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setCreating(false);
      return;
    }

    // Get latest schedule version
    const { data: versions } = await supabase
      .from("schedule_versions")
      .select("id")
      .eq("project_id", projectId)
      .order("version_number", { ascending: false })
      .limit(1);

    if (versions?.length) {
      const wsDate = parseISO(weekStart);
      const weDate = addDays(wsDate, 13);
      const end = format(weDate, "yyyy-MM-dd");
      const dates = Array.from({ length: 14 }, (_, i) => format(addDays(wsDate, i), "yyyy-MM-dd"));

      const { data: tasks } = await supabase
        .from("tasks")
        .select("*")
        .eq("schedule_version_id", versions[0].id)
        .lte("start_date", end)
        .gte("finish_date", weekStart)
        .order("name");

      const { data: templates } = await supabase
        .from("task_templates")
        .select("*")
        .eq("company_id", profile.company_id);

      const templateMap = new Map<string, any>();
      (templates || []).forEach((t) => templateMap.set(t.tag.toLowerCase(), t));

      if (tasks?.length) {
        const lines = tasks.map((task, i) => {
          const statusPerDay: Record<string, string> = {};
          const taskStart = task.start_date ? parseISO(task.start_date) : null;
          const taskEnd = task.finish_date ? parseISO(task.finish_date) : taskStart;
          dates.forEach((date) => {
            const d = parseISO(date);
            // Skip weekends — only seed Mon–Fri working days as "planned"
            const dow = d.getDay();
            if (dow === 0 || dow === 6) return;
            const afterStart = taskStart ? !isBefore(d, taskStart) : true;
            const beforeEnd = taskEnd ? !isAfter(d, taskEnd) : true;
            if (afterStart && beforeEnd) {
              statusPerDay[date] = "planned";
            }
          });

          const taskTags = (task.tags as string[]) || [];
          let materials: string | null = null;
          let constraints: string | null = null;
          for (const tag of taskTags) {
            const tmpl = templateMap.get(tag.toLowerCase());
            if (tmpl) {
              const items = (tmpl.checklist_items as any[]) || [];
              const matItems = items.filter((c: any) => c.type === "material").map((c: any) => c.text);
              const conItems = items.filter((c: any) => c.type === "constraint").map((c: any) => c.text);
              if (matItems.length) materials = matItems.join(", ");
              if (conItems.length) constraints = conItems.join(", ");
              break;
            }
          }

          return {
            lookahead_id: la.id,
            company_id: profile.company_id,
            task_id: task.id,
            sort_order: i,
            assigned_trade: taskTags.join(", ") || null,
            status_per_day: statusPerDay,
            materials_needed: materials,
            constraints,
          };
        });

        await supabase.from("lookahead_lines").insert(lines);
      }
    }

    // Insert carry-over tasks (with subtasks and carry_over_data)
    const selectedCarryOver = carryOverTasks.filter((t) => t.selected);
    if (selectedCarryOver.length > 0) {
      const existingTaskIdMap = new Map<string, string>();
      const { data: existingLines } = await supabase
        .from("lookahead_lines")
        .select("id, task_id")
        .eq("lookahead_id", la.id);
      (existingLines || []).forEach((l) => { if (l.task_id) existingTaskIdMap.set(l.task_id, l.id); });

      const newStart = parseISO(weekStart);
      const newDates = Array.from({ length: 14 }, (_, j) => format(addDays(newStart, j), "yyyy-MM-dd"));

      // Carry-over tasks start with empty status — users set planned manually
      const buildEmptyStatus = (): Record<string, string> => ({});

      const buildCarryOverData = (t: CarryOverTask) => ({
        previous_lookahead_id: previousLookahead.id,
        previous_percent_complete: t.previous_percent_complete,
        previous_status_summary: t.previous_status_summary,
        carried_over_at: new Date().toISOString(),
        carry_over_reason: t.carry_over_reason,
        previous_week_start: previousLookahead.week_start_date,
      });

      const buildSubtaskCarryOverData = (st: CarryOverSubtask, parentName: string, siblings: CarryOverSubtask[]) => ({
        previous_lookahead_id: previousLookahead.id,
        previous_percent_complete: st.previous_percent_complete,
        previous_status_summary: st.previous_status_summary,
        carried_over_at: new Date().toISOString(),
        carry_over_reason: st.previous_percent_complete === 0 ? "not_started" : "incomplete",
        parent_task_name: parentName,
        siblings_carried: siblings.length,
        siblings_completed: 0, // completed siblings not carried
        previous_week_start: previousLookahead.week_start_date,
      });

      // Separate into new inserts vs updates for existing schedule-pulled lines
      const carryInserts: any[] = [];
      const carryUpdates: { lineId: string; data: any; subtasks: CarryOverSubtask[]; parentName: string }[] = [];

      for (const t of selectedCarryOver) {
        const plannedStatus = buildEmptyStatus();
        const coData = buildCarryOverData(t);

        if (t.task_id && existingTaskIdMap.has(t.task_id)) {
          const existingLineId = existingTaskIdMap.get(t.task_id)!;
          carryUpdates.push({
            lineId: existingLineId,
            data: {
              percent_complete: t.percent_complete,
              expected_completion_date: t.expected_completion_date,
              notes: t.notes,
              carry_over_data: coData,
            },
            subtasks: t.subtasks,
            parentName: t.task_name,
          });
        } else {
          carryInserts.push({
            _subtasks: t.subtasks,
            _parentName: t.task_name,
            lookahead_id: la.id,
            company_id: profile.company_id,
            task_id: t.task_id,
            custom_text: t.custom_text,
            assigned_trade: t.assigned_trade,
            materials_needed: t.materials_needed,
            constraints: t.constraints,
            notes: t.notes,
            sort_order: 1000 + carryInserts.length,
            status_per_day: plannedStatus,
            percent_complete: t.percent_complete,
            expected_completion_date: t.expected_completion_date,
            carry_over_data: coData,
          });
        }
      }

      // Update existing lines with carry-over data
      for (const upd of carryUpdates) {
        await supabase
          .from("lookahead_lines")
          .update(upd.data)
          .eq("id", upd.lineId);

        // Insert subtasks for updated parent
        if (upd.subtasks.length > 0) {
          const plannedStatus = buildEmptyStatus();
          const subtaskRows = upd.subtasks.map((st, si) => ({
            lookahead_id: la.id,
            company_id: profile.company_id,
            task_id: st.task_id,
            custom_text: st.custom_text,
            assigned_trade: st.assigned_trade,
            materials_needed: st.materials_needed,
            constraints: st.constraints,
            notes: st.notes,
            sort_order: si,
            status_per_day: plannedStatus,
            percent_complete: st.percent_complete,
            expected_completion_date: st.expected_completion_date,
            parent_line_id: upd.lineId,
            carry_over_data: buildSubtaskCarryOverData(st, upd.parentName, upd.subtasks),
          }));
          await supabase.from("lookahead_lines").insert(subtaskRows);
        }
      }

      // Insert new carry-over parent lines and their subtasks
      if (carryInserts.length > 0) {
        const subtasksPerInsert: { subs: CarryOverSubtask[]; parentName: string }[] = carryInserts.map((ci) => {
          const subs = ci._subtasks || [];
          const parentName = ci._parentName || "";
          delete ci._subtasks;
          delete ci._parentName;
          return { subs, parentName };
        });

        const { data: insertedParents } = await supabase
          .from("lookahead_lines")
          .insert(carryInserts)
          .select();

        // Insert subtasks for each newly inserted parent with re-linked parent_line_id
        if (insertedParents) {
          const allSubtaskRows: any[] = [];
          const plannedStatus = buildEmptyStatus();
          for (let i = 0; i < insertedParents.length; i++) {
            const parentId = insertedParents[i].id;
            const { subs, parentName } = subtasksPerInsert[i];
            for (let si = 0; si < subs.length; si++) {
              const st = subs[si];
              allSubtaskRows.push({
                lookahead_id: la.id,
                company_id: profile.company_id,
                task_id: st.task_id,
                custom_text: st.custom_text,
                assigned_trade: st.assigned_trade,
                materials_needed: st.materials_needed,
                constraints: st.constraints,
                notes: st.notes,
                sort_order: si,
                status_per_day: plannedStatus,
                percent_complete: st.percent_complete,
                expected_completion_date: st.expected_completion_date,
                parent_line_id: parentId,
                carry_over_data: buildSubtaskCarryOverData(st, parentName, subs),
              });
            }
          }
          if (allSubtaskRows.length > 0) {
            await supabase.from("lookahead_lines").insert(allSubtaskRows);
          }
        }
      }

      const totalCarried = carryInserts.length + carryUpdates.length;
      const totalSubtasks = selectedCarryOver.reduce((sum, t) => sum + t.subtasks.length, 0);
      if (totalCarried > 0) {
        toast({ title: `Carried over ${totalCarried} task(s)${totalSubtasks > 0 ? ` with ${totalSubtasks} subtask(s)` : ""} from last week` });
      }
    }

    setCreating(false);
    navigate(`/projects/${projectId}/lookahead/${la.id}`);
  };

  const handleCarryOverConfirm = () => {
    setShowCarryOverDialog(false);
    setPendingCreate(true);
  };

  useEffect(() => {
    if (pendingCreate) {
      handleCreate();
    }
  }, [pendingCreate]);

  const toggleCarryOverTask = (id: string) => {
    setCarryOverTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, selected: !t.selected } : t))
    );
  };

  const toggleAll = (selected: boolean) => {
    setCarryOverTasks((prev) => prev.map((t) => ({ ...t, selected })));
  };

  // Summary counts for carry-over dialog
  const selectedCarryOverCount = carryOverTasks.filter(t => t.selected).length;
  const notStartedCount = carryOverTasks.filter(t => t.selected && t.carry_over_reason === "not_started").length;
  const incompleteCount = carryOverTasks.filter(t => t.selected && t.carry_over_reason !== "not_started").length;

  if (!project || !weekStart) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate(`/projects/${projectId}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <h1 className="text-2xl font-bold">New 2-Week Look-Ahead</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4" /> Configure Look-Ahead
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Project</p>
            <p className="font-medium">{project.name}</p>
          </div>

          {recommendedWeekStart && previousLookahead && (
            <div className="rounded-lg border-2 border-success bg-success/10 p-4">
              <div className="flex items-center gap-2 mb-1">
                <CalendarDays className="h-4 w-4 text-success" />
                <p className="text-sm font-semibold text-success">Recommended Start Date</p>
              </div>
              <p className="text-sm">
                <span className="font-medium">
                  {format(parseISO(recommendedWeekStart), "EEEE, MMM d, yyyy")}
                </span>
                {" "}— continues from previous planning week
              </p>
              {weekStart !== recommendedWeekStart && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 border-success text-success hover:bg-success/20"
                  onClick={() => setWeekStart(recommendedWeekStart)}
                >
                  Use Recommended Date
                </Button>
              )}
            </div>
          )}

          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Week Starting</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
                className={cn(
                  "flex h-10 flex-1 rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  weekStart === recommendedWeekStart
                    ? "border-success ring-success/30"
                    : "border-input"
                )}
              />
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="h-10 w-10 shrink-0">
                    <CalendarIcon className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={weekStart ? parseISO(weekStart) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        const monday = startOfWeek(date, { weekStartsOn: 1 });
                        setWeekStart(format(monday, "yyyy-MM-dd"));
                      }
                    }}
                    modifiers={{
                      recommended: recommendedWeekStart
                        ? Array.from({ length: 7 }, (_, i) => addDays(parseISO(recommendedWeekStart), i))
                        : [],
                    }}
                    modifiersClassNames={{
                      recommended: "bg-success/20 text-success-foreground font-semibold",
                    }}
                    className={cn("p-3 pointer-events-auto")}
                  />
                  {recommendedWeekStart && (
                    <div className="px-3 pb-3">
                      <p className="text-xs text-muted-foreground">
                        <span className="inline-block w-3 h-3 rounded bg-success/20 mr-1 align-middle" />
                        Recommended week
                      </p>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
            {previousLookahead && weekStart !== recommendedWeekStart && (
              <p className="text-xs text-warning mt-1">
                ⚠ This differs from the recommended date based on the previous look-ahead.
              </p>
            )}
          </div>
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm">
              <span className="font-medium">{taskCount}</span> tasks overlap with this 2-week window.
              {taskCount === 0 && " Upload a schedule first to auto-populate tasks."}
            </p>
          </div>
          {carryOverTasks.length > 0 && (
            <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                ↩ {carryOverTasks.length} incomplete task(s) will be carried over with progress data
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {carryOverTasks.filter(t => t.subtasks.length > 0).length > 0 &&
                  `Including ${carryOverTasks.reduce((s, t) => s + t.subtasks.length, 0)} subtask(s). `}
                Only incomplete subtasks are carried — completed ones are left behind.
              </p>
            </div>
          )}
          <Button onClick={handleCreate} disabled={creating} className="w-full">
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CalendarDays className="h-4 w-4 mr-2" />}
            Create Look-Ahead
          </Button>
        </CardContent>
      </Card>

      {/* Carry-Over Confirmation Dialog */}
      <Dialog open={showCarryOverDialog} onOpenChange={setShowCarryOverDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Carry Over Incomplete Tasks</DialogTitle>
            <DialogDescription>
              These tasks are incomplete from the previous look-ahead. Select which to carry forward with their progress data. Completed subtasks are automatically excluded.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-xs font-medium text-muted-foreground">
                {selectedCarryOverCount} of {carryOverTasks.length} selected
                {selectedCarryOverCount > 0 && (
                  <span className="ml-1">
                    ({notStartedCount > 0 ? `${notStartedCount} not started` : ""}
                    {notStartedCount > 0 && incompleteCount > 0 ? ", " : ""}
                    {incompleteCount > 0 ? `${incompleteCount} partially complete` : ""})
                  </span>
                )}
              </span>
              <div className="flex gap-2">
                <button className="text-xs text-primary hover:underline" onClick={() => toggleAll(true)}>Select all</button>
                <button className="text-xs text-muted-foreground hover:underline" onClick={() => toggleAll(false)}>Clear</button>
              </div>
            </div>
            {carryOverTasks.map((task) => (
              <label
                key={task.id}
                className="flex items-start gap-3 py-2 px-1 rounded hover:bg-accent/30 cursor-pointer"
              >
                <Checkbox
                  checked={task.selected}
                  onCheckedChange={() => toggleCarryOverTask(task.id)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{task.task_name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    {task.assigned_trade && <span>{task.assigned_trade}</span>}
                    <span className={cn(
                      task.previous_percent_complete === 0 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
                    )}>
                      {task.previous_percent_complete}% complete
                    </span>
                    {task.expected_completion_date && (
                      <span>Due {format(parseISO(task.expected_completion_date), "MMM d")}</span>
                    )}
                    {task.subtasks.length > 0 && (
                      <span className="text-primary">+ {task.subtasks.length} subtask{task.subtasks.length > 1 ? "s" : ""}</span>
                    )}
                  </div>
                  {/* Mini progress bar */}
                  {task.previous_percent_complete > 0 && (
                    <div className="h-1 rounded-full bg-muted overflow-hidden mt-1 max-w-[120px]">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          task.previous_percent_complete >= 80 ? "bg-green-500" : task.previous_percent_complete >= 50 ? "bg-yellow-500" : "bg-red-500"
                        )}
                        style={{ width: `${task.previous_percent_complete}%` }}
                      />
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              toggleAll(false);
              handleCarryOverConfirm();
            }}>
              Skip
            </Button>
            <Button onClick={handleCarryOverConfirm}>
              Carry Over ({selectedCarryOverCount})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
