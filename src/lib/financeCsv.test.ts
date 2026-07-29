import { describe, expect, it } from "vitest";
import { buildFinanceCsv } from "./financeCsv";
import type { TreasuryTransaction } from "./finance";

describe("exportação financeira CSV", () => {
  it("exporta os campos contábeis completos e bloqueia fórmulas de planilha", () => {
    const tx = {
      id: "tx-1",
      user_id: "user-1",
      date: "2026-07-29",
      issue_date: "2026-07-28",
      description: "=HYPERLINK(\"https://malicioso\")",
      type: "Entrada",
      amount: 100,
      status: "Confirmado",
      category: "Dízimos",
      document_type_id: "doc-1",
      document_number: "RC-1",
      accounting_group_id: "group-1",
      congregation_id: "org-1",
      origin: "manual",
    } satisfies TreasuryTransaction;

    const csv = buildFinanceCsv([tx], {
      costCenters: [],
      financialAccounts: [],
      accountingGroups: [{ id: "group-1", organization_id: null, name: "Receitas", type: "receita", is_active: true }],
      documentTypes: [{ id: "doc-1", organization_id: null, name: "Recibo", is_active: true }],
      organizations: [{ id: "org-1", name: "Congregação Central" }],
    });

    expect(csv).toContain('"Tipo de documento"');
    expect(csv).toContain('"Recibo"');
    expect(csv).toContain('"Receitas"');
    expect(csv).toContain('"Congregação Central"');
    expect(csv).toContain('\'=HYPERLINK');
  });
});
