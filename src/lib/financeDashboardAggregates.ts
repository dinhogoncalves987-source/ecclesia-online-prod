/**
 * financeDashboardAggregates.ts — FASE 1D-C3.
 *
 * Lógica pura (sem React, sem rede) para interpretar a resposta jsonb da
 * RPC finance_dashboard_aggregates e derivar as séries usadas pelos cards e
 * gráficos do Financeiro (Visão Geral, Executivo, Orçamento) sem nunca
 * percorrer a lista completa de transações no navegador.
 */

export type FinanceNormalizedType = "Entrada" | "Saida";

export interface FinanceDashboardTotals {
  entriesAmount: number;
  exitsAmount: number;
  entriesCount: number;
  exitsCount: number;
  confirmedNet: number;
  pendingCount: number;
}

export interface FinanceCategoryBucket {
  category: string;
  type: FinanceNormalizedType;
  total: number;
}

export interface FinanceCostCenterBucket {
  costCenterId: string;
  type: FinanceNormalizedType;
  total: number;
}

export interface FinanceMonthBucket {
  month: string;
  type: FinanceNormalizedType;
  total: number;
}

export interface FinanceOrganizationBucket {
  organizationId: string;
  entriesAmount: number;
}

export interface FinanceOverdueSummary {
  count: number;
  amount: number;
}

export interface FinanceCongregationCategoryBucket {
  congregationId: string;
  category: string;
  type: FinanceNormalizedType;
  total: number;
}

export interface FinanceDashboardAggregates {
  totals: FinanceDashboardTotals;
  byCategory: FinanceCategoryBucket[];
  byCostCenter: FinanceCostCenterBucket[];
  byMonth: FinanceMonthBucket[];
  byOrganization: FinanceOrganizationBucket[];
  /** CORREÇÃO C3.1 — contas vencidas, sempre "hoje", independente do
   *  período selecionado (ver migration 20260814150000). */
  overdue: FinanceOverdueSummary;
  /** CORREÇÃO C3.1 — alimenta "Dízimos & Ofertas por congregação" sem
   *  baixar transações; respeita a mesma janela de p_date_from/p_date_to. */
  byCongregationCategory: FinanceCongregationCategoryBucket[];
}

