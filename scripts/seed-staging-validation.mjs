/**
 * seed-staging-validation.mjs
 * ============================
 * Seed de validação para ambiente STAGING do Ecclesia Online.
 *
 * Cobre: Organizações, Usuários, organization_users, Membros (50)
 *        com documentação civil, dados eclesiásticos, variação de funções e status.
 *
 * ⚠️  NÃO executar em produção. Exige SEED_TARGET=staging.
 *
 * USO (PowerShell):
 *   $env:SEED_TARGET="staging"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."
 *   npm run seed:staging-validation
 *
 * USO (Linux / macOS):
 *   SEED_TARGET=staging SUPABASE_SERVICE_ROLE_KEY=eyJ... npm run seed:staging-validation
 *
 * PRÉ-REQUISITO:
 *   Aplicar primeiro no Supabase Dashboard → SQL Editor:
 *   • 20260617120000_members_extended_fields.sql
 *   • 20260617130000_members_status_constraint_fix.sql
 *   • 20260622120000_members_civil_ecclesiastical.sql
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// ─── Carrega arquivos .env ────────────────────────────────────────────────────
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
  ...loadEnvFile(path.join(ROOT, ".env.local")), // .env.local sobrescreve
};

const SUPABASE_URL = (
  process.env.SUPABASE_URL ||
  dotenv.SUPABASE_URL ||
  dotenv.VITE_SUPABASE_URL ||
  ""
).replace(/\/+$/, "");

const SERVICE_ROLE = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  dotenv.SUPABASE_SERVICE_ROLE_KEY ||
  ""
).trim();

const SEED_TARGET = (process.env.SEED_TARGET || dotenv.SEED_TARGET || "").trim();

// ─── Exibição inicial ─────────────────────────────────────────────────────────
const LINE = "═".repeat(62);
console.log(LINE);
console.log("  🌱  ECCLESIA ONLINE — SEED STAGING VALIDATION");
console.log(LINE);
console.log(`  URL Supabase : ${SUPABASE_URL || "❌ não encontrada"}`);
console.log(`  Service Key  : ${SERVICE_ROLE ? "✅ presente" : "❌ ausente"}`);
console.log(`  SEED_TARGET  : ${SEED_TARGET  || "❌ não definida"}`);
console.log(LINE);

// ─── Proteção 1: SEED_TARGET obrigatório ─────────────────────────────────────
if (SEED_TARGET !== "staging") {
  console.error("\n❌  ABORTADO — SEED_TARGET deve ser exatamente \"staging\"");
  console.error("   Este seed é exclusivo para ambiente de STAGING/TESTE.");
  console.error("   Jamais executar em produção.\n");
  console.error("   PowerShell : $env:SEED_TARGET=\"staging\"");
  console.error("   Linux/macOS: SEED_TARGET=staging\n");
  process.exit(1);
}

// ─── Proteção 2: credenciais obrigatórias ────────────────────────────────────
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("\n❌  ABORTADO — credenciais incompletas");
  if (!SUPABASE_URL) {
    console.error("   SUPABASE_URL / VITE_SUPABASE_URL não encontrada.");
    console.error("   Verifique .env, .env.staging ou .env.local");
  }
  if (!SERVICE_ROLE) {
    console.error("   SUPABASE_SERVICE_ROLE_KEY não encontrada.");
    console.error("   Supabase Dashboard → Settings → API → service_role → Reveal");
    console.error("   (⚠️  a VITE_SUPABASE_PUBLISHABLE_KEY NÃO funciona aqui)");
  }
  process.exit(1);
}

// ─── Proteção 3: URL suspeita de produção ────────────────────────────────────
const PROD_HINTS = ["prod", "production", "ecclesiabr.online"];
if (PROD_HINTS.some(h => SUPABASE_URL.toLowerCase().includes(h))) {
  console.error("\n⚠️   ATENÇÃO: a URL parece apontar para produção!");
  console.error(`    URL: ${SUPABASE_URL}`);
  console.error("    Confirme que está usando a URL correta do STAGING.");
  console.error("    Se tiver certeza, remova os hints de produção da URL.\n");
  process.exit(1);
}

console.log("\n✅  Verificações de segurança OK — iniciando seed...\n");

// ─── Cliente Supabase (service_role bypassa RLS) ──────────────────────────────
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── IDs determinísticos de Staging ──────────────────────────────────────────
// Prefixo "ee" → identifica claramente dados de staging vs demo (dd)
const MATRIZ_ID = "10000000-0000-0000-0000-000000000002"; // Matriz existente no banco

// Setores
const ST_SETOR_CENTRO    = "ee000010-0000-0000-0000-000000000001";
const ST_SETOR_NORTE     = "ee000010-0000-0000-0000-000000000002";
const ST_SETOR_SUL       = "ee000010-0000-0000-0000-000000000003";

// Congregações
const ST_CONG_CENTRO     = "ee000020-0000-0000-0000-000000000001";
const ST_CONG_BELA_VISTA = "ee000020-0000-0000-0000-000000000002";
const ST_CONG_CRUZEIRO   = "ee000020-0000-0000-0000-000000000003";

// Membros (50 IDs)
const MEM_IDS = Array.from({ length: 50 }, (_, i) =>
  `ee000030-0000-0000-0000-${String(i + 1).padStart(12, "0")}`
);

// Senha padrão — staging only
const STAGING_PASSWORD = "EcclesiaTeste@2026";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const ok  = (msg) => console.log(`  ✅ ${msg}`);
const err = (msg) => console.error(`  ❌ ${msg}`);
const inf = (msg) => console.log(`  ℹ️  ${msg}`);
const sep = (t)   => console.log(`\n${"─".repeat(62)}\n  ${t}\n${"─".repeat(62)}`);

const globalErrors = [];

/** Upsert genérico usando `id` ou constraint composta como conflito. */
async function upsert(table, rows, conflictCol = "id") {
  if (!rows.length) return 0;
  const { error } = await supabase
    .from(table)
    .upsert(rows, { onConflict: conflictCol });
  if (error) {
    err(`${table} [${conflictCol}]: ${error.message}`);
    globalErrors.push({ table, msg: error.message });
    return 0;
  }
  return rows.length;
}

