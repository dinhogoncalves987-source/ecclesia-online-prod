/**
 * Catálogos e rótulos do módulo de Discipulado (OPERAÇÃO 2).
 *
 * Espelham exatamente os `CHECK` das migrations
 * supabase/migrations/20260729090000_discipleship_foundation.sql,
 * 20260729100000_discipleship_classes_and_enrollments.sql e
 * 20260729110000_discipleship_learning_records.sql. Qualquer valor aqui que
 * não exista na constraint do banco é rejeitado pelo Postgres — o frontend
 * nunca inventa um estado que o banco não aceitaria.
 */

// ── Locais (discipleship_locations.location_type) ──────────────────────────
export const DISCIPLESHIP_LOCATION_TYPES = ["templo", "sala", "residencia", "online", "outro"] as const;
export type DiscipleshipLocationType = (typeof DISCIPLESHIP_LOCATION_TYPES)[number];
export const DISCIPLESHIP_LOCATION_TYPE_LABELS: Record<DiscipleshipLocationType, string> = {
  templo: "Templo",
  sala: "Sala",
  residencia: "Residência",
  online: "On-line",
  outro: "Outro",
};

// ── Cursos (discipleship_courses.status) ────────────────────────────────────
export const DISCIPLESHIP_COURSE_STATUSES = ["rascunho", "ativo", "arquivado"] as const;
export type DiscipleshipCourseStatus = (typeof DISCIPLESHIP_COURSE_STATUSES)[number];
export const DISCIPLESHIP_COURSE_STATUS_LABELS: Record<DiscipleshipCourseStatus, string> = {
  rascunho: "Rascunho",
  ativo: "Ativo",
  arquivado: "Arquivado",
};

// ── Lições (discipleship_lessons.status) ────────────────────────────────────
export const DISCIPLESHIP_LESSON_STATUSES = ["ativa", "inativa"] as const;
export type DiscipleshipLessonStatus = (typeof DISCIPLESHIP_LESSON_STATUSES)[number];
export const DISCIPLESHIP_LESSON_STATUS_LABELS: Record<DiscipleshipLessonStatus, string> = {
  ativa: "Ativa",
  inativa: "Inativa",
};

// ── Modalidade (courses/classes/sessions.modality) ─────────────────────────
export const DISCIPLESHIP_MODALITIES = ["presencial", "online", "hibrida"] as const;
export type DiscipleshipModality = (typeof DISCIPLESHIP_MODALITIES)[number];
export const DISCIPLESHIP_MODALITY_LABELS: Record<DiscipleshipModality, string> = {
  presencial: "Presencial",
  online: "On-line",
  hibrida: "Híbrida",
};

// ── Turmas (discipleship_classes.status) ────────────────────────────────────
// Máquina de estados espelhada de update_discipleship_class_status() em
// 20260729100000_discipleship_classes_and_enrollments.sql — ver
// isValidClassStatusTransition() em rules.ts.
export const DISCIPLESHIP_CLASS_STATUSES = [
  "planejamento", "inscricoes_abertas", "em_andamento", "concluida", "cancelada", "arquivada",
] as const;
export type DiscipleshipClassStatus = (typeof DISCIPLESHIP_CLASS_STATUSES)[number];
export const DISCIPLESHIP_CLASS_STATUS_LABELS: Record<DiscipleshipClassStatus, string> = {
  planejamento: "Planejamento",
  inscricoes_abertas: "Inscrições abertas",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
  arquivada: "Arquivada",
};
/** Turma nestes estados não aceita novos lançamentos comuns (encontro, matrícula, frequência). */
export const DISCIPLESHIP_CLASS_CLOSED_STATUSES: readonly DiscipleshipClassStatus[] = [
  "concluida", "cancelada", "arquivada",
];

// ── Equipe da turma (discipleship_staff_assignments) ────────────────────────
export const DISCIPLESHIP_STAFF_ROLES = [
  "coordenador", "secretario", "discipulador", "professor", "auxiliar",
] as const;
export type DiscipleshipStaffRole = (typeof DISCIPLESHIP_STAFF_ROLES)[number];
export const DISCIPLESHIP_STAFF_ROLE_LABELS: Record<DiscipleshipStaffRole, string> = {
  coordenador: "Coordenador(a)",
  secretario: "Secretário(a)",
  discipulador: "Discipulador(a)",
  professor: "Professor(a)",
  auxiliar: "Auxiliar",
};
export const DISCIPLESHIP_STAFF_STATUSES = ["ativo", "encerrado"] as const;
export type DiscipleshipStaffStatus = (typeof DISCIPLESHIP_STAFF_STATUSES)[number];

