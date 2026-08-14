// ─────────────────────────────────────────────────────────────────────────────
// financeMonthlyLedger.ts — CORREÇÃO C3.1 → CORREÇÃO C4 (eliminação dos
// limites silenciosos 3000/1000).
//
// A versão anterior usava `fetchMonthLedger(...).limit(3000)` e
// `fetchPeriodReceipts(...).limit(1000)` como se esses números fossem "o
// total" — uma organização com mais lançamentos/comprovantes que isso teria
// dados truncados SEM aviso. Esta versão nunca assume um teto como total:
//
//  - `fetchMonthLedgerPage`/`fetchPeriodReceiptsPage` — paginação real
//    (técnica pageSize+1, mesmo padrão de TransactionList.tsx) para as
//    listas exibidas na tela (extrato do mês, comprovantes) — nunca
//    carregam "o mês inteiro" só para desenhar a tabela;
//  - `fetchDateRangeForExport` — usada SOMENTE quando o usuário dispara uma
//    ação explícita que precisa do período completo (exportar CSV, ou
//    calcular o Fluxo de Caixa diário, que precisa de granularidade por
//    dia). Busca a quantidade ESPERADA (obtida previamente do servidor via
//    finance_dashboard_aggregates), em blocos, com `for` limitado pelo
//    total esperado (nunca `while(true)`), valida ao final que o total
//    buscado é exatamente igual ao esperado e retorna erro explícito (nunca
//    dados parciais silenciosos) se qualquer bloco falhar ou a contagem não
//    bater.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import type { TreasuryTransaction } from "@/lib/finance";
import { monthDateRange, yearDateRange } from "@/lib/financeDateRanges";

export const MONTH_LEDGER_PAGE_SIZE = 100;
export const RECEIPTS_PAGE_SIZE = 50;
/** Tamanho de cada bloco ao buscar um período inteiro para exportação/Fluxo
 * — apenas o tamanho da requisição HTTP, nunca um teto de total. */
export const EXPORT_BLOCK_SIZE = 500;

export interface LedgerPageResult {
  rows: TreasuryTransaction[];
  /** true quando existe pelo menos mais 1 registro além desta página
   * (detectado buscando pageSize+1 linhas — nunca count:"exact"). */
  hasNextPage: boolean;
  error: string | null;
}

/** Página (100 linhas) do extrato de UM mês, ordenação estável por data
 * contábil → raw_timestamp → id — usada para EXIBIR a tabela/lista
 * (Prestação de Contas, Relatórios Contábeis). Nunca carrega o mês inteiro
 * de uma vez: cada chamada busca no máximo pageSize + 1 linhas. */
export async function fetchMonthLedgerPage(
  organizationId: string,
  monthKey: string,
  page: number,
  pageSize: number = MONTH_LEDGER_PAGE_SIZE,
): Promise<LedgerPageResult> {
  const { from, to } = monthDateRange(monthKey);
  const rangeFrom = (page - 1) * pageSize;
  const rangeTo = rangeFrom + pageSize; // pageSize+1 técnica — sem count:"exact"
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("organization_id", organizationId)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true })
    .order("raw_timestamp", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true })
    .range(rangeFrom, rangeTo);
  if (error) return { rows: [], hasNextPage: false, error: error.message };
  const all = (data as TreasuryTransaction[]) ?? [];
  const hasNextPage = all.length > pageSize;
  return { rows: hasNextPage ? all.slice(0, pageSize) : all, hasNextPage, error: null };
}

/** Página (50 linhas) de comprovantes (receipt_url preenchido) dentro de
 * uma janela de datas — carregada sob demanda (só quando o usuário abre a
 * seção de comprovantes), com "carregar mais" real em vez de assumir que
 * qualquer teto fixo representa o total. */