/**
 * Cria ou reutiliza um usuário no Supabase Auth.
 * Retorna UUID do usuário ou null em caso de falha.
 */
async function upsertAuthUser(email, password, fullName) {
  // Tenta criar
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (!error && data?.user) {
    ok(`Criado: ${email}`);
    return data.user.id;
  }

  // Se já existe — buscar o ID pelo e-mail
  if (error) {
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
      perPage: 1000,
      page: 1,
    });
    if (!listErr && list?.users) {
      const existing = list.users.find(u => u.email === email);
      if (existing) {
        inf(`Já existe: ${email} → ${existing.id}`);
        return existing.id;
      }
    }
    err(`Não foi possível criar/localizar ${email}: ${error.message}`);
    globalErrors.push({ table: "auth.users", msg: `${email}: ${error.message}` });
    return null;
  }

  return null;
}

/**
 * Documento civil exigido pelo estado civil.
 * Viúvo(a), Separado(a), União Estável → retorna null (sem certidão específica
 * definida nas regras atuais da secretaria; campo fica em branco).
 */
function civilDocType(marital) {
  switch (marital) {
    case "Solteiro(a)":   return "Certidão de nascimento";
    case "Casado(a)":     return "Certidão de casamento";
    case "Divorciado(a)": return "Certidão de divórcio";
    default:              return null; // Viúvo(a) e outros → sem certidão obrigatória definida
  }
}

/**
 * Verifica se a migração 20260622120000_members_civil_ecclesiastical.sql
 * foi aplicada no banco. Faz uma SELECT de teste na coluna civil_document_type.
 * Retorna true se a coluna existe, false caso contrário.
 */
