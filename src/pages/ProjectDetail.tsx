import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, FileText, CalendarDays, Loader2, Eye, Clock, Trash2, Download, Pencil, MoreVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { GanttChart } from "@/components/project/GanttChart";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [project, setProject] = useState<any>(null);
  const [scheduleVersions, setScheduleVersions] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [lookAheads, setLookAheads] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [editingVersion, setEditingVersion] = useState<any>(null);
  const [editVersionNumber, setEditVersionNumber] = useState("");
  const [deleteVersionId, setDeleteVersionId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    const [projRes, versionsRes, laRes] = await Promise.all([
      supabase.from("projects").select("*").eq("id", id).single(),
      supabase.from("schedule_versions").select("*").eq("project_id", id).order("version_number", { ascending: false }),
      supabase.from("look_aheads").select("*").eq("project_id", id).order("week_start_date", { ascending: false }),
    ]);
    setProject(projRes.data);
    setScheduleVersions(versionsRes.data || []);
    setLookAheads(laRes.data || []);

    if (versionsRes.data && versionsRes.data.length > 0) {
      const latestVersion = versionsRes.data[0];
      const { data: tasksData } = await supabase
        .from("tasks")
        .select("*")
        .eq("schedule_version_id", latestVersion.id)
        .order("name");
      setTasks(tasksData || []);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id || !profile?.company_id) return;

    setUploading(true);
    const filePath = `${profile.company_id}/${id}/${Date.now()}_${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("schedules")
      .upload(filePath, file);

    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const nextVersion = (scheduleVersions[0]?.version_number || 0) + 1;
    const { data: versionData, error: versionError } = await supabase
      .from("schedule_versions")
      .insert({
        project_id: id,
        company_id: profile.company_id,
        file_url: filePath,
        version_number: nextVersion,
      })
      .select()
      .single();

    setUploading(false);

    if (versionError) {
      toast({ title: "Error", description: versionError.message, variant: "destructive" });
      return;
    }

    toast({ title: "Schedule uploaded!", description: `Version ${nextVersion} — now parsing...` });
    setParsing(true);

    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke("parse-schedule", {
        body: {
          schedule_version_id: versionData.id,
          file_url: filePath,
          company_id: profile.company_id,
        },
      });
      if (fnError) throw fnError;
      toast({ title: "Schedule parsed!", description: `${fnData?.task_count || 0} tasks loaded successfully.` });
    } catch {
      toast({ title: "Parsing notice", description: "Schedule uploaded. AI parsing will be available once the edge function is deployed." });
    }

    setParsing(false);
    fetchData();
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "draft": return "secondary";
      case "submitted": return "default";
      case "approved": return "default";
      case "rejected": return "destructive";
      default: return "secondary";
    }
  };

  const handleDownloadVersion = async (fileUrl: string) => {
    const { data } = await supabase.storage.from("schedules").createSignedUrl(fileUrl, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else toast({ title: "Download failed", variant: "destructive" });
  };

  const handleUpdateVersion = async () => {
    if (!editingVersion) return;
    const num = parseInt(editVersionNumber);
    if (isNaN(num) || num < 1) {
      toast({ title: "Invalid version number", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("schedule_versions")
      .update({ version_number: num })
      .eq("id", editingVersion.id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Version updated" }); fetchData(); }
    setEditingVersion(null);
  };

  const handleDeleteVersion = async (versionId: string) => {
    // Delete associated tasks first
    await supabase.from("tasks").delete().eq("schedule_version_id", versionId);
    const { error } = await supabase.from("schedule_versions").delete().eq("id", versionId);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Version deleted" }); fetchData(); }
    setDeleteVersionId(null);
  };

  if (!project) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 overflow-hidden">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate("/projects")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <p className="text-sm text-muted-foreground capitalize">{project.status}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Upload */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4" /> Upload Schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
              {uploading || parsing ? (
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {uploading ? "Uploading..." : "AI is parsing your schedule..."}
                  </p>
                </div>
              ) : (
                <>
                  <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                   <p className="text-sm text-muted-foreground text-center">Drop PDF, Excel, CSV, or MPP</p>
                   <p className="text-xs text-muted-foreground mt-1">MS Project (.mpp) / Primavera / Excel exports</p>
                 </>
               )}
               <input type="file" className="hidden" accept=".pdf,.xlsx,.xls,.csv,.mpp,.mpt" onChange={handleFileUpload} disabled={uploading || parsing} />
            </label>
          </CardContent>
        </Card>

        {/* Schedule History */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Schedule Versions</CardTitle>
          </CardHeader>
          <CardContent>
            {scheduleVersions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No schedules uploaded yet.</p>
            ) : (
              <div className="space-y-2">
                {scheduleVersions.map((v) => (
                  <div key={v.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-primary" />
                      <div>
                        <p className="text-sm font-medium">Version {v.version_number}</p>
                        <p className="text-xs text-muted-foreground">{new Date(v.uploaded_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleDownloadVersion(v.file_url)}>
                          <Download className="mr-2 h-4 w-4" /> Download
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setEditingVersion(v); setEditVersionNumber(String(v.version_number)); }}>
                          <Pencil className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteVersionId(v.id)}>
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Look-Aheads */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4" /> Look-Aheads
          </CardTitle>
          <Button size="sm" onClick={() => navigate(`/projects/${id}/lookahead/new`)}>
            <CalendarDays className="mr-2 h-4 w-4" /> New Look-Ahead
          </Button>
        </CardHeader>
        <CardContent>
          {lookAheads.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No look-aheads created yet. Create one to start tracking daily progress.
            </p>
          ) : (
            <div className="space-y-2">
              {lookAheads.map((la) => (
                <div
                  key={la.id}
                  className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/projects/${id}/lookahead/${la.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">
                        Week of {format(new Date(la.week_start_date + "T00:00:00"), "MMM d, yyyy")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Created {format(new Date(la.created_at), "MMM d")}
                      </p>
                    </div>
                  </div>
                   <div className="flex items-center gap-2">
                    <Badge variant={statusColor(la.status) as any} className="capitalize text-xs">
                      {la.status}
                    </Badge>
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
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
                            onClick={async (e) => {
                              e.stopPropagation();
                              await supabase.from("lookahead_lines").delete().eq("lookahead_id", la.id);
                              await supabase.from("look_aheads").delete().eq("id", la.id);
                              toast({ title: "Look-ahead deleted" });
                              fetchData();
                            }}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gantt Chart */}
      {tasks.length > 0 && (
        <Card className="overflow-hidden">
          <Collapsible defaultOpen>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Schedule Timeline</CardTitle>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">Toggle</Button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="p-0">
                <GanttChart tasks={tasks} />
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      {/* Tasks from latest schedule */}
      {tasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Parsed Tasks ({tasks.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Task</th>
                    <th className="pb-2 font-medium text-muted-foreground">Start</th>
                    <th className="pb-2 font-medium text-muted-foreground">Finish</th>
                    <th className="pb-2 font-medium text-muted-foreground">% Complete</th>
                    <th className="pb-2 font-medium text-muted-foreground">Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.slice(0, 20).map((task) => (
                    <tr key={task.id} className="border-b last:border-0">
                      <td className="py-2 font-medium">{task.name}</td>
                      <td className="py-2 text-muted-foreground">{task.start_date || "—"}</td>
                      <td className="py-2 text-muted-foreground">{task.finish_date || "—"}</td>
                      <td className="py-2">{task.percent_complete}%</td>
                      <td className="py-2">
                        <div className="flex gap-1 flex-wrap">
                          {(task.tags || []).map((tag: string) => (
                            <span key={tag} className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tasks.length > 20 && (
                <p className="text-sm text-muted-foreground mt-2">Showing 20 of {tasks.length} tasks</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Version Dialog */}
      <Dialog open={!!editingVersion} onOpenChange={(open) => !open && setEditingVersion(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Schedule Version</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Version Number</Label>
              <Input type="number" min={1} value={editVersionNumber} onChange={(e) => setEditVersionNumber(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Uploaded: {editingVersion && new Date(editingVersion.uploaded_at).toLocaleString()}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingVersion(null)}>Cancel</Button>
            <Button onClick={handleUpdateVersion}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Version Confirmation */}
      <AlertDialog open={!!deleteVersionId} onOpenChange={(open) => !open && setDeleteVersionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Schedule Version?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this schedule version and all its parsed tasks. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteVersionId && handleDeleteVersion(deleteVersionId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}