/**
 * Catálogos e rótulos do módulo de Teologia (OPERAÇÃO 3).
 *
 * Espelham exatamente os `CHECK` das migrations
 * supabase/migrations/20260730090000_theology_foundation.sql,
 * 20260730100000_theology_curriculum.sql,
 * 20260730110000_theology_periods_classes_enrollments.sql,
 * 20260730120000_theology_attendance_and_assessments.sql e
 * 20260730140000_theology_finance_links_and_permissions.sql. Qualquer valor
 * aqui que não exista na constraint do banco é rejeitado pelo Postgres — o
 * frontend nunca inventa um estado que o banco não aceitaria.
 *
 * Decisão de domínio (Discipulado × Teologia, ver
 * docs/architecture/operacao-3-teologia.md §7): namespace próprio
 * `theology_*` — nenhuma tabela/enum de Discipulado é reaproveitada
 * diretamente aqui, apenas os PADRÕES (mesma forma de modelar
 * frequência/máquinas de estado).
 */

// ── Núcleos de estudo (theology_study_centers.center_type) ─────────────────
export const THEOLOGY_STUDY_CENTER_TYPES = ["nucleo", "polo", "sede", "online", "outro"] as const;
export type TheologyStudyCenterType = (typeof THEOLOGY_STUDY_CENTER_TYPES)[number];
export const THEOLOGY_STUDY_CENTER_TYPE_LABELS: Record<TheologyStudyCenterType, string> = {
  nucleo: "Núcleo",
  polo: "Polo",
  sede: "Sede",
  online: "On-line",
  outro: "Outro",
};

// ── Matérias/unidades curriculares (theology_subjects.status) ──────────────
export const THEOLOGY_SUBJECT_STATUSES = ["ativa", "inativa"] as const;
export type TheologySubjectStatus = (typeof THEOLOGY_SUBJECT_STATUSES)[number];
export const THEOLOGY_SUBJECT_STATUS_LABELS: Record<TheologySubjectStatus, string> = {
  ativa: "Ativa",
  inativa: "Inativa",
};

// ── Programas/tipos de curso (theology_programs.status) ────────────────────
export const THEOLOGY_PROGRAM_STATUSES = ["rascunho", "ativo", "arquivado"] as const;
export type TheologyProgramStatus = (typeof THEOLOGY_PROGRAM_STATUSES)[number];
export const THEOLOGY_PROGRAM_STATUS_LABELS: Record<TheologyProgramStatus, string> = {
  rascunho: "Rascunho",
  ativo: "Ativo",
  arquivado: "Arquivado",
};

// ── Matriz curricular (theology_curriculum_items.status) ───────────────────
export const THEOLOGY_CURRICULUM_ITEM_STATUSES = ["ativo", "inativo"] as const;
export type TheologyCurriculumItemStatus = (typeof THEOLOGY_CURRICULUM_ITEM_STATUSES)[number];

// ── Períodos letivos (theology_periods.status) ──────────────────────────────
// Máquina de estados espelhada de update_theology_period_status() em
// 20260730110000_theology_periods_classes_enrollments.sql — ver
// isValidPeriodStatusTransition() em rules.ts.
export const THEOLOGY_PERIOD_STATUSES = [
  "planejamento", "inscricoes_abertas", "em_andamento", "encerrado", "cancelado", "arquivado",
] as const;
export type TheologyPeriodStatus = (typeof THEOLOGY_PERIOD_STATUSES)[number];
export const THEOLOGY_PERIOD_STATUS_LABELS: Record<TheologyPeriodStatus, string> = {
  planejamento: "Planejamento",
  inscricoes_abertas: "Inscrições abertas",
  em_andamento: "Em andamento",
  encerrado: "Encerrado",
  cancelado: "Cancelado",
  arquivado: "Arquivado",
};

// ── Modalidade (theology_classes.modality) ──────────────────────────────────
export const THEOLOGY_MODALITIES = ["presencial", "online", "hibrida"] as const;
export type TheologyModality = (typeof THEOLOGY_MODALITIES)[number];
export const THEOLOGY_MODALITY_LABELS: Record<TheologyModality, string> = {
  presencial: "Presencial",
  online: "On-line",
  hibrida: "Híbrida",
};

