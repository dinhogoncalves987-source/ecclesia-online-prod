import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mapConfiadcsRows, OPERATIONAL_ALL_CONGREGATIONS, type AuxLookup } from "./financeConfiadcsMapper";
import {
  RAW_DISTRICTS,
  RAW_CONGREGATIONS,
  RAW_PORTADORES,
  RAW_ACCOUNTING_GROUPS,
  RAW_ACCOUNT_CATEGORIES,
  RAW_DOCUMENT_TYPES,
  RAW_PERIODS,
} from "./confiadcsRawCatalogUsage";

/**
 * financeConfiadcsCoverage.test.ts
 * FASE B1.2 — "CORREÇÃO FINAL DIRETA: COBERTURA ZERO PENDÊNCIAS".
 *
 * Este teste NÃO usa nenhum dado inventado: lê as listas oficiais
 * codificadas nas próprias migrations (estrutura AD Caxias — 23 setores/60
 * congregações —, o seed de catálogos financeiros CONFIADCS e os 11 tipos
 * documentais legados) e roda o importador REAL (mapConfiadcsRows) contra
 * os 330 valores distintos (RAW_*) efetivamente usados nos 29.957
 * lançamentos válidos da planilha oficial (ver confiadcsRawCatalogUsage.ts),
 * medindo exatamente quais ficam pendentes.
 *
 * Resultado final, após a decisão humana registrada na FASE B1.2 "CORREÇÃO
 * FINAL DIRETA" (aliases comprovados pela planilha + resolução
 * historical_preserved para o que genuinamente não tem destino atual):
 *   - district_pending:          0  ("24 - DALLAGNOL" → historical_preserved)
 *   - congregation_pending:      0  (MONTE CARMELO→16-Kaiser, CHARQUEADAS→
 *                                 17-Charqueadas, CHÁCARA→01-Sede resolvidos
 *                                 por setor; DALLAGNOL e LOT RECH →
 *                                 historical_preserved)
 *   - financial_account_pending: 0
 *   - accounting_group_pending:  0
 *   - account_category_pending:  0  (1138→1128 e 20100→20101 resolvidos por
 *                                 alias; 15107/REEMBOLSO/3500 TAXAS →
 *                                 historical_preserved)
 *   - document_type_pending:     0  (12 códigos históricos cadastrados como
 *                                 tipos legados inativos — code=name, sem
 *                                 descrição inventada; COMp casa com COMP
 *                                 por comparação case-insensitive)
 *   - period_pending:            0
 *
 * historical_preserved NUNCA é uma pendência: o raw label é preservado
 * integralmente, nenhum ID é inventado, e a linha conta como reconciliada —
 * exatamente como "TODAS" já era tratado para congregação operacional.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..", "..");

function readSql(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

/** Extrai o array JSON de um bloco dollar-quoted `$tag$[...]$tag$` da migration. */
function extractJsonbArray(sql: string, tag: string): any[] {
  const re = new RegExp(`\\$${tag}\\$(\\[[\\s\\S]*?\\])\\$${tag}\\$`);
  const m = sql.match(re);
  if (!m) throw new Error(`bloco $${tag}$ não encontrado na migration — teste não pode ler a lista oficial`);
  return JSON.parse(m[1]);
}

// ── Lê a estrutura REAL de organizations (23 setores + 60 congregações) ──────
// Fonte única: a migration de estrutura AD Caxias (não existe cópia
// mirrorada em supabase/migrations — só em supabase-production/, que é a
// única localização onde este bloco está codificado hoje).
const orgsSql = readSql(
  path.join(ROOT, "supabase-production", "supabase", "migrations", "20260806143000_importacao_ad_caxias_estrutura.sql"),
);
const officialOrgs = extractJsonbArray(orgsSql, "orgs") as {
  external_key: string;
  name: string;
  organization_type: string;
}[];

const OFFICIAL_DISTRICTS: AuxLookup["districts"] = officialOrgs
  .filter(o => o.organization_type === "setor")
  .map(o => ({ id: o.external_key, name: o.name }));
const OFFICIAL_CONGREGATIONS: AuxLookup["congregations"] = officialOrgs
  .filter(o => o.organization_type === "congregacao")
  .map(o => ({ id: o.external_key, name: o.name }));

