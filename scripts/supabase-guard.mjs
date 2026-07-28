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
 *   3. Produção usa um workdir fisicamente separado (`supabase-production/`).
 *      `push`/`up` genéricos são recusados. A promoção usa `--action=promote`,
 *      exige confirmação literal, valida ref, manifesto, ausência de seeds e
 *      igualdade byte a byte das migrations estruturais antes do dry-run.
 *   4. Para `--target=staging`, avisa (mas não bloqueia — staging aceita
 *      tudo) quando `supabase/migration-manifest.json` tiver qualquer
 *      entrada em `staging_feature`/`staging_only`/`mixed_needs_split`, deixando o preflight
 *      já pronto para quando a promoção a produção for liberada.
 *   5. No staging, `push`/`up` genérico apenas valida e imprime o comando
 *      manual. Em produção, somente `promote` pode escrever e sempre roda
 *      dry-run antes da aplicação.
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
 *   node scripts/supabase-guard.mjs --target=production --action=baseline --confirm=BASELINE_PRODUCTION_20260715
 *   node scripts/supabase-guard.mjs --target=production --action=promote --confirm=PROMOTE_IDENTICAL_SCHEMA_TO_PRODUCTION
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMigrationManifest, checkMigrationManifestGate } from "./lib/migrationManifest.mjs";
import {
  GuardError,
  PRODUCTION_BASELINE_CONFIRMATION,
  PRODUCTION_PROMOTION_CONFIRMATION,
  TARGET_WORKDIRS,
  assertProductionBaselineRequest,
  assertProductionPromotionRequest,
  assertLinkedProjectRef,
  resolveTarget,
  parseArgs,
} from "./lib/supabaseGuardCore.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

function workdirFor(target) {
  return path.resolve(REPO_ROOT, TARGET_WORKDIRS[target]);
}

function linkedProjectRefFileFor(target) {
  return path.join(workdirFor(target), "supabase", ".temp", "project-ref");
}

function readAndValidateLinkedRef(resolved) {
  const linkedFile = linkedProjectRefFileFor(resolved.target);
  let linkedRef = "";
  try {
    linkedRef = readFileSync(linkedFile, "utf8");
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      throw new GuardError(
        `link local de ${resolved.target} ausente. Execute primeiro: npx supabase link ` +
          `--project-ref ${resolved.ref} --workdir ${TARGET_WORKDIRS[resolved.target]}`,
      );
    }
    throw err;
  }

  return assertLinkedProjectRef({
    target: resolved.target,
    expectedRef: resolved.ref,
    linkedRef,
  });
}

