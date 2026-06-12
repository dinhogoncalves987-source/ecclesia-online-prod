import type { CampaignImageCategory } from "@/lib/campaignImageManifest";



/** Termos que indicam foto inadequada para campanhas de igreja */

export const TAG_BLACKLIST = [

  "rocket",

  "nasa",

  "spacex",

  "space",

  "spaceship",

  "wildlife",

  "safari",

  "ostrich",

  "bird",

  "zoo",

  "animal",

  "luxury",

  "fashion",

  "model",

  "laptop",

  "notebook",

  "computer",

  "desk",

  "office",

  "business",

  "corporate",

  "executive",

  "meeting",

  "coffee",

  "fireplace",

  "vacation",

  "resort",

  "technology",

  "startup",

  "tourist",

  "tourism",

  "hotel",

  "spa",

  "yacht",

  "airplane",

  "aircraft",

  "woman",

  "businesswoman",

  "typing",

  "keyboard",

  "screen",

  "monitor",

] as const;



/** Pelo menos um termo ministerial deve aparecer nas tags (download Pixabay) */

export const CATEGORY_WHITELIST: Partial<Record<CampaignImageCategory, readonly string[]>> = {

  evangelism: ["church", "pray", "prayer", "bible", "gospel", "worship", "christian", "ministry", "outreach", "people", "hands"],

  missions: ["church", "mission", "ministry", "community", "humanitarian", "christian", "help", "volunteer", "field"],

  social: ["charity", "donation", "food", "help", "community", "volunteer", "church", "poor", "blanket", "meal"],

  construction: ["construction", "building", "church", "renovation", "brick", "worker", "site", "temple", "obra"],

  reform: ["renovation", "repair", "construction", "church", "building", "paint", "tool", "reform"],

  prayer: ["prayer", "pray", "church", "worship", "hands", "bible", "faith", "kneel"],

  bible: ["bible", "scripture", "church", "study", "book", "christian", "read"],

  youth: ["youth", "church", "young", "worship", "group", "christian", "teen"],

  events: ["church", "conference", "worship", "audience", "congregation", "event", "christian"],

  music: ["worship", "music", "church", "choir", "instrument", "guitar", "piano", "louvor"],

  vehicles: ["van", "bus", "church", "transport", "vehicle", "ministry", "mission"],

  children: ["children", "church", "kids", "sunday", "school", "ministry"],

};



/** Caminhos locais bloqueados — imagens inadequadas já baixadas (não apaga arquivo) */

export const BLOCKLIST_MANIFEST_PATHS = new Set<string>([

  "/campaigns/evangelism/evangelism-03.jpg",

  "/campaigns/evangelism/evangelism-07.jpg",

  "/campaigns/evangelism/evangelism-11.jpg",

  "/campaigns/missions/missions-03.jpg",

  "/campaigns/missions/missions-08.jpg",

  "/campaigns/missions/missions-12.jpg",

  "/campaigns/general/general-05.jpg",

  "/campaigns/general/general-09.jpg",

]);



export function curatorTextFromHit(hit: { tags?: string; user?: string }): string {

  return `${hit.tags ?? ""} ${hit.user ?? ""}`.toLowerCase();

}



export function isBlockedCuratorText(text: string): boolean {

  const normalized = text.toLowerCase();

  return TAG_BLACKLIST.some((term) => normalized.includes(term));

}



export function matchesCategoryWhitelist(category: string, text: string): boolean {

  const terms = CATEGORY_WHITELIST[category as CampaignImageCategory];

  if (!terms?.length) return true;

  const normalized = text.toLowerCase();

  return terms.some((term) => normalized.includes(term));

}



export function isApprovedPixabayHit(

  category: string,

  hit: { tags?: string; user?: string },

): boolean {

  const text = curatorTextFromHit(hit);

  if (isBlockedCuratorText(text)) return false;

  return matchesCategoryWhitelist(category, text);

}



export function isBlockedManifestUrl(url: string): boolean {

  if (!url) return true;

  if (BLOCKLIST_MANIFEST_PATHS.has(url)) return true;

  const lower = url.toLowerCase();

  return TAG_BLACKLIST.some((term) => lower.includes(term));

}



export function filterAllowedManifestPool(pool: readonly string[]): string[] {

  return pool.filter((url) => !isBlockedManifestUrl(url));

}



function hashString(value: string): number {

  let hash = 0;

  for (let i = 0; i < value.length; i++) {

    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;

  }

  return hash;

}



/** Escolhe URL do pool permitido; tenta alternativas se a principal estiver bloqueada */

export function pickFromManifestPool(pool: readonly string[], seed: string): string | null {

  const allowed = filterAllowedManifestPool(pool);

  if (allowed.length === 0) return null;

  const start = hashString(seed) % allowed.length;

  for (let i = 0; i < allowed.length; i++) {

    const url = allowed[(start + i) % allowed.length];

    if (url) return url;

  }

  return allowed[0] ?? null;

}

