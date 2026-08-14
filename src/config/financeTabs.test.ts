import { describe, it, expect } from "vitest";
import {
  FINANCE_TAB_DEFINITIONS,
  FINANCE_TABS_REQUIRING_FULL_TRANSACTIONS,
  financeTabRequiresFullTransactions,
  getFinanceTabDefinition,
} from "./financeTabs";

const REQUIRED_LABELS = [
  "Executivo",
  "Tesouraria",
  "Dízimos & Ofertas",
  "Campanhas",
  "Contas",
  "Orçamento",
  "Patrimônio",
  "Prestação de Contas",
  "Auditoria",
];

describe("FINANCE_TAB_DEFINITIONS — fonte única de título/descrição das abas do Financeiro", () => {
  it("define exatamente as 10 abas obrigatórias", () => {
    expect(FINANCE_TAB_DEFINITIONS).toHaveLength(10);
  });

  it("cada aba tem chave, labelKey (título), descriptionKey (descrição curta) e moduleId — nenhum vazio", () => {
    for (const tab of FINANCE_TAB_DEFINITIONS) {
      expect(tab.key.length).toBeGreaterThan(0);
      expect(tab.labelKey.length).toBeGreaterThan(0);
      expect(tab.descriptionKey.length).toBeGreaterThan(0);
      expect(tab.moduleId.length).toBeGreaterThan(0);
    }
  });

  it("todas as chaves são únicas", () => {
    const keys = FINANCE_TAB_DEFINITIONS.map(tab => tab.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("inclui as abas obrigatórias: Executivo, Tesouraria, Dízimos & Ofertas, Campanhas, Contas, Orçamento, Patrimônio, Prestação de Contas, Auditoria e a Inteligência/Indicadores Financeiros", () => {
    const labels = FINANCE_TAB_DEFINITIONS.map(tab => tab.labelKey);
    for (const required of REQUIRED_LABELS) {
      expect(labels).toContain(required);
    }
    expect(labels.some(label => label.includes("Inteligência"))).toBe(true);
  });

  it("getFinanceTabDefinition encontra a definição pela chave e retorna undefined para chave desconhecida", () => {
    expect(getFinanceTabDefinition("treasury")?.labelKey).toBe("Tesouraria");
    expect(getFinanceTabDefinition("nao-existe")).toBeUndefined();
  });
});

describe("financeTabRequiresFullTransactions — CORREÇÃO C3.1: nenhuma aba usa mais o array completo", () => {
  it("Tesouraria nunca precisa do array completo — usa paginação server-side própria", () => {
    expect(financeTabRequiresFullTransactions("treasury")).toBe(false);
  });

  it("Contas, Campanhas, Patrimônio e Auditoria não dependem do array completo (telas próprias)", () => {
    for (const key of ["accounts", "campaigns", "assets", "audit"]) {
      expect(financeTabRequiresFullTransactions(key)).toBe(false);
    }
  });

  it("Executivo, Dízimos & Ofertas, Orçamento, Prestação de Contas e Inteligência foram migradas para dados agregados/paginados — nenhuma consome mais o array completo", () => {
    for (const key of ["executive", "tithes", "budget", "accountability", "intelligence"]) {
      expect(financeTabRequiresFullTransactions(key)).toBe(false);
    }
    expect(FINANCE_TABS_REQUIRING_FULL_TRANSACTIONS).toHaveLength(0);
  });
});
