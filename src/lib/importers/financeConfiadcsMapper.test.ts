import { describe, expect, it } from "vitest";
import { mapConfiadcsRows, parseAmount } from "./financeConfiadcsMapper";

describe("mapeamento de planilha financeira", () => {
  it("interpreta valores brasileiros e internacionais sem multiplicar por cem", () => {
    expect(parseAmount("R$ 1.234,56")).toBe(1234.56);
    expect(parseAmount("1234.56")).toBe(1234.56);
    expect(parseAmount("1,234.56")).toBe(1234.56);
    expect(parseAmount("1.234")).toBe(1234);
  });

  it("preserva os campos contábeis reconhecidos", () => {
    const result = mapConfiadcsRows(
      ["DATA CONTÁBIL", "VALOR", "ENT/SAI", "N DO DOCUMENTO", "GRUPO CONTÁBIL", "CONGREGAÇÃO"],
      [["29/07/2026", "1234.56", "E", "RC-1", "Receitas", "Central"]],
      {
        accountingGroups: [{ id: "grupo-1", name: "Receitas" }],
        accountCategories: [],
        documentTypes: [],
        financialAccounts: [],
        congregations: [{ id: "cong-1", name: "Central" }],
        districts: [],
      },
    );

    expect(result.invalid).toHaveLength(0);
    expect(result.valid[0]).toMatchObject({
      amount: 1234.56,
      document_number: "RC-1",
      accounting_group_id: "grupo-1",
      congregation_id: "cong-1",
      origin: "spreadsheet",
    });
  });
});
