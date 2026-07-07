/**
 * spreadsheetReader.ts
 * Lê .xlsm / .xlsx via arrayBuffer (nunca readAsText).
 * Lê .csv como texto.
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

function worksheetToRows(ws: XLSX.WorkSheet): string[][] {
  const data = XLSX.utils.sheet_to_json<(string | number | Date | null | undefined)[]>(ws, {
    header: 1,
    defval: "",
    raw: true,
  });
  return data.map(row =>
    (row as (string | number | Date | null | undefined)[]).map(cell => {
      if (cell === null || cell === undefined) return "";
      if (cell instanceof Date && !isNaN(cell.getTime())) {
        const y = cell.getFullYear();
        const m = String(cell.getMonth() + 1).padStart(2, "0");
        const d = String(cell.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
      return String(cell);
    })
  );
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
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
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
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const ws = workbook.Sheets[sheetName];
  if (!ws) throw new Error(`Aba "${sheetName}" não encontrada.`);
  const rows = worksheetToRows(ws);
  return { rows, headerRowIndex: detectHeaderRow(rows) };
}
