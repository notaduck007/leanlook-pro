import { useEffect, useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Plus, Link as LinkIcon, X, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CONSTRAINT_TYPES, ProjectConstraint, needByUrgency, typeLabel } from "@/lib/constraints";
import { ConstraintDialog } from "@/components/project/ConstraintDialog";

interface RowConstraintsPopoverProps {
  projectId: string;
  lookaheadLineId: string;
  taskName: string;
  /** Open constraints already linked to this line */
  linked: ProjectConstraint[];
  /** All open project constraints (linked or not) for the link picker */
  projectOpen: ProjectConstraint[];
  onChanged: () => void;
  /** Disable mutations (read-only look-aheads) */
  readOnly?: boolean;
}

export function RowConstraintsPopover({
  projectId, lookaheadLineId, taskName, linked, projectOpen, onChanged, readOnly,
}: RowConstraintsPopoverProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showLink, setShowLink] = useState(false);

  const hasOpen = linked.length > 0;
  const linkable = useMemo(
    () => projectOpen.filter((c) => c.lookahead_line_id !== lookaheadLineId),
    [projectOpen, lookaheadLineId]
  );

  const link = async (constraintId: string) => {
    const { error } = await supabase
      .from("project_constraints")
      .update({ lookahead_line_id: lookaheadLineId, updated_at: new Date().toISOString() })
      .eq("id", constraintId);
    if (error) toast({ title: "Link failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Constraint linked" }); setShowLink(false); onChanged(); }
  };

  const unlink = async (constraintId: string) => {
    const { error } = await supabase
      .from("project_constraints")
      .update({ lookahead_line_id: null, updated_at: new Date().toISOString() })
      .eq("id", constraintId);
    if (error) toast({ title: "Unlink failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Constraint unlinked" }); onChanged(); }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={hasOpen ? `${linked.length} open constraint(s)` : "Add or link constraint"}
            title={hasOpen ? `${linked.length} open constraint(s)` : "Constraints"}
            className={cn(
              "p-1 rounded hover:bg-accent shrink-0 transition-colors",
              hasOpen
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground/50 hover:text-muted-foreground"
            )}
          >
            <AlertTriangle className={cn("h-3.5 w-3.5", hasOpen && "fill-amber-200 dark:fill-amber-900")} />
          </button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="start" sideOffset={4} className="w-[300px] p-3 space-y-2">
          <div>
            <p className="text-xs font-semibold">Linked open constraints</p>
            <p className="text-[10px] text-muted-foreground truncate">{taskName}</p>
          </div>
          {linked.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">None — this task is constraint-free.</p>
          ) : (
            <ul className="space-y-1.5">
              {linked.map((c) => {
                const urgency = needByUrgency(c.need_by_date, c.status);
                return (
                  <li key={c.id} className="flex items-start gap-2 text-xs border rounded p-2">
                    <AlertTriangle className={cn(
                      "h-3.5 w-3.5 mt-0.5 shrink-0",
                      urgency === "overdue" ? "text-red-500" : "text-amber-500"
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{typeLabel(c.type)}</span>
                        {c.need_by_date && (
                          <span className={cn(
                            "text-[10px]",
                            urgency === "overdue" ? "text-red-600 font-medium" : urgency === "soon" ? "text-amber-600 font-medium" : "text-muted-foreground"
                          )}>
                            need by {format(parseISO(c.need_by_date), "MMM d")}
                          </span>
                        )}
                      </div>
                      <p className="text-xs">{c.description}</p>
                      {c.owner_name && <p className="text-[10px] text-muted-foreground">Owner: {c.owner_name}</p>}
                    </div>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => unlink(c.id)}
                        className="p-0.5 text-muted-foreground hover:text-destructive"
                        title="Unlink from this task"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {!readOnly && (
            <div className="flex gap-1 pt-1 border-t">
              <Button size="sm" variant="ghost" className="flex-1 h-8 text-xs" onClick={() => { setOpen(false); setDialogOpen(true); }}>
                <Plus className="mr-1 h-3 w-3" /> Add new
              </Button>
              <Button size="sm" variant="ghost" className="flex-1 h-8 text-xs" onClick={() => setShowLink((s) => !s)}>
                <LinkIcon className="mr-1 h-3 w-3" /> Link existing
              </Button>
            </div>
          )}

          {showLink && !readOnly && (
            <div className="border rounded p-2 max-h-[180px] overflow-auto space-y-1">
              {linkable.length === 0 ? (
                <p className="text-xs text-muted-foreground">No other open constraints on this project.</p>
              ) : linkable.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => link(c.id)}
                  className="w-full text-left text-xs hover:bg-accent rounded p-1.5 flex items-start gap-1.5"
                >
                  <ExternalLink className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">{typeLabel(c.type)}</span>
                    {c.description}
                  </span>
                </button>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>

      <ConstraintDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        defaultLookaheadLineId={lookaheadLineId}
        onSaved={onChanged}
      />
    </>
  );
}