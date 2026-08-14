import { describe, expect, it } from "vitest";
import {
  mapConfiadcsRows,
  parseAmount,
  parseDateToISO,
  parseTimestampToISO,
  type AuxLookup,
} from "./financeConfiadcsMapper";

const HEADER_21_CAMPOS = [
  "REGISTRO",
  "Carimbo de data/hora",
  "DISTRITO - ORIGEM 1",
  "DATA EMISSÃO",
  "CONGREGAÇÃO - ORIGEM 2",
  "Nº DO DOCUMENTO",
  "VALOR",
  "ENT/SAÍ",
  "COLETOR",
  "TESOUREIRO LOCAL",
  "OBSERVAÇÃO",
  "PORTADOR ORIGEM",
  "PERIODO",
  "GRUPO CONTÁBIL",
  "CONTA CONTÁBIL",
  "TIPO DOC",
  "BENEFICIÁRIO",
  "CNPJ/CPF",
  "CONTRIBUINTE",
  "CPF",
  "DATA CONTÁBIL",
];

const EMPTY_AUX: AuxLookup = {
  accountingGroups: [],
  accountCategories: [],
  documentTypes: [],
  financialAccounts: [],
  congregations: [],
  districts: [],
};

// Catálogo dos 23 setores atuais (extraído da planilha oficial CONFIADCS1-2-26,
// aba PARÂMETROS, colunas NÚM/NOME/DESCRIÇÃO) — usado para validar a
// reconciliação de distrito sem inventar correspondência.
const DISTRICTS_23: AuxLookup["districts"] = [
  { id: "d01", name: "01 - SEDE" },
  { id: "d02", name: "02 - SANTA FÉ" },
  { id: "d03", name: "03 - SÃO CAETANO" },
  { id: "d16", name: "16 - KAYSER" },
  { id: "d17", name: "17 - CHARQUEADAS" },
  { id: "d21", name: "21 - FAZENDA SOUZA" },
];

describe("parseAmount — valores brasileiros e internacionais", () => {
  it("interpreta valores sem multiplicar por cem", () => {
    expect(parseAmount("R$ 1.234,56")).toBe(1234.56);
    expect(parseAmount("1234.56")).toBe(1234.56);
    expect(parseAmount("1,234.56")).toBe(1234.56);
    expect(parseAmount("1.234")).toBe(1234);
    expect(parseAmount("356,19")).toBe(356.19);
    expect(parseAmount("950,00")).toBe(950);
    expect(parseAmount("1309.37")).toBe(1309.37);
  });
});

describe("parseDateToISO — datas brasileiras, ISO e serial do Excel", () => {
  it("interpreta dd/mm/aaaa sem inverter dia e mês", () => {
    expect(parseDateToISO("12/06/2026")).toBe("2026-06-12");
    expect(parseDateToISO("01/11/2024")).toBe("2024-11-01");
  });

  it("interpreta ISO aaaa-mm-dd (produzido pelo spreadsheetReader)", () => {
    expect(parseDateToISO("2026-06-12")).toBe("2026-06-12");
    expect(parseDateToISO("2026-06-12 14:05:00")).toBe("2026-06-12");
  });

  it("interpreta número serial do Excel", () => {
    // 45820 = 12/06/2025 no calendário serial do Excel (base 1899-12-30)
    expect(parseDateToISO(45820)).toBe("2025-06-12");
  });
});

describe("parseTimestampToISO — carimbo completo (data + hora), nunca truncado", () => {
  it("preserva hora de string 'AAAA-MM-DD HH:mm:ss'", () => {
    expect(parseTimestampToISO("2024-12-02 12:43:39")).toBe("2024-12-02T12:43:39");
  });

  it("preserva hora de string brasileira com hora", () => {
    expect(parseTimestampToISO("02/12/2024 09:05:00")).toBe("2024-12-02T09:05:00");
  });

  it("assume meia-noite quando não há hora identificável", () => {
    expect(parseTimestampToISO("02/12/2024")).toBe("2024-12-02T00:00:00");
  });

  it("preserva hora de número serial do Excel com fração de dia", () => {
    // 45820 = 12/06/2025 (parte inteira); 0.5 = 12:00:00
    const result = parseTimestampToISO(45820.5);
    expect(result).toBe("2025-06-12T12:00:00");
  });
});

