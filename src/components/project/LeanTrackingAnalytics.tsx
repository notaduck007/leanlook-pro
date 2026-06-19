import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, BarChart3, Save, TrendingUp, ClipboardList, Pencil } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from "recharts";

const VARIANCE_CATEGORIES = [
  { key: "make_ready", label: "Make Ready", color: "hsl(217, 91%, 60%)" },
  { key: "manpower", label: "Manpower", color: "hsl(263, 70%, 50%)" },
  { key: "material_equipment", label: "Material / Equipment", color: "hsl(25, 95%, 53%)" },
  { key: "design", label: "Design", color: "hsl(330, 80%, 60%)" },
  { key: "weather", label: "Weather", color: "hsl(188, 78%, 41%)" },
  { key: "ahj", label: "AHJ", color: "hsl(0, 84%, 60%)" },
  { key: "other", label: "Other", color: "hsl(var(--muted-foreground))" },
] as const;

interface LeanTrackingAnalyticsProps {
  projectId: string;
  ppcGoal: number;
}

interface PPCDataPoint {
  weekLabel: string;
  weekDate: string;
  ppc: number;
  completed: number;
  planned: number;
}

interface ConstraintCount {
  key: string;
  label: string;
  color: string;
  count: number;
  percent: number;
}

interface ProjectConstraint {
  id?: string;
  rank: number;
  description: string;
}

