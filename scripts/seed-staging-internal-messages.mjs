#!/usr/bin/env node
/**
 * Fase 3A.1 — Seed demo Ecclesia Chat (internal_threads + internal_messages).
 *
 * Requer (nunca commitar):
 *   SUPABASE_URL=https://qkiiwopkbcslquyfhdec.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *
 * Usage:
 *   npm run chat:seed-staging
 *
 * Idempotente: threads por source+campaign_id+subject; mensagens por id fixo.
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { assertSafeToSeedStagingFromProcessEnv, SeedGuardError } from "./lib/seedGuard.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)="([^"]*)"/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const dotenv = {
  ...loadEnvFile(path.join(ROOT, ".env")),
  ...loadEnvFile(path.join(ROOT, ".env.local")),
};

const supabaseUrl = (
  process.env.SUPABASE_URL ||
  dotenv.SUPABASE_URL ||
  dotenv.VITE_SUPABASE_URL ||
  ""
).replace(/\/+$/, "");

const serviceKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  dotenv.SUPABASE_SERVICE_ROLE_KEY ||
  ""
).trim();

if (!supabaseUrl || !serviceKey) {
  console.error(
    "\n❌ Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.\n" +
      "   Staging: https://qkiiwopkbcslquyfhdec.supabase.co\n" +
      "   Exemplo: $env:SUPABASE_SERVICE_ROLE_KEY=\"...\"; npm run chat:seed-staging\n",
  );
  process.exit(1);
}

// Guarda de ambiente — recusa produção e exige confirmação explícita.
// Requer: APP_ENV=staging e SEED_STAGING="SEED_STAGING" no ambiente.
try {
  assertSafeToSeedStagingFromProcessEnv({ supabaseUrl });
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

const MIGRATION_HINT =
  "Migration do Ecclesia Chat ainda não aplicada. Aplique 20260609100000_staging_internal_messages.sql antes do seed.";

/** @type {Array<{
 *   campaignTitles: string[];
 *   threadId: string;
 *   subject: string;
 *   status: string;
 *   messages: Array<{ id: string; sender_role: string; body: string; offsetDays: number; hour: number }>;
 * }>} */
