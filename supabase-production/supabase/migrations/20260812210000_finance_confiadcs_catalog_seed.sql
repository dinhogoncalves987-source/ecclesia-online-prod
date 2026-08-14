-- =============================================================================
-- FINANCE CONFIADCS — SEED DETERMINÍSTICO DOS CATÁLOGOS OFICIAIS (FASE 1D-B1.1)
-- Migration: 20260812210000_finance_confiadcs_catalog_seed.sql
--
-- OBJETIVO:
--   O STAGING financeiro está completamente zerado. Esta migration carrega
--   determinísticamente, a partir da inspeção direta da planilha oficial
--   CONFIADCS1-2-26.xlsm (sem executar macros, sem alterar o arquivo), os 5
--   catálogos financeiros exigidos pelo contrato de reconciliação — SEM
--   depender de nenhum catálogo financeiro antigo já existente no banco:
--
--     - 147 contas contábeis      (aba "CONTAS CONTÁBEIS", colunas A/B/C)
--     - 22 grupos contábeis        (aba "Base de Dados", coluna GRUPO CONTÁBIL —
--                                    os 22 grupos REALMENTE usados nos 29.957
--                                    lançamentos; o plano contábil completo
--                                    tem 25 grupos, mas 3 nunca são usados
--                                    nesta planilha, então não entram aqui)
--     - 24 tipos de documento      (aba "PARÂMETROS", colunas I/J) + 11
--                                    tipos LEGADOS INATIVOS (FASE B1.2 —
--                                    códigos usados nos lançamentos mas
--                                    ausentes da lista oficial: DSI, DDA,
--                                    DUP, RPA, COMP, OUT, RES, DCT, CT, CD,
--                                    DEP — sem descrição inventada, code=name)
--     - 20 portadores               (aba "PARÂMETROS", coluna G)
--     - 23 períodos oficiais       (aba "Base de Dados", coluna PERIODO)
--
--   Setores e congregações NÃO são criados aqui — pertencem à árvore
--   organizations (matriz "Assembleia de Deus em Caxias do Sul" + 23 setores
--   + 60 congregações, já criados pela migration de estrutura AD Caxias).
--   Esta migration apenas exige que a matriz já exista antes de popular os
--   catálogos financeiros que dependem de organization_id (portadores,
--   contas contábeis, períodos) — nunca cria, nunca corrige, nunca inventa
--   um setor/congregação.
--
--   grupos contábeis e tipos de documento são catálogos GLOBAIS
--   (organization_id NULL) — a própria tabela já suporta esse modelo
--   (20260707100000_production_finance_confiadcs_extension.sql) — portanto
--   não dependem de nenhuma organização específica existir.
--
-- IDEMPOTÊNCIA:
--   Todo INSERT usa ON CONFLICT DO NOTHING contra a unique constraint já
--   existente de cada tabela. Rodar esta migration múltiplas vezes nunca
--   duplica nem sobrescreve dado nenhum.
--
-- ATENÇÃO — DEFAULTS GENÉRICOS PRÉ-EXISTENTES (outras migrations, não desta
-- fase): 20260512100000_staging_treasury_mvp.sql popula, via CROSS JOIN
-- sobre TODAS as organizations já existentes e via trigger para novas
-- organizations, defaults genéricos em finance_account_categories (10
-- códigos "1.01".."2.05") e finance_accounts (4 nomes "Caixa"/"Banco"/
-- "PIX"/"Especie") para CADA organização, inclusive a matriz AD Caxias.
-- 20260707100000_production_finance_confiadcs_extension.sql também insere
-- 6 tipos de documento globais (REC/NF/CF/PIX/TRF/OUT) e 10 grupos
-- contábeis globais (R01-R05/D01-D05) em finance_document_types e
-- finance_accounting_groups. Nenhum desses nomes/códigos colide com os
-- catálogos oficiais do CONFIADCS inseridos abaixo (nomes e códigos
-- completamente distintos), então coexistem sem conflito — mas por isso as
-- verificações abaixo NUNCA usam count(*) bruto da tabela (que incluiria
-- esses defaults genéricos e outros dados legados); cada verificação conta
-- exclusivamente quantos itens da LISTA OFICIAL desta migration foram
-- encontrados persistidos, isolando o catálogo CONFIADCS de qualquer dado
-- pré-existente ou futuro de outra origem.
--
-- REVISÃO HUMANA OBRIGATÓRIA antes de aplicar em produção.
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.finance_accounting_groups') IS NULL
     OR to_regclass('public.finance_document_types') IS NULL
     OR to_regclass('public.finance_accounts') IS NULL
     OR to_regclass('public.finance_account_categories') IS NULL
     OR to_regclass('public.finance_periods') IS NULL
  THEN
    RAISE EXCEPTION '1D-B1.1 preflight failed: tabelas de catálogo financeiro ausentes — aplique as migrations de schema anteriores primeiro';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 1: finance_accounting_groups — 22 grupos (GLOBAL, organization_id NULL)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.finance_accounting_groups (organization_id, code, name, type)
SELECT NULL::uuid, code, name, type
FROM jsonb_to_recordset($groups$[{"code":"0","name":"0 - PRESTADORES DE SERVIÇOS","type":null},{"code":"1","name":"1 - FORNECEDORES","type":null},{"code":"2","name":"2 - FOLHA DE PAGAMENTO","type":null},{"code":"3","name":"3 - TRIBUTOS E IMPOSTOS","type":null},{"code":"4","name":"4 - ALUGUÉIS","type":null},{"code":"5","name":"5 - SANEAMENTO (ÁGUA)","type":null},{"code":"6","name":"6 - ENERGIA ELÉTRICA","type":null},{"code":"7","name":"7 - TELEFONIA E INTERNET","type":null},{"code":"8","name":"8 - COMBUSTÍVEIS","type":null},{"code":"9","name":"9 - ASSISTÊNCIA SOCIAL","type":null},{"code":"10","name":"10 - DESP. ADMINISTRATIVAS","type":null},{"code":"11","name":"11 - FUNDO CONVENCIONAL","type":null},{"code":"14","name":"14 - EBD (ESCOLA DOMINICAL)","type":null},{"code":"15","name":"15 - MISSÕES","type":null},{"code":"16","name":"16 - TEOLOGIA (IBJL)","type":null},{"code":"17","name":"17 - UFADCS (UNIÃO FEMININA)","type":null},{"code":"18","name":"18 - UMADCS","type":null},{"code":"19","name":"19 - DEFADCS","type":null},{"code":"20","name":"20 - RECEITAS","type":"receita"},{"code":"40","name":"40 - TRANSFERÊNCIAS","type":null},{"code":"70","name":"70 - RECEPÇÃO","type":null},{"code":"71","name":"71 - DEPCOM","type":null}]$groups$::jsonb) AS x(code text, name text, type text)
ON CONFLICT (organization_id, type, name) DO NOTHING;

DO $$
DECLARE
  v_matched integer;