export function LeanTrackingAnalytics({ projectId, ppcGoal }: LeanTrackingAnalyticsProps) {
  const { profile, roles } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [ppcData, setPpcData] = useState<PPCDataPoint[]>([]);
  const [constraintCounts, setConstraintCounts] = useState<ConstraintCount[]>([]);
  const [topConstraints, setTopConstraints] = useState<ProjectConstraint[]>([]);
  const [editingRank, setEditingRank] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [savingConstraint, setSavingConstraint] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const canEdit = roles.includes("admin") || roles.includes("pm");

  const fetchAnalytics = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);

    // Fetch ALL look-aheads (any status) for PPC
    const { data: lookAheads } = await supabase
      .from("look_aheads")
      .select("id, week_start_date, status, updated_at")
      .eq("project_id", projectId)
      .order("week_start_date", { ascending: true });

    if (!lookAheads || lookAheads.length === 0) {
      setPpcData([]);
      setConstraintCounts([]);
      setLastUpdated(null);
      setLoading(false);
      return;
    }

    setLastUpdated(lookAheads[lookAheads.length - 1].updated_at);

    const laIds = lookAheads.map((la) => la.id);
    const { data: allLines } = await supabase
      .from("lookahead_lines")
      .select("lookahead_id, status_per_day, variance_reason, parent_line_id")
      .in("lookahead_id", laIds);

    if (!allLines) {
      setLoading(false);
      return;
    }

    // --- PPC per week ---
    const ppcPoints: PPCDataPoint[] = lookAheads.map((la) => {
      const relevantLines = allLines.filter((l) => l.lookahead_id === la.id);
      const { completed, resolved: totalPlanned, ppc } = computePPC(relevantLines);
      return {
        weekLabel: format(new Date(la.week_start_date + "T00:00:00"), "MMM d"),
        weekDate: la.week_start_date,
        ppc,
        completed,
        planned: totalPlanned,
      };
    });

    setPpcData(ppcPoints);

    // --- Constraint/Variance breakdown from variance_reason ---
    const varianceCounts: Record<string, number> = {};
    for (const cat of VARIANCE_CATEGORIES) {
      varianceCounts[cat.key] = 0;
    }

    for (const line of allLines) {
      if (line.variance_reason && varianceCounts[line.variance_reason as string] !== undefined) {
        varianceCounts[line.variance_reason as string]++;
      }
    }

    const totalVariances = Object.values(varianceCounts).reduce((a, b) => a + b, 0);
    const counts: ConstraintCount[] = VARIANCE_CATEGORIES.map((cat) => ({
      key: cat.key,
      label: cat.label,
      color: cat.color,
      count: varianceCounts[cat.key],
      percent: totalVariances > 0 ? Math.round((varianceCounts[cat.key] / totalVariances) * 100) : 0,
    }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);

    setConstraintCounts(counts);

    // --- Top 10 project constraints ---
    const { data: savedConstraints } = await supabase
      .from("project_constraints")
      .select("*")
      .eq("project_id", projectId)
      .order("rank", { ascending: true });

    const constraintsList: ProjectConstraint[] = Array.from({ length: 10 }, (_, i) => {
      const saved = savedConstraints?.find((c: any) => c.rank === i + 1);
      return { id: saved?.id, rank: i + 1, description: saved?.description || "" };
    });

    setTopConstraints(constraintsList);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleSaveConstraint = async (rank: number, description: string) => {
    if (!profile?.company_id) return;
    setSavingConstraint(true);

    const existing = topConstraints.find((c) => c.rank === rank);

    if (existing?.id && description) {
      await supabase
        .from("project_constraints")
        .update({ description, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else if (existing?.id && !description) {
      await supabase.from("project_constraints").delete().eq("id", existing.id);
    } else if (!existing?.id && description) {
      await supabase.from("project_constraints").insert({
        project_id: projectId,
        company_id: profile.company_id,
        rank,
        description,
      });
    }

    setSavingConstraint(false);
    setEditingRank(null);
    toast({ title: "Constraint saved" });
    fetchAnalytics();
  };

  const totalVariances = useMemo(
    () => constraintCounts.reduce((a, b) => a + b.count, 0),
    [constraintCounts]
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-40">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  // Full empty state - no look-aheads at all
  if (ppcData.length === 0 && totalVariances === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Lean Tracking Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <TrendingUp className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <h3 className="text-sm font-semibold mb-1">No look-ahead data yet</h3>
            <p className="text-xs text-muted-foreground max-w-md">
              Create your first 2-week look-ahead to start tracking PPC and constraint data.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Lean Tracking Analytics
          </CardTitle>
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              Last updated: {format(new Date(lastUpdated), "MMM d, yyyy")}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-8">
        {/* 1. PPC Trend Line Chart */}
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> % Completed by Week
          </h3>
          {ppcData.length < 2 ? (
            <div className="flex items-center justify-center h-[200px] rounded-lg border border-dashed">
              <p className="text-sm text-muted-foreground">
                PPC trend will appear after 2+ look-aheads are created
              </p>
            </div>
          ) : (
            <div className="w-full" style={{ minHeight: 300 }}>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={ppcData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis
                    dataKey="weekLabel"
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as PPCDataPoint;
                      return (
                        <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
                          <p className="font-medium">Week of {d.weekLabel}</p>
                          <p className="text-primary font-semibold">{d.ppc}% PPC</p>
                          <p className="text-muted-foreground">
                            {d.completed} of {d.planned} planned cells completed
                          </p>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine
                    y={ppcGoal}
                    stroke="hsl(var(--destructive))"
                    strokeDasharray="6 4"
                    strokeWidth={2}
                    label={{
                      value: `Goal ${ppcGoal}%`,
                      position: "right",
                      fill: "hsl(var(--destructive))",
                      fontSize: 11,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="ppc"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "hsl(var(--primary))" }}
                    activeDot={{ r: 6 }}
                    name="PPC %"
                  />
                  <Legend />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <Separator />

        {/* 2. Constraint Breakdown Summary */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Constraint Breakdown</h3>
          {totalVariances === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <ClipboardList className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <h4 className="text-sm font-medium mb-1">No variance data yet</h4>
              <p className="text-xs text-muted-foreground max-w-sm">
                When tasks are marked as Not Completed (N) in look-aheads, the reason is recorded here. This data builds over time as your team tracks weekly progress.
              </p>
            </div>
          ) : (
            <>
              {/* Stacked bar */}
              <div className="w-full h-6 rounded-full overflow-hidden flex bg-muted mb-4">
                {constraintCounts.map((c) => (
                  <div
                    key={c.key}
                    className="h-full transition-all"
                    style={{
                      width: `${c.percent}%`,
                      backgroundColor: c.color,
                      minWidth: c.percent > 0 ? 4 : 0,
                    }}
                    title={`${c.label}: ${c.count} (${c.percent}%)`}
                  />
                ))}
              </div>
              {/* Category cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {constraintCounts.map((c) => (
                  <div key={c.key} className="flex items-center gap-2 p-2 rounded-lg border">
                    <div
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: c.color }}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{c.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.count} ({c.percent}%)
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <Separator />

        {/* 3. Top 10 Constraints / Issues */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Top 10 Constraints / Issues</h3>
          </div>
          {canEdit && topConstraints.every((c) => !c.description) && (
            <p className="text-xs text-muted-foreground mb-2">
              Click any row to add a constraint or issue. These are reviewed weekly during PPC meetings.
            </p>
          )}
          <div className="space-y-1">
            {topConstraints.map((c) => (
              <div key={c.rank} className="flex items-center gap-3 group min-h-[32px]">
                <span className="text-sm font-mono text-muted-foreground w-6 text-right shrink-0">
                  {c.rank}.
                </span>
                {editingRank === c.rank ? (
                  <div className="flex-1 flex items-center gap-2">
                    <Input
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      placeholder="Enter constraint or issue..."
                      className="h-8 text-sm flex-1"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveConstraint(c.rank, editText);
                        if (e.key === "Escape") setEditingRank(null);
                      }}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2"
                      onClick={() => handleSaveConstraint(c.rank, editText)}
                      disabled={savingConstraint}
                    >
                      {savingConstraint ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    </Button>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center gap-2">
                    {c.description ? (
                      <p className="text-sm flex-1">{c.description}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground italic flex-1">—</p>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => {
                          setEditingRank(c.rank);
                          setEditText(c.description);
                        }}
                        className="p-1 rounded hover:bg-accent transition-colors opacity-0 group-hover:opacity-100"
                        title="Edit constraint"
                      >
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
