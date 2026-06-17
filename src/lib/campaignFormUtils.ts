import type { Campaign, CampaignPriority, CampaignType } from "@/lib/campaignsDemo";

export type CampaignDbStatus = "draft" | "active" | "paused" | "closed" | "archived";

export type CampaignFormValues = {
  title: string;
  description: string;
  category: CampaignType;
  goalAmount: string;
  startDate: string;
  endDate: string;
  priority: CampaignPriority;
  isFeatured: boolean;
  allowReplies: boolean;
  status: CampaignDbStatus;
};

// Only pastoral/admin staff can create, edit, publish or close campaigns.
// Tesoureiro, contador, leader and member get read-only access.
export const CAMPAIGN_MANAGE_ROLES = ["super_admin", "church_admin", "pastor", "secretary"] as const;

export const CAMPAIGN_CATEGORIES: CampaignType[] = [
  "Construção",
  "Reforma",
  "Missões",
  "Ação Social",
  "Congresso",
  "Evento",
  "Instrumentos",
  "Veículos",
  "Emergencial",
  "Projeto Ministerial",
];

export const UI_TO_DB_TYPE: Record<CampaignType, string> = {
  Construção: "construcao",
  Reforma: "reform",
  Missões: "missoes",
  "Ação Social": "acao_social",
  Congresso: "congresso",
  Evento: "evento",
  Instrumentos: "instrumentos",
  Veículos: "veiculos",
  Emergencial: "emergencial",
  "Projeto Ministerial": "projeto_ministerial",
};

export const DB_TO_UI_STATUS: Record<string, Campaign["status"]> = {
  draft: "Rascunho",
  active: "Ativa",
  paused: "Pausada",
  closed: "Encerrada",
  archived: "Encerrada",
};

export const UI_TO_DB_STATUS: Record<CampaignDbStatus, CampaignDbStatus> = {
  draft: "draft",
  active: "active",
  paused: "paused",
  closed: "closed",
  archived: "archived",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPersistedCampaignId(id: string): boolean {
  return UUID_RE.test(id);
}

export function emptyCampaignForm(status: CampaignDbStatus = "draft"): CampaignFormValues {
  return {
    title: "",
    description: "",
    category: "Projeto Ministerial",
    goalAmount: "",
    startDate: "",
    endDate: "",
    priority: "normal",
    isFeatured: false,
    allowReplies: true,
    status,
  };
}

export function campaignToFormValues(campaign: Campaign): CampaignFormValues {
  const dbStatus = campaign.dbStatus ?? uiStatusToDb(campaign.status);
  return {
    title: campaign.title,
    description: campaign.description,
    category: campaign.type,
    goalAmount: String(campaign.goalAmount || ""),
    startDate: campaign.startDate ?? "",
    endDate: campaign.deadline ?? "",
    priority: campaign.priority ?? "normal",
    isFeatured: Boolean(campaign.featured),
    allowReplies: campaign.allowReplies ?? true,
    status: dbStatus,
  };
}

export function uiStatusToDb(status: Campaign["status"]): CampaignDbStatus {
  switch (status) {
    case "Ativa":
      return "active";
    case "Pausada":
      return "paused";
    case "Encerrada":
      return "closed";
    case "Rascunho":
    case "Planejada":
    default:
      return "draft";
  }
}

export type CampaignFormErrors = Partial<Record<keyof CampaignFormValues, string>>;

export function validateCampaignForm(values: CampaignFormValues): CampaignFormErrors {
  const errors: CampaignFormErrors = {};
  if (!values.title.trim()) errors.title = "required";
  const goal = parseGoalAmount(values.goalAmount);
  if (goal === null || goal < 0) errors.goalAmount = "invalid";
  if (values.endDate && values.startDate && values.endDate < values.startDate) {
    errors.endDate = "range";
  }
  return errors;
}

export function parseGoalAmount(raw: string): number | null {
  const normalized = raw.replace(/\./g, "").replace(",", ".").trim();
  if (!normalized) return 0;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
