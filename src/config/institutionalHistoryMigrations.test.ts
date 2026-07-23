import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * OPERAÇÃO 1 — Fundação compartilhada dos domínios + Secretaria.
 *
 * Testes de regressão sobre as migrations novas desta operação. Somente
 * leitura de arquivo — nunca conecta a um banco, nunca aplica migration.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const STAGING_DIR = path.join(ROOT, "supabase", "migrations");
const PRODUCTION_DIR = path.join(ROOT, "supabase-production", "supabase", "migrations");

const OPERATION1_MIGRATIONS = [
  "20260728090000_shared_institutional_history_foundation.sql",
  "20260728100000_member_occurrences.sql",
  "20260728110000_member_ordinations.sql",
  "20260728120000_member_transfers.sql",
  "20260728130000_member_organization_history.sql",
];

function readStaging(file: string): string {
  return readFileSync(path.join(STAGING_DIR, file), "utf8");
}

function readProduction(file: string): string {
  return readFileSync(path.join(PRODUCTION_DIR, file), "utf8");
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Ver comentário equivalente em memberMigrations.test.ts — sem anchor "$" por causa de CRLF no Windows. */
function stripSqlComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*/, ""))
    .join("\n");
}

describe("Operação 1 — migrations existem nas duas árvores com conteúdo idêntico", () => {
  it.each(OPERATION1_MIGRATIONS)("%s existe em staging e em produção com o mesmo conteúdo", (file) => {
    const stagingPath = path.join(STAGING_DIR, file);
    const productionPath = path.join(PRODUCTION_DIR, file);
    expect(existsSync(stagingPath), `faltando em supabase/migrations: ${file}`).toBe(true);
    expect(existsSync(productionPath), `faltando em supabase-production/supabase/migrations: ${file}`).toBe(true);

    const stagingContent = readStaging(file);
    const productionContent = readProduction(file);
    expect(
      sha256(productionContent),
      `conteúdo diverge entre staging e produção para ${file}`,
    ).toBe(sha256(stagingContent));
  });
});

describe("Operação 1 — nenhuma migration cria campo de rede social externa", () => {
  it.each(OPERATION1_MIGRATIONS)("%s não contém facebook/instagram/tiktok/twitter/linkedin/social_media", (file) => {
    const sql = readStaging(file);
    const forbidden = /facebook|instagram|tiktok|twitter|linkedin|social_?media/i;
    expect(forbidden.test(sql)).toBe(false);
  });

  it.each(OPERATION1_MIGRATIONS)("%s não usa USING (true) nem WITH CHECK (true)", (file) => {
    const sql = readStaging(file);
    expect(sql).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/WITH CHECK\s*\(\s*true\s*\)/i);
  });

  it.each(OPERATION1_MIGRATIONS)("%s não altera o módulo Financeiro", (file) => {
    const sql = readStaging(file);
    expect(sql).not.toMatch(/\bfinance_|transactions\b/i);
  });
});

