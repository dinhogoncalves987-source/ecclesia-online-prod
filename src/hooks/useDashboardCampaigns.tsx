import { useCallback, useEffect, useMemo, useState } from "react";

import { useChurch } from "@/hooks/useChurchContext";

import {

  fetchDashboardCampaigns,

  getRecentDashboardCampaigns,

  pickCarouselCampaigns,

  type DashboardCampaign,

} from "@/lib/dashboardCampaigns";

import { isPersistedCampaignId } from "@/lib/campaignFormUtils";



export function useDashboardCampaigns() {

  const { church } = useChurch();

  const [campaigns, setCampaigns] = useState<DashboardCampaign[]>([]);

  const [loading, setLoading] = useState(true);

  const [fromDatabase, setFromDatabase] = useState(false);



  const load = useCallback(async () => {

    if (!church?.id) {

      setCampaigns([]);

      setFromDatabase(false);

      setLoading(false);

      return;

    }



    setLoading(true);

    const result = await fetchDashboardCampaigns(church);



    if (result.fromDatabase) {

      setCampaigns(result.campaigns);

      setFromDatabase(true);

    } else {

      setCampaigns([]);

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



  const carouselCampaigns = useMemo(() => pickCarouselCampaigns(campaigns), [campaigns]);

  const recentCampaigns = useMemo(() => getRecentDashboardCampaigns(campaigns, 5), [campaigns]);

  const persistedIds = useMemo(

    () => campaigns.filter((c) => isPersistedCampaignId(c.id)).map((c) => c.id),

    [campaigns],

  );



  return {

    campaigns,

    carouselCampaigns,

    recentCampaigns,

    persistedIds,

    loading,

    fromDatabase,

    refetch: load,

  };

}

