/**
 * Camada de serviço do módulo de Teologia (OPERAÇÃO 3).
 *
 * Mesmo padrão de src/lib/discipleship/service.ts: wrappers finos sobre o
 * Supabase client. A autorização real está sempre no RLS/RPC do banco —
 * estas funções nunca decidem permissão no frontend, apenas repassam o
 * resultado.
 *
 * IMPORTANTE: as tabelas/RPCs `theology_*` só existem depois que as
 * migrations 20260730090000-20260730140000 forem aplicadas em staging. Até
 * lá, toda chamada aqui retornará um erro do PostgREST (tabela/função
 * inexistente) — os componentes de UI devem tratar isso como estado vazio
 * "módulo aguardando aplicação", nunca como falha silenciosa (nenhum `catch`
 * deve transformar esse erro real em lista vazia).
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type {
  TheologyAssessmentType,
  TheologyAttendanceStatus,
  TheologyClassStatus,
  TheologyEnrollmentFinalResult,
  TheologyEnrollmentStatus,
  TheologyModality,
  TheologyOfferingEnrollmentStatus,
  TheologyOfferingFinalResult,
  TheologyOfferingStatus,
  TheologyPeriodStatus,
  TheologyProgramStatus,
  TheologyRoundingRule,
  TheologyStaffRole,
  TheologyStudyCenterType,
  TheologySubjectStatus,
  TheologyTransactionLinkType,
} from "./constants";

export type TheologyInstituteRow = Tables<"theology_institutes">;
export type TheologyStudyCenterRow = Tables<"theology_study_centers">;
export type TheologySubjectRow = Tables<"theology_subjects">;
export type TheologyProgramRow = Tables<"theology_programs">;
export type TheologyCurriculumItemRow = Tables<"theology_curriculum_items">;
export type TheologyPeriodRow = Tables<"theology_periods">;
export type TheologyClassRow = Tables<"theology_classes">;
export type TheologyClassOfferingRow = Tables<"theology_class_offerings">;
export type TheologyStaffAssignmentRow = Tables<"theology_staff_assignments">;
export type TheologyEnrollmentRow = Tables<"theology_enrollments">;
export type TheologyOfferingEnrollmentRow = Tables<"theology_offering_enrollments">;
export type TheologySessionRow = Tables<"theology_sessions">;
export type TheologyAttendanceRow = Tables<"theology_attendance">;
export type TheologyAssessmentModelRow = Tables<"theology_assessment_models">;
export type TheologyAssessmentModelComponentRow = Tables<"theology_assessment_model_components">;
export type TheologyAssessmentRow = Tables<"theology_assessments">;
export type TheologyAssessmentResultRow = Tables<"theology_assessment_results">;
export type TheologyGradeAuditLogRow = Tables<"theology_grade_audit_log">;
export type TheologyTransactionLinkRow = Tables<"theology_transaction_links">;

export type TheologyMemberLabel = {
  id: string;
  full_name: string;
  known_name: string | null;
  member_code: string | null;
};

/** Mesmo formato de erro usado por discipleship/service.ts (preserva `code` do PostgREST). */
export type LoadError = { code?: string; message: string } | null;
type LoadResult<T> = { rows: T[]; error: LoadError };

function toLoadError(error: { code?: string; message: string } | null): LoadError {
  return error ? { code: error.code, message: error.message } : null;
}

// ── Diretório mínimo de membros ──────────────────────────────────────────

