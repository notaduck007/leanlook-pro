import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { Check, X, Circle, ArrowRight, Percent } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

export type DayStatus = "Y" | "N" | "50" | "planned" | "progress" | "";

const STATUS_CYCLE: DayStatus[] = ["", "planned", "progress", "Y", "N", "50"];

const KEY_STATUS_MAP: Record<string, DayStatus> = {
  y: "Y",
  n: "N",
  p: "planned",
  "5": "50",
  i: "progress",
};

export interface StatusCellTooltipData {
  taskName: string;
  assignedTrade: string;
  notes: string;
  materialsNeeded: string;
  constraints: string;
  statusPerDay: Record<string, string>;
}

interface StatusCellProps {
  status: DayStatus;
  onChange: (status: DayStatus) => void;
  isWeekend?: boolean;
  readOnly?: boolean;
  cellKey?: string;
  onRegisterRef?: (key: string, el: HTMLButtonElement | null) => void;
  onNavigate?: (key: string, direction: "up" | "down" | "left" | "right") => void;
  percentComplete?: number;
  expectedDate?: string | null;
  date?: string;
  tooltipData?: StatusCellTooltipData;
}

const STATUS_META: Record<string, { label: string; colorClass: string }> = {
  Y: { label: "Complete", colorClass: "text-emerald-600 dark:text-emerald-400" },
  N: { label: "Not Completed", colorClass: "text-red-500 dark:text-red-400" },
  "50": { label: "50% Complete", colorClass: "text-yellow-600 dark:text-yellow-400" },
  planned: { label: "Planned", colorClass: "text-blue-500 dark:text-blue-400" },
  progress: { label: "In Progress", colorClass: "text-amber-500 dark:text-amber-400" },
  "": { label: "No status", colorClass: "text-muted-foreground" },
};

function truncate(text: string, max: number) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "..." : text;
}

function StatusIcon({ status }: { status: DayStatus }) {
  const iconClass = "h-3.5 w-3.5";
  switch (status) {
    case "Y": return <Check className={cn(iconClass, "text-emerald-600 dark:text-emerald-400")} strokeWidth={3} />;
    case "N": return <X className={cn(iconClass, "text-red-500 dark:text-red-400")} strokeWidth={3} />;
    case "50": return <Percent className={cn(iconClass, "text-yellow-600 dark:text-yellow-400")} strokeWidth={2.5} />;
    case "planned": return <Circle className={cn(iconClass, "text-blue-400 dark:text-blue-500")} strokeWidth={2} />;
    case "progress": return <ArrowRight className={cn(iconClass, "text-amber-500 dark:text-amber-400")} strokeWidth={2.5} />;
    default: return null;
  }
}

