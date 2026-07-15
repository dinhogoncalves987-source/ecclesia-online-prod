/**
 * seed-full-demo.mjs — Seed completo de demo para todos os módulos
 * ================================================================
 * USO:
 *   npm run demo:seed-full
 *   # ou:
 *   $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."; npm run demo:seed-full
 *
 * Org base: 10000000-0000-0000-0000-000000000002 (Matriz Municipal Caxias do Sul)
 *
 * Cobre: Organizações, Membros, Campanhas, Músicas, Agenda, Escalas,
 *        Grupos, Assembleias, Documentos, Cartas, Comunicados, Financeiro
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { assertSafeToSeedStagingFromProcessEnv, SeedGuardError } from "./lib/seedGuard.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// --- Env loader ---
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*["']?([^"'\n]+?)["']?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const dotenv = {
  ...loadEnvFile(path.join(ROOT, ".env")),
  ...loadEnvFile(path.join(ROOT, ".env.staging")),
  ...loadEnvFile(path.join(ROOT, ".env.local")),
};

const SUPABASE_URL = (process.env.SUPABASE_URL || dotenv.SUPABASE_URL || dotenv.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || dotenv.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("❌ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.");
  console.error("   Passe via: $env:SUPABASE_SERVICE_ROLE_KEY='eyJ...'; npm run demo:seed-full");
  process.exit(1);
}

// Guarda de ambiente — recusa produção e exige confirmação explícita.
// Requer: APP_ENV=staging e SEED_STAGING="SEED_STAGING" no ambiente.
try {
  assertSafeToSeedStagingFromProcessEnv({ supabaseUrl: SUPABASE_URL });
} catch (err) {
  if (err instanceof SeedGuardError) {
    console.error(`\n❌ ${err.message}\n`);
    process.exit(1);
  }
  throw err;
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── IDs base ────────────────────────────────────────────────────────────────
const MATRIZ_ID = "10000000-0000-0000-0000-000000000002";

// Setores
const SETOR_A = "dd000010-0000-0000-0000-000000000001";
const SETOR_B = "dd000010-0000-0000-0000-000000000002";
const SETOR_C = "dd000010-0000-0000-0000-000000000003";
const SETOR_D = "dd000010-0000-0000-0000-000000000004";
const SETOR_E = "dd000010-0000-0000-0000-000000000005";

// Congregações (2 por setor)
const CONG_A1 = "dd000020-0000-0000-0000-000000000001";
const CONG_A2 = "dd000020-0000-0000-0000-000000000002";
const CONG_B1 = "dd000020-0000-0000-0000-000000000003";
const CONG_B2 = "dd000020-0000-0000-0000-000000000004";
const CONG_C1 = "dd000020-0000-0000-0000-000000000005";
const CONG_C2 = "dd000020-0000-0000-0000-000000000006";
const CONG_D1 = "dd000020-0000-0000-0000-000000000007";
const CONG_D2 = "dd000020-0000-0000-0000-000000000008";
const CONG_E1 = "dd000020-0000-0000-0000-000000000009";
const CONG_E2 = "dd000020-0000-0000-0000-000000000010";

// Membros (30 membros com dados completos)
const MEM_IDS = Array.from({ length: 30 }, (_, i) => `dd000030-0000-0000-0000-${String(i + 1).padStart(12, "0")}`);

// Campanhas
const CAMP_IDS = Array.from({ length: 6 }, (_, i) => `dd000040-0000-0000-0000-${String(i + 1).padStart(12, "0")}`);

// Músicas
const SONG_IDS = Array.from({ length: 15 }, (_, i) => `dd000050-0000-0000-0000-${String(i + 1).padStart(12, "0")}`);

// Eventos
const EVT_IDS = Array.from({ length: 12 }, (_, i) => `dd000060-0000-0000-0000-${String(i + 1).padStart(12, "0")}`);

// Grupos
const GRP_IDS = Array.from({ length: 5 }, (_, i) => `dd000070-0000-0000-0000-${String(i + 1).padStart(12, "0")}`);

// ── Utilitários ──────────────────────────────────────────────────────────────
let errors = [];
let results = {};

async function count(table, filter = {}) {
  let q = supabase.from(table).select("id", { count: "exact", head: true });
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { count: n } = await q;
  return n ?? 0;
}

async function upsert(table, rows, opts = {}) {
  if (!rows.length) return 0;
  const { error } = await supabase.from(table).upsert(rows, { onConflict: "id", ...opts });
  if (error) {
    console.error(`  ❌ ${table}: ${error.message}`);
    errors.push({ table, error: error.message });
    return 0;
  }
  return rows.length;
}

function today(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
}

// ── SEÇÕES ───────────────────────────────────────────────────────────────────

async function seedOrganizations() {
  console.log("\n📋 Organizações (setores + congregações)...");
  const orgs = [
    // ── Setores — diretos filhos da Matriz ───────────────────────────────────
    { id: SETOR_A, name: "Setor Norte",    slug: "setor-norte-caxias",   organization_type: "setor", parent_id: MATRIZ_ID, city: "Caxias do Sul", state: "RS", active: true },
    { id: SETOR_B, name: "Setor Sul",      slug: "setor-sul-caxias",     organization_type: "setor", parent_id: MATRIZ_ID, city: "Caxias do Sul", state: "RS", active: true },
    { id: SETOR_C, name: "Setor Leste",    slug: "setor-leste-caxias",   organization_type: "setor", parent_id: MATRIZ_ID, city: "Caxias do Sul", state: "RS", active: true },
    { id: SETOR_D, name: "Setor Oeste",    slug: "setor-oeste-caxias",   organization_type: "setor", parent_id: MATRIZ_ID, city: "Caxias do Sul", state: "RS", active: true },
    { id: SETOR_E, name: "Setor Centro",   slug: "setor-centro-caxias",  organization_type: "setor", parent_id: MATRIZ_ID, city: "Caxias do Sul", state: "RS", active: true },
    // ── Congregações do Setor Norte ──────────────────────────────────────────
    { id: CONG_A1, name: "Congregação Santa Fé",    slug: "cong-santa-fe",    organization_type: "congregacao", parent_id: SETOR_A, city: "Caxias do Sul", state: "RS", active: true },
    { id: CONG_A2, name: "Congregação Bela Vista",  slug: "cong-bela-vista",  organization_type: "congregacao", parent_id: SETOR_A, city: "Caxias do Sul", state: "RS", active: true },
    // ── Congregações do Setor Sul ────────────────────────────────────────────
    { id: CONG_B1, name: "Congregação Desvio Rizzo", slug: "cong-desvio-rizzo", organization_type: "congregacao", parent_id: SETOR_B, city: "Caxias do Sul", state: "RS", active: true },
    { id: CONG_B2, name: "Congregação Cruzeiro",    slug: "cong-cruzeiro",    organization_type: "congregacao", parent_id: SETOR_B, city: "Caxias do Sul", state: "RS", active: true },
    // ── Congregações do Setor Leste ──────────────────────────────────────────
    { id: CONG_C1, name: "Congregação Lourdes",     slug: "cong-lourdes",     organization_type: "congregacao", parent_id: SETOR_C, city: "Caxias do Sul", state: "RS", active: true },
    { id: CONG_C2, name: "Congregação São José",    slug: "cong-sao-jose",    organization_type: "congregacao", parent_id: SETOR_C, city: "Caxias do Sul", state: "RS", active: true },
    // ── Congregações do Setor Oeste ──────────────────────────────────────────
    { id: CONG_D1, name: "Congregação Forqueta",    slug: "cong-forqueta",    organization_type: "congregacao", parent_id: SETOR_D, city: "Caxias do Sul", state: "RS", active: true },
    { id: CONG_D2, name: "Congregação Ana Rech",    slug: "cong-ana-rech",    organization_type: "congregacao", parent_id: SETOR_D, city: "Caxias do Sul", state: "RS", active: true },
    // ── Congregações do Setor Centro ─────────────────────────────────────────
    { id: CONG_E1, name: "Congregação Centro",      slug: "cong-centro",      organization_type: "congregacao", parent_id: SETOR_E, city: "Caxias do Sul", state: "RS", active: true },
    { id: CONG_E2, name: "Congregação São Pelegrino", slug: "cong-sao-pelegrino", organization_type: "congregacao", parent_id: SETOR_E, city: "Caxias do Sul", state: "RS", active: true },
  ];
  const n = await upsert("organizations", orgs);
  results["Setores"] = 5;
  results["Congregações"] = 10;
  console.log(`  ✅ ${n} organizações upserted`);
}

async function seedMembers() {
  console.log("\n👥 Membros...");

  // Todos os membros têm organization_id = MATRIZ_ID (vínculo de registro com a matriz).
  // congregation_id / sector_id identificam onde cada membro congrega localmente.
  // member_role = função eclesiástica | administrative_role = cargo administrativo
  const members = [
    // ── Liderança da Matriz ───────────────────────────────────────────────────
    {
      id: MEM_IDS[0], organization_id: MATRIZ_ID,
      full_name: "Rev. João Pedro Oliveira", member_role: "Pastor", administrative_role: "Pastor Presidente",
      status: "Ativo", phone: "(54) 99101-0001", whatsapp: "(54) 99101-0001",
      email: "joao.pedro@ecclesia.demo", gender: "Masculino", marital_status: "Casado(a)",
      birth_date: "1968-03-15", joined_at: "2003-01-12", baptized_at: "1987-06-22",
      conversion_date: "1985-04-10", congregation_id: MATRIZ_ID, sector_id: null,
      cpf: "101.202.303-01", rg: "1234567", rg_issuer: "SSP/RS",
      father_name: "Pedro Antônio Oliveira", mother_name: "Maria José Oliveira",
      street: "Rua Flores da Cunha", address_number: "450", neighborhood: "Centro",
      city: "Caxias do Sul", state: "RS", zip_code: "95010-001",
      notes: "Pastor presidente da Matriz Municipal desde 2003.",
    },
    {
      id: MEM_IDS[1], organization_id: MATRIZ_ID,
      full_name: "Irmã Maria Clara Santos", member_role: "Diácono", administrative_role: "Secretário",
      status: "Ativo", phone: "(54) 99101-0002", whatsapp: "(54) 99101-0002",
      email: "maria.clara@ecclesia.demo", gender: "Feminino", marital_status: "Casado(a)",
      birth_date: "1975-07-20", joined_at: "2008-03-05", baptized_at: "1993-08-14",
      conversion_date: "1992-02-28", congregation_id: MATRIZ_ID, sector_id: null,
      cpf: "102.203.304-02", rg: "2345678", rg_issuer: "SSP/RS",
      father_name: "Antônio Carlos Santos", mother_name: "Lúcia Maria Santos",
      street: "Av. Júlio de Castilhos", address_number: "1200", neighborhood: "São Pelegrino",
      city: "Caxias do Sul", state: "RS", zip_code: "95020-001",
      notes: "Secretária eclesiástica — responsável pelo registro de membros.",
    },
    {
      id: MEM_IDS[2], organization_id: MATRIZ_ID,
      full_name: "Pb. Carlos Eduardo Lima", member_role: "Presbítero", administrative_role: "Tesoureiro",
      status: "Ativo", phone: "(54) 99101-0003", whatsapp: "(54) 99101-0003",
      email: "carlos.lima@ecclesia.demo", gender: "Masculino", marital_status: "Casado(a)",
      birth_date: "1972-11-08", joined_at: "2005-06-18", baptized_at: "1990-12-03",
      conversion_date: "1989-09-15", congregation_id: MATRIZ_ID, sector_id: null,
      cpf: "103.204.305-03", rg: "3456789", rg_issuer: "SSP/RS",
      father_name: "Eduardo Lima Neto", mother_name: "Alzira Pereira Lima",
      street: "Rua Sinimbu", address_number: "320", neighborhood: "Exposição",
      city: "Caxias do Sul", state: "RS", zip_code: "95030-001",
      notes: "Presbítero e tesoureiro da Matriz Municipal.",
    },
    {
      id: MEM_IDS[3], organization_id: MATRIZ_ID,
      full_name: "Irmã Ana Paula Zanella", member_role: "Obreiro", administrative_role: "Administrador",
      status: "Ativo", phone: "(54) 99101-0004", whatsapp: "(54) 99101-0004",
      email: "ana.zanella@ecclesia.demo", gender: "Feminino", marital_status: "Solteiro(a)",
      birth_date: "1985-02-14", joined_at: "2012-09-22", baptized_at: "2001-03-11",
      conversion_date: "2000-07-04", congregation_id: MATRIZ_ID, sector_id: null,
      cpf: "104.205.306-04", rg: "4567890", rg_issuer: "SSP/RS",
      street: "Rua Ernesto Alves", address_number: "88", neighborhood: "Jardim América",
      city: "Caxias do Sul", state: "RS", zip_code: "95040-001",
    },
    // ── Pastores Setoriais ────────────────────────────────────────────────────
    {
      id: MEM_IDS[4], organization_id: MATRIZ_ID,
      full_name: "Pr. Fernando Henrique Souza", member_role: "Pastor", administrative_role: "Pastor Setorial",
      status: "Ativo", phone: "(54) 99101-0005", whatsapp: "(54) 99101-0005",
      email: "fernando.souza@ecclesia.demo", gender: "Masculino", marital_status: "Casado(a)",
      birth_date: "1970-05-22", joined_at: "2001-04-08", baptized_at: "1989-07-19",
      conversion_date: "1987-11-30", congregation_id: null, sector_id: SETOR_A,
      cpf: "105.206.307-05", rg: "5678901", rg_issuer: "SSP/RS",
      street: "Rua Lauro Müller", address_number: "550", neighborhood: "Nossa Senhora das Graças",
      city: "Caxias do Sul", state: "RS", zip_code: "95050-001",
      notes: "Pastor responsável pelo Setor Norte.",
    },
    {
      id: MEM_IDS[5], organization_id: MATRIZ_ID,
      full_name: "Pr. Marcelo Augusto Gomes", member_role: "Pastor", administrative_role: "Pastor Setorial",
      status: "Ativo", phone: "(54) 99101-0006", whatsapp: "(54) 99101-0006",
      email: "marcelo.gomes@ecclesia.demo", gender: "Masculino", marital_status: "Casado(a)",
      birth_date: "1973-09-17", joined_at: "2004-02-14", baptized_at: "1991-05-06",
      conversion_date: "1990-01-20", congregation_id: null, sector_id: SETOR_B,
      cpf: "106.207.308-06", rg: "6789012", rg_issuer: "SSP/RS",
      street: "Rua Dom Pedro II", address_number: "730", neighborhood: "Cruzeiro",
      city: "Caxias do Sul", state: "RS", zip_code: "95060-001",
      notes: "Pastor responsável pelo Setor Sul.",
    },
    // ── Membros nas Congregações ──────────────────────────────────────────────
    {
      id: MEM_IDS[6], organization_id: MATRIZ_ID,
      full_name: "Lucas Andrade Costa", member_role: "Diácono", administrative_role: "Líder de Jovens",
      status: "Ativo", phone: "(54) 99101-0007", whatsapp: "(54) 99101-0007",
      email: "lucas.costa@ecclesia.demo", gender: "Masculino", marital_status: "Casado(a)",
      birth_date: "1990-12-03", joined_at: "2015-01-18", baptized_at: "2008-09-27",
      conversion_date: "2007-03-12", congregation_id: CONG_A1, sector_id: SETOR_A,
      cpf: "107.208.309-07", rg: "7890123", rg_issuer: "SSP/RS",
      street: "Rua Coberta", address_number: "215", neighborhood: "Vila Nova",
      city: "Caxias do Sul", state: "RS", zip_code: "95070-001",
    },
    {
      id: MEM_IDS[7], organization_id: MATRIZ_ID,
      full_name: "Juliana Beatriz Alves", member_role: "Membro", administrative_role: null,
      status: "Ativo", phone: "(54) 99101-0008", whatsapp: "(54) 99101-0008",
      email: "juliana.alves@ecclesia.demo", gender: "Feminino", marital_status: "Casado(a)",
      birth_date: "1992-04-25", joined_at: "2016-08-10", baptized_at: "2010-11-14",
      conversion_date: "2009-06-05", congregation_id: CONG_A1, sector_id: SETOR_A,
      cpf: "108.209.310-08", rg: "8901234", rg_issuer: "SSP/RS",
      street: "Rua Coberta", address_number: "217", neighborhood: "Vila Nova",
      city: "Caxias do Sul", state: "RS", zip_code: "95070-001",
      notes: "Solicitou transferência para Gramado — processo em andamento.",
    },
    {
      id: MEM_IDS[8], organization_id: MATRIZ_ID,
      full_name: "Roberto Silva Pereira", member_role: "Evangelista", administrative_role: "Líder de Louvor",
      status: "Ativo", phone: "(54) 99101-0009", whatsapp: "(54) 99101-0009",
      email: "roberto.pereira@ecclesia.demo", gender: "Masculino", marital_status: "Solteiro(a)",
      birth_date: "1988-08-31", joined_at: "2013-04-27", baptized_at: "2005-02-20",
      conversion_date: "2004-10-08", congregation_id: CONG_B1, sector_id: SETOR_B,
      cpf: "109.210.311-09", rg: "9012345", rg_issuer: "SSP/RS",
      street: "Av. Marechal Floriano", address_number: "1050", neighborhood: "Panazzolo",
      city: "Caxias do Sul", state: "RS", zip_code: "95080-001",
    },
    {
      id: MEM_IDS[9], organization_id: MATRIZ_ID,
      full_name: "Cristina Aparecida Rodrigues", member_role: "Membro", administrative_role: null,
      status: "Ativo", phone: "(54) 99101-0010", whatsapp: "(54) 99101-0010",
      email: "cristina.rodrigues@ecclesia.demo", gender: "Feminino", marital_status: "Casado(a)",
      birth_date: "1980-01-14", joined_at: "2010-07-03", baptized_at: "1998-04-18",
      conversion_date: "1997-09-25", congregation_id: CONG_B1, sector_id: SETOR_B,
      cpf: "110.211.312-10", rg: "0123456", rg_issuer: "SSP/RS",
      street: "Rua Cristóvão Colombo", address_number: "390", neighborhood: "Bela Vista",
      city: "Caxias do Sul", state: "RS", zip_code: "95090-001",
    },
    {
      id: MEM_IDS[10], organization_id: MATRIZ_ID,
      full_name: "Sandra Lucia Melo", member_role: "Diácono", administrative_role: "Secretário",
      status: "Ativo", phone: "(54) 99101-0011", whatsapp: "(54) 99101-0011",
      email: "sandra.melo@ecclesia.demo", gender: "Feminino", marital_status: "Casado(a)",
      birth_date: "1978-06-09", joined_at: "2009-11-15", baptized_at: "1996-03-24",
      conversion_date: "1995-08-12", congregation_id: CONG_C1, sector_id: SETOR_C,
      cpf: "111.212.313-11", rg: "1234568", rg_issuer: "SSP/RS",
      street: "Rua Gonçalves Dias", address_number: "622", neighborhood: "Lourdes",
      city: "Caxias do Sul", state: "RS", zip_code: "95100-001",
    },
    {
      id: MEM_IDS[11], organization_id: MATRIZ_ID,
      full_name: "Anderson Ricardo Nunes", member_role: "Membro", administrative_role: null,
      status: "Ativo", phone: "(54) 99101-0012", whatsapp: "(54) 99101-0012",
      email: "anderson.nunes@ecclesia.demo", gender: "Masculino", marital_status: "Solteiro(a)",
      birth_date: "1995-10-07", joined_at: "2019-02-24", baptized_at: "2015-06-13",
      conversion_date: "2014-12-01", congregation_id: CONG_C1, sector_id: SETOR_C,
      cpf: "112.213.314-12", rg: "2345679", rg_issuer: "SSP/RS",
      street: "Av. Ipiranga", address_number: "1780", neighborhood: "Ipiranga",
      city: "Caxias do Sul", state: "RS", zip_code: "95110-001",
    },
    {
      id: MEM_IDS[12], organization_id: MATRIZ_ID,
      full_name: "Vanessa Cristina Pinto", member_role: "Obreiro", administrative_role: "Líder de Casais",
      status: "Ativo", phone: "(54) 99101-0013", whatsapp: "(54) 99101-0013",
      email: "vanessa.pinto@ecclesia.demo", gender: "Feminino", marital_status: "Casado(a)",
      birth_date: "1983-03-28", joined_at: "2011-05-09", baptized_at: "2000-10-21",
      conversion_date: "1999-04-15", congregation_id: CONG_D1, sector_id: SETOR_D,
      cpf: "113.214.315-13", rg: "3456780", rg_issuer: "SSP/RS",
      street: "Rua Pinheiro Machado", address_number: "480", neighborhood: "Santa Catarina",
      city: "Caxias do Sul", state: "RS", zip_code: "95120-001",
    },
    {
      id: MEM_IDS[13], organization_id: MATRIZ_ID,
      full_name: "Eduardo Cesar Barbosa", member_role: "Membro", administrative_role: null,
      status: "Ativo", phone: "(54) 99101-0014", whatsapp: "(54) 99101-0014",
      email: "eduardo.barbosa@ecclesia.demo", gender: "Masculino", marital_status: "Casado(a)",
      birth_date: "1987-07-19", joined_at: "2014-10-31", baptized_at: "2005-12-04",
      conversion_date: "2004-08-17", congregation_id: CONG_D1, sector_id: SETOR_D,
      cpf: "114.215.316-14", rg: "4567891", rg_issuer: "SSP/RS",
      street: "Rua Cristóvão Colombo", address_number: "2100", neighborhood: "Ana Rech",
      city: "Caxias do Sul", state: "RS", zip_code: "95130-001",
    },
    {
      id: MEM_IDS[14], organization_id: MATRIZ_ID,
      full_name: "Fernanda Regina Braga", member_role: "Missionário", administrative_role: "Líder Infantil",
      status: "Ativo", phone: "(54) 99101-0015", whatsapp: "(54) 99101-0015",
      email: "fernanda.braga@ecclesia.demo", gender: "Feminino", marital_status: "Casado(a)",
      birth_date: "1979-12-02", joined_at: "2008-07-21", baptized_at: "1997-09-08",
      conversion_date: "1996-05-20", congregation_id: CONG_E1, sector_id: SETOR_E,
      cpf: "115.216.317-15", rg: "5678902", rg_issuer: "SSP/RS",
      street: "Rua Ernesto Alves", address_number: "960", neighborhood: "São José",
      city: "Caxias do Sul", state: "RS", zip_code: "95140-001",
    },
    {
      id: MEM_IDS[15], organization_id: MATRIZ_ID,
      full_name: "Paulo Henrique Moreira", member_role: "Presbítero", administrative_role: "Pastor Local",
      status: "Ativo", phone: "(54) 99101-0016", whatsapp: "(54) 99101-0016",
      email: "paulo.moreira@ecclesia.demo", gender: "Masculino", marital_status: "Casado(a)",
      birth_date: "1966-08-11", joined_at: "1999-11-30", baptized_at: "1984-01-15",
      conversion_date: "1983-06-07", congregation_id: CONG_E1, sector_id: SETOR_E,
      cpf: "116.217.318-16", rg: "6789013", rg_issuer: "SSP/RS",
      street: "Rua Dom Bosco", address_number: "345", neighborhood: "Dom Bosco",
      city: "Caxias do Sul", state: "RS", zip_code: "95150-001",
      notes: "Presbítero e pastor local da Congregação Hosana.",
    },
    // ── Membros em diversas congregações ─────────────────────────────────────
    {
      id: MEM_IDS[16], organization_id: MATRIZ_ID,
      full_name: "Camila Aparecida Vieira", member_role: "Membro", administrative_role: null,
      status: "Ativo", phone: "(54) 99101-0017", whatsapp: "(54) 99101-0017",
      email: "camila.vieira@ecclesia.demo", gender: "Feminino", marital_status: "Solteiro(a)",
      birth_date: "1998-05-16", joined_at: "2020-03-08", baptized_at: "2017-08-26",
      conversion_date: "2016-11-13", congregation_id: CONG_A2, sector_id: SETOR_A,
      cpf: "117.218.319-17", rg: "7890124", rg_issuer: "SSP/RS",
      street: "Rua Coronel Ezequiel", address_number: "55", neighborhood: "Petrópolis",
      city: "Caxias do Sul", state: "RS", zip_code: "95160-001",
    },
    {
      id: MEM_IDS[17], organization_id: MATRIZ_ID,
      full_name: "Rodrigo Augusto Cardoso", member_role: "Auxiliar", administrative_role: null,
      status: "Ativo", phone: "(54) 99101-0018", whatsapp: "(54) 99101-0018",
      email: "rodrigo.cardoso@ecclesia.demo", gender: "Masculino", marital_status: "Casado(a)",
      birth_date: "1993-09-24", joined_at: "2018-06-17", baptized_at: "2012-04-09",
      conversion_date: "2011-10-30", congregation_id: CONG_B2, sector_id: SETOR_B,
      cpf: "118.219.320-18", rg: "8901235", rg_issuer: "SSP/RS",
      street: "Rua Marechal Floriano", address_number: "780", neighborhood: "São Marcos",
      city: "Caxias do Sul", state: "RS", zip_code: "95170-001",
    },
    {
      id: MEM_IDS[18], organization_id: MATRIZ_ID,
      full_name: "Aline Cristina Torres", member_role: "Membro", administrative_role: "Líder de Louvor",
      status: "Ativo", phone: "(54) 99101-0019", whatsapp: "(54) 99101-0019",
      email: "aline.torres@ecclesia.demo", gender: "Feminino", marital_status: "Casado(a)",
      birth_date: "1991-01-07", joined_at: "2017-12-03", baptized_at: "2009-07-18",
      conversion_date: "2008-02-24", congregation_id: CONG_C2, sector_id: SETOR_C,
      cpf: "119.220.321-19", rg: "9012346", rg_issuer: "SSP/RS",
      street: "Rua Marechal Deodoro", address_number: "440", neighborhood: "Jardim Primavera",
      city: "Caxias do Sul", state: "RS", zip_code: "95180-001",
    },
    {
      id: MEM_IDS[19], organization_id: MATRIZ_ID,
      full_name: "Felipe Eduardo Carvalho", member_role: "Membro", administrative_role: null,
      status: "Inativo", phone: "(54) 99101-0020", whatsapp: null,
      email: "felipe.carvalho@ecclesia.demo", gender: "Masculino", marital_status: "Solteiro(a)",
      birth_date: "1996-03-13", joined_at: "2021-04-25", baptized_at: null,
      conversion_date: "2021-04-10", congregation_id: CONG_D2, sector_id: SETOR_D,
      cpf: "120.221.322-20", rg: "0123457", rg_issuer: "SSP/RS",
      street: "Av. Planalto", address_number: "320", neighborhood: "Planalto",
      city: "Caxias do Sul", state: "RS", zip_code: "95190-001",
      notes: "Afastou-se do culto em 2023. Contato pendente pela secretaria.",
    },
    {
      id: MEM_IDS[20], organization_id: MATRIZ_ID,
      full_name: "Mariana Santos Lima", member_role: "Membro", administrative_role: null,
      status: "Visitante", phone: "(54) 99101-0021", whatsapp: "(54) 99101-0021",
      email: "mariana.lima@ecclesia.demo", gender: "Feminino", marital_status: "Solteiro(a)",
      birth_date: "2000-11-29", joined_at: null, baptized_at: null,
      conversion_date: null, congregation_id: CONG_E2, sector_id: SETOR_E,
      cpf: null, rg: null,
      street: "Rua Jacinto Godoy", address_number: "110", neighborhood: "Sagrada Família",
      city: "Caxias do Sul", state: "RS", zip_code: "95200-001",
      notes: "Visitante frequente. Em processo de discipulado.",
    },
    {
      id: MEM_IDS[21], organization_id: MATRIZ_ID,
      full_name: "Gabriel Rodrigues Cruz", member_role: "Membro", administrative_role: null,
      status: "Congregado", phone: "(54) 99101-0022", whatsapp: "(54) 99101-0022",
      email: "gabriel.cruz@ecclesia.demo", gender: "Masculino", marital_status: "Solteiro(a)",
      birth_date: "2003-06-18", joined_at: null, baptized_at: null,
      conversion_date: "2022-07-03", congregation_id: CONG_A2, sector_id: SETOR_A,
      cpf: null, rg: null,
    },
    {
      id: MEM_IDS[22], organization_id: MATRIZ_ID,
      full_name: "Isabela Fernandes Dias", member_role: "Membro", administrative_role: null,
      status: "Ativo", phone: "(54) 99101-0023", whatsapp: "(54) 99101-0023",
      email: "isabela.dias@ecclesia.demo", gender: "Feminino", marital_status: "Solteiro(a)",
      birth_date: "1997-08-22", joined_at: "2022-01-15", baptized_at: "2019-10-05",
      conversion_date: "2018-09-01", congregation_id: CONG_B2, sector_id: SETOR_B,
      cpf: "123.224.325-23", rg: "2345680", rg_issuer: "SSP/RS",
      street: "Rua Marechal Floriano", address_number: "300", neighborhood: "São Marcos",
      city: "Caxias do Sul", state: "RS", zip_code: "95170-001",
    },
    {
      id: MEM_IDS[23], organization_id: MATRIZ_ID,
      full_name: "Thiago Martins Rocha", member_role: "Cooperador", administrative_role: "Líder de Pequeno Grupo",
      status: "Ativo", phone: "(54) 99101-0024", whatsapp: "(54) 99101-0024",
      email: "thiago.rocha@ecclesia.demo", gender: "Masculino", marital_status: "Casado(a)",
      birth_date: "1989-04-11", joined_at: "2016-03-20", baptized_at: "2007-06-17",
      conversion_date: "2006-11-05", congregation_id: CONG_C2, sector_id: SETOR_C,
      cpf: "124.225.326-24", rg: "3456781", rg_issuer: "SSP/RS",
      street: "Rua Pio X", address_number: "680", neighborhood: "Kayser",
      city: "Caxias do Sul", state: "RS", zip_code: "95095-001",
    },
    {
      id: MEM_IDS[24], organization_id: MATRIZ_ID,
      full_name: "Leticia Paula Cunha", member_role: "Membro", administrative_role: null,
      status: "Transferido", phone: "(54) 99101-0025", whatsapp: null,
      email: "leticia.cunha@ecclesia.demo", gender: "Feminino", marital_status: "Casado(a)",
      birth_date: "1984-02-27", joined_at: "2012-11-08", baptized_at: "2002-08-23",
      conversion_date: "2001-04-14", congregation_id: CONG_D1, sector_id: SETOR_D,
      cpf: "125.226.327-25", rg: "4567892", rg_issuer: "SSP/RS",
      notes: "Carta de transferência emitida para AD Porto Alegre em 2024.",
    },
    {
      id: MEM_IDS[25], organization_id: MATRIZ_ID,
      full_name: "Diego Henrique Mendes", member_role: "Membro", administrative_role: null,
      status: "Em disciplina", phone: "(54) 99101-0026", whatsapp: null,
      email: "diego.mendes@ecclesia.demo", gender: "Masculino", marital_status: "Solteiro(a)",
      birth_date: "1994-10-31", joined_at: "2018-08-12", baptized_at: "2014-05-25",
      conversion_date: "2013-09-08", congregation_id: CONG_E1, sector_id: SETOR_E,
      cpf: "126.227.328-26", rg: "5678903", rg_issuer: "SSP/RS",
      notes: "Em processo disciplinar conforme resolução do conselho pastoral.",
    },
    {
      id: MEM_IDS[26], organization_id: MATRIZ_ID,
      full_name: "Natalia Aparecida Freitas", member_role: "Membro", administrative_role: null,
      status: "Afastado", phone: "(54) 99101-0027", whatsapp: "(54) 99101-0027",
      email: "natalia.freitas@ecclesia.demo", gender: "Feminino", marital_status: "Casado(a)",
      birth_date: "1986-07-03", joined_at: "2014-05-19", baptized_at: "2004-12-11",
      conversion_date: "2003-08-22", congregation_id: CONG_A1, sector_id: SETOR_A,
      cpf: "127.228.329-27", rg: "6789014", rg_issuer: "SSP/RS",
      notes: "Afastada por motivo de saúde. Acompanhamento pastoral em andamento.",
    },
    {
      id: MEM_IDS[27], organization_id: MATRIZ_ID,
      full_name: "Bruno Cesar Ribeiro", member_role: "Membro", administrative_role: null,
      status: "Falecido", phone: null, whatsapp: null,
      email: null, gender: "Masculino", marital_status: "Casado(a)",
      birth_date: "1945-03-15", joined_at: "1985-06-30", baptized_at: "1984-09-14",
      conversion_date: "1983-12-01", congregation_id: MATRIZ_ID, sector_id: null,
      cpf: "128.229.330-28", rg: "7890125", rg_issuer: "SSP/RS",
      father_name: "Cesar Ribeiro", mother_name: "Olga Ribeiro",
      notes: "In memoriam. Membro histórico da Matriz desde a fundação.",
    },
    {
      id: MEM_IDS[28], organization_id: MATRIZ_ID,
      full_name: "Larissa Cristina Campos", member_role: "Membro", administrative_role: "Líder de Jovens",
      status: "Ativo", phone: "(54) 99101-0029", whatsapp: "(54) 99101-0029",
      email: "larissa.campos@ecclesia.demo", gender: "Feminino", marital_status: "Solteiro(a)",
      birth_date: "1999-09-07", joined_at: "2021-07-04", baptized_at: "2018-11-17",
      conversion_date: "2017-08-30", congregation_id: CONG_B1, sector_id: SETOR_B,
      cpf: "129.230.331-29", rg: "8901236", rg_issuer: "SSP/RS",
      street: "Rua Marcelino Ramos", address_number: "190", neighborhood: "Santa Lúcia",
      city: "Caxias do Sul", state: "RS", zip_code: "95085-001",
    },
    {
      id: MEM_IDS[29], organization_id: MATRIZ_ID,
      full_name: "Rafael Eduardo Araújo", member_role: "Diácono", administrative_role: "Contador",
      status: "Ativo", phone: "(54) 99101-0030", whatsapp: "(54) 99101-0030",
      email: "rafael.araujo@ecclesia.demo", gender: "Masculino", marital_status: "Casado(a)",
      birth_date: "1981-11-20", joined_at: "2010-02-28", baptized_at: "1999-07-11",
      conversion_date: "1998-03-17", congregation_id: CONG_C1, sector_id: SETOR_C,
      cpf: "130.231.332-30", rg: "9012347", rg_issuer: "SSP/RS",
      street: "Rua Ramiro Barcelos", address_number: "620", neighborhood: "Pioneiro",
      city: "Caxias do Sul", state: "RS", zip_code: "95095-200",
    },
  ];

  const n = await upsert("members", members);
  results["Membros"] = n;
  console.log(`  ✅ ${n} membros upserted`);
}

async function seedCampaigns() {
  console.log("\n🎯 Campanhas...");
  const campaigns = [
    { id: CAMP_IDS[0], organization_id: MATRIZ_ID, title: "Reforma do Templo Central", description: "Reforma completa do templo sede com novo telhado e pintura.", goal_amount: 85000, current_amount: 54300, status: "active", campaign_type: "construction", start_date: today(-60), end_date: today(120) },
    { id: CAMP_IDS[1], organization_id: MATRIZ_ID, title: "Missões Nacionais 2025", description: "Apoio a missionários em regiões carentes do Brasil.", goal_amount: 30000, current_amount: 22150, status: "active", campaign_type: "missions", start_date: today(-30), end_date: today(60) },
    { id: CAMP_IDS[2], organization_id: MATRIZ_ID, title: "Campanha de Evangelismo", description: "Distribuição de materiais e eventos de evangelismo na cidade.", goal_amount: 15000, current_amount: 15000, status: "completed", campaign_type: "evangelism", start_date: today(-180), end_date: today(-30) },
    { id: CAMP_IDS[3], organization_id: MATRIZ_ID, title: "Fundo Social — Famílias", description: "Cestas básicas e apoio financeiro a famílias em vulnerabilidade.", goal_amount: 20000, current_amount: 8700, status: "active", campaign_type: "social", start_date: today(-15), end_date: today(90) },
    { id: CAMP_IDS[4], organization_id: MATRIZ_ID, title: "Equipamentos de Louvor", description: "Aquisição de instrumentos e sistema de som profissional.", goal_amount: 45000, current_amount: 31200, status: "active", campaign_type: "general", start_date: today(-45), end_date: today(75) },
    { id: CAMP_IDS[5], organization_id: MATRIZ_ID, title: "Campanha Bíblia para Todos", description: "Distribuição de Bíblias para novos membros e visitantes.", goal_amount: 8000, current_amount: 8000, status: "completed", campaign_type: "general", start_date: today(-120), end_date: today(-10) },
  ];
  const n = await upsert("campaigns", campaigns);
  results["Campanhas"] = n;
  console.log(`  ✅ ${n} campanhas upserted`);
}

async function seedSongs() {
  console.log("\n🎵 Músicas (Culto & Louvor)...");
  const songs = [
    { id: SONG_IDS[0], organization_id: MATRIZ_ID, title: "Grande é o Senhor", artist: "Adhemar de Campos", key: "G", tempo: 78, category: "Louvor", lyrics: "Grande é o Senhor\nE mui digno de louvor\nNa cidade do nosso Deus\nNo seu santo monte\n\nBelo na sua altitude\nAlegria de toda a terra\nO monte Sião, ao extremo norte\nA cidade do grande Rei" },
    { id: SONG_IDS[1], organization_id: MATRIZ_ID, title: "Oceanos", artist: "Hillsong", key: "A", tempo: 68, category: "Adoração", lyrics: "Quando me afogo no oceano\nQuando enfrentos as ondas altas\nTua graça me alcança\nTeu amor me sustenta" },
    { id: SONG_IDS[2], organization_id: MATRIZ_ID, title: "Quão Grande és Tu", artist: "Carl Boberg", key: "C", tempo: 72, category: "Harpa", lyrics: "Senhor meu Deus, quando eu maravilhado\nContemple os mundos que criastes Tu\nAs florestas, os montes e os prados\nE ouço o mar que ressoa a Tua voz" },
    { id: SONG_IDS[3], organization_id: MATRIZ_ID, title: "Hosana", artist: "Hillsong", key: "D", tempo: 85, category: "Louvor", lyrics: "Hosana, hosana\nHosana nas alturas\nHosana, hosana\nHosana nas alturas" },
    { id: SONG_IDS[4], organization_id: MATRIZ_ID, title: "Digno é o Senhor", artist: "Fernandinho", key: "E", tempo: 90, category: "Louvor", lyrics: "Digno és de receber\nGlória, honra e poder\nPois Tu criaste todas as coisas\nE por Tua vontade existem e foram criadas" },
    { id: SONG_IDS[5], organization_id: MATRIZ_ID, title: "Creio", artist: "Ministério Zoe", key: "G", tempo: 76, category: "Adoração", lyrics: "Eu creio em Ti\nEu creio em Ti\nMeu coração está em Tuas mãos\nEu creio em Ti" },
    { id: SONG_IDS[6], organization_id: MATRIZ_ID, title: "Maravilhosa Graça", artist: "Harpa Cristã", key: "F", tempo: 65, category: "Harpa", lyrics: "Maravilhosa graça do meu Salvador\nGrande e infinita, livre para mim\nJá fui lavado pelo sangue do Senhor\nE sou feliz pela graça sem fim" },
    { id: SONG_IDS[7], organization_id: MATRIZ_ID, title: "Fogo de Pentecostes", artist: "Ministério Lugar Secreto", key: "A", tempo: 88, category: "Louvor", lyrics: "Fogo de Pentecostes\nCaia sobre nós\nEnche esta casa de Tua glória\nSenhor, caia sobre nós" },
    { id: SONG_IDS[8], organization_id: MATRIZ_ID, title: "Perto Quero Estar", artist: "Harpa Cristã", key: "Bb", tempo: 62, category: "Santa Ceia", lyrics: "Perto quero estar, Jesus de Ti\nEm Ti confio mais e mais\nNa Tua luz divina sempre caminharei\nPois sei que és Tu quem me guias" },
    { id: SONG_IDS[9], organization_id: MATRIZ_ID, title: "Para Sempre", artist: "Fernandinho", key: "D", tempo: 82, category: "Adoração", lyrics: "Para sempre louvarei\nPara sempre cantarei\nAo Senhor que me salvou\nQuando em trevas eu estava" },
    { id: SONG_IDS[10], organization_id: MATRIZ_ID, title: "Ainda que a Figueira", artist: "Harpa Cristã", key: "C", tempo: 70, category: "Harpa", lyrics: "Ainda que a figueira não floresça\nNem fruto haja nas videiras\nO produto da oliveira falhar\nE os campos não deem mantimento" },
    { id: SONG_IDS[11], organization_id: MATRIZ_ID, title: "Jesus, Amigo Eterno", artist: "Jovens", key: "G", tempo: 95, category: "Jovens", lyrics: "Jesus amigo eterno\nTe quero adorar\nNa Tua presença\nQuero sempre ficar" },
    { id: SONG_IDS[12], organization_id: MATRIZ_ID, title: "Tua Graça Me Basta", artist: "Hillsong", key: "E", tempo: 74, category: "Adoração", lyrics: "Tua graça me basta\nTua força se aperfeiçoa\nNa minha fraqueza\nTeu poder se manifesta" },
    { id: SONG_IDS[13], organization_id: MATRIZ_ID, title: "Rogo a Ti", artist: "Harpa Cristã", key: "Ab", tempo: 60, category: "Santa Ceia", lyrics: "Rogo a Ti, ó Deus, que me ouças\nNa Tua misericórdia\nE me livres de todo o mal\nPela Tua graça pura" },
    { id: SONG_IDS[14], organization_id: MATRIZ_ID, title: "Yeshua", artist: "Ministério Jovens", key: "A", tempo: 92, category: "Jovens", lyrics: "Yeshua, Yeshua\nSeu nome é Yeshua\nElohim, Elohim\nSeu nome é Elohim" },
  ];
  const n = await upsert("songs", songs);
  results["Músicas"] = n;
  console.log(`  ✅ ${n} músicas upserted`);
}

async function seedEvents() {
  console.log("\n📅 Agenda (eventos)...");
  const events = [
    { id: EVT_IDS[0], organization_id: MATRIZ_ID, created_by: null, title: "Culto de Celebração", starts_at: isoDate(0).replace(/T.*/, "T19:00:00"), ends_at: isoDate(0).replace(/T.*/, "T21:00:00"), location: "Templo Sede", event_type: "bg-accent", is_public: true, description: "Culto dominical de celebração e louvor." },
    { id: EVT_IDS[1], organization_id: MATRIZ_ID, created_by: null, title: "Culto de Oração", starts_at: isoDate(3).replace(/T.*/, "T20:00:00"), ends_at: isoDate(3).replace(/T.*/, "T21:30:00"), location: "Templo Sede", event_type: "bg-primary", is_public: true, description: "Reunião de oração e intercessão." },
    { id: EVT_IDS[2], organization_id: MATRIZ_ID, created_by: null, title: "Escola Bíblica", starts_at: isoDate(7).replace(/T.*/, "T09:00:00"), ends_at: isoDate(7).replace(/T.*/, "T10:30:00"), location: "Salas de EBD", event_type: "bg-success", is_public: true, description: "Escola Bíblica Dominical para todas as faixas etárias." },
    { id: EVT_IDS[3], organization_id: MATRIZ_ID, created_by: null, title: "Reunião de Líderes", starts_at: isoDate(5).replace(/T.*/, "T19:30:00"), ends_at: isoDate(5).replace(/T.*/, "T21:00:00"), location: "Sala de Reuniões", event_type: "bg-primary", is_public: true, description: "Reunião mensal de alinhamento com líderes de ministério." },
    { id: EVT_IDS[4], organization_id: MATRIZ_ID, created_by: null, title: "Congresso de Jovens", starts_at: isoDate(14).replace(/T.*/, "T18:00:00"), ends_at: isoDate(16).replace(/T.*/, "T22:00:00"), location: "Auditório Principal", event_type: "bg-accent", is_public: true, description: "Congresso anual de jovens com pregadores convidados." },
    { id: EVT_IDS[5], organization_id: MATRIZ_ID, created_by: null, title: "Santa Ceia", starts_at: isoDate(21).replace(/T.*/, "T19:00:00"), ends_at: isoDate(21).replace(/T.*/, "T20:30:00"), location: "Templo Sede", event_type: "bg-accent", is_public: true, description: "Celebração da Santa Ceia do Senhor." },
    { id: EVT_IDS[6], organization_id: MATRIZ_ID, created_by: null, title: "Treinamento de Secretários", starts_at: isoDate(10).replace(/T.*/, "T14:00:00"), ends_at: isoDate(10).replace(/T.*/, "T17:00:00"), location: "Sala de Treinamento", event_type: "bg-primary", is_public: true, description: "Capacitação para secretários de todas as unidades." },
    { id: EVT_IDS[7], organization_id: MATRIZ_ID, created_by: null, title: "Mutirão de Limpeza", starts_at: isoDate(12).replace(/T.*/, "T08:00:00"), ends_at: isoDate(12).replace(/T.*/, "T12:00:00"), location: "Templo Sede", event_type: "bg-success", is_public: true, description: "Mutirão voluntário de limpeza e organização do templo." },
    { id: EVT_IDS[8], organization_id: MATRIZ_ID, created_by: null, title: "Culto de Páscoa", starts_at: isoDate(28).replace(/T.*/, "T19:00:00"), ends_at: isoDate(28).replace(/T.*/, "T21:00:00"), location: "Templo Sede", event_type: "bg-accent", is_public: true, description: "Culto especial de Páscoa com apresentação do coral." },
    { id: EVT_IDS[9], organization_id: MATRIZ_ID, created_by: null, title: "Retiro Pastoral", starts_at: isoDate(35).replace(/T.*/, "T08:00:00"), ends_at: isoDate(37).replace(/T.*/, "T18:00:00"), location: "Chácara da Igreja", event_type: "bg-primary", is_public: true, description: "Retiro espiritual para pastores e líderes." },
    { id: EVT_IDS[10], organization_id: MATRIZ_ID, created_by: null, title: "Seminário de Finanças", starts_at: isoDate(20).replace(/T.*/, "T19:00:00"), ends_at: isoDate(20).replace(/T.*/, "T21:00:00"), location: "Auditório", event_type: "bg-success", is_public: true, description: "Seminário de educação financeira cristã." },
    { id: EVT_IDS[11], organization_id: MATRIZ_ID, created_by: null, title: "Evangelismo na Praça", starts_at: isoDate(25).replace(/T.*/, "T15:00:00"), ends_at: isoDate(25).replace(/T.*/, "T18:00:00"), location: "Praça Central", event_type: "bg-accent", is_public: true, description: "Ação evangelística na praça com música e testemunhos." },
  ];
  const n = await upsert("events", events);
  results["Eventos"] = n;
  console.log(`  ✅ ${n} eventos upserted`);
}

