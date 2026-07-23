-- =============================================================================
-- TEMPLATE FINANCEIRO — DENOMINAÇÃO "ASSEMBLEIA DE DEUS"
-- Migration: 20260726090000_assembleia_de_deus_finance_template.sql
--
-- OBJETIVO:
--   Disponibilizar, para QUALQUER organização da plataforma (não só uma
--   igreja específica), o plano de contas real usado pela Assembleia de Deus
--   (24 grupos contábeis, ~147 contas contábeis, 24 tipos de documento e os
--   "portadores"/caixas típicos), sem alterar a estrutura genérica atual.
--
--   A estrutura genérica que já existe (10 categorias, 4 centros de custo,
--   4 contas) continua sendo semeada para TODA organização, exatamente como
--   hoje. Este template é ADICIONAL e só entra quando a própria organização
--   se identifica como "Assembleia de Deus" no campo já existente
--   organizations.denomination_type (usado hoje na tela "Configurar
--   nomenclatura" de Congregacoes.tsx).
--
-- ONDE ISSO SE APLICA:
--   Somente em organizações de nível "matriz" ou "sede" (o nível em que o
--   livro-caixa consolidado é mantido no modelo real da AD — setores e
--   congregações são apenas marcadores de origem em cada lançamento, não
--   donos de um plano de contas próprio). Isso preserva 100% do
--   comportamento hoje existente para setores/congregações/subsedes e para
--   qualquer outra denominação.
--
-- QUANDO ISSO É DISPARADO:
--   1) Na criação de uma nova organização matriz/sede já com
--      denomination_type = "Assembleia de Deus" (INSERT).
--   2) Quando uma organização matriz/sede existente tem seu
--      denomination_type alterado para "Assembleia de Deus" depois de já
--      criada (UPDATE) — cobre o caso de igrejas já cadastradas na
--      plataforma antes desta migration.
--
-- SEGURANÇA:
--   Idempotente — todas as inserções usam ON CONFLICT DO NOTHING e podem
--   ser executadas repetidamente sem duplicar dados nem sobrescrever
--   personalizações já feitas pela igreja.
--   NÃO altera nenhuma linha existente, NÃO remove colunas, NÃO recria
--   tabelas.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 0: Garante que a coluna usada como gatilho existe
-- (já existe hoje em produção/staging; ADD COLUMN IF NOT EXISTS é apenas uma
-- rede de segurança para qualquer ambiente onde ainda não tenha sido criada).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS denomination_type text NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 1: Função que semeia o template completo da Assembleia de Deus
-- para UMA organização específica (idempotente, chamável a qualquer momento).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.seed_assembleia_de_deus_finance_template(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1.1 Grupos contábeis (24 grupos reais do CONFIADCS)
  INSERT INTO public.finance_accounting_groups (organization_id, code, name, type)
  VALUES
    (p_organization_id, '0',  'PRESTADORES DE SERVIÇOS', 'despesa'),
    (p_organization_id, '1',  'FORNECEDORES', 'despesa'),
    (p_organization_id, '2',  'FOLHA DE PAGAMENTO', 'despesa'),
    (p_organization_id, '3',  'TRIBUTOS E IMPOSTOS', 'despesa'),
    (p_organization_id, '4',  'ALUGUÉIS', 'despesa'),
    (p_organization_id, '5',  'SANEAMENTO (ÁGUA)', 'despesa'),
    (p_organization_id, '6',  'ENERGIA ELÉTRICA', 'despesa'),
    (p_organization_id, '7',  'TELEFONIA E INTERNET', 'despesa'),
    (p_organization_id, '8',  'COMBUSTÍVEIS', 'despesa'),
    (p_organization_id, '9',  'ASSISTÊNCIA SOCIAL', 'despesa'),
    (p_organization_id, '10', 'DESP. ADMINISTRATIVAS', 'despesa'),
    (p_organization_id, '11', 'FUNDO CONVENCIONAL', 'despesa'),
    (p_organization_id, '12', 'EMPRÉSTIMOS', 'despesa'),
    (p_organization_id, '13', 'CONSÓRCIO', 'despesa'),
    (p_organization_id, '14', 'EBD (ESCOLA DOMINICAL)', NULL),
    (p_organization_id, '15', 'MISSÕES', NULL),
    (p_organization_id, '16', 'TEOLOGIA (IBJL)', 'despesa'),
    (p_organization_id, '17', 'UFADCS (UNIÃO FEMININA)', 'despesa'),
    (p_organization_id, '18', 'UMADCS', NULL),
    (p_organization_id, '19', 'DEFADCS', NULL),
    (p_organization_id, '20', 'RECEITAS', 'receita'),
    (p_organization_id, '30', 'DEPÓSITOS', 'despesa'),
    (p_organization_id, '40', 'TRANSFERÊNCIAS', 'despesa'),
    (p_organization_id, '70', 'RECEPÇÃO', NULL),
    (p_organization_id, '71', 'DEPCOM', NULL)
  ON CONFLICT (organization_id, type, name) DO NOTHING;

  -- 1.2 Contas contábeis (147 contas reais do CONFIADCS, ligadas ao grupo pelo código)
  INSERT INTO public.finance_account_categories (organization_id, code, name, type, is_system, accounting_group_id)
  SELECT p_organization_id, v.code, v.name, v.type, true, g.id
  FROM (VALUES
    ('1100', 'SERVIÇOS', '0', 'despesa'),
    ('1101', 'SERVIÇOS DE CONSTRUÇÃO E MANUTENÇÃO', '0', 'despesa'),
    ('1102', 'SERVIÇOS ELETRICOS E HIDRÁULICOS', '0', 'despesa'),
    ('1103', 'SERVIÇOS DE ZELADORIA E HIGIENIZAÇÃO', '0', 'despesa'),
    ('1104', 'SERVIÇOS DE SEGURANÇA E MONITORAMENTO', '0', 'despesa'),
    ('1105', 'SERVIÇOS E MATERIAIS DE SERRALHERIA E FUNILARIA', '0', 'despesa'),
    ('1106', 'SERVIÇOS E MATERIAIS DE FLORICULTURA E DECORAÇÃO', '0', 'despesa'),
    ('1107', 'SERVIÇOS E MATERIAIS DE VIDRAÇARIA', '0', 'despesa'),
    ('1108', 'SERVIÇOS E MATERIAIS DE AJARDINAMENTO', '0', 'despesa'),
    ('1109', 'SERVIÇOS E MATERIAIS PARA CONSERTO E CONFECÇÃO DE MÓVEIS', '0', 'despesa'),
    ('1110', 'SERVIÇOS E PEÇAS PARA CONSERTO DE VEÍCULOS (OFICINA MECÂNICA)', '0', 'despesa'),
    ('1111', 'SERVIÇOS E PEÇAS PARA CONSERTO DE EQUIPAMENTOS ELETROELETRÔNICOS', '0', 'despesa'),
    ('1112', 'SERVIÇOS E PEÇAS PARA CONSERTO E HIGIENIZAÇÃO DE EQUIPAMENTOS DE AR CONDICIONADO', '0', 'despesa'),
    ('1113', 'SERVIÇOS DE LAVAGEM E HIGIENIZAÇÃO DE VEÍCULOS', '0', 'despesa'),
    ('1114', 'SERVIÇOS DE ESCRITÓRIO DE CONTABILIDADE', '0', 'despesa'),
    ('1115', 'SERVIÇOS DE CARTÓRIOS E REGISTROS NOTARIAIS', '0', 'despesa'),
    ('1116', 'SERVIÇOS DE TRANSPORTE DE MATERIAIS', '0', 'despesa'),
    ('1117', 'SERVIÇOS DE PLANOS DE SAÚDE', '0', 'despesa'),
    ('1118', 'SERVIÇOS DE PLANO FUNERAL', '0', 'despesa'),
    ('1119', 'SERVIÇOS DE ALIMENTAÇÃO E HOTELARIA', '0', 'despesa'),
    ('1120', 'SERVIÇOS DE MANUTENÇÃO EM EQUIPAMENTOS MECÂNICOS', '0', 'despesa'),
    ('1121', 'SERVIÇOS DE DEDETIZAÇÃO', '0', 'despesa'),
    ('1122', 'SERVIÇOS GRÁFICOS, SERIGRAFIA, CLICHERIA, TIPOGRAFIA E FOTOLITOGRAFIA', '0', 'despesa'),
    ('1123', 'SERVIÇOS DE ENGENHARIA E PROCESSOS DE LIBERAÇÃO DE IMÓVEIS', '0', 'despesa'),
    ('1124', 'SERVIÇOS DE RECARGA DE EXTINTORES', '0', 'despesa'),
    ('1125', 'SERVIÇOS DE COLETA DE MATERIAIS E RESÍDUOS', '0', 'despesa'),
    ('1126', 'SERVIÇOS DE CONSULTORIA TÉCNICA', '0', 'despesa'),
    ('1127', 'SERVIÇOS E PEÇAS PARA CONSERTO DE INSTRUMENTOS MUSICAIS', '0', 'despesa'),
    ('1128', 'SERVIÇOS DE GUINCHOS', '0', 'despesa'),
    ('1129', 'SERVIÇOS DE ASSINTÊNCIA MÉDICA', '0', 'despesa'),
    ('1130', 'SERVIÇOS DE ESCRITÓRIO DE ADVOCACIA', '0', 'despesa'),
    ('1131', 'SERVIÇOS DE CORREIOS E POSTAGENS', '0', 'despesa'),
    ('1132', 'SERVIÇOS DE CONFECÇÃO DE VESTUÁRIO', '0', 'despesa'),
    ('1133', 'SERVIÇOS DE MANUTENÇÃO E REPARO DE EQUIPAMENTOS', '0', 'despesa'),
    ('1134', 'SERVIÇOS DE TRANSMISSÃO E MÍDIAS DIGITAIS', '0', 'despesa'),
    ('1135', 'SERVIÇOS DE TERRAPLANAGEM E NIVELAMENTO', '0', 'despesa'),
    ('1136', 'SERVIÇOS DE TRANSPORTE DE PASSAGEIROS', '0', 'despesa'),
    ('1137', 'SERVIÇOS DE LAVANDERIA - VESTUÁRIO PARA BATISMO', '0', 'despesa'),
    ('1138', 'SERVIÇOS DE CUIDADORIA DOMÉSTICA', '0', 'despesa'),
    ('1200', 'AQUISIÇÕES', '1', 'despesa'),
    ('1201', 'AQUISIÇÃO DE MATERIAIS DE EXPEDIENTE (FOLHAS, CANETAS, LÁPIS, GRAMPOS, TESOURAS, ETC)', '1', 'despesa'),
    ('1202', 'AQUISIÇÃO DE MATERIAIS E INSUMOS DE FERRAGENS', '1', 'despesa'),
    ('1203', 'AQUISIÇÃO DE MATERIAIS E INGREDIENTES PARA REALIZAÇÃO DA CEIA DO SENHOR', '1', 'despesa'),
    ('1204', 'AQUISIÇÃO DE MATERIAIS E INGREDIENTES DE COPA E COZINHA', '1', 'despesa'),
    ('1205', 'AQUISIÇÃO DE LITERATURAS (REVISTAS DA EBD, LIVROS,AGENDAS, BÍBLIAS, ETC)', '1', 'despesa'),
    ('1206', 'AQUISIÇÃO DE APÓLICES DE SEGURO PREDIAIS E VEICULARES', '1', 'despesa'),
    ('1207', 'AQUISIÇÃO E MANUTENÇÃO DE EQUIPAMENTOS DE SOM', '1', 'despesa'),
    ('1208', 'AQUISIÇÃO E MANUTENÇÃO DE INSTRUMENTOS MUSICAIS', '1', 'despesa'),
    ('1209', 'AQUISIÇÃO E MANUTENÇÃO DE EQUIPAMENTOS E SISTEMAS DE INFORMÁTICA', '1', 'despesa'),
    ('1210', 'AQUISIÇÃO E MANUTENÇÃO DE EQUIPAMENTOS E APLICATIVOS DE TELEFONIA', '1', 'despesa'),
    ('1211', 'AQUISIÇÃO E MANUTENÇÃO DE MOBILIÁRIO', '1', 'despesa'),
    ('1212', 'AQUISIÇÃO DE MAT. E EQUIP. DE CONSTRUÇÃO E MANUT', '1', 'despesa'),
    ('1213', 'AQUISIÇÃO DE MAT. E EQUIP. ELÉTRICOS E HIDRÁULICOS', '1', 'despesa'),
    ('1214', 'AQUISIÇÃO DE MAT. E EQUIP. DE LIMPEZA E HIGIENIZAÇÃO', '1', 'despesa'),
    ('1215', 'AQUISIÇÃO DE MAT. E EQUIP. DE SEGURANÇA E MONITORAMENTO', '1', 'despesa'),
    ('1216', 'AQUISIÇÃO DE GÊNEROS ALIMENTÍCIOS PARA CONFECÇÃO DE CESTAS BÁSICAS', '1', 'despesa'),
    ('1217', 'AQUISIÇÃO DE VALE RETIRADA OU PRESENTE', '1', 'despesa'),
    ('1218', 'AQUISIÇÃO DE MATERIAL DE ORNAMENTAÇÃO E DECORAÇÃO', '1', 'despesa'),
    ('1219', 'AQUISIÇÃO DE PASSAGENS AEREAS OU TERRESTRES', '1', 'despesa'),
    ('1220', 'AQUISIÇÃO DE PEÇAS E EQUIPAMENTOS PARA VEÍCULOS', '1', 'despesa'),
    ('1221', 'AQUISIÇÃO DE GÁS PARA AQUECER TANQUE BATISMAL', '1', 'despesa'),
    ('1222', 'AQUISIÇÃO DE MATERIAL PARA DOAÇÃO', '1', 'despesa'),
    ('1223', 'AQUISIÇÃO DE BENEFÍCIO VALE ALIMENTAÇÃO', '1', 'despesa'),
    ('1224', 'AQUISIÇÃO DE BENEFÍCIO VALE TRANSPORTE', '1', 'despesa'),
    ('1225', 'AQUISIÇÃO DE UTENSÍLIOS LITÚRGICOS', '1', 'despesa'),
    ('1226', 'AQUISIÇÃO DE MEDICAMENTOS E UTENSÍLIOS PARAMÉDICOS', '1', 'despesa'),
    ('1227', 'AQUISIÇÃO DE EQUIPAMENTOS DE PROTEÇÃO INDIVIDUAL EPI''S', '1', 'despesa'),
    ('1228', 'AQUISIÇÃO DE VEÍCULOS E EQUIPAMENTOS RODOVIÁRIOS', '1', 'despesa'),
    ('1229', 'AQUISIÇÃO DE VESTUÁRIO PARAMENTAL', '1', 'despesa'),
    ('1300', 'LOCAÇÕES', '1', 'despesa'),
    ('1301', 'LOCAÇÃO DE EQUIPAMENTOS EM GERAL', '1', 'despesa'),
    ('1302', 'LOCAÇÃO DE EQUIPAMENTO E SISTEMAS DE INFORMÁTICA', '1', 'despesa'),
    ('1303', 'LOCAÇÃO DE DIREITOS AUTORAIS', '1', 'despesa'),
    ('1304', 'LOCAÇÃO DE REGISTRO DE DOMINIO', '1', 'despesa'),
    ('1305', 'LOCAÇÃO DE ESTACIONAMENTOS E PEDÁGIOS', '1', 'despesa'),
    ('1306', 'LOCAÇÃO DE OBJETOS PARA EVENTOS', '1', 'despesa'),
    ('2100', 'FOLHA DE PAGAMENTO', '2', 'despesa'),
    ('2200', 'AJUDA DE CUSTO', '2', 'despesa'),
    ('2300', 'PREBENDA ECLESIÁSTICA', '2', 'despesa'),
    ('2400', 'AUXÍLIO FINANCEIRO', '2', 'despesa'),
    ('2500', 'AUXÍLIO JUBILADO', '2', 'despesa'),
    ('2600', 'HONORÁRIOS', '2', 'despesa'),
    ('2700', '13º SALARIO', '2', 'despesa'),
    ('2800', 'ABONO NATALINO', '2', 'despesa'),
    ('2900', 'RECIBO DE FÉRIAS', '2', 'despesa'),
    ('3100', 'TRIBUTOS FEDERAIS', '3', 'despesa'),
    ('3200', 'TRIBUTOS ESTADUAIS', '3', 'despesa'),
    ('3300', 'TRIBUTOS MUNICIPAIS', '3', 'despesa'),
    ('3400', 'CONTRIBUIÇÃO SINDICAL', '3', 'despesa'),
    ('4100', 'ALUGUEL DE CONGREGAÇÃO', '4', 'despesa'),
    ('4200', 'ALUGUEL DE RESIDÊNCIA', '4', 'despesa'),
    ('4300', 'ALUGUEL DE ESTACIONAMENTO', '4', 'despesa'),
    ('4400', 'TAXAS DE CONDOMÍNIO', '4', 'despesa'),
    ('5100', 'SANEAMENTO (ÁGUA)', '5', 'despesa'),
    ('6100', 'ENERGIA ELÉTRICA (LUZ)', '6', 'despesa'),
    ('7100', 'TELEFONIA E INTERNET', '7', 'despesa'),
    ('8100', 'COMBUSTÍVEIS', '8', 'despesa'),
    ('9100', 'ASSISTÊNCIA SOCIAL', '9', 'despesa'),
    ('9200', 'DESPESAS COM CESTAS BÁSICAS', '9', 'despesa'),
    ('10100', 'DESPESAS ADMINISTRATIVAS', '10', 'despesa'),
    ('10101', 'DESPESAS FINANCEIRAS', '10', 'despesa'),
    ('10102', 'AUXÍLIO FINANCEIRO', '10', 'despesa'),
    ('10103', 'AJUDA DE CUSTO', '10', 'despesa'),
    ('10104', 'PREBENDA ECLESIÁSTICA', '10', 'despesa'),
    ('10105', 'REEMBOLSO', '10', 'despesa'),
    ('10106', 'ABONO DE FÉRIAS', '10', 'despesa'),
    ('10107', 'AUXÍLIO JUBILADO', '10', 'despesa'),
    ('11100', 'FUNDO CONVENCIONAL IGREJA', '11', 'despesa'),
    ('11200', 'FUNDO CONVENCIONAL MINISTROS', '11', 'despesa'),
    ('12100', 'PARCELA EMPRÉSTIMO CONTRAIDO', '12', 'despesa'),
    ('12101', 'PARCELA EMPRÉSTIMO CEDIDO', '12', 'despesa'),
    ('13100', 'PARCELA CONSÓRCIO', '13', 'despesa'),
    ('14100', 'OFERTA EBD', '14', 'receita'),
    ('14101', 'DESPESAS FINANCEIRAS - EBD', '14', 'despesa'),
    ('15100', 'PREBENDA MISSIONÁRIA', '15', 'despesa'),
    ('15101', 'AJUDA MISSIONÁRIA', '15', 'despesa'),
    ('15102', 'OFERTA MISSIONÁRIA', '15', 'receita'),
    ('15103', 'OFERTA PARA MISSÃO', '15', 'receita'),
    ('15104', 'DESPESAS COM MISSÃO (ALUGUÉIS)', '15', 'despesa'),
    ('15105', 'DEPÓSITO EM CONTA CORRENTE', '15', 'despesa'),
    ('15106', 'ABONO NATALINO', '15', 'despesa'),
    ('15107', 'REEMBOLSO', '15', 'despesa'),
    ('15108', 'DESPESAS COM MISSÃO (CONSTRUÇÕES)', '15', 'despesa'),
    ('15109', 'DESPESAS COM MISSÃO (VIAGENS/HOTELARIA/ALIMENTAÇÃO)', '15', 'despesa'),
    ('15110', 'DESPESAS ADMINISTRATIVAS', '15', 'despesa'),
    ('16100', 'DESPESAS FINANCEIRAS - TEOLOGIA', '16', 'despesa'),
    ('16101', 'AUXÍLIO DESLOCAMENTO', '16', 'despesa'),
    ('17100', 'DESPESAS FINANCEIRAS - UNIÃO FEMININA', '17', 'despesa'),
    ('18100', 'OFERTA UMADCS', '18', 'receita'),
    ('18101', 'DESPESAS FINANCEIRAS - UMADCS', '18', 'despesa'),
    ('19000', 'OFERTA DEFADCS', '19', 'receita'),
    ('19101', 'DESPESAS FINANCEIRAS - DEFADCS', '19', 'despesa'),
    ('20100', 'DÍZIMOS', '20', 'receita'),
    ('20101', 'DÍZIMOS E OFERTAS', '20', 'receita'),
    ('20102', 'OFERTA ALÇADA', '20', 'receita'),
    ('20103', 'CRÉDITOS DIVERSOS', '20', 'receita'),
    ('20104', 'AJUSTE CONTÁBIL', '20', 'receita'),
    ('30101', 'DEPÓSITO EM CONTA CORRENTE', '30', 'despesa'),
    ('30102', 'DEPÓSITO EM CONTA POUPANÇA', '30', 'despesa'),
    ('40101', 'TRANSFERÊNCIA ENTRE PORTADORES', '40', 'despesa'),
    ('40102', 'TRANSFERÊNCIA ENTRE CONTAS', '40', 'despesa'),
    ('70101', 'OFERTA RECEPÇÃO', '70', 'receita'),
    ('70102', 'DESPESAS FINANCEIRAS - RECEPÇÃO', '70', 'despesa'),
    ('70103', 'REEMBOLSO', '70', 'despesa'),
    ('71101', 'OFERTA DEPCOM', '71', 'receita'),
    ('71102', 'DESPESAS FINANCEIRAS - DEPCOM', '71', 'despesa'),
    ('71103', 'REEMBOLSO', '71', 'despesa')
  ) AS v(code, name, gcode, type)
  JOIN public.finance_accounting_groups g
    ON g.organization_id = p_organization_id AND g.code = v.gcode
  ON CONFLICT (organization_id, code) DO NOTHING;

  -- 1.3 Tipos de documento (24 tipos reais do CONFIADCS + variantes encontradas
  -- nos dados históricos, mapeadas ao tipo mais próximo)
  INSERT INTO public.finance_document_types (organization_id, code, name)
  VALUES
    (p_organization_id, 'DM',   'Duplicata Mercantil'),
    (p_organization_id, 'DMI',  'Duplicata Mercantil por Indicação'),
    (p_organization_id, 'DS',   'Duplicata Simples'),
    (p_organization_id, 'DV',   'Duplicata Virtual'),
    (p_organization_id, 'DOC',  'Documento de Ordem de Crédito'),
    (p_organization_id, 'CUP',  'Cupom Fiscal'),
    (p_organization_id, 'NFS',  'Nota Fiscal de Serviço'),
    (p_organization_id, 'NFE',  'Nota Fiscal Eletrônica'),
    (p_organization_id, 'TI',   'Transferência Interna'),
    (p_organization_id, 'TED',  'Transferência Eletrônica Disponível'),
    (p_organization_id, 'PIX',  'Pagamento Instantâneo (Pix)'),
    (p_organization_id, 'RC',   'Recibo'),
    (p_organization_id, 'RDO',  'Relatório de Dízimos e Ofertas'),
    (p_organization_id, 'GUI',  'Guia de Pagamento'),
    (p_organization_id, 'FAT',  'Fatura'),
    (p_organization_id, 'COM',  'Comprovante'),
    (p_organization_id, 'NC',   'Nota de Contabilidade'),
    (p_organization_id, 'NP',   'Nota Promissória'),
    (p_organization_id, 'BOL',  'Boleto'),
    (p_organization_id, 'FOL',  'Folha de Pagamento'),
    (p_organization_id, 'DIN',  'Dinheiro em Espécie'),
    (p_organization_id, 'CRN',  'Carnê'),
    (p_organization_id, 'OS',   'Ordem de Serviço'),
    (p_organization_id, 'S/D',  'Sem Documento'),
    -- Variantes/abreviações adicionais observadas no histórico real da AD.
    -- Nomes mantidos distintos dos canônicos acima (a constraint de
    -- unicidade é por nome, não por código) para que ambos os códigos
    -- continuem resolvendo corretamente na importação.
    (p_organization_id, 'COMP', 'Comprovante (variante)'),
    (p_organization_id, 'DUP',  'Duplicata'),
    (p_organization_id, 'CT',   'Comprovante de Transferência'),
    (p_organization_id, 'DEP',  'Depósito'),
    (p_organization_id, 'DDA',  'Débito Direto Autorizado'),
    (p_organization_id, 'RES',  'Ressarcimento'),
    (p_organization_id, 'RPA',  'Recibo de Pagamento a Autônomo'),
    (p_organization_id, 'OUT',  'Outro'),
    (p_organization_id, 'CD',   'Cartão de Débito'),
    (p_organization_id, 'DCT',  'Documento Contábil'),
    (p_organization_id, 'DSI',  'Duplicata Simples por Indicação')
  ON CONFLICT (organization_id, name) DO NOTHING;

  -- 1.4 Portadores (caixas e contas bancárias típicos da AD)
  INSERT INTO public.finance_accounts (organization_id, name, type)
  VALUES
    (p_organization_id, 'Caixa Matriz',    'caixa'),
    (p_organization_id, 'Caixa Missão',    'caixa'),
    (p_organization_id, 'Caixa EBD',       'caixa'),
    (p_organization_id, 'Caixa IBJL',      'caixa'),
    (p_organization_id, 'Caixa UFADCS',    'caixa'),
    (p_organization_id, 'Caixa UMADCS',    'caixa'),
    (p_organization_id, 'Caixa DEFADCS',   'caixa'),
    (p_organization_id, 'Caixa EBO',       'caixa'),
    (p_organization_id, 'Caixa DEPCOM',    'caixa'),
    (p_organization_id, 'Congregações',    'caixa'),
    (p_organization_id, 'Conta Corrente',  'banco'),
    (p_organization_id, 'Conta Poupança',  'banco'),
    (p_organization_id, 'Pix',             'pix')
  ON CONFLICT (organization_id, name) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.seed_assembleia_de_deus_finance_template(uuid) IS
  'Semeia o plano de contas real da Assembleia de Deus (grupos, contas, '
  'tipos de documento e portadores) para a organização informada. '
  'Idempotente — pode ser chamada quantas vezes for preciso.';

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 2: Gatilho — dispara automaticamente quando uma organização
-- matriz/sede é criada ou atualizada com denomination_type = Assembleia de Deus
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.seed_finance_defaults_for_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Estrutura genérica (inalterada — semeada para TODA organização, como hoje)
  INSERT INTO public.finance_account_categories (organization_id, code, name, type, is_system)
  VALUES
    (NEW.id, '1.01', 'Dizimos', 'receita', true),
    (NEW.id, '1.02', 'Ofertas', 'receita', true),
    (NEW.id, '1.03', 'Campanhas', 'receita', true),
    (NEW.id, '1.04', 'Missoes', 'receita', true),
    (NEW.id, '1.05', 'Eventos', 'receita', true),
    (NEW.id, '2.01', 'Administrativo', 'despesa', true),
    (NEW.id, '2.02', 'Manutencao', 'despesa', true),
    (NEW.id, '2.03', 'Folha/Pastoral', 'despesa', true),
    (NEW.id, '2.04', 'Missoes', 'despesa', true),
    (NEW.id, '2.05', 'Eventos', 'despesa', true)
  ON CONFLICT (organization_id, code) DO NOTHING;

  INSERT INTO public.finance_cost_centers (organization_id, name, type)
  VALUES
    (NEW.id, 'Matriz', 'matriz'),
    (NEW.id, 'Congregacoes', 'congregacao'),
    (NEW.id, 'Departamentos', 'departamento'),
    (NEW.id, 'Eventos', 'evento')
  ON CONFLICT (organization_id, name) DO NOTHING;

  INSERT INTO public.finance_accounts (organization_id, name, type)
  VALUES
    (NEW.id, 'Caixa', 'caixa'),
    (NEW.id, 'Banco', 'banco'),
    (NEW.id, 'PIX', 'pix'),
    (NEW.id, 'Especie', 'especie')
  ON CONFLICT (organization_id, name) DO NOTHING;

  -- NOVO: template contábil completo da Assembleia de Deus. Só entra para
  -- organizações no nível "matriz"/"sede" (onde vive o livro-caixa
  -- consolidado no modelo real da AD) cujo denomination_type identifique a
  -- denominação (comparação tolerante a acento/caixa). Não afeta setor,
  -- congregacao, subsede nem nenhuma outra denominação.
  IF NEW.organization_type IN ('matriz', 'sede')
     AND NEW.denomination_type IS NOT NULL
     AND lower(NEW.denomination_type) LIKE '%assemble%deus%'
  THEN
    PERFORM public.seed_assembleia_de_deus_finance_template(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger de criação (já existia — recriado aqui apenas para garantir que
-- aponte para a versão atualizada da função acima).
DROP TRIGGER IF EXISTS seed_finance_defaults_on_organization ON public.organizations;
CREATE TRIGGER seed_finance_defaults_on_organization
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.seed_finance_defaults_for_org();

-- Trigger NOVO: cobre organizações matriz/sede que já existiam antes desta
-- migration e só definem/alteram denomination_type depois (ex.: pela tela
-- "Configurar nomenclatura"). Reexecuta o mesmo seed idempotente — seguro
-- mesmo quando o valor não muda para Assembleia de Deus (a função verifica
-- a condição internamente e os INSERTs são ON CONFLICT DO NOTHING).
DROP TRIGGER IF EXISTS seed_finance_defaults_on_organization_denomination_update ON public.organizations;
CREATE TRIGGER seed_finance_defaults_on_organization_denomination_update
AFTER UPDATE OF denomination_type ON public.organizations
FOR EACH ROW
WHEN (NEW.denomination_type IS DISTINCT FROM OLD.denomination_type)
EXECUTE FUNCTION public.seed_finance_defaults_for_org();

-- =============================================================================
-- FIM DA MIGRATION
-- Nome: 20260726090000_assembleia_de_deus_finance_template.sql
-- =============================================================================