const DEMO_CONVERSATIONS = [
  {
    campaignTitles: ["Reforma do Templo Central"],
    threadId: "eeeeeeee-0000-0000-0000-000000000001",
    subject: "Dúvida sobre prestação de contas da reforma",
    status: "answered",
    messages: [
      {
        id: "ffffffff-0000-0000-0000-000000000001",
        sender_role: "member",
        body: "Paz do Senhor. Vi a campanha da reforma e queria saber se já existe previsão para publicar o próximo relatório de gastos.",
        offsetDays: 14,
        hour: 10,
      },
      {
        id: "ffffffff-0000-0000-0000-000000000002",
        sender_role: "church_admin",
        body: "Paz do Senhor. Sim, o relatório da etapa elétrica está sendo fechado e será publicado na próxima atualização da campanha.",
        offsetDays: 14,
        hour: 11,
      },
      {
        id: "ffffffff-0000-0000-0000-000000000003",
        sender_role: "member",
        body: "Perfeito. Também gostaria de saber se ainda estão recebendo ofertas específicas para acessibilidade.",
        offsetDays: 13,
        hour: 9,
      },
      {
        id: "ffffffff-0000-0000-0000-000000000004",
        sender_role: "church_admin",
        body: "Sim, essa frente continua aberta. As ofertas identificadas para acessibilidade entram vinculadas à campanha.",
        offsetDays: 13,
        hour: 15,
      },
    ],
  },
  {
    campaignTitles: ["Ganhando Almas"],
    threadId: "eeeeeeee-0000-0000-0000-000000000002",
    subject: "Como participar do evangelismo de sábado",
    status: "pending",
    messages: [
      {
        id: "ffffffff-0000-0000-0000-000000000005",
        sender_role: "member",
        body: "Paz do Senhor. Quero participar da ação de evangelismo de sábado. Preciso fazer inscrição?",
        offsetDays: 7,
        hour: 8,
      },
      {
        id: "ffffffff-0000-0000-0000-000000000006",
        sender_role: "leader",
        body: "Paz do Senhor. Pode participar sim. Vamos nos reunir às 14h na congregação para oração e divisão das equipes.",
        offsetDays: 7,
        hour: 10,
      },
      {
        id: "ffffffff-0000-0000-0000-000000000007",
        sender_role: "member",
        body: "Posso levar minha filha junto?",
        offsetDays: 6,
        hour: 19,
      },
      {
        id: "ffffffff-0000-0000-0000-000000000008",
        sender_role: "leader",
        body: "Pode sim. Apenas pedimos que venha com um responsável e permaneça junto da equipe durante a ação.",
        offsetDays: 6,
        hour: 20,
      },
    ],
  },
  {
    campaignTitles: ["Veículo para Missões Regionais", "Veículo Missionário"],
    threadId: "eeeeeeee-0000-0000-0000-000000000003",
    subject: "Oferta para o veículo missionário",
    status: "answered",
    messages: [
      {
        id: "ffffffff-0000-0000-0000-000000000009",
        sender_role: "member",
        body: "Boa tarde. Quero contribuir com a campanha do veículo missionário. Posso fazer uma oferta parcelada?",
        offsetDays: 10,
        hour: 14,
      },
      {
        id: "ffffffff-0000-0000-0000-000000000010",
        sender_role: "church_admin",
        body: "Boa tarde. Pode sim. Você pode contribuir mensalmente e identificar como Campanha Veículo Missionário.",
        offsetDays: 10,
        hour: 16,
      },
      {
        id: "ffffffff-0000-0000-0000-000000000011",
        sender_role: "member",
        body: "Ótimo. Essa campanha ainda está ativa?",
        offsetDays: 9,
        hour: 11,
      },
      {
        id: "ffffffff-0000-0000-0000-000000000012",
        sender_role: "church_admin",
        body: "Sim, está ativa. Toda contribuição será registrada na prestação de contas da campanha.",
        offsetDays: 9,
        hour: 12,
      },
    ],
  },
  {
    campaignTitles: ["Missões África"],
    threadId: "eeeeeeee-0000-0000-0000-000000000004",
    subject: "Informações sobre envio missionário",
    status: "open",
    messages: [
      {
        id: "ffffffff-0000-0000-0000-000000000013",
        sender_role: "member",
        body: "Paz. Essa campanha de Missões África é para envio de equipe ou apoio financeiro no campo?",
        offsetDays: 5,
        hour: 9,
      },
      {
        id: "ffffffff-0000-0000-0000-000000000014",
        sender_role: "leader",
        body: "Paz. Ela cobre as duas frentes: apoio ao campo e despesas de envio da equipe missionária.",
        offsetDays: 5,
        hour: 11,
      },
      {
        id: "ffffffff-0000-0000-0000-000000000015",
        sender_role: "member",
        body: "Vocês vão publicar fotos e relatórios?",
        offsetDays: 4,
        hour: 18,
      },
      {
        id: "ffffffff-0000-0000-0000-000000000016",
        sender_role: "leader",
        body: "Sim. As atualizações serão publicadas na timeline da campanha conforme os missionários enviarem os relatos.",
        offsetDays: 4,
        hour: 19,
      },
    ],
  },
  {
    campaignTitles: ["Ação Social Inverno"],
    threadId: "eeeeeeee-0000-0000-0000-000000000005",
    subject: "Doação de cobertores e cestas",
    status: "answered",
    messages: [
      {
        id: "ffffffff-0000-0000-0000-000000000017",
        sender_role: "member",
        body: "Paz do Senhor. Ainda posso doar cobertores para a campanha de inverno?",
        offsetDays: 20,
        hour: 10,
      },
      {
        id: "ffffffff-0000-0000-0000-000000000018",
        sender_role: "leader",
        body: "Paz. Pode sim. Estamos recebendo cobertores limpos e em bom estado até domingo.",
        offsetDays: 20,
        hour: 12,
      },
      {
        id: "ffffffff-0000-0000-0000-000000000019",
        sender_role: "member",
        body: "Também posso doar cesta básica?",
        offsetDays: 19,
        hour: 8,
      },
      {
        id: "ffffffff-0000-0000-0000-000000000020",
        sender_role: "leader",
        body: "Pode sim. Cestas básicas também estão sendo direcionadas para as famílias cadastradas.",
        offsetDays: 19,
        hour: 9,
      },
    ],
  },
  {
    campaignTitles: ["Capela de Oração 24h", "Reforma da Capela de Oração", "Capela de Oração"],
    threadId: "eeeeeeee-0000-0000-0000-000000000006",
    subject: "Escala de oração da capela",
    status: "pending",
    messages: [
      {
        id: "ffffffff-0000-0000-0000-000000000021",
        sender_role: "member",
        body: "Paz do Senhor. Como faço para entrar na escala da capela de oração?",
        offsetDays: 3,
        hour: 7,
      },
      {
        id: "ffffffff-0000-0000-0000-000000000022",
        sender_role: "leader",
        body: "Paz. Estamos organizando os horários por turnos. Você pode informar o melhor dia e horário.",
        offsetDays: 3,
        hour: 9,
      },
      {
        id: "ffffffff-0000-0000-0000-000000000023",
        sender_role: "member",
        body: "Tenho disponibilidade nas terças à noite.",
        offsetDays: 2,
        hour: 20,
      },
      {
        id: "ffffffff-0000-0000-0000-000000000024",
        sender_role: "leader",
        body: "Ótimo. Vamos registrar sua disponibilidade e a equipe entra em contato para confirmar.",
        offsetDays: 2,
        hour: 21,
      },
    ],
  },
];

