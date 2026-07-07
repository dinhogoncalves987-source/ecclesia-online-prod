// ─────────────────────────────────────────────────────────────────────────────
// finance.ts — Tipos e constantes do módulo financeiro do Ecclesia.
//
// Mantém compatibilidade total com:
//  - transactions (tabela principal)
//  - dashboards, tesouraria, auditoria, campanhas, orçamento, prestação de contas
//
// Adicionados: tipos CONFIADCS para extensão financeira (migration 20260707100000).
// ─────────────────────────────────────────────────────────────────────────────

// ── Tipos base (preservados) ──────────────────────────────────────────────────

export type TransactionType   = "Entrada" | "Saida" | "Saída";
export type TransactionStatus = "Pendente" | "Confirmado" | "Pago";

export type FinanceAccountCategoryType = "receita" | "despesa";

export type FinanceAccountCategory = {
  id?:                  string;
  code:                 string;
  name:                 string;
  type:                 FinanceAccountCategoryType;
  is_system?:           boolean | null;
  /** Vínculo opcional com grupo contábil CONFIADCS. */
  accounting_group_id?: string | null;
};

export type FinanceCostCenter = {
  id?:       string;
  name:      string;
  type:      "matriz" | "congregacao" | "departamento" | "evento" | string;
  is_active?: boolean | null;
};

export type FinanceAccount = {
  id?:               string;
  name:              string;
  type:              "caixa" | "banco" | "pix" | "especie" | string;
  pix_key?:          string | null;
  opening_balance?:  number | null;
  current_balance?:  number | null;
  is_active?:        boolean | null;
};

// ── TreasuryTransaction — extendida com campos CONFIADCS ──────────────────────

export type TreasuryTransaction = {
  // ── Campos originais (não alterar) ─────────────────────────────────────────
  id:                     string;
  date:                   string;
  description:            string;
  type:                   TransactionType;
  amount:                 number;
  status:                 TransactionStatus | string;
  category:               string | null;
  organization_id?:       string | null;
  user_id:                string;
  account_category_id?:   string | null;
  cost_center_id?:        string | null;
  financial_account_id?:  string | null;
  responsible_id?:        string | null;
  payment_method?:        string | null;
  receipt_url?:           string | null;
  notes?:                 string | null;
  created_by?:            string | null;
  updated_by?:            string | null;
  updated_at?:            string | null;

  // ── Campos CONFIADCS — rastreamento ────────────────────────────────────────
  /** Número de registro original do CONFIADCS (campo "REG. Nº"). */
  legacy_record_number?:         string | null;
  /** Rótulo do período (ex: "JUN/26") — exibição, não cálculo. */
  period_label?:                 string | null;
  /** Data de emissão do documento (campo "DATA EMISSÃO" do CONFIADCS). */
  issue_date?:                   string | null;
  /** Data contábil (campo "DATA CONTÁBIL"). Alimenta relatórios CONFIADCS.
   *  O campo `date` continua sendo o campo principal para dashboards. */
  accounting_date?:              string | null;

  // ── Campos CONFIADCS — documento ───────────────────────────────────────────
  /** FK → finance_document_types. Tipo do documento (Recibo, NF, Pix, etc.). */
  document_type_id?:             string | null;
  /** Número do documento (NF nº, Recibo nº, etc.). */
  document_number?:              string | null;

  // ── Campos CONFIADCS — fornecedor / beneficiário ───────────────────────────
  /** Nome do fornecedor ou beneficiário (campo "FORNECEDOR/BENEFICIÁRIO"). */
  supplier_beneficiary_name?:    string | null;
  /** CPF/CNPJ do fornecedor/beneficiário. */
  supplier_beneficiary_document?: string | null;
  /** Nome do contribuinte (campo "CONTRIBUINTE"). */
  contributor_name?:             string | null;
  /** CPF/CNPJ do contribuinte. */
  contributor_document?:         string | null;

  // ── Campos CONFIADCS — classificação ──────────────────────────────────────
  /** FK → finance_accounting_groups. Campo "GRUPO CONTÁBIL" do CONFIADCS. */
  accounting_group_id?:          string | null;
  /** FK → organizations. Congregação de origem da transação. */
  congregation_id?:              string | null;
  /** FK → organizations. Setor/Distrito de origem. */
  district_id?:                  string | null;

  // ── Campos CONFIADCS — operacionais ───────────────────────────────────────
  /** Nome do coletor (campo "COLETOR"). */
  collector_name?:               string | null;
  /** Nome do tesoureiro responsável (campo "TESOUREIRO"). */
  treasurer_name?:               string | null;

  // ── Campos de origem e importação ─────────────────────────────────────────
  /** Origem do lançamento: 'manual' | 'confiadcs' | 'asaas' | 'api'. */
  origin?:                       string | null;
  /** FK → finance_import_batches. Lote de importação CONFIADCS. */
  import_batch_id?:              string | null;

  // ── Campos Asaas (preparação estrutural — sem uso ativo) ──────────────────
  asaas_payment_id?:             string | null;
  asaas_customer_id?:            string | null;
  external_reference?:           string | null;
};

export type FinanceMonthlyClosing = {
  id:              string;
  organization_id: string;
  month:           string;
  closed_at:       string;
  closed_by:       string | null;
};

// ── Tipos novos (CONFIADCS extension) ─────────────────────────────────────────

/** Tipo de documento financeiro (Recibo, NF, Cupom, Pix, etc.). */
export type FinanceDocumentType = {
  id:               string;
  organization_id:  string | null;
  code?:            string | null;
  name:             string;
  is_active:        boolean;
  created_at?:      string;
  updated_at?:      string;
};

