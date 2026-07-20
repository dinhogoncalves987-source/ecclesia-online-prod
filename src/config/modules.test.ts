import { describe, expect, it } from "vitest";
import { getModuleDefinition, isModuleEnabled, isRouteEnabled, MODULE_REGISTRY } from "./modules";

describe("isModuleEnabled", () => {
  it("enables 'both' modules in production", () => {
    expect(isModuleEnabled("dashboard", "production")).toBe(true);
    expect(isModuleEnabled("finance.treasury", "production")).toBe(true);
    expect(isModuleEnabled("finance.accounts", "production")).toBe(true);
    expect(isModuleEnabled("wallet", "production")).toBe(true);
    expect(isModuleEnabled("gatekeeper", "production")).toBe(true);
  });

  it("enables 'both' modules in staging", () => {
    expect(isModuleEnabled("dashboard", "staging")).toBe(true);
    expect(isModuleEnabled("finance.treasury", "staging")).toBe(true);
    expect(isModuleEnabled("finance.accounts", "staging")).toBe(true);
  });

  // CORREÇÃO 2026-07-17: "Contas" passou a consultar `transactions` real
  // (contas a pagar/receber com status/data reais) — não usa mais
  // financeDemo como fonte de dado exibido. Promovido para "both".
  it("disables staging-only demo finance tabs in production", () => {
    expect(isModuleEnabled("finance.executive", "production")).toBe(false);
    expect(isModuleEnabled("finance.campaigns", "production")).toBe(false);
    expect(isModuleEnabled("finance.budget", "production")).toBe(false);
    expect(isModuleEnabled("finance.assets", "production")).toBe(false);
    expect(isModuleEnabled("finance.accountability", "production")).toBe(false);
    expect(isModuleEnabled("finance.audit", "production")).toBe(false);
    expect(isModuleEnabled("finance.intelligence", "production")).toBe(false);
  });

  it("enables staging-only demo finance tabs in staging", () => {
    expect(isModuleEnabled("finance.executive", "staging")).toBe(true);
    expect(isModuleEnabled("finance.campaigns", "staging")).toBe(true);
  });

  it("classifies TV Digital and Canal Ecclésia as stage-only", () => {
    expect(isModuleEnabled("tv-digital", "production")).toBe(false);
    expect(isModuleEnabled("tv-digital", "staging")).toBe(true);
    expect(isModuleEnabled("canal-ecclesia", "production")).toBe(false);
    expect(isModuleEnabled("canal-ecclesia", "staging")).toBe(true);
  });

  it("disables in-testing modules (Marketplace, Comunidade) in production — telas de maquete, sem backend real", () => {
    for (const id of ["marketplace", "community"] as const) {
      expect(isModuleEnabled(id, "production")).toBe(false);
      expect(isModuleEnabled(id, "staging")).toBe(true);
    }
  });

  // CORREÇÃO 2026-07-17: Bíblia/IA, Culto & Louvor, Campanhas, Cartas de
  // Recomendação e Relatórios não dependem de dado fictício exibido ao
  // usuário (todos têm backend real no Supabase) — nunca deveriam ter sido
  // staging-only. Promovidos para "both" após regressão que os removeu do
  // menu de produção.
  //
  // CORREÇÃO 2026-07-20: "devotional" teve a mesma regressão — a edge
  // function daily-devotional (banco de versículos reais) e a página
  // pública /devocional de compartilhamento não dependem de dado fictício.
  // Promovido de volta para "both".
  it("enables Bíblia/IA, Culto & Louvor, Campanhas, Cartas de Recomendação, Relatórios e Devocional em produção e staging", () => {
    for (const id of ["bible-ai", "worship", "campaigns", "recommendation-letters", "reports", "devotional"] as const) {
      expect(isModuleEnabled(id, "production")).toBe(true);
      expect(isModuleEnabled(id, "staging")).toBe(true);
    }
  });

  it("denies unknown module ids by default", () => {
    // @ts-expect-error — id intencionalmente inválido para testar o default-deny
    expect(isModuleEnabled("not-a-real-module", "staging")).toBe(false);
  });
});

describe("isRouteEnabled", () => {
  it("disables staging-only routes (maquetes sem backend real) in production", () => {
    expect(isRouteEnabled("/admin/marketplace", "production")).toBe(false);
    expect(isRouteEnabled("/admin/comunidade", "production")).toBe(false);
  });

  it("enables staging-only routes in staging", () => {
    expect(isRouteEnabled("/admin/marketplace", "staging")).toBe(true);
    expect(isRouteEnabled("/admin/comunidade", "staging")).toBe(true);
  });

  // CORREÇÃO 2026-07-17: /admin/biblia, /admin/culto*, /admin/campanhas,
  // /admin/cartas-recomendacao e /admin/relatorios devem funcionar em
  // produção também — todos com backend real, nenhum depende de dado
  // fictício.
  it("keeps Bíblia, Culto, Campanhas, Cartas de Recomendação e Relatórios enabled in both production and staging", () => {
    for (const path of [
      "/admin/biblia",
      "/admin/culto",
      "/admin/culto/telao",
      "/admin/campanhas",
      "/admin/cartas-recomendacao",
      "/admin/relatorios",
    ]) {
      expect(isRouteEnabled(path, "production")).toBe(true);
      expect(isRouteEnabled(path, "staging")).toBe(true);
    }
  });

  it("does not restrict routes absent from the route→module map", () => {
    expect(isRouteEnabled("/admin/membros", "production")).toBe(true);
    expect(isRouteEnabled("/admin/financeiro", "production")).toBe(true);
    expect(isRouteEnabled("/admin/porteiro", "production")).toBe(true);
  });
});

describe("MODULE_REGISTRY", () => {
  it("has no duplicate ids", () => {
    const ids = MODULE_REGISTRY.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns null for unknown module definitions", () => {
    // @ts-expect-error — id intencionalmente inválido
    expect(getModuleDefinition("not-a-real-module")).toBeNull();
  });
});