async function seedGroups() {
  console.log("\n👥 Pequenos Grupos...");
  const groups = [
    { id: GRP_IDS[0], organization_id: MATRIZ_ID, name: "Grupo Família Centro", description: "Encontros semanais para famílias do bairro centro.", day_of_week: "quarta", time_of_day: "20:00", location: "Rua das Flores, 123", leader_name: "João Pedro Oliveira", member_count: 12 },
    { id: GRP_IDS[1], organization_id: MATRIZ_ID, name: "Grupo Jovens Alive", description: "Reunião de jovens com louvor e estudo bíblico.", day_of_week: "sexta", time_of_day: "19:30", location: "Salão Jovens", leader_name: "Lucas Andrade Costa", member_count: 18 },
    { id: GRP_IDS[2], organization_id: MATRIZ_ID, name: "Grupo Senhoras em Cristo", description: "Encontro de mulheres para oração e confraternização.", day_of_week: "terca", time_of_day: "14:00", location: "Sala 3", leader_name: "Maria Clara Santos", member_count: 15 },
    { id: GRP_IDS[3], organization_id: MATRIZ_ID, name: "Grupo Casais Plenos", description: "Estudo bíblico e comunhão para casais.", day_of_week: "sabado", time_of_day: "19:00", location: "Casa dos anfitriões", leader_name: "Fernando Henrique Souza", member_count: 20 },
    { id: GRP_IDS[4], organization_id: MATRIZ_ID, name: "Grupo Homens de Valor", description: "Encontro masculino de fortalecimento e oração.", day_of_week: "sabado", time_of_day: "08:00", location: "Salão Principal", leader_name: "Carlos Eduardo Lima", member_count: 14 },
  ];

  // Verificar se tabela tem a estrutura correta
  const { data: sampleGroup } = await supabase.from("groups").select("*").limit(1);
  const groupKeys = sampleGroup && sampleGroup[0] ? Object.keys(sampleGroup[0]) : [];

  // Filtrar campos que existem na tabela
  const safeGroups = groups.map(g => {
    const safe = { id: g.id, organization_id: g.organization_id, name: g.name, description: g.description };
    if (groupKeys.includes("day_of_week")) safe.day_of_week = g.day_of_week;
    if (groupKeys.includes("time_of_day")) safe.time_of_day = g.time_of_day;
    if (groupKeys.includes("location")) safe.location = g.location;
    if (groupKeys.includes("leader_name")) safe.leader_name = g.leader_name;
    if (groupKeys.includes("meeting_day")) safe.meeting_day = g.day_of_week;
    if (groupKeys.includes("meeting_time")) safe.meeting_time = g.time_of_day;
    if (groupKeys.includes("meeting_location")) safe.meeting_location = g.location;
    return safe;
  });

  const n = await upsert("groups", safeGroups);
  results["Grupos"] = n;
  console.log(`  ✅ ${n} grupos upserted`);
}

