import { describe, expect, it } from "vitest";
import { buildFinanceTransactionRowView, type FinanceTransactionViewLookups } from "./financeTransactionView";
import type { TreasuryTransaction } from "./finance";

function makeTx(overrides: Partial<TreasuryTransaction> = {}): TreasuryTransaction {
  return {
    id: "tx-1",
    date: "2026-03-05",
    description: "Dizimo culto domingo",
    type: "Entrada",
    amount: 150,
    status: "Confirmado",
    category: "Dizimos",
    user_id: "user-1",
    ...overrides,
  };
}

const lookups: FinanceTransactionViewLookups = {
  financialAccounts: [{ id: "fa-1", name: "Banco Sicredi" }],
  districts: [{ id: "d-1", name: "05 - Pioneiro" }],
  congregations: [{ id: "c-1", name: "Congregação Matriz" }],
  documentTypes: [{ id: "dt-1", name: "Recibo", code: "REC" }],
  accountingGroups: [{ id: "ag-1", name: "Dizimos", code: "R01" }],
};

describe("buildFinanceTransactionRowView — 8 grupos principais, campos históricos como secundários (itens 4/5/6)", () => {
  it("DATA: principal = data contábil; secundário = emissão, carimbo e período", () => {
    const view = buildFinanceTransactionRowView(
      makeTx({
        date: "2026-03-05",
        accounting_date: "2026-03-05",
        issue_date: "2026-03-01",
        raw_timestamp: "2026-03-01T14:30:00",
        period_label: "MAR/26",
      }),
      lookups,
    );
    expect(view.date.primary).toBe("2026-03-05");
    expect(view.date.secondary).toEqual([
      { key: "issue_date", label: "Data de emissão", value: "2026-03-01" },
      { key: "raw_timestamp", label: "Data/hora do registro", value: "2026-03-01 14:30:00" },
      { key: "period_label", label: "Período", value: "MAR/26" },
    ]);
  });

  it("DATA: não duplica emissão quando é igual à data contábil", () => {
    const view = buildFinanceTransactionRowView(
      makeTx({ date: "2026-03-05", accounting_date: "2026-03-05", issue_date: "2026-03-05" }),
      lookups,
    );
    expect(view.date.secondary.find(s => s.key === "issue_date")).toBeUndefined();
  });

  it("DESCRIÇÃO: principal = descrição; secundário = CPF/CNPJ, contribuinte, documento, observação, registro legado", () => {
    const view = buildFinanceTransactionRowView(
      makeTx({
        description: "João da Silva — Doc. 123",
        supplier_beneficiary_document: "123.456.789-00",
        contributor_name: "Maria Souza",
        contributor_document: "987.654.321-00",
        document_number: "123",
        source_observation: "Pagamento referente a manutenção",
        legacy_record_number: "45210",
      }),
      lookups,
    );
    expect(view.description.primary).toBe("João da Silva — Doc. 123");
    expect(view.description.secondary).toEqual([
      { key: "supplier_document", label: "CPF/CNPJ do favorecido", value: "123.456.789-00" },
      { key: "contributor_name", label: "Contribuinte", value: "Maria Souza" },
      { key: "contributor_document", label: "CPF do contribuinte", value: "987.654.321-00" },
      { key: "document_number", label: "Número do documento", value: "123" },
      { key: "observation", label: "Observação", value: "Pagamento referente a manutenção" },
      { key: "legacy_record_number", label: "Registro legado", value: "45210" },
    ]);
  });

  it("CATEGORIA: principal = conta contábil; secundário = grupo contábil resolvido", () => {
    const view = buildFinanceTransactionRowView(makeTx({ category: "Dizimos", accounting_group_id: "ag-1" }), lookups);
    expect(view.category.primary).toBe("Dizimos");
    expect(view.category.secondary).toEqual([
      { key: "accounting_group", label: "Grupo contábil", value: "R01 - Dizimos" },
    ]);
  });

  it("CATEGORIA: quando accounting_group_id é nulo, cai para o rótulo histórico bruto marcado como tal", () => {
    const view = buildFinanceTransactionRowView(
      makeTx({ accounting_group_id: null, accounting_group_raw_label: "20 - RECEITAS" }),
      lookups,
    );
    expect(view.category.secondary).toEqual([
      { key: "accounting_group", label: "Grupo contábil", value: "20 - RECEITAS (histórico)" },
    ]);
  });

  it("CONTA: principal = portador financeiro; secundário = distrito e congregação resolvidos", () => {
    const view = buildFinanceTransactionRowView(
      makeTx({ financial_account_id: "fa-1", district_id: "d-1", congregation_id: "c-1" }),
      lookups,
    );
    expect(view.account.primary).toBe("Banco Sicredi");
    expect(view.account.secondary).toEqual([
      { key: "district", label: "Distrito de origem", value: "05 - Pioneiro" },
      { key: "congregation", label: "Congregação de origem", value: "Congregação Matriz" },
    ]);
  });

  it("CONTA: historical_preserved — FK nula mas raw_label preservado nunca é descartado nem some em notes", () => {
    const view = buildFinanceTransactionRowView(
      makeTx({
        district_id: null,
        district_raw_label: "24 - DALLAGNOL",
        congregation_id: null,
        congregation_raw_label: "DALLAGNOL",
        has_pending_reconciliation: false,
      }),
      lookups,
    );
    expect(view.account.secondary).toEqual([
      { key: "district", label: "Distrito de origem", value: "24 - DALLAGNOL (histórico)" },
      { key: "congregation", label: "Congregação de origem", value: "DALLAGNOL (histórico)" },
    ]);
    // A linha NÃO está marcada como pendência — historical_preserved conta
    // como reconciliado (item 7 dos testes obrigatórios).
    expect(view.status.secondary.find(s => s.key === "pending")).toBeUndefined();
  });

  it("TIPO: principal = Entrada/Saída; secundário = tipo de documento resolvido", () => {
    const view = buildFinanceTransactionRowView(makeTx({ type: "Saida", document_type_id: "dt-1" }), lookups);
    expect(view.type.isExpense).toBe(true);
    expect(view.type.label).toBe("Saída");
    expect(view.type.secondary).toEqual([
      { key: "document_type", label: "Tipo de documento", value: "REC - Recibo" },
    ]);
  });

  it("STATUS: has_pending_reconciliation=true expõe a pendência explicitamente (nunca escondida)", () => {
    const view = buildFinanceTransactionRowView(
      makeTx({ status: "Confirmado", has_pending_reconciliation: true }),
      lookups,
    );
    expect(view.status.operational).toBe("Confirmado");
    expect(view.status.secondary).toEqual([
      { key: "pending", label: "Pendência de reconciliação", value: "Sim — aguardando decisão de catálogo" },
    ]);
  });

  it("STATUS: sem pendência e sem lote de importação, não exibe nenhuma linha de reconciliação (lançamento manual)", () => {
    const view = buildFinanceTransactionRowView(makeTx({ has_pending_reconciliation: false, import_batch_id: null }), lookups);
    expect(view.status.secondary).toEqual([]);
  });

  it("STATUS: reconciliado (importado, sem pendência) mostra o estado da reconciliação", () => {
    const view = buildFinanceTransactionRowView(
      makeTx({ has_pending_reconciliation: false, import_batch_id: "batch-1" }),
      lookups,
    );
    expect(view.status.secondary).toEqual([
      { key: "reconciled", label: "Estado da reconciliação", value: "Reconciliado" },
    ]);
  });

  it("VALOR nunca aparece duplicado no view model — cada grupo expõe seu próprio campo, sem repetir amount", () => {
    const view = buildFinanceTransactionRowView(makeTx(), lookups);
    const serialized = JSON.stringify(view);
    expect(serialized).not.toMatch(/"amount"/);
  });

  it("funciona sem lookups (fallback para EMPTY_LOOKUPS) sem lançar erro", () => {
    expect(() => buildFinanceTransactionRowView(makeTx())).not.toThrow();
  });
});
