// ─────────────────────────────────────────────────────────────────────────────
// financeTransactionView.ts — FASE 1D-C1
//
// Constrói o "view model" de uma transação financeira para exibição em
// TABELA (desktop) e CARTÕES (mobile), garantindo que os dois usem exatamente
// a mesma fonte de verdade e a mesma hierarquia visual: 8 colunas/grupos
// principais (Data, Descrição, Categoria, Conta, Tipo, Valor, Status, Ações),
// cada um com os campos históricos da planilha CONFIADCS exibidos como
// informação SECUNDÁRIA abaixo do campo principal — nunca como coluna
// própria, nunca escondidos.
//
// Função pura (sem React, sem i18n): os rótulos retornados são as chaves
// canônicas em português já usadas em todo o app com `t(label)` — a
// tradução acontece no componente, nunca aqui.
// ─────────────────────────────────────────────────────────────────────────────

import type { TreasuryTransaction } from "./finance";

export type FinanceSecondaryField = {
  key: string;
  label: string;
  value: string;
};

export type FinanceRowGroup = {
  primary: string;
  secondary: FinanceSecondaryField[];
};

export type FinanceTransactionRowView = {
  date: FinanceRowGroup;
  description: FinanceRowGroup;
  category: FinanceRowGroup;
  account: FinanceRowGroup;
  type: { isExpense: boolean; label: "Entrada" | "Saída"; secondary: FinanceSecondaryField[] };
  status: { operational: string; secondary: FinanceSecondaryField[] };
};

export type FinanceViewLookupItem = { id?: string | null; name: string; code?: string | null };

export type FinanceTransactionViewLookups = {
  financialAccounts: FinanceViewLookupItem[];
  districts: FinanceViewLookupItem[];
  congregations: FinanceViewLookupItem[];
  documentTypes: FinanceViewLookupItem[];
  accountingGroups: FinanceViewLookupItem[];
};

const EMPTY_LOOKUPS: FinanceTransactionViewLookups = {
  financialAccounts: [],
  districts: [],
  congregations: [],
  documentTypes: [],
  accountingGroups: [],
};

function findName(items: FinanceViewLookupItem[], id: string | null | undefined): string | null {
  if (!id) return null;
  return items.find(item => item.id === id)?.name ?? null;
}

function findCoded(items: FinanceViewLookupItem[], id: string | null | undefined): string | null {
  if (!id) return null;
  const item = items.find(i => i.id === id);
  if (!item) return null;
  return item.code ? `${item.code} - ${item.name}` : item.name;
}

/**
 * Um campo com FK (district_id, congregation_id, ...) é exibido:
 *   - pelo nome resolvido, quando a FK existe;
 *   - senão, pelo rótulo bruto da planilha (raw_label), sempre marcado como
 *     histórico — nunca inventamos uma correspondência aqui;
 *   - `null` quando não há FK nem rótulo bruto (campo realmente vazio).
 * Nunca lança a informação para `notes`/JSON genérico — sempre um campo
 * secundário estruturado próprio.
 */
function describeCatalogField(resolvedName: string | null, rawLabel: string | null | undefined): string | null {
  if (resolvedName) return resolvedName;
  const raw = rawLabel?.trim();
  if (!raw) return null;
  return `${raw} (histórico)`;
}

function formatIsoTimestamp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Preserva a string original (já civil, sem deslocamento de fuso — ver
  // spreadsheetReader.excelSerialToCivil) — apenas normaliza "T" -> " ".
  return raw.replace("T", " ").replace(/\.\d+(Z|[+-]\d{2}:?\d{2})?$/, "").replace(/Z$/, "");
}

