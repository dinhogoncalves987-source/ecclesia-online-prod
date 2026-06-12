import type { Campaign } from "@/lib/campaignsDemo";
import {
  campaignImageSeed,
  inferCampaignImageCategory,
  pickCoverManifestImageForCampaign,
  CAMPAIGN_SVG_FALLBACK,
  type CampaignImageCategory,
} from "@/lib/campaignImages";
/**
 * Campaign media architecture — display priority (resolveCampaignVisual):
 * 1. campaign_media with is_cover=true (Supabase Storage campaign-media)
 * 2. first campaign_media image
 * 3. campaign.coverImageUrl (legacy/upload field)
 * 4. local public/campaigns manifest
 * 5. official Ecclesia library in Storage (campaign-library bucket)
 * 6. procedural SVG fallback
 */

export const CAMPAIGN_LIBRARY_BUCKET = "campaign-library";
export const CAMPAIGN_MEDIA_BUCKET = "campaign-media";

export type CampaignMediaType = "image" | "video" | "document";

export type CampaignMediaItem = {
  id: string;
  campaignId: string;
  organizationId: string;
  mediaType: CampaignMediaType;
  storageBucket: string;
  storagePath: string;
  publicUrl: string | null;
  title: string | null;
  description: string | null;
  sortOrder: number;
  isCover: boolean;
  createdAt: string;
};

export type CampaignVisualSource =
  | "campaign_media_cover"
  | "campaign_media_image"
  | "cover_url"
  | "storage_library"
  | "local_library"
  | "local_general"
  | "procedural";

export type CampaignVisualResult = {
  url: string;
  source: CampaignVisualSource;
  category: CampaignImageCategory;
  /** Remaining URLs if primary fails to load (e.g. empty Storage bucket) */
  fallbackChain: string[];
};

export type DbCampaignMediaRow = {
  id: string;
  campaign_id: string;
  organization_id: string;
  uploaded_by: string | null;
  media_type: string;
  storage_bucket: string;
  storage_path: string;
  public_url: string | null;
  title: string | null;
  description: string | null;
  sort_order: number;
  is_cover: boolean;
  created_at: string;
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

export function mapDbCampaignMedia(row: DbCampaignMediaRow): CampaignMediaItem {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    organizationId: row.organization_id,
    mediaType: row.media_type as CampaignMediaType,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    publicUrl: row.public_url,
    title: row.title,
    description: row.description,
    sortOrder: row.sort_order,
    isCover: row.is_cover,
    createdAt: row.created_at,
  };
}

export function buildStoragePublicUrl(bucket: string, path: string): string | null {
  if (!SUPABASE_URL?.trim()) return null;
  const clean = path.replace(/^\/+/, "");
  return `${SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/public/${bucket}/${clean}`;
}

export function resolveMediaItemUrl(item: Pick<CampaignMediaItem, "publicUrl" | "storageBucket" | "storagePath">): string | null {
  if (item.publicUrl?.trim()) return item.publicUrl.trim();
  return buildStoragePublicUrl(item.storageBucket, item.storagePath);
}

function sortedMedia(media: CampaignMediaItem[]): CampaignMediaItem[] {
  return [...media].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
}

export function getCampaignGallery(
  campaign: Pick<Campaign, "id">,
  media: CampaignMediaItem[] = [],
): CampaignMediaItem[] {
  return sortedMedia(media.filter((m) => m.campaignId === campaign.id && m.mediaType === "image"));
}

export function getCampaignVideos(
  campaign: Pick<Campaign, "id">,
  media: CampaignMediaItem[] = [],
): CampaignMediaItem[] {
  return sortedMedia(media.filter((m) => m.campaignId === campaign.id && m.mediaType === "video"));
}

export function getCampaignDocuments(
  campaign: Pick<Campaign, "id">,
  media: CampaignMediaItem[] = [],
): CampaignMediaItem[] {
  return sortedMedia(media.filter((m) => m.campaignId === campaign.id && m.mediaType === "document"));
}

export function getCampaignCover(
  campaign: Pick<Campaign, "id">,
  media: CampaignMediaItem[] = [],
): CampaignMediaItem | null {
  const items = sortedMedia(media.filter((m) => m.campaignId === campaign.id));
  const cover = items.find((m) => m.isCover && m.mediaType === "image");
  if (cover) return cover;
  return items.find((m) => m.mediaType === "image") ?? null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Official Ecclesia library in Storage — populated via scripts/upload-campaign-library-to-storage.mjs */
export function getStorageLibraryImageUrl(
  category: CampaignImageCategory,
  seed: string,
  maxSlots = 8,
): string | null {
  if (!SUPABASE_URL?.trim() || maxSlots <= 0) return null;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const slot = (hash % maxSlots) + 1;
  const path = `${category}/${category}-${pad2(slot)}.jpg`;
  return buildStoragePublicUrl(CAMPAIGN_LIBRARY_BUCKET, path);
}

export function resolveCampaignVisualChain(
  campaign: Pick<Campaign, "id" | "title" | "coverImageUrl" | "type">,
  media: CampaignMediaItem[] = [],
): { url: string; source: CampaignVisualSource }[] {
  const category = inferCampaignImageCategory(campaign);
  const seed = campaignImageSeed(campaign);
  const chain: { url: string; source: CampaignVisualSource }[] = [];

  const coverItem = getCampaignCover(campaign, media);
  const coverUrl = coverItem ? resolveMediaItemUrl(coverItem) : null;
  if (coverUrl) {
    chain.push({
      url: coverUrl,
      source: coverItem?.isCover ? "campaign_media_cover" : "campaign_media_image",
    });
  }

  const uploaded = campaign.coverImageUrl?.trim();
  if (uploaded && !chain.some((c) => c.url === uploaded)) {
    chain.push({ url: uploaded, source: "cover_url" });
  }

  const localCategory = pickCoverManifestImageForCampaign(campaign, seed);
  if (localCategory) {
    chain.push({ url: localCategory, source: "local_library" });
  }

  if (category !== "general") {
    const localGeneral = pickCoverManifestImageForCampaign({ ...campaign, type: "general" }, seed);
    if (localGeneral && !chain.some((c) => c.url === localGeneral)) {
      chain.push({ url: localGeneral, source: "local_general" });
    }
  }

  // Storage depois do manifest local (fallback se upload remoto falhar)
  const storageLib = getStorageLibraryImageUrl(category, seed);
  if (storageLib && !chain.some((c) => c.url === storageLib)) {
    chain.push({ url: storageLib, source: "storage_library" });
  }

  const svg = CAMPAIGN_SVG_FALLBACK[category] ?? CAMPAIGN_SVG_FALLBACK.general;
  chain.push({ url: svg, source: "procedural" });

  return chain;
}

export function resolveCampaignVisual(
  campaign: Pick<Campaign, "id" | "title" | "coverImageUrl" | "type">,
  media: CampaignMediaItem[] = [],
): CampaignVisualResult {
  const chain = resolveCampaignVisualChain(campaign, media);
  const primary = chain[0] ?? {
    url: CAMPAIGN_SVG_FALLBACK.general,
    source: "procedural" as const,
  };

  return {
    url: primary.url,
    source: primary.source,
    category: inferCampaignImageCategory(campaign),
    fallbackChain: chain.slice(1).map((c) => c.url),
  };
}

/** @deprecated Use resolveCampaignVisual — kept for gradual migration */
export function resolveCampaignImageFromVisual(
  campaign: Pick<Campaign, "id" | "title" | "coverImageUrl" | "type">,
  media?: CampaignMediaItem[],
) {
  const visual = resolveCampaignVisual(campaign, media);
  return visual;
}
