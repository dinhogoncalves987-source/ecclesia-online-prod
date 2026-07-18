/**
 * Demo data — Financeiro Fase 1 (frontend only).
 * Future: replace with Supabase queries scoped by organization.
 */

export const CURRENCY_LOCALE: Record<string, { locale: string; currency: string }> = {
  pt: { locale: "pt-BR", currency: "BRL" },
  en: { locale: "en-US", currency: "USD" },
  es: { locale: "es-MX", currency: "MXN" },
};

export function formatFinanceCurrency(value: number, lang: string): string {
  const { locale, currency } = CURRENCY_LOCALE[lang] ?? CURRENCY_LOCALE.pt;
  return value.toLocaleString(locale, { style: "currency", currency, maximumFractionDigits: 0 });
}

export const EXECUTIVE_STATS = {
  totalRevenue: 1_842_500,
  totalExpenses: 1_156_800,
  consolidatedBalance: 685_700,
  activeCampaigns: 4,
  monthlyTithes: 428_600,
  monthlyOfferings: 186_400,
};

export const HIERARCHY_LEVELS = [
  { level: "Convenção", name: "AD — Rio Grande do Sul", revenue: 4_250_000, share: 100 },
  { level: "Matriz", name: "AD Caxias do Sul — Sede", revenue: 1_842_500, share: 43 },
  { level: "Setor Norte", name: "Setor Norte", revenue: 612_000, share: 14 },
  { level: "Setor Sul", name: "Setor Sul", revenue: 698_400, share: 16 },
  { level: "Congregação São José", name: "Congregação São José", revenue: 248_900, share: 6 },
  { level: "Congregação Jardim América", name: "Congregação Jardim América", revenue: 183_200, share: 4 },
];

export const SECTOR_PERFORMANCE = [
  { sector: "Setor Norte", revenue: 612_000, goal: 680_000, pct: 90 },
  { sector: "Setor Sul", revenue: 698_400, goal: 640_000, pct: 109 },
  { sector: "Setor Leste", revenue: 531_100, goal: 580_000, pct: 92 },
  { sector: "Setor Oeste", revenue: 445_800, goal: 520_000, pct: 86 },
];

export const FINANCE_ALERTS = [
  { id: "a1", type: "warning", messageKey: "Setor Norte abaixo da média" },
  { id: "a2", type: "success", messageKey: "Campanha Reforma do Templo atingiu 73%" },
  { id: "a3", type: "info", messageKey: "Prestação de contas de Maio pendente" },
];

export const RECOMMENDED_ACTIONS = [
  { id: "r1", messageKey: "Revisar orçamento do Setor Oeste", targetTab: "budget" },
  { id: "r2", messageKey: "Publicar prestação de contas de Maio", targetTab: "accountability" },
  { id: "r3", messageKey: "Aprovar repasse da campanha Missões África", targetTab: "campaigns" },
];

export const TITHES_OFFERINGS = {
  monthlyTithes: 428_600,
  monthlyOfferings: 186_400,
  missionaryOfferings: 42_800,
  specialOfferings: 28_500,
  avgPerCongregation: 31_250,
  growthVsPrevious: 8.4,
  byCongregation: [
    { name: "Sede — Matriz", tithes: 98_400, offerings: 42_100, growth: 6.2 },
    { name: "Congregação São José", tithes: 52_800, offerings: 24_600, growth: 18.0 },
    { name: "Congregação Jardim América", tithes: 41_200, offerings: 18_900, growth: 4.1 },
    { name: "Congregação Santa Catarina", tithes: 38_600, offerings: 16_400, growth: 9.5 },
    { name: "Congregação São Pelegrino", tithes: 35_100, offerings: 14_200, growth: 3.8 },
  ],
};

export type PayableReceivableStatus = "Pago" | "Pendente" | "Vencido" | "Agendado";

export type FinanceAccountEntry = {
  id: string;
  description: string;
  amount: number;
  dueDate: string;
  status: PayableReceivableStatus;
  category: string;
};

// ACCOUNTS_PAYABLE/ACCOUNTS_RECEIVABLE (dado fictício) removidos em
// 2026-07-17: FinanceAccounts.tsx passou a consultar `transactions` real —
// ver src/components/financeiro/FinanceAccounts.tsx. `FinanceAccountEntry`/
// `PayableReceivableStatus` continuam aqui pois ainda são o formato de
// exibição compartilhado (tipo + `formatFinanceCurrency`).

export const BUDGET_COST_CENTERS = [
  { name: "Missões", budgeted: 85_000, actual: 72_400, pct: 85 },
  { name: "Ação Social", budgeted: 42_000, actual: 38_900, pct: 93 },
  { name: "Manutenção", budgeted: 56_000, actual: 62_720, pct: 112 },
  { name: "Eventos", budgeted: 48_000, actual: 41_200, pct: 86 },
  { name: "Secretaria", budgeted: 18_000, actual: 16_800, pct: 93 },
  { name: "Comunicação", budgeted: 24_000, actual: 22_100, pct: 92 },
  { name: "Patrimônio", budgeted: 35_000, actual: 28_400, pct: 81 },
];

export const BUDGET_SUMMARY = {
  monthlyBudget: 308_000,
  monthlyActual: 282_520,
  annualBudget: 3_696_000,
  annualActual: 2_890_400,
};

export type AssetStatus = "Ativo" | "Em manutenção" | "Baixado";

export type FinanceAsset = {
  id: string;
  name: string;
  category: string;
  estimatedValue: number;
  status: AssetStatus;
  responsible: string;
  location: string;
};

