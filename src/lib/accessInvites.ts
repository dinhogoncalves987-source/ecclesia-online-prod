/**
 * Access invite: criar, listar, revogar e aceitar convites de acesso administrativo.
 * Usa a tabela public.access_invites (migration 20260618120000_access_invites.sql).
 */
import { supabase } from "@/integrations/supabase/client";
import { getPublicAppUrl } from "@/lib/publicUrl";
import {
  responsibilitiesFromInvite,
  type AccessResponsibility,
} from "@/lib/accessControl";

const ASSIGNABLE_ACCESS_ROLES = new Set([
  "church_admin", "pastor", "secretary", "tesoureiro",
  "contador", "leader", "porteiro",
]);

const LEGACY_ROLE_RESPONSIBILITY: Record<string, AccessResponsibility> = {
  church_admin: "church_admin",
  pastor: "responsible_pastor",
  secretary: "secretary",
  tesoureiro: "treasurer",
  contador: "accountant",
  leader: "group_manager",
  porteiro: "gatekeeper",
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AccessInvitePublic {
  invite_id: string;
  token: string;
  organization_id: string;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  responsibility_types: AccessResponsibility[];
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
  responsibility_types: AccessResponsibility[];
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
  /**
   * SEGURANÇA: obrigatório. Convites de acesso administrativo sem e-mail
   * permitiam que qualquer pessoa autenticada aceitasse o convite apenas
   * conhecendo o token (ver migration 20260715150000_harden_access_invites).
   * O backend também recusa a criação sem e-mail (constraint NOT VALID +
   * validação em accept_access_invite), esta checagem é apenas para dar um
   * erro claro antes de round-trip ao servidor.
   */
  email: string;
  phone?: string;
  role: string;
  responsibility_types?: AccessResponsibility[];
}): Promise<{ data: AccessInviteRecord | null; error: string | null }> {
  const email = input.email.trim();
  if (!email) {
    return { data: null, error: "E-mail é obrigatório para convites de acesso." };
  }
  if (!ASSIGNABLE_ACCESS_ROLES.has(input.role)) {
    return { data: null, error: "Função inválida para convite de acesso." };
  }

  const responsibilityTypes = input.responsibility_types ?? [LEGACY_ROLE_RESPONSIBILITY[input.role]];
  const { data, error } = await supabase.rpc("admin_create_external_access_invite", {
    _target_organization_id: input.organization_id,
    _full_name: input.full_name,
    _email: email,
    _phone: input.phone?.trim() || "",
    _responsibility_types: responsibilityTypes,
  });
  if (error) return { data: null, error: error.message };
  return { data: data as unknown as AccessInviteRecord, error: null };
}

export async function getAccessInvites(organizationId: string): Promise<AccessInviteRecord[]> {
  const { data } = await supabase.rpc("admin_list_access_invites", {
    _target_organization_id: organizationId,
  });
  const payload = data as { invites?: AccessInviteRecord[] } | null;
  return payload?.invites ?? [];
}

export async function revokeAccessInvite(id: string): Promise<boolean> {
  const { error } = await supabase.rpc("admin_revoke_access_invite", { _invite_id: id });
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
  return {
    data: {
      ...result,
      responsibility_types: responsibilitiesFromInvite(result.responsibility_types, result.role),
    },
    error: null,
  };
}

export async function acceptAccessInvite(token: string): Promise<{
  data: { organization_id: string; role: string } | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc("accept_access_invite", { _token: token });
  if (error) return { data: null, error: error.message };
  const result = data as {
    ok: boolean;
    error?: string;
    organization_id?: string;
    role?: string;
  };
  if (!result.ok) {
    // Return the raw error code so callers can handle email_mismatch specifically
    return { data: null, error: result.error ?? "Erro ao aceitar convite" };
  }
  return { data: { organization_id: result.organization_id!, role: result.role! }, error: null };
}
