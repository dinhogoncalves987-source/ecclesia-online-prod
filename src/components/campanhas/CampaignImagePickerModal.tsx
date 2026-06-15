import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Check, RotateCcw, Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import { CAMPAIGN_IMAGE_MANIFEST, type CampaignImageCategory } from "@/lib/campaignImageManifest";
import { filterAllowedManifestPool } from "@/lib/campaignImageCurator";
import { inferCampaignImageCategory } from "@/lib/campaignImages";
import type { Campaign } from "@/lib/campaignsDemo";

type Props = {
  open: boolean;
  onClose: () => void;
  campaign: Campaign;
  currentUrl: string | null | undefined;
  onSelect: (url: string) => void;
  onClear: () => void;
};

const CATEGORY_LABELS: Record<CampaignImageCategory, string> = {
  general:      "Geral",
  evangelism:   "Evangelismo",
  missions:     "Missões",
  social:       "Ação Social",
  prayer:       "Oração",
  bible:        "Bíblia",
  music:        "Louvor",
  children:     "Crianças",
  youth:        "Jovens",
  construction: "Construção",
  reform:       "Reforma",
  events:       "Eventos",
  women:        "Mulheres",
  men:          "Homens",
  vehicles:     "Veículos",
  emergency:    "Emergencial",
};

// Church-contextual display order — most common categories first
const CATEGORY_ORDER: CampaignImageCategory[] = [
  "general", "evangelism", "missions", "social", "prayer", "bible",
  "music", "children", "youth", "construction", "reform", "events",
  "women", "men", "vehicles", "emergency",
];

// ── Image tile ─────────────────────────────────────────────────────────────

type TileProps = {
  url: string;
  isSelected: boolean;
  isCurrentCover: boolean;
  onPickThis: () => void;
  onRemoveOrDeselect: () => void;
};

