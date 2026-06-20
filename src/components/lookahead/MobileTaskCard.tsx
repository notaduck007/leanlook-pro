import { useState } from "react";
import { DayStatus } from "./StatusCell";
import { LookaheadLineData } from "./LookaheadRow";
import { ChevronDown, ChevronRight, Trash2, Check, X, Circle, ArrowRight, Percent, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { VarianceReasonPopover, VARIANCE_REASONS, getVarianceDotColor, VarianceReason } from "./VarianceReasonPopover";

interface MobileTaskCardProps {
  line: LookaheadLineData;
  dates: string[];
  selectedDate?: string;
  onStatusChange: (lineId: string, date: string, status: DayStatus) => void;
  onFieldChange: (lineId: string, field: string, value: string) => void;
  onVarianceChange?: (lineId: string, reason: string | null, note: string | null) => void;
  onDeleteLine?: (lineId: string) => void;
  onNameChange?: (lineId: string, newName: string) => void;
  readOnly?: boolean;
}

const STATUS_CYCLE: DayStatus[] = ["", "planned", "progress", "Y", "N", "50"];

const STATUS_INFO: Record<string, { label: string; tone: string; ring: string; Icon: any }> = {
  "":         { label: "Tap to set",   tone: "bg-muted text-muted-foreground border-dashed", ring: "border-border", Icon: Circle },
  planned:    { label: "Planned",      tone: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300", ring: "border-blue-300 dark:border-blue-800", Icon: Circle },
  progress:   { label: "In Progress",  tone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", ring: "border-amber-300 dark:border-amber-800", Icon: ArrowRight },
  Y:          { label: "Complete",     tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", ring: "border-emerald-300 dark:border-emerald-800", Icon: Check },
  N:          { label: "Not Done",     tone: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300", ring: "border-red-300 dark:border-red-800", Icon: X },
  "50":       { label: "50%",          tone: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300", ring: "border-yellow-300 dark:border-yellow-800", Icon: Percent },
};

export function MobileTaskCard({
  line,
  dates,
  selectedDate,
  onStatusChange,
  onFieldChange,
  onVarianceChange,
  onDeleteLine,
  onNameChange,
  readOnly,
}: MobileTaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(line.task_name || line.custom_text || "");
  const [variancePopoverOpen, setVariancePopoverOpen] = useState(false);

  const handleNameSave = () => {
    setEditingName(false);
    if (nameValue !== (line.task_name || line.custom_text || "") && onNameChange) {
      onNameChange(line.id, nameValue);
    }
  };

  const currentStatus = (selectedDate ? (line.status_per_day[selectedDate] as DayStatus) || "" : "") as DayStatus;
  const cycleStatus = () => {
    if (readOnly || !selectedDate) return;
    const idx = STATUS_CYCLE.indexOf(currentStatus);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    onStatusChange(line.id, selectedDate, next);
    if (next === "N" && onVarianceChange) {
      setVariancePopoverOpen(true);
    }
  };
  const setStatus = (s: DayStatus) => {
    if (!selectedDate || readOnly) return;
    onStatusChange(line.id, selectedDate, s);
    if (s === "N" && onVarianceChange) setVariancePopoverOpen(true);
  };
  const info = STATUS_INFO[currentStatus] || STATUS_INFO[""];
  const StatusIcon = info.Icon;
  const varianceLabel = line.variance_reason
    ? VARIANCE_REASONS.find((r) => r.key === line.variance_reason)?.label ?? "Other"
    : null;

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {editingName && !readOnly ? (
            <input
              className="w-full text-base font-medium bg-transparent border-0 border-b border-ring outline-none px-1 py-1"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={(e) => e.key === "Enter" && handleNameSave()}
              autoFocus
            />
          ) : (
            <p
              className={cn("text-base font-medium leading-tight", !readOnly && "cursor-pointer")}
              onClick={() => {
                if (!readOnly) {
                  setNameValue(line.task_name || line.custom_text || "");
                  setEditingName(true);
                }
              }}
            >
              {line.task_name || line.custom_text || "—"}
            </p>
          )}
          {line.assigned_trade && (
            <p className="text-xs text-muted-foreground mt-0.5">{line.assigned_trade}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!readOnly && onDeleteLine && (
            <button
              onClick={() => onDeleteLine(line.id)}
              aria-label="Delete task"
              className="p-2 text-muted-foreground hover:text-destructive rounded hover:bg-destructive/10 min-h-11 min-w-11 flex items-center justify-center"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {selectedDate && (
        <>
          <button
            type="button"
            onClick={cycleStatus}
            disabled={readOnly}
            className={cn(
              "w-full flex items-center justify-center gap-2 rounded-md border px-3 py-3 text-sm font-semibold min-h-12 touch-manipulation transition-all active:scale-[0.99]",
              info.tone,
              info.ring,
              readOnly && "opacity-80"
            )}
          >
            <StatusIcon className="h-5 w-5" strokeWidth={2.5} />
            <span>{info.label}</span>
          </button>
          {!readOnly && (
            <div className="grid grid-cols-5 gap-1">
              {(["planned", "progress", "Y", "50", "N"] as DayStatus[]).map((s) => {
                const meta = STATUS_INFO[s];
                const Icon = meta.Icon;
                const active = s === currentStatus;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    aria-label={meta.label}
                    className={cn(
                      "flex flex-col items-center justify-center gap-0.5 rounded-md border px-1 py-2 min-h-11 text-[10px] font-medium touch-manipulation",
                      active ? `${meta.tone} ${meta.ring}` : "bg-card text-muted-foreground border-border hover:bg-accent"
                    )}
                  >
                    <Icon className="h-4 w-4" strokeWidth={2.5} />
                    <span>{meta.label}</span>
                  </button>
                );
              })}
            </div>
          )}
          {currentStatus === "N" && onVarianceChange && (
            <VarianceReasonPopover
              open={variancePopoverOpen}
              onOpenChange={setVariancePopoverOpen}
              onSelect={(reason, note) => onVarianceChange(line.id, reason, note || null)}
            >
              <button
                type="button"
                className="w-full flex items-center justify-between gap-2 rounded-md border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/30 px-3 py-2 text-xs"
              >
                <span className="flex items-center gap-2 text-red-700 dark:text-red-300">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Root cause:
                  {varianceLabel ? (
                    <span className="inline-flex items-center gap-1 font-medium">
                      <span className={cn("w-1.5 h-1.5 rounded-full", getVarianceDotColor(line.variance_reason as VarianceReason))} />
                      {varianceLabel}
                    </span>
                  ) : (
                    <span className="font-medium underline">Tap to set</span>
                  )}
                </span>
                {line.variance_note && (
                  <span className="truncate text-muted-foreground">{line.variance_note}</span>
                )}
              </button>
            </VarianceReasonPopover>
          )}
        </>
      )}

      {/* Expandable details */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full pt-1"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Details{line.notes || line.constraints || line.materials_needed ? " • set" : ""}
      </button>

      {expanded && (
        <div className="space-y-2 pt-1">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Trade</label>
            {readOnly ? (
              <p className="text-xs">{line.assigned_trade || "—"}</p>
            ) : (
              <input
                className="w-full text-sm bg-transparent border rounded px-2 py-2 outline-none focus:ring-1 focus:ring-ring"
                value={line.assigned_trade || ""}
                onChange={(e) => onFieldChange(line.id, "assigned_trade", e.target.value)}
                placeholder="Trade"
              />
            )}
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Notes</label>
            {readOnly ? (
              <p className="text-xs">{line.notes || "—"}</p>
            ) : (
              <textarea
                className="w-full text-sm bg-transparent border rounded px-2 py-2 outline-none focus:ring-1 focus:ring-ring min-h-[60px]"
                value={line.notes || ""}
                onChange={(e) => onFieldChange(line.id, "notes", e.target.value)}
                placeholder="Notes"
              />
            )}
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Materials</label>
            {readOnly ? (
              <p className="text-xs">{line.materials_needed || "—"}</p>
            ) : (
              <input
                className="w-full text-sm bg-transparent border rounded px-2 py-2 outline-none focus:ring-1 focus:ring-ring"
                value={line.materials_needed || ""}
                onChange={(e) => onFieldChange(line.id, "materials_needed", e.target.value)}
                placeholder="Materials"
              />
            )}
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Constraints</label>
            {readOnly ? (
              <p className="text-xs">{line.constraints || "—"}</p>
            ) : (
              <textarea
                className="w-full text-sm bg-transparent border rounded px-2 py-2 outline-none focus:ring-1 focus:ring-ring min-h-[60px]"
                value={line.constraints || ""}
                onChange={(e) => onFieldChange(line.id, "constraints", e.target.value)}
                placeholder="Constraints"
              />
            )}
          </div>
          {!readOnly && onVarianceChange && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Root cause (for variances)</label>
              <VarianceReasonPopover
                open={false}
                onOpenChange={() => {}}
                onSelect={(reason, note) => onVarianceChange(line.id, reason, note || null)}
              >
                <button type="button" className="w-full flex items-center gap-2 text-sm border rounded px-2 py-2 mt-0.5">
                  {varianceLabel ? (
                    <>
                      <span className={cn("w-2 h-2 rounded-full", getVarianceDotColor(line.variance_reason as VarianceReason))} />
                      <span>{varianceLabel}</span>
                      {line.variance_note && <span className="text-muted-foreground truncate">— {line.variance_note}</span>}
                    </>
                  ) : (
                    <span className="text-muted-foreground">No root cause</span>
                  )}
                </button>
              </VarianceReasonPopover>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
