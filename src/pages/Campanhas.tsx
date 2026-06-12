import { AdminLayout } from "@/components/AdminLayout";

import { CampaignDetail } from "@/components/campanhas/CampaignDetail";

import { CampaignOverview } from "@/components/campanhas/CampaignOverview";

import { CampaignHighlights } from "@/components/campanhas/CampaignHighlights";

import { CampaignList } from "@/components/campanhas/CampaignList";

import { CampaignUpdates } from "@/components/campanhas/CampaignUpdates";

import { CampaignFinanceSummary } from "@/components/campanhas/CampaignFinanceSummary";

import { CampaignCreateDialog } from "@/components/campanhas/CampaignCreateDialog";

import { CampaignEditDialog } from "@/components/campanhas/CampaignEditDialog";
import { CampaignUpdateCreateDialog } from "@/components/campanhas/CampaignUpdateCreateDialog";

import { useLanguage } from "@/hooks/useLanguage";

import { useToast } from "@/hooks/use-toast";

import { useCampaignMedia } from "@/hooks/useCampaignMedia";

import { useCampaigns } from "@/hooks/useCampaigns";

import { useChurch } from "@/hooks/useChurchContext";

import { useRole } from "@/hooks/useRole";

import { CAMPAIGN_MANAGE_ROLES } from "@/lib/campaignFormUtils";

import { getFeaturedCampaign, type Campaign } from "@/lib/campaignsDemo";

import { Loader2, Megaphone } from "lucide-react";

import { useEffect, useMemo, useState } from "react";

import { useSearchParams } from "react-router-dom";

import { AnimatePresence } from "framer-motion";

import { isPersistedCampaignId } from "@/lib/campaignFormUtils";



export default function Campanhas() {

  const { t } = useLanguage();

  const { toast } = useToast();

  const { church } = useChurch();

  const { hasRole } = useRole();

  const { campaigns, updates, loading, fromDatabase, refetch } = useCampaigns();

  const [searchParams, setSearchParams] = useSearchParams();

  const [detailCampaign, setDetailCampaign] = useState<Campaign | null>(null);

  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null);



  const canManage = hasRole([...CAMPAIGN_MANAGE_ROLES]);



  const campaignIds = useMemo(() => campaigns.map((c) => c.id), [campaigns]);

  const { mediaByCampaign } = useCampaignMedia({

    organizationId: church?.id,

    campaignIds,

  });



  const featured = campaigns.length > 0 ? getFeaturedCampaign(campaigns) : null;
  const featuredMedia = featured ? (mediaByCampaign.get(featured.id) ?? []) : [];



  const handleRefresh = async () => {
    await refetch();
  };

  useEffect(() => {
    const id = searchParams.get("campanha");
    if (!id || loading || !isPersistedCampaignId(id)) return;
    const found = campaigns.find((c) => c.id === id);
    if (found) setDetailCampaign(found);
  }, [searchParams, campaigns, loading]);

  const handleOpenCampaign = (campaign: Campaign) => {
    setDetailCampaign(campaign);
    if (isPersistedCampaignId(campaign.id)) {
      setSearchParams({ campanha: campaign.id }, { replace: true });
    }
  };

  const handleCloseDetail = () => {
    setDetailCampaign(null);
    if (searchParams.has("campanha")) {
      const next = new URLSearchParams(searchParams);
      next.delete("campanha");
      setSearchParams(next, { replace: true });
    }
  };

  const handleDeleted = async (campaignId: string) => {
    if (detailCampaign?.id === campaignId) handleCloseDetail();
    await handleRefresh();
  };



  return (

    <AdminLayout>

      <div className="space-y-8">

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">

          <div>

            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-foreground flex items-center gap-2">

              <Megaphone size={26} className="text-accent" />

              {t("Campanhas")}

            </h1>

            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">

              {t("Central de projetos e campanhas da igreja — construções, missões, ação social e eventos ministeriais.")}

            </p>

          </div>

          {canManage && (
            <div className="flex flex-wrap gap-2 flex-shrink-0">
              <CampaignUpdateCreateDialog campaigns={campaigns} onSuccess={handleRefresh} />
              <CampaignCreateDialog onSuccess={handleRefresh} triggerClassName="flex-shrink-0" />
            </div>
          )}

        </div>



        {loading ? (

          <div className="flex justify-center py-16">

            <Loader2 size={28} className="animate-spin text-muted-foreground" />

          </div>

        ) : (

          <>

            <CampaignOverview campaigns={campaigns} />

            {featured ? (
            <CampaignHighlights

              campaign={featured}

              media={featuredMedia}

              onFollow={() => toast({ title: t("Acompanhar"), description: t("Você será notificado sobre esta campanha") })}

              onContribute={() => toast({ title: t("Contribuir"), description: t("Contribuição online em breve") })}

            />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8 rounded-xl border border-dashed border-border/50 bg-secondary/20">
                {fromDatabase ? t("Nenhuma campanha cadastrada") : t("Nenhuma campanha ativa no momento")}
              </p>
            )}



            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              <div className="lg:col-span-2">

                <CampaignList

                  campaigns={campaigns}

                  mediaByCampaign={mediaByCampaign}

                  onOpen={handleOpenCampaign}

                  onEdit={setEditCampaign}

                  onRefresh={handleRefresh}

                  onDeleted={handleDeleted}

                />

              </div>

              <div className="space-y-6">

                <CampaignUpdates updates={updates} />

                <CampaignFinanceSummary campaigns={campaigns} />

              </div>

            </div>

          </>

        )}

      </div>



      <CampaignEditDialog

        campaign={editCampaign}

        open={Boolean(editCampaign)}

        onOpenChange={(open) => {

          if (!open) setEditCampaign(null);

        }}

        onSuccess={handleRefresh}

      />



      <AnimatePresence>

        {detailCampaign && (

          <CampaignDetail
            key={detailCampaign.id}
            campaign={detailCampaign}
            updates={updates}
            campaigns={campaigns}
            fromDatabase={fromDatabase}
            canManage={canManage}
            media={mediaByCampaign.get(detailCampaign.id) ?? []}
            onClose={handleCloseDetail}
            onEdit={setEditCampaign}
            onRefresh={handleRefresh}
            onDeleted={handleDeleted}
          />

        )}

      </AnimatePresence>

    </AdminLayout>

  );

}

