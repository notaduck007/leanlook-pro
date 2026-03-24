import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Database, ChevronDown, ChevronRight, Pencil, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MasterSubtask {
  id: string;
  name: string;
  sort_order: number;
  category: string | null;
}

interface MasterTask {
  id: string;
  name: string;
  tags: string[];
  category: string | null;
  created_at: string;
  subtasks?: MasterSubtask[];
}

const categoryColors: Record<string, string> = {
  prep: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  execute: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  inspect: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  closeout: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

export default function MasterTasks() {
  const [tasks, setTasks] = useState<MasterTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [subtaskCache, setSubtaskCache] = useState<Record<string, MasterSubtask[]>>({});
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    supabase
      .from("master_tasks")
      .select("*")
      .order("name")
      .then(({ data }) => {
        setTasks((data as MasterTask[]) || []);
        setLoading(false);
      });
  }, []);

  const toggleExpand = async (taskId: string) => {
    const next = new Set(expandedIds);
    if (next.has(taskId)) {
      next.delete(taskId);
    } else {
      next.add(taskId);
      if (!subtaskCache[taskId]) {
        const { data } = await supabase
          .from("master_subtasks")
          .select("*")
          .eq("master_task_id", taskId)
          .order("sort_order");
        setSubtaskCache(prev => ({ ...prev, [taskId]: (data as MasterSubtask[]) || [] }));
      }
    }
    setExpandedIds(next);
  };

  const saveTaskName = async (taskId: string) => {
    if (!editValue.trim()) { setEditingTaskId(null); return; }
    const { error } = await supabase.from("master_tasks").update({ name: editValue.trim() }).eq("id", taskId);
    if (error) {
      toast({ title: "Failed to update", variant: "destructive" });
    } else {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, name: editValue.trim() } : t));
      toast({ title: "Task name updated" });
    }
    setEditingTaskId(null);
  };

  const saveSubtaskName = async (subtaskId: string, masterTaskId: string) => {
    if (!editValue.trim()) { setEditingSubtaskId(null); return; }
    const { error } = await supabase.from("master_subtasks").update({ name: editValue.trim() }).eq("id", subtaskId);
    if (error) {
      toast({ title: "Failed to update", variant: "destructive" });
    } else {
      setSubtaskCache(prev => ({
        ...prev,
        [masterTaskId]: (prev[masterTaskId] || []).map(st => st.id === subtaskId ? { ...st, name: editValue.trim() } : st),
      }));
      toast({ title: "Subtask name updated" });
    }
    setEditingSubtaskId(null);
  };

  const deleteSubtask = async (subtaskId: string, masterTaskId: string) => {
    const { error } = await supabase.from("master_subtasks").delete().eq("id", subtaskId);
    if (error) {
      toast({ title: "Failed to delete subtask", variant: "destructive" });
    } else {
      setSubtaskCache(prev => ({
        ...prev,
        [masterTaskId]: (prev[masterTaskId] || []).filter(st => st.id !== subtaskId),
      }));
      toast({ title: "Subtask deleted" });
    }
  };

  const filtered = tasks.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.tags || []).some(tag => tag.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6" /> Master Task Repository
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Global knowledge base of {tasks.length} construction tasks with AI-generated subtasks. Double-click any name to edit.
          </p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search tasks or tags..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {tasks.length === 0
              ? "No tasks yet. Upload a schedule to start building the repository."
              : "No tasks match your search."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(task => (
            <Card key={task.id} className="overflow-hidden">
              <button
                onClick={() => toggleExpand(task.id)}
                className="w-full text-left"
              >
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    {expandedIds.has(task.id) ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="flex-1 min-w-0">
                      {editingTaskId === task.id ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="h-7 text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveTaskName(task.id);
                              if (e.key === "Escape") setEditingTaskId(null);
                            }}
                          />
                          <button onClick={() => saveTaskName(task.id)} className="p-1 text-green-600 hover:bg-green-50 rounded">
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setEditingTaskId(null)} className="p-1 text-red-600 hover:bg-red-50 rounded">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <CardTitle
                          className="text-sm font-medium truncate cursor-pointer hover:underline"
                          onDoubleClick={(e) => { e.stopPropagation(); setEditValue(task.name); setEditingTaskId(task.id); }}
                          title="Double-click to edit"
                        >
                          {task.name}
                        </CardTitle>
                      )}
                    </div>
                    <div className="flex gap-1 flex-wrap justify-end">
                      {(task.tags || []).slice(0, 3).map(tag => (
                        <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                      ))}
                      {(task.tags || []).length > 3 && (
                        <Badge variant="outline" className="text-xs">+{task.tags.length - 3}</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
              </button>
              {expandedIds.has(task.id) && (
                <CardContent className="pt-0 pb-3 px-4">
                  <div className="ml-7 space-y-1">
                    {(subtaskCache[task.id] || []).length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Loading subtasks...</p>
                    ) : (
                      (subtaskCache[task.id] || []).map((st, idx) => (
                        <div key={st.id} className="flex items-center gap-2 py-1">
                          <span className="text-xs text-muted-foreground w-5">{idx + 1}.</span>
                          {editingSubtaskId === st.id ? (
                            <div className="flex items-center gap-1 flex-1">
                              <Input
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="h-6 text-sm flex-1"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveSubtaskName(st.id, task.id);
                                  if (e.key === "Escape") setEditingSubtaskId(null);
                                }}
                              />
                              <button onClick={() => saveSubtaskName(st.id, task.id)} className="p-0.5 text-green-600 hover:bg-green-50 rounded">
                                <Check className="h-3 w-3" />
                              </button>
                              <button onClick={() => setEditingSubtaskId(null)} className="p-0.5 text-red-600 hover:bg-red-50 rounded">
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <span
                              className="text-sm flex-1 cursor-pointer hover:underline"
                              onDoubleClick={() => { setEditValue(st.name); setEditingSubtaskId(st.id); }}
                              title="Double-click to edit"
                            >
                              {st.name}
                            </span>
                          )}
                          {st.category && editingSubtaskId !== st.id && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${categoryColors[st.category] || "bg-muted text-muted-foreground"}`}>
                              {st.category}
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