describe("mapConfiadcsRows — cobertura dos 21 campos da aba Base de Dados", () => {
  it("mapeia os 21 campos para destino estruturado usando o cabeçalho NOVO 'DISTRITO - ORIGEM 1'", () => {
    const row = [
      "87733",                          // REGISTRO
      "2024-12-02 12:43:39",            // Carimbo de data/hora
      "02 - SANTA FÉ",                  // DISTRITO - ORIGEM 1
      "01/12/2024",                     // DATA EMISSÃO
      "MATRIZ",                         // CONGREGAÇÃO - ORIGEM 2
      "87733",                          // Nº DO DOCUMENTO
      "782,75",                         // VALOR
      "E",                              // ENT/SAÍ
      "João Coletor",                   // COLETOR
      "Maria Tesoureira",               // TESOUREIRO LOCAL
      "Dízimo mensal",                  // OBSERVAÇÃO
      "CAIXA MATRIZ",                   // PORTADOR ORIGEM
      "DEZ/24",                         // PERIODO
      "0 - PRESTADORES DE SERVIÇOS",    // GRUPO CONTÁBIL
      "1100 SERVIÇOS",                  // CONTA CONTÁBIL
      "RC",                             // TIPO DOC
      "Fulano Beneficiário",            // BENEFICIÁRIO
      "000.000.000-00",                 // CNPJ/CPF
      "Ciclano Contribuinte",           // CONTRIBUINTE
      "111.111.111-11",                 // CPF
      "02/12/2024",                     // DATA CONTÁBIL
    ];

    const aux: AuxLookup = {
      accountingGroups: [{ id: "grp-1", name: "0 - PRESTADORES DE SERVIÇOS" }],
      accountCategories: [{ id: "cat-1", name: "1100 SERVIÇOS" }],
      documentTypes: [{ id: "doc-1", name: "RC" }],
      financialAccounts: [{ id: "acc-1", name: "CAIXA MATRIZ" }],
      congregations: [{ id: "cong-1", name: "MATRIZ" }],
      districts: DISTRICTS_23,
    };

    const { valid, invalid } = mapConfiadcsRows(HEADER_21_CAMPOS, [row], aux);

    expect(invalid).toHaveLength(0);
    expect(valid).toHaveLength(1);
    const tx = valid[0];

    // 1 REGISTRO, 21 DATA CONTÁBIL
    expect(tx.legacy_record_number).toBe("87733");
    expect(tx.date).toBe("2024-12-02");
    // 2 Carimbo de data/hora — completo, com hora
    expect(tx.raw_timestamp).toBe("2024-12-02T12:43:39");
    // 3 DISTRITO — raw preservado + FK resolvida
    expect(tx.district_raw_label).toBe("02 - SANTA FÉ");
    expect(tx.district_id).toBe("d02");
    // 4 DATA EMISSÃO
    expect(tx.issue_date).toBe("2024-12-01");
    // 5 CONGREGAÇÃO — raw preservado + FK resolvida
    expect(tx.congregation_raw_label).toBe("MATRIZ");
    expect(tx.congregation_id).toBe("cong-1");
    // 6 Nº DO DOCUMENTO
    expect(tx.document_number).toBe("87733");
    // 7 VALOR (sem multiplicar por 100)
    expect(tx.amount).toBe(782.75);
    // 8 ENT/SAÍ
    expect(tx.type).toBe("Entrada");
    // 9 COLETOR
    expect(tx.collector_name).toBe("João Coletor");
    // 10 TESOUREIRO LOCAL
    expect(tx.treasurer_name).toBe("Maria Tesoureira");
    // 11 OBSERVAÇÃO — isolada, nunca concatenada com outros campos
    expect(tx.source_observation).toBe("Dízimo mensal");
    expect(tx.notes).toBe("Dízimo mensal");
    // 12 PORTADOR ORIGEM — raw preservado + FK resolvida
    expect(tx.financial_account_raw_label).toBe("CAIXA MATRIZ");
    expect(tx.financial_account_id).toBe("acc-1");
    // 13 PERIODO
    expect(tx.period_label).toBe("DEZ/24");
    // 14 GRUPO CONTÁBIL — raw preservado + FK resolvida
    expect(tx.accounting_group_raw_label).toBe("0 - PRESTADORES DE SERVIÇOS");
    expect(tx.accounting_group_id).toBe("grp-1");
    // 15 CONTA CONTÁBIL — raw preservado + FK resolvida
    expect(tx.account_category_raw_label).toBe("1100 SERVIÇOS");
    expect(tx.account_category_id).toBe("cat-1");
    // 16 TIPO DOC — raw preservado + FK resolvida
    expect(tx.document_type_raw_label).toBe("RC");
    expect(tx.document_type_id).toBe("doc-1");
    // 17/18 BENEFICIÁRIO + CNPJ/CPF
    expect(tx.supplier_beneficiary_name).toBe("Fulano Beneficiário");
    expect(tx.supplier_beneficiary_document).toBe("000.000.000-00");
    // 19/20 CONTRIBUINTE + CPF
    expect(tx.contributor_name).toBe("Ciclano Contribuinte");
    expect(tx.contributor_document).toBe("111.111.111-11");

    // Tudo resolvido: nenhuma pendência de reconciliação
    expect(tx.pending_reconciliations).toHaveLength(0);
    expect(tx.import_source_row_number).toBeGreaterThan(0);
  });

  it("também funciona com o cabeçalho ANTIGO 'SETOR/DISTRITO - ORIGEM 1' (sem regressão da planilha 1D-A)", () => {
    const header = HEADER_21_CAMPOS.map(h =>
      h === "DISTRITO - ORIGEM 1" ? "SETOR/DISTRITO - ORIGEM 1" : h,
    );
    const row = Array(21).fill("");
    row[0] = "1"; row[2] = "01 - SEDE"; row[6] = "100"; row[7] = "E"; row[20] = "01/11/2024";

    const { valid } = mapConfiadcsRows(header, [row], { ...EMPTY_AUX, districts: DISTRICTS_23 });
    expect(valid).toHaveLength(1);
    expect(valid[0].district_id).toBe("d01");
  });
});

