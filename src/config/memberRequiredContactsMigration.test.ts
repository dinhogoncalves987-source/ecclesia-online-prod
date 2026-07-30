import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationName = "20260803150000_member_required_contacts.sql";

function read(relative: string) {
  return readFileSync(path.join(root, relative), "utf8");
}

describe("contatos obrigatórios de novos membros", () => {
  const staging = read(`supabase/migrations/${migrationName}`);
  const production = read(
    `supabase-production/supabase/migrations/${migrationName}`,
  );

  it("mantém exatamente o mesmo schema em staging e produção", () => {
    expect(production).toBe(staging);
    expect(read("supabase/migration-manifest.json")).toContain(migrationName);
  });

  it("exige nome, CPF, telefone, WhatsApp e e-mail somente em novos registros", () => {
    expect(staging).toContain("members_require_contacts_on_insert");
    expect(staging).toMatch(/BEFORE INSERT ON public\.members/i);
    for (const field of ["full_name", "cpf", "phone", "whatsapp", "email"]) {
      expect(staging).toContain(`NEW.${field}`);
    }
    expect(staging).toContain("new_member_invalid_email");
  });

  it("preserva telefone e WhatsApp como campos independentes", () => {
    expect(staging).toContain("phone and WhatsApp may be equal or different");
    expect(staging).not.toMatch(/NEW\.phone\s*(?:=|<>|!=)\s*NEW\.whatsapp/i);
    expect(staging).not.toMatch(/UNIQUE[\s\S]{0,80}(?:phone|whatsapp)/i);
  });

  it("aplica a mesma regra à importação atômica", () => {
    expect(staging).toMatch(
      /CREATE OR REPLACE FUNCTION public\.import_members_batch/i,
    );
    expect(staging).toMatch(
      /INSERT INTO public\.members \([\s\S]*phone,[\s\S]*whatsapp,[\s\S]*email/i,
    );
    expect(staging).toContain("duplicate_cpf_in_batch");
  });
});
