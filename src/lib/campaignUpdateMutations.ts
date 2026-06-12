import { supabase } from "@/integrations/supabase/client";
import { insertWithOrganizationScope } from "@/lib/organizationScope";
import type { CampaignUpdateFormValues } from "@/lib/campaignUpdateUtils";

export type CampaignUpdateMutationResult = {
  ok: boolean;
  id?: string;
  error?: string;
};

export async function createCampaignUpdate(
  organizationId: string,
  campaignId: string,
  values: CampaignUpdateFormValues,
  userId?: string | null,
): Promise<CampaignUpdateMutationResult> {
  const payload = {
    campaign_id: campaignId,
    title: values.title.trim(),
    content: values.content.trim() || null,
    update_type: values.updateType,
    ...(userId ? { created_by: userId } : {}),
  };

  const { data, error } = await insertWithOrganizationScope<{ id: string }>(
    "campaign_updates",
    organizationId,
    payload,
    (query) => query.select("id").single(),
  );

  if (error) {
    return { ok: false, error: String((error as { message?: string }).message ?? error) };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row?.id ? { ok: true, id: row.id } : { ok: false, error: "missing_id" };
}

export async function updateCampaignUpdate(
  organizationId: string,
  updateId: string,
  values: CampaignUpdateFormValues,
): Promise<CampaignUpdateMutationResult> {
  const { error } = await supabase
    .from("campaign_updates")
    .update({
      title: values.title.trim(),
      content: values.content.trim() || null,
      update_type: values.updateType,
    })
    .eq("id", updateId)
    .eq("organization_id", organizationId);

  if (error) {
    return { ok: false, error: String(error.message ?? error) };
  }

  return { ok: true, id: updateId };
}

export async function deleteCampaignUpdate(
  organizationId: string,
  updateId: string,
): Promise<CampaignUpdateMutationResult> {
  const { error } = await supabase
    .from("campaign_updates")
    .delete()
    .eq("id", updateId)
    .eq("organization_id", organizationId);

  if (error) {
    return { ok: false, error: String(error.message ?? error) };
  }

  return { ok: true, id: updateId };
}