describe("mapConfiadcsRows — reconciliação de distrito (53 nomes históricos → 23 setores atuais)", () => {
  it("resolve automaticamente quando o NOME (ignorando o prefixo numérico) bate exatamente com um setor atual", () => {
    // Achado real na planilha: número mudou (16 → 21) mas o nome por extenso
    // é idêntico ao setor "21 - FAZENDA SOUZA" — correspondência determinística
    // por igualdade de texto, não por adivinhação de número.
    const row = Array(21).fill("");
    row[2] = "16 - FAZENDA SOUZA"; row[6] = "100"; row[7] = "S"; row[20] = "01/11/2024";

    const { valid } = mapConfiadcsRows(HEADER_21_CAMPOS, [row], { ...EMPTY_AUX, districts: DISTRICTS_23 });
    expect(valid[0].district_id).toBe("d21");
    expect(valid[0].district_raw_label).toBe("16 - FAZENDA SOUZA");
    expect(valid[0].pending_reconciliations).toHaveLength(0);
  });

  it("NUNCA inventa correspondência por abreviação — 'ST FÉ' não vira automaticamente 'SANTA FÉ'", () => {
    const row = Array(21).fill("");
    row[2] = "02 - ST FÉ"; row[6] = "100"; row[7] = "S"; row[20] = "01/11/2024";

    const { valid } = mapConfiadcsRows(HEADER_21_CAMPOS, [row], { ...EMPTY_AUX, districts: DISTRICTS_23 });
    expect(valid[0].district_id).toBeNull();
    expect(valid[0].district_raw_label).toBe("02 - ST FÉ");
    expect(valid[0].pending_reconciliations).toContainEqual({
      field: "district",
      catalogType: "district",
      rawValue: "02 - ST FÉ",
    });
  });

  it("gera pendência explícita para um rótulo genuinamente sem correspondência e sem evidência de historical_preserved", () => {
    const row = Array(21).fill("");
    row[2] = "99 - SETOR INEXISTENTE"; row[6] = "100"; row[7] = "S"; row[20] = "01/11/2024";

    const { valid } = mapConfiadcsRows(HEADER_21_CAMPOS, [row], { ...EMPTY_AUX, districts: DISTRICTS_23 });
    expect(valid[0].district_id).toBeNull();
    expect(valid[0].pending_reconciliations).toHaveLength(1);
    expect(valid[0].pending_reconciliations[0].rawValue).toBe("99 - SETOR INEXISTENTE");
  });

  it("'24 - DALLAGNOL' NUNCA é pendência — historical_preserved (decisão humana final B1.2): raw preservado, ID null", () => {
    const row = Array(21).fill("");
    row[2] = "24 - DALLAGNOL"; row[6] = "100"; row[7] = "S"; row[20] = "01/11/2024";

    const { valid } = mapConfiadcsRows(HEADER_21_CAMPOS, [row], { ...EMPTY_AUX, districts: DISTRICTS_23 });
    expect(valid[0].district_id).toBeNull();
    expect(valid[0].district_raw_label).toBe("24 - DALLAGNOL");
    expect(valid[0].pending_reconciliations).toHaveLength(0);
  });

  it("nunca resolve automaticamente uma correspondência ambígua (dois itens do catálogo com o mesmo nome normalizado)", () => {
    const ambiguousDistricts: AuxLookup["districts"] = [
      { id: "a", name: "05 - PIONEIRO" },
      { id: "b", name: "99 - PIONEIRO" }, // duplicata deliberada para o teste
    ];
    const row = Array(21).fill("");
    row[2] = "05 - PIONEIRO"; row[6] = "100"; row[7] = "E"; row[20] = "01/11/2024";

    const { valid } = mapConfiadcsRows(HEADER_21_CAMPOS, [row], { ...EMPTY_AUX, districts: ambiguousDistricts });
    expect(valid[0].district_id).toBeNull();
    expect(valid[0].pending_reconciliations).toHaveLength(1);
  });
});