function messageTimestamp(offsetDays, hour) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offsetDays);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

async function checkMigrationApplied() {
  const { error } = await sb.from("internal_threads").select("id").limit(1);
  if (error) {
    const msg = String(error.message ?? error);
    if (
      msg.includes("does not exist") ||
      msg.includes("Could not find") ||
      msg.includes("schema cache") ||
      msg.includes("internal_threads")
    ) {
      console.error(`\n❌ ${MIGRATION_HINT}\n`);
      console.error(`   Detalhe: ${msg}\n`);
      process.exit(1);
    }
    throw new Error(`diagnose internal_threads: ${msg}`);
  }
}

/** @param {Array<{ id: string; title: string; organization_id: string }>} campaigns */
function findCampaign(campaigns, preferredTitles) {
  for (const title of preferredTitles) {
    const exact = campaigns.find((c) => c.title === title);
    if (exact) return exact;
  }
  for (const title of preferredTitles) {
    const needle = title.toLowerCase();
    const partial = campaigns.find((c) => {
      const hay = c.title.toLowerCase();
      return hay.includes(needle) || needle.includes(hay);
    });
    if (partial) return partial;
  }
  return null;
}

async function findDemoUserId() {
  const { data: members } = await sb
    .from("organization_users")
    .select("user_id")
    .eq("role", "member")
    .eq("is_active", true)
    .limit(1);

  if (members?.[0]?.user_id) return members[0].user_id;

  const { data: profiles } = await sb.from("profiles").select("user_id").limit(1);
  return profiles?.[0]?.user_id ?? null;
}

async function findExistingThread(campaignId, _subject) {
  // Modelo de conversa única: busca pelo campaign_id apenas (sem subject)
  const { data } = await sb
    .from("internal_threads")
    .select("id, subject")
    .eq("source", "campaign")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  return data;
}

