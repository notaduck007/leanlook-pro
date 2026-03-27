import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, SendHorizonal, Loader2, Plus, Sparkles, FileDown, CheckCircle, XCircle, Copy, Search, Trash2, Check, CircleDot, MoreVertical, Download, Eye, EyeOff } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format, addDays, parseISO, subWeeks, isBefore, isAfter, formatDistanceToNow } from "date-fns";
import { LookaheadRow, LookaheadLineData } from "@/components/lookahead/LookaheadRow";
import { MobileTaskCard } from "@/components/lookahead/MobileTaskCard";
import { StatusLegend } from "@/components/lookahead/StatusLegend";
import { DayStatus } from "@/components/lookahead/StatusCell";
import { generateLookaheadPDF } from "@/components/lookahead/LookaheadPDF";
import { PullTasksDialog } from "@/components/lookahead/PullTasksDialog";
import { useIsMobile } from "@/hooks/use-mobile";

import { useMasterTasks } from "@/hooks/useMasterTasks";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";

type SaveStatus = "saved" | "saving" | "unsaved";

export default function LookAheadEditor() {
  const { id: projectId, lookaheadId } = useParams<{ id: string; lookaheadId: string }>();
  const isMobile = useIsMobile();
  const { user, profile, roles } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { tasks: masterTasks } = useMasterTasks();

  const [lookAhead, setLookAhead] = useState<any>(null);
  const [project, setProject] = useState<any>(null);
  const [lines, setLines] = useState<LookaheadLineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState("");
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([]);

  // Auto-save state
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [, setTick] = useState(0); // force re-render for "X ago" text
  const isDirty = useRef(false);
  const linesRef = useRef<LookaheadLineData[]>([]);
  const isSavingRef = useRef(false);

  // Cell refs for keyboard navigation
  const cellRefsMap = useRef<Map<string, HTMLButtonElement>>(new Map());
  const filteredLinesRef = useRef<LookaheadLineData[]>([]);
  const datesRef = useRef<string[]>([]);

  const handleRegisterRef = useCallback((key: string, el: HTMLButtonElement | null) => {
    if (el) {
      cellRefsMap.current.set(key, el);
    } else {
      cellRefsMap.current.delete(key);
    }
  }, []);

  const handleCellNavigate = useCallback((cellKey: string, direction: "up" | "down" | "left" | "right") => {
    const parts = cellKey.split("-");
    const date = parts.slice(-3).join("-");
    const lineId = parts.slice(0, -3).join("-");

    const lineIds = filteredLinesRef.current.map((l) => l.id);
    const lineIdx = lineIds.indexOf(lineId);
    const dateIdx = datesRef.current.indexOf(date);
    if (lineIdx === -1 || dateIdx === -1) return;

    let newLineIdx = lineIdx;
    let newDateIdx = dateIdx;

    if (direction === "up") newLineIdx = Math.max(0, lineIdx - 1);
    else if (direction === "down") newLineIdx = Math.min(lineIds.length - 1, lineIdx + 1);
    else if (direction === "left") newDateIdx = Math.max(0, dateIdx - 1);
    else if (direction === "right") newDateIdx = Math.min(datesRef.current.length - 1, dateIdx + 1);

    const targetKey = `${lineIds[newLineIdx]}-${datesRef.current[newDateIdx]}`;
    const targetEl = cellRefsMap.current.get(targetKey);
    if (targetEl) targetEl.focus();
  }, []);

  const isAdmin = roles.includes("admin");
  const isPM = roles.includes("pm");
  const canReview = isAdmin || isPM;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const dates: string[] = lookAhead
    ? Array.from({ length: 14 }, (_, i) =>
        format(addDays(parseISO(lookAhead.week_start_date), i), "yyyy-MM-dd")
      )
    : [];

  // Keep linesRef in sync
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  const fetchData = useCallback(async () => {
    if (!lookaheadId || !projectId) return;

    const [laRes, projRes] = await Promise.all([
      supabase.from("look_aheads").select("*").eq("id", lookaheadId).single(),
      supabase.from("projects").select("*").eq("id", projectId).single(),
    ]);

    setLookAhead(laRes.data);
    setProject(projRes.data);

    const { data: linesData } = await supabase
      .from("lookahead_lines")
      .select("*")
      .eq("lookahead_id", lookaheadId)
      .order("sort_order");

    if (linesData) {
      const taskIds = linesData.filter((l) => l.task_id).map((l) => l.task_id!);
      let taskMap: Record<string, any> = {};
      if (taskIds.length > 0) {
        const { data: tasks } = await supabase
          .from("tasks")
          .select("*")
          .in("id", taskIds);
        taskMap = (tasks || []).reduce((acc, t) => ({ ...acc, [t.id]: t }), {});
      }

      const mappedLines: LookaheadLineData[] = linesData.map((l) => ({
        id: l.id,
        task_id: l.task_id,
        custom_text: l.custom_text,
        task_name: l.task_id ? taskMap[l.task_id]?.name || "Unknown Task" : (l.custom_text || "").replace(/^↳\s*/, ""),
        assigned_trade: l.assigned_trade,
        materials_needed: l.materials_needed,
        constraints: l.constraints,
        notes: l.notes,
        photos: (l.photos as string[]) || [],
        status_per_day: (l.status_per_day as Record<string, DayStatus>) || {},
        sort_order: l.sort_order || 0,
        parent_line_id: (l as any).parent_line_id || null,
        hidden: (l as any).hidden || false,
      }));

      setLines(mappedLines);
    }

    setLoading(false);
  }, [lookaheadId, projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const markDirty = useCallback(() => {
    isDirty.current = true;
    setSaveStatus("unsaved");
  }, []);

  const saveDraft = useCallback(async () => {
    if (isSavingRef.current) return;
    const currentLines = linesRef.current;
    if (currentLines.length === 0) return;

    isSavingRef.current = true;
    setSaveStatus("saving");

    try {
      const updates = currentLines.map((l) =>
        supabase
          .from("lookahead_lines")
          .update({
            status_per_day: l.status_per_day,
            notes: l.notes,
            assigned_trade: l.assigned_trade,
            materials_needed: l.materials_needed,
            constraints: l.constraints,
            custom_text: l.custom_text,
          })
          .eq("id", l.id)
      );
      await Promise.all(updates);
      isDirty.current = false;
      setLastSavedAt(new Date());
      setSaveStatus("saved");
    } catch (e) {
      console.error("Auto-save failed:", e);
      setSaveStatus("unsaved");
    } finally {
      isSavingRef.current = false;
    }
  }, []);

  // Auto-save interval: check every 2s if dirty
  useEffect(() => {
    const interval = setInterval(() => {
      if (isDirty.current && !isSavingRef.current) {
        saveDraft();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [saveDraft]);

  // Tick for "saved X ago" display
  useEffect(() => {
    const ticker = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(ticker);
  }, []);

  // Save on beforeunload
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty.current) {
        saveDraft();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveDraft]);

  // Save on unmount if dirty
  useEffect(() => {
    return () => {
      if (isDirty.current) {
        // Fire and forget on unmount
        const currentLines = linesRef.current;
        if (currentLines.length > 0) {
          const updates = currentLines.map((l) =>
            supabase
              .from("lookahead_lines")
              .update({
                status_per_day: l.status_per_day,
                notes: l.notes,
                assigned_trade: l.assigned_trade,
                materials_needed: l.materials_needed,
                constraints: l.constraints,
                custom_text: l.custom_text,
              })
              .eq("id", l.id)
          );
          Promise.all(updates).catch(console.error);
        }
      }
    };
  }, []);

  const handleStatusChange = (lineId: string, date: string, status: DayStatus) => {
    setLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? { ...l, status_per_day: { ...l.status_per_day, [date]: status } }
          : l
      )
    );
    markDirty();
  };

  const handleFieldChange = (lineId: string, field: string, value: string) => {
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, [field]: value } : l))
    );
    markDirty();
  };

  const handleNameChange = async (lineId: string, newName: string) => {
    const line = lines.find((l) => l.id === lineId);
    if (!line) return;

    setLines((prev) =>
      prev.map((l) => l.id === lineId ? { ...l, task_name: newName, custom_text: newName } : l)
    );

    await supabase.from("lookahead_lines").update({ custom_text: newName }).eq("id", lineId);

    if (line.task_id) {
      await supabase.from("tasks").update({ name: newName }).eq("id", line.task_id);
    }

    // Sync to master repository
    if (line.parent_line_id) {
      // This is a subtask — find parent to get master_task context
      const parentLine = lines.find((l) => l.id === line.parent_line_id);
      if (parentLine) {
        const parentName = parentLine.task_name || parentLine.custom_text || "";
        const normalized = parentName.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
        const { data: masterTask } = await supabase
          .from("master_tasks")
          .select("id")
          .eq("normalized_name", normalized)
          .maybeSingle();

        if (masterTask) {
          // Find and update the matching subtask by old name or position
          const oldName = (line.task_name || line.custom_text || "").replace(/^↳\s*/, "");
          const cleanNewName = newName.replace(/^↳\s*/, "");
          await supabase
            .from("master_subtasks")
            .update({ name: cleanNewName })
            .eq("master_task_id", masterTask.id)
            .eq("name", oldName);
        }
      }
    } else {
      // This is a main task — sync name to master_tasks
      const oldName = (line.task_name || line.custom_text || "");
      const oldNormalized = oldName.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
      const newNormalized = newName.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
      await supabase
        .from("master_tasks")
        .update({ name: newName, normalized_name: newNormalized })
        .eq("normalized_name", oldNormalized);
    }

    markDirty();
  };

  const handleDeleteLine = async (lineId: string) => {
    // Open three-button modal instead of immediately deleting
    setDeleteTargetIds([lineId]);
    setDeleteModalOpen(true);
  };

  const handleToggleHidden = async (lineId: string, hidden: boolean) => {
    setLines((prev) => prev.map((l) => l.id === lineId ? { ...l, hidden } : l));
    await supabase.from("lookahead_lines").update({ hidden }).eq("id", lineId);
    if (hidden) {
      toast({ title: "Task hidden from this Look-Ahead." });
    } else {
      toast({ title: "Task restored to view." });
    }
  };

  const handleHideTargets = async () => {
    for (const id of deleteTargetIds) {
      await supabase.from("lookahead_lines").update({ hidden: true }).eq("id", id);
    }
    setLines((prev) => prev.map((l) => deleteTargetIds.includes(l.id) ? { ...l, hidden: true } : l));
    toast({ title: `${deleteTargetIds.length} task(s) hidden from this Look-Ahead.` });
    setDeleteModalOpen(false);
    setDeleteTargetIds([]);
  };

  const handlePermanentDelete = async () => {
    for (const id of deleteTargetIds) {
      const childIds = lines.filter((l) => l.parent_line_id === id).map((l) => l.id);
      await supabase.from("lookahead_lines").delete().eq("id", id);
    }
    setLines((prev) => prev.filter((l) => !deleteTargetIds.includes(l.id) && !deleteTargetIds.includes(l.parent_line_id || "")));
    toast({ title: `${deleteTargetIds.length} task(s) permanently deleted.` });
    setDeleteModalOpen(false);
    setDeleteTargetIds([]);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = lines.findIndex((l) => l.id === active.id);
    const newIndex = lines.findIndex((l) => l.id === over.id);

    const reordered = arrayMove(lines, oldIndex, newIndex).map((l, i) => ({ ...l, sort_order: i }));
    setLines(reordered);

    const updates = reordered.map((l) =>
      supabase.from("lookahead_lines").update({ sort_order: l.sort_order }).eq("id", l.id)
    );
    await Promise.all(updates);
  };

  const sendNotification = async (targetUserId: string, title: string, message: string) => {
    if (!profile?.company_id) return;
    await supabase.from("notifications").insert({
      user_id: targetUserId,
      company_id: profile.company_id,
      title,
      message,
      link: `/projects/${projectId}/lookahead/${lookaheadId}`,
    });
  };

  const handleNavigateBack = async () => {
    if (isDirty.current) {
      await saveDraft();
    }
    navigate(`/projects/${projectId}`);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    await saveDraft();
    await supabase
      .from("look_aheads")
      .update({ status: "submitted" })
      .eq("id", lookaheadId!);

    if (profile?.company_id) {
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "pm"]);
      for (const r of adminRoles || []) {
        if (r.user_id !== user?.id) {
          sendNotification(r.user_id, "Look-ahead submitted", `${profile?.display_name || "A superintendent"} submitted a look-ahead for ${project?.name}`);
        }
      }
    }

    setSubmitting(false);
    toast({ title: "Look-ahead submitted for review!" });
    navigate(`/projects/${projectId}`);
  };

  const handleApprove = async () => {
    await supabase.from("look_aheads").update({ status: "approved" }).eq("id", lookaheadId!);
    if (lookAhead?.super_id) {
      sendNotification(lookAhead.super_id, "Look-ahead approved!", `Your look-ahead for ${project?.name} has been approved.`);
    }
    toast({ title: "Look-ahead approved!" });
    setLookAhead((prev: any) => ({ ...prev, status: "approved" }));
  };

  const handleReject = async () => {
    await supabase.from("look_aheads").update({ status: "rejected" }).eq("id", lookaheadId!);
    if (lookAhead?.super_id) {
      sendNotification(lookAhead.super_id, "Look-ahead needs revision", `Your look-ahead for ${project?.name} was sent back for changes.`);
    }
    toast({ title: "Look-ahead sent back for revision.", variant: "destructive" });
    setLookAhead((prev: any) => ({ ...prev, status: "rejected" }));
  };

  const handleAddCustomLine = async () => {
    if (!lookaheadId || !profile?.company_id) return;
    const { data } = await supabase
      .from("lookahead_lines")
      .insert({
        lookahead_id: lookaheadId,
        company_id: profile.company_id,
        custom_text: "New Task",
        sort_order: lines.length,
        status_per_day: {},
      })
      .select()
      .single();

    if (data) {
      setLines((prev) => [
        ...prev,
        {
          id: data.id,
          task_id: null,
          custom_text: "New Task",
          task_name: "New Task",
          assigned_trade: null,
          materials_needed: null,
          constraints: null,
          notes: null,
          photos: [],
          status_per_day: {},
          sort_order: lines.length,
          parent_line_id: null,
        },
      ]);
    }
  };

  const handleAddSubtask = async (parentLineId: string) => {
    if (!lookaheadId || !profile?.company_id) return;
    const parentLine = lines.find((l) => l.id === parentLineId);
    if (!parentLine) return;

    // Find parent's position to insert subtask right after parent + existing subtasks
    const parentIdx = lines.findIndex((l) => l.id === parentLineId);
    const existingSubtasks = lines.filter((l) => l.parent_line_id === parentLineId);
    const insertSortOrder = parentLine.sort_order + existingSubtasks.length + 1;

    const { data } = await supabase
      .from("lookahead_lines")
      .insert({
        lookahead_id: lookaheadId,
        company_id: profile.company_id,
        custom_text: "New Subtask",
        sort_order: insertSortOrder,
        status_per_day: {},
        parent_line_id: parentLineId,
      })
      .select()
      .single();

    if (data) {
      const newSubtask: LookaheadLineData = {
        id: data.id,
        task_id: null,
        custom_text: "New Subtask",
        task_name: "New Subtask",
        assigned_trade: null,
        materials_needed: null,
        constraints: null,
        notes: null,
        photos: [],
        status_per_day: {},
        sort_order: insertSortOrder,
        parent_line_id: parentLineId,
      };

      // Insert right after parent and its existing subtasks
      setLines((prev) => {
        const result = [...prev];
        const lastSubIdx = prev.reduce((last, l, i) => l.parent_line_id === parentLineId ? i : last, parentIdx);
        result.splice(lastSubIdx + 1, 0, newSubtask);
        return result;
      });

      // Also sync to master repository: add subtask to master_tasks
      const parentName = parentLine.task_name || parentLine.custom_text || "";
      const normalized = parentName.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
      const { data: masterTask } = await supabase
        .from("master_tasks")
        .select("id")
        .eq("normalized_name", normalized)
        .maybeSingle();

      if (masterTask) {
        // Count existing subtasks for sort_order
        const { count } = await supabase
          .from("master_subtasks")
          .select("id", { count: "exact", head: true })
          .eq("master_task_id", masterTask.id);

        await supabase.from("master_subtasks").insert({
          master_task_id: masterTask.id,
          name: "New Subtask",
          sort_order: (count || 0) + 1,
        });
      }

      toast({ title: "Subtask added" });
    }
  };

  const handleSmartFill = async () => {
    if (!lookAhead || !projectId || !profile?.company_id) return;

    const weekStart = parseISO(lookAhead.week_start_date);
    const weekEnd = addDays(weekStart, 13);
    const weekEndStr = format(weekEnd, "yyyy-MM-dd");

    const { data: versions } = await supabase
      .from("schedule_versions")
      .select("id")
      .eq("project_id", projectId)
      .order("version_number", { ascending: false })
      .limit(1);

    if (!versions?.length) {
      toast({ title: "No schedule uploaded", description: "Upload a master schedule first so Smart Fill can use task dates.", variant: "destructive" });
      return;
    }

    const { data: allTasks } = await supabase
      .from("tasks")
      .select("*")
      .eq("schedule_version_id", versions[0].id);

    if (!allTasks?.length) {
      toast({ title: "No tasks found in schedule", variant: "destructive" });
      return;
    }

    const overlappingTasks = allTasks.filter((t) => {
      if (!t.start_date && !t.finish_date) return false;
      const taskStart = t.start_date ? parseISO(t.start_date) : null;
      const taskEnd = t.finish_date ? parseISO(t.finish_date) : taskStart;
      if (!taskStart && !taskEnd) return false;
      const startsBeforeEnd = taskStart ? !isAfter(taskStart, weekEnd) : true;
      const endsAfterStart = taskEnd ? !isBefore(taskEnd, weekStart) : true;
      return startsBeforeEnd && endsAfterStart;
    });

    if (!overlappingTasks.length) {
      toast({ title: "No tasks overlap this 2-week window", description: "Check your master schedule dates." });
      return;
    }

    const existingIds = new Set(lines.filter((l) => l.task_id).map((l) => l.task_id));
    const newTasks = overlappingTasks.filter((t) => !existingIds.has(t.id));

    const { data: templates } = await supabase
      .from("task_templates")
      .select("*")
      .eq("company_id", profile.company_id!);

    const templateMap = new Map<string, any>();
    (templates || []).forEach((t) => templateMap.set(t.tag.toLowerCase(), t));

    let addedCount = 0;
    if (newTasks.length > 0) {
      const maxSort = lines.reduce((max, l) => Math.max(max, l.sort_order), 0);
      const newLineInserts = newTasks.map((t, i) => {
        const taskTags = (t.tags as string[]) || [];
        let materials: string | null = null;
        let constraints: string | null = null;
        for (const tag of taskTags) {
          const tmpl = templateMap.get(tag.toLowerCase());
          if (tmpl) {
            const items = (tmpl.checklist_items as any[]) || [];
            materials = items.filter((c: any) => c.type === "material").map((c: any) => c.text).join(", ") || null;
            constraints = items.filter((c: any) => c.type === "constraint").map((c: any) => c.text).join(", ") || null;
            break;
          }
        }
        return {
          lookahead_id: lookaheadId!,
          company_id: profile.company_id!,
          task_id: t.id,
          sort_order: maxSort + i + 1,
          status_per_day: {},
          assigned_trade: taskTags.join(", ") || null,
          materials_needed: materials,
          constraints,
        };
      });

      const { data: inserted, error } = await supabase
        .from("lookahead_lines")
        .insert(newLineInserts)
        .select("*");

      if (error) {
        console.error("Error inserting lines:", error);
      } else if (inserted) {
        addedCount = inserted.length;
        const taskMap = overlappingTasks.reduce((acc, t) => ({ ...acc, [t.id]: t }), {} as Record<string, any>);
        const newMappedLines: LookaheadLineData[] = inserted.map((l) => ({
          id: l.id,
          task_id: l.task_id,
          custom_text: l.custom_text,
          task_name: l.task_id ? taskMap[l.task_id]?.name || "Unknown Task" : l.custom_text || "",
          assigned_trade: l.assigned_trade,
          materials_needed: l.materials_needed,
          constraints: l.constraints,
          notes: l.notes,
          photos: (l.photos as string[]) || [],
          status_per_day: (l.status_per_day as Record<string, DayStatus>) || {},
          sort_order: l.sort_order || 0,
        }));
        setLines((prev) => [...prev, ...newMappedLines]);
      }
    }

    const taskDateMap: Record<string, { start: Date | null; end: Date | null }> = {};
    for (const t of overlappingTasks) {
      taskDateMap[t.id] = {
        start: t.start_date ? parseISO(t.start_date) : null,
        end: t.finish_date ? parseISO(t.finish_date) : (t.start_date ? parseISO(t.start_date) : null),
      };
    }

    let filled = 0;
    setLines((prev) =>
      prev.map((l) => {
        const newStatus = { ...l.status_per_day };
        const taskDates = l.task_id ? taskDateMap[l.task_id] : null;

        dates.forEach((date) => {
          if (newStatus[date]) return;
          if (taskDates) {
            const d = parseISO(date);
            const afterStart = taskDates.start ? !isBefore(d, taskDates.start) : true;
            const beforeEnd = taskDates.end ? !isAfter(d, taskDates.end) : true;
            if (afterStart && beforeEnd) {
              newStatus[date] = "planned";
              filled++;
            }
          }
        });

        return { ...l, status_per_day: newStatus };
      })
    );

    // Mark dirty so auto-save picks it up
    markDirty();
    toast({
      title: "Smart Fill complete",
      description: `${addedCount} tasks added from schedule, ${filled} cells marked as planned based on task dates.`,
    });
  };

  const handlePullFromLastWeek = async () => {
    if (!projectId || !lookaheadId || !profile?.company_id || !lookAhead) return;

    const { data: prevLAs } = await supabase
      .from("look_aheads")
      .select("id")
      .eq("project_id", projectId)
      .lt("week_start_date", lookAhead.week_start_date)
      .order("week_start_date", { ascending: false })
      .limit(1);

    if (!prevLAs?.length) {
      toast({ title: "No previous look-ahead found", variant: "destructive" });
      return;
    }

    const { data: prevLines } = await supabase
      .from("lookahead_lines")
      .select("*")
      .eq("lookahead_id", prevLAs[0].id);

    if (!prevLines?.length) {
      toast({ title: "No lines to pull forward" });
      return;
    }

    const incompleteLines = prevLines.filter((pl) => {
      const statuses = Object.values((pl.status_per_day as Record<string, string>) || {});
      return statuses.includes("N") || statuses.includes("planned") || statuses.includes("progress");
    });

    if (!incompleteLines.length) {
      toast({ title: "All previous tasks were completed!" });
      return;
    }

    const taskIds = incompleteLines.filter((l) => l.task_id).map((l) => l.task_id!);
    let taskMap: Record<string, any> = {};
    if (taskIds.length > 0) {
      const { data: tasks } = await supabase.from("tasks").select("*").in("id", taskIds);
      taskMap = (tasks || []).reduce((acc, t) => ({ ...acc, [t.id]: t }), {});
    }

    const existingIds = new Set(lines.filter((l) => l.task_id).map((l) => l.task_id));
    const newLines = incompleteLines.filter((l) => !l.task_id || !existingIds.has(l.task_id));

    if (!newLines.length) {
      toast({ title: "All carry-over tasks already exist in this look-ahead" });
      return;
    }

    const inserts = newLines.map((pl, i) => ({
      lookahead_id: lookaheadId,
      company_id: profile.company_id,
      task_id: pl.task_id,
      custom_text: pl.custom_text,
      assigned_trade: pl.assigned_trade,
      materials_needed: pl.materials_needed,
      constraints: pl.constraints,
      notes: `Carried over: ${pl.notes || ""}`.trim(),
      sort_order: lines.length + i,
      status_per_day: {},
    }));

    const { data: inserted } = await supabase.from("lookahead_lines").insert(inserts).select();

    if (inserted) {
      const mapped: LookaheadLineData[] = inserted.map((l) => ({
        id: l.id,
        task_id: l.task_id,
        custom_text: l.custom_text,
        task_name: l.task_id ? taskMap[l.task_id]?.name || "Carry-over Task" : l.custom_text || "Carry-over",
        assigned_trade: l.assigned_trade,
        materials_needed: l.materials_needed,
        constraints: l.constraints,
        notes: l.notes,
        photos: [],
        status_per_day: {},
        sort_order: l.sort_order || 0,
      }));
      setLines((prev) => [...prev, ...mapped]);
      toast({ title: `Pulled ${inserted.length} incomplete tasks from last week` });
    }
  };


  // Build hierarchical lines: group subtasks under their parents (memoized to prevent layout jumps)
  const hierarchicalLines = useMemo(() => {
    const parentLines: LookaheadLineData[] = [];
    const childrenByParent = new Map<string, LookaheadLineData[]>();

    lines.forEach((l) => {
      if (l.parent_line_id) {
        const existing = childrenByParent.get(l.parent_line_id) || [];
        existing.push({ ...l, depth: 1 });
        childrenByParent.set(l.parent_line_id, existing);
      } else {
        parentLines.push(l);
      }
    });

    return parentLines.map((p) => ({
      ...p,
      is_parent: childrenByParent.has(p.id),
      children: childrenByParent.get(p.id) || [],
      depth: 0,
    }));
  }, [lines]);

  const hiddenCount = useMemo(() => lines.filter((l) => l.hidden).length, [lines]);

  const filteredLines = useMemo(() => {
    let result = hierarchicalLines;
    // Filter out hidden rows unless showHidden is on
    if (!showHidden) {
      result = result.filter((l) => !l.hidden).map((l) => ({
        ...l,
        children: (l.children || []).filter((c) => !c.hidden),
      }));
    }
    if (!filter) return result;
    const lowerFilter = filter.toLowerCase();
    return result.filter(
      (l) =>
        l.task_name.toLowerCase().includes(lowerFilter) ||
        (l.assigned_trade || "").toLowerCase().includes(lowerFilter) ||
        (l.children || []).some(
          (c) => c.task_name.toLowerCase().includes(lowerFilter)
        )
    );
  }, [hierarchicalLines, filter, showHidden]);

  const sortableIds = useMemo(() =>
    filteredLines.flatMap((l) => [l.id, ...(l.children || []).map(c => c.id)]),
    [filteredLines]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isOwner = lookAhead?.super_id === user?.id;
  const isReadOnly = (lookAhead?.status === "submitted" || lookAhead?.status === "approved") && !canReview;
  const isRejected = lookAhead?.status === "rejected";

  const existingTaskIds = new Set(lines.filter((l) => l.task_id).map((l) => l.task_id));

  // Keep refs in sync for keyboard navigation (flatten for nav)
  const flatFilteredLines = filteredLines.flatMap((l) => [l, ...(l.children || [])]);
  filteredLinesRef.current = flatFilteredLines;
  datesRef.current = dates;

  // PPC calculation
  const ppcStats = (() => {
    let completed = 0;
    let planned = 0;
    const perDay: Record<string, { completed: number; total: number }> = {};

    const currentWeekDates = dates.slice(0, 7);
    dates.forEach((d) => { perDay[d] = { completed: 0, total: 0 }; });

    lines.forEach((l) => {
      currentWeekDates.forEach((d) => {
        const s = l.status_per_day[d] as DayStatus;
        if (s === "Y" || s === "N" || s === "50" || s === "planned" || s === "progress") {
          planned++;
          perDay[d].total++;
          if (s === "Y") {
            completed++;
            perDay[d].completed++;
          }
        }
      });
    });

    const ppc = planned > 0 ? Math.round((completed / planned) * 100) : null;
    return { completed, planned, ppc, perDay };
  })();

  const renderSaveStatus = () => {
    if (saveStatus === "saving") {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving…
        </span>
      );
    }
    if (saveStatus === "unsaved") {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
          <CircleDot className="h-3 w-3" />
          Unsaved changes
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
        <Check className="h-3 w-3" />
        Saved{lastSavedAt ? ` ${formatDistanceToNow(lastSavedAt, { addSuffix: true })}` : ""}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleNavigateBack}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold">{project?.name}</h1>
              {renderSaveStatus()}
            </div>
            <p className="text-sm text-muted-foreground">
              Week of {lookAhead ? format(parseISO(lookAhead.week_start_date), "MMM d, yyyy") : "..."} ·{" "}
              <span className="capitalize">{lookAhead?.status}</span> · {lines.length} tasks
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canReview && lookAhead?.status === "submitted" && (
            <>
              <Button size="sm" variant="outline" className="text-green-600 border-green-300 hover:bg-green-50" onClick={handleApprove}>
                <CheckCircle className="mr-1 h-3.5 w-3.5" /> Approve
              </Button>
              <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={handleReject}>
                <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
              </Button>
            </>
          )}
          {isOwner && (lookAhead?.status === "draft" || isRejected) && (
            <>
              {/* Desktop: show all buttons */}
              <div className="hidden md:flex items-center gap-2">
                <PullTasksDialog
                  projectId={projectId!}
                  lookaheadId={lookaheadId!}
                  companyId={profile?.company_id || ""}
                  existingTaskIds={existingTaskIds}
                  dates={dates}
                  onTasksPulled={fetchData}
                />
                <Button variant="outline" size="sm" onClick={handlePullFromLastWeek}>
                  <Copy className="mr-1 h-3.5 w-3.5" /> Pull Last Week
                </Button>
                <Button variant="outline" size="sm" onClick={handleSmartFill}>
                  <Sparkles className="mr-1 h-3.5 w-3.5" /> Smart Fill
                </Button>
                <Button variant="outline" size="sm" onClick={handleAddCustomLine}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add Line
                </Button>
                <Button variant="outline" size="sm" onClick={() => saveDraft()} disabled={saveStatus === "saving"}>
                  <Save className="mr-1 h-3.5 w-3.5" /> {saveStatus === "saving" ? "Saving..." : "Save"}
                </Button>
                <Button size="sm" onClick={handleSubmit} disabled={submitting}>
                  <SendHorizonal className="mr-1 h-3.5 w-3.5" /> Submit
                </Button>
              </div>
              {/* Mobile: dropdown menu */}
              <div className="md:hidden flex items-center gap-2">
                <Button size="sm" onClick={handleSubmit} disabled={submitting}>
                  <SendHorizonal className="mr-1 h-3.5 w-3.5" /> Submit
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleSmartFill}>
                      <Sparkles className="mr-2 h-4 w-4" /> Smart Fill
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handlePullFromLastWeek}>
                      <Copy className="mr-2 h-4 w-4" /> Pull Last Week
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleAddCustomLine}>
                      <Plus className="mr-2 h-4 w-4" /> Add Line
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => saveDraft()} disabled={saveStatus === "saving"}>
                      <Save className="mr-2 h-4 w-4" /> Save Now
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={generatingPDF} onClick={async () => {
                      setGeneratingPDF(true);
                      try {
                        await generateLookaheadPDF(project?.name || "", lookAhead?.week_start_date || "", profile?.display_name || "Superintendent", lines, dates, null);
                      } finally {
                        setGeneratingPDF(false);
                      }
                    }}>
                      <FileDown className="mr-2 h-4 w-4" /> Export PDF
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          )}
          <Button variant="outline" size="sm" disabled={generatingPDF} className="hidden md:inline-flex" onClick={async () => {
              setGeneratingPDF(true);
              try {
                await generateLookaheadPDF(project?.name || "", lookAhead?.week_start_date || "", profile?.display_name || "Superintendent", lines, dates, null);
              } finally {
                setGeneratingPDF(false);
              }
            }}>
              <FileDown className="mr-1 h-3.5 w-3.5" /> {generatingPDF ? "Generating..." : "Export PDF"}
            </Button>
          {isOwner && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10">
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> <span className="hidden md:inline">Delete</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Look-Ahead?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this look-ahead and all its task lines. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={async () => {
                      await supabase.from("lookahead_lines").delete().eq("lookahead_id", lookaheadId!);
                      await supabase.from("look_aheads").delete().eq("id", lookaheadId!);
                      toast({ title: "Look-ahead deleted" });
                      navigate(`/projects/${projectId}`);
                    }}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* PPC Bar */}
      {ppcStats.planned > 0 && (
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-semibold">
              PPC:{" "}
              <span className={
                ppcStats.ppc! >= 80 ? "text-green-600 dark:text-green-400" :
                ppcStats.ppc! >= 60 ? "text-yellow-600 dark:text-yellow-400" :
                "text-red-600 dark:text-red-400"
              }>
                {ppcStats.ppc}%
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              {ppcStats.completed} of {ppcStats.planned} planned tasks completed
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                ppcStats.ppc! >= 80 ? "bg-green-500" :
                ppcStats.ppc! >= 60 ? "bg-yellow-500" :
                "bg-red-500"
              }`}
              style={{ width: `${ppcStats.ppc}%` }}
            />
          </div>
        </div>
      )}


      {/* Filter + Legend */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="hidden md:flex items-center gap-3">
          <StatusLegend />
          <Button
            variant={showHidden ? "default" : "outline"}
            size="sm"
            onClick={() => setShowHidden(!showHidden)}
            className="text-xs"
          >
            {showHidden ? <Eye className="mr-1 h-3 w-3" /> : <EyeOff className="mr-1 h-3 w-3" />}
            {showHidden ? "Hide Hidden" : "Show Hidden"}
            {hiddenCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] leading-none">
                {hiddenCount}
              </span>
            )}
          </Button>
        </div>
        <div className="relative w-full md:w-64">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter by task or trade..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
      </div>

      {/* Empty State Cards */}
      {lines.length === 0 && !filter && !isReadOnly && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => {
              const pullBtn = document.querySelector('[data-pull-tasks-trigger]') as HTMLButtonElement;
              pullBtn?.click();
            }}
            className="rounded-lg border bg-card p-6 text-left hover:border-primary/50 hover:bg-accent/30 transition-colors"
          >
            <Download className="h-6 w-6 mb-3 text-primary" />
            <h3 className="font-semibold mb-1">Pull Tasks from Schedule</h3>
            <p className="text-sm text-muted-foreground">Import tasks from your master schedule into this look-ahead.</p>
          </button>
          <button
            onClick={handlePullFromLastWeek}
            className="rounded-lg border bg-card p-6 text-left hover:border-primary/50 hover:bg-accent/30 transition-colors"
          >
            <Copy className="h-6 w-6 mb-3 text-primary" />
            <h3 className="font-semibold mb-1">Carry Over from Last Week</h3>
            <p className="text-sm text-muted-foreground">Pull incomplete tasks from the previous look-ahead.</p>
          </button>
          <button
            onClick={handleAddCustomLine}
            className="rounded-lg border bg-card p-6 text-left hover:border-primary/50 hover:bg-accent/30 transition-colors"
          >
            <Plus className="h-6 w-6 mb-3 text-primary" />
            <h3 className="font-semibold mb-1">Add Custom Task</h3>
            <p className="text-sm text-muted-foreground">Manually create a new task line for this look-ahead.</p>
          </button>
        </div>
      )}

      {/* Mobile Card View */}
      {isMobile ? (
        (filteredLines.length > 0 || filter) && (
          <div className="space-y-3">
            {filteredLines.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-lg bg-card">
                No matching tasks.
              </div>
            ) : (
              filteredLines.map((line) => (
                <MobileTaskCard
                  key={line.id}
                  line={line}
                  dates={dates}
                  onStatusChange={handleStatusChange}
                  onFieldChange={handleFieldChange}
                  onDeleteLine={handleDeleteLine}
                  onNameChange={handleNameChange}
                  readOnly={isReadOnly}
                />
              ))
            )}
          </div>
        )
      ) : (
        /* Desktop/Tablet Table View */
        (filteredLines.length > 0 || filter || lines.length > 0) && (
          <div className="border rounded-lg overflow-auto bg-card">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <table className="w-full text-sm border-collapse">
                <thead className="bg-muted/50 sticky top-0 z-20">
                  <tr>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground sticky left-0 bg-muted/50 z-30 min-w-[200px]">
                      Task
                    </th>
                    <th className="text-left py-2 px-1 font-medium text-muted-foreground min-w-[80px]">Trade</th>
                    {dates.map((date, i) => {
                      const d = parseISO(date);
                      const isWeekend = [0, 6].includes(d.getDay());
                      return (
                        <React.Fragment key={date}>
                          {i === 7 && (
                            <th className="w-2 min-w-[8px] bg-border/40" />
                          )}
                          <th
                            className={`py-1 px-0.5 text-center font-medium text-muted-foreground text-[10px] leading-tight min-w-[36px] ${
                              isWeekend ? "bg-muted/80" : ""
                            }`}
                          >
                            <div>{format(d, "EEE")}</div>
                            <div>{format(d, "M/d")}</div>
                          </th>
                        </React.Fragment>
                      );
                    })}
                    <th className="text-left py-2 px-1 font-medium text-muted-foreground min-w-[120px]">Notes</th>
                    <th className="text-left py-2 px-1 font-medium text-muted-foreground min-w-[100px]">Root Cause</th>
                    <th className="text-left py-2 px-1 font-medium text-muted-foreground min-w-[100px]">Constraints</th>
                  </tr>
                  {/* Per-day PPC indicator row */}
                  {ppcStats.planned > 0 && (
                    <tr className="bg-muted/30">
                      <th className="text-left py-0.5 px-2 text-[9px] text-muted-foreground sticky left-0 bg-muted/30 z-30" colSpan={2}>
                        Daily PPC
                      </th>
                      {dates.map((date, i) => {
                        const day = ppcStats.perDay[date];
                        let dotClass = "bg-muted-foreground/20";
                        if (day && day.total > 0) {
                          const ratio = day.completed / day.total;
                          if (ratio >= 1) dotClass = "bg-green-500";
                          else if (ratio > 0) dotClass = "bg-yellow-500";
                          else dotClass = "bg-red-500";
                        }
                        return (
                          <React.Fragment key={date}>
                            {i === 7 && (
                              <th className="w-2 min-w-[8px] bg-border/40" />
                            )}
                            <th className="py-0.5 px-0.5 text-center">
                              <div className={`w-2.5 h-2.5 rounded-full mx-auto ${dotClass}`} title={day ? `${day.completed}/${day.total}` : "No tasks"} />
                            </th>
                          </React.Fragment>
                        );
                      })}
                      <th colSpan={3}></th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {filteredLines.length === 0 ? (
                    <tr>
                      <td colSpan={dates.length + 5} className="text-center py-8 text-muted-foreground">
                        No matching tasks.
                      </td>
                    </tr>
                  ) : (
                    <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                      {filteredLines.map((line) => (
                        <LookaheadRow
                          key={line.id}
                          line={line}
                          dates={dates}
                          onStatusChange={handleStatusChange}
                          onFieldChange={handleFieldChange}
                          onDeleteLine={handleDeleteLine}
                          onNameChange={handleNameChange}
                          onAddSubtask={handleAddSubtask}
                          onToggleHidden={handleToggleHidden}
                          readOnly={isReadOnly}
                          onRegisterRef={handleRegisterRef}
                          onNavigate={handleCellNavigate}
                          comparisonData={showComparison ? comparisonData : undefined}
                          masterTasks={masterTasks}
                          showHidden={showHidden}
                        />
                      ))}
                    </SortableContext>
                  )}
                </tbody>
              </table>
            </DndContext>

            {/* Quick add row button */}
            {!isReadOnly && (
              <button
                onClick={handleAddCustomLine}
                className="flex items-center gap-1.5 w-full px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors border-t"
              >
                <Plus className="h-3.5 w-3.5" /> Add task...
              </button>
            )}
          </div>
        )
      )}



      {/* Removed tasks section (comparison mode) */}
      {showComparison && comparisonData && (
        <RemovedTasksSection removedLines={comparisonData.removedLines} />
      )}

      {/* Three-button Delete/Hide Modal */}
      <AlertDialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <AlertDialogContent onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete or Hide?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTargetIds.length === 1
                ? "Deleting this task will permanently remove it from this Look-Ahead. If you just want to remove it from this view, you can hide it instead — the task will be preserved for future use."
                : `Deleting these ${deleteTargetIds.length} tasks will permanently remove them from this Look-Ahead. If you just want to remove them from this view, you can hide them instead.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" onClick={() => { setDeleteModalOpen(false); setDeleteTargetIds([]); }}>
              Cancel
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="default"
                className="bg-amber-500 hover:bg-amber-600 text-white"
                onClick={handleHideTargets}
              >
                <EyeOff className="mr-1 h-3.5 w-3.5" />
                Hide
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={handlePermanentDelete}
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Delete
              </Button>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
