import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve("supabase/migrations/20260715150000_harden_access_invites.sql"),
  "utf8",
);
const acceptBody = sql.match(
  /CREATE OR REPLACE FUNCTION public\.accept_access_invite\([^]*?AS \$\$([^]*?)\$\$;/i,
)?.[1] ?? "";

describe("access-invite hardening migration", () => {
  it("locks the invite before consuming it", () => {
    expect(sql).toMatch(/SELECT \* INTO inv[\s\S]*FOR UPDATE;/i);
  });

  it("requires a bound e-mail and compares it with the authenticated e-mail", () => {
    expect(sql).toContain("access_invites_email_required");
    expect(sql).toContain("invite_email_missing");
    expect(sql).toContain("email_mismatch");
  });

  it("rejects platform roles and silent role overwrite", () => {
    expect(sql).toContain("access_invites_role_allowed");
    expect(sql).toContain("invalid_invite_role");
    expect(acceptBody).not.toMatch(/ON CONFLICT[\s\S]*DO UPDATE SET role/i);
  });
});
