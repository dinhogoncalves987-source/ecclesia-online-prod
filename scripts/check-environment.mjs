#!/usr/bin/env node
/**
 * scripts/check-environment.mjs
 *
 * Guarda executada ANTES do build (`npm run build:production` /
 * `npm run build:staging` / `npm run env:check`). Falha fechado (exit code
 * 1) se houver qualquer indício de mistura entre produção e staging.
 *
 * Nunca imprime valores de chave/URL completos — apenas nomes de variável,
 * o ambiente (VITE_APP_ENV), o project ref extraído (não é segredo) e o
 * domínio (não é segredo).
 *
 * Variáveis consultadas (todas via process.env — no build da Vercel, as
 * variáveis configuradas no painel do projeto já chegam aqui, prefixadas
 * VITE_ ou não):
 *
 *   VITE_APP_ENV                        "production" | "staging"
 *   VITE_SUPABASE_URL                   https://<ref>.supabase.co
 *   VITE_EXPECTED_SUPABASE_PROJECT_REF  <ref>
 *   VITE_PUBLIC_APP_URL                 https://dominio
 *   SUPABASE_PRODUCTION_REF             <ref> (não-VITE_, apenas build-time)
 *   SUPABASE_STAGING_REF                <ref> (não-VITE_, apenas build-time)
 *   OFFICIAL_PRODUCTION_DOMAIN          dominio.oficial (sem protocolo)
 *
 *   VERCEL                              "1" quando executado por build da Vercel
 *   VERCEL_ENV                          "production" | "preview" | "development"
 *   VERCEL_GIT_COMMIT_REF               nome da branch, quando disponível
 */

const SUPABASE_HOST_PATTERN = /^([a-z0-9]+)\.supabase\.co$/i;

function extractProjectRef(url) {
  try {
    const { hostname } = new URL(url);
    const match = SUPABASE_HOST_PATTERN.exec(hostname);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function extractHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

class CheckFailure extends Error {}

function fail(messages) {
  const list = Array.isArray(messages) ? messages : [messages];
  console.error("\n❌ check-environment: build bloqueado — separação produção/staging violada\n");
  for (const m of list) console.error(`   - ${m}`);
  console.error("");
  throw new CheckFailure(list.join(" | "));
}

export function runEnvironmentCheck(env = process.env) {
  const errors = [];

  const appEnv = env.VITE_APP_ENV;
  const isVercel = env.VERCEL === "1";
  const vercelEnv = env.VERCEL_ENV; // "production" | "preview" | "development"
  const gitBranch = env.VERCEL_GIT_COMMIT_REF;
  const supabaseUrl = env.VITE_SUPABASE_URL ?? "";
  const expectedRef = env.VITE_EXPECTED_SUPABASE_PROJECT_REF ?? "";
  const publicAppUrl = env.VITE_PUBLIC_APP_URL ?? "";
  const productionRef = env.SUPABASE_PRODUCTION_REF;
  const stagingRef = env.SUPABASE_STAGING_REF;
  const officialDomain = env.OFFICIAL_PRODUCTION_DOMAIN;

  if (appEnv !== "production" && appEnv !== "staging") {
    errors.push(`VITE_APP_ENV deve ser "production" ou "staging" (recebido: ${JSON.stringify(appEnv ?? null)})`);
  }

  const actualRef = extractProjectRef(supabaseUrl);
  if (!actualRef) {
    errors.push("VITE_SUPABASE_URL ausente ou não corresponde a https://<ref>.supabase.co");
  } else if (expectedRef && actualRef !== expectedRef) {
    errors.push(
      `project ref de VITE_SUPABASE_URL ("${actualRef}") difere de VITE_EXPECTED_SUPABASE_PROJECT_REF ("${expectedRef}")`,
    );
  } else if (!expectedRef) {
    errors.push("VITE_EXPECTED_SUPABASE_PROJECT_REF ausente");
  }

  if (!publicAppUrl) {
    errors.push("VITE_PUBLIC_APP_URL ausente");
  }
  const domain = publicAppUrl ? extractHostname(publicAppUrl) : null;

  // ── Cross-checks entre ambientes (exigem os refs "conhecidos") ──────────
  if (actualRef && productionRef && appEnv === "staging" && actualRef === productionRef) {
    errors.push("staging está apontando para o project ref de PRODUÇÃO — bloqueado");
  }
  if (actualRef && stagingRef && appEnv === "production" && actualRef === stagingRef) {
    errors.push("produção está apontando para o project ref de STAGING — bloqueado");
  }

  // ── Regras específicas de Produção ──────────────────────────────────────
  if (appEnv === "production") {
    if (isVercel && vercelEnv && vercelEnv !== "production") {
      errors.push(`VITE_APP_ENV=production mas VERCEL_ENV="${vercelEnv}" (esperado "production")`);
    }
    if (isVercel && gitBranch && gitBranch !== "main") {
      errors.push(`produção exige a branch "main" (branch atual: "${gitBranch}")`);
    }
    if (officialDomain && domain && domain !== officialDomain) {
      errors.push(`produção exige o domínio oficial ("${officialDomain}"), recebido "${domain}"`);
    }
    if (!isVercel) {
      // Desenvolvimento local nunca deve apontar para produção.
      errors.push("uso local (fora da Vercel) de VITE_APP_ENV=production é recusado — use staging localmente");
    }
  }

  // ── Regras específicas de Staging/Preview ───────────────────────────────
  if (appEnv === "staging") {
    if (isVercel && vercelEnv === "production") {
      errors.push('VITE_APP_ENV=staging não pode ser publicado no Vercel Environment "production"');
    }
    if (officialDomain && domain && domain === officialDomain) {
      errors.push(`staging exige um domínio diferente do domínio oficial ("${officialDomain}")`);
    }
  }

  if (errors.length > 0) fail(errors);

  return {
    appEnv,
    projectRef: actualRef,
    domain,
    isVercel,
    vercelEnv: vercelEnv ?? null,
    gitBranch: gitBranch ?? null,
  };
}

function main() {
  try {
    const result = runEnvironmentCheck(process.env);
    console.log("✅ check-environment: configuração consistente");
    console.log(`   appEnv=${result.appEnv} projectRef=${result.projectRef} domain=${result.domain ?? "(n/d)"}`);
    if (result.isVercel) {
      console.log(`   vercelEnv=${result.vercelEnv} branch=${result.gitBranch ?? "(n/d)"}`);
    } else {
      console.log("   execução local (fora da Vercel)");
    }
  } catch (err) {
    if (err instanceof CheckFailure) process.exit(1);
    throw err;
  }
}

// Só executa main() quando chamado diretamente (node scripts/check-environment.mjs),
// nunca quando importado por testes.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
