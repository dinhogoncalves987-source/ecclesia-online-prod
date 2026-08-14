import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * FASE 1D-B1 — reconciliação estrutural CONFIADCS (schema + RPC).
 * Testes puramente estáticos: leem o texto das migrations, nunca executam
 * SQL nem se conectam a um banco. Segue a mesma convenção já usada por
 * financeAccountabilityMigration.test.ts.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function pairPaths(fileName: string) {
  return {
    staging: path.join(ROOT, "supabase", "migrations", fileName),
    production: path.join(ROOT, "supabase-production", "supabase", "migrations", fileName),
  };
}

/** Normaliza quebras de linha (CRLF→LF) só para asserções de conteúdo — a
 * checagem de paridade byte a byte usa sempre o conteúdo bruto do arquivo. */
function readSql(filePath: string): string {
  return readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

describe("migration finance_confiadcs_reconciliation_schema", () => {
  const FILE_NAME = "20260812180000_finance_confiadcs_reconciliation_schema.sql";
  const { staging, production } = pairPaths(FILE_NAME);

  it("existe, idêntica byte a byte, em staging e produção", () => {
    expect(sha256(readFileSync(production, "utf8"))).toBe(sha256(readFileSync(staging, "utf8")));
  });

  it("cria as tabelas novas com RLS habilitado e GRANT explícito para authenticated", () => {
    const sql = readSql(staging);
    for (const table of [
      "finance_periods",
      "finance_import_catalog_aliases",
      "finance_import_batch_rows",
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table}\\s+ENABLE ROW LEVEL SECURITY`));
    }
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_periods TO authenticated");
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_import_catalog_aliases TO authenticated");
    expect(sql).toContain("GRANT SELECT, INSERT ON public.finance_import_batch_rows TO authenticated");
  });

  it("garante destino estruturado (colunas raw) para os 6 campos com relacionamento por FK + carimbo completo", () => {
    const sql = readSql(staging);
    for (const column of [
      "raw_timestamp",
      "district_raw_label",
      "congregation_raw_label",
      "financial_account_raw_label",
      "accounting_group_raw_label",
      "account_category_raw_label",
      "document_type_raw_label",
      "source_observation",
      "period_id",
      "has_pending_reconciliation",
      "import_source_row_number",
    ]) {
      expect(sql, `coluna ausente: ${column}`).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${column}\\b`));
    }
  });

  it("catálogo de aliases nunca permite inventar correspondência: resolution restrita a auto_exact/manual/pending", () => {
    const sql = readSql(staging);
    expect(sql).toMatch(/resolution\s+text\s+NOT NULL DEFAULT 'pending'\s*\n\s*CHECK \(resolution IN \('auto_exact', 'manual', 'pending'\)\)/);
  });

  it("catálogo de aliases cobre os 7 tipos de catálogo (distrito, congregação, portador, grupo, conta, tipo doc, período)", () => {
    const sql = readSql(staging);
    for (const catalogType of [
      "district", "congregation", "financial_account",
      "accounting_group", "account_category", "document_type", "period",
    ]) {
      expect(sql).toContain(`'${catalogType}'`);
    }
  });

  it("linha de reconciliação (finance_import_batch_rows) só aceita status persisted/duplicate/excluded_invalid — nunca 'sucesso parcial'", () => {
    const sql = readSql(staging);
    expect(sql).toMatch(/status\s+text\s+NOT NULL CHECK \(status IN \(\s*'persisted', 'duplicate', 'excluded_invalid'\s*\)\)/);
  });

  it("impede duplicar um mesmo REGISTRO (legacy_record_number) por organização em importações de planilha", () => {
    const sql = readSql(staging);
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS transactions_org_legacy_record_spreadsheet_uidx");
    expect(sql).toMatch(/WHERE legacy_record_number IS NOT NULL AND origin = 'spreadsheet'/);
  });

  it("reaproveita helpers de RLS existentes — nenhuma função nova de RLS criada", () => {
    const sql = readSql(staging);
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.is_org_finance/);
  });

  it("é aditiva — nunca remove tabela/coluna, nunca apaga dados de negócio", () => {
    const sql = readSql(staging).toLowerCase();
    expect(sql).not.toMatch(/\b(drop\s+column|drop\s+table|truncate|delete\s+from|update\s+public\.)\b/);
  });

  it("está classificada em migration-manifest.json como production_management", () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "supabase", "migration-manifest.json"), "utf8"));
    expect(manifest.production_management).toContain(FILE_NAME);
    for (const key of ["staging_feature", "staging_only", "mixed_needs_split", "historical"] as const) {
      expect(manifest[key] ?? []).not.toContain(FILE_NAME);
    }
  });
});

