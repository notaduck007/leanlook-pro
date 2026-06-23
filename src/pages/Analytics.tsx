import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, CheckCircle, Clock, BarChart3, Target, AlertTriangle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, Legend } from "recharts";
import { format, parseISO } from "date-fns";
import { DayStatus } from "@/components/lookahead/StatusCell";
import { computePPC as sharedComputePPC } from "@/lib/ppc";
import { VarianceParetoChart } from "@/components/analytics/VarianceParetoChart";
import { CorrectiveActionsLog } from "@/components/analytics/CorrectiveActionsLog";

type LookaheadRow = {
  id: string;
  project_id: string;
  super_id: string;
  status: string;
  week_start_date: string;
};

type LineRow = {
  id: string;
  lookahead_id: string;
  status_per_day: Record<string, string> | null;
  assigned_trade: string | null;
  task_id: string | null;
  custom_text: string | null;
  parent_line_id: string | null;
};

type TaskRow = {
  id: string;
  name: string;
};

type ProfileRow = {
  user_id: string;
  display_name: string | null;
};

type PPCPoint = {
  week: string;
  weekLabel: string;
  ppc: number;
  completed: number;
  planned: number;
  projectName?: string;
};

type TradeVariance = {
  trade: string;
  totalPlanned: number;
  notCompleted: number;
  failRate: number;
};

