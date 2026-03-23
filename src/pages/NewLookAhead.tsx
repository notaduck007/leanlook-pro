import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CalendarDays, Loader2 } from "lucide-react";
import { format, startOfWeek, addWeeks, addDays, parseISO, isBefore, isAfter } from "date-fns";

export default function NewLookAhead() {
  const { id: projectId } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [project, setProject] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [weekStart, setWeekStart] = useState(() => {
    const next = startOfWeek(addWeeks(new Date(), 1), { weekStartsOn: 1 });
    return format(next, "yyyy-MM-dd");
  });
  const [taskCount, setTaskCount] = useState(0);

  useEffect(() => {
    if (!projectId) return;
    supabase.from("projects").select("*").eq("id", projectId).single().then(({ data }) => setProject(data));
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    // Count tasks overlapping the 2-week window
    const start = weekStart;
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
          .or(`start_date.lte.${end},finish_date.gte.${start}`)
          .then(({ count }) => setTaskCount(count || 0));
      });
  }, [projectId, weekStart]);

  const handleCreate = async () => {
    if (!projectId || !user || !profile?.company_id) return;
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
        .or(`start_date.lte.${end},finish_date.gte.${weekStart}`)
        .order("name");

      // Fetch task templates for auto-filling materials/constraints
      const { data: templates } = await supabase
        .from("task_templates")
        .select("*")
        .eq("company_id", profile.company_id);

      const templateMap = new Map<string, any>();
      (templates || []).forEach((t) => templateMap.set(t.tag.toLowerCase(), t));

      if (tasks?.length) {
        const lines = tasks.map((task, i) => {
          // Compute status_per_day based on task dates
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

          // Auto-fill from templates based on task tags
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

    setCreating(false);
    navigate(`/projects/${projectId}/lookahead/${la.id}`);
  };

  if (!project) {
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
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Week Starting</label>
            <input
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm">
              <span className="font-medium">{taskCount}</span> tasks overlap with this 2-week window.
              {taskCount === 0 && " Upload a schedule first to auto-populate tasks."}
            </p>
          </div>
          <Button onClick={handleCreate} disabled={creating} className="w-full">
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CalendarDays className="h-4 w-4 mr-2" />}
            Create Look-Ahead
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