async function seedDocuments() {
  console.log("\n📄 Documentos...");
  const docs = [
    { id: "dd000080-0000-0000-0000-000000000001", organization_id: MATRIZ_ID, title: "Estatuto Social da Igreja", document_type: "Estatuto", content: "Estatuto Social da Assembleia de Deus — Matriz Municipal Caxias do Sul. Aprovado em Assembleia Geral extraordinária.", created_at: isoDate(-300) },
    { id: "dd000080-0000-0000-0000-000000000002", organization_id: MATRIZ_ID, title: "Regimento Interno", document_type: "Regimento", content: "Regimento Interno que regulamenta as atividades administrativas e pastorais da Matriz Municipal.", created_at: isoDate(-200) },
    { id: "dd000080-0000-0000-0000-000000000003", organization_id: MATRIZ_ID, title: "Ata de Eleição Pastoral", document_type: "Ata", content: "Ata da eleição e posse do Pastor Presidente para o quadriênio vigente. Aprovada por unanimidade em Assembleia Geral.", created_at: isoDate(-100) },
    { id: "dd000080-0000-0000-0000-000000000004", organization_id: MATRIZ_ID, title: "Declaração de Utilidade Pública", document_type: "Certidão", content: "Declaração de utilidade pública concedida pelo Município de Caxias do Sul à Matriz Municipal.", created_at: isoDate(-150) },
    { id: "dd000080-0000-0000-0000-000000000005", organization_id: MATRIZ_ID, title: "Manual do Voluntário", document_type: "Manual", content: "Guia para voluntários da igreja com orientações sobre conduta, compromissos e benefícios.", created_at: isoDate(-50) },
    { id: "dd000080-0000-0000-0000-000000000006", organization_id: MATRIZ_ID, title: "Plano Anual de Atividades", document_type: "Planejamento", content: "Plano de atividades da Matriz Municipal para o exercício corrente, incluindo metas e orçamento.", created_at: isoDate(-10) },
  ];
  const n = await upsert("documents", docs);
  results["Documentos"] = n;
  console.log(`  ✅ ${n} documentos upserted`);
}

