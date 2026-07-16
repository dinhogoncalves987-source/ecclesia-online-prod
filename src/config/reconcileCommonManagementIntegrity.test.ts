import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * FASE 9 — testes de proteção da correção 2026-07-16 (revisão do commit
 * `8eaf7f9`): a migration comum `20260716110000_reconcile_common_management_
 * integrity.sql` agora reconcilia as 49 foreign keys (39 com origem em
 * `supabase/migrations/` + 10 recuperadas do inventário estrutural do banco
 * de teste/staging `qkiiwopkbcslquyfhdec` via `pg_get_constraintdef`), com
 * três ações ON DELETE corrigidas e verificação integral de conkey/confkey.
 *
 * Este teste é somente leitura: nunca aplica, move ou edita nenhuma
 * migration, e nunca se conecta a um banco de dados real (nem de teste/
 * staging, nem de produção).
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");

const STAGING_MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const PRODUCTION_MIGRATIONS_DIR = path.join(ROOT, "supabase-production", "supabase", "migrations");

const BASELINE_FILE = "20260715170000_production_baseline_marker.sql";
const BASELINE_VERSION = "20260715170000";
const RECONCILE_FILE = "20260716110000_reconcile_common_management_integrity.sql";

// Os 33 arquivos históricos do banco de teste/staging que o commit c94024e
// havia copiado para o workdir executável do banco de produção e que a
// correção de 2026-07-16 removeu de lá (preservando-os intactos em
// supabase/migrations/).
const REMOVED_HISTORICAL_COPIES = [
  "20260512090000_staging_core_baseline.sql",
  "20260512100000_staging_treasury_mvp.sql",
  "20260513110000_fix_finance_audit_rls.sql",
  "20260513111500_fix_finance_delete_audit_fk.sql",
  "20260513120000_staging_org_invite_link.sql",
  "20260513121000_staging_organizations_child_insert_rls.sql",
  "20260519140000_staging_documents_table.sql",
  "20260519150000_staging_schedules_table.sql",
  "20260519160000_staging_secretaria_core_tables.sql",
  "20260526300000_members_block_terminal_status_delete.sql",
  "20260527100000_assemblies_rls_platform_admin.sql",
  "20260527200000_assemblies_storage_rls.sql",
  "20260609100000_staging_internal_messages.sql",
  "20260611120000_chat_campaign_single_thread.sql",
  "20260612150000_profiles_rls_restrict_select.sql",
  "20260616100000_administrative_requests.sql",
  "20260617120000_members_extended_fields.sql",
  "20260617130000_members_status_constraint_fix.sql",
  "20260617140000_member_invites.sql",
  "20260618120000_access_invites.sql",
  "20260618130000_fix_accept_access_invite_email_check.sql",
  "20260707100000_production_finance_confiadcs_extension.sql",
  "20260707200000_organizations_institutional_fields.sql",
  "20260708100000_member_validation_tokens.sql",
  "20260708101000_fix_member_invites_permissions.sql",
  "20260708102000_fix_member_invite_accept_safety.sql",
  "20260709100000_member_invite_email_binding.sql",
  "20260715120000_harden_remove_finalize_member_invite_activation.sql",
  "20260715130000_harden_platform_role_escalation.sql",
  "20260715141000_remove_open_slug_join.sql",
  "20260715150000_harden_access_invites.sql",
  "20260715151000_idempotent_remove_finalize_member_invite.sql",
  "20260715160000_reconcile_production_security.sql",
];

