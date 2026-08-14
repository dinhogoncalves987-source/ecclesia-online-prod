/**
 * financeConfiadcsMapper.ts
 * Transforma linhas brutas da planilha CONFIADCS em transações válidas.
 *
 * Prioridade de data:
 *   1. "date"      (DATA CONTÁBIL)
 *   2. "issue_date" (DATA EMISSÃO)
 *   3. "timestamp" (Carimbo de data/hora)
 *
 * FASE 1D-B1 — regras de reconciliação:
 *   - Todo campo com relacionamento por catálogo (distrito, congregação,
 *     portador, grupo contábil, conta contábil, tipo de documento) sempre
 *     preserva o texto original da planilha em um campo "raw", MESMO quando
 *     o ID é resolvido com sucesso — a conversão nunca é destrutiva.
 *   - A resolução de catálogo é SEMPRE por correspondência EXATA (após
 *     normalização de acento/caixa/espaço). Nunca por substring/fuzzy —
 *     isso evitaria inventar correspondência entre valores parecidos mas
 *     diferentes (proibido pelo contrato de reconciliação).
 *   - Quando não há correspondência exata, o ID fica null E o campo é
 *     listado em `pending_reconciliations` — nunca descartado silenciosamente
 *     e nunca apenas jogado dentro de `notes`.
 *   - OBSERVAÇÃO da planilha vai para `source_observation` (isolada) e
 *     também para `notes` (compatibilidade) — nunca mais concatenada com
 *     fallbacks de outros campos.
 */
import { buildColumnMap, normalizeHeader } from "./headerNormalizer";

export interface AuxLookup {
  accountingGroups: { id: string; name: string; code?: string }[];
  accountCategories: { id: string; name: string; code?: string }[];
  documentTypes: { id: string; name: string; code?: string }[];
  financialAccounts: { id: string; name: string; code?: string }[];
  congregations: { id: string; name: string; code?: string }[];
  districts: { id: string; name: string; code?: string }[];
}

export type ReconciliationCatalogType =
  | "district"
  | "congregation"
  | "financial_account"
  | "accounting_group"
  | "account_category"
  | "document_type";

export interface PendingReconciliationField {
  field: ReconciliationCatalogType;
  catalogType: ReconciliationCatalogType;
  rawValue: string;
}

export interface MappedTransaction {
  date: string;
  amount: number;
  type: "Entrada" | "Saida";
  category: string;
  description: string;
  issue_date?: string;
  raw_timestamp?: string | null;
  document_number?: string | null;
  document_type_id?: string | null;
  document_type_raw_label?: string | null;
  accounting_group_id?: string | null;
  accounting_group_raw_label?: string | null;
  account_category_id?: string | null;
  account_category_raw_label?: string | null;
  financial_account_id?: string | null;
  financial_account_raw_label?: string | null;
  congregation_id?: string | null;
  congregation_raw_label?: string | null;
  district_id?: string | null;
  district_raw_label?: string | null;
  supplier_beneficiary_name?: string | null;
  supplier_beneficiary_document?: string | null;
  contributor_name?: string | null;
  contributor_document?: string | null;
  collector_name?: string | null;
  treasurer_name?: string | null;
  period_label?: string | null;
  legacy_record_number?: string | null;
  source_observation?: string | null;
  notes?: string | null;
  pending_reconciliations: PendingReconciliationField[];
  import_source_row_number: number;
  origin: "spreadsheet";
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

function excelSerialTimeOfDay(serial: number): { h: number; m: number; s: number } | null {
  const fraction = serial - Math.floor(serial);
  if (fraction <= 0) return null;
  const totalSeconds = Math.round(fraction * 86400);
  return {
    h: Math.floor(totalSeconds / 3600),
    m: Math.floor((totalSeconds % 3600) / 60),
    s: totalSeconds % 60,
  };
}

function toISO(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseDateToISO(raw: string | number | undefined | null): string | null {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;

  // Serial numérico do Excel
  if (typeof raw === "number") {
    if (Number.isFinite(raw) && raw > 1000 && raw < 73050) return excelSerialToDate(Math.floor(raw));
    return null;
  }

  const s = String(raw).trim();
  if (!s) return null;

  // ISO yyyy-mm-dd (possivelmente com hora: 2024-12-02 09:43:00)
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) return toISO(+isoMatch[1], +isoMatch[2], +isoMatch[3]);

  // Brasileiro dd/mm/yyyy ou d/m/yyyy ou dd-mm-yyyy ou dd.mm.yyyy (opcionalmente com hora)
  const dmyMatch = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:\s.*)?$/);
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

