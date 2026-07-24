import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const names = [
  "20260801090000_official_transfer_letters.sql",
  "20260801100000_institutional_certificates.sql",
];

function read(relative: string) {
  return readFileSync(path.join(root, relative), "utf8");
}

describe("Documentos Oficiais — migrations", () => {
  it.each(names)("mirrors %s byte-for-byte in the production directory", (name) => {
    const staging = read(`supabase/migrations/${name}`);
    const production = read(`supabase-production/supabase/migrations/${name}`);
    const digest = (value: string) => createHash("sha256").update(value).digest("hex");
    expect(digest(production)).toBe(digest(staging));
  });

  it("classifies both migrations as staging_feature", () => {
    const manifest = JSON.parse(read("supabase/migration-manifest.json")) as {
      staging_feature: string[];
    };
    for (const name of names) expect(manifest.staging_feature).toContain(name);
  });

  it("extends canonical transfer/history/documents instead of duplicating people", () => {
    const sql = read(`supabase/migrations/${names[0]}`);
    expect(sql).toContain("ALTER TABLE public.member_transfers");
    expect(sql).toContain("INSERT INTO public.documents");
    expect(sql).not.toContain("CREATE TABLE IF NOT EXISTS public.transfer_members");
  });

  it("uses permanent public tokens and safe public validators", () => {
    const sql = names.map((name) => read(`supabase/migrations/${name}`)).join("\n");
    expect(sql).toContain("public_token uuid");
    expect(sql).toContain("get_public_member_transfer_letter");
    expect(sql).toContain("get_public_institutional_certificate");
    expect(sql).toContain("TO anon, authenticated");
    expect(sql).not.toContain("USING (true)");
    expect(sql).not.toContain("WITH CHECK (true)");
  });

  it("uses configured organization logos instead of a fixed certificate watermark", () => {
    const sql = read(`supabase/migrations/${names[1]}`);
    expect(sql).toContain("o.logo_url AS organization_logo_url");
    expect(sql).not.toContain("watermark_url");
  });

  it("marks real Discipulado and Teologia completions when issuing academic certificates", () => {
    const sql = read(`supabase/migrations/${names[1]}`);
    expect(sql).toContain("mark_discipleship_certificate_issued");
    expect(sql).toContain("mark_theology_certificate_issued");
    expect(sql).toContain("e.status = 'concluido'");
  });
});
