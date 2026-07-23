/**
 * Camada de serviço do módulo de Discipulado (OPERAÇÃO 2).
 *
 * Mesmo padrão de src/lib/memberHistory.ts: wrappers finos sobre o Supabase
 * client. A autorização real está sempre no RLS/RPC do banco — estas funções
 * nunca decidem permissão no frontend, apenas repassam o resultado.
 *
 * IMPORTANTE: as tabelas/RPCs `discipleship_*` só existem depois que as
 * migrations 20260729090000-20260729120000 forem aplicadas em staging. Até
 * lá, toda chamada aqui retornará um erro do PostgREST (tabela/função
 * inexistente) — os componentes de UI devem tratar isso como estado vazio
 * "módulo aguardando aplicação", nunca como falha silenciosa.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type {
  DiscipleshipAssessmentType,
  DiscipleshipAttendanceStatus,
  DiscipleshipClassStatus,
  DiscipleshipCourseStatus,
  DiscipleshipEnrollmentStatus,
  DiscipleshipFollowupVisibility,
  DiscipleshipLocationType,
  DiscipleshipModality,
  DiscipleshipStaffRole,
} from "./constants";

export type DiscipleshipLocationRow = Tables<"discipleship_locations">;
export type DiscipleshipDepartmentRow = Tables<"discipleship_departments">;
export type DiscipleshipCourseRow = Tables<"discipleship_courses">;
export type DiscipleshipLessonRow = Tables<"discipleship_lessons">;
export type DiscipleshipClassRow = Tables<"discipleship_classes">;
export type DiscipleshipStaffAssignmentRow = Tables<"discipleship_staff_assignments">;
export type DiscipleshipEnrollmentRow = Tables<"discipleship_enrollments">;
export type DiscipleshipSessionRow = Tables<"discipleship_sessions">;
export type DiscipleshipAttendanceRow = Tables<"discipleship_attendance">;
export type DiscipleshipAssessmentRow = Tables<"discipleship_assessments">;
export type DiscipleshipAssessmentResultRow = Tables<"discipleship_assessment_results">;
export type DiscipleshipFollowupRow = Tables<"discipleship_followups">;
export type DiscipleshipMemberLabel = {
  id: string;
  full_name: string;
  known_name: string | null;
  member_code: string | null;
};

/** Mesmo formato de erro usado por memberHistory.ts (preserva `code` do PostgREST). */
export type LoadError = { code?: string; message: string } | null;
type LoadResult<T> = { rows: T[]; error: LoadError };

function toLoadError(error: { code?: string; message: string } | null): LoadError {
  return error ? { code: error.code, message: error.message } : null;
}

// ── Diretório mínimo de membros ──────────────────────────────────────────

