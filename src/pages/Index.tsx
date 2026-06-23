import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderKanban, CalendarDays, FileUp, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { WelcomeDialog } from "@/components/WelcomeDialog";

export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ projects: 0, lookAheads: 0, schedules: 0 });
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.company_id) return;

    const fetchData = async () => {
      const [projectsRes, lookAheadsRes, schedulesRes] = await Promise.all([
        supabase.from("projects").select("*").eq("company_id", profile.company_id!),
        supabase.from("look_aheads").select("id").eq("company_id", profile.company_id!),
        supabase.from("schedule_versions").select("id").eq("company_id", profile.company_id!),
      ]);

      const allProjects = projectsRes.data || [];
      setProjects(allProjects);
      setStats({
        projects: allProjects.filter((p) => p.status === "active").length,
        lookAheads: lookAheadsRes.data?.length || 0,
        schedules: schedulesRes.data?.length || 0,
      });
      setLoading(false);
    };
    fetchData();
  }, [profile?.company_id]);

  const statCards = [
    { title: "Active Projects", value: stats.projects, icon: FolderKanban, color: "text-primary" },
    { title: "Look-Aheads", value: stats.lookAheads, icon: CalendarDays, color: "text-primary" },
    { title: "Schedules Uploaded", value: stats.schedules, icon: FileUp, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      <WelcomeDialog />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back to LeanLook</p>
        </div>
        <Button onClick={() => navigate("/projects/new")} className="min-h-11">
          <Plus className="mr-2 h-4 w-4" /> New Project
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)
        ) : statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Projects</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderKanban className="mx-auto h-12 w-12 mb-3 opacity-50" />
              <p>No projects yet. Create your first project to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  <div>
                    <p className="font-medium">{project.name}</p>
                    <p className="text-sm text-muted-foreground capitalize">{project.status}</p>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    project.status === "active"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {project.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
