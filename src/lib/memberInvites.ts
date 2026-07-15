/**
 * Member invite: create, fetch, and accept invite tokens.
 * Uses two Supabase RPC functions so that the public invite page
 * works without authentication.
 */
import { supabase } from "@/integrations/supabase/client";
import { getPublicAppUrl } from "@/lib/publicUrl";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MemberInvitePublic {
  invite_id:       string;
  token:           string;
  member_id:       string;
  organization_id: string;
  sector_id:       string | null;
  congregation_id: string | null;
  role:            string;
  expires_at:      string;
  member_name:     string;
  member_role:     string;
  member_photo:    string;
  /** E-mail cadastrado do membro — chave fixa de vínculo. Pode vir vazio se o cadastro não tem e-mail. */
  member_email?:   string | null;
  church_name:     string;
  church_city:     string;
  church_state:    string;
  congregation:    string;
}

export interface InviteCreateInput {
  memberId:       string;
  organizationId: string;
  sectorId?:      string | null;
  congregationId?: string | null;
  invitedBy?:     string;
  role?:          string;
}

export interface InviteRecord {
  id:              string;
  token:           string;
  member_id:       string;
  organization_id: string;
  status:          string;
  expires_at:      string;
  created_at:      string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build the full invite URL for the current deployment. */
export function buildInviteUrl(token: string): string {
  const base = getPublicAppUrl();
  return `${base}/convite-membro/${token}`;
}

/** Format phone for wa.me — keep digits only, add country code 55 if missing. */
export function formatWhatsappNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length >= 10) return `55${digits}`;
  return digits;
}

/** Build a wa.me link with the invite message pre-filled. */
export function buildWhatsappLink(
  phone: string,
  memberName: string,
  churchName: string,
  inviteUrl: string,
): string {
  const number = formatWhatsappNumber(phone);
  const text = [
    `Olá, ${memberName}!`,
    ``,
    `Seu acesso ao Ecclesia Online foi criado.`,
    ``,
    `Clique no link abaixo para ativar sua conta e criar sua senha:`,
    inviteUrl,
    ``,
    `Deus abençoe.`,
  ].join("\n");
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

// ── Create invite ─────────────────────────────────────────────────────────────

export async function createMemberInvite(
  input: InviteCreateInput,
): Promise<{ data: InviteRecord | null; error: string | null }> {
  const { data, error } = await supabase
    .from("member_invites" as never)
    .insert({
      member_id:       input.memberId,
      organization_id: input.organizationId,
      sector_id:       input.sectorId ?? null,
      congregation_id: input.congregationId ?? null,
      invited_by:      input.invitedBy ?? null,
      role:            input.role ?? "member",
    })
    .select("id, token, member_id, organization_id, status, expires_at, created_at")
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as unknown as InviteRecord, error: null };
}

// ── List invites for a member ─────────────────────────────────────────────────

export async function getMemberInvites(
  memberId: string,
): Promise<{ data: InviteRecord[]; error: string | null }> {
  const { data, error } = await supabase
    .from("member_invites" as never)
    .select("id, token, member_id, organization_id, status, expires_at, created_at")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data as unknown as InviteRecord[]) ?? [], error: null };
}

// ── Revoke all pending invites for a member ───────────────────────────────────

export async function revokeMemberInvites(memberId: string): Promise<void> {
  await supabase
    .from("member_invites" as never)
    .update({ status: "revoked" })
    .eq("member_id", memberId)
    .eq("status", "pending");
}

// ── Fetch invite by token (public — no auth needed) ───────────────────────────
//
// Uses a direct REST fetch to the PostgREST RPC endpoint instead of the
// supabase-js client. This mirrors the exact request that was manually
// confirmed to work (PowerShell POST /rest/v1/rpc/get_member_invite_by_token),
// bypassing any supabase-js client-side session/header quirks on the public
// invite page (where the user may have no session at all).

