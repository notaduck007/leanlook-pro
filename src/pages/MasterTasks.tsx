import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Search, Plus, Trash2, Edit, Download, ArrowUpDown, Loader2, Database } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface MasterTask {
  id: string;
  name: string;
  normalized_name: string;
  category: string | null;
  default_duration: number | null;
  default_trade: string | null;
  description: string | null;
  status: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

const emptyForm: Partial<MasterTask> = {
  name: "", category: "", default_duration: null, default_trade: "",
  description: "", status: "active",
};

const statusColors: Record<string, string> = {
  active: "bg-success/10 text-success border-success/30",
  inactive: "bg-muted text-muted-foreground border-muted-foreground/30",
};

type SortKey = "name" | "category" | "default_duration" | "status" | "created_at";

export default function MasterTasks() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<MasterTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<MasterTask | null>(null);
  const [form, setForm] = useState<Partial<MasterTask>>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [page, setPage] = useState(0);
  const perPage = 25;
  const [bulkMode, setBulkMode] = useState<null | "trade" | "duration" | "status">(null);
  const [bulkValue, setBulkValue] = useState<string>("");
  const [bulkSaving, setBulkSaving] = useState(false);

  const fetchTasks = async () => {
    const { data } = await supabase
      .from("master_tasks")
      .select("*")
      .order("name");
    if (data) setTasks(data as unknown as MasterTask[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchTasks();
    const ch = supabase
      .channel("master-tasks-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "master_tasks" }, () => fetchTasks())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    let result = tasks;
    if (statusFilter !== "all") result = result.filter(t => t.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(t =>
        t.name.toLowerCase().includes(q) ||
        (t.category || "").toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q) ||
        (t.default_trade || "").toLowerCase().includes(q)
      );
    }
    result = [...result].sort((a, b) => {
      const av = (a as any)[sortKey] ?? "";
      const bv = (b as any)[sortKey] ?? "";
      const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [tasks, search, statusFilter, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice(page * perPage, (page + 1) * perPage);

  const toggleSelect = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleAll = () => {
    if (selected.size === paged.length) setSelected(new Set());
    else setSelected(new Set(paged.map(t => t.id)));
  };

  const openAdd = () => { setEditingTask(null); setForm(emptyForm); setSheetOpen(true); };
  const openEdit = (t: MasterTask) => {
    setEditingTask(t);
    setForm({ name: t.name, category: t.category || "", default_duration: t.default_duration, default_trade: t.default_trade || "", description: t.description || "", status: t.status });
    setSheetOpen(true);
  };

  const handleSave = async () => {
    if (!form.name?.trim()) { toast({ title: "Task name is required", variant: "destructive" }); return; }
    setSaving(true);
    const normalized = form.name!.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
    const payload: any = {
      name: form.name!.trim(),
      normalized_name: normalized,
      category: form.category || null,
      default_duration: form.default_duration || null,
      default_trade: form.default_trade || null,
      description: form.description || null,
      status: form.status || "active",
    };
    let error;
    if (editingTask) {
      ({ error } = await supabase.from("master_tasks").update(payload).eq("id", editingTask.id));
    } else {
      if (!profile?.company_id) { toast({ title: "No company associated with user", variant: "destructive" }); setSaving(false); return; }
      payload.company_id = profile.company_id;
      ({ error } = await supabase.from("master_tasks").insert(payload));
    }
    setSaving(false);
    if (error) { toast({ title: "Error saving task", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingTask ? "Task updated" : "Task created" });
    setSheetOpen(false);
    fetchTasks();
  };

  const handleDelete = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    const { error } = await supabase.from("master_tasks").delete().in("id", ids);
    if (error) { toast({ title: "Error deleting", description: error.message, variant: "destructive" }); return; }
    toast({ title: `${ids.length} task(s) deleted` });
    setSelected(new Set());
    setDeleteOpen(false);
    fetchTasks();
  };

  const openBulk = (mode: "trade" | "duration" | "status") => {
    setBulkValue("");
    setBulkMode(mode);
  };

  const handleBulkApply = async () => {
    const ids = Array.from(selected);
    if (!ids.length || !bulkMode) return;
    const payload: any = {};
    if (bulkMode === "trade") {
      if (!bulkValue.trim()) { toast({ title: "Enter a trade", variant: "destructive" }); return; }
      payload.default_trade = bulkValue.trim();
    } else if (bulkMode === "duration") {
      const n = Number(bulkValue);
      if (!n || n < 1) { toast({ title: "Enter a valid duration (days)", variant: "destructive" }); return; }
      payload.default_duration = n;
    } else if (bulkMode === "status") {
      if (!bulkValue) { toast({ title: "Pick a status", variant: "destructive" }); return; }
      payload.status = bulkValue;
    }
    setBulkSaving(true);
    const { error } = await supabase.from("master_tasks").update(payload).in("id", ids);
    setBulkSaving(false);
    if (error) { toast({ title: "Bulk update failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: `${ids.length} task(s) updated` });
    setBulkMode(null);
    fetchTasks();
  };

  const exportCSV = () => {
    const rows = selected.size > 0 ? tasks.filter(t => selected.has(t.id)) : filtered;
    const headers = ["Name", "Category", "Default Duration", "Default Trade", "Description", "Status"];
    const csv = [headers.join(","), ...rows.map(t =>
      [t.name, t.category || "", t.default_duration || "", t.default_trade || "", `"${(t.description || "").replace(/"/g, '""')}"`, t.status].join(",")
    )].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "master_tasks.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const SortHeader = ({ label, sk }: { label: string; sk: SortKey }) => (
    <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort(sk)}>
      {label} <ArrowUpDown className="h-3 w-3" />
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold">Master Tasks</h1>
          <Badge variant="secondary" className="text-xs">{filtered.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-1" /> Export</Button>
          <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Add Task</Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search tasks..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        {selected.size > 0 && (
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <span className="text-sm text-muted-foreground">{selected.size} selected</span>
            <Button variant="outline" size="sm" onClick={() => openBulk("trade")}>Set trade</Button>
            <Button variant="outline" size="sm" onClick={() => openBulk("duration")}>Set duration</Button>
            <Button variant="outline" size="sm" onClick={() => openBulk("status")}>Set status</Button>
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"><Checkbox checked={paged.length > 0 && selected.size === paged.length} onCheckedChange={toggleAll} /></TableHead>
                <TableHead><SortHeader label="Task Name" sk="name" /></TableHead>
                <TableHead><SortHeader label="Category" sk="category" /></TableHead>
                <TableHead><SortHeader label="Duration" sk="default_duration" /></TableHead>
                <TableHead>Default Trade</TableHead>
                <TableHead><SortHeader label="Status" sk="status" /></TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No tasks found</TableCell></TableRow>
              ) : paged.map(t => (
                <TableRow key={t.id} className="hover:bg-muted/50">
                  <TableCell><Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} /></TableCell>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-muted-foreground">{t.category || "—"}</TableCell>
                  <TableCell>{t.default_duration ? `${t.default_duration}d` : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{t.default_trade || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn(statusColors[t.status] || "")}>{t.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{filtered.length} total</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</Button>
            <span className="px-2 py-1">Page {page + 1} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Add/Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingTask ? "Edit Task" : "Add New Task"}</SheetTitle>
            <SheetDescription>{editingTask ? "Update task details" : "Create a reusable task entry"}</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div>
              <Label>Task Name <span className="text-destructive">*</span></Label>
              <Input value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g., Pour Foundation" />
            </div>
            <div>
              <Label>Category</Label>
              <Input value={form.category || ""} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g., Structural, MEP, Finishes" />
            </div>
            <div>
              <Label>Default Duration (days)</Label>
              <Input type="number" min={1} value={form.default_duration ?? ""} onChange={e => setForm(f => ({ ...f, default_duration: e.target.value ? Number(e.target.value) : null }))} placeholder="e.g., 5" />
            </div>
            <div>
              <Label>Default Trade / Specialty</Label>
              <Input value={form.default_trade || ""} onChange={e => setForm(f => ({ ...f, default_trade: e.target.value }))} placeholder="e.g., Concrete, Electrical" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description || ""} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Standard scope description" rows={3} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status || "active"} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingTask ? "Update Task" : "Create Task"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} task(s)?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. These tasks will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}