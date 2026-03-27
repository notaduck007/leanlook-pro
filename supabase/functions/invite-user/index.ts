import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the calling user is an admin
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check caller is admin
    const { data: isAdmin } = await adminClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Only admins can invite users" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get caller's company_id
    const { data: callerCompanyId } = await adminClient.rpc("get_user_company_id", {
      _user_id: user.id,
    });

    const { email, role, display_name, password, company_id } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use provided company_id or fall back to caller's company
    const targetCompanyId = company_id || callerCompanyId;

    // If a company_id is provided, verify it exists
    if (company_id) {
      const { data: companyExists } = await adminClient
        .from("companies")
        .select("id")
        .eq("id", company_id)
        .single();
      if (!companyExists) {
        return new Response(JSON.stringify({ error: "Company not found" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Check if user already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u: any) => u.email?.toLowerCase() === email.toLowerCase()
    );

    let targetUserId: string;

    if (existingUser) {
      targetUserId = existingUser.id;
      // Check if already in this company
      const { data: profile } = await adminClient
        .from("profiles")
        .select("company_id")
        .eq("user_id", targetUserId)
        .single();
      
      if (profile?.company_id === targetCompanyId) {
        return new Response(JSON.stringify({ error: "User is already in your organization" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Assign to company
      await adminClient
        .from("profiles")
        .update({ company_id: targetCompanyId })
        .eq("user_id", targetUserId);
    } else if (password) {
      // Direct creation with password — no invite email sent
      if (password.length < 6) {
        return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: display_name || email },
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      targetUserId = createData.user.id;

      // Wait for trigger to create profile, then set company & name
      await new Promise((r) => setTimeout(r, 500));
      await adminClient
        .from("profiles")
        .update({ company_id: targetCompanyId, display_name: display_name || null })
        .eq("user_id", targetUserId);
    } else {
      // Invite by email (legacy flow)
      const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { display_name: display_name || email },
      });
      if (inviteError) {
        return new Response(JSON.stringify({ error: inviteError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      targetUserId = inviteData.user.id;

      // Wait briefly for trigger to create profile, then set company
      await new Promise((r) => setTimeout(r, 500));
      await adminClient
        .from("profiles")
        .update({ company_id: targetCompanyId, display_name: display_name || null })
        .eq("user_id", targetUserId);
    }

    // Assign role if provided
    if (role) {
      await adminClient
        .from("user_roles")
        .upsert({ user_id: targetUserId, role }, { onConflict: "user_id,role" });
    }

    return new Response(
      JSON.stringify({ success: true, user_id: targetUserId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