function runSupabaseCli(args, target) {
  const workdir = TARGET_WORKDIRS[target];
  const workdirArgs = workdir === "." ? [] : ["--workdir", workdir];
  return spawnSync("npx", ["supabase", ...args, ...workdirArgs], {
    cwd: REPO_ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

function fail(message) {
  console.error(`\n❌ supabase-guard: ${message}\n`);
  process.exit(1);
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function inspectProductionParity(manifest) {
  const baselineVersion = "20260715170000";
  const productionMigrationsDir = path.join(
    workdirFor("production"),
    "supabase",
    "migrations",
  );
  const productionFiles = new Set(
    readdirSync(productionMigrationsDir).filter((file) => file.endsWith(".sql")),
  );
  const requiredSharedFiles = (manifest.production_management ?? [])
    .filter((file) => file.slice(0, 14) > baselineVersion);

  const includedStagingOnlyFiles = (manifest.staging_only ?? [])
    .filter((file) => productionFiles.has(file));
  const missingSharedFiles = requiredSharedFiles
    .filter((file) => !productionFiles.has(file));
  const divergentSharedFiles = requiredSharedFiles
    .filter((file) => productionFiles.has(file))
    .filter((file) => {
      const stagingPath = path.join(REPO_ROOT, "supabase", "migrations", file);
      const productionPath = path.join(productionMigrationsDir, file);
      return sha256(stagingPath) !== sha256(productionPath);
    });

  return {
    includedStagingOnlyFiles,
    missingSharedFiles,
    divergentSharedFiles,
  };
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
  if (!action) {
    return fail('--action é obrigatório ("list", "baseline", "promote" ou "push"/"up").');
  }

  console.log(`── supabase-guard: target="${resolved.target}" ref="${resolved.ref}" action="${action}" ──`);

  if (action === "list") {
    // `--target` não altera o link usado por `--linked`. Confirme o arquivo
    // local escrito por `supabase link` ANTES de executar até mesmo uma ação
    // somente-leitura, evitando consultar silenciosamente o banco errado.
    try {
      readAndValidateLinkedRef(resolved);
    } catch (err) {
      if (err instanceof GuardError) return fail(err.message);
      throw err;
    }

    const result = runSupabaseCli(["migration", "list", "--linked"], resolved.target);
    process.exit(result.status ?? 1);
  }

  if (action === "baseline") {
    let baseline;
    try {
      const migrationsDir = path.join(
        workdirFor("production"),
        "supabase",
        "migrations",
      );
      const migrationFiles = readdirSync(migrationsDir)
        .filter((file) => file.endsWith(".sql"))
        .sort();

      baseline = assertProductionBaselineRequest({
        target: resolved.target,
        action,
        confirmation: args.confirm,
        migrationFiles,
      });
      readAndValidateLinkedRef(resolved);
    } catch (err) {
      if (err instanceof GuardError) return fail(err.message);
      throw err;
    }

    console.log(
      `\n✅ baseline autorizado: ${baseline.migration}. Executando preflight da CLI sem aplicar SQL...\n`,
    );
    const dryRun = runSupabaseCli(["db", "push", "--linked", "--dry-run"], "production");
    if (dryRun.status !== 0) {
      return fail("preflight do baseline falhou; nenhuma migration foi aplicada");
    }

    console.log(
      "\n✅ preflight aprovado. Aplicando somente a marcadora fail-closed no histórico de produção...\n",
    );
    const push = runSupabaseCli(["db", "push", "--linked"], "production");
    process.exit(push.status ?? 1);
  }

  if (action === "promote") {
    try {
      const manifest = loadMigrationManifest();
      const parity = inspectProductionParity(manifest);
      const productionGate = checkMigrationManifestGate(manifest, "production");

      assertProductionPromotionRequest({
        target: resolved.target,
        action,
        confirmation: args.confirm,
        blockers: productionGate.reasons,
        ...parity,
      });
      readAndValidateLinkedRef(resolved);
    } catch (err) {
      if (err instanceof GuardError) return fail(err.message);
      throw err;
    }

    console.log(
      "\n✅ pacote estrutural comum confirmado: sem seeds, sem arquivos ausentes e sem divergências.",
    );
    console.log("Executando dry-run obrigatório contra o banco oficial de produção...\n");
    const dryRun = runSupabaseCli(
      ["db", "push", "--linked", "--include-all", "--dry-run"],
      "production",
    );
    if (dryRun.status !== 0) {
      return fail("dry-run de produção falhou; nenhuma migration foi aplicada");
    }

    console.log(
      "\n✅ dry-run aprovado. Aplicando exatamente o pacote estrutural verificado em produção...\n",
    );
    const push = runSupabaseCli(
      ["db", "push", "--linked", "--include-all"],
      "production",
    );
    process.exit(push.status ?? 1);
  }

  if (action === "push" || action === "up") {
    if (resolved.target === "production") {
      return fail(
        "produção exige a ação protegida `promote`; use --action=promote " +
          `--confirm=${PRODUCTION_PROMOTION_CONFIRMATION} depois da homologação do staging.`,
      );
    }

    const manifest = loadMigrationManifest();
    // Informativo apenas: para --target=staging este gate NUNCA bloqueia
    // (staging aceita staging_feature/staging_only/mixed_needs_split). Reaproveitamos a
    // mesma função checando "production" só para saber o que already
    // bloquearia uma promoção futura, e avisar com antecedência.
    const productionGate = checkMigrationManifestGate(manifest, "production");
    if (productionGate.blocked) {
      console.warn(
        `⚠️  supabase-guard: ${productionGate.reasons.length} migration(s) fora da release de produção ` +
          `(ok para staging, mas bloqueiam qualquer promoção futura a produção sem split manual):`,
      );
      for (const reason of productionGate.reasons) console.warn(`   - ${reason}`);
    }

    console.log(
      "\n✅ supabase-guard: validação de preflight passou para staging. Esta ferramenta NUNCA executa " +
        "push/up automaticamente — rode manualmente, com o ref já confirmado acima:\n",
    );
    console.log(`   npx supabase link --project-ref ${resolved.ref}`);
    console.log(`   npx supabase db push --linked\n`);
    process.exit(0);
  }

  return fail(
    `--action="${action}" não reconhecida (use "list", "baseline", "promote" ou "push"/"up"). ` +
      `Confirmação da promoção: ${PRODUCTION_PROMOTION_CONFIRMATION}.`,
  );
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
