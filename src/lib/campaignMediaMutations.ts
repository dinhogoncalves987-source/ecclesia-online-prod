import { supabase } from "@/integrations/supabase/client";
import {
  CAMPAIGN_MEDIA_BUCKET,
  mapDbCampaignMedia,
  type CampaignMediaItem,
  type CampaignMediaType,
  type DbCampaignMediaRow,
} from "@/lib/campaignMedia";

export type CampaignMediaUploadResult = {
  ok: boolean;
  item?: CampaignMediaItem;
  error?: string;
};

export const CAMPAIGN_COVER_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export const CAMPAIGN_GALLERY_MIME = CAMPAIGN_COVER_MIME;
export const CAMPAIGN_VIDEO_MIME = ["video/mp4", "video/webm"] as const;
export const CAMPAIGN_DOCUMENT_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export const CAMPAIGN_COVER_EXT = [".jpg", ".jpeg", ".png", ".webp"] as const;
export const CAMPAIGN_VIDEO_EXT = [".mp4", ".webm"] as const;
export const CAMPAIGN_DOCUMENT_EXT = [".pdf", ".docx", ".xlsx"] as const;

export const CAMPAIGN_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const CAMPAIGN_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const CAMPAIGN_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? `.${parts.pop()!.toLowerCase()}` : "";
}

export function validateCampaignMediaFile(
  file: File,
  kind: "cover" | "gallery" | "video" | "document",
): string | null {
  const ext = fileExtension(file.name);
  const mime = file.type.toLowerCase();

  switch (kind) {
    case "cover":
    case "gallery":
      if (CAMPAIGN_COVER_MIME.includes(mime as (typeof CAMPAIGN_COVER_MIME)[number])) {
        if (file.size > CAMPAIGN_IMAGE_MAX_BYTES) return "image_too_large";
        return null;
      }
      if (CAMPAIGN_COVER_EXT.includes(ext as (typeof CAMPAIGN_COVER_EXT)[number])) {
        if (file.size > CAMPAIGN_IMAGE_MAX_BYTES) return "image_too_large";
        return null;
      }
      return "invalid_image";
    case "video":
      if (CAMPAIGN_VIDEO_MIME.includes(mime as (typeof CAMPAIGN_VIDEO_MIME)[number])) {
        if (file.size > CAMPAIGN_VIDEO_MAX_BYTES) return "video_too_large";
        return null;
      }
      if (CAMPAIGN_VIDEO_EXT.includes(ext as (typeof CAMPAIGN_VIDEO_EXT)[number])) {
        if (file.size > CAMPAIGN_VIDEO_MAX_BYTES) return "video_too_large";
        return null;
      }
      return "invalid_video";
    case "document":
      if (CAMPAIGN_DOCUMENT_MIME.includes(mime as (typeof CAMPAIGN_DOCUMENT_MIME)[number])) {
        if (file.size > CAMPAIGN_DOCUMENT_MAX_BYTES) return "document_too_large";
        return null;
      }
      if (CAMPAIGN_DOCUMENT_EXT.includes(ext as (typeof CAMPAIGN_DOCUMENT_EXT)[number])) {
        if (file.size > CAMPAIGN_DOCUMENT_MAX_BYTES) return "document_too_large";
        return null;
      }
      return "invalid_document";
    default:
      return "invalid_type";
  }
}

function buildStoragePath(organizationId: string, campaignId: string, file: File): string {
  const ext = fileExtension(file.name).replace(/^\./, "") || "bin";
  return `${organizationId}/${campaignId}/${crypto.randomUUID()}.${ext}`;
}

async function clearCoverFlag(organizationId: string, campaignId: string): Promise<void> {
  await supabase
    .from("campaign_media")
    .update({ is_cover: false })
    .eq("organization_id", organizationId)
    .eq("campaign_id", campaignId)
    .eq("is_cover", true);
}

export async function uploadCampaignMedia(
  organizationId: string,
  campaignId: string,
  file: File,
  options: {
    mediaType: CampaignMediaType;
    isCover?: boolean;
    sortOrder?: number;
    title?: string | null;
    userId?: string | null;
  },
): Promise<CampaignMediaUploadResult> {
  const kind =
    options.mediaType === "video"
      ? "video"
      : options.mediaType === "document"
        ? "document"
        : options.isCover
          ? "cover"
          : "gallery";

  const validationError = validateCampaignMediaFile(file, kind);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const storagePath = buildStoragePath(organizationId, campaignId, file);

  const { error: uploadError } = await supabase.storage
    .from(CAMPAIGN_MEDIA_BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });

  if (uploadError) {
    return { ok: false, error: uploadError.message };
  }

  const { data: urlData } = supabase.storage.from(CAMPAIGN_MEDIA_BUCKET).getPublicUrl(storagePath);
  const publicUrl = urlData.publicUrl;

  if (options.isCover) {
    await clearCoverFlag(organizationId, campaignId);
  }

  const { data, error } = await supabase
    .from("campaign_media")
    .insert({
      campaign_id: campaignId,
      organization_id: organizationId,
      media_type: options.mediaType,
      storage_bucket: CAMPAIGN_MEDIA_BUCKET,
      storage_path: storagePath,
      public_url: publicUrl,
      title: options.title?.trim() || file.name,
      sort_order: options.sortOrder ?? 0,
      is_cover: Boolean(options.isCover),
      uploaded_by: options.userId ?? null,
    })
    .select()
    .single();

  if (error) {
    await supabase.storage.from(CAMPAIGN_MEDIA_BUCKET).remove([storagePath]);
    return { ok: false, error: error.message };
  }

  return { ok: true, item: mapDbCampaignMedia(data as DbCampaignMediaRow) };
}

export async function deleteCampaignMedia(
  organizationId: string,
  item: Pick<CampaignMediaItem, "id" | "storageBucket" | "storagePath">,
): Promise<CampaignMediaUploadResult> {
  const { error: storageError } = await supabase.storage
    .from(item.storageBucket)
    .remove([item.storagePath]);

  if (storageError) {
    return { ok: false, error: storageError.message };
  }

  const { error } = await supabase
    .from("campaign_media")
    .delete()
    .eq("id", item.id)
    .eq("organization_id", organizationId);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export type PendingCampaignMedia = {
  localId: string;
  file: File;
  mediaType: CampaignMediaType;
  isCover?: boolean;
  previewUrl?: string;
};

export async function uploadPendingCampaignMedia(
  organizationId: string,
  campaignId: string,
  pending: PendingCampaignMedia[],
  userId?: string | null,
): Promise<{ ok: boolean; uploaded: number; errors: string[] }> {
  const errors: string[] = [];
  let uploaded = 0;
  let sortOrder = 0;

  for (const item of pending) {
    const result = await uploadCampaignMedia(organizationId, campaignId, item.file, {
      mediaType: item.mediaType,
      isCover: item.isCover,
      sortOrder: item.isCover ? 0 : sortOrder++,
      userId,
    });

    if (result.ok) {
      uploaded++;
    } else if (result.error) {
      errors.push(result.error);
    }
  }

  return { ok: errors.length === 0, uploaded, errors };
}
