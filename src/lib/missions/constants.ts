/**
 * Catálogos e rótulos do módulo de Missões (OPERAÇÃO 4).
 *
 * Espelham exatamente os `CHECK` das migrations
 * supabase/migrations/20260731090000_missions_foundation.sql,
 * 20260731100000_missions_missionaries.sql,
 * 20260731110000_missions_projects.sql,
 * 20260731120000_missions_supporters_commitments.sql e
 * 20260731130000_missions_transaction_links.sql. Qualquer valor aqui que não
 * exista na constraint do banco é rejeitado pelo Postgres — o frontend nunca
 * inventa um estado que o banco não aceitaria.
 *
 * Decisão de domínio (ver docs/architecture/operacao-4-missoes.md §7):
 * namespace próprio `missions_*` — nenhuma tabela/enum de
 * Discipulado/Teologia é reaproveitada diretamente aqui, apenas os PADRÕES
 * (mesma forma de modelar máquinas de estado e vínculo financeiro).
 */

// ── Missionários (missions_missionaries.status) ────────────────────────────
// Máquina de estados espelhada de update_missions_missionary_status() em
// 20260731100000_missions_missionaries.sql — ver
// isValidMissionaryStatusTransition() em rules.ts.
export const MISSIONS_MISSIONARY_STATUSES = [
  "candidato", "em_preparacao", "ativo", "em_licenca", "retornado", "encerrado",
] as const;
export type MissionsMissionaryStatus = (typeof MISSIONS_MISSIONARY_STATUSES)[number];
export const MISSIONS_MISSIONARY_STATUS_LABELS: Record<MissionsMissionaryStatus, string> = {
  candidato: "Candidato(a)",
  em_preparacao: "Em preparação",
  ativo: "Ativo(a)",
  em_licenca: "Em licença",
  retornado: "Retornado(a)",
  encerrado: "Encerrado(a)",
};
/** Missionário nestes estados está encerrado — histórico preservado, sem novas transições. */
export const MISSIONS_MISSIONARY_CLOSED_STATUSES: readonly MissionsMissionaryStatus[] = ["encerrado"];

// ── Projetos e ações (missions_projects.status) ────────────────────────────
// Máquina de estados espelhada de update_missions_project_status() em
// 20260731110000_missions_projects.sql — ver
// isValidProjectStatusTransition() em rules.ts.
export const MISSIONS_PROJECT_STATUSES = [
  "rascunho", "planejado", "ativo", "suspenso", "concluido", "cancelado", "arquivado",
] as const;
export type MissionsProjectStatus = (typeof MISSIONS_PROJECT_STATUSES)[number];
export const MISSIONS_PROJECT_STATUS_LABELS: Record<MissionsProjectStatus, string> = {
  rascunho: "Rascunho",
  planejado: "Planejado",
  ativo: "Ativo",
  suspenso: "Suspenso",
  concluido: "Concluído",
  cancelado: "Cancelado",
  arquivado: "Arquivado",
};
/** Projeto nestes estados não aceita novos vínculos/lançamentos comuns. */
export const MISSIONS_PROJECT_CLOSED_STATUSES: readonly MissionsProjectStatus[] = [
  "concluido", "cancelado", "arquivado",
];

// ── Responsáveis/missionários do projeto (missions_project_assignments) ───
export const MISSIONS_PROJECT_ASSIGNMENT_ROLES = [
  "responsavel", "coordenador", "missionario", "apoio",
] as const;
export type MissionsProjectAssignmentRole = (typeof MISSIONS_PROJECT_ASSIGNMENT_ROLES)[number];
export const MISSIONS_PROJECT_ASSIGNMENT_ROLE_LABELS: Record<MissionsProjectAssignmentRole, string> = {
  responsavel: "Responsável",
  coordenador: "Coordenador(a)",
  missionario: "Missionário(a)",
  apoio: "Apoio",
};
export const MISSIONS_PROJECT_ASSIGNMENT_STATUSES = ["ativo", "encerrado"] as const;
export type MissionsProjectAssignmentStatus = (typeof MISSIONS_PROJECT_ASSIGNMENT_STATUSES)[number];

// ── Apoiadores/contribuintes (missions_supporters) ──────────────────────────
export const MISSIONS_SUPPORTER_STATUSES = ["ativo", "inativo", "encerrado"] as const;
export type MissionsSupporterStatus = (typeof MISSIONS_SUPPORTER_STATUSES)[number];
export const MISSIONS_SUPPORTER_STATUS_LABELS: Record<MissionsSupporterStatus, string> = {
  ativo: "Ativo(a)",
  inativo: "Inativo(a)",
  encerrado: "Encerrado(a)",
};
export const MISSIONS_SUPPORTER_CLOSED_STATUSES: readonly MissionsSupporterStatus[] = ["encerrado"];

