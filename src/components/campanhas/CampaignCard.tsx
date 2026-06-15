import { motion } from "framer-motion";
import { Calendar, ChevronRight } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { CampaignCover } from "@/components/campanhas/CampaignCover";
import { CampaignActionsMenu } from "@/components/campanhas/CampaignActionsMenu";
import { CampaignCoverControls } from "@/components/campanhas/CampaignCoverControls";
import { campaignStatusBadgeClass } from "@/components/campanhas/CampaignForm";
import type { CampaignMediaItem } from "@/lib/campaignMedia";
import {
  campaignProgress,
  formatCampaignCurrency,
  type Campaign,
} from "@/lib/campaignsDemo";

type Props = {
  campaign: Campaign;
  media?: CampaignMediaItem[];
  index?: number;
  onOpen?: (campaign: Campaign) => void;
  onEdit?: (campaign: Campaign) => void;
  onRefresh?: () => void | Promise<void>;
  onDeleted?: (campaignId: string) => void | Promise<void>;
};

export function CampaignCard({ campaign, media, index = 0, onOpen, onEdit, onRefresh, onDeleted }: Props) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const pct = campaignProgress(campaign);

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden flex flex-col cursor-pointer hover:shadow-md hover:border-border transition-all"
      onClick={() => onOpen?.(campaign)}
    >
      <CampaignCover
        campaign={campaign}
        media={media}
        variant="card"
        className="aspect-[16/10]"
        overlay={
          <>
            <CampaignActionsMenu
              campaign={campaign}
              onEdit={onEdit}
              onRefresh={onRefresh}
              onDeleted={onDeleted}
              variant="card"
            />
            <span
              className={`absolute top-3 right-3 z-20 text-[10px] px-2 py-0.5 rounded-full font-medium backdrop-blur-sm ${campaignStatusBadgeClass(campaign.status)}`}
            >
              {t(campaign.status)}
            </span>
            <CampaignCoverControls
              campaign={campaign}
              media={media}
              onRefresh={onRefresh}
            />
          </>
        }
      />

      <div className="p-4 flex flex-col flex-1 gap-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-foreground leading-snug">{campaign.title}</h3>
          <ChevronRight size={16} className="text-muted-foreground flex-shrink-0 mt-0.5" />
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2">{campaign.description}</p>

        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="font-medium text-accent">{pct}%</span>
            <span className="text-muted-foreground tabular-nums">
              {formatCampaignCurrency(campaign.raisedAmount, lang)} / {formatCampaignCurrency(campaign.goalAmount, lang)}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-auto">
          <Calendar size={12} />
          {new Date(campaign.deadline).toLocaleDateString(
            lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR",
            { day: "2-digit", month: "short", year: "numeric" },
          )}
        </div>

        <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onOpen?.(campaign)}
            className="flex-1 text-xs py-2 rounded-lg bg-secondary font-medium hover:bg-secondary/80 transition-colors"
          >
            {t("Acompanhar")}
          </button>
          <button
            type="button"
            onClick={() => toast({ title: t("Contribuir"), description: t("Em breve disponível") })}
            className="flex-1 text-xs py-2 rounded-lg bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-colors"
          >
            {t("Contribuir")}
          </button>
        </div>
      </div>
    </motion.article>
  );
}
