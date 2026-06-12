#!/usr/bin/env node
/**
 * Upload local public/campaigns/* images to Supabase Storage bucket campaign-library.
 *
 * Requires (never commit these keys):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/upload-campaign-library-to-storage.mjs
 *
 * Idempotent: skips objects that already exist in the bucket.
 * Does NOT run automatically — execute manually after migrations are applied.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const LOCAL_ROOT = path.join(ROOT, "public", "campaigns");
const BUCKET = "campaign-library";

const CATEGORIES = [
  "social",
  "missions",
  "construction",
  "reform",
  "events",
  "youth",
  "music",
  "vehicles",
  "emergency",
  "general",
];

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".svg"]);

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

async function listExisting(supabaseUrl, serviceKey) {
  const res = await fetch(`${supabaseUrl}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefix: "", limit: 1000 }),
  });
  if (!res.ok) return new Set();
  const data = await res.json();
  const names = new Set();
  for (const item of data ?? []) {
    if (item?.name) names.add(item.name);
  }
  return names;
}

async function uploadFile(supabaseUrl, serviceKey, storagePath, buffer, contentType) {
  const res = await fetch(
    `${supabaseUrl}/storage/v1/object/${BUCKET}/${storagePath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": contentType,
        "x-upsert": "false",
      },
      body: buffer,
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${storagePath}: ${res.status} ${text}`);
  }
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceKey) {
    console.error(
      "\n❌ Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (somente ambiente local/CI).\n" +
        "Este script usa service role e NÃO deve rodar no frontend.\n",
    );
    process.exit(1);
  }

  console.log(`Uploading local library → bucket "${BUCKET}"\n`);
  const existing = await listExisting(supabaseUrl, serviceKey);

  let uploaded = 0;
  let skipped = 0;

  for (const category of CATEGORIES) {
    const dir = path.join(LOCAL_ROOT, category);
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()));
    for (const file of files) {
      const storagePath = `${category}/${file}`;
      if (existing.has(storagePath)) {
        console.log(`  skip: ${storagePath}`);
        skipped++;
        continue;
      }
      const buffer = fs.readFileSync(path.join(dir, file));
      console.log(`  upload: ${storagePath}`);
      await uploadFile(supabaseUrl, serviceKey, storagePath, buffer, mimeFor(file));
      uploaded++;
    }
  }

  console.log(`\n✓ Done — ${uploaded} uploaded, ${skipped} skipped.\n`);
}

main().catch((err) => {
  console.error("\n❌", err.message || err);
  process.exit(1);
});
