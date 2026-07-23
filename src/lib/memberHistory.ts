/**
 * Camada de serviço da fundação histórica institucional compartilhada
 * (OPERAÇÃO 1 — Fundação compartilhada dos domínios + Secretaria).
 *
 * A timeline é escrita apenas no banco por triggers/RPCs específicas de
 * domínio. `register_member_history_event` não é exposta ao navegador:
 * permitir uma RPC genérica ao cliente deixaria um usuário forjar o módulo e
 * a origem de um evento auditável.
 *
 * Todas as funções aqui são finas (thin wrappers) sobre o Supabase client —
 * a autorização real sempre vem do RLS/RPC no banco, nunca só do frontend.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type {
  OccurrenceStatus,
  OccurrenceType,
  OrdinationStatus,
  OrdinationType,
  TransferDirection,
  TransferLocationType,
  TransferStatus,
  Visibility,
} from "@/lib/memberHistoryConstants";

export type MemberHistoryRow = Tables<"member_history">;
export type MemberOccurrenceRow = Tables<"member_occurrences">;
export type MemberOrdinationRow = Tables<"member_ordinations">;
export type MemberTransferRow = Tables<"member_transfers">;
export type MemberOrganizationHistoryRow = Tables<"member_organization_history">;

export type NewMemberOccurrence = {
  member_id: string;
  occurrence_type: OccurrenceType;
  occurred_at?: string | null;
  occurred_time?: string | null;
  valid_until?: string | null;
  description?: string | null;
  visibility?: Visibility;
  document_id?: string | null;
  attachment_path?: string | null;
};

export type NewMemberOrdination = {
  member_id: string;
  role_or_function: string;
  ordination_type?: OrdinationType;
  ordination_date?: string | null;
  start_date?: string | null;
  authority_name?: string | null;
  authority_member_id?: string | null;
  document_id?: string | null;
  attachment_path?: string | null;
  notes?: string | null;
};

export type NewMemberTransfer = {
  member_id: string;
  direction: TransferDirection;
  counterparty_type: TransferLocationType;
  counterparty_organization_id?: string | null;
  counterparty_church_name?: string | null;
  requested_at?: string | null;
  reason?: string | null;
  recommendation_letter_id?: string | null;
  document_id?: string | null;
  attachment_path?: string | null;
};

/**
 * Formato de erro compartilhado pelas funções `load*` — preserva `code`
 * (necessário para os chamadores distinguirem "tabela ainda não existe
 * neste ambiente" de um erro real de banco/permissão, mesmo padrão já usado
 * em MemberProfile.tsx para member_family/member_addresses).
 */
export type LoadError = { code?: string; message: string } | null;

// ── Timeline institucional ───────────────────────────────────────────────

export async function loadMemberHistory(memberId: string): Promise<{
  rows: MemberHistoryRow[];
  error: LoadError;
}> {
  const { data, error } = await supabase
    .from("member_history")
    .select("*")
    .eq("member_id", memberId)
    .order("occurred_at", { ascending: false });

  if (error) return { rows: [], error: { code: error.code, message: error.message } };
  return { rows: data ?? [], error: null };
}

// ── Ocorrências ──────────────────────────────────────────────────────────

export async function loadMemberOccurrences(memberId: string): Promise<{
  rows: MemberOccurrenceRow[];
  error: LoadError;
}> {
  const { data, error } = await supabase
    .from("member_occurrences")
    .select("*")
    .eq("member_id", memberId)
    .order("occurred_at", { ascending: false });

  if (error) return { rows: [], error: { code: error.code, message: error.message } };
  return { rows: data ?? [], error: null };
}

export async function createMemberOccurrence(
  input: NewMemberOccurrence,
): Promise<{ row: MemberOccurrenceRow | null; error: string | null }> {
  const { data: id, error } = await supabase.rpc("create_member_occurrence", {
    p_member_id: input.member_id,
    p_occurrence_type: input.occurrence_type,
    p_occurred_at: input.occurred_at ?? undefined,
    p_occurred_time: input.occurred_time ?? undefined,
    p_valid_until: input.valid_until ?? undefined,
    p_description: input.description ?? undefined,
    p_visibility: input.visibility ?? "normal",
    p_document_id: input.document_id ?? undefined,
    p_attachment_path: input.attachment_path ?? undefined,
  });

  if (error || !id) return { row: null, error: error?.message ?? "Ocorrência não criada" };
  const { data: row, error: loadError } = await supabase
    .from("member_occurrences")
    .select("*")
    .eq("id", id)
    .single();
  return { row, error: loadError?.message ?? null };
}

