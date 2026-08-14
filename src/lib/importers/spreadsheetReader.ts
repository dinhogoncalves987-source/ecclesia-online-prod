/**
 * spreadsheetReader.ts
 * Lê .xlsm / .xlsx via arrayBuffer (nunca readAsText).
 * Lê .csv como texto.
 *
 * FASE 1D-B1.1 — bug crítico de fuso horário corrigido:
 *   A opção `cellDates: true` do SheetJS converte datas para objetos `Date`
 *   cujo instante UTC interno é ajustado com base no fuso horário LOCAL do
 *   processo em que o código roda — MAS de forma inconsistente entre
 *   ambientes (verificado empiricamente: a mesma célula produz instantes UTC
 *   diferentes conforme a variável TZ do processo). Ler esse `Date` com
 *   getters locais (getHours) OU com getters UTC (getUTCHours) pode devolver
 *   um horário civil diferente do que a própria planilha exibe, dependendo de
 *   onde o importador é executado (navegador do usuário, CI, servidor).
 *
 *   A correção definitiva é NUNCA deixar o SheetJS construir `Date` para
 *   células de data: lemos o valor numérico bruto (serial do Excel) e o
 *   formato de número da própria célula (`cellNF: true`, campo `.z`), e
 *   convertemos o serial para ano/mês/dia/hora/min/seg com aritmética pura
 *   (`excelSerialToCivil`), idêntica em espírito ao parser já usado em
 *   financeConfiadcsMapper.ts. `new Date(ms)` + getters `getUTC*` são usados
 *   apenas como calculadora de calendário (dias desde 1970 → ano/mês/dia),
 *   nunca para representar fuso horário — isso é garantidamente determinístico
 *   em qualquer TZ, pois o construtor de um único número sempre trata o
 *   argumento como instante UTC absoluto.
 */
import * as XLSX from "xlsx";

export interface SpreadsheetResult {
  sheetNames: string[];
  selectedSheet: string;
  rows: string[][];
  headerRowIndex: number;
}

const PREFERRED_SHEETS = ["base de dados", "basededados", "lancamentos", "lançamentos", "dados"];

function pickSheet(names: string[]): string {
  const lower = names.map(n => n.toLowerCase().trim());
  for (const pref of PREFERRED_SHEETS) {
    const idx = lower.indexOf(pref);
    if (idx !== -1) return names[idx];
  }
  return names[0] ?? "";
}

/** Excel serial (dias desde 1899-12-30) → ano/mês/dia/hora/min/seg civis.
 * Aritmética pura, sem qualquer dependência do fuso horário do processo. */
export function excelSerialToCivil(
  serial: number,
): { y: number; m: number; d: number; hh: number; mm: number; ss: number } | null {
  if (!Number.isFinite(serial)) return null;
  const totalDays = Math.floor(serial);
  const fraction = serial - totalDays;
  // 25569 = serial do Excel para 1970-01-01 — mesma constante de
  // financeConfiadcsMapper.ts::excelSerialToDate.
  const utcMs = (totalDays - 25569) * 86400000;
  const asDate = new Date(utcMs);
  if (isNaN(asDate.getTime())) return null;
  const totalSeconds = Math.round(fraction * 86400);
  return {
    y: asDate.getUTCFullYear(),
    m: asDate.getUTCMonth() + 1,
    d: asDate.getUTCDate(),
    hh: Math.floor(totalSeconds / 3600) % 24,
    mm: Math.floor((totalSeconds % 3600) / 60),
    ss: totalSeconds % 60,
  };
}

function formatCivil(p: { y: number; m: number; d: number; hh: number; mm: number; ss: number }): string {
  const y = String(p.y).padStart(4, "0");
  const m = String(p.m).padStart(2, "0");
  const d = String(p.d).padStart(2, "0");
  // Colunas de data pura (ex.: DATA CONTÁBIL) ficam à meia-noite e continuam
  // retornando somente "AAAA-MM-DD" — sem regressão em relação ao formato
  // já usado pelo mapper/parseDateToISO.
  if (p.hh === 0 && p.mm === 0 && p.ss === 0) return `${y}-${m}-${d}`;
  return `${y}-${m}-${d} ${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}:${String(p.ss).padStart(2, "0")}`;
}

function cellToRowValue(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.v === null || cell.v === undefined) return "";
  const fmt = typeof cell.z === "string" ? cell.z : "";
  const isDateFormatted = fmt !== "" && Boolean(XLSX.SSF?.is_date?.(fmt));
  if (isDateFormatted && typeof cell.v === "number") {
    const civil = excelSerialToCivil(cell.v);
    if (civil) return formatCivil(civil);
  }
  // cell.v nunca é Date aqui pois cellDates nunca é passado como true na
  // leitura (ver readExcel/readSheetByName) — mantido apenas como rede de
  // segurança determinística (getters UTC, nunca locais).
  if (cell.v instanceof Date && !isNaN(cell.v.getTime())) {
    return formatCivil({
      y: cell.v.getUTCFullYear(),
      m: cell.v.getUTCMonth() + 1,
      d: cell.v.getUTCDate(),
      hh: cell.v.getUTCHours(),
      mm: cell.v.getUTCMinutes(),
      ss: cell.v.getUTCSeconds(),
    });
  }
  return String(cell.v);
}

function worksheetToRows(ws: XLSX.WorkSheet): string[][] {
  const ref = ws["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const rows: string[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      row.push(cellToRowValue(ws[addr] as XLSX.CellObject | undefined));
    }
    rows.push(row);
  }
  return rows;
}

function detectHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const nonEmpty = rows[i].filter(c => c.trim()).length;
    if (nonEmpty >= 3) return i;
  }
  return 0;
}

async function readExcel(file: File): Promise<SpreadsheetResult> {
  const buffer = await file.arrayBuffer();
  // cellDates NUNCA true — ver comentário de cabeçalho sobre o bug de fuso.
  // cellNF: true expõe o formato de número (`.z`) usado para detectar
  // células de data e convertê-las manualmente, sem fuso.
  const workbook = XLSX.read(buffer, { type: "array", cellNF: true });
  const sheetNames = workbook.SheetNames;
  const selectedSheet = pickSheet(sheetNames);
  const ws = workbook.Sheets[selectedSheet];
  const rows = worksheetToRows(ws);
  const headerRowIndex = detectHeaderRow(rows);
  return { sheetNames, selectedSheet, rows, headerRowIndex };
}

async function readCsv(file: File): Promise<SpreadsheetResult> {
  const text = await file.text();
  const firstLine = text.split("\n")[0] ?? "";
  const sep = firstLine.includes(";") ? ";" : ",";
  const rows = text.split("\n").map(line =>
    line.split(sep).map(cell => cell.trim().replace(/^"|"$/g, ""))
  );
  return {
    sheetNames: [file.name],
    selectedSheet: file.name,
    rows,
    headerRowIndex: 0,
  };
}

export async function readSpreadsheet(file: File): Promise<SpreadsheetResult> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "csv") return readCsv(file);
  if (ext === "xlsx" || ext === "xlsm" || ext === "xls") return readExcel(file);
  throw new Error(`Formato não suportado: .${ext}. Use .xlsx, .xlsm ou .csv`);
}

export async function readSheetByName(file: File, sheetName: string): Promise<{ rows: string[][]; headerRowIndex: number }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellNF: true });
  const ws = workbook.Sheets[sheetName];
  if (!ws) throw new Error(`Aba "${sheetName}" não encontrada.`);
  const rows = worksheetToRows(ws);
  return { rows, headerRowIndex: detectHeaderRow(rows) };
}