async function seedCommunications() {
  console.log("\n📣 Comunicados...");
  const comms = [
    { id: "dd000090-0000-0000-0000-000000000001", organization_id: MATRIZ_ID, title: "Culto de Páscoa — Horário Especial", content: "O culto de Páscoa deste ano terá início às 19h com apresentação especial do coral. Venha trazer sua família!", communication_type: "Urgente", is_public: true, published_at: isoDate(-5) },
    { id: "dd000090-0000-0000-0000-000000000002", organization_id: MATRIZ_ID, title: "Campanha de Arrecadação de Alimentos", content: "Estaremos arrecadando alimentos não perecíveis para doação a famílias carentes. Traga sua contribuição ao culto de domingo.", communication_type: "Normal", is_public: true, published_at: isoDate(-3) },
    { id: "dd000090-0000-0000-0000-000000000003", organization_id: MATRIZ_ID, title: "Novo Horário de Atendimento da Secretaria", content: "A partir desta semana, a secretaria funcionará de segunda a sexta, das 9h às 12h e das 14h às 17h.", communication_type: "Informativo", is_public: true, published_at: isoDate(-2) },
    { id: "dd000090-0000-0000-0000-000000000004", organization_id: MATRIZ_ID, title: "Reunião de Pais — Departamento Infantil", content: "Convidamos todos os pais e responsáveis para reunião sobre o calendário e novidades do departamento infantil.", communication_type: "Normal", is_public: true, published_at: isoDate(-1) },
    { id: "dd000090-0000-0000-0000-000000000005", organization_id: MATRIZ_ID, title: "Atualização do Cadastro de Membros", content: "Solicitamos que todos os membros atualizem seus dados cadastrais na secretaria até o final do mês.", communication_type: "Normal", is_public: true, published_at: isoDate(0) },
    { id: "dd000090-0000-0000-0000-000000000006", organization_id: MATRIZ_ID, title: "Congresso de Jovens — Inscrições Abertas", content: "As inscrições para o Congresso de Jovens estão abertas! Vagas limitadas. Procure o líder da juventude.", communication_type: "Urgente", is_public: true, published_at: isoDate(0) },
  ];
  const n = await upsert("communications", comms);
  results["Comunicados"] = n;
  console.log(`  ✅ ${n} comunicados upserted`);
}

