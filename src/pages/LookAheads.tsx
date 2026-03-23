import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CalendarDays, Search } from "lucide-react";
import { format } from "date-fns";

type LookAheadWithProject = {
  id: string;
  project_id: string;
  project_name: string;
  week_start_date: string;
  status: string;
  created_at: string;
  super_id: string;
  super_name: string;
};

export default function LookAheads() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [lookAheads, setLookAheads] = useState<LookAheadWithProject[]>([]);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    if (!profile?.company_id) return;

    const fetch = async () => {
      const { data: las } = await supabase
        .from("look_aheads")
        .select("*")
        .eq("company_id", profile.company_id!)
        .order("created_at", { ascending: false });

      if (!las?.length) { setLoading(false); return; }

      // Get project names
      const projectIds = [...new Set(las.map((l) => l.project_id))];
      const { data: projects } = await supabase
        .from("projects")
        .select("id, name")
        .in("id", projectIds);
      const projMap = (projects || []).reduce((a, p) => ({ ...a, [p.id]: p.name }), {} as Record<string, string>);

      // Get super names
      const superIds = [...new Set(las.map((l) => l.super_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", superIds);
      const superMap = (profiles || []).reduce((a, p) => ({ ...a, [p.user_id]: p.display_name || "Unknown" }), {} as Record<string, string>);

      setLookAheads(
        las.map((la) => ({
          id: la.id,
          project_id: la.project_id,
          project_name: projMap[la.project_id] || "Unknown Project",
          week_start_date: la.week_start_date,
          status: la.status,
          created_at: la.created_at,
          super_id: la.super_id,
          super_name: superMap[la.super_id] || "Unknown",
        }))
      );
      setLoading(false);
    };

    fetch();
  }, [profile?.company_id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const filtered = lookAheads.filter((la) => {
    const matchesText = !filter ||
      la.project_name.toLowerCase().includes(filter.toLowerCase()) ||
      la.super_name.toLowerCase().includes(filter.toLowerCase());
    const matchesStatus = statusFilter === "all" || la.status === statusFilter;
    return matchesText && matchesStatus;
  });

  const statusColor = (s: string) => {
    switch (s) {
      case "draft": return "secondary";
      case "submitted": return "default";
      case "approved": return "default";
      case "rejected": return "destructive";
      default: return "secondary";
    }
  };

  const statuses = ["all", "draft", "submitted", "approved", "rejected"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Look-Aheads</h1>
        <p className="text-sm text-muted-foreground">Review and manage all 2-week look-aheads</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by project or super..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          {statuses.map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(s)}
              className="capitalize text-xs"
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No look-aheads found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((la) => (
            <Card
              key={la.id}
              className="cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => navigate(`/projects/${la.project_id}/lookahead/${la.id}`)}
            >
              <CardContent className="py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <CalendarDays className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="font-medium">{la.project_name}</p>
                    <p className="text-sm text-muted-foreground">
                      Week of {format(new Date(la.week_start_date + "T00:00:00"), "MMM d, yyyy")} · by {la.super_name}
                    </p>
                  </div>
                </div>
                <Badge variant={statusColor(la.status) as any} className="capitalize">
                  {la.status}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
