import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * FASE 1D-C3 (PASSO 2/5) — guarda de regressão para a paginação server-side
 * da Tesouraria (src/components/financeiro/TransactionList.tsx).
 *
 * Antes desta operação, TransactionList.tsx recebia o array COMPLETO de
 * transactions (buscado sem paginação em src/pages/Financeiro.tsx) e
 * filtrava/buscava no cliente. Com 29.957+ lançamentos isso baixava tudo a
 * cada carregamento da Tesouraria. A partir desta operação, a listagem usa
 * paginação real no servidor (mesmo padrão de src/pages/Membros.tsx, ver
 * docs/PERFORMANCE_CONTRACT.md): página de 100, técnica pageSize+1 para
 * saber se há próxima página sem count:"exact", filtros/busca no Postgres,
 * cache curto com TTL, cancelamento de requisições obsoletas.
 *
 * Este teste NÃO renderiza o componente — verificação estática do
 * código-fonte, no mesmo padrão de membersServerSidePaginationGuard.test.ts.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const SOURCE = readFileSync(
  path.join(ROOT, "src", "components", "financeiro", "TransactionList.tsx"),
  "utf8",
);

describe("guarda de regressão — paginação server-side da Tesouraria (TransactionList)", () => {
  it("nunca reintroduz um loop de fetch-all (while(true)/hasMore acumulando página em array)", () => {
    expect(SOURCE).not.toMatch(/while\s*\(\s*true\s*\)\s*\{/);
    expect(SOURCE).not.toMatch(/while\s*\(\s*hasMore\w*\s*\)\s*\{/);
  });

  it("não recebe mais o array completo de transactions via props (nada de fetch-all no pai)", () => {
    expect(SOURCE).not.toMatch(/export function TransactionList\(\{\s*\n?\s*transactions/);
    expect(SOURCE).toContain("onDataChanged?: () => void;");
  });

  it("a página é limitada a 100 registros por requisição", () => {
    expect(SOURCE).toMatch(/TRANSACTIONS_PAGE_SIZE\s*=\s*100\b/);
  });

  it("busca pageSize + 1 linhas (.range(from, to) com to = from + PAGE_SIZE) para detectar próxima página sem count exato", () => {
    expect(SOURCE).toContain("const to = from + TRANSACTIONS_PAGE_SIZE;");
    expect(SOURCE).toContain(".range(from, to)");
    expect(SOURCE).not.toContain('{ count: "exact" }');
    expect(SOURCE).not.toContain('count: "exact"');
  });

  it("a linha 101 só decide hasNextPage e nunca é renderizada (slice(0, PAGE_SIZE))", () => {
    expect(SOURCE).toContain("const pageHasNext = rows.length > TRANSACTIONS_PAGE_SIZE;");
    expect(SOURCE).toContain("const items = pageHasNext ? rows.slice(0, TRANSACTIONS_PAGE_SIZE) : rows;");
  });

  it("ordenação estável: data contábil, carimbo (raw_timestamp) e id, todos DESC", () => {
    expect(SOURCE).toContain('.order("date", { ascending: false })');
    expect(SOURCE).toContain('.order("raw_timestamp", { ascending: false, nullsFirst: false })');
    expect(SOURCE).toContain('.order("id", { ascending: false })');
  });

  it("busca e filtros (tipo, status, categoria, conta financeira, período) executam no servidor via Postgres, não Array.prototype.filter", () => {
    expect(SOURCE).toContain('query = query.in("type", typeVariants)');
    expect(SOURCE).toContain('query = query.eq("status", filterStatus)');
    expect(SOURCE).toContain('query = query.eq("category", filterCategory)');
    expect(SOURCE).toContain('query = query.eq("financial_account_id", filterFinancialAccountId)');
    expect(SOURCE).toContain('query = query.eq("period_id", filterPeriodId)');
    expect(SOURCE).toContain("query = query.or([");
  });

  it("busca tem debounce (300ms) — não dispara uma requisição por tecla digitada", () => {
    expect(SOURCE).toMatch(/setTimeout\(\(\)\s*=>\s*setSearchQuery\(searchInput\),\s*300\)/);
  });

  it("troca de busca/filtro reseta para a página 1", () => {
    expect(SOURCE).toMatch(/setCurrentPage\(1\);\s*\}, \[filtersKey, searchQuery\]\);/);
  });

  it("cancela requisições obsoletas com AbortController — resposta antiga nunca sobrescreve consulta nova", () => {
    expect(SOURCE).toContain("new AbortController()");
    expect(SOURCE).toContain(".abortSignal(controller.signal)");
    expect(SOURCE).toContain("abortRef.current?.abort();");
    expect(SOURCE).toContain("if (requestId !== requestIdRef.current) return;");
  });

  it("erro visível limpa hasNextPage — nunca deixa \"Próxima\" habilitada com base numa resposta obsoleta", () => {
    const errorBlockMatch = SOURCE.match(
      /if \(error\) \{[\s\S]*?if \(!opts\.silent\) \{[\s\S]*?setHasNextPage\(false\);[\s\S]*?setListError\([\s\S]*?\}\s*return;\s*\}/,
    );
    expect(errorBlockMatch).not.toBeNull();
  });

  it("erro de listagem mostra botão de tentar novamente, nunca falha silenciosa", () => {
    expect(SOURCE).toContain("setListError(");
    expect(SOURCE).toContain('t("Tentar novamente")');
  });

  it("cache curto (TTL) por chave de organização+filtros+busca+página — revalida em segundo plano sem novo spinner quando morno", () => {
    expect(SOURCE).toMatch(/TRANSACTIONS_CACHE_TTL_MS\s*=\s*60_000/);
    expect(SOURCE).toContain("cacheRef.current.get(cacheKey)");
    expect(SOURCE).toContain("cacheRef.current.set(cacheKey,");
  });

  it("botões Anterior/Próxima existem e ficam desabilitados nos limites corretos", () => {
    expect(SOURCE).toContain('{t("Anterior")}');
    expect(SOURCE).toMatch(/disabled=\{currentPage === 1 \|\| pageTransitioning\}/);
    expect(SOURCE).toContain('{t("Página")} {currentPage}');
  });

  it("toda mutação (criar/editar/excluir/status/importação) invalida o cache e recarrega a página atual via refreshAfterMutation", () => {
    expect(SOURCE).toContain("const refreshAfterMutation = useCallback(async (opts: { resetToFirstPage?: boolean } = {}) => {");
    expect(SOURCE).toContain("cacheRef.current.clear();");
    expect(SOURCE).toContain("onDataChanged?.();");
    // Cada handler de escrita chama refreshAfterMutation (não recarrega com
    // um fetch-all próprio) — pelo menos 4 pontos de chamada (edição,
    // criação, exclusão e importação em lote/planilha).
    expect(SOURCE.match(/await refreshAfterMutation\(/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("exportação CSV usa apenas a página atualmente carregada (pageRows), nunca um fetch-all adicional", () => {
    expect(SOURCE).toContain("downloadCSVRaw(buildFinanceCsv(pageRows,");
  });

  it("toda consulta de listagem é filtrada por organization_id (isolamento multi-tenant)", () => {
    expect(SOURCE).toContain('supabase.from("transactions").select("*").eq("organization_id", church.id)');
  });
});