// ── Lê os catálogos financeiros REAIS do seed determinístico ─────────────────
const seedSql = readSql(
  path.join(ROOT, "supabase", "migrations", "20260812210000_finance_confiadcs_catalog_seed.sql"),
);
const officialGroups = extractJsonbArray(seedSql, "groups") as { code: string; name: string }[];
const officialDocTypes = extractJsonbArray(seedSql, "doctypes") as { code: string; name: string }[];
const officialLegacyDocTypes = extractJsonbArray(seedSql, "legacydoctypes") as { code: string; name: string }[];
const officialPortadores = extractJsonbArray(seedSql, "portadores") as { name: string }[];
const officialAccounts = extractJsonbArray(seedSql, "contas") as { code: string; name: string }[];
const officialPeriods = extractJsonbArray(seedSql, "periods") as { label: string }[];

const OFFICIAL_ACCOUNTING_GROUPS: AuxLookup["accountingGroups"] = officialGroups.map((g, i) => ({
  id: `grp-${i}`,
  name: g.name,
  code: g.code,
}));
// Catálogo oficial (24, aba PARÂMETROS) + 11 tipos legados inativos
// (códigos usados nos lançamentos mas ausentes da lista oficial) — a RPC
// aceita qualquer finance_document_types com organization_id NULL,
// independentemente de is_active; o importador resolve por nome/código
// igual para ambos os grupos.
const OFFICIAL_DOCUMENT_TYPES: AuxLookup["documentTypes"] = [...officialDocTypes, ...officialLegacyDocTypes].map(
  (d, i) => ({ id: `doc-${i}`, name: d.name, code: d.code }),
);
const OFFICIAL_FINANCIAL_ACCOUNTS: AuxLookup["financialAccounts"] = officialPortadores.map((p, i) => ({
  id: `acc-${i}`,
  name: p.name,
}));
const OFFICIAL_ACCOUNT_CATEGORIES: AuxLookup["accountCategories"] = officialAccounts.map((c, i) => ({
  id: `cat-${i}`,
  name: c.name,
  code: c.code,
}));
const OFFICIAL_PERIOD_LABELS = new Set(officialPeriods.map(p => p.label));

describe("preflight — listas oficiais lidas das migrations têm os tamanhos esperados", () => {
  it("23 setores + 60 congregações (estrutura AD Caxias)", () => {
    expect(OFFICIAL_DISTRICTS).toHaveLength(23);
    expect(OFFICIAL_CONGREGATIONS).toHaveLength(60);
  });
  it("22 grupos + 24 tipos doc oficiais + 11 legados + 20 portadores + 147 contas + 23 períodos (seed CONFIADCS)", () => {
    expect(OFFICIAL_ACCOUNTING_GROUPS).toHaveLength(22);
    expect(officialDocTypes).toHaveLength(24);
    expect(officialLegacyDocTypes).toHaveLength(11);
    expect(OFFICIAL_DOCUMENT_TYPES).toHaveLength(35);
    expect(OFFICIAL_FINANCIAL_ACCOUNTS).toHaveLength(20);
    expect(OFFICIAL_ACCOUNT_CATEGORIES).toHaveLength(147);
    expect(OFFICIAL_PERIOD_LABELS.size).toBe(23);
  });
  it("os 11 tipos legados são inativos e usam code=name (nenhuma descrição inventada)", () => {
    for (const d of officialLegacyDocTypes) {
      expect(d.name).toBe(d.code);
    }
    expect(new Set(officialLegacyDocTypes.map(d => d.code))).toEqual(
      new Set(["DSI", "DDA", "DUP", "RPA", "COMP", "OUT", "RES", "DCT", "CT", "CD", "DEP"]),
    );
  });
});

// ── Baseline: valores válidos e já resolvidos, usados para isolar o campo
// sob teste em cada linha sintética (nenhum outro campo deve gerar
// pendência, senão o teste estaria medindo o campo errado). ────────────────
const HEADER = [
  "DISTRITO - ORIGEM 1",
  "CONGREGAÇÃO - ORIGEM 2",
  "PORTADOR ORIGEM",
  "GRUPO CONTÁBIL",
  "CONTA CONTÁBIL",
  "TIPO DOC",
  "VALOR",
  "ENT/SAÍ",
  "DATA CONTÁBIL",
];
const BASELINE = {
  district: "00 - SEDE",
  congregation: OPERATIONAL_ALL_CONGREGATIONS,
  portador: "CONGREGAÇÕES",
  group: "20 - RECEITAS",
  account: "20101 DÍZIMOS E OFERTAS",
  doctype: "RDO",
};

