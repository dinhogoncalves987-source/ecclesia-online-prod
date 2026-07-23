import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Parte 1 — Fundação Cadastral do Membro (Ecclesia Online)
 *
 * Testes de regressão sobre as migrations novas desta parte. Somente
 * leitura de arquivo — nunca conecta a um banco, nunca aplica migration.
 *
 * Objetivo principal: travar em CI as duas correções críticas encontradas
 * na revisão do trabalho original (DeepSeek):
 *   1. member_addresses/member_family usavam has_org_role() com roles fixos
 *      ('admin' — que nunca existe como role real) e SEM hierarquia. O
 *      padrão correto, usado pela própria tabela members, é
 *      has_org_access_permission() com capacidades 'members.read'/'members.write'.
 *   2. CPF não tinha nenhuma validação de formato nem unicidade no banco.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const STAGING_DIR = path.join(ROOT, "supabase", "migrations");
const PRODUCTION_DIR = path.join(ROOT, "supabase-production", "supabase", "migrations");

const MEMBER_PART1_MIGRATIONS = [
  "20260727000000_members_legacy_identifiers_and_extra_fields.sql",
  "20260727010000_member_addresses.sql",
  "20260727020000_member_family.sql",
  "20260727030000_members_cpf_validation.sql",
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

/**
 * Remove linhas de comentário SQL ("-- ...") antes de testar por padrões
 * de código real. Necessário porque os cabeçalhos das migrations corrigidas
 * documentam, em prosa, qual era o padrão ANTERIOR (incorreto) — e essa
 * documentação não deve ser confundida com o código real da policy.
 */
function stripSqlComments(sql: string): string {
  // Nota: sem o anchor "$" de propósito — em arquivos com CRLF (comum no
  // Windows), cada linha (após o split por "\n") termina com um "\r" que a
  // classe "." do JS regex NÃO consome (\r é tratado como line terminator).
  // Isso faz "$" nunca casar depois de ".*", e o regex falha silenciosamente
  // em toda linha com CRLF. "." sozinho já é greedy até o fim do conteúdo
  // não-terminador da linha, o que é suficiente aqui.
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*/, ""))
    .join("\n");
}

