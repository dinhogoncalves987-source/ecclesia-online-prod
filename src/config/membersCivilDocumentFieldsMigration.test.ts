import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * BUG CRÍTICO — "os dados do membro desaparecem depois de sair da tela":
 * src/pages/Membros.tsx (buildExtendedPayload) sempre enviou
 * civil_document_type/status/url/uploaded_at/notes, holy_spirit_baptism_date
 * e consecration_date num único UPDATE junto com foto, CPF, endereço, etc.
 * Como nenhuma migration jamais criou essas colunas, o UPDATE inteiro era
 * rejeitado pelo PostgREST — não só os campos de documentação civil, mas
 * TODOS os campos estendidos (foto incluída) deixavam de salvar juntos.
 *
 * Este teste é somente leitura: nunca aplica, move ou edita nenhuma
 * migration, e nunca se conecta a um banco de dados real (nem de teste/
 * staging, nem de produção).
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");

const FILE_NAME = "20260717200000_members_civil_document_and_ecclesiastical_fields.sql";
const STAGING_PATH = path.join(ROOT, "supabase", "migrations", FILE_NAME);
const PRODUCTION_PATH = path.join(ROOT, "supabase-production", "supabase", "migrations", FILE_NAME);
const MEMBROS_PAGE_PATH = path.join(ROOT, "src", "pages", "Membros.tsx");

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

describe("migration members.civil_document_*/holy_spirit_baptism_date/consecration_date", () => {
  it("existe, idêntica byte a byte, em staging e produção", () => {
    const stagingSql = readFileSync(STAGING_PATH, "utf8");
    const productionSql = readFileSync(PRODUCTION_PATH, "utf8");
    expect(sha256(productionSql)).toBe(sha256(stagingSql));
  });

  it("cria todas as colunas que Membros.tsx já envia em buildExtendedPayload", () => {
    const sql = readFileSync(STAGING_PATH, "utf8").toLowerCase();
    for (const column of [
      "civil_document_type",
      "civil_document_status",
      "civil_document_url",
      "civil_document_uploaded_at",
      "civil_document_notes",
      "holy_spirit_baptism_date",
      "consecration_date",
    ]) {
      expect(sql).toContain(`add column if not exists ${column}`);
    }
  });

  it("cria o bucket privado member-documents usado por uploadCivilDocumentIfNeeded/openCivilDocument", () => {
    const sql = readFileSync(STAGING_PATH, "utf8");
    expect(sql).toContain("'member-documents', 'member-documents', false");
    expect(sql.toLowerCase()).not.toContain("'member-documents', 'member-documents', true");
  });

  it("é aditiva — nunca remove coluna, nunca apaga dados de negócio", () => {
    const sql = readFileSync(STAGING_PATH, "utf8").toLowerCase();
    expect(sql).not.toMatch(/\b(drop\s+column|drop\s+table|truncate|delete\s+from|update\s+public\.members)\b/);
  });

  it("está classificada em migration-manifest.json como production_management", () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "supabase", "migration-manifest.json"), "utf8"));
    expect(manifest.production_management).toContain(FILE_NAME);
    for (const key of ["staging_feature", "staging_only", "mixed_needs_split", "historical"] as const) {
      expect(manifest[key] ?? []).not.toContain(FILE_NAME);
    }
  });

  it("Membros.tsx continua enviando exatamente essas colunas em buildExtendedPayload (nenhuma órfã)", () => {
    const tsx = readFileSync(MEMBROS_PAGE_PATH, "utf8");
    for (const column of [
      "civil_document_type",
      "civil_document_status",
      "civil_document_url",
      "civil_document_uploaded_at",
      "civil_document_notes",
      "holy_spirit_baptism_date",
      "consecration_date",
    ]) {
      expect(tsx).toContain(column);
    }
  });
});
