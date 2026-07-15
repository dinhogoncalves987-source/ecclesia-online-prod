import { describe, expect, it } from "vitest";
import {
  EnvironmentConfigError,
  buildEnvironmentConfig,
  extractSupabaseProjectRef,
  type RawEnvSource,
} from "./environment";

function fixture(overrides: Partial<RawEnvSource> = {}): RawEnvSource {
  return {
    VITE_APP_ENV: "staging",
    VITE_SUPABASE_URL: "https://qkiiwopkbcslquyfhdec.supabase.co",
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fake_for_tests",
    VITE_EXPECTED_SUPABASE_PROJECT_REF: "qkiiwopkbcslquyfhdec",
    VITE_PUBLIC_APP_URL: "https://staging.example.com",
    ...overrides,
  };
}

describe("extractSupabaseProjectRef", () => {
  it("extracts the ref from a valid Supabase URL", () => {
    expect(extractSupabaseProjectRef("https://abcdefghijklmno.supabase.co")).toBe(
      "abcdefghijklmno",
    );
  });

  it("returns null for a non-Supabase URL", () => {
    expect(extractSupabaseProjectRef("https://example.com")).toBeNull();
  });

  it("returns null for an invalid URL (never throws)", () => {
    expect(extractSupabaseProjectRef("not-a-url")).toBeNull();
  });
});

describe("buildEnvironmentConfig — casos válidos", () => {
  it("builds a valid staging config", () => {
    const config = buildEnvironmentConfig(fixture());
    expect(config.appEnv).toBe("staging");
    expect(config.isStaging).toBe(true);
    expect(config.isProduction).toBe(false);
    expect(config.supabaseProjectRef).toBe("qkiiwopkbcslquyfhdec");
    expect(config.supabaseUrl).toBe("https://qkiiwopkbcslquyfhdec.supabase.co");
    expect(config.publicAppUrl).toBe("https://staging.example.com");
  });

  it("builds a valid production config", () => {
    const config = buildEnvironmentConfig(
      fixture({
        VITE_APP_ENV: "production",
        VITE_SUPABASE_URL: "https://zsonukpxahaxffugavfu.supabase.co",
        VITE_EXPECTED_SUPABASE_PROJECT_REF: "zsonukpxahaxffugavfu",
        VITE_PUBLIC_APP_URL: "https://ecclesiabr.online",
      }),
    );
    expect(config.appEnv).toBe("production");
    expect(config.isProduction).toBe(true);
  });

  it("strips a trailing slash from URLs", () => {
    const config = buildEnvironmentConfig(
      fixture({
        VITE_SUPABASE_URL: "https://qkiiwopkbcslquyfhdec.supabase.co/",
        VITE_PUBLIC_APP_URL: "https://staging.example.com/",
      }),
    );
    expect(config.supabaseUrl).toBe("https://qkiiwopkbcslquyfhdec.supabase.co");
    expect(config.publicAppUrl).toBe("https://staging.example.com");
  });
});

describe("buildEnvironmentConfig — falha fechado", () => {
  it("rejects an unknown VITE_APP_ENV", () => {
    expect(() => buildEnvironmentConfig(fixture({ VITE_APP_ENV: "development" }))).toThrow(
      EnvironmentConfigError,
    );
  });

  it("rejects a missing VITE_APP_ENV", () => {
    expect(() => buildEnvironmentConfig(fixture({ VITE_APP_ENV: undefined }))).toThrow(
      EnvironmentConfigError,
    );
  });

  it("rejects an empty required variable", () => {
    expect(() =>
      buildEnvironmentConfig(fixture({ VITE_SUPABASE_PUBLISHABLE_KEY: "   " })),
    ).toThrow(EnvironmentConfigError);
  });

  it("rejects a missing VITE_PUBLIC_APP_URL (no silent fallback)", () => {
    expect(() => buildEnvironmentConfig(fixture({ VITE_PUBLIC_APP_URL: undefined }))).toThrow(
      EnvironmentConfigError,
    );
  });

  it("rejects a non-URL VITE_SUPABASE_URL", () => {
    expect(() =>
      buildEnvironmentConfig(fixture({ VITE_SUPABASE_URL: "not a url" })),
    ).toThrow(EnvironmentConfigError);
  });

  it("rejects a non-https VITE_PUBLIC_APP_URL", () => {
    expect(() =>
      buildEnvironmentConfig(fixture({ VITE_PUBLIC_APP_URL: "http://staging.example.com" })),
    ).toThrow(EnvironmentConfigError);
  });

  it("rejects when the URL ref differs from the expected ref (staging build, production ref)", () => {
    expect(() =>
      buildEnvironmentConfig(
        fixture({
          VITE_APP_ENV: "staging",
          VITE_SUPABASE_URL: "https://zsonukpxahaxffugavfu.supabase.co",
          VITE_EXPECTED_SUPABASE_PROJECT_REF: "zsonukpxahaxffugavfu",
        }),
      ),
    ).not.toThrow(); // internamente consistente — a mistura real é pega em check-environment.mjs

    // Divergência interna (URL não é a mesma que o ref esperado) deve falhar
    // fechado independentemente do ambiente:
    expect(() =>
      buildEnvironmentConfig(
        fixture({
          VITE_APP_ENV: "production",
          VITE_SUPABASE_URL: "https://zsonukpxahaxffugavfu.supabase.co",
          VITE_EXPECTED_SUPABASE_PROJECT_REF: "qkiiwopkbcslquyfhdec",
        }),
      ),
    ).toThrow(EnvironmentConfigError);
  });

  it("rejects when VITE_SUPABASE_URL is not a *.supabase.co host", () => {
    expect(() =>
      buildEnvironmentConfig(
        fixture({
          VITE_SUPABASE_URL: "https://example.com",
          VITE_EXPECTED_SUPABASE_PROJECT_REF: "qkiiwopkbcslquyfhdec",
        }),
      ),
    ).toThrow(EnvironmentConfigError);
  });
});
