import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, TrendingDown, CheckCircle, Clock, BarChart3 } from "lucide-react";

type ProjectStats = {
  project_id: string;
  project_name: string;
  total_lookaheads: number;
  submitted: number;
  approved: number;
  rejected: number;
  draft: number;
};

export default function Analytics() {
  const { profile, roles } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ProjectStats[]>([]);
  const [totals, setTotals] = useState({ projects: 0, lookaheads: 0, submitted: 0, approved: 0 });

  useEffect(() => {
    if (!profile?.company_id) return;

    const fetchAnalytics = async () => {
      // Get all projects
      const { data: projects } = await supabase
        .from("projects")
        .select("id, name")
        .eq("company_id", profile.company_id!);

      if (!projects?.length) { setLoading(false); return; }

      // Get all look-aheads for the company
      const { data: lookaheads } = await supabase
        .from("look_aheads")
        .select("id, project_id, status")
        .eq("company_id", profile.company_id!);

      const la = lookaheads || [];

      const projectStats: ProjectStats[] = projects.map((p) => {
        const pLa = la.filter((l) => l.project_id === p.id);
        return {
          project_id: p.id,
          project_name: p.name,
          total_lookaheads: pLa.length,
          submitted: pLa.filter((l) => l.status === "submitted").length,
          approved: pLa.filter((l) => l.status === "approved").length,
          rejected: pLa.filter((l) => l.status === "rejected").length,
          draft: pLa.filter((l) => l.status === "draft").length,
        };
      });

      setStats(projectStats);
      setTotals({
        projects: projects.length,
        lookaheads: la.length,
        submitted: la.filter((l) => l.status === "submitted").length,
        approved: la.filter((l) => l.status === "approved").length,
      });
      setLoading(false);
    };

    fetchAnalytics();
  }, [profile?.company_id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const approvalRate = totals.lookaheads > 0
    ? Math.round((totals.approved / totals.lookaheads) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground">Company-wide look-ahead performance</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Projects</p>
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
                <p className="text-sm text-muted-foreground">Total Look-Aheads</p>
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
                <p className="text-3xl font-bold">{approvalRate}%</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-Project Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No project data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Project</th>
                    <th className="pb-2 font-medium text-muted-foreground text-center">Total</th>
                    <th className="pb-2 font-medium text-muted-foreground text-center">Draft</th>
                    <th className="pb-2 font-medium text-muted-foreground text-center">Submitted</th>
                    <th className="pb-2 font-medium text-muted-foreground text-center">Approved</th>
                    <th className="pb-2 font-medium text-muted-foreground text-center">Rejected</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s) => (
                    <tr
                      key={s.project_id}
                      className="border-b last:border-0 cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/projects/${s.project_id}`)}
                    >
                      <td className="py-2 font-medium">{s.project_name}</td>
                      <td className="py-2 text-center">{s.total_lookaheads}</td>
                      <td className="py-2 text-center text-muted-foreground">{s.draft}</td>
                      <td className="py-2 text-center text-yellow-600">{s.submitted}</td>
                      <td className="py-2 text-center text-green-600">{s.approved}</td>
                      <td className="py-2 text-center text-red-600">{s.rejected}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