export async function updateMemberOccurrenceStatus(
  id: string,
  status: OccurrenceStatus,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("update_member_occurrence_status", {
    p_occurrence_id: id,
    p_status: status,
  });
  return { error: error?.message ?? null };
}

// ── Ordenações e nomeações ───────────────────────────────────────────────

export async function loadMemberOrdinations(memberId: string): Promise<{
  rows: MemberOrdinationRow[];
  error: LoadError;
}> {
  const { data, error } = await supabase
    .from("member_ordinations")
    .select("*")
    .eq("member_id", memberId)
    .order("start_date", { ascending: false });

  if (error) return { rows: [], error: { code: error.code, message: error.message } };
  return { rows: data ?? [], error: null };
}

export async function createMemberOrdination(
  input: NewMemberOrdination,
): Promise<{ row: MemberOrdinationRow | null; error: string | null }> {
  const { data: id, error } = await supabase.rpc("create_member_ordination", {
    p_member_id: input.member_id,
    p_role_or_function: input.role_or_function,
    p_ordination_type: input.ordination_type ?? "nomeacao",
    p_ordination_date: input.ordination_date ?? undefined,
    p_start_date: input.start_date ?? undefined,
    p_authority_name: input.authority_name ?? undefined,
    p_authority_member_id: input.authority_member_id ?? undefined,
    p_document_id: input.document_id ?? undefined,
    p_attachment_path: input.attachment_path ?? undefined,
    p_notes: input.notes ?? undefined,
  });

  if (error || !id) return { row: null, error: error?.message ?? "Ordenação não criada" };
  const { data: row, error: loadError } = await supabase
    .from("member_ordinations")
    .select("*")
    .eq("id", id)
    .single();
  return { row, error: loadError?.message ?? null };
}

export async function updateMemberOrdinationStatus(
  id: string,
  status: Exclude<OrdinationStatus, "ativo">,
  endDate?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("update_member_ordination_status", {
    p_ordination_id: id,
    p_status: status,
    p_end_date: endDate,
  });
  return { error: error?.message ?? null };
}

// ── Transferências ───────────────────────────────────────────────────────

export async function loadMemberTransfers(memberId: string): Promise<{
  rows: MemberTransferRow[];
  error: LoadError;
}> {
  const { data, error } = await supabase
    .from("member_transfers")
    .select("*")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });

  if (error) return { rows: [], error: { code: error.code, message: error.message } };
  return { rows: data ?? [], error: null };
}

export async function createMemberTransfer(
  input: NewMemberTransfer,
): Promise<{ row: MemberTransferRow | null; error: string | null }> {
  const { data: id, error } = await supabase.rpc("create_member_transfer", {
    p_member_id: input.member_id,
    p_direction: input.direction,
    p_counterparty_type: input.counterparty_type,
    p_counterparty_organization_id: input.counterparty_organization_id ?? undefined,
    p_counterparty_church_name: input.counterparty_church_name ?? undefined,
    p_requested_at: input.requested_at ?? undefined,
    p_reason: input.reason ?? undefined,
    p_recommendation_letter_id: input.recommendation_letter_id ?? undefined,
    p_document_id: input.document_id ?? undefined,
    p_attachment_path: input.attachment_path ?? undefined,
  });

  if (error || !id) return { row: null, error: error?.message ?? "Transferência não criada" };
  const { data: row, error: loadError } = await supabase
    .from("member_transfers")
    .select("*")
    .eq("id", id)
    .single();
  return { row, error: loadError?.message ?? null };
}

export async function updateMemberTransferStatus(
  id: string,
  status: TransferStatus,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("update_member_transfer_status", {
    p_transfer_id: id,
    p_status: status,
  });
  return { error: error?.message ?? null };
}

// ── Histórico organizacional (somente leitura — derivado por trigger) ───

export async function loadMemberOrganizationHistory(memberId: string): Promise<{
  rows: MemberOrganizationHistoryRow[];
  error: LoadError;
}> {
  const { data, error } = await supabase
    .from("member_organization_history")
    .select("*")
    .eq("member_id", memberId)
    .order("started_at", { ascending: false });

  if (error) return { rows: [], error: { code: error.code, message: error.message } };
  return { rows: data ?? [], error: null };
}
