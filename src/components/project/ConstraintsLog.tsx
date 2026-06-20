import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertTriangle, ShieldAlert, Plus, MoreVertical, Pencil, Trash2, Search } from "lucide-react";
import { format, parseISO } from "date-fns";
import { CONSTRAINT_STATUSES, CONSTRAINT_TYPES, ProjectConstraint, needByUrgency, statusLabel, typeLabel } from "@/lib/constraints";
import { ConstraintDialog } from "./ConstraintDialog";
import { cn } from "@/lib/utils";

interface ConstraintsLogProps {
  projectId: string;
}

export function ConstraintsLog({ projectId }: ConstraintsLogProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<ProjectConstraint[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("open_active");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectConstraint | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("project_constraints")
      .select("*")
      .eq("project_id", projectId)
      .order("need_by_date", { ascending: true, nullsFirst: false });
    setRows((data as any) || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    return rows
      .filter((r) => (r.description || "").trim().length > 0)
      .filter((r) => {
        if (statusFilter === "all") return true;
        if (statusFilter === "open_active") return r.status !== "closed";
        return r.status === statusFilter;
      })
      .filter((r) => (typeFilter === "all" ? true : r.type === typeFilter))
      .filter((r) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (r.description || "").toLowerCase().includes(q) || (r.owner_name || "").toLowerCase().includes(q);
      });
  }, [rows, statusFilter, typeFilter, search]);

  const changeStatus = async (r: ProjectConstraint, next: "open" | "in_progress" | "closed") => {
    const patch: any = { status: next, updated_at: new Date().toISOString() };
    if (next === "closed" && r.status !== "closed") patch.resolved_at = new Date().toISOString();
    if (next !== "closed") patch.resolved_at = null;
    const { error } = await supabase.from("project_constraints").update(patch).eq("id", r.id);
    if (error) toast({ title: "Could not update status", description: error.message, variant: "destructive" });
    else fetchData();
  };

  const deleteRow = async (r: ProjectConstraint) => {
    const { error } = await supabase.from("project_constraints").delete().eq("id", r.id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Constraint deleted" }); fetchData(); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-500" /> Constraints Log
        </CardTitle>
        <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Constraint
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="pl-7 h-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open_active">Open + In Progress</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
              {CONSTRAINT_STATUSES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {CONSTRAINT_TYPES.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No constraints {statusFilter === "open_active" ? "open" : "match those filters"}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium pr-2">Type</th>
                  <th className="pb-2 font-medium pr-2">Description</th>
                  <th className="pb-2 font-medium pr-2">Owner</th>
                  <th className="pb-2 font-medium pr-2">Need by</th>
                  <th className="pb-2 font-medium pr-2">Status</th>
                  <th className="pb-2 font-medium w-8" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const urgency = needByUrgency(r.need_by_date, r.status);
                  return (
                    <tr key={r.id} className="border-b last:border-0 align-top">
                      <td className="py-2 pr-2">
                        <Badge variant="outline" className="text-[10px]">{typeLabel(r.type)}</Badge>
                      </td>
                      <td className="py-2 pr-2 max-w-[360px]">
                        <p className="text-sm">{r.description}</p>
                      </td>
                      <td className="py-2 pr-2 text-muted-foreground">{r.owner_name || "—"}</td>
                      <td className="py-2 pr-2">
                        {r.need_by_date ? (
                          <span className={cn(
                            "inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded",
                            urgency === "overdue" && "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
                            urgency === "soon" && "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
                            urgency === "ok" && "text-muted-foreground",
                          )}>
                            {(urgency === "overdue" || urgency === "soon") && <AlertTriangle className="h-3 w-3" />}
                            {format(parseISO(r.need_by_date), "MMM d")}
                          </span>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="py-2 pr-2">
                        <Select value={r.status} onValueChange={(v) => changeStatus(r, v as any)}>
                          <SelectTrigger className="h-7 text-xs w-[120px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CONSTRAINT_STATUSES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-3.5 w-3.5" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setEditing(r); setDialogOpen(true); }}>
                              <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => deleteRow(r)}>
                              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <ConstraintDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          projectId={projectId}
          constraint={editing}
          onSaved={fetchData}
        />
      </CardContent>
    </Card>
  );
}

/** Compact summary chip: "N open constraints · M overdue" */
export function ConstraintsSummary({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<ProjectConstraint[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("project_constraints")
        .select("id, status, need_by_date, project_id, type, description, owner_name, owner_user_id, company_id, created_at, created_by, resolved_at, lookahead_line_id, rank")
        .eq("project_id", projectId)
        .neq("status", "closed");
      if (!cancelled) setRows((data as any) || []);
    })();
    return () => { cancelled = true; };
  }, [projectId]);
  const open = rows.filter((r) => (r.description || "").trim().length > 0);
  const overdue = open.filter((r) => needByUrgency(r.need_by_date, r.status) === "overdue").length;
  if (open.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
      <ShieldAlert className="h-3.5 w-3.5" />
      {open.length} open constraint{open.length !== 1 ? "s" : ""}
      {overdue > 0 && <span className="font-semibold">· {overdue} overdue</span>}
    </span>
  );
}