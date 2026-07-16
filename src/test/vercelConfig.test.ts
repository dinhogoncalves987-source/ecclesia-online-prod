import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * `vercel.json`'s `headers[].source` (unlike `routes[].src`, which is raw
 * PCRE regex) is parsed with path-to-regexp, where a bare `*` that is not
 * attached to a named parameter (e.g. `:path*`) is invalid and fails Vercel's
 * build-time route validation — this is exactly the bug fixed in this
 * revision ("/workbox-*.js" -> "Unexpected MODIFIER", confirmed against the
 * actual `path-to-regexp@6` parser used by Vercel's router).
 *
 * A `*` used as a real regex quantifier INSIDE a capture group, e.g.
 * `/workbox-(.*)`, is always valid — path-to-regexp treats the whole
 * parenthesized group as a custom regex for that segment.
 */
function findInvalidBareWildcards(source: string): boolean {
  const withoutGroups = source.replace(/\([^)]*\)/g, "");
  const withoutNamedWildcards = withoutGroups.replace(/:[A-Za-z_][A-Za-z0-9_]*\*/g, "");
  return withoutNamedWildcards.includes("*");
}

interface VercelHeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

interface VercelRoute {
  handle?: string;
  src?: string;
  dest?: string;
}

interface VercelConfig {
  $schema?: string;
  headers?: VercelHeaderRule[];
  routes?: VercelRoute[];
}

describe("vercel.json configuration", () => {
  const raw = readFileSync(resolve(__dirname, "../../vercel.json"), "utf-8");
  const config = JSON.parse(raw) as VercelConfig;

  it("parses as valid JSON", () => {
    expect(config).toBeTruthy();
  });

  it("declares the official Vercel JSON schema", () => {
    expect(config.$schema).toBe("https://openapi.vercel.sh/vercel.json");
  });

  it("has no invalid bare-wildcard header source patterns (e.g. the old /workbox-*.js)", () => {
    const offenders = (config.headers ?? [])
      .map((rule) => rule.source)
      .filter((source) => findInvalidBareWildcards(source));

    expect(offenders).toEqual([]);
  });

  it("uses an officially-accepted capture-group pattern to target workbox-*.js files", () => {
    const workboxRule = (config.headers ?? []).find((rule) => rule.source.includes("workbox"));
    expect(workboxRule).toBeDefined();
    expect(workboxRule?.source).toBe("/workbox-(.*)");
    expect(workboxRule?.source).not.toContain("*.js");
  });

  it("still sets no-cache headers for the service worker and workbox chunks", () => {
    const sources = (config.headers ?? []).map((rule) => rule.source);
    expect(sources).toContain("/sw.js");

    const swRule = (config.headers ?? []).find((rule) => rule.source === "/sw.js");
    const workboxRule = (config.headers ?? []).find((rule) => rule.source.includes("workbox"));
    for (const rule of [swRule, workboxRule]) {
      const cacheControl = rule?.headers.find((h) => h.key === "Cache-Control")?.value ?? "";
      expect(cacheControl).toContain("no-cache");
    }
  });

  it("still sets headers for manifest, assets, icons and campaigns", () => {
    const sources = (config.headers ?? []).map((rule) => rule.source);
    expect(sources).toContain("/manifest.webmanifest");
    expect(sources).toContain("/assets/:path*");
    expect(sources).toContain("/icons/:path*");
    expect(sources).toContain("/campaigns/:path*");
  });

  it("preserves the SPA fallback (unmatched paths rewrite to /index.html)", () => {
    const routes = config.routes ?? [];
    expect(routes.length).toBeGreaterThan(0);
    const fallback = routes[routes.length - 1];
    expect(fallback.src).toBe("/(.*)");
    expect(fallback.dest).toBe("/index.html");
  });

  it("still routes sw.js and manifest explicitly ahead of the SPA fallback", () => {
    const routes = config.routes ?? [];
    const swRoute = routes.find((r) => r.src === "/sw.js");
    const manifestRoute = routes.find((r) => r.src === "/manifest.webmanifest");
    expect(swRoute?.dest).toBe("/sw.js");
    expect(manifestRoute?.dest).toBe("/manifest.webmanifest");
  });
});