describe("mapConfiadcsRows — 'TODAS' é opção operacional, nunca congregação real (FASE 1D-B1.1, item 1)", () => {
  it("congregation_id fica null para 'TODAS', mas NÃO gera pendência de reconciliação", () => {
    const row = Array(21).fill("");
    row[4] = "TODAS"; row[6] = "100"; row[7] = "E"; row[20] = "01/11/2024";

    const { valid } = mapConfiadcsRows(HEADER_21_CAMPOS, [row], EMPTY_AUX);
    expect(valid[0].congregation_id).toBeNull();
    // O texto original é preservado (nunca descartado), só não conta como
    // relacionamento desconhecido.
    expect(valid[0].congregation_raw_label).toBe("TODAS");
    expect(valid[0].pending_reconciliations).toHaveLength(0);
  });

  it("é insensível a caixa/acento/espaço ('todas', ' Todas ') mas uma congregação real homônima nunca é confundida com a opção operacional", () => {
    const row1 = Array(21).fill("");
    row1[4] = " todas "; row1[6] = "100"; row1[7] = "E"; row1[20] = "01/11/2024";
    const { valid: v1 } = mapConfiadcsRows(HEADER_21_CAMPOS, [row1], EMPTY_AUX);
    expect(v1[0].congregation_id).toBeNull();
    expect(v1[0].pending_reconciliations).toHaveLength(0);

    const row2 = Array(21).fill("");
    row2[4] = "MATRIZ"; row2[6] = "100"; row2[7] = "E"; row2[20] = "01/11/2024";
    const aux: AuxLookup = { ...EMPTY_AUX, congregations: [{ id: "cong-1", name: "MATRIZ" }] };
    const { valid: v2 } = mapConfiadcsRows(HEADER_21_CAMPOS, [row2], aux);
    expect(v2[0].congregation_id).toBe("cong-1");
  });

  it("congregação desconhecida (não é 'TODAS' e não bate com o catálogo) continua gerando pendência normalmente", () => {
    const row = Array(21).fill("");
    row[4] = "CONGREGAÇÃO INEXISTENTE"; row[6] = "100"; row[7] = "E"; row[20] = "01/11/2024";

    const { valid } = mapConfiadcsRows(HEADER_21_CAMPOS, [row], EMPTY_AUX);
    expect(valid[0].congregation_id).toBeNull();
    expect(valid[0].pending_reconciliations).toContainEqual({
      field: "congregation",
      catalogType: "congregation",
      rawValue: "CONGREGAÇÃO INEXISTENTE",
    });
  });
});

