import { useCallback, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Campaign } from "@/lib/campaignsDemo";
import { isRasterCampaignImageUrl } from "@/lib/campaignImages";
import type { CampaignMediaItem } from "@/lib/campaignMedia";
import { resolveCampaignVisual } from "@/lib/campaignMedia";
import { CampaignAutoCover } from "@/components/campanhas/CampaignAutoCover";
import type { CoverVariant } from "@/components/campanhas/campaignCoverTheme";

export type CampaignCoverProps = {
  campaign: Campaign;
  media?: CampaignMediaItem[];
  variant?: CoverVariant;
  className?: string;
  imageClassName?: string;
  overlay?: ReactNode;
  /** Compact thumbnail — photo only, no text overlay */
  imageOnly?: boolean;
  /** Full-width hero/banner — photo + gradient, text lives outside */
  photoOnly?: boolean;
};

const PHOTO_GRADIENT =
  "absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/15 pointer-events-none";

export function CampaignCover({
  campaign,
  media = [],
  variant = "card",
  className,
  imageClassName,
  overlay,
  imageOnly = false,
  photoOnly = false,
}: CampaignCoverProps) {
  const visual = resolveCampaignVisual(campaign, media);
  const chain = [visual.url, ...visual.fallbackChain];
  const [urlIndex, setUrlIndex] = useState(0);
  const currentUrl = chain[urlIndex] ?? chain[chain.length - 1];
  const isSvgFallback = currentUrl.endsWith(".svg");
  const isPhoto = isRasterCampaignImageUrl(currentUrl);

  useEffect(() => {
    setUrlIndex(0);
  }, [campaign.id, visual.url, media.length]);

  const handleImageError = useCallback(() => {
    setUrlIndex((i) => Math.min(i + 1, chain.length - 1));
  }, [chain.length]);

  // Qualquer JPG/PNG local ou remoto → <img> limpo (nunca AutoCover colorido por cima)
  if (isPhoto) {
    return (
      <div className={cn("relative overflow-hidden bg-muted", className)}>
        <img
          src={currentUrl}
          alt=""
          className={cn("h-full w-full object-cover object-center", imageClassName)}
          loading="lazy"
          onError={handleImageError}
        />
        {photoOnly && <div className={PHOTO_GRADIENT} />}
        {overlay}
      </div>
    );
  }

  if (isSvgFallback) {
    return (
      <div className={cn("relative overflow-hidden", className)}>
        <CampaignAutoCover
          title={campaign.title}
          type={campaign.type}
          priority={campaign.priority}
          organizationName={campaign.organization}
          featured={campaign.featured}
          variant={photoOnly ? "hero" : variant}
          className="h-full w-full min-h-[inherit]"
        />
        {overlay}
      </div>
    );
  }

  // URL remota inválida ainda em cadeia — tentar próximo fallback via img
  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      <img
        src={currentUrl}
        alt=""
        className={cn("h-full w-full object-cover object-center", imageClassName)}
        loading="lazy"
        onError={handleImageError}
      />
      {(photoOnly || imageOnly) && <div className={PHOTO_GRADIENT} />}
      {overlay}
    </div>
  );
}
