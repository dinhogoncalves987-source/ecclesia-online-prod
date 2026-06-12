/**
 * Validação estática — inferência de imagens para campanhas demo (Fase 2F.8).
 * Run: npx vite-node scripts/validate-campaign-images.mts
 */
import {
  inferCampaignImageCategory,
  pickCoverManifestImageForCampaign,
  resolveCampaignImage,
} from "../src/lib/campaignImages";
import { isBlockedManifestUrl } from "../src/lib/campaignImageCurator";

const CAMPAIGNS = [
  { id: "aaaaaaaa-0000-0000-0000-000000000010", title: "Ganhando Almas", type: "Projeto Ministerial", description: "Evangelismo nas ruas" },
  { id: "aaaaaaaa-0000-0000-0000-000000000003", title: "Missões África", type: "Missões", description: "Equipe em Moçambique" },
  { id: "aaaaaaaa-0000-0000-0000-000000000011", title: "Missões Camboja", type: "Missões", description: "Campo missionário" },
  { id: "aaaaaaaa-0000-0000-0000-000000000004", title: "Ação Social Inverno", type: "Ação Social", description: "Cobertores e cestas" },
  { id: "aaaaaaaa-0000-0000-0000-000000000008", title: "Reforma da Capela de Oração", type: "Reforma", description: "Capela de oração contínua" },
];

let ok = true;
console.log("=== Validação de imagens (curadoria) ===\n");

for (const c of CAMPAIGNS) {
  const category = inferCampaignImageCategory(c);
  const cover = pickCoverManifestImageForCampaign(c, c.id);
  const resolved = resolveCampaignImage(c);
  const blocked = isBlockedManifestUrl(resolved.url);

  const status = blocked ? "FAIL" : "OK";
  if (blocked) ok = false;

  console.log(`${status} | ${c.title}`);
  console.log(`     categoria: ${category}`);
  console.log(`     capa: ${resolved.url} (${resolved.source})`);
  if (blocked) console.log(`     ⚠ URL bloqueada pelo curador`);
  console.log();
}

process.exit(ok ? 0 : 1);
