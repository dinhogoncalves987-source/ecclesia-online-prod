import { describe, expect, it } from "vitest";
import { getModuleDefinition, isModuleEnabled, isRouteEnabled, MODULE_REGISTRY } from "./modules";

describe("isModuleEnabled", () => {
  it("enables 'both' modules in production", () => {
    expect(isModuleEnabled("dashboard", "production")).toBe(true);
    expect(isModuleEnabled("finance.treasury", "production")).toBe(true);
    expect(isModuleEnabled("wallet", "production")).toBe(true);
    expect(isModuleEnabled("gatekeeper", "production")).toBe(true);
  });

  it("enables 'both' modules in staging", () => {
    expect(isModuleEnabled("dashboard", "staging")).toBe(true);
    expect(isModuleEnabled("finance.treasury", "staging")).toBe(true);
  });

  it("disables staging-only demo finance tabs in production", () => {
    expect(isModuleEnabled("finance.executive", "production")).toBe(false);
    expect(isModuleEnabled("finance.campaigns", "production")).toBe(false);
    expect(isModuleEnabled("finance.accounts", "production")).toBe(false);
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

  it("disables in-testing modules (Bíblia/IA, Devocional, Culto, Campanhas, Marketplace, Comunidade, Relatórios) in production", () => {
    for (const id of [
      "bible-ai",
      "devotional",
      "worship",
      "campaigns",
      "marketplace",
      "community",
      "reports",
      "recommendation-letters",
    ] as const) {
      expect(isModuleEnabled(id, "production")).toBe(false);
      expect(isModuleEnabled(id, "staging")).toBe(true);
    }
  });

  it("denies unknown module ids by default", () => {
    // @ts-expect-error — id intencionalmente inválido para testar o default-deny
    expect(isModuleEnabled("not-a-real-module", "staging")).toBe(false);
  });
});

describe("isRouteEnabled", () => {
  it("disables staging-only routes in production", () => {
    expect(isRouteEnabled("/admin/campanhas", "production")).toBe(false);
    expect(isRouteEnabled("/admin/biblia", "production")).toBe(false);
    expect(isRouteEnabled("/admin/culto", "production")).toBe(false);
    expect(isRouteEnabled("/admin/culto/telao", "production")).toBe(false);
    expect(isRouteEnabled("/admin/cartas-recomendacao", "production")).toBe(false);
    expect(isRouteEnabled("/admin/relatorios", "production")).toBe(false);
    expect(isRouteEnabled("/admin/marketplace", "production")).toBe(false);
    expect(isRouteEnabled("/admin/comunidade", "production")).toBe(false);
  });

  it("enables staging-only routes in staging", () => {
    expect(isRouteEnabled("/admin/campanhas", "staging")).toBe(true);
    expect(isRouteEnabled("/admin/biblia", "staging")).toBe(true);
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