async function seedConversation(conversation, campaign, demoUserId, stats) {
  const { subject, status, messages, threadId } = conversation;

  let threadRecord = await findExistingThread(campaign.id, subject);
  let threadDbId;

  if (threadRecord) {
    stats.threadsExisting++;
    threadDbId = threadRecord.id;
    console.log(`  ↷ Thread já existe: "${subject}" (${campaign.title})`);
  } else {
    const lastMsgAt = messageTimestamp(
      Math.min(...messages.map((m) => m.offsetDays)),
      Math.max(...messages.map((m) => m.hour)),
    );

    const { error } = await sb.from("internal_threads").insert({
      id: threadId,
      organization_id: campaign.organization_id,
      campaign_id: campaign.id,
      created_by: demoUserId,
      member_id: null,
      assigned_to: null,
      subject,
      status,
      source: "campaign",
      reply_enabled: true,
      last_message_at: lastMsgAt,
    });

    if (error) {
      if (error.message?.includes("duplicate key")) {
        const again = await findExistingThread(campaign.id, subject);
        if (again) {
          stats.threadsExisting++;
          threadDbId = again.id;
        } else {
          throw new Error(`thread duplicate but not found: ${subject}`);
        }
      } else {
        throw new Error(`insert thread "${subject}": ${error.message}`);
      }
    } else {
      stats.threadsCreated++;
      threadDbId = threadId;
      console.log(`  ✓ Thread criada: "${subject}" (${campaign.title})`);
    }
  }

  for (const msg of messages) {
    const { data: existing } = await sb
      .from("internal_messages")
      .select("id")
      .eq("id", msg.id)
      .maybeSingle();

    if (existing) continue;

    const createdAt = messageTimestamp(msg.offsetDays, msg.hour);

    const { error } = await sb.from("internal_messages").insert({
      id: msg.id,
      thread_id: threadDbId,
      organization_id: campaign.organization_id,
      sender_user_id: null,
      sender_member_id: null,
      sender_role: msg.sender_role,
      body: msg.body,
      message_type: "text",
      created_at: createdAt,
    });

    if (error) {
      throw new Error(`insert message ${msg.id}: ${error.message}`);
    }

    stats.messagesCreated++;
  }

  const { data: threadMessages } = await sb
    .from("internal_messages")
    .select("created_at")
    .eq("thread_id", threadDbId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (threadMessages?.[0]?.created_at) {
    await sb
      .from("internal_threads")
      .update({
        last_message_at: threadMessages[0].created_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", threadDbId);
  }
}

async function main() {
  console.log("Seed staging — Ecclesia Chat demo (Fase 3A.1)");
  console.log(`URL: ${supabaseUrl}\n`);

  await checkMigrationApplied();
  console.log("✓ Tabelas internal_* encontradas.\n");

  const { data: campaigns, error: campError } = await sb
    .from("campaigns")
    .select("id, title, organization_id");

  if (campError) throw new Error(`campaigns: ${campError.message}`);

  const demoUserId = await findDemoUserId();
  if (demoUserId) {
    console.log(`Usuário demo para created_by: ${demoUserId.slice(0, 8)}…`);
  } else {
    console.log("Aviso: nenhum usuário demo encontrado — created_by será null nas threads.");
  }

  const stats = {
    campaignsFound: 0,
    threadsCreated: 0,
    threadsExisting: 0,
    messagesCreated: 0,
    ignored: /** @type {string[]} */ ([]),
  };

  console.log("\n--- Processando conversas demo ---\n");

  for (const conversation of DEMO_CONVERSATIONS) {
    const campaign = findCampaign(campaigns ?? [], conversation.campaignTitles);
    if (!campaign) {
      const label = conversation.campaignTitles[0];
      stats.ignored.push(label);
      console.warn(`  ⚠ Campanha não encontrada (ignorada): ${label}`);
      continue;
    }

    stats.campaignsFound++;
    await seedConversation(conversation, campaign, demoUserId, stats);
  }

  const { count: threadCount } = await sb
    .from("internal_threads")
    .select("id", { count: "exact", head: true })
    .eq("source", "campaign");

  const { count: messageCount } = await sb
    .from("internal_messages")
    .select("id", { count: "exact", head: true });

  console.log("\n--- Relatório ---");
  console.log(`Campanhas encontradas: ${stats.campaignsFound} / ${DEMO_CONVERSATIONS.length}`);
  console.log(`Threads criadas: ${stats.threadsCreated}`);
  console.log(`Threads já existiam: ${stats.threadsExisting}`);
  console.log(`Mensagens criadas nesta execução: ${stats.messagesCreated}`);
  console.log(`Total threads (campaign): ${threadCount ?? 0}`);
  console.log(`Total mensagens no banco: ${messageCount ?? 0}`);

  if (stats.ignored.length > 0) {
    console.log(`\nCampanhas ignoradas (não encontradas):`);
    for (const t of stats.ignored) console.log(`  • ${t}`);
  }

  console.log("\n✓ Seed concluído.\n");
}

main().catch((err) => {
  console.error("\n❌", err.message || err);
  process.exit(1);
});
