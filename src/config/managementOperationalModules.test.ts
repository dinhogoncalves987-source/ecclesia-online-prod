import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isModuleEnabled, isRouteEnabled } from "./modules";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const appSource = readFileSync(path.join(ROOT, "src", "App.tsx"), "utf8");
const navigationSource = readFileSync(
  path.join(ROOT, "src", "components", "AdminLayout.tsx"),
  "utf8",
);
const bundleVerifierSource = readFileSync(
  path.join(ROOT, "scripts", "verify-production-bundle.mjs"),
  "utf8",
);

const MODULES = [
  {
    id: "discipleship" as const,
    path: "/admin/discipulado",
    page: "Discipulado",
    label: "Discipulado",
  },
  {
    id: "theology" as const,
    path: "/admin/teologia",
    page: "Teologia",
    label: "Teologia",
  },
  {
    id: "missions" as const,
    path: "/admin/missoes",
    page: "Missoes",
    label: "Missões",
  },
] as const;

describe("módulos operacionais da gestão", () => {
  it.each(MODULES)("$label permanece habilitado nos dois ambientes", ({ id, path }) => {
    expect(isModuleEnabled(id, "staging")).toBe(true);
    expect(isModuleEnabled(id, "production")).toBe(true);
    expect(isRouteEnabled(path, "staging")).toBe(true);
    expect(isRouteEnabled(path, "production")).toBe(true);
  });

  it.each(MODULES)("$label mantém página real, rota e item de menu", ({ path, page, label }) => {
    expect(appSource).toContain(
      `const ${page} = lazy(() => import("./pages/${page}"));`,
    );
    expect(appSource).toContain(
      `<Route path="${path}" element={<ProtectedRoute><ModuleGate`,
    );
    expect(appSource).toContain(`<${page} />`);
    expect(navigationSource).toContain(`label: "${label}", path: "${path}"`);
  });

  it.each(MODULES)("$label não é proibido no bundle de produção", ({ page }) => {
    expect(bundleVerifierSource).not.toContain(`"pages/${page}"`);
  });
});
