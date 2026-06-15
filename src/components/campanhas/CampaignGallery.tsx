import { useState } from "react";

import { ImagePlus, Pencil, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { useLanguage } from "@/hooks/useLanguage";

import { useToast } from "@/hooks/use-toast";

import { useRole } from "@/hooks/useRole";

import { useChurch } from "@/hooks/useChurchContext";

import {
  campaignImageSeed,
  getLocalGalleryImagesForCampaign,
  pickCoverManifestImageForCampaign,
} from "@/lib/campaignImages";

import type { Campaign } from "@/lib/campaignsDemo";

import type { CampaignMediaItem } from "@/lib/campaignMedia";

import { getCampaignGallery, resolveMediaItemUrl } from "@/lib/campaignMedia";

import { CampaignMediaLightbox } from "@/components/campanhas/CampaignMediaLightbox";

import { CampaignImagePickerModal } from "@/components/campanhas/CampaignImagePickerModal";

import { deleteCampaignMedia, updateCampaignMediaUrl } from "@/lib/campaignMediaMutations";

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * A single gallery slot.
 * - `url`         — current display URL (may be a local-override for illustrative images)
 * - `originalUrl` — pre-override base URL; used as the key in `localOverrides` map
 * - `mediaItem`   — present only when the image comes from a real DB upload
 */
type GalleryEntry = {
  url: string;
  originalUrl: string;
  mediaItem?: CampaignMediaItem;
};

// ── Gallery builder ──────────────────────────────────────────────────────────

const MAX_VISIBLE = 12;

function buildGalleryEntries(campaign: Campaign, media: CampaignMediaItem[]): GalleryEntry[] {
  const realItems = getCampaignGallery(campaign, media).filter((item) => !item.isCover);

  const realEntries: GalleryEntry[] = realItems
    .map((item) => {
      const url = resolveMediaItemUrl(item);
      return url && !url.endsWith(".svg") ? { url, originalUrl: url, mediaItem: item } : null;
    })
    .filter((e): e is GalleryEntry => e !== null);

  if (realEntries.length > 0) return realEntries;

  // Illustrative fallback — no DB records
  const seed = campaignImageSeed(campaign);
  const manifestCover = pickCoverManifestImageForCampaign(campaign, seed);
  const urls = getLocalGalleryImagesForCampaign(campaign, seed, 24, manifestCover).filter(
    (u) => u !== manifestCover,
  );
  return urls.map((u) => ({ url: u, originalUrl: u }));
}

// ── Component ────────────────────────────────────────────────────────────────

type Props = {
  campaign: Campaign;
  media?: CampaignMediaItem[];
  loading?: boolean;
  onEdit?: () => void;
  onRefresh?: () => void | Promise<void>;
};

export function CampaignGallery({
  campaign,
  media = [],
  loading = false,
  onEdit,
  onRefresh,
}: Props) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { hasRole } = useRole();
  const { church } = useChurch();

  const canManage = hasRole(["church_admin", "leader", "tesoureiro", "super_admin"]);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Gallery slot currently open in the picker modal
  const [pickerEntry, setPickerEntry] = useState<GalleryEntry | null>(null);
  // Local URL overrides for illustrative images (not persisted to DB)
  const [localOverrides, setLocalOverrides] = useState<Map<string, string>>(new Map());
  // originalUrls of illustrative images hidden locally (no DB operation)
  const [hiddenLocalImages, setHiddenLocalImages] = useState<Set<string>>(new Set());
  // ID of the media item currently being deleted
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Build base entries from DB + illustrative fallback
  const baseEntries = buildGalleryEntries(campaign, media);
  const hasRealUploads =
    getCampaignGallery(campaign, media).filter((i) => !i.isCover).length > 0;

  // Apply local overrides and filter out locally-hidden illustrative images
  const allEntries: GalleryEntry[] = baseEntries
    .filter((e) => !hiddenLocalImages.has(e.originalUrl))
    .map((e) => {
      const override = localOverrides.get(e.originalUrl);
      return override ? { ...e, url: override } : e;
    });

  const allUrls = allEntries.map((e) => e.url);

  const extraCount = Math.max(0, allEntries.length - MAX_VISIBLE);
  const visibleCount =
    extraCount > 0 ? MAX_VISIBLE - 1 : Math.min(allEntries.length, MAX_VISIBLE);
  const visibleEntries = allEntries.slice(0, visibleCount);

  const openLightbox = (index: number) => {
    if (index >= 0 && index < allEntries.length) setLightboxIndex(index);
  };

  const handleAddPhotos = () => {
    if (onEdit) {
      onEdit();
      return;
    }
    toast({ title: t("Adicionar fotos"), description: t("Edite a campanha para enviar fotos") });
  };

  // ── Delete ──────────────────────────────────────────────────────────────
  const handleDelete = async (entry: GalleryEntry) => {
    if (!entry.mediaItem) {
      // Illustrative image — hide locally without any DB/storage operation
      if (!window.confirm(t("Remover esta imagem da galeria?"))) return;
      setHiddenLocalImages((prev) => new Set([...prev, entry.originalUrl]));
      // Also clear any local override for this slot
      setLocalOverrides((prev) => {
        const next = new Map(prev);
        next.delete(entry.originalUrl);
        return next;
      });
      toast({ title: t("Imagem removida da visualização") });
      return;
    }

    // Real upload — confirm then delete from storage + DB
    if (!window.confirm(t("Excluir esta foto da galeria? Esta ação não pode ser desfeita."))) {
      return;
    }

    if (!church?.id) return;

    setDeletingId(entry.mediaItem.id);
    const result = await deleteCampaignMedia(church.id, entry.mediaItem);
    setDeletingId(null);

    if (!result.ok) {
      toast({
        title: t("Erro ao excluir"),
        description: result.error ?? t("Tente novamente"),
        variant: "destructive",
      });
      return;
    }

    toast({ title: t("Foto removida da galeria") });
    await onRefresh?.();
  };

  // ── Picker: user confirmed a new image ──────────────────────────────────
  const handlePickerSelect = async (newUrl: string) => {
    if (!pickerEntry) return;

    if (pickerEntry.mediaItem) {
      // Real upload — update public_url in DB (storage_path unchanged for cleanup)
      if (!church?.id) return;
      const result = await updateCampaignMediaUrl(church.id, pickerEntry.mediaItem.id, {
        public_url: newUrl,
      });
      if (!result.ok) {
        toast({
          title: t("Erro ao atualizar"),
          description: result.error ?? t("Tente novamente"),
          variant: "destructive",
        });
        return;
      }
      toast({ title: t("Imagem atualizada") });
      await onRefresh?.();
    } else {
      // Illustrative — local visual swap only (not persisted)
      setLocalOverrides((prev) => {
        const next = new Map(prev);
        next.set(pickerEntry.originalUrl, newUrl);
        return next;
      });
      toast({
        title: t("Imagem substituída localmente"),
        description: t(
          "Esta substituição é visual e temporária. Para torná-la permanente, use 'Adicionar fotos'.",
        ),
      });
    }

    setPickerEntry(null);
  };

  // ── Picker: user cleared the override (restore auto) ────────────────────
  const handlePickerClear = async () => {
    if (!pickerEntry) return;

    if (pickerEntry.mediaItem && church?.id) {
      // Remove the public_url override so resolveMediaItemUrl falls back to storage path
      const result = await updateCampaignMediaUrl(church.id, pickerEntry.mediaItem.id, {
        public_url: null,
      });
      if (result.ok) {
        toast({ title: t("Imagem restaurada") });
        await onRefresh?.();
      }
    } else {
      // Remove local illustrative override
      setLocalOverrides((prev) => {
        const next = new Map(prev);
        next.delete(pickerEntry.originalUrl);
        return next;
      });
    }

    setPickerEntry(null);
  };

  if (allEntries.length === 0 && !canManage) return null;

  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="font-semibold text-sm">{t("Galeria de Fotos")}</h3>

        <div className="flex items-center gap-2">
          {loading && (
            <span className="text-[10px] text-muted-foreground animate-pulse">
              {t("Carregando...")}
            </span>
          )}

          {canManage && (
            <button
              type="button"
              onClick={handleAddPhotos}
              className="text-xs inline-flex items-center gap-1 text-primary hover:underline"
            >
              <ImagePlus size={14} /> {t("Adicionar fotos")}
            </button>
          )}
        </div>
      </div>

      {!hasRealUploads && allEntries.length > 0 && (
        <p className="text-[10px] text-muted-foreground mb-2">
          {t("Imagens ilustrativas da biblioteca")}
        </p>
      )}

      {allEntries.length === 0 ? (
        <p className="text-xs text-muted-foreground rounded-lg bg-secondary/40 p-3">
          {t("Nenhuma foto na galeria")}
        </p>
      ) : (
        <>
          {/* ── Mobile grid (2 cols) ── */}
          <div className="grid grid-cols-2 gap-2 sm:hidden">
            {visibleEntries.map((entry, index) => (
              <GalleryTile
                key={`m-${entry.originalUrl}-${index}`}
                entry={entry}
                featured={index === 0}
                canManage={canManage}
                deleting={deletingId === entry.mediaItem?.id}
                onClick={() => openLightbox(index)}
                onEdit={() => setPickerEntry(entry)}
                onDelete={() => void handleDelete(entry)}
              />
            ))}

            {extraCount > 0 && (
              <MoreTile
                count={extraCount}
                label={t("fotos")}
                onClick={() => openLightbox(visibleCount)}
              />
            )}
          </div>

          {/* ── Desktop grid (4-col masonry-ish) ── */}
          <div className="hidden sm:grid sm:grid-cols-4 sm:grid-rows-2 sm:gap-2.5 sm:h-[220px] lg:h-[240px]">
            {visibleEntries.map((entry, index) => (
              <GalleryTile
                key={`d-${entry.originalUrl}-${index}`}
                entry={entry}
                featured={index === 0}
                canManage={canManage}
                deleting={deletingId === entry.mediaItem?.id}
                onClick={() => openLightbox(index)}
                onEdit={() => setPickerEntry(entry)}
                onDelete={() => void handleDelete(entry)}
                className={cn(
                  index === 0 && "col-span-2 row-span-2 h-full",
                  index > 0 && "h-full min-h-0",
                )}
              />
            ))}

            {extraCount > 0 && (
              <MoreTile
                count={extraCount}
                label={t("fotos")}
                className="h-full min-h-0"
                onClick={() => openLightbox(visibleCount)}
              />
            )}
          </div>
        </>
      )}

      {/* ── Lightbox ── */}
      {lightboxIndex !== null && (
        <CampaignMediaLightbox
          urls={allUrls}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* ── Gallery-slot image picker ── */}
      {pickerEntry && (
        <CampaignImagePickerModal
          open
          onClose={() => setPickerEntry(null)}
          campaign={campaign}
          currentUrl={pickerEntry.url}
          onSelect={(url) => void handlePickerSelect(url)}
          onClear={() => void handlePickerClear()}
        />
      )}
    </section>
  );
}

