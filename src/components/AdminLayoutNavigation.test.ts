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
  const secretaria = section("secretaria", "portaria");

  it.each([
    "/admin/discipulado",
    "/admin/teologia",
    "/admin/missoes",
  ])("%s fica dentro da Secretaria e não na seção espiritual", (route) => {
    expect(secretaria).toContain(route);
    expect(espiritual).not.toContain(route);
  });

  it.each([
    "/admin/discipulado",
    "/admin/teologia",
    "/admin/missoes",
  ])("%s expande automaticamente a Secretaria", (route) => {
    const paths = source.slice(
      source.indexOf("const SECRETARIA_PATHS"),
      source.indexOf("const GLOBAL_CHAT_PATH"),
    );
    expect(paths).toContain(route);
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
