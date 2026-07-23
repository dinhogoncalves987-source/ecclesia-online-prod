/**
 * Regras puras do Discipulado (OPERAÇÃO 2) — nenhuma função aqui toca o
 * Supabase. Cada regra espelha EXATAMENTE a validação equivalente já
 * implementada no banco (RPC/trigger), para que a UI possa:
 *   1. Mostrar feedback imediato (ex.: "faltam 3 aulas para atingir 75%")
 *      antes de chamar a RPC;
 *   2. Ser testada por vitest sem depender de rede/Supabase.
 *
 * A AUTORIDADE FINAL continua sendo o banco — estas funções nunca substituem
 * a validação server-side, apenas a antecipam para a experiência do usuário.
 * Ver:
 *   - supabase/migrations/20260729100000_discipleship_classes_and_enrollments.sql
 *     (update_discipleship_class_status, update_discipleship_enrollment_status)
 *   - supabase/migrations/20260729110000_discipleship_learning_records.sql
 *     (get_discipleship_enrollment_progress)
 */
import {
  DISCIPLESHIP_CLASS_CLOSED_STATUSES,
  DISCIPLESHIP_ENROLLMENT_CLOSED_STATUSES,
  type DiscipleshipAttendanceStatus,
  type DiscipleshipClassStatus,
  type DiscipleshipEnrollmentStatus,
} from "./constants";

// ── Frequência ───────────────────────────────────────────────────────────

/**
 * Percentual de frequência = presenças / aulas lançadas (excluindo
 * 'nao_lancado'). Retorna `null` quando não há nenhuma aula lançada ainda —
 * a UI deve distinguir "0% de frequência" (aulas lançadas, todas faltas) de
 * "sem dados ainda" (nenhuma aula lançada).
 */
export function calculateAttendancePercentage(
  attendanceStatuses: readonly DiscipleshipAttendanceStatus[],
): number | null {
  const launched = attendanceStatuses.filter((status) => status !== "nao_lancado");
  if (launched.length === 0) return null;
  const present = launched.filter((status) => status === "presente" || status === "justificado").length;
  return Math.round((present / launched.length) * 10000) / 100; // 2 casas decimais
}

// ── Avaliações ───────────────────────────────────────────────────────────

export type WeightedScoreEntry = { score: number; weight: number };

/**
 * Média ponderada das avaliações lançadas (nota × peso / soma dos pesos).
 * Retorna `null` quando não há nenhum resultado lançado.
 */
export function calculateWeightedAverageScore(entries: readonly WeightedScoreEntry[]): number | null {
  if (entries.length === 0) return null;
  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  if (totalWeight <= 0) return null;
  const weightedSum = entries.reduce((sum, e) => sum + e.score * e.weight, 0);
  return Math.round((weightedSum / totalWeight) * 100) / 100;
}

/** Valida uma nota lançada contra o max_score da avaliação (mesma regra de record_discipleship_assessment_result()). */
export function isValidAssessmentScore(score: number, maxScore: number): boolean {
  return Number.isFinite(score) && score >= 0 && score <= maxScore;
}

// ── Elegibilidade de conclusão ───────────────────────────────────────────

export type CourseCompletionRules = {
  requiresAttendance: boolean;
  minimumAttendancePercentage: number;
  requiresAssessment: boolean;
  minimumPassingScore: number | null;
};

export type CompletionEligibilityInput = {
  course: CourseCompletionRules;
  attendanceStatuses: readonly DiscipleshipAttendanceStatus[];
  assessmentResults: readonly WeightedScoreEntry[];
};

export type CompletionEligibilityResult = {
  eligible: boolean;
  reasons: string[];
  attendancePercentage: number | null;
  averageScore: number | null;
};

/**
 * Mesma lógica de elegibilidade de update_discipleship_enrollment_status()
 * (transição para 'concluido' sem p_override_eligibility). Usada pela UI
 * para explicar ANTES do clique por que uma matrícula não pode ser
 * concluída ainda — nunca para decidir a transição real no banco.
 */
