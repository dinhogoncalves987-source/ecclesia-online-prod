import { useCallback, useRef, useState } from "react";
import {
  FileText,
  ImageIcon,
  Loader2,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { useCampaignMediaForCampaign } from "@/hooks/useCampaignMedia";
import {
  getCampaignCover,
  getCampaignDocuments,
  getCampaignGallery,
  getCampaignVideos,
  resolveMediaItemUrl,
  type CampaignMediaItem,
} from "@/lib/campaignMedia";
import {
  deleteCampaignMedia,
  formatFileSize,
  uploadCampaignMedia,
  validateCampaignMediaFile,
  type PendingCampaignMedia,
} from "@/lib/campaignMediaMutations";
import { isPersistedCampaignId } from "@/lib/campaignFormUtils";

type Props = {
  organizationId?: string;
  campaignId?: string | null;
  userId?: string | null;
  pending?: PendingCampaignMedia[];
  onPendingChange?: (items: PendingCampaignMedia[]) => void;
  onUploaded?: () => void | Promise<void>;
  disabled?: boolean;
};

function makeLocalId() {
  return crypto.randomUUID();
}

function previewForFile(file: File): string | undefined {
  if (file.type.startsWith("image/")) return URL.createObjectURL(file);
  return undefined;
}

function DropZone({
  label,
  hint,
  accept,
  multiple,
  onFiles,
  disabled,
}: {
  label: string;
  hint: string;
  accept: string;
  multiple?: boolean;
  onFiles: (files: FileList | File[]) => void;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (disabled || !event.dataTransfer.files.length) return;
    onFiles(event.dataTransfer.files);
  };

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-5 text-center cursor-pointer transition-colors",
        dragging ? "border-accent bg-accent/5" : "border-border/60 bg-secondary/20 hover:bg-secondary/30",
        disabled && "opacity-50 pointer-events-none",
      )}
    >
      <Upload size={18} className="text-muted-foreground" />
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}

function fileLabel(file: File): string {
  return `${file.name} (${formatFileSize(file.size)})`;
}

