// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const PLANNED = new Set(["Y", "N", "50", "progress", "planned"]);

const VARIANCE_LABELS: Record<string, string> = {
  make_ready: "Make Ready",
  manpower: "Manpower",
  material_equipment: "Material / Equipment",
  design: "Design",
  weather: "Weather",
  ahj: "AHJ",
  other: "Other",
};

function computePPC(lines: { status_per_day: Record<string, string> | null }[]) {
  let completed = 0, resolved = 0;
  for (const l of lines) {
    const spd = l.status_per_day || {};
    for (const s of Object.values(spd)) {
      if (!PLANNED.has(s)) continue;
      resolved++;
      if (s === "Y") completed++;
    }
  }
  return { completed, resolved, ppc: resolved > 0 ? Math.round((completed / resolved) * 100) : 0 };
}

function lastWeekRange() {
  const today = new Date();
  const day = today.getDay(); // 0..6
  const daysSinceMonday = (day + 6) % 7; // mon=0
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - daysSinceMonday);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  const lastSunday = new Date(thisMonday);
  lastSunday.setDate(thisMonday.getDate() - 1);
  return {
    startIso: lastMonday.toISOString().slice(0, 10),
    endIso: lastSunday.toISOString().slice(0, 10),
  };
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Weekly Digest <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
      }),
    });
    if (!res.ok) console.error("resend send failed", res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error("resend error", e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { startIso, endIso } = lastWeekRange();
  const result: any = { ok: true, week: { startIso, endIso }, companies: 0, notifications: 0, emails: 0, emailEnabled: !!RESEND_API_KEY };

  try {
    const { data: companies } = await admin.from("companies").select("id, name");
    for (const co of companies || []) {
      // Look-aheads in last week (approved/submitted only)
      const { data: las } = await admin
        .from("look_aheads")
        .select("id, project_id, week_start_date, status")
        .eq("company_id", co.id)
        .gte("week_start_date", startIso)
        .lte("week_start_date", endIso)
        .in("status", ["approved", "submitted"]);
      const laIds = (las || []).map((l: any) => l.id);

      let lines: any[] = [];
      if (laIds.length > 0) {
        const { data } = await admin
          .from("lookahead_lines")
          .select("lookahead_id, status_per_day, variance_reason")
          .in("lookahead_id", laIds);
        lines = data || [];
      }

      const ppc = computePPC(lines);

      // PPC by project
      const projectIds = [...new Set((las || []).map((l: any) => l.project_id))];
      const { data: projects } = projectIds.length > 0
        ? await admin.from("projects").select("id, name").in("id", projectIds)
        : { data: [] as any[] };
      const projectMap = new Map((projects || []).map((p: any) => [p.id, p.name]));
      const byProject = projectIds.map((pid) => {
        const projLAIds = (las || []).filter((l: any) => l.project_id === pid).map((l: any) => l.id);
        const projLines = lines.filter((l: any) => projLAIds.includes(l.lookahead_id));
        const p = computePPC(projLines);
        return { id: pid, name: projectMap.get(pid) || "Project", ...p };
      }).filter((p) => p.resolved > 0).sort((a, b) => b.ppc - a.ppc);

      // Top variance reasons (Pareto)
      const reasonCounts = new Map<string, number>();
      for (const l of lines) {
        const spd = l.status_per_day || {};
        const hasN = Object.values(spd).some((s) => s === "N");
        if (!hasN) continue;
        const k = l.variance_reason || "unassigned";
        reasonCounts.set(k, (reasonCounts.get(k) || 0) + 1);
      }
      const topReasons = [...reasonCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([k, n]) => ({ label: k === "unassigned" ? "Unassigned" : (VARIANCE_LABELS[k] || k), count: n }));

      // Open constraints
      const todayStr = new Date().toISOString().slice(0, 10);
      const { data: openCons } = await admin
        .from("project_constraints")
        .select("need_by_date, status")
        .eq("company_id", co.id)
        .in("status", ["open", "in_progress"]);
      const openConsCount = (openCons || []).length;
      const overdueConsCount = (openCons || []).filter((c: any) => c.need_by_date && c.need_by_date < todayStr).length;

      // Open corrective actions
      const { data: openCA } = await admin
        .from("corrective_actions")
        .select("due_date, status")
        .eq("company_id", co.id)
        .neq("status", "done");
      const openCACount = (openCA || []).length;
      const overdueCACount = (openCA || []).filter((a: any) => a.due_date && a.due_date < todayStr).length;

      // Recipients = admins + pms of the company
      const { data: profs } = await admin.from("profiles").select("user_id, display_name").eq("company_id", co.id);
      const profIds = (profs || []).map((p: any) => p.user_id);
      let recipientIds: string[] = [];
      if (profIds.length > 0) {
        const { data: roleRows } = await admin
          .from("user_roles")
          .select("user_id")
          .in("user_id", profIds)
          .in("role", ["admin", "pm"]);
        recipientIds = [...new Set((roleRows || []).map((r: any) => r.user_id))];
      }
      if (recipientIds.length === 0) continue;

      const subject = `${co.name} — Weekly PPC Digest (week of ${startIso})`;
      const summaryLines = [
        `Company PPC: ${ppc.ppc}% (${ppc.completed}/${ppc.resolved})`,
        byProject.length ? `Top projects: ${byProject.slice(0, 3).map((p) => `${p.name} ${p.ppc}%`).join(" · ")}` : null,
        topReasons.length ? `Top variance: ${topReasons.map((r) => `${r.label} ×${r.count}`).join(", ")}` : null,
        `Open constraints: ${openConsCount} (${overdueConsCount} overdue)`,
        `Open corrective actions: ${openCACount} (${overdueCACount} overdue)`,
      ].filter(Boolean).join("\n");

      // Dedup by week+company: skip if a digest notification with this link already exists
      const digestLink = `/analytics?digest=${startIso}`;
      const { data: existing } = await admin
        .from("notifications")
        .select("id")
        .eq("company_id", co.id)
        .eq("link", digestLink)
        .limit(1);
      if (existing && existing.length > 0) continue;

      // Send in-app notification to each recipient
      const rows = recipientIds.map((uid) => ({
        user_id: uid,
        company_id: co.id,
        title: subject,
        message: summaryLines,
        link: digestLink,
      }));
      const { error: insErr } = await admin.from("notifications").insert(rows as any);
      if (insErr) console.error("digest notif insert error", insErr);
      else result.notifications += rows.length;

      // Email
      if (RESEND_API_KEY) {
        // Lookup emails for recipients
        const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
        const emailMap = new Map((users?.users || []).map((u: any) => [u.id, u.email]));
        const html = `
          <h2>${co.name} — Weekly PPC Digest</h2>
          <p>Week of <strong>${startIso}</strong> – ${endIso}</p>
          <h3>Company PPC: ${ppc.ppc}% (${ppc.completed}/${ppc.resolved})</h3>
          ${byProject.length ? `<h4>PPC by project</h4><ul>${byProject.map((p) => `<li><strong>${p.name}</strong>: ${p.ppc}% (${p.completed}/${p.resolved})</li>`).join("")}</ul>` : ""}
          ${topReasons.length ? `<h4>Top variance reasons</h4><ul>${topReasons.map((r) => `<li>${r.label} — ${r.count}</li>`).join("")}</ul>` : ""}
          <h4>Open work</h4>
          <ul>
            <li>Constraints: ${openConsCount} open (${overdueConsCount} overdue)</li>
            <li>Corrective actions: ${openCACount} open (${overdueCACount} overdue)</li>
          </ul>
        `;
        for (const uid of recipientIds) {
          const email = emailMap.get(uid);
          if (!email) continue;
          if (await sendEmail(email, subject, html)) result.emails++;
        }
      }
      result.companies++;
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("weekly-digest error", e);
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});