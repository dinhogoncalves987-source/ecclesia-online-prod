import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import {
  normalizeCoverCategory,
  normalizeCoverPriority,
  resolveCoverTheme,
  type CoverPriority,
  type CoverVariant,
} from "@/components/campanhas/campaignCoverTheme";

/**
 * Campaign cover UI overlay — text always rendered here (PT/EN/ES), never inside image assets.
 *
 * Background priority (handled by CampaignCover + resolveCampaignImage):
 * 1. cover_image_url — user upload
 * 2. cover_video_url — future
 * 3. Local library image from public/campaigns/{category}/
 * 4. Procedural gradient — only when no backgroundImageUrl is provided
 */

export type CampaignAutoCoverProps = {
  title: string;
  type: string;
  priority?: CoverPriority | string;
  organizationName?: string;
  featured?: boolean;
  /** Local library or upload URL — illustrations must not contain text */
  backgroundImageUrl?: string;
  backgroundImageOnError?: () => void;
  className?: string;
  variant?: CoverVariant;
};

const PRIORITY_SEAL: Record<CoverPriority, { label: string; className: string } | null> = {
  low: null,
  normal: null,
  high: {
    label: "Destaque",
    className: "bg-white/20 text-white border-white/30",
  },
  urgent: {
    label: "Urgente",
    className: "bg-red-500/90 text-white border-red-300/50 shadow-lg shadow-red-900/30 animate-pulse",
  },
};

export function CampaignAutoCover({
  title,
  type,
  priority,
  organizationName,
  featured,
  backgroundImageUrl,
  backgroundImageOnError,
  className,
  variant = "card",
}: CampaignAutoCoverProps) {
  const { t } = useLanguage();
  const category = normalizeCoverCategory(type);
  const resolvedPriority = normalizeCoverPriority(priority, featured);
  const theme = resolveCoverTheme(type);
  const Icon = theme.icon;
  const seal = PRIORITY_SEAL[resolvedPriority];
  const isHero = variant === "hero";
  const isBanner = variant === "banner";
  const hasImage = Boolean(backgroundImageUrl);

  return (
    <div
      className={cn(
        "relative overflow-hidden text-white",
        !hasImage && `bg-gradient-to-br ${theme.gradient}`,
        resolvedPriority === "urgent" && "ring-2 ring-red-400/60 ring-inset",
        className,
      )}
    >
      {hasImage ? (
        <>
          <img
            src={backgroundImageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-center"
            loading="lazy"
            onError={backgroundImageOnError}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/25" />
        </>
      ) : (
        <>
          <div className="absolute inset-0 opacity-90" style={{ background: theme.pattern }} />
          <svg className="absolute inset-0 h-full w-full opacity-[0.07]" aria-hidden>
            <defs>
              <pattern id={`grid-${category.replace(/\s/g, "-")}`} width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M24 0H0V24" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#grid-${category.replace(/\s/g, "-")})`} />
          </svg>
          <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-8 -left-8 h-40 w-40 rounded-full bg-black/10 blur-3xl" />
        </>
      )}

      <div
        className={cn(
          "relative z-10 flex h-full w-full",
          isBanner ? "flex-row items-center gap-4 p-4 sm:p-5" : "flex-col justify-between",
          isHero ? "p-6 sm:p-8 min-h-[160px]" : isBanner ? "" : "p-4 sm:p-5 aspect-[16/10]",
        )}
      >
        <div className={cn("flex items-center gap-3", isBanner ? "flex-shrink-0" : "justify-between")}>
          <div
            className={cn(
              "rounded-xl flex items-center justify-center backdrop-blur-sm border border-white/10",
              theme.iconBg,
              isBanner ? "w-11 h-11" : isHero ? "w-14 h-14" : "w-12 h-12",
            )}
          >
            <Icon size={isHero ? 28 : isBanner ? 22 : 24} strokeWidth={1.5} />
          </div>
          {seal && (
            <span
              className={cn(
                "text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border",
                seal.className,
              )}
            >
              {t(seal.label)}
            </span>
          )}
        </div>

        <div className={cn("min-w-0 flex-1", isBanner ? "" : "mt-auto")}>
          <span className="inline-block text-[10px] sm:text-[11px] font-semibold uppercase tracking-widest text-white/75 mb-1.5">
            {t(category)}
          </span>
          <h3
            className={cn(
              "font-serif font-bold leading-tight text-white drop-shadow-sm",
              isHero
                ? "text-2xl sm:text-3xl line-clamp-2"
                : isBanner
                  ? "text-base sm:text-lg line-clamp-1"
                  : "text-base sm:text-lg line-clamp-2",
            )}
          >
            {title}
          </h3>
          {organizationName && (
            <p
              className={cn(
                "text-white/70 truncate",
                isHero ? "text-sm mt-2" : "text-[11px] sm:text-xs mt-1.5",
              )}
            >
              {organizationName}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
