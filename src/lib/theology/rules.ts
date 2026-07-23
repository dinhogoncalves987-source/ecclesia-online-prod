/**
 * Regras puras da Teologia (OPERAÇÃO 3) — nenhuma função aqui toca o
 * Supabase. Cada regra espelha EXATAMENTE a validação equivalente já
 * implementada no banco (RPC/trigger), para que a UI possa:
 *   1. Mostrar feedback imediato (ex.: "faltam 2 unidades obrigatórias para
 *      concluir") antes de chamar a RPC;
 *   2. Ser testada por vitest sem depender de rede/Supabase.
 *
 * A AUTORIDADE FINAL continua sendo o banco — estas funções nunca substituem
 * a validação server-side, apenas a antecipam para a experiência do usuário.
 * Ver:
 *   - supabase/migrations/20260730110000_theology_periods_classes_enrollments.sql
 *     (update_theology_period_status, update_theology_class_status,
 *     update_theology_class_offering_status, enroll_member_in_theology_class,
 *     update_theology_enrollment_status, update_theology_offering_enrollment_status)
 *   - supabase/migrations/20260730120000_theology_attendance_and_assessments.sql
 *     (update_theology_assessment_status — nota obrigatória antes de publicar)
 */
import {
  THEOLOGY_CLASS_CLOSED_STATUSES,
  THEOLOGY_ENROLLMENT_CLOSED_STATUSES,
  THEOLOGY_OFFERING_CLOSED_STATUSES,
  THEOLOGY_OFFERING_ENROLLMENT_CLOSED_STATUSES,
  type TheologyAttendanceStatus,
  type TheologyClassStatus,
  type TheologyEnrollmentStatus,
  type TheologyOfferingEnrollmentStatus,
  type TheologyOfferingStatus,
  type TheologyPeriodStatus,
} from "./constants";

// ── Frequência ───────────────────────────────────────────────────────────

/**
 * Percentual de frequência = presenças / aulas lançadas (excluindo
 * 'nao_lancado'). Retorna `null` quando não há nenhuma aula lançada ainda —
 * a UI deve distinguir "0% de frequência" (aulas lançadas, todas faltas) de
 * "sem dados ainda" (nenhuma aula lançada). "Não lançado" nunca desaparece
 * do denominador operacional: ele simplesmente não é contado até ser
 * lançado, e a UI deve exibi-lo como pendência (ver
 * docs/architecture/operacao-3-teologia.md §9.2).
 */
export function calculateAttendancePercentage(
  attendanceStatuses: readonly TheologyAttendanceStatus[],
): number | null {
  const launched = attendanceStatuses.filter((status) => status !== "nao_lancado");
  if (launched.length === 0) return null;
  const present = launched.filter((status) => status === "presente" || status === "justificado").length;
  return Math.round((present / launched.length) * 10000) / 100; // 2 casas decimais
}

/** Número de sessões realizadas ainda sem frequência lançada — bloqueia fechamento de oferta. */
export function countPendingAttendance(attendanceStatuses: readonly TheologyAttendanceStatus[]): number {
  return attendanceStatuses.filter((status) => status === "nao_lancado").length;
}

// ── Modelos de avaliação configuráveis (substituem Mod01/Mod02/Mod03) ────

export type AssessmentModelComponentInput = { weight: number; maxScore: number; isMandatory: boolean };

/** Espelha os CHECK de theology_assessment_model_components (weight > 0, max_score > 0). */
export function isValidAssessmentModelComponent(component: AssessmentModelComponentInput): boolean {
  return (
    Number.isFinite(component.weight) && component.weight > 0 &&
    Number.isFinite(component.maxScore) && component.maxScore > 0
  );
}

/** Soma dos pesos dos componentes — usada pela UI para mostrar "100% distribuído" antes de salvar. */
export function sumComponentWeights(components: readonly AssessmentModelComponentInput[]): number {
  return Math.round(components.reduce((sum, c) => sum + c.weight, 0) * 100) / 100;
}

export type WeightedScoreEntry = { score: number; weight: number; maxScore: number };

/**
 * Média ponderada normalizada para escala 0–10 (mesmo padrão do Discipulado),
 * mesmo quando cada componente usa uma escala diferente (maxScore). Retorna
 * `null` quando não há nenhum resultado lançado.
 */
