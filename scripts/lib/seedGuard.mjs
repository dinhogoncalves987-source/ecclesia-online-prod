/**
 * scripts/lib/seedGuard.mjs
 *
 * Guarda compartilhada por todos os scripts `seed-*.mjs` e `demo:*`. Impede
 * que qualquer seed/demo seja executado contra o projeto Supabase de
 * produção, mesmo que alguém copie a URL/chave errada para o `.env` local.
 *
 * Lógica pura e testável (sem I/O) — consumida tanto pelos scripts Node
 * quanto por testes Vitest (src/config/seedGuard.test.ts).
 */

const SUPABASE_HOST_PATTERN = /^([a-z0-9]+)\.supabase\.co$/i;

/** Extrai o project ref de uma URL `https://<ref>.supabase.co`. */
export function extractProjectRefFromUrl(url) {
  try {
    const { hostname } = new URL(url);
    const match = SUPABASE_HOST_PATTERN.exec(hostname);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export class SeedGuardError extends Error {
  constructor(message) {
    super(`[seed-guard] ${message}`);
    this.name = "SeedGuardError";
  }
}

/**
 * Valida que é seguro executar um seed/demo. Lança `SeedGuardError` (nunca
 * executa a seed) quando:
 *   - `env.APP_ENV` não é exatamente "staging";
 *   - a URL do Supabase não pôde ser resolvida para um project ref;
 *   - o ref resolvido é o ref de produção conhecido (`env.SUPABASE_PRODUCTION_REF`,
 *     quando configurado) — recusa explícita, nunca "melhor esforço";
 *   - `env.SUPABASE_STAGING_REF` está configurado e o ref resolvido diverge;
 *   - `env.SEED_STAGING` não é exatamente a string de confirmação `"SEED_STAGING"`.
 *
 * Nunca inclui a service_role key no retorno ou em mensagens de erro.
 *
 * @param {{
 *   appEnv?: string,
 *   supabaseUrl?: string,
 *   seedStagingConfirmation?: string,
 *   productionRef?: string,
 *   stagingRef?: string,
 * }} input
 * @returns {{ projectRef: string }}
 */
export function assertSafeToSeedStaging(input) {
  const { appEnv, supabaseUrl, seedStagingConfirmation, productionRef, stagingRef } = input;

  if (appEnv !== "staging") {
    throw new SeedGuardError(
      `APP_ENV deve ser exatamente "staging" para rodar um seed (recebido: ${JSON.stringify(appEnv ?? null)}). ` +
        `Seeds e dados demo nunca podem ser executados em produção.`,
    );
  }

  const projectRef = extractProjectRefFromUrl(supabaseUrl ?? "");
  if (!projectRef) {
    throw new SeedGuardError(
      "não foi possível extrair o project ref de SUPABASE_URL/VITE_SUPABASE_URL (esperado https://<ref>.supabase.co).",
    );
  }

  if (productionRef && projectRef === productionRef) {
    throw new SeedGuardError(
      `SUPABASE_URL aponta para o project ref de PRODUÇÃO (${productionRef}). Seed recusado.`,
    );
  }

  if (stagingRef && projectRef !== stagingRef) {
    throw new SeedGuardError(
      `SUPABASE_URL (ref "${projectRef}") não corresponde ao ref de staging configurado (SUPABASE_STAGING_REF). Seed recusado.`,
    );
  }

  if (seedStagingConfirmation !== "SEED_STAGING") {
    throw new SeedGuardError(
      'confirmação obrigatória ausente. Defina a variável de ambiente SEED_STAGING="SEED_STAGING" para confirmar que deseja escrever no banco de staging.',
    );
  }

  return { projectRef };
}

/**
 * Helper de conveniência para os scripts Node: lê as variáveis relevantes de
 * `process.env` e chama `assertSafeToSeedStaging`. Lança e finaliza o
 * processo com código de saída 1 em caso de falha — nunca prossegue.
 *
 * @param {{ supabaseUrl: string }} params
 */
export function assertSafeToSeedStagingFromProcessEnv({ supabaseUrl }) {
  return assertSafeToSeedStaging({
    appEnv: process.env.APP_ENV,
    supabaseUrl,
    seedStagingConfirmation: process.env.SEED_STAGING,
    productionRef: process.env.SUPABASE_PRODUCTION_REF,
    stagingRef: process.env.SUPABASE_STAGING_REF,
  });
}