async function checkNewMigration() {
  sep("00 — Pré-check: Migração 20260622120000");
  try {
    // Tenta selecionar a coluna nova — se não existir, PostgREST retorna PGRST204
    const { error } = await supabase
      .from("members")
      .select("civil_document_type, holy_spirit_baptism_date, consecration_date")
      .limit(1);

    if (
      error &&
      (error.code === "PGRST204" ||
        error.message?.includes("civil_document_type") ||
        error.message?.includes("holy_spirit_baptism_date") ||
        error.message?.includes("consecration_date"))
    ) {
      console.warn("  ⚠️  Migração 20260622120000 NÃO detectada no banco staging.");
      console.warn("      Os membros serão criados SEM os campos:");
      console.warn("        civil_document_type, civil_document_status, civil_document_notes,");
      console.warn("        holy_spirit_baptism_date, consecration_date");
      console.warn("      Para ativar esses campos, aplique a migração em:");
      console.warn("      Supabase Dashboard → SQL Editor →");
      console.warn("      supabase/migrations/20260622120000_members_civil_ecclesiastical.sql");
      return false;
    }

    ok("Migração 20260622120000 detectada — campos novos disponíveis");
    return true;
  } catch {
    console.warn("  ⚠️  Não foi possível verificar a migração. Tentando inserir com todos os campos.");
    return true; // assume disponível; o upsert capturará o erro se necessário
  }
}

// ─── SEÇÃO 1: Organizações ────────────────────────────────────────────────────
async function seedOrganizations() {
  sep("01 — Organizações Staging (3 setores + 3 congregações)");

  // Garantir que a Matriz base existe
  const { data: matriz } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", MATRIZ_ID)
    .maybeSingle();

  if (!matriz) {
    err(`Matriz ${MATRIZ_ID} não encontrada.`);
    err("Execute as migrations de organizações demo antes deste seed.");
    process.exit(1);
  }
  ok(`Matriz base: "${matriz.name}"`);

  const orgs = [
    // ── Setores (filhos diretos da Matriz) ───────────────────────────────────
    {
      id: ST_SETOR_CENTRO, parent_id: MATRIZ_ID,
      name: "Setor Centro — STAGING", slug: "setor-centro-staging",
      organization_type: "setor", city: "Caxias do Sul", state: "RS", active: true,
    },
    {
      id: ST_SETOR_NORTE, parent_id: MATRIZ_ID,
      name: "Setor Norte — STAGING", slug: "setor-norte-staging",
      organization_type: "setor", city: "Caxias do Sul", state: "RS", active: true,
    },
    {
      id: ST_SETOR_SUL, parent_id: MATRIZ_ID,
      name: "Setor Sul — STAGING", slug: "setor-sul-staging",
      organization_type: "setor", city: "Caxias do Sul", state: "RS", active: true,
    },
    // ── Congregações (filhas dos setores) ────────────────────────────────────
    {
      id: ST_CONG_CENTRO, parent_id: ST_SETOR_CENTRO,
      name: "Congregação Centro — STAGING", slug: "cong-centro-staging",
      organization_type: "congregacao", city: "Caxias do Sul", state: "RS", active: true,
    },
    {
      id: ST_CONG_BELA_VISTA, parent_id: ST_SETOR_NORTE,
      name: "Congregação Bela Vista — STAGING", slug: "cong-bela-vista-staging",
      organization_type: "congregacao", city: "Caxias do Sul", state: "RS", active: true,
    },
    {
      id: ST_CONG_CRUZEIRO, parent_id: ST_SETOR_SUL,
      name: "Congregação Cruzeiro — STAGING", slug: "cong-cruzeiro-staging",
      organization_type: "congregacao", city: "Caxias do Sul", state: "RS", active: true,
    },
  ];

  const n = await upsert("organizations", orgs);
  ok(`${n} organizações upserted (3 setores + 3 congregações)`);
}

