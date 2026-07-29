import type {
  FinanceAccount,
  FinanceAccountingGroup,
  FinanceCostCenter,
  FinanceDocumentType,
  TreasuryTransaction,
} from "./finance";

type OrganizationOption = { id: string; name: string };

const protectSpreadsheetFormula = (value: string) =>
  /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;

const csvCell = (value: unknown) => {
  const text = protectSpreadsheetFormula(value == null ? "" : String(value));
  return `"${text.replace(/"/g, '""')}"`;
};

export function buildFinanceCsv(
  transactions: TreasuryTransaction[],
  lookups: {
    costCenters: FinanceCostCenter[];
    financialAccounts: FinanceAccount[];
    accountingGroups: FinanceAccountingGroup[];
    documentTypes: FinanceDocumentType[];
    organizations: OrganizationOption[];
  },
): string {
  const headers = [
    "Data contábil",
    "Data de emissão",
    "Registro nº",
    "Período",
    "Descrição",
    "Tipo",
    "Grupo contábil",
    "Conta contábil",
    "Centro de custo",
    "Conta financeira",
    "Tipo de documento",
    "Número do documento",
    "Fornecedor/beneficiário",
    "CPF/CNPJ fornecedor",
    "Contribuinte",
    "CPF/CNPJ contribuinte",
    "Distrito",
    "Congregação",
    "Coletor",
    "Tesoureiro",
    "Forma de pagamento",
    "Valor",
    "Status",
    "Origem",
    "Comprovante",
    "Observações",
  ];

  const byId = <T extends { id?: string; name: string }>(items: T[], id?: string | null) =>
    items.find(item => item.id === id)?.name ?? "";

  const rows = transactions.map(tx => [
    tx.accounting_date || tx.date,
    tx.issue_date || tx.date,
    tx.legacy_record_number,
    tx.period_label,
    tx.description,
    tx.type,
    byId(lookups.accountingGroups, tx.accounting_group_id),
    tx.category,
    byId(lookups.costCenters, tx.cost_center_id),
    byId(lookups.financialAccounts, tx.financial_account_id),
    byId(lookups.documentTypes, tx.document_type_id),
    tx.document_number,
    tx.supplier_beneficiary_name,
    tx.supplier_beneficiary_document,
    tx.contributor_name,
    tx.contributor_document,
    byId(lookups.organizations, tx.district_id),
    byId(lookups.organizations, tx.congregation_id),
    tx.collector_name,
    tx.treasurer_name,
    tx.payment_method,
    tx.amount,
    tx.status,
    tx.origin,
    tx.receipt_url,
    tx.notes,
  ]);

  return [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
}
