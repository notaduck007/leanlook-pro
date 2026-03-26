import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MasterTaskRecord {
  id: string;
  name: string;
  category: string | null;
  default_duration: number | null;
  default_trade: string | null;
  description: string | null;
  status: string;
}

export function useMasterTasks() {
  const [tasks, setTasks] = useState<MasterTaskRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from("master_tasks")
      .select("id, name, category, default_duration, default_trade, description, status")
      .eq("status", "active")
      .order("name");
    if (data) setTasks(data as unknown as MasterTaskRecord[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`master-tasks-ac-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "master_tasks" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  return { tasks, loading, reload: load };
}
