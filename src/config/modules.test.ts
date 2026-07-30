import { describe, expect, it } from "vitest";
import {
  getModuleDefinition,
  isModuleEnabled,
  isRouteEnabled,
  listEnabledModules,
  MODULE_REGISTRY,
  type ModuleId,
} from "./modules";

const ENABLED: readonly ModuleId[] = [
  "dashboard",
  "members",
  "congregations",
  "institutional-config",
  "access-management",
  "wallet",
  "official-documents",
  "finance.treasury",
  "finance.accounts",
  "discipleship",
  "theology",
  "missions",
];

const DEFERRED: readonly ModuleId[] = [
  "marketplace",
  "community",
  "tv-digital",
  "canal-ecclesia",
];

describe("paridade de módulos entre staging e produção", () => {
  it.each(ENABLED)("%s fica habilitado igualmente nos dois ambientes", (id) => {
    expect(isModuleEnabled(id, "staging")).toBe(true);
    expect(isModuleEnabled(id, "production")).toBe(true);
  });

  it.each(DEFERRED)("%s fica desabilitado igualmente nos dois ambientes", (id) => {
    expect(isModuleEnabled(id, "staging")).toBe(false);
    expect(isModuleEnabled(id, "production")).toBe(false);
  });

  it("expõe exatamente a mesma allowlist nos dois ambientes", () => {
    expect(listEnabledModules("staging")).toEqual(listEnabledModules("production"));
  });

  it("mantém documentos oficiais e suas rotas nos dois ambientes", () => {
    expect(isRouteEnabled("/admin/cartas-transferencia", "staging")).toBe(true);
    expect(isRouteEnabled("/admin/cartas-transferencia", "production")).toBe(true);
    expect(isRouteEnabled("/admin/certificados", "staging")).toBe(true);
    expect(isRouteEnabled("/admin/certificados", "production")).toBe(true);
  });

  it("mantém somente as rotas adiadas fechadas nos dois ambientes", () => {
    for (const path of [
      "/admin/marketplace",
      "/admin/comunidade",
    ]) {
      expect(isRouteEnabled(path, "staging")).toBe(false);
      expect(isRouteEnabled(path, "production")).toBe(false);
    }
  });

  it("mantém Discipulado, Teologia e Missões disponíveis nos dois ambientes", () => {
    for (const path of [
      "/admin/discipulado",
      "/admin/teologia",
      "/admin/missoes",
    ]) {
      expect(isRouteEnabled(path, "staging")).toBe(true);
      expect(isRouteEnabled(path, "production")).toBe(true);
    }
  });

  it("não restringe rotas comuns ausentes do mapa", () => {
    expect(isRouteEnabled("/admin/membros", "staging")).toBe(true);
    expect(isRouteEnabled("/admin/membros", "production")).toBe(true);
  });
});

describe("MODULE_REGISTRY", () => {
  it("não possui ids duplicados", () => {
    const ids = MODULE_REGISTRY.map((module) => module.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("nega módulo desconhecido por padrão", () => {
    // @ts-expect-error id propositalmente inválido
    expect(isModuleEnabled("not-a-real-module", "staging")).toBe(false);
    // @ts-expect-error id propositalmente inválido
    expect(getModuleDefinition("not-a-real-module")).toBeNull();
  });
});
