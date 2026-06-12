import type { Campaign } from "@/lib/campaignsDemo";
import {
  CAMPAIGN_IMAGE_MANIFEST,
  type CampaignImageCategory,
} from "@/lib/campaignImageManifest";
import { filterAllowedManifestPool, pickFromManifestPool } from "@/lib/campaignImageCurator";

/**
 * Local campaign image library — see campaignMedia.ts for full display priority.
 *
 * This module handles public/campaigns manifest + SVG fallbacks (layers 5–6).
 * resolveCampaignVisual in campaignMedia.ts is the canonical resolver.
 */

export type { CampaignImageCategory };

export type CampaignImageSource = "upload" | "library" | "general" | "procedural";

export type CampaignImageResult = {
  url: string;
  source: CampaignImageSource;
  category: CampaignImageCategory;
};

/** Fallback pools — nunca missions para evangelism (evita wildlife/rockets) */
const CATEGORY_POOL_ALIAS: Partial<Record<CampaignImageCategory, CampaignImageCategory>> = {
  bible: "general",
  children: "youth",
  women: "social",
  men: "general",
};

/** SVG placeholders — used when manifest has no photos yet */
export const CAMPAIGN_SVG_FALLBACK: Record<CampaignImageCategory, string> = {
  evangelism: "/campaigns/missions/cover.svg",
  social: "/campaigns/social/cover.svg",
  missions: "/campaigns/missions/cover.svg",
  construction: "/campaigns/construction/cover.svg",
  reform: "/campaigns/reform/cover.svg",
  events: "/campaigns/events/cover.svg",
  youth: "/campaigns/youth/cover.svg",
  music: "/campaigns/music/cover.svg",
  children: "/campaigns/youth/cover.svg",
  women: "/campaigns/social/cover.svg",
  men: "/campaigns/general/cover.svg",
  prayer: "/campaigns/missions/cover.svg",
  bible: "/campaigns/general/cover.svg",
  vehicles: "/campaigns/vehicles/cover.svg",
  emergency: "/campaigns/emergency/cover.svg",
  general: "/campaigns/general/cover.svg",
};

const TYPE_TO_CATEGORY: Record<string, CampaignImageCategory> = {
  "Ação Social": "social",
  "Missões": "missions",
  "Acao Social": "social",
  Construção: "construction",
  Construcao: "construction",
  Reforma: "reform",
  Evento: "events",
  Congresso: "events",
  Instrumentos: "music",
  Veículos: "vehicles",
  Veiculos: "vehicles",
  Emergencial: "emergency",
  "Projeto Ministerial": "evangelism",
  Livre: "general",
  acao_social: "social",
  social: "social",
  missoes: "missions",
  missions: "missions",
  construcao: "construction",
  construction: "construction",
  reforma: "reform",
  reform: "reform",
  evento: "events",
  events: "events",
  congresso: "events",
  youth: "youth",
  jovens: "youth",
  instrumentos: "music",
  music: "music",
  veiculos: "vehicles",
  vehicles: "vehicles",
  emergencial: "emergency",
  emergency: "emergency",
  projeto_ministerial: "evangelism",
  livre: "general",
  general: "general",
  evangelism: "evangelism",
  evangelismo: "evangelism",
  prayer: "prayer",
  oracao: "prayer",
  bible: "bible",
  biblia: "bible",
  children: "children",
  criancas: "children",
  women: "women",
  mulheres: "women",
  men: "men",
  homens: "men",
};

const TITLE_CATEGORY_RULES: { pattern: RegExp; category: CampaignImageCategory }[] = [
  { pattern: /evangel|almas|outreach|gospel|salva[cç][aã]o|ganhando\s+almas/i, category: "evangelism" },
  { pattern: /miss[aã]o|mission|campo\s+mission/i, category: "missions" },
  { pattern: /ora[cç][aã]o|prayer|intercess|vig[ií]lia/i, category: "prayer" },
  { pattern: /capela/i, category: "construction" },
  { pattern: /cobertor|cesta|cestas|aliment|inverno|frio|doa[cç][aã]o/i, category: "social" },
  { pattern: /juvent|jovens|youth/i, category: "youth" },
  { pattern: /crian[cç]a|children|kids/i, category: "children" },
  { pattern: /mulher|women/i, category: "women" },
  { pattern: /homens|men\b/i, category: "men" },
  { pattern: /b[ií]blia|bible|estudo\s+b[ií]blico/i, category: "bible" },
  { pattern: /constru|construction|obra|capela/i, category: "construction" },
  { pattern: /reforma|renov/i, category: "reform" },
  { pattern: /social|caridade|a[cç][aã]o\s+social/i, category: "social" },
  { pattern: /congresso|evento|confer|culto/i, category: "events" },
  { pattern: /m[uú]sica|louvor|worship|instrument/i, category: "music" },
  { pattern: /ve[ií]culo|van|bus|transporte/i, category: "vehicles" },
  { pattern: /emerg|urgente|desastre/i, category: "emergency" },
];

export function mapCampaignTypeToCategory(type: string): CampaignImageCategory {
  const normalized = type?.trim() ?? "";
  return TYPE_TO_CATEGORY[normalized] ?? TYPE_TO_CATEGORY[normalized.toLowerCase()] ?? "general";
}

