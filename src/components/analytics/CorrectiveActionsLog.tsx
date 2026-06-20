import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Pencil, ListChecks, CheckCircle2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { CorrectiveAction, CORRECTIVE_ACTION_STATUSES, dueUrgency, actionStatusLabel } from "@/lib/correctiveActions";
import { VARIANCE_REASONS } from "@/components/lookahead/VarianceReasonPopover";
import { CorrectiveActionDialog } from "@/components/lookahead/CorrectiveActionDialog";
import { cn } from "@/lib/utils";

interface Props {
  projectId?: string;
}

export function CorrectiveActionsLog({ projectId }: Props) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<CorrectiveAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("open_active");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<CorrectiveAction | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogProjectId, setDialogProjectId] = useState<string | null>(projectId || null);

  const fetchItems = async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    let q = supabase
      .from("corrective_actions")
      .select("*")
      .eq("company_id", profile.company_id)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (projectId) q = q.eq("project_id", projectId);
    const { data, error } = await q;
    if (error) toast({ title: "Failed to load", description: error.message, variant: "destructive" });
    setItems((data || []) as CorrectiveAction[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id, projectId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (statusFilter === "open_active") {
        if (it.status === "done") return false;
      } else if (statusFilter !== "all" && it.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        (it.action || "").toLowerCase().includes(q) ||
        (it.owner_name || "").toLowerCase().includes(q) ||
        (it.root_cause || "").toLowerCase().includes(q) ||
        (it.variance_reason || "").toLowerCase().includes(q)
      );
    });
  }, [items, statusFilter, query]);

  const openCount = items.filter((i) => i.status !== "done").length;

  const markDone = async (it: CorrectiveAction) => {
    const { error } = await supabase
      .from("corrective_actions")
      .update({ status: "done", resolved_at: new Date().toISOString() })
      .eq("id", it.id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Marked done" });
      fetchItems();
    }
  };

  const reasonLabel = (k?: string | null) => {
    if (!k) return null;
    return VARIANCE_REASONS.find((r) => r.key === k)?.label || k;
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="h-4 w-4" /> Corrective Actions
            {openCount > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px]">{openCount} open</Badge>
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Track the actions teams committed to so Not-Done variance doesn't repeat.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="h-8 w-[160px] text-xs"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open_active">Open & In Progress</SelectItem>
              <SelectItem value="all">All</SelectItem>
              {CORRECTIVE_ACTION_STATUSES.map((s) => (
                <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No corrective actions {statusFilter === "open_active" ? "open" : "found"}.
          </p>
        ) : (
          <div className="divide-y">
            {filtered.map((it) => {
              const urg = dueUrgency(it.due_date, it.status);
              return (
                <div key={it.id} className="py-2.5 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{it.action}</span>
                      {reasonLabel(it.variance_reason) && (
                        <Badge variant="outline" className="text-[10px] h-4 py-0">{reasonLabel(it.variance_reason)}</Badge>
                      )}
                      <Badge
                        className={cn(
                          "text-[10px] h-4 py-0",
                          it.status === "done" && "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 border-emerald-600/20",
                          it.status === "in_progress" && "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20",
                          it.status === "open" && "bg-muted text-foreground/80"
                        )}
                        variant="outline"
                      >
                        {actionStatusLabel(it.status)}
                      </Badge>
                    </div>
                    {it.root_cause && (
                      <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line line-clamp-2">{it.root_cause}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground flex-wrap">
                      {it.owner_name && <span>Owner: <span className="text-foreground">{it.owner_name}</span></span>}
                      {it.due_date && (
                        <span
                          className={cn(
                            urg === "overdue" && "text-destructive font-medium",
                            urg === "soon" && "text-amber-700 dark:text-amber-400"
                          )}
                        >
                          Due {format(parseISO(it.due_date), "MMM d, yyyy")}
                          {urg === "overdue" && " · overdue"}
                        </span>
                      )}
                      {it.resolved_at && (
                        <span>Resolved {format(parseISO(it.resolved_at), "MMM d")}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {it.status !== "done" && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => markDone(it)}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Done
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditing(it);
                        setDialogProjectId(it.project_id);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {dialogProjectId && (
        <CorrectiveActionDialog
          open={dialogOpen}
          onOpenChange={(o) => {
            setDialogOpen(o);
            if (!o) setEditing(null);
          }}
          projectId={dialogProjectId}
          existing={editing}
          onSaved={fetchItems}
        />
      )}
    </Card>
  );
}