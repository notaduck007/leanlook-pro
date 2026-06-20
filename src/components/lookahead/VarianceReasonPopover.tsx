import { useState } from "react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CorrectiveActionDialog } from "./CorrectiveActionDialog";
import { Lightbulb } from "lucide-react";

export type VarianceReason =
  | "make_ready"
  | "manpower"
  | "material_equipment"
  | "design"
  | "weather"
  | "ahj"
  | "other"
  | null;

export const VARIANCE_REASONS: {
  key: VarianceReason & string;
  label: string;
  color: string;
}[] = [
  { key: "make_ready", label: "Make Ready", color: "bg-blue-500" },
  { key: "manpower", label: "Manpower", color: "bg-purple-500" },
  { key: "material_equipment", label: "Material / Equipment", color: "bg-orange-500" },
  { key: "design", label: "Design", color: "bg-pink-500" },
  { key: "weather", label: "Weather", color: "bg-cyan-500" },
  { key: "ahj", label: "AHJ", color: "bg-red-500" },
  { key: "other", label: "Other", color: "bg-gray-500" },
];

interface VarianceReasonPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (reason: VarianceReason, note: string) => void;
  children: React.ReactNode;
  /** Show a "5-Whys & corrective action…" link when provided. */
  projectId?: string;
  lookaheadLineId?: string;
}

export function VarianceReasonPopover({
  open,
  onOpenChange,
  onSelect,
  children,
  projectId,
  lookaheadLineId,
}: VarianceReasonPopoverProps) {
  const [note, setNote] = useState("");
  const [selectedReason, setSelectedReason] = useState<VarianceReason>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleSelect = (reason: VarianceReason & string) => {
    onSelect(reason, note);
    setNote("");
    onOpenChange(false);
  };

  return (
    <>
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={4}
        className="w-[220px] p-2"
      >
        <p className="text-[10px] font-medium text-muted-foreground mb-1.5 px-1">
          Why wasn't this completed?
        </p>
        <div className="space-y-0.5">
          {VARIANCE_REASONS.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => handleSelect(r.key)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-accent transition-colors text-left"
            >
              <span className={cn("w-2 h-2 rounded-full shrink-0", r.color)} />
              {r.label}
            </button>
          ))}
        </div>
        <div className="mt-2 px-1">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Brief note (optional)"
            className="h-7 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter" && note) {
                onSelect("other", note);
                setNote("");
                onOpenChange(false);
              }
            }}
          />
        </div>
        {projectId && (
          <button
            type="button"
            onClick={() => {
              setDialogOpen(true);
              onOpenChange(false);
            }}
            className="mt-2 w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] text-primary hover:bg-accent transition-colors border-t border-border/60 -mx-2 -mb-2 pt-2 mt-2 pl-3"
          >
            <Lightbulb className="h-3 w-3" />
            5-Whys & corrective action…
          </button>
        )}
      </PopoverContent>
    </Popover>
    {projectId && (
      <CorrectiveActionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        lookaheadLineId={lookaheadLineId || null}
        defaultReason={selectedReason}
        defaultNote={note}
      />
    )}
    </>
  );
}

/** Returns the dot color class for a variance reason */
export function getVarianceDotColor(reason: VarianceReason): string {
  if (!reason) return "";
  const found = VARIANCE_REASONS.find((r) => r.key === reason);
  return found?.color || "bg-gray-500";
}
