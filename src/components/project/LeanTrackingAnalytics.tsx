import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, BarChart3, Save, TrendingUp } from "lucide-react";
import { format } from "date-fns";
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

// Root cause categories matching the LPS standard
const VARIANCE_CATEGORIES = [
  { key: "1-Make Ready", label: "Make Ready", color: "hsl(var(--primary))" },
  { key: "2-Manpower", label: "Manpower", color: "hsl(220, 70%, 50%)" },
  { key: "3-Material/Equipment", label: "Material/Equipment", color: "hsl(30, 80%, 55%)" },
  { key: "4-Design", label: "Design", color: "hsl(280, 60%, 55%)" },
  { key: "5-Weather", label: "Weather", color: "hsl(190, 70%, 45%)" },
  { key: "6-AHJ", label: "AHJ", color: "hsl(350, 70%, 55%)" },
  { key: "7-Other", label: "Other", color: "hsl(var(--muted-foreground))" },
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
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [ppcData, setPpcData] = useState<PPCDataPoint[]>([]);
  const [constraintCounts, setConstraintCounts] = useState<ConstraintCount[]>([]);
  const [topConstraints, setTopConstraints] = useState<ProjectConstraint[]>([]);
  const [editingConstraints, setEditingConstraints] = useState(false);
  const [draftConstraints, setDraftConstraints] = useState<ProjectConstraint[]>([]);
  const [savingConstraints, setSavingConstraints] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);

    // Fetch look-aheads (approved/submitted) and their lines
    const { data: lookAheads } = await supabase
      .from("look_aheads")
      .select("id, week_start_date, status, updated_at")
      .eq("project_id", projectId)
      .in("status", ["submitted", "approved"])
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
      .select("lookahead_id, status_per_day, materials_needed, parent_line_id")
      .in("lookahead_id", laIds);

    if (!allLines) {
      setLoading(false);
      return;
    }

    // --- PPC per week ---
    const ppcPoints: PPCDataPoint[] = lookAheads.map((la) => {
      const lines = allLines.filter(
        (l) => l.lookahead_id === la.id && !l.parent_line_id
      );
      // Include child lines too
      const childLines = allLines.filter(
        (l) => l.lookahead_id === la.id && l.parent_line_id
      );
      const relevantLines = [...lines, ...childLines];

      let completed = 0;
      let totalPlanned = 0;

      for (const line of relevantLines) {
        const spd = (line.status_per_day || {}) as Record<string, string>;
        for (const status of Object.values(spd)) {
          if (["Y", "N", "50", "progress"].includes(status)) {
            totalPlanned++;
            if (status === "Y") completed++;
          }
        }
      }

      const ppc = totalPlanned > 0 ? Math.round((completed / totalPlanned) * 100) : 0;
      return {
        weekLabel: format(new Date(la.week_start_date + "T00:00:00"), "MMM d"),
        weekDate: la.week_start_date,
        ppc,
        completed,
        planned: totalPlanned,
      };
    });

    setPpcData(ppcPoints);

    // --- Constraint/Variance breakdown ---
    // materials_needed stores root cause category for lines with N status
    const varianceCounts: Record<string, number> = {};
    for (const cat of VARIANCE_CATEGORIES) {
      varianceCounts[cat.key] = 0;
    }

    for (const line of allLines) {
      const spd = (line.status_per_day || {}) as Record<string, string>;
      const hasFailure = Object.values(spd).some((s) => s === "N");
      if (hasFailure && line.materials_needed) {
        const cat = line.materials_needed;
        if (varianceCounts[cat] !== undefined) {
          varianceCounts[cat]++;
        } else {
          varianceCounts["7-Other"] = (varianceCounts["7-Other"] || 0) + 1;
        }
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

  const handleEditConstraints = () => {
    setDraftConstraints(topConstraints.map((c) => ({ ...c })));
    setEditingConstraints(true);
  };

  const handleSaveConstraints = async () => {
    if (!profile?.company_id) return;
    setSavingConstraints(true);

    for (const draft of draftConstraints) {
      const existing = topConstraints.find((c) => c.rank === draft.rank);
      if (existing?.id && draft.description) {
        await supabase
          .from("project_constraints")
          .update({ description: draft.description, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else if (existing?.id && !draft.description) {
        await supabase.from("project_constraints").delete().eq("id", existing.id);
      } else if (!existing?.id && draft.description) {
        await supabase.from("project_constraints").insert({
          project_id: projectId,
          company_id: profile.company_id,
          rank: draft.rank,
          description: draft.description,
        });
      }
    }

    setSavingConstraints(false);
    setEditingConstraints(false);
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
                PPC trend will appear after 2+ look-aheads are submitted
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
            <p className="text-sm text-muted-foreground">
              No variance reasons recorded yet. Root causes are captured when tasks are marked "Not Done."
            </p>
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
            {!editingConstraints ? (
              <Button variant="outline" size="sm" onClick={handleEditConstraints}>
                Edit
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleSaveConstraints}
                disabled={savingConstraints}
              >
                {savingConstraints ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Save className="mr-1 h-3 w-3" />
                )}
                Save
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {(editingConstraints ? draftConstraints : topConstraints).map((c, idx) => (
              <div key={c.rank} className="flex items-center gap-3">
                <span className="text-sm font-mono text-muted-foreground w-6 text-right shrink-0">
                  {c.rank}.
                </span>
                {editingConstraints ? (
                  <Input
                    value={draftConstraints[idx]?.description || ""}
                    onChange={(e) => {
                      const updated = [...draftConstraints];
                      updated[idx] = { ...updated[idx], description: e.target.value };
                      setDraftConstraints(updated);
                    }}
                    placeholder="Enter constraint or issue..."
                    className="h-8 text-sm"
                  />
                ) : c.description ? (
                  <p className="text-sm">{c.description}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    {idx === 0
                      ? "No constraints logged yet. Constraints are captured during weekly PPC reviews."
                      : "—"}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
