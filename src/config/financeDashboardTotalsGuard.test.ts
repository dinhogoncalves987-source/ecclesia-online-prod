import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * FASE 1D-C3 (PASSO 3/5) — guarda de regressão dos totais/cards do
 * Financeiro (FinanceOverview.tsx + useFinanceDashboardAggregates.ts).
 *
 * Antes desta operação, FinanceOverview.tsx recebia TODAS as transações via
 * prop `transactions` e recalculava receita/despesa/saldo/gráficos com
 * `.filter()`/`.reduce()` sobre o array completo a cada render — com
 * 29.957+ lançamentos isso baixava e processava tudo no navegador só para
 * mostrar 4 cartões e alguns gráficos. Agora os totais vêm de uma única RPC
 * agregada (`finance_dashboard_aggregates`, SUM/COUNT/GROUP BY no Postgres),
 * sujeita à mesma RLS de leitura financeira — nenhuma linha crua chega ao
 * cliente.
 *
 * Verificação estática do código-fonte (mesmo padrão de
 * membersServerSidePaginationGuard.test.ts) — não renderiza componentes.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const OVERVIEW_SOURCE = readFileSync(
  path.join(ROOT, "src", "components", "financeiro", "FinanceOverview.tsx"),
  "utf8",
);
const HOOK_SOURCE = readFileSync(
  path.join(ROOT, "src", "hooks", "useFinanceDashboardAggregates.ts"),
  "utf8",
);

describe("guarda de regressão — totais/gráficos do Financeiro vêm de RPC agregada, não de fetch-all", () => {
  it("FinanceOverview não recebe mais o array completo de transactions via props", () => {
    expect(OVERVIEW_SOURCE).not.toMatch(/export function FinanceOverview\(\{\s*\n?\s*transactions/);
    expect(OVERVIEW_SOURCE).toContain("export function FinanceOverview({ reloadToken }: { reloadToken?: number })");
  });

  it("FinanceOverview usa a RPC agregada via useFinanceDashboardAggregates, nunca .filter()/.reduce() sobre transações cruas", () => {
    expect(OVERVIEW_SOURCE).toContain("useFinanceDashboardAggregates({");
    // Não deve existir nenhuma chamada a `.from("transactions")` neste
    // componente — todo dado vem da RPC.
    expect(OVERVIEW_SOURCE).not.toContain('.from("transactions")');
    expect(OVERVIEW_SOURCE).not.toMatch(/transactions\.filter\(/);
    expect(OVERVIEW_SOURCE).not.toMatch(/transactions\.reduce\(/);
  });

  it("totais (receita/despesa/saldo/confirmados) vêm de totals.* da agregação, não de soma manual sobre linhas", () => {
    expect(OVERVIEW_SOURCE).toContain("const totalReceita = totals?.entriesAmount ?? 0;");
    expect(OVERVIEW_SOURCE).toContain("const totalDespesa = totals?.exitsAmount ?? 0;");
    expect(OVERVIEW_SOURCE).toContain("const saldo = totalReceita - totalDespesa;");
  });

  it("a RPC chamada é finance_dashboard_aggregates, com organização/período/hierarquia como parâmetros (respeitando RLS)", () => {
    expect(HOOK_SOURCE).toContain('.rpc("finance_dashboard_aggregates", {');
    expect(HOOK_SOURCE).toContain("p_organization_id: organizationId,");
    expect(HOOK_SOURCE).toContain("p_hierarchy_organization_ids: hierarchyIds,");
    expect(HOOK_SOURCE).toContain("p_date_from: dateFrom ?? null,");
    expect(HOOK_SOURCE).toContain("p_date_to: dateTo ?? null,");
  });

  it("estado distingue explicitamente carregando/erro/sucesso — nunca mostra zero falso enquanto carrega", () => {
    expect(HOOK_SOURCE).toContain('"idle" | "loading" | "error" | "success"');
    expect(OVERVIEW_SOURCE).toContain('if (status === "loading" || status === "idle") {');
    expect(OVERVIEW_SOURCE).toContain('if (status === "error") {');
  });

  it("requisição obsoleta nunca sobrescreve o estado atual (guard de requestId, mesmo padrão de fetchPage)", () => {
    expect(HOOK_SOURCE).toContain("const requestId = ++requestIdRef.current;");
    expect(HOOK_SOURCE).toContain("if (requestId !== requestIdRef.current) return;");
  });

  it("aceita reloadToken para revalidar após import/exclusão/reset, sem exigir refresh de página", () => {
    expect(HOOK_SOURCE).toContain("reloadToken?: number;");
    expect(HOOK_SOURCE).toContain("reloadToken]);");
  });
});
