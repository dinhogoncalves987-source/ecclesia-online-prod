/**
 * financeConfiadcsMapper.ts
 * Transforma linhas brutas da planilha CONFIADCS em transações válidas.
 *
 * Prioridade de data:
 *   1. "date"      (DATA CONTÁBIL)
 *   2. "issue_date" (DATA EMISSÃO)
 *   3. "timestamp" (Carimbo de data/hora)
 */
import { buildColumnMap, normalizeHeader } from "./headerNormalizer";

export interface AuxLookup {
  accountingGroups: { id: string; name: string }[];
  accountCategories: { id: string; name: string; code?: string }[];
  documentTypes: { id: string; name: string; code?: string }[];
  financialAccounts: { id: string; name: string }[];
  congregations: { id: string; name: string }[];
  districts: { id: string; name: string }[];
}

export interface MappedTransaction {
  date: string;
  amount: number;
  type: "Entrada" | "Saida";
  category: string;
  description: string;
  issue_date?: string;
  document_number?: string | null;
  document_type_id?: string | null;
  accounting_group_id?: string | null;
  account_category_id?: string | null;
  financial_account_id?: string | null;
  congregation_id?: string | null;
  district_id?: string | null;
  supplier_beneficiary_name?: string | null;
  supplier_beneficiary_document?: string | null;
  contributor_name?: string | null;
  contributor_document?: string | null;
  collector_name?: string | null;
  treasurer_name?: string | null;
  period_label?: string | null;
  legacy_record_number?: string | null;
  notes?: string | null;
  origin: "confiadcs";
  status: "Confirmado";
}

export interface InvalidRow {
  rowIndex: number;
  reason: string;
  raw: string[];
}

// ── Utilitários de data ───────────────────────────────────────────────────────

function excelSerialToDate(serial: number): string | null {
  if (serial < 1 || serial > 73050) return null;
  const utcDays = serial - 25569;
  const date = new Date(utcDays * 86400000);
  if (isNaN(date.getTime())) return null;
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  if (m > 12 || d > 31 || y < 1900 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function toISO(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseDateToISO(raw: string | number | undefined | null): string | null {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;

  // Serial numérico do Excel
  if (typeof raw === "number") {
    if (Number.isInteger(raw) && raw > 1000 && raw < 73050) return excelSerialToDate(raw);
    return null;
  }

  const s = String(raw).trim();
  if (!s) return null;

  // ISO yyyy-mm-dd (possivelmente com hora: 2024-12-02 09:43:00)
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) return toISO(+isoMatch[1], +isoMatch[2], +isoMatch[3]);

  // Brasileiro dd/mm/yyyy ou d/m/yyyy ou dd-mm-yyyy ou dd.mm.yyyy (opcionalmente com hora)
  const dmyMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})(?:\s.*)?$/);
  if (dmyMatch) {
    let y = +dmyMatch[3];
    if (y < 100) y += y < 50 ? 2000 : 1900;
    return toISO(y, +dmyMatch[2], +dmyMatch[1]);
  }

  // Fallback: serial embutido em string (ex: "45000")
  const numericStr = s.replace(/\D/g, "");
  if (numericStr.length >= 4) {
    const n = parseInt(numericStr, 10);
    if (n > 1000 && n < 73050) return excelSerialToDate(n);
  }

  return null;
}

// ── Utilitários de valor e tipo ────────────────────────────────────────────────

function parseAmount(raw: string): number | null {
  if (!raw) return null;
  // Remove símbolos de moeda, mantém dígitos, vírgula e ponto
  const cleaned = raw.replace(/[^\d,.-]/g, "");
  // Converte separador decimal brasileiro
  const normalized = cleaned.includes(",") && !cleaned.includes(".")
    ? cleaned.replace(",", ".")
    : cleaned.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(normalized);
  return isNaN(n) || n <= 0 ? null : n;
}

function parseType(raw: string): "Entrada" | "Saida" | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s === "e" || s.startsWith("entr") || s === "1") return "Entrada";
  if (s === "s" || s.startsWith("sai") || s === "2") return "Saida";
  return null;
}

function findById(
  list: { id: string; name: string; code?: string }[],
  value: string,
): string | null {
  if (!value.trim()) return null;
  const v = value.trim().toLowerCase();
  return (
    list.find(
      i =>
        i.name.toLowerCase() === v ||
        i.code?.toLowerCase() === v ||
        i.name.toLowerCase().includes(v),
    )?.id ?? null
  );
}

// ── Mapper principal ───────────────────────────────────────────────────────────

