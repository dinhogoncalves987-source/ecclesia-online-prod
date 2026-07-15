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

export function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const match = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (match) out[match[1]] = match[2];
  }
  return out;
}
