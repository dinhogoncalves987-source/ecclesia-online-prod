import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight, Loader2 } from "lucide-react";
import { CampaignCover } from "@/components/campanhas/CampaignCover";
import { useLanguage } from "@/hooks/useLanguage";
import { useCampaignMediaForCampaign } from "@/hooks/useCampaignMedia";
import { useChurch } from "@/hooks/useChurchContext";
import { useCampaigns } from "@/hooks/useCampaigns";
import {
  campaignProgress,
  formatCampaignCurrency,
  getFeaturedCampaign,
} from "@/lib/campaignsDemo";

export function DashboardCampaignBanner() {
  const { t, lang } = useLanguage();
  const { church } = useChurch();
  const { campaigns, loading } = useCampaigns();
  const campaign = getFeaturedCampaign(campaigns);
  const { media } = useCampaignMediaForCampaign(campaign.id, church?.id);
  const pct = campaignProgress(campaign);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-executive"
    >
      <div className="flex flex-col sm:flex-row">
        <div className="relative sm:w-48 md:w-56 lg:w-64 flex-shrink-0 overflow-hidden">
          <CampaignCover
            campaign={campaign}
            media={media}
            imageOnly
            className="h-full min-h-[120px] sm:min-h-[140px] w-full"
          />
        </div>

        <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 flex-1 min-w-0">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent mb-1">
              {t("Campanha em destaque")}
            </p>
            {loading ? (
              <Loader2 size={20} className="animate-spin text-muted-foreground mt-2" />
            ) : (
              <>
                <h2 className="font-serif text-lg sm:text-xl font-bold text-foreground line-clamp-2">
                  {campaign.title}
                </h2>
                <p className="text-xs text-muted-foreground mt-1 truncate">{campaign.organization}</p>
                <div className="mt-3 max-w-md">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{pct}% {t("da meta")}</span>
                    <span className="font-medium tabular-nums">
                      {formatCampaignCurrency(campaign.raisedAmount, lang)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </>
            )}
          </div>

          <Link
            to="/admin/campanhas"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex-shrink-0"
          >
            {t("Abrir Campanhas")} <ChevronRight size={16} />
          </Link>
        </div>
      </div>
    </motion.section>
  );
}
