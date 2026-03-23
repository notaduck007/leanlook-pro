import { DayStatus } from "./StatusCell";

const legendItems: { status: DayStatus; label: string; symbol: string }[] = [
  { status: "Y", label: "Complete", symbol: "✓" },
  { status: "N", label: "Not Done", symbol: "✕" },
  { status: "50", label: "Partial", symbol: "%" },
  { status: "planned", label: "Planned", symbol: "○" },
  { status: "progress", label: "In Progress", symbol: "→" },
];

export function StatusLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {legendItems.map((item) => (
        <div key={item.status} className="flex items-center gap-1.5">
          <span className="font-bold">{item.symbol}</span>
          <span className="text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
