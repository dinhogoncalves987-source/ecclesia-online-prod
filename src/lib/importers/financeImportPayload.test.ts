import { describe, expect, it } from "vitest";
import {
  buildFinanceImportPayload,
  buildGenericFinanceImportPayload,
} from "./financeImportPayload";
import type { MappedTransaction } from "./financeConfiadcsMapper";

describe("payload de importação financeira", () => {
  it("não descarta campos mapeados da planilha", () => {
    const tx: MappedTransaction = {
      date: "2026-07-29",
      issue_date: "2026-07-28",
      amount: 50,
      type: "Saida",
      category: "Despesa",
      description: "Conta de luz",
      document_number: "NF-10",
      document_type_id: "doc-1",
      accounting_group_id: "group-1",
      account_category_id: "category-1",
      financial_account_id: "account-1",
      congregation_id: "org-1",
      district_id: "org-2",
      supplier_beneficiary_name: "Companhia elétrica",
      supplier_beneficiary_document: "00000000000100",
      collector_name: "Coletor",
      treasurer_name: "Tesoureiro",
      period_label: "JUL/26",
      legacy_record_number: "99",
      raw_timestamp: "2026-07-28T14:05:00",
      district_raw_label: "02 - SANTA FÉ",
      congregation_raw_label: "MATRIZ",
      financial_account_raw_label: "CAIXA MATRIZ",
      accounting_group_raw_label: "10 - DESP. ADMINISTRATIVAS",
      account_category_raw_label: "1102 SERVIÇOS ELETRICOS E HIDRÁULICOS",
      document_type_raw_label: "CUP",
      source_observation: "Conta de luz de julho",
      pending_reconciliations: [],
      import_source_row_number: 42,
      origin: "spreadsheet",
      status: "Confirmado",
    };

    expect(buildFinanceImportPayload(tx, "church-1", "user-1")).toMatchObject({
      accounting_date: "2026-07-29",
      issue_date: "2026-07-28",
      document_number: "NF-10",
      document_type_id: "doc-1",
      accounting_group_id: "group-1",
      account_category_id: "category-1",
      financial_account_id: "account-1",
      congregation_id: "org-1",
      district_id: "org-2",
      supplier_beneficiary_name: "Companhia elétrica",
      supplier_beneficiary_document: "00000000000100",
      collector_name: "Coletor",
      treasurer_name: "Tesoureiro",
      period_label: "JUL/26",
      legacy_record_number: "99",
      origin: "spreadsheet",
      source_module: "spreadsheet_import",
      raw_timestamp: "2026-07-28T14:05:00",
      district_raw_label: "02 - SANTA FÉ",
      congregation_raw_label: "MATRIZ",
      financial_account_raw_label: "CAIXA MATRIZ",
      accounting_group_raw_label: "10 - DESP. ADMINISTRATIVAS",
      account_category_raw_label: "1102 SERVIÇOS ELETRICOS E HIDRÁULICOS",
      document_type_raw_label: "CUP",
      source_observation: "Conta de luz de julho",
    });
  });

  it("nunca perde o rótulo raw mesmo quando o campo não foi resolvido para nenhum ID (pendência)", () => {
    const tx: MappedTransaction = {
      date: "2026-07-29",
      amount: 50,
      type: "Saida",
      category: "Despesa",
      description: "Lançamento de saída",
      district_id: null,
      district_raw_label: "24 - DALLAGNOL",
      pending_reconciliations: [
        { field: "district", catalogType: "district", rawValue: "24 - DALLAGNOL" },
      ],
      import_source_row_number: 7,
      origin: "spreadsheet",
      status: "Confirmado",
    };

    const payload = buildFinanceImportPayload(tx, "church-1", "user-1");
    expect(payload.district_id).toBeNull();
    expect(payload.district_raw_label).toBe("24 - DALLAGNOL");
  });

  it("mapeia a importação genérica completa sem aceitar IDs fora dos lookups", () => {
    const payload = buildGenericFinanceImportPayload(
      {
        description: "Oferta missionária",
        amount: "1.234,56",
        type: "Entrada",
        category: "Dízimos e ofertas",
        date: "2026-07-29",
        accounting_group: "REC",
        document_type: "PIX",
        district: "Distrito Norte",
        congregation: "Congregação Esperança",
        supplier_beneficiary_document: "00.000.000/0001-00",
      },
      "org-1",
      {
        accountCategories: [
          { id: "category-1", code: "1.1", name: "Dízimos e ofertas", type: "receita" },
        ],
        costCenters: [{ id: "center-1", name: "Matriz", type: "matriz" }],
        financialAccounts: [{ id: "account-1", name: "Caixa", type: "caixa" }],
        accountingGroups: [
          { id: "group-1", organization_id: null, code: "REC", name: "Receitas", type: "receita", is_active: true },
        ],
        documentTypes: [
          { id: "document-1", organization_id: null, code: "PIX", name: "PIX", is_active: true },
        ],
        organizations: [
          { id: "district-1", name: "Distrito Norte" },
          { id: "congregation-1", name: "Congregação Esperança" },
        ],
      },
    );

    expect(payload).toMatchObject({
      organization_id: "org-1",
      amount: 1234.56,
      account_category_id: "category-1",
      accounting_group_id: "group-1",
      document_type_id: "document-1",
      district_id: "district-1",
      congregation_id: "congregation-1",
      origin: "spreadsheet",
      source_module: "spreadsheet_import",
    });
  });

  it("recusa linha genérica sem data contábil válida", () => {
    expect(buildGenericFinanceImportPayload(
      { description: "Teste", amount: "100", type: "Entrada", date: "29/07/2026" },
      "org-1",
      {
        accountCategories: [],
        costCenters: [],
        financialAccounts: [],
        accountingGroups: [],
        documentTypes: [],
        organizations: [],
      },
    )).toBeNull();
  });
});