// ─── SEÇÃO 2: Usuários Auth + organization_users ──────────────────────────────
async function seedUsers() {
  sep("02 — Usuários Staging (9 perfis)");
  inf(`Senha padrão para todos: ${STAGING_PASSWORD}`);
  inf("Usuários criados confirmados por e-mail automaticamente.\n");

  // Definição de usuários e seus vínculos organizacionais
  const userDefs = [
    // ── Matriz ───────────────────────────────────────────────────────────────
    {
      email: "admin.matriz.staging@ecclesia.test",
      name:  "Admin Matriz — STAGING",
      org:   MATRIZ_ID,
      role:  "church_admin",
    },
    {
      email: "secretaria.geral.staging@ecclesia.test",
      name:  "Secretária Geral — STAGING",
      org:   MATRIZ_ID,
      role:  "secretary",
    },
    {
      email: "tesoureiro.geral.staging@ecclesia.test",
      name:  "Tesoureiro Geral — STAGING",
      org:   MATRIZ_ID,
      role:  "tesoureiro",
    },
    // ── Setor Centro ─────────────────────────────────────────────────────────
    {
      email: "admin.setor.centro.staging@ecclesia.test",
      name:  "Admin Setor Centro — STAGING",
      org:   ST_SETOR_CENTRO,
      role:  "church_admin",
    },
    {
      email: "secretario.setor.centro.staging@ecclesia.test",
      name:  "Secretário Setor Centro — STAGING",
      org:   ST_SETOR_CENTRO,
      role:  "secretary",
    },
    // ── Congregação Centro ───────────────────────────────────────────────────
    {
      email: "admin.congregacao.centro.staging@ecclesia.test",
      name:  "Admin Congregação Centro — STAGING",
      org:   ST_CONG_CENTRO,
      role:  "church_admin",
    },
    {
      email: "secretario.congregacao.centro.staging@ecclesia.test",
      name:  "Secretário Congregação Centro — STAGING",
      org:   ST_CONG_CENTRO,
      role:  "secretary",
    },
    // ── Porteiro (member com anotação de função futura) ──────────────────────
    {
      email: "porteiro.centro.staging@ecclesia.test",
      name:  "Porteiro Centro — STAGING",
      org:   ST_CONG_CENTRO,
      role:  "member",
    },
    // ── Membro simples ────────────────────────────────────────────────────────
    {
      email: "membro.teste.staging@ecclesia.test",
      name:  "Membro Teste — STAGING",
      org:   ST_CONG_CENTRO,
      role:  "member",
    },
  ];

  const createdUsers = [];
  const orgUserRows  = [];

  for (const u of userDefs) {
    const userId = await upsertAuthUser(u.email, STAGING_PASSWORD, u.name);
    if (!userId) continue;

    createdUsers.push({ ...u, userId });
    orgUserRows.push({
      organization_id: u.org,
      user_id:         userId,
      role:            u.role,
      is_active:       true,
    });
  }

  if (orgUserRows.length) {
    // onConflict usa constraint UNIQUE(organization_id, user_id)
    const n = await upsert("organization_users", orgUserRows, "organization_id,user_id");
    ok(`${n} vínculos organization_users upserted`);
  }

  ok(`${createdUsers.length}/${userDefs.length} usuários processados`);
  return createdUsers;
}