function ImageTile({ url, isSelected, isCurrentCover, onPickThis, onRemoveOrDeselect }: TileProps) {
  const { t } = useLanguage();
  const showTrash = isSelected || isCurrentCover;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPickThis}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPickThis(); } }}
      className={cn(
        "relative aspect-[4/3] rounded-xl overflow-hidden border-2 cursor-pointer group",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
        "transition-all duration-150",
        isSelected
          ? "border-primary shadow-lg scale-[1.02]"
          : isCurrentCover
            ? "border-accent/60 shadow-sm"
            : "border-transparent hover:border-border/60 hover:scale-[1.01]",
      )}
    >
      {/* Photo */}
      <img
        src={url}
        alt=""
        className="h-full w-full object-cover object-center"
        loading="lazy"
        draggable={false}
      />

      {/* Tinted overlay for selected / current */}
      {isSelected && (
        <div className="absolute inset-0 bg-primary/20 pointer-events-none" />
      )}
      {isCurrentCover && !isSelected && (
        <div className="absolute inset-0 bg-accent/10 pointer-events-none" />
      )}

      {/* ── Action buttons ─────────────────────────────────────────────
           Mobile: always visible (opacity-100)
           Desktop sm+: hidden until hover (sm:opacity-0 sm:group-hover:opacity-100)
      ─────────────────────────────────────────────────────────────── */}
      <div
        className="absolute top-2 right-2 z-10 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pencil: select this image */}
        <button
          type="button"
          aria-label={t("Selecionar imagem")}
          onClick={(e) => { e.stopPropagation(); onPickThis(); }}
          className={cn(
            "p-1 rounded-md backdrop-blur-sm transition-colors",
            isSelected
              ? "bg-primary text-primary-foreground"
              : "bg-black/60 text-white hover:bg-primary/80",
          )}
        >
          <Pencil size={11} />
        </button>

        {/* Trash: remove selection or clear current cover */}
        {showTrash && (
          <button
            type="button"
            aria-label={isCurrentCover ? t("Remover imagem da campanha") : t("Desmarcar imagem")}
            onClick={(e) => { e.stopPropagation(); onRemoveOrDeselect(); }}
            className="p-1 rounded-md bg-black/60 text-white hover:bg-red-600/80 backdrop-blur-sm transition-colors"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>

      {/* Selection check badge — bottom-right */}
      {isSelected && (
        <div className="absolute bottom-2 left-2 z-10 rounded-full bg-primary p-1 shadow-md pointer-events-none">
          <Check size={11} className="text-primary-foreground" />
        </div>
      )}

      {/* "Capa atual" label for current non-selected */}
      {isCurrentCover && !isSelected && (
        <div className="absolute bottom-2 left-2 z-10 rounded-md bg-black/55 backdrop-blur-sm px-1.5 py-0.5 pointer-events-none">
          <span className="text-[10px] text-white font-medium">{t("Atual")}</span>
        </div>
      )}
    </div>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────

export function CampaignImagePickerModal({
  open,
  onClose,
  campaign,
  currentUrl,
  onSelect,
  onClear,
}: Props) {
  const { t } = useLanguage();
  const primaryCategory = inferCampaignImageCategory(campaign);

  const [activeCategory, setActiveCategory] = useState<CampaignImageCategory>(primaryCategory);
  // null  = user wants to restore auto (clear override)
  // ""    = nothing selected yet (no change)
  // url   = user picked this image
  const [selectedUrl, setSelectedUrl] = useState<string | null>(currentUrl ?? null);

  const tabsRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // ── Reset on open ──────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setActiveCategory(primaryCategory);
      setSelectedUrl(currentUrl ?? null);
    }
  }, [open, primaryCategory, currentUrl]);

  // ── Keyboard close ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // ── Body scroll lock ───────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // ── Tab scroll state ───────────────────────────────────────────────────
  const checkTabScroll = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    checkTabScroll();
    el.addEventListener("scroll", checkTabScroll, { passive: true });
    const ro = new ResizeObserver(checkTabScroll);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", checkTabScroll); ro.disconnect(); };
  }, [checkTabScroll, open]);

  // ── Auto-scroll active tab into view ──────────────────────────────────
  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    const btn = el.querySelector(`[data-cat="${activeCategory}"]`) as HTMLElement | null;
    btn?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeCategory]);

  const scrollTabs = (dir: "left" | "right") => {
    tabsRef.current?.scrollBy({ left: dir === "left" ? -140 : 140, behavior: "smooth" });
  };

  // ── Derived state ──────────────────────────────────────────────────────
  const images = filterAllowedManifestPool(CAMPAIGN_IMAGE_MANIFEST[activeCategory] ?? []);
  const hasManualOverride = Boolean(currentUrl?.trim());

  // Something changed: either a new URL picked, or manual URL cleared
  const hasChange = selectedUrl !== (currentUrl ?? null);
  const willClear = selectedUrl === null && hasManualOverride;
  const willSet = Boolean(selectedUrl) && hasChange;
  const confirmEnabled = willSet || willClear;

  const handleConfirm = () => {
    if (willSet && selectedUrl) {
      onSelect(selectedUrl);
    } else if (willClear) {
      onClear();
    }
    onClose();
  };

  const handlePickImage = (url: string) => {
    setSelectedUrl((prev) => (prev === url ? null : url));
  };

  const handleRemoveOrDeselect = (url: string) => {
    if (url === currentUrl) {
      // Clear the current saved cover → will call onClear on confirm
      setSelectedUrl(null);
    } else {
      // Just deselect from in-progress selection
      setSelectedUrl(null);
    }
  };

  if (!open) return null;

  const confirmLabel = willClear
    ? t("Restaurar automática")
    : t("Confirmar");

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div
        className="relative bg-card w-full max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[84vh]"
        role="dialog"
        aria-modal
        aria-label={t("Escolher imagem da campanha")}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 flex-shrink-0">
          <div>
            <h3 className="font-serif text-lg font-semibold leading-tight">
              {t("Escolher imagem")}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("Biblioteca local — imagens seguras para uso em igreja")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 ml-3 flex-shrink-0 rounded-lg hover:bg-secondary transition-colors text-muted-foreground"
            aria-label={t("Fechar")}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Category tabs ───────────────────────────────────────────── */}
        <div className="relative flex-shrink-0 border-b border-border/30">
          {/* Left gradient + arrow */}
          {canScrollLeft && (
            <>
              <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-card to-transparent pointer-events-none z-10" />
              <button
                type="button"
                onClick={() => scrollTabs("left")}
                className="absolute left-1 top-1/2 -translate-y-1/2 z-20 p-0.5 rounded-full bg-card/80 shadow-sm border border-border/50 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={t("Rolar esquerda")}
              >
                <ChevronLeft size={14} />
              </button>
            </>
          )}

          {/* Scrollable tab strip */}
          <div
            ref={tabsRef}
            className="flex gap-1.5 px-4 py-2.5 overflow-x-auto overscroll-x-contain"
            style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
          >
            {CATEGORY_ORDER.map((cat) => {
              const isPrimary = cat === primaryCategory;
              const isActive = cat === activeCategory;
              return (
                <button
                  key={cat}
                  data-cat={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "flex-none px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : isPrimary
                        ? "bg-accent/15 text-accent ring-1 ring-accent/40 hover:bg-accent/25"
                        : "bg-secondary/70 text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {isPrimary && !isActive ? `★ ${CATEGORY_LABELS[cat]}` : CATEGORY_LABELS[cat]}
                </button>
              );
            })}
            {/* Trailing spacer so last tab isn't right against the edge */}
            <div className="flex-none w-3" aria-hidden />
          </div>

          {/* Right gradient + arrow */}
          {canScrollRight && (
            <>
              <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-card to-transparent pointer-events-none z-10" />
              <button
                type="button"
                onClick={() => scrollTabs("right")}
                className="absolute right-1 top-1/2 -translate-y-1/2 z-20 p-0.5 rounded-full bg-card/80 shadow-sm border border-border/50 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={t("Rolar direita")}
              >
                <ChevronRight size={14} />
              </button>
            </>
          )}
        </div>

        {/* ── Status hint when user wants to clear ────────────────────── */}
        {willClear && (
          <div className="px-5 py-2 bg-amber-500/10 border-b border-amber-500/20 flex-shrink-0">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("A imagem será removida e o sistema escolherá automaticamente.")}
              {" "}
              <button
                type="button"
                onClick={() => setSelectedUrl(currentUrl ?? null)}
                className="underline underline-offset-2 hover:no-underline"
              >
                {t("Desfazer")}
              </button>
            </p>
          </div>
        )}

        {/* ── Image grid ──────────────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1 p-4">
          {images.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              {t("Nenhuma imagem disponível nesta categoria")}
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {images.map((url) => (
                <ImageTile
                  key={url}
                  url={url}
                  isSelected={url === selectedUrl}
                  isCurrentCover={url === currentUrl}
                  onPickThis={() => handlePickImage(url)}
                  onRemoveOrDeselect={() => handleRemoveOrDeselect(url)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div className="px-5 py-4 border-t border-border/50 flex-shrink-0 flex flex-wrap items-center gap-3">
          {/* Restore auto link — only when there's a saved manual URL and user hasn't already triggered clear */}
          {hasManualOverride && !willClear ? (
            <button
              type="button"
              onClick={() => setSelectedUrl(null)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw size={12} />
              {t("Restaurar automática")}
            </button>
          ) : !hasManualOverride ? (
            <span className="text-xs text-muted-foreground/60 italic">
              {t("Sem substituição ativa")}
            </span>
          ) : null}

          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-secondary transition-colors"
            >
              {t("Cancelar")}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!confirmEnabled}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                "disabled:opacity-40 disabled:cursor-not-allowed",
                willClear
                  ? "bg-amber-500 text-white hover:bg-amber-600"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
