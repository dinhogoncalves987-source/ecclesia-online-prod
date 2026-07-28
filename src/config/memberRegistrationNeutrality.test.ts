import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relative: string) {
  return readFileSync(path.join(root, relative), "utf8");
}

describe("cadastro de membros neutro e responsivo", () => {
  const source = read("src/pages/Membros.tsx");

  it("expõe somente o identificador opcional definido pela própria igreja", () => {
    expect(source).toContain('label="Código interno da igreja"');
    expect(source).toContain(
      'label: t("Código interno da igreja")',
    );
    expect(source).toContain(
      "Opcional — identificador usado pela própria igreja",
    );

    for (const forbiddenText of [
      "Código do Membro",
      "Identificadores de sistema anterior",
      "Código legado",
      "Matrícula antiga",
      "Origem do registro",
      "Wintechi",
      "sistema anterior",
      "importação de legado",
    ]) {
      expect(source).not.toContain(forbiddenText);
    }
  });

  it("não lê nem grava identificadores específicos de sistemas antigos", () => {
    expect(source).not.toMatch(
      /\b(?:form|m)\.legacy_(?:code|registration|source)\b/,
    );
    expect(source).not.toMatch(
      /\blegacy_(?:code|registration|source)\s*:/,
    );
  });

  it("mantém pendências como alerta neutro e não editável", () => {
    expect(source).toContain(
      "Este cadastro possui pendências de validação.",
    );
    expect(source).toContain(
      "Essas marcações não podem ser alteradas manualmente.",
    );
  });

  it("evita rolagem horizontal no formulário em telas estreitas", () => {
    expect(source).toContain(
      'w-[calc(100vw-1rem)] max-w-5xl',
    );
    expect(source).toContain(
      'grid grid-cols-4 md:grid-cols-8',
    );
    expect(source).toContain(
      'min-w-0 overflow-y-auto flex-1',
    );
    expect(source).toContain(
      'flex flex-col gap-3 px-4 py-3',
    );
    expect(source).not.toContain(
      'flex border-b border-border/50 overflow-x-auto flex-shrink-0 bg-background',
    );
  });
});