/** Grupo contábil do CONFIADCS (campo "GRUPO CONTÁBIL"). */
export type FinanceAccountingGroup = {
  id:               string;
  organization_id:  string | null;
  code?:            string | null;
  name:             string;
  type?:            "receita" | "despesa" | null;
  is_active:        boolean;
  created_at?:      string;
  updated_at?:      string;
};

/** Lote de importação CONFIADCS/XLSM. */
export type FinanceImportBatch = {
  id:               string;
  organization_id:  string;
  source_file_name?: string | null;
  source_type:      string;
  total_rows:       number;
  imported_rows:    number;
  failed_rows:      number;
  status:           "pending" | "processing" | "done" | "error";
  created_by?:      string | null;
  created_at:       string;
  finished_at?:     string | null;
  error_report?:    Record<string, unknown> | null;
};

/** Configuração da integração Asaas por igreja.
 *  api_key_encrypted NUNCA deve ser exposta ao cliente. */
export type ChurchAsaasIntegration = {
  id:                      string;
  organization_id:         string;
  environment:             "sandbox" | "production";
  account_name?:           string | null;
  wallet_id?:              string | null;
  /** Nunca exibir no frontend. Gerenciado exclusivamente no backend. */
  api_key_encrypted?:      string | null;
  public_pix_key?:         string | null;
  is_active:               boolean;
  split_enabled:           boolean;
  platform_split_percent:  number;
  created_by?:             string | null;
  updated_by?:             string | null;
  created_at:              string;
  updated_at:              string;
};

// ── Constantes padrão (preservadas) ───────────────────────────────────────────

export const DEFAULT_ACCOUNT_CATEGORIES: FinanceAccountCategory[] = [
  { code: "1.01", name: "Dizimos",        type: "receita", is_system: true },
  { code: "1.02", name: "Ofertas",        type: "receita", is_system: true },
  { code: "1.03", name: "Campanhas",      type: "receita", is_system: true },
  { code: "1.04", name: "Missoes",        type: "receita", is_system: true },
  { code: "1.05", name: "Eventos",        type: "receita", is_system: true },
  { code: "2.01", name: "Administrativo", type: "despesa", is_system: true },
  { code: "2.02", name: "Manutencao",     type: "despesa", is_system: true },
  { code: "2.03", name: "Folha/Pastoral", type: "despesa", is_system: true },
  { code: "2.04", name: "Missoes",        type: "despesa", is_system: true },
  { code: "2.05", name: "Eventos",        type: "despesa", is_system: true },
];

export const DEFAULT_COST_CENTERS: FinanceCostCenter[] = [
  { name: "Matriz",        type: "matriz",        is_active: true },
  { name: "Congregacoes",  type: "congregacao",   is_active: true },
  { name: "Departamentos", type: "departamento",  is_active: true },
  { name: "Eventos",       type: "evento",        is_active: true },
];

export const DEFAULT_FINANCIAL_ACCOUNTS: FinanceAccount[] = [
  { name: "Caixa",   type: "caixa",   opening_balance: 0, current_balance: 0, is_active: true },
  { name: "Banco",   type: "banco",   opening_balance: 0, current_balance: 0, is_active: true },
  { name: "PIX",     type: "pix",     opening_balance: 0, current_balance: 0, is_active: true },
  { name: "Especie", type: "especie", opening_balance: 0, current_balance: 0, is_active: true },
];

/** Tipos de documento padrão para UI (espelho dos seeds globais). */
export const DEFAULT_DOCUMENT_TYPES: Pick<FinanceDocumentType, "code" | "name">[] = [
  { code: "REC", name: "Recibo"           },
  { code: "NF",  name: "Nota Fiscal"      },
  { code: "CF",  name: "Cupom Fiscal"     },
  { code: "PIX", name: "Comprovante Pix"  },
  { code: "TRF", name: "Transferencia"    },
  { code: "OUT", name: "Outro"            },
];

/** Grupos contábeis padrão para UI (espelho dos seeds globais). */
export const DEFAULT_ACCOUNTING_GROUPS: Pick<FinanceAccountingGroup, "code" | "name" | "type">[] = [
  { code: "R01", name: "Dizimos",         type: "receita" },
  { code: "R02", name: "Ofertas",         type: "receita" },
  { code: "R03", name: "Campanhas",       type: "receita" },
  { code: "R04", name: "Missoes",         type: "receita" },
  { code: "R05", name: "Eventos",         type: "receita" },
  { code: "D01", name: "Administrativo",  type: "despesa" },
  { code: "D02", name: "Manutencao",      type: "despesa" },
  { code: "D03", name: "Folha/Pastoral",  type: "despesa" },
  { code: "D04", name: "Missoes",         type: "despesa" },
  { code: "D05", name: "Eventos",         type: "despesa" },
];

export const PAYMENT_METHODS = ["PIX", "Banco", "Especie", "Cartao", "Boleto", "Outro"];

/** Origens possíveis de um lançamento financeiro. */
export const TRANSACTION_ORIGINS = [
  { value: "manual",    label: "Manual"                 },
  { value: "confiadcs", label: "Importação CONFIADCS"   },
  { value: "asaas",     label: "Asaas (automático)"     },
  { value: "api",       label: "API externa"            },
] as const;

export type TransactionOrigin = typeof TRANSACTION_ORIGINS[number]["value"];

// ── Helpers (preservados) ─────────────────────────────────────────────────────

export const normalizeTransactionType = (type: string): "Entrada" | "Saida" =>
  type === "Saída" || type === "Saida" ? "Saida" : "Entrada";

export const isExpense = (type: string) => normalizeTransactionType(type) === "Saida";

export const getTransactionMonth = (date: string) => date?.substring(0, 7);