/**
 * Preserva o carimbo COMPLETO (data + hora), ao contrário de parseDateToISO
 * que descarta a hora. Aceita:
 *   - número serial do Excel com fração de dia = hora (ex.: 45631.53...)
 *   - string "AAAA-MM-DD HH:mm:ss" (produzida por spreadsheetReader.ts a
 *     partir de células Date do XLSX)
 *   - string "dd/mm/aaaa HH:mm:ss" (Google Forms / exportações CSV)
 * Quando não há hora identificável, assume 00:00:00 (meia-noite local).
 */
export function parseTimestampToISO(raw: string | number | undefined | null): string | null {
  const datePart = parseDateToISO(raw);
  if (!datePart) return null;

  if (typeof raw === "number") {
    const time = excelSerialTimeOfDay(raw);
    if (!time) return `${datePart}T00:00:00`;
    return `${datePart}T${String(time.h).padStart(2, "0")}:${String(time.m).padStart(2, "0")}:${String(time.s).padStart(2, "0")}`;
  }

  const s = String(raw).trim();
  const timeMatch = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (timeMatch) {
    const hh = timeMatch[1].padStart(2, "0");
    const mm = timeMatch[2].padStart(2, "0");
    const ss = (timeMatch[3] ?? "00").padStart(2, "0");
    return `${datePart}T${hh}:${mm}:${ss}`;
  }
  return `${datePart}T00:00:00`;
}

// ── Utilitários de valor e tipo ────────────────────────────────────────────────

export function parseAmount(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d,.-]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const decimalSeparator = lastComma > lastDot ? "," : ".";
  const separatorIndex = Math.max(lastComma, lastDot);
  const decimalDigits = separatorIndex >= 0 ? cleaned.length - separatorIndex - 1 : 0;
  const hasDecimalPart = separatorIndex >= 0 && decimalDigits > 0 && decimalDigits <= 2;
  const normalized = hasDecimalPart
    ? `${cleaned.slice(0, separatorIndex).replace(/[.,]/g, "")}.${cleaned.slice(separatorIndex + 1)}`
    : cleaned.replace(/[.,]/g, "");
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

// ── Resolução de catálogo — SEMPRE por correspondência EXATA ──────────────────
// Nunca por substring/fuzzy: correspondência ambígua ou parcial vira pendência
// de reconciliação, nunca uma FK inventada.

function normalizeCatalogText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove um prefixo numérico de código de setor (ex.: "02 - SANTA FÉ" → "SANTA FÉ"). */
function stripLeadingCode(value: string): string {
  return value.replace(/^\s*\d{1,3}\s*-\s*/, "").trim();
}

/** organizations.name real de setor é "Distrito NN - Nome" e de congregação é
 * "Congregação Nome" (ver 20260806143000_importacao_ad_caxias_estrutura.sql).
 * Sem remover esses prefixos, NENHUM rótulo histórico da planilha (que nunca
 * traz essas palavras) bateria com o nome oficial — não é um alias, é o
 * mesmo texto com rótulo estrutural do banco removido. */
const DISTRICT_ORG_PREFIX = /^\s*distrito\s+\d{1,3}\s*-\s*/i;
const CONGREGATION_ORG_PREFIX = /^\s*congrega[cç][aã]o\s+/i;

function resolveExactMatch(
  rawLabel: string,
  list: { id: string; name: string; code?: string }[],
  options?: { stripLeadingCode?: boolean; stripNamePrefix?: RegExp },
): string | null {
  const label = rawLabel.trim();
  if (!label) return null;
  const applyStrip = (v: string) => (options?.stripLeadingCode ? stripLeadingCode(v) : v);
  const applyNamePrefixStrip = (v: string) =>
    options?.stripNamePrefix ? v.replace(options.stripNamePrefix, "") : v;
  const target = normalizeCatalogText(applyStrip(label));

  const matchedIds = new Set<string>();
  for (const item of list) {
    const itemName = normalizeCatalogText(applyStrip(applyNamePrefixStrip(item.name)));
    const itemCode = item.code ? normalizeCatalogText(item.code) : null;
    if (itemName === target || (itemCode && itemCode === target)) {
      matchedIds.add(item.id);
    }
  }
  // Correspondência ambígua (mais de um registro do catálogo bate com o
  // mesmo texto normalizado) nunca é resolvida automaticamente.
  return matchedIds.size === 1 ? [...matchedIds][0] : null;
}

