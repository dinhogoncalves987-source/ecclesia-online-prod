import { supabase } from "@/integrations/supabase/client";
import type { Church } from "@/hooks/useChurchContext";
import type { Campaign } from "@/lib/campaignsDemo";
import {
  dedupeCampaigns,
  mapDbCampaignToUi,
  mapDbUpdateToUi,
  type DbCampaignRow,
  type DbCampaignUpdateRow,
} from "@/lib/campaigns";
import type { CampaignUpdate } from "@/lib/campaignsDemo";

export type CampaignScopeTier = 1 | 2 | 3;

export type DashboardCampaign = Campaign & {
  organizationId: string;
  createdAt: string;
  scopeTier: CampaignScopeTier;
};

export type ScopedOrganization = {
  id: string;
  name: string;
  tier: CampaignScopeTier;
  organizationType: string | null;
};

const CAMPAIGN_SELECT =
  "id, organization_id, title, description, type, status, goal_amount, raised_amount, start_date, end_date, priority, is_featured, allow_replies, cover_image_url, created_at";

function isCongregacao(church: Church): boolean {
  const type = church.organization_type ?? "congregacao";
  return type === "congregacao" || (!church.is_matriz && type !== "setor" && type !== "matriz" && type !== "convencao");
}

function pushScoped(scoped: ScopedOrganization[], entry: ScopedOrganization): void {
  const existing = scoped.find((s) => s.id === entry.id);
  if (existing) {
    if (entry.tier < existing.tier) existing.tier = entry.tier;
    return;
  }
  scoped.push(entry);
}

/** Resolve org IDs in hierarchical priority order for dashboard campaigns. */
export async function resolveDashboardCampaignScope(church: Church): Promise<ScopedOrganization[]> {
  const scoped: ScopedOrganization[] = [];

  pushScoped(scoped, {
    id: church.id,
    name: church.name,
    tier: 1,
    organizationType: church.organization_type,
  });

  const orgType = church.organization_type ?? "congregacao";

  if (isCongregacao(church)) {
    let parentId = church.parent_church_id;
    let tier: CampaignScopeTier = 2;

    while (parentId && tier <= 3) {
      const { data: parent } = await supabase
        .from("organizations")
        .select("id, name, organization_type, parent_id")
        .eq("id", parentId)
        .maybeSingle();

      if (!parent) break;

      pushScoped(scoped, {
        id: parent.id,
        name: parent.name,
        tier,
        organizationType: parent.organization_type,
      });

      parentId = parent.parent_id;
      tier = (tier + 1) as CampaignScopeTier;
    }

    return scoped;
  }

  if (orgType === "setor") {
    const { data: congregations } = await supabase
      .from("organizations")
      .select("id, name, organization_type")
      .eq("parent_id", church.id)
      .eq("organization_type", "congregacao")
      .eq("active", true)
      .order("name");

    for (const row of congregations ?? []) {
      pushScoped(scoped, {
        id: row.id,
        name: row.name,
        tier: 2,
        organizationType: row.organization_type,
      });
    }

    if (church.parent_church_id) {
      const { data: matriz } = await supabase
        .from("organizations")
        .select("id, name, organization_type")
        .eq("id", church.parent_church_id)
        .maybeSingle();

      if (matriz) {
        pushScoped(scoped, {
          id: matriz.id,
          name: matriz.name,
          tier: 3,
          organizationType: matriz.organization_type,
        });
      }
    }

    return scoped;
  }

  if (orgType === "matriz" || church.is_matriz) {
    const { data: setores } = await supabase
      .from("organizations")
      .select("id, name, organization_type")
      .eq("parent_id", church.id)
      .eq("organization_type", "setor")
      .eq("active", true)
      .order("name");

    for (const row of setores ?? []) {
      pushScoped(scoped, {
        id: row.id,
        name: row.name,
        tier: 2,
        organizationType: row.organization_type,
      });
    }

    const setorIds = (setores ?? []).map((s) => s.id);

    const [underSetores, directUnderMatriz] = await Promise.all([
      setorIds.length > 0
        ? supabase
            .from("organizations")
            .select("id, name, organization_type")
            .in("parent_id", setorIds)
            .eq("organization_type", "congregacao")
            .eq("active", true)
            .order("name")
        : Promise.resolve({ data: [] as { id: string; name: string; organization_type: string | null }[] }),
      supabase
        .from("organizations")
        .select("id, name, organization_type")
        .eq("parent_id", church.id)
        .eq("organization_type", "congregacao")
        .eq("active", true)
        .order("name"),
    ]);

    for (const row of [...(underSetores.data ?? []), ...(directUnderMatriz.data ?? [])]) {
      pushScoped(scoped, {
        id: row.id,
        name: row.name,
        tier: 3,
        organizationType: row.organization_type,
      });
    }

    return scoped;
  }

  if (orgType === "convencao") {
    const { data: matrizes } = await supabase
      .from("organizations")
      .select("id, name, organization_type")
      .eq("parent_id", church.id)
      .in("organization_type", ["matriz", "sede"])
      .eq("active", true)
      .order("name");

    for (const row of matrizes ?? []) {
      pushScoped(scoped, {
        id: row.id,
        name: row.name,
        tier: 2,
        organizationType: row.organization_type,
      });
    }

    const matrizIds = (matrizes ?? []).map((m) => m.id);
    if (matrizIds.length > 0) {
      const { data: setoresConvencao } = await supabase
        .from("organizations")
        .select("id, name, organization_type")
        .in("parent_id", matrizIds)
        .eq("organization_type", "setor")
        .eq("active", true)
        .order("name");

      for (const row of setoresConvencao ?? []) {
        pushScoped(scoped, {
          id: row.id,
          name: row.name,
          tier: 3,
          organizationType: row.organization_type,
        });
      }
    }
  }

  return scoped;
}

