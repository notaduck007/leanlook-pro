import React, { useState, useMemo } from "react";
import { StatusCell, DayStatus } from "./StatusCell";
import { ChevronDown, ChevronRight, Trash2, GripVertical, Plus, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { SubContractorAutocomplete } from "@/components/subcontractors/SubContractorAutocomplete";
import { MasterAutocomplete, AutocompleteItem } from "@/components/shared/MasterAutocomplete";
import { MasterTaskRecord } from "@/hooks/useMasterTasks";
import { supabase } from "@/integrations/supabase/client";

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
  hidden?: boolean;
}

interface LookaheadRowProps {
  line: LookaheadLineData;
  dates: string[];
  onStatusChange: (lineId: string, date: string, status: DayStatus) => void;
  onFieldChange: (lineId: string, field: string, value: string) => void;
  onDeleteLine?: (lineId: string) => void;
  onNameChange?: (lineId: string, newName: string) => void;
  onAddSubtask?: (parentLineId: string) => void;
  onToggleHidden?: (lineId: string, hidden: boolean) => void;
  readOnly?: boolean;
  onRegisterRef?: (key: string, el: HTMLButtonElement | null) => void;
  onNavigate?: (key: string, direction: "up" | "down" | "left" | "right") => void;
  
  masterTasks?: MasterTaskRecord[];
  showHidden?: boolean;
}