// As 49 constraints que a migration deve reconciliar: 39 com origem
// rastreável em supabase/migrations/, e 10 recuperadas do inventário
// estrutural do banco de teste/staging (qkiiwopkbcslquyfhdec) via
// pg_get_constraintdef — nenhuma foi inventada (ver cabeçalho do .sql).
const EXPECTED_CONSTRAINTS = [
  "access_invites_accepted_user_id_fkey",
  "access_invites_invited_by_fkey",
  "administrative_requests_assigned_to_fkey",
  "assemblies_created_by_fkey",
  "campaign_contributions_contributed_by_fkey",
  "campaign_media_uploaded_by_fkey",
  "campaign_updates_created_by_fkey",
  "campaigns_approved_by_fkey",
  "campaigns_created_by_fkey",
  "communications_created_by_fkey",
  "documents_created_by_fkey",
  "events_created_by_fkey",
  "finance_monthly_closings_closed_by_fkey",
  "finance_transaction_audit_logs_changed_by_fkey",
  "group_messages_author_user_id_fkey",
  "groups_created_by_fkey",
  "internal_message_attachments_uploaded_by_fkey",
  "internal_messages_sender_user_id_fkey",
  "internal_threads_assigned_to_fkey",
  "internal_threads_created_by_fkey",
  "member_invites_accepted_user_id_fkey",
  "member_invites_invited_by_fkey",
  "members_created_by_fkey",
  "members_user_id_fkey",
  "organization_users_user_id_fkey",
  "platform_announcements_created_by_fkey",
  "prayer_requests_created_by_fkey",
  "prayer_requests_user_id_fkey",
  "profiles_user_id_fkey",
  "recommendation_letters_approved_by_fkey",
  "recommendation_letters_reviewed_by_fkey",
  "schedules_created_by_fkey",
  "transactions_created_by_fkey",
  "transactions_responsible_id_fkey",
  "transactions_updated_by_fkey",
  "transactions_user_id_fkey",
  "user_roles_user_id_fkey",
  "worship_setlists_created_by_fkey",
  "worship_songs_created_by_fkey",
  "members_civil_document_validated_by_fkey",
  "organization_responsibles_assigned_by_fkey",
  "organization_responsibles_user_id_fkey",
  "platform_support_agent_departments_agent_user_id_fkey",
  "platform_support_agent_presence_user_id_fkey",
  "platform_support_agents_user_id_fkey",
  "platform_support_audit_logs_actor_user_id_fkey",
  "platform_support_ticket_events_actor_user_id_fkey",
  "platform_support_tickets_assigned_to_user_id_fkey",
  "platform_support_tickets_opened_by_user_id_fkey",
];

if (EXPECTED_CONSTRAINTS.length !== 49) {
  throw new Error(`EXPECTED_CONSTRAINTS deve ter exatamente 49 entradas, tem ${EXPECTED_CONSTRAINTS.length}`);
}

// As 3 ações ON DELETE corrigidas nesta revisão (não podem regredir).
const EXPECTED_ON_DELETE: Record<string, string> = {
  members_user_id_fkey: "SET NULL",
  documents_created_by_fkey: "NO ACTION",
  schedules_created_by_fkey: "NO ACTION",
};

const FORBIDDEN_PATTERNS: Array<[string, RegExp]> = [
  ["INSERT INTO (tabela de negócio)", /INSERT\s+INTO\s+public\.(?!_)/i],
  ["UPDATE ... SET (dados)", /\bUPDATE\s+(public\.|auth\.)?\w+\s+SET\b/i],
  ["DELETE FROM", /DELETE\s+FROM/i],
  ["TRUNCATE", /\bTRUNCATE\b/i],
  ["DROP TABLE", /DROP\s+TABLE/i],
  ["CREATE POLICY", /\bCREATE\s+POLICY\b/i],
  ["storage.buckets", /storage\.buckets/i],
  ["bucket público", /bucket\s+p[uú]blico/i],
  ["seed", /\bseed\b/i],
  [
    "leitura de platform_role a partir de raw_user_meta_data (concessão de autoridade)",
    /raw_user_meta_data\s*->>?\s*'platform_role'/i,
  ],
  ["criação de join_organization_by_slug", /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.join_organization_by_slug/i],
  [
    "criação de finalize_member_invite_activation",
    /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.finalize_member_invite_activation/i,
  ],
];