// ── Turmas (theology_classes.status) ────────────────────────────────────────
// Máquina de estados espelhada de update_theology_class_status() em
// 20260730110000_theology_periods_classes_enrollments.sql — ver
// isValidClassStatusTransition() em rules.ts.
export const THEOLOGY_CLASS_STATUSES = [
  "planejamento", "inscricoes_abertas", "em_andamento", "concluida", "cancelada", "arquivada",
] as const;
export type TheologyClassStatus = (typeof THEOLOGY_CLASS_STATUSES)[number];
export const THEOLOGY_CLASS_STATUS_LABELS: Record<TheologyClassStatus, string> = {
  planejamento: "Planejamento",
  inscricoes_abertas: "Inscrições abertas",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
  arquivada: "Arquivada",
};
/** Turma nestes estados não aceita novos lançamentos comuns (oferta, matrícula). */
export const THEOLOGY_CLASS_CLOSED_STATUSES: readonly TheologyClassStatus[] = [
  "concluida", "cancelada", "arquivada",
];

// ── Ofertas de unidade por turma (theology_class_offerings.status) ─────────
// Espelha update_theology_class_offering_status().
export const THEOLOGY_OFFERING_STATUSES = ["planejada", "em_andamento", "concluida", "cancelada"] as const;
export type TheologyOfferingStatus = (typeof THEOLOGY_OFFERING_STATUSES)[number];
export const THEOLOGY_OFFERING_STATUS_LABELS: Record<TheologyOfferingStatus, string> = {
  planejada: "Planejada",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};
export const THEOLOGY_OFFERING_CLOSED_STATUSES: readonly TheologyOfferingStatus[] = ["concluida", "cancelada"];

// ── Equipe acadêmica (theology_staff_assignments) ───────────────────────────
export const THEOLOGY_STAFF_ROLES = ["coordenador", "secretario", "professor", "auxiliar"] as const;
export type TheologyStaffRole = (typeof THEOLOGY_STAFF_ROLES)[number];
export const THEOLOGY_STAFF_ROLE_LABELS: Record<TheologyStaffRole, string> = {
  coordenador: "Coordenador(a)",
  secretario: "Secretário(a)",
  professor: "Professor(a)",
  auxiliar: "Auxiliar",
};
export const THEOLOGY_STAFF_STATUSES = ["ativo", "encerrado"] as const;
export type TheologyStaffStatus = (typeof THEOLOGY_STAFF_STATUSES)[number];

// ── Matrículas na turma (theology_enrollments.status) ──────────────────────
// Máquina de estados espelhada de update_theology_enrollment_status() em
// 20260730110000_theology_periods_classes_enrollments.sql — ver
// isValidEnrollmentStatusTransition() em rules.ts.
export const THEOLOGY_ENROLLMENT_STATUSES = [
  "pendente", "matriculado", "ativo", "concluido", "reprovado", "desistente", "transferido", "cancelado",
] as const;
export type TheologyEnrollmentStatus = (typeof THEOLOGY_ENROLLMENT_STATUSES)[number];
export const THEOLOGY_ENROLLMENT_STATUS_LABELS: Record<TheologyEnrollmentStatus, string> = {
  pendente: "Pendente",
  matriculado: "Matriculado",
  ativo: "Ativo",
  concluido: "Concluído",
  reprovado: "Reprovado",
  desistente: "Desistente",
  transferido: "Transferido",
  cancelado: "Cancelado",
};
/** Matrícula nestes estados está encerrada — histórico preservado, sem novos lançamentos. */
export const THEOLOGY_ENROLLMENT_CLOSED_STATUSES: readonly TheologyEnrollmentStatus[] = [
  "concluido", "reprovado", "desistente", "transferido", "cancelado",
];

export const THEOLOGY_ENROLLMENT_FINAL_RESULTS = ["aprovado", "reprovado", "sem_avaliacao"] as const;
export type TheologyEnrollmentFinalResult = (typeof THEOLOGY_ENROLLMENT_FINAL_RESULTS)[number];
export const THEOLOGY_ENROLLMENT_FINAL_RESULT_LABELS: Record<TheologyEnrollmentFinalResult, string> = {
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  sem_avaliacao: "Sem avaliação",
};

// ── Tentativas por oferta (theology_offering_enrollments.status/final_result) ─
// Espelha update_theology_offering_enrollment_status(). Suporta repetência via
// attempt_number (uma nova linha por nova tentativa) — nunca sobrescreve uma
// tentativa concluída anterior.
export const THEOLOGY_OFFERING_ENROLLMENT_STATUSES = ["planejada", "em_andamento", "concluida", "cancelada"] as const;
export type TheologyOfferingEnrollmentStatus = (typeof THEOLOGY_OFFERING_ENROLLMENT_STATUSES)[number];
export const THEOLOGY_OFFERING_ENROLLMENT_STATUS_LABELS: Record<TheologyOfferingEnrollmentStatus, string> = {
  planejada: "Planejada",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};
export const THEOLOGY_OFFERING_ENROLLMENT_CLOSED_STATUSES: readonly TheologyOfferingEnrollmentStatus[] = [
  "concluida", "cancelada",
];

