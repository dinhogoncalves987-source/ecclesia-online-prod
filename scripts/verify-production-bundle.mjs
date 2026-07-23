#!/usr/bin/env node
/**
 * scripts/verify-production-bundle.mjs
 *
 * FASE 6 (separação de código por build) — teste de artefato: constrói um
 * build de PRODUÇÃO real (via `vite build --mode production`, com as MESMAS
 * validações de scripts/check-environment.mjs) e falha (exit code 1) se
 * qualquer nome/import de módulo staging-only aparecer nos arquivos gerados
 * em `dist/`.
 *
 * Não usa nenhum segredo real: os project refs (zsonukpxahaxffugavfu /
 * qkiiwopkbcslquyfhdec) são identificadores PÚBLICOS (ver
 * src/config/environment.ts), e a "publishable key" usada aqui é um valor
 * fictício apenas para satisfazer a validação de formato do build — o build
 * do Vite nunca faz uma chamada de rede real ao Supabase, apenas embute a
 * string no bundle. Este script NUNCA lê `.env`/`.env.local`/segredos reais;
 * ele define suas próprias variáveis de ambiente efêmeras, isoladas, só para
 * este processo filho.
 *
 * Uso:
 *   node scripts/verify-production-bundle.mjs
 *
 * Saída:
 *   0  — build de produção não contém nenhum módulo staging-only.
 *   1  — build falhou, OU algum termo proibido foi encontrado em dist/.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DIST_DIR = path.join(ROOT, "dist");

// Refs canônicos e domínio oficial — mesmos valores públicos usados em
// src/config/environment.ts / scripts/check-environment.mjs.
const PRODUCTION_REF = "zsonukpxahaxffugavfu";
const STAGING_REF = "qkiiwopkbcslquyfhdec";
const OFFICIAL_DOMAIN = "ecclesiabr.online";

// Termos que NUNCA podem aparecer em um bundle de produção — nomes de
// arquivo/rota/componente/flag exclusivos de módulos staging-only (ver
// src/config/modules.ts, availability: "staging") ou explicitamente citados
// na FASE 6 (Bíblia, TV, Canal Ecclésia, campanhas demo, cartas, comunidade).
// Escritos aqui no case original (mais fácil de revisar/digitar sem erro) e
// convertidos para minúsculas em código — a comparação em si é sempre
// case-insensitive sobre o CONTEÚDO dos arquivos gerados (não sobre nomes de
// arquivo — chunks já têm hash e nomes minificados).
const FORBIDDEN_TERMS_SOURCE = [
  // "financeDemo" removido em 2026-07-17: agora também é importado por
  // FinanceAccounts (real, ver abaixo) só pelos tipos/formatação de moeda —
  // as outras abas fictícias continuam banidas individualmente pelo nome do
  // próprio componente (FinanceExecutive, FinanceBudget, etc.), que
  // continuam condicionados a IS_STAGING_BUILD em src/pages/Financeiro.tsx.
  //
  // "FinanceExecutive" removido em 2026-07-24 (Fase G — restauração do
  // Financeiro): os 6 KPIs, o consolidado por hierarquia e o desempenho por
  // centro de custo passaram a vir de transactions/campanhas/finance_budgets
  // reais e da árvore real de organizações — ver
  // src/components/financeiro/FinanceExecutive.tsx, src/lib/financeInsights.ts
  // e src/config/modules.ts (finance.executive agora "both").
  //
  // "FinanceCampaigns" removido em 2026-07-20 (Fase B — restauração do
  // Financeiro): consulta campaigns/campaign_contributions reais via
  // useCampaigns(), sem depender de campaignsDemo como fonte de dado
  // exibido — ver src/components/financeiro/FinanceCampaigns.tsx e
  // src/config/modules.ts (finance.campaigns agora "both").
  //
  // "FinanceAccounts" removido em 2026-07-17: passou a consultar
  // `transactions` real (contas a pagar/receber com status/data reais) —
  // ver src/components/financeiro/FinanceAccounts.tsx e
  // src/config/modules.ts (finance.accounts agora "both").
  // "FinanceBudget" removido em 2026-07-20 (Fase D — restauração do
  // Financeiro): passou a ler/gravar public.finance_budgets real, com
  // "realizado" agregado de `transactions` por centro de custo — ver
  // src/components/financeiro/FinanceBudget.tsx e src/config/modules.ts
  // (finance.budget agora "both").
  //
  // "FinanceAssets" removido em 2026-07-22 (Fase E — restauração do
  // Financeiro): passou a fazer CRUD real sobre public.finance_assets — ver
  // src/components/financeiro/FinanceAssets.tsx e src/config/modules.ts
  // (finance.assets agora "both").
  //
  // "FinanceAccountability" removido em 2026-07-23 (Fase F — restauração do
  // Financeiro): os "Relatórios históricos" passaram a ler/gravar
  // public.finance_accountability_reports/_approvals real — ver
  // src/components/financeiro/FinanceAccountability.tsx e
  // src/config/modules.ts (finance.accountability agora "both").
  //
  // "FinanceAudit" removido em 2026-07-20 (Fase A — restauração do
  // Financeiro): passou a consultar `finance_transaction_audit_logs` real
  // (populada por trigger em transactions), sem nenhum dado fictício — ver
  // src/components/financeiro/FinanceAudit.tsx e src/config/modules.ts
  // (finance.audit agora "both").
  //
  // "FinanceIntelligence" removido em 2026-07-24 (Fase H — restauração do
  // Financeiro): alertas/insights/ações recomendadas passaram a vir de
  // regras determinísticas sobre dados reais (mesma fonte do Executivo,
  // src/lib/financeInsights.ts), sem IA generativa e sem dado fictício —
  // ver src/components/financeiro/FinanceIntelligence.tsx e
  // src/config/modules.ts (finance.intelligence agora "both").
  //
  // "pages/Biblia" removido em 2026-07-17: Bíblia/IA foi promovida para
  // availability: "both" (não depende de tabela/migration staging-only) —
  // agora DEVE aparecer no bundle de produção. Ver src/config/modules.ts.
  //
  // "campaignsDemo", "pages/CultoLouvor", "pages/Campanhas",
  // "pages/CartasRecomendacao", "pages/Relatorios", "culto/BibliotecaMusicas",
  // "culto/RoteirosCulto", "culto/TelaoProjecao", "culto/AssistenteCulto" e
  // "pages/ValidarCarta" removidos em 2026-07-17: Culto & Louvor, Campanhas,
  // Cartas de Recomendação e Relatórios foram promovidos para
  // availability: "both" — todos têm backend real no Supabase (nenhum
  // depende de dado fictício exibido ao usuário). Ver src/config/modules.ts.
  //
  // "pages/DevocionalPublic" e "components/DailyDevotional" removidos em
  // 2026-07-20: "devotional" foi promovido para availability: "both" —
  // banco de versículos reais (edge function daily-devotional), sem
  // nenhum dado fictício exibido ao usuário. Ver src/config/modules.ts.
  "pages/Marketplace",
  "pages/Comunidade",
  "tv-digital",
  "canal-ecclesia",
  "CanalEcclesia",
  // OPERAÇÃO 2 (Discipulado, 2026-07-29) — staging-only enquanto as
  // migrations discipleship_* não forem aplicadas em nenhum ambiente (ver
  // src/config/modules.ts e docs/architecture/operacao-2-discipulado.md).
  // Mesmo padrão de tree-shaking condicional de Marketplace/Comunidade —
  // App.tsx só faz `import("./pages/Discipulado")` quando IS_STAGING_BUILD.
  "pages/Discipulado",
  // OPERAÇÃO 3 (Teologia, 2026-07-30) — staging-only enquanto as migrations
  // theology_* não forem aplicadas em nenhum ambiente (ver
  // src/config/modules.ts e docs/architecture/operacao-3-teologia.md).
  // Mesmo padrão de tree-shaking condicional do Discipulado.
  "pages/Teologia",
];
const FORBIDDEN_TERMS = FORBIDDEN_TERMS_SOURCE.map((term) => term.toLowerCase());

function fail(message) {
  console.error(`\n❌ verify-production-bundle: ${message}\n`);
  process.exit(1);
}

function run(cmd, args, env) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status;
}

function listFilesRecursive(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listFilesRecursive(full));
    else out.push(full);
  }
  return out;
}

function main() {
  console.log("── verify-production-bundle: construindo build de PRODUÇÃO (efêmero) ──\n");

  if (existsSync(DIST_DIR)) {
    rmSync(DIST_DIR, { recursive: true, force: true });
  }

  // Variáveis efêmeras, só para este processo filho — NUNCA gravadas em
  // disco, NUNCA lidas de .env/.env.local. Publishable key é um valor
  // fictício (o build não faz nenhuma chamada de rede real).
  const buildEnv = {
    VITE_APP_ENV: "production",
    VITE_SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co`,
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_verify_production_bundle_placeholder",
    VITE_EXPECTED_SUPABASE_PROJECT_REF: PRODUCTION_REF,
    VITE_PUBLIC_APP_URL: `https://${OFFICIAL_DOMAIN}`,
    VITE_ENABLE_LEGACY_CHURCH_SCOPE_FALLBACK: "false",
    SUPABASE_PRODUCTION_REF: PRODUCTION_REF,
    SUPABASE_STAGING_REF: STAGING_REF,
    OFFICIAL_PRODUCTION_DOMAIN: OFFICIAL_DOMAIN,
    // Simula execução na Vercel/branch main — as mesmas regras que valem no
    // deploy real de produção (ver scripts/check-environment.mjs).
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
  };

  const buildStatus = run("npx", ["vite", "build", "--mode", "production"], buildEnv);
  if (buildStatus !== 0) {
    fail("o build de produção falhou — corrija o build antes de rodar este teste de artefato.");
  }

  if (!existsSync(DIST_DIR)) {
    fail("dist/ não foi gerado pelo build.");
  }

  const files = listFilesRecursive(DIST_DIR).filter((f) => /\.(js|mjs|css|html)$/i.test(f));
  console.log(`\n── verificando ${files.length} arquivo(s) em dist/ por termos proibidos ──\n`);

  const findings = [];
  for (const file of files) {
    const content = readFileSync(file, "utf8").toLowerCase();
    for (const term of FORBIDDEN_TERMS) {
      if (content.includes(term)) {
        findings.push({ file: path.relative(ROOT, file), term });
      }
    }
  }

  if (findings.length > 0) {
    console.error("\n❌ MÓDULOS STAGING-ONLY ENCONTRADOS NO BUILD DE PRODUÇÃO:\n");
    for (const { file, term } of findings) {
      console.error(`   - "${term}" em ${file}`);
    }
    fail(
      `${findings.length} ocorrência(s) de termo proibido — o build de produção NÃO pode conter ` +
        `módulos staging-only (Bíblia, Culto, Campanhas, Cartas, Relatórios, Marketplace, Comunidade, ` +
        `TV Digital, Canal Ecclésia, financeDemo/campaignsDemo).`,
    );
  }

  console.log("✅ verify-production-bundle: nenhum módulo staging-only encontrado no build de produção.\n");
}

main();