function readMigrationText(dir: string, file: string): string {
  return readFileSync(path.join(dir, file), "utf8");
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

describe("reconcile_common_management_integrity — workdir do banco de produção", () => {
  it("nenhuma migration executável do banco de produção tem timestamp anterior ao baseline", () => {
    const files = readdirSync(PRODUCTION_MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
    const tooOld = files.filter((f) => f.slice(0, 14) < BASELINE_VERSION);
    expect(tooOld, `migration(s) anterior(es) ao baseline em supabase-production: ${tooOld.join(", ")}`).toEqual([]);
  });

  it("o baseline continua presente no workdir do banco de produção", () => {
    const files = readdirSync(PRODUCTION_MIGRATIONS_DIR);
    expect(files).toContain(BASELINE_FILE);
  });

  it("nenhum dos 33 arquivos históricos removidos voltou ao workdir do banco de produção", () => {
    const files = new Set(readdirSync(PRODUCTION_MIGRATIONS_DIR));
    const stillPresent = REMOVED_HISTORICAL_COPIES.filter((f) => files.has(f));
    expect(
      stillPresent,
      `arquivo(s) histórico(s) que deveriam ter sido removidos ainda presentes: ${stillPresent.join(", ")}`,
    ).toEqual([]);
  });

  it("os 33 arquivos históricos originais continuam presentes em supabase/migrations", () => {
    const files = new Set(readdirSync(STAGING_MIGRATIONS_DIR));
    const missing = REMOVED_HISTORICAL_COPIES.filter((f) => !files.has(f));
    expect(missing, `arquivo(s) original(is) ausente(s) de supabase/migrations: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("reconcile_common_management_integrity — a migration em si", () => {
  it("existe nos dois workdirs (banco de teste/staging e banco de produção)", () => {
    expect(readdirSync(STAGING_MIGRATIONS_DIR)).toContain(RECONCILE_FILE);
    expect(readdirSync(PRODUCTION_MIGRATIONS_DIR)).toContain(RECONCILE_FILE);
  });

  it("as duas cópias têm conteúdo idêntico (byte a byte)", () => {
    const staging = readMigrationText(STAGING_MIGRATIONS_DIR, RECONCILE_FILE);
    const production = readMigrationText(PRODUCTION_MIGRATIONS_DIR, RECONCILE_FILE);
    expect(staging).toBe(production);
  });

  it("as duas cópias têm SHA256 idêntico", () => {
    const staging = readMigrationText(STAGING_MIGRATIONS_DIR, RECONCILE_FILE);
    const production = readMigrationText(PRODUCTION_MIGRATIONS_DIR, RECONCILE_FILE);
    expect(sha256(staging)).toBe(sha256(production));
  });

  it("tem timestamp posterior ao baseline do banco de produção e não foi renomeada", () => {
    expect(RECONCILE_FILE.startsWith("20260716110000_")).toBe(true);
    expect(RECONCILE_FILE.slice(0, 14) > BASELINE_VERSION).toBe(true);
  });

  it("inicia com BEGIN e termina com COMMIT", () => {
    const sql = readMigrationText(STAGING_MIGRATIONS_DIR, RECONCILE_FILE);
    const withoutComments = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim();
    expect(withoutComments.startsWith("BEGIN;")).toBe(true);
    expect(withoutComments.endsWith("COMMIT;")).toBe(true);
  });

  it("contém exatamente as 49 constraints esperadas, e nenhuma outra", () => {
    const sql = readMigrationText(STAGING_MIGRATIONS_DIR, RECONCILE_FILE);
    for (const name of EXPECTED_CONSTRAINTS) {
      expect(sql.includes(`'${name}'`), `constraint esperada ausente: ${name}`).toBe(true);
    }

    const fkeyMatches = sql.match(/'([a-z0-9_]+_fkey)'/g) ?? [];
    const namesFound = new Set(fkeyMatches.map((m) => m.slice(1, -1)));
    const unexpected = [...namesFound].filter((n) => !EXPECTED_CONSTRAINTS.includes(n));
    expect(unexpected, `constraint(s) inesperada(s) na migration: ${unexpected.join(", ")}`).toEqual([]);
    expect(namesFound.size).toBe(49);
  });

  it("o total declarado de constraints esperadas é 49 (não 39)", () => {
    const sql = readMigrationText(STAGING_MIGRATIONS_DIR, RECONCILE_FILE);
    expect(sql).toMatch(/v_constraints_esperadas\s+int\s*:=\s*49/);
    expect(sql).toContain("'constraints_esperadas', 49");
    expect(sql).not.toMatch(/:=\s*39\b/);
    expect(sql).not.toContain("'constraints_esperadas', 39");
  });

  it.each(Object.entries(EXPECTED_ON_DELETE))("%s usa ON DELETE %s (corrigido nesta revisão)", (name, expectedDelete) => {
    const sql = readMigrationText(STAGING_MIGRATIONS_DIR, RECONCILE_FILE);
    const row = sql.split("\n").find((line) => line.includes(`'${name}'`));
    expect(row, `linha da constraint ${name} não encontrada`).toBeDefined();
    expect(row).toContain(`'${expectedDelete}'`);
  });

  it("para as demais 46 constraints, nenhuma ação ON DELETE foi alterada em relação à revisão anterior", () => {
    const sql = readMigrationText(STAGING_MIGRATIONS_DIR, RECONCILE_FILE);
    const untouched: Record<string, string> = {
      access_invites_accepted_user_id_fkey: "SET NULL",
      access_invites_invited_by_fkey: "SET NULL",
      group_messages_author_user_id_fkey: "CASCADE",
      organization_users_user_id_fkey: "CASCADE",
      profiles_user_id_fkey: "CASCADE",
      transactions_user_id_fkey: "CASCADE",
      user_roles_user_id_fkey: "CASCADE",
      members_created_by_fkey: "SET NULL",
      organization_responsibles_user_id_fkey: "CASCADE",
      platform_support_agents_user_id_fkey: "CASCADE",
    };
    for (const [name, expectedDelete] of Object.entries(untouched)) {
      const row = sql.split("\n").find((line) => line.includes(`'${name}'`));
      expect(row, `linha da constraint ${name} não encontrada`).toBeDefined();
      expect(row, `${name} deveria manter ON DELETE ${expectedDelete}`).toContain(`'${expectedDelete}'`);
    }
  });

  it("valida integralmente conkey, confkey e os demais atributos de uma constraint pré-existente", () => {
    const sql = readMigrationText(STAGING_MIGRATIONS_DIR, RECONCILE_FILE);
    for (const attr of [
      "con.conkey",
      "con.confkey",
      "con.confdeltype",
      "con.confupdtype",
      "con.confmatchtype",
      "con.condeferrable",
      "con.condeferred",
      "con.contype",
      "con.conrelid",
      "con.confrelid",
    ]) {
      expect(sql, `verificação de ${attr} ausente na migration`).toContain(attr);
    }
    // confupdtype deve ser conferido contra NO ACTION ('a') e confmatchtype contra MATCH SIMPLE ('s')
    expect(sql).toMatch(/con\.confupdtype\s*<>\s*'a'/);
    expect(sql).toMatch(/con\.confmatchtype\s*<>\s*'s'/);
    expect(sql).toMatch(/con\.condeferrable\s*<>\s*false/);
    expect(sql).toMatch(/con\.condeferred\s*<>\s*false/);
  });

  it("a contagem final de constraints presentes/validadas usa nome + tabela + coluna + destino (não só o nome)", () => {
    const sql = readMigrationText(STAGING_MIGRATIONS_DIR, RECONCILE_FILE);
    // As duas contagens finais (dentro do DO e no SELECT de fase 7) devem
    // fazer JOIN com pg_attribute e comparar attname da coluna de origem
    // esperada — não apenas filtrar por uma lista de nomes.
    const joinOccurrences = sql.match(/JOIN pg_attribute asrc ON asrc\.attrelid = c\.conrelid AND asrc\.attnum = c\.conkey\[1\]/g) ?? [];
    expect(joinOccurrences.length, "contagem por nome+tabela+coluna+destino deve aparecer nas 2 verificações finais (DO + SELECT)").toBeGreaterThanOrEqual(2);
    expect(sql).toContain("asrc.attname = e.col");
    expect(sql).toContain("adst.attname = 'id'");
    // não deve existir uma contagem apoiada somente em uma lista fixa de nomes
    expect(sql).not.toMatch(/c\.conname\s+IN\s*\(\s*\n?\s*'access_invites_accepted_user_id_fkey'/);
  });

  it("organizations_preservadas retorna a quantidade real de linhas (número), não um booleano", () => {
    const sql = readMigrationText(STAGING_MIGRATIONS_DIR, RECONCILE_FILE);
    const match = sql.match(/'organizations_preservadas',\s*([^,\n]+(?:\n[^,\n]+)?),/);
    expect(match, "chave organizations_preservadas não encontrada no SELECT final").not.toBeNull();
    const expression = (match?.[1] ?? "").replace(/\s+/g, " ").trim();
    expect(expression).toBe("(SELECT count(*) FROM public.organizations)");
    expect(expression).not.toMatch(/IS NOT NULL/i);
    expect(expression).not.toMatch(/\btrue\b|\bfalse\b/i);
  });

  it("o resultado JSON inclui ambiente_alvo = 'common_structure'", () => {
    const sql = readMigrationText(STAGING_MIGRATIONS_DIR, RECONCILE_FILE);
    expect(sql).toContain("'ambiente_alvo', 'common_structure'");
  });

  it("não inclui nenhuma tabela ou fase que sugira transferência de dados entre os bancos", () => {
    const sql = readMigrationText(STAGING_MIGRATIONS_DIR, RECONCILE_FILE);
    expect(sql.toLowerCase()).not.toMatch(/dblink|postgres_fdw|copy\s+.+\s+from\s+program/);
  });

  it("não contém operações de dados, seeds, políticas antigas nem concessão insegura de autoridade", () => {
    const sql = readMigrationText(STAGING_MIGRATIONS_DIR, RECONCILE_FILE);
    for (const [label, pattern] of FORBIDDEN_PATTERNS) {
      expect(pattern.test(sql), `padrão proibido encontrado (${label})`).toBe(false);
    }
  });

  it("está classificada em production_management no manifesto de migrations", () => {
    const manifestPath = path.join(ROOT, "supabase", "migration-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.production_management).toContain(RECONCILE_FILE);
  });
});
