import { supabase } from "@/integrations/supabase/client";
import { insertWithOrganizationScope } from "@/lib/organizationScope";
import type { CampaignFormValues, CampaignDbStatus } from "@/lib/campaignFormUtils";
import { parseGoalAmount, UI_TO_DB_TYPE } from "@/lib/campaignFormUtils";

export type CampaignMutationResult = {
  ok: boolean;
  id?: string;
  error?: string;
};

function buildCampaignPayload(values: CampaignFormValues, userId?: string | null) {
  const goal = parseGoalAmount(values.goalAmount) ?? 0;
  const now = new Date().toISOString();

  return {
    title: values.title.trim(),
    description: values.description.trim() || null,
    type: UI_TO_DB_TYPE[values.category],
    status: values.status,
    goal_amount: goal,
    start_date: values.startDate || null,
    end_date: values.endDate || null,
    priority: values.priority,
    allow_replies: values.allowReplies,
    is_featured: false,
    visibility: "organization",
    ...(values.status === "active" ? { published_at: now } : {}),
    ...(userId ? { created_by: userId } : {}),
  };
}

export async function createCampaign(
  organizationId: string,
  values: CampaignFormValues,
  userId?: string | null,
): Promise<CampaignMutationResult> {
  const payload = buildCampaignPayload(values, userId);

  const { data, error } = await insertWithOrganizationScope<{ id: string }>(
    "campaigns",
    organizationId,
    payload,
    (query) => query.select("id").single(),
  );

  if (error) {
    return { ok: false, error: String((error as { message?: string }).message ?? error) };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const id = row?.id;
  if (!id) return { ok: false, error: "missing_id" };

  if (values.isFeatured) {
    const featured = await setCampaignFeatured(organizationId, id);
    if (!featured.ok) return featured;
  }

  return { ok: true, id };
}

export async function updateCampaign(
  organizationId: string,
  campaignId: string,
  values: CampaignFormValues,
): Promise<CampaignMutationResult> {
  const goal = parseGoalAmount(values.goalAmount) ?? 0;

  const basePatch = {
    title: values.title.trim(),
    description: values.description.trim() || null,
    type: UI_TO_DB_TYPE[values.category],
    status: values.status,
    goal_amount: goal,
    start_date: values.startDate || null,
    end_date: values.endDate || null,
    priority: values.priority,
    allow_replies: values.allowReplies,
    ...(values.status === "active" ? { published_at: new Date().toISOString() } : {}),
  };

  const { error } = await supabase
    .from("campaigns")
    .update({
      ...basePatch,
      ...(values.isFeatured ? {} : { is_featured: false }),
    })
    .eq("id", campaignId)
    .eq("organization_id", organizationId);

  if (error) {
    return { ok: false, error: String(error.message ?? error) };
  }

  if (values.isFeatured) {
    return setCampaignFeatured(organizationId, campaignId);
  }

  return { ok: true, id: campaignId };
}

export async function updateCampaignStatus(
  organizationId: string,
  campaignId: string,
  status: CampaignDbStatus,
): Promise<CampaignMutationResult> {
  const patch: Record<string, unknown> = { status };
  if (status === "active") patch.published_at = new Date().toISOString();

  const { error } = await supabase
    .from("campaigns")
    .update(patch)
    .eq("id", campaignId)
    .eq("organization_id", organizationId);

  if (error) {
    return { ok: false, error: String(error.message ?? error) };
  }

  return { ok: true, id: campaignId };
}

/** Apenas uma campanha em destaque por organização — coluna is_featured (RPC). */
export async function setCampaignFeatured(
  organizationId: string,
  campaignId: string,
): Promise<CampaignMutationResult> {
  const { error } = await supabase.rpc("set_campaign_featured", {
    p_organization_id: organizationId,
    p_campaign_id: campaignId,
  });

  if (error) {
    return { ok: false, error: String(error.message ?? error) };
  }

  return { ok: true, id: campaignId };
}

export async function updateCampaignCoverImage(
  organizationId: string,
  campaignId: string,
  url: string | null,
): Promise<CampaignMutationResult> {
  const { error } = await supabase
    .from("campaigns")
    .update({ cover_image_url: url })
    .eq("id", campaignId)
    .eq("organization_id", organizationId);

  if (error) {
    return { ok: false, error: String(error.message ?? error) };
  }

  return { ok: true, id: campaignId };
}

export async function deleteCampaign(
  organizationId: string,
  campaignId: string,
): Promise<CampaignMutationResult> {
  if (campaignId === "camp-001" || campaignId.startsWith("camp-")) {
    return { ok: false, error: "demo_protected" };
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campaignId)) {
    return { ok: false, error: "invalid_id" };
  }

  const { error } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", campaignId)
    .eq("organization_id", organizationId);

  if (error) {
    return { ok: false, error: String(error.message ?? error) };
  }

  return { ok: true, id: campaignId };
}
