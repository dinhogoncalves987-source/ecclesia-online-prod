export type TransactionType = "Entrada" | "Saida" | "Saída";
export type TransactionStatus = "Pendente" | "Confirmado" | "Pago";

export type FinanceAccountCategoryType = "receita" | "despesa";

export type FinanceAccountCategory = {
  id?: string;
  code: string;
  name: string;
  type: FinanceAccountCategoryType;
  is_system?: boolean | null;
};

export type FinanceCostCenter = {
  id?: string;
  name: string;
  type: "matriz" | "congregacao" | "departamento" | "evento" | string;
  is_active?: boolean | null;
};

export type FinanceAccount = {
  id?: string;
  name: string;
  type: "caixa" | "banco" | "pix" | "especie" | string;
  pix_key?: string | null;
  opening_balance?: number | null;
  current_balance?: number | null;
  is_active?: boolean | null;
};

export type TreasuryTransaction = {
  id: string;
  date: string;
  description: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus | string;
  category: string | null;
  organization_id?: string | null;
  user_id: string;
  account_category_id?: string | null;
  cost_center_id?: string | null;
  financial_account_id?: string | null;
  responsible_id?: string | null;
  payment_method?: string | null;
  receipt_url?: string | null;
  notes?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
};

export type FinanceMonthlyClosing = {
  id: string;
  organization_id: string;
  month: string;
  closed_at: string;
  closed_by: string | null;
};

export const DEFAULT_ACCOUNT_CATEGORIES: FinanceAccountCategory[] = [
  { code: "1.01", name: "Dizimos", type: "receita", is_system: true },
  { code: "1.02", name: "Ofertas", type: "receita", is_system: true },
  { code: "1.03", name: "Campanhas", type: "receita", is_system: true },
  { code: "1.04", name: "Missoes", type: "receita", is_system: true },
  { code: "1.05", name: "Eventos", type: "receita", is_system: true },
  { code: "2.01", name: "Administrativo", type: "despesa", is_system: true },
  { code: "2.02", name: "Manutencao", type: "despesa", is_system: true },
  { code: "2.03", name: "Folha/Pastoral", type: "despesa", is_system: true },
  { code: "2.04", name: "Missoes", type: "despesa", is_system: true },
  { code: "2.05", name: "Eventos", type: "despesa", is_system: true },
];

export const DEFAULT_COST_CENTERS: FinanceCostCenter[] = [
  { name: "Matriz", type: "matriz", is_active: true },
  { name: "Congregacoes", type: "congregacao", is_active: true },
  { name: "Departamentos", type: "departamento", is_active: true },
  { name: "Eventos", type: "evento", is_active: true },
];

export const DEFAULT_FINANCIAL_ACCOUNTS: FinanceAccount[] = [
  { name: "Caixa", type: "caixa", opening_balance: 0, current_balance: 0, is_active: true },
  { name: "Banco", type: "banco", opening_balance: 0, current_balance: 0, is_active: true },
  { name: "PIX", type: "pix", opening_balance: 0, current_balance: 0, is_active: true },
  { name: "Especie", type: "especie", opening_balance: 0, current_balance: 0, is_active: true },
];

export const PAYMENT_METHODS = ["PIX", "Banco", "Especie", "Cartao", "Boleto", "Outro"];

export const normalizeTransactionType = (type: string) =>
  type === "Saída" || type === "Saida" ? "Saida" : "Entrada";

export const isExpense = (type: string) => normalizeTransactionType(type) === "Saida";

export const getTransactionMonth = (date: string) => date?.substring(0, 7);