// ─── SEÇÃO 3: Membros fictícios (50) ─────────────────────────────────────────
async function seedMembers(adminUserId, hasMigration = true) {
  sep("03 — Membros Fictícios (50)");

  // Ciclos para variação realista
  const statuses     = ["Ativo","Ativo","Ativo","Ativo","Inativo","Visitante","Congregado","Em disciplina","Transferido","Falecido"];
  const maritalCycle = ["Solteiro(a)","Casado(a)","Casado(a)","Divorciado(a)","Viúvo(a)","Solteiro(a)","Casado(a)","Casado(a)","Solteiro(a)","Divorciado(a)"];
  const docStatuses  = ["Pendente","Apresentado","Validado","Validado","Rejeitado","Pendente","Validado","Apresentado","Pendente","Validado"];
  const funcCycle    = ["Membro","Membro","Membro","Membro","Membro","Auxiliar","Diácono","Presbítero","Evangelista","Pastor"];
  const genderCycle  = ["Masculino","Feminino","Masculino","Feminino","Masculino","Feminino","Masculino","Feminino","Masculino","Feminino"];
  const funcAdm      = [null,null,null,null,null,null,null,null,null,null,null,null,null,null,"Secretário",null,null,null,null,"Tesoureiro"];

  // Nomes fictícios — claramente identificados como dados de teste
  const maleFirstNames  = ["Carlos","Marcos","João","Pedro","Paulo","André","Felipe","Lucas","Rafael","Rodrigo","Eduardo","Gustavo","Bruno","Daniel","Henrique","Leonardo","Matheus","Gabriel","Thiago","Diego","Vinícius","Igor","Leandro","Caio","Fábio"];
  const femaleFirstNames = ["Ana","Maria","Fernanda","Juliana","Patrícia","Camila","Larissa","Aline","Renata","Tatiana","Vanessa","Bruna","Amanda","Caroline","Priscila","Natália","Daniela","Mariana","Letícia","Isabela","Viviane","Eliane","Sandra","Cássia","Helena"];
  const lastNames        = ["Teste","Demo","Staging","Fictício","Simulado"];

  // Distribuição por unidade
  // 0-9   → Matriz (sem congregação)
  // 10-19 → Setor Centro
  // 20-29 → Setor Norte
  // 30-39 → Congregação Centro (Setor Centro)
  // 40-49 → Congregação Bela Vista (Setor Norte)
  function orgFor(i) {
    if (i < 10) return { organization_id: MATRIZ_ID, congregation_id: null,             sector_id: null           };
    if (i < 20) return { organization_id: MATRIZ_ID, congregation_id: null,             sector_id: ST_SETOR_CENTRO };
    if (i < 30) return { organization_id: MATRIZ_ID, congregation_id: null,             sector_id: ST_SETOR_NORTE  };
    if (i < 40) return { organization_id: MATRIZ_ID, congregation_id: ST_CONG_CENTRO,   sector_id: ST_SETOR_CENTRO };
    return             { organization_id: MATRIZ_ID, congregation_id: ST_CONG_BELA_VISTA, sector_id: ST_SETOR_NORTE };
  }

  const members = MEM_IDS.map((id, i) => {
    const gender  = genderCycle[i % genderCycle.length];
    const first   = gender === "Masculino"
      ? maleFirstNames[i % maleFirstNames.length]
      : femaleFirstNames[i % femaleFirstNames.length];
    const last    = lastNames[i % lastNames.length];
    const marital = maritalCycle[i % maritalCycle.length];
    const docType = civilDocType(marital);
    const docSt   = docStatuses[i % docStatuses.length];
    const func    = funcCycle[i % funcCycle.length];
    const status  = statuses[i % statuses.length];
    const org     = orgFor(i);

    // CPF fictício e sequencial (claramente inválido)
    const cpf = `${String(i + 1).padStart(3,"0")}.${String((i + 50) % 1000).padStart(3,"0")}.${String((i + 100) % 1000).padStart(3,"0")}-${String((i % 99) + 1).padStart(2,"0")}`;

    const birthYear    = 1950 + ((i * 13) % 50);
    const birthMonth   = String((i % 12) + 1).padStart(2,"0");
    const birthDay     = String((i % 28) + 1).padStart(2,"0");
    const joinYear     = 2000 + (i % 25);

    const hasConsagr   = ["Auxiliar","Diácono","Presbítero","Evangelista","Pastor"].includes(func);
    const consagrDate  = hasConsagr ? `${joinYear + 2}-06-01` : null;

    const docNote = docSt === "Pendente"
      ? "Documentação civil pendente — aguardando apresentação ao secretário."
      : docSt === "Rejeitado"
      ? "Documento apresentado estava ilegível — solicitar reapresentação."
      : null;

    // Campos base (sempre existem — colunas originais da tabela members)
    const base = {
      id,
      ...org,
      full_name:               `[STAGING] ${first} ${last}`,
      member_role:             func,
      administrative_role:     funcAdm[i % funcAdm.length],
      status,
      gender,
      marital_status:          marital,
      cpf,
      phone:                   `(54) 99${String(i + 1).padStart(3,"0")}-0${String(i % 1000).padStart(3,"0")}`,
      whatsapp:                `(54) 99${String(i + 1).padStart(3,"0")}-0${String(i % 1000).padStart(3,"0")}`,
      email:                   `staging.membro.${i + 1}@ecclesia.test`,
      birth_date:              `${birthYear}-${birthMonth}-${birthDay}`,
      joined_at:               `${joinYear}-03-${birthDay}`,
      baptized_at:             `${joinYear - 1}-11-${birthDay}`,
      street:                  `Rua Staging ${i + 1}`,
      address_number:          String((i + 1) * 10),
      neighborhood:            i < 25 ? "Centro" : "Bela Vista",
      city:                    "Caxias do Sul",
      state:                   "RS",
      zip_code:                "95010-001",
      address:                 `Rua Staging ${i + 1}, ${(i + 1) * 10}, ${i < 25 ? "Centro" : "Bela Vista"}, Caxias do Sul, RS`,
      father_name:             `Pai de ${first} — STAGING`,
      mother_name:             `Mãe de ${first} — STAGING`,
      spouse_name:             marital === "Casado(a)" ? `Cônjuge de ${first} — STAGING` : null,
      notes:                   `[STAGING] Membro fictício #${i + 1} para testes. Não representa pessoa real.`,
      created_by:              adminUserId || null,
    };

    // Campos da migração 20260622120000 — só inclui se a migration foi detectada
    const extended = hasMigration ? {
      // Batismo com o Espírito Santo — 1 em cada 3 membros
      holy_spirit_baptism_date: i % 3 === 0 ? `${joinYear - 1}-12-01` : null,
      // Consagração ministerial — apenas para Auxiliar, Diácono, Presbítero, Evangelista, Pastor
      consecration_date:       consagrDate,
      // Documentação civil
      civil_document_type:     docType,
      civil_document_status:   docSt,
      civil_document_notes:    docNote,
    } : {};

    return { ...base, ...extended };
  });

  const n = await upsert("members", members);
  ok(`${n} membros staging upserted`);
  inf("Distribuição:");
  inf("  #01-10 → Matriz (sem congregação)");
  inf("  #11-20 → Setor Centro");
  inf("  #21-30 → Setor Norte");
  inf("  #31-40 → Congregação Centro");
  inf("  #41-50 → Congregação Bela Vista");
}

