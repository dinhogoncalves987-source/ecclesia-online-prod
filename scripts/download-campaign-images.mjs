#!/usr/bin/env node
/**
 * Downloads royalty-free campaign cover photos from Pixabay into public/campaigns/.
 *
 * Requires: PIXABAY_API_KEY environment variable (never commit the key).
 * Usage:    npm run campaigns:images
 *
 * Target: 15 photos × 17 categories ≈ 255 images (expandable via IMAGES_PER_CATEGORY).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PUBLIC_CAMPAIGNS = path.join(ROOT, "public", "campaigns");
const MANIFEST_PATH = path.join(ROOT, "src", "lib", "campaignImageManifest.ts");

const IMAGES_PER_CATEGORY = 15;
const PER_PAGE = 30;
const API_DELAY_MS = 1500;

/** @type {Record<string, string[]>} */
const CATEGORIES = {
  evangelism: [
    "christian evangelism",
    "street evangelism",
    "gospel outreach",
    "people praying church",
    "bible study group",
    "church ministry outreach",
  ],
  missions: [
    "mission trip church",
    "church missions team",
    "community ministry church",
    "humanitarian church aid",
    "missionary work church",
    "church mission field",
  ],
  social: [
    "charity volunteers food donation",
    "winter donation blankets",
    "community help church",
    "social action community",
  ],
  construction: [
    "church construction",
    "building construction workers",
    "bricks construction",
    "construction site building",
  ],
  reform: [
    "renovation tools",
    "repair construction",
    "painting renovation church",
    "building renovation",
  ],
  events: [
    "church event",
    "conference audience",
    "auditorium people worship",
    "christian conference",
  ],
  youth: [
    "christian youth",
    "youth worship",
    "church youth group",
    "young people church event",
  ],
  music: [
    "worship music",
    "musical instruments church",
    "choir music worship",
    "church worship band",
  ],
  children: [
    "children ministry church",
    "sunday school children",
    "kids church activity",
    "children bible story",
  ],
  women: [
    "women church group",
    "women ministry fellowship",
    "women praying together",
  ],
  men: [
    "men church group",
    "men fellowship bible",
    "men ministry church",
  ],
  prayer: [
    "prayer meeting",
    "people praying church",
    "church prayer hands",
    "prayer group worship",
  ],
  bible: [
    "bible study",
    "open bible church",
    "scripture reading group",
    "bible teaching church",
  ],
  vehicles: [
    "church van",
    "bus transport community",
    "ministry vehicle",
    "van transport mission",
  ],
  emergency: [
    "emergency help",
    "disaster relief volunteers",
    "helping hands community",
    "humanitarian aid church",
  ],
  general: [
    "church community",
    "people helping community",
    "community project church",
    "congregation worship",
  ],
};

const CATEGORY_KEYS = Object.keys(CATEGORIES);

/** Keep in sync with src/lib/campaignImageCurator.ts */
const TAG_BLACKLIST = [
  "rocket", "nasa", "space", "wildlife", "safari", "ostrich", "animal", "zoo",
  "luxury", "fashion", "model", "laptop", "notebook", "office", "business",
  "corporate", "coffee", "fireplace", "vacation", "resort", "technology",
  "startup", "tourist", "tourism", "hotel", "spa", "yacht", "airplane", "aircraft",
];

/** @type {Record<string, string[]>} */
const CATEGORY_WHITELIST = {
  evangelism: ["church", "pray", "prayer", "bible", "gospel", "worship", "christian", "ministry", "outreach"],
  missions: ["church", "mission", "ministry", "community", "humanitarian", "christian", "help", "volunteer"],
  social: ["charity", "donation", "food", "help", "community", "volunteer", "church", "poor", "blanket"],
  construction: ["construction", "building", "church", "renovation", "brick", "worker", "site"],
  reform: ["renovation", "repair", "construction", "church", "building", "paint", "tool"],
  prayer: ["prayer", "pray", "church", "worship", "hands", "bible", "faith"],
  bible: ["bible", "scripture", "church", "study", "book", "christian", "read"],
  youth: ["youth", "church", "young", "worship", "group", "christian", "teen"],
  events: ["church", "conference", "worship", "audience", "congregation", "event", "christian"],
};

