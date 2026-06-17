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
    `Olá, ${memberName}.`,
    ``,
    `A ${churchName} convidou você para acessar o Ecclesia Online como membro.`,
    ``,
    `Clique no link abaixo para ativar seu acesso:`,
    inviteUrl,
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

export async function getInviteByToken(
  token: string,
): Promise<{ data: MemberInvitePublic | null; error: string | null }> {
  const { data, error } = await supabase.rpc(
    "get_member_invite_by_token" as never,
    { _token: token },
  );

  if (error) return { data: null, error: error.message };

  const result = data as { ok: boolean; error?: string } & MemberInvitePublic;
  if (!result.ok) return { data: null, error: result.error ?? "Convite inválido" };

  return { data: result as MemberInvitePublic, error: null };
}

// ── Accept invite (authenticated) ─────────────────────────────────────────────

export async function acceptMemberInvite(
  token: string,
): Promise<{ ok: boolean; organizationId?: string; memberId?: string; error?: string }> {
  const { data, error } = await supabase.rpc(
    "accept_member_invite" as never,
    { _token: token },
  );

  if (error) return { ok: false, error: error.message };

  const result = data as { ok: boolean; error?: string; organization_id?: string; member_id?: string };
  if (!result.ok) return { ok: false, error: result.error };

  return { ok: true, organizationId: result.organization_id, memberId: result.member_id };
}
