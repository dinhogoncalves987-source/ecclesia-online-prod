/**
 * src/config/environment.ts
 *
 * Fonte única da identidade de ambiente (produção vs staging) para todo o
 * frontend. Validada uma única vez, no carregamento deste módulo — ANTES de
 * `src/integrations/supabase/client.ts` chamar `createClient` (ver import no
 * topo daquele arquivo). Qualquer inconsistência lança e impede a
 * inicialização (fail closed): produção nunca conversa com staging e
 * vice-versa por engano.
 *
 * Regras de segurança deste módulo:
 *   - nunca registra (console.*) o valor de chaves ou URLs com credenciais;
 *   - nunca depende de window.location para decidir o ambiente — apenas das
 *     variáveis VITE_* explícitas, para que o comportamento seja idêntico em
 *     build, preview e produção;
 *   - a validação central é testável via `buildEnvironmentConfig`, que
 *     recebe a fonte de variáveis como parâmetro (não lê import.meta.env
 *     diretamente), permitindo testes com fixtures arbitrárias.
 */

export type AppEnv = "production" | "staging";

/**
 * MODELO OFICIAL E IMUTÁVEL DE AMBIENTES (não editar sem aprovação explícita
 * — qualquer mudança aqui muda o que é considerado "produção"/"staging" em
 * todo o app). Estes dois valores são identificadores PÚBLICOS (project refs
 * do Supabase, não são segredos) e servem como a única fonte de verdade para
 * qual ref cada ambiente pode usar. `VITE_EXPECTED_SUPABASE_PROJECT_REF`
 * sozinho NUNCA é suficiente — ele é comparado contra este mapa fixo, para
 * que uma configuração errada (ex.: produção apontando para o ref de
 * staging, ambos "consistentes entre si") não possa se autovalidar.
 */
export const CANONICAL_PROJECT_REF: Record<AppEnv, string> = Object.freeze({
  production: "zsonukpxahaxffugavfu",
  staging: "qkiiwopkbcslquyfhdec",
});

/** Domínio oficial de produção — staging nunca pode usar este domínio. */
export const OFFICIAL_PRODUCTION_DOMAIN = "ecclesiabr.online";

export interface EnvironmentConfig {
  readonly appEnv: AppEnv;
  readonly isProduction: boolean;
  readonly isStaging: boolean;
  /** URL do projeto Supabase, sempre https, sem barra final. */
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
  /** Project ref extraído de supabaseUrl (nunca digitado à mão). */
  readonly supabaseProjectRef: string;
  /** URL pública canônica deste ambiente (convites, QR, links, PWA). */
  readonly publicAppUrl: string;
}

export class EnvironmentConfigError extends Error {
  constructor(message: string) {
    super(`[environment] ${message}`);
    this.name = "EnvironmentConfigError";
  }
}

export interface RawEnvSource {
  VITE_APP_ENV?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_EXPECTED_SUPABASE_PROJECT_REF?: string;
  VITE_PUBLIC_APP_URL?: string;
}

const SUPABASE_HOST_PATTERN = /^([a-z0-9]+)\.supabase\.co$/i;

/**
 * Extrai o project ref de uma URL `https://<ref>.supabase.co`.
 * Retorna null se a URL não seguir esse formato (nunca lança).
 */
export function extractSupabaseProjectRef(supabaseUrl: string): string | null {
  try {
    const { hostname } = new URL(supabaseUrl);
    const match = SUPABASE_HOST_PATTERN.exec(hostname);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function requireNonEmpty(name: string, value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    throw new EnvironmentConfigError(`variável obrigatória ausente ou vazia: ${name}`);
  }
  return trimmed;
}

function requireValidHttpsUrl(name: string, value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new EnvironmentConfigError(`${name} não é uma URL válida`);
  }
  if (parsed.protocol !== "https:") {
    throw new EnvironmentConfigError(`${name} deve usar https://`);
  }
  return value.replace(/\/+$/, "");
}

/**
 * Constrói e valida a configuração de ambiente a partir de uma fonte de
 * variáveis explícita. Lança `EnvironmentConfigError` em qualquer
 * inconsistência — nunca retorna uma configuração parcial ou "melhor
 * esforço".
 */
