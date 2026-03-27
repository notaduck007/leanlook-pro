import { useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

export type DayStatus = "Y" | "N" | "50" | "planned" | "progress" | "";

const STATUS_CYCLE: DayStatus[] = ["", "planned", "Y", "N", "50", "progress"];

const KEY_STATUS_MAP: Record<string, DayStatus> = {
  y: "Y",
  n: "N",
  p: "planned",
  "5": "50",
  i: "progress",
};

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
}

export function StatusCell({ status, onChange, isWeekend, readOnly, cellKey, onRegisterRef, onNavigate }: StatusCellProps) {
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

    // Arrow navigation
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      const dirMap: Record<string, "up" | "down" | "left" | "right"> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
      };
      if (cellKey && onNavigate) onNavigate(cellKey, dirMap[e.key]);
      return;
    }

    // Space/Enter cycle
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      const idx = STATUS_CYCLE.indexOf(status);
      onChange(STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]);
      return;
    }

    // Direct status keys
    const lower = e.key.toLowerCase();
    if (lower in KEY_STATUS_MAP) {
      e.preventDefault();
      onChange(KEY_STATUS_MAP[lower]);
      return;
    }

    // Clear
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      onChange("");
      return;
    }

    // Escape
    if (e.key === "Escape") {
      e.preventDefault();
      (e.target as HTMLButtonElement).blur();
    }
  };

  return (
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
}
