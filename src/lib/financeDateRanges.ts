/**
 * financeDateRanges.ts — CORREÇÃO C3.1.
 *
 * Lógica pura (sem React, sem rede) para calcular janelas de data
 * (mês/ano/dia anterior) usadas para chamar finance_dashboard_aggregates
 * com p_date_from/p_date_to — nunca para filtrar um array de transações já
 * baixado no navegador.
 */

/** "YYYY-MM" do mês atual, no fuso do navegador (mesma convenção já usada
 * em FinanceExecutive/FinanceTithesOfferings/financeInsights). */
export function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** "YYYY-MM" do mês imediatamente anterior a `monthKey`. */
export function previousMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1 - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Primeiro e último dia (YYYY-MM-DD) do mês representado por "YYYY-MM". */
export function monthDateRange(monthKey: string): { from: string; to: string } {
  const [y, m] = monthKey.split("-").map(Number);
  const from = `${monthKey}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

/** Primeiro e último dia (YYYY-MM-DD) do ano informado. */
export function yearDateRange(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** Dia civil imediatamente anterior a `dateStr` (YYYY-MM-DD) — usado para
 * obter o saldo acumulado ANTES de um período via
 * finance_dashboard_aggregates(p_date_to = dayBefore(periodStart)). */
export function dayBefore(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