export const FINANCE_ASSETS: FinanceAsset[] = [
  { id: "as1", name: "Van 15 lugares — Missões", category: "Veículos", estimatedValue: 185_000, status: "Ativo", responsible: "Dep. Missões", location: "Garagem Sede" },
  { id: "as2", name: "Mesa de som digital 32 canais", category: "Equipamentos de som", estimatedValue: 42_000, status: "Ativo", responsible: "Louvor", location: "Templo Central" },
  { id: "as3", name: "Violão elétrico — worship", category: "Instrumentos", estimatedValue: 3_800, status: "Ativo", responsible: "Min. Louvor", location: "Sala de ensaio" },
  { id: "as4", name: "Templo Central — imóvel", category: "Imóveis", estimatedValue: 2_400_000, status: "Ativo", responsible: "Administrativo", location: "Centro — Caxias do Sul" },
  { id: "as5", name: "Cadeiras empilháveis (120 un.)", category: "Móveis", estimatedValue: 28_000, status: "Ativo", responsible: "Secretaria", location: "Salão principal" },
  { id: "as6", name: "Kit transmissão ao vivo", category: "Equipamentos de transmissão", estimatedValue: 18_500, status: "Em manutenção", responsible: "Mídia", location: "Cabine técnica" },
  { id: "as7", name: "Projetor antigo — auditório", category: "Equipamentos de transmissão", estimatedValue: 2_200, status: "Baixado", responsible: "Patrimônio", location: "Depósito" },
];

export type AccountabilityStatus = "Em preparação" | "Aguardando aprovação" | "Aprovado" | "Publicado";

export type AccountabilityReport = {
  id: string;
  period: string;
  type: "Mensal" | "Trimestral" | "Anual";
  status: AccountabilityStatus;
  receipts: number;
  approvers: { role: string; name: string; done: boolean }[];
};

export const ACCOUNTABILITY_REPORTS: AccountabilityReport[] = [
  {
    id: "pc1",
    period: "Maio/2026",
    type: "Mensal",
    status: "Aguardando aprovação",
    receipts: 47,
    approvers: [
      { role: "Pastor responsável", name: "Pr. João Silva", done: true },
      { role: "Tesoureiro", name: "Maria Santos", done: true },
      { role: "Conselho/diretoria", name: "Conselho Fiscal", done: false },
    ],
  },
  {
    id: "pc2",
    period: "Q1/2026",
    type: "Trimestral",
    status: "Aprovado",
    receipts: 128,
    approvers: [
      { role: "Pastor responsável", name: "Pr. João Silva", done: true },
      { role: "Tesoureiro", name: "Maria Santos", done: true },
      { role: "Conselho/diretoria", name: "Conselho Fiscal", done: true },
    ],
  },
  {
    id: "pc3",
    period: "2025",
    type: "Anual",
    status: "Publicado",
    receipts: 412,
    approvers: [
      { role: "Pastor responsável", name: "Pr. João Silva", done: true },
      { role: "Tesoureiro", name: "Maria Santos", done: true },
      { role: "Conselho/diretoria", name: "Conselho Fiscal", done: true },
    ],
  },
  {
    id: "pc4",
    period: "Abril/2026",
    type: "Mensal",
    status: "Em preparação",
    receipts: 12,
    approvers: [
      { role: "Pastor responsável", name: "Pr. João Silva", done: false },
      { role: "Tesoureiro", name: "Maria Santos", done: false },
      { role: "Conselho/diretoria", name: "Conselho Fiscal", done: false },
    ],
  },
];

export type AuditEntry = {
  id: string;
  action: string;
  user: string;
  timestamp: string;
  changeType: string;
  before: string;
  after: string;
  needsApproval: boolean;
  alert?: string;
};

export const AUDIT_LOG: AuditEntry[] = [
  { id: "au1", action: "Alteração de valor", user: "Maria Santos", timestamp: "2026-05-26T14:32:00", changeType: "Edição manual", before: "R$ 2.100,00", after: "R$ 2.340,00", needsApproval: true, alert: "Lançamento acima de limite" },
  { id: "au2", action: "Novo lançamento", user: "Carlos Oliveira", timestamp: "2026-05-26T11:15:00", changeType: "Inclusão", before: "—", after: "Entrada — Dízimos R$ 4.800", needsApproval: false },
  { id: "au3", action: "Exclusão de comprovante", user: "Ana Pereira", timestamp: "2026-05-25T16:48:00", changeType: "Anexo", before: "comprovante_mai.pdf", after: "—", needsApproval: true, alert: "Comprovante ausente" },
  { id: "au4", action: "Aprovação de fechamento", user: "Pr. João Silva", timestamp: "2026-05-25T09:00:00", changeType: "Aprovação", before: "Pendente", after: "Aprovado", needsApproval: false },
  { id: "au5", action: "Alteração de categoria", user: "Maria Santos", timestamp: "2026-05-24T17:22:00", changeType: "Edição manual", before: "Geral", after: "Manutenção", needsApproval: false, alert: "Alteração manual" },
];

export type IntelligenceInsight = {
  id: string;
  messageKey: string;
  category: "growth" | "risk" | "opportunity" | "pending";
};

export const INTELLIGENCE_INSIGHTS: IntelligenceInsight[] = [
  { id: "i1", messageKey: "Congregação São José cresceu 18% em dízimos", category: "growth" },
  { id: "i2", messageKey: "Campanha Reforma do Templo tem maior engajamento", category: "opportunity" },
  { id: "i3", messageKey: "Despesas com manutenção subiram 12%", category: "risk" },
  { id: "i4", messageKey: "Setor Sul está 9% acima da meta", category: "growth" },
  { id: "i5", messageKey: "3 prestações de contas aguardam aprovação", category: "pending" },
];