export function buildEnvironmentConfig(source: RawEnvSource): EnvironmentConfig {
  const rawAppEnv = requireNonEmpty("VITE_APP_ENV", source.VITE_APP_ENV);
  if (rawAppEnv !== "production" && rawAppEnv !== "staging") {
    throw new EnvironmentConfigError(
      'VITE_APP_ENV deve ser "production" ou "staging" (ambiente desconhecido recusado)',
    );
  }
  const appEnv = rawAppEnv as AppEnv;

  const supabaseUrl = requireValidHttpsUrl(
    "VITE_SUPABASE_URL",
    requireNonEmpty("VITE_SUPABASE_URL", source.VITE_SUPABASE_URL),
  );
  const supabasePublishableKey = requireNonEmpty(
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    source.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
  const expectedRef = requireNonEmpty(
    "VITE_EXPECTED_SUPABASE_PROJECT_REF",
    source.VITE_EXPECTED_SUPABASE_PROJECT_REF,
  );
  const publicAppUrl = requireValidHttpsUrl(
    "VITE_PUBLIC_APP_URL",
    requireNonEmpty("VITE_PUBLIC_APP_URL", source.VITE_PUBLIC_APP_URL),
  );

  const actualRef = extractSupabaseProjectRef(supabaseUrl);
  if (!actualRef) {
    throw new EnvironmentConfigError(
      "VITE_SUPABASE_URL não corresponde ao formato esperado https://<project-ref>.supabase.co",
    );
  }
  if (actualRef !== expectedRef) {
    throw new EnvironmentConfigError(
      "project ref de VITE_SUPABASE_URL não corresponde a VITE_EXPECTED_SUPABASE_PROJECT_REF " +
        "— produção e staging não podem ser misturados. Build/inicialização bloqueada.",
    );
  }

  // ── Trava contra autovalidação incorreta ──────────────────────────────────
  // Não basta expectedRef === actualRef (isso só prova consistência INTERNA
  // do build). Cada appEnv só pode usar o ref canônico — imutável — mapeado
  // para ele. Isso impede, por exemplo, um build com VITE_APP_ENV=production
  // e VITE_SUPABASE_URL/VITE_EXPECTED_SUPABASE_PROJECT_REF os dois apontando
  // (consistentemente entre si) para o project ref de STAGING.
  const canonicalRef = CANONICAL_PROJECT_REF[appEnv];
  if (actualRef !== canonicalRef) {
    throw new EnvironmentConfigError(
      `VITE_APP_ENV="${appEnv}" só pode usar o project ref canônico "${canonicalRef}" ` +
        `(recebido "${actualRef}") — configuração de ambiente recusada.`,
    );
  }

  // ── VITE_PUBLIC_APP_URL validado contra o ambiente ────────────────────────
  const publicHostname = (() => {
    try {
      return new URL(publicAppUrl).hostname;
    } catch {
      return null;
    }
  })();
  if (appEnv === "production" && publicHostname !== OFFICIAL_PRODUCTION_DOMAIN) {
    throw new EnvironmentConfigError(
      `produção exige VITE_PUBLIC_APP_URL no domínio oficial "${OFFICIAL_PRODUCTION_DOMAIN}" ` +
        `(recebido "${publicHostname ?? publicAppUrl}").`,
    );
  }
  if (appEnv === "staging" && publicHostname === OFFICIAL_PRODUCTION_DOMAIN) {
    throw new EnvironmentConfigError(
      `staging não pode usar o domínio oficial de produção ("${OFFICIAL_PRODUCTION_DOMAIN}").`,
    );
  }

  return Object.freeze({
    appEnv,
    isProduction: appEnv === "production",
    isStaging: appEnv === "staging",
    supabaseUrl,
    supabasePublishableKey,
    supabaseProjectRef: actualRef,
    publicAppUrl,
  });
}

let cachedConfig: EnvironmentConfig | null = null;

/**
 * Retorna a configuração validada, calculando-a apenas uma vez a partir de
 * `import.meta.env`. Qualquer módulo que chame isto (direta ou indiretamente
 * via `environment`) dispara a validação — inclusive
 * `src/integrations/supabase/client.ts`, antes de `createClient`.
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  if (!cachedConfig) {
    cachedConfig = buildEnvironmentConfig(import.meta.env as unknown as RawEnvSource);
  }
  return cachedConfig;
}

/**
 * Configuração de ambiente tipada, única para todo o aplicativo. O próprio
 * import deste módulo já valida — é o mecanismo de "fail closed" antes de
 * qualquer chamada ao Supabase.
 */
export const environment = getEnvironmentConfig();

/**
 * Representação segura para diagnóstico/telemetria: nunca inclui a chave
 * publishable nem a URL completa — apenas o necessário para confirmar em
 * qual ambiente o app está rodando.
 */
export function describeEnvironmentSafely(config: EnvironmentConfig = environment) {
  return {
    appEnv: config.appEnv,
    supabaseProjectRef: config.supabaseProjectRef,
  };
}
