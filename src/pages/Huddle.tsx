import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, addDays, parseISO, subDays, isToday } from "date-fns";
import { ChevronLeft, ChevronRight, CalendarDays, AlertTriangle, ExternalLink, Loader2, Check, X, ArrowRight, Circle, Percent } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { computePPC } from "@/lib/ppc";
import { DayStatus } from "@/components/lookahead/StatusCell";
import { VARIANCE_REASONS, VarianceReasonPopover, getVarianceDotColor, VarianceReason } from "@/components/lookahead/VarianceReasonPopover";
import { useToast } from "@/hooks/use-toast";

type HuddleLine = {
  id: string;
  lookahead_id: string;
  project_id: string;
  project_name: string;
  task_name: string;
  assigned_trade: string | null;
  status_per_day: Record<string, string>;
  constraints: string | null;
  variance_reason: string | null;
  variance_note: string | null;
};

const STATUS_CYCLE: DayStatus[] = ["", "planned", "progress", "Y", "N", "50"];
const STATUS_INFO: Record<string, { label: string; tone: string; ring: string; Icon: any }> = {
  "":       { label: "Tap to set",  tone: "bg-muted text-muted-foreground border-dashed", ring: "border-border", Icon: Circle },
  planned:  { label: "Planned",     tone: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300", ring: "border-blue-300 dark:border-blue-800", Icon: Circle },
  progress: { label: "In Progress", tone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", ring: "border-amber-300 dark:border-amber-800", Icon: ArrowRight },
  Y:        { label: "Complete",    tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", ring: "border-emerald-300 dark:border-emerald-800", Icon: Check },
  N:        { label: "Not Done",    tone: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300", ring: "border-red-300 dark:border-red-800", Icon: X },
  "50":     { label: "50%",         tone: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300", ring: "border-yellow-300 dark:border-yellow-800", Icon: Percent },
};

export default function Huddle() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [date, setDate] = useState<Date>(new Date());
  const dateStr = format(date, "yyyy-MM-dd");
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<HuddleLine[]>([]);
  const [variancePopoverId, setVariancePopoverId] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.company_id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Find look-aheads whose 14-day window covers `date`
      const start = format(subDays(date, 13), "yyyy-MM-dd");
      const end = dateStr;
      const { data: las } = await supabase
        .from("look_aheads")
        .select("id, project_id, week_start_date, status")
        .eq("company_id", profile.company_id)
        .lte("week_start_date", end)
        .gte("week_start_date", start);

      const inWindow = (las || []).filter((la) => {
        const ws = parseISO(la.week_start_date);
        const we = addDays(ws, 13);
        return date >= ws && date <= we;
      });

      if (!inWindow.length) {
        if (!cancelled) { setLines([]); setLoading(false); }
        return;
      }

      const laIds = inWindow.map((l) => l.id);
      const projectIds = [...new Set(inWindow.map((l) => l.project_id))];

      const [{ data: linesData }, { data: projects }] = await Promise.all([
        supabase
          .from("lookahead_lines")
          .select("id, lookahead_id, task_id, custom_text, assigned_trade, status_per_day, constraints, variance_reason, variance_note, hidden")
          .in("lookahead_id", laIds),
        supabase.from("projects").select("id, name").in("id", projectIds),
      ]);

      const projectMap = (projects || []).reduce<Record<string, string>>((a, p) => ({ ...a, [p.id]: p.name }), {});
      const laToProject = inWindow.reduce<Record<string, string>>((a, l) => ({ ...a, [l.id]: l.project_id }), {});

      const taskIds = (linesData || []).filter((l) => l.task_id).map((l) => l.task_id as string);
      let taskMap: Record<string, string> = {};
      if (taskIds.length) {
        const { data: tasks } = await supabase.from("tasks").select("id, name").in("id", taskIds);
        taskMap = (tasks || []).reduce((a, t) => ({ ...a, [t.id]: t.name }), {});
      }

      const mapped: HuddleLine[] = (linesData || [])
        .filter((l) => !(l as any).hidden)
        .map((l) => {
          const project_id = laToProject[l.lookahead_id];
          return {
            id: l.id,
            lookahead_id: l.lookahead_id,
            project_id,
            project_name: projectMap[project_id] || "Project",
            task_name: l.task_id ? taskMap[l.task_id as string] || "Unknown" : (l.custom_text || "Untitled"),
            assigned_trade: l.assigned_trade,
            status_per_day: (l.status_per_day as Record<string, string>) || {},
            constraints: l.constraints,
            variance_reason: (l as any).variance_reason || null,
            variance_note: (l as any).variance_note || null,
          };
        });

      if (!cancelled) {
        setLines(mapped);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.company_id, dateStr]);

  // Tasks committed for the selected day (any non-empty status today)
  const todaysLines = useMemo(
    () => lines.filter((l) => !!l.status_per_day[dateStr]),
    [lines, dateStr]
  );

  // PPC for today only — use only this day's cells
  const ppc = useMemo(() => {
    const onlyToday = todaysLines.map((l) => ({ status_per_day: { [dateStr]: l.status_per_day[dateStr] } }));
    return computePPC(onlyToday);
  }, [todaysLines, dateStr]);

  // Group by project
  const byProject = useMemo(() => {
    const map = new Map<string, { project_id: string; project_name: string; rows: HuddleLine[] }>();
    for (const l of todaysLines) {
      const cur = map.get(l.project_id) || { project_id: l.project_id, project_name: l.project_name, rows: [] };
      cur.rows.push(l);
      map.set(l.project_id, cur);
    }
    return [...map.values()].sort((a, b) => a.project_name.localeCompare(b.project_name));
  }, [todaysLines]);

  const notDone = todaysLines.filter((l) => l.status_per_day[dateStr] === "N");
  const openConstraints = todaysLines.filter((l) => (l.constraints || "").trim().length > 0);

  const setStatus = async (line: HuddleLine, next: DayStatus) => {
    const newSpd = { ...line.status_per_day, [dateStr]: next };
    setLines((prev) => prev.map((l) => l.id === line.id ? { ...l, status_per_day: newSpd } : l));
    const { error } = await supabase
      .from("lookahead_lines")
      .update({ status_per_day: newSpd } as any)
      .eq("id", line.id);
    if (error) {
      toast({ title: "Could not save status", description: error.message, variant: "destructive" });
    } else if (next === "N") {
      setVariancePopoverId(line.id);
    }
  };

  const cycleStatus = (line: HuddleLine) => {
    const cur = (line.status_per_day[dateStr] || "") as DayStatus;
    const idx = STATUS_CYCLE.indexOf(cur);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    setStatus(line, next);
  };

  const saveVariance = async (line: HuddleLine, reason: VarianceReason, note: string) => {
    setLines((prev) => prev.map((l) => l.id === line.id ? { ...l, variance_reason: reason as string | null, variance_note: note || null } : l));
    await supabase
      .from("lookahead_lines")
      .update({ variance_reason: reason, variance_note: note || null } as any)
      .eq("id", line.id);
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-12">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            Daily Huddle
          </h1>
          <p className="text-sm text-muted-foreground">Morning stand-up view across active look-aheads.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="lg" onClick={() => setDate((d) => subDays(d, 1))} aria-label="Previous day" className="h-12 w-12 p-0">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="text-center min-w-[160px]">
            <div className="text-base font-semibold">{format(date, "EEEE")}</div>
            <div className="text-xs text-muted-foreground">{format(date, "MMM d, yyyy")}</div>
          </div>
          <Button variant="outline" size="lg" onClick={() => setDate((d) => addDays(d, 1))} aria-label="Next day" className="h-12 w-12 p-0">
            <ChevronRight className="h-5 w-5" />
          </Button>
          {!isToday(date) && (
            <Button variant="ghost" size="sm" onClick={() => setDate(new Date())}>Today</Button>
          )}
        </div>
      </div>

      {/* PPC header */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-4 justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Today's PPC</div>
            <div className="text-3xl font-bold">
              {ppc.ppc}%
              <span className="text-base font-normal text-muted-foreground ml-2">
                {ppc.completed}/{ppc.resolved}
              </span>
            </div>
          </div>
          <div className="flex gap-4 text-sm">
            <Stat label="Committed" value={todaysLines.length} />
            <Stat label="Complete" value={todaysLines.filter((l) => l.status_per_day[dateStr] === "Y").length} tone="text-emerald-600 dark:text-emerald-400" />
            <Stat label="Not Done" value={notDone.length} tone="text-red-600 dark:text-red-400" />
            <Stat label="Open Constraints" value={openConstraints.length} tone="text-amber-600 dark:text-amber-400" />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : byProject.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            <CalendarDays className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="font-medium">No tasks committed for {format(date, "MMM d")}.</p>
            <p className="text-xs mt-1">Use the day stepper or open a look-ahead to plan work.</p>
          </CardContent>
        </Card>
      ) : (
        byProject.map((group) => (
          <Card key={group.project_id}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{group.project_name}</CardTitle>
              <Link
                to={`/projects/${group.project_id}/lookahead/${group.rows[0].lookahead_id}`}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Open look-ahead <ExternalLink className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {group.rows.map((line) => {
                const status = (line.status_per_day[dateStr] || "") as DayStatus;
                const info = STATUS_INFO[status] || STATUS_INFO[""];
                const StatusIcon = info.Icon;
                const reasonLabel = line.variance_reason
                  ? VARIANCE_REASONS.find((r) => r.key === line.variance_reason)?.label || "Other"
                  : null;
                return (
                  <div key={line.id} className="rounded-lg border bg-card p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm leading-tight">{line.task_name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                          {line.assigned_trade && <span>{line.assigned_trade}</span>}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => cycleStatus(line)}
                      className={cn(
                        "w-full flex items-center justify-center gap-2 rounded-md border px-3 py-3 text-sm font-semibold min-h-12 touch-manipulation transition-all active:scale-[0.99]",
                        info.tone, info.ring
                      )}
                    >
                      <StatusIcon className="h-5 w-5" strokeWidth={2.5} />
                      <span>{info.label}</span>
                    </button>
                    <div className="grid grid-cols-5 gap-1">
                      {(["planned", "progress", "Y", "50", "N"] as DayStatus[]).map((s) => {
                        const meta = STATUS_INFO[s];
                        const Icon = meta.Icon;
                        const active = s === status;
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setStatus(line, s)}
                            aria-label={meta.label}
                            className={cn(
                              "flex flex-col items-center justify-center gap-0.5 rounded-md border px-1 py-2 min-h-11 text-[10px] font-medium touch-manipulation",
                              active ? `${meta.tone} ${meta.ring}` : "bg-card text-muted-foreground border-border hover:bg-accent"
                            )}
                          >
                            <Icon className="h-4 w-4" strokeWidth={2.5} />
                            <span>{meta.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    {status === "N" && (
                      <VarianceReasonPopover
                        open={variancePopoverId === line.id}
                        onOpenChange={(open) => setVariancePopoverId(open ? line.id : null)}
                        onSelect={(reason, note) => saveVariance(line, reason, note)}
                      >
                        <button
                          type="button"
                          className="w-full flex items-center justify-between gap-2 rounded-md border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/30 px-3 py-2 text-xs"
                        >
                          <span className="flex items-center gap-2 text-red-700 dark:text-red-300">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Root cause:
                            {reasonLabel ? (
                              <span className="inline-flex items-center gap-1 font-medium">
                                <span className={cn("w-1.5 h-1.5 rounded-full", getVarianceDotColor(line.variance_reason as VarianceReason))} />
                                {reasonLabel}
                              </span>
                            ) : (
                              <span className="font-medium underline">Tap to set</span>
                            )}
                          </span>
                          {line.variance_note && (
                            <span className="truncate text-muted-foreground">{line.variance_note}</span>
                          )}
                        </button>
                      </VarianceReasonPopover>
                    )}
                    {line.constraints && (
                      <div className="text-xs flex items-start gap-1.5 text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>{line.constraints}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))
      )}

      {/* Blockers & Not-Done summary */}
      {(notDone.length > 0 || openConstraints.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Blockers & Variances
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {notDone.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Not done today</div>
                <ul className="space-y-1">
                  {notDone.map((l) => {
                    const reasonLabel = l.variance_reason
                      ? VARIANCE_REASONS.find((r) => r.key === l.variance_reason)?.label || "Other"
                      : "No root cause set";
                    return (
                      <li key={l.id} className="text-sm flex items-start gap-2">
                        <span className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", l.variance_reason ? getVarianceDotColor(l.variance_reason as VarianceReason) : "bg-muted-foreground")} />
                        <span className="flex-1">
                          <span className="font-medium">{l.task_name}</span>
                          <span className="text-muted-foreground"> — {l.project_name}</span>
                          <span className="text-xs text-muted-foreground block">{reasonLabel}{l.variance_note ? ` · ${l.variance_note}` : ""}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {openConstraints.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Open constraints</div>
                <ul className="space-y-1">
                  {openConstraints.map((l) => (
                    <li key={l.id} className="text-sm flex items-start gap-2">
                      <Badge variant="outline" className="text-[10px]">{l.project_name}</Badge>
                      <span className="flex-1">
                        <span className="font-medium">{l.task_name}</span>
                        <span className="text-xs text-muted-foreground block">{l.constraints}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="text-center">
      <div className={cn("text-2xl font-semibold", tone)}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}