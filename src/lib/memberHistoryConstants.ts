/**
 * Catálogos e rótulos da fundação histórica institucional compartilhada
 * (OPERAÇÃO 1 — member_history / member_occurrences / member_ordinations /
 * member_transfers / member_organization_history).
 *
 * Reaproveita, quando aplicável, catálogos já existentes em
 * secretariaConstants.ts (ex.: ECCLESIASTICAL_FUNCTIONS, ADMINISTRATIVE_ROLES
 * para o campo "cargo/função" das ordenações) em vez de recriá-los aqui.
 */

/** Tipos de evento da timeline institucional (member_history.history_type). */
export const HISTORY_TYPES = [
  "cadastro",
  "admissao",
  "batismo",
  "mudanca_situacao",
  "mudanca_congregacao",
  "mudanca_setor",
  "mudanca_organizacao",
  "nomeacao",
  "encerramento_funcao",
  "ordenacao",
  "transferencia",
  "ocorrencia",
  "documento_emitido",
  "credencial_emitida",
  "carta_emitida",
  "certificado_emitido",
  "registro_importado",
  "outro",
  // OPERAÇÃO 2 (Discipulado) — marcos institucionais de formação, estendidos
  // por 20260729120000_discipleship_permissions_and_history.sql. Nomes
  // genéricos de propósito: Teologia poderá reutilizá-los para
  // matrícula/formatura sem exigir nova extensão de catálogo.
  "matricula",
  "inicio_formacao",
  "conclusao_formacao",
  "desligamento_formacao",
  "transferencia_turma",
] as const;

export type HistoryType = (typeof HISTORY_TYPES)[number];

export const HISTORY_TYPE_LABELS: Record<HistoryType, string> = {
  cadastro: "Cadastro",
  admissao: "Admissão",
  batismo: "Batismo",
  mudanca_situacao: "Mudança de situação",
  mudanca_congregacao: "Alteração de congregação",
  mudanca_setor: "Alteração de setor/distrito",
  mudanca_organizacao: "Alteração de organização",
  nomeacao: "Nomeação",
  encerramento_funcao: "Encerramento de função",
  ordenacao: "Ordenação",
  transferencia: "Transferência",
  ocorrencia: "Ocorrência",
  documento_emitido: "Documento emitido",
  credencial_emitida: "Credencial emitida",
  carta_emitida: "Carta emitida",
  certificado_emitido: "Certificado emitido",
  registro_importado: "Registro importado",
  outro: "Outro",
  matricula: "Matrícula em formação",
  inicio_formacao: "Início de formação",
  conclusao_formacao: "Conclusão de formação",
  desligamento_formacao: "Desligamento de formação",
  transferencia_turma: "Transferência de turma",
};

/** Visibilidade de um evento/ocorrência. */
export const VISIBILITY_OPTIONS = ["normal", "confidential"] as const;
export type Visibility = (typeof VISIBILITY_OPTIONS)[number];
export const VISIBILITY_LABELS: Record<Visibility, string> = {
  normal: "Visível à secretaria",
  confidential: "Confidencial (somente governança)",
};

/** Tipos de ocorrência (member_occurrences.occurrence_type). */
export const OCCURRENCE_TYPES = [
  "acompanhamento_pastoral",
  "carta_recomendada",
  "transferencia",
  "desligamento",
  "falecimento",
  "recebimento",
  "reconciliacao",
  "ordenacao",
  "credencial_emitida",
  "outro",
] as const;

export type OccurrenceType = (typeof OCCURRENCE_TYPES)[number];

export const OCCURRENCE_TYPE_LABELS: Record<OccurrenceType, string> = {
  acompanhamento_pastoral: "Acompanhamento pastoral",
  carta_recomendada: "Carta recomendada",
  transferencia: "Transferência",
  desligamento: "Desligamento",
  falecimento: "Falecimento",
  recebimento: "Recebimento",
  reconciliacao: "Reconciliação",
  ordenacao: "Ordenação",
  credencial_emitida: "Credencial emitida",
  outro: "Outro",
};

/** Ocorrências pastoralmente sensíveis por padrão (sugerem confidencialidade). */
export const SENSITIVE_OCCURRENCE_TYPES: OccurrenceType[] = [
  "acompanhamento_pastoral",
  "reconciliacao",
  "falecimento",
];

export const OCCURRENCE_STATUSES = ["registrada", "em_andamento", "concluida", "cancelada"] as const;
export type OccurrenceStatus = (typeof OCCURRENCE_STATUSES)[number];
export const OCCURRENCE_STATUS_LABELS: Record<OccurrenceStatus, string> = {
  registrada: "Registrada",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

/** Tipos de ordenação/nomeação (member_ordinations.ordination_type). */
export const ORDINATION_TYPES = ["ordenacao", "nomeacao", "eleicao", "consagracao", "outro"] as const;
export type OrdinationType = (typeof ORDINATION_TYPES)[number];
export const ORDINATION_TYPE_LABELS: Record<OrdinationType, string> = {
  ordenacao: "Ordenação",
  nomeacao: "Nomeação",
  eleicao: "Eleição",
  consagracao: "Consagração",
  outro: "Outro",
};

export const ORDINATION_STATUSES = ["ativo", "encerrado", "revogado"] as const;
export type OrdinationStatus = (typeof ORDINATION_STATUSES)[number];
export const ORDINATION_STATUS_LABELS: Record<OrdinationStatus, string> = {
  ativo: "Ativo",
  encerrado: "Encerrado",
  revogado: "Revogado",
};

/** Transferências (member_transfers). */
export const TRANSFER_DIRECTIONS = ["recebida", "emitida"] as const;
export type TransferDirection = (typeof TRANSFER_DIRECTIONS)[number];
export const TRANSFER_DIRECTION_LABELS: Record<TransferDirection, string> = {
  recebida: "Recebida",
  emitida: "Emitida",
};

export const TRANSFER_LOCATION_TYPES = ["interna", "externa"] as const;
export type TransferLocationType = (typeof TRANSFER_LOCATION_TYPES)[number];
export const TRANSFER_LOCATION_TYPE_LABELS: Record<TransferLocationType, string> = {
  interna: "Unidade do Ecclesia",
  externa: "Igreja externa",
};

export const TRANSFER_STATUSES = ["solicitada", "aprovada", "concluida", "rejeitada", "cancelada"] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];
export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  solicitada: "Solicitada",
  aprovada: "Aprovada",
  concluida: "Concluída",
  rejeitada: "Rejeitada",
  cancelada: "Cancelada",
};

/** Tipo de vínculo organizacional rastreado no histórico (member_organization_history). */
export const ORG_LINK_TYPES = ["organization", "sector", "congregation"] as const;
export type OrgLinkType = (typeof ORG_LINK_TYPES)[number];
export const ORG_LINK_TYPE_LABELS: Record<OrgLinkType, string> = {
  organization: "Organização",
  sector: "Setor/Distrito",
  congregation: "Congregação",
};