/**
 * Aliases determinísticos comprovados por evidência interna da própria
 * planilha CONFIADCS1-2-26.xlsm (FASE B1.2 — cobertura zero pendências).
 * Fonte de cada entrada, sem exceção: a aba PARÂMETROS (colunas 22-25,
 * "NÚM"/"SETOR-CÓD"/"NOME"/"SETOR-DISTRITO"), que é a própria tabela de
 * referência usada internamente pela planilha para associar cada
 * distrito/congregação histórico ao seu setor, cruzada com a aba
 * CONGREGAÇÕES (blocos "MOVIMENTO FINANCEIRO - CONGREGAÇÃO X - SET/DIS Y")
 * e com a estrutura real de 23 setores/60 congregações
 * (20260806143000_importacao_ad_caxias_estrutura.sql).
 *
 * NUNCA fuzzy: cada chave é um texto normalizado exato observado na coluna
 * DISTRITO/CONGREGAÇÃO da planilha; cada valor é o nome (ou nome + setor,
 * para distrito) confirmado nessa mesma tabela de referência. Não há
 * abreviação expandida "no algoritmo" (ex.: não existe uma regra genérica
 * "ST" → "SANTA") porque ST também abrevia SANTO (ST ANTONIO) e SANTOS (ST
 * DUMONT) — cada linha abaixo foi conferida individualmente contra a aba
 * PARÂMETROS antes de entrar nesta lista.
 *
 * "24 - DALLAGNOL" não tem QUALQUER correspondência em PARÂMETROS, em
 * CONGREGAÇÕES nem nos 23 setores/60 congregações atuais — decisão humana
 * final da FASE B1.2 (ver HISTORICAL_PRESERVED_DISTRICT_LABELS abaixo):
 * preserva o texto histórico em district_raw_label, NÃO cria setor ativo
 * novo, e a linha conta como reconciliada (historical_preserved), nunca
 * como pendência.
 */
export const DISTRICT_NAME_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  "SEDE": "Matriz",
  // "CHÁCARA" é rótulo histórico de CONGREGAÇÃO (não de distrito) sem
  // congregação atual correspondente — decisão humana final B1.2 associa
  // ao setor atual 01-Matriz/Sede. Fica aqui (tabela de nomes → setor) para
  // ser reaproveitada pelo fallback congregação→setor em resolveCongregation.
  "CHÁCARA": "Matriz",
  "VL MARY": "Vila Mary",
  "ST FÉ": "Santa Fé",
  "S CAETANO": "São Caetano",
  "SANTOS DUMONT": "Kaiser",
  "ST DUMONT": "Kaiser",
  "S CIRO": "Século XX/São Ciro",
  "SÃO CIRO": "Século XX/São Ciro",
  "1º DE MAIO": "Fátima",
  "VL LOBOS": "Vila Lobos",
  "S JOSÉ": "Pioneiro",
  "ANA RECH": "Parada Cristal",
  "VL AMÉLIA": "Charqueadas",
  "PLANALTO RIO BRANCO": "Charqueadas",
  "CIDADE NOVA": "Reolon",
  "MONTE CARMELO": "Kaiser",
  "ST CATARINA": "Pioneiro",
  "KAYSER": "Kaiser",
  "VL CRISTINA": "Vila Cristina",
  "ST LUCIA DO PIAÍ": "Santa Lucia Piai",
  "CAMPOS DA SERRA": "Diamantino",
});

