/**
 * Demo data — Campanhas (Fase 1, frontend only).
 *
 * Future integration pipeline (no DB yet):
 *   Campanha → Financeiro → Relatórios → Prestação de Contas
 */

export type CampaignType =
  | "Construção"
  | "Reforma"
  | "Missões"
  | "Ação Social"
  | "Congresso"
  | "Evento"
  | "Instrumentos"
  | "Veículos"
  | "Emergencial"
  | "Projeto Ministerial";

export type CampaignStatus = "Ativa" | "Encerrada" | "Planejada" | "Pausada" | "Rascunho";

export type CampaignPriority = "low" | "normal" | "high" | "urgent";

export type Campaign = {
  id: string;
  title: string;
  description: string;
  type: CampaignType;
  goalAmount: number;
  raisedAmount: number;
  deadline: string;
  startDate?: string;
  status: CampaignStatus;
  /** Status bruto do banco — draft | active | paused | closed | archived */
  dbStatus?: "draft" | "active" | "paused" | "closed" | "archived";
  organization: string;
  featured?: boolean;
  priority?: CampaignPriority;
  allowReplies?: boolean;
  coverImageUrl?: string | null;
  /** Reserved — future video cover (render priority #2). */
  coverVideoUrl?: string | null;
  imageTone: "primary" | "accent" | "success" | "warm";
};

export type CampaignUpdateType =
  | "progress"
  | "financial"
  | "photo"
  | "video"
  | "document"
  | "achievement"
  | "announcement";

export type CampaignUpdate = {
  id: string;
  campaignId: string;
  campaignTitle: string;
  /** Título da atualização (alias legado: message) */
  message: string;
  content?: string;
  updateType: CampaignUpdateType;
  mediaUrl?: string | null;
  createdAt: string;
};

export const DEMO_CAMPAIGNS: Campaign[] = [
  {
    id: "camp-001",
    title: "Reforma do Templo Central",
    description:
      "Revitalização do templo da sede da Assembleia de Deus em Caxias do Sul: pintura externa, adequação elétrica, acessibilidade e salas de EBD.",
    type: "Reforma",
    goalAmount: 180_000,
    raisedAmount: 112_500,
    deadline: "2026-09-30",
    status: "Ativa",
    organization: "AD Caxias do Sul — Sede",
    featured: true,
    priority: "high",
    imageTone: "primary",
  },
  {
    id: "camp-002",
    title: "Construção Congregação São José",
    description:
      "Obra da nova congregação São José em Caxias do Sul/RS: fundação concluída, fase de alvenaria e cobertura.",
    type: "Construção",
    goalAmount: 420_000,
    raisedAmount: 268_400,
    deadline: "2027-03-15",
    status: "Ativa",
    organization: "Congregação São José — AD Caxias",
    imageTone: "accent",
  },
  {
    id: "camp-003",
    title: "Missões África",
    description:
      "Envio de equipe missionária e apoio logístico para projetos de plantação de igrejas e ação social em Moçambique.",
    type: "Missões",
    goalAmount: 95_000,
    raisedAmount: 61_200,
    deadline: "2026-11-20",
    status: "Ativa",
    organization: "Departamento de Missões — AD Caxias",
    imageTone: "success",
  },
  {
    id: "camp-004",
    title: "Ação Social Inverno",
    description:
      "Distribuição de cobertores, cestas básicas e kits de higiene para famílias em vulnerabilidade em Caxias do Sul.",
    type: "Ação Social",
    goalAmount: 35_000,
    raisedAmount: 35_000,
    deadline: "2026-06-30",
    status: "Encerrada",
    organization: "Congregação Jardim América",
    imageTone: "warm",
  },
  {
    id: "camp-005",
    title: "Congresso de Jovens",
    description:
      "Realização do Congresso de Jovens 2026 com palestras, workshops e mobilização dos ministérios Jovens Resgate da região.",
    type: "Congresso",
    goalAmount: 48_000,
    raisedAmount: 19_800,
    deadline: "2026-08-10",
    status: "Ativa",
    organization: "Ministério de Jovens — AD Caxias",
    imageTone: "accent",
  },
  {
    id: "camp-006",
    title: "Veículo para Missões Regionais",
    description:
      "Aquisição de van para transporte de equipes missionárias, visitas a congregações do interior e ação social nas comunidades da região da Serra.",
    type: "Veículos",
    goalAmount: 165_000,
    raisedAmount: 78_300,
    deadline: "2026-10-15",
    status: "Ativa",
    organization: "Departamento de Missões — AD Caxias",
    priority: "urgent",
    imageTone: "success",
  },
  {
    id: "camp-007",
    title: "Instrumentos para Louvor",
    description:
      "Renovação do parque de instrumentos do ministério de louvor: teclado, bateria, amplificadores e microfones sem fio para cultos e eventos.",
    type: "Instrumentos",
    goalAmount: 52_000,
    raisedAmount: 31_400,
    deadline: "2026-07-20",
    status: "Ativa",
    organization: "Ministério de Louvor — AD Caxias",
    imageTone: "primary",
  },
  {
    id: "camp-008",
    title: "Capela de Oração 24h",
    description:
      "Projeto ministerial de capela de oração contínua na Congregação Jardim América: adequação do espaço, climatização e mobiliário.",
    type: "Projeto Ministerial",
    goalAmount: 28_000,
    raisedAmount: 9_600,
    deadline: "2026-12-01",
    status: "Ativa",
    organization: "Congregação Jardim América",
    imageTone: "warm",
  },
  {
    id: "camp-009",
    title: "Encontro de Mulheres 2026",
    description:
      "Realização do Encontro de Mulheres com tema \"Mulheres de Fé\" — palestras, momentos de oração, ação social e kit para participantes.",
    type: "Evento",
    goalAmount: 22_000,
    raisedAmount: 4_200,
    deadline: "2026-09-05",
    status: "Planejada",
    organization: "Ministério de Mulheres — AD Caxias",
    imageTone: "accent",
  },
  {
    id: "camp-010",
    title: "Reparo Emergencial — Telhado Sede",
    description:
      "Correção urgente de infiltrações no telhado do templo central após temporais — impermeabilização e substituição de telhas danificadas.",
    type: "Emergencial",
    goalAmount: 42_000,
    raisedAmount: 18_500,
    deadline: "2026-06-15",
    status: "Ativa",
    organization: "AD Caxias do Sul — Sede",
    priority: "urgent",
    imageTone: "warm",
  },
];

