import { useState } from "react";
import { StatusCell, DayStatus } from "./StatusCell";
import { ChevronDown, ChevronRight, Trash2, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface LookaheadLineData {
  id: string;
  task_id: string | null;
  custom_text: string | null;
  task_name: string;
  assigned_trade: string | null;
  materials_needed: string | null;
  constraints: string | null;
  notes: string | null;
  photos: string[];
  status_per_day: Record<string, DayStatus>;
  sort_order: number;
  is_parent?: boolean;
  depth?: number;
  children?: LookaheadLineData[];
}

interface LookaheadRowProps {
  line: LookaheadLineData;
  dates: string[];
  onStatusChange: (lineId: string, date: string, status: DayStatus) => void;
  onFieldChange: (lineId: string, field: string, value: string) => void;
  onDeleteLine?: (lineId: string) => void;
  onNameChange?: (lineId: string, newName: string) => void;
  readOnly?: boolean;
}

export function LookaheadRow({ line, dates, onStatusChange, onFieldChange, onDeleteLine, readOnly }: LookaheadRowProps) {
  const [collapsed, setCollapsed] = useState(false);
  const depth = line.depth || 0;

  return (
    <>
      <tr className={cn(
        "border-b border-border hover:bg-muted/30 transition-colors",
        line.is_parent && "bg-muted/20 font-medium"
      )}>
        {/* Task Name */}
        <td className="py-1.5 px-2 sticky left-0 bg-card z-10 min-w-[200px] max-w-[280px]">
          <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 16}px` }}>
            {line.is_parent && (
              <button onClick={() => setCollapsed(!collapsed)} className="p-0.5 hover:bg-accent rounded">
                {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            )}
            <span className="text-sm truncate">{line.task_name || line.custom_text || "—"}</span>
          </div>
        </td>

        {/* Trade */}
        <td className="py-1.5 px-1 min-w-[80px]">
          {readOnly ? (
            <span className="text-xs text-muted-foreground">{line.assigned_trade || ""}</span>
          ) : (
            <input
              className="w-full text-xs bg-transparent border-0 outline-none focus:ring-1 focus:ring-ring rounded px-1 py-0.5"
              value={line.assigned_trade || ""}
              onChange={(e) => onFieldChange(line.id, "assigned_trade", e.target.value)}
              placeholder="Trade"
            />
          )}
        </td>

        {/* Daily Status Cells */}
        {dates.map((date) => {
          const isWeekend = [0, 6].includes(new Date(date + "T00:00:00").getDay());
          return (
            <td key={date} className="py-1 px-0.5 text-center">
              <StatusCell
                status={(line.status_per_day[date] as DayStatus) || ""}
                onChange={(s) => onStatusChange(line.id, date, s)}
                isWeekend={isWeekend}
                readOnly={readOnly}
              />
            </td>
          );
        })}

        {/* Notes */}
        <td className="py-1.5 px-1 min-w-[120px]">
          {readOnly ? (
            <span className="text-xs text-muted-foreground">{line.notes || ""}</span>
          ) : (
            <input
              className="w-full text-xs bg-transparent border-0 outline-none focus:ring-1 focus:ring-ring rounded px-1 py-0.5"
              value={line.notes || ""}
              onChange={(e) => onFieldChange(line.id, "notes", e.target.value)}
              placeholder="Notes"
            />
          )}
        </td>

        {/* Materials */}
        <td className="py-1.5 px-1 min-w-[100px]">
          {readOnly ? (
            <span className="text-xs text-muted-foreground">{line.materials_needed || ""}</span>
          ) : (
            <input
              className="w-full text-xs bg-transparent border-0 outline-none focus:ring-1 focus:ring-ring rounded px-1 py-0.5"
              value={line.materials_needed || ""}
              onChange={(e) => onFieldChange(line.id, "materials_needed", e.target.value)}
              placeholder="Materials"
            />
          )}
        </td>

        {/* Constraints */}
        <td className="py-1.5 px-1 min-w-[100px]">
          {readOnly ? (
            <span className="text-xs text-muted-foreground">{line.constraints || ""}</span>
          ) : (
            <input
              className="w-full text-xs bg-transparent border-0 outline-none focus:ring-1 focus:ring-ring rounded px-1 py-0.5"
              value={line.constraints || ""}
              onChange={(e) => onFieldChange(line.id, "constraints", e.target.value)}
              placeholder="Constraints"
            />
          )}
        </td>

        {/* Delete */}
        {!readOnly && onDeleteLine && (
          <td className="py-1.5 px-1 w-8">
            <button
              onClick={() => onDeleteLine(line.id)}
              className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-destructive/10 transition-colors"
              title="Delete row"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </td>
        )}
      </tr>

      {!collapsed && line.children?.map((child) => (
        <LookaheadRow
          key={child.id}
          line={child}
          dates={dates}
          onStatusChange={onStatusChange}
          onFieldChange={onFieldChange}
          onDeleteLine={onDeleteLine}
          readOnly={readOnly}
        />
      ))}
    </>
  );
}
