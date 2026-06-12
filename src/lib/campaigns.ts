import { supabase } from "@/integrations/supabase/client";
import { runScopedOrganizationQuery } from "@/lib/organizationScope";
import type {
  Campaign,
  CampaignUpdate,
  CampaignType,
  CampaignPriority,
} from "@/lib/campaignsDemo";
import { DB_TO_UI_STATUS, isPersistedCampaignId } from "@/lib/campaignFormUtils";
import { normalizeUpdateType } from "@/lib/campaignUpdateUtils";

export type DbCampaignRow = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  goal_amount: number;
  raised_amount: number;
  start_date: string | null;
  end_date: string | null;
  priority: string;
  is_featured: boolean;
  allow_replies: boolean;
  cover_image_url: string | null;
  created_at?: string;
  organizations?: { name: string } | null;
};

export type DbCampaignUpdateRow = {
  id: string;
  campaign_id: string;
  title: string;
  content: string | null;
  update_type: string;
  media_url: string | null;
  created_at: string;
  campaigns?: { title: string } | null;
};

const TYPE_MAP: Record<string, CampaignType> = {
  construcao: "Construção",
  reforma: "Reforma",
  missoes: "Missões",
  acao_social: "Ação Social",
  congresso: "Congresso",
  evento: "Evento",
  instrumentos: "Instrumentos",
  veiculos: "Veículos",
  emergencial: "Emergencial",
  projeto_ministerial: "Projeto Ministerial",
};

const STATUS_MAP: Record<string, Campaign["status"]> = DB_TO_UI_STATUS;

const TONE_BY_TYPE: Record<string, Campaign["imageTone"]> = {
  reforma: "primary",
  construcao: "accent",
  missoes: "success",
  acao_social: "warm",
  congresso: "accent",
  evento: "accent",
  instrumentos: "primary",
  veiculos: "success",
  emergencial: "warm",
  projeto_ministerial: "primary",
};

function mapDbPriority(priority: string): CampaignPriority {
  if (priority === "low" || priority === "normal" || priority === "high" || priority === "urgent") {
    return priority;
  }
  return "normal";
}

export function mapDbCampaignToUi(row: DbCampaignRow, fallbackOrgName?: string): Campaign {
  const uiType = TYPE_MAP[row.type] ?? (row.type as CampaignType);
  const priority = mapDbPriority(row.priority);
  const dbStatus = row.status as Campaign["dbStatus"];
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    type: uiType,
    goalAmount: Number(row.goal_amount),
    raisedAmount: Number(row.raised_amount),
    deadline: row.end_date ?? new Date().toISOString().slice(0, 10),
    startDate: row.start_date ?? undefined,
    status: STATUS_MAP[row.status] ?? "Ativa",
    dbStatus,
    organization: row.organizations?.name ?? fallbackOrgName ?? "",
    featured: Boolean(row.is_featured),
    priority,
    coverImageUrl: row.cover_image_url,
    imageTone: TONE_BY_TYPE[row.type] ?? "primary",
    allowReplies: Boolean(row.allow_replies),
  };
}

export function mapDbUpdateToUi(row: DbCampaignUpdateRow): CampaignUpdate {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    campaignTitle: row.campaigns?.title ?? "",
    message: row.title,
    content: row.content ?? undefined,
    updateType: normalizeUpdateType(row.update_type),
    mediaUrl: row.media_url,
    createdAt: row.created_at,
  };
}

export type CampaignsFetchResult = {
  campaigns: Campaign[];
  updates: CampaignUpdate[];
  fromDatabase: boolean;
};

/** Remove duplicatas por id e por título — prioriza UUID persistido e destaque. */
export function dedupeCampaigns(campaigns: Campaign[]): Campaign[] {
  const byId = new Map<string, Campaign>();
  for (const c of campaigns) {
    byId.set(c.id, c);
  }

  const byTitle = new Map<string, Campaign>();
  for (const c of byId.values()) {
    const key = c.title.trim().toLowerCase().replace(/\s+/g, " ");
    const existing = byTitle.get(key);
    if (!existing) {
      byTitle.set(key, c);
      continue;
    }
    byTitle.set(key, preferCampaignDuplicate(existing, c));
  }

  return Array.from(byTitle.values());
}

function preferCampaignDuplicate(a: Campaign, b: Campaign): Campaign {
  const aReal = isPersistedCampaignId(a.id);
  const bReal = isPersistedCampaignId(b.id);
  if (aReal && !bReal) return a;
  if (bReal && !aReal) return b;
  if (a.featured && !b.featured) return a;
  if (b.featured && !a.featured) return b;
  return a.id.localeCompare(b.id) <= 0 ? a : b;
}

export async function fetchOrganizationCampaigns(
  organizationId: string,
  fallbackOrgName?: string,
): Promise<CampaignsFetchResult> {
  try {
    const { data: campaignsData, error: campaignsError } = await runScopedOrganizationQuery<DbCampaignRow[]>(
      "campaigns",
      organizationId,
      (query) =>
        query
          .select("id, organization_id, title, description, type, status, goal_amount, raised_amount, start_date, end_date, priority, is_featured, allow_replies, cover_image_url")
          .order("is_featured", { ascending: false })
          .order("priority", { ascending: false })
          .order("created_at", { ascending: false }),
    );

    if (campaignsError) {
      console.warn("[fetchOrganizationCampaigns]", String((campaignsError as { message?: string }).message ?? campaignsError));
      return { campaigns: [], updates: [], fromDatabase: false };
    }

    if (!campaignsData?.length) {
      return { campaigns: [], updates: [], fromDatabase: true };
    }

    const campaigns = dedupeCampaigns(campaignsData.map((row) => mapDbCampaignToUi(row, fallbackOrgName)));

    const campaignIds = campaigns.map((c) => c.id);
    const { data: updatesData, error: updatesError } = await supabase
      .from("campaign_updates")
      .select("id, campaign_id, title, content, update_type, media_url, created_at, campaigns(title)")
      .eq("organization_id", organizationId)
      .in("campaign_id", campaignIds)
      .order("created_at", { ascending: false })
      .limit(50);

    if (updatesError) {
      return { campaigns, updates: [], fromDatabase: true };
    }

    const updates = (updatesData as DbCampaignUpdateRow[] | null)?.map(mapDbUpdateToUi) ?? [];
    return { campaigns, updates, fromDatabase: true };
  } catch {
    return { campaigns: [], updates: [], fromDatabase: false };
  }
}