export async function fetchPeriodReceiptsPage(
  organizationId: string,
  dateFrom: string,
  dateTo: string,
  page: number,
  pageSize: number = RECEIPTS_PAGE_SIZE,
): Promise<LedgerPageResult> {
  const rangeFrom = (page - 1) * pageSize;
  const rangeTo = rangeFrom + pageSize;
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("organization_id", organizationId)
    .gte("date", dateFrom)
    .lte("date", dateTo)
    .not("receipt_url", "is", null)
    .order("date", { ascending: false })
    .order("id", { ascending: false })
    .range(rangeFrom, rangeTo);
  if (error) return { rows: [], hasNextPage: false, error: error.message };
  const all = (data as TreasuryTransaction[]) ?? [];
  const hasNextPage = all.length > pageSize;
  return { rows: hasNextPage ? all.slice(0, pageSize) : all, hasNextPage, error: null };
}

export interface ExportFetchResult {
  rows: TreasuryTransaction[];
  ok: boolean;
  error: string | null;
}

/**
 * Busca TODAS as linhas de um intervalo de datas, em blocos de
 * `blockSize`, para uma ação explícita que precisa do período completo
 * (exportar CSV, ou computar o Fluxo de Caixa diário). `expectedTotal` DEVE
 * vir de uma contagem já obtida do servidor (ex.: totals.entriesCount +
 * totals.exitsCount de finance_dashboard_aggregates para a mesma janela de
 * datas) — nunca um palpite do cliente.
 *
 * O laço é um `for` limitado por `Math.ceil(expectedTotal / blockSize)`
 * (nunca `while(true)`). Se qualquer bloco falhar, interrompe e retorna
 * erro imediatamente. Ao final, valida que `rows.length === expectedTotal`
 * — uma divergência (ex.: linha inserida/removida durante a exportação)
 * retorna erro explícito em vez de um CSV parcial anunciado como completo.
 */
export async function fetchDateRangeForExport(
  organizationId: string,
  dateFrom: string,
  dateTo: string,
  expectedTotal: number,
  onProgress?: (fetched: number, total: number) => void,
  blockSize: number = EXPORT_BLOCK_SIZE,
): Promise<ExportFetchResult> {
  if (expectedTotal <= 0) return { rows: [], ok: true, error: null };

  const rows: TreasuryTransaction[] = [];
  const totalBlocks = Math.ceil(expectedTotal / blockSize);

  for (let block = 0; block < totalBlocks; block++) {
    const rangeFrom = block * blockSize;
    const rangeTo = rangeFrom + blockSize - 1;
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("organization_id", organizationId)
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .order("date", { ascending: true })
      .order("raw_timestamp", { ascending: true, nullsFirst: true })
      .order("id", { ascending: true })
      .range(rangeFrom, rangeTo);

    if (error) {
      return { rows: [], ok: false, error: error.message };
    }
    rows.push(...((data as TreasuryTransaction[]) ?? []));
    onProgress?.(rows.length, expectedTotal);
  }

  if (rows.length !== expectedTotal) {
    return {
      rows: [],
      ok: false,
      error: `dados incompletos: esperado ${expectedTotal} lançamento(s), obtido ${rows.length}`,
    };
  }
  return { rows, ok: true, error: null };
}

export type AccountabilityReportType = "Mensal" | "Trimestral" | "Anual";

/** Converte period_key + report_type em uma janela de data (from/to) —
 * mesma semântica que existia em receiptsForPeriod (filtro sobre o array
 * completo), agora usada para escopar a consulta no servidor. Retorna
 * `null` quando period_key não segue o formato esperado. */
export function reportPeriodDateRange(
  periodKey: string,
  reportType: AccountabilityReportType,
): { from: string; to: string } | null {
  if (reportType === "Mensal") {
    const match = periodKey.match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    return monthDateRange(periodKey);
  }
  if (reportType === "Anual") {
    const match = periodKey.match(/^(\d{4})$/);
    if (!match) return null;
    return yearDateRange(Number(match[1]));
  }
  // Trimestral: "YYYY-Qn"
  const match = periodKey.match(/^(\d{4})-Q(\d)$/);
  if (!match) return null;
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  const startMonth = (quarter - 1) * 3 + 1;
  const from = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const endMonthKey = `${year}-${String(startMonth + 2).padStart(2, "0")}`;
  const { to } = monthDateRange(endMonthKey);
  return { from, to };
}