function buildAux(): AuxLookup {
  return {
    accountingGroups: OFFICIAL_ACCOUNTING_GROUPS,
    accountCategories: OFFICIAL_ACCOUNT_CATEGORIES,
    documentTypes: OFFICIAL_DOCUMENT_TYPES,
    financialAccounts: OFFICIAL_FINANCIAL_ACCOUNTS,
    congregations: OFFICIAL_CONGREGATIONS,
    districts: OFFICIAL_DISTRICTS,
  };
}

function row(overrides: Partial<typeof BASELINE>): string[] {
  const v = { ...BASELINE, ...overrides };
  return [v.district, v.congregation, v.portador, v.group, v.account, v.doctype, "100,00", "E", "01/11/2024"];
}

type CatalogField = "district" | "congregation" | "financial_account" | "accounting_group" | "account_category" | "document_type";

/**
 * Roda o importador real variando SÓ o campo `field` com cada valor distinto
 * de `entries` (mantendo os demais campos no baseline válido) e devolve o
 * conjunto de [rawValue, rowCount] cujo `field` ficou pendente.
 */
function measurePending(
  field: CatalogField,
  entries: ReadonlyArray<readonly [string, number]>,
  overrideKey: keyof typeof BASELINE,
): { pendingRows: number; pendingValues: [string, number][] } {
  const rows = entries.map(([raw]) => row({ [overrideKey]: raw } as Partial<typeof BASELINE>));
  const { valid, invalid } = mapConfiadcsRows(HEADER, rows, buildAux());
  expect(invalid).toHaveLength(0);
  expect(valid).toHaveLength(entries.length);

  const pendingRawValues = new Set<string>();
  for (const tx of valid) {
    for (const p of tx.pending_reconciliations) {
      if (p.field === field) pendingRawValues.add(p.rawValue);
    }
  }
  let pendingRows = 0;
  const pendingValues: [string, number][] = [];
  for (const [raw, count] of entries) {
    if (pendingRawValues.has(raw)) {
      pendingRows += count;
      pendingValues.push([raw, count]);
    }
  }
  return { pendingRows, pendingValues };
}

describe("cobertura determinística — district_pending", () => {
  it("todos os 53 valores históricos de distrito resolvem — zero pendências", () => {
    const { pendingRows, pendingValues } = measurePending("district", RAW_DISTRICTS, "district");
    expect(pendingValues).toEqual([]);
    expect(pendingRows).toBe(0);
  });

  it("'24 - DALLAGNOL' resolve como historical_preserved (raw preservado, ID null, NUNCA pendência)", () => {
    const rows = [row({ district: "24 - DALLAGNOL" })];
    const { valid } = mapConfiadcsRows(HEADER, rows, buildAux());
    expect(valid[0].district_id).toBeNull();
    expect(valid[0].district_raw_label).toBe("24 - DALLAGNOL");
    expect(valid[0].pending_reconciliations.find(p => p.field === "district")).toBeUndefined();
  });
});

