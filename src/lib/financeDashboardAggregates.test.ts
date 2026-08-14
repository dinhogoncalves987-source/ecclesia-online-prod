import { describe, it, expect } from "vitest";
import {
  parseFinanceDashboardAggregates,
  buildMonthlySeries,
  buildCategorySeries,
  sumCategoryTotalsMatching,
  findOrganizationEntriesAmount,
  buildCostCenterTotalsMap,
} from "./financeDashboardAggregates";

describe("parseFinanceDashboardAggregates", () => {
  it("retorna null para respostas nulas/ausentes — nunca finge zero", () => {
    expect(parseFinanceDashboardAggregates(null)).toBeNull();
    expect(parseFinanceDashboardAggregates(undefined)).toBeNull();
    expect(parseFinanceDashboardAggregates("not json")).toBeNull();
    expect(parseFinanceDashboardAggregates(42)).toBeNull();
  });

  it("interpreta uma resposta completa da RPC", () => {
    const parsed = parseFinanceDashboardAggregates({
      totals: {
        entries_amount: "10655451.68",
        exits_amount: "23962542.86",
        entries_count: 14908,
        exits_count: 15049,
        confirmed_net: 1000,
        pending_count: 0,
      },
      by_category: [
        { category: "Dízimos", type: "Entrada", total: 500 },
        { category: "Ofertas", type: "Entrada", total: 200 },
      ],
      by_cost_center: [{ cost_center_id: "cc-1", type: "Saida", total: 300 }],
      by_month: [{ month: "2026-01", type: "Entrada", total: 700 }],
      by_organization: [{ organization_id: "org-1", entries_amount: 900 }],
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.totals.entriesAmount).toBeCloseTo(10655451.68);
    expect(parsed!.totals.exitsAmount).toBeCloseTo(23962542.86);
    expect(parsed!.totals.entriesCount).toBe(14908);
    expect(parsed!.totals.exitsCount).toBe(15049);
    expect(parsed!.byCategory).toHaveLength(2);
    expect(parsed!.byCostCenter[0]).toEqual({ costCenterId: "cc-1", type: "Saida", total: 300 });
    expect(parsed!.byMonth[0]).toEqual({ month: "2026-01", type: "Entrada", total: 700 });
    expect(parsed!.byOrganization[0]).toEqual({ organizationId: "org-1", entriesAmount: 900 });
  });

  it("interpreta jsonb serializado como string (defensivo)", () => {
    const parsed = parseFinanceDashboardAggregates(JSON.stringify({ totals: { entries_amount: 5 } }));
    expect(parsed?.totals.entriesAmount).toBe(5);
  });

  it("preenche defaults (0 / [] / 'Geral') quando campos estão ausentes", () => {
    const parsed = parseFinanceDashboardAggregates({});
    expect(parsed).not.toBeNull();
    expect(parsed!.totals).toEqual({
      entriesAmount: 0, exitsAmount: 0, entriesCount: 0, exitsCount: 0, confirmedNet: 0, pendingCount: 0,
    });
    expect(parsed!.byCategory).toEqual([]);
    expect(parsed!.byCostCenter).toEqual([]);
    expect(parsed!.byMonth).toEqual([]);
    expect(parsed!.byOrganization).toEqual([]);
  });
});

describe("buildMonthlySeries", () => {
  it("agrupa entradas/saídas por mês e ordena cronologicamente", () => {
    const series = buildMonthlySeries([
      { month: "2026-02", type: "Entrada", total: 100 },
      { month: "2026-01", type: "Entrada", total: 50 },
      { month: "2026-01", type: "Saida", total: 20 },
    ]);
    expect(series.map(s => s.receita)).toEqual([50, 100]);
    expect(series[0].despesa).toBe(20);
  });

  it("mostra somente os últimos 12 meses com dado", () => {
    const buckets = Array.from({ length: 15 }, (_, i) => ({
      month: `2025-${String(i + 1).padStart(2, "0")}`.slice(0, 7),
      type: "Entrada" as const,
      total: i,
    }));
    // Gerar 15 meses distintos reais (excede 12 em ano único não é possível; usar 2 anos)
    const monthsAcrossYears = [
      ...Array.from({ length: 12 }, (_, i) => ({ month: `2025-${String(i + 1).padStart(2, "0")}`, type: "Entrada" as const, total: 1 })),
      ...Array.from({ length: 3 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, "0")}`, type: "Entrada" as const, total: 1 })),
    ];
    const series = buildMonthlySeries(monthsAcrossYears);
    expect(series).toHaveLength(12);
    expect(series[series.length - 1].month.endsWith("/26")).toBe(true);
  });
});

describe("buildCategorySeries", () => {
  it("agrupa receita/despesa por categoria e ordena pelo maior total", () => {
    const series = buildCategorySeries([
      { category: "Dízimos", type: "Entrada", total: 10 },
      { category: "Manutenção", type: "Saida", total: 500 },
    ]);
    expect(series[0].name).toBe("Manutenção");
    expect(series[0].despesa).toBe(500);
  });
});

describe("sumCategoryTotalsMatching", () => {
  const byCategory = [
    { category: "Dízimos", type: "Entrada" as const, total: 500 },
    { category: "DÍZIMO ESPECIAL", type: "Entrada" as const, total: 100 },
    { category: "Ofertas", type: "Entrada" as const, total: 200 },
    { category: "Dízimos", type: "Saida" as const, total: 999 },
  ];

  it("soma categorias cujo nome combina, ignorando acentos/maiúsculas", () => {
    expect(sumCategoryTotalsMatching(byCategory, ["dizimo", "dízimo"])).toBe(600);
    expect(sumCategoryTotalsMatching(byCategory, ["oferta"])).toBe(200);
  });

  it("nunca mistura tipos — Saida não entra na soma de Entrada", () => {
    expect(sumCategoryTotalsMatching(byCategory, ["dizimo"], "Entrada")).toBe(600);
    expect(sumCategoryTotalsMatching(byCategory, ["dizimo"], "Saida")).toBe(999);
  });
});

describe("findOrganizationEntriesAmount / buildCostCenterTotalsMap", () => {
  it("encontra o total de entradas de uma organização específica", () => {
    const buckets = [{ organizationId: "a", entriesAmount: 10 }, { organizationId: "b", entriesAmount: 20 }];
    expect(findOrganizationEntriesAmount(buckets, "b")).toBe(20);
    expect(findOrganizationEntriesAmount(buckets, "c")).toBe(0);
  });

  it("constrói mapa de centro de custo filtrado por tipo", () => {
    const map = buildCostCenterTotalsMap(
      [
        { costCenterId: "cc-1", type: "Saida", total: 100 },
        { costCenterId: "cc-1", type: "Entrada", total: 50 },
        { costCenterId: "cc-2", type: "Saida", total: 30 },
      ],
      "Saida",
    );
    expect(map.get("cc-1")).toBe(100);
    expect(map.get("cc-2")).toBe(30);
    expect(map.has("cc-1")).toBe(true);
  });
});
