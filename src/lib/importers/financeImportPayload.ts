import type { MappedTransaction } from "./financeConfiadcsMapper";
import type {
  FinanceAccount,
  FinanceAccountCategory,
  FinanceAccountingGroup,
  FinanceCostCenter,
  FinanceDocumentType,
} from "../finance";

export function buildFinanceImportPayload(
  tx: MappedTransaction,
  organizationId: string,
  userId: string,
): Record<string, unknown> {
  return {
    organization_id: organizationId,
    user_id: userId,
    created_by: userId,
    date: tx.date,
    accounting_date: tx.date,
    issue_date: tx.issue_date ?? tx.date,
    amount: tx.amount,
    type: tx.type,
    category: tx.category,
    description: tx.description,
    status: tx.status,
    source_module: "spreadsheet_import",
    origin: "spreadsheet",
    notes: tx.notes ?? null,
    account_category_id: tx.account_category_id ?? null,
    financial_account_id: tx.financial_account_id ?? null,
    accounting_group_id: tx.accounting_group_id ?? null,
    document_type_id: tx.document_type_id ?? null,
    document_number: tx.document_number ?? null,
    congregation_id: tx.congregation_id ?? null,
    district_id: tx.district_id ?? null,
    supplier_beneficiary_name: tx.supplier_beneficiary_name ?? null,
    supplier_beneficiary_document: tx.supplier_beneficiary_document ?? null,
    contributor_name: tx.contributor_name ?? null,
    contributor_document: tx.contributor_document ?? null,
    collector_name: tx.collector_name ?? null,
    treasurer_name: tx.treasurer_name ?? null,
    period_label: tx.period_label ?? null,
    legacy_record_number: tx.legacy_record_number ?? null,
    // FASE 1D-B1 — carimbo completo, rótulos "raw" para todo campo com FK, e
    // observação isolada (nunca mais concatenada com fallbacks em notes).
    // A RPC usa os "*_raw_label" para alimentar o catálogo de aliases e
    // reconciliação; nenhum deles é opcional/perdido na conversão.
    raw_timestamp: tx.raw_timestamp ?? null,
    district_raw_label: tx.district_raw_label ?? null,
    congregation_raw_label: tx.congregation_raw_label ?? null,
    financial_account_raw_label: tx.financial_account_raw_label ?? null,
    accounting_group_raw_label: tx.accounting_group_raw_label ?? null,
    account_category_raw_label: tx.account_category_raw_label ?? null,
    document_type_raw_label: tx.document_type_raw_label ?? null,
    source_observation: tx.source_observation ?? null,
  };
}

type OrganizationLookup = { id: string; name: string };

export type GenericFinanceImportLookups = {
  accountCategories: FinanceAccountCategory[];
  costCenters: FinanceCostCenter[];
  financialAccounts: FinanceAccount[];
  accountingGroups: FinanceAccountingGroup[];
  documentTypes: FinanceDocumentType[];
  organizations: OrganizationLookup[];
};

const normalize = (value: string) =>
  value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const nullable = (value?: string) => value?.trim() || null;

function resolveLookupId<T extends { id?: string; name: string; code?: string | null }>(
  value: string | undefined,
  items: T[],
): string | null {
  if (!value?.trim()) return null;
  const wanted = normalize(value);
  return items.find(item =>
    item.id === value
    || normalize(item.name) === wanted
    || (item.code ? normalize(item.code) === wanted : false)
    || (item.code ? normalize(`${item.code} - ${item.name}`) === wanted : false)
  )?.id ?? null;
}

/**
 * Converte linhas dos importadores genéricos em payload completo. IDs só são
 * aceitos quando existem nos lookups já limitados à organização selecionada.
 */
export function buildGenericFinanceImportPayload(
  row: Record<string, string>,
  organizationId: string,
  lookups: GenericFinanceImportLookups,
): Record<string, unknown> | null {
  const description = row.description?.trim();
  const amount = Number.parseFloat(
    (row.amount ?? "")
      .replace(/[^\d,.-]/g, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", "."),
  ) || 0;
  const date = row.date?.trim();
  if (!description || amount <= 0 || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  const type = row.type?.toLowerCase().includes("sai") ? "Saida" : "Entrada";
  const categoryType = type === "Entrada" ? "receita" : "despesa";
  const categoryRef = lookups.accountCategories.find(item =>
    resolveLookupId(row.category, [item]) === item.id,
  ) ?? lookups.accountCategories.find(item => item.type === categoryType);
  const category = categoryRef?.name || row.category?.trim()
    || (type === "Entrada" ? "Receita" : "Despesa");

  return {
    organization_id: organizationId,
    date,
    accounting_date: date,
    issue_date: nullable(row.issue_date) ?? date,
    amount,
    type,
    category,
    description,
    status: "Confirmado",
    source_module: "spreadsheet_import",
    origin: "spreadsheet",
    notes: nullable(row.notes),
    payment_method: nullable(row.payment_method),
    receipt_url: nullable(row.receipt_url),
    account_category_id: categoryRef?.id ?? null,
    cost_center_id: resolveLookupId(row.cost_center, lookups.costCenters)
      ?? lookups.costCenters[0]?.id
      ?? null,
    financial_account_id: resolveLookupId(row.financial_account, lookups.financialAccounts)
      ?? lookups.financialAccounts[0]?.id
      ?? null,
    accounting_group_id: resolveLookupId(row.accounting_group, lookups.accountingGroups),
    document_type_id: resolveLookupId(row.document_type, lookups.documentTypes),
    document_number: nullable(row.document_number),
    congregation_id: resolveLookupId(row.congregation, lookups.organizations),
    district_id: resolveLookupId(row.district, lookups.organizations),
    supplier_beneficiary_name: nullable(row.supplier_beneficiary_name),
    supplier_beneficiary_document: nullable(row.supplier_beneficiary_document),
    contributor_name: nullable(row.contributor_name),
    contributor_document: nullable(row.contributor_document),
    collector_name: nullable(row.collector_name),
    treasurer_name: nullable(row.treasurer_name),
    period_label: nullable(row.period_label),
    legacy_record_number: nullable(row.legacy_record_number),
  };
}