export function calculateWeightedAverageScore(entries: readonly WeightedScoreEntry[]): number | null {
  if (entries.length === 0) return null;
  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  if (totalWeight <= 0) return null;
  const normalizedSum = entries.reduce((sum, e) => {
    const normalized = e.maxScore > 0 ? (e.score / e.maxScore) * 10 : 0;
    return sum + normalized * e.weight;
  }, 0);
  return Math.round((normalizedSum / totalWeight) * 100) / 100;
}

/** Espelha a checagem de score em record_theology_assessment_result()/amend_theology_assessment_result(). */
export function isValidAssessmentScore(score: number, maxScore: number): boolean {
  return Number.isFinite(score) && score >= 0 && score <= maxScore;
}

/** Arredondamento configurável do modelo — espelha rounding_rule (theology_assessment_models). */
export function applyRoundingRule(
  score: number,
  rule: "nenhum" | "padrao" | "para_cima" | "para_baixo",
): number {
  switch (rule) {
    case "para_cima":
      return Math.ceil(score);
    case "para_baixo":
      return Math.floor(score);
    case "padrao":
      return Math.round(score);
    case "nenhum":
    default:
      return score;
  }
}

// ── Pendências obrigatórias antes de publicar avaliação ──────────────────

export type MandatoryComponentPending = { componentId: string; offeringEnrollmentId: string };

/**
 * Espelha a checagem de update_theology_assessment_status() ao publicar:
 * todo componente obrigatório precisa ter nota lançada para toda tentativa
 * aberta. Retorna a lista de pendências (vazia = pode publicar).
 */
export function findMissingMandatoryResults(
  mandatoryComponentIds: readonly string[],
  openOfferingEnrollmentIds: readonly string[],
  recordedResultKeys: ReadonlySet<string>,
): MandatoryComponentPending[] {
  const pending: MandatoryComponentPending[] = [];
  for (const offeringEnrollmentId of openOfferingEnrollmentIds) {
    for (const componentId of mandatoryComponentIds) {
      if (!recordedResultKeys.has(`${componentId}:${offeringEnrollmentId}`)) {
        pending.push({ componentId, offeringEnrollmentId });
      }
    }
  }
  return pending;
}

// ── Elegibilidade de conclusão da matrícula (unidades obrigatórias) ──────

export type MandatoryCurriculumStatus = { curriculumItemId: string; approved: boolean };

export type EnrollmentCompletionEligibilityResult = {
  eligible: boolean;
  reasons: string[];
  pendingMandatoryCount: number;
};

/**
 * Mesma lógica de elegibilidade de update_theology_enrollment_status()
 * (transição para 'concluido' sem p_override_eligibility): todas as
 * unidades obrigatórias ativas do currículo do programa devem estar
 * concluídas com aprovação. Usada pela UI para explicar ANTES do clique por
 * que uma matrícula não pode ser concluída ainda — nunca para decidir a
 * transição real no banco.
 */
export function checkEnrollmentCompletionEligibility(
  mandatoryItems: readonly MandatoryCurriculumStatus[],
): EnrollmentCompletionEligibilityResult {
  const pending = mandatoryItems.filter((item) => !item.approved);
  const reasons: string[] = [];
  if (pending.length > 0) {
    reasons.push(
      pending.length === 1
        ? "Há 1 unidade curricular obrigatória ainda não concluída/aprovada."
        : `Há ${pending.length} unidades curriculares obrigatórias ainda não concluídas/aprovadas.`,
    );
  }
  return { eligible: pending.length === 0, reasons, pendingMandatoryCount: pending.length };
}

// ── Máquinas de estado (espelham as RPCs — usadas para habilitar/desabilitar ações na UI) ───

/** Espelha update_theology_period_status() em 20260730110000_theology_periods_classes_enrollments.sql. */
export function isValidPeriodStatusTransition(from: TheologyPeriodStatus, to: TheologyPeriodStatus): boolean {
  if (from === to) return true;
  return (
    (from === "planejamento" && (to === "inscricoes_abertas" || to === "cancelado")) ||
    (from === "inscricoes_abertas" && (to === "em_andamento" || to === "cancelado")) ||
    (from === "em_andamento" && (to === "encerrado" || to === "cancelado")) ||
    ((from === "encerrado" || from === "cancelado") && to === "arquivado")
  );
}

