/**
 * scripts/lib/migrationManifest.mjs
 *
 * FASE 7 — leitor puro (sem I/O de rede, sem side effects) do manifesto
 * `supabase/migration-manifest.json`. Usado por `scripts/supabase-guard.mjs`
 * para decidir se uma promoção para produção pode prosseguir.
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(__dirname, "..", "..", "supabase", "migration-manifest.json");

/**
 * @returns {{
 *   historical: string[],
 *   production_safe: string[],
 *   staging_only: string[],
 *   mixed_needs_split: string[],
 * }}
 */
export function loadMigrationManifest(manifestPath = MANIFEST_PATH) {
  const raw = readFileSync(manifestPath, "utf-8");
  return JSON.parse(raw);
}

/**
 * Migrations que NUNCA podem ser promovidas para produção no estado atual:
 * seed exclusivo de staging (`staging_only`) ou arquivo misto que ainda não
 * foi dividido em estrutura/seed (`mixed_needs_split`).
 *
 * @param {ReturnType<typeof loadMigrationManifest>} manifest
 * @returns {string[]}
 */
export function getUnresolvedProductionBlockers(manifest) {
  return [...(manifest.staging_only ?? []), ...(manifest.mixed_needs_split ?? [])];
}

/**
 * Preflight puro (sem I/O) usado por `scripts/supabase-guard.mjs`: decide se
 * uma operação de escrita (`push`/`up`) contra `target` deve ser bloqueada
 * por causa de migrations `staging_only`/`mixed_needs_split` pendentes.
 *
 * `--target=staging` NUNCA é bloqueado por este gate — staging aceita
 * qualquer migration, inclusive as staging-only/mistas. O bloqueio só se
 * aplica a `--target=production`, onde nenhuma dessas entradas pode ser
 * promovida sem split/revisão manual (ver RELATORIO_CLASSIFICACAO_MIGRATIONS.md).
 *
 * @param {{ staging_only?: string[], mixed_needs_split?: string[] }} manifest
 * @param {"production" | "staging"} target
 * @returns {{ blocked: boolean, reasons: string[] }}
 */
export function checkMigrationManifestGate(manifest, target) {
  if (target !== "production") {
    return { blocked: false, reasons: [] };
  }

  const blockers = getUnresolvedProductionBlockers(manifest);
  if (blockers.length === 0) {
    return { blocked: false, reasons: [] };
  }

  return {
    blocked: true,
    reasons: blockers.map(
      (file) =>
        `${file}: migration staging-only/mista pendente de split manual — não pode ser promovida a produção nesta etapa.`,
    ),
  };
}
