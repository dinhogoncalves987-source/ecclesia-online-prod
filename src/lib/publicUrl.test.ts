import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/config/environment");
});

describe("getPublicAppUrl", () => {
  it("returns the configured staging URL — never the production domain", async () => {
    vi.doMock("@/config/environment", () => ({
      environment: { publicAppUrl: "https://staging.ecclesiabr.example" },
    }));
    const { getPublicAppUrl } = await import("./publicUrl");
    const url = getPublicAppUrl();
    expect(url).toBe("https://staging.ecclesiabr.example");
    expect(url).not.toContain("ecclesiabr.online");
  });

  it("returns the configured production URL", async () => {
    vi.doMock("@/config/environment", () => ({
      environment: { publicAppUrl: "https://ecclesiabr.online" },
    }));
    const { getPublicAppUrl } = await import("./publicUrl");
    expect(getPublicAppUrl()).toBe("https://ecclesiabr.online");
  });
});

describe("staging never generates links to the production domain (devotionalShare)", () => {
  it("builds DEVOTIONAL_PUBLIC_URL/OG image from the staging publicAppUrl", async () => {
    vi.doMock("@/config/environment", () => ({
      environment: { publicAppUrl: "https://staging.ecclesiabr.example" },
    }));
    const { DEVOTIONAL_PUBLIC_URL, DEVOTIONAL_OG_IMAGE } = await import("./devotionalShare");
    expect(DEVOTIONAL_PUBLIC_URL).toBe("https://staging.ecclesiabr.example/devocional");
    expect(DEVOTIONAL_OG_IMAGE).toBe("https://staging.ecclesiabr.example/og-devocional.png");
    expect(DEVOTIONAL_PUBLIC_URL).not.toContain("ecclesiabr.online");
    expect(DEVOTIONAL_OG_IMAGE).not.toContain("ecclesiabr.online");
  });
});
