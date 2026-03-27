import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { DayStatus } from "./StatusCell";

interface StatusDetailPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  percentComplete: number;
  expectedCompletionDate: string | null;
  onPercentChange: (value: number) => void;
  onDateChange: (date: string | null) => void;
  children: React.ReactNode;
  status: DayStatus;
}

export function StatusDetailPopover({
  open,
  onOpenChange,
  percentComplete,
  expectedCompletionDate,
  onPercentChange,
  onDateChange,
  children,
  status,
}: StatusDetailPopoverProps) {
  const [localPercent, setLocalPercent] = useState(percentComplete);
  const [showCalendar, setShowCalendar] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalPercent(percentComplete);
    setShowCalendar(false);
  }, [percentComplete, open]);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onOpenChange]);

  const handlePercentBlur = () => {
    const clamped = Math.min(100, Math.max(0, localPercent));
    setLocalPercent(clamped);
    onPercentChange(clamped);
  };

  const statusLabel = (() => {
    switch (status) {
      case "N": return "Not Done";
      case "50": return "Partial";
      case "planned": return "Planned";
      case "progress": return "In Progress";
      default: return "";
    }
  })();

  return (
    <div ref={containerRef} className="relative inline-flex">
      {children}
      {open && (
        <div className="absolute left-full top-0 ml-1 z-50 rounded-lg border border-border bg-popover p-4 shadow-lg space-y-4 text-popover-foreground"
             style={{ width: showCalendar ? 'auto' : '13rem' }}>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            {statusLabel} Details
          </p>

          {/* Percent Complete */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">% Complete</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                value={localPercent}
                onChange={(e) => setLocalPercent(Number(e.target.value))}
                onBlur={handlePercentBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handlePercentBlur();
                    onOpenChange(false);
                  }
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-14 text-sm bg-background border border-border rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span className="text-xs text-muted-foreground">%</span>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-200"
                  style={{ width: `${localPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Expected Completion Date */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Expected Completion</label>
            {showCalendar ? (
              <div className="pt-1">
                <Calendar
                  mode="single"
                  selected={expectedCompletionDate ? parseISO(expectedCompletionDate) : undefined}
                  onSelect={(date) => {
                    onDateChange(date ? format(date, "yyyy-MM-dd") : null);
                    setShowCalendar(false);
                  }}
                  className={cn("p-2 pointer-events-auto rounded-md border border-border bg-background")}
                  initialFocus
                />
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start text-left font-normal text-xs h-8"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCalendar(true);
                }}
              >
                <CalendarIcon className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                {expectedCompletionDate
                  ? format(parseISO(expectedCompletionDate), "MMM d, yyyy")
                  : "Set date"}
              </Button>
            )}
            {expectedCompletionDate && !showCalendar && (
              <button
                className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onDateChange(null);
                  setShowCalendar(false);
                }}
              >
                Clear date
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
