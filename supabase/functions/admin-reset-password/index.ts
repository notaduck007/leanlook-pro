import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1) Resolve caller from JWT — never trust client-supplied identity
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // 2) Caller must be admin
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "Only admins can reset passwords" }, 403);

    // 3) Parse + validate input
    const body = await req.json().catch(() => ({}));
    const { target_user_id, action, password, redirect_to } = body as {
      target_user_id?: string;
      action?: "set_password" | "send_reset_email";
      password?: string;
      redirect_to?: string;
    };
    if (!target_user_id) return json({ error: "target_user_id is required" }, 400);
    if (action !== "set_password" && action !== "send_reset_email") {
      return json({ error: "Invalid action" }, 400);
    }

    // 4) Same-company check via profiles
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("company_id")
      .eq("user_id", caller.id)
      .single();
    const { data: targetProfile } = await admin
      .from("profiles")
      .select("company_id")
      .eq("user_id", target_user_id)
      .single();

    if (!callerProfile?.company_id || !targetProfile?.company_id) {
      return json({ error: "Company not found" }, 403);
    }
    if (callerProfile.company_id !== targetProfile.company_id) {
      return json({ error: "Not authorized: user belongs to a different company" }, 403);
    }

    // 5) Fetch target user (need email for recovery link)
    const { data: targetData, error: getErr } = await admin.auth.admin.getUserById(target_user_id);
    if (getErr || !targetData?.user) return json({ error: "User not found" }, 404);
    const targetEmail = targetData.user.email;
    if (!targetEmail) return json({ error: "Target user has no email" }, 400);

    if (action === "set_password") {
      if (!password || typeof password !== "string" || password.length < 8) {
        return json({ error: "Password must be at least 8 characters" }, 400);
      }
      const existingMeta = targetData.user.user_metadata || {};
      const { error: updErr } = await admin.auth.admin.updateUserById(target_user_id, {
        password,
        user_metadata: { ...existingMeta, must_change_password: true },
      });
      if (updErr) return json({ error: updErr.message }, 400);
      return json({ success: true, action: "set_password" });
    }

    // send_reset_email — generate a recovery link
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: targetEmail,
      options: redirect_to ? { redirectTo: redirect_to } : undefined,
    });
    if (linkErr) return json({ error: linkErr.message }, 400);

    return json({
      success: true,
      action: "send_reset_email",
      email: targetEmail,
      // action_link is included so admins can copy/send manually if SMTP delivery is delayed.
      action_link: linkData?.properties?.action_link ?? null,
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});