import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { CampaignCover } from "@/components/campanhas/CampaignCover";
import type { CampaignMediaItem } from "@/lib/campaignMedia";
import {
  campaignProgress,
  formatCampaignCurrency,
  type Campaign,
} from "@/lib/campaignsDemo";

type Props = {
  campaign: Campaign;
  media?: CampaignMediaItem[];
  onFollow?: () => void;
  onContribute?: () => void;
};

export function CampaignHighlights({ campaign, media, onFollow, onContribute }: Props) {
  const { t, lang } = useLanguage();
  const pct = campaignProgress(campaign);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-executive"
    >
      <CampaignCover
        campaign={campaign}
        media={media}
        variant="hero"
        className="aspect-[21/9] min-h-[160px] sm:min-h-[200px]"
      />

      <div className="p-5 sm:p-6 space-y-4">
        <p className="text-sm text-muted-foreground line-clamp-2 max-w-2xl">{campaign.description}</p>

        <div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-muted-foreground">{t("Progresso da campanha")}</span>
            <span className="font-semibold text-foreground">{pct}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-sm">
            <span className="font-medium text-foreground">
              {formatCampaignCurrency(campaign.raisedAmount, lang)}{" "}
              <span className="text-muted-foreground font-normal">{t("arrecadados")}</span>
            </span>
            <span className="text-muted-foreground">
              {t("Meta")}: {formatCampaignCurrency(campaign.goalAmount, lang)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onFollow}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-secondary text-sm font-medium hover:bg-secondary/80 transition-colors"
          >
            {t("Acompanhar")} <ChevronRight size={16} />
          </button>
          <button
            type="button"
            onClick={onContribute}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            {t("Contribuir")}
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          {t("Organização")}: {campaign.organization} · {t("Prazo")}:{" "}
          {new Date(campaign.deadline).toLocaleDateString(
            lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR",
            { day: "2-digit", month: "short", year: "numeric" },
          )}
        </p>
      </div>
    </motion.section>
  );
}
