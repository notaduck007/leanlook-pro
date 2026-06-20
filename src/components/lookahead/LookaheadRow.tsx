import React, { useState, useMemo } from "react";
import { StatusCell, DayStatus, StatusCellTooltipData } from "./StatusCell";
import { StatusDetailPopover } from "./StatusDetailPopover";
import { VarianceReasonPopover, getVarianceDotColor, VarianceReason } from "./VarianceReasonPopover";
import { ChevronDown, ChevronRight, Trash2, GripVertical, Plus, EyeOff, RotateCcw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format, parseISO } from "date-fns";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { SubContractorAutocomplete } from "@/components/subcontractors/SubContractorAutocomplete";
import { MasterAutocomplete, AutocompleteItem } from "@/components/shared/MasterAutocomplete";
import { MasterTaskRecord } from "@/hooks/useMasterTasks";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface CarryOverDataInfo {
  previous_lookahead_id?: string;
  previous_percent_complete?: number;
  previous_status_summary?: Record<string, number>;
  previous_last_status?: string;
  carried_over_at?: string;
  carry_over_reason?: string;
  parent_task_name?: string;
  siblings_carried?: number;
  siblings_completed?: number;
  previous_week_start?: string;
}

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
  percent_complete?: number;
  expected_completion_date?: string | null;
  isCarryOver?: boolean;
  carry_over_data?: CarryOverDataInfo | null;
  variance_reason?: string | null;
  variance_note?: string | null;
}

interface LookaheadRowProps {
  line: LookaheadLineData;
  dates: string[];
  todayStr?: string;
  onStatusChange: (lineId: string, date: string, status: DayStatus) => void;
  onFieldChange: (lineId: string, field: string, value: string) => void;
  onDeleteLine?: (lineId: string) => void;
  onNameChange?: (lineId: string, newName: string) => void;
  onAddSubtask?: (parentLineId: string) => void;
  onToggleHidden?: (lineId: string, hidden: boolean) => void;
  onPercentChange?: (lineId: string, value: number) => void;
  onExpectedDateChange?: (lineId: string, date: string | null) => void;
  onVarianceChange?: (lineId: string, reason: string | null, note: string | null) => void;
  readOnly?: boolean;
  onRegisterRef?: (key: string, el: HTMLButtonElement | null) => void;
  onNavigate?: (key: string, direction: "up" | "down" | "left" | "right") => void;
  masterTasks?: MasterTaskRecord[];
  showHidden?: boolean;
  variancePopoverLineDate?: string | null;
  onVariancePopoverChange?: (lineDateKey: string | null) => void;
}

