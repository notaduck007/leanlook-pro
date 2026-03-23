import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Construction tag categories based on real schedule patterns
const TAG_RULES: Record<string, string[]> = {
  "MEP": ["mep", "mechanical", "electrical", "plumbing", "hvac", "ahu", "chiller", "boiler", "ductwork", "piping", "conduit", "panel", "transformer", "vav", "diffuser"],
  "Structural": ["structural", "steel", "concrete", "foundation", "pier", "drilled pier", "grade beam", "slab", "footing", "rebar", "formwork", "shoring", "framing", "decking"],
  "Demolition": ["demo", "demolition", "abatement", "sawcut", "removal", "strip", "gut"],
  "Finishes": ["finish", "paint", "flooring", "tile", "ceiling", "drywall", "millwork", "casework", "specialties", "trim", "carpet", "vct", "epoxy"],
  "Roofing": ["roof", "roofing", "membrane", "flashing", "waterproofing", "envelope"],
  "Sitework": ["site", "sitework", "grading", "paving", "asphalt", "curb", "sidewalk", "landscape", "irrigation", "erosion", "clearing", "grub", "excavat", "backfill", "compaction"],
  "Concrete": ["concrete", "pour", "slab", "cure", "form", "rebar", "cmu", "masonry", "block", "brick"],
  "Electrical": ["electrical", "wiring", "conduit", "panel", "switchgear", "gear", "data", "security", "av", "low voltage", "fire alarm"],
  "Plumbing": ["plumbing", "fixture", "sanitary", "water", "waste", "vent", "gas line", "underground util"],
  "HVAC": ["hvac", "ahu", "chiller", "boiler", "duct", "diffuser", "thermostat", "refrigerant", "vav", "air handler"],
  "Fire Protection": ["fire protect", "sprinkler", "fire alarm", "suppression", "standpipe"],
  "Doors & Hardware": ["door", "hardware", "frame", "closer", "lock"],
  "Windows & Glazing": ["window", "glazing", "glass", "storefront", "curtain wall"],
  "Inspection": ["inspection", "inspect", "test", "commission", "punch", "walkthrough", "substantial completion"],
  "Critical": ["critical", "milestone", "substantial completion", "final completion", "turnover", "permit", "board approval"],
  "Preconstruction": ["precon", "submittal", "lead time", "procurement", "bid", "gmp", "pricing", "permit", "design"],
  "Interior": ["interior", "framing", "drywall", "insulation", "prime", "paint", "ceiling grid", "rough-in"],
  "Exterior": ["exterior", "framing", "sheathing", "brick", "stone", "stucco", "siding", "canopy", "entry"],
};

function autoTag(taskName: string): string[] {
  const lower = taskName.toLowerCase();
  const tags: string[] = [];
  for (const [tag, keywords] of Object.entries(TAG_RULES)) {
    if (keywords.some(kw => lower.includes(kw))) {
      tags.push(tag);
    }
  }
  return [...new Set(tags)];
}

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
    let isMpp = false;

    if (fileName.endsWith(".csv")) {
      fileContent = await fileData.text();
    } else if (fileName.endsWith(".mpp") || fileName.endsWith(".mpt")) {
      // MPP files are binary - send raw bytes as base64 for AI vision analysis
      isMpp = true;
      const buffer = await fileData.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      // Extract readable text strings from the binary MPP (UTF-16LE encoded task names)
      const strings: string[] = [];
      for (let i = 0; i < bytes.length - 1; i++) {
        const chars: string[] = [];
        while (i < bytes.length - 1) {
          const lo = bytes[i], hi = bytes[i + 1];
          if (hi === 0 && lo >= 32 && lo < 127) {
            chars.push(String.fromCharCode(lo));
            i += 2;
          } else break;
        }
        if (chars.length >= 4) strings.push(chars.join(""));
      }
      // Deduplicate and filter task-like strings
      const unique = [...new Set(strings)].filter(s => 
        s.length >= 4 && 
        !s.match(/^[A-F0-9]+$/i) && // skip hex strings
        !s.match(/^\d+$/) && // skip pure numbers
        !s.startsWith("Microsoft") &&
        !s.startsWith("Windows") &&
        !s.includes("\\")
      );
      fileContent = `[Microsoft Project (.mpp) file - extracted task names and metadata]:\n\n${unique.join("\n")}`;
    } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
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
    const systemPrompt = `You are a construction schedule parser specializing in extracting task hierarchies from construction project schedules (P6, MS Project, etc).

Extract ALL tasks with their full hierarchy. Return a JSON array of tasks. Each task must have:
- external_id: unique identifier (WBS code or sequential number)
- name: exact task name as written
- duration: duration string (e.g. "5 days", "2 weeks") or null
- start_date: YYYY-MM-DD format or null
- finish_date: YYYY-MM-DD format or null
- percent_complete: number 0-100
- parent_name: name of the parent/summary task for hierarchy, null for top-level
- predecessors: array of external_ids this task depends on
- tags: array of construction category tags

Common construction schedule categories to tag:
MEP, Structural, Demolition, Finishes, Roofing, Sitework, Concrete, Electrical, Plumbing, HVAC, Fire Protection, Doors & Hardware, Windows & Glazing, Inspection, Critical, Preconstruction, Interior, Exterior

${isMpp ? `This is data extracted from a Microsoft Project (.mpp) file. The text contains task names extracted from the binary file. Reconstruct the likely hierarchy based on naming patterns (e.g. "Construction > Sitework > Grading"). Tasks like "Preconstruction", "Construction", "Sitework" are likely summary/parent tasks.` : ""}

Be thorough - extract EVERY single task. Preserve the exact hierarchy structure.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Parse this construction schedule and extract all tasks:\n\n${fileContent}` },
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

    // Enhance AI tags with rule-based auto-tagging
    const taskInserts = extractedTasks.map((t: any) => {
      const aiTags = t.tags || [];
      const ruleTags = autoTag(t.name);
      const allTags = [...new Set([...aiTags, ...ruleTags])];

      return {
        schedule_version_id,
        company_id,
        external_id: t.external_id,
        name: t.name,
        duration: t.duration || null,
        start_date: t.start_date || null,
        finish_date: t.finish_date || null,
        percent_complete: t.percent_complete || 0,
        predecessors: t.predecessors || [],
        tags: allTags,
        metadata: { parent_name: t.parent_name },
      };
    });

    // Insert in batches of 50 to avoid payload limits
    const batchSize = 50;
    for (let i = 0; i < taskInserts.length; i += batchSize) {
      const batch = taskInserts.slice(i, i + batchSize);
      const { error: insertError } = await supabase.from("tasks").insert(batch);
      if (insertError) {
        console.error("Insert error at batch", i, insertError);
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
