/**
 * Camada de serviço da fundação histórica institucional compartilhada
 * (OPERAÇÃO 1 — Fundação compartilhada dos domínios + Secretaria).
 *
 * Ponto de extensão central: `registerHistoryEvent()` chama a RPC
 * `register_member_history_event`, a MESMA função que os triggers de
 * member_occurrences/member_ordinations/member_transfers/members usam no
 * banco. Futuras integrações de Discipulado/Teologia/Missões devem chamar
 * esta mesma função (com `sourceModule` diferente) em vez de recriar lógica
 * de timeline própria.
 *
 * Todas as funções aqui são finas (thin wrappers) sobre o Supabase client —
 * a autorização real sempre vem do RLS/RPC no banco, nunca só do frontend.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type MemberHistoryRow = Tables<"member_history">;
export type MemberOccurrenceRow = Tables<"member_occurrences">;
export type MemberOrdinationRow = Tables<"member_ordinations">;
export type MemberTransferRow = Tables<"member_transfers">;
export type MemberOrganizationHistoryRow = Tables<"member_organization_history">;

export type NewMemberOccurrence = Omit<
  TablesInsert<"member_occurrences">,
  "id" | "created_at" | "updated_at"
>;
export type NewMemberOrdination = Omit<
  TablesInsert<"member_ordinations">,
  "id" | "created_at" | "updated_at"
>;
export type NewMemberTransfer = Omit<
  TablesInsert<"member_transfers">,
  "id" | "created_at" | "updated_at" | "approved_by"
>;

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

/**
 * Ponto de extensão central da fundação compartilhada. Discipulado,
 * Teologia e Missões devem reutilizar esta mesma função (com
 * `sourceModule` próprio) para inserir eventos na mesma timeline da pessoa
 * em vez de criar uma tabela de histórico paralela.
 */
export async function registerHistoryEvent(params: {
  memberId: string;
  historyType: string;
  title: string;
  description?: string | null;
  occurredAt?: string | null;
  sourceModule?: "secretaria" | "discipulado" | "teologia" | "missoes" | "sistema";
  sourceTable?: string | null;
  sourceId?: string | null;
  documentId?: string | null;
  attachmentPath?: string | null;
  visibility?: "normal" | "confidential";
  legacySource?: string | null;
  legacyModule?: string | null;
  legacyCode?: string | null;
}): Promise<{ historyId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("register_member_history_event", {
    p_member_id: params.memberId,
    p_history_type: params.historyType,
    p_title: params.title,
    p_description: params.description ?? undefined,
    p_occurred_at: params.occurredAt ?? undefined,
    p_source_module: params.sourceModule ?? "secretaria",
    p_source_table: params.sourceTable ?? undefined,
    p_source_id: params.sourceId ?? undefined,
    p_document_id: params.documentId ?? undefined,
    p_attachment_path: params.attachmentPath ?? undefined,
    p_visibility: params.visibility ?? "normal",
    p_legacy_source: params.legacySource ?? undefined,
    p_legacy_module: params.legacyModule ?? undefined,
    p_legacy_code: params.legacyCode ?? undefined,
  });

  if (error) return { historyId: null, error: error.message };
  return { historyId: (data as string) ?? null, error: null };
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
  const { data, error } = await supabase
    .from("member_occurrences")
    .insert(input)
    .select("*")
    .single();

  if (error) return { row: null, error: error.message };
  return { row: data, error: null };
}

export async function updateMemberOccurrenceStatus(
  id: string,
  status: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("member_occurrences").update({ status }).eq("id", id);
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
  const { data, error } = await supabase
    .from("member_ordinations")
    .insert(input)
    .select("*")
    .single();

  if (error) return { row: null, error: error.message };
  return { row: data, error: null };
}

export async function endMemberOrdination(
  id: string,
  endDate: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("member_ordinations")
    .update({ status: "encerrado", end_date: endDate })
    .eq("id", id);
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
  const { data, error } = await supabase
    .from("member_transfers")
    .insert(input)
    .select("*")
    .single();

  if (error) return { row: null, error: error.message };
  return { row: data, error: null };
}

export async function updateMemberTransferStatus(
  id: string,
  status: string,
  dates?: { approved_at?: string; completed_at?: string },
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("member_transfers")
    .update({ status, ...dates })
    .eq("id", id);
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
