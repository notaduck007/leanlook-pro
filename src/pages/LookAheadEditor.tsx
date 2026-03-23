import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, SendHorizonal, Loader2, Plus, Sparkles, FileDown, CheckCircle, XCircle, Copy, Search } from "lucide-react";
import { format, addDays, parseISO, subWeeks, isWithinInterval, isBefore, isAfter } from "date-fns";
import { LookaheadRow, LookaheadLineData } from "@/components/lookahead/LookaheadRow";
import { StatusLegend } from "@/components/lookahead/StatusLegend";
import { DayStatus } from "@/components/lookahead/StatusCell";
import { generateLookaheadPDF } from "@/components/lookahead/LookaheadPDF";

export default function LookAheadEditor() {
  const { id: projectId, lookaheadId } = useParams<{ id: string; lookaheadId: string }>();
  const { user, profile, roles } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [lookAhead, setLookAhead] = useState<any>(null);
  const [project, setProject] = useState<any>(null);
  const [lines, setLines] = useState<LookaheadLineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState("");
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const saveDraftRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const isAdmin = roles.includes("admin");
  const isPM = roles.includes("pm");
  const canReview = isAdmin || isPM;

  const dates: string[] = lookAhead
    ? Array.from({ length: 14 }, (_, i) =>
        format(addDays(parseISO(lookAhead.week_start_date), i), "yyyy-MM-dd")
      )
    : [];

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
        task_name: l.task_id ? taskMap[l.task_id]?.name || "Unknown Task" : l.custom_text || "",
        assigned_trade: l.assigned_trade,
        materials_needed: l.materials_needed,
        constraints: l.constraints,
        notes: l.notes,
        photos: (l.photos as string[]) || [],
        status_per_day: (l.status_per_day as Record<string, DayStatus>) || {},
        sort_order: l.sort_order || 0,
      }));

      setLines(mappedLines);
    }

    setLoading(false);
  }, [lookaheadId, projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveDraftRef.current(), 2000);
  }, []);

  const handleStatusChange = (lineId: string, date: string, status: DayStatus) => {
    setLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? { ...l, status_per_day: { ...l.status_per_day, [date]: status } }
          : l
      )
    );
    scheduleSave();
  };

  const handleFieldChange = (lineId: string, field: string, value: string) => {
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, [field]: value } : l))
    );
    scheduleSave();
  };

  const handleDeleteLine = async (lineId: string) => {
    await supabase.from("lookahead_lines").delete().eq("id", lineId);
    setLines((prev) => prev.filter((l) => l.id !== lineId));
    toast({ title: "Row deleted" });
  };

  const saveDraft = async () => {
    setSaving(true);
    const updates = lines.map((l) =>
      supabase
        .from("lookahead_lines")
        .update({
          status_per_day: l.status_per_day,
          notes: l.notes,
          assigned_trade: l.assigned_trade,
          materials_needed: l.materials_needed,
          constraints: l.constraints,
        })
        .eq("id", l.id)
    );
    await Promise.all(updates);
    setSaving(false);
  };
  saveDraftRef.current = saveDraft;

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

  const handleSubmit = async () => {
    setSubmitting(true);
    await saveDraft();
    await supabase
      .from("look_aheads")
      .update({ status: "submitted" })
      .eq("id", lookaheadId!);

    // Notify admins/PMs
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
        },
      ]);
    }
  };

  const handleSmartFill = async () => {
    if (!lookAhead || !projectId || !profile?.company_id) return;

    const weekStart = parseISO(lookAhead.week_start_date);
    const weekEnd = addDays(weekStart, 13); // 14-day window
    const weekStartStr = format(weekStart, "yyyy-MM-dd");
    const weekEndStr = format(weekEnd, "yyyy-MM-dd");

    // 1. Get latest schedule version for this project
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

    // 2. Fetch all tasks that overlap the 2-week window
    const { data: allTasks } = await supabase
      .from("tasks")
      .select("*")
      .eq("schedule_version_id", versions[0].id);

    if (!allTasks?.length) {
      toast({ title: "No tasks found in schedule", variant: "destructive" });
      return;
    }

    // Filter to tasks that overlap the look-ahead window
    const overlappingTasks = allTasks.filter((t) => {
      if (!t.start_date && !t.finish_date) return false;
      const taskStart = t.start_date ? parseISO(t.start_date) : null;
      const taskEnd = t.finish_date ? parseISO(t.finish_date) : taskStart;
      if (!taskStart && !taskEnd) return false;
      // Task overlaps if it starts before window ends AND finishes after window starts
      const startsBeforeEnd = taskStart ? !isAfter(taskStart, weekEnd) : true;
      const endsAfterStart = taskEnd ? !isBefore(taskEnd, weekStart) : true;
      return startsBeforeEnd && endsAfterStart;
    });

    if (!overlappingTasks.length) {
      toast({ title: "No tasks overlap this 2-week window", description: "Check your master schedule dates." });
      return;
    }

    // 3. Find which tasks already have lines in this look-ahead
    const existingTaskIds = new Set(lines.filter((l) => l.task_id).map((l) => l.task_id));
    const newTasks = overlappingTasks.filter((t) => !existingTaskIds.has(t.id));

    // 4. Insert new lookahead_lines for missing tasks
    let addedCount = 0;
    if (newTasks.length > 0) {
      const maxSort = lines.reduce((max, l) => Math.max(max, l.sort_order), 0);
      const newLineInserts = newTasks.map((t, i) => ({
        lookahead_id: lookaheadId!,
        company_id: profile.company_id!,
        task_id: t.id,
        sort_order: maxSort + i + 1,
        status_per_day: {},
        assigned_trade: (t.tags as string[] || []).join(", ") || null,
      }));

      const { data: inserted, error } = await supabase
        .from("lookahead_lines")
        .insert(newLineInserts)
        .select("*");

      if (error) {
        console.error("Error inserting lines:", error);
      } else if (inserted) {
        addedCount = inserted.length;
        // Map inserted lines to LookaheadLineData
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

    // 5. Build a task lookup for date-aware filling
    const taskDateMap: Record<string, { start: Date | null; end: Date | null }> = {};
    for (const t of overlappingTasks) {
      taskDateMap[t.id] = {
        start: t.start_date ? parseISO(t.start_date) : null,
        end: t.finish_date ? parseISO(t.finish_date) : (t.start_date ? parseISO(t.start_date) : null),
      };
    }

    // 6. Fill "planned" only on days within each task's actual schedule dates
    let filled = 0;
    setLines((prev) =>
      prev.map((l) => {
        const newStatus = { ...l.status_per_day };
        const taskDates = l.task_id ? taskDateMap[l.task_id] : null;

        dates.forEach((date) => {
          if (newStatus[date]) return; // Don't overwrite existing status

          if (taskDates) {
            // Only mark planned if this date falls within task's schedule
            const d = parseISO(date);
            const afterStart = taskDates.start ? !isBefore(d, taskDates.start) : true;
            const beforeEnd = taskDates.end ? !isAfter(d, taskDates.end) : true;
            if (afterStart && beforeEnd) {
              newStatus[date] = "planned";
              filled++;
            }
          }
          // Custom lines (no task_id) — don't auto-fill, user manages manually
        });

        return { ...l, status_per_day: newStatus };
      })
    );

    setTimeout(() => saveDraftRef.current(), 500);
    toast({
      title: "Smart Fill complete",
      description: `${addedCount} tasks added from schedule, ${filled} cells marked as planned based on task dates.`,
    });
  };

  const handlePullFromLastWeek = async () => {
    if (!projectId || !lookaheadId || !profile?.company_id || !lookAhead) return;

    // Find the previous look-ahead
    const prevWeekStart = format(subWeeks(parseISO(lookAhead.week_start_date), 2), "yyyy-MM-dd");
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

    // Get incomplete lines from the previous look-ahead
    const { data: prevLines } = await supabase
      .from("lookahead_lines")
      .select("*")
      .eq("lookahead_id", prevLAs[0].id);

    if (!prevLines?.length) {
      toast({ title: "No lines to pull forward" });
      return;
    }

    // Filter to lines that had N or incomplete status on last days
    const incompleteLines = prevLines.filter((pl) => {
      const statuses = Object.values((pl.status_per_day as Record<string, string>) || {});
      return statuses.includes("N") || statuses.includes("planned") || statuses.includes("progress");
    });

    if (!incompleteLines.length) {
      toast({ title: "All previous tasks were completed!" });
      return;
    }

    // Get task names
    const taskIds = incompleteLines.filter((l) => l.task_id).map((l) => l.task_id!);
    let taskMap: Record<string, any> = {};
    if (taskIds.length > 0) {
      const { data: tasks } = await supabase.from("tasks").select("*").in("id", taskIds);
      taskMap = (tasks || []).reduce((acc, t) => ({ ...acc, [t.id]: t }), {});
    }

    // Check for existing task_ids to avoid duplicates
    const existingTaskIds = new Set(lines.filter((l) => l.task_id).map((l) => l.task_id));
    const newLines = incompleteLines.filter((l) => !l.task_id || !existingTaskIds.has(l.task_id));

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

  // Filter lines
  const filteredLines = filter
    ? lines.filter(
        (l) =>
          l.task_name.toLowerCase().includes(filter.toLowerCase()) ||
          (l.assigned_trade || "").toLowerCase().includes(filter.toLowerCase())
      )
    : lines;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/projects/${projectId}`)}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <div>
            <h1 className="text-xl font-bold">{project?.name}</h1>
            <p className="text-sm text-muted-foreground">
              Week of {lookAhead ? format(parseISO(lookAhead.week_start_date), "MMM d, yyyy") : "..."} ·{" "}
              <span className="capitalize">{lookAhead?.status}</span> · {lines.length} tasks
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Review actions for PM/Admin on submitted look-aheads */}
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
          {/* Edit actions for the owner when not submitted/approved */}
          {isOwner && (lookAhead?.status === "draft" || isRejected) && (
            <>
              <Button variant="outline" size="sm" onClick={handlePullFromLastWeek}>
                <Copy className="mr-1 h-3.5 w-3.5" /> Pull Last Week
              </Button>
              <Button variant="outline" size="sm" onClick={handleSmartFill}>
                <Sparkles className="mr-1 h-3.5 w-3.5" /> Smart Fill
              </Button>
              <Button variant="outline" size="sm" onClick={handleAddCustomLine}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add Line
              </Button>
              <Button variant="outline" size="sm" onClick={saveDraft} disabled={saving}>
                <Save className="mr-1 h-3.5 w-3.5" /> {saving ? "Saving..." : "Save"}
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={submitting}>
                <SendHorizonal className="mr-1 h-3.5 w-3.5" /> Submit
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => generateLookaheadPDF(project?.name || "", lookAhead?.week_start_date || "", profile?.display_name || "Superintendent", lines, dates)}>
            <FileDown className="mr-1 h-3.5 w-3.5" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Filter + Legend */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <StatusLegend />
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter by task or trade..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-auto bg-card">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-muted/50 sticky top-0 z-20">
            <tr>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground sticky left-0 bg-muted/50 z-30 min-w-[200px]">
                Task
              </th>
              <th className="text-left py-2 px-1 font-medium text-muted-foreground min-w-[80px]">Trade</th>
              {dates.map((date) => {
                const d = parseISO(date);
                const isWeekend = [0, 6].includes(d.getDay());
                return (
                  <th
                    key={date}
                    className={`py-1 px-0.5 text-center font-medium text-muted-foreground text-[10px] leading-tight min-w-[36px] ${
                      isWeekend ? "bg-muted/80" : ""
                    }`}
                  >
                    <div>{format(d, "EEE")}</div>
                    <div>{format(d, "M/d")}</div>
                  </th>
                );
              })}
              <th className="text-left py-2 px-1 font-medium text-muted-foreground min-w-[120px]">Notes</th>
              <th className="text-left py-2 px-1 font-medium text-muted-foreground min-w-[100px]">Materials</th>
              <th className="text-left py-2 px-1 font-medium text-muted-foreground min-w-[100px]">Constraints</th>
            </tr>
          </thead>
          <tbody>
            {filteredLines.length === 0 ? (
              <tr>
                <td colSpan={dates.length + 5} className="text-center py-8 text-muted-foreground">
                  {filter ? "No matching tasks." : "No tasks yet. Add a custom line or upload a schedule first."}
                </td>
              </tr>
            ) : (
              filteredLines.map((line) => (
                <LookaheadRow
                  key={line.id}
                  line={line}
                  dates={dates}
                  onStatusChange={handleStatusChange}
                  onFieldChange={handleFieldChange}
                  readOnly={isReadOnly}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
