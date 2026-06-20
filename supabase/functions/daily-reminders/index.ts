// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type NotificationRow = {
  user_id: string;
  company_id: string;
  title: string;
  message?: string | null;
  link?: string | null;
};

const startOfTodayIso = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
};

const addDaysIso = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Insert notification only if no row with same link+user exists since today. */
async function insertDeduped(
  admin: ReturnType<typeof createClient>,
  n: NotificationRow,
): Promise<boolean> {
  if (!n.user_id) return false;
  const { data: existing } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", n.user_id)
    .eq("link", n.link ?? "")
    .gte("created_at", startOfTodayIso())
    .limit(1);
  if (existing && existing.length > 0) return false;
  const { error } = await admin.from("notifications").insert(n as any);
  if (error) console.error("notif insert failed", error);
  return !error;
}

async function getCompanyAdminIds(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  roles: string[] = ["admin"],
): Promise<string[]> {
  const { data: profs } = await admin
    .from("profiles")
    .select("user_id")
    .eq("company_id", companyId);
  const ids = (profs || []).map((p: any) => p.user_id);
  if (ids.length === 0) return [];
  const { data: roleRows } = await admin
    .from("user_roles")
    .select("user_id, role")
    .in("user_id", ids)
    .in("role", roles);
  return [...new Set((roleRows || []).map((r: any) => r.user_id))];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const counts = { constraints: 0, insurance: 0, lookahead_missing: 0, pending_approval: 0 };

  try {
    // ===== 1) CONSTRAINTS — overdue or due within 3 days =====
    const dueCutoff = addDaysIso(3);
    const { data: constraints } = await admin
      .from("project_constraints")
      .select("id, project_id, company_id, type, description, owner_user_id, created_by, need_by_date, status")
      .in("status", ["open", "in_progress"])
      .not("need_by_date", "is", null)
      .lte("need_by_date", dueCutoff);

    const companyAdminCache = new Map<string, string[]>();
    for (const c of constraints || []) {
      const link = `/projects/${c.project_id}?constraint=${c.id}`;
      const overdue = c.need_by_date! < todayIso();
      const title = `${overdue ? "Overdue" : "Due soon"} constraint: ${c.description?.slice(0, 80) || c.type}`;
      const message = overdue
        ? `Was due ${c.need_by_date}. Clear it so the work can be committed.`
        : `Need-by ${c.need_by_date}. Clear it before the work is committed.`;

      let recipients: string[] = [];
      if (c.owner_user_id) recipients = [c.owner_user_id];
      else if (c.created_by) recipients = [c.created_by];
      else {
        if (!companyAdminCache.has(c.company_id)) {
          companyAdminCache.set(c.company_id, await getCompanyAdminIds(admin, c.company_id, ["admin", "pm"]));
        }
        recipients = companyAdminCache.get(c.company_id)!;
      }
      for (const uid of recipients) {
        if (await insertDeduped(admin, { user_id: uid, company_id: c.company_id, title, message, link })) counts.constraints++;
      }
    }

    // ===== 2) SUBCONTRACTOR INSURANCE — within 30 days or expired =====
    const insCutoff = addDaysIso(30);
    const { data: subs } = await admin
      .from("subcontractors")
      .select("id, company_id, company_name, insurance_expiration")
      .not("insurance_expiration", "is", null)
      .lte("insurance_expiration", insCutoff);

    for (const s of subs || []) {
      if (!companyAdminCache.has(s.company_id)) {
        companyAdminCache.set(s.company_id, await getCompanyAdminIds(admin, s.company_id, ["admin"]));
      }
      const expired = s.insurance_expiration! < todayIso();
      const title = `${expired ? "Insurance expired" : "Insurance expiring"}: ${s.company_name}`;
      const message = `${s.company_name} insurance ${expired ? "expired" : "expires"} on ${s.insurance_expiration}.`;
      const link = `/subcontractors?id=${s.id}`;
      for (const uid of companyAdminCache.get(s.company_id)!) {
        if (await insertDeduped(admin, { user_id: uid, company_id: s.company_id, title, message, link })) counts.insurance++;
      }
    }

    // ===== 3) LOOK-AHEAD CADENCE =====
    // Next week's Monday (ISO week)
    const today = new Date();
    const day = today.getDay(); // 0 sun .. 6 sat
    const daysToNextMonday = ((8 - day) % 7) || 7;
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysToNextMonday);
    const nextMondayIso = nextMonday.toISOString().slice(0, 10);

    const { data: activeProjects } = await admin
      .from("projects")
      .select("id, company_id, name, status")
      .eq("status", "active");

    // Look-aheads covering next week (Draft or Submitted)
    const { data: nextWeekLAs } = await admin
      .from("look_aheads")
      .select("id, project_id, super_id, status, week_start_date")
      .eq("week_start_date", nextMondayIso)
      .in("status", ["draft", "submitted"]);

    const projectsWithNextWeek = new Set((nextWeekLAs || []).map((l: any) => l.project_id));

    // For each project missing one, notify a superintendent (use most recent super for that project).
    for (const p of activeProjects || []) {
      if (projectsWithNextWeek.has(p.id)) continue;
      const { data: lastLAs } = await admin
        .from("look_aheads")
        .select("super_id")
        .eq("project_id", p.id)
        .order("week_start_date", { ascending: false })
        .limit(1);
      const superId = lastLAs?.[0]?.super_id;
      const recipients = superId
        ? [superId]
        : (companyAdminCache.get(p.company_id) ??
            (companyAdminCache.set(p.company_id, await getCompanyAdminIds(admin, p.company_id, ["admin", "pm"])).get(p.company_id)!));
      const title = `Create next week's look-ahead — ${p.name}`;
      const message = `No draft or submitted look-ahead for week of ${nextMondayIso}.`;
      const link = `/projects/${p.id}/lookahead/new`;
      for (const uid of recipients) {
        if (await insertDeduped(admin, { user_id: uid, company_id: p.company_id, title, message, link })) counts.lookahead_missing++;
      }
    }

    // Look-aheads pending approval — notify PMs/admins of that company
    const { data: submitted } = await admin
      .from("look_aheads")
      .select("id, project_id, company_id, week_start_date")
      .eq("status", "submitted");
    for (const la of submitted || []) {
      if (!companyAdminCache.has(la.company_id)) {
        companyAdminCache.set(la.company_id, await getCompanyAdminIds(admin, la.company_id, ["admin", "pm"]));
      }
      const title = `Look-ahead awaiting approval`;
      const message = `Week of ${la.week_start_date} is pending review.`;
      const link = `/projects/${la.project_id}/lookahead/${la.id}`;
      for (const uid of companyAdminCache.get(la.company_id)!) {
        if (await insertDeduped(admin, { user_id: uid, company_id: la.company_id, title, message, link })) counts.pending_approval++;
      }
    }

    return new Response(JSON.stringify({ ok: true, counts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("daily-reminders error", e);
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});