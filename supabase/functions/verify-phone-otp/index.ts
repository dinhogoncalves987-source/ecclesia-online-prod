/**
 * Edge Function: verify-phone-otp
 *
 * Verifica o código OTP e retorna um token de sessão Supabase para o membro.
 *
 * POST /functions/v1/verify-phone-otp
 * Body: { phone: "+5551999999999", code: "123456" }
 * Response: { ok: true, session: { access_token, refresh_token, ... } }
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── Hash SHA-256 ──────────────────────────────────────────────────────────────

async function hashOtp(otp: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(otp));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { phone, code } = await req.json();

  if (!phone || !code) {
    return new Response(JSON.stringify({ error: "phone_and_code_required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const normalizedPhone = phone.replace(/[^0-9+]/g, "");
  const codeHash = await hashOtp(String(code).trim());
  const now = new Date().toISOString();

  // Buscar OTP válido
  const { data: otpRecord } = await adminSupabase
    .from("member_phone_otps")
    .select("id, member_id, attempts, max_attempts, expires_at, used_at")
    .eq("phone", normalizedPhone)
    .eq("code_hash", codeHash)
    .gt("expires_at", now)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!otpRecord) {
    // Incrementar tentativas no último OTP deste número
    await adminSupabase
      .from("member_phone_otps")
      .update({ attempts: adminSupabase.rpc("attempts + 1") })
      .eq("phone", normalizedPhone)
      .is("used_at", null);

    return new Response(
      JSON.stringify({ error: "invalid_or_expired_code" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const record = otpRecord as {
    id: string;
    member_id: string;
    attempts: number;
    max_attempts: number;
  };

  if (record.attempts >= record.max_attempts) {
    return new Response(
      JSON.stringify({ error: "too_many_attempts" }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  // Marcar OTP como usado
  await adminSupabase
    .from("member_phone_otps")
    .update({ used_at: now })
    .eq("id", record.id);

  // Buscar user_id do membro
  const { data: member } = await adminSupabase
    .from("members")
    .select("user_id, full_name")
    .eq("id", record.member_id)
    .maybeSingle();

  const memberData = member as { user_id?: string; full_name: string } | null;

  if (!memberData?.user_id) {
    return new Response(
      JSON.stringify({ error: "member_not_activated" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  // Gerar magic link para o email do usuário
  // Isso cria uma sessão Supabase autenticada para o user_id do membro
  const { data: userData } = await adminSupabase.auth.admin.getUserById(memberData.user_id);
  const email = userData?.user?.email;

  if (!email) {
    return new Response(
      JSON.stringify({ error: "user_email_not_found" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  // Criar sessão de longa duração via admin API
  const { data: sessionData, error: sessionError } = await adminSupabase.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (sessionError || !sessionData) {
    return new Response(
      JSON.stringify({ error: "session_creation_failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      verificationUrl: (sessionData as { properties?: { action_link?: string } }).properties?.action_link,
      memberName: memberData.full_name,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