describe("mapConfiadcsRows — rejeições explícitas (nunca sucesso parcial silencioso)", () => {
  it("rejeita linha com data inválida, preservando o motivo", () => {
    const row = Array(21).fill("");
    row[6] = "100"; row[7] = "E"; row[20] = "31/13/2024"; // mês 13 inválido

    const { valid, invalid } = mapConfiadcsRows(HEADER_21_CAMPOS, [row], EMPTY_AUX);
    expect(valid).toHaveLength(0);
    expect(invalid).toHaveLength(1);
    expect(invalid[0].reason).toMatch(/Data inválida/);
  });

  it("rejeita linha com valor inválido/zerado", () => {
    const row = Array(21).fill("");
    row[6] = "0"; row[7] = "E"; row[20] = "01/11/2024";

    const { valid, invalid } = mapConfiadcsRows(HEADER_21_CAMPOS, [row], EMPTY_AUX);
    expect(valid).toHaveLength(0);
    expect(invalid[0].reason).toMatch(/Valor inválido/);
  });

  it("rejeita linha com ENT/SAÍ vazio ou desconhecido — nunca assume um lado por padrão", () => {
    const row = Array(21).fill("");
    row[6] = "100"; row[7] = ""; row[20] = "01/11/2024";

    const { valid, invalid } = mapConfiadcsRows(HEADER_21_CAMPOS, [row], EMPTY_AUX);
    expect(valid).toHaveLength(0);
    expect(invalid[0].reason).toMatch(/Tipo inválido/);
  });
});

describe("mapConfiadcsRows — reconciliação completa de um lote (lidas = processadas = persistidas)", () => {
  it("contabiliza exatamente: lidas = válidas + inválidas, e soma de valores por tipo bate com a origem", () => {
    const rows = [
      ["", "", "", "", "", "", "782,75", "E", "", "", "", "", "", "", "", "", "", "", "", "", "01/11/2024"],
      ["", "", "", "", "", "", "607,00", "S", "", "", "", "", "", "", "", "", "", "", "", "", "02/11/2024"],
      ["", "", "", "", "", "", "97,25", "E", "", "", "", "", "", "", "", "", "", "", "", "", "03/11/2024"],
      // linha inválida deliberada — tipo ausente
      ["", "", "", "", "", "", "50,00", "", "", "", "", "", "", "", "", "", "", "", "", "", "04/11/2024"],
    ];

    const { valid, invalid } = mapConfiadcsRows(HEADER_21_CAMPOS, rows, EMPTY_AUX);

    // lidas (rows.length) = processadas (valid+invalid) — nenhuma linha some
    expect(valid.length + invalid.length).toBe(rows.length);
    expect(valid).toHaveLength(3);
    expect(invalid).toHaveLength(1);

    const entradas = valid.filter(t => t.type === "Entrada").reduce((s, t) => s + t.amount, 0);
    const saidas = valid.filter(t => t.type === "Saida").reduce((s, t) => s + t.amount, 0);
    expect(entradas).toBeCloseTo(782.75 + 97.25, 2);
    expect(saidas).toBeCloseTo(607, 2);
  });
});