describe("Operação 1 — member_history (fundação compartilhada)", () => {
  const sql = readStaging("20260728090000_shared_institutional_history_foundation.sql");

  it("cria a tabela member_history com colunas de origem, confidencialidade e legado", () => {
    const createTableMatch = sql.match(/CREATE TABLE IF NOT EXISTS public\.member_history \(([\s\S]*?)\n\);/);
    expect(createTableMatch, "CREATE TABLE de member_history não encontrado").toBeTruthy();
    const body = createTableMatch![1];
    for (const column of [
      "member_id", "organization_id", "history_type", "title", "description",
      "occurred_at", "recorded_at", "source_module", "source_table", "source_id",
      "document_id", "attachment_path", "visibility", "created_by",
      "legacy_source", "legacy_module", "legacy_code",
    ]) {
      expect(body, `coluna ausente em member_history: ${column}`).toMatch(new RegExp(`\\b${column}\\b`));
    }
  });

  it("habilita RLS e resolve a organização efetiva via JOIN com members (hierarquia), não a coluna local", () => {
    expect(sql).toMatch(/ALTER TABLE public\.member_history ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/COALESCE\(m\.congregation_id,\s*m\.sector_id,\s*m\.organization_id\)/);
  });

  it("policy de SELECT exige members.confidential adicionalmente quando visibility = confidential", () => {
    const selectPolicy = sql.match(/CREATE POLICY "member_history capability select"[\s\S]*?;/);
    expect(selectPolicy, "policy de select não encontrada").toBeTruthy();
    expect(selectPolicy![0]).toMatch(/'members\.read'/);
    expect(selectPolicy![0]).toMatch(/'members\.confidential'/);
    expect(selectPolicy![0]).toMatch(/visibility <> 'confidential'/);
  });

  it("NÃO possui policy de DELETE (trilha histórica não é apagável, mesmo padrão de organization_access_audit)", () => {
    expect(sql).not.toMatch(/member_history capability delete/i);
    expect(sql).not.toMatch(/FOR DELETE[\s\S]{0,80}member_history/);
  });

  it("cria a função register_member_history_event como SECURITY DEFINER", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.register_member_history_event/);
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.register_member_history_event[\s\S]*?\$\$;/);
    expect(fn, "função register_member_history_event não encontrada").toBeTruthy();
    expect(fn![0]).toMatch(/SECURITY DEFINER/);
  });

  it("register_member_history_event não bloqueia contexto de backend/service_role (auth.uid() IS NULL) — preparação para futura importação legada", () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.register_member_history_event[\s\S]*?\$\$;/);
    expect(fn![0]).toMatch(/IF auth\.uid\(\) IS NOT NULL THEN/);
  });

  it("register_member_history_event valida capability members.write e members.confidential quando há usuário autenticado", () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.register_member_history_event[\s\S]*?\$\$;/);
    expect(fn![0]).toMatch(/'members\.write'/);
    expect(fn![0]).toMatch(/'members\.confidential'/);
  });

  it("cria índice único parcial de idempotência para importação legada (organization_id, legacy_source, legacy_code)", () => {
    const idx = sql.match(/CREATE UNIQUE INDEX IF NOT EXISTS member_history_legacy_unique_idx[\s\S]*?;/);
    expect(idx, "índice de idempotência legada não encontrado").toBeTruthy();
    expect(idx![0]).toContain("organization_id, legacy_source, legacy_code");
  });

  it("adiciona a capability members.confidential apenas a church_admin/responsible_pastor (governança), de forma idempotente", () => {
    const update = sql.match(/UPDATE public\.access_responsibility_definitions[\s\S]*?;/);
    expect(update, "UPDATE de access_responsibility_definitions não encontrado").toBeTruthy();
    expect(update![0]).toContain("'church_admin', 'responsible_pastor'");
    expect(update![0]).toMatch(/NOT \('members\.confidential' = ANY\(permission_keys\)\)/);
  });
});

describe("Operação 1 — member_occurrences (ocorrências pastorais/administrativas)", () => {
  const sql = readStaging("20260728100000_member_occurrences.sql");

  it("habilita RLS com confidencialidade (members.confidential exigido quando visibility = confidential)", () => {
    expect(sql).toMatch(/ALTER TABLE public\.member_occurrences ENABLE ROW LEVEL SECURITY/);
    const selectPolicy = sql.match(/CREATE POLICY "member_occurrences capability select"[\s\S]*?;/);
    expect(selectPolicy![0]).toMatch(/'members\.confidential'/);
  });

  it("NÃO possui policy de DELETE — ocorrências são canceladas (status), nunca apagadas", () => {
    expect(sql).not.toMatch(/member_occurrences capability delete/i);
  });

  it("todo INSERT gera automaticamente um evento em member_history via trigger", () => {
    expect(sql).toMatch(/CREATE TRIGGER member_occurrences_register_history/);
    expect(sql).toMatch(/AFTER INSERT ON public\.member_occurrences/);
    expect(sql).toMatch(/register_member_history_event/);
  });

  it("cria índice único parcial de idempotência para importação legada", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS member_occurrences_legacy_unique_idx/);
  });
});

