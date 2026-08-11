import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * OPERAÇÃO PERFORMANCE SUPREMA — guarda de regressão para a tela Membros.
 *
 * Antes desta operação, src/pages/Membros.tsx buscava TODOS os membros da
 * organização em um loop `while (true)` (paginando 1.000 por vez no cliente),
 * ~7.121 linhas completas para uma organização real de staging, e calculava
 * contadores (total/ativos/visitantes/etc.) a partir do array inteiro já
 * carregado — inclusive mostrando "0" falso enquanto o download acontecia.
 *
 * Este teste NÃO renderiza o componente (que depende de contexto de auth,
 * igreja e roteamento pesados demais para simular com segurança aqui) — em
 * vez disso, faz uma verificação estática do código-fonte, no mesmo padrão
 * já usado por outros testes de guarda deste repositório (ex.:
 * pwaReleaseFreshness.test.ts). O objetivo é impedir que alguém reintroduza,
 * por engano, o padrão fetch-all — não validar UI pixel a pixel.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const SOURCE = readFileSync(path.join(ROOT, "src", "pages", "Membros.tsx"), "utf8");

describe("guarda de regressão — paginação server-side de Membros", () => {
  it("nunca reintroduz um loop de fetch-all (while(true)/hasMore acumulando página em array)", () => {
    // Exige a chave de abertura logo em seguida para não disparar em
    // comentários que apenas *descrevem*, no passado, o padrão já removido
    // (ex.: "substitui o antigo reloadMembers (while(true) + select(...))").
    expect(SOURCE).not.toMatch(/while\s*\(\s*true\s*\)\s*\{/);
    expect(SOURCE).not.toMatch(/while\s*\(\s*hasMore\w*\s*\)\s*\{/);
  });

  it("a página de listagem é limitada a no máximo 100 membros por requisição", () => {
    expect(SOURCE).toMatch(/MEMBERS_VIEW_PAGE_SIZE\s*=\s*100\b/);
    // A paginação real usa .range(), não apenas .slice() no array já carregado.
    expect(SOURCE).toContain(".range(from, to)");
  });

  // OPERAÇÃO: CORRIGIR TIMEOUT DA LISTA DE MEMBROS — count:"exact" também
  // causava "canceling statement due to statement timeout" durante busca
  // textual (a RLS hierárquica de public.members é avaliada por linha, então
  // contar TODO o conjunto candidato é caro mesmo quando o índice trigram
  // acelera achar as linhas). A partir desta correção, count:"exact" nunca é
  // solicitado em nenhum caminho da listagem — nem sem busca, nem com busca.
  it("listagem normal (sem busca) nunca solicita count:\"exact\" ao PostgREST", () => {
    expect(SOURCE).not.toContain('{ count: "exact" }');
    expect(SOURCE).not.toContain("count: \"exact\"");
  });

  it("busca textual também nunca solicita count:\"exact\" — não existe branch condicional que reintroduza a opção", () => {
    // needsExactCount era o flag que decidia entre pedir ou não count:"exact"
    // conforme havia busca ativa; sua simples existência já indicaria um
    // caminho ainda dependente de count. Não deve mais existir.
    expect(SOURCE).not.toMatch(/needsExactCount/);
    // A consulta a "members" é construída uma única vez, sem ramificação por
    // count, e usa apenas MEMBER_LIST_COLUMNS.
    expect(SOURCE).toMatch(/\.from\("members"\)\s*\.select\(MEMBER_LIST_COLUMNS\)/);
  });

  it("busca 1 linha além do tamanho da página (range(from, from + PAGE_SIZE)) para detectar próxima página sem contar", () => {
    expect(SOURCE).toContain("const to = from + MEMBERS_VIEW_PAGE_SIZE;");
  });

  it("a linha extra (101ª) só decide hasNextPage e é descartada da exibição, nunca renderizada", () => {
    expect(SOURCE).toContain("const pageHasNext = rows.length > MEMBERS_VIEW_PAGE_SIZE;");
    expect(SOURCE).toContain("rows.slice(0, MEMBERS_VIEW_PAGE_SIZE) : rows");
  });

  it("botão Próxima avança quando existe a linha adicional (hasNextPage) durante busca, e fica desabilitado quando não existe", () => {
    expect(SOURCE).toContain("(hasNextPage ? page + 1 : page)");
    expect(SOURCE).toContain("disabled={isSearchActive ? !hasNextPage : visiblePage === totalPages}");
  });

  it("botão Anterior funciona a partir da página 2 (habilitado sempre que visiblePage > 1), em qualquer modo", () => {
    expect(SOURCE).toContain("disabled={visiblePage === 1}");
    expect(SOURCE).toContain("setCurrentPage((page) => Math.max(1, page - 1))");
  });

  it("sem busca, o total exibido continua vindo exclusivamente da RPC member_status_counts, nunca de count:\"exact\"", () => {
    expect(SOURCE).toContain("if (!trimmedSearch) {");
    expect(SOURCE).toContain("const counts = statusCountsRef.current;");
  });

  it("com busca, nenhum total exato é fabricado — a UI usa hasNextPage + members.length, nunca um count do PostgREST", () => {
    expect(SOURCE).toMatch(/isSearchActive\s*\?\s*\(hasNextPage/);
    expect(SOURCE).toContain("resultados — há mais resultados");
  });

  // REVISÃO DO ALFRED — race condition: fetchMembersPage também chama
  // setMembers/setTotalFilteredCount/setHasNextPage, então um prefetch
  // automático da página seguinte (mesmo "silencioso") poderia substituir,
  // em segundo plano, a página que o usuário está vendo no momento. A
  // página seguinte só pode ser buscada por uma ação explícita do usuário
  // (clique em "Próxima").
  it("nunca prefetcha automaticamente a próxima página dentro de fetchMembersPage (sem race condition)", () => {
    expect(SOURCE).not.toMatch(/fetchMembersPage\(nextPage/);
    expect(SOURCE).not.toMatch(/const nextPage = page \+ 1;/);
  });

  it("busca a próxima página somente a partir do clique explícito no botão \"Próxima\"", () => {
    expect(SOURCE).toContain('aria-label="Próxima página"');
    expect(SOURCE).toMatch(/onClick=\{\(\)\s*=>\s*setCurrentPage\(\(page\)\s*=>\s*\(isSearchActive \? \(hasNextPage \? page \+ 1 : page\) : Math\.min\(totalPages, page \+ 1\)\)\)\}/);
  });

  it("trocar busca/filtro/contexto reseta hasNextPage — nunca herda o \"Próxima\" habilitado da busca/página anterior", () => {
    expect(SOURCE).toMatch(
      /setCurrentPage\(1\);\s*\/\/[^\n]*\n(\s*\/\/[^\n]*\n)*\s*setHasNextPage\(false\);\s*\}, \[searchQuery, filterStatus, contextFilter\?\.orgId\]\);/,
    );
  });

  it("erro visível na listagem limpa hasNextPage — nunca deixa \"Próxima\" habilitada com base numa resposta obsoleta", () => {
    const errorBlockMatch = SOURCE.match(
      /if \(error\) \{[\s\S]*?if \(!opts\.silent\) \{[\s\S]*?setHasNextPage\(false\);[\s\S]*?setListError\([\s\S]*?\}\s*return;\s*\}/,
    );
    expect(errorBlockMatch).not.toBeNull();
  });

  it("a listagem seleciona apenas as colunas necessárias (MEMBER_LIST_COLUMNS), não select(\"*\")", () => {
    const listQueryMatch = SOURCE.match(/\.from\("members"\)\s*\.select\(([^)]*)\)/);
    expect(listQueryMatch).not.toBeNull();
    expect(listQueryMatch![1]).toContain("MEMBER_LIST_COLUMNS");
    expect(listQueryMatch![1]).not.toContain('"*"');
  });

  it("busca (nome/CPF/telefone/WhatsApp/member_code) roda no servidor via search_blob, não filtro client-side", () => {
    expect(SOURCE).toContain('query.ilike("search_blob"');
    expect(SOURCE).not.toContain('from "@/lib/memberSearch"');
    // Verifica ausência da CHAMADA da função (não apenas do nome, que ainda
    // aparece em comentários explicando a migração para busca server-side).
    expect(SOURCE).not.toMatch(/matchesMemberSearch\s*\(/);
  });

  it("filtro de status roda no servidor (.eq(\"status\", ...)), não Array.prototype.filter no cliente", () => {
    expect(SOURCE).toContain('query.eq("status", filterStatus)');
  });

  it("contadores do cabeçalho vêm da RPC member_status_counts, nunca de Array.reduce sobre a página carregada", () => {
    expect(SOURCE).toContain('.rpc("member_status_counts"');
    expect(SOURCE).toContain("p_organization_id: church.id");
  });

  it("nunca mostra zero falso: contador de status inicia como null (\"—\"), não 0, enquanto carrega", () => {
    expect(SOURCE).toMatch(/useState<MemberStatusCounts \| null>\(null\)/);
    expect(SOURCE).toContain("countsLoading  = statusCounts === null");
  });

  it("toda consulta de listagem/contagem é filtrada por organization_id (isolamento multi-tenant)", () => {
    expect(SOURCE).toContain('.eq("organization_id", church.id)');
  });

  it("cancela requisições obsoletas ao trocar de página/filtro/busca (AbortController)", () => {
    expect(SOURCE).toContain("new AbortController()");
    expect(SOURCE).toContain(".abortSignal(controller.signal)");
    expect(SOURCE).toContain("membersAbortRef.current?.abort()");
  });

  it("busca tem debounce (não dispara uma requisição por tecla digitada)", () => {
    expect(SOURCE).toMatch(/setTimeout\(\(\)\s*=>\s*setSearchQuery\(searchInput\),\s*300\)/);
  });

  it("erro de listagem mostra botão de tentar novamente, nunca falha silenciosa", () => {
    expect(SOURCE).toContain("setListError(");
    expect(SOURCE).toContain('t("Tentar novamente")');
  });

  it("detalhes completos (ficha do membro) só são buscados quando o membro é aberto, não pré-carregados na listagem", () => {
    expect(SOURCE).toContain("const openEdit = async (id: string) => {");
    expect(SOURCE).toContain('.select("*")');
    expect(SOURCE).toContain("setEditLoading(true)");
  });
});
