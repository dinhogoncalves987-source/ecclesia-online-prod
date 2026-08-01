import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

describe("atualizacao obrigatoria de release no PWA", () => {
  it("não permite dispensar silenciosamente uma versão nova", () => {
    const prompt = read("src/components/PWAUpdatePrompt.tsx");
    expect(prompt).toContain("registration.update()");
    expect(prompt).toContain("updateServiceWorker(true)");
    expect(prompt).not.toContain("handleDismiss");
    expect(prompt).not.toContain('{t("Depois")}');
  });

  it("monta o React antes de qualquer manutenção do PWA", () => {
    const main = read("src/main.tsx");
    const mountCall = main.indexOf("mount();");
    const migrationCall = main.indexOf("void runPwaMigration();");

    expect(mountCall).toBeGreaterThan(-1);
    expect(migrationCall).toBeGreaterThan(mountCall);
    expect(main).not.toContain("runPwaMigration().finally(mount)");
  });

  it("a limpeza legada não desregistra o Service Worker atual", () => {
    const migration = read("src/lib/pwaMigration.ts");
    expect(migration).not.toContain("getRegistrations()");
    expect(migration).not.toContain("reg.unregister()");
    expect(migration).toContain("caches.delete(name)");
  });
});
