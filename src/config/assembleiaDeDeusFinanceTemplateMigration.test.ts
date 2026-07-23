import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");

const TEMPLATE_FILE = "20260726090000_assembleia_de_deus_finance_template.sql";
const RPC_FILE = "20260726100000_finance_import_transactions_bulk_rpc.sql";

function readMigration(fileName: string) {
  return readFileSync(path.join(ROOT, "supabase", "migrations", fileName), "utf8");
}

describe("migration assembleia_de_deus_finance_template", () => {
  const sql = readMigration(TEMPLATE_FILE);

  it("cria a função de seed do template e o gatilho de organizations, sem tocar em outras tabelas", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.seed_assembleia_de_deus_finance_template");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.seed_finance_defaults_for_org");
    expect(sql).toContain("AFTER INSERT ON public.organizations");
    expect(sql).toContain("AFTER UPDATE OF denomination_type ON public.organizations");
  });

  it("só semeia o template para organizações matriz/sede cuja denomination_type identifique Assembleia de Deus", () => {
    expect(sql).toMatch(/NEW\.organization_type IN \('matriz', 'sede'\)/);
    expect(sql).toMatch(/lower\(NEW\.denomination_type\) LIKE '%assemble%deus%'/);
  });

  it("preserva o seed genérico existente (10 categorias, 4 centros de custo, 4 contas) sem alterações", () => {
    expect(sql).toContain("(NEW.id, '1.01', 'Dizimos', 'receita', true)");
    expect(sql).toContain("(NEW.id, 'Matriz', 'matriz')");
    expect(sql).toContain("(NEW.id, 'Caixa', 'caixa')");
  });

  it("semeia exatamente 25 grupos contábeis e todas as inserções são idempotentes (ON CONFLICT DO NOTHING)", () => {
    const groupRows = sql.match(/\(p_organization_id, '\d+',/g) ?? [];
    expect(groupRows.length).toBe(25);
    expect(sql).toContain("ON CONFLICT (organization_id, type, name) DO NOTHING");
    expect(sql).toContain("ON CONFLICT (organization_id, code) DO NOTHING");
    expect(sql).toContain("ON CONFLICT (organization_id, name) DO NOTHING");
  });

  it("não repete nenhum nome de tipo de documento (constraint é por nome, não por código — repetir causaria perda silenciosa de código)", () => {
    const start = sql.indexOf("INSERT INTO public.finance_document_types");
    const end = sql.indexOf("-- 1.4 Portadores");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const docTypeBlock = sql.slice(start, end);
    const names = [...docTypeBlock.matchAll(/p_organization_id,\s*'[^']*',\s*'([^']+)'\)/g)].map((m) => m[1]);
    expect(names.length).toBe(35);
    expect(new Set(names).size).toBe(names.length);
  });

  it("é aditiva — nunca remove tabela/coluna, nunca apaga dados de negócio de organizações existentes", () => {
    const lowered = sql.toLowerCase();
    expect(lowered).not.toMatch(/\b(drop\s+column|drop\s+table|truncate|delete\s+from)\b/);
  });

  it("não cria função nova de RLS — reaproveita is_org_finance_writer/reader existentes", () => {
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.is_org_finance/);
  });

  it("está classificada em migration-manifest.json como production_management", () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "supabase", "migration-manifest.json"), "utf8"));
    expect(manifest.production_management).toContain(TEMPLATE_FILE);
    for (const key of ["staging_feature", "staging_only", "mixed_needs_split", "historical"] as const) {
      expect(manifest[key] ?? []).not.toContain(TEMPLATE_FILE);
    }
  });
});

describe("migration finance_import_transactions_bulk_rpc", () => {
  const sql = readMigration(RPC_FILE);

  it("cria a RPC import_finance_transactions_bulk com GRANT para authenticated", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.import_finance_transactions_bulk(p_rows jsonb)");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.import_finance_transactions_bulk(jsonb) TO authenticated");
  });

  it("reproduz manualmente as mesmas regras da policy de INSERT de transactions (writer + mês não fechado)", () => {
    expect(sql).toContain("public.is_org_finance_writer(auth.uid(), v_org)");
    expect(sql).toContain("public.is_finance_month_closed(v_org, v_date)");
  });

  it("isola cada linha em seu próprio bloco de exceção (uma linha ruim não descarta o lote)", () => {
    const beginCount = (sql.match(/\bBEGIN\b/g) ?? []).length;
    const exceptionCount = (sql.match(/EXCEPTION WHEN OTHERS THEN/g) ?? []).length;
    expect(beginCount).toBeGreaterThanOrEqual(2);
    expect(exceptionCount).toBeGreaterThanOrEqual(2);
  });

  it("está classificada em migration-manifest.json como production_management", () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "supabase", "migration-manifest.json"), "utf8"));
    expect(manifest.production_management).toContain(RPC_FILE);
    for (const key of ["staging_feature", "staging_only", "mixed_needs_split", "historical"] as const) {
      expect(manifest[key] ?? []).not.toContain(RPC_FILE);
    }
  });
});
