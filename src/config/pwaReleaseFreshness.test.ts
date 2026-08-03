import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

describe("atualizacao obrigatoria de release no PWA", () => {
  it("aplica uma versão nova automaticamente no PWA instalado", () => {
    const viteConfig = read("vite.config.ts");
    const prompt = read("src/components/PWAUpdatePrompt.tsx");
    expect(viteConfig).toContain('registerType: "autoUpdate"');
    expect(viteConfig).toContain("skipWaiting: true");
    expect(viteConfig).toContain("clientsClaim: true");
    expect(prompt).toContain("registration.update()");
    expect(prompt).toContain('addEventListener("controllerchange"');
    expect(prompt).toContain('addEventListener("visibilitychange"');
    expect(prompt).toContain("window.location.reload()");
    expect(prompt).toContain("return null");
  });

  it("revalida capabilities ao montar, retomar e reconectar", () => {
    const bootstrap = read("src/hooks/useAuthBootstrap.ts");
    expect(bootstrap).toContain('refetchOnMount: "always"');
    expect(bootstrap).toContain('refetchOnWindowFocus: "always"');
    expect(bootstrap).toContain('refetchOnReconnect: "always"');
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
