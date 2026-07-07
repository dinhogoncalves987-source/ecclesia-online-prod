/**
 * financeConfiadcsMapper.ts
 * Transforma linhas brutas da planilha CONFIADCS em transações válidas.
 */
import { buildColumnMap } from "./headerNormalizer";

export interface AuxLookup {
  accountingGroups: { id: string; name: string }[];
  accountCategories: { id: string; name: string; code?: string }[];
  documentTypes: { id: string; name: string; code?: string }[];
  financialAccounts: { id: string; name: string }[];
  congregations: { id: string; name: string }[];
  districts: { id: string; name: string }[];
}

export interface MappedTransaction {
  // Campos principais
  date: string;
  amount: number;
  type: "Entrada" | "Saida";
  category: string;
  description: string;
  // CONFIADCS
  issue_date?: string;
  document_number?: string;
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
  // Extras para payload
  origin: "confiadcs";
  status: "Confirmado";
}

export interface InvalidRow {
  rowIndex: number;
  reason: string;
  raw: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function excelSerialToDate(serial: number): string | null {
  if (serial < 1) return null;
  const utcDays = serial - 25569;
  const date = new Date(utcDays * 86400000);
  if (isNaN(date.getTime())) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  if (Number(m) > 12 || Number(d) > 31 || y < 1900 || y > 2100) return null;
  return `${y}-${m}-${d}`;
}

function toISO(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseDateToISO(raw: string | number | undefined | null): string | null {
  if (raw === null || raw === undefined || raw === "") return null;

  if (typeof raw === "number") {
    if (raw > 1000 && raw < 73050) return excelSerialToDate(raw);
    return null;
  }

  const s = String(raw).trim();
  if (!s) return null;

  // ISO yyyy-mm-dd
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) return toISO(+isoMatch[1], +isoMatch[2], +isoMatch[3]);

  // Brasileiro dd/mm/yyyy ou dd-mm-yyyy ou dd.mm.yyyy [hora]
  const dmyMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})(?:\s.*)?$/);
  if (dmyMatch) {
    let y = +dmyMatch[3];
    if (y < 100) y += y < 50 ? 2000 : 1900;
    return toISO(y, +dmyMatch[2], +dmyMatch[1]);
  }

  // Fallback serial embutido em string
  const numericStr = s.replace(/[^\d]/g, "");
  if (numericStr.length >= 4) {
    const n = parseInt(numericStr, 10);
    if (n > 1000 && n < 73050) return excelSerialToDate(n);
  }

  return null;
}

function parseAmount(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) || n <= 0 ? null : n;
}

function parseType(raw: string): "Entrada" | "Saida" | null {
  const s = raw.trim().toLowerCase();
  if (s === "e" || s.startsWith("entra") || s === "1") return "Entrada";
  if (s === "s" || s.startsWith("sai") || s.startsWith("saí") || s === "2") return "Saida";
  return null;
}

function findById(list: { id: string; name: string; code?: string }[], value: string): string | null {
  if (!value.trim()) return null;
  const v = value.trim().toLowerCase();
  return list.find(i =>
    i.name.toLowerCase() === v || i.code?.toLowerCase() === v || i.name.toLowerCase().includes(v)
  )?.id ?? null;
}

// ── Mapper principal ──────────────────────────────────────────────────────────

export function mapConfiadcsRows(
  headerRow: string[],
  dataRows: string[][],
  aux: AuxLookup,
  startRowIndex = 1,
): { valid: MappedTransaction[]; invalid: InvalidRow[] } {
  const colMap = buildColumnMap(headerRow);
  const get = (row: string[], key: string) => (colMap.has(key) ? (row[colMap.get(key)!] ?? "").trim() : "");

  const valid: MappedTransaction[] = [];
  const invalid: InvalidRow[] = [];

  dataRows.forEach((row, idx) => {
    const rowIndex = startRowIndex + idx + 1;
    if (!row.some(c => String(c ?? "").trim())) return; // linha vazia

    const rawDate = get(row, "date");
    const date = parseDateToISO(rawDate);
    if (!date) {
      invalid.push({ rowIndex, reason: `Data contábil inválida: "${rawDate}"`, raw: row });
      return;
    }

    const rawAmount = get(row, "amount");
    const amount = parseAmount(rawAmount);
    if (!amount) {
      invalid.push({ rowIndex, reason: `Valor inválido: "${rawAmount}"`, raw: row });
      return;
    }

    const rawType = get(row, "type");
    const type = parseType(rawType);
    if (!type) {
      invalid.push({ rowIndex, reason: `Tipo inválido: "${rawType}" (esperado E/S ou Entrada/Saída)`, raw: row });
      return;
    }

    // Campos opcionais
    const issue_date = parseDateToISO(get(row, "issue_date")) ?? date;
    const document_number = get(row, "document_number") || null;
    const period_label = get(row, "period_label") || null;
    const supplier_beneficiary_name = get(row, "supplier_beneficiary_name") || null;
    const supplier_beneficiary_document = get(row, "supplier_beneficiary_document") || null;
    const contributor_name = get(row, "contributor_name") || null;
    const contributor_document = get(row, "contributor_document") || null;
    const collector_name = get(row, "collector_name") || null;
    const treasurer_name = get(row, "treasurer_name") || null;
    const rawNotes = get(row, "notes");
    const legacy_record_number = get(row, "legacy_record_number") || null;

    // Lookups por nome
    const accounting_group_id = findById(aux.accountingGroups, get(row, "accounting_group"));
    const account_category_id = findById(aux.accountCategories, get(row, "account_category"));
    const document_type_id = findById(aux.documentTypes, get(row, "document_type"));
    const financial_account_id = findById(aux.financialAccounts, get(row, "portador"));
    const congregation_id = findById(aux.congregations, get(row, "congregation"));
    const district_id = findById(aux.districts, get(row, "district"));

    // Categoria para campo obrigatório
    const category = aux.accountCategories.find(c => c.id === account_category_id)?.name
      || (type === "Entrada" ? "Receita" : "Despesa");

    // Descrição sintética
    const description = [
      supplier_beneficiary_name || contributor_name || "",
      document_number ? `Doc. ${document_number}` : "",
    ].filter(Boolean).join(" — ") || (type === "Entrada" ? "Lançamento de entrada" : "Lançamento de saída");

    // Notas consolidadas (campos CONFIADCS não mapeados diretamente)
    const noteParts: string[] = [];
    if (rawNotes) noteParts.push(rawNotes);
    if (period_label) noteParts.push(`Período: ${period_label}`);
    if (get(row, "accounting_group")) noteParts.push(`Grupo: ${get(row, "accounting_group")}`);
    if (get(row, "document_type")) noteParts.push(`Tipo doc: ${get(row, "document_type")}`);
    if (get(row, "portador") && !financial_account_id) noteParts.push(`Portador: ${get(row, "portador")}`);
    if (get(row, "congregation") && !congregation_id) noteParts.push(`Congregação: ${get(row, "congregation")}`);
    if (get(row, "district") && !district_id) noteParts.push(`Distrito: ${get(row, "district")}`);

    valid.push({
      date,
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

  return { valid, invalid };
}