describe("migration finance_confiadcs_reconciliation_rpc", () => {
  const FILE_NAME = "20260812190000_finance_confiadcs_reconciliation_rpc.sql";
  const { staging, production } = pairPaths(FILE_NAME);

  it("existe, idêntica byte a byte, em staging e produção", () => {
    expect(sha256(readFileSync(production, "utf8"))).toBe(sha256(readFileSync(staging, "utf8")));
  });

  it("preserva compatibilidade retroativa: p_import_batch_id é opcional (DEFAULT NULL) — clientes antigos continuam funcionando", () => {
    const sql = readSql(staging);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.import_finance_transactions_bulk\(\s*p_rows jsonb,\s*p_import_batch_id uuid DEFAULT NULL\s*\)/);
  });

  it("remove explicitamente a assinatura antiga de 1 argumento antes de recriar com 2, evitando ambiguidade de overload no PostgREST", () => {
    const sql = readSql(staging);
    expect(sql).toContain("DROP FUNCTION IF EXISTS public.import_finance_transactions_bulk(jsonb);");
  });

  it("cria/usa um lote de importação sempre — mesmo quando o cliente não informa p_import_batch_id", () => {
    const sql = readSql(staging);
    expect(sql).toContain("INSERT INTO public.finance_import_batches (");
  });

  it("nunca descarta silenciosamente um campo de catálogo não resolvido: sempre upsert no catálogo de aliases", () => {
    const sql = readSql(staging);
    for (const catalogType of [
      "district", "congregation", "financial_account",
      "accounting_group", "account_category", "document_type",
    ]) {
      expect(sql).toContain(`_finance_upsert_catalog_alias(v_org, '${catalogType}',`);
    }
  });

  it("pendência de catálogo nunca rejeita a linha — a transação é inserida mesmo com pending_fields não vazio", () => {
    const sql = readSql(staging);
    expect(sql).toContain("has_pending_reconciliation");
    expect(sql).toMatch(/jsonb_array_length\(v_pending_fields\) > 0/);
    // A instrução INSERT INTO transactions ocorre incondicionalmente depois do
    // cálculo de pendências — não existe nenhum "IF has pending THEN skip".
    expect(sql).not.toMatch(/pending[^\n]*\n[^\n]*CONTINUE/i);
  });

  it("diferencia duplicata (REGISTRO já importado) de linha estruturalmente inválida — nunca as trata como a mesma coisa", () => {
    const sql = readSql(staging);
    expect(sql).toContain("WHEN unique_violation THEN");
    expect(sql).toContain("GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME");
    expect(sql).toContain("v_duplicate := v_duplicate + 1;");
    expect(sql).toContain("v_excluded_invalid := v_excluded_invalid + 1;");
  });

  it("toda linha do lote gera exatamente um registro em finance_import_batch_rows (persisted, duplicate ou excluded_invalid)", () => {
    const sql = readSql(staging);
    const inserts = sql.match(/INSERT INTO public\.finance_import_batch_rows/g) ?? [];
    // 1 caminho de sucesso + 1 de duplicata + 2 de exclusão (unique_violation
    // genérico e WHEN OTHERS) = 4 pontos de inserção, cobrindo os 3 status.
    expect(inserts.length).toBeGreaterThanOrEqual(3);
    expect(sql).toContain("'persisted'");
    expect(sql).toContain("'duplicate'");
    expect(sql).toContain("'excluded_invalid'");
  });

  it("preserva parsing brasileiro: valor bruto e datas continuam vindo já normalizados do importador (::numeric, ::date), sem transformação adicional na RPC", () => {
    const sql = readSql(staging);
    expect(sql).toContain("(v_row->>'amount')::numeric");
    expect(sql).toContain("(v_row->>'date')::date");
    expect(sql).toContain("NULLIF(v_row->>'raw_timestamp', '')::timestamptz");
  });

  it("cria a RPC de finalização que comprova a reconciliação (lidas=processadas=persistidas, zero duplicadas, zero excluídas, totais e datas)", () => {
    const sql = readSql(staging);
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.finalize_finance_import_batch(");
    expect(sql).toContain("'check', 'rows_accounting_identity'");
    expect(sql).toContain("'check', 'zero_duplicates'");
    expect(sql).toContain("'check', 'zero_excluded'");
    expect(sql).toContain("'check', 'entries_amount'");
    expect(sql).toContain("'check', 'exits_amount'");
    expect(sql).toContain("'check', 'min_date'");
    expect(sql).toContain("'check', 'max_date'");
    expect(sql).toMatch(/reconciled = v_ok/);
  });

  it("nunca sobrescreve uma resolução manual de alias já feita por um humano", () => {
    const sql = readSql(staging);
    expect(sql).toMatch(/WHEN public\.finance_import_catalog_aliases\.resolution = 'manual'\s*\n\s*THEN public\.finance_import_catalog_aliases\.resolved_id/);
  });

  it("as funções internas de bookkeeping nunca são executáveis diretamente por clientes autenticados", () => {
    const sql = readSql(staging);
    expect(sql).toContain("REVOKE ALL ON FUNCTION public._finance_upsert_catalog_alias(uuid, text, text, uuid)\n  FROM PUBLIC, anon, authenticated;");
  });

  it("concede EXECUTE explícito a authenticated para as RPCs públicas", () => {
    const sql = readSql(staging);
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.import_finance_transactions_bulk(jsonb, uuid)\n  TO authenticated;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.finalize_finance_import_batch(uuid, integer, integer, numeric, numeric, date, date)\n  TO authenticated;");
  });

  it("está classificada em migration-manifest.json como production_management", () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "supabase", "migration-manifest.json"), "utf8"));
    expect(manifest.production_management).toContain(FILE_NAME);
    for (const key of ["staging_feature", "staging_only", "mixed_needs_split", "historical"] as const) {
      expect(manifest[key] ?? []).not.toContain(FILE_NAME);
    }
  });
});

