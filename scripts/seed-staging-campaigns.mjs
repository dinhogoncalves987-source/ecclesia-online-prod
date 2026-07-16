#!/usr/bin/env node
/**
 * Fase 2F.8 — Normaliza e popula campanhas reais no staging (UUIDs fixos).
 *
 * Requer (nunca commitar):
 *   SUPABASE_URL=https://qkiiwopkbcslquyfhdec.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *
 * Usage:
 *   npm run campaigns:seed-staging
 *
 * Idempotente: upsert por id — não apaga campanhas nem campaign_media.
 */

import { createClient } from "@supabase/supabase-js";
import { assertSafeToSeedStagingFromProcessEnv, SeedGuardError } from "./lib/seedGuard.mjs";
import { loadSeedEnv } from "./lib/loadSeedEnv.mjs";

// FASE 5 — fonte única e exclusiva de ambiente para seeds: .env.seed +
// process.env (ver scripts/lib/loadSeedEnv.mjs). Nunca lê .env/.env.local/
// .env.staging, que são arquivos do frontend (Vite).
const seedEnv = loadSeedEnv();

const supabaseUrl = (
  seedEnv.SUPABASE_URL ||
  seedEnv.VITE_SUPABASE_URL ||
  ""
).replace(/\/+$/, "");

const serviceKey = (seedEnv.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!supabaseUrl || !serviceKey) {
  console.error(
    "\n❌ Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.seed.\n" +
      "   Staging: https://qkiiwopkbcslquyfhdec.supabase.co\n" +
      "   Veja .env.seed.example. Exemplo: $env:SUPABASE_SERVICE_ROLE_KEY=\"...\"; npm run campaigns:seed-staging\n",
  );
  process.exit(1);
}

// Guarda de ambiente — recusa produção e exige confirmação explícita.
// Requer: APP_ENV=staging e SEED_STAGING="SEED_STAGING" no ambiente.
try {
  assertSafeToSeedStagingFromProcessEnv({ supabaseUrl, env: seedEnv });
} catch (err) {
  if (err instanceof SeedGuardError) {
    console.error(`\n❌ ${err.message}\n`);
    process.exit(1);
  }
  throw err;
}

const sb = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MATRIZ = "11111111-0000-0000-0000-000000000002";
const CONGR = "11111111-0000-0000-0000-000000000004";

