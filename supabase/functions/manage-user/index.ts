import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const JSON_CORS = { ...CORS, "Content-Type": "application/json" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Verify caller is authenticated and is Admin
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ success: false, message: "Unauthorized." }), { status: 401, headers: JSON_CORS });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user: caller } } = await supabaseClient.auth.getUser();
  if (!caller) {
    return new Response(JSON.stringify({ success: false, message: "Unauthorized." }), { status: 401, headers: JSON_CORS });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Check caller role
  const { data: callerProfile } = await supabaseAdmin.from("profiles").select('"Role"').eq("id", caller.id).single();
  if (!callerProfile || callerProfile.Role !== "Admin") {
    return new Response(JSON.stringify({ success: false, message: "Only Admins can manage users." }), { status: 403, headers: JSON_CORS });
  }

  try {
    const body = await req.json();
    const email = (body.Email || "").trim().toLowerCase();
    const username = (body.Username || "").trim();

    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ success: false, message: "Valid email is required." }), { headers: JSON_CORS });
    }
    if (!username) {
      return new Response(JSON.stringify({ success: false, message: "Username is required." }), { headers: JSON_CORS });
    }

    // Check if profile exists (existing user = update; no id in body means look up by email)
    const isNew = !body.id;

    if (isNew) {
      if (!body.Password || body.Password.length < 8) {
        return new Response(JSON.stringify({ success: false, message: "Password must be at least 8 characters." }), { headers: JSON_CORS });
      }

      // Create Supabase Auth user
      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: body.Password,
        email_confirm: true,
        user_metadata: { username, role: body.Role || "Sales" },
      });
      if (authErr) throw authErr;

      // Upsert profile
      await supabaseAdmin.from("profiles").upsert({
        id: authUser.user.id,
        email,
        Username: username,
        FullName: body.FullName || "",
        Role: body.Role || "Sales",
        Department: body.Department || "",
        IsActive: true,
        MustChangePassword: body.MustChangePassword !== false,
        UpdatedAt: new Date().toISOString(),
      });

      const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("id", authUser.user.id).single();
      return new Response(JSON.stringify({ success: true, data: { ...profile, Email: email } }), { headers: JSON_CORS });
    } else {
      // Update existing user
      const patch: Record<string, unknown> = {
        Username: username,
        FullName: body.FullName || "",
        Role: body.Role || "Sales",
        Department: body.Department || "",
        IsActive: body.IsActive !== false,
        MustChangePassword: !!body.MustChangePassword,
        UpdatedAt: new Date().toISOString(),
      };
      await supabaseAdmin.from("profiles").update(patch).eq("id", body.id);

      if (body.Password && body.Password.length >= 8) {
        await supabaseAdmin.auth.admin.updateUserById(body.id, { password: body.Password });
      }

      const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("id", body.id).single();
      return new Response(JSON.stringify({ success: true, data: { ...profile, Email: email } }), { headers: JSON_CORS });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ success: false, message: msg }), { status: 500, headers: JSON_CORS });
  }
});