describe("Operação 1 — member_ordinations (ordenações e nomeações temporais)", () => {
  const sql = readStaging("20260728110000_member_ordinations.sql");

  it("permite múltiplos registros ao longo do tempo (sem constraint de 'só um ativo por vez')", () => {
    expect(sql).not.toMatch(/UNIQUE.*member_id.*status/i);
  });

  it("guarda contra duplicidade evidente (mesmo membro, mesma função, mesma data de início)", () => {
    const idx = sql.match(/CREATE UNIQUE INDEX IF NOT EXISTS member_ordinations_unique_start[\s\S]*?;/);
    expect(idx, "índice de duplicidade não encontrado").toBeTruthy();
    expect(idx![0]).toContain("member_id, role_or_function, start_date");
  });

  it("registra 'nomeacao'/'ordenacao' no INSERT e 'encerramento_funcao' quando status muda para encerrado", () => {
    expect(sql).toMatch(/CREATE TRIGGER member_ordinations_register_history_insert/);
    expect(sql).toMatch(/CREATE TRIGGER member_ordinations_register_history_update/);
    expect(sql).toMatch(/AFTER UPDATE OF status ON public\.member_ordinations/);
    expect(sql).toMatch(/'encerramento_funcao'/);
  });

  it("não duplica o catálogo de funções/cargos — role_or_function é texto livre (reaproveita ECCLESIASTICAL_FUNCTIONS/ADMINISTRATIVE_ROLES do frontend)", () => {
    expect(sql).not.toMatch(/CHECK\s*\(\s*role_or_function\s+IN/i);
  });
});

describe("Operação 1 — member_transfers (transferências)", () => {
  const sql = readStaging("20260728120000_member_transfers.sql");

  it("reaproveita recommendation_letters por FK — não recria Cartas de Recomendação", () => {
    expect(sql).toMatch(/recommendation_letter_id uuid REFERENCES public\.recommendation_letters\(id\)/);
  });

  it("distingue transferência interna (organização existente) de externa (nome livre)", () => {
    expect(sql).toMatch(/origin_type text NOT NULL DEFAULT 'interna' CHECK \(origin_type IN \('interna', 'externa'\)\)/);
    expect(sql).toMatch(/destination_type text NOT NULL DEFAULT 'interna' CHECK \(destination_type IN \('interna', 'externa'\)\)/);
  });

  it("registra evento na timeline no INSERT e em toda mudança de status", () => {
    expect(sql).toMatch(/CREATE TRIGGER member_transfers_register_history_insert/);
    expect(sql).toMatch(/CREATE TRIGGER member_transfers_register_history_update/);
  });
});

describe("Operação 1 — member_organization_history (vínculo organizacional derivado)", () => {
  const sql = readStaging("20260728130000_member_organization_history.sql");

  it("garante uma única fonte de verdade: no máximo um vínculo aberto por pessoa+tipo", () => {
    const idx = sql.match(/CREATE UNIQUE INDEX IF NOT EXISTS member_org_history_one_open[\s\S]*?;/);
    expect(idx, "índice de vínculo único aberto não encontrado").toBeTruthy();
    expect(idx![0]).toContain("member_id, link_type");
    expect(idx![0]).toContain("WHERE ended_at IS NULL");
  });

  it("NÃO concede INSERT/UPDATE/DELETE a authenticated — só é escrita por trigger SECURITY DEFINER", () => {
    const code = stripSqlComments(sql);
    expect(code).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE)[\s\S]{0,60}member_organization_history[\s\S]{0,10}TO authenticated/i);
    expect(code).not.toMatch(/member_organization_history capability insert/i);
    expect(code).not.toMatch(/member_organization_history capability update/i);
  });

  it("cria os 3 triggers em members (seed no insert, mudança organizacional, mudança de situação)", () => {
    expect(sql).toMatch(/CREATE TRIGGER members_seed_history_on_insert/);
    expect(sql).toMatch(/AFTER INSERT ON public\.members/);
    expect(sql).toMatch(/CREATE TRIGGER members_track_organization_change/);
    expect(sql).toMatch(/AFTER UPDATE OF organization_id, sector_id, congregation_id ON public\.members/);
    expect(sql).toMatch(/CREATE TRIGGER members_track_status_change/);
    expect(sql).toMatch(/AFTER UPDATE OF status ON public\.members/);
  });

  it("os triggers de UPDATE só disparam quando o valor realmente muda (IS DISTINCT FROM), evitando ruído na timeline", () => {
    expect(sql).toMatch(/NEW\.organization_id IS DISTINCT FROM OLD\.organization_id/);
    expect(sql).toMatch(/NEW\.status IS DISTINCT FROM OLD\.status/);
  });
});

describe("Operação 1 — manifesto de migrations", () => {
  it("as 5 migrations estão classificadas em staging_feature", () => {
    const manifestPath = path.join(ROOT, "supabase", "migration-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { staging_feature: string[] };
    for (const file of OPERATION1_MIGRATIONS) {
      expect(manifest.staging_feature, `${file} ausente de staging_feature`).toContain(file);
    }
  });
});

describe("Operação 1 — capability members.confidential no frontend", () => {
  it("accessControl.ts declara a chave members.confidential", () => {
    const accessControlPath = path.join(ROOT, "src", "lib", "accessControl.ts");
    const content = readFileSync(accessControlPath, "utf8");
    expect(content).toMatch(/"members\.confidential"/);
  });
});