export function StatusCell({ status, onChange, isWeekend, readOnly, cellKey, onRegisterRef, onNavigate, percentComplete, expectedDate, date, tooltipData }: StatusCellProps) {
  const refCallback = useCallback(
    (el: HTMLButtonElement | null) => {
      if (cellKey && onRegisterRef) onRegisterRef(cellKey, el);
    },
    [cellKey, onRegisterRef]
  );

  const handleClick = () => {
    if (readOnly) return;
    const idx = STATUS_CYCLE.indexOf(status);
    onChange(STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (readOnly) return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      const dirMap: Record<string, "up" | "down" | "left" | "right"> = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
      };
      if (cellKey && onNavigate) onNavigate(cellKey, dirMap[e.key]);
      return;
    }
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      const idx = STATUS_CYCLE.indexOf(status);
      onChange(STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]);
      return;
    }
    const lower = e.key.toLowerCase();
    if (lower in KEY_STATUS_MAP) {
      e.preventDefault();
      onChange(KEY_STATUS_MAP[lower]);
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      onChange("");
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      (e.target as HTMLButtonElement).blur();
    }
  };

  const meta = STATUS_META[status] || STATUS_META[""];

  const progressStats = tooltipData?.statusPerDay ? (() => {
    const entries = Object.values(tooltipData.statusPerDay);
    const nonEmpty = entries.filter(s => s && s !== "");
    const complete = entries.filter(s => s === "Y");
    return { total: nonEmpty.length, complete: complete.length };
  })() : null;

  const progressPct = progressStats && progressStats.total > 0
    ? Math.round((progressStats.complete / progressStats.total) * 100)
    : 0;

  const progressBarColor = progressPct >= 80
    ? "bg-emerald-500"
    : progressPct >= 50
    ? "bg-yellow-500"
    : "bg-red-500";

  const formattedDate = date ? (() => {
    try { return format(parseISO(date), "EEEE, MMMM d, yyyy"); } catch { return date; }
  })() : null;

  const titleText = status ? meta.label : "No status — click to set";

  const button = (
    <button
      ref={refCallback}
      type="button"
      tabIndex={readOnly ? -1 : 0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={readOnly}
      title={titleText}
      className={cn(
        "w-9 h-9 flex items-center justify-center rounded-md text-xs font-bold select-none touch-manipulation",
        "transition-all duration-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
        "active:scale-95",
        !readOnly && "hover:scale-105 hover:shadow-sm cursor-pointer",
        readOnly && "cursor-default",
        // Empty
        !status && "bg-gray-50 dark:bg-gray-900 border border-dashed border-gray-200 dark:border-gray-700",
        // Planned
        status === "planned" && "bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800",
        // In Progress
        status === "progress" && "bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800",
        // Complete
        status === "Y" && "bg-emerald-100 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800",
        // Not Done
        status === "N" && "bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-800",
        // 50%
        status === "50" && "bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800",
        isWeekend && !status && "bg-gray-100/50 dark:bg-gray-800/30",
      )}
    >
      <StatusIcon status={status} />
    </button>
  );

  if (!tooltipData && !date) return button;

  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        {button}
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8} className="max-w-[280px] p-0">
        <div className="p-2.5 space-y-1.5">
          {formattedDate && (
            <p className="text-[10px] text-muted-foreground">{formattedDate}</p>
          )}
          <div className="flex items-center gap-1.5">
            <span className={cn("text-xs font-semibold", meta.colorClass)}>
              {status ? meta.label : "No status — click or press a key to set"}
            </span>
          </div>

          {tooltipData && (
            <div className="space-y-0.5 pt-1 border-t border-border/50">
              <p className="text-sm font-semibold truncate">{tooltipData.taskName}</p>
              <p className="text-xs text-muted-foreground">
                Trade: {tooltipData.assignedTrade || "Unassigned"}
              </p>
              <p className="text-xs text-muted-foreground">
                Notes: {tooltipData.notes ? truncate(tooltipData.notes, 80) : "No notes"}
              </p>
              {tooltipData.materialsNeeded && (
                <p className="text-xs text-muted-foreground">
                  Materials: {truncate(tooltipData.materialsNeeded, 60)}
                </p>
              )}
              {tooltipData.constraints && (
                <p className="text-xs text-muted-foreground">
                  Constraints: {truncate(tooltipData.constraints, 60)}
                </p>
              )}
            </div>
          )}

          <div className="space-y-1 pt-1 border-t border-border/50">
            {percentComplete !== undefined && percentComplete > 0 && (
              <p className="text-xs text-muted-foreground">{percentComplete}% complete</p>
            )}
            {expectedDate && (
              <p className="text-xs text-muted-foreground">
                Due: {(() => { try { return format(parseISO(expectedDate), "MMM d, yyyy"); } catch { return expectedDate; } })()}
              </p>
            )}
            {progressStats && progressStats.total > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">
                  {progressStats.complete} of {progressStats.total} planned days complete
                </p>
                <div className="h-1 rounded-full bg-muted overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", progressBarColor)} style={{ width: `${progressPct}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
