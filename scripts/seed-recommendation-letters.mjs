#!/usr/bin/env node
/**
 * Seed demo: recommendation_letters — 5 cartas de exemplo no staging.
 *
 * Requer (nunca commitar):
 *   SUPABASE_URL=https://qkiiwopkbcslquyfhdec.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_SERVICE_ROLE_KEY="..."; npm run letters:seed-staging
 *
 * Idempotente: upsert por id fixo — não apaga dados existentes.
 */

import { createClient } from "@supabase/supabase-js";
import { assertSafeToSeedStagingFromProcessEnv, SeedGuardError } from "./lib/seedGuard.mjs";
import { loadSeedEnv } from "./lib/loadSeedEnv.mjs";

// FASE 5 — fonte única e exclusiva de ambiente para seeds: .env.seed +
// process.env (ver scripts/lib/loadSeedEnv.mjs). Nunca lê .env/.env.local/
// .env.staging, que são arquivos do frontend (Vite).
const seedEnv = loadSeedEnv();

const supabaseUrl = (
  seedEnv.SUPABASE_URL   ||
  seedEnv.VITE_SUPABASE_URL   ||
  ""
).replace(/\/+$/, "");

const serviceKey = (seedEnv.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!supabaseUrl || !serviceKey) {
  console.error(
    "\n❌ Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.seed.\n" +
    "   Staging: https://qkiiwopkbcslquyfhdec.supabase.co\n" +
    "   Veja .env.seed.example. PowerShell: $env:SUPABASE_SERVICE_ROLE_KEY='...'; npm run letters:seed-staging\n",
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
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Config ────────────────────────────────────────────────────────────────────

const ORG_ID = "11111111-0000-0000-0000-000000000002"; // demo matriz

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function log(msg) { console.log(`[letters-seed] ${msg}`); }
function err(msg) { console.error(`[letters-seed] ❌ ${msg}`); }

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log(`Conectando a ${supabaseUrl} …`);

  // Fetch org name
  const { data: org, error: orgErr } = await sb
    .from("organizations")
    .select("id, name")
    .eq("id", ORG_ID)
    .maybeSingle();

  if (orgErr || !org) {
    err(`Organização demo não encontrada (id: ${ORG_ID}). Verifique o staging.`);
    process.exit(1);
  }
  log(`Organização: ${org.name}`);

  const letters = [
    {
      id:                   "cccccccc-0000-0000-0000-000000000001",
      organization_id:      ORG_ID,
      member_id:            null,
      member_name:          "João Carlos Ferreira",
      member_email:         "joao.ferreira@exemplo.com",
      origin_church_name:   org.name,
      destination_church:   "Assembleia de Deus — Central",
      destination_city:     "Porto Alegre",
      destination_state:    "RS",
      reason:               "Mudança de residência por novo emprego",
      observations:         "Membro se mudará para Porto Alegre em função de nova oportunidade profissional.",
      status:               "requested",
      requested_at:         daysAgo(5),
      reviewed_at:          null,
      approved_at:          null,
    },
    {
      id:                   "cccccccc-0000-0000-0000-000000000002",
      organization_id:      ORG_ID,
      member_id:            null,
      member_name:          "Maria Aparecida Santos",
      member_email:         "maria.santos@exemplo.com",
      origin_church_name:   org.name,
      destination_church:   "Primeira Igreja Batista de São Paulo",
      destination_city:     "São Paulo",
      destination_state:    "SP",
      reason:               "Transferência familiar",
      observations:         "Família transferida para São Paulo. Solicita carta para apresentação à nova congregação.",
      status:               "requested",
      requested_at:         daysAgo(3),
      reviewed_at:          null,
      approved_at:          null,
    },
    {
      id:                   "cccccccc-0000-0000-0000-000000000003",
      organization_id:      ORG_ID,
      member_id:            null,
      member_name:          "Paulo Roberto Almeida",
      member_email:         "paulo.almeida@exemplo.com",
      origin_church_name:   org.name,
      destination_church:   "Igreja Evangélica Quadrangular",
      destination_city:     "Curitiba",
      destination_state:    "PR",
      reason:               "Visita missionária",
      observations:         "Viagem missionária de 60 dias. Necessita de carta de apresentação para comunhão local.",
      status:               "under_review",
      requested_at:         daysAgo(10),
      reviewed_at:          daysAgo(7),
      approved_at:          null,
    },
    {
      id:                   "cccccccc-0000-0000-0000-000000000004",
      organization_id:      ORG_ID,
      member_id:            null,
      member_name:          "Ana Beatriz Oliveira",
      member_email:         "ana.oliveira@exemplo.com",
      origin_church_name:   org.name,
      destination_church:   "Igreja Presbiteriana de Florianópolis",
      destination_city:     "Florianópolis",
      destination_state:    "SC",
      reason:               "Transferência para fins de estudo",
      observations:         "Membro ingressou em universidade federal e solicita carta de apresentação à congregação local.",
      status:               "approved",
      requested_at:         daysAgo(15),
      reviewed_at:          daysAgo(12),
      approved_at:          daysAgo(10),
    },
    {
      id:                   "cccccccc-0000-0000-0000-000000000005",
      organization_id:      ORG_ID,
      member_id:            null,
      member_name:          "Carlos Eduardo Lima",
      member_email:         "carlos.lima@exemplo.com",
      origin_church_name:   org.name,
      destination_church:   "Igreja Evangélica de Goiânia",
      destination_city:     "Goiânia",
      destination_state:    "GO",
      reason:               "Apresentação durante viagem de negócios",
      observations:         "Secretaria optou por não emitir carta nesta ocasião.",
      status:               "rejected",
      requested_at:         daysAgo(20),
      reviewed_at:          daysAgo(18),
      approved_at:          null,
    },
  ];

  let ok = 0;

  for (const letter of letters) {
    const { error } = await sb
      .from("recommendation_letters")
      .upsert(letter, { onConflict: "id", ignoreDuplicates: true });

    if (error) {
      err(`Falha ao processar ${letter.member_name}: ${error.message}`);
    } else {
      log(`✓ ${letter.member_name} (${letter.status})`);
      ok++;
    }
  }

  log(`\nConcluído — ${ok}/${letters.length} processadas (duplicatas ignoradas).`);
  log(`Acesse /admin/cartas-recomendacao para ver o resultado.`);
}

main().catch((e) => { err(e.message ?? e); process.exit(1); });
