import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONSTRAINT_TYPES, CONSTRAINT_STATUSES, ProjectConstraint } from "@/lib/constraints";

interface ConstraintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** When provided, edits this constraint instead of creating */
  constraint?: ProjectConstraint | null;
  /** Prefill a lookahead_line_id when creating */
  defaultLookaheadLineId?: string | null;
  /** Prefill a task_id when creating (master-schedule task linkage) */
  defaultTaskId?: string | null;
  onSaved?: () => void;
}

export function ConstraintDialog({ open, onOpenChange, projectId, constraint, defaultLookaheadLineId, defaultTaskId, onSaved }: ConstraintDialogProps) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState("other");
  const [description, setDescription] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [needBy, setNeedBy] = useState("");
  const [status, setStatus] = useState<"open" | "in_progress" | "closed">("open");

  useEffect(() => {
    if (!open) return;
    if (constraint) {
      setType(constraint.type || "other");
      setDescription(constraint.description || "");
      setOwnerName(constraint.owner_name || "");
      setNeedBy(constraint.need_by_date || "");
      setStatus((constraint.status as any) || "open");
    } else {
      setType("other");
      setDescription("");
      setOwnerName("");
      setNeedBy("");
      setStatus("open");
    }
  }, [open, constraint]);

  const handleSave = async () => {
    if (!description.trim()) {
      toast({ title: "Description is required", variant: "destructive" });
      return;
    }
    if (!profile?.company_id) return;
    setSaving(true);
    if (constraint) {
      const wasClosed = constraint.status === "closed";
      const isClosed = status === "closed";
      const { error } = await supabase
        .from("project_constraints")
        .update({
          type,
          description: description.trim(),
          owner_name: ownerName.trim() || null,
          need_by_date: needBy || null,
          status,
          resolved_at: isClosed ? (wasClosed ? constraint.resolved_at : new Date().toISOString()) : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", constraint.id);
      if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
      else toast({ title: "Constraint updated" });
    } else {
      const { error } = await supabase.from("project_constraints").insert({
        project_id: projectId,
        company_id: profile.company_id,
        type,
        description: description.trim(),
        owner_name: ownerName.trim() || null,
        need_by_date: needBy || null,
        status,
        created_by: user?.id || null,
        lookahead_line_id: defaultLookaheadLineId || null,
        task_id: defaultTaskId || null,
      });
      if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
      else toast({ title: "Constraint added" });
    }
    setSaving(false);
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{constraint ? "Edit Constraint" : "Add Constraint"}</DialogTitle>
          <DialogDescription>
            Track an open blocker (RFI, submittal, material, etc.) that must be cleared before the work can be committed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONSTRAINT_TYPES.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONSTRAINT_STATUSES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description *</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's blocking the work?" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Owner</Label>
              <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Who's responsible" />
            </div>
            <div className="space-y-1.5">
              <Label>Need by</Label>
              <Input type="date" value={needBy} onChange={(e) => setNeedBy(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}