describe("migration finance_confiadcs_reconciliation_hardening (FASE 1D-B1.1)", () => {
  const FILE_NAME = "20260812200000_finance_confiadcs_reconciliation_hardening.sql";
  const { staging, production } = pairPaths(FILE_NAME);

  it("existe, idêntica byte a byte, em staging e produção", () => {
    expect(sha256(readFileSync(production, "utf8"))).toBe(sha256(readFileSync(staging, "utf8")));
  });

  it("substitui os 3 status antigos por 5 estados finais explícitos — nunca um 'sucesso parcial' implícito", () => {
    const sql = readSql(staging);
    expect(sql).toContain(
      "CHECK (status IN ('persisted_reconciled', 'persisted_pending', 'duplicate', 'excluded_invalid', 'failed'))",
    );
    expect(sql).toMatch(/UPDATE public\.finance_import_batch_rows\s*\nSET status = 'persisted_reconciled'\s*\nWHERE status = 'persisted';/);
  });

  it("finance_import_catalog_aliases.resolution ganha 'operational' e 'historical_preserved' para distinguir de uma pendência real", () => {
    const sql = readSql(staging);
    expect(sql).toContain(
      "CHECK (resolution IN ('auto_exact', 'manual', 'pending', 'operational', 'historical_preserved'))",
    );
  });

  it("_finance_upsert_catalog_alias ganha p_operational e nunca sobrescreve uma resolução manual", () => {
    const sql = readSql(staging);
    expect(sql).toContain("DROP FUNCTION IF EXISTS public._finance_upsert_catalog_alias(uuid, text, text, uuid);");
    expect(sql).toMatch(/p_operational boolean DEFAULT false/);
    expect(sql).toMatch(/WHEN public\.finance_import_catalog_aliases\.resolution = 'manual' THEN 'manual'/);
  });

  it("reconhece 'TODAS' (congregação) como opção operacional — nunca como pendência de reconciliação", () => {
    const sql = readSql(staging);
    expect(sql).toMatch(/v_is_operational_congregation := v_congregation_raw IS NOT NULL\s*\n\s*AND public\._finance_normalize_catalog_label\(v_congregation_raw\) = 'TODAS';/);
    expect(sql).toContain("AND NOT v_is_operational_congregation AND NOT v_is_historical_preserved_congregation");
  });

  it("finance_import_catalog_aliases reconhece 'historical_preserved' para rótulos sem destino atual comprovado (DALLAGNOL, LOT RECH)", () => {
    const sql = readSql(staging);
    expect(sql).toContain("v_is_historical_preserved_district boolean;");
    expect(sql).toContain("v_is_historical_preserved_congregation boolean;");
    expect(sql).toContain("v_is_historical_preserved_account_category boolean;");
    expect(sql).toContain("public._finance_normalize_catalog_label('24 - DALLAGNOL')");
    expect(sql).toContain("public._finance_normalize_catalog_label('LOT RECH')");
  });

  it("diferencia validação de negócio (CV001/excluded_invalid) de erro inesperado (failed) — nenhum dos dois é 'engolido'", () => {
    const sql = readSql(staging);
    expect(sql).toMatch(/USING ERRCODE = 'CV001'/);
    expect(sql).toContain("WHEN SQLSTATE 'CV001' THEN");
    expect(sql).toContain("WHEN OTHERS THEN");
    expect(sql).toContain("v_excluded_invalid := v_excluded_invalid + 1;");
    expect(sql).toContain("v_failed := v_failed + 1;");
  });

  it("linha persistida com pendência de catálogo nunca conta como reconciliada", () => {
    const sql = readSql(staging);
    expect(sql).toMatch(/IF jsonb_array_length\(v_pending_fields\) > 0 THEN\s*\n\s*v_row_status := 'persisted_pending';/);
    expect(sql).toContain("v_row_status := 'persisted_reconciled';");
  });

  it("finalize_finance_import_batch passa a receber só o batch_id — nunca aceita valores esperados do chamador", () => {
    const sql = readSql(staging);
    expect(sql).toContain(
      "DROP FUNCTION IF EXISTS public.finalize_finance_import_batch(uuid, integer, integer, numeric, numeric, date, date);",
    );
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.finalize_finance_import_batch\(\s*p_batch_id uuid\s*\)/);
  });

  it("embute os 8 números do contrato oficial da planilha como CONSTANT — nunca recebidos como parâmetro", () => {
    const sql = readSql(staging);
    expect(sql).toMatch(/v_expected_persisted_reconciled CONSTANT integer := 29957;/);
    expect(sql).toMatch(/v_expected_distinct_legacy\s+CONSTANT integer := 29957;/);
    expect(sql).toMatch(/v_expected_entries_count\s+CONSTANT integer := 14908;/);
    expect(sql).toMatch(/v_expected_exits_count\s+CONSTANT integer := 15049;/);
    expect(sql).toMatch(/v_expected_entries_amount\s+CONSTANT numeric := 10655451\.68;/);
    expect(sql).toMatch(/v_expected_exits_amount\s+CONSTANT numeric := 23962542\.86;/);
    expect(sql).toMatch(/v_expected_min_date\s+CONSTANT date\s+:= '2024-11-01';/);
    expect(sql).toMatch(/v_expected_max_date\s+CONSTANT date\s+:= '2026-08-11';/);
  });

  it("todos os valores comparados são recalculados a partir de dados persistidos — nunca aceitos do chamador", () => {
    const sql = readSql(staging);
    expect(sql).toContain("FROM public.finance_import_batch_rows");
    expect(sql).toContain("FROM public.transactions");
    expect(sql).toMatch(/COUNT\(\*\) FILTER \(WHERE status = 'persisted_reconciled'\)/);
    expect(sql).toMatch(/COUNT\(DISTINCT legacy_record_number\)/);
  });

  it("agrega todos os lotes source_type='confiadcs' da mesma organização (não apenas o lote informado)", () => {
    const sql = readSql(staging);
    expect(sql).toMatch(/WHERE organization_id = v_org AND source_type = 'confiadcs'/);
    expect(sql).toContain("import_batch_id = ANY(v_batch_ids)");
  });

  it("verifica as 12 condições do contrato de reconciliação — reconciled só é true quando TODAS batem", () => {
    const sql = readSql(staging);
    for (const check of [
      "rows_read_equals_processed",
      "persisted_reconciled",
      "zero_persisted_pending",
      "zero_duplicate",
      "zero_excluded_invalid",
      "zero_failed",
      "distinct_legacy_records",
      "entries_count",
      "exits_count",
      "entries_amount",
      "exits_amount",
      "min_date",
      "max_date",
    ]) {
      expect(sql, `check ausente: ${check}`).toContain(`'check', '${check}'`);
    }
    expect(sql).toMatch(/status = CASE WHEN v_ok THEN 'done' ELSE 'error' END/);
  });

  it("é aditiva — nunca faz DROP TABLE nem apaga dados de transactions/batches", () => {
    const sql = readSql(staging).toLowerCase();
    expect(sql).not.toMatch(/\bdrop\s+table\b/);
    expect(sql).not.toMatch(/\btruncate\b/);
    expect(sql).not.toMatch(/delete\s+from\s+public\.(transactions|finance_import_batch)/);
  });

  it("está classificada em migration-manifest.json como production_management", () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "supabase", "migration-manifest.json"), "utf8"));
    expect(manifest.production_management).toContain(FILE_NAME);
    for (const key of ["staging_feature", "staging_only", "mixed_needs_split", "historical"] as const) {
      expect(manifest[key] ?? []).not.toContain(FILE_NAME);
    }
  });
});

