/**
 * src/lib/memberLoginOtp.ts
 *
 * PARTE D (Login por telefone/WhatsApp) — camada fina do frontend sobre:
 *   - RPC pública `request_member_login_otp` (supabase/migrations/
 *     20260802100000_member_login_otp_foundation.sql);
 *   - Edge Function `verify-member-login-otp` (a única peça autorizada a
 *     transformar um código comprovado em sessão real do Supabase Auth);
 *   - RPC `admin_generate_manual_test_otp` (supabase/migrations/
 *     20260802110000_member_login_otp_admin_test.sql), para o teste
 *     controlado por um administrador autorizado.
 *
 * Este arquivo NUNCA fabrica uma sessão sozinho: a troca final por uma
 * sessão real sempre passa por `supabase.auth.verifyOtp(...)`, o SDK
 * oficial do Supabase — nunca um JWT montado manualmente aqui.
 */
import { supabase } from "@/integrations/supabase/client";

export type MemberLoginOtpRequestResult =
  | { ok: true }
  | { ok: false; error: string; hint?: string };

export type MemberLoginOtpVerifyResult =
  | { ok: true; memberId: string; memberName: string | null }
  | { ok: false; error: string; attemptsRemaining?: number };

export type ManualTestOtpResult =
  | {
      ok: true;
      memberId: string;
      memberName: string | null;
      phoneNormalized: string;
      code: string;
      expiresAt: string;
    }
  | { ok: false; error: string };

/**
 * Passo 1 do fluxo de entrada: pede ao backend para localizar o membro pelo
 * telefone e emitir um desafio. Nesta operação, o transporte real de
 * WhatsApp permanece desligado — o retorno normalmente será um erro
 * explicativo (`otp_disabled` em produção, `otp_manual_test_admin_only` em
 * staging), nunca um sucesso silencioso sem desafio utilizável. A tela de
 * entrada usa este retorno apenas para orientar o membro (ex.: "peça à
 * Secretaria para gerar um código de teste").
 */
export async function requestMemberLoginOtp(phone: string): Promise<MemberLoginOtpRequestResult> {
  const { data, error } = await supabase.rpc("request_member_login_otp", { p_phone: phone });
  if (error) {
    return { ok: false, error: "request_failed" };
  }
  const result = data as { ok?: boolean; error?: string; hint?: string } | null;
  if (result?.ok) return { ok: true };
  return { ok: false, error: result?.error ?? "unknown_error", hint: result?.hint };
}

/**
 * Passo 2: envia telefone + código digitado pelo membro para a Edge
 * Function `verify-member-login-otp`. Em caso de sucesso, o backend já
 * verificou a posse do número (RPC `_verify_member_login_otp_internal`,
 * hash + expiração + tentativa máxima + uso único) e devolve um
 * `token_hash` de ponte — este helper troca isso por uma sessão real
 * chamando `supabase.auth.verifyOtp` (SDK oficial), nunca monta um JWT.
 */
export async function verifyMemberLoginOtp(phone: string, code: string): Promise<MemberLoginOtpVerifyResult> {
  const { data, error } = await supabase.functions.invoke<{
    ok: boolean;
    error?: string;
    attempts_remaining?: number;
    email?: string;
    token_hash?: string;
    member_id?: string;
    member_name?: string | null;
  }>("verify-member-login-otp", { body: { phone, code } });

  if (error) {
    return { ok: false, error: "verification_unavailable" };
  }
  if (!data?.ok || !data.email || !data.token_hash) {
    return {
      ok: false,
      error: data?.error ?? "invalid_code",
      attemptsRemaining: data?.attempts_remaining,
    };
  }

  const { error: sessionError } = await supabase.auth.verifyOtp({
    email: data.email,
    token_hash: data.token_hash,
    type: "magiclink",
  });
  if (sessionError) {
    return { ok: false, error: "session_bridge_failed" };
  }

  return { ok: true, memberId: data.member_id ?? "", memberName: data.member_name ?? null };
}

/**
 * Tela administrativa protegida (capability `member_login.otp_test`):
 * gera um código de teste de UM membro por vez, revelado apenas nesta
 * resposta (nunca persistido em texto puro, nunca logado). Exige
 * `transport_mode = 'manual_test'` no backend — falha fechado em produção.
 */
export async function adminGenerateManualTestOtp(memberId: string): Promise<ManualTestOtpResult> {
  const { data, error } = await supabase.rpc("admin_generate_manual_test_otp", { p_member_id: memberId });
  if (error) {
    return { ok: false, error: "request_failed" };
  }
  const result = data as {
    ok?: boolean;
    error?: string;
    member_id?: string;
    member_name?: string | null;
    phone_normalized?: string;
    code?: string;
    expires_at?: string;
  } | null;

  if (!result?.ok || !result.code || !result.phone_normalized || !result.expires_at) {
    return { ok: false, error: result?.error ?? "unknown_error" };
  }

  return {
    ok: true,
    memberId: result.member_id ?? memberId,
    memberName: result.member_name ?? null,
    phoneNormalized: result.phone_normalized,
    code: result.code,
    expiresAt: result.expires_at,
  };
}
