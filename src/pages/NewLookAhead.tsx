import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CalendarDays, Loader2 } from "lucide-react";
import { format, startOfWeek, addWeeks, addDays, parseISO, isBefore, isAfter } from "date-fns";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
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

    // Find latest lookahead for this project to auto-set the next week start
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
          // Next lookahead starts on Monday of the planning week (week 2 = day 7)
          const prevStart = parseISO(latest.week_start_date);
          const nextStart = addDays(prevStart, 7);
          const formatted = format(nextStart, "yyyy-MM-dd");
          setWeekStart(formatted);
          setRecommendedWeekStart(formatted);
        } else {
          // No previous lookahead — default to next Monday
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

  // Load carry-over candidates from previous lookahead
  // Includes: Week 2 non-complete statuses OR tasks with expected_completion_date beyond the new window
  useEffect(() => {
    if (!previousLookahead) return;

    const loadCarryOver = async () => {
      const prevStart = parseISO(previousLookahead.week_start_date);
      const week2Dates = Array.from({ length: 7 }, (_, i) =>
        format(addDays(prevStart, 7 + i), "yyyy-MM-dd")
      );

      // New lookahead's end date (2 weeks from weekStart)
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

      // Find lines with Week 2 non-complete statuses OR expected_completion_date beyond new window
      const candidates: CarryOverTask[] = [];
      for (const line of prevLines) {
        const statusPerDay = (line.status_per_day as Record<string, string>) || {};
        const hasWeek2NonComplete = week2Dates.some((d) => {
          const s = statusPerDay[d] as DayStatus;
          return s === "N" || s === "50" || s === "planned" || s === "progress";
        });

        // Check if expected_completion_date exceeds the new 2-week window
        const expectedDate = line.expected_completion_date ? parseISO(line.expected_completion_date) : null;
        const exceedsNewWindow = expectedDate && newEndDate ? isAfter(expectedDate, newEndDate) : false;

        if (hasWeek2NonComplete || exceedsNewWindow) {
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
          });
        }
      }

      setCarryOverTasks(candidates);
    };

    loadCarryOver();
  }, [previousLookahead, weekStart]);

  const handleCreate = async () => {
    if (!projectId || !user || !profile?.company_id) return;

    // If there are carry-over tasks and dialog hasn't been shown, show it first
    if (carryOverTasks.length > 0 && !pendingCreate) {
      setShowCarryOverDialog(true);
      return;
    }

    setCreating(true);

    // Create the look-ahead
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

      // Fetch task templates for auto-filling
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

    // Insert carry-over tasks
    const selectedCarryOver = carryOverTasks.filter((t) => t.selected);
    if (selectedCarryOver.length > 0) {
      const existingTaskIds = new Set<string>();
      // Get already inserted lines to avoid duplicates
      const { data: existingLines } = await supabase
        .from("lookahead_lines")
        .select("task_id")
        .eq("lookahead_id", la.id);
      (existingLines || []).forEach((l) => { if (l.task_id) existingTaskIds.add(l.task_id); });

      const carryInserts = selectedCarryOver
        .filter((t) => !t.task_id || !existingTaskIds.has(t.task_id))
        .map((t, i) => ({
          lookahead_id: la.id,
          company_id: profile.company_id,
          task_id: t.task_id,
          custom_text: t.custom_text,
          assigned_trade: t.assigned_trade,
          materials_needed: t.materials_needed,
          constraints: t.constraints,
          notes: `Carried over: ${t.notes || ""}`.trim(),
          sort_order: 1000 + i,
          status_per_day: (() => {
            // Carry over statuses from previous lookahead that fall within the new 2-week window
            const newStart = parseISO(weekStart);
            const newDates = Array.from({ length: 14 }, (_, j) => format(addDays(newStart, j), "yyyy-MM-dd"));
            const carried: Record<string, string> = {};
            for (const d of newDates) {
              if (t.status_per_day[d]) {
                carried[d] = t.status_per_day[d];
              }
            }
            return carried;
          })(),
          percent_complete: t.percent_complete,
          expected_completion_date: t.expected_completion_date,
        }));

      if (carryInserts.length > 0) {
        await supabase.from("lookahead_lines").insert(carryInserts);
        toast({ title: `Carried over ${carryInserts.length} task(s) from last week` });
      }
    }

    setCreating(false);
    navigate(`/projects/${projectId}/lookahead/${la.id}`);
  };

  const handleCarryOverConfirm = () => {
    setShowCarryOverDialog(false);
    setPendingCreate(true);
  };

  // Trigger create after carry-over dialog confirmed
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

          {/* Recommended week highlight */}
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
            <input
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              className={cn(
                "flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                weekStart === recommendedWeekStart
                  ? "border-success ring-success/30"
                  : "border-input"
              )}
            />
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
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <p className="text-sm font-medium">
                {carryOverTasks.length} incomplete task(s) available for carry-over.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Includes tasks with non-complete statuses and tasks whose expected completion date extends beyond this window.
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
              These tasks are incomplete or have expected completion dates beyond this look-ahead window. Select which to carry forward — they will persist until completed or dates are updated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-xs font-medium text-muted-foreground">
                {carryOverTasks.filter((t) => t.selected).length} of {carryOverTasks.length} selected
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
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {task.assigned_trade && <span>{task.assigned_trade}</span>}
                    {task.percent_complete > 0 && <span>{task.percent_complete}% complete</span>}
                    {task.expected_completion_date && (
                      <span>Due {format(parseISO(task.expected_completion_date), "MMM d")}</span>
                    )}
                  </div>
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
              Carry Over ({carryOverTasks.filter((t) => t.selected).length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