// ── GalleryTile ──────────────────────────────────────────────────────────────

function GalleryTile({
  entry,
  featured,
  className,
  canManage,
  deleting,
  onClick,
  onEdit,
  onDelete,
}: {
  entry: GalleryEntry;
  featured?: boolean;
  className?: string;
  canManage: boolean;
  deleting: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "relative overflow-hidden rounded-xl border border-border/30 bg-muted group cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        featured ? "aspect-[4/3] sm:aspect-auto" : "aspect-[4/3] sm:aspect-auto",
        className,
      )}
    >
      <img
        src={entry.url}
        alt=""
        className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.03] group-active:scale-[0.99]"
        loading="lazy"
        draggable={false}
      />

      {/* inner border ring */}
      <div className="absolute inset-0 ring-1 ring-inset ring-black/5 rounded-xl pointer-events-none" />

      {/* ── Manager overlay (pencil + trash) ─────────────────────────────
           Mobile:  always visible (opacity-100)
           Desktop: visible on hover only (sm:opacity-0 sm:group-hover:opacity-100)
      ──────────────────────────────────────────────────────────────────── */}
      {canManage && !deleting && (
        <div
          className="absolute top-2 right-2 z-10 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label="Trocar imagem"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="p-1.5 rounded-md bg-black/60 text-white hover:bg-primary/80 backdrop-blur-sm transition-colors"
          >
            <Pencil size={11} />
          </button>

          <button
            type="button"
            aria-label="Excluir foto"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1.5 rounded-md bg-black/60 text-white hover:bg-red-600/80 backdrop-blur-sm transition-colors"
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}

      {/* Deletion spinner */}
      {deleting && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20 rounded-xl">
          <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

// ── MoreTile ─────────────────────────────────────────────────────────────────

function MoreTile({
  count,
  label,
  className,
  onClick,
}: {
  count: number;
  label: string;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-xl border border-border/30 bg-secondary/60 flex items-center justify-center",
        "cursor-pointer hover:bg-secondary/80 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "aspect-[4/3] sm:aspect-auto",
        className,
      )}
    >
      <span className="text-lg font-semibold text-muted-foreground">
        +{count} {label}
      </span>
    </button>
  );
}
