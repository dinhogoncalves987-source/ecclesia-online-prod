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

// ── E-mail helpers ─────────────────────────────────────────────────────────────

/** Normalize an e-mail for comparison: trim + lowercase. Never throws. */
export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** True when both e-mails are non-empty and equal after normalization. */
export function emailsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeEmail(a);
  const nb = normalizeEmail(b);
  return na.length > 0 && na === nb;
}

/**
 * Supabase's documented (non-enumerating) way to signal "this e-mail already
 * has a confirmed account" from a `signUp()` response: no explicit error is
 * returned (that would leak account existence to an unauthenticated caller),
 * but the returned user has an empty `identities` array instead of a new
 * identity. See https://supabase.com/docs/reference/javascript/auth-signup.
 */
export function isAlreadyRegisteredSignUp(
  data: { user: { identities?: unknown[] | null } | null } | null | undefined,
): boolean {
  if (!data?.user) return false;
  return Array.isArray(data.user.identities) && data.user.identities.length === 0;
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

// ── Create account for a new member (official Supabase sign-up) ──────────────
//
// SECURITY: this is the ONLY client-side path that creates an Auth account for
// a member invite, and it goes through the official, unmodified Supabase
// `signUp` flow — never `admin.*`, never a service-role endpoint, never
// `email_confirm: true`. The e-mail is always the member's fixed registered
// e-mail (from the invite payload), never something the user can edit.
//
// Because Supabase project e-mail confirmations are required, a successful
// call here does NOT yet grant a session — the caller must wait for the user
// to click the confirmation link (which redirects back to `emailRedirectTo`,
// i.e. this same invite page) before an authenticated session exists. Only
// then can `acceptMemberInvite` be called to finalize the link — never before.
//
// If the e-mail already belongs to a confirmed account, Supabase signals this
// WITHOUT an explicit error (to avoid e-mail enumeration): the response
// contains a user with an empty `identities` array. Callers should check this
// with `isAlreadyRegisteredSignUp` and, if true, direct the member to log in
// or recover their existing password instead — never attempt to change that
// account's password from here.
export async function signUpForMemberInvite(
  email: string,
  password: string,
  token: string,
) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: buildInviteUrl(token),
    },
  });
}