export function LookaheadRow({ line, dates, todayStr, onStatusChange, onFieldChange, onDeleteLine, onNameChange, onAddSubtask, onToggleHidden, onPercentChange, onExpectedDateChange, onVarianceChange, readOnly, onRegisterRef, onNavigate, masterTasks = [], showHidden, variancePopoverLineDate, onVariancePopoverChange }: LookaheadRowProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [popoverLineId, setPopoverLineId] = useState<string | null>(null);
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

  const { profile } = useAuth();

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
    if (itemId) {
      const mt = masterTasks.find(t => t.id === itemId);
      if (mt?.default_trade && !line.assigned_trade) {
        onFieldChange(line.id, "assigned_trade", mt.default_trade);
      }
    }
  };

  const handleAddNewTask = async (name: string): Promise<AutocompleteItem | null> => {
    if (!profile?.company_id) return null;
    const normalized = name.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
    const { data, error } = await supabase
      .from("master_tasks")
      .insert({ name, normalized_name: normalized, status: "active", company_id: profile.company_id })
      .select("id, name, category")
      .single();
    if (error || !data) return null;
    return { id: data.id, primaryText: data.name, secondaryText: data.category || undefined };
  };

  const isHidden = line.hidden === true;
  const hasCarryOverData = !!line.carry_over_data;
  const isCarriedOver = line.isCarryOver || hasCarryOverData;
  const co = line.carry_over_data;

  // Build tooltip data for status cells
  const tooltipData: StatusCellTooltipData = {
    taskName: line.task_name || line.custom_text || "Untitled",
    assignedTrade: line.assigned_trade || "",
    notes: line.notes || "",
    materialsNeeded: line.materials_needed || "",
    constraints: line.constraints || "",
    statusPerDay: line.status_per_day,
  };

  // Carry-over badge tooltip content
  const carryOverTooltipContent = co ? (() => {
    const prevWeek = co.previous_week_start ? format(parseISO(co.previous_week_start), "MMM d, yyyy") : "previous week";
    const prevPct = co.previous_percent_complete ?? 0;
    const summary = co.previous_status_summary || {};
    const reason = co.carry_over_reason === "not_started" ? "Task was not started" : `Task was partially complete (${prevPct}%)`;
    const parts: string[] = [
      `Carried over from ${prevWeek}`,
      `Previous progress: ${prevPct}%`,
    ];
    if (Object.keys(summary).length > 0) {
      const summaryParts = Object.entries(summary).map(([k, v]) => `${v} ${k}`).join(", ");
      parts.push(`Previous status: ${summaryParts}`);
    }
    parts.push(reason);
    if (co.siblings_carried) {
      parts.push(`${co.siblings_completed ?? 0} of ${(co.siblings_completed ?? 0) + co.siblings_carried} subtasks completed last week`);
    }
    return parts;
  })() : null;

  // Count carried-over subtasks for collapsed display
  const carriedChildCount = collapsed && hasChildren
    ? (line.children || []).filter(c => c.isCarryOver || c.carry_over_data).length
    : 0;

  return (
    <>
      <tr
        ref={setNodeRef}
        style={style}
        className={cn(
          "border-b border-border hover:bg-muted/30 transition-colors group/row",
          line.is_parent && "border-l-[3px] border-l-primary/50 font-medium",
          isCarriedOver && !line.is_parent && "border-l-[3px] border-l-amber-400 dark:border-l-amber-500",
          isCarriedOver && line.is_parent && "border-l-[3px] border-l-amber-400 dark:border-l-amber-500",
          isSubtask && "bg-muted/5",
          isDragging && "bg-accent/40",
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
            {isCarriedOver && !isSubtask && (
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shrink-0 cursor-help">
                    <RotateCcw className="h-2.5 w-2.5" />
                    CO
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6} className="max-w-[260px]">
                  <div className="space-y-1 p-1">
                    {carryOverTooltipContent ? (
                      carryOverTooltipContent.map((line, i) => (
                        <p key={i} className={cn("text-xs", i === 0 ? "font-semibold" : "text-muted-foreground")}>
                          {line}
                        </p>
                      ))
                    ) : (
                      <p className="text-xs">Carried over from previous look-ahead</p>
                    )}
                    {co && co.previous_percent_complete !== undefined && (
                      <div className="h-1 rounded-full bg-muted overflow-hidden mt-1">
                        <div
                          className={cn("h-full rounded-full", co.previous_percent_complete >= 80 ? "bg-green-500" : co.previous_percent_complete >= 50 ? "bg-yellow-500" : "bg-red-500")}
                          style={{ width: `${co.previous_percent_complete}%` }}
                        />
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
            {readOnly ? (
              <span className={cn("text-sm truncate", line.is_parent && "font-semibold", isSubtask && "text-muted-foreground", isHidden && "line-through")}>
                {line.task_name || line.custom_text || "—"}
                {collapsed && carriedChildCount > 0 && (
                  <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400">({carriedChildCount} carried-over subtask{carriedChildCount > 1 ? "s" : ""})</span>
                )}
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
          const isToday = date === todayStr;
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
            // Roll up across ALL descendants, not just direct children,
            // so 3+ level hierarchies show the correct parent color.
            const collectDescendants = (node: LookaheadLineData): LookaheadLineData[] => {
              const kids = node.children || [];
              return kids.flatMap((k) => [k, ...collectDescendants(k)]);
            };
            const workStatuses = collectDescendants(line)
              .map((c) => (c.status_per_day?.[date] as DayStatus) || "")
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
              <td className={cn("py-1 px-0.5 text-center relative", cellBg, isToday && "border-x-2 border-primary/40 bg-primary/5")}>
                <VarianceReasonPopover
                  open={variancePopoverLineDate === cellKey}
                  onOpenChange={(open) => onVariancePopoverChange?.(open ? cellKey : null)}
                  onSelect={(reason, note) => {
                    onVarianceChange?.(line.id, reason, note || null);
                  }}
                >
                  <StatusDetailPopover
                    open={popoverLineId === cellKey}
                    onOpenChange={(open) => setPopoverLineId(open ? cellKey : null)}
                    percentComplete={line.percent_complete || 0}
                    expectedCompletionDate={line.expected_completion_date || null}
                    onPercentChange={(v) => onPercentChange?.(line.id, v)}
                    onDateChange={(d) => onExpectedDateChange?.(line.id, d)}
                    status={(line.status_per_day[date] as DayStatus) || ""}
                  >
                    <StatusCell
                      status={(line.status_per_day[date] as DayStatus) || ""}
                      onChange={(s) => {
                        onStatusChange(line.id, date, s);
                        if (s === "N") {
                          // Show variance reason popover
                          onVariancePopoverChange?.(cellKey);
                          setPopoverLineId(null);
                        } else if (s === "50" || s === "planned" || s === "progress") {
                          setPopoverLineId(cellKey);
                        } else {
                          setPopoverLineId(null);
                          // Clear variance if status changed away from N
                          if (line.variance_reason) {
                            onVarianceChange?.(line.id, null, null);
                          }
                        }
                      }}
                      isWeekend={isWeekend}
                      readOnly={readOnly}
                      cellKey={cellKey}
                      onRegisterRef={onRegisterRef}
                      onNavigate={onNavigate}
                      percentComplete={line.percent_complete}
                      expectedDate={line.expected_completion_date}
                      date={date}
                      tooltipData={tooltipData}
                    />
                  </StatusDetailPopover>
                </VarianceReasonPopover>
                {/* Variance indicator dot on N cells */}
                {(line.status_per_day[date] as DayStatus) === "N" && (
                  <span className="absolute top-0.5 right-0.5">
                    {line.variance_reason ? (
                      <span className={cn("block w-1.5 h-1.5 rounded-full", getVarianceDotColor(line.variance_reason as VarianceReason))} />
                    ) : (
                      <AlertTriangle className="h-2.5 w-2.5 text-yellow-500" />
                    )}
                  </span>
                )}
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

        {/* Root Cause */}
        <td className="py-1.5 px-1 min-w-[100px]">
          {readOnly ? (
            <span className="text-xs text-muted-foreground">{line.materials_needed || ""}</span>
          ) : (
            <Select
              value={line.materials_needed || "__none__"}
              onValueChange={(value) => onFieldChange(line.id, "materials_needed", value === "__none__" ? "" : value)}
            >
              <SelectTrigger className="w-full text-xs h-auto py-1 px-1 border-0 bg-transparent focus:ring-1 focus:ring-ring">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                <SelectItem value="Make Ready">Make Ready</SelectItem>
                <SelectItem value="Manpower">Manpower</SelectItem>
                <SelectItem value="Material/Equipment">Material/Equipment</SelectItem>
                <SelectItem value="Design">Design</SelectItem>
                <SelectItem value="Weather">Weather</SelectItem>
                <SelectItem value="AHJ">AHJ</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
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
          todayStr={todayStr}
          onStatusChange={onStatusChange}
          onFieldChange={onFieldChange}
          onDeleteLine={onDeleteLine}
          onNameChange={onNameChange}
          onAddSubtask={onAddSubtask}
          onToggleHidden={onToggleHidden}
          onPercentChange={onPercentChange}
          onExpectedDateChange={onExpectedDateChange}
          onVarianceChange={onVarianceChange}
          readOnly={readOnly}
          onRegisterRef={onRegisterRef}
          onNavigate={onNavigate}
          masterTasks={masterTasks}
          showHidden={showHidden}
          variancePopoverLineDate={variancePopoverLineDate}
          onVariancePopoverChange={onVariancePopoverChange}
        />
      ))}
    </>
  );
}