/** Normalize the raw RPC payload into a single object, or null if impossible. */
function normalizeRpcPayload(raw: unknown): Record<string, unknown> | null {
  let value: unknown = raw;

  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (Array.isArray(value)) {
    value = value[0];
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

async function fetchInviteByTokenOnce(
  token: string,
  signal: AbortSignal,
): Promise<{ data: MemberInvitePublic | null; error: string | null; retriable: boolean }> {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apiKey  = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/rest/v1/rpc/get_member_invite_by_token`, {
      method: "POST",
      headers: {
        "apikey": apiKey,
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ _token: token }),
      signal,
    });
  } catch (e) {
    console.error("[memberInvites] REST getInviteByToken failed", e);
    return { data: null, error: "network_error", retriable: true };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("[memberInvites] REST getInviteByToken HTTP error", response.status, text);

    // 4xx = client/permission/validation error — not retriable.
    // 5xx = server error — retriable.
    const retriable = response.status >= 500;
    return { data: null, error: "http_error", retriable };
  }

  const raw = await response.json().catch(() => null);
  console.info("[memberInvites] REST getInviteByToken raw data", raw);

  if (raw === null || raw === undefined) {
    return { data: null, error: "not_found", retriable: false };
  }

  const result = normalizeRpcPayload(raw) as ({ ok: boolean; error?: string } & MemberInvitePublic) | null;

  if (!result) {
    console.error("[memberInvites] REST getInviteByToken unexpected shape", raw);
    return { data: null, error: "invalid_shape", retriable: false };
  }

  if (result.ok !== true) {
    return { data: null, error: result.error ?? "invalid_invite", retriable: false };
  }

  return { data: result as MemberInvitePublic, error: null, retriable: false };
}

export async function getInviteByToken(
  token: string,
): Promise<{ data: MemberInvitePublic | null; error: string | null }> {
  if (!token || !token.trim()) {
    return { data: null, error: "invalid_token" };
  }

  const TIMEOUT_MS = 20000;
  const MAX_ATTEMPTS = 2; // 1 initial try + 1 retry

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const result = await fetchInviteByTokenOnce(token, controller.signal);
      clearTimeout(timer);

      if (result.error && result.retriable && attempt < MAX_ATTEMPTS) {
        continue; // retry once for timeout/network/5xx
      }

      return { data: result.data, error: result.error };
    } catch (e) {
      clearTimeout(timer);
      const isAbort = e instanceof Error && e.name === "AbortError";
      console.error("[memberInvites] getInviteByToken unexpected exception", e);

      if (isAbort && attempt < MAX_ATTEMPTS) {
        continue; // retry once on timeout
      }

      return { data: null, error: isAbort ? "timeout" : "network_error" };
    }
  }

  // Unreachable, but keeps TypeScript happy.
  return { data: null, error: "network_error" };
}

// ── Accept invite (authenticated) ─────────────────────────────────────────────

export type AcceptMemberInviteResult = {
  success: boolean;
  error?: string;
  message?: string;
  member_id?: string;
  organization_id?: string;
};

export async function acceptMemberInvite(
  token: string,
  userId: string,
): Promise<AcceptMemberInviteResult> {
  const { data, error } = await supabase.rpc("accept_member_invite", {
    p_token: token,
    p_user_id: userId,
  });

  if (error) {
    return {
      success: false,
      error: "rpc_error",
      message: error.message,
    };
  }

  const result = data as AcceptMemberInviteResult | null;
  if (!result) {
    return {
      success: false,
      error: "empty_response",
      message: "Não foi possível aceitar o convite agora.",
    };
  }

  return result;
}

// ── Activate invite via Edge Function (server-side Auth user + linking) ──────
//
// This is the ONLY path that turns a pending invite into an active account.
// The Edge Function resolves the e-mail from members.email itself — the
// frontend never sends an e-mail or a user id, only the token and the
// password the member just chose.

export type ActivateMemberInviteResult = {
  success: boolean;
  email?: string;
  member_id?: string;
  organization_id?: string;
  error?: string;
  message?: string;
};

export async function activateMemberInviteWithPassword(
  token: string,
  password: string,
): Promise<ActivateMemberInviteResult> {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apiKey  = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/functions/v1/activate-member-invite`, {
      method: "POST",
      headers: {
        "apikey": apiKey,
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token, password }),
    });
  } catch (e) {
    console.error("[memberInvites] activateMemberInviteWithPassword network error", e);
    return {
      success: false,
      error: "network_error",
      message: "Falha de conexão ao ativar o convite. Verifique sua internet e tente novamente.",
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch (e) {
    console.error("[memberInvites] activateMemberInviteWithPassword invalid JSON response", e);
  }

  if (!payload || typeof payload !== "object") {
    return {
      success: false,
      error: "invalid_response",
      message: "Resposta inválida do servidor ao ativar o convite.",
    };
  }

  const result = payload as ActivateMemberInviteResult;

  if (!response.ok && result.success !== true) {
    console.error("[memberInvites] activateMemberInviteWithPassword HTTP error", response.status, result);
  }

  return {
    success: result.success === true,
    email: result.email,
    member_id: result.member_id,
    organization_id: result.organization_id,
    error: result.error,
    message: result.message,
  };
}
