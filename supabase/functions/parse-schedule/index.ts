import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { schedule_version_id, file_url, company_id } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Download the file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("schedules")
      .download(file_url);

    if (downloadError) throw downloadError;

    // Determine file type and extract text
    const fileName = file_url.toLowerCase();
    let fileContent = "";

    if (fileName.endsWith(".csv")) {
      fileContent = await fileData.text();
    } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      // For Excel, send as base64 to AI
      const buffer = await fileData.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer).slice(0, 50000)));
      fileContent = `[Excel file base64 preview - first 50KB]: ${base64}`;
    } else {
      // PDF - send as base64 for vision
      const buffer = await fileData.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer).slice(0, 100000)));
      fileContent = `[PDF file base64 - first 100KB]: ${base64}`;
    }

    // Call Lovable AI to parse
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a construction schedule parser. Extract ALL tasks from the provided schedule data. Return a JSON array of tasks. Each task should have: external_id (string), name (string), duration (string like "5 days"), start_date (YYYY-MM-DD or null), finish_date (YYYY-MM-DD or null), percent_complete (number 0-100), parent_name (string or null for hierarchy), predecessors (array of external_ids), tags (array of relevant tags like "MEP", "Finishes", "Demolition", "Critical", "Structural", "Roofing", "Electrical", "Plumbing", "HVAC", "Concrete", "Inspection"). Auto-generate relevant tags based on the task name. Be thorough - extract every single task.`,
          },
          {
            role: "user",
            content: `Parse this construction schedule and extract all tasks:\n\n${fileContent}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_tasks",
              description: "Extract tasks from a construction schedule",
              parameters: {
                type: "object",
                properties: {
                  tasks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        external_id: { type: "string" },
                        name: { type: "string" },
                        duration: { type: "string" },
                        start_date: { type: "string" },
                        finish_date: { type: "string" },
                        percent_complete: { type: "number" },
                        parent_name: { type: "string" },
                        predecessors: { type: "array", items: { type: "string" } },
                        tags: { type: "array", items: { type: "string" } },
                      },
                      required: ["external_id", "name"],
                    },
                  },
                },
                required: ["tasks"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_tasks" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tasks extracted from AI");

    const parsed = JSON.parse(toolCall.function.arguments);
    const extractedTasks = parsed.tasks || [];

    // Build parent map for hierarchy
    const parentMap = new Map<string, string>();
    
    // Insert tasks
    const taskInserts = extractedTasks.map((t: any) => ({
      schedule_version_id,
      company_id,
      external_id: t.external_id,
      name: t.name,
      duration: t.duration || null,
      start_date: t.start_date || null,
      finish_date: t.finish_date || null,
      percent_complete: t.percent_complete || 0,
      predecessors: t.predecessors || [],
      tags: t.tags || [],
      metadata: { parent_name: t.parent_name },
    }));

    if (taskInserts.length > 0) {
      const { error: insertError } = await supabase
        .from("tasks")
        .insert(taskInserts);

      if (insertError) {
        console.error("Insert error:", insertError);
        throw insertError;
      }
    }

    return new Response(
      JSON.stringify({ success: true, task_count: taskInserts.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Parse error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
