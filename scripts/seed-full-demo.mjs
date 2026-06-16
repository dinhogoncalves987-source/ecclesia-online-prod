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

// Membros na Matriz
const MEM_IDS = Array.from({ length: 40 }, (_, i) => `dd000030-0000-0000-0000-${String(i + 1).padStart(12, "0")}`);

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
    { id: SETOR_A, name: "Setor Norte", slug: "setor-norte-caxias", organization_type: "setor", parent_id: MATRIZ_ID, city: "Caxias do Sul", state: "RS", active: true },
    { id: SETOR_B, name: "Setor Sul", slug: "setor-sul-caxias", organization_type: "setor", parent_id: MATRIZ_ID, city: "Caxias do Sul", state: "RS", active: true },
    { id: SETOR_C, name: "Setor Leste", slug: "setor-leste-caxias", organization_type: "setor", parent_id: MATRIZ_ID, city: "Caxias do Sul", state: "RS", active: true },
    { id: SETOR_D, name: "Setor Oeste", slug: "setor-oeste-caxias", organization_type: "setor", parent_id: MATRIZ_ID, city: "Caxias do Sul", state: "RS", active: true },
    { id: SETOR_E, name: "Setor Central", slug: "setor-central-caxias", organization_type: "setor", parent_id: MATRIZ_ID, city: "Caxias do Sul", state: "RS", active: true },
    { id: CONG_A1, name: "Congregação Esperança", slug: "cong-esperanca", organization_type: "congregacao", parent_id: SETOR_A, city: "Caxias do Sul", state: "RS", active: true },
    { id: CONG_A2, name: "Congregação Vitória", slug: "cong-vitoria", organization_type: "congregacao", parent_id: SETOR_A, city: "Caxias do Sul", state: "RS", active: true },
    { id: CONG_B1, name: "Congregação Paz", slug: "cong-paz", organization_type: "congregacao", parent_id: SETOR_B, city: "Caxias do Sul", state: "RS", active: true },
    { id: CONG_B2, name: "Congregação Graça", slug: "cong-graca", organization_type: "congregacao", parent_id: SETOR_B, city: "Caxias do Sul", state: "RS", active: true },
    { id: CONG_C1, name: "Congregação Renovação", slug: "cong-renovacao", organization_type: "congregacao", parent_id: SETOR_C, city: "Caxias do Sul", state: "RS", active: true },
    { id: CONG_C2, name: "Congregação Luz", slug: "cong-luz", organization_type: "congregacao", parent_id: SETOR_C, city: "Caxias do Sul", state: "RS", active: true },
    { id: CONG_D1, name: "Congregação Boa Nova", slug: "cong-boa-nova", organization_type: "congregacao", parent_id: SETOR_D, city: "Caxias do Sul", state: "RS", active: true },
    { id: CONG_D2, name: "Congregação Monte Sião", slug: "cong-monte-siao", organization_type: "congregacao", parent_id: SETOR_D, city: "Caxias do Sul", state: "RS", active: true },
    { id: CONG_E1, name: "Congregação Hosana", slug: "cong-hosana", organization_type: "congregacao", parent_id: SETOR_E, city: "Caxias do Sul", state: "RS", active: true },
    { id: CONG_E2, name: "Congregação Emanuel", slug: "cong-emanuel", organization_type: "congregacao", parent_id: SETOR_E, city: "Caxias do Sul", state: "RS", active: true },
  ];
  const n = await upsert("organizations", orgs);
  results["Setores"] = 5;
  results["Congregações"] = 10;
  console.log(`  ✅ ${n} organizações upserted`);
}