describe("migration finance_confiadcs_catalog_seed (FASE 1D-B1.1 — catálogos oficiais)", () => {
  const FILE_NAME = "20260812210000_finance_confiadcs_catalog_seed.sql";
  const { staging, production } = pairPaths(FILE_NAME);

  it("existe, idêntica byte a byte, em staging e produção", () => {
    expect(sha256(readFileSync(production, "utf8"))).toBe(sha256(readFileSync(staging, "utf8")));
  });

  it("exige preflight das 5 tabelas de catálogo antes de inserir qualquer linha", () => {
    const sql = readSql(staging);
    for (const table of [
      "finance_accounting_groups",
      "finance_document_types",
      "finance_accounts",
      "finance_account_categories",
      "finance_periods",
    ]) {
      expect(sql).toContain(`to_regclass('public.${table}')`);
    }
  });

  it("insere exatamente 22 grupos contábeis oficiais, globais (organization_id NULL)", () => {
    const sql = readSql(staging);
    expect(sql).toContain("INSERT INTO public.finance_accounting_groups (organization_id, code, name, type)");
    expect(sql).toContain("SELECT NULL::uuid, code, name, type");
    expect(sql).toMatch(/v_matched <> 22 THEN/);
    for (const groupName of ["0 - PRESTADORES DE SERVIÇOS", "20 - RECEITAS", "71 - DEPCOM"]) {
      expect(sql).toContain(groupName);
    }
  });

  it("insere exatamente 24 tipos de documento oficiais, globais (organization_id NULL)", () => {
    const sql = readSql(staging);
    expect(sql).toContain("INSERT INTO public.finance_document_types (organization_id, code, name)");
    expect(sql).toMatch(/v_matched <> 24 THEN/);
    for (const docType of ["DUPLICATA MERCANTIL", "SEM DOCUMENTO", "PIX"]) {
      expect(sql).toContain(docType);
    }
  });

  it("exige a matriz AD Caxias existir antes de popular portadores/contas/períodos — identificação por slug, nunca por nome textual, nunca inventa organização", () => {
    const sql = readSql(staging);
    expect(sql).toMatch(
      /WHERE slug = 'matriz-caxias-do-sul' AND organization_type = 'matriz';/,
    );
    expect(sql).toContain("RAISE EXCEPTION '1D-B1.2: matriz de slug ''matriz-caxias-do-sul'' não encontrada");
    // Nunca mais usar o nome textual para escolher a matriz (causou a
    // seleção da matriz legada errada em STAGING — ver comentário na SEÇÃO 3).
    expect(sql).not.toMatch(/WHERE name = 'Assembleia de Deus em Caxias do Sul' AND organization_type = 'matriz'/);
  });

  it("aceita setores históricos adicionais além dos 23 oficiais — exige PELO MENOS 23, nunca exatamente 23", () => {
    const sql = readSql(staging);
    expect(sql).toContain("IF v_setor_count < 23 THEN");
    expect(sql).not.toContain("IF v_setor_count <> 23 THEN");
  });

  it("valida os 23 setores oficiais pelos slugs REAIS existentes em STAGING ('setor-NN-...'), nunca pelos slugs inexistentes ('distrito-NN-...')", () => {
    const sql = readSql(staging);
    const officialSlugs = [
      "setor-01-matriz",
      "setor-02-santa-fe",
      "setor-03-sao-caetano",
      "setor-04-fatima",
      "setor-05-pioneiro",
      "setor-06-vila-mary",
      "setor-07-desvio-rizzo",
      "setor-08-forqueta",
      "setor-09-cruzeiro",
      "setor-10-diamantino",
      "setor-11-centenario",
      "setor-12-serrano",
      "setor-13-vila-lobos",
      "setor-14-parada-cristal",
      "setor-15-reolon",
      "setor-16-kaiser",
      "setor-17-charqueadas",
      "setor-18-seculo-xx-sao-ciro",
      "setor-19-vila-cristina",
      "setor-20-altos-de-galopolis",
      "setor-21-fazenda-souza",
      "setor-22-santa-lucia-piai",
      "setor-23-criuva",
    ];
    expect(officialSlugs).toHaveLength(23);
    for (const slug of officialSlugs) {
      expect(sql).toContain(`'${slug}'`);
    }
    // O padrão antigo 'distrito-NN-...' não existe no ambiente real e não
    // pode voltar a ser usado como slug de validação (só é citado no
    // comentário explicativo da correção, nunca dentro da lista IN (...)).
    const inClauseMatch = sql.match(/AND s\.slug IN \(([\s\S]*?)\)/);
    expect(inClauseMatch).not.toBeNull();
    expect(inClauseMatch![1]).not.toMatch(/distrito-/);
  });

  it("insere exatamente 20 portadores oficiais para a matriz, classificados em caixa/banco", () => {
    const sql = readSql(staging);
    expect(sql).toContain("INSERT INTO public.finance_accounts (organization_id, name, type)");
    expect(sql).toMatch(/v_matched <> 20 THEN/);
    expect(sql).toContain('"name":"CONGREGAÇÕES","type":"caixa"');
    expect(sql).toContain('"name":"CT SICREDI 99253-6","type":"banco"');
  });

  it("insere exatamente 147 contas contábeis oficiais para a matriz, com name verbatim da planilha", () => {
    const sql = readSql(staging);
    expect(sql).toContain("INSERT INTO public.finance_account_categories (organization_id, code, name, type)");
    expect(sql).toMatch(/v_matched <> 147 THEN/);
    expect(sql).toContain('"code":"1100","name":"1100 SERVIÇOS"');
    expect(sql).toContain('"code":"20100","name":"20100 DÍZIMOS","type":"receita"');
  });

  it("insere exatamente 23 períodos oficiais para a matriz", () => {
    const sql = readSql(staging);
    expect(sql).toContain("INSERT INTO public.finance_periods (organization_id, label)");
    expect(sql).toMatch(/v_matched <> 23 THEN/);
    expect(sql).toContain('{"label":"NOV/24"}');
    expect(sql).toContain('{"label":"AGO/26"}');
  });

  it("nunca conta defaults genéricos pré-existentes (outras migrations) como parte do catálogo CONFIADCS", () => {
    const sql = readSql(staging);
    expect(sql).not.toMatch(/IF \(SELECT count\(\*\) FROM public\.finance_/);
    const joinMatches = sql.match(/JOIN public\.finance_\w+ \w+\s*\n\s*ON/g) ?? [];
    expect(joinMatches.length).toBeGreaterThanOrEqual(5);
  });

  it("todo INSERT usa ON CONFLICT DO NOTHING — idempotente, nunca duplica em reaplicações", () => {
    const sql = readSql(staging);
    const inserts = sql.match(/^\s*INSERT INTO public\.finance_\w+/gm) ?? [];
    const onConflicts = sql.match(/ON CONFLICT \([^)]+\) DO NOTHING;/g) ?? [];
    expect(inserts.length).toBeGreaterThanOrEqual(5);
    expect(onConflicts.length).toBeGreaterThanOrEqual(5);
  });

  it("não cria nem altera setores/congregações — apenas lê a matriz já existente pela árvore organizations", () => {
    const sql = readSql(staging).toLowerCase();
    expect(sql).not.toMatch(/insert\s+into\s+public\.organizations/);
    expect(sql).not.toMatch(/\bdrop\s+table\b/);
    expect(sql).not.toMatch(/\btruncate\b/);
  });

  it("está classificada em migration-manifest.json como production_management", () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "supabase", "migration-manifest.json"), "utf8"));
    expect(manifest.production_management).toContain(FILE_NAME);
    for (const key of ["staging_feature", "staging_only", "mixed_needs_split", "historical"] as const) {
      expect(manifest[key] ?? []).not.toContain(FILE_NAME);
    }
  });
});

describe("migration-manifest.json — escopo desta fase restrito ao financeiro CONFIADCS (FASE 1D-B1.1, item 5)", () => {
  it("não inclui a correção da lacuna de Membros (member_discipline_period_and_qr) — fora do escopo desta fase", () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "supabase", "migration-manifest.json"), "utf8"));
    const allEntries = ([] as string[]).concat(
      ...(["historical", "production_management", "staging_feature", "staging_only", "mixed_needs_split"] as const).map(
        (key) => manifest[key] ?? [],
      ),
    );
    expect(allEntries).not.toContain("20260812050000_member_discipline_period_and_qr.sql");
  });

  it("inclui as 4 migrations financeiras CONFIADCS desta fase (1D-B1 + 1D-B1.1) em production_management", () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "supabase", "migration-manifest.json"), "utf8"));
    for (const fileName of [
      "20260812180000_finance_confiadcs_reconciliation_schema.sql",
      "20260812190000_finance_confiadcs_reconciliation_rpc.sql",
      "20260812200000_finance_confiadcs_reconciliation_hardening.sql",
      "20260812210000_finance_confiadcs_catalog_seed.sql",
    ]) {
      expect(manifest.production_management).toContain(fileName);
    }
  });
});
