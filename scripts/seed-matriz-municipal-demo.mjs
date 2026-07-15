/**
 * Seed Demo — Matriz Municipal Caxias do Sul
 * ============================================================
 * MÉTODO RECOMENDADO: npm run demo:seed-matriz
 *
 * Org alvo : 10000000-0000-0000-0000-000000000002
 * NÃO usa  : 11111111-0000-0000-0000-000000000002
 *
 * Funcionalidades:
 *   - Conta registros ANTES e DEPOIS de cada tabela
 *   - Reporta quantos registros novos foram inseridos
 *   - Falha com código 1 se dados críticos não forem inseridos
 *   - Cada seção tem tratamento de erro independente
 *
 * Uso:
 *   npm run demo:seed-matriz
 *   # ou diretamente:
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/seed-matriz-municipal-demo.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { assertSafeToSeedStagingFromProcessEnv, SeedGuardError } from "./lib/seedGuard.mjs";
import { loadSeedEnv } from "./lib/loadSeedEnv.mjs";

// FASE 5 — fonte única e exclusiva de ambiente para seeds: .env.seed +
// process.env (ver scripts/lib/loadSeedEnv.mjs). Nunca lê .env/.env.local/
// .env.staging, que são arquivos do frontend (Vite).
const seedEnv = loadSeedEnv();

// --- URL: aceita SUPABASE_URL ou VITE_SUPABASE_URL ---
const SUPABASE_URL = (
  seedEnv.SUPABASE_URL ||
  seedEnv.VITE_SUPABASE_URL ||
  ""
).replace(/\/+$/, "");

// --- Key: deve ser a Service Role Key (bypassa RLS) ---
// Obtenha em: Supabase Dashboard → Settings → API → service_role secret
// Configure em .env.seed (ver .env.seed.example) ou exporte no shell.
const SERVICE_ROLE = (seedEnv.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("");
  console.error("❌  SEED ABORTADO — configuração incompleta");
  console.error("═".repeat(54));

  console.error(`   URL detectada  : ${SUPABASE_URL || "❌ não encontrada"}`);
  console.error(`   Service key    : ${SERVICE_ROLE ? "✅ presente" : "❌ ausente"}`);

  if (!SUPABASE_URL) {
    console.error("");
    console.error("   A URL não foi encontrada em .env.seed nem em process.env.");
    console.error("   Verifique se SUPABASE_URL está definida (veja .env.seed.example).");
  }

  if (!SERVICE_ROLE) {
    console.error("");
    console.error("   A SUPABASE_SERVICE_ROLE_KEY não foi encontrada.");
    console.error("");
    console.error("   ⚠️  ATENÇÃO: a VITE_SUPABASE_PUBLISHABLE_KEY (sb_publishable_...)");
    console.error("       NÃO serve — ela é a chave pública/anon e NÃO bypassa o RLS.");
    console.error("       Inserts sem service_role serão bloqueados pelas políticas de segurança.");
    console.error("");
    console.error("   Como obter a service_role key:");
    console.error("   → Supabase Dashboard → Settings → API → service_role → Reveal");
    console.error("   → É uma string longa começando com eyJ...");
    console.error("");
    console.error("   Como executar (PowerShell):");
    console.error(`   $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."; npm run demo:seed-matriz`);
    console.error("");
    console.error("   Ou adicione ao .env.seed (nunca commitar):");
    console.error("   SUPABASE_SERVICE_ROLE_KEY=eyJ...");
    console.error("   (veja .env.seed.example para o formato correto)");
  }

  console.error("═".repeat(54));
  console.error("");
  process.exit(1);
}

// Guarda de ambiente — recusa produção e exige confirmação explícita.
// Requer: APP_ENV=staging e SEED_STAGING="SEED_STAGING" no ambiente.
try {
  assertSafeToSeedStagingFromProcessEnv({ supabaseUrl: SUPABASE_URL, env: seedEnv });
} catch (err) {
  if (err instanceof SeedGuardError) {
    console.error(`\n❌ ${err.message}\n`);
    process.exit(1);
  }
  throw err;
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// --- UUID prefixes ---
const ORG_ID   = "10000000-0000-0000-0000-000000000002";

// Setores
const S1 = "dd000001-0000-0000-0000-000000000001";
const S2 = "dd000001-0000-0000-0000-000000000002";
const S3 = "dd000001-0000-0000-0000-000000000003";
const S4 = "dd000001-0000-0000-0000-000000000004";
const S5 = "dd000001-0000-0000-0000-000000000005";

// Finanças
const FA1 = "dd000005-0000-0000-0000-000000000001";
const FA2 = "dd000005-0000-0000-0000-000000000002";
const FA3 = "dd000005-0000-0000-0000-000000000003";
const FA4 = "dd000005-0000-0000-0000-000000000004";
const FC1 = "dd000006-0000-0000-0000-000000000001";
const FC2 = "dd000006-0000-0000-0000-000000000002";
const FC3 = "dd000006-0000-0000-0000-000000000003";
const FC4 = "dd000006-0000-0000-0000-000000000004";
const FC5 = "dd000006-0000-0000-0000-000000000005";
const FC6 = "dd000006-0000-0000-0000-000000000006";
const FC7 = "dd000006-0000-0000-0000-000000000007";
const FC8 = "dd000006-0000-0000-0000-000000000008";

// Grupos
const G1 = "dd00000b-0000-0000-0000-000000000001";
const G2 = "dd00000b-0000-0000-0000-000000000002";
const G3 = "dd00000b-0000-0000-0000-000000000003";
const G4 = "dd00000b-0000-0000-0000-000000000004";
const G5 = "dd00000b-0000-0000-0000-000000000005";

// Membros (referências rápidas)
const M1  = "dd000003-0000-0000-0000-000000000001";
const M2  = "dd000003-0000-0000-0000-000000000002";
const M3  = "dd000003-0000-0000-0000-000000000003";
const M4  = "dd000003-0000-0000-0000-000000000004";
const M5  = "dd000003-0000-0000-0000-000000000005";
const M6  = "dd000003-0000-0000-0000-000000000006";
const M7  = "dd000003-0000-0000-0000-000000000007";
const M8  = "dd000003-0000-0000-0000-000000000008";
const M9  = "dd000003-0000-0000-0000-000000000009";
const M10 = "dd000003-0000-0000-0000-00000000000a";
const M11 = "dd000003-0000-0000-0000-00000000000b";
const M12 = "dd000003-0000-0000-0000-00000000000c";
const M13 = "dd000003-0000-0000-0000-00000000000d";
const M14 = "dd000003-0000-0000-0000-00000000000e";
const M15 = "dd000003-0000-0000-0000-00000000000f";
const M16 = "dd000003-0000-0000-0000-000000000010";
const M17 = "dd000003-0000-0000-0000-000000000011";
const M18 = "dd000003-0000-0000-0000-000000000012";
const M19 = "dd000003-0000-0000-0000-000000000013";
const M20 = "dd000003-0000-0000-0000-000000000014";
const M21 = "dd000003-0000-0000-0000-000000000015";
const M22 = "dd000003-0000-0000-0000-000000000016";
const M23 = "dd000003-0000-0000-0000-000000000017";
const M24 = "dd000003-0000-0000-0000-000000000018";
const M25 = "dd000003-0000-0000-0000-000000000019";

// --- Helpers ---
const ok  = (msg) => console.log(`  ✅ ${msg}`);
const err = (msg) => console.error(`  ❌ ${msg}`);
const inf = (msg) => console.log(`  ℹ️  ${msg}`);
const sep = (t)   => console.log(`\n${"─".repeat(54)}\n  ${t}\n${"─".repeat(54)}`);

async function countByIds(table, ids) {
  if (!ids.length) return 0;
  const { count, error } = await sb
    .from(table)
    .select("*", { count: "exact", head: true })
    .in("id", ids);
  if (error) return null;
  return count ?? 0;
}

/**
 * Insere rows e reporta quantos eram novos (before vs after count).
 * @returns {{ inserted: number, skipped: number, error: string|null }}
 */
/** Upsert que SOBRESCREVE registros existentes (sem ignoreDuplicates). */
async function upsertRowsForce(table, rows, label) {
  const tag = label ?? table;
  if (!rows.length) {
    inf(`${tag}: nenhum registro (array vazio)`);
    return { inserted: 0, skipped: 0, error: null };
  }

  const { error: upsertErr } = await sb
    .from(table)
    .upsert(rows, { onConflict: "id", ignoreDuplicates: false });

  if (upsertErr) {
    err(`${tag}: ${upsertErr.message}`);
    return { inserted: 0, skipped: rows.length, error: upsertErr.message };
  }

  ok(`${tag}: ${rows.length} registro(s) inserido(s)/atualizado(s)`);
  return { inserted: rows.length, skipped: 0, error: null };
}

async function insertRows(table, rows, label) {
  const tag = label ?? table;
  if (!rows.length) {
    inf(`${tag}: nenhum registro (array vazio)`);
    return { inserted: 0, skipped: 0, error: null };
  }

  const ids = rows.map((r) => r.id);

  const before = await countByIds(table, ids);
  if (before === null) {
    err(`${tag}: erro ao contar registros antes do insert`);
    return { inserted: 0, skipped: 0, error: "count-before failed" };
  }

  const { error: upsertErr } = await sb
    .from(table)
    .upsert(rows, { onConflict: "id", ignoreDuplicates: true });

  if (upsertErr) {
    err(`${tag}: ${upsertErr.message}`);
    return { inserted: 0, skipped: before, error: upsertErr.message };
  }

  const after = await countByIds(table, ids);
  if (after === null) {
    err(`${tag}: erro ao contar registros após insert`);
    return { inserted: 0, skipped: before, error: "count-after failed" };
  }

  const inserted = after - before;
  const skipped  = rows.length - inserted;

  if (inserted > 0) {
    ok(`${tag}: ${inserted} novo(s) inserido(s) [${skipped} já existiam]`);
  } else {
    inf(`${tag}: ${skipped} já existiam, 0 novos`);
  }

  return { inserted, skipped, error: null };
}

