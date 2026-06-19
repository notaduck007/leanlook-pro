import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DayStatus } from "./StatusCell";
import { LookaheadLineData } from "./LookaheadRow";
import { Loader2, GitCompareArrows } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { computePPC } from "@/lib/ppc";

export interface PreviousLineData {
  task_id: string | null;
  custom_text: string | null;
  task_name: string;
  status_per_day: Record<string, DayStatus>;
  assigned_trade: string | null;
}

export interface ComparisonData {
  previousLines: PreviousLineData[];
  previousPPC: number | null;
  /** task_id or custom_text key -> previous line */
  prevLineMap: Map<string, PreviousLineData>;
  /** Lines from last week not present this week */
  removedLines: PreviousLineData[];
  /** Keys of lines new this week */
  newLineKeys: Set<string>;
  carriedOverCount: number;
  newCount: number;
  removedCount: number;
}

function lineKey(taskId: string | null, customText: string | null): string {
  return taskId || customText || "";
}

export async function fetchComparisonData(
  projectId: string,
  currentWeekStart: string,
  currentLines: LookaheadLineData[]
): Promise<ComparisonData | null> {
  // Find previous week's look-ahead
  const { data: prevLAs } = await supabase
    .from("look_aheads")
    .select("id, week_start_date")
    .eq("project_id", projectId)
    .lt("week_start_date", currentWeekStart)
    .order("week_start_date", { ascending: false })
    .limit(1);

  if (!prevLAs?.length) return null;

  const prevLA = prevLAs[0];

  // Fetch previous lines
  const { data: prevLinesRaw } = await supabase
    .from("lookahead_lines")
    .select("*")
    .eq("lookahead_id", prevLA.id)
    .order("sort_order");

  if (!prevLinesRaw?.length) return null;

  // Fetch task names for previous lines
  const taskIds = prevLinesRaw.filter((l) => l.task_id).map((l) => l.task_id!);
  let taskMap: Record<string, any> = {};
  if (taskIds.length > 0) {
    const { data: tasks } = await supabase.from("tasks").select("id, name").in("id", taskIds);
    taskMap = (tasks || []).reduce((acc, t) => ({ ...acc, [t.id]: t }), {});
  }

  const previousLines: PreviousLineData[] = prevLinesRaw.map((l) => ({
    task_id: l.task_id,
    custom_text: l.custom_text,
    task_name: l.task_id ? taskMap[l.task_id]?.name || "Unknown Task" : l.custom_text || "",
    status_per_day: (l.status_per_day as Record<string, DayStatus>) || {},
    assigned_trade: l.assigned_trade,
  }));

  // Calculate previous PPC using the shared canonical helper
  const { resolved: prevResolved, ppc: prevPpc } = computePPC(previousLines);
  const previousPPC = prevResolved > 0 ? prevPpc : null;

  // Build maps
  const prevLineMap = new Map<string, PreviousLineData>();
  previousLines.forEach((l) => {
    const key = lineKey(l.task_id, l.custom_text);
    if (key) prevLineMap.set(key, l);
  });

  const currentKeys = new Set(currentLines.map((l) => lineKey(l.task_id, l.custom_text)).filter(Boolean));
  const prevKeys = new Set(previousLines.map((l) => lineKey(l.task_id, l.custom_text)).filter(Boolean));

  // New this week
  const newLineKeys = new Set<string>();
  currentKeys.forEach((key) => {
    if (!prevKeys.has(key)) newLineKeys.add(key);
  });

  // Removed (in previous but not current)
  const removedLines = previousLines.filter((l) => {
    const key = lineKey(l.task_id, l.custom_text);
    return key && !currentKeys.has(key);
  });

  // Carried over
  let carriedOverCount = 0;
  currentKeys.forEach((key) => {
    if (prevKeys.has(key)) carriedOverCount++;
  });

  return {
    previousLines,
    previousPPC,
    prevLineMap,
    removedLines,
    newLineKeys,
    carriedOverCount,
    newCount: newLineKeys.size,
    removedCount: removedLines.length,
  };
}

interface ComparisonSummaryBarProps {
  data: ComparisonData;
}

export function ComparisonSummaryBar({ data }: ComparisonSummaryBarProps) {
  return (
    <div className="rounded-lg border bg-card p-3 flex flex-wrap items-center gap-3 text-xs">
      <div className="flex items-center gap-1.5">
        <GitCompareArrows className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold text-sm">Week Comparison</span>
      </div>
      <Badge variant="secondary" className="gap-1">
        <span className="font-mono">{data.carriedOverCount}</span> carried over
      </Badge>
      <Badge variant="secondary" className="gap-1 border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-700">
        <span className="font-mono">{data.newCount}</span> new
      </Badge>
      <Badge variant="secondary" className="gap-1">
        <span className="font-mono">{data.removedCount}</span> completed/removed
      </Badge>
      {data.previousPPC !== null && (
        <Badge variant="outline" className="gap-1">
          Last week PPC: <span className="font-mono font-semibold">{data.previousPPC}%</span>
        </Badge>
      )}
    </div>
  );
}

interface ComparisonIndicatorProps {
  lineTaskId: string | null;
  lineCustomText: string | null;
  comparisonData: ComparisonData;
}

export function ComparisonIndicator({ lineTaskId, lineCustomText, comparisonData }: ComparisonIndicatorProps) {
  const key = lineKey(lineTaskId, lineCustomText);
  if (!key) return null;

  if (comparisonData.newLineKeys.has(key)) {
    return (
      <Badge className="text-[9px] px-1 py-0 h-4 bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700 hover:bg-blue-100">
        NEW
      </Badge>
    );
  }

  const prevLine = comparisonData.prevLineMap.get(key);
  if (!prevLine) return null;

  // Check if any status was "N" last week (not completed)
  const prevStatuses = Object.values(prevLine.status_per_day);
  const hadFailures = prevStatuses.includes("N");
  const hadIncomplete = prevStatuses.includes("planned") || prevStatuses.includes("progress");

  if (hadFailures) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex h-3 w-3 rounded-full bg-red-500 shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[200px]">
          Not completed last week — carried over
        </TooltipContent>
      </Tooltip>
    );
  }

  if (hadIncomplete) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex h-3 w-3 rounded-full bg-yellow-500 shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[200px]">
          Was incomplete last week — carried over
        </TooltipContent>
      </Tooltip>
    );
  }

  return null;
}

interface RemovedTasksSectionProps {
  removedLines: PreviousLineData[];
}

export function RemovedTasksSection({ removedLines }: RemovedTasksSectionProps) {
  if (removedLines.length === 0) return null;

  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground py-2 w-full">
        <ChevronDown className="h-3.5 w-3.5 transition-transform [[data-state=open]>&]:rotate-180" />
        <span>{removedLines.length} tasks completed/removed since last week</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border rounded-lg bg-muted/20 divide-y">
          {removedLines.map((line, i) => (
            <div key={i} className="px-3 py-1.5 flex items-center gap-2 text-xs text-muted-foreground line-through">
              <span>{line.task_name}</span>
              {line.assigned_trade && <span className="text-[10px]">({line.assigned_trade})</span>}
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