function toNormalizedType(value: unknown): FinanceNormalizedType {
  return value === "Saida" ? "Saida" : "Entrada";
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Interpreta a resposta jsonb da RPC. Retorna `null` quando a resposta é
 * nula/inesperada — o chamador NUNCA deve tratar `null` como "zero"; é um
 * estado de erro distinto (ver useFinanceDashboardAggregates).
 */
export function parseFinanceDashboardAggregates(data: unknown): FinanceDashboardAggregates | null {
  const parsed = typeof data === "string" ? safeJsonParse(data) : data;
  if (!parsed || typeof parsed !== "object") return null;
  const result = parsed as Record<string, unknown>;
  const totalsRaw = (result.totals ?? {}) as Record<string, unknown>;

  const byCategory = Array.isArray(result.by_category)
    ? (result.by_category as Record<string, unknown>[]).map(row => ({
        category: String(row.category ?? "Geral"),
        type: toNormalizedType(row.type),
        total: toNumber(row.total),
      }))
    : [];

  const byCostCenter = Array.isArray(result.by_cost_center)
    ? (result.by_cost_center as Record<string, unknown>[]).map(row => ({
        costCenterId: String(row.cost_center_id ?? ""),
        type: toNormalizedType(row.type),
        total: toNumber(row.total),
      }))
    : [];

  const byMonth = Array.isArray(result.by_month)
    ? (result.by_month as Record<string, unknown>[]).map(row => ({
        month: String(row.month ?? ""),
        type: toNormalizedType(row.type),
        total: toNumber(row.total),
      }))
    : [];

  const byOrganization = Array.isArray(result.by_organization)
    ? (result.by_organization as Record<string, unknown>[]).map(row => ({
        organizationId: String(row.organization_id ?? ""),
        entriesAmount: toNumber(row.entries_amount),
      }))
    : [];

  const overdueRaw = (result.overdue ?? {}) as Record<string, unknown>;
  const overdue: FinanceOverdueSummary = {
    count: toNumber(overdueRaw.count),
    amount: toNumber(overdueRaw.amount),
  };

  const byCongregationCategory = Array.isArray(result.by_congregation_category)
    ? (result.by_congregation_category as Record<string, unknown>[]).map(row => ({
        congregationId: String(row.congregation_id ?? ""),
        category: String(row.category ?? "Geral"),
        type: toNormalizedType(row.type),
        total: toNumber(row.total),
      }))
    : [];

  return {
    totals: {
      entriesAmount: toNumber(totalsRaw.entries_amount),
      exitsAmount: toNumber(totalsRaw.exits_amount),
      entriesCount: toNumber(totalsRaw.entries_count),
      exitsCount: toNumber(totalsRaw.exits_count),
      confirmedNet: toNumber(totalsRaw.confirmed_net),
      pendingCount: toNumber(totalsRaw.pending_count),
    },
    byCategory,
    byCostCenter,
    byMonth,
    byOrganization,
    overdue,
    byCongregationCategory,
  };
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// ── Derivações para os gráficos existentes (mesma forma que FinanceOverview
// já espera, agora alimentada por buckets agregados em vez de linha a linha) ──

export interface MonthlySeriesPoint {
  month: string;
  receita: number;
  despesa: number;
}

/** Converte by_month em série ordenada por mês, mostrando só os últimos 12
 * meses com dado — mesmo recorte que a versão client-side anterior tinha. */
export function buildMonthlySeries(byMonth: FinanceMonthBucket[]): MonthlySeriesPoint[] {
  const months = new Map<string, MonthlySeriesPoint>();
  for (const bucket of byMonth) {
    if (!bucket.month) continue;
    const point = months.get(bucket.month) ?? { month: bucket.month, receita: 0, despesa: 0 };
    if (bucket.type === "Saida") point.despesa += bucket.total;
    else point.receita += bucket.total;
    months.set(bucket.month, point);
  }
  return Array.from(months.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12)
    .map(m => ({ ...m, month: m.month.substring(5) + "/" + m.month.substring(2, 4) }));
}

export interface CategorySeriesPoint {
  name: string;
  receita: number;
  despesa: number;
}

export function buildCategorySeries(byCategory: FinanceCategoryBucket[]): CategorySeriesPoint[] {
  const cats = new Map<string, CategorySeriesPoint>();
  for (const bucket of byCategory) {
    const point = cats.get(bucket.category) ?? { name: bucket.category, receita: 0, despesa: 0 };
    if (bucket.type === "Saida") point.despesa += bucket.total;
    else point.receita += bucket.total;
    cats.set(bucket.category, point);
  }
  return Array.from(cats.values()).sort((a, b) => (b.receita + b.despesa) - (a.receita + a.despesa));
}

/** Soma os buckets de categoria cujo nome combina com um dos termos (ex.:
 * "dizimo"/"dízimo" para Dízimos, "oferta" para Ofertas) — reaproveita a
 * mesma heurística de normalização (NFD + lowercase) já usada nas abas
 * Dízimos/Ofertas e Inteligência, mas aplicada a um punhado de categorias
 * agregadas em vez de milhares de transações. */
export function sumCategoryTotalsMatching(
  byCategory: FinanceCategoryBucket[],
  terms: string[],
  type: FinanceNormalizedType = "Entrada",
): number {
  const normalizedTerms = terms.map(normalizeForMatch);
  return byCategory
    .filter(bucket => bucket.type === type)
    .filter(bucket => {
      const normalizedCategory = normalizeForMatch(bucket.category);
      return normalizedTerms.some(term => normalizedCategory.includes(term));
    })
    .reduce((sum, bucket) => sum + bucket.total, 0);
}

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Soma o total de entradas (receita) para um conjunto de organizações a
 * partir de by_organization — usado por "Consolidado por hierarquia". */
export function findOrganizationEntriesAmount(
  byOrganization: FinanceOrganizationBucket[],
  organizationId: string,
): number {
  return byOrganization.find(bucket => bucket.organizationId === organizationId)?.entriesAmount ?? 0;
}

/** Mapa cost_center_id -> total, filtrado por tipo — usado por FinanceBudget. */
export function buildCostCenterTotalsMap(
  byCostCenter: FinanceCostCenterBucket[],
  type: FinanceNormalizedType,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const bucket of byCostCenter) {
    if (bucket.type !== type) continue;
    map.set(bucket.costCenterId, (map.get(bucket.costCenterId) ?? 0) + bucket.total);
  }
  return map;
}

// ── Dízimos & Ofertas por congregação (CORREÇÃO C3.1) — mesma heurística de
// categorização que existia em FinanceTithesOfferings.tsx e
// financeInsights.ts, agora aplicada a um punhado de buckets agregados
// (congregação × categoria) em vez de milhares de transações. ──────────────

export type OfferingKind = "tithe" | "missionary" | "special" | "offering" | "other";

export function categoryOfferingKind(category: string | null | undefined): OfferingKind {
  const c = normalizeForMatch(category ?? "");
  if (c.includes("dizimo")) return "tithe";
  if (c.includes("missao") || c.includes("missoes")) return "missionary";
  if (c.includes("especial")) return "special";
  if (c.includes("oferta")) return "offering";
  return "other";
}

/** Soma o total (somente Entrada) de um kind específico entre todos os
 * buckets de congregação — alimenta os cards de topo (mês atual/anterior). */
export function sumCongregationCategoryByKind(
  buckets: FinanceCongregationCategoryBucket[],
  kind: OfferingKind,
): number {
  return buckets
    .filter(b => b.type === "Entrada" && categoryOfferingKind(b.category) === kind)
    .reduce((sum, b) => sum + b.total, 0);
}

/** IDs de congregação com pelo menos 1 lançamento de entrada classificável
 * (não "other") no conjunto de buckets — usado para "média por congregação". */
export function distinctCongregationIdsWithOfferings(
  buckets: FinanceCongregationCategoryBucket[],
): string[] {
  const ids = new Set<string>();
  for (const b of buckets) {
    if (b.type !== "Entrada") continue;
    if (categoryOfferingKind(b.category) === "other") continue;
    if (b.congregationId) ids.add(b.congregationId);
  }
  return Array.from(ids);
}

export interface CongregationOfferingsRow {
  congregationId: string;
  tithes: number;
  /** Ofertas + ofertas missionárias + ofertas especiais somadas — mesmo
   *  agrupamento usado na tabela "Por congregação". */
  offerings: number;
}

/** Constrói as linhas por congregação (dízimos vs. demais ofertas) a partir
 * dos buckets agregados de um único período (mês atual OU mês anterior). */
export function buildCongregationOfferingsRows(
  buckets: FinanceCongregationCategoryBucket[],
): CongregationOfferingsRow[] {
  const byId = new Map<string, CongregationOfferingsRow>();
  for (const bucket of buckets) {
    if (bucket.type !== "Entrada" || !bucket.congregationId) continue;
    const kind = categoryOfferingKind(bucket.category);
    if (kind === "other") continue;
    const row = byId.get(bucket.congregationId) ?? { congregationId: bucket.congregationId, tithes: 0, offerings: 0 };
    if (kind === "tithe") row.tithes += bucket.total;
    else row.offerings += bucket.total;
    byId.set(bucket.congregationId, row);
  }
  return Array.from(byId.values());
}