export function checkCompletionEligibility(input: CompletionEligibilityInput): CompletionEligibilityResult {
  const { course, attendanceStatuses, assessmentResults } = input;
  const reasons: string[] = [];

  const attendancePercentage = calculateAttendancePercentage(attendanceStatuses);
  if (course.requiresAttendance) {
    if (attendancePercentage === null) {
      reasons.push("Nenhuma aula lançada ainda — não é possível calcular a frequência.");
    } else if (attendancePercentage < course.minimumAttendancePercentage) {
      reasons.push(
        `Frequência de ${attendancePercentage.toFixed(2)}% abaixo do mínimo exigido (${course.minimumAttendancePercentage}%).`,
      );
    }
  }

  const averageScore = calculateWeightedAverageScore(assessmentResults);
  if (course.requiresAssessment && course.minimumPassingScore !== null) {
    if (averageScore === null) {
      reasons.push("Nenhuma avaliação lançada ainda — não é possível calcular a nota final.");
    } else if (averageScore < course.minimumPassingScore) {
      reasons.push(
        `Nota média ${averageScore.toFixed(2)} abaixo da nota mínima exigida (${course.minimumPassingScore}).`,
      );
    }
  }

  return { eligible: reasons.length === 0, reasons, attendancePercentage, averageScore };
}

// ── Máquinas de estado (espelham as RPCs — usadas para habilitar/desabilitar ações na UI) ───

/** Espelha update_discipleship_class_status() em 20260729100000_discipleship_classes_and_enrollments.sql. */
export function isValidClassStatusTransition(
  from: DiscipleshipClassStatus,
  to: DiscipleshipClassStatus,
): boolean {
  if (from === to) return true;
  return (
    (from === "planejamento" && (to === "inscricoes_abertas" || to === "cancelada")) ||
    (from === "inscricoes_abertas" && (to === "em_andamento" || to === "cancelada")) ||
    (from === "em_andamento" && (to === "concluida" || to === "cancelada")) ||
    ((from === "concluida" || from === "cancelada") && to === "em_andamento") || // reabertura controlada
    ((from === "concluida" || from === "cancelada") && to === "arquivada")
  );
}

/** Espelha update_discipleship_enrollment_status() em 20260729100000_discipleship_classes_and_enrollments.sql. */
export function isValidEnrollmentStatusTransition(
  from: DiscipleshipEnrollmentStatus,
  to: DiscipleshipEnrollmentStatus,
): boolean {
  if (from === to) return true;
  return (
    (from === "lista_espera" && (to === "matriculado" || to === "cancelado")) ||
    (from === "matriculado" && (to === "ativo" || to === "desistente" || to === "transferido" || to === "cancelado")) ||
    (from === "ativo" && (to === "concluido" || to === "desistente" || to === "transferido" || to === "cancelado"))
  );
}

/** Turma fechada não aceita novos lançamentos comuns (encontro, matrícula, frequência). */
export function isClassClosedForCommonLaunches(status: DiscipleshipClassStatus): boolean {
  return (DISCIPLESHIP_CLASS_CLOSED_STATUSES as readonly string[]).includes(status);
}

/** Matrícula encerrada — histórico preservado, sem novos lançamentos. */
export function isEnrollmentClosed(status: DiscipleshipEnrollmentStatus): boolean {
  return (DISCIPLESHIP_ENROLLMENT_CLOSED_STATUSES as readonly string[]).includes(status);
}

// ── Capacidade da turma ──────────────────────────────────────────────────

/** Espelha a checagem de capacidade em enroll_member_in_class(). */
export function hasClassCapacity(
  capacity: number | null,
  currentActiveOrEnrolledCount: number,
): boolean {
  if (capacity === null) return true;
  return currentActiveOrEnrolledCount < capacity;
}