async function seedRecommendationLetters() {
  console.log("\n📜 Cartas de Recomendação...");
  const CHURCH_NAME = "Assembleia de Deus — Matriz Municipal Caxias do Sul";
  const letters = [
    {
      id: "dd000100-0000-0000-0000-000000000001",
      organization_id: MATRIZ_ID,
      member_id: MEM_IDS[24], // Leticia Paula Cunha — Transferido
      member_name: "Leticia Paula Cunha",
      member_email: "leticia.cunha@ecclesia.demo",
      origin_church_name: CHURCH_NAME,
      destination_church: "Assembleia de Deus — Zona Norte",
      destination_city: "Porto Alegre",
      destination_state: "RS",
      reason: "Transferência de residência por motivo profissional.",
      observations: "Membro ativo por mais de 12 anos. Bem recomendada pelo conselho pastoral. Exerceu função de liderança de louvor.",
      status: "approved",
      requested_at: isoDate(-45),
      approved_at: isoDate(-10),
      public_token: "dd000100000000000000000000000001",
    },
    {
      id: "dd000100-0000-0000-0000-000000000002",
      organization_id: MATRIZ_ID,
      member_id: MEM_IDS[6], // Lucas Andrade Costa
      member_name: "Lucas Andrade Costa",
      member_email: "lucas.costa@ecclesia.demo",
      origin_church_name: CHURCH_NAME,
      destination_church: "Assembleia de Deus — Gramado",
      destination_city: "Gramado",
      destination_state: "RS",
      reason: "Casamento e mudança para cidade do cônjuge.",
      observations: "Diácono e líder de jovens. Carta emitida para apresentação e comunhão na congregação de destino.",
      status: "approved",
      requested_at: isoDate(-20),
      approved_at: isoDate(-5),
      public_token: "dd000100000000000000000000000002",
    },
    {
      id: "dd000100-0000-0000-0000-000000000003",
      organization_id: MATRIZ_ID,
      member_id: MEM_IDS[8], // Roberto Silva Pereira
      member_name: "Roberto Silva Pereira",
      member_email: "roberto.pereira@ecclesia.demo",
      origin_church_name: CHURCH_NAME,
      destination_church: "Assembleia de Deus — Florianópolis Centro",
      destination_city: "Florianópolis",
      destination_state: "SC",
      reason: "Participação em viagem missionária — 60 dias.",
      observations: "Membro enviado em equipe missionária. Carta de apresentação pastoral solicitada para atividades no período.",
      status: "under_review",
      requested_at: isoDate(-7),
      public_token: "dd000100000000000000000000000003",
    },
    {
      id: "dd000100-0000-0000-0000-000000000004",
      organization_id: MATRIZ_ID,
      member_id: MEM_IDS[7], // Juliana Beatriz Alves
      member_name: "Juliana Beatriz Alves",
      member_email: "juliana.alves@ecclesia.demo",
      origin_church_name: CHURCH_NAME,
      destination_church: "Assembleia de Deus — Bento Gonçalves",
      destination_city: "Bento Gonçalves",
      destination_state: "RS",
      reason: "Transferência de residência — mudança de bairro.",
      observations: "Membro ativo. Solicita carta para apresentação à congregação próxima ao novo endereço.",
      status: "requested",
      requested_at: isoDate(-2),
      public_token: "dd000100000000000000000000000004",
    },
    {
      id: "dd000100-0000-0000-0000-000000000005",
      organization_id: MATRIZ_ID,
      member_id: MEM_IDS[14], // Fernanda Regina Braga
      member_name: "Fernanda Regina Braga",
      member_email: "fernanda.braga@ecclesia.demo",
      origin_church_name: CHURCH_NAME,
      destination_church: "Assembleia de Deus Missões — São Paulo",
      destination_city: "São Paulo",
      destination_state: "SP",
      reason: "Missão de trabalho por período de 2 anos.",
      observations: "Solicitação negada por pendência administrativa. Reavaliação após regularização.",
      status: "rejected",
      requested_at: isoDate(-30),
      reviewed_at: isoDate(-20),
      public_token: "dd000100000000000000000000000005",
    },
  ];
  const n = await upsert("recommendation_letters", letters);
  results["Cartas"] = n;
  console.log(`  ✅ ${n} cartas upserted`);
}