BEGIN
  SELECT count(*) INTO v_matched
  FROM jsonb_to_recordset($groups$[{"code":"0","name":"0 - PRESTADORES DE SERVIÇOS","type":null},{"code":"1","name":"1 - FORNECEDORES","type":null},{"code":"2","name":"2 - FOLHA DE PAGAMENTO","type":null},{"code":"3","name":"3 - TRIBUTOS E IMPOSTOS","type":null},{"code":"4","name":"4 - ALUGUÉIS","type":null},{"code":"5","name":"5 - SANEAMENTO (ÁGUA)","type":null},{"code":"6","name":"6 - ENERGIA ELÉTRICA","type":null},{"code":"7","name":"7 - TELEFONIA E INTERNET","type":null},{"code":"8","name":"8 - COMBUSTÍVEIS","type":null},{"code":"9","name":"9 - ASSISTÊNCIA SOCIAL","type":null},{"code":"10","name":"10 - DESP. ADMINISTRATIVAS","type":null},{"code":"11","name":"11 - FUNDO CONVENCIONAL","type":null},{"code":"14","name":"14 - EBD (ESCOLA DOMINICAL)","type":null},{"code":"15","name":"15 - MISSÕES","type":null},{"code":"16","name":"16 - TEOLOGIA (IBJL)","type":null},{"code":"17","name":"17 - UFADCS (UNIÃO FEMININA)","type":null},{"code":"18","name":"18 - UMADCS","type":null},{"code":"19","name":"19 - DEFADCS","type":null},{"code":"20","name":"20 - RECEITAS","type":"receita"},{"code":"40","name":"40 - TRANSFERÊNCIAS","type":null},{"code":"70","name":"70 - RECEPÇÃO","type":null},{"code":"71","name":"71 - DEPCOM","type":null}]$groups$::jsonb) AS x(code text, name text, type text)
  JOIN public.finance_accounting_groups g
    ON g.organization_id IS NULL AND g.name = x.name;

  IF v_matched <> 22 THEN
    RAISE EXCEPTION '1D-B1.1: esperados 22 grupos contábeis oficiais do CONFIADCS persistidos, encontrados %', v_matched;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 2: finance_document_types — 24 tipos (GLOBAL, organization_id NULL)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.finance_document_types (organization_id, code, name)
SELECT NULL::uuid, code, name
FROM jsonb_to_recordset($doctypes$[{"code":"DM","name":"DUPLICATA MERCANTIL"},{"code":"DMI","name":"DUPLICATA MERCANTIL POR INDICAÇÃO"},{"code":"DS","name":"DUPLICATA SIMPLES"},{"code":"DV","name":"DUPLICATA VIRTUAL"},{"code":"DOC","name":"DOCUMENTO DE ORDEM DE CRÉDITO"},{"code":"CUP","name":"CUPOM FISCAL"},{"code":"NFS","name":"NOTA FISCAL DE SERVIÇO"},{"code":"NFE","name":"NOTA FISCAL ELETRÔNICA"},{"code":"TI","name":"TRANSFERÊNCIA INTERNA"},{"code":"TED","name":"TRANSFERÊNCIA ELETRÔNICA DISPONÍVEL"},{"code":"PIX","name":"PAGAMENTO INSTANTANEO"},{"code":"RC","name":"RECIBO"},{"code":"RDO","name":"RELATÓRIO DE DÍZIMOS E OFERTAS"},{"code":"GUI","name":"GUIA DE PAGAMENTO"},{"code":"FAT","name":"FATURA"},{"code":"COM","name":"COMPROVANTE"},{"code":"NC","name":"NOTA DE CONTABILIDADE"},{"code":"NP","name":"NOTA PROMISSÓRIA"},{"code":"BOL","name":"BOLETO"},{"code":"FOL","name":"FOLHA DE PAGAMENTO"},{"code":"DIN","name":"DINHEIRO EM ESPÉCIE"},{"code":"CRN","name":"CARNÊ"},{"code":"OS","name":"ORDEM DE SERVIÇO"},{"code":"S/D","name":"SEM DOCUMENTO"}]$doctypes$::jsonb) AS x(code text, name text)
ON CONFLICT (organization_id, name) DO NOTHING;

DO $$
DECLARE
  v_matched integer;
BEGIN
  SELECT count(*) INTO v_matched
  FROM jsonb_to_recordset($doctypes$[{"code":"DM","name":"DUPLICATA MERCANTIL"},{"code":"DMI","name":"DUPLICATA MERCANTIL POR INDICAÇÃO"},{"code":"DS","name":"DUPLICATA SIMPLES"},{"code":"DV","name":"DUPLICATA VIRTUAL"},{"code":"DOC","name":"DOCUMENTO DE ORDEM DE CRÉDITO"},{"code":"CUP","name":"CUPOM FISCAL"},{"code":"NFS","name":"NOTA FISCAL DE SERVIÇO"},{"code":"NFE","name":"NOTA FISCAL ELETRÔNICA"},{"code":"TI","name":"TRANSFERÊNCIA INTERNA"},{"code":"TED","name":"TRANSFERÊNCIA ELETRÔNICA DISPONÍVEL"},{"code":"PIX","name":"PAGAMENTO INSTANTANEO"},{"code":"RC","name":"RECIBO"},{"code":"RDO","name":"RELATÓRIO DE DÍZIMOS E OFERTAS"},{"code":"GUI","name":"GUIA DE PAGAMENTO"},{"code":"FAT","name":"FATURA"},{"code":"COM","name":"COMPROVANTE"},{"code":"NC","name":"NOTA DE CONTABILIDADE"},{"code":"NP","name":"NOTA PROMISSÓRIA"},{"code":"BOL","name":"BOLETO"},{"code":"FOL","name":"FOLHA DE PAGAMENTO"},{"code":"DIN","name":"DINHEIRO EM ESPÉCIE"},{"code":"CRN","name":"CARNÊ"},{"code":"OS","name":"ORDEM DE SERVIÇO"},{"code":"S/D","name":"SEM DOCUMENTO"}]$doctypes$::jsonb) AS x(code text, name text)
  JOIN public.finance_document_types d
    ON d.organization_id IS NULL AND d.name = x.name;

  IF v_matched <> 24 THEN
    RAISE EXCEPTION '1D-B1.1: esperados 24 tipos de documento oficiais do CONFIADCS persistidos, encontrados %', v_matched;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 2B: finance_document_types — 11 tipos LEGADOS INATIVOS (FASE B1.2
-- "CORREÇÃO FINAL DIRETA", item 4). Estes 11 códigos existem efetivamente
-- nos 29.957 lançamentos da planilha (coluna TIPO DOC), mas NÃO aparecem na
-- lista oficial de 24 tipos da aba PARÂMETROS. Cadastrados como legados
-- (is_active=false) com o próprio código como identidade — name=code,
-- exatamente igual ao valor bruto da planilha, para nunca inventar uma
-- descrição que a planilha não fornece. "COMp" (grafia usada em algumas
-- linhas) resolve automaticamente para "COMP" na importação porque a
-- comparação de catálogo já é case-insensitive (normalizeCatalogText),
-- preservando "COMp" verbatim em document_type_raw_label.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.finance_document_types (organization_id, code, name, is_active)
SELECT NULL::uuid, code, name, false
FROM jsonb_to_recordset($legacydoctypes$[{"code":"DSI","name":"DSI"},{"code":"DDA","name":"DDA"},{"code":"DUP","name":"DUP"},{"code":"RPA","name":"RPA"},{"code":"COMP","name":"COMP"},{"code":"OUT","name":"OUT"},{"code":"RES","name":"RES"},{"code":"DCT","name":"DCT"},{"code":"CT","name":"CT"},{"code":"CD","name":"CD"},{"code":"DEP","name":"DEP"}]$legacydoctypes$::jsonb) AS x(code text, name text)
ON CONFLICT (organization_id, name) DO NOTHING;

DO $$
DECLARE
  v_matched integer;
BEGIN
  SELECT count(*) INTO v_matched
  FROM jsonb_to_recordset($legacydoctypes$[{"code":"DSI","name":"DSI"},{"code":"DDA","name":"DDA"},{"code":"DUP","name":"DUP"},{"code":"RPA","name":"RPA"},{"code":"COMP","name":"COMP"},{"code":"OUT","name":"OUT"},{"code":"RES","name":"RES"},{"code":"DCT","name":"DCT"},{"code":"CT","name":"CT"},{"code":"CD","name":"CD"},{"code":"DEP","name":"DEP"}]$legacydoctypes$::jsonb) AS x(code text, name text)
  JOIN public.finance_document_types d
    ON d.organization_id IS NULL AND d.name = x.name AND d.is_active = false;

  IF v_matched <> 11 THEN
    RAISE EXCEPTION '1D-B1.2: esperados 11 tipos de documento legados (inativos) do CONFIADCS persistidos, encontrados %', v_matched;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 3: catálogos por organização (portadores, contas contábeis, períodos)
