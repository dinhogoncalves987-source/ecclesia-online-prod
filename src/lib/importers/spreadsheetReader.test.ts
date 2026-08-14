import { afterEach, describe, expect, it } from "vitest";
import { excelSerialToCivil } from "./spreadsheetReader";

/**
 * FASE 1D-B1.1 — teste de regressão do bug de deslocamento de fuso horário.
 *
 * Bug confirmado por inspeção direta da planilha oficial CONFIADCS1-2-26.xlsm
 * (linha 2 da aba "Base de Dados", coluna "Carimbo de data/hora"):
 *   - serial bruto da célula:      45628.40498842593
 *   - texto formatado pelo Excel (campo .w, gerado pelo próprio Excel):
 *       "12/2/24 9:43"  →  civil correto = 2024-12-02 09:43:11
 *   - usando `cellDates: true` do SheetJS + getters LOCAIS ou UTC do `Date`
 *     resultante, o valor lido varia conforme o fuso horário do processo
 *     Node/navegador que executa o importador (verificado empiricamente:
 *     mesma célula → "12:43:39" com TZ=America/Sao_Paulo, "09:43:11" com
 *     TZ=UTC) — um deslocamento silencioso de horas em relação ao horário
 *     civil real da planilha.
 *
 * A correção (excelSerialToCivil, em spreadsheetReader.ts) nunca constrói um
 * `Date` a partir do serial do Excel para fins de fuso — usa apenas
 * aritmética inteira sobre o serial (dias + fração do dia) e `new Date(ms)`
 * exclusivamente como calculadora de calendário lida com getters `getUTC*`
 * (que, para um único argumento numérico de ms, é sempre um instante UTC
 * absoluto e nunca depende do TZ do processo). O teste abaixo prova isso
 * forçando `process.env.TZ` para vários fusos diferentes e conferindo que o
 * resultado nunca muda.
 */
describe("spreadsheetReader — excelSerialToCivil não desloca por fuso horário", () => {
  const ORIGINAL_TZ = process.env.TZ;

  afterEach(() => {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
  });

  const TIMEZONES = ["UTC", "America/Sao_Paulo", "America/New_York", "Asia/Tokyo", "Europe/Lisbon"];

  it("reproduz o Carimbo de data/hora real da linha 2 (12/2/24 9:43 — texto exibido pelo próprio Excel)", () => {
    const results = TIMEZONES.map(tz => {
      process.env.TZ = tz;
      return excelSerialToCivil(45628.40498842593);
    });
    for (const r of results) {
      expect(r).toEqual({ y: 2024, m: 12, d: 2, hh: 9, mm: 43, ss: 11 });
    }
  });

  it("reproduz a DATA CONTÁBIL real da linha 2 (11/3/24 — serial inteiro, sem hora)", () => {
    const results = TIMEZONES.map(tz => {
      process.env.TZ = tz;
      return excelSerialToCivil(45599);
    });
    for (const r of results) {
      expect(r).toEqual({ y: 2024, m: 11, d: 3, hh: 0, mm: 0, ss: 0 });
    }
  });

  it("meia-noite exata (fração 0) não sofre virada de dia em nenhum fuso", () => {
    for (const tz of TIMEZONES) {
      process.env.TZ = tz;
      expect(excelSerialToCivil(45641)).toEqual({ y: 2024, m: 12, d: 15, hh: 0, mm: 0, ss: 0 });
    }
  });

  it("horário perto da virada do dia (23:59:59) não regride nem avança de dia", () => {
    // fração 0.999988... × 86400 ≈ 86399s = 23:59:59
    for (const tz of TIMEZONES) {
      process.env.TZ = tz;
      expect(excelSerialToCivil(45641.99998842592593)).toEqual({ y: 2024, m: 12, d: 15, hh: 23, mm: 59, ss: 59 });
    }
  });

  it("retorna null para valores não finitos", () => {
    expect(excelSerialToCivil(Number.NaN)).toBeNull();
    expect(excelSerialToCivil(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

/**
 * Clone puro de cellToRowValue()/formatCivil() (não exportadas) para testar
 * a regra de formatação — meia-noite exata vira "AAAA-MM-DD" (compatível com
 * parseDateToISO), qualquer outro horário preserva "AAAA-MM-DD HH:mm:ss".
 */
function formatCivil(p: { y: number; m: number; d: number; hh: number; mm: number; ss: number }): string {
  const y = String(p.y).padStart(4, "0");
  const m = String(p.m).padStart(2, "0");
  const d = String(p.d).padStart(2, "0");
  if (p.hh === 0 && p.mm === 0 && p.ss === 0) return `${y}-${m}-${d}`;
  return `${y}-${m}-${d} ${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}:${String(p.ss).padStart(2, "0")}`;
}

describe("spreadsheetReader — formatação civil (data pura vs. carimbo completo)", () => {
  it("mantém apenas a data quando o horário é meia-noite exata (ex.: DATA CONTÁBIL)", () => {
    const civil = excelSerialToCivil(45599);
    expect(civil).not.toBeNull();
    expect(formatCivil(civil!)).toBe("2024-11-03");
  });

  it("preserva hora:minuto:segundo quando presentes (ex.: Carimbo de data/hora)", () => {
    const civil = excelSerialToCivil(45628.40498842593);
    expect(civil).not.toBeNull();
    expect(formatCivil(civil!)).toBe("2024-12-02 09:43:11");
  });
});