// ── Matrículas (discipleship_enrollments.status) ────────────────────────────
// Máquina de estados espelhada de update_discipleship_enrollment_status() em
// 20260729100000_discipleship_classes_and_enrollments.sql — ver
// isValidEnrollmentStatusTransition() em rules.ts.
export const DISCIPLESHIP_ENROLLMENT_STATUSES = [
  "lista_espera", "matriculado", "ativo", "concluido", "desistente", "transferido", "cancelado",
] as const;
export type DiscipleshipEnrollmentStatus = (typeof DISCIPLESHIP_ENROLLMENT_STATUSES)[number];
export const DISCIPLESHIP_ENROLLMENT_STATUS_LABELS: Record<DiscipleshipEnrollmentStatus, string> = {
  lista_espera: "Lista de espera",
  matriculado: "Matriculado",
  ativo: "Ativo",
  concluido: "Concluído",
  desistente: "Desistente",
  transferido: "Transferido",
  cancelado: "Cancelado",
};
/** Matrícula nestes estados está encerrada — histórico preservado, sem novos lançamentos. */
export const DISCIPLESHIP_ENROLLMENT_CLOSED_STATUSES: readonly DiscipleshipEnrollmentStatus[] = [
  "concluido", "desistente", "transferido", "cancelado",
];

export const DISCIPLESHIP_FINAL_RESULTS = ["aprovado", "reprovado", "sem_avaliacao"] as const;
export type DiscipleshipFinalResult = (typeof DISCIPLESHIP_FINAL_RESULTS)[number];
export const DISCIPLESHIP_FINAL_RESULT_LABELS: Record<DiscipleshipFinalResult, string> = {
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  sem_avaliacao: "Sem avaliação",
};

// ── Encontros/aulas (discipleship_sessions.status) ──────────────────────────
export const DISCIPLESHIP_SESSION_STATUSES = ["agendada", "realizada", "cancelada"] as const;
export type DiscipleshipSessionStatus = (typeof DISCIPLESHIP_SESSION_STATUSES)[number];
export const DISCIPLESHIP_SESSION_STATUS_LABELS: Record<DiscipleshipSessionStatus, string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  cancelada: "Cancelada",
};

// ── Frequência (discipleship_attendance.status) ─────────────────────────────
export const DISCIPLESHIP_ATTENDANCE_STATUSES = ["presente", "ausente", "justificado", "nao_lancado"] as const;
export type DiscipleshipAttendanceStatus = (typeof DISCIPLESHIP_ATTENDANCE_STATUSES)[number];
export const DISCIPLESHIP_ATTENDANCE_STATUS_LABELS: Record<DiscipleshipAttendanceStatus, string> = {
  presente: "Presente",
  ausente: "Ausente",
  justificado: "Justificado",
  nao_lancado: "Não lançado",
};
/** Situações que contam como "aula lançada" no denominador da frequência. */
export const DISCIPLESHIP_ATTENDANCE_COUNTED_STATUSES: readonly DiscipleshipAttendanceStatus[] = [
  "presente", "ausente", "justificado",
];
/** Situações que contam como presença no numerador da frequência (justificado conta a favor do aluno). */
export const DISCIPLESHIP_ATTENDANCE_PRESENT_STATUSES: readonly DiscipleshipAttendanceStatus[] = [
  "presente", "justificado",
];

// ── Avaliações (discipleship_assessments) ───────────────────────────────────
export const DISCIPLESHIP_ASSESSMENT_TYPES = ["prova", "trabalho", "participacao", "pratica", "outro"] as const;
export type DiscipleshipAssessmentType = (typeof DISCIPLESHIP_ASSESSMENT_TYPES)[number];
export const DISCIPLESHIP_ASSESSMENT_TYPE_LABELS: Record<DiscipleshipAssessmentType, string> = {
  prova: "Prova",
  trabalho: "Trabalho",
  participacao: "Participação",
  pratica: "Prática",
  outro: "Outro",
};
export const DISCIPLESHIP_ASSESSMENT_STATUSES = ["planejada", "aplicada", "cancelada"] as const;
export type DiscipleshipAssessmentStatus = (typeof DISCIPLESHIP_ASSESSMENT_STATUSES)[number];
export const DISCIPLESHIP_ASSESSMENT_STATUS_LABELS: Record<DiscipleshipAssessmentStatus, string> = {
  planejada: "Planejada",
  aplicada: "Aplicada",
  cancelada: "Cancelada",
};

// ── Acompanhamento (discipleship_followups.visibility) ──────────────────────
// Mesmos dois valores de Visibility em memberHistoryConstants.ts — reexportado
// aqui só por semântica local, não uma nova enumeração paralela.
export const DISCIPLESHIP_FOLLOWUP_VISIBILITIES = ["normal", "confidential"] as const;
export type DiscipleshipFollowupVisibility = (typeof DISCIPLESHIP_FOLLOWUP_VISIBILITIES)[number];
export const DISCIPLESHIP_FOLLOWUP_VISIBILITY_LABELS: Record<DiscipleshipFollowupVisibility, string> = {
  normal: "Visível à equipe",
  confidential: "Confidencial (somente coordenação/governança)",
};
