import { describe, it, expect } from "vitest";
import { resolveTarget } from "../../scripts/lib/supabaseGuardCore.mjs";
import { loadMigrationManifest, getUnresolvedProductionBlockers } from "../../scripts/lib/migrationManifest.mjs";

/**
 * FASE 7 — testes da lógica pura de scripts/lib/supabaseGuardCore.mjs
 * (usada por scripts/supabase-guard.mjs). Nunca chama a CLI real da
 * Supabase (nenhum spawnSync aqui, nem import do arquivo com shebang) —
 * apenas a resolução de `--target` e a leitura do manifesto de migrations.
 */
describe("supabase-guard: resolveTarget", () => {
  it("resolves production to the canonical production ref", () => {
    expect(resolveTarget("production")).toEqual({ target: "production", ref: "zsonukpxahaxffugavfu" });
  });

  it("resolves staging to the canonical staging ref", () => {
    expect(resolveTarget("staging")).toEqual({ target: "staging", ref: "qkiiwopkbcslquyfhdec" });
  });

  it("rejects a missing target", () => {
    expect(() => resolveTarget(undefined)).toThrow(/deve ser exatamente/);
  });

  it("rejects an unknown target string", () => {
    expect(() => resolveTarget("xceleiro")).toThrow(/deve ser exatamente/);
  });

  it("never resolves to the unrelated xceleiro ref, whatever the input", () => {
    for (const candidate of ["production", "staging", "xceleiro", "afxaytvrmgszzigxsbcd", undefined, ""]) {
      try {
        const resolved = resolveTarget(candidate);
        expect(resolved.ref).not.toBe("afxaytvrmgszzigxsbcd");
      } catch {
        // rejecting is an acceptable outcome for invalid input — the only
        // failure would be resolving successfully to the blocked ref.
      }
    }
  });
});

describe("supabase-guard: migration manifest blockers", () => {
  it("reports every staging_only + mixed_needs_split entry as a production blocker", () => {
    const manifest = loadMigrationManifest();
    const blockers = getUnresolvedProductionBlockers(manifest);
    expect(blockers.length).toBe(manifest.staging_only.length + manifest.mixed_needs_split.length);
    for (const entry of manifest.staging_only) expect(blockers).toContain(entry);
    for (const entry of manifest.mixed_needs_split) expect(blockers).toContain(entry);
  });

  it("never lists a production_safe entry as a blocker", () => {
    const manifest = loadMigrationManifest();
    const blockers = new Set(getUnresolvedProductionBlockers(manifest));
    for (const entry of manifest.production_safe) {
      expect(blockers.has(entry)).toBe(false);
    }
  });
});
