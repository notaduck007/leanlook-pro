import { useState } from "react";
import { StatusCell, DayStatus } from "./StatusCell";
import { LookaheadLineData } from "./LookaheadRow";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

interface MobileTaskCardProps {
  line: LookaheadLineData;
  dates: string[];
  onStatusChange: (lineId: string, date: string, status: DayStatus) => void;
  onFieldChange: (lineId: string, field: string, value: string) => void;
  onDeleteLine?: (lineId: string) => void;
  onNameChange?: (lineId: string, newName: string) => void;
  readOnly?: boolean;
}

export function MobileTaskCard({
  line,
  dates,
  onStatusChange,
  onFieldChange,
  onDeleteLine,
  onNameChange,
  readOnly,
}: MobileTaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(line.task_name || line.custom_text || "");

  const handleNameSave = () => {
    setEditingName(false);
    if (nameValue !== (line.task_name || line.custom_text || "") && onNameChange) {
      onNameChange(line.id, nameValue);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {editingName && !readOnly ? (
            <input
              className="w-full text-sm font-medium bg-transparent border-0 border-b border-ring outline-none px-1 py-0.5"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={(e) => e.key === "Enter" && handleNameSave()}
              autoFocus
            />
          ) : (
            <p
              className={cn("text-sm font-medium truncate", !readOnly && "cursor-pointer")}
              onDoubleClick={() => {
                if (!readOnly) {
                  setNameValue(line.task_name || line.custom_text || "");
                  setEditingName(true);
                }
              }}
            >
              {line.task_name || line.custom_text || "—"}
            </p>
          )}
          {line.assigned_trade && (
            <p className="text-xs text-muted-foreground mt-0.5">{line.assigned_trade}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!readOnly && onDeleteLine && (
            <button
              onClick={() => onDeleteLine(line.id)}
              className="p-1.5 text-muted-foreground hover:text-destructive rounded hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Status cells - horizontally scrollable */}
      <div className="overflow-x-auto -mx-1 px-1 pb-1">
        <div className="flex gap-1 min-w-max">
          {dates.map((date) => {
            const d = parseISO(date);
            const isWeekend = [0, 6].includes(d.getDay());
            return (
              <div key={date} className="flex flex-col items-center gap-0.5">
                <span className="text-[9px] text-muted-foreground leading-none">
                  {format(d, "EEE")}
                </span>
                <span className="text-[9px] text-muted-foreground leading-none">
                  {format(d, "M/d")}
                </span>
                <StatusCell
                  status={(line.status_per_day[date] as DayStatus) || ""}
                  onChange={(s) => onStatusChange(line.id, date, s)}
                  isWeekend={isWeekend}
                  readOnly={readOnly}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Expandable details */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Details
      </button>

      {expanded && (
        <div className="space-y-2 pt-1">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Trade</label>
            {readOnly ? (
              <p className="text-xs">{line.assigned_trade || "—"}</p>
            ) : (
              <input
                className="w-full text-xs bg-transparent border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-ring"
                value={line.assigned_trade || ""}
                onChange={(e) => onFieldChange(line.id, "assigned_trade", e.target.value)}
                placeholder="Trade"
              />
            )}
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Notes</label>
            {readOnly ? (
              <p className="text-xs">{line.notes || "—"}</p>
            ) : (
              <input
                className="w-full text-xs bg-transparent border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-ring"
                value={line.notes || ""}
                onChange={(e) => onFieldChange(line.id, "notes", e.target.value)}
                placeholder="Notes"
              />
            )}
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Materials</label>
            {readOnly ? (
              <p className="text-xs">{line.materials_needed || "—"}</p>
            ) : (
              <input
                className="w-full text-xs bg-transparent border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-ring"
                value={line.materials_needed || ""}
                onChange={(e) => onFieldChange(line.id, "materials_needed", e.target.value)}
                placeholder="Materials"
              />
            )}
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Constraints</label>
            {readOnly ? (
              <p className="text-xs">{line.constraints || "—"}</p>
            ) : (
              <input
                className="w-full text-xs bg-transparent border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-ring"
                value={line.constraints || ""}
                onChange={(e) => onFieldChange(line.id, "constraints", e.target.value)}
                placeholder="Constraints"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
