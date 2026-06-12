import { useCallback, useEffect, useState } from "react";

import { useChurch } from "@/hooks/useChurchContext";

import type { Campaign, CampaignUpdate } from "@/lib/campaignsDemo";

import { fetchCampaignsForChurch } from "@/lib/dashboardCampaigns";



export function useCampaigns() {

  const { church } = useChurch();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  const [updates, setUpdates] = useState<CampaignUpdate[]>([]);

  const [loading, setLoading] = useState(true);

  const [fromDatabase, setFromDatabase] = useState(false);



  const load = useCallback(async () => {

    if (!church?.id) {

      setCampaigns([]);

      setUpdates([]);

      setFromDatabase(false);

      setLoading(false);

      return;

    }



    setLoading(true);

    const result = await fetchCampaignsForChurch(church);



    if (result.fromDatabase) {

      setCampaigns(result.campaigns);

      setUpdates(result.updates);

      setFromDatabase(true);

    } else {

      setCampaigns([]);

      setUpdates([]);

      setFromDatabase(false);

    }

    setLoading(false);

  }, [church]);



  useEffect(() => {

    let cancelled = false;

    void load().then(() => {

      if (cancelled) return;

    });

    return () => {

      cancelled = true;

    };

  }, [load]);



  const refetch = useCallback(async () => {

    await load();

  }, [load]);



  return { campaigns, updates, loading, fromDatabase, refetch };

}