export function mapConfiadcsRows(
  headerRow: string[],
  dataRows: string[][],
  aux: AuxLookup,
  startRowIndex = 1,
): { valid: MappedTransaction[]; invalid: InvalidRow[] } {
  const colMap = buildColumnMap(headerRow);

  if (import.meta.env.DEV) {
    console.log("[CONFIADCS] headers normalizados:", headerRow.map(h => ({
      original: h,
      mapeado: Array.from(colMap.entries()).find(([, idx]) => idx === headerRow.indexOf(h))?.[0] ?? "(não mapeado)",
    })));
  }

  const get = (row: string[], key: string): string =>
    colMap.has(key) ? (row[colMap.get(key)!] ?? "").trim() : "";

  const valid: MappedTransaction[] = [];
  const invalid: InvalidRow[] = [];

  dataRows.forEach((row, idx) => {
    const rowIndex = startRowIndex + idx + 1;
    if (!row.some(c => String(c ?? "").trim())) return; // pula linha vazia

    // ── Data principal: prioridade accounting_date > issue_date > timestamp ──
    const rawDate        = get(row, "date");
    const rawIssueDate   = get(row, "issue_date");
    const rawTimestamp   = get(row, "timestamp");

    const parsedDate      = parseDateToISO(rawDate);
    const parsedIssue     = parseDateToISO(rawIssueDate);
    const parsedTimestamp = parseDateToISO(rawTimestamp);

    const finalDate = parsedDate ?? parsedIssue ?? parsedTimestamp;

    if (import.meta.env.DEV && idx === 0) {
      console.log("[CONFIADCS] primeira linha normalizada:", {
        accounting_date: rawDate,
        issue_date: rawIssueDate,
        timestamp: rawTimestamp,
        finalDate,
      });
    }

    if (!finalDate) {
      invalid.push({
        rowIndex,
        reason: `Data inválida — DATA CONTÁBIL: "${rawDate}", DATA EMISSÃO: "${rawIssueDate}", TIMESTAMP: "${rawTimestamp}"`,
        raw: row,
      });
      return;
    }

    // ── Valor ────────────────────────────────────────────────────────────────
    const rawAmount = get(row, "amount");
    const amount = parseAmount(rawAmount);
    if (!amount) {
      invalid.push({ rowIndex, reason: `Valor inválido: "${rawAmount}"`, raw: row });
      return;
    }

    // ── Tipo ─────────────────────────────────────────────────────────────────
    const rawType = get(row, "type");
    const type = parseType(rawType);
    if (!type) {
      invalid.push({
        rowIndex,
        reason: `Tipo inválido: "${rawType}" (esperado E/S ou Entrada/Saída)`,
        raw: row,
      });
      return;
    }

    // ── Campos opcionais ─────────────────────────────────────────────────────
    const issue_date              = parsedIssue ?? finalDate;
    const document_number         = get(row, "document_number") || null;
    const period_label            = get(row, "period_label") || null;
    const supplier_beneficiary_name     = get(row, "supplier_beneficiary_name") || null;
    const supplier_beneficiary_document = get(row, "supplier_beneficiary_document") || null;
    const contributor_name        = get(row, "contributor_name") || null;
    const contributor_document    = get(row, "contributor_document") || null;
    const collector_name          = get(row, "collector_name") || null;
    const treasurer_name          = get(row, "treasurer_name") || null;
    const rawNotes                = get(row, "notes");
    const legacy_record_number    = get(row, "legacy_record_number") || null;

    // Lookups
    const accounting_group_id  = findById(aux.accountingGroups,  get(row, "accounting_group"));
    const account_category_id  = findById(aux.accountCategories, get(row, "account_category"));
    const document_type_id     = findById(aux.documentTypes,     get(row, "document_type"));
    const financial_account_id = findById(aux.financialAccounts, get(row, "portador"));
    const congregation_id      = findById(aux.congregations,     get(row, "congregation"));
    const district_id          = findById(aux.districts,         get(row, "district"));

    const category =
      aux.accountCategories.find(c => c.id === account_category_id)?.name ||
      (type === "Entrada" ? "Receita" : "Despesa");

    const description =
      [supplier_beneficiary_name || contributor_name || "", document_number ? `Doc. ${document_number}` : ""]
        .filter(Boolean)
        .join(" — ") ||
      (type === "Entrada" ? "Lançamento de entrada" : "Lançamento de saída");

    // Notas consolidadas
    const noteParts: string[] = [];
    if (rawNotes) noteParts.push(rawNotes);
    if (period_label) noteParts.push(`Período: ${period_label}`);
    const rawGroup = get(row, "accounting_group");
    if (rawGroup) noteParts.push(`Grupo: ${rawGroup}`);
    const rawDocType = get(row, "document_type");
    if (rawDocType) noteParts.push(`Tipo doc: ${rawDocType}`);
    const rawPortador = get(row, "portador");
    if (rawPortador && !financial_account_id) noteParts.push(`Portador: ${rawPortador}`);
    const rawCong = get(row, "congregation");
    if (rawCong && !congregation_id) noteParts.push(`Congregação: ${rawCong}`);
    const rawDist = get(row, "district");
    if (rawDist && !district_id) noteParts.push(`Distrito: ${rawDist}`);

    valid.push({
      date: finalDate,
      issue_date,
      amount,
      type,
      category,
      description,
      document_number,
      document_type_id,
      accounting_group_id,
      account_category_id,
      financial_account_id,
      congregation_id,
      district_id,
      supplier_beneficiary_name,
      supplier_beneficiary_document,
      contributor_name,
      contributor_document,
      collector_name,
      treasurer_name,
      period_label,
      legacy_record_number,
      notes: noteParts.join(" | ") || null,
      origin: "confiadcs",
      status: "Confirmado",
    });
  });

  if (import.meta.env.DEV) {
    console.log(`[CONFIADCS] Resultado: ${valid.length} válidas, ${invalid.length} inválidas`);
    if (invalid.length > 0) {
      console.log("[CONFIADCS] Primeiros 3 erros:", invalid.slice(0, 3));
    }
  }

  return { valid, invalid };
}
