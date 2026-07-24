/**
 * Camada de serviço do módulo de Missões (OPERAÇÃO 4).
 *
 * Mesmo padrão de src/lib/theology/service.ts: wrappers finos sobre o
 * Supabase client. A autorização real está sempre no RLS/RPC do banco —
 * estas funções nunca decidem permissão no frontend, apenas repassam o
 * resultado.
 *
 * IMPORTANTE: as tabelas/RPCs `missions_*` só existem depois que as
 * migrations 20260731090000-20260731140000 forem aplicadas em staging. Até
 * lá, toda chamada aqui retornará um erro do PostgREST (tabela/função
 * inexistente) — os componentes de UI devem tratar isso como estado vazio
 * "módulo aguardando aplicação", nunca como falha silenciosa (nenhum `catch`
 * deve transformar esse erro real em lista vazia).
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type {
  MissionsCommitmentStatus,
  MissionsContactPreference,
  MissionsInstallmentStatus,
  MissionsMissionaryStatus,
  MissionsPeriodicity,
  MissionsProjectAssignmentRole,
  MissionsProjectStatus,
  MissionsSupporterStatus,
  MissionsTransactionLinkType,
} from "./constants";

export type MissionsSettingsRow = Tables<"missions_settings">;
export type MissionsMissionaryRow = Tables<"missions_missionaries">;
export type MissionsMissionaryConfidentialInfoRow = Tables<"missions_missionary_confidential_info">;
export type MissionsProjectRow = Tables<"missions_projects">;
export type MissionsProjectAssignmentRow = Tables<"missions_project_assignments">;
export type MissionsSupporterRow = Tables<"missions_supporters">;
export type MissionsSupporterCommitmentRow = Tables<"missions_supporter_commitments">;
export type MissionsCommitmentInstallmentRow = Tables<"missions_commitment_installments">;
export type MissionsTransactionLinkRow = Tables<"missions_transaction_links">;

export type MissionsMemberLabel = {
  id: string;
  full_name: string;
  known_name: string | null;
  member_code: string | null;
};

/** Mesmo formato de erro usado por theology/discipleship/service.ts (preserva `code` do PostgREST). */
export type LoadError = { code?: string; message: string } | null;
type LoadResult<T> = { rows: T[]; error: LoadError };

function toLoadError(error: { code?: string; message: string } | null): LoadError {
  return error ? { code: error.code, message: error.message } : null;
}

// ── Diretório mínimo de membros ──────────────────────────────────────────

