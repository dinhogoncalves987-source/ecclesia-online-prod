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

/**
 * MODELO OFICIAL E IMUTÁVEL DE AMBIENTES — mesmos valores de
 * src/config/environment.ts e scripts/check-environment.mjs. São
 * identificadores PÚBLICOS de project ref do Supabase, não são segredos.
 */
export const CANONICAL_PRODUCTION_REF = "zsonukpxahaxffugavfu";
export const CANONICAL_STAGING_REF = "qkiiwopkbcslquyfhdec";

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
 *   - `env.SUPABASE_PRODUCTION_REF` ou `env.SUPABASE_STAGING_REF` estiverem
 *     ausentes (ambos OBRIGATÓRIOS — nunca opcionais);
 *   - `SUPABASE_PRODUCTION_REF` e `SUPABASE_STAGING_REF` forem iguais;
 *   - qualquer um dos dois divergir do ref canônico correspondente
 *     (`CANONICAL_PRODUCTION_REF`/`CANONICAL_STAGING_REF`) — não bastam
 *     "distintos entre si", cada um precisa ser exatamente o ref correto;
 *   - a URL do Supabase não pôde ser resolvida para um project ref;
 *   - o ref resolvido da URL não for EXATAMENTE `CANONICAL_STAGING_REF`
 *     (equivalente a `SUPABASE_STAGING_REF`, já validado acima);
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

  // ── SUPABASE_PRODUCTION_REF / SUPABASE_STAGING_REF: obrigatórios, ────────
  // distintos, e ANCORADOS nos refs canônicos imutáveis.
  if (!productionRef) {
    throw new SeedGuardError("SUPABASE_PRODUCTION_REF ausente (obrigatório para rodar qualquer seed).");
  }
  if (productionRef !== CANONICAL_PRODUCTION_REF) {
    throw new SeedGuardError(
      `SUPABASE_PRODUCTION_REF ("${productionRef}") difere do ref canônico de produção ("${CANONICAL_PRODUCTION_REF}"). Seed recusado.`,
    );
  }
  if (!stagingRef) {
    throw new SeedGuardError("SUPABASE_STAGING_REF ausente (obrigatório para rodar qualquer seed).");
  }
  if (stagingRef !== CANONICAL_STAGING_REF) {
    throw new SeedGuardError(
      `SUPABASE_STAGING_REF ("${stagingRef}") difere do ref canônico de staging ("${CANONICAL_STAGING_REF}"). Seed recusado.`,
    );
  }
  if (productionRef === stagingRef) {
    throw new SeedGuardError("SUPABASE_PRODUCTION_REF e SUPABASE_STAGING_REF não podem ser iguais. Seed recusado.");
  }

  const projectRef = extractProjectRefFromUrl(supabaseUrl ?? "");
  if (!projectRef) {
    throw new SeedGuardError(
      "não foi possível extrair o project ref de SUPABASE_URL/VITE_SUPABASE_URL (esperado https://<ref>.supabase.co).",
    );
  }

  if (projectRef === CANONICAL_PRODUCTION_REF) {
    throw new SeedGuardError(
      `SUPABASE_URL aponta para o project ref de PRODUÇÃO (${CANONICAL_PRODUCTION_REF}). Seed recusado.`,
    );
  }

  if (projectRef !== CANONICAL_STAGING_REF) {
    throw new SeedGuardError(
      `SUPABASE_URL (ref "${projectRef}") não corresponde ao ref canônico de staging ("${CANONICAL_STAGING_REF}"). Seed recusado.`,
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
 * uma fonte de ambiente (por padrão `process.env`, mas os scripts `seed-*`
 * devem passar o resultado de `loadSeedEnv()` — ver scripts/lib/loadSeedEnv.mjs
 * — para que a MESMA fonte única seja usada tanto para SUPABASE_URL/SERVICE_ROLE
 * quanto para a guarda) e chama `assertSafeToSeedStaging`. Lança
 * `SeedGuardError` em caso de falha — nunca prossegue.
 *
 * @param {{ supabaseUrl: string, env?: Record<string, string | undefined> }} params
 */
export function assertSafeToSeedStagingFromProcessEnv({ supabaseUrl, env = process.env }) {
  return assertSafeToSeedStaging({
    appEnv: env.APP_ENV,
    supabaseUrl,
    seedStagingConfirmation: env.SEED_STAGING,
    productionRef: env.SUPABASE_PRODUCTION_REF,
    stagingRef: env.SUPABASE_STAGING_REF,
  });
}
