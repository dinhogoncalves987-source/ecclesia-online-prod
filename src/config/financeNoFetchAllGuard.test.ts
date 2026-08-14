import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * financeNoFetchAllGuard.test.ts — CORREÇÃO DIRETA C3.1.
 *
 * Guarda de regressão estática: falha se qualquer arquivo do módulo
 * Financeiro voltar a:
 *  - buscar `transactions` sem `.range()`/`.limit()`;
 *  - manter uma função de fetch-all (paginação manual acumulando páginas
 *    num array até `hasMore` ficar falso, ou `while(true)`);
 *  - calcular totais globais com `.filter()`/`.reduce()` sobre um array
 *    completo de transactions no navegador;
 *  - passar um array completo de `transactions` para as cinco abas que
 *    antes dependiam dele (Executivo, Dízimos & Ofertas, Orçamento,
 *    Prestação de Contas, Inteligência).
 *
 * Não renderiza componentes — verificação estática do código-fonte, no
 * mesmo padrão de financeServerSidePaginationGuard.test.ts.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");

function readSrc(...segments: string[]): string {
  return readFileSync(path.join(ROOT, "src", ...segments), "utf8");
}

const FINANCEIRO_PAGE = readSrc("pages", "Financeiro.tsx");
const FINANCE_EXECUTIVE = readSrc("components", "financeiro", "FinanceExecutive.tsx");
const FINANCE_TITHES = readSrc("components", "financeiro", "FinanceTithesOfferings.tsx");
const FINANCE_BUDGET = readSrc("components", "financeiro", "FinanceBudget.tsx");
const FINANCE_ACCOUNTABILITY = readSrc("components", "financeiro", "FinanceAccountability.tsx");
const FINANCE_REPORTS = readSrc("components", "financeiro", "FinanceReports.tsx");
const FINANCE_INTELLIGENCE = readSrc("components", "financeiro", "FinanceIntelligence.tsx");
const FINANCE_INSIGHTS = readSrc("lib", "financeInsights.ts");
const MONTHLY_LEDGER = readSrc("lib", "financeMonthlyLedger.ts");

const MODULE_FILES: Record<string, string> = {
  "pages/Financeiro.tsx": FINANCEIRO_PAGE,
  "components/financeiro/FinanceExecutive.tsx": FINANCE_EXECUTIVE,
  "components/financeiro/FinanceTithesOfferings.tsx": FINANCE_TITHES,
  "components/financeiro/FinanceBudget.tsx": FINANCE_BUDGET,
  "components/financeiro/FinanceAccountability.tsx": FINANCE_ACCOUNTABILITY,
  "components/financeiro/FinanceReports.tsx": FINANCE_REPORTS,
  "components/financeiro/FinanceIntelligence.tsx": FINANCE_INTELLIGENCE,
  "lib/financeInsights.ts": FINANCE_INSIGHTS,
};

/** Remove comentários de bloco e de linha antes de aplicar regras de
 * regressão — os próprios comentários explicativos deste código (ex.:
 * "antes usava `.limit(3000)`") citam os padrões proibidos como HISTÓRICO,
 * o que nunca deve gerar falso positivo nos testes de código real. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** Toda ocorrência de `.from("transactions")` deve ter um `.limit(` (ou
 * `.range(`) dentro de uma janela curta de caracteres na mesma
 * expressão/statement — nunca uma consulta verdadeiramente sem limite. */
