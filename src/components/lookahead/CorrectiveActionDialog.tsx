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
import { VARIANCE_REASONS, VarianceReason } from "./VarianceReasonPopover";
import { CORRECTIVE_ACTION_STATUSES, CorrectiveAction, CorrectiveActionStatus } from "@/lib/correctiveActions";
import { Plus, X } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** When provided, also writes variance_reason/variance_note back to this lookahead line. */
  lookaheadLineId?: string | null;
  /** Prefill the variance reason (e.g. from the popover quick-select). */
  defaultReason?: VarianceReason;
  defaultNote?: string;
  /** Edit existing corrective action instead of creating */
  existing?: CorrectiveAction | null;
  onSaved?: () => void;
}

const MAX_WHYS = 5;

export function CorrectiveActionDialog({
  open,
  onOpenChange,
  projectId,
  lookaheadLineId,
  defaultReason,
  defaultNote,
  existing,
  onSaved,
}: Props) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [reason, setReason] = useState<string>("");
  const [whys, setWhys] = useState<string[]>([""]);
  const [rootCause, setRootCause] = useState("");
  const [action, setAction] = useState("");
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState("");
  const [status, setStatus] = useState<CorrectiveActionStatus>("open");

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setReason(existing.variance_reason || "");
      // Try to split a "Why?" block back out of root_cause for editing
      const rc = existing.root_cause || "";
      if (rc.startsWith("Why?")) {
        const parts = rc.split(/\n+/).map((l) => l.replace(/^Why\?\s*/, "").trim()).filter(Boolean);
        setWhys(parts.length ? parts : [""]);
        setRootCause("");
      } else {
        setWhys([""]);
        setRootCause(rc);
      }
      setAction(existing.action || "");
      setOwner(existing.owner_name || "");
      setDue(existing.due_date || "");
      setStatus((existing.status as CorrectiveActionStatus) || "open");
    } else {
      setReason((defaultReason as string) || "");
      setWhys([""]);
      setRootCause(defaultNote || "");
      setAction("");
      setOwner("");
      setDue("");
      setStatus("open");
    }
  }, [open, existing, defaultReason, defaultNote]);

  const updateWhy = (i: number, v: string) => setWhys((prev) => prev.map((w, idx) => (idx === i ? v : w)));
  const addWhy = () => setWhys((prev) => (prev.length >= MAX_WHYS ? prev : [...prev, ""]));
  const removeWhy = (i: number) => setWhys((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const handleSave = async () => {
    if (!action.trim()) {
      toast({ title: "Corrective action is required", variant: "destructive" });
      return;
    }
    if (!profile?.company_id) return;
    setSaving(true);

    // Compose root_cause: prefer the textarea; otherwise build a "Why?" block from the 5-Whys.
    const whyLines = whys.map((w) => w.trim()).filter(Boolean);
    const composedRC = rootCause.trim()
      ? rootCause.trim()
      : whyLines.length
        ? whyLines.map((w) => `Why? ${w}`).join("\n")
        : null;

    const wasDone = existing?.status === "done";
    const isDone = status === "done";

    if (existing) {
      const { error } = await supabase
        .from("corrective_actions")
        .update({
          variance_reason: reason || null,
          root_cause: composedRC,
          action: action.trim(),
          owner_name: owner.trim() || null,
          due_date: due || null,
          status,
          resolved_at: isDone ? (wasDone ? existing.resolved_at : new Date().toISOString()) : null,
        })
        .eq("id", existing.id);
      if (error) {
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("corrective_actions").insert({
        company_id: profile.company_id,
        project_id: projectId,
        lookahead_line_id: lookaheadLineId || null,
        variance_reason: reason || null,
        root_cause: composedRC,
        action: action.trim(),
        owner_name: owner.trim() || null,
        due_date: due || null,
        status,
        created_by: user?.id || null,
        resolved_at: isDone ? new Date().toISOString() : null,
      } as any);
      if (error) {
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    // Mirror variance_reason back to the lookahead line for PPC/Pareto consistency.
    if (lookaheadLineId && reason) {
      await supabase
        .from("lookahead_lines")
        .update({ variance_reason: reason } as any)
        .eq("id", lookaheadLineId);
    }

    toast({ title: existing ? "Corrective action updated" : "Corrective action saved" });
    setSaving(false);
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Corrective Action" : "Root Cause & Corrective Action"}</DialogTitle>
          <DialogDescription>
            Capture why the task didn't get done and the action to prevent it from happening again.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1 max-h-[65vh] overflow-y-auto pr-1">
          {/* Variance reason quick select */}
          <div className="space-y-1.5">
            <Label>Variance reason</Label>
            <Select value={reason || "__none__"} onValueChange={(v) => setReason(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {VARIANCE_REASONS.map((r) => (
                  <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 5 Whys */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>5 Whys (optional)</Label>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={addWhy} disabled={whys.length >= MAX_WHYS}>
                <Plus className="h-3 w-3 mr-1" /> Add Why
              </Button>
            </div>
            <div className="space-y-1.5">
              {whys.map((w, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground w-6">#{i + 1}</span>
                  <Input
                    value={w}
                    onChange={(e) => updateWhy(i, e.target.value)}
                    placeholder={`Why? ${i === 0 ? "What's the surface cause?" : "Dig deeper…"}`}
                    className="h-8 text-xs"
                  />
                  {whys.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeWhy(i)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Root cause */}
          <div className="space-y-1.5">
            <Label>Root cause summary (optional)</Label>
            <Textarea
              value={rootCause}
              onChange={(e) => setRootCause(e.target.value)}
              placeholder="If you skipped the Whys, briefly state the underlying cause."
              rows={2}
            />
          </div>

          {/* Corrective action */}
          <div className="space-y-1.5">
            <Label>Corrective action *</Label>
            <Textarea
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="What will we do so this doesn't repeat?"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Owner</Label>
              <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Who owns it" />
            </div>
            <div className="space-y-1.5">
              <Label>Due date</Label>
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as CorrectiveActionStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CORRECTIVE_ACTION_STATUSES.map((s) => (
                  <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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