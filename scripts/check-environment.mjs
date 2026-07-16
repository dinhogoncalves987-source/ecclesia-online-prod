/**
 * scripts/check-environment.mjs
 *
 * (Sem shebang de propósito: este arquivo é sempre invocado via
 * `node scripts/check-environment.mjs` — nunca executado diretamente como
 * `./scripts/check-environment.mjs` — e também é importado como módulo por
 * vite.config.ts. Um shebang na primeira linha quebra o bundling do esbuild
 * quando o arquivo é importado como dependência, não como entry point.)
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
import path from "node:path";
import { fileURLToPath } from "node:url";

const SUPABASE_HOST_PATTERN = /^([a-z0-9]+)\.supabase\.co$/i;

/**
 * MODELO OFICIAL E IMUTÁVEL DE AMBIENTES — mesmos valores hardcoded em
 * src/config/environment.ts (duplicado propositalmente: um roda em Node no
 * build, o outro no bundle do browser em runtime; ambos são a última linha
 * de defesa, cada um no seu contexto). São identificadores PÚBLICOS de
 * project ref do Supabase, não são segredos.
 */
const CANONICAL_PRODUCTION_REF = "zsonukpxahaxffugavfu";
const CANONICAL_STAGING_REF = "qkiiwopkbcslquyfhdec";
const CANONICAL_OFFICIAL_DOMAIN = "ecclesiabr.online";

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
  // OFFICIAL_PRODUCTION_DOMAIN pode ser sobrescrito por env (ex.: testes),
  // mas SEMPRE cai de volta no domínio canônico imutável — nunca fica sem
  // domínio de referência para validar contra.
  const officialDomain = env.OFFICIAL_PRODUCTION_DOMAIN || CANONICAL_OFFICIAL_DOMAIN;

  if (appEnv !== "production" && appEnv !== "staging") {
    errors.push(`VITE_APP_ENV deve ser "production" ou "staging" (recebido: ${JSON.stringify(appEnv ?? null)})`);
  }

  // ── SUPABASE_PRODUCTION_REF / SUPABASE_STAGING_REF: obrigatórios, ────────
  // distintos, e ANCORADOS nos refs canônicos imutáveis (não bastam
  // "distintos entre si" — cada um precisa ser exatamente o ref correto).
  if (!productionRef) {
    errors.push("SUPABASE_PRODUCTION_REF ausente (obrigatório, build-time)");
  } else if (productionRef !== CANONICAL_PRODUCTION_REF) {
    errors.push(
      `SUPABASE_PRODUCTION_REF ("${productionRef}") difere do ref canônico de produção ("${CANONICAL_PRODUCTION_REF}")`,
    );
  }
  if (!stagingRef) {
    errors.push("SUPABASE_STAGING_REF ausente (obrigatório, build-time)");
  } else if (stagingRef !== CANONICAL_STAGING_REF) {
    errors.push(
      `SUPABASE_STAGING_REF ("${stagingRef}") difere do ref canônico de staging ("${CANONICAL_STAGING_REF}")`,
    );
  }
  if (productionRef && stagingRef && productionRef === stagingRef) {
    errors.push("SUPABASE_PRODUCTION_REF e SUPABASE_STAGING_REF não podem ser iguais");
  }

  const actualRef = extractProjectRef(supabaseUrl);
  if (!actualRef) {
    errors.push("VITE_SUPABASE_URL ausente ou não corresponde a https://<ref>.supabase.co");
  } else if (!expectedRef) {
    errors.push("VITE_EXPECTED_SUPABASE_PROJECT_REF ausente");
  } else if (actualRef !== expectedRef) {
    errors.push(
      `project ref de VITE_SUPABASE_URL ("${actualRef}") difere de VITE_EXPECTED_SUPABASE_PROJECT_REF ("${expectedRef}")`,
    );
  } else {
    // ── Trava contra autovalidação incorreta ───────────────────────────────
    // expectedRef === actualRef só prova consistência INTERNA. Cada appEnv
    // só pode usar o ref canônico mapeado para ele — nunca o do outro
    // ambiente, mesmo que URL e "expected" concordem entre si.
    const canonicalForAppEnv = appEnv === "production" ? CANONICAL_PRODUCTION_REF : CANONICAL_STAGING_REF;
    if (appEnv === "production" || appEnv === "staging") {
      if (actualRef !== canonicalForAppEnv) {
        errors.push(
          `VITE_APP_ENV="${appEnv}" só pode usar o project ref canônico "${canonicalForAppEnv}" (recebido "${actualRef}")`,
        );
      }
    }
  }

  if (!publicAppUrl) {
    errors.push("VITE_PUBLIC_APP_URL ausente");
  }
  const domain = publicAppUrl ? extractHostname(publicAppUrl) : null;

  // ── Regras específicas de Produção ──────────────────────────────────────
  if (appEnv === "production") {
    if (isVercel && vercelEnv && vercelEnv !== "production") {
      errors.push(`VITE_APP_ENV=production mas VERCEL_ENV="${vercelEnv}" (esperado "production")`);
    }
    if (isVercel && gitBranch && gitBranch !== "main") {
      errors.push(`produção exige a branch "main" (branch atual: "${gitBranch}")`);
    }
    if (domain && domain !== officialDomain) {
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
    if (domain && domain === officialDomain) {
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
// nunca quando importado por testes/vite.config.ts.
//
// CORREÇÃO (Windows): comparar `import.meta.url` como string contra
// `file://${process.argv[1]}` NUNCA bate no Windows, porque `process.argv[1]`
// usa barras invertidas (`C:\...`) enquanto `import.meta.url` é uma URL
// file:// com barras normais e o drive letter percent-encoded de forma
// diferente — então essa comparação sempre falhava silenciosamente,
// main() NUNCA executava, e `node scripts/check-environment.mjs` saía com
// exit code 0 sem validar absolutamente nada (fail-OPEN, o oposto do que
// esta guarda existe para fazer). Comparando caminhos de arquivo resolvidos
// (via fileURLToPath + path.resolve) funciona em qualquer plataforma.
const isDirectlyExecuted =
  process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isDirectlyExecuted) {
  main();
}