describe("cobertura determinística — congregation_pending ('TODAS' é operacional, nunca pendência)", () => {
  it("todos os 67 valores históricos de congregação resolvem — zero pendências", () => {
    const entriesExcludingTodas = RAW_CONGREGATIONS.filter(([raw]) => raw !== OPERATIONAL_ALL_CONGREGATIONS);
    const { pendingRows, pendingValues } = measurePending("congregation", entriesExcludingTodas, "congregation");
    expect(pendingValues).toEqual([]);
    expect(pendingRows).toBe(0);
  });

  it("'TODAS' nunca é reportada como pendência de congregação", () => {
    const rows = [row({ congregation: OPERATIONAL_ALL_CONGREGATIONS })];
    const { valid } = mapConfiadcsRows(HEADER, rows, buildAux());
    expect(valid[0].pending_reconciliations.find(p => p.field === "congregation")).toBeUndefined();
    expect(valid[0].congregation_id).toBeNull();
  });

  it("CHÁCARA, MONTE CARMELO e CHARQUEADAS resolvem no nível de setor atual (auto_exact, ID real)", () => {
    const expected: Record<string, string> = {
      "CHÁCARA": "Matriz",
      "MONTE CARMELO": "Kaiser",
      "CHARQUEADAS": "Charqueadas",
    };
    for (const [raw, districtShortName] of Object.entries(expected)) {
      const rows = [row({ congregation: raw })];
      const { valid } = mapConfiadcsRows(HEADER, rows, buildAux());
      const expectedDistrict = OFFICIAL_DISTRICTS.find(d =>
        d.name.toLowerCase().endsWith(districtShortName.toLowerCase()),
      );
      expect(expectedDistrict).toBeDefined();
      expect(valid[0].congregation_id).toBe(expectedDistrict!.id);
      expect(valid[0].congregation_raw_label).toBe(raw);
      expect(valid[0].pending_reconciliations.find(p => p.field === "congregation")).toBeUndefined();
    }
  });

  it("DALLAGNOL e LOT RECH resolvem como historical_preserved (raw preservado, ID null, NUNCA pendência)", () => {
    for (const raw of ["DALLAGNOL", "LOT RECH"]) {
      const rows = [row({ congregation: raw })];
      const { valid } = mapConfiadcsRows(HEADER, rows, buildAux());
      expect(valid[0].congregation_id).toBeNull();
      expect(valid[0].congregation_raw_label).toBe(raw);
      expect(valid[0].pending_reconciliations.find(p => p.field === "congregation")).toBeUndefined();
    }
  });
});

describe("cobertura determinística — financial_account_pending", () => {
  it("todos os 14 portadores efetivamente usados resolvem (0 pendências)", () => {
    const { pendingRows, pendingValues } = measurePending("financial_account", RAW_PORTADORES, "portador");
    expect(pendingValues).toEqual([]);
    expect(pendingRows).toBe(0);
  });
});

describe("cobertura determinística — accounting_group_pending", () => {
  it("todos os 22 grupos contábeis resolvem (0 pendências)", () => {
    const { pendingRows, pendingValues } = measurePending("accounting_group", RAW_ACCOUNTING_GROUPS, "group");
    expect(pendingValues).toEqual([]);
    expect(pendingRows).toBe(0);
  });
});

describe("cobertura determinística — account_category_pending", () => {
  it("todas as 140 contas usadas resolvem — zero pendências", () => {
    const { pendingRows, pendingValues } = measurePending("account_category", RAW_ACCOUNT_CATEGORIES, "account");
    expect(pendingValues).toEqual([]);
    expect(pendingRows).toBe(0);
  });

  it("'1138 SERVIÇOS DE GUINCHOS' e '20100 DÍZIMOS E OFERTAS' resolvem por alias (ID real, raw preservado)", () => {
    const cases: [string, string][] = [
      ["1138 SERVIÇOS DE GUINCHOS", "1128 SERVIÇOS DE GUINCHOS"],
      ["20100 DÍZIMOS E OFERTAS", "20101 DÍZIMOS E OFERTAS"],
    ];
    for (const [raw, officialName] of cases) {
      const rows = [row({ account: raw })];
      const { valid } = mapConfiadcsRows(HEADER, rows, buildAux());
      const expectedAccount = OFFICIAL_ACCOUNT_CATEGORIES.find(a => a.name === officialName);
      expect(expectedAccount).toBeDefined();
      expect(valid[0].account_category_id).toBe(expectedAccount!.id);
      expect(valid[0].account_category_raw_label).toBe(raw);
    }
  });

  it("'15107 MATERIAL PARA EVANGELISMO E MISSÕES', 'REEMBOLSO' e '3500 TAXAS DE REGULARIZAÇÕES' são historical_preserved", () => {
    for (const raw of [
      "15107 MATERIAL PARA EVANGELISMO E MISSÕES",
      "REEMBOLSO",
      "3500 TAXAS DE REGULARIZAÇÕES",
    ]) {
      const rows = [row({ account: raw })];
      const { valid } = mapConfiadcsRows(HEADER, rows, buildAux());
      expect(valid[0].account_category_id).toBeNull();
      expect(valid[0].account_category_raw_label).toBe(raw);
      expect(valid[0].pending_reconciliations.find(p => p.field === "account_category")).toBeUndefined();
    }
  });
});

