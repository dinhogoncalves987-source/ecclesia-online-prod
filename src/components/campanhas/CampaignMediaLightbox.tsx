import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";

type Props = {
  urls: string[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
};

const NAV_BTN =
  "absolute z-20 p-2.5 sm:p-3 rounded-full bg-black/50 text-white hover:bg-black/70 backdrop-blur-sm transition-colors disabled:opacity-30 disabled:pointer-events-none";

export function CampaignMediaLightbox({ urls, index, onIndexChange, onClose }: Props) {
  const { t } = useLanguage();
  const current = urls[index];
  const hasPrev = index > 0;
  const hasNext = index < urls.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
      if (e.key === "ArrowRight" && index < urls.length - 1) onIndexChange(index + 1);
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [index, urls.length, onClose, onIndexChange]);

  if (!current) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex flex-col touch-manipulation"
      role="dialog"
      aria-modal="true"
      aria-label={t("Galeria de Fotos")}
    >
      <div className="absolute inset-0 bg-black/92 backdrop-blur-md" onClick={onClose} aria-hidden />

      <div className="relative z-10 flex items-center justify-between px-4 py-3 sm:px-6 safe-area-inset-top">
        {urls.length > 1 ? (
          <span className="text-sm text-white/60 tabular-nums">
            {index + 1} / {urls.length}
          </span>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          aria-label={t("Fechar")}
        >
          <X size={22} />
        </button>
      </div>

      <div className="relative z-10 flex-1 flex items-center justify-center min-h-0 px-12 sm:px-16 pb-6">
        {urls.length > 1 && (
          <button
            type="button"
            className={cn(NAV_BTN, "left-2 sm:left-4")}
            onClick={(e) => {
              e.stopPropagation();
              onIndexChange(index - 1);
            }}
            disabled={!hasPrev}
            aria-label={t("Anterior")}
          >
            <ChevronLeft size={24} />
          </button>
        )}

        <img
          key={current}
          src={current}
          alt=""
          className="max-h-[min(78vh,900px)] max-w-full w-auto object-contain select-none"
          draggable={false}
          onClick={(e) => e.stopPropagation()}
        />

        {urls.length > 1 && (
          <button
            type="button"
            className={cn(NAV_BTN, "right-2 sm:right-4")}
            onClick={(e) => {
              e.stopPropagation();
              onIndexChange(index + 1);
            }}
            disabled={!hasNext}
            aria-label={t("Próximo")}
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