/** @type {Array<Record<string, unknown>>} */
const TARGET_CAMPAIGNS = [
  {
    id: "aaaaaaaa-0000-0000-0000-000000000010",
    organization_id: MATRIZ,
    title: "Ganhando Almas",
    description:
      "Campanha de evangelismo nas ruas, visitas e cultos de salvação. Meta: alcançar famílias da região com o evangelho e integrar novos convertidos à igreja.",
    type: "projeto_ministerial",
    status: "active",
    goal_amount: 5000,
    start_date: "2026-04-01",
    end_date: "2026-10-31",
    visibility: "organization",
    priority: "high",
    allow_replies: true,
    is_featured: true,
    published_at: new Date(Date.now() - 20 * 86400000).toISOString(),
  },
  {
    id: "aaaaaaaa-0000-0000-0000-000000000003",
    organization_id: MATRIZ,
    title: "Missões África",
    description:
      "Envio de equipe missionária e apoio logístico para plantação de igrejas e ação social em Moçambique. Foco em comunidades carentes e formação de líderes locais.",
    type: "missoes",
    status: "active",
    goal_amount: 15000,
    start_date: "2026-02-01",
    end_date: "2026-11-20",
    visibility: "hierarchy",
    priority: "normal",
    allow_replies: true,
    is_featured: false,
    published_at: new Date(Date.now() - 45 * 86400000).toISOString(),
  },
  {
    id: "aaaaaaaa-0000-0000-0000-000000000011",
    organization_id: MATRIZ,
    title: "Missões Camboja",
    description:
      "Projeto missionário no Camboja: tradução de materiais, escola bíblica para jovens e apoio a pastores locais em parceria com igrejas parceiras.",
    type: "missoes",
    status: "active",
    goal_amount: 12000,
    start_date: "2026-03-15",
    end_date: "2026-12-15",
    visibility: "hierarchy",
    priority: "normal",
    allow_replies: false,
    is_featured: false,
    published_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: "aaaaaaaa-0000-0000-0000-000000000004",
    organization_id: CONGR,
    title: "Ação Social Inverno",
    description:
      "Distribuição de cobertores, cestas básicas e kits de higiene para famílias em vulnerabilidade durante o inverno em Caxias do Sul.",
    type: "acao_social",
    status: "closed",
    goal_amount: 8000,
    start_date: "2026-03-01",
    end_date: "2026-06-30",
    visibility: "organization",
    priority: "normal",
    allow_replies: false,
    is_featured: false,
    published_at: new Date(Date.now() - 90 * 86400000).toISOString(),
  },
  {
    id: "aaaaaaaa-0000-0000-0000-000000000008",
    organization_id: CONGR,
    title: "Reforma da Capela de Oração",
    description:
      "Reforma e adequação da capela de oração contínua: climatização, acústica, mobiliário e espaço para vigílias e intercessão da congregação.",
    type: "reform",
    status: "active",
    goal_amount: 20000,
    start_date: "2026-05-01",
    end_date: "2026-12-01",
    visibility: "organization",
    priority: "high",
    allow_replies: true,
    is_featured: true,
    published_at: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
  {
    id: "aaaaaaaa-0000-0000-0000-000000000002",
    organization_id: MATRIZ,
    title: "Construção do Novo Templo",
    description:
      "Obra do novo templo da sede: fundação concluída, fase de alvenaria, cobertura e acabamento interno para ampliar a capacidade da congregação central.",
    type: "construcao",
    status: "active",
    goal_amount: 150000,
    start_date: "2025-06-01",
    end_date: "2027-03-15",
    visibility: "hierarchy",
    priority: "urgent",
    allow_replies: true,
    is_featured: false,
    published_at: new Date(Date.now() - 60 * 86400000).toISOString(),
  },
  {
    id: "aaaaaaaa-0000-0000-0000-000000000006",
    organization_id: MATRIZ,
    title: "Veículo Missionário",
    description:
      "Aquisição de van missionária para transporte de equipes, visitas a congregações do interior e entregas de ação social na região da Serra.",
    type: "veiculos",
    status: "paused",
    goal_amount: 80000,
    start_date: "2026-03-01",
    end_date: "2026-10-15",
    visibility: "hierarchy",
    priority: "normal",
    allow_replies: false,
    is_featured: false,
    published_at: new Date(Date.now() - 25 * 86400000).toISOString(),
  },
  {
    id: "aaaaaaaa-0000-0000-0000-000000000007",
    organization_id: MATRIZ,
    title: "Projeto Crianças para Cristo",
    description:
      "Material didático, lanches e eventos para o ministério infantil: escola dominical, festas missionárias e acampamento de crianças.",
    type: "projeto_ministerial",
    status: "active",
    goal_amount: 6000,
    start_date: "2026-04-15",
    end_date: "2026-08-30",
    visibility: "organization",
    priority: "normal",
    allow_replies: true,
    is_featured: false,
    published_at: new Date(Date.now() - 18 * 86400000).toISOString(),
  },
  {
    id: "aaaaaaaa-0000-0000-0000-000000000005",
    organization_id: MATRIZ,
    title: "Conferência de Jovens 2026",
    description:
      "Realização da Conferência de Jovens 2026 com palestras, workshops, louvor e mobilização dos ministérios de jovens da região.",
    type: "congresso",
    status: "active",
    goal_amount: 10000,
    start_date: "2026-04-01",
    end_date: "2026-08-10",
    visibility: "organization",
    priority: "normal",
    allow_replies: true,
    is_featured: false,
    published_at: new Date(Date.now() - 20 * 86400000).toISOString(),
  },
  {
    id: "aaaaaaaa-0000-0000-0000-000000000009",
    organization_id: MATRIZ,
    title: "Escola Bíblica Comunitária",
    description:
      "Projeto de estudo bíblico comunitário: apostilas, biblias de estudo e encontros semanais abertos à vizinhança e novos convertidos.",
    type: "projeto_ministerial",
    status: "draft",
    goal_amount: 7000,
    start_date: "2026-06-01",
    end_date: "2026-11-30",
    visibility: "organization",
    priority: "low",
    allow_replies: false,
    is_featured: false,
    published_at: null,
  },
  {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    organization_id: MATRIZ,
    title: "Reforma do Templo Central",
    description:
      "Revitalização do templo da sede: pintura externa, adequação elétrica, acessibilidade e salas de EBD. Campanha anterior encerrada.",
    type: "reform",
    status: "closed",
    goal_amount: 180000,
    start_date: "2026-01-15",
    end_date: "2026-09-30",
    visibility: "organization",
    priority: "normal",
    allow_replies: false,
    is_featured: false,
    published_at: new Date(Date.now() - 120 * 86400000).toISOString(),
  },
];

/** @type {Array<Record<string, unknown>>} */
const TARGET_UPDATES = [
  {
    id: "dddddddd-0000-0000-0000-000000000001",
    campaign_id: "aaaaaaaa-0000-0000-0000-000000000010",
    organization_id: MATRIZ,
    title: "Primeira semana de evangelismo concluída",
    content: "Equipe realizou 12 visitas e três cultos de salvação na região central.",
    update_type: "progress",
    created_at: "2026-05-20T10:00:00+00",
  },
  {
    id: "dddddddd-0000-0000-0000-000000000002",
    campaign_id: "aaaaaaaa-0000-0000-0000-000000000003",
    organization_id: MATRIZ,
    title: "Equipe chegou ao campo missionário",
    content: "Missionários desembarcaram em Maputo e iniciaram o primeiro ciclo de visitas às comunidades.",
    update_type: "progress",
    created_at: "2026-05-22T14:30:00+00",
  },
  {
    id: "dddddddd-0000-0000-0000-000000000003",
    campaign_id: "aaaaaaaa-0000-0000-0000-000000000011",
    organization_id: MATRIZ,
    title: "Compra de materiais concluída",
    content: "Apostilas e Bíblias em khmer foram adquiridas para a escola bíblica local.",
    update_type: "progress",
    created_at: "2026-05-23T09:15:00+00",
  },
  {
    id: "dddddddd-0000-0000-0000-000000000004",
    campaign_id: "aaaaaaaa-0000-0000-0000-000000000002",
    organization_id: MATRIZ,
    title: "Primeira etapa finalizada",
    content: "Alvenaria do térreo concluída. Próxima fase: estrutura metálica da cobertura.",
    update_type: "progress",
    created_at: "2026-05-18T11:00:00+00",
  },
  {
    id: "dddddddd-0000-0000-0000-000000000005",
    campaign_id: "aaaaaaaa-0000-0000-0000-000000000008",
    organization_id: CONGR,
    title: "Culto inaugural realizado",
    content: "Capela de oração reinaugurada com vigília de intercessão e consagração do espaço.",
    update_type: "achievement",
    created_at: "2026-05-24T19:00:00+00",
  },
  {
    id: "dddddddd-0000-0000-0000-000000000006",
    campaign_id: "aaaaaaaa-0000-0000-0000-000000000004",
    organization_id: CONGR,
    title: "Prestação de contas publicada",
    content: "Relatório de entrega de cobertores e cestas básicas disponível para a congregação.",
    update_type: "accountability",
    created_at: "2026-05-20T16:45:00+00",
  },
  {
    id: "dddddddd-0000-0000-0000-000000000007",
    campaign_id: "aaaaaaaa-0000-0000-0000-000000000005",
    organization_id: MATRIZ,
    title: "Inscrições abertas",
    content: "Conferência de Jovens 2026 — inscrições pelo ministério de jovens da matriz.",
    update_type: "announcement",
    created_at: "2026-05-15T11:00:00+00",
  },
];

async function diagnose() {
  const { data: campaigns, error } = await sb
    .from("campaigns")
    .select("id, title, type, status, goal_amount, is_featured, organization_id")
    .order("created_at");

  if (error) throw new Error(`diagnose campaigns: ${error.message}`);

  const { data: media } = await sb
    .from("campaign_media")
    .select("campaign_id, media_type, title, storage_path");

  const mediaByCampaign = new Map();
  for (const m of media ?? []) {
    const list = mediaByCampaign.get(m.campaign_id) ?? [];
    list.push(m);
    mediaByCampaign.set(m.campaign_id, list);
  }

  console.log("\n--- ETAPA 1 — Diagnóstico ---");
  console.log(`Campanhas existentes: ${campaigns?.length ?? 0}`);
  const types = new Set();
  const statuses = new Set();
  for (const c of campaigns ?? []) {
    types.add(c.type);
    statuses.add(c.status);
    const uploads = mediaByCampaign.get(c.id)?.length ?? 0;
    console.log(
      `  • ${c.title} | ${c.type} | ${c.status} | featured=${c.is_featured}${uploads ? ` | ${uploads} upload(s)` : ""}`,
    );
  }
  console.log(`Categorias em uso: ${[...types].join(", ") || "(nenhuma)"}`);
  console.log(`Status em uso: ${[...statuses].join(", ") || "(nenhum)"}`);
  console.log(`Uploads reais (campaign_media): ${media?.length ?? 0}`);

  return { campaigns: campaigns ?? [], mediaByCampaign };
}

async function ensureOrganizations() {
  const { data, error } = await sb
    .from("organizations")
    .select("id, name")
    .in("id", [MATRIZ, CONGR]);
  if (error) throw new Error(`organizations: ${error.message}`);
  if ((data?.length ?? 0) < 2) {
    throw new Error(
      "Organizações demo não encontradas (matriz/congregação). Aplique migrations de demo antes do seed.",
    );
  }
}

async function upsertCampaigns() {
  let created = 0;
  let updated = 0;

  for (const row of TARGET_CAMPAIGNS) {
    const { id, ...fields } = row;
    const { data: existing } = await sb.from("campaigns").select("id, title").eq("id", id).maybeSingle();

    if (existing) {
      const { error } = await sb.from("campaigns").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(`update ${row.title}: ${error.message}`);
      updated++;
    } else {
      const { error } = await sb.from("campaigns").insert({ id, ...fields });
      if (error) throw new Error(`insert ${row.title}: ${error.message}`);
      created++;
    }
  }

  return { created, updated };
}

async function fixFeaturedPerOrg() {
  for (const orgId of [MATRIZ, CONGR]) {
    await sb.from("campaigns").update({ is_featured: false }).eq("organization_id", orgId).eq("is_featured", true);

    const featured = TARGET_CAMPAIGNS.find((c) => c.organization_id === orgId && c.is_featured);
    if (featured) {
      const { error } = await sb
        .from("campaigns")
        .update({ is_featured: true, updated_at: new Date().toISOString() })
        .eq("id", featured.id)
        .eq("organization_id", orgId);
      if (error) throw new Error(`featured ${orgId}: ${error.message}`);
    }
  }
}

async function upsertUpdates() {
  let inserted = 0;
  for (const row of TARGET_UPDATES) {
    const { data: existing } = await sb.from("campaign_updates").select("id").eq("id", row.id).maybeSingle();
    if (existing) continue;
    const { error } = await sb.from("campaign_updates").insert(row);
    if (error) throw new Error(`update ${row.title}: ${error.message}`);
    inserted++;
  }
  return inserted;
}

async function finalReport() {
  const { data } = await sb
    .from("campaigns")
    .select("id, title, type, status, is_featured, organization_id")
    .order("title");

  const featured = (data ?? []).filter((c) => c.is_featured);
  const { count: updateCount } = await sb
    .from("campaign_updates")
    .select("id", { count: "exact", head: true });

  console.log("\n--- Resultado final ---");
  console.log(`Total campanhas: ${data?.length ?? 0}`);
  console.log(`Destaques: ${featured.map((c) => `${c.title} (${c.organization_id.slice(0, 8)}…)`).join(", ")}`);
  console.log(`Timeline (campaign_updates): ${updateCount ?? 0} registros`);
  console.log("\nCampanhas:");
  for (const c of data ?? []) {
    console.log(`  ${c.status.padEnd(7)} | ${c.type.padEnd(20)} | ${c.title}`);
  }
}

async function main() {
  console.log("Seed staging — campanhas reais (Fase 2F.8)");
  console.log(`URL: ${supabaseUrl}\n`);

  await ensureOrganizations();
  const before = await diagnose();
  const preserved = [...before.mediaByCampaign.entries()].filter(([, v]) => v.length > 0);
  if (preserved.length) {
    console.log("\nUploads preservados (campaign_media não alterado):");
    for (const [id, items] of preserved) {
      const title = before.campaigns.find((c) => c.id === id)?.title ?? id;
      console.log(`  • ${title}: ${items.length} arquivo(s)`);
    }
  }

  const { created, updated } = await upsertCampaigns();
  await fixFeaturedPerOrg();
  const updatesInserted = await upsertUpdates();

  console.log("\n--- ETAPA 2–5 — Aplicado ---");
  console.log(`Campanhas criadas: ${created}`);
  console.log(`Campanhas normalizadas: ${updated}`);
  console.log(`Novos updates de timeline: ${updatesInserted}`);

  await finalReport();
  console.log("\n✓ Seed concluído.\n");
}

main().catch((err) => {
  console.error("\n❌", err.message || err);
  process.exit(1);
});