export async function searchDiscipleshipMembers(
  organizationId: string,
  query: string,
): Promise<LoadResult<DiscipleshipMemberLabel>> {
  const { data, error } = await supabase.rpc("search_discipleship_members", {
    p_organization_id: organizationId,
    p_query: query.trim() || undefined,
    p_limit: 30,
  });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function getDiscipleshipMemberLabels(
  organizationId: string,
  memberIds: string[],
): Promise<LoadResult<DiscipleshipMemberLabel>> {
  if (memberIds.length === 0) return { rows: [], error: null };
  const { data, error } = await supabase.rpc("get_discipleship_member_labels", {
    p_organization_id: organizationId,
    p_member_ids: memberIds,
  });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

// ── Locais ────────────────────────────────────────────────────────────────

export async function loadDiscipleshipLocations(organizationId: string): Promise<LoadResult<DiscipleshipLocationRow>> {
  const { data, error } = await supabase
    .from("discipleship_locations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function createDiscipleshipLocation(input: {
  organization_id: string;
  name: string;
  short_name?: string | null;
  location_type?: DiscipleshipLocationType;
  address_text?: string | null;
  capacity?: number | null;
}): Promise<{ row: DiscipleshipLocationRow | null; error: string | null }> {
  const { data, error } = await supabase.from("discipleship_locations").insert(input).select("*").single();
  return { row: data ?? null, error: error?.message ?? null };
}

// ── Departamentos ────────────────────────────────────────────────────────

export async function loadDiscipleshipDepartments(organizationId: string): Promise<LoadResult<DiscipleshipDepartmentRow>> {
  const { data, error } = await supabase
    .from("discipleship_departments")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function createDiscipleshipDepartment(input: {
  organization_id: string;
  name: string;
  short_name?: string | null;
  description?: string | null;
}): Promise<{ row: DiscipleshipDepartmentRow | null; error: string | null }> {
  const { data, error } = await supabase.from("discipleship_departments").insert(input).select("*").single();
  return { row: data ?? null, error: error?.message ?? null };
}

// ── Cursos ────────────────────────────────────────────────────────────────

export async function loadDiscipleshipCourses(organizationId: string): Promise<LoadResult<DiscipleshipCourseRow>> {
  const { data, error } = await supabase
    .from("discipleship_courses")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export type NewDiscipleshipCourse = {
  organization_id: string;
  department_id?: string | null;
  code?: string | null;
  name: string;
  short_name?: string | null;
  description?: string | null;
  objectives?: string | null;
  workload_hours?: number | null;
  expected_lessons_count?: number | null;
  requires_attendance?: boolean;
  minimum_attendance_percentage?: number;
  requires_assessment?: boolean;
  minimum_passing_score?: number | null;
  completion_criteria?: string | null;
  status?: DiscipleshipCourseStatus;
};

export async function createDiscipleshipCourse(
  input: NewDiscipleshipCourse,
): Promise<{ row: DiscipleshipCourseRow | null; error: string | null }> {
  const { data, error } = await supabase.from("discipleship_courses").insert(input).select("*").single();
  return { row: data ?? null, error: error?.message ?? null };
}

/** Usado pela aba Participantes: cursos de várias turmas de uma vez, sem N chamadas. */
export async function loadDiscipleshipCoursesByIds(courseIds: string[]): Promise<LoadResult<DiscipleshipCourseRow>> {
  if (courseIds.length === 0) return { rows: [], error: null };
  const { data, error } = await supabase.from("discipleship_courses").select("*").in("id", courseIds);
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function loadDiscipleshipCourseById(id: string): Promise<{ row: DiscipleshipCourseRow | null; error: string | null }> {
  const { data, error } = await supabase.from("discipleship_courses").select("*").eq("id", id).single();
  return { row: data ?? null, error: error?.message ?? null };
}

export async function updateDiscipleshipCourse(
  id: string,
  patch: Partial<NewDiscipleshipCourse>,
): Promise<{ row: DiscipleshipCourseRow | null; error: string | null }> {
  const { data, error } = await supabase.from("discipleship_courses").update(patch).eq("id", id).select("*").single();
  return { row: data ?? null, error: error?.message ?? null };
}

// ── Lições ────────────────────────────────────────────────────────────────

export async function loadDiscipleshipLessons(courseId: string): Promise<LoadResult<DiscipleshipLessonRow>> {
  const { data, error } = await supabase
    .from("discipleship_lessons")
    .select("*")
    .eq("course_id", courseId)
    .order("sequence_number", { ascending: true });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function createDiscipleshipLesson(input: {
  course_id: string;
  sequence_number: number;
  title: string;
  description?: string | null;
  content?: string | null;
  estimated_duration_minutes?: number | null;
  is_mandatory?: boolean;
}): Promise<{ row: DiscipleshipLessonRow | null; error: string | null }> {
  const { data, error } = await supabase.from("discipleship_lessons").insert(input).select("*").single();
  return { row: data ?? null, error: error?.message ?? null };
}

/** Reordenação atômica — usa a RPC dedicada (evita colisão do índice único de sequência). */
export async function reorderDiscipleshipLessons(
  courseId: string,
  lessonIdsInOrder: string[],
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("reorder_discipleship_lessons", {
    p_course_id: courseId,
    p_lesson_ids: lessonIdsInOrder,
  });
  return { error: error?.message ?? null };
}

// ── Turmas ────────────────────────────────────────────────────────────────

export async function loadDiscipleshipClasses(organizationId: string): Promise<LoadResult<DiscipleshipClassRow>> {
  const { data, error } = await supabase
    .from("discipleship_classes")
    .select("*")
    .eq("organization_id", organizationId)
    .order("start_date", { ascending: false });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

/** Usado pela Visão Geral/Relatórios: várias turmas de uma vez, sem N chamadas. */
export async function loadDiscipleshipClassesByIds(classIds: string[]): Promise<LoadResult<DiscipleshipClassRow>> {
  if (classIds.length === 0) return { rows: [], error: null };
  const { data, error } = await supabase.from("discipleship_classes").select("*").in("id", classIds);
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function loadDiscipleshipClass(classId: string): Promise<{ row: DiscipleshipClassRow | null; error: string | null }> {
  const { data, error } = await supabase.from("discipleship_classes").select("*").eq("id", classId).single();
  return { row: data ?? null, error: error?.message ?? null };
}

export type NewDiscipleshipClass = {
  course_id: string;
  organization_id: string;
  location_id?: string | null;
  code?: string | null;
  name: string;
  short_name?: string | null;
  start_date?: string;
  expected_end_date?: string | null;
  capacity?: number | null;
  modality?: DiscipleshipModality;
  notes?: string | null;
};

export async function createDiscipleshipClass(
  input: NewDiscipleshipClass,
): Promise<{ row: DiscipleshipClassRow | null; error: string | null }> {
  const { data, error } = await supabase.from("discipleship_classes").insert(input).select("*").single();
  return { row: data ?? null, error: error?.message ?? null };
}

/** Campos operacionais — `status` é deliberadamente excluído (só via RPC, ver updateDiscipleshipClassStatus). */
export async function updateDiscipleshipClass(
  id: string,
  patch: Partial<Omit<NewDiscipleshipClass, "course_id" | "organization_id">>,
): Promise<{ row: DiscipleshipClassRow | null; error: string | null }> {
  const { data, error } = await supabase.from("discipleship_classes").update(patch).eq("id", id).select("*").single();
  return { row: data ?? null, error: error?.message ?? null };
}

export async function updateDiscipleshipClassStatus(
  classId: string,
  status: DiscipleshipClassStatus,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("update_discipleship_class_status", { p_class_id: classId, p_status: status });
  return { error: error?.message ?? null };
}

// ── Equipe da turma ──────────────────────────────────────────────────────

export async function loadDiscipleshipStaffAssignments(classId: string): Promise<LoadResult<DiscipleshipStaffAssignmentRow>> {
  const { data, error } = await supabase
    .from("discipleship_staff_assignments")
    .select("*")
    .eq("class_id", classId)
    .order("start_date", { ascending: false });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function assignDiscipleshipStaff(input: {
  class_id: string;
  member_id: string;
  role: DiscipleshipStaffRole;
  start_date?: string;
  notes?: string | null;
}): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("assign_discipleship_staff", {
    p_class_id: input.class_id,
    p_member_id: input.member_id,
    p_role: input.role,
    p_start_date: input.start_date,
    p_notes: input.notes ?? undefined,
  });
  return { id: data ?? null, error: error?.message ?? null };
}

export async function endDiscipleshipStaffAssignment(
  assignmentId: string,
  endDate?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("end_discipleship_staff_assignment", {
    p_assignment_id: assignmentId,
    p_end_date: endDate,
  });
  return { error: error?.message ?? null };
}

// ── Matrículas ────────────────────────────────────────────────────────────

export async function loadDiscipleshipEnrollments(classId: string): Promise<LoadResult<DiscipleshipEnrollmentRow>> {
  const { data, error } = await supabase
    .from("discipleship_enrollments")
    .select("*")
    .eq("class_id", classId)
    .order("enrolled_at", { ascending: false });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

/** Matrículas de UM membro em QUALQUER turma — usado pelo card "Discipulado" no perfil do membro. */
export async function loadDiscipleshipEnrollmentsForMember(memberId: string): Promise<LoadResult<DiscipleshipEnrollmentRow>> {
  const { data, error } = await supabase
    .from("discipleship_enrollments")
    .select("*")
    .eq("member_id", memberId)
    .order("enrolled_at", { ascending: false });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

/** Usado pela Visão Geral/Relatórios: matrículas de várias turmas de uma vez. */
export async function loadDiscipleshipEnrollmentsForClasses(classIds: string[]): Promise<LoadResult<DiscipleshipEnrollmentRow>> {
  if (classIds.length === 0) return { rows: [], error: null };
  const { data, error } = await supabase.from("discipleship_enrollments").select("*").in("class_id", classIds);
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function enrollMemberInClass(
  classId: string,
  memberId: string,
  status: "lista_espera" | "matriculado" = "matriculado",
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("enroll_member_in_class", {
    p_class_id: classId,
    p_member_id: memberId,
    p_status: status,
  });
  return { id: data ?? null, error: error?.message ?? null };
}

export async function updateDiscipleshipEnrollmentStatus(input: {
  enrollment_id: string;
  status: DiscipleshipEnrollmentStatus;
  final_result?: "aprovado" | "reprovado" | "sem_avaliacao" | null;
  notes?: string | null;
  override_eligibility?: boolean;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("update_discipleship_enrollment_status", {
    p_enrollment_id: input.enrollment_id,
    p_status: input.status,
    p_final_result: input.final_result ?? undefined,
    p_notes: input.notes ?? undefined,
    p_override_eligibility: input.override_eligibility ?? false,
  });
  return { error: error?.message ?? null };
}

export async function getDiscipleshipEnrollmentProgress(enrollmentId: string): Promise<{
  data: {
    total_completed_sessions: number;
    total_sessions_launched: number;
    missing_attendance_records: number;
    present_sessions: number;
    attendance_percentage: number | null;
    average_score: number | null;
    assessments_weighted: number | null;
    required_assessments: number;
    recorded_assessments: number;
    missing_assessment_results: number;
  } | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc("get_discipleship_enrollment_progress", { p_enrollment_id: enrollmentId });
  return { data: (data as never) ?? null, error: error?.message ?? null };
}

export async function markDiscipleshipCertificateIssued(
  enrollmentId: string,
  documentId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("mark_discipleship_certificate_issued", {
    p_enrollment_id: enrollmentId,
    p_document_id: documentId,
  });
  return { error: error?.message ?? null };
}

// ── Encontros/aulas ──────────────────────────────────────────────────────

export async function loadDiscipleshipSessions(classId: string): Promise<LoadResult<DiscipleshipSessionRow>> {
  const { data, error } = await supabase
    .from("discipleship_sessions")
    .select("*")
    .eq("class_id", classId)
    .order("session_date", { ascending: false });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function createDiscipleshipSession(input: {
  class_id: string;
  lesson_id?: string | null;
  location_id?: string | null;
  instructor_member_id?: string | null;
  session_date?: string;
  session_time?: string | null;
  modality?: DiscipleshipModality | null;
  content_covered?: string | null;
  notes?: string | null;
}): Promise<{ row: DiscipleshipSessionRow | null; error: string | null }> {
  const { data, error } = await supabase.from("discipleship_sessions").insert(input).select("*").single();
  return { row: data ?? null, error: error?.message ?? null };
}

export async function updateDiscipleshipSessionStatus(
  sessionId: string,
  status: "realizada" | "cancelada",
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("update_discipleship_session_status", {
    p_session_id: sessionId,
    p_status: status,
  });
  return { error: error?.message ?? null };
}

/** Usado pela Visão Geral/Relatórios: encontros de várias turmas de uma vez. */
export async function loadDiscipleshipSessionsForClasses(classIds: string[]): Promise<LoadResult<DiscipleshipSessionRow>> {
  if (classIds.length === 0) return { rows: [], error: null };
  const { data, error } = await supabase
    .from("discipleship_sessions")
    .select("*")
    .in("class_id", classIds)
    .order("session_date", { ascending: true });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

// ── Frequência ───────────────────────────────────────────────────────────

export async function loadDiscipleshipAttendance(sessionId: string): Promise<LoadResult<DiscipleshipAttendanceRow>> {
  const { data, error } = await supabase
    .from("discipleship_attendance")
    .select("*")
    .eq("session_id", sessionId);
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function loadDiscipleshipAttendanceForEnrollment(enrollmentId: string): Promise<LoadResult<DiscipleshipAttendanceRow>> {
  const { data, error } = await supabase
    .from("discipleship_attendance")
    .select("*")
    .eq("enrollment_id", enrollmentId);
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

/** Usado pela Visão Geral/Relatórios: frequência de várias sessões de uma vez. */
export async function loadDiscipleshipAttendanceForSessions(sessionIds: string[]): Promise<LoadResult<DiscipleshipAttendanceRow>> {
  if (sessionIds.length === 0) return { rows: [], error: null };
  const { data, error } = await supabase.from("discipleship_attendance").select("*").in("session_id", sessionIds);
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

/** Lançamento em lote — mesma RPC que valida estado da turma/autorização de uma vez para toda a turma. */
export async function recordDiscipleshipAttendance(
  sessionId: string,
  entries: Array<{ enrollment_id: string; status: DiscipleshipAttendanceStatus; observation?: string | null }>,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("record_discipleship_attendance", {
    p_session_id: sessionId,
    p_entries: entries as never,
  });
  return { error: error?.message ?? null };
}

// ── Avaliações ───────────────────────────────────────────────────────────

export async function loadDiscipleshipAssessments(classId: string): Promise<LoadResult<DiscipleshipAssessmentRow>> {
  const { data, error } = await supabase
    .from("discipleship_assessments")
    .select("*")
    .eq("class_id", classId)
    .order("scheduled_at", { ascending: true });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function createDiscipleshipAssessment(input: {
  class_id: string;
  title: string;
  description?: string | null;
  assessment_type?: DiscipleshipAssessmentType;
  max_score?: number;
  weight?: number;
  scheduled_at?: string | null;
}): Promise<{ row: DiscipleshipAssessmentRow | null; error: string | null }> {
  const { data, error } = await supabase.from("discipleship_assessments").insert(input).select("*").single();
  return { row: data ?? null, error: error?.message ?? null };
}

export async function updateDiscipleshipAssessmentStatus(
  assessmentId: string,
  status: "aplicada" | "cancelada",
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("update_discipleship_assessment_status", {
    p_assessment_id: assessmentId,
    p_status: status,
  });
  return { error: error?.message ?? null };
}

/** Usado pela Visão Geral/Relatórios: avaliações de várias turmas de uma vez. */
export async function loadDiscipleshipAssessmentsForClasses(classIds: string[]): Promise<LoadResult<DiscipleshipAssessmentRow>> {
  if (classIds.length === 0) return { rows: [], error: null };
  const { data, error } = await supabase.from("discipleship_assessments").select("*").in("class_id", classIds);
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

/** Usado pela Visão Geral/Relatórios: resultados de várias avaliações de uma vez. */
export async function loadDiscipleshipAssessmentResultsForAssessments(assessmentIds: string[]): Promise<LoadResult<DiscipleshipAssessmentResultRow>> {
  if (assessmentIds.length === 0) return { rows: [], error: null };
  const { data, error } = await supabase.from("discipleship_assessment_results").select("*").in("assessment_id", assessmentIds);
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function loadDiscipleshipAssessmentResults(assessmentId: string): Promise<LoadResult<DiscipleshipAssessmentResultRow>> {
  const { data, error } = await supabase
    .from("discipleship_assessment_results")
    .select("*")
    .eq("assessment_id", assessmentId);
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function loadDiscipleshipAssessmentResultsForEnrollment(enrollmentId: string): Promise<LoadResult<DiscipleshipAssessmentResultRow>> {
  const { data, error } = await supabase
    .from("discipleship_assessment_results")
    .select("*")
    .eq("enrollment_id", enrollmentId);
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function recordDiscipleshipAssessmentResult(input: {
  assessment_id: string;
  enrollment_id: string;
  score: number;
  observation?: string | null;
}): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("record_discipleship_assessment_result", {
    p_assessment_id: input.assessment_id,
    p_enrollment_id: input.enrollment_id,
    p_score: input.score,
    p_observation: input.observation ?? undefined,
  });
  return { id: data ?? null, error: error?.message ?? null };
}

// ── Acompanhamento individual ────────────────────────────────────────────

export async function loadDiscipleshipFollowups(enrollmentId: string): Promise<LoadResult<DiscipleshipFollowupRow>> {
  const { data, error } = await supabase
    .from("discipleship_followups")
    .select("*")
    .eq("enrollment_id", enrollmentId)
    .order("occurred_at", { ascending: false });
  if (error) return { rows: [], error: toLoadError(error) };
  return { rows: data ?? [], error: null };
}

export async function createDiscipleshipFollowup(input: {
  enrollment_id: string;
  observation: string;
  occurred_at?: string;
  visibility?: DiscipleshipFollowupVisibility;
  document_id?: string | null;
  attachment_path?: string | null;
}): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("create_discipleship_followup", {
    p_enrollment_id: input.enrollment_id,
    p_observation: input.observation,
    p_occurred_at: input.occurred_at,
    p_visibility: input.visibility ?? "normal",
    p_document_id: input.document_id ?? undefined,
    p_attachment_path: input.attachment_path ?? undefined,
  });
  return { id: data ?? null, error: error?.message ?? null };
}
