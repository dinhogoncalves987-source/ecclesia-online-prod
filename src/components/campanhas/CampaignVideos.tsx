import { Video, VideoIcon } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useRole } from "@/hooks/useRole";
import type { Campaign } from "@/lib/campaignsDemo";
import type { CampaignMediaItem } from "@/lib/campaignMedia";
import { getCampaignVideos, resolveMediaItemUrl } from "@/lib/campaignMedia";

type Props = {
  campaign: Campaign;
  media?: CampaignMediaItem[];
  onEdit?: () => void;
};

const MANAGE_ROLES = ["church_admin", "leader", "tesoureiro", "super_admin"] as const;

export function CampaignVideos({ campaign, media = [], onEdit }: Props) {
  const { t } = useLanguage();
  const { hasRole } = useRole();
  const canManage = hasRole([...MANAGE_ROLES]);

  const videos = getCampaignVideos(campaign, media).filter((item) => resolveMediaItemUrl(item));

  if (videos.length === 0) {
    if (!canManage) return null;

    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onEdit}
          className="text-xs inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
        >
          <VideoIcon size={14} /> {t("Adicionar vídeo")}
        </button>
      </div>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Video size={16} className="text-accent" />
          {t("Vídeos")}
        </h3>
        {canManage && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-xs inline-flex items-center gap-1 text-primary hover:underline"
          >
            <VideoIcon size={14} /> {t("Adicionar vídeo")}
          </button>
        )}
      </div>

      <div className="space-y-3">
        {videos.map((item) => {
          const url = resolveMediaItemUrl(item);
          if (!url) return null;
          return (
            <div key={item.id} className="rounded-xl overflow-hidden bg-secondary/30 border border-border/40">
              <video src={url} controls className="w-full max-h-56 bg-black" preload="metadata" />
              {item.title && <p className="text-xs p-3 text-muted-foreground">{item.title}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