// ============================================================
// DADOS
// ============================================================

const sectors = [
  { id: S1, name: "Setor Norte",  organization_type: "setor", parent_id: ORG_ID, city: "Caxias do Sul", state: "RS", country_code: "BR", language_code: "pt-BR", active: true },
  { id: S2, name: "Setor Sul",    organization_type: "setor", parent_id: ORG_ID, city: "Caxias do Sul", state: "RS", country_code: "BR", language_code: "pt-BR", active: true },
  { id: S3, name: "Setor Leste",  organization_type: "setor", parent_id: ORG_ID, city: "Caxias do Sul", state: "RS", country_code: "BR", language_code: "pt-BR", active: true },
  { id: S4, name: "Setor Oeste",  organization_type: "setor", parent_id: ORG_ID, city: "Caxias do Sul", state: "RS", country_code: "BR", language_code: "pt-BR", active: true },
  { id: S5, name: "Setor Centro", organization_type: "setor", parent_id: ORG_ID, city: "Caxias do Sul", state: "RS", country_code: "BR", language_code: "pt-BR", active: true },
];

const congregations = [
  { id: "dd000002-0000-0000-0000-000000000001", name: "Congregação Central",         organization_type: "congregacao", parent_id: ORG_ID, city: "Caxias do Sul", state: "RS", country_code: "BR", language_code: "pt-BR", active: true },
  { id: "dd000002-0000-0000-0000-000000000002", name: "Congregação Bela Vista",      organization_type: "congregacao", parent_id: S1,     city: "Caxias do Sul", state: "RS", country_code: "BR", language_code: "pt-BR", active: true },
  { id: "dd000002-0000-0000-0000-000000000003", name: "Congregação São José",        organization_type: "congregacao", parent_id: S1,     city: "Caxias do Sul", state: "RS", country_code: "BR", language_code: "pt-BR", active: true },
  { id: "dd000002-0000-0000-0000-000000000004", name: "Congregação Cruzeiro",        organization_type: "congregacao", parent_id: S2,     city: "Caxias do Sul", state: "RS", country_code: "BR", language_code: "pt-BR", active: true },
  { id: "dd000002-0000-0000-0000-000000000005", name: "Congregação Santa Catarina",  organization_type: "congregacao", parent_id: S2,     city: "Caxias do Sul", state: "RS", country_code: "BR", language_code: "pt-BR", active: true },
  { id: "dd000002-0000-0000-0000-000000000006", name: "Congregação Desvio Rizzo",    organization_type: "congregacao", parent_id: S3,     city: "Caxias do Sul", state: "RS", country_code: "BR", language_code: "pt-BR", active: true },
  { id: "dd000002-0000-0000-0000-000000000007", name: "Congregação Ana Rech",        organization_type: "congregacao", parent_id: S3,     city: "Caxias do Sul", state: "RS", country_code: "BR", language_code: "pt-BR", active: true },
  { id: "dd000002-0000-0000-0000-000000000008", name: "Congregação Esplanada",       organization_type: "congregacao", parent_id: S4,     city: "Caxias do Sul", state: "RS", country_code: "BR", language_code: "pt-BR", active: true },
  { id: "dd000002-0000-0000-0000-000000000009", name: "Congregação Planalto",        organization_type: "congregacao", parent_id: S4,     city: "Caxias do Sul", state: "RS", country_code: "BR", language_code: "pt-BR", active: true },
  { id: "dd000002-0000-0000-0000-00000000000a", name: "Congregação Serrano",         organization_type: "congregacao", parent_id: S5,     city: "Caxias do Sul", state: "RS", country_code: "BR", language_code: "pt-BR", active: true },
];

