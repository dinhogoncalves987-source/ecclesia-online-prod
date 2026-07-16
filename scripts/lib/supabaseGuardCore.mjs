/**
 * scripts/lib/supabaseGuardCore.mjs
 *
 * Lógica pura (sem I/O, sem `spawnSync`, sem `process.exit`) usada por
 * scripts/supabase-guard.mjs. Extraída para um módulo próprio — sem shebang
 * e sem efeitos colaterais de CLI — para que possa ser importada com
 * segurança tanto pelo wrapper real quanto pelos testes automatizados
 * (src/config/supabaseGuard.test.ts), sem risco de disparar `main()` ou
 * qualquer comando remoto.
 */

export const CANONICAL_REFS = {
  production: "zsonukpxahaxffugavfu",
  staging: "qkiiwopkbcslquyfhdec",
};

// Lista de bloqueio — nunca um alvo válido desta ferramenta, nunca usado em
// nenhum outro script operacional deste repositório.
export const BLOCKED_UNRELATED_PROJECTS = { afxaytvrmgszzigxsbcd: "xceleiro" };

export const PRODUCTION_BASELINE_FILE =
  "20260715170000_production_baseline_marker.sql";
export const PRODUCTION_BASELINE_CONFIRMATION =
  "BASELINE_PRODUCTION_20260715";

export const TARGET_WORKDIRS = {
  production: "supabase-production",
  staging: ".",
};

export class GuardError extends Error {}

export function resolveTarget(target) {
  if (target !== "production" && target !== "staging") {
    throw new GuardError(
      `--target deve ser exatamente "production" ou "staging" (recebido: ${JSON.stringify(target ?? null)}). ` +
        `Nunca inferido — sempre explícito.`,
    );
  }
  const ref = CANONICAL_REFS[target];
  if (Object.keys(BLOCKED_UNRELATED_PROJECTS).includes(ref)) {
    // Defesa redundante — nunca deve ser possível na prática, já que
    // CANONICAL_REFS não contém o ref bloqueado, mas mantém a checagem
    // explícita caso este arquivo seja editado no futuro.
    throw new GuardError(`ref resolvido (${ref}) está na lista de bloqueio. Abortando.`);
  }
  return { target, ref };
}

/**
 * Confirma que o link local criado por `supabase link` aponta exatamente
 * para o ambiente declarado. O `--target` sozinho não muda o projeto usado
 * por comandos com `--linked`; por isso esta validação deve acontecer antes
 * de qualquer spawn da CLI.
 */
export function assertLinkedProjectRef({ target, expectedRef, linkedRef }) {
  const resolved = resolveTarget(target);

  if (expectedRef !== resolved.ref) {
    throw new GuardError(
      `ref esperado (${JSON.stringify(expectedRef ?? null)}) diverge do ref canônico de ${target} (${resolved.ref}).`,
    );
  }

  const normalizedLinkedRef = typeof linkedRef === "string" ? linkedRef.trim() : "";
  if (!normalizedLinkedRef) {
    throw new GuardError(
      `link local da Supabase ausente. Execute primeiro: supabase link --project-ref ${resolved.ref}`,
    );
  }

  if (Object.prototype.hasOwnProperty.call(BLOCKED_UNRELATED_PROJECTS, normalizedLinkedRef)) {
    throw new GuardError(
      `projeto linkado (${normalizedLinkedRef}, ${BLOCKED_UNRELATED_PROJECTS[normalizedLinkedRef]}) está bloqueado e não pertence ao Ecclesia Online.`,
    );
  }

  if (normalizedLinkedRef !== resolved.ref) {
    throw new GuardError(
      `projeto linkado (${normalizedLinkedRef}) diverge do alvo ${target} (${resolved.ref}). ` +
        `Relinke explicitamente antes de continuar: supabase link --project-ref ${resolved.ref}`,
    );
  }

  return { target, ref: normalizedLinkedRef };
}

export function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const match = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

/**
 * Autoriza somente a migration-marcadora, no workdir exclusivo da produção.
 * Nenhuma outra migration pode aproveitar a ação excepcional `baseline`.
 */
export function assertProductionBaselineRequest({
  target,
  action,
  confirmation,
  migrationFiles,
}) {
  const resolved = resolveTarget(target);

  if (resolved.target !== "production" || action !== "baseline") {
    throw new GuardError("a ação baseline existe somente para o alvo production");
  }

  if (confirmation !== PRODUCTION_BASELINE_CONFIRMATION) {
    throw new GuardError(
      `confirmação inválida; use --confirm=${PRODUCTION_BASELINE_CONFIRMATION}`,
    );
  }

  const files = Array.isArray(migrationFiles) ? [...migrationFiles].sort() : [];
  if (files.length !== 1 || files[0] !== PRODUCTION_BASELINE_FILE) {
    throw new GuardError(
      `workdir de produção deve conter somente ${PRODUCTION_BASELINE_FILE} durante o baseline`,
    );
  }

  return {
    target: resolved.target,
    ref: resolved.ref,
    workdir: TARGET_WORKDIRS.production,
    migration: PRODUCTION_BASELINE_FILE,
  };
}
