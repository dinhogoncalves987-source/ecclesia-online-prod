import { describe, expect, it } from "vitest";
import { mapConfiadcsRows, type AuxLookup } from "./financeConfiadcsMapper";

/**
 * Regressão para bugs reais encontrados ao validar o mapper CONFIADCS com uma
 * amostra de lançamentos reais (planilha "Base de Dados", 28k+ linhas) antes
 * da importação histórica completa:
 *
 * 1. Cabeçalhos reais da planilha ("SETOR/DISTRITO - ORIGEM 1",
 *    "CONGREGAÇÃO - ORIGEM 2") não eram reconhecidos por headerNormalizer,
 *    fazendo district_id/congregation_id ficarem sempre nulos.
 * 2. findById não resolvia valores no formato "CÓDIGO DESCRIÇÃO"
 *    (ex.: "20101 DÍZIMOS E OFERTAS", "20 - RECEITAS") contra grupos/contas
 *    semeados com code/name separados — 100% de miss em grupo e conta.
 * 3. O fallback de substring do findById dava falso positivo para códigos
 *    curtos (ex.: "NC" e "TI" casavam com nomes que continham essas letras
 *    dentro de outra palavra, como "traNsferêNCia" e "mercaNTIl").
 * 4. Espaços duplicados nos valores da planilha (ex.: "CT B BRASIL  8528-6")
 *    quebravam a comparação exata contra o portador cadastrado.
 */

