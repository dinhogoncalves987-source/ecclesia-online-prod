import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Loader2, Megaphone } from "lucide-react";
import { CampaignCover } from "@/components/campanhas/CampaignCover";
import { useLanguage } from "@/hooks/useLanguage";
import { useCampaignMedia } from "@/hooks/useCampaignMedia";
import { isPersistedCampaignId } from "@/lib/campaignFormUtils";
import { campaignProgress, formatCampaignCurrency } from "@/lib/campaignsDemo";
import type { CampaignMediaItem } from "@/lib/campaignMedia";
import type { DashboardCampaign } from "@/lib/dashboardCampaigns";
import { cn } from "@/lib/utils";

const AUTOPLAY_MS = 9000;

type Props = {
  campaigns: DashboardCampaign[];
  loading?: boolean;
};

/* ------------------------------------------------------------------ */
/*  Slide content — zero animation, pure layout                       */
/* ------------------------------------------------------------------ */

function CarouselSlide({
  campaign,
  media,
}: {
  campaign: DashboardCampaign;
  media: CampaignMediaItem[];
}) {
  const { t, lang } = useLanguage();
  const pct = campaignProgress(campaign);

  return (
    <div className="flex flex-col sm:flex-row h-full min-h-[180px]">
      {/* Left: cover image */}
      <div className="relative sm:w-2/5 md:w-5/12 lg:w-2/5 flex-shrink-0 overflow-hidden">
        <CampaignCover
          campaign={campaign}
          media={media}
          imageOnly
          className="h-44 sm:h-full min-h-[140px] w-full"
        />
        {campaign.featured && (
          <span className="absolute top-3 left-3 z-10 rounded-full bg-accent/90 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground">
            {t("Campanha em destaque")}
          </span>
        )}
      </div>

      {/* Right: info */}
      <div className="p-5 sm:p-6 flex flex-col justify-center gap-3 flex-1 min-w-0">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            {t(campaign.type)} · {campaign.organization}
          </p>
          <h2 className="font-serif text-lg sm:text-xl font-bold text-foreground line-clamp-2 leading-tight">
            {campaign.title}
          </h2>
        </div>

        {/* Progress bar */}
        <div className="max-w-md">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">{pct}% {t("da meta")}</span>
            <span className="font-medium tabular-nums">
              {formatCampaignCurrency(campaign.raisedAmount, lang)} /{" "}
              {formatCampaignCurrency(campaign.goalAmount, lang)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <Link
          to={`/admin/campanhas?campanha=${campaign.id}`}
          className="inline-flex items-center justify-center gap-2 w-fit px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          {t("Abrir Campanha")} <ChevronRight size={16} />
        </Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main carousel — zero Framer Motion, zero CSS transitions           */
/*  Clipping lives on a static <div> so Safari never breaks overflow   */
/* ------------------------------------------------------------------ */

export function DashboardCampaignCarousel({ campaigns, loading = false }: Props) {
  const { t } = useLanguage();
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const pausedRef = useRef(false);

  const campaignIds = useMemo(
    () => campaigns.filter((c) => isPersistedCampaignId(c.id)).map((c) => c.id),
    [campaigns],
  );
  const campaignsKey = useMemo(() => campaigns.map((c) => c.id).join(","), [campaigns]);

  const { mediaByCampaign, loading: mediaLoading } = useCampaignMedia({ campaignIds });

  const count = campaigns.length;
  const countRef = useRef(count);
  countRef.current = count;
  const safeIndex = count > 0 ? index % count : 0;

  const goTo = useCallback(
    (next: number) => {
      if (count === 0) return;
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  const next = useCallback(() => goTo(safeIndex + 1), [goTo, safeIndex]);
  const prev = useCallback(() => goTo(safeIndex - 1), [goTo, safeIndex]);

  useEffect(() => {
    setIndex(0);
  }, [campaignsKey]);

  /* auto-play */
  useEffect(() => {
    if (count <= 1) return;
    const timer = window.setInterval(() => {
      if (pausedRef.current) return;
      setIndex((i) => (i + 1) % countRef.current);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [count]);

  /* touch swipe */
  const handleTouchStart = (clientX: number) => {
    touchStartX.current = clientX;
    pausedRef.current = true;
  };

  const handleTouchEnd = (clientX: number) => {
    if (touchStartX.current === null) return;
    const delta = clientX - touchStartX.current;
    touchStartX.current = null;
    const total = countRef.current;
    if (total <= 1) return;
    if (delta > 50) setIndex((i) => (i - 1 + total) % total);
    else if (delta < -50) setIndex((i) => (i + 1) % total);
    window.setTimeout(() => { pausedRef.current = false; }, AUTOPLAY_MS);
  };

  /* ---------- early returns ---------- */

  if (loading) {
    return (
      <section className="rounded-2xl border border-border/50 bg-card shadow-executive flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </section>
    );
  }

  if (count === 0) {
    return (
      <section className="rounded-2xl border border-border/50 bg-card shadow-executive p-6 text-center">
        <Megaphone size={28} className="mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">{t("Nenhuma campanha ativa no momento")}</p>
        <Link to="/admin/campanhas" className="text-sm text-primary hover:underline mt-2 inline-block">
          {t("Ver Campanhas")}
        </Link>
      </section>
    );
  }

  const current = campaigns[safeIndex];

  /* ---------- main render ---------- */

  return (
    <section
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}
      onTouchStart={(e) => handleTouchStart(e.touches[0]?.clientX ?? 0)}
      onTouchEnd={(e) => handleTouchEnd(e.changedTouches[0]?.clientX ?? 0)}
    >
      {/*
        CRITICAL: overflow-hidden + rounded-* + border live on a STATIC <div>, never animated.
        isolation:isolate + backface-visibility:hidden prevents Safari from ignoring
        overflow clipping when child content gets its own compositing layer.
      */}
      <div
        className="relative rounded-2xl border border-border/50 bg-card shadow-executive"
        style={{ overflow: "clip", isolation: "isolate", backfaceVisibility: "hidden" }}
      >
        {mediaLoading && (
          <div className="absolute top-3 right-3 z-20">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Slide changes instantly — key triggers React re-render, not animation */}
        <CarouselSlide
          campaign={current}
          media={mediaByCampaign.get(current.id) ?? []}
        />

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 hidden sm:flex h-9 w-9 items-center justify-center rounded-full bg-background/80 border border-border/50 shadow-sm hover:bg-background transition-colors"
              aria-label={t("Anterior")}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 hidden sm:flex h-9 w-9 items-center justify-center rounded-full bg-background/80 border border-border/50 shadow-sm hover:bg-background transition-colors"
              aria-label={t("Próximo")}
            >
              <ChevronRight size={18} />
            </button>

            <div className="flex items-center justify-center gap-1.5 pb-4 pt-1">
              {campaigns.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goTo(i)}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === safeIndex ? "w-6 bg-accent" : "w-2 bg-muted-foreground/35 hover:bg-muted-foreground/55",
                  )}
                  aria-label={`${t("Campanha")} ${i + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
