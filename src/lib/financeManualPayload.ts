export type ManualTransactionDraft = {
  desc: string;
  type: "Entrada" | "Saida";
  value: string;
  category: string;
  accountCategoryId: string;
  costCenterId: string;
  financialAccountId: string;
  paymentMethod: string;
  receiptUrl: string;
  notes: string;
  date: string;
  status: string;
  legacyRecordNumber: string;
  periodLabel: string;
  issueDate: string;
  documentTypeId: string;
  documentNumber: string;
  supplierBeneficiaryName: string;
  supplierBeneficiaryDocument: string;
  contributorName: string;
  contributorDocument: string;
  accountingGroupId: string;
  congregationId: string;
  districtId: string;
  collectorName: string;
  treasurerName: string;
};

export const createEmptyManualTransactionDraft = (
  defaults: Partial<ManualTransactionDraft> = {},
): ManualTransactionDraft => ({
  desc: "",
  type: "Entrada",
  value: "",
  category: "Dizimos",
  accountCategoryId: "",
  costCenterId: "",
  financialAccountId: "",
  paymentMethod: "PIX",
  receiptUrl: "",
  notes: "",
  date: new Date().toISOString().split("T")[0],
  status: "Pendente",
  legacyRecordNumber: "",
  periodLabel: "",
  issueDate: "",
  documentTypeId: "",
  documentNumber: "",
  supplierBeneficiaryName: "",
  supplierBeneficiaryDocument: "",
  contributorName: "",
  contributorDocument: "",
  accountingGroupId: "",
  congregationId: "",
  districtId: "",
  collectorName: "",
  treasurerName: "",
  ...defaults,
});

const nullable = (value: string) => value.trim() || null;

export function parseManualTransactionAmount(value: string): number {
  const normalized = value
    .trim()
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  return Number.parseFloat(normalized) || 0;
}

export function buildManualTransactionPayload(
  draft: ManualTransactionDraft,
  userId: string,
  options: { preserveOrigin?: boolean } = {},
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    description: draft.desc.trim(),
    type: draft.type,
    amount: parseManualTransactionAmount(draft.value),
    category: draft.category,
    account_category_id: nullable(draft.accountCategoryId),
    cost_center_id: nullable(draft.costCenterId),
    financial_account_id: nullable(draft.financialAccountId),
    responsible_id: userId,
    payment_method: draft.paymentMethod,
    receipt_url: nullable(draft.receiptUrl),
    notes: nullable(draft.notes),
    status: draft.status,
    date: draft.date,
    accounting_date: draft.date,
    updated_by: userId,
    legacy_record_number: nullable(draft.legacyRecordNumber),
    period_label: nullable(draft.periodLabel),
    issue_date: nullable(draft.issueDate) ?? draft.date,
    document_type_id: nullable(draft.documentTypeId),
    document_number: nullable(draft.documentNumber),
    supplier_beneficiary_name: nullable(draft.supplierBeneficiaryName),
    supplier_beneficiary_document: nullable(draft.supplierBeneficiaryDocument),
    contributor_name: nullable(draft.contributorName),
    contributor_document: nullable(draft.contributorDocument),
    accounting_group_id: nullable(draft.accountingGroupId),
    congregation_id: nullable(draft.congregationId),
    district_id: nullable(draft.districtId),
    collector_name: nullable(draft.collectorName),
    treasurer_name: nullable(draft.treasurerName),
  };

  if (!options.preserveOrigin) {
    payload.origin = "manual";
    payload.source_module = "manual";
  }

  return payload;
}