function everyTransactionsQueryIsBounded(source: string): boolean {
  const matches = [...source.matchAll(/\.from\(["']transactions["']\)/g)];
  for (const match of matches) {
    const start = match.index ?? 0;
    const window = source.slice(start, start + 400);
    const statementEnd = window.indexOf(";");
    const statement = statementEnd >= 0 ? window.slice(0, statementEnd) : window;
    if (!/\.limit\(|\.range\(/.test(statement)) return false;
  }
  return true;
}

describe("guarda de regressão — ZERO fetch-all de transactions no módulo Financeiro (CORREÇÃO C3.1)", () => {
  it("toda consulta a transactions() nos arquivos do módulo é limitada (.limit()/.range())", () => {
    for (const [name, source] of Object.entries(MODULE_FILES)) {
      expect(everyTransactionsQueryIsBounded(source), `${name} tem uma consulta a transactions sem .limit()/.range()`).toBe(true);
    }
  });

  it("nenhum arquivo do módulo mantém loop de fetch-all (while(true) ou while(hasMore))", () => {
    for (const [name, source] of Object.entries(MODULE_FILES)) {
      expect(source, name).not.toMatch(/while\s*\(\s*true\s*\)\s*\{/);
      expect(source, name).not.toMatch(/while\s*\(\s*hasMore\w*\s*\)\s*\{/);
    }
  });

  // Só considera uma DECLARAÇÃO real de prop/tipo (precedida de `{`, `(` ou
  // `:` fora de comentário/string) — nunca uma menção em comentário
  // explicativo entre crases (ex.: "recebia `transactions:
  // TreasuryTransaction[]`"), que é texto histórico esperado.
  const PROP_DECLARATION_RE = /[{(]\s*transactions:\s*TreasuryTransaction\[\]/;

  it("Executivo (FinanceExecutive) não declara nem recebe prop `transactions: TreasuryTransaction[]`, nem chama mais useHierarchyRevenue", () => {
    expect(FINANCE_EXECUTIVE).not.toMatch(PROP_DECLARATION_RE);
    expect(FINANCE_EXECUTIVE).not.toMatch(/[=(]\s*useHierarchyRevenue\(/);
    expect(FINANCE_EXECUTIVE).not.toMatch(/from ["']@\/.*useHierarchyRevenue["']/);
  });

  it("Dízimos & Ofertas (FinanceTithesOfferings) não declara nem recebe prop `transactions: TreasuryTransaction[]`", () => {
    expect(FINANCE_TITHES).not.toMatch(PROP_DECLARATION_RE);
  });

  it("Orçamento (FinanceBudget) não declara nem recebe prop `transactions: TreasuryTransaction[]`", () => {
    expect(FINANCE_BUDGET).not.toMatch(PROP_DECLARATION_RE);
    expect(FINANCE_BUDGET).not.toMatch(/\btransactions\.filter\(/);
  });

  it("Prestação de Contas (FinanceAccountability) não declara nem recebe prop `transactions: TreasuryTransaction[]`", () => {
    expect(FINANCE_ACCOUNTABILITY).not.toMatch(PROP_DECLARATION_RE);
    expect(FINANCE_ACCOUNTABILITY).not.toMatch(/\btransactions\.filter\(/);
  });

  it("Relatórios Contábeis (FinanceReports, usado dentro de Prestação de Contas) não declara nem recebe prop `transactions: TreasuryTransaction[]`", () => {
    expect(FINANCE_REPORTS).not.toMatch(PROP_DECLARATION_RE);
    expect(FINANCE_REPORTS).not.toMatch(/\btransactions\.filter\(/);
  });

  it("Inteligência (FinanceIntelligence) não declara nem recebe prop `transactions: TreasuryTransaction[]`", () => {
    expect(FINANCE_INTELLIGENCE).not.toMatch(PROP_DECLARATION_RE);
  });

  it("financeInsights (fonte de dados de Executivo/Inteligência) não recebe `transactions` e usa finance_dashboard_aggregates", () => {
    expect(FINANCE_INSIGHTS).not.toMatch(PROP_DECLARATION_RE);
    expect(FINANCE_INSIGHTS).toContain("useFinanceDashboardAggregates");
  });

  it("Financeiro.tsx não passa mais array completo de transactions para nenhuma das 5 abas (executive/tithes/budget/accountability/intelligence)", () => {
    expect(FINANCEIRO_PAGE).not.toMatch(/<FinanceExecutive[^>]*\btransactions=/);
    expect(FINANCEIRO_PAGE).not.toMatch(/<FinanceTithesOfferings[^>]*\btransactions=/);
    expect(FINANCEIRO_PAGE).not.toMatch(/<FinanceBudget[^>]*\btransactions=/);
    expect(FINANCEIRO_PAGE).not.toMatch(/<FinanceAccountability[^>]*\btransactions=/);
    expect(FINANCEIRO_PAGE).not.toMatch(/<FinanceIntelligence[^>]*\btransactions=/);
  });

  it("Financeiro.tsx não mantém mais nenhum caminho de carregamento condicionado à aba que baixe transactions", () => {
    expect(FINANCEIRO_PAGE).not.toContain('.from("transactions")');
    expect(FINANCEIRO_PAGE).not.toContain("setTransactions");
    expect(FINANCEIRO_PAGE).not.toContain("useState<TreasuryTransaction[]>");
  });

  it("Orçamento e Prestação de Contas usam finance_dashboard_aggregates (realizado/saldo agregados no servidor)", () => {
    expect(FINANCE_BUDGET).toContain("useFinanceDashboardAggregates");
    expect(FINANCE_ACCOUNTABILITY).toContain("useFinanceDashboardAggregates");
    expect(FINANCE_REPORTS).toContain("useFinanceDashboardAggregates");
  });

  it("extratos de UM mês/período usam as consultas paginadas/validadas de financeMonthlyLedger, nunca um array global", () => {
    expect(FINANCE_ACCOUNTABILITY).toContain("fetchPeriodReceiptsPage");
    expect(FINANCE_ACCOUNTABILITY).toContain("fetchDateRangeForExport");
    expect(FINANCE_REPORTS).toContain("fetchMonthLedgerPage");
    expect(FINANCE_REPORTS).toContain("fetchDateRangeForExport");
    expect(MONTHLY_LEDGER).toMatch(/export (async )?function fetchMonthLedgerPage/);
    expect(MONTHLY_LEDGER).toMatch(/export (async )?function fetchPeriodReceiptsPage/);
    expect(MONTHLY_LEDGER).toMatch(/export (async )?function fetchDateRangeForExport/);
  });

  // ── CORREÇÃO C4 — eliminação dos limites silenciosos 3000/1000 ──────────
  // A versão da C3.1 tratava `.limit(3000)` (extrato do mês) e
  // `.limit(1000)` (comprovantes do período) como se fossem "o total" —
  // truncando silenciosamente organizações com mais dados que isso. Estes
  // testes impedem a reintrodução desse padrão.
  it("nenhum arquivo do módulo usa limit(3000) ou limit(1000) como teto de total (padrão eliminado na CORREÇÃO C4)", () => {
    const ALL_FILES: Record<string, string> = { ...MODULE_FILES, "lib/financeMonthlyLedger.ts": MONTHLY_LEDGER };
    for (const [name, source] of Object.entries(ALL_FILES)) {
      const code = stripComments(source);
      expect(code, `${name} não deve usar .limit(3000) em código real`).not.toMatch(/\.limit\(\s*3000\s*\)/);
      expect(code, `${name} não deve usar .limit(1000) em código real`).not.toMatch(/\.limit\(\s*1000\s*\)/);
    }
    expect(MONTHLY_LEDGER).not.toContain("MONTH_LEDGER_LIMIT");
    expect(MONTHLY_LEDGER).not.toContain("PERIOD_RECEIPTS_LIMIT");
  });

  it("a listagem paginada do extrato mensal usa a técnica pageSize+1 (página de 100, nunca o mês inteiro)", () => {
    expect(MONTHLY_LEDGER).toContain("MONTH_LEDGER_PAGE_SIZE = 100");
    expect(MONTHLY_LEDGER).toMatch(/rangeFrom \+ pageSize/);
    expect(FINANCE_REPORTS).toMatch(/fetchMonthLedgerPage\(/);
  });

  it("a exportação de período completo (CSV/Fluxo) busca a quantidade esperada do servidor, usa `for` (nunca while(true) em código real) e valida o total ao final", () => {
    const code = stripComments(MONTHLY_LEDGER);
    expect(code).toMatch(/export (async )?function fetchDateRangeForExport/);
    expect(code).toMatch(/for\s*\(let block = 0; block < totalBlocks; block\+\+\)/);
    expect(code).not.toMatch(/while\s*\(\s*true\s*\)/);
    expect(code).toMatch(/rows\.length !== expectedTotal/);
    // Nunca retorna ok:true com dados parciais — divergência sempre é erro.
    expect(code).toMatch(/ok:\s*false/);
    expect(code).toContain("dados incompletos");
  });

  it("a exportação CSV do Financeiro nunca declara sucesso com dados parciais — download só ocorre após validar o total (docExport.ts)", () => {
    const DOC_EXPORT = readSrc("lib", "docExport.ts");
    // downloadCSVRaw só é chamado DEPOIS de `await fn()` resolver — se `fn()`
    // (a busca validada) lançar, o download nunca ocorre e useDocExport
    // mostra erro em vez do toast de sucesso.
    expect(DOC_EXPORT).toMatch(/onAction:\s*async \(\) => downloadCSVRaw\(await fn\(\), filename\)/);
    expect(FINANCE_ACCOUNTABILITY).toMatch(/exportPrestacaoCSV\s*=\s*async/);
    expect(FINANCE_REPORTS).toMatch(/buildReportCSV\s*=\s*async/);
  });

  it("comprovantes (Ver comprovantes / relatório histórico) usam paginação real, nunca um `.limit()` fixo tratado como total", () => {
    expect(FINANCE_ACCOUNTABILITY).not.toMatch(/periodData\.receipts/);
    expect(FINANCE_ACCOUNTABILITY).toMatch(/receiptsHasNextPage/);
    expect(FINANCE_ACCOUNTABILITY).toMatch(/selectedReportReceiptsHasNextPage/);
  });
});