export async function searchMissionsMembers(
  organizationId: string,
  query: string,
): Promise<LoadResult<MissionsMemberLabel>> {
  const { data, error } = await supabase.rpc("search_missions_members", {
    p_organization_id: organizationId,
    p_query: query.trim() || undefined,
    p_limit: 30,
  });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function getMissionsMemberLabels(
  organizationId: string,
  memberIds: string[],
): Promise<LoadResult<MissionsMemberLabel>> {
  if (memberIds.length === 0) return { rows: [], error: null };
  const { data, error } = await supabase.rpc("get_missions_member_labels", {
    p_organization_id: organizationId,
    p_member_ids: memberIds,
  });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

// ── Parâmetros (missions_settings) ───────────────────────────────────────

export async function loadMissionsSettings(
  organizationId: string,
): Promise<{ row: MissionsSettingsRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("missions_settings")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return { row: data ?? null, error: error?.message ?? null };
}

export async function upsertMissionsSettings(input: {
  organization_id: string;
  default_finance_account_id?: string | null;
  default_account_category_id?: string | null;
  default_cost_center_id?: string | null;
  default_periodicity?: MissionsPeriodicity;
  installment_due_day?: number;
  late_alert_days?: number;
  notes?: string | null;
}): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("upsert_missions_settings", {
    p_organization_id: input.organization_id,
    p_default_finance_account_id: input.default_finance_account_id ?? undefined,
    p_default_account_category_id: input.default_account_category_id ?? undefined,
    p_default_cost_center_id: input.default_cost_center_id ?? undefined,
    p_default_periodicity: input.default_periodicity,
    p_installment_due_day: input.installment_due_day,
    p_late_alert_days: input.late_alert_days,
    p_notes: input.notes ?? undefined,
  });
  return { id: data ?? null, error: error?.message ?? null };
}

// ── Missionários ──────────────────────────────────────────────────────────

export async function loadMissionsMissionaries(organizationId: string): Promise<LoadResult<MissionsMissionaryRow>> {
  const { data, error } = await supabase
    .from("missions_missionaries")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function loadMissionsMissionary(
  id: string,
): Promise<{ row: MissionsMissionaryRow | null; error: string | null }> {
  const { data, error } = await supabase.from("missions_missionaries").select("*").eq("id", id).single();
  return { row: data ?? null, error: error?.message ?? null };
}

export type NewMissionsMissionary = {
  member_id: string;
  organization_id: string;
  coordinator_member_id?: string | null;
  field_country?: string | null;
  field_state?: string | null;
  field_city?: string | null;
  field_region?: string | null;
  field_description?: string | null;
  public_notes?: string | null;
};

export async function createMissionsMissionary(
  input: NewMissionsMissionary,
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("create_missions_missionary", {
    p_member_id: input.member_id,
    p_organization_id: input.organization_id,
    p_coordinator_member_id: input.coordinator_member_id ?? undefined,
    p_field_country: input.field_country ?? undefined,
    p_field_state: input.field_state ?? undefined,
    p_field_city: input.field_city ?? undefined,
    p_field_region: input.field_region ?? undefined,
    p_field_description: input.field_description ?? undefined,
    p_public_notes: input.public_notes ?? undefined,
  });
  return { id: data ?? null, error: error?.message ?? null };
}

export async function updateMissionsMissionaryProfile(input: {
  missionary_id: string;
  coordinator_member_id?: string | null;
  field_country?: string | null;
  field_state?: string | null;
  field_city?: string | null;
  field_region?: string | null;
  field_description?: string | null;
  public_notes?: string | null;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("update_missions_missionary_profile", {
    p_missionary_id: input.missionary_id,
    p_coordinator_member_id: input.coordinator_member_id ?? undefined,
    p_field_country: input.field_country ?? undefined,
    p_field_state: input.field_state ?? undefined,
    p_field_city: input.field_city ?? undefined,
    p_field_region: input.field_region ?? undefined,
    p_field_description: input.field_description ?? undefined,
    p_public_notes: input.public_notes ?? undefined,
  });
  return { error: error?.message ?? null };
}

export async function updateMissionsMissionaryStatus(input: {
  missionary_id: string;
  status: MissionsMissionaryStatus;
  effective_date?: string;
  notes?: string | null;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("update_missions_missionary_status", {
    p_missionary_id: input.missionary_id,
    p_status: input.status,
    p_effective_date: input.effective_date,
    p_notes: input.notes ?? undefined,
  });
  return { error: error?.message ?? null };
}

// ── Informações confidenciais do missionário ─────────────────────────────

export async function loadMissionsMissionaryConfidentialInfo(
  missionaryId: string,
): Promise<{ row: MissionsMissionaryConfidentialInfoRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("missions_missionary_confidential_info")
    .select("*")
    .eq("missionary_id", missionaryId)
    .maybeSingle();
  return { row: data ?? null, error: error?.message ?? null };
}

export async function upsertMissionsMissionaryConfidentialInfo(input: {
  missionary_id: string;
  personal_document?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  health_notes?: string | null;
  confidential_notes?: string | null;
  document_id?: string | null;
  attachment_path?: string | null;
}): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("upsert_missions_missionary_confidential_info", {
    p_missionary_id: input.missionary_id,
    p_personal_document: input.personal_document ?? undefined,
    p_emergency_contact_name: input.emergency_contact_name ?? undefined,
    p_emergency_contact_phone: input.emergency_contact_phone ?? undefined,
    p_health_notes: input.health_notes ?? undefined,
    p_confidential_notes: input.confidential_notes ?? undefined,
    p_document_id: input.document_id ?? undefined,
    p_attachment_path: input.attachment_path ?? undefined,
  });
  return { id: data ?? null, error: error?.message ?? null };
}

// ── Projetos e ações ───────────────────────────────────────────────────────

export async function loadMissionsProjects(organizationId: string): Promise<LoadResult<MissionsProjectRow>> {
  const { data, error } = await supabase
    .from("missions_projects")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function loadMissionsProject(
  id: string,
): Promise<{ row: MissionsProjectRow | null; error: string | null }> {
  const { data, error } = await supabase.from("missions_projects").select("*").eq("id", id).single();
  return { row: data ?? null, error: error?.message ?? null };
}

export type NewMissionsProject = {
  organization_id: string;
  name: string;
  description?: string | null;
  objectives?: string | null;
  campaign_id?: string | null;
  field_country?: string | null;
  field_state?: string | null;
  field_city?: string | null;
  field_region?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  goals_notes?: string | null;
};

export async function createMissionsProject(
  input: NewMissionsProject,
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("create_missions_project", {
    p_organization_id: input.organization_id,
    p_name: input.name,
    p_description: input.description ?? undefined,
    p_objectives: input.objectives ?? undefined,
    p_campaign_id: input.campaign_id ?? undefined,
    p_field_country: input.field_country ?? undefined,
    p_field_state: input.field_state ?? undefined,
    p_field_city: input.field_city ?? undefined,
    p_field_region: input.field_region ?? undefined,
    p_start_date: input.start_date ?? undefined,
    p_end_date: input.end_date ?? undefined,
    p_goals_notes: input.goals_notes ?? undefined,
  });
  return { id: data ?? null, error: error?.message ?? null };
}

export async function updateMissionsProjectProfile(
  input: NewMissionsProject & { project_id: string },
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("update_missions_project_profile", {
    p_project_id: input.project_id,
    p_name: input.name,
    p_description: input.description ?? undefined,
    p_objectives: input.objectives ?? undefined,
    p_campaign_id: input.campaign_id ?? undefined,
    p_field_country: input.field_country ?? undefined,
    p_field_state: input.field_state ?? undefined,
    p_field_city: input.field_city ?? undefined,
    p_field_region: input.field_region ?? undefined,
    p_start_date: input.start_date ?? undefined,
    p_end_date: input.end_date ?? undefined,
    p_goals_notes: input.goals_notes ?? undefined,
  });
  return { error: error?.message ?? null };
}

export async function updateMissionsProjectStatus(input: {
  project_id: string;
  status: MissionsProjectStatus;
  notes?: string | null;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("update_missions_project_status", {
    p_project_id: input.project_id,
    p_status: input.status,
    p_notes: input.notes ?? undefined,
  });
  return { error: error?.message ?? null };
}

// ── Responsáveis/missionários do projeto ──────────────────────────────────

export async function loadMissionsProjectAssignments(
  projectId: string,
): Promise<LoadResult<MissionsProjectAssignmentRow>> {
  const { data, error } = await supabase
    .from("missions_project_assignments")
    .select("*")
    .eq("project_id", projectId)
    .order("start_date", { ascending: false });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function assignMissionsProjectMember(input: {
  project_id: string;
  member_id: string;
  role: MissionsProjectAssignmentRole;
  start_date?: string;
  notes?: string | null;
}): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("assign_missions_project_member", {
    p_project_id: input.project_id,
    p_member_id: input.member_id,
    p_role: input.role,
    p_start_date: input.start_date,
    p_notes: input.notes ?? undefined,
  });
  return { id: data ?? null, error: error?.message ?? null };
}

export async function endMissionsProjectAssignment(
  assignmentId: string,
  endDate?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("end_missions_project_assignment", {
    p_assignment_id: assignmentId,
    p_end_date: endDate,
  });
  return { error: error?.message ?? null };
}

// ── Apoiadores/contribuintes ───────────────────────────────────────────────

export async function loadMissionsSupporters(organizationId: string): Promise<LoadResult<MissionsSupporterRow>> {
  const { data, error } = await supabase
    .from("missions_supporters")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function createMissionsSupporter(input: {
  member_id: string;
  organization_id: string;
  contact_preference?: MissionsContactPreference;
  notes?: string | null;
}): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("create_missions_supporter", {
    p_member_id: input.member_id,
    p_organization_id: input.organization_id,
    p_contact_preference: input.contact_preference,
    p_notes: input.notes ?? undefined,
  });
  return { id: data ?? null, error: error?.message ?? null };
}

export async function updateMissionsSupporterStatus(
  supporterId: string,
  status: MissionsSupporterStatus,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("update_missions_supporter_status", {
    p_supporter_id: supporterId,
    p_status: status,
  });
  return { error: error?.message ?? null };
}

// ── Compromissos ───────────────────────────────────────────────────────────

export async function loadMissionsCommitments(
  supporterId: string,
): Promise<LoadResult<MissionsSupporterCommitmentRow>> {
  const { data, error } = await supabase
    .from("missions_supporter_commitments")
    .select("*")
    .eq("supporter_id", supporterId)
    .order("start_date", { ascending: false });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export type NewMissionsCommitment = {
  supporter_id: string;
  periodicity: MissionsPeriodicity;
  committed_amount: number;
  missionary_id?: string | null;
  project_id?: string | null;
  campaign_id?: string | null;
  start_date?: string;
  end_date?: string | null;
  notes?: string | null;
};

export async function createMissionsCommitment(
  input: NewMissionsCommitment,
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("create_missions_commitment", {
    p_supporter_id: input.supporter_id,
    p_periodicity: input.periodicity,
    p_committed_amount: input.committed_amount,
    p_missionary_id: input.missionary_id ?? undefined,
    p_project_id: input.project_id ?? undefined,
    p_campaign_id: input.campaign_id ?? undefined,
    p_start_date: input.start_date,
    p_end_date: input.end_date ?? undefined,
    p_notes: input.notes ?? undefined,
  });
  return { id: data ?? null, error: error?.message ?? null };
}

export async function updateMissionsCommitmentStatus(
  commitmentId: string,
  status: MissionsCommitmentStatus,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("update_missions_commitment_status", {
    p_commitment_id: commitmentId,
    p_status: status,
  });
  return { error: error?.message ?? null };
}

// ── Parcelas/mensalidades ─────────────────────────────────────────────────

export async function loadMissionsInstallments(
  commitmentId: string,
): Promise<LoadResult<MissionsCommitmentInstallmentRow>> {
  const { data, error } = await supabase
    .from("missions_commitment_installments")
    .select("*")
    .eq("commitment_id", commitmentId)
    .order("reference_month", { ascending: true });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function generateMissionsCommitmentInstallment(input: {
  commitment_id: string;
  reference_month: string;
  due_date: string;
  expected_amount?: number;
}): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("generate_missions_commitment_installment", {
    p_commitment_id: input.commitment_id,
    p_reference_month: input.reference_month,
    p_due_date: input.due_date,
    p_expected_amount: input.expected_amount,
  });
  return { id: data ?? null, error: error?.message ?? null };
}

export async function refreshMissionsInstallmentStatus(installmentId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("refresh_missions_installment_status", {
    p_installment_id: installmentId,
  });
  return { error: error?.message ?? null };
}

/** Só aceita 'cancelado'/'isento' — a RPC bloqueia quando já há valor pago real (contrato §7). */
export async function setMissionsInstallmentExemption(input: {
  installment_id: string;
  status: "cancelado" | "isento";
  notes?: string | null;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("set_missions_installment_exemption", {
    p_installment_id: input.installment_id,
    p_status: input.status,
    p_notes: input.notes ?? undefined,
  });
  return { error: error?.message ?? null };
}

// ── Financeiro missionário (vínculo — nunca cópia de valor monetário) ────

export async function linkMissionsTransaction(input: {
  transaction_id: string;
  link_type: MissionsTransactionLinkType;
  installment_id?: string | null;
  project_id?: string | null;
  missionary_id?: string | null;
  campaign_id?: string | null;
  notes?: string | null;
}): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("link_missions_transaction", {
    p_transaction_id: input.transaction_id,
    p_link_type: input.link_type,
    p_installment_id: input.installment_id ?? undefined,
    p_project_id: input.project_id ?? undefined,
    p_missionary_id: input.missionary_id ?? undefined,
    p_campaign_id: input.campaign_id ?? undefined,
    p_notes: input.notes ?? undefined,
  });
  return { id: data ?? null, error: error?.message ?? null };
}

export async function unlinkMissionsTransaction(linkId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("unlink_missions_transaction", { p_link_id: linkId });
  return { error: error?.message ?? null };
}

export type MissionsLinkedTransactionRow = {
  link_id: string;
  transaction_id: string;
  link_type: string;
  amount: number;
  transaction_type: string;
  transaction_date: string;
  transaction_description: string | null;
  transaction_status: string;
};

export async function listMissionsLinkedTransactions(input: {
  installment_id?: string | null;
  project_id?: string | null;
  missionary_id?: string | null;
  campaign_id?: string | null;
}): Promise<{ rows: MissionsLinkedTransactionRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc("list_missions_linked_transactions", {
    p_installment_id: input.installment_id ?? undefined,
    p_project_id: input.project_id ?? undefined,
    p_missionary_id: input.missionary_id ?? undefined,
    p_campaign_id: input.campaign_id ?? undefined,
  });
  return { rows: data ?? [], error: error?.message ?? null };
}

// ── Relatórios/indicadores (leitura derivada, nunca persistida) ─────────

export type MissionsDashboardSummary = {
  missionaries_candidato: number;
  missionaries_em_preparacao: number;
  missionaries_ativo: number;
  missionaries_em_licenca: number;
  missionaries_retornado: number;
  missionaries_encerrado: number;
  projects_ativo: number;
  projects_planejado: number;
  supporters_ativo: number;
  commitments_ativo: number;
  installments_pending_count: number;
  installments_pending_amount: number;
  installments_overdue_count: number;
  installments_overdue_amount: number;
  expected_total_amount: number;
  received_total_amount: number;
};

export async function getMissionsDashboardSummary(
  organizationId: string,
): Promise<{ row: MissionsDashboardSummary | null; error: string | null }> {
  const { data, error } = await supabase.rpc("get_missions_dashboard_summary", {
    p_organization_id: organizationId,
  });
  return { row: data?.[0] ?? null, error: error?.message ?? null };
}

export type MissionsMissionaryByFieldRow = {
  field_country: string | null;
  field_state: string | null;
  field_region: string | null;
  missionary_count: number;
};

export async function listMissionsMissionariesByField(
  organizationId: string,
): Promise<{ rows: MissionsMissionaryByFieldRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc("list_missions_missionaries_by_field", {
    p_organization_id: organizationId,
  });
  return { rows: data ?? [], error: error?.message ?? null };
}

export type MissionsProjectIndicatorRow = {
  project_id: string;
  project_name: string;
  project_status: string;
  expected_amount: number;
  received_amount: number;
  active_missionaries: number;
};

export async function listMissionsProjectIndicators(input: {
  organization_id: string;
  project_id?: string | null;
}): Promise<{ rows: MissionsProjectIndicatorRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc("list_missions_project_indicators", {
    p_organization_id: input.organization_id,
    p_project_id: input.project_id ?? undefined,
  });
  return { rows: data ?? [], error: error?.message ?? null };
}

export type MissionsCommitmentInstallmentReportRow = {
  installment_id: string;
  commitment_id: string;
  supporter_member_name: string;
  context_label: string;
  reference_month: string;
  due_date: string;
  expected_amount: number;
  paid_amount: number;
  status: string;
};

export async function listMissionsCommitmentInstallmentsReport(input: {
  organization_id: string;
  status_filter?: MissionsInstallmentStatus | null;
  only_overdue?: boolean;
}): Promise<{ rows: MissionsCommitmentInstallmentReportRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc("list_missions_commitment_installments", {
    p_organization_id: input.organization_id,
    p_status_filter: input.status_filter ?? undefined,
    p_only_overdue: input.only_overdue,
  });
  return { rows: data ?? [], error: error?.message ?? null };
}
