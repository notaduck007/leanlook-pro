import { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  useEffect(() => {
    setLocalPercent(percentComplete);
  }, [percentComplete, open]);

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
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={4}
        className="w-56 p-3 space-y-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {statusLabel} Details
        </p>

        {/* Percent Complete */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">% Complete</label>
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
              }}
              className="w-16 text-sm bg-transparent border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <span className="text-xs text-muted-foreground">%</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${localPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Expected Completion Date */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Expected Completion</label>
          {showCalendar ? (
            <Calendar
              mode="single"
              selected={expectedCompletionDate ? parseISO(expectedCompletionDate) : undefined}
              onSelect={(date) => {
                onDateChange(date ? format(date, "yyyy-MM-dd") : null);
                setShowCalendar(false);
              }}
              className={cn("p-2 pointer-events-auto rounded border")}
              initialFocus
            />
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start text-left font-normal text-xs h-8"
              onClick={() => setShowCalendar(true)}
            >
              <CalendarIcon className="mr-1.5 h-3 w-3" />
              {expectedCompletionDate
                ? format(parseISO(expectedCompletionDate), "MMM d, yyyy")
                : "Set date"}
            </Button>
          )}
          {expectedCompletionDate && (
            <button
              className="text-[10px] text-muted-foreground hover:text-destructive"
              onClick={() => {
                onDateChange(null);
                setShowCalendar(false);
              }}
            >
              Clear date
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