/** Smarter category — title + description keywords override generic type mapping */
export function inferCampaignImageCategory(
  campaign: Pick<Campaign, "title" | "type" | "description">,
): CampaignImageCategory {
  const title = campaign.title?.trim() ?? "";
  const description = campaign.description?.trim() ?? "";
  const combined = `${title} ${description}`;

  if (/capela/i.test(title)) {
    if (/ora[cç]|pray|intercess|vig[ií]lia/i.test(combined)) return "prayer";
    return "construction";
  }

  for (const rule of TITLE_CATEGORY_RULES) {
    if (rule.pattern.test(combined)) return rule.category;
  }
  return mapCampaignTypeToCategory(campaign.type);
}

function resolveCategoryPool(category: CampaignImageCategory): string[] {
  const primary = filterAllowedManifestPool(CAMPAIGN_IMAGE_MANIFEST[category] ?? []);
  if (primary.length > 0) return primary;

  const alias = CATEGORY_POOL_ALIAS[category];
  if (alias) {
    const aliased = filterAllowedManifestPool(CAMPAIGN_IMAGE_MANIFEST[alias] ?? []);
    if (aliased.length > 0) return aliased;
  }

  return filterAllowedManifestPool(CAMPAIGN_IMAGE_MANIFEST.general);
}

/** JPG/PNG/WebP local ou remota — nunca SVG procedural */
export function isRasterCampaignImageUrl(url: string): boolean {
  if (!url?.trim()) return false;
  if (url.endsWith(".svg")) return false;
  if (url.startsWith("/campaigns/")) return true;
  return /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url);
}

/** Simple deterministic hash — stable image pick per campaign */
export function campaignImageSeed(campaign: Pick<Campaign, "id" | "title">): string {
  return campaign.id?.trim() || campaign.title?.trim() || "default";
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function getCategoryImagePoolForCampaign(
  campaign: Pick<Campaign, "title" | "type" | "description">,
): string[] {
  const category = inferCampaignImageCategory(campaign);
  return resolveCategoryPool(category);
}

/** Cover — índice próprio, diferente da galeria */
export function pickCoverManifestImage(type: string, seed: string): string | null {
  return pickCoverManifestImageForCampaign({ title: "", type }, seed);
}

export function pickCoverManifestImageForCampaign(
  campaign: Pick<Campaign, "title" | "type" | "description">,
  seed: string,
): string | null {
  const pool = getCategoryImagePoolForCampaign(campaign);
  return pickFromManifestPool(pool, `${seed}:cover`);
}

export function pickManifestImage(
  category: CampaignImageCategory,
  seed: string,
): string | null {
  const pool = resolveCategoryPool(category);
  return pickFromManifestPool(pool, `${category}:${seed}:cover`);
}

/** Gallery — sequência após a capa, exclui URL da capa, máx. `maxSlots` */
export function getLocalGalleryImages(
  type: string,
  seed: string,
  maxSlots = 6,
  excludeUrl?: string | null,
): string[] {
  return getLocalGalleryImagesForCampaign({ title: "", type }, seed, maxSlots, excludeUrl);
}

export function getLocalGalleryImagesForCampaign(
  campaign: Pick<Campaign, "title" | "type" | "description">,
  seed: string,
  maxSlots = 6,
  excludeUrl?: string | null,
): string[] {
  const pool = getCategoryImagePoolForCampaign(campaign);
  if (pool.length === 0) return [];

  const coverPick = pickFromManifestPool(pool, `${seed}:cover`);
  const coverIndex = coverPick ? pool.indexOf(coverPick) : hashString(`${seed}:cover`) % pool.length;
  const galleryOffset = hashString(`${seed}:gallery`) % pool.length;
  const start = (coverIndex + 1 + galleryOffset) % pool.length;
  const rotated = [...pool.slice(start), ...pool.slice(0, start)];

  const urls: string[] = [];
  for (const url of rotated) {
    if (urls.length >= maxSlots) break;
    if (url === excludeUrl) continue;
    if (!urls.includes(url)) urls.push(url);
  }

  let fill = 0;
  while (urls.length < Math.min(4, maxSlots) && pool.length > 0) {
    const url = pool[fill % pool.length];
    fill++;
    if (url === excludeUrl || urls.includes(url)) continue;
    urls.push(url);
  }

  return urls.slice(0, maxSlots);
}

export function resolveCampaignImage(
  campaign: Pick<Campaign, "id" | "title" | "coverImageUrl" | "type">,
): CampaignImageResult {
  const uploaded = campaign.coverImageUrl?.trim();
  const category = inferCampaignImageCategory(campaign);
  const seed = campaignImageSeed(campaign);

  if (uploaded) {
    return { url: uploaded, source: "upload", category };
  }

  const categoryPhoto = pickCoverManifestImageForCampaign(campaign, seed);
  if (categoryPhoto) {
    return { url: categoryPhoto, source: "library", category };
  }

  if (category !== "general") {
    const generalPhoto = pickCoverManifestImageForCampaign({ ...campaign, type: "general" }, seed);
    if (generalPhoto) {
      return { url: generalPhoto, source: "general", category: "general" };
    }
  }

  return {
    url: CAMPAIGN_SVG_FALLBACK[category] ?? CAMPAIGN_SVG_FALLBACK.general,
    source: "procedural",
    category,
  };
}
