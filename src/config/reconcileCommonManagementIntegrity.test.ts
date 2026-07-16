import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * FASE 7 — testes de proteção da correção 2026-07-16 (substituição da
 * promoção em bloco do commit c94024e por uma migration única, forward-only,
 * comum a staging e produção).
 *
 * Este teste é somente leitura: nunca aplica, move ou edita nenhuma
 * migration, e nunca se conecta a um banco de dados real.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");

const STAGING_MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const PRODUCTION_MIGRATIONS_DIR = path.join(ROOT, "supabase-production", "supabase", "migrations");

const BASELINE_FILE = "20260715170000_production_baseline_marker.sql";
const BASELINE_VERSION = "20260715170000";
const RECONCILE_FILE = "20260716110000_reconcile_common_management_integrity.sql";

// Os 33 arquivos históricos de staging que o commit c94024e havia copiado
// para o workdir executável de produção e que esta correção removeu de lá
// (preservando-os intactos em supabase/migrations/).
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

// As 39 constraints com origem verificada em supabase/migrations que a
// migration deve reconciliar. As outras 10 do conjunto "autoritativo" de 49
// fornecido pela tarefa não têm origem rastreável no repositório (ver
// comentário no topo do arquivo .sql) e foram deliberadamente excluídas.
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
];

// Constraints do conjunto "autoritativo" de 49 fornecido pela tarefa que NÃO
// têm origem rastreável no repositório e por isso não são reconciliadas por
// esta migration (ver seção "DIVERGÊNCIA ENCONTRADA" no topo do arquivo .sql
// e a seção "Correção 2026-07-16" em RELATORIO_CLASSIFICACAO_MIGRATIONS.md).
const EXCLUDED_CONSTRAINTS_WITHOUT_TRACEABLE_ORIGIN = [
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

const FORBIDDEN_PATTERNS: Array<[string, RegExp]> = [
  ["INSERT INTO", /INSERT\s+INTO/i],
  ["UPDATE ... SET", /\bUPDATE\s+(public\.|auth\.)?\w+\s+SET\b/i],
  ["DELETE FROM", /DELETE\s+FROM/i],
  ["TRUNCATE", /\bTRUNCATE\b/i],
  ["DROP TABLE", /DROP\s+TABLE/i],
  ["staging-only", /staging-only/i],
  ["staging/demo", /staging\/demo/i],
  ["storage.buckets", /storage\.buckets/i],
  ["CREATE POLICY", /\bCREATE\s+POLICY\b/i],
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

describe("reconcile_common_management_integrity — workdir de produção", () => {
  it("nenhuma migration executável de produção tem timestamp anterior ao baseline", () => {
    const files = readdirSync(PRODUCTION_MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
    const tooOld = files.filter((f) => f.slice(0, 14) < BASELINE_VERSION);
    expect(tooOld, `migration(s) anterior(es) ao baseline em supabase-production: ${tooOld.join(", ")}`).toEqual([]);
  });

  it("o baseline continua presente no workdir de produção", () => {
    const files = readdirSync(PRODUCTION_MIGRATIONS_DIR);
    expect(files).toContain(BASELINE_FILE);
  });

  it("nenhum dos 33 arquivos históricos removidos permanece no workdir de produção", () => {
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
  it("existe nos dois workdirs (staging e produção)", () => {
    expect(readdirSync(STAGING_MIGRATIONS_DIR)).toContain(RECONCILE_FILE);
    expect(readdirSync(PRODUCTION_MIGRATIONS_DIR)).toContain(RECONCILE_FILE);
  });

  it("as duas cópias têm conteúdo e hash SHA256 idênticos", () => {
    const staging = readMigrationText(STAGING_MIGRATIONS_DIR, RECONCILE_FILE);
    const production = readMigrationText(PRODUCTION_MIGRATIONS_DIR, RECONCILE_FILE);
    expect(staging).toBe(production);
    expect(sha256(staging)).toBe(sha256(production));
  });

  it("tem timestamp posterior ao baseline de produção", () => {
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

  it("contém exatamente as 39 constraints com origem verificada, e nenhuma outra", () => {
    const sql = readMigrationText(STAGING_MIGRATIONS_DIR, RECONCILE_FILE);
    for (const name of EXPECTED_CONSTRAINTS) {
      expect(sql.includes(`'${name}'`), `constraint esperada ausente: ${name}`).toBe(true);
    }

    const fkeyMatches = sql.match(/'([a-z0-9_]+_fkey)'/g) ?? [];
    const namesFound = new Set(fkeyMatches.map((m) => m.slice(1, -1)));
    const unexpected = [...namesFound].filter((n) => !EXPECTED_CONSTRAINTS.includes(n));
    expect(unexpected, `constraint(s) inesperada(s) na migration: ${unexpected.join(", ")}`).toEqual([]);
  });

  it("não inclui nenhuma das 10 constraints sem origem rastreável no repositório", () => {
    const sql = readMigrationText(STAGING_MIGRATIONS_DIR, RECONCILE_FILE);
    const present = EXCLUDED_CONSTRAINTS_WITHOUT_TRACEABLE_ORIGIN.filter((name) => sql.includes(`'${name}'`));
    expect(
      present,
      `constraint(s) sem origem verificada foram incluídas de forma inventada: ${present.join(", ")}`,
    ).toEqual([]);
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
