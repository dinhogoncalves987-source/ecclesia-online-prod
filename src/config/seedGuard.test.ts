import { describe, expect, it } from "vitest";
import {
  SeedGuardError,
  assertSafeToSeedStaging,
  extractProjectRefFromUrl,
  // @ts-expect-error — módulo .mjs sem tipos declarados, consumido apenas em teste
} from "../../scripts/lib/seedGuard.mjs";

const STAGING_URL = "https://qkiiwopkbcslquyfhdec.supabase.co";
const PRODUCTION_URL = "https://zsonukpxahaxffugavfu.supabase.co";

describe("extractProjectRefFromUrl", () => {
  it("extracts the ref from a Supabase URL", () => {
    expect(extractProjectRefFromUrl(STAGING_URL)).toBe("qkiiwopkbcslquyfhdec");
  });

  it("returns null for an invalid URL", () => {
    expect(extractProjectRefFromUrl("not-a-url")).toBeNull();
  });
});

describe("assertSafeToSeedStaging", () => {
  const validInput = {
    appEnv: "staging",
    supabaseUrl: STAGING_URL,
    seedStagingConfirmation: "SEED_STAGING",
    productionRef: "zsonukpxahaxffugavfu",
    stagingRef: "qkiiwopkbcslquyfhdec",
  };

  it("allows a well-formed staging seed request", () => {
    expect(assertSafeToSeedStaging(validInput)).toEqual({ projectRef: "qkiiwopkbcslquyfhdec" });
  });

  it("rejects when APP_ENV is not staging", () => {
    expect(() => assertSafeToSeedStaging({ ...validInput, appEnv: "production" })).toThrow(
      SeedGuardError,
    );
    expect(() => assertSafeToSeedStaging({ ...validInput, appEnv: undefined })).toThrow(
      SeedGuardError,
    );
  });

  it("rejects the production ref outright, even with APP_ENV=staging", () => {
    expect(() =>
      assertSafeToSeedStaging({ ...validInput, supabaseUrl: PRODUCTION_URL }),
    ).toThrow(SeedGuardError);
  });

  it("rejects a ref that does not match the configured staging ref", () => {
    expect(() =>
      assertSafeToSeedStaging({
        ...validInput,
        supabaseUrl: "https://someotherref123.supabase.co",
      }),
    ).toThrow(SeedGuardError);
  });

  it("rejects when SEED_STAGING confirmation is missing or wrong", () => {
    expect(() =>
      assertSafeToSeedStaging({ ...validInput, seedStagingConfirmation: undefined }),
    ).toThrow(SeedGuardError);
    expect(() =>
      assertSafeToSeedStaging({ ...validInput, seedStagingConfirmation: "yes" }),
    ).toThrow(SeedGuardError);
  });

  it("rejects an unparseable Supabase URL", () => {
    expect(() => assertSafeToSeedStaging({ ...validInput, supabaseUrl: "" })).toThrow(
      SeedGuardError,
    );
  });
});