/** Espelha update_theology_class_status() em 20260730110000_theology_periods_classes_enrollments.sql. */
export function isValidClassStatusTransition(from: TheologyClassStatus, to: TheologyClassStatus): boolean {
  if (from === to) return true;
  return (
    (from === "planejamento" && (to === "inscricoes_abertas" || to === "cancelada")) ||
    (from === "inscricoes_abertas" && (to === "em_andamento" || to === "cancelada")) ||
    (from === "em_andamento" && (to === "concluida" || to === "cancelada")) ||
    ((from === "concluida" || from === "cancelada") && to === "em_andamento") || // reabertura controlada
    ((from === "concluida" || from === "cancelada") && to === "arquivada")
  );
}

/** Espelha update_theology_class_offering_status(). */
export function isValidOfferingStatusTransition(from: TheologyOfferingStatus, to: TheologyOfferingStatus): boolean {
  if (from === to) return true;
  return (
    (from === "planejada" && (to === "em_andamento" || to === "cancelada")) ||
    (from === "em_andamento" && (to === "concluida" || to === "cancelada"))
  );
}

/** Espelha update_theology_enrollment_status() (transições comuns, sem p_override_eligibility). */
export function isValidEnrollmentStatusTransition(from: TheologyEnrollmentStatus, to: TheologyEnrollmentStatus): boolean {
  if (from === to) return true;
  return (
    (from === "pendente" && (to === "matriculado" || to === "cancelado")) ||
    (from === "matriculado" && (to === "ativo" || to === "desistente" || to === "transferido" || to === "cancelado")) ||
    (from === "ativo" &&
      (to === "concluido" || to === "reprovado" || to === "desistente" || to === "transferido" || to === "cancelado"))
  );
}

/** Espelha update_theology_offering_enrollment_status(). */
export function isValidOfferingEnrollmentStatusTransition(
  from: TheologyOfferingEnrollmentStatus,
  to: TheologyOfferingEnrollmentStatus,
): boolean {
  if (from === to) return true;
  return (
    (from === "planejada" && (to === "em_andamento" || to === "cancelada")) ||
    (from === "em_andamento" && (to === "concluida" || to === "cancelada"))
  );
}

/** Turma fechada não aceita novos lançamentos comuns (oferta, matrícula). */
export function isClassClosedForCommonLaunches(status: TheologyClassStatus): boolean {
  return (THEOLOGY_CLASS_CLOSED_STATUSES as readonly string[]).includes(status);
}

/** Oferta fechada não aceita novas sessões/avaliações/tentativas. */
export function isOfferingClosed(status: TheologyOfferingStatus): boolean {
  return (THEOLOGY_OFFERING_CLOSED_STATUSES as readonly string[]).includes(status);
}

/** Matrícula na turma encerrada — histórico preservado, sem novos lançamentos. */
export function isEnrollmentClosed(status: TheologyEnrollmentStatus): boolean {
  return (THEOLOGY_ENROLLMENT_CLOSED_STATUSES as readonly string[]).includes(status);
}

/** Tentativa (matrícula em oferta) encerrada — nova tentativa exige nova linha (attempt_number + 1). */
export function isOfferingEnrollmentClosed(status: TheologyOfferingEnrollmentStatus): boolean {
  return (THEOLOGY_OFFERING_ENROLLMENT_CLOSED_STATUSES as readonly string[]).includes(status);
}

// ── Capacidade (turma e oferta) ──────────────────────────────────────────

/** Espelha a checagem de capacidade em enroll_member_in_theology_class(). */
export function hasClassCapacity(capacity: number | null, currentMatriculatedOrActiveCount: number): boolean {
  if (capacity === null) return true;
  return currentMatriculatedOrActiveCount < capacity;
}

/** Espelha a checagem de capacidade em enroll_member_in_theology_offering(). */
export function hasOfferingCapacity(capacity: number | null, currentOpenAttemptsCount: number): boolean {
  if (capacity === null) return true;
  return currentOpenAttemptsCount < capacity;
}

// ── Próxima tentativa (repetência/nova tentativa por oferta) ─────────────

/** Espelha o cálculo de v_next_attempt em enroll_member_in_theology_offering(). */
export function nextAttemptNumber(previousAttemptNumbers: readonly number[]): number {
  if (previousAttemptNumbers.length === 0) return 1;
  return Math.max(...previousAttemptNumbers) + 1;
}
