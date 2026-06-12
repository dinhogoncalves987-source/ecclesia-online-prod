import { useLanguage } from "@/hooks/useLanguage";
import { type Campaign } from "@/lib/campaignsDemo";
import type { CampaignMediaItem } from "@/lib/campaignMedia";
import { CampaignCard } from "./CampaignCard";

type Props = {
  campaigns: Campaign[];
  mediaByCampaign?: Map<string, CampaignMediaItem[]>;
  onOpen?: (campaign: Campaign) => void;
  onEdit?: (campaign: Campaign) => void;
  onRefresh?: () => void | Promise<void>;
  onDeleted?: (campaignId: string) => void | Promise<void>;
};

export function CampaignList({ campaigns, mediaByCampaign, onOpen, onEdit, onRefresh, onDeleted }: Props) {
  const { t } = useLanguage();

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-serif text-lg font-semibold text-foreground">{t("Todas as Campanhas")}</h2>
        <span className="text-xs text-muted-foreground">{campaigns.length} {t("projetos")}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {campaigns.map((c, i) => (
          <CampaignCard
            key={c.id}
            campaign={c}
            media={mediaByCampaign?.get(c.id)}
            index={i}
            onOpen={onOpen}
            onEdit={onEdit}
            onRefresh={onRefresh}
            onDeleted={onDeleted}
          />
        ))}
      </div>
    </section>
  );
}