async function seedFinancial() {
  console.log("\n💰 Financeiro...");

  // Categorias
  const categories = [
    { id: "dd000110-0000-0000-0000-000000000001", organization_id: MATRIZ_ID, name: "Dízimos", type: "income", color: "#22c55e" },
    { id: "dd000110-0000-0000-0000-000000000002", organization_id: MATRIZ_ID, name: "Ofertas", type: "income", color: "#3b82f6" },
    { id: "dd000110-0000-0000-0000-000000000003", organization_id: MATRIZ_ID, name: "Campanhas", type: "income", color: "#f59e0b" },
    { id: "dd000110-0000-0000-0000-000000000004", organization_id: MATRIZ_ID, name: "Manutenção", type: "expense", color: "#ef4444" },
    { id: "dd000110-0000-0000-0000-000000000005", organization_id: MATRIZ_ID, name: "Missões", type: "expense", color: "#8b5cf6" },
    { id: "dd000110-0000-0000-0000-000000000006", organization_id: MATRIZ_ID, name: "Evangelismo", type: "expense", color: "#ec4899" },
    { id: "dd000110-0000-0000-0000-000000000007", organization_id: MATRIZ_ID, name: "Administrativo", type: "expense", color: "#64748b" },
    { id: "dd000110-0000-0000-0000-000000000008", organization_id: MATRIZ_ID, name: "Sociais", type: "expense", color: "#06b6d4" },
  ];

  // Verificar se tabela de categorias existe
  const { error: catCheckError } = await supabase.from("financial_categories").select("id").limit(1);
  if (!catCheckError) {
    await upsert("financial_categories", categories);
    console.log(`  ✅ ${categories.length} categorias financeiras`);
  }

  // Transações (últimos 90 dias)
  const transactions = [];
  const txBase = "dd000120-0000-0000-";
  for (let i = 0; i < 30; i++) {
    const id = `${txBase}0000-${String(i + 1).padStart(12, "0")}`;
    const isIncome = i % 3 !== 0;
    const amount = isIncome
      ? (i % 7 === 0 ? 2500 : i % 5 === 0 ? 1800 : 850 + i * 30)
      : (150 + i * 25);
    transactions.push({
      id,
      organization_id: MATRIZ_ID,
      description: isIncome
        ? (i % 7 === 0 ? "Dízimo mensal" : i % 5 === 0 ? "Oferta especial" : `Oferta do culto ${i + 1}`)
        : (i % 4 === 0 ? "Conta de energia" : i % 3 === 0 ? "Material de limpeza" : `Despesa administrativa ${i}`),
      amount: amount,
      type: isIncome ? "income" : "expense",
      date: today(-(i * 3)),
      category_id: isIncome ? categories[i % 3].id : categories[3 + (i % 5)].id,
    });
  }

  const { error: txCheckError } = await supabase.from("transactions").select("id").limit(1);
  if (!txCheckError) {
    await upsert("transactions", transactions);
    results["Transações"] = transactions.length;
    console.log(`  ✅ ${transactions.length} transações`);
  } else {
    console.log(`  ⚠️  Tabela 'transactions' não encontrada — pulando`);
  }
}

