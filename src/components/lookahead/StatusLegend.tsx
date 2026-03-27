import { DayStatus } from "./StatusCell";
import { cn } from "@/lib/utils";

const legendItems: { status: DayStatus; label: string; symbol: string; shortcut: string; colorClass: string }[] = [
  { status: "planned", label: "Planned", symbol: "○", shortcut: "P", colorClass: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700" },
  { status: "Y", label: "Complete", symbol: "✓", shortcut: "Y", colorClass: "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" },
  { status: "N", label: "Not Done", symbol: "✕", shortcut: "N", colorClass: "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700" },
  { status: "50", label: "Partial", symbol: "%", shortcut: "5", colorClass: "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700" },
  { status: "progress", label: "In Progress", symbol: "→", shortcut: "I", colorClass: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700" },
];

export function StatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {legendItems.map((item) => (
        <div
          key={item.status}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium",
            item.colorClass
          )}
          title={`Keyboard: ${item.shortcut}`}
        >
          <span className="font-bold text-xs">{item.symbol}</span>
          <span>{item.label}</span>
          <kbd className="ml-0.5 text-[9px] opacity-60 font-mono">{item.shortcut}</kbd>
        </div>
      ))}
      <span className="text-[10px] text-muted-foreground ml-1">
        Arrows to navigate · Del to clear
      </span>
    </div>
  );
}