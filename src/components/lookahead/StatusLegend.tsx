import { Check, X, Circle, ArrowRight, Percent } from "lucide-react";
import { cn } from "@/lib/utils";

const legendItems = [
  { label: "Empty", icon: null, shortcut: "Del", colorClass: "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-muted-foreground border-dashed" },
  { label: "Planned", icon: Circle, shortcut: "P", colorClass: "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400" },
  { label: "In Progress", icon: ArrowRight, shortcut: "I", colorClass: "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400" },
  { label: "Complete", icon: Check, shortcut: "Y", colorClass: "bg-emerald-100 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400" },
  { label: "Not Done", icon: X, shortcut: "N", colorClass: "bg-red-100 dark:bg-red-950 border-red-300 dark:border-red-800 text-red-500 dark:text-red-400" },
  { label: "50%", icon: Percent, shortcut: "5", colorClass: "bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800 text-yellow-600 dark:text-yellow-400" },
];

export function StatusLegend() {
  return (
    <div className="flex items-center gap-1">
      {legendItems.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium",
              item.colorClass
            )}
            title={`Key: ${item.shortcut}`}
          >
            {Icon && <Icon className="h-2.5 w-2.5" strokeWidth={2.5} />}
            <span>{item.label}</span>
            <kbd className="ml-0.5 text-[8px] opacity-50 font-mono">{item.shortcut}</kbd>
          </div>
        );
      })}
      <span className="text-[9px] text-muted-foreground ml-1">
        Click cells to cycle · Arrows to navigate
      </span>
    </div>
  );
}
