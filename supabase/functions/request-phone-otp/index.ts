/**
 * Edge Function: request-phone-otp
 *
 * Gera um OTP para login por telefone e envia via Gateway WhatsApp.
 * Exclusivo para membros previamente cadastrados pela secretaria.
 *
 * POST /functions/v1/request-phone-otp
 * Body: { phone: "+5551999999999" }
 * Response: { ok: true, expiresAt: "ISO string" }
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_GATEWAY_URL = Deno.env.get("WHATSAPP_GATEWAY_URL") ?? "";
const WHATSAPP_GATEWAY_KEY = Deno.env.get("WHATSAPP_GATEWAY_KEY") ?? "";

// Supabase com service_role (ignora RLS)
const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── Gerar código OTP de 6 dígitos ─────────────────────────────────────────────

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── Hash SHA-256 do código ─────────────────────────────────────────────────────

async function hashOtp(otp: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(otp);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Enviar via Gateway WhatsApp ───────────────────────────────────────────────

async function sendOtpViaGateway(phone: string, otp: string, memberName: string) {
  if (!WHATSAPP_GATEWAY_URL) {
    console.warn("WHATSAPP_GATEWAY_URL não configurada — OTP não enviado");
    return;
  }

  await fetch(`${WHATSAPP_GATEWAY_URL}/send-otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": WHATSAPP_GATEWAY_KEY,
    },
    body: JSON.stringify({ phone, otp, memberName }),
  });
}

// ── Handler principal ─────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { phone } = await req.json();

  if (!phone) {
    return new Response(JSON.stringify({ error: "phone_required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Normalizar telefone (apenas dígitos + +)
  const normalizedPhone = phone.replace(/[^0-9+]/g, "");

  // Verificar se existe membro com este telefone
  const { data: member } = await adminSupabase
    .from("members")
    .select("id, full_name, phone")
    .eq("phone", normalizedPhone)
    .maybeSingle();

  if (!member) {
    // Não revelar se o número está ou não cadastrado (segurança)
    return new Response(
      JSON.stringify({ ok: true, message: "Se o número estiver cadastrado, você receberá o código." }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // Rate limiting: máximo 3 OTPs por número nos últimos 10 minutos
  const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await adminSupabase
    .from("member_phone_otps")
    .select("*", { count: "exact", head: true })
    .eq("phone", normalizedPhone)
    .gt("created_at", tenMinutesAgo)
    .is("used_at", null);

  if ((count ?? 0) >= 3) {
    return new Response(
      JSON.stringify({ error: "rate_limit", message: "Muitas tentativas. Aguarde 10 minutos." }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  // Gerar OTP
  const otp = generateOtp();
  const codeHash = await hashOtp(otp);
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

  // Salvar OTP no banco
  const { error: insertError } = await adminSupabase.from("member_phone_otps").insert({
    member_id: (member as { id: string }).id,
    phone: normalizedPhone,
    code_hash: codeHash,
    expires_at: expiresAt,
    ip_address: req.headers.get("x-forwarded-for") ?? "",
  });

  if (insertError) {
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Enviar via WhatsApp
  await sendOtpViaGateway(
    normalizedPhone,
    otp,
    (member as { full_name: string }).full_name,
  );

  return new Response(
    JSON.stringify({ ok: true, expiresAt }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
