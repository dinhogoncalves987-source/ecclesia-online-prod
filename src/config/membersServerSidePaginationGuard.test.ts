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

  it("o total é obtido via count exato do PostgREST, nunca via .length de um array baixado inteiro", () => {
    expect(SOURCE).toContain('{ count: "exact" }');
    expect(SOURCE).toContain("setTotalFilteredCount(total)");
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