export const THEOLOGY_OFFERING_FINAL_RESULTS = ["aprovado", "reprovado", "dispensado"] as const;
export type TheologyOfferingFinalResult = (typeof THEOLOGY_OFFERING_FINAL_RESULTS)[number];
export const THEOLOGY_OFFERING_FINAL_RESULT_LABELS: Record<TheologyOfferingFinalResult, string> = {
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  dispensado: "Dispensado",
};

// ── Aulas/sessões (theology_sessions.status) ────────────────────────────────
export const THEOLOGY_SESSION_STATUSES = ["agendada", "realizada", "cancelada"] as const;
export type TheologySessionStatus = (typeof THEOLOGY_SESSION_STATUSES)[number];
export const THEOLOGY_SESSION_STATUS_LABELS: Record<TheologySessionStatus, string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  cancelada: "Cancelada",
};

// ── Frequência (theology_attendance.status) ─────────────────────────────────
export const THEOLOGY_ATTENDANCE_STATUSES = ["presente", "ausente", "justificado", "nao_lancado"] as const;
export type TheologyAttendanceStatus = (typeof THEOLOGY_ATTENDANCE_STATUSES)[number];
export const THEOLOGY_ATTENDANCE_STATUS_LABELS: Record<TheologyAttendanceStatus, string> = {
  presente: "Presente",
  ausente: "Ausente",
  justificado: "Justificado",
  nao_lancado: "Não lançado",
};
/** Situações que contam como "aula lançada" no denominador da frequência. */
export const THEOLOGY_ATTENDANCE_COUNTED_STATUSES: readonly TheologyAttendanceStatus[] = [
  "presente", "ausente", "justificado",
];
/** Situações que contam como presença no numerador da frequência (justificado conta a favor do aluno). */
export const THEOLOGY_ATTENDANCE_PRESENT_STATUSES: readonly TheologyAttendanceStatus[] = [
  "presente", "justificado",
];

// ── Modelos de avaliação (theology_assessment_models) ───────────────────────
// Substituem Mod01/Mod02/Mod03 do WinTechi — um modelo configurável em vez de
// três telas/tabelas fixas (ver docs/architecture/operacao-3-teologia.md §5/§9.1).
export const THEOLOGY_ROUNDING_RULES = ["nenhum", "padrao", "para_cima", "para_baixo"] as const;
export type TheologyRoundingRule = (typeof THEOLOGY_ROUNDING_RULES)[number];
export const THEOLOGY_ROUNDING_RULE_LABELS: Record<TheologyRoundingRule, string> = {
  nenhum: "Sem arredondamento",
  padrao: "Padrão (0,5 arredonda para cima)",
  para_cima: "Sempre para cima",
  para_baixo: "Sempre para baixo",
};

// ── Avaliações aplicadas (theology_assessments) ─────────────────────────────
export const THEOLOGY_ASSESSMENT_TYPES = ["prova", "trabalho", "participacao", "pratica", "outro"] as const;
export type TheologyAssessmentType = (typeof THEOLOGY_ASSESSMENT_TYPES)[number];
export const THEOLOGY_ASSESSMENT_TYPE_LABELS: Record<TheologyAssessmentType, string> = {
  prova: "Prova",
  trabalho: "Trabalho",
  participacao: "Participação",
  pratica: "Prática",
  outro: "Outro",
};
// Máquina de estados espelhada de update_theology_assessment_status().
export const THEOLOGY_ASSESSMENT_STATUSES = ["rascunho", "agendada", "aplicada", "publicada", "cancelada"] as const;
export type TheologyAssessmentStatus = (typeof THEOLOGY_ASSESSMENT_STATUSES)[number];
export const THEOLOGY_ASSESSMENT_STATUS_LABELS: Record<TheologyAssessmentStatus, string> = {
  rascunho: "Rascunho",
  agendada: "Agendada",
  aplicada: "Aplicada",
  publicada: "Publicada",
  cancelada: "Cancelada",
};

// ── Vínculo financeiro (theology_transaction_links.link_type) ──────────────
// Contexto acadêmico de uma transação REAL (public.transactions) — nunca um
// caixa/saldo/fechamento paralelo (ver contrato §6.5).
export const THEOLOGY_TRANSACTION_LINK_TYPES = [
  "matricula", "mensalidade", "contribuicao", "material", "outro",
] as const;
export type TheologyTransactionLinkType = (typeof THEOLOGY_TRANSACTION_LINK_TYPES)[number];
export const THEOLOGY_TRANSACTION_LINK_TYPE_LABELS: Record<TheologyTransactionLinkType, string> = {
  matricula: "Matrícula",
  mensalidade: "Mensalidade",
  contribuicao: "Contribuição",
  material: "Material",
  outro: "Outro",
};