export async function searchTheologyMembers(
  organizationId: string,
  query: string,
): Promise<LoadResult<TheologyMemberLabel>> {
  const { data, error } = await supabase.rpc("search_theology_members", {
    p_organization_id: organizationId,
    p_query: query.trim() || undefined,
    p_limit: 30,
  });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function getTheologyMemberLabels(
  organizationId: string,
  memberIds: string[],
): Promise<LoadResult<TheologyMemberLabel>> {
  if (memberIds.length === 0) return { rows: [], error: null };
  const { data, error } = await supabase.rpc("get_theology_member_labels", {
    p_organization_id: organizationId,
    p_member_ids: memberIds,
  });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

// ── Instituto Teológico ───────────────────────────────────────────────────

export async function loadTheologyInstitutes(organizationId: string): Promise<LoadResult<TheologyInstituteRow>> {
  const { data, error } = await supabase
    .from("theology_institutes")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export type NewTheologyInstitute = {
  organization_id: string;
  code?: string | null;
  name: string;
  short_name?: string | null;
  description?: string | null;
  accreditation_info?: string | null;
  default_minimum_attendance_percentage?: number;
  default_minimum_passing_score?: number;
};

export async function createTheologyInstitute(
  input: NewTheologyInstitute,
): Promise<{ row: TheologyInstituteRow | null; error: string | null }> {
  const { data, error } = await supabase.from("theology_institutes").insert(input).select("*").single();
  return { row: data ?? null, error: error?.message ?? null };
}

export async function updateTheologyInstitute(
  id: string,
  patch: Partial<Omit<NewTheologyInstitute, "organization_id">>,
): Promise<{ row: TheologyInstituteRow | null; error: string | null }> {
  const { data, error } = await supabase.from("theology_institutes").update(patch).eq("id", id).select("*").single();
  return { row: data ?? null, error: error?.message ?? null };
}

// ── Núcleos de estudo ─────────────────────────────────────────────────────

export async function loadTheologyStudyCenters(organizationId: string): Promise<LoadResult<TheologyStudyCenterRow>> {
  const { data, error } = await supabase
    .from("theology_study_centers")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export type NewTheologyStudyCenter = {
  organization_id: string;
  institute_id?: string | null;
  name: string;
  short_name?: string | null;
  center_type?: TheologyStudyCenterType;
  address_text?: string | null;
  capacity?: number | null;
};

export async function createTheologyStudyCenter(
  input: NewTheologyStudyCenter,
): Promise<{ row: TheologyStudyCenterRow | null; error: string | null }> {
  const { data, error } = await supabase.from("theology_study_centers").insert(input).select("*").single();
  return { row: data ?? null, error: error?.message ?? null };
}

// ── Matérias/unidades curriculares ───────────────────────────────────────

export async function loadTheologySubjects(organizationId: string): Promise<LoadResult<TheologySubjectRow>> {
  const { data, error } = await supabase
    .from("theology_subjects")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export type NewTheologySubject = {
  organization_id: string;
  code?: string | null;
  name: string;
  short_name?: string | null;
  description?: string | null;
  workload_hours?: number | null;
  status?: TheologySubjectStatus;
};

export async function createTheologySubject(
  input: NewTheologySubject,
): Promise<{ row: TheologySubjectRow | null; error: string | null }> {
  const { data, error } = await supabase.from("theology_subjects").insert(input).select("*").single();
  return { row: data ?? null, error: error?.message ?? null };
}

export async function updateTheologySubject(
  id: string,
  patch: Partial<Omit<NewTheologySubject, "organization_id">>,
): Promise<{ row: TheologySubjectRow | null; error: string | null }> {
  const { data, error } = await supabase.from("theology_subjects").update(patch).eq("id", id).select("*").single();
  return { row: data ?? null, error: error?.message ?? null };
}

// ── Programas/tipos de curso ──────────────────────────────────────────────

export async function loadTheologyPrograms(organizationId: string): Promise<LoadResult<TheologyProgramRow>> {
  const { data, error } = await supabase
    .from("theology_programs")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function loadTheologyProgram(id: string): Promise<{ row: TheologyProgramRow | null; error: string | null }> {
  const { data, error } = await supabase.from("theology_programs").select("*").eq("id", id).single();
  return { row: data ?? null, error: error?.message ?? null };
}

export type NewTheologyProgram = {
  organization_id: string;
  institute_id?: string | null;
  code?: string | null;
  name: string;
  short_name?: string | null;
  description?: string | null;
  objectives?: string | null;
  workload_hours?: number | null;
  requires_attendance?: boolean;
  minimum_attendance_percentage?: number;
  requires_assessment?: boolean;
  minimum_passing_score?: number | null;
  completion_criteria?: string | null;
};

export async function createTheologyProgram(
  input: NewTheologyProgram,
): Promise<{ row: TheologyProgramRow | null; error: string | null }> {
  const { data, error } = await supabase.from("theology_programs").insert(input).select("*").single();
  return { row: data ?? null, error: error?.message ?? null };
}

export async function updateTheologyProgram(
  id: string,
  patch: Partial<Omit<NewTheologyProgram, "organization_id">>,
): Promise<{ row: TheologyProgramRow | null; error: string | null }> {
  const { data, error } = await supabase.from("theology_programs").update(patch).eq("id", id).select("*").single();
  return { row: data ?? null, error: error?.message ?? null };
}

/** Ativação/arquivamento — mesma tabela, sem RPC dedicada (trigger valida "matriz obrigatória" na própria migration). */
export async function updateTheologyProgramStatus(
  id: string,
  status: TheologyProgramStatus,
): Promise<{ row: TheologyProgramRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("theology_programs")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();
  return { row: data ?? null, error: error?.message ?? null };
}

// ── Matriz curricular ─────────────────────────────────────────────────────

export async function loadTheologyCurriculumItems(programId: string): Promise<LoadResult<TheologyCurriculumItemRow>> {
  const { data, error } = await supabase
    .from("theology_curriculum_items")
    .select("*")
    .eq("program_id", programId)
    .order("sequence_number", { ascending: true });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function createTheologyCurriculumItem(input: {
  program_id: string;
  subject_id: string;
  sequence_number: number;
  is_mandatory?: boolean;
  workload_hours_override?: number | null;
  notes?: string | null;
}): Promise<{ row: TheologyCurriculumItemRow | null; error: string | null }> {
  const { data, error } = await supabase.from("theology_curriculum_items").insert(input).select("*").single();
  return { row: data ?? null, error: error?.message ?? null };
}

/** Reordenação atômica — usa a RPC dedicada (evita colisão do índice único de sequência). */
export async function reorderTheologyCurriculumItems(
  programId: string,
  itemIdsInOrder: string[],
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("reorder_theology_curriculum_items", {
    p_program_id: programId,
    p_item_ids: itemIdsInOrder,
  });
  return { error: error?.message ?? null };
}

// ── Períodos letivos ──────────────────────────────────────────────────────

export async function loadTheologyPeriods(organizationId: string): Promise<LoadResult<TheologyPeriodRow>> {
  const { data, error } = await supabase
    .from("theology_periods")
    .select("*")
    .eq("organization_id", organizationId)
    .order("start_date", { ascending: false });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export type NewTheologyPeriod = {
  organization_id: string;
  institute_id?: string | null;
  code?: string | null;
  name: string;
  start_date: string;
  end_date?: string | null;
  notes?: string | null;
};

export async function createTheologyPeriod(
  input: NewTheologyPeriod,
): Promise<{ row: TheologyPeriodRow | null; error: string | null }> {
  const { data, error } = await supabase.from("theology_periods").insert(input).select("*").single();
  return { row: data ?? null, error: error?.message ?? null };
}

export async function updateTheologyPeriodStatus(
  periodId: string,
  status: TheologyPeriodStatus,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("update_theology_period_status", { p_period_id: periodId, p_status: status });
  return { error: error?.message ?? null };
}

// ── Turmas ────────────────────────────────────────────────────────────────

export async function loadTheologyClasses(organizationId: string): Promise<LoadResult<TheologyClassRow>> {
  const { data, error } = await supabase
    .from("theology_classes")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function loadTheologyClassesByPeriod(periodId: string): Promise<LoadResult<TheologyClassRow>> {
  const { data, error } = await supabase
    .from("theology_classes")
    .select("*")
    .eq("period_id", periodId)
    .order("name", { ascending: true });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function loadTheologyClass(id: string): Promise<{ row: TheologyClassRow | null; error: string | null }> {
  const { data, error } = await supabase.from("theology_classes").select("*").eq("id", id).single();
  return { row: data ?? null, error: error?.message ?? null };
}

export type NewTheologyClass = {
  period_id: string;
  program_id: string;
  organization_id: string;
  study_center_id?: string | null;
  code?: string | null;
  name: string;
  short_name?: string | null;
  capacity?: number | null;
  modality?: TheologyModality;
  notes?: string | null;
};

export async function createTheologyClass(
  input: NewTheologyClass,
): Promise<{ row: TheologyClassRow | null; error: string | null }> {
  const { data, error } = await supabase.from("theology_classes").insert(input).select("*").single();
  return { row: data ?? null, error: error?.message ?? null };
}

/** Campos operacionais — `status` é deliberadamente excluído (só via RPC, ver updateTheologyClassStatus). */
export async function updateTheologyClass(
  id: string,
  patch: Partial<Omit<NewTheologyClass, "period_id" | "program_id" | "organization_id">>,
): Promise<{ row: TheologyClassRow | null; error: string | null }> {
  const { data, error } = await supabase.from("theology_classes").update(patch).eq("id", id).select("*").single();
  return { row: data ?? null, error: error?.message ?? null };
}

export async function updateTheologyClassStatus(
  classId: string,
  status: TheologyClassStatus,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("update_theology_class_status", { p_class_id: classId, p_status: status });
  return { error: error?.message ?? null };
}

// ── Ofertas de unidade por turma ──────────────────────────────────────────

export async function loadTheologyClassOfferings(classId: string): Promise<LoadResult<TheologyClassOfferingRow>> {
  const { data, error } = await supabase
    .from("theology_class_offerings")
    .select("*")
    .eq("class_id", classId)
    .order("created_at", { ascending: true });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function createTheologyClassOffering(input: {
  class_id: string;
  curriculum_item_id: string;
  capacity?: number | null;
  notes?: string | null;
}): Promise<{ row: TheologyClassOfferingRow | null; error: string | null }> {
  const { data, error } = await supabase.from("theology_class_offerings").insert(input).select("*").single();
  return { row: data ?? null, error: error?.message ?? null };
}

export async function updateTheologyClassOfferingStatus(
  offeringId: string,
  status: TheologyOfferingStatus,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("update_theology_class_offering_status", {
    p_offering_id: offeringId,
    p_status: status,
  });
  return { error: error?.message ?? null };
}

// ── Equipe acadêmica ──────────────────────────────────────────────────────

export async function loadTheologyStaffAssignments(classId: string): Promise<LoadResult<TheologyStaffAssignmentRow>> {
  const { data, error } = await supabase
    .from("theology_staff_assignments")
    .select("*")
    .eq("class_id", classId)
    .order("start_date", { ascending: false });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function assignTheologyStaff(input: {
  class_id: string;
  member_id: string;
  role: TheologyStaffRole;
  offering_id?: string | null;
  start_date?: string;
  notes?: string | null;
}): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("assign_theology_staff", {
    p_class_id: input.class_id,
    p_member_id: input.member_id,
    p_role: input.role,
    p_offering_id: input.offering_id ?? undefined,
    p_start_date: input.start_date,
    p_notes: input.notes ?? undefined,
  });
  return { id: data ?? null, error: error?.message ?? null };
}

export async function endTheologyStaffAssignment(
  assignmentId: string,
  endDate?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("end_theology_staff_assignment", {
    p_assignment_id: assignmentId,
    p_end_date: endDate,
  });
  return { error: error?.message ?? null };
}

// ── Matrículas na turma ───────────────────────────────────────────────────

export async function loadTheologyEnrollments(classId: string): Promise<LoadResult<TheologyEnrollmentRow>> {
  const { data, error } = await supabase
    .from("theology_enrollments")
    .select("*")
    .eq("class_id", classId)
    .order("enrolled_at", { ascending: false });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

/** Matrículas de UM membro em QUALQUER turma — usado pelo card "Teologia" no perfil do membro. */
export async function loadTheologyEnrollmentsForMember(memberId: string): Promise<LoadResult<TheologyEnrollmentRow>> {
  const { data, error } = await supabase
    .from("theology_enrollments")
    .select("*")
    .eq("member_id", memberId)
    .order("enrolled_at", { ascending: false });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function enrollMemberInTheologyClass(
  classId: string,
  memberId: string,
  status: "pendente" | "matriculado" = "matriculado",
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("enroll_member_in_theology_class", {
    p_class_id: classId,
    p_member_id: memberId,
    p_status: status,
  });
  return { id: data ?? null, error: error?.message ?? null };
}

export async function updateTheologyEnrollmentStatus(input: {
  enrollment_id: string;
  status: TheologyEnrollmentStatus;
  final_result?: TheologyEnrollmentFinalResult | null;
  notes?: string | null;
  override_eligibility?: boolean;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("update_theology_enrollment_status", {
    p_enrollment_id: input.enrollment_id,
    p_status: input.status,
    p_final_result: input.final_result ?? undefined,
    p_notes: input.notes ?? undefined,
    p_override_eligibility: input.override_eligibility ?? false,
  });
  return { error: error?.message ?? null };
}

export async function markTheologyCertificateIssued(
  enrollmentId: string,
  documentId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("mark_theology_certificate_issued", {
    p_enrollment_id: enrollmentId,
    p_document_id: documentId,
  });
  return { error: error?.message ?? null };
}

// ── Matrícula por oferta (tentativas/repetência) ─────────────────────────

export async function loadTheologyOfferingEnrollments(offeringId: string): Promise<LoadResult<TheologyOfferingEnrollmentRow>> {
  const { data, error } = await supabase
    .from("theology_offering_enrollments")
    .select("*")
    .eq("offering_id", offeringId)
    .order("attempt_number", { ascending: true });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function loadTheologyOfferingEnrollmentsForEnrollment(
  enrollmentId: string,
): Promise<LoadResult<TheologyOfferingEnrollmentRow>> {
  const { data, error } = await supabase
    .from("theology_offering_enrollments")
    .select("*")
    .eq("enrollment_id", enrollmentId)
    .order("attempt_number", { ascending: true });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function enrollMemberInTheologyOffering(
  enrollmentId: string,
  offeringId: string,
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("enroll_member_in_theology_offering", {
    p_enrollment_id: enrollmentId,
    p_offering_id: offeringId,
  });
  return { id: data ?? null, error: error?.message ?? null };
}

export async function updateTheologyOfferingEnrollmentStatus(input: {
  offering_enrollment_id: string;
  status: TheologyOfferingEnrollmentStatus;
  final_grade?: number | null;
  final_result?: TheologyOfferingFinalResult | null;
  notes?: string | null;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("update_theology_offering_enrollment_status", {
    p_offering_enrollment_id: input.offering_enrollment_id,
    p_status: input.status,
    p_final_grade: input.final_grade ?? undefined,
    p_final_result: input.final_result ?? undefined,
    p_notes: input.notes ?? undefined,
  });
  return { error: error?.message ?? null };
}

// ── Aulas/sessões ─────────────────────────────────────────────────────────

export async function loadTheologySessions(offeringId: string): Promise<LoadResult<TheologySessionRow>> {
  const { data, error } = await supabase
    .from("theology_sessions")
    .select("*")
    .eq("offering_id", offeringId)
    .order("session_date", { ascending: false });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function createTheologySession(input: {
  offering_id: string;
  instructor_member_id?: string | null;
  session_date?: string;
  session_time?: string | null;
  content_covered?: string | null;
  notes?: string | null;
}): Promise<{ row: TheologySessionRow | null; error: string | null }> {
  const { data, error } = await supabase.from("theology_sessions").insert(input).select("*").single();
  return { row: data ?? null, error: error?.message ?? null };
}

export async function updateTheologySessionStatus(
  sessionId: string,
  status: "realizada" | "cancelada",
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("update_theology_session_status", { p_session_id: sessionId, p_status: status });
  return { error: error?.message ?? null };
}

// ── Frequência ───────────────────────────────────────────────────────────

export async function loadTheologyAttendance(sessionId: string): Promise<LoadResult<TheologyAttendanceRow>> {
  const { data, error } = await supabase.from("theology_attendance").select("*").eq("session_id", sessionId);
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function loadTheologyAttendanceForOfferingEnrollment(
  offeringEnrollmentId: string,
): Promise<LoadResult<TheologyAttendanceRow>> {
  const { data, error } = await supabase
    .from("theology_attendance")
    .select("*")
    .eq("offering_enrollment_id", offeringEnrollmentId);
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

/** Lançamento em lote — a RPC valida estado da sessão/autorização de uma vez para toda a turma. */
export async function recordTheologyAttendance(
  sessionId: string,
  entries: Array<{ offering_enrollment_id: string; status: TheologyAttendanceStatus; observation?: string | null }>,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("record_theology_attendance", {
    p_session_id: sessionId,
    p_entries: entries as never,
  });
  return { error: error?.message ?? null };
}

// ── Modelos de avaliação (substituem Mod01/Mod02/Mod03 do WinTechi) ──────

export async function loadTheologyAssessmentModels(organizationId: string): Promise<LoadResult<TheologyAssessmentModelRow>> {
  const { data, error } = await supabase
    .from("theology_assessment_models")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export type NewTheologyAssessmentModel = {
  organization_id: string;
  program_id?: string | null;
  name: string;
  description?: string | null;
  scale_max_score?: number;
  minimum_passing_score?: number;
  rounding_rule?: TheologyRoundingRule;
  retake_rule?: string | null;
};

export async function createTheologyAssessmentModel(
  input: NewTheologyAssessmentModel,
): Promise<{ row: TheologyAssessmentModelRow | null; error: string | null }> {
  const { data, error } = await supabase.from("theology_assessment_models").insert(input).select("*").single();
  return { row: data ?? null, error: error?.message ?? null };
}

export async function loadTheologyAssessmentModelComponents(
  modelId: string,
): Promise<LoadResult<TheologyAssessmentModelComponentRow>> {
  const { data, error } = await supabase
    .from("theology_assessment_model_components")
    .select("*")
    .eq("model_id", modelId)
    .order("sequence_number", { ascending: true });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function createTheologyAssessmentModelComponent(input: {
  model_id: string;
  name: string;
  weight?: number;
  max_score?: number;
  is_mandatory?: boolean;
  sequence_number: number;
}): Promise<{ row: TheologyAssessmentModelComponentRow | null; error: string | null }> {
  const { data, error } = await supabase.from("theology_assessment_model_components").insert(input).select("*").single();
  return { row: data ?? null, error: error?.message ?? null };
}

// ── Avaliações aplicadas ──────────────────────────────────────────────────

export async function loadTheologyAssessments(offeringId: string): Promise<LoadResult<TheologyAssessmentRow>> {
  const { data, error } = await supabase
    .from("theology_assessments")
    .select("*")
    .eq("offering_id", offeringId)
    .order("scheduled_at", { ascending: true });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function createTheologyAssessment(input: {
  offering_id: string;
  model_id: string;
  title: string;
  description?: string | null;
  assessment_type?: TheologyAssessmentType;
  weight?: number;
  scheduled_at?: string | null;
}): Promise<{ row: TheologyAssessmentRow | null; error: string | null }> {
  const { data, error } = await supabase.from("theology_assessments").insert(input).select("*").single();
  return { row: data ?? null, error: error?.message ?? null };
}

export async function updateTheologyAssessmentStatus(
  assessmentId: string,
  status: "agendada" | "aplicada" | "publicada" | "cancelada",
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("update_theology_assessment_status", {
    p_assessment_id: assessmentId,
    p_status: status,
  });
  return { error: error?.message ?? null };
}

// ── Notas/resultados ──────────────────────────────────────────────────────

export async function loadTheologyAssessmentResults(assessmentId: string): Promise<LoadResult<TheologyAssessmentResultRow>> {
  const { data, error } = await supabase.from("theology_assessment_results").select("*").eq("assessment_id", assessmentId);
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function loadTheologyAssessmentResultsForOfferingEnrollment(
  offeringEnrollmentId: string,
): Promise<LoadResult<TheologyAssessmentResultRow>> {
  const { data, error } = await supabase
    .from("theology_assessment_results")
    .select("*")
    .eq("offering_enrollment_id", offeringEnrollmentId);
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function recordTheologyAssessmentResult(input: {
  assessment_id: string;
  component_id: string;
  offering_enrollment_id: string;
  score: number;
  observation?: string | null;
}): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("record_theology_assessment_result", {
    p_assessment_id: input.assessment_id,
    p_component_id: input.component_id,
    p_offering_enrollment_id: input.offering_enrollment_id,
    p_score: input.score,
    p_observation: input.observation ?? undefined,
  });
  return { id: data ?? null, error: error?.message ?? null };
}

/** Alteração de nota já publicada — exige justificativa e capability de gestão; nunca um UPDATE silencioso. */
export async function amendTheologyAssessmentResult(input: {
  result_id: string;
  new_score: number;
  justification: string;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("amend_theology_assessment_result", {
    p_result_id: input.result_id,
    p_new_score: input.new_score,
    p_justification: input.justification,
  });
  return { error: error?.message ?? null };
}

export async function loadTheologyGradeAuditLog(resultId: string): Promise<LoadResult<TheologyGradeAuditLogRow>> {
  const { data, error } = await supabase
    .from("theology_grade_audit_log")
    .select("*")
    .eq("result_id", resultId)
    .order("changed_at", { ascending: false });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

// ── Boletim, histórico e formandos (leitura derivada, nunca persistida) ──

export type TheologyStudentTranscriptRow = {
  enrollment_id: string;
  class_id: string;
  class_name: string;
  program_name: string;
  enrollment_status: string;
  offering_enrollment_id: string | null;
  subject_name: string | null;
  attempt_number: number | null;
  offering_status: string | null;
  final_grade: number | null;
  final_result: string | null;
  is_mandatory: boolean | null;
  completed_at: string | null;
};

export async function getTheologyStudentTranscript(
  memberId: string,
  organizationId: string,
): Promise<{ rows: TheologyStudentTranscriptRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc("get_theology_student_transcript", {
    p_member_id: memberId,
    p_organization_id: organizationId,
  });
  return { rows: data ?? [], error: error?.message ?? null };
}

export type TheologyPeriodGraduateRow = {
  enrollment_id: string;
  member_id: string;
  class_id: string;
  class_name: string;
  program_name: string;
  enrollment_status: string;
  already_concluded: boolean;
};

export async function listTheologyPeriodGraduates(
  periodId: string,
): Promise<{ rows: TheologyPeriodGraduateRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc("list_theology_period_graduates", { p_period_id: periodId });
  return { rows: data ?? [], error: error?.message ?? null };
}

// ── Financeiro acadêmico (vínculo — nunca cópia de valor monetário) ──────

export async function linkTheologyTransaction(input: {
  transaction_id: string;
  link_type: TheologyTransactionLinkType;
  enrollment_id?: string | null;
  period_id?: string | null;
  notes?: string | null;
}): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("link_theology_transaction", {
    p_transaction_id: input.transaction_id,
    p_link_type: input.link_type,
    p_enrollment_id: input.enrollment_id ?? undefined,
    p_period_id: input.period_id ?? undefined,
    p_notes: input.notes ?? undefined,
  });
  return { id: data ?? null, error: error?.message ?? null };
}

export type TheologyLinkedTransactionRow = {
  link_id: string;
  transaction_id: string;
  link_type: string;
  amount: number;
  transaction_type: string;
  transaction_date: string;
  transaction_description: string | null;
  transaction_status: string;
};

export async function listTheologyLinkedTransactions(input: {
  enrollment_id?: string | null;
  period_id?: string | null;
}): Promise<{ rows: TheologyLinkedTransactionRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc("list_theology_linked_transactions", {
    p_enrollment_id: input.enrollment_id ?? undefined,
    p_period_id: input.period_id ?? undefined,
  });
  return { rows: data ?? [], error: error?.message ?? null };
}