const HEADER_ROW = [
  "REGISTRO",
  "Carimbo de data/hora",
  "SETOR/DISTRITO - ORIGEM 1",
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

// Amostra real extraída da planilha CONFIADCS (Assembleia de Deus em Caxias do Sul).
const SAMPLE_ROWS: string[][] = [
  ["2", "", "25 - SANTA CATARINA", "03/11/2024", "SANTA CATARINA", "57937", "782.75", "E", "", "", "", "CONGREGAÇÕES", "NOV/24", "20 - RECEITAS", "20101 DÍZIMOS E OFERTAS", "RDO", "CAIXA AD 25 - SANTA CATARINA", "", "", "", "2024-11-03"],
  ["6561", "", "01 - SANTA FÉ", "10/04/2025", "SANTA FÉ", "36081916007000", "322.17", "S", "", "", "", "CT B BRASIL  8528-6", "ABR/25", "3 - TRIBUTOS E IMPOSTOS", "3300 TRIBUTOS MUNICIPAIS", "GUI", "PREFEITURA MUNICIPAL DE CAXIAS DO SUL", "", "", "", "2025-04-10"],
  ["7498", "", "00 - SEDE", "05/05/2025", "TODAS", "2721130067", "2000", "S", "", "", "", "CT SICREDI 99253-6", "MAI/25", "2 - FOLHA DE PAGAMENTO", "2100 FOLHA DE PAGAMENTO", "TI ", "JOEL MICHEL DA SILVA JUNIOR", "", "", "", "2025-05-05"],
  ["8435", "", "01 - SANTA FÉ", "09/04/2025", "BRANDALISE", "79458", "1260", "E", "", "", "", "CONGREGAÇÕES", "ABR/25", "20 - RECEITAS", "20101 DÍZIMOS E OFERTAS", "RDO", "CAIXA AD 01 - SANTA FÉ", "", "", "", "2025-04-09"],
  ["11246", "", "12 - SERRANO", "30/06/2025", "SERRANO", "28826", "4099.3", "S", "", "", "", "CAIXA MISSÃO", "JUN/25", "15 - MISSÕES", "15105 DEPÓSITO EM CONTA CORRENTE", "NC", "CT SICREDI 00803-4", "", "", "", "2025-06-30"],
  ["12183", "", "18 - ANA RECH", "09/07/2025", "ANA RECH", "37072", "3700", "S", "", "", "", "CONGREGAÇÕES", "JUL/25", "40 - TRANSFERÊNCIAS", "40101 TRANSFERÊNCIA ENTRE PORTADORES", "NC", "CT SICREDI 99253-6", "", "", "", "2025-07-09"],
];

const aux: AuxLookup = {
  accountingGroups: [
    { id: "g20", name: "RECEITAS", code: "20" },
    { id: "g3", name: "TRIBUTOS E IMPOSTOS", code: "3" },
    { id: "g2", name: "FOLHA DE PAGAMENTO", code: "2" },
    { id: "g15", name: "MISSÕES", code: "15" },
    { id: "g40", name: "TRANSFERÊNCIAS", code: "40" },
  ],
  accountCategories: [
    { id: "c20101", name: "DÍZIMOS E OFERTAS", code: "20101" },
    { id: "c3300", name: "TRIBUTOS MUNICIPAIS", code: "3300" },
    { id: "c2100", name: "FOLHA DE PAGAMENTO", code: "2100" },
    { id: "c15105", name: "DEPÓSITO EM CONTA CORRENTE", code: "15105" },
    { id: "c40101", name: "TRANSFERÊNCIA ENTRE PORTADORES", code: "40101" },
  ],
  documentTypes: [
    { id: "dRDO", name: "Relatório de Dízimos e Ofertas", code: "RDO" },
    { id: "dGUI", name: "Guia de Pagamento", code: "GUI" },
    { id: "dTI", name: "Transferência Interna", code: "TI" },
    { id: "dNC", name: "Nota de Contabilidade", code: "NC" },
    { id: "dCT", name: "Comprovante de Transferência", code: "CT" },
    { id: "dDM", name: "Duplicata Mercantil", code: "DM" },
  ],
  financialAccounts: [
    { id: "aBB", name: "CT B BRASIL 8528-6" },
    { id: "aSicredi99253", name: "CT SICREDI 99253-6" },
    { id: "aSicredi00803", name: "CT SICREDI 00803-4" },
    { id: "aCongregacoes", name: "Congregações" },
    { id: "aCaixaMissao", name: "Caixa Missão" },
  ],
  congregations: [
    { id: "orgSubsedeSantaCatarina", name: "Subsede Distrital Santa Catarina" },
    { id: "orgCongBrandalise", name: "Congregação Brandalise" },
    { id: "orgSubsedeAnaRech", name: "Subsede Distrital Ana Rech" },
  ],
  districts: [
    { id: "orgDistritoSantaFe", name: "Distrito 2 — Santa Fé" },
    { id: "orgDistritoSerrano", name: "Distrito 12 — Serrano" },
    { id: "orgMatriz", name: "Assembleia de Deus em Caxias do Sul" },
    { id: "orgSubsedeAnaRech", name: "Subsede Distrital Ana Rech" },
  ],
};

describe("mapConfiadcsRows — amostra real CONFIADCS", () => {
  it("reconhece as colunas SETOR/DISTRITO - ORIGEM 1 e CONGREGAÇÃO - ORIGEM 2 do cabeçalho real", () => {
    const { valid } = mapConfiadcsRows(HEADER_ROW, [SAMPLE_ROWS[0]], aux);
    expect(valid).toHaveLength(1);
    expect(valid[0].congregation_id).toBe("orgSubsedeSantaCatarina");
  });

  it("resolve grupo contábil e conta contábil no formato 'CÓDIGO DESCRIÇÃO'", () => {
    const { valid } = mapConfiadcsRows(HEADER_ROW, [SAMPLE_ROWS[0]], aux);
    expect(valid[0].accounting_group_id).toBe("g20");
    expect(valid[0].account_category_id).toBe("c20101");
  });

  it("resolve grupo/conta no formato 'CÓDIGO - DESCRIÇÃO' (com hífen)", () => {
    const { valid } = mapConfiadcsRows(HEADER_ROW, [SAMPLE_ROWS[1]], aux);
    expect(valid[0].accounting_group_id).toBe("g3");
    expect(valid[0].account_category_id).toBe("c3300");
    expect(valid[0].document_type_id).toBe("dGUI");
  });

  it("não confunde tipo de documento curto (NC) com nome que contém as mesmas letras (Comprovante de TransferêNCia)", () => {
    const { valid } = mapConfiadcsRows(HEADER_ROW, [SAMPLE_ROWS[5]], aux);
    expect(valid[0].document_type_id).toBe("dNC");
  });

  it("não confunde tipo de documento curto (TI, com espaço à direita na célula) com nome que contém as mesmas letras (Duplicata MercanTIl)", () => {
    const { valid } = mapConfiadcsRows(HEADER_ROW, [SAMPLE_ROWS[2]], aux);
    expect(valid[0].document_type_id).toBe("dTI");
  });

  it("ignora espaços duplicados no portador ao comparar com o financial_account cadastrado", () => {
    const { valid } = mapConfiadcsRows(HEADER_ROW, [SAMPLE_ROWS[1]], aux);
    expect(valid[0].financial_account_id).toBe("aBB");
  });

  it("resolve congregação-filha (ex.: Brandalise) e subsede usada como 'setor' (ex.: Ana Rech)", () => {
    const brandalise = mapConfiadcsRows(HEADER_ROW, [SAMPLE_ROWS[3]], aux).valid[0];
    expect(brandalise.congregation_id).toBe("orgCongBrandalise");
    expect(brandalise.district_id).toBe("orgDistritoSantaFe");

    const anaRech = mapConfiadcsRows(HEADER_ROW, [SAMPLE_ROWS[5]], aux).valid[0];
    expect(anaRech.district_id).toBe("orgSubsedeAnaRech");
    expect(anaRech.congregation_id).toBe("orgSubsedeAnaRech");
  });

  it("resolve portador com nome exato acentuado (Caixa Missão)", () => {
    const { valid } = mapConfiadcsRows(HEADER_ROW, [SAMPLE_ROWS[4]], aux);
    expect(valid[0].financial_account_id).toBe("aCaixaMissao");
  });

  it("processa a amostra completa sem nenhuma linha inválida", () => {
    const { valid, invalid } = mapConfiadcsRows(HEADER_ROW, SAMPLE_ROWS, aux);
    expect(invalid).toHaveLength(0);
    expect(valid).toHaveLength(SAMPLE_ROWS.length);
    for (const tx of valid) {
      expect(tx.accounting_group_id).not.toBeNull();
      expect(tx.account_category_id).not.toBeNull();
      expect(tx.document_type_id).not.toBeNull();
    }
  });
});
