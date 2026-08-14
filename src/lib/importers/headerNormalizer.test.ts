import { describe, expect, it } from "vitest";
import { buildColumnMap, normalizeHeader } from "./headerNormalizer";

/**
 * FASE 1D-B1 — cobre o bug crítico encontrado: buildColumnMap() faz
 * correspondência EXATA da chave normalizada. Os cabeçalhos reais da
 * planilha CONFIADCS são frases completas ("SETOR/DISTRITO - ORIGEM 1",
 * "CONGREGAÇÃO - ORIGEM 2"), não apenas o prefixo curto. Antes desta fase,
 * essas duas colunas nunca eram reconhecidas nem na planilha antiga nem na
 * nova — todo o distrito/congregação caía fora do mapeamento silenciosamente.
 */
describe("headerNormalizer — cabeçalhos reais da planilha CONFIADCS", () => {
  it("reconhece o cabeçalho NOVO 'DISTRITO - ORIGEM 1' (contrato 1D-B1)", () => {
    expect(normalizeHeader("DISTRITO - ORIGEM 1")).toBe("distrito origem 1");
    const map = buildColumnMap(["DISTRITO - ORIGEM 1"]);
    expect(map.get("district")).toBe(0);
  });

  it("reconhece o cabeçalho ANTIGO 'SETOR/DISTRITO - ORIGEM 1' (planilha 1D-A) sem regressão", () => {
    expect(normalizeHeader("SETOR/DISTRITO - ORIGEM 1")).toBe("setor/distrito origem 1");
    const map = buildColumnMap(["SETOR/DISTRITO - ORIGEM 1"]);
    expect(map.get("district")).toBe(0);
  });

  it("reconhece 'CONGREGAÇÃO - ORIGEM 2' (frase completa real, ambas as planilhas)", () => {
    expect(normalizeHeader("CONGREGAÇÃO - ORIGEM 2")).toBe("congregacao origem 2");
    const map = buildColumnMap(["CONGREGAÇÃO - ORIGEM 2"]);
    expect(map.get("congregation")).toBe(0);
  });

  it("mapeia o cabeçalho completo dos 21 campos da aba Base de Dados", () => {
    const header = [
      "REGISTRO",
      "Carimbo de data/hora",
      "DISTRITO - ORIGEM 1",
      "DATA EMISSÃO",
      "CONGREGAÇÃO - ORIGEM 2",
      "Nº DO DOCUMENTO",
      "VALOR",
      "ENT/SAÍ",
      "COLETOR",
      "TESOUREIRO LOCAL",
      "OBSERVAÇÃO",
      "PORTADOR ORIGEM",
      "PERIODO",
      "GRUPO CONTÁBIL",
      "CONTA CONTÁBIL",
      "TIPO DOC",
      "BENEFICIÁRIO",
      "CNPJ/CPF",
      "CONTRIBUINTE",
      "CPF",
      "DATA CONTÁBIL",
    ];
    const map = buildColumnMap(header);
    const expected: Record<string, number> = {
      legacy_record_number: 0,
      timestamp: 1,
      district: 2,
      issue_date: 3,
      congregation: 4,
      document_number: 5,
      amount: 6,
      type: 7,
      collector_name: 8,
      treasurer_name: 9,
      notes: 10,
      portador: 11,
      period_label: 12,
      accounting_group: 13,
      account_category: 14,
      document_type: 15,
      supplier_beneficiary_name: 16,
      supplier_beneficiary_document: 17,
      contributor_name: 18,
      contributor_document: 19,
      date: 20,
    };
    for (const [key, idx] of Object.entries(expected)) {
      expect(map.get(key), `chave "${key}" deveria mapear para a coluna ${idx}`).toBe(idx);
    }
    expect(map.size).toBe(Object.keys(expected).length);
  });
});
