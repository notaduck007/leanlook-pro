import { cn } from "@/lib/utils";

export type DayStatus = "Y" | "N" | "50" | "planned" | "progress" | "";

const STATUS_CYCLE: DayStatus[] = ["", "planned", "Y", "N", "50", "progress"];

interface StatusCellProps {
  status: DayStatus;
  onChange: (status: DayStatus) => void;
  isWeekend?: boolean;
  readOnly?: boolean;
}

export function StatusCell({ status, onChange, isWeekend, readOnly }: StatusCellProps) {
  const handleClick = () => {
    if (readOnly) return;
    const idx = STATUS_CYCLE.indexOf(status);
    onChange(STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={readOnly}
      className={cn(
        "w-8 h-8 flex items-center justify-center rounded border text-xs font-bold transition-colors select-none",
        isWeekend && "bg-muted/50",
        !readOnly && "hover:bg-accent cursor-pointer",
        readOnly && "cursor-default",
        status === "Y" && "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700",
        status === "N" && "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700",
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
