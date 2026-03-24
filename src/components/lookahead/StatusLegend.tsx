import { DayStatus } from "./StatusCell";
import { Keyboard } from "lucide-react";

const legendItems: { status: DayStatus; label: string; symbol: string }[] = [
  { status: "Y", label: "Complete", symbol: "✓" },
  { status: "N", label: "Not Done", symbol: "✕" },
  { status: "50", label: "Partial", symbol: "%" },
  { status: "planned", label: "Planned", symbol: "○" },
  { status: "progress", label: "In Progress", symbol: "→" },
];

export function StatusLegend() {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-3 text-xs">
        {legendItems.map((item) => (
          <div key={item.status} className="flex items-center gap-1.5">
            <span className="font-bold">{item.symbol}</span>
            <span className="text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Keyboard className="h-3 w-3" />
        <span>Y=Complete · N=Not Done · P=Planned · 5=50% · I=In Progress · Del=Clear · Arrows=Navigate</span>
      </div>
    </div>
  );
}