function hitCuratorText(hit) {
  return `${hit.tags || ""} ${hit.user || ""}`.toLowerCase();
}

function isBlockedHit(hit) {
  const text = hitCuratorText(hit);
  return TAG_BLACKLIST.some((term) => text.includes(term));
}

function matchesWhitelist(category, hit) {
  const terms = CATEGORY_WHITELIST[category];
  if (!terms?.length) return true;
  const text = hitCuratorText(hit);
  return terms.some((term) => text.includes(term));
}

function isApprovedHit(category, hit) {
  return !isBlockedHit(hit) && matchesWhitelist(category, hit);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function scoreHit(hit) {
  const w = hit.imageWidth || 1;
  const h = hit.imageHeight || 1;
  const ratio = w / h;
  const horizontalBonus = ratio >= 1.2 ? ratio : ratio * 0.5;
  const popularity = Math.log10((hit.views || 0) + (hit.downloads || 0) + 10);
  return horizontalBonus * popularity;
}

async function searchPixabay(apiKey, query) {
  const params = new URLSearchParams({
    key: apiKey,
    q: query,
    image_type: "photo",
    orientation: "horizontal",
    safesearch: "true",
    per_page: String(PER_PAGE),
  });

  const url = `https://pixabay.com/api/?${params.toString()}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Pixabay API error ${res.status} for query "${query}"`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(`Pixabay API: ${data.error}`);
  }

  return (data.hits || []).slice().sort((a, b) => scoreHit(b) - scoreHit(a));
}

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed ${res.status}: ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
}

function existingImagePaths(category) {
  const dir = path.join(PUBLIC_CAMPAIGNS, category);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^[a-z]+-\d+\.(jpg|jpeg|png|webp)$/i.test(f))
    .sort()
    .map((f) => `/campaigns/${category}/${f}`);
}

function countExistingSlots(category) {
  const dir = path.join(PUBLIC_CAMPAIGNS, category);
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (let i = 1; i <= IMAGES_PER_CATEGORY; i++) {
    const base = path.join(dir, `${category}-${pad2(i)}`);
    if (
      fs.existsSync(`${base}.jpg`) ||
      fs.existsSync(`${base}.jpeg`) ||
      fs.existsSync(`${base}.png`) ||
      fs.existsSync(`${base}.webp`)
    ) {
      count++;
    }
  }
  return count;
}

function nextFreeSlot(category) {
  for (let i = 1; i <= IMAGES_PER_CATEGORY; i++) {
    const base = path.join(PUBLIC_CAMPAIGNS, category, `${category}-${pad2(i)}`);
    if (
      !fs.existsSync(`${base}.jpg`) &&
      !fs.existsSync(`${base}.jpeg`) &&
      !fs.existsSync(`${base}.png`) &&
      !fs.existsSync(`${base}.webp`)
    ) {
      return i;
    }
  }
  return null;
}

async function collectCandidates(apiKey, category, queries) {
  const seen = new Set();
  /** @type {Array<{ id: number, url: string, score: number }>} */
  const candidates = [];
  let blocked = 0;

  for (const query of queries) {
    console.log(`  search: "${query}"`);
    const hits = await searchPixabay(apiKey, query);

    for (const hit of hits) {
      if (seen.has(hit.id)) continue;
      seen.add(hit.id);
      if (!isApprovedHit(category, hit)) {
        blocked++;
        continue;
      }
      const url = hit.largeImageURL || hit.webformatURL;
      if (!url) continue;
      candidates.push({ id: hit.id, url, score: scoreHit(hit) });
    }

    await sleep(API_DELAY_MS);
  }

  if (blocked > 0) {
    console.log(`  filtered ${blocked} off-topic result(s)`);
  }

  return candidates.sort((a, b) => b.score - a.score);
}