// ─── Runner principal ─────────────────────────────────────────────────────────
async function main() {
  const hasMigration = await checkNewMigration();
  await seedOrganizations();
  const createdUsers = await seedUsers();

  // Localiza o admin da Matriz para usar como created_by nos membros
  const adminUser = createdUsers.find(u => u.email === "admin.matriz.staging@ecclesia.test");
  await seedMembers(adminUser?.userId ?? null, hasMigration);

  // ── Resumo final ──────────────────────────────────────────────────────────
  sep("📋  RESUMO DO SEED");

  console.log("  ORGANIZAÇÕES STAGING:");
  console.log(`    • Setor Centro — STAGING        ${ST_SETOR_CENTRO}`);
  console.log(`    • Setor Norte — STAGING         ${ST_SETOR_NORTE}`);
  console.log(`    • Setor Sul — STAGING           ${ST_SETOR_SUL}`);
  console.log(`    • Congregação Centro — STAGING  ${ST_CONG_CENTRO}`);
  console.log(`    • Congregação Bela Vista — STAG ${ST_CONG_BELA_VISTA}`);
  console.log(`    • Congregação Cruzeiro — STAGING${ST_CONG_CRUZEIRO}`);

  console.log("\n  USUÁRIOS STAGING:");
  console.log(`  ${"E-MAIL".padEnd(55)} ESCOPO         ROLE`);
  console.log("  " + "─".repeat(90));
  const scopeLabel = (u) => {
    if (u.org === MATRIZ_ID)       return "Matriz         ";
    if (u.org === ST_SETOR_CENTRO) return "Setor Centro   ";
    if (u.org === ST_CONG_CENTRO)  return "Cong. Centro   ";
    return                                "Outro          ";
  };
  for (const u of createdUsers) {
    console.log(`  ${u.email.padEnd(55)} ${scopeLabel(u)} ${u.role}`);
  }

  console.log(`\n  Senha padrão: ${STAGING_PASSWORD}`);
  console.log("  ⚠️  Recomendado alterar senhas após primeiro acesso.");

  console.log("\n  MEMBROS:");
  console.log("    50 membros fictícios distribuídos por unidade.");
  console.log("    Identificados com prefixo [STAGING] no nome.");
  console.log("    Variação: status, estado civil, documentação civil,");
  console.log("              função eclesiástica, dados de batismo, consagração.");

  console.log("\n  FLUXOS QUE PODEM SER TESTADOS:");
  console.log("    ✓ Matriz no computador (admin.matriz.staging@ecclesia.test)");
  console.log("    ✓ Setor em outro dispositivo (admin.setor.centro.staging@...)");
  console.log("    ✓ Congregação em outro dispositivo (admin.congregacao.centro...)");
  console.log("    ✓ Gerenciar Acessos → cards por função → lista de usuários");
  console.log("    ✓ Chat entre usuários de funções diferentes");
  console.log("    ✓ Membros com documentação civil por estado civil");
  console.log("    ✓ Membros com batismo nas águas e batismo c/ Espírito Santo");
  console.log("    ✓ Membros com data de consagração (Auxiliar → Pastor)");
  console.log("    ✓ Escopo por unidade (Setor Centro vê apenas suas congs)");
  console.log("    ✓ Carteira de membro (sem RG, com CPF)");
  console.log("    ✓ Cartas de recomendação");

  console.log("\n  PENDÊNCIAS (requerem ação manual):");
  if (!hasMigration) {
    console.log("    🔴 Migração 20260622120000 NÃO aplicada — campos novos ausentes nos membros.");
    console.log("       Aplique: Supabase Dashboard → SQL Editor →");
    console.log("       supabase/migrations/20260622120000_members_civil_ecclesiastical.sql");
    console.log("       Depois rode o seed novamente para popular os campos.");
  } else {
    console.log("    ✓  Migração 20260622120000 aplicada — campos novos inseridos.");
  }
  console.log("    ⚠️  Porteiro (porteiro.centro.staging@ecclesia.test) criado como");
  console.log("        member — função de porteiro (leitura QR Code) ficou pendente.");

  if (globalErrors.length > 0) {
    console.log(`\n  ⚠️  ${globalErrors.length} erro(s) encontrados:`);
    for (const e of globalErrors) {
      console.error(`    ❌ [${e.table}] ${e.msg}`);
    }
    console.log("  Verifique se as migrations estão aplicadas no banco staging.");
  } else {
    console.log("\n  🎉 Seed concluído sem erros!");
  }

  console.log("\n" + LINE);
  process.exit(0);
}

main().catch((e) => {
  console.error("\n💥 Erro fatal inesperado:", e?.message ?? e);
  process.exit(1);
});
