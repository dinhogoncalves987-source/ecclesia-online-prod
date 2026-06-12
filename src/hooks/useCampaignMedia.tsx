import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  mapDbCampaignMedia,
  type CampaignMediaItem,
  type DbCampaignMediaRow,
} from "@/lib/campaignMedia";
import { isPersistedCampaignId } from "@/lib/campaignFormUtils";

type UseCampaignMediaOptions = {
  campaignIds?: string[];
  organizationId?: string;
};

export function useCampaignMedia(options: UseCampaignMediaOptions = {}) {
  const { campaignIds, organizationId } = options;
  const [media, setMedia] = useState<CampaignMediaItem[]>([]);
  const [loading, setLoading] = useState(false);

  const idsKey = useMemo(
    () => (campaignIds?.length ? [...campaignIds].filter(isPersistedCampaignId).sort().join(",") : ""),
    [campaignIds],
  );

  const persistedCampaignIds = useMemo(
    () => campaignIds?.filter(isPersistedCampaignId) ?? [],
    [campaignIds],
  );

  useEffect(() => {
    if (!organizationId && persistedCampaignIds.length === 0) {
      setMedia([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        if (campaignIds?.length && persistedCampaignIds.length === 0) {
          setMedia([]);
          return;
        }

        let query = supabase
          .from("campaign_media")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true });

        if (persistedCampaignIds.length) {
          query = query.in("campaign_id", persistedCampaignIds);
        } else if (organizationId) {
          query = query.eq("organization_id", organizationId);
        }

        const { data, error } = await query;

        if (cancelled) return;

        if (error) {
          console.warn("[useCampaignMedia]", error.message);
          setMedia([]);
        } else {
          setMedia(((data ?? []) as DbCampaignMediaRow[]).map(mapDbCampaignMedia));
        }
      } catch {
        if (!cancelled) setMedia([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [organizationId, idsKey, campaignIds, persistedCampaignIds]);

  const mediaByCampaign = useMemo(() => {
    const map = new Map<string, CampaignMediaItem[]>();
    for (const item of media) {
      const list = map.get(item.campaignId) ?? [];
      list.push(item);
      map.set(item.campaignId, list);
    }
    return map;
  }, [media]);

  return { media, mediaByCampaign, loading };
}

export function useCampaignMediaForCampaign(
  campaignId: string | null | undefined,
  organizationId?: string,
) {
  const ids = campaignId && isPersistedCampaignId(campaignId) ? [campaignId] : undefined;
  const { media, mediaByCampaign, loading } = useCampaignMedia({
    campaignIds: ids,
    organizationId,
  });

  return {
    media: campaignId ? (mediaByCampaign.get(campaignId) ?? []) : [],
    loading,
  };
}
