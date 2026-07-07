/**
 * headerNormalizer.ts
 * Normaliza cabeçalhos da planilha CONFIADCS para chaves canônicas.
 *
 * Regra de normalização:
 *   1. Decomposição NFD  → separa letra base dos diacríticos (acentos)
 *   2. Remove diacríticos (\u0300-\u036f)
 *   3. Lowercase
 *   4. Remove chars especiais exceto letras, dígitos, espaço e "/"
 *   5. Colapsa espaços múltiplos
 *
 * Isso garante que "DATA CONTÁBIL" === "DATA CONTABIL" === "data contabil".
 */

function removeAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalize(header: string): string {
  return removeAccents(header.trim())
    .toLowerCase()
    .replace(/[^a-z0-9\s/]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const CANONICAL: Record<string, string> = {
  // ── Datas ──────────────────────────────────────────────────────────────────
  // Data Contábil → campo principal "date"
  "data contabil": "date",
  "dt contabil": "date",
  "datacont": "date",
  "data_contabil": "date",
  // Data Emissão → issue_date
  "data emissao": "issue_date",
  "dt emissao": "issue_date",
  "data_emissao": "issue_date",
  "data de emissao": "issue_date",
  // Timestamp do Google Forms / exportações
  "carimbo de data/hora": "timestamp",
  "carimbo de data hora": "timestamp",
  "timestamp": "timestamp",
  "data hora": "timestamp",
  // ── Valor ──────────────────────────────────────────────────────────────────
  "valor": "amount",
  "valor rs": "amount",
  "valor r$": "amount",
  "vl": "amount",
  // ── Tipo Entrada/Saída ──────────────────────────────────────────────────────
  "ent/sai": "type",
  "entr/said": "type",
  "entrada/saida": "type",
  "entradasaida": "type",
  "tipo": "type",
  "e/s": "type",
  // ── Documento ──────────────────────────────────────────────────────────────
  "no do documento": "document_number",
  "n do documento": "document_number",
  "num do documento": "document_number",
  "documento no": "document_number",
  "documento n": "document_number",
  "num documento": "document_number",
  "ndoc": "document_number",
  "doc no": "document_number",
  "doc n": "document_number",
  // ── Tipo de documento ───────────────────────────────────────────────────────
  "tipo doc": "document_type",
  "tipodoc": "document_type",
  "tipo de documento": "document_type",
  // ── Grupo contábil ──────────────────────────────────────────────────────────
  "grupo contabil": "accounting_group",
  "grupocontabil": "accounting_group",
  "grupo": "accounting_group",
  // ── Conta contábil ──────────────────────────────────────────────────────────
  "conta contabil": "account_category",
  "contacontabil": "account_category",
  "conta": "account_category",
  // ── Portador ────────────────────────────────────────────────────────────────
  "portador origem": "portador",
  "portador": "portador",
  // ── Período ─────────────────────────────────────────────────────────────────
  "periodo": "period_label",
  "per": "period_label",
  // ── Setor / Distrito ────────────────────────────────────────────────────────
  "setor/distrito": "district",
  "setor distrito": "district",
  "sede/setor/distrito": "district",
  "sede setor distrito": "district",
  "distrito": "district",
  "setor": "district",
  // ── Congregação ─────────────────────────────────────────────────────────────
  "congregacao": "congregation",
  // ── Beneficiário ────────────────────────────────────────────────────────────
  "beneficiario": "supplier_beneficiary_name",
  "fornecedor/beneficiario": "supplier_beneficiary_name",
  "fornecedor beneficiario": "supplier_beneficiary_name",
  "fornecedor": "supplier_beneficiary_name",
  // ── CNPJ/CPF beneficiário ───────────────────────────────────────────────────
  "cnpj/cpf": "supplier_beneficiary_document",
  "cnpj cpf": "supplier_beneficiary_document",
  "cnpj": "supplier_beneficiary_document",
  // ── Contribuinte ────────────────────────────────────────────────────────────
  "contribuinte": "contributor_name",
  // ── CPF contribuinte ─────────────────────────────────────────────────────────
  "cpf": "contributor_document",
  // ── Coletor ─────────────────────────────────────────────────────────────────
  "coletor": "collector_name",
  // ── Tesoureiro ──────────────────────────────────────────────────────────────
  "tesoureiro local": "treasurer_name",
  "tesoureiro": "treasurer_name",
  // ── Observação ──────────────────────────────────────────────────────────────
  "observacao": "notes",
  "observacoes": "notes",
  "obs": "notes",
  // ── Registro ────────────────────────────────────────────────────────────────
  "registro": "legacy_record_number",
  "reg no": "legacy_record_number",
  "reg n": "legacy_record_number",
  "reg": "legacy_record_number",
};

/** Retorna Map de chave canônica → índice da coluna. */
export function buildColumnMap(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((h, idx) => {
    const norm = normalize(h);
    const key = CANONICAL[norm];
    if (import.meta.env.DEV && !key && h.trim()) {
      // Ajuda no diagnóstico: loga cabeçalhos não mapeados
      // console.debug(`[headerNormalizer] sem mapeamento: "${h}" → "${norm}"`);
    }
    if (key && !map.has(key)) map.set(key, idx);
  });
  return map;
}

/** Expõe a função de normalização para diagnóstico. */
export { normalize as normalizeHeader };
