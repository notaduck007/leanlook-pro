import { useMemo } from "react";
import { format, parseISO, differenceInDays, min, max } from "date-fns";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

interface Task {
  id: string;
  name: string;
  start_date: string | null;
  finish_date: string | null;
  percent_complete: number | null;
  tags: string[] | null;
}

interface GanttChartProps {
  tasks: Task[];
}

export function GanttChart({ tasks }: GanttChartProps) {
  const validTasks = useMemo(
    () => tasks.filter((t) => t.start_date && t.finish_date),
    [tasks]
  );

  const { minDate, maxDate, totalDays } = useMemo(() => {
    if (!validTasks.length) return { minDate: new Date(), maxDate: new Date(), totalDays: 1 };
    const starts = validTasks.map((t) => parseISO(t.start_date!));
    const ends = validTasks.map((t) => parseISO(t.finish_date!));
    const mn = min(starts);
    const mx = max(ends);
    return { minDate: mn, maxDate: mx, totalDays: Math.max(differenceInDays(mx, mn) + 1, 1) };
  }, [validTasks]);

  if (!validTasks.length) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        No tasks with dates to display.
      </div>
    );
  }

  const dayWidth = 28;
  const chartWidth = totalDays * dayWidth;
  const rowHeight = 32;

  // Generate month headers
  const months: { label: string; startCol: number; span: number }[] = [];
  let currentMonth = "";
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(minDate);
    d.setDate(d.getDate() + i);
    const m = format(d, "MMM yyyy");
    if (m !== currentMonth) {
      months.push({ label: m, startCol: i, span: 1 });
      currentMonth = m;
    } else {
      months[months.length - 1].span++;
    }
  }

  return (
    <ScrollArea className="w-full">
      <div className="flex">
        {/* Task names column */}
        <div className="shrink-0 w-[200px] border-r bg-card z-10">
          <div className="h-10 border-b flex items-center px-3 text-xs font-medium text-muted-foreground bg-muted/50">
            Task
          </div>
          {validTasks.slice(0, 30).map((task) => (
            <div
              key={task.id}
              className="flex items-center px-3 border-b text-xs truncate"
              style={{ height: rowHeight }}
            >
              {task.name}
            </div>
          ))}
        </div>

        {/* Chart area */}
        <div style={{ width: chartWidth, minWidth: chartWidth }}>
          {/* Month headers */}
          <div className="flex h-10 border-b bg-muted/50">
            {months.map((m) => (
              <div
                key={m.label}
                className="border-r flex items-center justify-center text-[10px] font-medium text-muted-foreground"
                style={{ width: m.span * dayWidth }}
              >
                {m.label}
              </div>
            ))}
          </div>

          {/* Bars */}
          {validTasks.slice(0, 30).map((task) => {
            const startOffset = differenceInDays(parseISO(task.start_date!), minDate);
            const duration = differenceInDays(parseISO(task.finish_date!), parseISO(task.start_date!)) + 1;
            const pct = task.percent_complete || 0;

            return (
              <div
                key={task.id}
                className="relative border-b"
                style={{ height: rowHeight }}
              >
                {/* Background bar */}
                <div
                  className="absolute top-1.5 rounded-sm bg-primary/20"
                  style={{
                    left: startOffset * dayWidth,
                    width: duration * dayWidth - 2,
                    height: rowHeight - 12,
                  }}
                >
                  {/* Progress fill */}
                  <div
                    className="h-full rounded-sm bg-primary/60"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