export const CONGREGATION_NAME_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  "VL MARY": "Vila Mary",
  "ST FÉ": "Santa Fé",
  "S CAETANO": "São Caetano",
  "1º DE MAIO": "1º Maio",
  "VL LOBOS": "Vila Lobos",
  "S JOSÉ": "São José",
  "S CIRO": "Século Xx/São Ciro",
  "VL AMÉLIA": "Vila Amélia",
  "ST CATARINA": "Santa Catarina",
  "KAYSER": "Kaiser",
  "VL CRISTINA": "Vila Cristina",
  "S CRISTOVÃO": "São Cristovão",
  "ST CORONA": "Santa Corona",
  "S VICTOR": "São Victor",
  "ST ANTONIO": "Santo Antônio",
  "VL LEON": "Vila Leon",
  "ST LÚCIA": "Santa Lúcia",
  "CARAVAGGIO": "Caravagio",
  "ST LUCIA DO PIAÍ": "Sta Lucia Piaí",
  "CÂNION": "Kanyon",
  "JD EMBAIXADOR": "Jardim Embaixador",
  "GALÓPOLIS": "Altos De Galopólis",
  "VL SECA": "Vila Seca",
  "JD IRACEMA": "Jardim Iracema",
  "ST TEREZA": "Santa Tereza",
  "JD DAS HORTÊNCIAS": "Jardim Das Hortências",
  "SÉCULO XX": "Século Xx/São Ciro",
  "Nº SRA. DAS GRAÇAS": "Nossa Senhora Das Graças",
  "PRES VARGAS": "Presidente Vargas",
  "ST BÁRBARA": "Santa Barbara 1",
  "S FRANCISCO": "São Francisco",
  "ST DUMONT": "Santos Dumont",
});

/**
 * Aliases determinísticos de CONTA CONTÁBIL comprovados por comparação
 * exata (código único OU descrição idêntica após normalização) contra as
 * 147 contas do catálogo oficial extraído de "CONTAS CONTÁBEIS". Cada
 * entrada abaixo foi conferida individualmente: ou o código numérico
 * inicial já identifica de forma única a conta (variação é só na descrição
 * livre digitada), ou a descrição bate exatamente com uma única conta
 * mesmo quando o código da planilha está incorreto/ausente. Casos em que
 * código e descrição apontam para contas DIFERENTES (contradição interna
 * da própria planilha) foram resolvidos por decisão humana final (FASE
 * B1.2 "CORREÇÃO FINAL DIRETA"), sempre pela DESCRIÇÃO (nunca pelo código
 * contraditório da própria planilha), preservando o raw original:
 *   - "1138 SERVIÇOS DE GUINCHOS": descrição idêntica à da conta oficial
 *     1128 (o código 1138 oficial é outra conta, "CUIDADORIA DOMÉSTICA");
 *   - "20100 DÍZIMOS E OFERTAS": descrição bate com a conta oficial 20101
 *     (o código 20100 oficial é só "DÍZIMOS", sem "E OFERTAS").
 * Casos sem QUALQUER conta oficial correspondente por código OU descrição
 * (ex.: "15107 MATERIAL PARA EVANGELISMO E MISSÕES", "REEMBOLSO", "3500
 * TAXAS DE REGULARIZAÇÕES") NUNCA entram aqui — ver
 * HISTORICAL_PRESERVED_ACCOUNT_CATEGORY_LABELS abaixo.
 */
export const ACCOUNT_CATEGORY_NAME_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  "6100 ENERGIA ELÉTRICA": "6100 ENERGIA ELÉTRICA (LUZ)",
  "15104 DESPESAS COM MISSÃO (ALUGUÉIS/ VIAGENS/ ALIMENTAÇÃO)": "15104 DESPESAS COM MISSÃO (ALUGUÉIS)",
  "1223 AQUISIÇÃO DE BENEFÍCIO ALIMENTAÇÃO": "1223 AQUISIÇÃO DE BENEFÍCIO VALE ALIMENTAÇÃO",
  "18102 TRANSFERENCIA ENTRE CONTAS": "40102 TRANSFERÊNCIA ENTRE CONTAS",
  "TRANSFERÊNCIA ENTRE PORTADORES": "40101 TRANSFERÊNCIA ENTRE PORTADORES",
  "20099 DÍZIMOS E OFERTAS": "20101 DÍZIMOS E OFERTAS",
  "1138 SERVIÇOS DE GUINCHOS": "1128 SERVIÇOS DE GUINCHOS",
  "20100 DÍZIMOS E OFERTAS": "20101 DÍZIMOS E OFERTAS",
});

/**
 * Rótulos históricos SEM QUALQUER destino atual comprovado — nem por
 * correspondência direta, nem por alias, em nenhum catálogo oficial
 * (setores/congregações/contas contábeis). Decisão humana final (FASE
 * B1.2 "CORREÇÃO FINAL DIRETA", item 2): a linha continua persistida com o
 * raw label integralmente preservado, ID de destino permanece null (nunca
 * inventado), e a linha conta como RECONCILIADA — nunca como pendência —
 * porque a ausência de destino já foi expressamente investigada e
 * confirmada pela própria planilha (PARÂMETROS/SETOR-DISTRITO/CONGREGAÇÕES),
 * não por omissão.
 */
