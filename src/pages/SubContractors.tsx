import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus, Search, Trash2, Download, Upload, AlertTriangle, ChevronUp, ChevronDown,
  Pencil,
} from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";

type SubStatus = "active" | "inactive" | "suspended" | "pending";

interface Subcontractor {
  id: string;
  company_id: string;
  company_name: string;
  trade: string;
  contact_name: string;
  phone: string;
  email: string | null;
  address: string | null;
  license_number: string | null;
  insurance_expiration: string | null;
  status: SubStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const statusColors: Record<SubStatus, string> = {
  active: "bg-success/15 text-success border-success/30",
  inactive: "bg-muted text-muted-foreground border-border",
  suspended: "bg-destructive/15 text-destructive border-destructive/30",
  pending: "bg-warning/15 text-warning border-warning/30",
};

const emptyForm: Partial<Subcontractor> = {
  company_name: "", trade: "", contact_name: "", phone: "",
  email: "", address: "", license_number: "", insurance_expiration: null,
  status: "active", notes: "",
};

type SortKey = keyof Subcontractor;

export default function SubContractors() {
  const { profile } = useAuth();
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("company_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subcontractor | null>(null);
  const [form, setForm] = useState<Partial<Subcontractor>>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<SubStatus | "all">("all");
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const [errors, setErrors] = useState<Record<string, string>>({});

  const companyId = profile?.company_id;

  const fetchSubs = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("subcontractors")
      .select("*")
      .eq("company_id", companyId)
      .order("company_name");
    if (data) setSubs(data as unknown as Subcontractor[]);
    if (error) toast({ title: "Error loading subcontractors", description: error.message, variant: "destructive" });
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  // Realtime removed: subcontractors PII no longer broadcast via realtime publication.
  // Page relies on explicit refetch after save/delete actions.

  const filtered = useMemo(() => {
    let list = subs;
    if (statusFilter !== "all") list = list.filter((s) => s.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) =>
        s.company_name.toLowerCase().includes(q) ||
        s.trade.toLowerCase().includes(q) ||
        s.contact_name.toLowerCase().includes(q) ||
        (s.email && s.email.toLowerCase().includes(q)) ||
        (s.phone && s.phone.includes(q))
      );
    }
    list = [...list].sort((a, b) => {
      const aVal = (a[sortKey] ?? "") as string;
      const bVal = (b[sortKey] ?? "") as string;
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [subs, search, sortKey, sortDir, statusFilter]);

  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3 inline ml-0.5" /> : <ChevronDown className="h-3 w-3 inline ml-0.5" />;
  };

  const openAdd = () => { setEditingSub(null); setForm({ ...emptyForm }); setSheetOpen(true); };
  const openEdit = (sub: Subcontractor) => { setEditingSub(sub); setForm({ ...sub }); setErrors({}); setSheetOpen(true); };

  const handleSave = async () => {
    if (!companyId) return;
    const errs: Record<string, string> = {};
    if (!form.company_name?.trim()) errs.company_name = "Company name is required";
    if (!form.trade?.trim()) errs.trade = "Trade is required";
    if (!form.contact_name?.trim()) errs.contact_name = "Contact name is required";
    if (!form.phone?.trim()) errs.phone = "Phone is required";
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast({ title: "Please fix the highlighted fields", variant: "destructive" });
      return;
    }
    setSaving(true);
    if (editingSub) {
      const { error } = await supabase
        .from("subcontractors")
        .update({
          company_name: form.company_name!,
          trade: form.trade!,
          contact_name: form.contact_name!,
          phone: form.phone!,
          email: form.email || null,
          address: form.address || null,
          license_number: form.license_number || null,
          insurance_expiration: form.insurance_expiration || null,
          status: form.status as SubStatus,
          notes: form.notes || null,
        })
        .eq("id", editingSub.id);
      if (error) toast({ title: "Error updating", description: error.message, variant: "destructive" });
      else { toast({ title: "Subcontractor updated" }); setSheetOpen(false); }
    } else {
      const { error } = await supabase.from("subcontractors").insert({
        company_id: companyId,
        company_name: form.company_name!,
        trade: form.trade!,
        contact_name: form.contact_name!,
        phone: form.phone!,
        email: form.email || null,
        address: form.address || null,
        license_number: form.license_number || null,
        insurance_expiration: form.insurance_expiration || null,
        status: (form.status as SubStatus) || "active",
        notes: form.notes || null,
      });
      if (error) toast({ title: "Error creating", description: error.message, variant: "destructive" });
      else { toast({ title: "Subcontractor created" }); setSheetOpen(false); }
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    const { error } = await supabase.from("subcontractors").delete().in("id", ids);
    if (error) toast({ title: "Error deleting", description: error.message, variant: "destructive" });
    else { toast({ title: `${ids.length} record(s) deleted` }); setSelected(new Set()); }
    setDeleteOpen(false);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === paged.length) setSelected(new Set());
    else setSelected(new Set(paged.map((s) => s.id)));
  };

  const exportCSV = () => {
    const rows = (selected.size > 0 ? subs.filter((s) => selected.has(s.id)) : filtered);
    const headers = ["Company Name", "Trade", "Contact", "Phone", "Email", "Status", "License #", "Insurance Exp"];
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        [r.company_name, r.trade, r.contact_name, r.phone, r.email || "", r.status, r.license_number || "", r.insurance_expiration || ""]
          .map((v) => `"${v.replace(/"/g, '""')}"`)
          .join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "subcontractors.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const insuranceWarning = (dateStr: string | null) => {
    if (!dateStr) return null;
    const days = differenceInDays(parseISO(dateStr), new Date());
    if (days < 0) return "expired";
    if (days <= 30) return "expiring";
    return null;
  };

  const FormField = ({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) => (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sub Contractors</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} records</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" /> Add Subcontractor
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, trade, contact..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-8 h-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as SubStatus | "all"); setPage(0); }}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{selected.size} selected</span>
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (<Skeleton key={i} className="h-10 w-full" />))}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-10">
                  <Checkbox checked={paged.length > 0 && selected.size === paged.length} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("company_name")}>
                  Company Name <SortIcon col="company_name" />
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("trade")}>
                  Trade <SortIcon col="trade" />
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("contact_name")}>
                  Contact <SortIcon col="contact_name" />
                </TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("status")}>
                  Status <SortIcon col="status" />
                </TableHead>
                <TableHead>Insurance Exp.</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    No subcontractors found. Click "+ Add Subcontractor" to get started.
                  </TableCell>
                </TableRow>
              ) : (
                paged.map((sub, i) => {
                  const insWarn = insuranceWarning(sub.insurance_expiration);
                  return (
                    <TableRow
                      key={sub.id}
                      className={`cursor-pointer hover:bg-muted/40 ${i % 2 === 1 ? "bg-muted/10" : ""} ${selected.has(sub.id) ? "bg-primary/5" : ""}`}
                      onDoubleClick={() => openEdit(sub)}
                    >
                      <TableCell>
                        <Checkbox checked={selected.has(sub.id)} onCheckedChange={() => toggleSelect(sub.id)} />
                      </TableCell>
                      <TableCell className="font-medium">{sub.company_name}</TableCell>
                      <TableCell>{sub.trade}</TableCell>
                      <TableCell>{sub.contact_name}</TableCell>
                      <TableCell className="text-sm">{sub.phone}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{sub.email || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[sub.status]}>
                          {sub.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-sm">
                          {sub.insurance_expiration ? format(parseISO(sub.insurance_expiration), "MM/dd/yyyy") : "—"}
                          {insWarn && (
                            <AlertTriangle className={`h-3.5 w-3.5 ${insWarn === "expired" ? "text-destructive" : "text-warning"}`} />
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(sub)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length}
          </p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Add/Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingSub ? "Edit Subcontractor" : "Add Subcontractor"}</SheetTitle>
            <SheetDescription>
              {editingSub ? "Update this subcontractor's information." : "Add a new subcontractor to your master database."}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <FormField label="Company Name" required error={errors.company_name}>
              <Input className={errors.company_name ? "border-destructive" : ""} value={form.company_name || ""} onChange={(e) => { setForm({ ...form, company_name: e.target.value }); if (errors.company_name) setErrors({ ...errors, company_name: "" }); }} />
            </FormField>
            <FormField label="Trade / Specialty" required error={errors.trade}>
              <Input className={errors.trade ? "border-destructive" : ""} value={form.trade || ""} onChange={(e) => { setForm({ ...form, trade: e.target.value }); if (errors.trade) setErrors({ ...errors, trade: "" }); }} placeholder="e.g., Electrical, Plumbing" />
            </FormField>
            <FormField label="Primary Contact Name" required error={errors.contact_name}>
              <Input className={errors.contact_name ? "border-destructive" : ""} value={form.contact_name || ""} onChange={(e) => { setForm({ ...form, contact_name: e.target.value }); if (errors.contact_name) setErrors({ ...errors, contact_name: "" }); }} />
            </FormField>
            <FormField label="Phone" required error={errors.phone}>
              <Input className={errors.phone ? "border-destructive" : ""} value={form.phone || ""} onChange={(e) => { setForm({ ...form, phone: e.target.value }); if (errors.phone) setErrors({ ...errors, phone: "" }); }} placeholder="(xxx) xxx-xxxx" />
            </FormField>
            <FormField label="Email">
              <Input type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </FormField>
            <FormField label="Address">
              <Input value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </FormField>
            <FormField label="License Number">
              <Input value={form.license_number || ""} onChange={(e) => setForm({ ...form, license_number: e.target.value })} />
            </FormField>
            <FormField label="Insurance Expiration">
              <Input type="date" value={form.insurance_expiration || ""} onChange={(e) => setForm({ ...form, insurance_expiration: e.target.value || null })} />
            </FormField>
            <FormField label="Status" required>
              <Select value={form.status || "active"} onValueChange={(v) => setForm({ ...form, status: v as SubStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Notes">
              <Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
            </FormField>
          </div>
          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} record(s)?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