const members = [
  { id: M1,  organization_id: ORG_ID, full_name: "Pr. Sergio Luiz Bortolanza", member_role: "Pastor",    status: "Ativo", phone: "(54) 98801-0001", email: "pastor@adcaxias.org.br",        city: "Caxias do Sul", state: "RS", birth_date: "1970-03-12", baptized_at: "1990-04-15", joined_at: "2010-01-10" },
  { id: M2,  organization_id: ORG_ID, full_name: "Ana Paula Zanella",          member_role: "Lider",     status: "Ativo", phone: "(54) 98801-0002", email: "anapz@adcaxias.org.br",          city: "Caxias do Sul", state: "RS", birth_date: "1980-07-22", baptized_at: "2002-06-08", joined_at: "2015-03-20" },
  { id: M3,  organization_id: ORG_ID, full_name: "Marcos Antonio Rossato",     member_role: "Obreiro",   status: "Ativo", phone: "(54) 98801-0003", email: "marcos.rossato@adcaxias.org.br", city: "Caxias do Sul", state: "RS", birth_date: "1975-11-05", baptized_at: "1998-09-20", joined_at: "2012-05-15" },
  { id: M4,  organization_id: ORG_ID, full_name: "Roseli Maria Ferrari",       member_role: "Secretaria",status: "Ativo", phone: "(54) 98801-0004", email: "secretaria@adcaxias.org.br",     city: "Caxias do Sul", state: "RS", birth_date: "1978-04-18", baptized_at: "2000-01-30", joined_at: "2013-08-01" },
  { id: M5,  organization_id: ORG_ID, full_name: "Gilberto Pedro Colombo",     member_role: "Tesoureiro",status: "Ativo", phone: "(54) 98801-0005", email: "tesoureiro@adcaxias.org.br",     city: "Caxias do Sul", state: "RS", birth_date: "1972-09-30", baptized_at: "1995-03-25", joined_at: "2011-02-28" },
  { id: M6,  organization_id: ORG_ID, full_name: "Leandro Basso",              member_role: "Diacono",   status: "Ativo", phone: "(54) 98801-0006", email: "leandro.basso@adcaxias.org.br",  city: "Caxias do Sul", state: "RS", birth_date: "1985-12-14", baptized_at: "2007-11-12", joined_at: "2016-07-04" },
  { id: M7,  organization_id: ORG_ID, full_name: "Fernanda Pasinato",          member_role: "Lider",     status: "Ativo", phone: "(54) 98801-0007", email: "fernanda.p@adcaxias.org.br",     city: "Caxias do Sul", state: "RS", birth_date: "1982-06-02", baptized_at: "2004-05-05", joined_at: "2014-11-11" },
  { id: M8,  organization_id: ORG_ID, full_name: "Vitor Andreatta",            member_role: "Obreiro",   status: "Ativo", phone: "(54) 98801-0008", email: null,                             city: "Caxias do Sul", state: "RS", birth_date: "1990-02-20", baptized_at: null,         joined_at: "2018-03-07" },
  { id: M9,  organization_id: ORG_ID, full_name: "Roberto Galvani",            member_role: "Membro",    status: "Ativo", phone: "(54) 98801-0009", email: null,                             city: "Caxias do Sul", state: "RS", birth_date: "1965-08-08", baptized_at: "1988-07-15", joined_at: "2010-09-09" },
  { id: M10, organization_id: ORG_ID, full_name: "Maria Jose Tonetto",         member_role: "Membro",    status: "Ativo", phone: "(54) 98801-0010", email: null,                             city: "Caxias do Sul", state: "RS", birth_date: "1960-01-25", baptized_at: "1985-12-22", joined_at: "2010-01-01" },
  { id: M11, organization_id: ORG_ID, full_name: "Paulo Eduardo Antoniazzi",   member_role: "Diacono",   status: "Inativo",     phone: "(54) 98801-0011", email: null, city: "Caxias do Sul", state: "RS", birth_date: "1988-05-17", baptized_at: "2010-03-10", joined_at: "2017-06-30" },
  { id: M12, organization_id: ORG_ID, full_name: "Cristiane Degasperi",        member_role: "Membro",    status: "Inativo",     phone: "(54) 98801-0012", email: null, city: "Caxias do Sul", state: "RS", birth_date: "1992-10-03", baptized_at: null,         joined_at: "2019-04-20" },
  { id: M13, organization_id: ORG_ID, full_name: "Rodrigo Maran",              member_role: "Membro",    status: "Inativo",     phone: "(54) 98801-0013", email: null, city: "Caxias do Sul", state: "RS", birth_date: "1987-03-28", baptized_at: null,         joined_at: "2018-12-01" },
  { id: M14, organization_id: ORG_ID, full_name: "Simone Bettega",             member_role: "Membro",    status: "Disciplinado",phone: "(54) 98801-0014", email: null, city: "Caxias do Sul", state: "RS", birth_date: "1983-07-11", baptized_at: "2005-08-14", joined_at: "2015-09-15" },
  { id: M15, organization_id: ORG_ID, full_name: "Julio Cesar Brandalise",     member_role: "Obreiro",   status: "Disciplinado",phone: "(54) 98801-0015", email: null, city: "Caxias do Sul", state: "RS", birth_date: "1993-04-04", baptized_at: null,         joined_at: "2020-02-10" },
  { id: M16, organization_id: ORG_ID, full_name: "Patricia Scortegagna",       member_role: "Membro",    status: "Disciplinado",phone: "(54) 98801-0016", email: null, city: "Caxias do Sul", state: "RS", birth_date: "1995-09-19", baptized_at: null,         joined_at: "2021-07-14" },
  { id: M17, organization_id: ORG_ID, full_name: "Anderson Volpato",           member_role: "Membro",    status: "Transferido", phone: "(54) 98801-0017", email: null, city: "Caxias do Sul", state: "RS", birth_date: "1991-12-25", baptized_at: null,         joined_at: "2020-10-05" },
  { id: M18, organization_id: ORG_ID, full_name: "Elisangela Mantovani",       member_role: "Membro",    status: "Transferido", phone: "(54) 98801-0018", email: null, city: "Caxias do Sul", state: "RS", birth_date: "1984-02-14", baptized_at: "2006-03-19", joined_at: "2016-01-08" },
  { id: M19, organization_id: ORG_ID, full_name: "Rafael Casagrande",          member_role: "Jovem",     status: "Transferido", phone: "(54) 98801-0019", email: null, city: "Caxias do Sul", state: "RS", birth_date: "2000-06-30", baptized_at: null,         joined_at: "2022-03-25" },
  { id: M20, organization_id: ORG_ID, full_name: "Larissa Fracasso",           member_role: "Jovem",     status: "Falecido",    phone: "(54) 98801-0020", email: null, city: "Caxias do Sul", state: "RS", birth_date: "2001-11-08", baptized_at: null,         joined_at: "2022-08-12" },
  { id: M21, organization_id: ORG_ID, full_name: "Gustavo Pegoraro",           member_role: "Jovem",     status: "Falecido",    phone: "(54) 98801-0021", email: null, city: "Caxias do Sul", state: "RS", birth_date: "1999-04-22", baptized_at: null,         joined_at: "2021-05-18" },
  { id: M22, organization_id: ORG_ID, full_name: "Julia Bortolini",            member_role: "Jovem",     status: "Falecido",    phone: "(54) 98801-0022", email: null, city: "Caxias do Sul", state: "RS", birth_date: "2002-08-15", baptized_at: null,         joined_at: "2023-01-30" },
  { id: M23, organization_id: ORG_ID, full_name: "Thiago Polesso",             member_role: "Jovem",     status: "Visitante",   phone: "(54) 98801-0023", email: null, city: "Caxias do Sul", state: "RS", birth_date: "1998-03-01", baptized_at: null,         joined_at: "2021-11-20" },
  { id: M24, organization_id: ORG_ID, full_name: "Camila Dallacosta",          member_role: "Membro",    status: "Visitante",   phone: "(54) 98801-0024", email: null, city: "Caxias do Sul", state: "RS", birth_date: "1986-10-17", baptized_at: "2009-04-05", joined_at: "2017-04-25" },
  { id: M25, organization_id: ORG_ID, full_name: "Antonio Cominetto",          member_role: "Membro",    status: "Visitante",   phone: "(54) 98801-0025", email: null, city: "Caxias do Sul", state: "RS", birth_date: "1958-05-30", baptized_at: "1982-10-10", joined_at: "2010-01-01" },
];

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log("═".repeat(54));
  console.log("  Seed Demo — Matriz Municipal Caxias do Sul");
  console.log(`  Org: ${ORG_ID}`);
  console.log("═".repeat(54));

  // Verificar que a org existe
  const { data: orgRow, error: orgErr } = await sb
    .from("organizations")
    .select("id, name")
    .eq("id", ORG_ID)
    .maybeSingle();

  if (orgErr || !orgRow) {
    err(`Org ${ORG_ID} NÃO encontrada: ${orgErr?.message ?? "resultado vazio"}`);
    err("Execute a migration de organizações demo antes de rodar este script.");
    process.exit(1);
  }
  ok(`Org encontrada: "${orgRow.name}"`);

  // Buscar userId para transações
  let userId = null;
  const { data: ouRow } = await sb
    .from("organization_users")
    .select("user_id")
    .eq("organization_id", ORG_ID)
    .limit(1)
    .maybeSingle();
  if (ouRow?.user_id) {
    userId = ouRow.user_id;
    ok(`Usuário para transações: ${userId}`);
  } else {
    const { data: anyUser } = await sb
      .from("organization_users")
      .select("user_id")
      .limit(1)
      .maybeSingle();
    userId = anyUser?.user_id ?? null;
    if (userId) inf(`Nenhum usuário na org — usando fallback: ${userId}`);
    else        inf("Nenhum usuário encontrado — transações serão ignoradas");
  }

  const counts = {};

  // ----------------------------------------------------------
  // 01 — Setores
  // ----------------------------------------------------------
  sep("01 — Setores (5)");
  counts.sectors = await insertRows("organizations", sectors, "setores");

  // ----------------------------------------------------------
  // 02 — Congregações
  // ----------------------------------------------------------
  sep("02 — Congregações (10)");
  counts.congregations = await insertRows("organizations", congregations, "congregações");

  // ----------------------------------------------------------
  // 03 — Membros (25)
  // ----------------------------------------------------------
  sep("03 — Membros (25)");
  counts.members = await insertRows("members", members, "membros");

  // ----------------------------------------------------------
  // 04 — Cartas de Recomendação (5)
  // ----------------------------------------------------------
  sep("04 — Cartas de Recomendação (5)");
  const now = new Date();
  const daysAgo = (d) => new Date(now - d * 864e5).toISOString();
  // upsertRowsForce: sobrescreve registros existentes para corrigir denominações erradas
  const letters = [
    { id: "dd000004-0000-0000-0000-000000000001", organization_id: ORG_ID, member_id: M3,  member_name: "Marcos Antonio Rossato",  member_email: "marcos.rossato@adcaxias.org.br", origin_church_name: orgRow.name, destination_church: "Assembleia de Deus — Zona Norte",               destination_city: "Porto Alegre",    destination_state: "RS", reason: "Transferência de residência",           observations: "Membro se muda em razão de novo emprego na capital.", status: "requested",    requested_at: daysAgo(14), reviewed_at: null,       approved_at: null },
    { id: "dd000004-0000-0000-0000-000000000002", organization_id: ORG_ID, member_id: M19, member_name: "Rafael Casagrande",        member_email: null,                             origin_church_name: orgRow.name, destination_church: "Assembleia de Deus — Campo de São Paulo",        destination_city: "São Paulo",       destination_state: "SP", reason: "Mudança para fins de estudo",           observations: "Membro ingressou em universidade federal. Apresenta-se ao campo local.", status: "requested",    requested_at: daysAgo(7),  reviewed_at: null,       approved_at: null },
    { id: "dd000004-0000-0000-0000-000000000003", organization_id: ORG_ID, member_id: M14, member_name: "Simone Bettega",           member_email: null,                             origin_church_name: orgRow.name, destination_church: "Assembleia de Deus — Boqueirão — Curitiba",      destination_city: "Curitiba",        destination_state: "PR", reason: "Apresentação de membro durante relocação", observations: "Relocação profissional de 6 meses. Membro em plena comunhão.", status: "under_review", requested_at: daysAgo(21), reviewed_at: daysAgo(18), approved_at: null },
    { id: "dd000004-0000-0000-0000-000000000004", organization_id: ORG_ID, member_id: M7,  member_name: "Fernanda Pasinato",        member_email: "fernanda.p@adcaxias.org.br",     origin_church_name: orgRow.name, destination_church: "Assembleia de Deus — Campinas — Florianópolis", destination_city: "Florianópolis",   destination_state: "SC", reason: "Transferência de congregação",          observations: "Membro em plena comunhão. Transferência solicitada pelo próprio membro.", status: "approved",     requested_at: daysAgo(30), reviewed_at: daysAgo(27), approved_at: daysAgo(25) },
    { id: "dd000004-0000-0000-0000-000000000005", organization_id: ORG_ID, member_id: M9,  member_name: "Roberto Galvani",          member_email: null,                             origin_church_name: orgRow.name, destination_church: "Assembleia de Deus — Orlando — FL",              destination_city: "Orlando",         destination_state: "FL", reason: "Viagem missionária internacional",      observations: "Membro viajou sem documentação ministerial completa. Carta não emitida.", status: "rejected",     requested_at: daysAgo(45), reviewed_at: daysAgo(42), approved_at: null },
  ];
  counts.letters = await upsertRowsForce("recommendation_letters", letters, "cartas");

  // ----------------------------------------------------------
  // 05 — Financeiro — Contas
  // ----------------------------------------------------------
  sep("05A — Contas Financeiras (5)");
  const accounts = [
    { id: FA1, organization_id: ORG_ID, name: "Caixa Geral",             type: "caixa",    current_balance: 12450.00, opening_balance: 5000.00,  is_active: true },
    { id: FA2, organization_id: ORG_ID, name: "Conta Corrente Bradesco",  type: "banco",  current_balance: 38920.50, opening_balance: 10000.00, is_active: true },
    { id: FA3, organization_id: ORG_ID, name: "Fundo de Missões",         type: "banco",  current_balance: 15300.00, opening_balance: 2000.00,  is_active: true },
    { id: FA4, organization_id: ORG_ID, name: "Fundo de Construção",      type: "banco",  current_balance: 89750.00, opening_balance: 50000.00, is_active: true },
    { id: "dd000005-0000-0000-0000-000000000005", organization_id: ORG_ID, name: "Caixa Congregações", type: "caixa", current_balance: 4210.00, opening_balance: 1000.00, is_active: true },
  ];
  counts.accounts = await insertRows("finance_accounts", accounts, "contas financeiras");

  // ----------------------------------------------------------
  // 05B — Categorias Financeiras
  // ----------------------------------------------------------
  sep("05B — Categorias Financeiras (8)");
  const categories = [
    { id: FC1, organization_id: ORG_ID, code: "DD-REC-01", name: "Dízimos",               type: "receita", is_active: true, is_system: false },
    { id: FC2, organization_id: ORG_ID, code: "DD-REC-02", name: "Ofertas",               type: "receita", is_active: true, is_system: false },
    { id: FC3, organization_id: ORG_ID, code: "DD-REC-03", name: "Missões — Doação",      type: "receita", is_active: true, is_system: false },
    { id: FC4, organization_id: ORG_ID, code: "DD-REC-04", name: "Fundo de Construção",   type: "receita", is_active: true, is_system: false },
    { id: FC5, organization_id: ORG_ID, code: "DD-DEP-01", name: "Aluguel / Manutenção",  type: "despesa", is_active: true, is_system: false },
    { id: FC6, organization_id: ORG_ID, code: "DD-DEP-02", name: "Energia Elétrica",      type: "despesa", is_active: true, is_system: false },
    { id: FC7, organization_id: ORG_ID, code: "DD-DEP-03", name: "Material / Suprimentos",type: "despesa", is_active: true, is_system: false },
    { id: FC8, organization_id: ORG_ID, code: "DD-DEP-04", name: "Ação Social",           type: "despesa", is_active: true, is_system: false },
  ];
  counts.categories = await insertRows("finance_account_categories", categories, "categorias");

  // ----------------------------------------------------------
  // 05C — Centros de Custo
  // ----------------------------------------------------------
  sep("05C — Centros de Custo (4)");
  const costCenters = [
    { id: "dd000007-0000-0000-0000-000000000001", organization_id: ORG_ID, name: "Ministério de Louvor",   type: "departamento", is_active: true },
    { id: "dd000007-0000-0000-0000-000000000002", organization_id: ORG_ID, name: "Ministério Infantil",    type: "departamento", is_active: true },
    { id: "dd000007-0000-0000-0000-000000000003", organization_id: ORG_ID, name: "Missões Nacionais",      type: "departamento", is_active: true },
    { id: "dd000007-0000-0000-0000-000000000004", organization_id: ORG_ID, name: "Administração Geral",    type: "matriz",       is_active: true },
  ];
  counts.costCenters = await insertRows("finance_cost_centers", costCenters, "centros de custo");

  // ----------------------------------------------------------
  // 05D — Transações (30) — requer userId
  // ----------------------------------------------------------
  sep("05D — Transações (30)");
  if (!userId) {
    inf("Transações ignoradas: nenhum usuário disponível");
    counts.transactions = { inserted: 0, skipped: 0, error: "no-user" };
  } else {
    const transactions = [
      { id: "dd000008-0000-0000-0000-000000000001", organization_id: ORG_ID, user_id: userId, type: "Entrada", category: "Dízimos",             description: "Dízimos culto domingo 02/02/2026",         amount: 4800,  date: "2026-02-02", status: "Confirmado", payment_method: "PIX",          financial_account_id: FA2, account_category_id: FC1 },
      { id: "dd000008-0000-0000-0000-000000000002", organization_id: ORG_ID, user_id: userId, type: "Entrada", category: "Dízimos",             description: "Dízimos culto domingo 02/03/2026",         amount: 5100,  date: "2026-03-02", status: "Confirmado", payment_method: "PIX",          financial_account_id: FA2, account_category_id: FC1 },
      { id: "dd000008-0000-0000-0000-000000000003", organization_id: ORG_ID, user_id: userId, type: "Entrada", category: "Dízimos",             description: "Dízimos culto domingo 06/04/2026",         amount: 5350,  date: "2026-04-06", status: "Confirmado", payment_method: "PIX",          financial_account_id: FA2, account_category_id: FC1 },
      { id: "dd000008-0000-0000-0000-000000000004", organization_id: ORG_ID, user_id: userId, type: "Entrada", category: "Dízimos",             description: "Dízimos culto domingo 04/05/2026",         amount: 4950,  date: "2026-05-04", status: "Confirmado", payment_method: "Dinheiro",      financial_account_id: FA2, account_category_id: FC1 },
      { id: "dd000008-0000-0000-0000-000000000005", organization_id: ORG_ID, user_id: userId, type: "Entrada", category: "Dízimos",             description: "Dízimos culto domingo 01/06/2026",         amount: 5200,  date: "2026-06-01", status: "Confirmado", payment_method: "PIX",          financial_account_id: FA2, account_category_id: FC1 },
      { id: "dd000008-0000-0000-0000-000000000006", organization_id: ORG_ID, user_id: userId, type: "Entrada", category: "Dízimos",             description: "Dízimos culto quarta 11/06/2026",          amount: 1800,  date: "2026-06-11", status: "Confirmado", payment_method: "Dinheiro",      financial_account_id: FA1, account_category_id: FC1 },
      { id: "dd000008-0000-0000-0000-000000000007", organization_id: ORG_ID, user_id: userId, type: "Entrada", category: "Dízimos",             description: "Dízimos online maio 2026",                 amount: 2300,  date: "2026-05-20", status: "Confirmado", payment_method: "PIX",          financial_account_id: FA2, account_category_id: FC1 },
      { id: "dd000008-0000-0000-0000-000000000008", organization_id: ORG_ID, user_id: userId, type: "Entrada", category: "Dízimos",             description: "Dízimos culto domingo 15/06/2026",         amount: 5400,  date: "2026-06-15", status: "Pendente",   payment_method: "PIX",          financial_account_id: FA2, account_category_id: FC1 },
      { id: "dd000008-0000-0000-0000-000000000009", organization_id: ORG_ID, user_id: userId, type: "Entrada", category: "Ofertas",             description: "Oferta especial Congresso de Oração",      amount: 2200,  date: "2026-06-13", status: "Confirmado", payment_method: "Dinheiro",      financial_account_id: FA1, account_category_id: FC2 },
      { id: "dd000008-0000-0000-0000-00000000000a", organization_id: ORG_ID, user_id: userId, type: "Entrada", category: "Ofertas",             description: "Oferta culto família maio",                amount: 1450,  date: "2026-05-24", status: "Confirmado", payment_method: "Dinheiro",      financial_account_id: FA1, account_category_id: FC2 },
      { id: "dd000008-0000-0000-0000-00000000000b", organization_id: ORG_ID, user_id: userId, type: "Entrada", category: "Ofertas",             description: "Oferta dominical março",                   amount: 1700,  date: "2026-03-08", status: "Confirmado", payment_method: "Dinheiro",      financial_account_id: FA1, account_category_id: FC2 },
      { id: "dd000008-0000-0000-0000-00000000000c", organization_id: ORG_ID, user_id: userId, type: "Entrada", category: "Ofertas",             description: "Oferta Santa Ceia abril",                  amount: 850,   date: "2026-04-20", status: "Confirmado", payment_method: "Dinheiro",      financial_account_id: FA1, account_category_id: FC2 },
      { id: "dd000008-0000-0000-0000-00000000000d", organization_id: ORG_ID, user_id: userId, type: "Entrada", category: "Ofertas",             description: "Oferta missionária junho",                 amount: 1200,  date: "2026-06-07", status: "Pendente",   payment_method: "Dinheiro",      financial_account_id: FA1, account_category_id: FC2 },
      { id: "dd000008-0000-0000-0000-00000000000e", organization_id: ORG_ID, user_id: userId, type: "Entrada", category: "Missões — Doação",    description: "Doação Projeto Missões África",            amount: 3500,  date: "2026-04-15", status: "Confirmado", payment_method: "Transferência", financial_account_id: FA3, account_category_id: FC3 },
      { id: "dd000008-0000-0000-0000-00000000000f", organization_id: ORG_ID, user_id: userId, type: "Entrada", category: "Missões — Doação",    description: "Doação Missões Camboja parceria",          amount: 2800,  date: "2026-05-10", status: "Confirmado", payment_method: "PIX",          financial_account_id: FA3, account_category_id: FC3 },
      { id: "dd000008-0000-0000-0000-000000000010", organization_id: ORG_ID, user_id: userId, type: "Entrada", category: "Fundo de Construção", description: "Oferta construção novo templo abril",      amount: 6200,  date: "2026-04-28", status: "Confirmado", payment_method: "PIX",          financial_account_id: FA4, account_category_id: FC4 },
      { id: "dd000008-0000-0000-0000-000000000011", organization_id: ORG_ID, user_id: userId, type: "Entrada", category: "Fundo de Construção", description: "Oferta construção novo templo maio",       amount: 5800,  date: "2026-05-26", status: "Confirmado", payment_method: "PIX",          financial_account_id: FA4, account_category_id: FC4 },
      { id: "dd000008-0000-0000-0000-000000000012", organization_id: ORG_ID, user_id: userId, type: "Saida",   category: "Aluguel / Manutenção",description: "Aluguel auditório abril 2026",             amount: 1800,  date: "2026-04-05", status: "Confirmado", payment_method: "Transferência", financial_account_id: FA2, account_category_id: FC5 },
      { id: "dd000008-0000-0000-0000-000000000013", organization_id: ORG_ID, user_id: userId, type: "Saida",   category: "Aluguel / Manutenção",description: "Manutenção sistema de som",                amount: 950,   date: "2026-05-12", status: "Confirmado", payment_method: "PIX",          financial_account_id: FA2, account_category_id: FC5 },
      { id: "dd000008-0000-0000-0000-000000000014", organization_id: ORG_ID, user_id: userId, type: "Saida",   category: "Aluguel / Manutenção",description: "Aluguel auditório maio 2026",              amount: 1800,  date: "2026-05-05", status: "Confirmado", payment_method: "Transferência", financial_account_id: FA2, account_category_id: FC5 },
      { id: "dd000008-0000-0000-0000-000000000015", organization_id: ORG_ID, user_id: userId, type: "Saida",   category: "Energia Elétrica",    description: "Conta de luz abril 2026",                  amount: 420,   date: "2026-04-10", status: "Confirmado", payment_method: "Transferência", financial_account_id: FA2, account_category_id: FC6 },
      { id: "dd000008-0000-0000-0000-000000000016", organization_id: ORG_ID, user_id: userId, type: "Saida",   category: "Energia Elétrica",    description: "Conta de luz maio 2026",                   amount: 390,   date: "2026-05-10", status: "Confirmado", payment_method: "Transferência", financial_account_id: FA2, account_category_id: FC6 },
      { id: "dd000008-0000-0000-0000-000000000017", organization_id: ORG_ID, user_id: userId, type: "Saida",   category: "Material / Suprimentos",description:"Material EBD apostilas e Bíblias",         amount: 680,   date: "2026-04-18", status: "Confirmado", payment_method: "PIX",          financial_account_id: FA1, account_category_id: FC7 },
      { id: "dd000008-0000-0000-0000-000000000018", organization_id: ORG_ID, user_id: userId, type: "Saida",   category: "Material / Suprimentos",description:"Material de limpeza março",                amount: 180,   date: "2026-03-20", status: "Confirmado", payment_method: "Dinheiro",      financial_account_id: FA1, account_category_id: FC7 },
      { id: "dd000008-0000-0000-0000-000000000019", organization_id: ORG_ID, user_id: userId, type: "Saida",   category: "Material / Suprimentos",description:"Material gráfico banner",                  amount: 350,   date: "2026-06-02", status: "Pendente",   payment_method: "PIX",          financial_account_id: FA1, account_category_id: FC7 },
      { id: "dd000008-0000-0000-0000-00000000001a", organization_id: ORG_ID, user_id: userId, type: "Saida",   category: "Ação Social",         description: "Ação Social Inverno — cestas básicas",     amount: 2400,  date: "2026-05-18", status: "Confirmado", payment_method: "Transferência", financial_account_id: FA2, account_category_id: FC8 },
      { id: "dd000008-0000-0000-0000-00000000001b", organization_id: ORG_ID, user_id: userId, type: "Saida",   category: "Ação Social",         description: "Distribuição de cobertores junho",         amount: 850,   date: "2026-06-07", status: "Confirmado", payment_method: "Dinheiro",      financial_account_id: FA1, account_category_id: FC8 },
      { id: "dd000008-0000-0000-0000-00000000001c", organization_id: ORG_ID, user_id: userId, type: "Saida",   category: "Missões — Doação",    description: "Envio apoio missionário África maio",      amount: 3200,  date: "2026-05-28", status: "Confirmado", payment_method: "Transferência", financial_account_id: FA3, account_category_id: FC3 },
      { id: "dd000008-0000-0000-0000-00000000001d", organization_id: ORG_ID, user_id: userId, type: "Saida",   category: "Missões — Doação",    description: "Passagens equipe missão Camboja",          amount: 2100,  date: "2026-06-10", status: "Pendente",   payment_method: "Transferência", financial_account_id: FA3, account_category_id: FC3 },
      { id: "dd000008-0000-0000-0000-00000000001e", organization_id: ORG_ID, user_id: userId, type: "Saida",   category: "Fundo de Construção", description: "Contrato alvenaria fundação fase 1",        amount: 8500,  date: "2026-06-08", status: "Confirmado", payment_method: "Transferência", financial_account_id: FA4, account_category_id: FC4 },
    ];
    counts.transactions = await insertRows("transactions", transactions, "transações");
  }

  // ----------------------------------------------------------
  // 06 — Documentos (6)
  // ----------------------------------------------------------
  sep("06 — Documentos (6)");
  const documents = [
    { id: "dd000009-0000-0000-0000-000000000001", organization_id: ORG_ID, title: "Ata da Assembleia Geral Ordinária 2025",              document_type: "Ata",                   content: "ATA DA ASSEMBLEIA GERAL ORDINÁRIA 2025 — Assembleia de Deus em Caxias do Sul. Data: 28/11/2025, 19h30, Templo Sede. Presentes: 87 membros. Pauta: relatório pastoral, financeiro, eleição diretoria, aprovação projeto de construção. Resultado: aprovado por unanimidade." },
    { id: "dd000009-0000-0000-0000-000000000002", organization_id: ORG_ID, title: "Declaração de Membro — Sergio Bortolanza",            document_type: "Declaração",             content: "DECLARAÇÃO DE MEMBRO. A Assembleia de Deus em Caxias do Sul declara que o Pr. Sergio Luiz Bortolanza é membro em plena comunhão desde 10/01/2010. Emitido para os devidos fins." },
    { id: "dd000009-0000-0000-0000-000000000003", organization_id: ORG_ID, title: "Estatuto Social — AD Caxias do Sul",                  document_type: "Estatuto",               content: "ESTATUTO SOCIAL — ASSEMBLEIA DE DEUS EM CAXIAS DO SUL. Entidade religiosa sem fins lucrativos, Caxias do Sul, RS. Objetivos: pregar o Evangelho, promover adoração e discipulado, missões e ação social." },
    { id: "dd000009-0000-0000-0000-000000000004", organization_id: ORG_ID, title: "Relatório Financeiro Semestral 1º Sem 2026",          document_type: "Relatório",              content: "RELATÓRIO FINANCEIRO 1º SEMESTRE 2026. RECEITAS: Dízimos R$34.600, Ofertas R$9.850, Missões R$8.500, Construção R$18.200. TOTAL RECEITAS: R$71.150. DESPESAS: R$70.250. SALDO: R$900." },
    { id: "dd000009-0000-0000-0000-000000000005", organization_id: ORG_ID, title: "Autorização de Uso de Imagem — Ministério Infantil",  document_type: "Autorização",            content: "AUTORIZAÇÃO DE USO DE IMAGEM. Autorizamos o uso da imagem de nosso filho(a) nas atividades do Ministério Infantil da Assembleia de Deus em Caxias do Sul, para fins eclesiásticos sem fins lucrativos." },
    { id: "dd000009-0000-0000-0000-000000000006", organization_id: ORG_ID, title: "Carta de Recomendação Arquivada — Fernanda Pasinato", document_type: "Carta de Recomendação",  content: "CARTA DE RECOMENDAÇÃO ARQUIVADA. Emitida em 21/05/2026 para Fernanda Pasinato, destinada à Assembleia de Deus — Campinas — Florianópolis/SC. Aprovada e validada via Ecclesia Online — código DD000004." },
  ];
  // upsertRowsForce para sobrescrever documento com referência incorreta a outra denominação
  counts.documents = await upsertRowsForce("documents", documents, "documentos");

  // ----------------------------------------------------------
  // 07 — Eventos (8)
  // ----------------------------------------------------------
  sep("07 — Eventos (8)");
  const events = [
    { id: "dd00000a-0000-0000-0000-000000000001", organization_id: ORG_ID, title: "Culto de Ensino — Domingo",       description: "Tema: Fé que move montanhas.",                              starts_at: "2026-06-21T10:00:00", ends_at: "2026-06-21T12:00:00", location: "Templo Sede",       event_type: "bg-accent",  is_public: true  },
    { id: "dd00000a-0000-0000-0000-000000000002", organization_id: ORG_ID, title: "Reunião de Obreiros",             description: "Reunião mensal de planejamento com obreiros da Matriz.",     starts_at: "2026-06-18T19:00:00", ends_at: "2026-06-18T21:00:00", location: "Salão Paroquial",   event_type: "bg-primary", is_public: false },
    { id: "dd00000a-0000-0000-0000-000000000003", organization_id: ORG_ID, title: "Escola Bíblica Dominical",        description: "Estudo por faixa etária. Tema: Epístola aos Romanos.",       starts_at: "2026-06-22T09:00:00", ends_at: "2026-06-22T10:00:00", location: "Salas de Ensino",   event_type: "bg-success", is_public: true  },
    { id: "dd00000a-0000-0000-0000-000000000004", organization_id: ORG_ID, title: "Ensaio do Louvor",                description: "Ensaio semanal da equipe de louvor e músicos.",              starts_at: "2026-06-17T19:30:00", ends_at: "2026-06-17T21:30:00", location: "Templo Sede",       event_type: "bg-primary", is_public: false },
    { id: "dd00000a-0000-0000-0000-000000000005", organization_id: ORG_ID, title: "Atendimento Pastoral",            description: "Atendimento individual mediante agendamento.",               starts_at: "2026-06-19T14:00:00", ends_at: "2026-06-19T18:00:00", location: "Sala Pastoral",     event_type: "bg-accent",  is_public: false },
    { id: "dd00000a-0000-0000-0000-000000000006", organization_id: ORG_ID, title: "Santa Ceia",                      description: "Celebração da Santa Ceia no culto da família.",              starts_at: "2026-06-28T19:00:00", ends_at: "2026-06-28T21:00:00", location: "Templo Sede",       event_type: "bg-success", is_public: true  },
    { id: "dd00000a-0000-0000-0000-000000000007", organization_id: ORG_ID, title: "Reunião da Secretaria",           description: "Reunião administrativa mensal.",                            starts_at: "2026-06-25T14:00:00", ends_at: "2026-06-25T16:00:00", location: "Sala Secretaria",   event_type: "bg-primary", is_public: false },
    { id: "dd00000a-0000-0000-0000-000000000008", organization_id: ORG_ID, title: "Culto de Oração — Quarta",        description: "Culto de oração e intercessão semanal.",                    starts_at: "2026-06-25T19:30:00", ends_at: "2026-06-25T21:00:00", location: "Templo Sede",       event_type: "bg-accent",  is_public: true  },
  ];
  counts.events = await insertRows("events", events, "eventos");

  // ----------------------------------------------------------
  // 08 — Escalas (7) — tenta com status, faz fallback sem
  // ----------------------------------------------------------
  sep("08 — Escalas (7)");
  const schedulesBase = [
    { id: "dd000010-0000-0000-0000-000000000001", organization_id: ORG_ID, title: "Escala de Louvor 21/06",     description: "Líder: Ana Paula Zanella. Músicos: Gustavo Pegoraro, Vitor Andreatta.",   schedule_date: "2026-06-21T10:00:00", ministry: "Louvor e Adoração" },
    { id: "dd000010-0000-0000-0000-000000000002", organization_id: ORG_ID, title: "Escala de Recepção 21/06",   description: "Responsáveis: Leandro Basso e Cristiane Degasperi.",                       schedule_date: "2026-06-21T09:30:00", ministry: "Recepção e Acolhimento" },
    { id: "dd000010-0000-0000-0000-000000000003", organization_id: ORG_ID, title: "Escala EBD 22/06",           description: "Infantil: Fernanda Pasinato. Jovens: Thiago Polesso. Adultos: Marcos.",  schedule_date: "2026-06-22T09:00:00", ministry: "Escola Bíblica" },
    { id: "dd000010-0000-0000-0000-000000000004", organization_id: ORG_ID, title: "Escala de Intercessão Junho",description: "Equipe: Maria José Tonetto, Simone Bettega, Elisangela Mantovani.",       schedule_date: "2026-06-01T00:00:00", ministry: "Intercessão" },
    { id: "dd000010-0000-0000-0000-000000000005", organization_id: ORG_ID, title: "Escala Santa Ceia 28/06",    description: "Diáconos: Leandro Basso, Paulo Antoniazzi. Apoio: Anderson Volpato.",    schedule_date: "2026-06-28T19:00:00", ministry: "Ministério" },
    { id: "dd000010-0000-0000-0000-000000000006", organization_id: ORG_ID, title: "Escala de Louvor 28/06",     description: "Líder: Ana Paula Zanella. Músicos para Santa Ceia.",                       schedule_date: "2026-06-28T19:00:00", ministry: "Louvor e Adoração" },
    { id: "dd000010-0000-0000-0000-000000000007", organization_id: ORG_ID, title: "Escala de Limpeza Semana",   description: "Responsáveis: Camila Dallacosta e Antonio Cominetto.",                    schedule_date: "2026-06-22T07:00:00", ministry: "Administrativa" },
  ];
  // Tentar com status primeiro
  const schedulesWithStatus = schedulesBase.map((s) => ({ ...s, status: "publicada" }));
  const scheduleResult = await insertRows("schedules", schedulesWithStatus, "escalas (com status)");
  if (scheduleResult.error && scheduleResult.error.includes("status")) {
    inf("Retentativa sem campo 'status'...");
    counts.schedules = await insertRows("schedules", schedulesBase, "escalas (sem status)");
  } else {
    counts.schedules = scheduleResult;
  }

  // ----------------------------------------------------------
  // 09 — Grupos (5)
  // ----------------------------------------------------------
  sep("09 — Grupos (5)");
  const groups = [
    { id: G1, organization_id: ORG_ID, name: "Jovens Resgate",    description: "Grupo jovens 15-30 anos. Evangelismo, discipulado e missões.",              group_type: "jovens",       meeting_day: "Sábado",       meeting_time: "19:00", location: "Salão dos Jovens", leader_member_id: M21, is_active: true },
    { id: G2, organization_id: ORG_ID, name: "Casais Ágape",      description: "Grupo casais. Estudo: Amor e Respeito (Ef 5:22-33).",                       group_type: "casais",       meeting_day: "Sexta-feira",  meeting_time: "20:00", location: "Salão Paroquial",  leader_member_id: M2,  is_active: true },
    { id: G3, organization_id: ORG_ID, name: "Mulheres de Fé",    description: "Grupo mulheres — comunhão, oração e estudo bíblico.",                       group_type: "mulheres",     meeting_day: "Terça-feira",  meeting_time: "14:00", location: "Salão Paroquial",  leader_member_id: M7,  is_active: true },
    { id: G4, organization_id: ORG_ID, name: "Homens de Valor",   description: "Grupo homens — liderança familiar e espiritual.",                           group_type: "homens",       meeting_day: "Sábado",       meeting_time: "08:00", location: "Sala de Ensino",   leader_member_id: M5,  is_active: true },
    { id: G5, organization_id: ORG_ID, name: "Adolescentes Raiz", description: "Grupo adolescentes 12-17 anos. Atividades lúdicas e bíblicas.",             group_type: "adolescentes", meeting_day: "Sábado",       meeting_time: "15:00", location: "Salão dos Jovens", leader_member_id: M8,  is_active: true },
  ];
  counts.groups = await insertRows("groups", groups, "grupos");

  // ----------------------------------------------------------
  // 10 — Membros dos Grupos (25)
  // ----------------------------------------------------------
  sep("10 — Membros dos Grupos (25)");
  const groupMembers = [
    { id: "dd00000c-0000-0000-0000-000000000001", group_id: G1, member_id: M19, role: "member", joined_at: "2022-03-01" },
    { id: "dd00000c-0000-0000-0000-000000000002", group_id: G1, member_id: M20, role: "member", joined_at: "2022-08-15" },
    { id: "dd00000c-0000-0000-0000-000000000003", group_id: G1, member_id: M21, role: "leader",  joined_at: "2021-05-20" },
    { id: "dd00000c-0000-0000-0000-000000000004", group_id: G1, member_id: M22, role: "member", joined_at: "2023-02-01" },
    { id: "dd00000c-0000-0000-0000-000000000005", group_id: G1, member_id: M23, role: "member", joined_at: "2021-11-22" },
    { id: "dd00000c-0000-0000-0000-000000000006", group_id: G2, member_id: M2,  role: "leader",  joined_at: "2015-03-25" },
    { id: "dd00000c-0000-0000-0000-000000000007", group_id: G2, member_id: M3,  role: "member", joined_at: "2017-06-10" },
    { id: "dd00000c-0000-0000-0000-000000000008", group_id: G2, member_id: M6,  role: "member", joined_at: "2016-07-05" },
    { id: "dd00000c-0000-0000-0000-000000000009", group_id: G2, member_id: M14, role: "member", joined_at: "2018-01-20" },
    { id: "dd00000c-0000-0000-0000-00000000000a", group_id: G2, member_id: M24, role: "member", joined_at: "2017-04-26" },
    { id: "dd00000c-0000-0000-0000-00000000000b", group_id: G3, member_id: M7,  role: "leader",  joined_at: "2014-11-15" },
    { id: "dd00000c-0000-0000-0000-00000000000c", group_id: G3, member_id: M4,  role: "member", joined_at: "2015-02-10" },
    { id: "dd00000c-0000-0000-0000-00000000000d", group_id: G3, member_id: M10, role: "member", joined_at: "2013-04-05" },
    { id: "dd00000c-0000-0000-0000-00000000000e", group_id: G3, member_id: M12, role: "member", joined_at: "2020-01-08" },
    { id: "dd00000c-0000-0000-0000-00000000000f", group_id: G3, member_id: M18, role: "member", joined_at: "2016-09-30" },
    { id: "dd00000c-0000-0000-0000-000000000010", group_id: G4, member_id: M5,  role: "leader",  joined_at: "2011-03-01" },
    { id: "dd00000c-0000-0000-0000-000000000011", group_id: G4, member_id: M9,  role: "member", joined_at: "2012-05-10" },
    { id: "dd00000c-0000-0000-0000-000000000012", group_id: G4, member_id: M11, role: "member", joined_at: "2018-02-14" },
    { id: "dd00000c-0000-0000-0000-000000000013", group_id: G4, member_id: M15, role: "member", joined_at: "2020-07-01" },
    { id: "dd00000c-0000-0000-0000-000000000014", group_id: G4, member_id: M25, role: "member", joined_at: "2011-06-15" },
    { id: "dd00000c-0000-0000-0000-000000000015", group_id: G5, member_id: M8,  role: "leader",  joined_at: "2018-03-10" },
    { id: "dd00000c-0000-0000-0000-000000000016", group_id: G5, member_id: M13, role: "member", joined_at: "2021-04-01" },
    { id: "dd00000c-0000-0000-0000-000000000017", group_id: G5, member_id: M16, role: "member", joined_at: "2022-03-15" },
    { id: "dd00000c-0000-0000-0000-000000000018", group_id: G5, member_id: M17, role: "member", joined_at: "2020-10-10" },
    { id: "dd00000c-0000-0000-0000-000000000019", group_id: G5, member_id: M22, role: "member", joined_at: "2023-09-05" },
  ];
  counts.groupMembers = await insertRows("group_members", groupMembers, "membros de grupos");

  // ----------------------------------------------------------
  // 11 — Assembleias (3)
  // ----------------------------------------------------------
  sep("11 — Assembleias (3)");
  const assemblies = [
    { id: "dd00000d-0000-0000-0000-000000000001", organization_id: ORG_ID, title: "Assembleia Geral Ordinária 2025",             description: "Relatório pastoral/financeiro, eleição diretoria e aprovação construção novo templo.",  assembly_date: "2025-11-28", starts_at: "2025-11-28T19:30:00", ends_at: "2025-11-28T22:30:00", is_visible: true },
    { id: "dd00000d-0000-0000-0000-000000000002", organization_id: ORG_ID, title: "Assembleia Extraordinária — Crédito de Obra", description: "Votação para aprovação de crédito para aceleração da obra do novo templo.",              assembly_date: "2026-03-15", starts_at: "2026-03-15T19:00:00", ends_at: "2026-03-15T21:30:00", is_visible: true },
    { id: "dd00000d-0000-0000-0000-000000000003", organization_id: ORG_ID, title: "Assembleia Geral Ordinária 2026",             description: "Relatório semestral, calendário de missões e plano de ação 2º semestre.",              assembly_date: "2026-07-26", starts_at: "2026-07-26T19:00:00", ends_at: "2026-07-26T22:00:00", is_visible: true },
  ];
  counts.assemblies = await insertRows("assemblies", assemblies, "assembleias");

  // ----------------------------------------------------------
  // 12 — Comunicados (5)
  // ----------------------------------------------------------
  sep("12 — Comunicados (5)");
  const communications = [
    { id: "dd00000e-0000-0000-0000-000000000001", organization_id: ORG_ID, title: "Campanha de Dízimos — Construção do Novo Templo", content: "Irmãos, a obra do nosso novo templo avança. Participem da campanha de dízimos. Meta 2º semestre: R$ 80.000.",  communication_type: "Importante", is_public: true,  published_at: new Date(Date.now() - 10*864e5).toISOString() },
    { id: "dd00000e-0000-0000-0000-000000000002", organization_id: ORG_ID, title: "Santa Ceia — 28 de Junho",                       content: "Convidamos todos os membros em plena comunhão para a Santa Ceia, dia 28/06 às 19h. Venha preparado!",              communication_type: "Normal",     is_public: true,  published_at: new Date(Date.now() -  5*864e5).toISOString() },
    { id: "dd00000e-0000-0000-0000-000000000003", organization_id: ORG_ID, title: "Convocação: Reunião de Obreiros — 18/06",        content: "Presença obrigatória de todos os obreiros e líderes na reunião de planejamento do 2º semestre, 18/06 às 19h.",    communication_type: "Importante", is_public: false, published_at: new Date(Date.now() -  8*864e5).toISOString() },
    { id: "dd00000e-0000-0000-0000-000000000004", organization_id: ORG_ID, title: "Atualização de Cadastro — Prazo: 30/06",         content: "Membros devem atualizar cadastro na secretaria até 30/06. Documentos: foto + comprovante. Seg-Sex 9h–17h.",         communication_type: "Normal",     is_public: true,  published_at: new Date(Date.now() - 15*864e5).toISOString() },
    { id: "dd00000e-0000-0000-0000-000000000005", organization_id: ORG_ID, title: "Conferência de Jovens 2026 — Inscrições Abertas",content: "Conferência de Jovens 2026 confirmada! Inscreva-se até 10/07. Vagas limitadas.",                                      communication_type: "Normal",     is_public: true,  published_at: new Date(Date.now() -  3*864e5).toISOString() },
  ];
  counts.communications = await insertRows("communications", communications, "comunicados");

  // ----------------------------------------------------------
  // 13 — Pedidos de Oração (6)
  // ----------------------------------------------------------
  sep("13 — Pedidos de Oração (6)");
  const prayers = [
    { id: "dd00000f-0000-0000-0000-000000000001", organization_id: ORG_ID, title: "Cura de Margarida Ferrari",          description: "Pedido pela irmã em tratamento de saúde. Oração por restauração e paz.",                      is_private: false, status: "Ativo"      },
    { id: "dd00000f-0000-0000-0000-000000000002", organization_id: ORG_ID, title: "Obras do Novo Templo",               description: "Intercessão para Deus guiar a construção do novo templo.",                                   is_private: false, status: "Ativo"      },
    { id: "dd00000f-0000-0000-0000-000000000003", organization_id: ORG_ID, title: "Provisão para família Maran",        description: "Rodrigo Maran desempregado há 2 meses. Oração por provisão.",                                is_private: false, status: "Ativo"      },
    { id: "dd00000f-0000-0000-0000-000000000004", organization_id: ORG_ID, title: "Missão África — proteção",           description: "Equipe missionária em Moçambique: proteção e frutos evangelísticos.",                       is_private: false, status: "Ativo"      },
    { id: "dd00000f-0000-0000-0000-000000000005", organization_id: ORG_ID, title: "Reconciliação familiar Volpato",     description: "Pedido reservado de restauração familiar.",                                                  is_private: true,  status: "Ativo"      },
    { id: "dd00000f-0000-0000-0000-000000000006", organization_id: ORG_ID, title: "Agradecimento — recuperação Cominetto", description: "Antonio Cominetto recebeu alta hospitalar. Deus é fiel!",                               is_private: false, status: "Respondido" },
  ];
  counts.prayers = await insertRows("prayer_requests", prayers, "pedidos de oração");

  // ----------------------------------------------------------
  // 14 — Chat da Secretaria — Threads (4) + Mensagens (12)
  // ----------------------------------------------------------
  sep("14 — Chat da Secretaria: Threads");
  const TH1 = "dd000014-0000-0000-0000-000000000001";
  const TH2 = "dd000014-0000-0000-0000-000000000002";
  const TH3 = "dd000014-0000-0000-0000-000000000003";
  const TH4 = "dd000014-0000-0000-0000-000000000004";
  const threads = [
    { id: TH1, organization_id: ORG_ID, subject: "Secretaria Geral",          source: "secretariat", status: "open",   reply_enabled: true, created_at: new Date(Date.now() - 7*864e5).toISOString() },
    { id: TH2, organization_id: ORG_ID, subject: "Tesouraria e Financeiro",    source: "secretariat", status: "open",   reply_enabled: true, created_at: new Date(Date.now() - 5*864e5).toISOString() },
    { id: TH3, organization_id: ORG_ID, subject: "Cartas de Recomendação",     source: "secretariat", status: "open",   reply_enabled: true, created_at: new Date(Date.now() - 3*864e5).toISOString() },
    { id: TH4, organization_id: ORG_ID, subject: "Documentos e Cadastros",     source: "secretariat", status: "closed", reply_enabled: false, closed_at: new Date(Date.now() - 1*864e5).toISOString(), created_at: new Date(Date.now() - 10*864e5).toISOString() },
  ];
  counts.secretariatThreads = await insertRows("internal_threads", threads, "threads secretaria");

  sep("14b — Chat da Secretaria: Mensagens");
  const msgs = [
    { id: "dd000014-0001-0000-0000-000000000001", thread_id: TH1, organization_id: ORG_ID, sender_role: "secretary", body: "Favor conferir o cadastro do irmão Marcos antes da emissão da carta.", message_type: "text", created_at: new Date(Date.now() - 6*864e5).toISOString() },
    { id: "dd000014-0001-0000-0000-000000000002", thread_id: TH1, organization_id: ORG_ID, sender_role: "admin",     body: "Verificado. Cadastro está completo e atualizado.", message_type: "text", created_at: new Date(Date.now() - 6*864e5 + 36e5).toISOString() },
    { id: "dd000014-0001-0000-0000-000000000003", thread_id: TH1, organization_id: ORG_ID, sender_role: "secretary", body: "Reunião de obreiros confirmada para quinta-feira às 19h.", message_type: "text", created_at: new Date(Date.now() - 5*864e5).toISOString() },
    { id: "dd000014-0001-0000-0000-000000000004", thread_id: TH2, organization_id: ORG_ID, sender_role: "treasurer", body: "Tesouraria solicitou conferência do relatório mensal.", message_type: "text", created_at: new Date(Date.now() - 4*864e5).toISOString() },
    { id: "dd000014-0001-0000-0000-000000000005", thread_id: TH2, organization_id: ORG_ID, sender_role: "secretary", body: "Relatório enviado. Total de entradas: R$ 54.000 / Saídas: R$ 23.620.", message_type: "text", created_at: new Date(Date.now() - 4*864e5 + 72e5).toISOString() },
    { id: "dd000014-0001-0000-0000-000000000006", thread_id: TH2, organization_id: ORG_ID, sender_role: "admin",     body: "Recebido. Aprovar o fechamento mensal?", message_type: "text", created_at: new Date(Date.now() - 3*864e5).toISOString() },
    { id: "dd000014-0001-0000-0000-000000000007", thread_id: TH3, organization_id: ORG_ID, sender_role: "secretary", body: "Carta de recomendação da irmã Fernanda já foi aprovada.", message_type: "text", created_at: new Date(Date.now() - 2*864e5).toISOString() },
    { id: "dd000014-0001-0000-0000-000000000008", thread_id: TH3, organization_id: ORG_ID, sender_role: "pastor",    body: "Ótimo. Já assinei digitalmente. Pode enviar ao destinatário.", message_type: "text", created_at: new Date(Date.now() - 2*864e5 + 18e5).toISOString() },
    { id: "dd000014-0001-0000-0000-000000000009", thread_id: TH3, organization_id: ORG_ID, sender_role: "secretary", body: "Pendente: carta para o irmão Rodrigo Maran. Aguardando documentação.", message_type: "text", created_at: new Date(Date.now() - 1*864e5).toISOString() },
    { id: "dd000014-0001-0000-0000-00000000000a", thread_id: TH4, organization_id: ORG_ID, sender_role: "secretary", body: "Documento de atualização cadastral recebido pela secretaria.", message_type: "text", created_at: new Date(Date.now() - 9*864e5).toISOString() },
    { id: "dd000014-0001-0000-0000-00000000000b", thread_id: TH4, organization_id: ORG_ID, sender_role: "admin",     body: "Processar e arquivar. Qualquer divergência, retornar ao membro.", message_type: "text", created_at: new Date(Date.now() - 8*864e5).toISOString() },
    { id: "dd000014-0001-0000-0000-00000000000c", thread_id: TH4, organization_id: ORG_ID, sender_role: "secretary", body: "Concluído. Todos os cadastros atualizados e arquivados.", message_type: "text", created_at: new Date(Date.now() - 7*864e5).toISOString() },
  ];
  counts.secretariatMessages = await insertRows("internal_messages", msgs, "mensagens secretaria");

  // ----------------------------------------------------------
  // 15 — Solicitações Administrativas (12)
  // ----------------------------------------------------------
  sep("15 — Solicitações Administrativas (12)");
  const adminRequests = [
    { id: "dd000015-0000-0000-0000-000000000001", organization_id: ORG_ID, requester_name: "Marcos Antonio Bettega",    request_type: "declaracao_membro",    description: "Solicita declaração de membro ativo para fins de financiamento habitacional.",                    status: "aberta",              created_at: new Date(Date.now() - 2*864e5).toISOString() },
    { id: "dd000015-0000-0000-0000-000000000002", organization_id: ORG_ID, requester_name: "Fernanda Tonetto",           request_type: "atualizacao_cadastral", description: "Atualização de endereço e telefone após mudança de bairro.",                                     status: "aberta",              created_at: new Date(Date.now() - 1*864e5).toISOString() },
    { id: "dd000015-0000-0000-0000-000000000003", organization_id: ORG_ID, requester_name: "Paulo Antoniazzi",           request_type: "solicitacao_geral",     description: "Solicita informações sobre agenda de atendimento pastoral.",                                    status: "aberta",              created_at: new Date(Date.now() - 3*864e5).toISOString() },
    { id: "dd000015-0000-0000-0000-000000000004", organization_id: ORG_ID, requester_name: "Ana Paula Zanella",          request_type: "segunda_via",           description: "Segunda via do cartão de membro. Original extraviado.",                                          status: "em_analise",          internal_notes: "Aguardar confirmação de identidade presencial.", created_at: new Date(Date.now() - 5*864e5).toISOString() },
    { id: "dd000015-0000-0000-0000-000000000005", organization_id: ORG_ID, requester_name: "Leandro Basso",              request_type: "contato_pastoral",      description: "Precisa de orientação pastoral para situação familiar.",                                         status: "em_analise",          internal_notes: "Agendado para conversa reservada.", created_at: new Date(Date.now() - 4*864e5).toISOString() },
    { id: "dd000015-0000-0000-0000-000000000006", organization_id: ORG_ID, requester_name: "Simone Polesso",             request_type: "atualizacao_cadastral", description: "Atualização do estado civil após casamento em 03/05/2026.",                                    status: "em_analise",          created_at: new Date(Date.now() - 6*864e5).toISOString() },
    { id: "dd000015-0000-0000-0000-000000000007", organization_id: ORG_ID, requester_name: "Rodrigo Maran",              request_type: "declaracao_membro",     description: "Declaração para apresentação em assembleia condominial.",                                       status: "aguardando_documento", internal_notes: "Solicitar foto 3x4 atualizada.", created_at: new Date(Date.now() - 10*864e5).toISOString() },
    { id: "dd000015-0000-0000-0000-000000000008", organization_id: ORG_ID, requester_name: "Cristiane Degasperi",        request_type: "segunda_via",           description: "Segunda via do histórico de batismo. Documento necessário para transferência.",                 status: "aguardando_documento", internal_notes: "Membro deve trazer testemunho de dois membros antigos.", created_at: new Date(Date.now() - 8*864e5).toISOString() },
    { id: "dd000015-0000-0000-0000-000000000009", organization_id: ORG_ID, requester_name: "Thiago Volpato",             request_type: "atualizacao_cadastral", description: "Atualização de dados por mudança de cidade. Nova cidade: Porto Alegre/RS.",                    status: "concluida",            completed_at: new Date(Date.now() - 12*864e5).toISOString(), created_at: new Date(Date.now() - 14*864e5).toISOString() },
    { id: "dd000015-0000-0000-0000-00000000000a", organization_id: ORG_ID, requester_name: "Camila Dallacosta",          request_type: "declaracao_membro",     description: "Declaração de membro para inscrição em curso de formação ministerial.",                       status: "concluida",            completed_at: new Date(Date.now() - 7*864e5).toISOString(), created_at: new Date(Date.now() - 9*864e5).toISOString() },
    { id: "dd000015-0000-0000-0000-00000000000b", organization_id: ORG_ID, requester_name: "Anderson Cominetto",         request_type: "contato_pastoral",      description: "Solicitou visita domiciliar após alta hospitalar.",                                              status: "concluida",            completed_at: new Date(Date.now() - 3*864e5).toISOString(), created_at: new Date(Date.now() - 13*864e5).toISOString() },
    { id: "dd000015-0000-0000-0000-00000000000c", organization_id: ORG_ID, requester_name: "Elisangela Mantovani",       request_type: "solicitacao_geral",     description: "Solicitação de uso do salão para evento de casamento. Fora do padrão da política.", status: "rejeitada",            internal_notes: "Salão é exclusivo para atividades ministeriais.", completed_at: new Date(Date.now() - 4*864e5).toISOString(), created_at: new Date(Date.now() - 6*864e5).toISOString() },
  ];
  counts.adminRequests = await insertRows("administrative_requests", adminRequests, "solicitações administrativas");

  // ----------------------------------------------------------
  // RESUMO FINAL
  // ----------------------------------------------------------
  console.log("\n" + "═".repeat(54));
  console.log("  RESULTADO FINAL");
  console.log("═".repeat(54));

  const critical = ["sectors", "members", "letters"];
  let criticalFailed = false;
  const table = [
    ["Setores",              counts.sectors,              5],
    ["Congregações",         counts.congregations,       10],
    ["Membros",              counts.members,             25],
    ["Cartas",               counts.letters,              5],
    ["Contas fin.",          counts.accounts,             5],
    ["Categorias fin.",      counts.categories,           8],
    ["Centros de custo",     counts.costCenters,          4],
    ["Transações",           counts.transactions,        30],
    ["Documentos",           counts.documents,            6],
    ["Eventos",              counts.events,               8],
    ["Escalas",              counts.schedules,            7],
    ["Grupos",               counts.groups,               5],
    ["Membros de grupos",    counts.groupMembers,        25],
    ["Assembleias",          counts.assemblies,           3],
    ["Comunicados",          counts.communications,       5],
    ["Pedidos oração",       counts.prayers,              6],
    ["Threads secretaria",   counts.secretariatThreads,   4],
    ["Msgs secretaria",      counts.secretariatMessages, 12],
    ["Solicitações adm.",    counts.adminRequests,       12],
  ];

  const errorSections = [];

  for (const [label, result, expected] of table) {
    if (!result) {
      console.log(`  ⚠️  ${label.padEnd(22)} — sem resultado`);
      continue;
    }
    if (result.error) {
      console.log(`  ❌  ${label.padEnd(22)} ERRO: ${result.error}`);
      errorSections.push(`${label}: ${result.error}`);
    } else if (result.inserted > 0) {
      console.log(`  ✅  ${label.padEnd(22)} ${result.inserted} novo(s) [${result.skipped} já existiam, esperado: ${expected}]`);
    } else {
      console.log(`  ℹ️   ${label.padEnd(22)} ${result.skipped} já existiam (0 novos) [esperado: ${expected}]`);
    }
  }

  // Verificar falhas críticas: erro de constraint OU zero registros em tabelas obrigatórias
  const failedCritical = [];

  if (counts.members?.error)
    failedCritical.push(`membros — erro: ${counts.members.error}`);
  else if ((counts.members?.inserted ?? 0) === 0 && (counts.members?.skipped ?? 0) === 0)
    failedCritical.push("membros — 0 registros");

  if (counts.sectors?.error)
    failedCritical.push(`setores — erro: ${counts.sectors.error}`);
  else if ((counts.sectors?.inserted ?? 0) === 0 && (counts.sectors?.skipped ?? 0) === 0)
    failedCritical.push("setores — 0 registros");

  if (counts.letters?.error)
    failedCritical.push(`cartas — erro: ${counts.letters.error}`);
  else if ((counts.letters?.inserted ?? 0) === 0 && (counts.letters?.skipped ?? 0) === 0)
    failedCritical.push("cartas — 0 registros");

  if (counts.groupMembers?.error)
    failedCritical.push(`membros de grupos — erro: ${counts.groupMembers.error}`);

  console.log("═".repeat(54));

  // Qualquer erro impede "sucesso"
  if (errorSections.length > 0 || failedCritical.length > 0) {
    const all = [...new Set([...failedCritical, ...errorSections])];
    console.error(`\n❌  SEED COM FALHAS (${all.length} seção(ões) com erro):`);
    for (const msg of all) console.error(`    • ${msg}`);
    console.error("    Verifique os logs acima e corrija antes de usar no app.");
    process.exit(1);
  }

  console.log("\n✅  Seed concluído sem erros!");
  console.log(`    Acesse o app como Admin Municipal Caxias para verificar.`);
  console.log(`    Org: ${ORG_ID}\n`);
}

// process.exit(0) explícito evita o crash "UV_HANDLE_CLOSING" do Node.js
// causado pelo cliente Supabase manter conexões HTTP abertas após terminar.
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌  Erro inesperado:", e?.message ?? e);
    process.exit(1);
  });