export const HISTORICAL_PRESERVED_DISTRICT_LABELS: ReadonlyArray<string> = ["24 - DALLAGNOL"];
export const HISTORICAL_PRESERVED_CONGREGATION_LABELS: ReadonlyArray<string> = ["DALLAGNOL", "LOT RECH"];
export const HISTORICAL_PRESERVED_ACCOUNT_CATEGORY_LABELS: ReadonlyArray<string> = [
  "15107 MATERIAL PARA EVANGELISMO E MISSÕES",
  "REEMBOLSO",
  "3500 TAXAS DE REGULARIZAÇÕES",
];

function isInNormalizedSet(rawLabel: string, values: ReadonlyArray<string>): boolean {
  const target = normalizeCatalogText(rawLabel);
  return values.some(v => normalizeCatalogText(v) === target);
}

/** Resolve usando primeiro a correspondência exata direta e, só quando ela
 * falha, um alias determinístico comprovado (nunca fuzzy — ver tabelas
 * acima). Nunca inventa: se a chave normalizada não estiver na tabela de
 * aliases, o resultado da correspondência direta (nulo) é preservado. */
function resolveWithAlias(
  rawLabel: string,
  list: { id: string; name: string; code?: string }[],
  aliases: Readonly<Record<string, string>>,
  options?: { stripLeadingCode?: boolean; stripNamePrefix?: RegExp; aliasKeyStripLeadingCode?: boolean },
): string | null {
  const direct = resolveExactMatch(rawLabel, list, options);
  if (direct) return direct;
  const keySource = options?.aliasKeyStripLeadingCode ? stripLeadingCode(rawLabel) : rawLabel.trim();
  const aliasKey = normalizeCatalogText(keySource);
  const aliasTarget = Object.entries(aliases).find(
    ([k]) => normalizeCatalogText(k) === aliasKey,
  )?.[1];
  if (!aliasTarget) return null;
  return resolveExactMatch(aliasTarget, list, { stripNamePrefix: options?.stripNamePrefix });
}

/** Resolve o distrito ignorando o prefixo numérico — os 53 nomes históricos
 * de "DISTRITO - ORIGEM 1" usam numeração que mudou ao longo do tempo, mas o
 * NOME por extenso é o identificador estável quando bate exatamente com um
 * dos 23 setores atuais. Quando o nome abreviado não bate diretamente, um
 * alias determinístico comprovado (DISTRICT_NAME_ALIASES) é tentado antes
 * de considerar pendente — nunca inventamos correspondência por número. */
function resolveDistrict(rawLabel: string, districts: AuxLookup["districts"]): string | null {
  return resolveWithAlias(rawLabel, districts, DISTRICT_NAME_ALIASES, {
    stripLeadingCode: true,
    stripNamePrefix: DISTRICT_ORG_PREFIX,
    aliasKeyStripLeadingCode: true,
  });
}

/** Valor operacional usado na planilha para "aplica-se a todas as
 * congregações do setor" — não é o nome de nenhuma congregação real e NUNCA
 * deve ser tratado como pendência de reconciliação (FASE 1D-B1.1, item 1). */
export const OPERATIONAL_ALL_CONGREGATIONS = "TODAS";

function isOperationalAllCongregations(rawLabel: string): boolean {
  return normalizeCatalogText(rawLabel) === OPERATIONAL_ALL_CONGREGATIONS;
}