export default function Analytics() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [lookaheads, setLookaheads] = useState<LookaheadRow[]>([]);
  const [lines, setLines] = useState<LineRow[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [ppcGoals, setPpcGoals] = useState<number[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);

  useEffect(() => {
    if (!profile?.company_id) return;

    const fetchAll = async () => {
      const [projRes, laRes, profileRes] = await Promise.all([
        supabase.from("projects").select("id, name, ppc_goal").eq("company_id", profile.company_id!),
        supabase.from("look_aheads").select("id, project_id, super_id, status, week_start_date").eq("company_id", profile.company_id!),
        supabase.from("profiles").select("user_id, display_name").eq("company_id", profile.company_id!),
      ]);

      const allLAs = (laRes.data || []) as LookaheadRow[];
      const projRows = (projRes.data || []) as any[];
      setProjects(projRows.map((p) => ({ id: p.id, name: p.name })));
      setPpcGoals(projRows.map((p) => Number(p.ppc_goal)).filter((n) => Number.isFinite(n) && n > 0));
      setLookaheads(allLAs);
      setProfiles(profileRes.data || []);

      // Fetch lines for approved/submitted look-aheads (where PPC is meaningful)
      const relevantIds = allLAs
        .filter((la) => la.status === "approved" || la.status === "submitted")
        .map((la) => la.id);

      if (relevantIds.length > 0) {
        const { data: lineData } = await supabase
          .from("lookahead_lines")
          .select("id, lookahead_id, status_per_day, assigned_trade, task_id, custom_text, parent_line_id")
          .in("lookahead_id", relevantIds);
        setLines((lineData || []) as LineRow[]);

        // Fetch task names for variance analysis
        const taskIds = (lineData || []).filter((l) => l.task_id).map((l) => l.task_id!);
        if (taskIds.length > 0) {
          const uniqueIds = [...new Set(taskIds)];
          const { data: taskData } = await supabase.from("tasks").select("id, name").in("id", uniqueIds);
          setTasks((taskData || []) as TaskRow[]);
        }
      }

      setLoading(false);
    };

    fetchAll();
  }, [profile?.company_id]);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.user_id, p.display_name || "Unknown"])), [profiles]);
  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t.name])), [tasks]);

  // Use shared canonical PPC helper. The local alias `planned` maps to
  // the helper's `resolved` count for backward compatibility with the UI.
  const computePPC = (lineSet: LineRow[]): { completed: number; planned: number; ppc: number } => {
    const { completed, resolved, ppc } = sharedComputePPC(lineSet);
    return { completed, planned: resolved, ppc };
  };

  // Company-wide PPC
  const companyPPC = useMemo(() => computePPC(lines), [lines]);

  // PPC trends per week (across all projects)
  const ppcTrends = useMemo(() => {
    const approvedLAs = lookaheads.filter((la) => la.status === "approved" || la.status === "submitted");
    const byWeek = new Map<string, LineRow[]>();

    approvedLAs.forEach((la) => {
      const laLines = lines.filter((l) => l.lookahead_id === la.id);
      const existing = byWeek.get(la.week_start_date) || [];
      byWeek.set(la.week_start_date, [...existing, ...laLines]);
    });

    const points: PPCPoint[] = [];
    byWeek.forEach((weekLines, week) => {
      const { completed, planned, ppc } = computePPC(weekLines);
      if (planned > 0) {
        points.push({
          week,
          weekLabel: format(parseISO(week), "MMM d"),
          ppc,
          completed,
          planned,
        });
      }
    });

    return points.sort((a, b) => a.week.localeCompare(b.week));
  }, [lookaheads, lines]);

  // PPC by project
  const ppcByProject = useMemo(() => {
    return projects.map((p) => {
      const projLAs = lookaheads.filter((la) => la.project_id === p.id && (la.status === "approved" || la.status === "submitted"));
      const projLines = lines.filter((l) => projLAs.some((la) => la.id === l.lookahead_id));
      const { ppc, completed, planned } = computePPC(projLines);
      return { name: p.name, id: p.id, ppc, completed, planned, laCount: projLAs.length };
    }).filter((p) => p.planned > 0);
  }, [projects, lookaheads, lines]);

  // PPC by superintendent
  const ppcBySuper = useMemo(() => {
    const superIds = [...new Set(lookaheads.map((la) => la.super_id))];
    return superIds.map((sid) => {
      const superLAs = lookaheads.filter((la) => la.super_id === sid && (la.status === "approved" || la.status === "submitted"));
      const superLines = lines.filter((l) => superLAs.some((la) => la.id === l.lookahead_id));
      const { ppc, completed, planned } = computePPC(superLines);
      return { name: profileMap.get(sid) || "Unknown", userId: sid, ppc, completed, planned };
    }).filter((s) => s.planned > 0);
  }, [lookaheads, lines, profileMap]);

  // Company-wide PPC goal for the trend chart target line. Average the
  // per-project ppc_goal values; fall back to 80 if none are configured.
  const targetGoal = useMemo(() => {
    if (ppcGoals.length === 0) return 80;
    return Math.round(ppcGoals.reduce((a, b) => a + b, 0) / ppcGoals.length);
  }, [ppcGoals]);

  // Variance analysis: trades with highest failure rates
  const tradeVariance = useMemo(() => {
    // Subtasks store work-phase words in the "trade" column (prep/execute/
    // inspect/closeout). Roll subtasks up to their parent's REAL trade so the
    // breakdown reflects actual trades (Electrical, HVAC, Concrete, etc.).
    const PHASE_WORDS = new Set(["prep", "execute", "inspect", "closeout"]);
    const linesById = new Map(lines.map((l) => [l.id, l]));
    const resolveTrade = (l: LineRow): string | null => {
      let raw = (l.assigned_trade || "").trim();
      if (l.parent_line_id) {
        const parent = linesById.get(l.parent_line_id);
        if (parent?.assigned_trade) raw = parent.assigned_trade.trim();
      }
      if (!raw) return null;
      // Strip phase words from comma-separated trade fields.
      const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
      const real = parts.filter((p) => !PHASE_WORDS.has(p.toLowerCase()));
      if (real.length === 0) return null;
      return real.join(", ");
    };

    const tradeMap = new Map<string, { planned: number; notCompleted: number }>();

    lines.forEach((l) => {
      const trade = resolveTrade(l);
      if (!trade) return;
      const spd = l.status_per_day || {};
      Object.values(spd).forEach((s) => {
        if (s === "Y" || s === "N" || s === "50" || s === "planned" || s === "progress") {
          const entry = tradeMap.get(trade) || { planned: 0, notCompleted: 0 };
          entry.planned++;
          if (s === "N") entry.notCompleted++;
          tradeMap.set(trade, entry);
        }
      });
    });

    const result: TradeVariance[] = [];
    tradeMap.forEach((v, trade) => {
      if (v.planned >= 3) {
        result.push({
          trade,
          totalPlanned: v.planned,
          notCompleted: v.notCompleted,
          failRate: Math.round((v.notCompleted / v.planned) * 100),
        });
      }
    });

    return result.sort((a, b) => b.failRate - a.failRate).slice(0, 10);
  }, [lines]);

  // Frequently incomplete tasks
  const frequentFailures = useMemo(() => {
    const taskFails = new Map<string, { name: string; nCount: number; total: number }>();

    lines.forEach((l) => {
      const name = l.task_id ? (taskMap.get(l.task_id) || l.custom_text || "Unknown") : (l.custom_text || "Unknown");
      const key = l.task_id || name;
      const spd = l.status_per_day || {};
      let nCount = 0;
      let total = 0;
      Object.values(spd).forEach((s) => {
        if (s === "Y" || s === "N" || s === "50" || s === "planned" || s === "progress") {
          total++;
          if (s === "N") nCount++;
        }
      });
      if (total > 0) {
        const existing = taskFails.get(key) || { name: String(name), nCount: 0, total: 0 };
        existing.nCount += nCount;
        existing.total += total;
        taskFails.set(key, existing);
      }
    });

    return [...taskFails.values()]
      .filter((t) => t.nCount >= 2)
      .sort((a, b) => b.nCount - a.nCount)
      .slice(0, 10);
  }, [lines, taskMap]);

  // Summary totals
  const totals = useMemo(() => ({
    projects: projects.length,
    lookaheads: lookaheads.length,
    submitted: lookaheads.filter((l) => l.status === "submitted").length,
    approved: lookaheads.filter((l) => l.status === "approved").length,
  }), [projects, lookaheads]);

  // Approval rate = approved / (approved + rejected). Drafts and submitted
  // haven't been reviewed yet and should NOT dilute the rate. Show "—" when
  // nothing has been reviewed.
  const reviewedCount = totals.approved + lookaheads.filter((l) => l.status === "rejected").length;
  const approvalRate = reviewedCount > 0 ? Math.round((totals.approved / reviewedCount) * 100) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const ppcColor = (ppc: number) =>
    ppc >= 80 ? "text-green-600 dark:text-green-400" :
    ppc >= 60 ? "text-yellow-600 dark:text-yellow-400" :
    "text-red-600 dark:text-red-400";

  const ppcBarColor = (ppc: number) =>
    ppc >= 80 ? "#22c55e" : ppc >= 60 ? "#eab308" : "#ef4444";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground">Lean construction metrics & look-ahead performance</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Company PPC</p>
                <p className={`text-3xl font-bold ${ppcColor(companyPPC.ppc)}`}>{companyPPC.ppc}%</p>
              </div>
              <Target className="h-8 w-8 text-primary opacity-50" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{companyPPC.completed}/{companyPPC.planned} tasks</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Projects</p>
                <p className="text-3xl font-bold">{totals.projects}</p>
              </div>
              <BarChart3 className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Look-Aheads</p>
                <p className="text-3xl font-bold">{totals.lookaheads}</p>
              </div>
              <Clock className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Review</p>
                <p className="text-3xl font-bold">{totals.submitted}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-yellow-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Approval Rate</p>
                <p className="text-3xl font-bold">{approvalRate === null ? "—" : `${approvalRate}%`}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* PPC Trends Chart */}
      {ppcTrends.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4" /> PPC Trends Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ppcTrends}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="weekLabel" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    contentStyle={{ fontSize: 12 }}
                    formatter={(value: number, name: string) => [`${value}%`, "PPC"]}
                    labelFormatter={(label) => `Week of ${label}`}
                  />
                  {/* Target line driven by configured ppc_goal (average across projects) */}
                  <Line type="monotone" dataKey={() => targetGoal} stroke="#94a3b8" strokeDasharray="6 3" dot={false} name={`Target (${targetGoal}%)`} />
                  <Line type="monotone" dataKey="ppc" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} name="PPC" />
                  <Legend />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* PPC by Project */}
        {ppcByProject.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">PPC by Project</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {ppcByProject.map((p) => (
                  <div
                    key={p.id}
                    className="cursor-pointer hover:bg-muted/50 rounded-md p-2 -mx-2 transition-colors"
                    onClick={() => navigate(`/projects/${p.id}`)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium truncate">{p.name}</span>
                      <span className={`text-sm font-bold ${ppcColor(p.ppc)}`}>{p.ppc}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${p.ppc}%`, backgroundColor: ppcBarColor(p.ppc) }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{p.completed}/{p.planned} tasks · {p.laCount} look-aheads</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* PPC by Superintendent */}
        {ppcBySuper.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">PPC by Superintendent</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {ppcBySuper.map((s) => (
                  <div key={s.userId} className="p-2 -mx-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{s.name}</span>
                      <span className={`text-sm font-bold ${ppcColor(s.ppc)}`}>{s.ppc}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${s.ppc}%`, backgroundColor: ppcBarColor(s.ppc) }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{s.completed}/{s.planned} tasks</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Variance Analysis */}
      <div className="grid gap-6 lg:grid-cols-2">
        {tradeVariance.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" /> Variance by Trade
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">Trades with the highest rate of incomplete ("Not Done") tasks</p>
              <div className="space-y-2">
                {tradeVariance.map((t) => (
                  <div key={t.trade} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                    <span className="font-medium truncate flex-1">{t.trade}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground">{t.notCompleted} of {t.totalPlanned}</span>
                      <span className={`font-bold ${t.failRate >= 30 ? "text-red-600 dark:text-red-400" : t.failRate >= 15 ? "text-yellow-600 dark:text-yellow-400" : "text-muted-foreground"}`}>
                        {t.failRate}% fail
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {frequentFailures.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" /> Frequently Incomplete Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">Tasks most often marked "Not Done" across all look-aheads</p>
              <div className="space-y-2">
                {frequentFailures.map((t, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                    <span className="truncate flex-1">{t.name}</span>
                    <span className="text-xs text-red-600 dark:text-red-400 font-medium shrink-0 ml-2">
                      ✕ {t.nCount} times
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Variance Pareto & Corrective Actions */}
      <VarianceParetoChart />
      <CorrectiveActionsLog />

      {/* Project Breakdown Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No project data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Project</th>
                    <th className="pb-2 font-medium text-muted-foreground text-center">PPC</th>
                    <th className="pb-2 font-medium text-muted-foreground text-center">Total</th>
                    <th className="pb-2 font-medium text-muted-foreground text-center">Draft</th>
                    <th className="pb-2 font-medium text-muted-foreground text-center">Submitted</th>
                    <th className="pb-2 font-medium text-muted-foreground text-center">Approved</th>
                    <th className="pb-2 font-medium text-muted-foreground text-center">Rejected</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => {
                    const pLa = lookaheads.filter((l) => l.project_id === p.id);
                    const ppcData = ppcByProject.find((pp) => pp.id === p.id);
                    return (
                      <tr
                        key={p.id}
                        className="border-b last:border-0 cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/projects/${p.id}`)}
                      >
                        <td className="py-2 font-medium">{p.name}</td>
                        <td className={`py-2 text-center font-bold ${ppcData ? ppcColor(ppcData.ppc) : "text-muted-foreground"}`}>
                          {ppcData ? `${ppcData.ppc}%` : "—"}
                        </td>
                        <td className="py-2 text-center">{pLa.length}</td>
                        <td className="py-2 text-center text-muted-foreground">{pLa.filter((l) => l.status === "draft").length}</td>
                        <td className="py-2 text-center text-yellow-600">{pLa.filter((l) => l.status === "submitted").length}</td>
                        <td className="py-2 text-center text-green-600">{pLa.filter((l) => l.status === "approved").length}</td>
                        <td className="py-2 text-center text-red-600">{pLa.filter((l) => l.status === "rejected").length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