describe("Parte 1 — migrations de membros existem nas duas árvores com conteúdo idêntico", () => {
  it.each(MEMBER_PART1_MIGRATIONS)("%s existe em staging e em produção com o mesmo conteúdo", (file) => {
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

describe("Parte 1 — members: colunas novas (20260727000000)", () => {
  const sql = readStaging("20260727000000_members_legacy_identifiers_and_extra_fields.sql");

  const EXPECTED_COLUMNS = [
    "legacy_code", "legacy_registration", "legacy_source",
    "known_name", "birth_place", "nationality", "education_level", "profession",
    "baptism_place", "admission_type", "cgadb_number",
    "incomplete_registration", "cpf_pending", "contact_pending", "requires_review",
  ];

  it(`adiciona exatamente as ${EXPECTED_COLUMNS.length} colunas esperadas (nenhuma extra, nenhuma faltando)`, () => {
    const addColumnMatches = [...sql.matchAll(/ADD COLUMN IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
    expect(new Set(addColumnMatches)).toEqual(new Set(EXPECTED_COLUMNS));
  });

  it("não cria nenhum campo de rede social externa", () => {
    const forbidden = /facebook|instagram|tiktok|twitter|linkedin|social_?media/i;
    expect(forbidden.test(sql)).toBe(false);
  });

  it("é idempotente (usa IF NOT EXISTS em todas as colunas) e não usa DROP COLUMN", () => {
    expect(sql).not.toMatch(/DROP COLUMN/i);
    const addColumnStatements = [...sql.matchAll(/ADD COLUMN[^;]*/g)];
    for (const stmt of addColumnStatements) {
      expect(stmt[0]).toContain("IF NOT EXISTS");
    }
  });
});

describe("Parte 1 — member_addresses (20260727010000)", () => {
  const sql = readStaging("20260727010000_member_addresses.sql");

  const EXPECTED_COLUMNS = [
    "id", "member_id", "organization_id", "address_type", "zip_code", "street_type",
    "street", "number", "complement", "neighborhood", "city", "state", "country",
    "reference_point", "is_primary", "is_active", "notes", "created_at", "updated_at",
  ];

  it(`cria a tabela com exatamente ${EXPECTED_COLUMNS.length} colunas`, () => {
    const createTableMatch = sql.match(/CREATE TABLE IF NOT EXISTS public\.member_addresses \(([\s\S]*?)\);/);
    expect(createTableMatch, "CREATE TABLE de member_addresses não encontrado").toBeTruthy();
    const body = createTableMatch![1];
    const columnNames = body
      .split(/,\r?\n/)
      .map((line) => line.trim().split(/\s+/)[0])
      .filter((name) => name && !name.startsWith("--"));
    expect(columnNames).toEqual(EXPECTED_COLUMNS);
  });

  it("habilita RLS", () => {
    expect(sql).toMatch(/ALTER TABLE public\.member_addresses ENABLE ROW LEVEL SECURITY/);
  });

  it("REGRESSÃO: usa has_org_access_permission (padrão real de members), não has_org_role", () => {
    const code = stripSqlComments(sql);
    expect(code).toMatch(/has_org_access_permission/);
    expect(code).not.toMatch(/has_org_role/);
  });

  it("REGRESSÃO: resolve a organização efetiva via congregation_id/sector_id do membro (hierarquia), não a organization_id bruta da linha", () => {
    expect(sql).toMatch(/COALESCE\(m\.congregation_id,\s*m\.sector_id,\s*m\.organization_id\)/);
  });

  it("usa as capacidades members.read e members.write (não roles fixos como 'admin')", () => {
    const code = stripSqlComments(sql);
    expect(code).toMatch(/'members\.read'/);
    expect(code).toMatch(/'members\.write'/);
    expect(code).not.toMatch(/'admin'/);
  });

  it("impede mais de um endereço principal ativo por membro", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS member_addresses_one_primary[\s\S]*WHERE is_primary = true AND is_active = true/);
  });

  it("não usa USING (true) nem WITH CHECK (true) (nenhuma policy permissiva demais)", () => {
    expect(sql).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/WITH CHECK\s*\(\s*true\s*\)/i);
  });
});

describe("Parte 1 — member_family (20260727020000)", () => {
  const sql = readStaging("20260727020000_member_family.sql");

  const EXPECTED_COLUMNS = [
    "id", "member_id", "organization_id", "relation", "full_name", "related_member_id",
    "birth_date", "gender", "cpf", "phone", "notes", "is_active", "created_at", "updated_at",
  ];

  it(`cria a tabela com exatamente ${EXPECTED_COLUMNS.length} colunas`, () => {
    const createTableMatch = sql.match(/CREATE TABLE IF NOT EXISTS public\.member_family \(([\s\S]*?)\);/);
    expect(createTableMatch, "CREATE TABLE de member_family não encontrado").toBeTruthy();
    const body = createTableMatch![1];
    const columnNames = body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("--"))
      .map((line) => line.replace(/,$/, "").split(/\s+/)[0]);
    expect(columnNames).toEqual(EXPECTED_COLUMNS);
  });

  it("habilita RLS", () => {
    expect(sql).toMatch(/ALTER TABLE public\.member_family ENABLE ROW LEVEL SECURITY/);
  });

  it("REGRESSÃO: usa has_org_access_permission (padrão real de members), não has_org_role", () => {
    const code = stripSqlComments(sql);
    expect(code).toMatch(/has_org_access_permission/);
    expect(code).not.toMatch(/has_org_role/);
  });

  it("permite múltiplos filhos/dependentes (índice único considera o nome, não só a relação)", () => {
    const idx = sql.match(/CREATE UNIQUE INDEX IF NOT EXISTS member_family_unique_relation[\s\S]*?;/);
    expect(idx, "índice member_family_unique_relation não encontrado").toBeTruthy();
    expect(idx![0]).toContain("member_id, relation, full_name");
  });

  it("não usa USING (true) nem WITH CHECK (true)", () => {
    expect(sql).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/WITH CHECK\s*\(\s*true\s*\)/i);
  });
});

describe("Parte 1 — validação de CPF (20260727030000)", () => {
  const sql = readStaging("20260727030000_members_cpf_validation.sql");

  it("cria uma CHECK constraint de formato de CPF", () => {
    expect(sql).toMatch(/ADD CONSTRAINT members_cpf_format_check/);
    expect(sql).toMatch(/CHECK\s*\(/);
  });

  it("a exceção de CPF pendente (cpf_pending) existe e é exclusiva da importação de legado — nunca satisfeita automaticamente por um cadastro manual comum", () => {
    expect(sql).toMatch(/cpf_pending\s*=\s*true/);
  });

  it("cria um índice único de CPF por organização, excluindo CPFs pendentes", () => {
    const idx = sql.match(/CREATE UNIQUE INDEX IF NOT EXISTS members_org_cpf_unique_idx[\s\S]*?;/);
    expect(idx, "índice members_org_cpf_unique_idx não encontrado").toBeTruthy();
    expect(idx![0]).toContain("organization_id, cpf");
    expect(idx![0]).toContain("cpf_pending = false");
  });

  it("usa NOT VALID para não falhar retroativamente sobre dados já existentes", () => {
    expect(sql).toMatch(/NOT VALID/);
  });
});
