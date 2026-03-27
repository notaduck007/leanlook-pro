import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

export type DayStatus = "Y" | "N" | "50" | "planned" | "progress" | "";

const STATUS_CYCLE: DayStatus[] = ["", "planned", "Y", "N", "50", "progress"];

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

const STATUS_INFO: Record<string, { label: string; emoji: string; colorClass: string }> = {
  Y: { label: "Complete (Y)", emoji: "🟢", colorClass: "text-green-600 dark:text-green-400" },
  N: { label: "Not Done (N)", emoji: "🔴", colorClass: "text-red-600 dark:text-red-400" },
  "50": { label: "50% Complete", emoji: "🟠", colorClass: "text-yellow-600 dark:text-yellow-400" },
  planned: { label: "Planned", emoji: "🟡", colorClass: "text-blue-600 dark:text-blue-400" },
  progress: { label: "In Progress", emoji: "🔵", colorClass: "text-orange-600 dark:text-orange-400" },
  "": { label: "No Status", emoji: "⬜", colorClass: "text-muted-foreground" },
};

function truncate(text: string, max: number) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "..." : text;
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

  const info = STATUS_INFO[status] || STATUS_INFO[""];

  // Calculate progress from statusPerDay
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
    ? "bg-green-500"
    : progressPct >= 50
    ? "bg-yellow-500"
    : "bg-red-500";

  const formattedDate = date ? (() => {
    try { return format(parseISO(date), "EEEE, MMMM d, yyyy"); } catch { return date; }
  })() : null;

  const button = (
    <button
      ref={refCallback}
      type="button"
      tabIndex={readOnly ? -1 : 0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={readOnly}
      className={cn(
        "w-10 h-10 md:w-8 md:h-8 min-w-[48px] min-h-[48px] md:min-w-0 md:min-h-0 flex items-center justify-center rounded-md border text-xs font-bold transition-all select-none",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
        "active:scale-90",
        isWeekend && "bg-muted/50",
        !readOnly && "hover:bg-accent cursor-pointer hover:shadow-sm",
        readOnly && "cursor-default",
        status === "Y" && "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700 shadow-green-200/50 dark:shadow-none",
        status === "N" && "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700 shadow-red-200/50 dark:shadow-none",
        status === "50" && "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700",
        status === "planned" && "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700",
        status === "progress" && "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700",
        !status && "border-border"
      )}
    >
      {status === "Y" && "✓"}
      {status === "N" && "✕"}
      {status === "50" && "%"}
      {status === "planned" && "○"}
      {status === "progress" && "→"}
    </button>
  );

  // If no tooltip data, render plain button
  if (!tooltipData && !date) return button;

  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        {button}
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8} className="max-w-[280px] p-0">
        <div className="p-2.5 space-y-1.5">
          {/* Date + Status */}
          {formattedDate && (
            <p className="text-[10px] text-muted-foreground">{formattedDate}</p>
          )}
          <div className="flex items-center gap-1.5">
            <span className="text-xs">{info.emoji}</span>
            <span className={cn("text-xs font-semibold", info.colorClass)}>
              {status ? info.label : "No status — click or press a key to set"}
            </span>
          </div>

          {/* Task context */}
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

          {/* Progress + percent/date */}
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