function mapRowToDashboard(
  row: DbCampaignRow & { created_at?: string },
  tierMap: Map<string, CampaignScopeTier>,
  orgNameMap: Map<string, string>,
): DashboardCampaign | null {
  const tier = tierMap.get(row.organization_id);
  if (!tier) return null;

  const base = mapDbCampaignToUi(row, orgNameMap.get(row.organization_id));
  return {
    ...base,
    organizationId: row.organization_id,
    createdAt: row.created_at ?? new Date().toISOString(),
    scopeTier: tier,
  };
}

export async function fetchDashboardCampaigns(church: Church): Promise<{
  campaigns: DashboardCampaign[];
  fromDatabase: boolean;
}> {
  const scope = await resolveDashboardCampaignScope(church);
  const tierMap = new Map(scope.map((s) => [s.id, s.tier]));
  const orgNameMap = new Map(scope.map((s) => [s.id, s.name]));
  const orgIds = scope.map((s) => s.id);

  if (orgIds.length === 0) {
    return { campaigns: [], fromDatabase: false };
  }

  const { data, error } = await supabase
    .from("campaigns")
    .select(CAMPAIGN_SELECT)
    .in("organization_id", orgIds)
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[fetchDashboardCampaigns]", error.message);
    return { campaigns: [], fromDatabase: false };
  }

  if (!data?.length) {
    return { campaigns: [], fromDatabase: true };
  }

  const campaigns = (data as DbCampaignRow[])
    .map((row) =>
      mapRowToDashboard(row as DbCampaignRow & { created_at?: string }, tierMap, orgNameMap),
    )
    .filter((c): c is DashboardCampaign => Boolean(c));

  const seen = new Set<string>();
  const deduped = dedupeDashboardCampaigns(
    campaigns.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    }),
  );

  return { campaigns: sortDashboardCampaigns(deduped), fromDatabase: true };
}

function dedupeDashboardCampaigns(campaigns: DashboardCampaign[]): DashboardCampaign[] {
  return dedupeCampaigns(campaigns) as DashboardCampaign[];
}

export function sortDashboardCampaigns(campaigns: DashboardCampaign[]): DashboardCampaign[] {
  return [...campaigns].sort((a, b) => {
    if (a.scopeTier !== b.scopeTier) return a.scopeTier - b.scopeTier;
    if (Boolean(a.featured) !== Boolean(b.featured)) return a.featured ? -1 : 1;
    const aActive = a.status === "Ativa" ? 1 : 0;
    const bActive = b.status === "Ativa" ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/** Carousel: featured + active campaigns, hierarchical order preserved. */
export function pickCarouselCampaigns(campaigns: DashboardCampaign[], max = 8): DashboardCampaign[] {
  return sortDashboardCampaigns(campaigns)
    .filter((c) => c.status === "Ativa" || c.featured)
    .slice(0, max);
}

export function getRecentDashboardCampaigns(campaigns: DashboardCampaign[], limit = 5): DashboardCampaign[] {
  return [...campaigns]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

/** Campanhas + timeline — escopo hierárquico (matriz/setor/congregação). */
export async function fetchCampaignsForChurch(church: Church): Promise<{
  campaigns: Campaign[];
  updates: CampaignUpdate[];
  fromDatabase: boolean;
}> {
  const scope = await resolveDashboardCampaignScope(church);
  const orgNameMap = new Map(scope.map((s) => [s.id, s.name]));
  const orgIds = scope.map((s) => s.id);

  if (orgIds.length === 0) {
    return { campaigns: [], updates: [], fromDatabase: false };
  }

  const { data, error } = await supabase
    .from("campaigns")
    .select(CAMPAIGN_SELECT)
    .in("organization_id", orgIds)
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[fetchCampaignsForChurch]", error.message);
    return { campaigns: [], updates: [], fromDatabase: false };
  }

  if (!data?.length) {
    return { campaigns: [], updates: [], fromDatabase: true };
  }

  const rows = data as DbCampaignRow[];
  const campaigns = dedupeCampaigns(
    rows.map((row) => mapDbCampaignToUi(row, orgNameMap.get(row.organization_id))),
  );
  const campaignIds = campaigns.map((r) => r.id);

  const { data: updatesData, error: updatesError } = await supabase
    .from("campaign_updates")
    .select("id, campaign_id, title, content, update_type, media_url, created_at")
    .in("organization_id", orgIds)
    .in("campaign_id", campaignIds)
    .order("created_at", { ascending: false })
    .limit(100);

  if (updatesError) {
    console.warn("[fetchCampaignsForChurch] updates", updatesError.message);
    return { campaigns, updates: [], fromDatabase: true };
  }

  const titleByCampaignId = new Map(campaigns.map((c) => [c.id, c.title]));
  const allowedIds = new Set(campaignIds);
  const updates =
    (updatesData as DbCampaignUpdateRow[] | null)
      ?.filter((row) => allowedIds.has(row.campaign_id))
      .map((row) =>
        mapDbUpdateToUi({
          ...row,
          campaigns: { title: titleByCampaignId.get(row.campaign_id) ?? "" },
        }),
      ) ?? [];

  return { campaigns, updates, fromDatabase: true };
}