export const DEMO_CAMPAIGN_UPDATES: CampaignUpdate[] = [
  {
    id: "upd-001",
    campaignId: "camp-001",
    campaignTitle: "Reforma do Templo Central",
    message: "Nova foto adicionada",
    updateType: "photo",
    createdAt: "2026-05-24T14:00:00",
  },
  {
    id: "upd-002",
    campaignId: "camp-003",
    campaignTitle: "Missões África",
    message: "Meta atingiu 50%",
    updateType: "achievement",
    createdAt: "2026-05-22T10:30:00",
  },
  {
    id: "upd-003",
    campaignId: "camp-004",
    campaignTitle: "Ação Social Inverno",
    message: "Prestação de contas publicada",
    updateType: "financial",
    createdAt: "2026-05-20T16:45:00",
  },
  {
    id: "upd-004",
    campaignId: "camp-002",
    campaignTitle: "Construção Congregação São José",
    message: "Relatório fotográfico da obra disponível",
    updateType: "photo",
    createdAt: "2026-05-18T09:15:00",
  },
  {
    id: "upd-005",
    campaignId: "camp-006",
    campaignTitle: "Veículo para Missões Regionais",
    message: "Orçamento da van aprovado pelo conselho",
    updateType: "financial",
    createdAt: "2026-05-25T11:00:00",
  },
  {
    id: "upd-006",
    campaignId: "camp-007",
    campaignTitle: "Instrumentos para Louvor",
    message: "Meta atingiu 60%",
    updateType: "achievement",
    createdAt: "2026-05-23T18:30:00",
  },
  {
    id: "upd-007",
    campaignId: "camp-008",
    campaignTitle: "Capela de Oração 24h",
    message: "Projeto apresentado à congregação",
    updateType: "announcement",
    createdAt: "2026-05-21T09:00:00",
  },
  {
    id: "upd-008",
    campaignId: "camp-009",
    campaignTitle: "Encontro de Mulheres 2026",
    message: "Inscrições abrem em junho",
    updateType: "announcement",
    createdAt: "2026-05-19T14:00:00",
  },
];

export function campaignProgress(c: Campaign): number {
  if (c.goalAmount <= 0) return 0;
  return Math.min(100, Math.round((c.raisedAmount / c.goalAmount) * 100));
}

export function formatCampaignCurrency(value: number, lang: "pt" | "en" | "es"): string {
  const locale = lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR";
  const currency = lang === "en" ? "USD" : "BRL";
  return value.toLocaleString(locale, { style: "currency", currency, maximumFractionDigits: 0 });
}

export function getCampaignStats(campaigns: Campaign[]) {
  const active = activeCampaigns(campaigns);
  const totalRaised = active.reduce((s, c) => s + c.raisedAmount, 0);
  const totalGoal = active.reduce((s, c) => s + c.goalAmount, 0);
  return {
    totalRaised,
    activeCount: active.length,
    totalGoal,
  };
}

export function getFeaturedCampaign(campaigns: Campaign[]): Campaign {
  return campaigns.find((c) => c.featured && c.status === "Ativa") ?? activeCampaigns(campaigns)[0] ?? campaigns[0];
}

export function activeCampaigns(campaigns: Campaign[]): Campaign[] {
  return campaigns.filter((c) => c.status === "Ativa");
}