-- Dependem da matriz "Assembleia de Deus em Caxias do Sul" já existir na
-- árvore organizations (criada pela migration de estrutura AD Caxias). Se a
-- matriz não existir ainda neste ambiente, a migration para explicitamente
-- em vez de inventar/adivinhar uma organização.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_org uuid;
  v_org_count integer;
  v_setor_count integer;
  v_matched integer;
BEGIN
  -- Identificação DETERMINÍSTICA da matriz (item 5, FASE B1.2, corrigida em
  -- "CORREÇÃO DE IDENTIFICAÇÃO DA MATRIZ" após falha real no STAGING: a
  -- identificação por NOME escolheu uma organização 'matriz' LEGADA
  -- (id 11111111-0000-0000-0000-000000000002, slug
  -- 'assembleia-deus-caxias-do-sul', apenas 1 setor filho) em vez da matriz
  -- real da estrutura AD Caxias (id 10000000-0000-0000-0000-000000000002,
  -- slug 'matriz-caxias-do-sul', 35 setores filhos — 23 oficiais mais
  -- setores históricos adicionais). NUNCA mais usar o nome textual, que
  -- pode estar duplicado/renomeado — a identidade estável e única é o
  -- SLUG, que é a mesma chave usada por
  -- 20260806143000_importacao_ad_caxias_estrutura.sql. Exige adicionalmente
  -- evidência ESTRUTURAL real e verificável: a organização candidata
  -- precisa ter, entre seus filhos diretos, PELO MENOS os 23 setores
  -- oficiais da estrutura AD Caxias (mesmos slugs) — sem exigir que o total
  -- de filhos seja exatamente 23, porque setores históricos adicionais
  -- (39 no total observados em STAGING) são esperados e válidos. Se houver
  -- mais de uma organização 'matriz' com esse slug, ou se os 23 setores
  -- oficiais não estiverem todos presentes, a migration falha em segurança
  -- em vez de adivinhar/inventar qual organização usar.
  SELECT count(*) INTO v_org_count FROM public.organizations
  WHERE slug = 'matriz-caxias-do-sul' AND organization_type = 'matriz';

  IF v_org_count = 0 THEN
    RAISE EXCEPTION '1D-B1.2: matriz de slug ''matriz-caxias-do-sul'' não encontrada — aplique a migration de estrutura AD Caxias antes desta (portadores/contas contábeis/períodos dependem de organization_id)';
  ELSIF v_org_count > 1 THEN
    RAISE EXCEPTION '1D-B1.2: identificação da matriz não é determinística — % organizações do tipo ''matriz'' com slug ''matriz-caxias-do-sul'' encontradas neste ambiente (esperada exatamente 1)', v_org_count;
  END IF;

  SELECT id INTO v_org FROM public.organizations
  WHERE slug = 'matriz-caxias-do-sul' AND organization_type = 'matriz';

  -- Slugs REAIS dos 23 setores oficiais no STAGING (corrigido em "CORREÇÃO
  -- FINAL DA MIGRATION 210000 — LISTA REAL DOS 23 SETORES": os slugs
  -- anteriores ('distrito-NN-...') não existem no ambiente real — a matriz
  -- correta tem 35 filhos diretos no total, sendo 23 setores oficiais com
  -- slug 'setor-NN-...' e 12 setores históricos/genéricos/de teste
  -- adicionais, deliberadamente ignorados aqui).
  SELECT count(*) INTO v_setor_count
  FROM public.organizations s
  WHERE s.parent_id = v_org
    AND s.organization_type = 'setor'
    AND s.slug IN (
      'setor-01-matriz','setor-02-santa-fe','setor-03-sao-caetano','setor-04-fatima',
      'setor-05-pioneiro','setor-06-vila-mary','setor-07-desvio-rizzo','setor-08-forqueta',
      'setor-09-cruzeiro','setor-10-diamantino','setor-11-centenario','setor-12-serrano',
      'setor-13-vila-lobos','setor-14-parada-cristal','setor-15-reolon','setor-16-kaiser',
      'setor-17-charqueadas','setor-18-seculo-xx-sao-ciro','setor-19-vila-cristina',
      'setor-20-altos-de-galopolis','setor-21-fazenda-souza','setor-22-santa-lucia-piai',
      'setor-23-criuva'
    );

  -- >= (não =): a matriz real tem setores históricos adicionais além dos 23
  -- oficiais (35 filhos observados em STAGING) — exigir igualdade exata
  -- rejeitaria o ambiente real. O que importa é que os 23 oficiais estejam
  -- TODOS presentes; setores extras nunca são motivo de falha aqui.
  IF v_setor_count < 23 THEN
    RAISE EXCEPTION '1D-B1.2: organização candidata a matriz (id %, slug matriz-caxias-do-sul) não tem os 23 setores oficiais da estrutura AD Caxias como filhos diretos (encontrados %) — identificação determinística falhou; aplique a migration de estrutura AD Caxias correta neste ambiente antes de semear os catálogos financeiros', v_org, v_setor_count;
  END IF;

  -- ── 3.1 Portadores (finance_accounts) — 20 itens ──────────────────────────
  INSERT INTO public.finance_accounts (organization_id, name, type)
  SELECT v_org, x.name, x.type
  FROM jsonb_to_recordset($portadores$[{"name":"CONGREGAÇÕES","type":"caixa"},{"name":"CAIXA MATRIZ","type":"caixa"},{"name":"CAIXA MISSÃO","type":"caixa"},{"name":"CAIXA EBD","type":"caixa"},{"name":"CAIXA IBJL","type":"caixa"},{"name":"CAIXA UFADCS","type":"caixa"},{"name":"CAIXA UMADCS","type":"caixa"},{"name":"CAIXA DEFADCS","type":"caixa"},{"name":"CAIXA DEPCOM","type":"caixa"},{"name":"CAIXA EBO","type":"caixa"},{"name":"CT SICREDI 99253-6","type":"banco"},{"name":"CT B BRASIL  8528-6","type":"banco"},{"name":"CT SICREDI 00803-4","type":"banco"},{"name":"CT SICREDI 06852-3","type":"banco"},{"name":"CT SICREDI 03275-2","type":"banco"},{"name":"CT SICREDI 44043-3","type":"banco"},{"name":"CT SICREDI 34535-1","type":"banco"},{"name":"CT SICREDI 57760-4","type":"banco"},{"name":"CT SICREDI 99414-3","type":"banco"},{"name":"CT SICREDI 71291-1","type":"banco"}]$portadores$::jsonb) AS x(name text, type text)
  ON CONFLICT (organization_id, name) DO NOTHING;

  SELECT count(*) INTO v_matched
  FROM jsonb_to_recordset($portadores$[{"name":"CONGREGAÇÕES","type":"caixa"},{"name":"CAIXA MATRIZ","type":"caixa"},{"name":"CAIXA MISSÃO","type":"caixa"},{"name":"CAIXA EBD","type":"caixa"},{"name":"CAIXA IBJL","type":"caixa"},{"name":"CAIXA UFADCS","type":"caixa"},{"name":"CAIXA UMADCS","type":"caixa"},{"name":"CAIXA DEFADCS","type":"caixa"},{"name":"CAIXA DEPCOM","type":"caixa"},{"name":"CAIXA EBO","type":"caixa"},{"name":"CT SICREDI 99253-6","type":"banco"},{"name":"CT B BRASIL  8528-6","type":"banco"},{"name":"CT SICREDI 00803-4","type":"banco"},{"name":"CT SICREDI 06852-3","type":"banco"},{"name":"CT SICREDI 03275-2","type":"banco"},{"name":"CT SICREDI 44043-3","type":"banco"},{"name":"CT SICREDI 34535-1","type":"banco"},{"name":"CT SICREDI 57760-4","type":"banco"},{"name":"CT SICREDI 99414-3","type":"banco"},{"name":"CT SICREDI 71291-1","type":"banco"}]$portadores$::jsonb) AS x(name text, type text)
  JOIN public.finance_accounts a
    ON a.organization_id = v_org AND a.name = x.name;

  IF v_matched <> 20 THEN
    RAISE EXCEPTION '1D-B1.1: esperados 20 portadores oficiais do CONFIADCS persistidos para a matriz AD Caxias, encontrados %', v_matched;
  END IF;

  -- ── 3.2 Contas contábeis (finance_account_categories) — 147 itens ─────────
  -- name = texto VERBATIM da planilha (com o código embutido, ex.: "1100
  -- SERVIÇOS") — é exatamente o valor que aparece na coluna CONTA CONTÁBIL da
  -- aba "Base de Dados", garantindo correspondência EXATA na reconciliação
  -- (nunca fuzzy) feita pelo importador.
  INSERT INTO public.finance_account_categories (organization_id, code, name, type)
  SELECT v_org, x.code, x.name, x.type
  FROM jsonb_to_recordset($contas$[{"code":"1100","name":"1100 SERVIÇOS","type":"despesa"},{"code":"1101","name":"1101 SERVIÇOS DE CONSTRUÇÃO E MANUTENÇÃO","type":"despesa"},{"code":"1102","name":"1102 SERVIÇOS ELETRICOS E HIDRÁULICOS","type":"despesa"},{"code":"1103","name":"1103 SERVIÇOS DE ZELADORIA E HIGIENIZAÇÃO","type":"despesa"},{"code":"1104","name":"1104 SERVIÇOS DE SEGURANÇA E MONITORAMENTO","type":"despesa"},{"code":"1105","name":"1105 SERVIÇOS E MATERIAIS DE SERRALHERIA E FUNILARIA","type":"despesa"},{"code":"1106","name":"1106 SERVIÇOS E MATERIAIS DE FLORICULTURA E DECORAÇÃO","type":"despesa"},{"code":"1107","name":"1107 SERVIÇOS E MATERIAIS DE VIDRAÇARIA","type":"despesa"},{"code":"1108","name":"1108 SERVIÇOS E MATERIAIS DE AJARDINAMENTO","type":"despesa"},{"code":"1109","name":"1109 SERVIÇOS E MATERIAIS PARA CONSERTO E CONFECÇÃO DE MÓVEIS","type":"despesa"},{"code":"1110","name":"1110 SERVIÇOS E PEÇAS PARA CONSERTO DE VEÍCULOS (OFICINA MECÂNICA)","type":"despesa"},{"code":"1111","name":"1111 SERVIÇOS E PEÇAS PARA CONSERTO DE EQUIPAMENTOS ELETROELETRÔNICOS","type":"despesa"},{"code":"1112","name":"1112 SERVIÇOS E PEÇAS PARA CONSERTO E HIGIENIZAÇÃO DE EQUIPAMENTOS DE AR CONDICIONADO","type":"despesa"},{"code":"1113","name":"1113 SERVIÇOS DE LAVAGEM E HIGIENIZAÇÃO DE VEÍCULOS","type":"despesa"},{"code":"1114","name":"1114 SERVIÇOS DE ESCRITÓRIO DE CONTABILIDADE","type":"despesa"},{"code":"1115","name":"1115 SERVIÇOS DE CARTÓRIOS E REGISTROS NOTARIAIS","type":"despesa"},{"code":"1116","name":"1116 SERVIÇOS DE TRANSPORTE DE MATERIAIS","type":"despesa"},{"code":"1117","name":"1117 SERVIÇOS DE PLANOS DE SAÚDE","type":"despesa"},{"code":"1118","name":"1118 SERVIÇOS DE PLANO FUNERAL","type":"despesa"},{"code":"1119","name":"1119 SERVIÇOS DE ALIMENTAÇÃO E HOTELARIA","type":"despesa"},{"code":"1120","name":"1120 SERVIÇOS DE MANUTENÇÃO EM EQUIPAMENTOS MECÂNICOS","type":"despesa"},{"code":"1121","name":"1121 SERVIÇOS DE DEDETIZAÇÃO","type":"despesa"},{"code":"1122","name":"1122 SERVIÇOS GRÁFICOS, SERIGRAFIA, CLICHERIA, TIPOGRAFIA E FOTOLITOGRAFIA","type":"despesa"},{"code":"1123","name":"1123 SERVIÇOS DE ENGENHARIA E PROCESSOS DE LIBERAÇÃO DE IMÓVEIS","type":"despesa"},{"code":"1124","name":"1124 SERVIÇOS DE RECARGA DE EXTINTORES","type":"despesa"},{"code":"1125","name":"1125 SERVIÇOS DE COLETA DE MATERIAIS E RESÍDUOS","type":"despesa"},{"code":"1126","name":"1126 SERVIÇOS DE CONSULTORIA TÉCNICA","type":"despesa"},{"code":"1127","name":"1127 SERVIÇOS E PEÇAS PARA CONSERTO DE INSTRUMENTOS MUSICAIS","type":"despesa"},{"code":"1128","name":"1128 SERVIÇOS DE GUINCHOS","type":"despesa"},{"code":"1129","name":"1129 SERVIÇOS DE ASSINTÊNCIA MÉDICA","type":"despesa"},{"code":"1130","name":"1130 SERVIÇOS DE ESCRITÓRIO DE ADVOCACIA","type":"despesa"},{"code":"1131","name":"1131 SERVIÇOS DE CORREIOS E POSTAGENS","type":"despesa"},{"code":"1132","name":"1132 SERVIÇOS DE CONFECÇÃO DE VESTUÁRIO","type":"despesa"},{"code":"1133","name":"1133 SERVIÇOS DE MANUTENÇÃO E REPARO DE EQUIPAMENTOS","type":"despesa"},{"code":"1134","name":"1134 SERVIÇOS DE TRANSMISSÃO E MÍDIAS DIGITAIS","type":"despesa"},{"code":"1135","name":"1135 SERVIÇOS DE TERRAPLANAGEM E NIVELAMENTO","type":"despesa"},{"code":"1136","name":"1136 SERVIÇOS DE TRANSPORTE DE PASSAGEIROS","type":"despesa"},{"code":"1137","name":"1137 SERVIÇOS DE LAVANDERIA - VESTUÁRIO PARA BATISMO","type":"despesa"},{"code":"1138","name":"1138 SERVIÇOS DE CUIDADORIA DOMÉSTICA","type":"despesa"},{"code":"1200","name":"1200 AQUISIÇÕES","type":"despesa"},{"code":"1201","name":"1201 AQUISIÇÃO DE MATERIAIS DE EXPEDIENTE (FOLHAS, CANETAS, LÁPIS, GRAMPOS, TESOURAS, ETC)","type":"despesa"},{"code":"1202","name":"1202 AQUISIÇÃO DE MATERIAIS E INSUMOS DE FERRAGENS","type":"despesa"},{"code":"1203","name":"1203 AQUISIÇÃO DE MATERIAIS E INGREDIENTES PARA REALIZAÇÃO DA CEIA DO SENHOR","type":"despesa"},{"code":"1204","name":"1204 AQUISIÇÃO DE MATERIAIS E INGREDIENTES DE COPA E COZINHA","type":"despesa"},{"code":"1205","name":"1205 AQUISIÇÃO DE LITERATURAS (REVISTAS DA EBD, LIVROS,AGENDAS, BÍBLIAS, ETC)","type":"despesa"},{"code":"1206","name":"1206 AQUISIÇÃO DE APÓLICES DE SEGURO PREDIAIS E VEICULARES","type":"despesa"},{"code":"1207","name":"1207 AQUISIÇÃO E MANUTENÇÃO DE EQUIPAMENTOS DE SOM","type":"despesa"},{"code":"1208","name":"1208 AQUISIÇÃO E MANUTENÇÃO DE INSTRUMENTOS MUSICAIS","type":"despesa"},{"code":"1209","name":"1209 AQUISIÇÃO E MANUTENÇÃO DE EQUIPAMENTOS E SISTEMAS DE INFORMÁTICA","type":"despesa"},{"code":"1210","name":"1210 AQUISIÇÃO E MANUTENÇÃO DE EQUIPAMENTOS E APLICATIVOS DE TELEFONIA","type":"despesa"},{"code":"1211","name":"1211 AQUISIÇÃO E MANUTENÇÃO DE MOBILIÁRIO","type":"despesa"},{"code":"1212","name":"1212 AQUISIÇÃO DE MAT. E EQUIP. DE CONSTRUÇÃO E MANUT","type":"despesa"},{"code":"1213","name":"1213 AQUISIÇÃO DE MAT. E EQUIP. ELÉTRICOS E HIDRÁULICOS","type":"despesa"},{"code":"1214","name":"1214 AQUISIÇÃO DE MAT. E EQUIP. DE LIMPEZA E HIGIENIZAÇÃO","type":"despesa"},{"code":"1215","name":"1215 AQUISIÇÃO DE MAT. E EQUIP. DE SEGURANÇA E MONITORAMENTO","type":"despesa"},{"code":"1216","name":"1216 AQUISIÇÃO DE GÊNEROS ALIMENTÍCIOS PARA CONFECÇÃO DE CESTAS BÁSICAS","type":"despesa"},{"code":"1217","name":"1217 AQUISIÇÃO DE VALE RETIRADA OU PRESENTE","type":"despesa"},{"code":"1218","name":"1218 AQUISIÇÃO DE MATERIAL DE ORNAMENTAÇÃO E DECORAÇÃO","type":"despesa"},{"code":"1219","name":"1219 AQUISIÇÃO DE PASSAGENS AEREAS OU TERRESTRES","type":"despesa"},{"code":"1220","name":"1220 AQUISIÇÃO DE PEÇAS E EQUIPAMENTOS PARA VEÍCULOS","type":"despesa"},{"code":"1221","name":"1221 AQUISIÇÃO DE GÁS PARA AQUECER TANQUE BATISMAL","type":"despesa"},{"code":"1222","name":"1222 AQUISIÇÃO DE MATERIAL PARA DOAÇÃO","type":"despesa"},{"code":"1223","name":"1223 AQUISIÇÃO DE BENEFÍCIO VALE ALIMENTAÇÃO","type":"despesa"},{"code":"1224","name":"1224 AQUISIÇÃO DE BENEFÍCIO VALE TRANSPORTE","type":"despesa"},{"code":"1225","name":"1225 AQUISIÇÃO DE UTENSÍLIOS LITÚRGICOS","type":"despesa"},{"code":"1226","name":"1226 AQUISIÇÃO DE MEDICAMENTOS E UTENSÍLIOS PARAMÉDICOS","type":"despesa"},{"code":"1227","name":"1227 AQUISIÇÃO DE EQUIPAMENTOS DE PROTEÇÃO INDIVIDUAL EPI'S","type":"despesa"},{"code":"1228","name":"1228 AQUISIÇÃO DE VEÍCULOS E EQUIPAMENTOS RODOVIÁRIOS","type":"despesa"},{"code":"1229","name":"1229 AQUISIÇÃO DE VESTUÁRIO PARAMENTAL","type":"despesa"},{"code":"1300","name":"1300 LOCAÇÕES","type":"despesa"},{"code":"1301","name":"1301 LOCAÇÃO DE EQUIPAMENTOS EM GERAL","type":"despesa"},{"code":"1302","name":"1302 LOCAÇÃO DE EQUIPAMENTO E SISTEMAS DE INFORMÁTICA","type":"despesa"},{"code":"1303","name":"1303 LOCAÇÃO DE DIREITOS AUTORAIS","type":"despesa"},{"code":"1304","name":"1304 LOCAÇÃO DE REGISTRO DE DOMINIO","type":"despesa"},{"code":"1305","name":"1305 LOCAÇÃO DE ESTACIONAMENTOS E PEDÁGIOS","type":"despesa"},{"code":"1306","name":"1306 LOCAÇÃO DE OBJETOS PARA EVENTOS","type":"despesa"},{"code":"2100","name":"2100 FOLHA DE PAGAMENTO","type":"despesa"},{"code":"2200","name":"2200 AJUDA DE CUSTO","type":"despesa"},{"code":"2300","name":"2300 PREBENDA ECLESIÁSTICA","type":"despesa"},{"code":"2400","name":"2400 AUXÍLIO FINANCEIRO","type":"despesa"},{"code":"2500","name":"2500 AUXÍLIO JUBILADO","type":"despesa"},{"code":"2600","name":"2600 HONORÁRIOS","type":"despesa"},{"code":"2700","name":"2700 13º SALARIO","type":"despesa"},{"code":"2800","name":"2700 ABONO NATALINO","type":"despesa"},{"code":"2900","name":"2800 RECIBO DE FÉRIAS","type":"despesa"},{"code":"3100","name":"3100 TRIBUTOS FEDERAIS","type":"despesa"},{"code":"3200","name":"3200 TRIBUTOS ESTADUAIS","type":"despesa"},{"code":"3300","name":"3300 TRIBUTOS MUNICIPAIS","type":"despesa"},{"code":"3400","name":"3400 CONTRIBUIÇÃO SINDICAL","type":"despesa"},{"code":"4100","name":"4100 ALUGUEL DE CONGREGAÇÃO","type":"despesa"},{"code":"4200","name":"4200 ALUGUEL DE RESIDÊNCIA","type":"despesa"},{"code":"4300","name":"4300 ALUGUEL DE ESTACIONAMENTO","type":"despesa"},{"code":"4400","name":"4400 TAXAS DE CONDOMÍNIO","type":"despesa"},{"code":"5100","name":"5100 SANEAMENTO (ÁGUA)","type":"despesa"},{"code":"6100","name":"6100 ENERGIA ELÉTRICA (LUZ)","type":"despesa"},{"code":"7100","name":"7100 TELEFONIA E INTERNET","type":"despesa"},{"code":"8100","name":"8100 COMBUSTÍVEIS","type":"despesa"},{"code":"9100","name":"9100 ASSISTÊNCIA SOCIAL","type":"despesa"},{"code":"9200","name":"9200 DESPESAS COM CESTAS BÁSICAS","type":"despesa"},{"code":"10100","name":"10100 DESPESAS ADMINISTRATIVAS","type":"despesa"},{"code":"10101","name":"10101 DESPESAS FINANCEIRAS","type":"despesa"},{"code":"10102","name":"10102 AUXÍLIO FINANCEIRO","type":"despesa"},{"code":"10103","name":"10103 AJUDA DE CUSTO","type":"despesa"},{"code":"10104","name":"10104 PREBENDA ECLESIÁSTICA","type":"despesa"},{"code":"10105","name":"10105 REEMBOLSO","type":"despesa"},{"code":"10106","name":"10106 ABONO DE FÉRIAS","type":"despesa"},{"code":"10107","name":"10107 AUXÍLIO JUBILADO","type":"despesa"},{"code":"11100","name":"11100 FUNDO CONVENCIONAL IGREJA","type":"despesa"},{"code":"11200","name":"11200 FUNDO CONVENCIONAL MINISTROS","type":"despesa"},{"code":"12100","name":"12100 PARCELA EMPRÉSTIMO CONTRAIDO","type":"despesa"},{"code":"12101","name":"12101 PARCELA EMPRÉSTIMO CEDIDO","type":"despesa"},{"code":"13100","name":"13100 PARCELA CONSÓRCIO","type":"despesa"},{"code":"14100","name":"14100 OFERTA EBD","type":"despesa"},{"code":"14101","name":"14101 DESPESAS FINANCEIRAS - EBD","type":"despesa"},{"code":"15100","name":"15100 PREBENDA MISSIONÁRIA","type":"despesa"},{"code":"15101","name":"15101 AJUDA MISSIONÁRIA","type":"despesa"},{"code":"15102","name":"15102 OFERTA MISSIONÁRIA","type":"despesa"},{"code":"15103","name":"15103 OFERTA PARA MISSÃO","type":"despesa"},{"code":"15104","name":"15104 DESPESAS COM MISSÃO (ALUGUÉIS)","type":"despesa"},{"code":"15105","name":"15105 DEPÓSITO EM CONTA CORRENTE","type":"despesa"},{"code":"15106","name":"15106 ABONO NATALINO","type":"despesa"},{"code":"15107","name":"15107 REEMBOLSO","type":"despesa"},{"code":"15108","name":"15108 DESPESAS COM MISSÃO (CONSTRUÇÕES)","type":"despesa"},{"code":"15109","name":"15109 DESPESAS COM MISSÃO (VIAGENS/HOTELARIA/ALIMENTAÇÃO)","type":"despesa"},{"code":"15110","name":"15110 DESPESAS ADMINISTRATIVAS","type":"despesa"},{"code":"16100","name":"16100 DESPESAS FINANCEIRAS - TEOLOGIA","type":"despesa"},{"code":"16101","name":"16101 AUXÍLIO DESLOCAMENTO","type":"despesa"},{"code":"17100","name":"17100 DESPESAS FINANCEIRAS - UNIÃO FEMININA","type":"despesa"},{"code":"18100","name":"18100 OFERTA UMADCS","type":"despesa"},{"code":"18101","name":"18101 DESPESAS FINANCEIRAS - UMADCS","type":"despesa"},{"code":"19000","name":"19000 OFERTA DEFADCS","type":"despesa"},{"code":"19101","name":"19101 DESPESAS FINANCEIRAS - DEFADCS","type":"despesa"},{"code":"20100","name":"20100 DÍZIMOS","type":"receita"},{"code":"20101","name":"20101 DÍZIMOS E OFERTAS","type":"receita"},{"code":"20102","name":"20102 OFERTA ALÇADA","type":"receita"},{"code":"20103","name":"20103 CRÉDITOS DIVERSOS","type":"receita"},{"code":"20104","name":"20104 AJUSTE CONTÁBIL","type":"receita"},{"code":"30101","name":"30101 DEPÓSITO EM CONTA CORRENTE","type":"despesa"},{"code":"30102","name":"20102 DEPÓSITO EM CONTA POUPANÇA","type":"despesa"},{"code":"40101","name":"40101 TRANSFERÊNCIA ENTRE PORTADORES","type":"despesa"},{"code":"40102","name":"40102 TRANSFERÊNCIA ENTRE CONTAS","type":"despesa"},{"code":"70101","name":"70101 OFERTA RECEPÇÃO","type":"despesa"},{"code":"70102","name":"70102 DESPESAS FINANCEIRAS - RECEPÇÃO","type":"despesa"},{"code":"70103","name":"70103 REEMBOLSO","type":"despesa"},{"code":"71101","name":"71101 OFERTA DEPCOM","type":"despesa"},{"code":"71102","name":"71102 DESPESAS FINANCEIRAS - DEPCOM","type":"despesa"},{"code":"71103","name":"71103 REEMBOLSO","type":"despesa"}]$contas$::jsonb) AS x(code text, name text, type text)
  ON CONFLICT (organization_id, code) DO NOTHING;

  SELECT count(*) INTO v_matched
  FROM jsonb_to_recordset($contas$[{"code":"1100","name":"1100 SERVIÇOS","type":"despesa"},{"code":"1101","name":"1101 SERVIÇOS DE CONSTRUÇÃO E MANUTENÇÃO","type":"despesa"},{"code":"1102","name":"1102 SERVIÇOS ELETRICOS E HIDRÁULICOS","type":"despesa"},{"code":"1103","name":"1103 SERVIÇOS DE ZELADORIA E HIGIENIZAÇÃO","type":"despesa"},{"code":"1104","name":"1104 SERVIÇOS DE SEGURANÇA E MONITORAMENTO","type":"despesa"},{"code":"1105","name":"1105 SERVIÇOS E MATERIAIS DE SERRALHERIA E FUNILARIA","type":"despesa"},{"code":"1106","name":"1106 SERVIÇOS E MATERIAIS DE FLORICULTURA E DECORAÇÃO","type":"despesa"},{"code":"1107","name":"1107 SERVIÇOS E MATERIAIS DE VIDRAÇARIA","type":"despesa"},{"code":"1108","name":"1108 SERVIÇOS E MATERIAIS DE AJARDINAMENTO","type":"despesa"},{"code":"1109","name":"1109 SERVIÇOS E MATERIAIS PARA CONSERTO E CONFECÇÃO DE MÓVEIS","type":"despesa"},{"code":"1110","name":"1110 SERVIÇOS E PEÇAS PARA CONSERTO DE VEÍCULOS (OFICINA MECÂNICA)","type":"despesa"},{"code":"1111","name":"1111 SERVIÇOS E PEÇAS PARA CONSERTO DE EQUIPAMENTOS ELETROELETRÔNICOS","type":"despesa"},{"code":"1112","name":"1112 SERVIÇOS E PEÇAS PARA CONSERTO E HIGIENIZAÇÃO DE EQUIPAMENTOS DE AR CONDICIONADO","type":"despesa"},{"code":"1113","name":"1113 SERVIÇOS DE LAVAGEM E HIGIENIZAÇÃO DE VEÍCULOS","type":"despesa"},{"code":"1114","name":"1114 SERVIÇOS DE ESCRITÓRIO DE CONTABILIDADE","type":"despesa"},{"code":"1115","name":"1115 SERVIÇOS DE CARTÓRIOS E REGISTROS NOTARIAIS","type":"despesa"},{"code":"1116","name":"1116 SERVIÇOS DE TRANSPORTE DE MATERIAIS","type":"despesa"},{"code":"1117","name":"1117 SERVIÇOS DE PLANOS DE SAÚDE","type":"despesa"},{"code":"1118","name":"1118 SERVIÇOS DE PLANO FUNERAL","type":"despesa"},{"code":"1119","name":"1119 SERVIÇOS DE ALIMENTAÇÃO E HOTELARIA","type":"despesa"},{"code":"1120","name":"1120 SERVIÇOS DE MANUTENÇÃO EM EQUIPAMENTOS MECÂNICOS","type":"despesa"},{"code":"1121","name":"1121 SERVIÇOS DE DEDETIZAÇÃO","type":"despesa"},{"code":"1122","name":"1122 SERVIÇOS GRÁFICOS, SERIGRAFIA, CLICHERIA, TIPOGRAFIA E FOTOLITOGRAFIA","type":"despesa"},{"code":"1123","name":"1123 SERVIÇOS DE ENGENHARIA E PROCESSOS DE LIBERAÇÃO DE IMÓVEIS","type":"despesa"},{"code":"1124","name":"1124 SERVIÇOS DE RECARGA DE EXTINTORES","type":"despesa"},{"code":"1125","name":"1125 SERVIÇOS DE COLETA DE MATERIAIS E RESÍDUOS","type":"despesa"},{"code":"1126","name":"1126 SERVIÇOS DE CONSULTORIA TÉCNICA","type":"despesa"},{"code":"1127","name":"1127 SERVIÇOS E PEÇAS PARA CONSERTO DE INSTRUMENTOS MUSICAIS","type":"despesa"},{"code":"1128","name":"1128 SERVIÇOS DE GUINCHOS","type":"despesa"},{"code":"1129","name":"1129 SERVIÇOS DE ASSINTÊNCIA MÉDICA","type":"despesa"},{"code":"1130","name":"1130 SERVIÇOS DE ESCRITÓRIO DE ADVOCACIA","type":"despesa"},{"code":"1131","name":"1131 SERVIÇOS DE CORREIOS E POSTAGENS","type":"despesa"},{"code":"1132","name":"1132 SERVIÇOS DE CONFECÇÃO DE VESTUÁRIO","type":"despesa"},{"code":"1133","name":"1133 SERVIÇOS DE MANUTENÇÃO E REPARO DE EQUIPAMENTOS","type":"despesa"},{"code":"1134","name":"1134 SERVIÇOS DE TRANSMISSÃO E MÍDIAS DIGITAIS","type":"despesa"},{"code":"1135","name":"1135 SERVIÇOS DE TERRAPLANAGEM E NIVELAMENTO","type":"despesa"},{"code":"1136","name":"1136 SERVIÇOS DE TRANSPORTE DE PASSAGEIROS","type":"despesa"},{"code":"1137","name":"1137 SERVIÇOS DE LAVANDERIA - VESTUÁRIO PARA BATISMO","type":"despesa"},{"code":"1138","name":"1138 SERVIÇOS DE CUIDADORIA DOMÉSTICA","type":"despesa"},{"code":"1200","name":"1200 AQUISIÇÕES","type":"despesa"},{"code":"1201","name":"1201 AQUISIÇÃO DE MATERIAIS DE EXPEDIENTE (FOLHAS, CANETAS, LÁPIS, GRAMPOS, TESOURAS, ETC)","type":"despesa"},{"code":"1202","name":"1202 AQUISIÇÃO DE MATERIAIS E INSUMOS DE FERRAGENS","type":"despesa"},{"code":"1203","name":"1203 AQUISIÇÃO DE MATERIAIS E INGREDIENTES PARA REALIZAÇÃO DA CEIA DO SENHOR","type":"despesa"},{"code":"1204","name":"1204 AQUISIÇÃO DE MATERIAIS E INGREDIENTES DE COPA E COZINHA","type":"despesa"},{"code":"1205","name":"1205 AQUISIÇÃO DE LITERATURAS (REVISTAS DA EBD, LIVROS,AGENDAS, BÍBLIAS, ETC)","type":"despesa"},{"code":"1206","name":"1206 AQUISIÇÃO DE APÓLICES DE SEGURO PREDIAIS E VEICULARES","type":"despesa"},{"code":"1207","name":"1207 AQUISIÇÃO E MANUTENÇÃO DE EQUIPAMENTOS DE SOM","type":"despesa"},{"code":"1208","name":"1208 AQUISIÇÃO E MANUTENÇÃO DE INSTRUMENTOS MUSICAIS","type":"despesa"},{"code":"1209","name":"1209 AQUISIÇÃO E MANUTENÇÃO DE EQUIPAMENTOS E SISTEMAS DE INFORMÁTICA","type":"despesa"},{"code":"1210","name":"1210 AQUISIÇÃO E MANUTENÇÃO DE EQUIPAMENTOS E APLICATIVOS DE TELEFONIA","type":"despesa"},{"code":"1211","name":"1211 AQUISIÇÃO E MANUTENÇÃO DE MOBILIÁRIO","type":"despesa"},{"code":"1212","name":"1212 AQUISIÇÃO DE MAT. E EQUIP. DE CONSTRUÇÃO E MANUT","type":"despesa"},{"code":"1213","name":"1213 AQUISIÇÃO DE MAT. E EQUIP. ELÉTRICOS E HIDRÁULICOS","type":"despesa"},{"code":"1214","name":"1214 AQUISIÇÃO DE MAT. E EQUIP. DE LIMPEZA E HIGIENIZAÇÃO","type":"despesa"},{"code":"1215","name":"1215 AQUISIÇÃO DE MAT. E EQUIP. DE SEGURANÇA E MONITORAMENTO","type":"despesa"},{"code":"1216","name":"1216 AQUISIÇÃO DE GÊNEROS ALIMENTÍCIOS PARA CONFECÇÃO DE CESTAS BÁSICAS","type":"despesa"},{"code":"1217","name":"1217 AQUISIÇÃO DE VALE RETIRADA OU PRESENTE","type":"despesa"},{"code":"1218","name":"1218 AQUISIÇÃO DE MATERIAL DE ORNAMENTAÇÃO E DECORAÇÃO","type":"despesa"},{"code":"1219","name":"1219 AQUISIÇÃO DE PASSAGENS AEREAS OU TERRESTRES","type":"despesa"},{"code":"1220","name":"1220 AQUISIÇÃO DE PEÇAS E EQUIPAMENTOS PARA VEÍCULOS","type":"despesa"},{"code":"1221","name":"1221 AQUISIÇÃO DE GÁS PARA AQUECER TANQUE BATISMAL","type":"despesa"},{"code":"1222","name":"1222 AQUISIÇÃO DE MATERIAL PARA DOAÇÃO","type":"despesa"},{"code":"1223","name":"1223 AQUISIÇÃO DE BENEFÍCIO VALE ALIMENTAÇÃO","type":"despesa"},{"code":"1224","name":"1224 AQUISIÇÃO DE BENEFÍCIO VALE TRANSPORTE","type":"despesa"},{"code":"1225","name":"1225 AQUISIÇÃO DE UTENSÍLIOS LITÚRGICOS","type":"despesa"},{"code":"1226","name":"1226 AQUISIÇÃO DE MEDICAMENTOS E UTENSÍLIOS PARAMÉDICOS","type":"despesa"},{"code":"1227","name":"1227 AQUISIÇÃO DE EQUIPAMENTOS DE PROTEÇÃO INDIVIDUAL EPI'S","type":"despesa"},{"code":"1228","name":"1228 AQUISIÇÃO DE VEÍCULOS E EQUIPAMENTOS RODOVIÁRIOS","type":"despesa"},{"code":"1229","name":"1229 AQUISIÇÃO DE VESTUÁRIO PARAMENTAL","type":"despesa"},{"code":"1300","name":"1300 LOCAÇÕES","type":"despesa"},{"code":"1301","name":"1301 LOCAÇÃO DE EQUIPAMENTOS EM GERAL","type":"despesa"},{"code":"1302","name":"1302 LOCAÇÃO DE EQUIPAMENTO E SISTEMAS DE INFORMÁTICA","type":"despesa"},{"code":"1303","name":"1303 LOCAÇÃO DE DIREITOS AUTORAIS","type":"despesa"},{"code":"1304","name":"1304 LOCAÇÃO DE REGISTRO DE DOMINIO","type":"despesa"},{"code":"1305","name":"1305 LOCAÇÃO DE ESTACIONAMENTOS E PEDÁGIOS","type":"despesa"},{"code":"1306","name":"1306 LOCAÇÃO DE OBJETOS PARA EVENTOS","type":"despesa"},{"code":"2100","name":"2100 FOLHA DE PAGAMENTO","type":"despesa"},{"code":"2200","name":"2200 AJUDA DE CUSTO","type":"despesa"},{"code":"2300","name":"2300 PREBENDA ECLESIÁSTICA","type":"despesa"},{"code":"2400","name":"2400 AUXÍLIO FINANCEIRO","type":"despesa"},{"code":"2500","name":"2500 AUXÍLIO JUBILADO","type":"despesa"},{"code":"2600","name":"2600 HONORÁRIOS","type":"despesa"},{"code":"2700","name":"2700 13º SALARIO","type":"despesa"},{"code":"2800","name":"2700 ABONO NATALINO","type":"despesa"},{"code":"2900","name":"2800 RECIBO DE FÉRIAS","type":"despesa"},{"code":"3100","name":"3100 TRIBUTOS FEDERAIS","type":"despesa"},{"code":"3200","name":"3200 TRIBUTOS ESTADUAIS","type":"despesa"},{"code":"3300","name":"3300 TRIBUTOS MUNICIPAIS","type":"despesa"},{"code":"3400","name":"3400 CONTRIBUIÇÃO SINDICAL","type":"despesa"},{"code":"4100","name":"4100 ALUGUEL DE CONGREGAÇÃO","type":"despesa"},{"code":"4200","name":"4200 ALUGUEL DE RESIDÊNCIA","type":"despesa"},{"code":"4300","name":"4300 ALUGUEL DE ESTACIONAMENTO","type":"despesa"},{"code":"4400","name":"4400 TAXAS DE CONDOMÍNIO","type":"despesa"},{"code":"5100","name":"5100 SANEAMENTO (ÁGUA)","type":"despesa"},{"code":"6100","name":"6100 ENERGIA ELÉTRICA (LUZ)","type":"despesa"},{"code":"7100","name":"7100 TELEFONIA E INTERNET","type":"despesa"},{"code":"8100","name":"8100 COMBUSTÍVEIS","type":"despesa"},{"code":"9100","name":"9100 ASSISTÊNCIA SOCIAL","type":"despesa"},{"code":"9200","name":"9200 DESPESAS COM CESTAS BÁSICAS","type":"despesa"},{"code":"10100","name":"10100 DESPESAS ADMINISTRATIVAS","type":"despesa"},{"code":"10101","name":"10101 DESPESAS FINANCEIRAS","type":"despesa"},{"code":"10102","name":"10102 AUXÍLIO FINANCEIRO","type":"despesa"},{"code":"10103","name":"10103 AJUDA DE CUSTO","type":"despesa"},{"code":"10104","name":"10104 PREBENDA ECLESIÁSTICA","type":"despesa"},{"code":"10105","name":"10105 REEMBOLSO","type":"despesa"},{"code":"10106","name":"10106 ABONO DE FÉRIAS","type":"despesa"},{"code":"10107","name":"10107 AUXÍLIO JUBILADO","type":"despesa"},{"code":"11100","name":"11100 FUNDO CONVENCIONAL IGREJA","type":"despesa"},{"code":"11200","name":"11200 FUNDO CONVENCIONAL MINISTROS","type":"despesa"},{"code":"12100","name":"12100 PARCELA EMPRÉSTIMO CONTRAIDO","type":"despesa"},{"code":"12101","name":"12101 PARCELA EMPRÉSTIMO CEDIDO","type":"despesa"},{"code":"13100","name":"13100 PARCELA CONSÓRCIO","type":"despesa"},{"code":"14100","name":"14100 OFERTA EBD","type":"despesa"},{"code":"14101","name":"14101 DESPESAS FINANCEIRAS - EBD","type":"despesa"},{"code":"15100","name":"15100 PREBENDA MISSIONÁRIA","type":"despesa"},{"code":"15101","name":"15101 AJUDA MISSIONÁRIA","type":"despesa"},{"code":"15102","name":"15102 OFERTA MISSIONÁRIA","type":"despesa"},{"code":"15103","name":"15103 OFERTA PARA MISSÃO","type":"despesa"},{"code":"15104","name":"15104 DESPESAS COM MISSÃO (ALUGUÉIS)","type":"despesa"},{"code":"15105","name":"15105 DEPÓSITO EM CONTA CORRENTE","type":"despesa"},{"code":"15106","name":"15106 ABONO NATALINO","type":"despesa"},{"code":"15107","name":"15107 REEMBOLSO","type":"despesa"},{"code":"15108","name":"15108 DESPESAS COM MISSÃO (CONSTRUÇÕES)","type":"despesa"},{"code":"15109","name":"15109 DESPESAS COM MISSÃO (VIAGENS/HOTELARIA/ALIMENTAÇÃO)","type":"despesa"},{"code":"15110","name":"15110 DESPESAS ADMINISTRATIVAS","type":"despesa"},{"code":"16100","name":"16100 DESPESAS FINANCEIRAS - TEOLOGIA","type":"despesa"},{"code":"16101","name":"16101 AUXÍLIO DESLOCAMENTO","type":"despesa"},{"code":"17100","name":"17100 DESPESAS FINANCEIRAS - UNIÃO FEMININA","type":"despesa"},{"code":"18100","name":"18100 OFERTA UMADCS","type":"despesa"},{"code":"18101","name":"18101 DESPESAS FINANCEIRAS - UMADCS","type":"despesa"},{"code":"19000","name":"19000 OFERTA DEFADCS","type":"despesa"},{"code":"19101","name":"19101 DESPESAS FINANCEIRAS - DEFADCS","type":"despesa"},{"code":"20100","name":"20100 DÍZIMOS","type":"receita"},{"code":"20101","name":"20101 DÍZIMOS E OFERTAS","type":"receita"},{"code":"20102","name":"20102 OFERTA ALÇADA","type":"receita"},{"code":"20103","name":"20103 CRÉDITOS DIVERSOS","type":"receita"},{"code":"20104","name":"20104 AJUSTE CONTÁBIL","type":"receita"},{"code":"30101","name":"30101 DEPÓSITO EM CONTA CORRENTE","type":"despesa"},{"code":"30102","name":"20102 DEPÓSITO EM CONTA POUPANÇA","type":"despesa"},{"code":"40101","name":"40101 TRANSFERÊNCIA ENTRE PORTADORES","type":"despesa"},{"code":"40102","name":"40102 TRANSFERÊNCIA ENTRE CONTAS","type":"despesa"},{"code":"70101","name":"70101 OFERTA RECEPÇÃO","type":"despesa"},{"code":"70102","name":"70102 DESPESAS FINANCEIRAS - RECEPÇÃO","type":"despesa"},{"code":"70103","name":"70103 REEMBOLSO","type":"despesa"},{"code":"71101","name":"71101 OFERTA DEPCOM","type":"despesa"},{"code":"71102","name":"71102 DESPESAS FINANCEIRAS - DEPCOM","type":"despesa"},{"code":"71103","name":"71103 REEMBOLSO","type":"despesa"}]$contas$::jsonb) AS x(code text, name text, type text)
  JOIN public.finance_account_categories c
    ON c.organization_id = v_org AND c.code = x.code;

  IF v_matched <> 147 THEN
    RAISE EXCEPTION '1D-B1.1: esperadas 147 contas contábeis oficiais do CONFIADCS persistidas para a matriz AD Caxias, encontradas %', v_matched;
  END IF;

  -- ── 3.3 Períodos (finance_periods) — 23 itens ─────────────────────────────
  INSERT INTO public.finance_periods (organization_id, label)
  SELECT v_org, x.label
  FROM jsonb_to_recordset($periods$[{"label":"NOV/24"},{"label":"DEZ/24"},{"label":"JAN/25"},{"label":"FEV/25"},{"label":"MAR/25"},{"label":"ABR/25"},{"label":"MAI/25"},{"label":"JUN/25"},{"label":"JUL/25"},{"label":"AGO/25"},{"label":"AGO/24"},{"label":"SET/25"},{"label":"OUT/25"},{"label":"NOV/25"},{"label":"DEZ/25"},{"label":"JAN/26"},{"label":"FEV/26"},{"label":"MAR/26"},{"label":"ABR/26"},{"label":"MAI/26"},{"label":"JUN/26"},{"label":"JUL/26"},{"label":"AGO/26"}]$periods$::jsonb) AS x(label text)
  ON CONFLICT (organization_id, label) DO NOTHING;

  SELECT count(*) INTO v_matched
  FROM jsonb_to_recordset($periods$[{"label":"NOV/24"},{"label":"DEZ/24"},{"label":"JAN/25"},{"label":"FEV/25"},{"label":"MAR/25"},{"label":"ABR/25"},{"label":"MAI/25"},{"label":"JUN/25"},{"label":"JUL/25"},{"label":"AGO/25"},{"label":"AGO/24"},{"label":"SET/25"},{"label":"OUT/25"},{"label":"NOV/25"},{"label":"DEZ/25"},{"label":"JAN/26"},{"label":"FEV/26"},{"label":"MAR/26"},{"label":"ABR/26"},{"label":"MAI/26"},{"label":"JUN/26"},{"label":"JUL/26"},{"label":"AGO/26"}]$periods$::jsonb) AS x(label text)
  JOIN public.finance_periods p
    ON p.organization_id = v_org AND p.label = x.label;

  IF v_matched <> 23 THEN
    RAISE EXCEPTION '1D-B1.1: esperados 23 períodos oficiais do CONFIADCS persistidos para a matriz AD Caxias, encontrados %', v_matched;
  END IF;
END;
$$;

-- =============================================================================
-- FIM DA MIGRATION
-- Nome: 20260812210000_finance_confiadcs_catalog_seed.sql
-- Revisão humana obrigatória antes de aplicar em produção Supabase.
-- =============================================================================
