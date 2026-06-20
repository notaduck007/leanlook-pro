import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Line, ComposedChart, Cell } from "recharts";
import { VARIANCE_REASONS } from "@/components/lookahead/VarianceReasonPopover";
import { AlertTriangle } from "lucide-react";

interface Props {
  projectId?: string;
}

type Row = {
  variance_reason: string | null;
  status_per_day: Record<string, string> | null;
};

export function VarianceParetoChart({ projectId }: Props) {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.company_id) return;
    const fetch = async () => {
      setLoading(true);
      let q = supabase
        .from("lookahead_lines")
        .select("variance_reason, status_per_day, look_aheads!inner(project_id, company_id)")
        .eq("look_aheads.company_id", profile.company_id!);
      if (projectId) q = q.eq("look_aheads.project_id", projectId);
      const { data } = await q;
      setRows(((data || []) as any[]).map((r) => ({
        variance_reason: r.variance_reason,
        status_per_day: r.status_per_day,
      })));
      setLoading(false);
    };
    fetch();
  }, [profile?.company_id, projectId]);

  const data = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const spd = r.status_per_day || {};
      const hasN = Object.values(spd).some((s) => s === "N");
      if (!hasN) continue;
      const key = r.variance_reason || "unassigned";
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const labelOf = (k: string) => {
      if (k === "unassigned") return "Unassigned";
      return VARIANCE_REASONS.find((r) => r.key === k)?.label || k;
    };
    const sorted = Array.from(counts.entries())
      .map(([k, count]) => ({ key: k, label: labelOf(k), count }))
      .sort((a, b) => b.count - a.count);
    const total = sorted.reduce((s, r) => s + r.count, 0) || 1;
    let acc = 0;
    return sorted.map((r) => {
      acc += r.count;
      return { ...r, cumulativePct: Math.round((acc / total) * 100) };
    });
  }, [rows]);

  const colors = ["#ef4444", "#f97316", "#eab308", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#64748b"];
  const total = data.reduce((s, r) => s + r.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" /> Variance Pareto
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          Not-Done occurrences grouped by root cause. The cumulative line highlights the vital few reasons driving most variance.
        </p>
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : total === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No Not-Done variance yet. Recorded reasons will appear here.
          </p>
        ) : (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 20, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  formatter={(value: any, name: any) => {
                    if (name === "Cumulative %") return [`${value}%`, name];
                    return [value, "Count"];
                  }}
                />
                <Bar yAxisId="left" dataKey="count" name="Count" radius={[4, 4, 0, 0]}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={colors[i % colors.length]} />
                  ))}
                </Bar>
                <Line yAxisId="right" type="monotone" dataKey="cumulativePct" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3 }} name="Cumulative %" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}