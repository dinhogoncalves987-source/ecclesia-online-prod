import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * FASE 1D-C3 (PASSO 4/5) — guarda de regressão dos títulos mobile das abas
 * do Financeiro (src/pages/Financeiro.tsx).
 *
 * Antes desta operação, no mobile só o ícone de cada aba era visível na
 * barra horizontal (o rótulo de texto usa `hidden sm:inline`), deixando
 * ambíguo qual seção estava ativa. A partir desta operação, um bloco
 * `sm:hidden` abaixo da barra de ícones mostra nome + descrição da aba
 * ativa, lidos de uma única fonte de verdade (FINANCE_TAB_DEFINITIONS em
 * src/config/financeTabs.ts), atualizado imediatamente ao trocar de aba.
 *
 * Verificação estática do código-fonte — não renderiza o componente
 * (depende de contexto de auth/igreja pesado demais para simular aqui).
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const SOURCE = readFileSync(path.join(ROOT, "src", "pages", "Financeiro.tsx"), "utf8");

describe("guarda de regressão — títulos/descrições mobile das abas do Financeiro", () => {
  it("usa FINANCE_TAB_DEFINITIONS (fonte única) em vez de uma lista de abas duplicada", () => {
    expect(SOURCE).toContain('from "@/config/financeTabs"');
    expect(SOURCE).toContain("FINANCE_TAB_DEFINITIONS");
    expect(SOURCE).toContain("const ALL_TABS = FINANCE_TAB_DEFINITIONS.map(tab => ({ ...tab, icon: TAB_ICONS[tab.key] }));");
  });

  it("renderiza, abaixo da barra de ícones, um bloco visível somente no mobile (sm:hidden) com título e descrição da aba ativa", () => {
    expect(SOURCE).toMatch(/className="sm:hidden[^"]*"/);
    expect(SOURCE).toContain("activeTabDefinition");
    expect(SOURCE).toContain("{t(activeTabDefinition.labelKey)}");
    expect(SOURCE).toContain("{t(activeTabDefinition.descriptionKey)}");
  });

  it("o bloco de título mobile usa key={activeTab} — força atualização imediata ao trocar de aba", () => {
    expect(SOURCE).toMatch(/<div key=\{activeTab\} className="sm:hidden/);
  });

  it("o bloco de título mobile é anunciado a leitores de tela (aria-live)", () => {
    expect(SOURCE).toContain('aria-live="polite"');
  });

  it("cada botão de aba tem aria-label com o nome da aba — ícone sozinho nunca é o único identificador acessível", () => {
    expect(SOURCE).toContain("aria-label={t(tab.labelKey)}");
    expect(SOURCE).toContain('aria-current={isActive ? "true" : undefined}');
  });

  it("não cria múltiplos cabeçalhos de aba espalhados — apenas o bloco central usa FINANCE_TAB_DEFINITIONS", () => {
    // getFinanceTabDefinition é chamado uma única vez, fora do JSX, e o
    // resultado (activeTabDefinition) é reutilizado no bloco de título.
    expect(SOURCE.match(/getFinanceTabDefinition\(/g)?.length).toBe(1);
  });

  it("CORREÇÃO C3.1: não baixa mais o array completo de transactions em nenhum caminho (nenhuma aba, nunca)", () => {
    expect(SOURCE).not.toMatch(/useEffect\(\(\) => \{\s*if \(!user \|\| !church\) \{ setLoading\(false\); return; \}/);
    expect(SOURCE).not.toContain('.from("transactions")');
    expect(SOURCE).not.toContain("setTransactions");
    expect(SOURCE).not.toContain("fullTransactionsLoading");
    expect(SOURCE).not.toContain("loadedTransactionsTokenRef");
  });

  it("Tesouraria (TransactionList) e Visão Geral (FinanceOverview) não recebem mais a prop transactions", () => {
    expect(SOURCE).toContain("<TransactionList onDataChanged={handleDataChanged} />");
    expect(SOURCE).toContain("<FinanceOverview reloadToken={reloadToken} />");
    expect(SOURCE).not.toMatch(/<TransactionList transactions=/);
    expect(SOURCE).not.toMatch(/<FinanceOverview transactions=/);
  });

  it("mutações (import/exclusão/reset) disparam reloadToken, que revalida os dados agregados/paginados de cada aba", () => {
    expect(SOURCE).toContain("const [reloadToken, setReloadToken] = useState(0);");
    expect(SOURCE).toContain("const handleDataChanged = useCallback(() => setReloadToken(token => token + 1), []);");
  });

  it("CORREÇÃO C3.1: Executivo, Dízimos & Ofertas, Orçamento, Prestação de Contas e Inteligência recebem reloadToken, nunca transactions", () => {
    expect(SOURCE).toMatch(/<FinanceExecutive onTabChange=\{navigateToTab\} reloadToken=\{reloadToken\} \/>/);
    expect(SOURCE).toMatch(/<FinanceTithesOfferings reloadToken=\{reloadToken\} \/>/);
    expect(SOURCE).toMatch(/<FinanceBudget reloadToken=\{reloadToken\} \/>/);
    expect(SOURCE).toMatch(/<FinanceAccountability reloadToken=\{reloadToken\} \/>/);
    expect(SOURCE).toMatch(/<FinanceIntelligence onTabChange=\{navigateToTab\} reloadToken=\{reloadToken\} \/>/);
    expect(SOURCE).not.toMatch(/transactions=\{transactions\}/);
  });
});
