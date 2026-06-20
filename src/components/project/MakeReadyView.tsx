import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addWeeks, format, parseISO, startOfWeek, isBefore, isAfter, differenceInCalendarDays } from "date-fns";
import { AlertTriangle, CheckCircle2, CalendarRange, Plus, ExternalLink, CalendarDays } from "lucide-react";
import { ConstraintDialog } from "./ConstraintDialog";
import { ProjectConstraint, typeLabel, needByUrgency } from "@/lib/constraints";
import { cn } from "@/lib/utils";

interface MakeReadyViewProps {
  projectId: string;
}

interface ScheduledTask {
  id: string;
  name: string;
  start_date: string;
  finish_date: string | null;
  tags: string[] | null;
}

const STORAGE_KEY = (pid: string) => `makeready:windowWeeks:${pid}`;

export function MakeReadyView({ projectId }: MakeReadyViewProps) {
  const navigate = useNavigate();
  const [weeks, setWeeks] = useState<number>(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY(projectId)) : null;
    const n = v ? parseInt(v, 10) : 6;
    return [3, 4, 5, 6].includes(n) ? n : 6;
  });
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [constraints, setConstraints] = useState<ProjectConstraint[]>([]);
  const [hasSchedule, setHasSchedule] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTaskId, setDialogTaskId] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY(projectId), String(weeks));
  }, [projectId, weeks]);

  const fetchData = async () => {
    setLoading(true);
    const { data: versions } = await supabase
      .from("schedule_versions")
      .select("id")
      .eq("project_id", projectId)
      .order("version_number", { ascending: false })
      .limit(1);
    const latest = versions?.[0];
    if (!latest) {
      setHasSchedule(false);
      setTasks([]);
      setConstraints([]);
      setLoading(false);
      return;
    }
    setHasSchedule(true);
    const today = new Date();
    const horizonEnd = addWeeks(startOfWeek(today, { weekStartsOn: 1 }), weeks);
    const todayIso = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const horizonIso = format(horizonEnd, "yyyy-MM-dd");
    const [tasksRes, conRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("id,name,start_date,finish_date,tags")
        .eq("schedule_version_id", latest.id)
        .not("start_date", "is", null)
        .gte("start_date", todayIso)
        .lt("start_date", horizonIso)
        .order("start_date", { ascending: true }),
      supabase
        .from("project_constraints")
        .select("*")
        .eq("project_id", projectId),
    ]);
    setTasks((tasksRes.data || []) as ScheduledTask[]);
    setConstraints((conRes.data || []) as ProjectConstraint[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, weeks]);

  const constraintsByTask = useMemo(() => {
    const map = new Map<string, ProjectConstraint[]>();
    for (const c of constraints) {
      if (!c.task_id) continue;
      const arr = map.get(c.task_id) || [];
      arr.push(c);
      map.set(c.task_id, arr);
    }
    return map;
  }, [constraints]);

  const grouped = useMemo(() => {
    const buckets = new Map<string, { weekStart: Date; tasks: ScheduledTask[] }>();
    for (const t of tasks) {
      if (!t.start_date) continue;
      const ws = startOfWeek(parseISO(t.start_date), { weekStartsOn: 1 });
      const key = format(ws, "yyyy-MM-dd");
      const b = buckets.get(key) || { weekStart: ws, tasks: [] };
      b.tasks.push(t);
      buckets.set(key, b);
    }
    return Array.from(buckets.values()).sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());
  }, [tasks]);

  const horizonWindow = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 });
    const end = addWeeks(start, weeks);
    return { start, end };
  }, [weeks]);

  const summary = useMemo(() => {
    const taskIds = new Set(tasks.map((t) => t.id));
    let notReady = 0;
    for (const t of tasks) {
      const blockers = (constraintsByTask.get(t.id) || []).filter((c) => c.status !== "closed");
      if (blockers.length > 0) notReady++;
    }
    const inWindowOpen = constraints.filter((c) => {
      if (c.status === "closed") return false;
      if (c.task_id && taskIds.has(c.task_id)) return true;
      if (c.need_by_date) {
        const d = parseISO(c.need_by_date);
        return !isBefore(d, horizonWindow.start) && isBefore(d, horizonWindow.end);
      }
      return false;
    });
    const overdue = inWindowOpen.filter((c) => needByUrgency(c.need_by_date, c.status) === "overdue").length;
    return { notReady, openCount: inWindowOpen.length, overdue };
  }, [tasks, constraints, constraintsByTask, horizonWindow]);

  const openAddConstraint = (taskId: string) => {
    setDialogTaskId(taskId);
    setDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarRange className="h-4 w-4" /> Make-Ready Look-Ahead
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Upcoming work in the next {weeks} weeks. Clear constraints before committing it to a weekly look-ahead.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Window</span>
          <Select value={String(weeks)} onValueChange={(v) => setWeeks(parseInt(v, 10))}>
            <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[3, 4, 5, 6].map((n) => (
                <SelectItem key={n} value={String(n)}>{n} weeks</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SummaryStat label="Upcoming tasks" value={tasks.length} icon={<CalendarDays className="h-4 w-4" />} />
          <SummaryStat
            label="Not Ready"
            value={summary.notReady}
            tone={summary.notReady > 0 ? "amber" : "ok"}
            icon={<AlertTriangle className="h-4 w-4" />}
          />
          <SummaryStat
            label="Open constraints (overdue)"
            value={`${summary.openCount} (${summary.overdue})`}
            tone={summary.overdue > 0 ? "red" : summary.openCount > 0 ? "amber" : "ok"}
            icon={<AlertTriangle className="h-4 w-4" />}
          />
        </div>

        {!hasSchedule ? (
          <EmptyState
            title="No schedule uploaded"
            body="Upload a master schedule on this project to populate the make-ready window."
          />
        ) : loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : grouped.length === 0 ? (
          <EmptyState
            title="No upcoming dated tasks"
            body="The latest schedule has no tasks starting in this window, or its tasks are missing start dates."
          />
        ) : (
          <div className="space-y-4">
            {grouped.map((g) => (
              <div key={g.weekStart.toISOString()} className="rounded-lg border">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b">
                  <div className="text-sm font-medium">
                    Week of {format(g.weekStart, "MMM d, yyyy")}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => navigate(`/projects/${projectId}/lookahead/new?week=${format(g.weekStart, "yyyy-MM-dd")}`)}
                  >
                    <ExternalLink className="mr-1 h-3 w-3" /> Create look-ahead
                  </Button>
                </div>
                <div className="divide-y">
                  {g.tasks.map((t) => {
                    const blockers = (constraintsByTask.get(t.id) || []).filter((c) => c.status !== "closed");
                    const ready = blockers.length === 0;
                    const trade = t.tags?.[0] || null;
                    return (
                      <div key={t.id} className={cn("px-3 py-2.5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between", !ready && "bg-amber-50/60 dark:bg-amber-950/20")}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">{t.name}</span>
                            {trade && <Badge variant="outline" className="text-[10px] py-0 h-4">{trade}</Badge>}
                            {ready ? (
                              <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600/20 border-emerald-600/20 text-[10px] py-0 h-4">
                                <CheckCircle2 className="mr-1 h-3 w-3" /> Ready
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 border-amber-500/20 text-[10px] py-0 h-4">
                                <AlertTriangle className="mr-1 h-3 w-3" /> Not Ready
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {format(parseISO(t.start_date), "MMM d")}
                            {t.finish_date ? ` → ${format(parseISO(t.finish_date), "MMM d")}` : ""}
                          </div>
                          {!ready && (
                            <ul className="mt-1.5 space-y-0.5">
                              {blockers.map((b) => {
                                const u = needByUrgency(b.need_by_date, b.status);
                                return (
                                  <li key={b.id} className="text-xs flex items-center gap-2">
                                    <span className="text-amber-700 dark:text-amber-400">•</span>
                                    <span className="font-medium">{typeLabel(b.type)}:</span>
                                    <span className="truncate">{b.description}</span>
                                    {b.need_by_date && (
                                      <span className={cn(
                                        "text-[10px]",
                                        u === "overdue" && "text-destructive font-medium",
                                        u === "soon" && "text-amber-700 dark:text-amber-400",
                                        u === "ok" && "text-muted-foreground"
                                      )}>
                                        need by {format(parseISO(b.need_by_date), "MMM d")}
                                        {u === "overdue" && ` (${Math.abs(differenceInCalendarDays(parseISO(b.need_by_date), new Date()))}d late)`}
                                      </span>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => openAddConstraint(t.id)}
                          >
                            <Plus className="mr-1 h-3 w-3" /> Constraint
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <ConstraintDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        defaultTaskId={dialogTaskId}
        onSaved={fetchData}
      />
    </Card>
  );
}

function SummaryStat({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  tone?: "neutral" | "ok" | "amber" | "red";
}) {
  const toneCls = {
    neutral: "border-border",
    ok: "border-emerald-600/30 bg-emerald-600/5",
    amber: "border-amber-500/40 bg-amber-500/5",
    red: "border-destructive/40 bg-destructive/5",
  }[tone];
  return (
    <div className={cn("rounded-lg border px-3 py-2.5", toneCls)}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed py-10 px-4 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{body}</p>
    </div>
  );
}