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
 *   production_management: string[],
 *   staging_feature: string[],
 *   staging_only: string[],
 *   mixed_needs_split: string[],
 * }}
 */
export function loadMigrationManifest(manifestPath = MANIFEST_PATH) {
  const raw = readFileSync(manifestPath, "utf-8");
  return JSON.parse(raw);
}

/**
 * Violações de paridade que bloqueiam promoção:
 * `staging_feature` deve permanecer vazia e arquivos mistos precisam ser
 * separados em schema compartilhado + seed de teste. `staging_only` não é
 * bloqueio: essa categoria contém exclusivamente dados descartáveis e fica
 * fora do workdir de produção.
 *
 * @param {ReturnType<typeof loadMigrationManifest>} manifest
 * @returns {string[]}
 */
export function getUnresolvedProductionBlockers(manifest) {
  return [
    ...(manifest.staging_feature ?? []),
    ...(manifest.mixed_needs_split ?? []),
  ];
}

/**
 * Preflight puro (sem I/O) usado por `scripts/supabase-guard.mjs`: decide se
 * uma operação de escrita (`push`/`up`) contra `target` deve ser bloqueada
 * por causa de migrations `staging_feature`/`mixed_needs_split` pendentes.
 *
 * `--target=staging` nunca é bloqueado. Em produção, seeds são simplesmente
 * excluídos; schema exclusivo ou misturado com seed bloqueia a promoção.
 *
 * @param {{ staging_feature?: string[], staging_only?: string[], mixed_needs_split?: string[] }} manifest
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
        `${file}: migration fora da release de produção ou pendente de split — não pode ser promovida nesta etapa.`,
    ),
  };
}
