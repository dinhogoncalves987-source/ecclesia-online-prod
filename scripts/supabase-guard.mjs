/**
 * scripts/supabase-guard.mjs
 *
 * (Sem shebang de propósito — mesma razão de scripts/check-environment.mjs:
 * este arquivo só é invocado via `node scripts/supabase-guard.mjs`, nunca
 * executado diretamente, e um shebang quebraria qualquer import futuro
 * deste módulo por outra ferramenta/teste.)
 *
 * FASE 7 — wrapper obrigatório para qualquer operação futura da Supabase
 * CLI neste repositório. Ninguém (humano ou agente) deve rodar
 * `supabase db push` / `supabase migration up` diretamente contra este
 * projeto — sempre por aqui, que:
 *
 *   1. Exige `--target=production|staging` explícito (nunca infere).
 *   2. Confirma o project ref alvo contra os dois refs canônicos e
 *      IMUTÁVEIS deste projeto (ver src/config/environment.ts) — nunca
 *      aceita um terceiro ref, e nunca aceita produção e staging trocados.
 *   3. Para `--target=production`, RECUSA incondicionalmente qualquer
 *      operação de escrita (`push`, `up`) nesta etapa (Regra Absoluta 2/3/8
 *      da tarefa de hardening) — não existe flag que libere isso aqui.
 *      Promoção real para produção é um processo manual, revisado,
 *      migration-a-migration (ver supabase/migration-manifest.json).
 *   4. Para `--target=staging`, avisa (mas não bloqueia — staging aceita
 *      tudo) quando `supabase/migration-manifest.json` tiver qualquer
 *      entrada em `staging_only`/`mixed_needs_split`, deixando o preflight
 *      já pronto para quando a promoção a produção for liberada.
 *   5. NUNCA executa `push`/`up` de fato — apenas valida e IMPRIME o comando
 *      exato para um humano rodar manualmente, com o project ref já
 *      resolvido (nunca digitado à mão). Isso é intencional nesta etapa:
 *      nenhuma promoção real deve acontecer sem revisão humana explícita.
 *   6. Para ações somente-leitura (`list`), executa de fato — são seguras
 *      por definição (nunca alteram dados) — mas ainda exige `--target`
 *      explícito e nunca imprime credenciais.
 *
 * `afxaytvrmgszzigxsbcd` (xceleiro) NUNCA aparece como opção válida de
 * `--target` — é um projeto não relacionado a este repositório (ver
 * docs/AMBIENTES_PRODUCAO_STAGING.md). Ele só é mencionado neste arquivo
 * dentro da lista de bloqueio importada de scripts/lib/supabaseGuardCore.mjs.
 *
 * A lógica pura (resolução de target, parsing de args) mora em
 * scripts/lib/supabaseGuardCore.mjs — sem shebang e sem I/O — para poder
 * ser importada com segurança pelos testes automatizados
 * (src/config/supabaseGuard.test.ts) sem risco de rodar `main()`.
 *
 * Uso:
 *   node scripts/supabase-guard.mjs --target=staging --action=list
 *   node scripts/supabase-guard.mjs --target=staging --action=push   (dry-run — só imprime)
 *   node scripts/supabase-guard.mjs --target=production --action=push (sempre recusado)
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMigrationManifest, checkMigrationManifestGate } from "./lib/migrationManifest.mjs";
import { GuardError, resolveTarget, parseArgs } from "./lib/supabaseGuardCore.mjs";

function fail(message) {
  console.error(`\n❌ supabase-guard: ${message}\n`);
  process.exit(1);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let resolved;
  try {
    resolved = resolveTarget(args.target);
  } catch (err) {
    if (err instanceof GuardError) return fail(err.message);
    throw err;
  }

  const action = args.action;
  if (!action) return fail('--action é obrigatório ("list" ou "push"/"up").');

  console.log(`── supabase-guard: target="${resolved.target}" ref="${resolved.ref}" action="${action}" ──`);

  if (action === "list") {
    // Somente leitura — seguro por definição. Ainda assim, nunca escreve
    // nem imprime credenciais; o próprio comando não recebe nem expõe
    // segredos (usa o link/config local já autenticado do usuário).
    const result = spawnSync("supabase", ["migration", "list", "--linked"], {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    process.exit(result.status ?? 1);
  }

  if (action === "push" || action === "up") {
    if (resolved.target === "production") {
      return fail(
        "promoção/escrita em PRODUÇÃO está desabilitada nesta etapa (Regras Absolutas 2/3/8). " +
          "Nenhum comando `db push`/`migration up` para produção é executado por esta ferramenta — " +
          "isso deve ser um processo manual, revisado, migration a migration, depois de zerar " +
          "supabase/migration-manifest.json#mixed_needs_split e aprovar cada item de staging_only " +
          "que precisa de contraparte de produção.",
      );
    }

    const manifest = loadMigrationManifest();
    // Informativo apenas: para --target=staging este gate NUNCA bloqueia
    // (staging aceita staging_only/mixed_needs_split). Reaproveitamos a
    // mesma função checando "production" só para saber o que already
    // bloquearia uma promoção futura, e avisar com antecedência.
    const productionGate = checkMigrationManifestGate(manifest, "production");
    if (productionGate.blocked) {
      console.warn(
        `⚠️  supabase-guard: ${productionGate.reasons.length} migration(s) em staging_only/mixed_needs_split ` +
          `(ok para staging, mas bloqueiam qualquer promoção futura a produção sem split manual):`,
      );
      for (const reason of productionGate.reasons) console.warn(`   - ${reason}`);
    }

    console.log(
      "\n✅ supabase-guard: validação de preflight passou para staging. Esta ferramenta NUNCA executa " +
        "push/up automaticamente — rode manualmente, com o ref já confirmado acima:\n",
    );
    console.log(`   supabase link --project-ref ${resolved.ref}`);
    console.log(`   supabase db push --linked\n`);
    process.exit(0);
  }

  return fail(`--action="${action}" não reconhecida (use "list" ou "push"/"up").`);
}

// CORREÇÃO (Windows) — mesma razão de scripts/check-environment.mjs: comparar
// `import.meta.url` como string contra `file://${process.argv[1]}` nunca bate
// no Windows (barras invertidas vs. URL file://), então main() nunca
// executava e o comando saía com exit code 0 sem fazer nada.
const isDirectlyExecuted =
  process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isDirectlyExecuted) {
  main();
}