export function CampaignMediaUploadSection({
  organizationId,
  campaignId,
  userId,
  pending = [],
  onPendingChange,
  onUploaded,
  disabled = false,
}: Props) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const persisted = Boolean(
    organizationId && campaignId && isPersistedCampaignId(campaignId),
  );
  const { media, loading } = useCampaignMediaForCampaign(
    persisted ? campaignId : null,
    organizationId,
  );

  const coverItem = campaignId ? getCampaignCover({ id: campaignId }, media) : null;
  const galleryItems = campaignId ? getCampaignGallery({ id: campaignId }, media) : [];
  const videoItems = campaignId ? getCampaignVideos({ id: campaignId }, media) : [];
  const documentItems = campaignId ? getCampaignDocuments({ id: campaignId }, media) : [];

  const pendingCover = pending.find((p) => p.isCover);
  const pendingGallery = pending.filter((p) => p.mediaType === "image" && !p.isCover);
  const pendingVideos = pending.filter((p) => p.mediaType === "video");
  const pendingDocs = pending.filter((p) => p.mediaType === "document");

  const errorMessage = (code: string) => {
    switch (code) {
      case "invalid_image":
        return t("Formato de imagem inválido");
      case "image_too_large":
        return t("Esta imagem é muito grande. Envie um arquivo de até 8 MB.");
      case "invalid_video":
        return t("Formato de vídeo inválido");
      case "video_too_large":
        return t("Este vídeo é muito grande. Envie um arquivo de até 50 MB.");
      case "invalid_document":
        return t("Formato de documento inválido");
      case "document_too_large":
        return t("Este documento é muito grande. Envie um arquivo de até 20 MB.");
      default:
        return code;
    }
  };

  const refresh = useCallback(async () => {
    await onUploaded?.();
  }, [onUploaded]);

  const addPending = (items: PendingCampaignMedia[]) => {
    onPendingChange?.([...pendingRef.current, ...items]);
  };

  const removePending = (localId: string) => {
    onPendingChange?.(pendingRef.current.filter((p) => p.localId !== localId));
  };

  const handleUploadNow = async (
    file: File,
    mediaType: "image" | "video" | "document",
    isCover = false,
  ) => {
    if (!organizationId || !campaignId) return false;

    setUploading(true);
    try {
      const result = await uploadCampaignMedia(organizationId, campaignId, file, {
        mediaType,
        isCover,
        userId,
      });

      if (!result.ok) {
        toast({
          title: t("Erro no upload"),
          description: errorMessage(result.error ?? t("Tente novamente")),
          variant: "destructive",
        });
        return false;
      }

      await refresh();
      return true;
    } finally {
      setUploading(false);
    }
  };

  const handleCoverFiles = async (files: FileList | File[]) => {
    const file = Array.from(files)[0];
    if (!file) return;

    const validation = validateCampaignMediaFile(file, "cover");
    if (validation) {
      toast({ title: t("Erro no upload"), description: errorMessage(validation), variant: "destructive" });
      return;
    }

    if (persisted) {
      await handleUploadNow(file, "image", true);
      return;
    }

    onPendingChange?.([
      ...pendingRef.current.filter((p) => !p.isCover),
      {
        localId: makeLocalId(),
        file,
        mediaType: "image",
        isCover: true,
        previewUrl: previewForFile(file),
      },
    ]);
  };

  const handleGalleryFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    const valid: PendingCampaignMedia[] = [];

    if (persisted) setUploading(true);
    try {
      for (const file of list) {
        const validation = validateCampaignMediaFile(file, "gallery");
        if (validation) {
          toast({ title: t("Erro no upload"), description: errorMessage(validation), variant: "destructive" });
          continue;
        }

        if (persisted) {
          const result = await uploadCampaignMedia(organizationId!, campaignId!, file, {
            mediaType: "image",
            userId,
            sortOrder: galleryItems.length + valid.length,
          });
          if (!result.ok) {
            toast({
              title: t("Erro no upload"),
              description: errorMessage(result.error ?? t("Tente novamente")),
              variant: "destructive",
            });
          }
        } else {
          valid.push({
            localId: makeLocalId(),
            file,
            mediaType: "image",
            previewUrl: previewForFile(file),
          });
        }
      }

      if (persisted) {
        await refresh();
      } else if (valid.length) {
        addPending(valid);
      }
    } finally {
      if (persisted) setUploading(false);
    }
  };

  const handleVideoFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const validation = validateCampaignMediaFile(file, "video");
      if (validation) {
        toast({ title: t("Erro no upload"), description: errorMessage(validation), variant: "destructive" });
        continue;
      }

      if (persisted) {
        await handleUploadNow(file, "video");
      } else {
        addPending([{ localId: makeLocalId(), file, mediaType: "video" }]);
      }
    }
  };

  const handleDocumentFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const validation = validateCampaignMediaFile(file, "document");
      if (validation) {
        toast({ title: t("Erro no upload"), description: errorMessage(validation), variant: "destructive" });
        continue;
      }

      if (persisted) {
        await handleUploadNow(file, "document");
      } else {
        addPending([{ localId: makeLocalId(), file, mediaType: "document" }]);
      }
    }
  };

  const handleDeleteExisting = async (item: CampaignMediaItem) => {
    if (!organizationId) return;
    setUploading(true);
    try {
      const result = await deleteCampaignMedia(organizationId, item);

      if (!result.ok) {
        toast({
          title: t("Erro"),
          description: result.error ?? t("Tente novamente"),
          variant: "destructive",
        });
        return;
      }

      await refresh();
    } finally {
      setUploading(false);
    }
  };

  const coverUrl =
    (coverItem && resolveMediaItemUrl(coverItem)) ||
    pendingCover?.previewUrl ||
    null;

  return (
    <div className="space-y-5 rounded-lg border border-border/50 bg-secondary/10 px-4 py-4">
      <div>
        <p className="text-sm font-medium">{t("Mídia da Campanha")}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {persisted
            ? t("Uploads substituem imagens automáticas da biblioteca")
            : t("Arquivos serão enviados ao salvar a campanha")}
        </p>
      </div>

      {(uploading || loading) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          {t("Carregando...")}
        </div>
      )}

      {/* Capa */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Capa")}</p>
        {coverUrl ? (
          <div className="relative rounded-lg overflow-hidden border border-border/40 aspect-[16/9] max-h-40">
            <img src={coverUrl} alt="" className="h-full w-full object-cover" />
            {coverItem && persisted && (
              <button
                type="button"
                disabled={disabled || uploading}
                onClick={() => handleDeleteExisting(coverItem)}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70"
                aria-label={t("Remover")}
              >
                <Trash2 size={14} />
              </button>
            )}
            {pendingCover && !persisted && (
              <button
                type="button"
                onClick={() => removePending(pendingCover.localId)}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70"
                aria-label={t("Remover")}
              >
                <X size={14} />
              </button>
            )}
          </div>
        ) : (
          <DropZone
            label={t("Enviar capa")}
            hint={t("JPG, PNG, WebP — até 8 MB")}
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            disabled={disabled || uploading}
            onFiles={handleCoverFiles}
          />
        )}
        {coverUrl && (
          <DropZone
            label={t("Substituir capa")}
            hint={t("JPG, PNG, WebP — até 8 MB")}
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            disabled={disabled || uploading}
            onFiles={handleCoverFiles}
          />
        )}
      </div>

      {/* Galeria */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <ImageIcon size={14} /> {t("Galeria de Fotos")}
        </p>
        {(galleryItems.length > 0 || pendingGallery.length > 0) && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {galleryItems.map((item) => {
              const url = resolveMediaItemUrl(item);
              if (!url) return null;
              return (
                <div key={item.id} className="relative aspect-square rounded-md overflow-hidden border border-border/40">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    disabled={disabled || uploading}
                    onClick={() => handleDeleteExisting(item)}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white"
                    aria-label={t("Remover")}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
            {pendingGallery.map((item) => (
              <div key={item.localId} className="relative aspect-square rounded-md overflow-hidden border border-border/40">
                {item.previewUrl ? (
                  <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-muted flex items-center justify-center">
                    <ImageIcon size={16} className="text-muted-foreground" />
                  </div>
                )}
                <span className="absolute bottom-0 inset-x-0 truncate bg-black/55 px-1 py-0.5 text-[10px] text-white">
                  {fileLabel(item.file)}
                </span>
                <button
                  type="button"
                  onClick={() => removePending(item.localId)}
                  className="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white"
                  aria-label={t("Remover")}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <DropZone
          label={t("Adicionar fotos")}
          hint={t("JPG, PNG, WebP — até 8 MB")}
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          multiple
          disabled={disabled || uploading}
          onFiles={handleGalleryFiles}
        />
      </div>

      {/* Vídeos */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Video size={14} /> {t("Vídeos")}
        </p>
        {(videoItems.length > 0 || pendingVideos.length > 0) && (
          <ul className="space-y-1.5">
            {videoItems.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 text-xs rounded-md border border-border/40 px-2 py-1.5">
                <span className="truncate">{item.title ?? item.storagePath.split("/").pop()}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  disabled={disabled || uploading}
                  onClick={() => handleDeleteExisting(item)}
                >
                  <Trash2 size={14} />
                </Button>
              </li>
            ))}
            {pendingVideos.map((item) => (
              <li key={item.localId} className="flex items-center justify-between gap-2 text-xs rounded-md border border-dashed border-border/40 px-2 py-1.5">
                <span className="truncate">{fileLabel(item.file)}</span>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removePending(item.localId)}>
                  <X size={14} />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <DropZone
          label={t("Adicionar vídeo")}
          hint={t("MP4, WebM — até 50 MB")}
          accept=".mp4,.webm,video/mp4,video/webm"
          multiple
          disabled={disabled || uploading}
          onFiles={handleVideoFiles}
        />
      </div>

      {/* Documentos */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <FileText size={14} /> {t("Documentos")}
        </p>
        {(documentItems.length > 0 || pendingDocs.length > 0) && (
          <ul className="space-y-1.5">
            {documentItems.map((item) => {
              const url = resolveMediaItemUrl(item);
              return (
                <li key={item.id} className="flex items-center justify-between gap-2 text-xs rounded-md border border-border/40 px-2 py-1.5">
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="truncate text-primary hover:underline">
                      {item.title ?? item.storagePath.split("/").pop()}
                    </a>
                  ) : (
                    <span className="truncate">{item.title}</span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    disabled={disabled || uploading}
                    onClick={() => handleDeleteExisting(item)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </li>
              );
            })}
            {pendingDocs.map((item) => (
              <li key={item.localId} className="flex items-center justify-between gap-2 text-xs rounded-md border border-dashed border-border/40 px-2 py-1.5">
                <span className="truncate">{fileLabel(item.file)}</span>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removePending(item.localId)}>
                  <X size={14} />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <DropZone
          label={t("Adicionar documento")}
          hint={t("PDF, DOCX, XLSX — até 20 MB")}
          accept=".pdf,.docx,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          multiple
          disabled={disabled || uploading}
          onFiles={handleDocumentFiles}
        />
      </div>
    </div>
  );
}

export type { PendingCampaignMedia };
