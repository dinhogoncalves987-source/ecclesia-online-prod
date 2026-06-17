/**
 * Access invite: criar, listar, revogar e aceitar convites de acesso administrativo.
 * Usa a tabela public.access_invites (migration 20260618120000_access_invites.sql).
 */
import { supabase } from "@/integrations/supabase/client";
import { getPublicAppUrl } from "@/lib/publicUrl";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AccessInvitePublic {
  invite_id: string;
  token: string;
  organization_id: string;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  expires_at: string;
  church_name: string;
  church_city: string;
  church_state: string;
}

export interface AccessInviteRecord {
  id: string;
  token: string;
  organization_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function buildAccessInviteUrl(token: string): string {
  return `${getPublicAppUrl()}/convite-acesso/${token}`;
}

export function buildAccessWhatsAppLink(params: {
  phone: string;
  name: string;
  roleLabel: string;
  orgName: string;
  token: string;
}): string {
  const { phone, name, roleLabel, orgName, token } = params;
  const url = buildAccessInviteUrl(token);
  const msg = [
    `Olá, ${name}.`,
    ``,
    `Você foi convidado para acessar o Ecclesia Online como ${roleLabel} da ${orgName}.`,
    ``,
    `Clique no link abaixo para ativar seu acesso:`,
    url,
  ].join("\n");
  const digits = phone.replace(/\D/g, "");
  const number = digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(msg)}`;
}

// ── DB Operations ─────────────────────────────────────────────────────────────

export async function createAccessInvite(input: {
  organization_id: string;
  invited_by: string;
  full_name: string;
  email?: string;
  phone?: string;
  role: string;
}): Promise<{ data: AccessInviteRecord | null; error: string | null }> {
  const { data, error } = await supabase
    .from("access_invites")
    .insert({
      organization_id: input.organization_id,
      invited_by: input.invited_by,
      full_name: input.full_name,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      role: input.role,
    })
    .select("*")
    .single();
  if (error) return { data: null, error: error.message };
  return { data: data as AccessInviteRecord, error: null };
}

export async function getAccessInvites(organizationId: string): Promise<AccessInviteRecord[]> {
  const { data } = await supabase
    .from("access_invites")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  return (data || []) as AccessInviteRecord[];
}

export async function revokeAccessInvite(id: string): Promise<boolean> {
  const { error } = await supabase
    .from("access_invites")
    .update({ status: "revoked" })
    .eq("id", id);
  return !error;
}

export async function getAccessInviteByToken(token: string): Promise<{
  data: AccessInvitePublic | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc("get_access_invite_by_token", { _token: token });
  if (error) return { data: null, error: error.message };
  const result = data as { ok: boolean; error?: string } & AccessInvitePublic;
  if (!result.ok) return { data: null, error: result.error ?? "Convite inválido" };
  return { data: result as AccessInvitePublic, error: null };
}

export async function acceptAccessInvite(token: string): Promise<{
  data: { organization_id: string; role: string } | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc("accept_access_invite", { _token: token });
  if (error) return { data: null, error: error.message };
  const result = data as { ok: boolean; error?: string; organization_id?: string; role?: string };
  if (!result.ok) return { data: null, error: result.error ?? "Erro ao aceitar convite" };
  return { data: { organization_id: result.organization_id!, role: result.role! }, error: null };
}