async function seedAssemblies() {
  console.log("\n🏛️ Assembleias...");
  const assemblies = [
    { id: "dd000130-0000-0000-0000-000000000001", organization_id: MATRIZ_ID, title: "Assembleia Geral Ordinária 2025", description: "Prestação de contas anual e eleição de diretoria.", scheduled_at: isoDate(30), status: "scheduled", quorum_required: 50 },
    { id: "dd000130-0000-0000-0000-000000000002", organization_id: MATRIZ_ID, title: "Assembleia Geral Extraordinária — Reforma", description: "Aprovação do projeto e orçamento para reforma do templo.", scheduled_at: isoDate(-30), status: "completed", quorum_required: 30, minutes: "A assembleia foi realizada com quórum de 45 membros. O projeto de reforma foi aprovado por 38 votos favoráveis e 4 contrários." },
    { id: "dd000130-0000-0000-0000-000000000003", organization_id: MATRIZ_ID, title: "Assembleia de Planejamento Estratégico", description: "Definição de metas e projetos para o próximo triênio.", scheduled_at: isoDate(60), status: "scheduled", quorum_required: 40 },
  ];

  const { error: checkError } = await supabase.from("assemblies").select("id").limit(1);
  if (!checkError) {
    const n = await upsert("assemblies", assemblies);
    results["Assembleias"] = n;
    console.log(`  ✅ ${n} assembleias upserted`);
  } else {
    console.log(`  ⚠️  Tabela 'assemblies' não encontrada — pulando`);
  }
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 seed-full-demo.mjs — Ecclesia Online");
  console.log(`   URL: ${SUPABASE_URL}`);
  console.log(`   Org: ${MATRIZ_ID}`);

  // Verifica conexão
  const { error: pingError } = await supabase.from("organizations").select("id").eq("id", MATRIZ_ID).single();
  if (pingError && pingError.code !== "PGRST116") {
    console.error("❌ Falha ao conectar ao Supabase:", pingError.message);
    process.exit(1);
  }
  console.log("   ✅ Conexão OK\n");

  await seedOrganizations();
  await seedMembers();
  await seedCampaigns();
  await seedSongs();
  await seedEvents();
  await seedGroups();
  await seedDocuments();
  await seedCommunications();
  await seedRecommendationLetters();
  await seedFinancial();
  await seedAssemblies();

  // ── Relatório final ──
  console.log("\n══════════════════════════════════════════");
  console.log("  RELATÓRIO FINAL");
  console.log("══════════════════════════════════════════");

  const checks = [
    ["organizations", { parent_id: MATRIZ_ID }, "Setores"],
    ["organizations", { organization_type: "congregacao" }, "Congregações"],
    ["members", { organization_id: MATRIZ_ID }, "Membros (Matriz)"],
    ["campaigns", { organization_id: MATRIZ_ID }, "Campanhas"],
    ["songs", { organization_id: MATRIZ_ID }, "Músicas"],
    ["events", { organization_id: MATRIZ_ID }, "Eventos"],
    ["groups", { organization_id: MATRIZ_ID }, "Grupos"],
    ["documents", { organization_id: MATRIZ_ID }, "Documentos"],
    ["communications", { organization_id: MATRIZ_ID }, "Comunicados"],
    ["recommendation_letters", { organization_id: MATRIZ_ID }, "Cartas"],
  ];

  let allOk = true;
  for (const [table, filter, label] of checks) {
    const n = await count(table, filter);
    const ok = n > 0;
    if (!ok) allOk = false;
    console.log(`  ${ok ? "✅" : "❌"} ${label}: ${n}`);
  }

  if (errors.length > 0) {
    console.log("\n  ⚠️  Erros encontrados:");
    for (const e of errors) console.log(`     ❌ ${e.table}: ${e.error}`);
  }

  console.log("══════════════════════════════════════════\n");

  if (!allOk || errors.some(e => ["campaigns", "songs", "members", "events"].includes(e.table))) {
    console.error("❌ Seed concluído com erros críticos.");
    process.exit(1);
  }

  console.log("✅ Seed full-demo concluído com sucesso!");
  process.exit(0);
}

main().catch(err => {
  console.error("❌ Erro fatal:", err);
  process.exit(1);
});
