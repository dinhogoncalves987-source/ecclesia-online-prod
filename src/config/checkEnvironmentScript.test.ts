import { describe, expect, it } from "vitest";
// @ts-expect-error — módulo .mjs sem tipos declarados, consumido apenas em teste
import { runEnvironmentCheck } from "../../scripts/check-environment.mjs";

const PROD_REF = "zsonukpxahaxffugavfu";
const STAGING_REF = "qkiiwopkbcslquyfhdec";

function baseVercelProductionEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    VITE_APP_ENV: "production",
    VITE_SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
    VITE_EXPECTED_SUPABASE_PROJECT_REF: PROD_REF,
    VITE_PUBLIC_APP_URL: "https://ecclesiabr.online",
    SUPABASE_PRODUCTION_REF: PROD_REF,
    SUPABASE_STAGING_REF: STAGING_REF,
    OFFICIAL_PRODUCTION_DOMAIN: "ecclesiabr.online",
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
    ...overrides,
  };
}

function baseVercelStagingEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    VITE_APP_ENV: "staging",
    VITE_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
    VITE_EXPECTED_SUPABASE_PROJECT_REF: STAGING_REF,
    VITE_PUBLIC_APP_URL: "https://staging.ecclesiabr.example",
    SUPABASE_PRODUCTION_REF: PROD_REF,
    SUPABASE_STAGING_REF: STAGING_REF,
    OFFICIAL_PRODUCTION_DOMAIN: "ecclesiabr.online",
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "staging",
    ...overrides,
  };
}

describe("runEnvironmentCheck — casos válidos", () => {
  it("passes for a well-formed production build on Vercel/main", () => {
    const result = runEnvironmentCheck(baseVercelProductionEnv());
    expect(result.appEnv).toBe("production");
    expect(result.projectRef).toBe(PROD_REF);
  });

  it("passes for a well-formed staging/preview build on Vercel", () => {
    const result = runEnvironmentCheck(baseVercelStagingEnv());
    expect(result.appEnv).toBe("staging");
    expect(result.projectRef).toBe(STAGING_REF);
  });
});

describe("runEnvironmentCheck — bloqueios obrigatórios", () => {
  it("fails: production build using the staging ref", () => {
    expect(() =>
      runEnvironmentCheck(
        baseVercelProductionEnv({
          VITE_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
          VITE_EXPECTED_SUPABASE_PROJECT_REF: STAGING_REF,
        }),
      ),
    ).toThrow();
  });

  it("fails: staging build using the production ref", () => {
    expect(() =>
      runEnvironmentCheck(
        baseVercelStagingEnv({
          VITE_SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
          VITE_EXPECTED_SUPABASE_PROJECT_REF: PROD_REF,
        }),
      ),
    ).toThrow();
  });

  it("fails: URL ref differs from the expected ref", () => {
    expect(() =>
      runEnvironmentCheck(
        baseVercelStagingEnv({ VITE_EXPECTED_SUPABASE_PROJECT_REF: "someotherref00" }),
      ),
    ).toThrow();
  });

  it("fails: official domain used in staging", () => {
    expect(() =>
      runEnvironmentCheck(baseVercelStagingEnv({ VITE_PUBLIC_APP_URL: "https://ecclesiabr.online" })),
    ).toThrow();
  });

  it("fails: staging domain used in production", () => {
    expect(() =>
      runEnvironmentCheck(
        baseVercelProductionEnv({ VITE_PUBLIC_APP_URL: "https://staging.ecclesiabr.example" }),
      ),
    ).toThrow();
  });

  it("fails: missing required variable (VITE_EXPECTED_SUPABASE_PROJECT_REF)", () => {
    expect(() =>
      runEnvironmentCheck(baseVercelProductionEnv({ VITE_EXPECTED_SUPABASE_PROJECT_REF: undefined })),
    ).toThrow();
  });

  it("fails: production requires branch main", () => {
    expect(() =>
      runEnvironmentCheck(baseVercelProductionEnv({ VERCEL_GIT_COMMIT_REF: "revisao-integrada-2026-07-15" })),
    ).toThrow();
  });

  it("fails: production requires VITE_APP_ENV=production on Vercel Environment production", () => {
    expect(() =>
      runEnvironmentCheck(baseVercelProductionEnv({ VERCEL_ENV: "preview" })),
    ).toThrow();
  });

  it("fails: local (non-Vercel) usage of production is refused", () => {
    expect(() =>
      runEnvironmentCheck(baseVercelProductionEnv({ VERCEL: undefined, VERCEL_ENV: undefined, VERCEL_GIT_COMMIT_REF: undefined })),
    ).toThrow();
  });

  it("passes: local (non-Vercel) usage of staging is the accepted default", () => {
    expect(() =>
      runEnvironmentCheck(baseVercelStagingEnv({ VERCEL: undefined, VERCEL_ENV: undefined, VERCEL_GIT_COMMIT_REF: undefined })),
    ).not.toThrow();
  });
});