/** Resolve a congregação, tratando "TODAS" como opção operacional (nunca uma
 * congregação real, nunca uma pendência de reconciliação — congregation_id
 * fica null porque a linha genuinamente se aplica a todas as congregações do
 * distrito, não porque a planilha trouxe um nome desconhecido). Quando o
 * nome abreviado não bate diretamente contra "Congregação Nome", tenta um
 * alias determinístico comprovado (CONGREGATION_NAME_ALIASES) antes de
 * considerar pendente.
 *
 * Fallback determinístico (decisão humana final, FASE B1.2 "CORREÇÃO FINAL
 * DIRETA", item 1): quando NENHUMA congregação atual corresponde, mas a
 * própria planilha (aba PARÂMETROS) comprova que o nome histórico pertence
 * a um SETOR atual real, o vínculo é feito no nível de setor — nunca
 * inventado, sempre a mesma tabela de evidência (DISTRICT_NAME_ALIASES)
 * já usada para o campo DISTRITO. Isso resolve exatamente CHÁCARA→01-Sede,
 * MONTE CARMELO→16-Kaiser e CHARQUEADAS→17-Charqueadas (esta última já bate
 * por nome direto contra o setor, sem precisar de alias). Nenhum outro
 * rótulo de congregação é afetado: só cai neste fallback quem já falhou a
 * resolução direta E por alias contra as 60 congregações atuais. */
function resolveCongregation(
  rawLabel: string,
  congregations: AuxLookup["congregations"],
  districts: AuxLookup["districts"],
): { id: string | null; isOperationalAll: boolean } {
  if (isOperationalAllCongregations(rawLabel)) {
    return { id: null, isOperationalAll: true };
  }
  const congregationId = resolveWithAlias(rawLabel, congregations, CONGREGATION_NAME_ALIASES, {
    stripNamePrefix: CONGREGATION_ORG_PREFIX,
  });
  if (congregationId) {
    return { id: congregationId, isOperationalAll: false };
  }
  const districtFallbackId = resolveWithAlias(rawLabel, districts, DISTRICT_NAME_ALIASES, {
    stripNamePrefix: DISTRICT_ORG_PREFIX,
  });
  return { id: districtFallbackId, isOperationalAll: false };
}

/** Resolve a conta contábil por correspondência exata direta e, quando ela
 * falha, um alias determinístico comprovado (ACCOUNT_CATEGORY_NAME_ALIASES)
 * — nunca por código isolado nem por semelhança/fuzzy em tempo de execução;
 * cada alias foi verificado individualmente contra o catálogo oficial antes
 * de entrar na tabela (ver comentário acima da constante). */
function resolveAccountCategory(rawLabel: string, accountCategories: AuxLookup["accountCategories"]): string | null {
  return resolveWithAlias(rawLabel, accountCategories, ACCOUNT_CATEGORY_NAME_ALIASES);
}

// ── Mapper principal ───────────────────────────────────────────────────────────

