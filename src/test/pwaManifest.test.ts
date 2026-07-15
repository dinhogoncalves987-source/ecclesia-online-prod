import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("PWA manifest configuration (vite.config.ts)", () => {
  const source = readFileSync(resolve(__dirname, "../../vite.config.ts"), "utf-8");

  it("sets start_url to /admin so a returning session lands directly in the app", () => {
    expect(source).toMatch(/start_url:\s*"\/admin"/);
  });

  it("keeps scope as / so the whole app is controlled by the service worker", () => {
    expect(source).toMatch(/scope:\s*"\/"/);
  });
});
