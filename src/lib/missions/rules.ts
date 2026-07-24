/**
 * Regras puras de Missões (OPERAÇÃO 4) — nenhuma função aqui toca o
 * Supabase. Cada regra espelha EXATAMENTE a validação equivalente já
 * implementada no banco (RPC/trigger), para que a UI possa:
 *   1. Mostrar feedback imediato (ex.: "esta transição não é permitida")
 *      antes de chamar a RPC;
 *   2. Ser testada por vitest sem depender de rede/Supabase.
 *
 * A AUTORIDADE FINAL continua sendo o banco — estas funções nunca substituem
 * a validação server-side, apenas a antecipam para a experiência do usuário.
 * Ver:
 *   - supabase/migrations/20260731100000_missions_missionaries.sql
 *     (update_missions_missionary_status)
 *   - supabase/migrations/20260731110000_missions_projects.sql
 *     (update_missions_project_status)
 *   - supabase/migrations/20260731120000_missions_supporters_commitments.sql
 *     (update_missions_commitment_status, _recompute_missions_installment_status,
 *     set_missions_installment_exemption)
 *   - supabase/migrations/20260731130000_missions_transaction_links.sql
 *     (link_missions_transaction — exatamente um contexto)
 */
import {
  MISSIONS_COMMITMENT_CLOSED_STATUSES,
  MISSIONS_INSTALLMENT_CLOSED_STATUSES,
  MISSIONS_MISSIONARY_CLOSED_STATUSES,
  MISSIONS_PROJECT_CLOSED_STATUSES,
  type MissionsCommitmentStatus,
  type MissionsInstallmentStatus,
  type MissionsMissionaryStatus,
  type MissionsProjectStatus,
} from "./constants";

// ── Máquinas de estado (espelham as RPCs — usadas para habilitar/desabilitar ações na UI) ───

/** Espelha update_missions_missionary_status() em 20260731100000_missions_missionaries.sql. */
export function isValidMissionaryStatusTransition(
  from: MissionsMissionaryStatus,
  to: MissionsMissionaryStatus,
): boolean {
  if (from === to) return true;
  return (
    (from === "candidato" && (to === "em_preparacao" || to === "encerrado")) ||
    (from === "em_preparacao" && (to === "ativo" || to === "encerrado")) ||
    (from === "ativo" && (to === "em_licenca" || to === "retornado" || to === "encerrado")) ||
    (from === "em_licenca" && (to === "ativo" || to === "encerrado")) ||
    (from === "retornado" && (to === "em_preparacao" || to === "encerrado"))
  );
}

/** Missionário encerrado — histórico preservado, sem novas transições. */
export function isMissionaryClosed(status: MissionsMissionaryStatus): boolean {
  return (MISSIONS_MISSIONARY_CLOSED_STATUSES as readonly string[]).includes(status);
}

/** Espelha update_missions_project_status() em 20260731110000_missions_projects.sql. */
export function isValidProjectStatusTransition(from: MissionsProjectStatus, to: MissionsProjectStatus): boolean {
  if (from === to) return true;
  return (
    (from === "rascunho" && (to === "planejado" || to === "cancelado")) ||
    (from === "planejado" && (to === "ativo" || to === "cancelado")) ||
    (from === "ativo" && (to === "suspenso" || to === "concluido" || to === "cancelado")) ||
    (from === "suspenso" && (to === "ativo" || to === "cancelado")) ||
    (from === "concluido" && to === "arquivado") ||
    (from === "cancelado" && to === "arquivado")
  );
}

/** Projeto fechado — sem novos vínculos/lançamentos comuns. */
export function isProjectClosed(status: MissionsProjectStatus): boolean {
  return (MISSIONS_PROJECT_CLOSED_STATUSES as readonly string[]).includes(status);
}

/** Espelha update_missions_commitment_status() em 20260731120000_missions_supporters_commitments.sql. */
export function isValidCommitmentStatusTransition(
  from: MissionsCommitmentStatus,
  to: MissionsCommitmentStatus,
): boolean {
  if (from === to) return true;
  return (
    (from === "ativo" && (to === "pausado" || to === "encerrado" || to === "cancelado")) ||
    (from === "pausado" && (to === "ativo" || to === "encerrado" || to === "cancelado"))
  );
}

/** Compromisso encerrado/cancelado — não gera novas parcelas (ver generate_missions_commitment_installment). */
export function isCommitmentClosed(status: MissionsCommitmentStatus): boolean {
  return (MISSIONS_COMMITMENT_CLOSED_STATUSES as readonly string[]).includes(status);
}

// ── Parcelas: status sempre derivado, nunca marcado manualmente ─────────

/**
 * Espelha _recompute_missions_installment_status() em
 * 20260731120000_missions_supporters_commitments.sql. Nunca chamada para
 * decidir a gravação real — apenas para a UI antecipar o resultado esperado
 * (ex.: badge otimista) antes de a RPC recalcular no banco.
 */
export function deriveInstallmentStatus(input: {
  paidAmount: number;
  expectedAmount: number;
  dueDate: string;
  today?: string;
  currentStatus: MissionsInstallmentStatus;
}): MissionsInstallmentStatus {
  if (input.currentStatus === "cancelado" || input.currentStatus === "isento") {
    return input.currentStatus;
  }
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  if (input.paidAmount >= input.expectedAmount) return "pago";
  if (input.paidAmount > 0) return "parcial";
  if (input.dueDate < today) return "atrasado";
  if (input.dueDate <= today) return "pendente";
  return "previsto";
}

/**
 * Espelha a validação de set_missions_installment_exemption(): só permite
 * cancelado/isento, e apenas quando ainda não há valor pago real. Uma
 * parcela prevista NUNCA pode ser marcada como paga manualmente — o
 * recebimento só existe quando há uma transação financeira real vinculada
 * (contrato §7).
 */
export function canExemptOrCancelInstallment(input: {
  paidAmount: number;
  currentStatus: MissionsInstallmentStatus;
}): boolean {
  return input.paidAmount <= 0 && input.currentStatus !== "pago";
}

/** Parcela fechada administrativamente — não recomputada por novos vínculos. */
export function isInstallmentClosed(status: MissionsInstallmentStatus): boolean {
  return (MISSIONS_INSTALLMENT_CLOSED_STATUSES as readonly string[]).includes(status);
}

// ── Vínculo financeiro: exatamente um contexto (contrato §6/§8) ─────────

export type MissionsLinkContextInput = {
  installmentId?: string | null;
  projectId?: string | null;
  missionaryId?: string | null;
  campaignId?: string | null;
};

/** Espelha `num_nonnulls(...) = 1` usado em link_missions_transaction()/create_missions_commitment(). */
export function hasExactlyOneMissionsContext(input: MissionsLinkContextInput): boolean {
  const provided = [input.installmentId, input.projectId, input.missionaryId, input.campaignId].filter(
    (value) => value !== null && value !== undefined && value !== "",
  );
  return provided.length === 1;
}

// ── Comparativo previsto × realizado (relatórios/indicadores) ────────────

/**
 * Percentual de realização (recebido/previsto) — mesma fórmula usada pelos
 * indicadores derivados (get_missions_dashboard_summary,
 * list_missions_project_indicators). Retorna `null` quando não há valor
 * previsto ainda (evita divisão por zero e "0%" enganoso).
 */
export function calculateRealizationPercentage(expectedAmount: number, receivedAmount: number): number | null {
  if (expectedAmount <= 0) return null;
  return Math.round((receivedAmount / expectedAmount) * 10000) / 100;
}