export function buildFinanceTransactionRowView(
  tx: TreasuryTransaction,
  lookups: FinanceTransactionViewLookups = EMPTY_LOOKUPS,
): FinanceTransactionRowView {
  const isExpense = tx.type === "Saida" || tx.type === "Saída";

  // ── DATA — principal: data contábil; secundário: emissão, carimbo, período
  const dateSecondary: FinanceSecondaryField[] = [];
  if (tx.issue_date && tx.issue_date !== (tx.accounting_date ?? tx.date)) {
    dateSecondary.push({ key: "issue_date", label: "Data de emissão", value: tx.issue_date });
  }
  const rawTimestamp = formatIsoTimestamp(tx.raw_timestamp);
  if (rawTimestamp) {
    dateSecondary.push({ key: "raw_timestamp", label: "Data/hora do registro", value: rawTimestamp });
  }
  if (tx.period_label) {
    dateSecondary.push({ key: "period_label", label: "Período", value: tx.period_label });
  }

  // ── DESCRIÇÃO — principal: favorecido/descrição; secundário: documentos,
  // contribuinte, observação, registro legado.
  const descriptionSecondary: FinanceSecondaryField[] = [];
  if (tx.supplier_beneficiary_document) {
    descriptionSecondary.push({ key: "supplier_document", label: "CPF/CNPJ do favorecido", value: tx.supplier_beneficiary_document });
  }
  if (tx.contributor_name) {
    descriptionSecondary.push({ key: "contributor_name", label: "Contribuinte", value: tx.contributor_name });
  }
  if (tx.contributor_document) {
    descriptionSecondary.push({ key: "contributor_document", label: "CPF do contribuinte", value: tx.contributor_document });
  }
  if (tx.document_number) {
    descriptionSecondary.push({ key: "document_number", label: "Número do documento", value: tx.document_number });
  }
  if (tx.source_observation || tx.notes) {
    descriptionSecondary.push({ key: "observation", label: "Observação", value: (tx.source_observation || tx.notes) as string });
  }
  if (tx.legacy_record_number) {
    descriptionSecondary.push({ key: "legacy_record_number", label: "Registro legado", value: tx.legacy_record_number });
  }

  // ── CATEGORIA — principal: conta contábil; secundário: grupo contábil,
  // código da conta, valor histórico preservado quando aplicável.
  const categorySecondary: FinanceSecondaryField[] = [];
  const accountingGroupName = findCoded(lookups.accountingGroups, tx.accounting_group_id)
    ?? (tx.accounting_group_raw_label ? `${tx.accounting_group_raw_label} (histórico)` : null);
  if (accountingGroupName) {
    categorySecondary.push({ key: "accounting_group", label: "Grupo contábil", value: accountingGroupName });
  }
  if (tx.account_category_raw_label && tx.account_category_raw_label !== tx.category) {
    categorySecondary.push({ key: "account_category_raw_label", label: "Valor histórico preservado", value: tx.account_category_raw_label });
  }

  // ── CONTA — principal: portador/conta financeira; secundário: distrito e
  // congregação de origem, valor histórico preservado quando aplicável.
  const accountSecondary: FinanceSecondaryField[] = [];
  const districtDisplay = describeCatalogField(findName(lookups.districts, tx.district_id), tx.district_raw_label);
  if (districtDisplay) {
    accountSecondary.push({ key: "district", label: "Distrito de origem", value: districtDisplay });
  }
  const congregationDisplay = describeCatalogField(findName(lookups.congregations, tx.congregation_id), tx.congregation_raw_label);
  if (congregationDisplay) {
    accountSecondary.push({ key: "congregation", label: "Congregação de origem", value: congregationDisplay });
  }
  if (tx.financial_account_raw_label && !tx.financial_account_id) {
    accountSecondary.push({ key: "financial_account_raw_label", label: "Valor histórico preservado", value: tx.financial_account_raw_label });
  }

  const accountPrimary = findName(lookups.financialAccounts, tx.financial_account_id) || tx.payment_method || "—";

  // ── TIPO — principal: Entrada/Saída; secundário: tipo de documento.
  const typeSecondary: FinanceSecondaryField[] = [];
  const documentTypeName = findCoded(lookups.documentTypes, tx.document_type_id)
    ?? (tx.document_type_raw_label ? `${tx.document_type_raw_label} (histórico)` : null);
  if (documentTypeName) {
    typeSecondary.push({ key: "document_type", label: "Tipo de documento", value: documentTypeName });
  }

  // ── STATUS — principal: status operacional; secundário: estado da
  // reconciliação, pendência somente se realmente existir.
  const statusSecondary: FinanceSecondaryField[] = [];
  if (tx.has_pending_reconciliation) {
    statusSecondary.push({ key: "pending", label: "Pendência de reconciliação", value: "Sim — aguardando decisão de catálogo" });
  } else if (tx.import_batch_id) {
    statusSecondary.push({ key: "reconciled", label: "Estado da reconciliação", value: "Reconciliado" });
  }

  return {
    date: {
      primary: tx.accounting_date ?? tx.date,
      secondary: dateSecondary,
    },
    description: {
      primary: tx.description,
      secondary: descriptionSecondary,
    },
    category: {
      primary: tx.category ?? "—",
      secondary: categorySecondary,
    },
    account: {
      primary: accountPrimary,
      secondary: accountSecondary,
    },
    type: {
      isExpense,
      label: isExpense ? "Saída" : "Entrada",
      secondary: typeSecondary,
    },
    status: {
      operational: typeof tx.status === "string" ? tx.status : "Pendente",
      secondary: statusSecondary,
    },
  };
}