export const MISSIONS_CONTACT_PREFERENCES = ["email", "whatsapp", "telefone", "nenhum"] as const;
export type MissionsContactPreference = (typeof MISSIONS_CONTACT_PREFERENCES)[number];
export const MISSIONS_CONTACT_PREFERENCE_LABELS: Record<MissionsContactPreference, string> = {
  email: "E-mail",
  whatsapp: "WhatsApp",
  telefone: "Telefone",
  nenhum: "Sem preferência",
};

// ── Compromissos (missions_supporter_commitments) ──────────────────────────
export const MISSIONS_PERIODICITIES = ["unica", "mensal", "trimestral", "semestral", "anual"] as const;
export type MissionsPeriodicity = (typeof MISSIONS_PERIODICITIES)[number];
export const MISSIONS_PERIODICITY_LABELS: Record<MissionsPeriodicity, string> = {
  unica: "Única",
  mensal: "Mensal",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

// Máquina de estados espelhada de update_missions_commitment_status() em
// 20260731120000_missions_supporters_commitments.sql — ver
// isValidCommitmentStatusTransition() em rules.ts.
export const MISSIONS_COMMITMENT_STATUSES = ["ativo", "pausado", "encerrado", "cancelado"] as const;
export type MissionsCommitmentStatus = (typeof MISSIONS_COMMITMENT_STATUSES)[number];
export const MISSIONS_COMMITMENT_STATUS_LABELS: Record<MissionsCommitmentStatus, string> = {
  ativo: "Ativo",
  pausado: "Pausado",
  encerrado: "Encerrado",
  cancelado: "Cancelado",
};
export const MISSIONS_COMMITMENT_CLOSED_STATUSES: readonly MissionsCommitmentStatus[] = [
  "encerrado", "cancelado",
];

/** Um compromisso deve apontar para exatamente um contexto — nunca dois, nunca nenhum (contrato §7/§8). */
export type MissionsCommitmentContext =
  | { kind: "missionario"; id: string }
  | { kind: "projeto"; id: string }
  | { kind: "campanha"; id: string };

// ── Parcelas/mensalidades (missions_commitment_installments.status) ───────
// status é SEMPRE derivado de transações reais vinculadas — nunca marcado
// manualmente como "pago"/"parcial" (contrato §7). Único caminho manual é
// cancelado/isento, via set_missions_installment_exemption(), e apenas
// quando ainda não há valor pago (ver isValidInstallmentExemption() em
// rules.ts).
export const MISSIONS_INSTALLMENT_STATUSES = [
  "previsto", "pendente", "parcial", "pago", "atrasado", "cancelado", "isento",
] as const;
export type MissionsInstallmentStatus = (typeof MISSIONS_INSTALLMENT_STATUSES)[number];
export const MISSIONS_INSTALLMENT_STATUS_LABELS: Record<MissionsInstallmentStatus, string> = {
  previsto: "Previsto",
  pendente: "Pendente",
  parcial: "Parcial",
  pago: "Pago",
  atrasado: "Atrasado",
  cancelado: "Cancelado",
  isento: "Isento",
};
/** Parcelas nestes estados nunca recebem novo vínculo de transação (já resolvidas administrativamente). */
export const MISSIONS_INSTALLMENT_CLOSED_STATUSES: readonly MissionsInstallmentStatus[] = [
  "cancelado", "isento",
];
/** Parcelas nestes estados representam saldo real em aberto (usadas nos relatórios "a receber"/"atrasadas"). */
export const MISSIONS_INSTALLMENT_OPEN_STATUSES: readonly MissionsInstallmentStatus[] = [
  "previsto", "pendente", "atrasado", "parcial",
];

// ── Vínculo financeiro (missions_transaction_links.link_type) ─────────────
// Contexto missionário de uma transação REAL (public.transactions) — nunca
// um caixa/saldo/fechamento paralelo (ver contrato §6).
export const MISSIONS_TRANSACTION_LINK_TYPES = [
  "compromisso", "projeto", "missionario", "campanha",
] as const;
export type MissionsTransactionLinkType = (typeof MISSIONS_TRANSACTION_LINK_TYPES)[number];
export const MISSIONS_TRANSACTION_LINK_TYPE_LABELS: Record<MissionsTransactionLinkType, string> = {
  compromisso: "Compromisso/parcela",
  projeto: "Projeto",
  missionario: "Missionário",
  campanha: "Campanha",
};