async function downloadCategory(apiKey, category, queries) {
  const dir = path.join(PUBLIC_CAMPAIGNS, category);
  fs.mkdirSync(dir, { recursive: true });

  const already = countExistingSlots(category);
  if (already >= IMAGES_PER_CATEGORY) {
    console.log(`[${category}] ${already}/${IMAGES_PER_CATEGORY} already present — skipping downloads`);
    return already;
  }

  console.log(`[${category}] ${already}/${IMAGES_PER_CATEGORY} present — fetching more…`);
  const candidates = await collectCandidates(apiKey, category, queries);

  let downloaded = 0;
  for (const candidate of candidates) {
    if (countExistingSlots(category) >= IMAGES_PER_CATEGORY) break;

    const slot = nextFreeSlot(category);
    if (!slot) break;

    const filename = `${category}-${pad2(slot)}.jpg`;
    const destPath = path.join(dir, filename);

    if (fs.existsSync(destPath)) {
      console.log(`  skip (exists): ${filename}`);
      continue;
    }

    try {
      console.log(`  download: ${filename} (pixabay #${candidate.id})`);
      await downloadFile(candidate.url, destPath);
      downloaded++;
      await sleep(400);
    } catch (err) {
      console.warn(`  failed ${filename}: ${err.message}`);
    }
  }

  const total = countExistingSlots(category);
  console.log(`[${category}] done — ${total}/${IMAGES_PER_CATEGORY} (${downloaded} new)\n`);
  return total;
}

function writeManifest() {
  /** @type {Record<string, string[]>} */
  const manifest = {};

  for (const category of CATEGORY_KEYS) {
    manifest[category] = existingImagePaths(category);
  }

  const typeUnion = CATEGORY_KEYS.map((c) => `  | "${c}"`).join("\n");

  const content = `/**
 * Local campaign photo manifest — paths under public/campaigns/.
 * Auto-generated by scripts/download-campaign-images.mjs
 * Re-run: npm run campaigns:images
 */

export type CampaignImageCategory =
${typeUnion};

export const CAMPAIGN_IMAGE_MANIFEST: Record<CampaignImageCategory, readonly string[]> = ${JSON.stringify(manifest, null, 2)} as const;
`;

  fs.writeFileSync(MANIFEST_PATH, content, "utf8");
  console.log(`Manifest written: ${path.relative(ROOT, MANIFEST_PATH)}`);
}

async function main() {
  const apiKey = process.env.PIXABAY_API_KEY?.trim();

  if (!apiKey) {
    console.error(
      "\n❌ PIXABAY_API_KEY não definida.\n\n" +
        "Defina a variável de ambiente antes de executar:\n\n" +
        "  Windows (PowerShell):  $env:PIXABAY_API_KEY=\"sua-chave\"\n" +
        "  Linux/macOS:           export PIXABAY_API_KEY=\"sua-chave\"\n\n" +
        "Obtenha uma chave gratuita em: https://pixabay.com/api/docs/\n",
    );
    process.exit(1);
  }

  console.log("Pixabay campaign image downloader");
  console.log(`Target: ${path.relative(ROOT, PUBLIC_CAMPAIGNS)}`);
  console.log(`${IMAGES_PER_CATEGORY} photos per category · ${CATEGORY_KEYS.length} categories\n`);

  fs.mkdirSync(PUBLIC_CAMPAIGNS, { recursive: true });

  /** @type {Record<string, number>} */
  const summary = {};

  for (const category of CATEGORY_KEYS) {
    summary[category] = await downloadCategory(apiKey, category, CATEGORIES[category]);
  }

  writeManifest();

  console.log("\n--- Summary ---");
  let total = 0;
  for (const category of CATEGORY_KEYS) {
    console.log(`  ${category}: ${summary[category]}/${IMAGES_PER_CATEGORY}`);
    total += summary[category];
  }
  console.log(`  TOTAL: ${total} images`);
  console.log("\n✓ Done. Run npm run build to validate.\n");
}

main().catch((err) => {
  console.error("\n❌", err.message || err);
  process.exit(1);
});
