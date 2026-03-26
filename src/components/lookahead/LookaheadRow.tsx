import { useState } from "react";
import { StatusCell, DayStatus } from "./StatusCell";
import { ChevronDown, ChevronRight, Trash2, GripVertical, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ComparisonData, ComparisonIndicator } from "./WeekComparison";

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
  parent_line_id?: string | null;
}

interface LookaheadRowProps {
  line: LookaheadLineData;
  dates: string[];
  onStatusChange: (lineId: string, date: string, status: DayStatus) => void;
  onFieldChange: (lineId: string, field: string, value: string) => void;
  onDeleteLine?: (lineId: string) => void;
  onNameChange?: (lineId: string, newName: string) => void;
  onAddSubtask?: (parentLineId: string) => void;
  readOnly?: boolean;
  onRegisterRef?: (key: string, el: HTMLButtonElement | null) => void;
  onNavigate?: (key: string, direction: "up" | "down" | "left" | "right") => void;
  comparisonData?: ComparisonData | null;
}

export function LookaheadRow({ line, dates, onStatusChange, onFieldChange, onDeleteLine, onNameChange, onAddSubtask, readOnly, onRegisterRef, onNavigate, comparisonData }: LookaheadRowProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(line.task_name || line.custom_text || "");
  const depth = line.depth || 0;
  const isSubtask = !!line.parent_line_id;
  const hasChildren = (line.children?.length ?? 0) > 0;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: line.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleNameSave = () => {
    setEditingName(false);
    if (nameValue !== (line.task_name || line.custom_text || "") && onNameChange) {
      onNameChange(line.id, nameValue);
    }
  };

  const isNewTask = comparisonData && (() => {
    const key = line.task_id || line.custom_text || "";
    return key ? comparisonData.newLineKeys.has(key) : false;
  })();

  return (
    <>
      <tr
        ref={setNodeRef}
        style={style}
        className={cn(
          "border-b border-border hover:bg-muted/30 transition-colors group/row",
          line.is_parent && "bg-muted/20 font-medium",
          isSubtask && "bg-muted/10",
          isDragging && "bg-accent/40",
          isNewTask && "border-l-2 border-l-blue-500"
        )}
      >
        {/* Task Name */}
        <td className="py-1.5 px-2 sticky left-0 bg-card z-10 min-w-[200px] max-w-[280px]">
          <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 16}px` }}>
            {!readOnly && (
              <button {...attributes} {...listeners} className="p-0.5 cursor-grab hover:bg-accent rounded touch-none">
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
            {hasChildren && (
              <button onClick={() => setCollapsed(!collapsed)} className="p-0.5 hover:bg-accent rounded">
                {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            )}
            {isSubtask && <span className="text-muted-foreground text-xs mr-0.5">↳</span>}
            {editingName && !readOnly ? (
              <input
                className="flex-1 text-sm bg-transparent border-0 border-b border-ring outline-none px-1 py-0.5"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={handleNameSave}
                onKeyDown={(e) => e.key === "Enter" && handleNameSave()}
                autoFocus
              />
            ) : (
              <span
                className={cn(
                  "text-sm truncate",
                  !readOnly && "cursor-pointer hover:underline",
                  line.is_parent && "font-semibold",
                  isSubtask && "text-muted-foreground"
                )}
                onDoubleClick={() => { if (!readOnly) { setNameValue(line.task_name || line.custom_text || ""); setEditingName(true); } }}
                title="Double-click to edit"
              >
                {line.task_name || line.custom_text || "—"}
              </span>
            )}
            {comparisonData && (
              <ComparisonIndicator lineTaskId={line.task_id} lineCustomText={line.custom_text} comparisonData={comparisonData} />
            )}
            {/* Add subtask button - only for non-subtask rows */}
            {!readOnly && !isSubtask && onAddSubtask && (
              <button
                onClick={() => onAddSubtask(line.id)}
                className="p-0.5 text-muted-foreground hover:text-primary rounded hover:bg-accent transition-colors opacity-0 group-hover/row:opacity-100"
                title="Add subtask"
              >
                <Plus className="h-3 w-3" />
              </button>
            )}
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
          const cellKey = `${line.id}-${date}`;

          let cellBg = "";
          if (hasChildren && line.children) {
            // For parent rows, only aggregate actual work statuses (not planned)
            const workStatuses = line.children
              .map((c) => (c.status_per_day[date] as DayStatus) || "")
              .filter((s) => s === "Y" || s === "N" || s === "50" || s === "progress");
            if (workStatuses.length > 0) {
              const allY = workStatuses.every((s) => s === "Y");
              const anyN = workStatuses.some((s) => s === "N");
              if (allY) cellBg = "bg-success/10";
              else if (anyN) cellBg = "bg-destructive/10";
              else cellBg = "bg-warning/10";
            }
          } else {
            // For individual/subtask rows, only color for actual work statuses
            const status = (line.status_per_day[date] as DayStatus) || "";
            if (status === "Y") cellBg = "bg-success/10";
            else if (status === "N") cellBg = "bg-destructive/10";
            else if (status === "50" || status === "progress") cellBg = "bg-warning/10";
          }

          return (
            <td key={date} className={cn("py-1 px-0.5 text-center", cellBg)}>
              <StatusCell
                status={(line.status_per_day[date] as DayStatus) || ""}
                onChange={(s) => onStatusChange(line.id, date, s)}
                isWeekend={isWeekend}
                readOnly={readOnly}
                cellKey={cellKey}
                onRegisterRef={onRegisterRef}
                onNavigate={onNavigate}
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
          onNameChange={onNameChange}
          onAddSubtask={onAddSubtask}
          readOnly={readOnly}
          onRegisterRef={onRegisterRef}
          onNavigate={onNavigate}
          comparisonData={comparisonData}
        />
      ))}
    </>
  );
}