describe("cobertura determinística — document_type_pending", () => {
  it("todas as 34 variações históricas de TIPO DOC resolvem — zero pendências", () => {
    const { pendingRows, pendingValues } = measurePending("document_type", RAW_DOCUMENT_TYPES, "doctype");
    expect(pendingValues).toEqual([]);
    expect(pendingRows).toBe(0);
  });

  it("'COMp' resolve para o tipo legado 'COMP' (case-insensitive), preservando 'COMp' no raw", () => {
    const rows = [row({ doctype: "COMp" })];
    const { valid } = mapConfiadcsRows(HEADER, rows, buildAux());
    const expectedType = OFFICIAL_DOCUMENT_TYPES.find(d => d.name === "COMP");
    expect(expectedType).toBeDefined();
    expect(valid[0].document_type_id).toBe(expectedType!.id);
    expect(valid[0].document_type_raw_label).toBe("COMp");
  });

  it("os 11 códigos legados (DSI, DDA, DUP, RPA, COMP, OUT, RES, DCT, CT, CD, DEP) resolvem com ID real", () => {
    for (const code of ["DSI", "DDA", "DUP", "RPA", "COMP", "OUT", "RES", "DCT", "CT", "CD", "DEP"]) {
      const rows = [row({ doctype: code })];
      const { valid } = mapConfiadcsRows(HEADER, rows, buildAux());
      expect(valid[0].document_type_id).not.toBeNull();
      expect(valid[0].pending_reconciliations.find(p => p.field === "document_type")).toBeUndefined();
    }
  });
});

describe("cobertura determinística — period_pending", () => {
  // PERIODO não é FK resolvida pelo mapper (é armazenado como texto livre,
  // period_label) — por isso não existe "pending_reconciliations" para
  // período no importador. A cobertura aqui é uma correspondência textual
  // direta contra os 23 períodos oficiais semeados pela própria migration.
  it("todos os 23 períodos realmente usados batem exatamente com os 23 períodos oficiais (0 pendências)", () => {
    const pending = RAW_PERIODS.filter(([label]) => !OFFICIAL_PERIOD_LABELS.has(label));
    expect(pending).toEqual([]);
  });
});

describe("resumo agregado de cobertura — zero pendências, 29.957 reconciliadas", () => {
  it("nenhum dos 330 valores distintos (7 catálogos) gera pendência — persisted_pending esperado = 0", () => {
    const allPendingCounts: Record<string, number> = {
      district: measurePending("district", RAW_DISTRICTS, "district").pendingRows,
      congregation: measurePending(
        "congregation",
        RAW_CONGREGATIONS.filter(([raw]) => raw !== OPERATIONAL_ALL_CONGREGATIONS),
        "congregation",
      ).pendingRows,
      financial_account: measurePending("financial_account", RAW_PORTADORES, "portador").pendingRows,
      accounting_group: measurePending("accounting_group", RAW_ACCOUNTING_GROUPS, "group").pendingRows,
      account_category: measurePending("account_category", RAW_ACCOUNT_CATEGORIES, "account").pendingRows,
      document_type: measurePending("document_type", RAW_DOCUMENT_TYPES, "doctype").pendingRows,
    };
    for (const [field, pendingRows] of Object.entries(allPendingCounts)) {
      expect(pendingRows, `${field}_pending deveria ser 0`).toBe(0);
    }

    // period_pending: correspondência textual direta (não é FK do mapper).
    const periodPending = RAW_PERIODS.filter(([label]) => !OFFICIAL_PERIOD_LABELS.has(label)).length;
    expect(periodPending, "period_pending deveria ser 0").toBe(0);

    // Como a resolução de cada campo depende SOMENTE do próprio raw label
    // (função pura, nunca de outro campo da mesma linha), zero pendência em
    // TODO valor distinto de TODO catálogo, para as 7 dimensões acima,
    // implica que NENHUMA das 29.957 linhas reais da planilha pode conter
    // um campo pendente — logo persisted_pending = 0 e
    // persisted_reconciled = 29.957 (total de lançamentos válidos já
    // comprovado pelos testes de reconciliação de lote/linha existentes).
    const totalRows = RAW_DISTRICTS.reduce((s, [, c]) => s + c, 0);
    expect(totalRows).toBe(29957);
  });
});