export function LookaheadRow({ line, dates, onStatusChange, onFieldChange, onDeleteLine, onNameChange, onAddSubtask, onToggleHidden, readOnly, onRegisterRef, onNavigate, masterTasks = [], showHidden }: LookaheadRowProps) {
  const [collapsed, setCollapsed] = useState(false);
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

  const taskAutocompleteItems: AutocompleteItem[] = useMemo(() =>
    masterTasks.map(t => ({
      id: t.id,
      primaryText: t.name,
      secondaryText: t.category || undefined,
    })),
    [masterTasks]
  );

  const handleTaskNameSelect = (name: string, itemId: string | null) => {
    if (onNameChange) onNameChange(line.id, name);
    // Smart defaults: if a master task has default_trade, auto-fill
    if (itemId) {
      const mt = masterTasks.find(t => t.id === itemId);
      if (mt?.default_trade && !line.assigned_trade) {
        onFieldChange(line.id, "assigned_trade", mt.default_trade);
      }
    }
  };

  const handleAddNewTask = async (name: string): Promise<AutocompleteItem | null> => {
    const normalized = name.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
    const { data, error } = await supabase
      .from("master_tasks")
      .insert({ name, normalized_name: normalized, status: "active" })
      .select("id, name, category")
      .single();
    if (error || !data) return null;
    return { id: data.id, primaryText: data.name, secondaryText: data.category || undefined };
  };

  const isNewTask = comparisonData && (() => {
    const key = line.task_id || line.custom_text || "";
    return key ? comparisonData.newLineKeys.has(key) : false;
  })();

  const isHidden = line.hidden === true;

  return (
    <>
      <tr
        ref={setNodeRef}
        style={style}
        className={cn(
          "border-b border-border hover:bg-muted/30 transition-colors group/row",
          line.is_parent && "border-l-[3px] border-l-primary/50 font-medium",
          isSubtask && "bg-muted/5",
          isDragging && "bg-accent/40",
          isNewTask && "border-l-2 border-l-blue-500",
          isHidden && "opacity-40"
        )}
      >
        {/* Task Name */}
        <td className="py-1.5 px-2 sticky left-0 bg-card z-10 min-w-[200px] max-w-[280px]">
          <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 16}px` }}>
            {!readOnly && onToggleHidden && (
              <input
                type="checkbox"
                checked={isHidden}
                onChange={() => onToggleHidden(line.id, !isHidden)}
                className="h-3 w-3 rounded border-muted-foreground/50 text-primary focus:ring-primary/50 cursor-pointer shrink-0"
                title={isHidden ? "Unhide row" : "Hide row"}
              />
            )}
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
            {isHidden && showHidden && (
              <EyeOff className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
            {readOnly ? (
              <span className={cn("text-sm truncate", line.is_parent && "font-semibold", isSubtask && "text-muted-foreground", isHidden && "line-through")}>
                {line.task_name || line.custom_text || "—"}
              </span>
            ) : (
              <div className="flex-1 min-w-0">
                <MasterAutocomplete
                  value={line.task_name || line.custom_text || ""}
                  items={taskAutocompleteItems}
                  onChange={handleTaskNameSelect}
                  onAddNew={handleAddNewTask}
                  addNewToastLabel="Master Task database"
                  placeholder="Task name"
                  className={cn(line.is_parent && "font-semibold", isSubtask && "text-muted-foreground", isHidden && "line-through")}
                />
              </div>
            )}
            {comparisonData && (
              <ComparisonIndicator lineTaskId={line.task_id} lineCustomText={line.custom_text} comparisonData={comparisonData} />
            )}
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
        <td className="py-1.5 px-1 min-w-[120px]">
          {readOnly ? (
            <span className="text-xs text-muted-foreground">{line.assigned_trade || ""}</span>
          ) : (
            <SubContractorAutocomplete
              value={line.assigned_trade}
              onChange={(companyName) => onFieldChange(line.id, "assigned_trade", companyName)}
              placeholder="Trade"
            />
          )}
        </td>

        {/* Daily Status Cells */}
        {dates.map((date, dateIndex) => {
          const isWeekend = [0, 6].includes(new Date(date + "T00:00:00").getDay());
          const cellKey = `${line.id}-${date}`;

          let cellBg = "";
          const isWorkStatus = (s: string) => s === "Y" || s === "N" || s === "50" || s === "progress";
          const statusToBg = (s: string) => {
            if (s === "Y") return "bg-success/10";
            if (s === "N") return "bg-destructive/10";
            if (s === "50" || s === "progress") return "bg-warning/10";
            return "";
          };

          if (hasChildren && line.children) {
            const workStatuses = line.children
              .map((c) => (c.status_per_day[date] as DayStatus) || "")
              .filter((s) => isWorkStatus(s));
            if (workStatuses.length > 0) {
              const allY = workStatuses.every((s) => s === "Y");
              const anyN = workStatuses.some((s) => s === "N");
              if (allY) cellBg = "bg-success/10";
              else if (anyN) cellBg = "bg-destructive/10";
              else cellBg = "bg-warning/10";
            }
          } else {
            const latestWorkIndex = dates.reduce((latest, d, i) => {
              const s = (line.status_per_day[d] as DayStatus) || "";
              return isWorkStatus(s) ? i : latest;
            }, -1);
            if (dateIndex <= latestWorkIndex) {
              const latestStatus = (line.status_per_day[dates[latestWorkIndex]] as DayStatus) || "";
              cellBg = statusToBg(latestStatus);
            }
          }

          return (
            <React.Fragment key={date}>
              {dateIndex === 7 && (
                <td className="w-2 min-w-[8px] bg-border/40" />
              )}
              <td className={cn("py-1 px-0.5 text-center", cellBg)}>
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
            </React.Fragment>
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
        {/* Root Cause */}
        <td className="py-1.5 px-1 min-w-[100px]">
          {readOnly ? (
            <span className="text-xs text-muted-foreground">{line.materials_needed || ""}</span>
          ) : (
            <select
              className="w-full text-xs bg-transparent border-0 outline-none focus:ring-1 focus:ring-ring rounded px-1 py-0.5 cursor-pointer"
              value={line.materials_needed || ""}
              onChange={(e) => onFieldChange(line.id, "materials_needed", e.target.value)}
            >
              <option value="">—</option>
              <option value="Make Ready">Make Ready</option>
              <option value="Manpower">Manpower</option>
              <option value="Material/Equipment">Material/Equipment</option>
              <option value="Design">Design</option>
              <option value="Weather">Weather</option>
              <option value="AHJ">AHJ</option>
              <option value="Other">Other</option>
            </select>
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
          onToggleHidden={onToggleHidden}
          readOnly={readOnly}
          onRegisterRef={onRegisterRef}
          onNavigate={onNavigate}
          comparisonData={comparisonData}
          masterTasks={masterTasks}
          showHidden={showHidden}
        />
      ))}
    </>
  );
}
