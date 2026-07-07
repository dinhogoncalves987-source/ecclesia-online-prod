/**
 * headerNormalizer.ts
 * Normaliza cabeçalhos da planilha CONFIADCS para chaves canônicas.
 */

const CANONICAL: Record<string, string> = {
  // Datas
  "data contabil": "date",
  "data contábil": "date",
  "data_contabil": "date",
  "datacont": "date",
  "data emissao": "issue_date",
  "data emissão": "issue_date",
  "data_emissao": "issue_date",
  // Valor
  "valor": "amount",
  "valor rs": "amount",
  "valor r$": "amount",
  // Tipo
  "ent/sai": "type",
  "ent/saí": "type",
  "entradasaida": "type",
  "entrada/saida": "type",
  "tipo": "type",
  // Documento
  "no do documento": "document_number",
  "nº do documento": "document_number",
  "documento no": "document_number",
  "documento nº": "document_number",
  "num documento": "document_number",
  "ndoc": "document_number",
  // Tipo de documento
  "tipo doc": "document_type",
  "tipodoc": "document_type",
  // Grupo contábil
  "grupo contabil": "accounting_group",
  "grupo contábil": "accounting_group",
  "grupocontabil": "accounting_group",
  // Conta contábil
  "conta contabil": "account_category",
  "conta contábil": "account_category",
  "contacontabil": "account_category",
  // Portador
  "portador origem": "portador",
  "portador": "portador",
  // Período
  "periodo": "period_label",
  "período": "period_label",
  // Setor / Distrito
  "setor/distrito": "district",
  "setor distrito": "district",
  "sede/setor/distrito": "district",
  "sede setor distrito": "district",
  "distrito": "district",
  // Congregação
  "congregacao": "congregation",
  "congregação": "congregation",
  // Beneficiário
  "beneficiario": "supplier_beneficiary_name",
  "beneficiário": "supplier_beneficiary_name",
  "fornecedor/beneficiario": "supplier_beneficiary_name",
  "fornecedor/beneficiário": "supplier_beneficiary_name",
  // CNPJ/CPF beneficiário
  "cnpj/cpf": "supplier_beneficiary_document",
  "cnpj cpf": "supplier_beneficiary_document",
  // Contribuinte
  "contribuinte": "contributor_name",
  // CPF contribuinte
  "cpf": "contributor_document",
  // Coletor
  "coletor": "collector_name",
  // Tesoureiro
  "tesoureiro local": "treasurer_name",
  "tesoureiro": "treasurer_name",
  // Observação
  "observacao": "notes",
  "observação": "notes",
  "observacoes": "notes",
  "observações": "notes",
  // Registro
  "registro": "legacy_record_number",
  "reg no": "legacy_record_number",
  "reg. no": "legacy_record_number",
  "reg nº": "legacy_record_number",
};

function normalize(header: string): string {
  return header.trim().toLowerCase().replace(/[^\w\s\/]/g, "").replace(/\s+/g, " ");
}

/** Retorna Map de chave canônica → índice da coluna. */
export function buildColumnMap(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((h, idx) => {
    const key = CANONICAL[normalize(h)];
    if (key && !map.has(key)) map.set(key, idx);
  });
  return map;
}
