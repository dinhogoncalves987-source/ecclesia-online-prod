import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(dirname, "AdminLayout.tsx"), "utf8");

function section(id: string, nextId: string): string {
  const start = source.indexOf(`id: "${id}"`);
  const end = source.indexOf(`id: "${nextId}"`, start);
  return source.slice(start, end);
}

describe("AdminLayout — navegação e altura responsiva", () => {
  const espiritual = section("espiritual", "secretaria");
  const secretaria = section("secretaria", "financeiro");
  const financeiro = section("financeiro", "relatorios");
  const relatorios = section("relatorios", "portaria");
  const portaria = section("portaria", "admin");

  it.each([
    "/admin/discipulado",
    "/admin/teologia",
    "/admin/missoes",
  ])("%s fica abaixo do Financeiro e fora da Secretaria", (route) => {
    expect(financeiro).toContain(route);
    expect(secretaria).not.toContain(route);
    expect(espiritual).not.toContain(route);
  });

  it("não expande a Secretaria ao abrir os módulos operacionais", () => {
    const paths = source.slice(
      source.indexOf("const SECRETARIA_PATHS"),
      source.indexOf("const GLOBAL_CHAT_PATH"),
    );
    expect(paths).not.toContain("/admin/discipulado");
    expect(paths).not.toContain("/admin/teologia");
    expect(paths).not.toContain("/admin/missoes");
  });

  it("mantém a ordem Financeiro, Missões, Teologia, Discipulado, Relatórios e Portaria", () => {
    expect(financeiro.indexOf("/admin/financeiro")).toBeLessThan(
      financeiro.indexOf("/admin/missoes"),
    );
    expect(financeiro.indexOf("/admin/missoes")).toBeLessThan(
      financeiro.indexOf("/admin/teologia"),
    );
    expect(financeiro.indexOf("/admin/teologia")).toBeLessThan(
      financeiro.indexOf("/admin/discipulado"),
    );
    expect(relatorios).toContain("/admin/relatorios");
    expect(portaria).toContain("/admin/porteiro");
    expect(source.indexOf('id: "relatorios"')).toBeLessThan(
      source.indexOf('id: "portaria"'),
    );
  });

  it("mantém a lista rolável entre cabeçalho e rodapé fixos", () => {
    expect(source).toContain(
      'className="flex-1 min-h-0 px-3 py-2 overflow-y-auto overscroll-contain"',
    );
    expect(source).toContain(
      'className="shrink-0 p-3 border-t border-border/50 space-y-1"',
    );
  });

  it("desconta do desktop a altura conhecida do banner de staging", () => {
    expect(source).toContain('"lg:h-[calc(100dvh-1.75rem)]"');
    expect(source).toContain('"lg:h-dvh"');
  });
});