export function mapConfiadcsRows(
  headerRow: string[],
  dataRows: string[][],
  aux: AuxLookup,
  startRowIndex = 1,
): { valid: MappedTransaction[]; invalid: InvalidRow[] } {
  const colMap = buildColumnMap(headerRow);

  const get = (row: string[], key: string): string =>
    colMap.has(key) ? (row[colMap.get(key)!] ?? "").trim() : "";

  const valid: MappedTransaction[] = [];
  const invalid: InvalidRow[] = [];

  dataRows.forEach((row, idx) => {
    const rowIndex = startRowIndex + idx + 1;
    if (!row.some(c => String(c ?? "").trim())) return; // pula linha vazia

    // ── Data principal: prioridade accounting_date > issue_date > timestamp ──
    const rawDate        = get(row, "date");
    const rawIssueDate    = get(row, "issue_date");
    const rawTimestamp    = get(row, "timestamp");

    const parsedDate      = parseDateToISO(rawDate);
    const parsedIssue     = parseDateToISO(rawIssueDate);
    const parsedTimestamp = parseDateToISO(rawTimestamp);

    const finalDate = parsedDate ?? parsedIssue ?? parsedTimestamp;

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

    // ── Campos opcionais diretos (sem catálogo, sem raw duplicado) ───────────
    const issue_date              = parsedIssue ?? finalDate;
    const raw_timestamp           = parseTimestampToISO(rawTimestamp);
    const document_number         = get(row, "document_number") || null;
    const period_label            = get(row, "period_label") || null;
    const supplier_beneficiary_name     = get(row, "supplier_beneficiary_name") || null;
    const supplier_beneficiary_document = get(row, "supplier_beneficiary_document") || null;
    const contributor_name        = get(row, "contributor_name") || null;
    const contributor_document    = get(row, "contributor_document") || null;
    const collector_name          = get(row, "collector_name") || null;
    const treasurer_name          = get(row, "treasurer_name") || null;
    const source_observation      = get(row, "notes") || null;
    const legacy_record_number    = get(row, "legacy_record_number") || null;

    // ── Campos com catálogo: SEMPRE preserva raw; resolve por match exato ────
    const rawAccountingGroup  = get(row, "accounting_group");
    const rawAccountCategory  = get(row, "account_category");
    const rawDocumentType     = get(row, "document_type");
    const rawPortador         = get(row, "portador");
    const rawCongregation     = get(row, "congregation");
    const rawDistrict         = get(row, "district");

    const accounting_group_id  = resolveExactMatch(rawAccountingGroup, aux.accountingGroups);
    const account_category_id  = resolveAccountCategory(rawAccountCategory, aux.accountCategories);
    const document_type_id     = resolveExactMatch(rawDocumentType, aux.documentTypes);
    const financial_account_id = resolveExactMatch(rawPortador, aux.financialAccounts);
    const { id: congregation_id, isOperationalAll: congregation_is_operational_all } =
      resolveCongregation(rawCongregation, aux.congregations, aux.districts);
    const district_id          = resolveDistrict(rawDistrict, aux.districts);

    // Rótulos sem QUALQUER destino atual comprovado (decisão humana final,
    // FASE B1.2 "CORREÇÃO FINAL DIRETA", item 2) — preservados integralmente
    // em *_raw_label, ID permanece null, mas NUNCA contam como pendência.
    const district_is_historical_preserved =
      isInNormalizedSet(rawDistrict, HISTORICAL_PRESERVED_DISTRICT_LABELS);
    const congregation_is_historical_preserved =
      isInNormalizedSet(rawCongregation, HISTORICAL_PRESERVED_CONGREGATION_LABELS);
    const account_category_is_historical_preserved =
      isInNormalizedSet(rawAccountCategory, HISTORICAL_PRESERVED_ACCOUNT_CATEGORY_LABELS);

    const pending_reconciliations: PendingReconciliationField[] = [];
    const registerPending = (
      field: ReconciliationCatalogType,
      rawValue: string,
      resolvedId: string | null,
      options?: { operational?: boolean; historicalPreserved?: boolean },
    ) => {
      if (rawValue && !resolvedId && !options?.operational && !options?.historicalPreserved) {
        pending_reconciliations.push({ field, catalogType: field, rawValue });
      }
    };
    registerPending("district", rawDistrict, district_id, {
      historicalPreserved: district_is_historical_preserved,
    });
    // "TODAS" nunca é pendência — é uma opção operacional válida, não o nome
    // de uma congregação desconhecida (item 1, FASE 1D-B1.1).
    registerPending("congregation", rawCongregation, congregation_id, {
      operational: congregation_is_operational_all,
      historicalPreserved: congregation_is_historical_preserved,
    });
    registerPending("financial_account", rawPortador, financial_account_id);
    registerPending("accounting_group", rawAccountingGroup, accounting_group_id);
    registerPending("account_category", rawAccountCategory, account_category_id, {
      historicalPreserved: account_category_is_historical_preserved,
    });
    registerPending("document_type", rawDocumentType, document_type_id);

    const category =
      aux.accountCategories.find(c => c.id === account_category_id)?.name ||
      (type === "Entrada" ? "Receita" : "Despesa");

    const description =
      [supplier_beneficiary_name || contributor_name || "", document_number ? `Doc. ${document_number}` : ""]
        .filter(Boolean)
        .join(" — ") ||
      (type === "Entrada" ? "Lançamento de entrada" : "Lançamento de saída");

    valid.push({
      date: finalDate,
      issue_date,
      raw_timestamp,
      amount,
      type,
      category,
      description,
      document_number,
      document_type_id,
      document_type_raw_label: rawDocumentType || null,
      accounting_group_id,
      accounting_group_raw_label: rawAccountingGroup || null,
      account_category_id,
      account_category_raw_label: rawAccountCategory || null,
      financial_account_id,
      financial_account_raw_label: rawPortador || null,
      congregation_id,
      congregation_raw_label: rawCongregation || null,
      district_id,
      district_raw_label: rawDistrict || null,
      supplier_beneficiary_name,
      supplier_beneficiary_document,
      contributor_name,
      contributor_document,
      collector_name,
      treasurer_name,
      period_label,
      legacy_record_number,
      source_observation,
      notes: source_observation,
      pending_reconciliations,
      import_source_row_number: rowIndex,
      origin: "spreadsheet",
      status: "Confirmado",
    });
  });

  return { valid, invalid };
}
