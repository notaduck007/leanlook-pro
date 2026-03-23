import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, SendHorizonal, Loader2, Plus, Sparkles, FileDown } from "lucide-react";
import { format, addDays, parseISO, isWithinInterval } from "date-fns";
import { LookaheadRow, LookaheadLineData } from "@/components/lookahead/LookaheadRow";
import { StatusLegend } from "@/components/lookahead/StatusLegend";
import { DayStatus } from "@/components/lookahead/StatusCell";
import { generateLookaheadPDF } from "@/components/lookahead/LookaheadPDF";

export default function LookAheadEditor() {
  const { id: projectId, lookaheadId } = useParams<{ id: string; lookaheadId: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [lookAhead, setLookAhead] = useState<any>(null);
  const [project, setProject] = useState<any>(null);
  const [lines, setLines] = useState<LookaheadLineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

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

    // Fetch lines with task info
    const { data: linesData } = await supabase
      .from("lookahead_lines")
      .select("*")
      .eq("lookahead_id", lookaheadId)
      .order("sort_order");

    if (linesData) {
      // Get task names for lines with task_ids
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

  // Auto-save debounce
  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveDraft(), 2000);
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

  const handleSubmit = async () => {
    setSubmitting(true);
    await saveDraft();
    await supabase
      .from("look_aheads")
      .update({ status: "submitted" })
      .eq("id", lookaheadId!);
    setSubmitting(false);
    toast({ title: "Look-ahead submitted for review!" });
    navigate(`/projects/${projectId}`);
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

  const handleSmartFill = () => {
    if (!lookAhead) return;
    setLines((prev) =>
      prev.map((l) => {
        if (!l.task_id) return l;
        const newStatus = { ...l.status_per_day };
        dates.forEach((date) => {
          if (!newStatus[date]) {
            newStatus[date] = "planned";
          }
        });
        return { ...l, status_per_day: newStatus };
      })
    );
    scheduleSave();
    toast({ title: "Smart Fill applied", description: "Planned status set for all empty cells." });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isReadOnly = lookAhead?.status === "submitted" || lookAhead?.status === "approved";

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
        <div className="flex items-center gap-2">
          {!isReadOnly && (
            <>
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
        </div>
      </div>

      {/* Legend */}
      <StatusLegend />

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
            {lines.length === 0 ? (
              <tr>
                <td colSpan={dates.length + 5} className="text-center py-8 text-muted-foreground">
                  No tasks yet. Add a custom line or upload a schedule first.
                </td>
              </tr>
            ) : (
              lines.map((line) => (
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