async function seedMembers() {
  console.log("\n👥 Membros...");
  const roles = ["pastor", "secretary", "tesoureiro", "contador", "leader", "leader", "member", "member", "member", "member"];
  const statuses = ["Ativo", "Ativo", "Ativo", "Ativo", "Ativo", "Ativo", "Ativo", "Inativo", "Visitante", "Ativo"];
  const names = [
    "João Pedro Oliveira", "Maria Clara Santos", "Carlos Eduardo Lima", "Ana Paula Zanella",
    "Fernando Henrique Souza", "Patricia Regina Ferreira", "Lucas Andrade Costa", "Juliana Beatriz Alves",
    "Roberto Silva Pereira", "Cristina Aparecida Rodrigues", "Marcelo Augusto Gomes", "Sandra Lucia Melo",
    "Anderson Ricardo Nunes", "Vanessa Cristina Pinto", "Eduardo Cesar Barbosa", "Fernanda Regina Braga",
    "Paulo Henrique Moreira", "Camila Aparecida Vieira", "Rodrigo Augusto Cardoso", "Aline Cristina Torres",
    "Felipe Eduardo Carvalho", "Mariana Santos Lima", "Gabriel Rodrigues Cruz", "Isabela Fernandes Dias",
    "Thiago Martins Rocha", "Leticia Paula Cunha", "Diego Henrique Mendes", "Natalia Aparecida Freitas",
    "Bruno Cesar Ribeiro", "Larissa Cristina Campos", "Rafael Eduardo Araújo", "Priscila Santos Moura",
    "Leonardo Silva Correia", "Tatiane Aparecida Castro", "Renato Augusto Teixeira", "Fabiana Regina Sousa",
    "Vinicius Henrique Monteiro", "Luciana Cristina Magalhães", "Alexandre Eduardo Lopes", "Daniela Santos Macedo",
  ];
  const orgs = [MATRIZ_ID, MATRIZ_ID, MATRIZ_ID, MATRIZ_ID, SETOR_A, SETOR_B, CONG_A1, CONG_A2, CONG_B1, CONG_B2,
    CONG_C1, CONG_C2, CONG_D1, CONG_D2, CONG_E1, CONG_E2, MATRIZ_ID, MATRIZ_ID, SETOR_C, SETOR_D,
    CONG_A1, CONG_B1, CONG_C1, CONG_D1, CONG_E1, CONG_A2, CONG_B2, CONG_C2, CONG_D2, CONG_E2,
    SETOR_A, SETOR_B, SETOR_C, SETOR_D, SETOR_E, MATRIZ_ID, CONG_A1, CONG_B1, CONG_C1, CONG_D1];

  const members = names.map((full_name, i) => ({
    id: MEM_IDS[i],
    organization_id: orgs[i] || MATRIZ_ID,
    full_name,
    member_role: roles[i % roles.length],
    status: statuses[i % statuses.length],
    phone: `(54) 9${String(90000000 + i * 1111).slice(0, 8)}`,
    email: `${full_name.split(" ")[0].toLowerCase()}${i + 1}@ecclesia.demo`,
    joined_at: new Date(Date.now() - (i * 30 + 60) * 86400000).toISOString().slice(0, 10),
    cpf: `${String(100 + i).padStart(3, "0")}.${String(200 + i).padStart(3, "0")}.${String(300 + i).padStart(3, "0")}-${String(i % 100).padStart(2, "0")}`,
  }));

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
  const letters = [
    { id: "dd000100-0000-0000-0000-000000000001", organization_id: MATRIZ_ID, member_name: "Maria Clara Santos", member_email: "maria1@ecclesia.demo", destination_church: "Assembleia de Deus — Porto Alegre", destination_city: "Porto Alegre", destination_state: "RS", reason: "Transferência de residência por motivo de trabalho.", status: "approved", approved_at: isoDate(-10), expires_at: isoDate(365) },
    { id: "dd000100-0000-0000-0000-000000000002", organization_id: MATRIZ_ID, member_name: "Lucas Andrade Costa", member_email: "lucas3@ecclesia.demo", destination_church: "Igreja Batista Central", destination_city: "Gramado", destination_state: "RS", reason: "Casamento e mudança para cidade do cônjuge.", status: "approved", approved_at: isoDate(-5), expires_at: isoDate(360) },
    { id: "dd000100-0000-0000-0000-000000000003", organization_id: MATRIZ_ID, member_name: "Fernando Henrique Souza", member_email: "fernando5@ecclesia.demo", destination_church: "Assembleia de Deus — Florianópolis", destination_city: "Florianópolis", destination_state: "SC", reason: "Transferência a trabalho.", status: "under_review" },
    { id: "dd000100-0000-0000-0000-000000000004", organization_id: MATRIZ_ID, member_name: "Juliana Beatriz Alves", member_email: "juliana8@ecclesia.demo", destination_church: "Igreja Evangélica", destination_city: "Bento Gonçalves", destination_state: "RS", reason: "Mudança de bairro.", status: "requested" },
    { id: "dd000100-0000-0000-0000-000000000005", organization_id: MATRIZ_ID, member_name: "Roberto Silva Pereira", member_email: "roberto9@ecclesia.demo", destination_church: "AD Missões", destination_city: "São Paulo", destination_state: "SP", reason: "Missão de trabalho por 2 anos.", status: "rejected", rejected_reason: "Pendência de devolução de material da biblioteca." },
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
