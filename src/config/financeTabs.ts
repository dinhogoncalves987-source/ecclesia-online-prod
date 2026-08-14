import type { ModuleId } from "@/config/modules";

/**
 * financeTabs.ts — FASE 1D-C3 (PASSO 4).
 *
 * Definição única e centralizada de título + descrição de cada aba do
 * Financeiro. Antes desta operação, cada aba definia seu próprio cabeçalho
 * isoladamente (ex.: Tesouraria em TransactionList.tsx) e no mobile a barra
 * de ícones não deixava claro qual aba estava ativa (rótulo de texto fica
 * oculto em telas pequenas — `hidden sm:inline`). A partir desta operação,
 * `src/pages/Financeiro.tsx` usa esta única fonte de verdade para renderizar,
 * abaixo da barra de ícones, o nome e a descrição da aba ativa — igual em
 * desktop e mobile, sempre atualizado imediatamente ao trocar de aba.
 *
 * Módulo puro (sem React) para ser testável sem montar UI.
 */
export interface FinanceTabDefinition {
  key: string;
  labelKey: string;
  descriptionKey: string;
  moduleId: ModuleId;
}

export const FINANCE_TAB_DEFINITIONS = [
  {
    key: "executive",
    labelKey: "Executivo",
    descriptionKey: "Visão executiva consolidada: indicadores-chave, hierarquia e alertas financeiros.",
    moduleId: "finance.executive",
  },
  {
    key: "treasury",
    labelKey: "Tesouraria",
    descriptionKey: "Lançamentos financeiros, filtros, importação e conferência operacional.",
    moduleId: "finance.treasury",
  },
  {
    key: "tithes",
    labelKey: "Dízimos & Ofertas",
    descriptionKey: "Contribuições de dízimos e ofertas por membro, período e congregação.",
    moduleId: "finance.tithes",
  },
  {
    key: "campaigns",
    labelKey: "Campanhas",
    descriptionKey: "Campanhas de arrecadação, metas e contribuições vinculadas.",
    moduleId: "finance.campaigns",
  },
  {
    key: "accounts",
    labelKey: "Contas",
    descriptionKey: "Contas financeiras, saldos e transferências entre contas.",
    moduleId: "finance.accounts",
  },
  {
    key: "budget",
    labelKey: "Orçamento",
    descriptionKey: "Orçamento por centro de custo: previsto, realizado e variação.",
    moduleId: "finance.budget",
  },
  {
    key: "assets",
    labelKey: "Patrimônio",
    descriptionKey: "Bens patrimoniais, depreciação e valor contábil atual.",
    moduleId: "finance.assets",
  },
  {
    key: "accountability",
    labelKey: "Prestação de Contas",
    descriptionKey: "Relatórios de prestação de contas para membros e liderança.",
    moduleId: "finance.accountability",
  },
  {
    key: "audit",
    labelKey: "Auditoria",
    descriptionKey: "Trilha de auditoria de alterações e exclusões financeiras.",
    moduleId: "finance.audit",
  },
  {
    key: "intelligence",
    labelKey: "Inteligência / Indicadores Financeiros",
    descriptionKey: "Indicadores financeiros avançados e inteligência ministerial.",
    moduleId: "finance.intelligence",
  },
] as const satisfies ReadonlyArray<FinanceTabDefinition>;

export type FinanceTabKey = (typeof FINANCE_TAB_DEFINITIONS)[number]["key"];

export function getFinanceTabDefinition(key: string): FinanceTabDefinition | undefined {
  return FINANCE_TAB_DEFINITIONS.find(tab => tab.key === key);
}

/** CORREÇÃO C3.1 (eliminar fetch-all) — nenhuma aba do Financeiro consome
 * mais o array completo de transações: todas usam finance_dashboard_aggregates
 * ou uma consulta escopada por organização + intervalo de datas, sempre com
 * `.limit()`. Mantido como array vazio (em vez de removido) para não
 * quebrar chamadores externos que ainda importem este símbolo. */
export const FINANCE_TABS_REQUIRING_FULL_TRANSACTIONS = [] as const satisfies ReadonlyArray<FinanceTabKey>;

export function financeTabRequiresFullTransactions(key: string): boolean {
  return (FINANCE_TABS_REQUIRING_FULL_TRANSACTIONS as readonly string[]).includes(key);
}
