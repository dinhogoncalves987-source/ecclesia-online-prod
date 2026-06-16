-- ============================================================
-- Seed Demo — Matriz Municipal Caxias do Sul
-- ============================================================
-- METODO RECOMENDADO: npm run demo:seed-matriz
--
-- Alternativa manual: execute CADA BLOCO separadamente no
-- SQL Editor do Supabase. Copie e cole um bloco de cada vez.
--
-- Org alvo : 10000000-0000-0000-0000-000000000002
-- NAO usa  : 11111111-0000-0000-0000-000000000002
--
-- Cada DO $$ e independente — falha de um nao afeta os outros.
-- Se nenhum dado for inserido, o BLOCO FINAL lanca EXCEPTION.
-- ============================================================

SET client_encoding = 'UTF8';

-- ============================================================
-- BLOCO 01 — Setores e Congregacoes
-- ============================================================
DO $$
DECLARE
  v_org uuid := '10000000-0000-0000-0000-000000000002';
  v_cnt int  := 0;
BEGIN
  RAISE NOTICE '[01] Setores + Congregacoes — inicio';

  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org) THEN
    RAISE EXCEPTION '[01] ABORTADO: org % nao encontrada. Execute a migration de orgs demo primeiro.', v_org;
  END IF;

  -- Setores
  INSERT INTO public.organizations
    (id, name, organization_type, parent_id, city, state, country_code, language_code, active)
  VALUES
    ('dd000001-0000-0000-0000-000000000001','Setor Norte', 'setor',v_org,'Caxias do Sul','RS','BR','pt-BR',true),
    ('dd000001-0000-0000-0000-000000000002','Setor Sul',   'setor',v_org,'Caxias do Sul','RS','BR','pt-BR',true),
    ('dd000001-0000-0000-0000-000000000003','Setor Leste', 'setor',v_org,'Caxias do Sul','RS','BR','pt-BR',true),
    ('dd000001-0000-0000-0000-000000000004','Setor Oeste', 'setor',v_org,'Caxias do Sul','RS','BR','pt-BR',true),
    ('dd000001-0000-0000-0000-000000000005','Setor Centro','setor',v_org,'Caxias do Sul','RS','BR','pt-BR',true)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RAISE NOTICE '[01] Setores inseridos: %', v_cnt;

  -- Congregacoes (parent = setor correspondente)
  INSERT INTO public.organizations
    (id, name, organization_type, parent_id, city, state, country_code, language_code, active)
  VALUES
    ('dd000002-0000-0000-0000-000000000001','Congregacao Central',        'congregacao',v_org,                                       'Caxias do Sul','RS','BR','pt-BR',true),
    ('dd000002-0000-0000-0000-000000000002','Congregacao Bela Vista',     'congregacao','dd000001-0000-0000-0000-000000000001','Caxias do Sul','RS','BR','pt-BR',true),
    ('dd000002-0000-0000-0000-000000000003','Congregacao Sao Jose',       'congregacao','dd000001-0000-0000-0000-000000000001','Caxias do Sul','RS','BR','pt-BR',true),
    ('dd000002-0000-0000-0000-000000000004','Congregacao Cruzeiro',       'congregacao','dd000001-0000-0000-0000-000000000002','Caxias do Sul','RS','BR','pt-BR',true),
    ('dd000002-0000-0000-0000-000000000005','Congregacao Santa Catarina', 'congregacao','dd000001-0000-0000-0000-000000000002','Caxias do Sul','RS','BR','pt-BR',true),
    ('dd000002-0000-0000-0000-000000000006','Congregacao Desvio Rizzo',   'congregacao','dd000001-0000-0000-0000-000000000003','Caxias do Sul','RS','BR','pt-BR',true),
    ('dd000002-0000-0000-0000-000000000007','Congregacao Ana Rech',       'congregacao','dd000001-0000-0000-0000-000000000003','Caxias do Sul','RS','BR','pt-BR',true),
    ('dd000002-0000-0000-0000-000000000008','Congregacao Esplanada',      'congregacao','dd000001-0000-0000-0000-000000000004','Caxias do Sul','RS','BR','pt-BR',true),
    ('dd000002-0000-0000-0000-000000000009','Congregacao Planalto',       'congregacao','dd000001-0000-0000-0000-000000000004','Caxias do Sul','RS','BR','pt-BR',true),
    ('dd000002-0000-0000-0000-00000000000a','Congregacao Serrano',        'congregacao','dd000001-0000-0000-0000-000000000005','Caxias do Sul','RS','BR','pt-BR',true)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RAISE NOTICE '[01] Congregacoes inseridas: %', v_cnt;

  RAISE NOTICE '[01] OK';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[01] ERRO (bloco revertido): %', SQLERRM;
END $$;


-- ============================================================
-- BLOCO 02 — Membros (25)
-- ============================================================
DO $$
DECLARE
  v_org uuid := '10000000-0000-0000-0000-000000000002';
  v_cnt int  := 0;
BEGIN
  RAISE NOTICE '[02] Membros — inicio';

  INSERT INTO public.members
    (id, organization_id, full_name, member_role, status, phone, email, city, state, birth_date, baptized_at, joined_at)
  VALUES
    ('dd000003-0000-0000-0000-000000000001',v_org,'Pr. Sergio Luiz Bortolanza','Pastor',    'Ativo','(54) 98801-0001','pastor@adcaxias.org.br',       'Caxias do Sul','RS','1970-03-12','1990-04-15','2010-01-10'),
    ('dd000003-0000-0000-0000-000000000002',v_org,'Ana Paula Zanella',         'Lider',     'Ativo','(54) 98801-0002','anapz@adcaxias.org.br',          'Caxias do Sul','RS','1980-07-22','2002-06-08','2015-03-20'),
    ('dd000003-0000-0000-0000-000000000003',v_org,'Marcos Antonio Rossato',    'Obreiro',   'Ativo','(54) 98801-0003','marcos.rossato@adcaxias.org.br', 'Caxias do Sul','RS','1975-11-05','1998-09-20','2012-05-15'),
    ('dd000003-0000-0000-0000-000000000004',v_org,'Roseli Maria Ferrari',      'Secretaria','Ativo','(54) 98801-0004','secretaria@adcaxias.org.br',     'Caxias do Sul','RS','1978-04-18','2000-01-30','2013-08-01'),
    ('dd000003-0000-0000-0000-000000000005',v_org,'Gilberto Pedro Colombo',    'Tesoureiro','Ativo','(54) 98801-0005','tesoureiro@adcaxias.org.br',     'Caxias do Sul','RS','1972-09-30','1995-03-25','2011-02-28'),
    ('dd000003-0000-0000-0000-000000000006',v_org,'Leandro Basso',             'Diacono',   'Ativo','(54) 98801-0006','leandro.basso@adcaxias.org.br',  'Caxias do Sul','RS','1985-12-14','2007-11-12','2016-07-04'),
    ('dd000003-0000-0000-0000-000000000007',v_org,'Fernanda Pasinato',         'Lider',     'Ativo','(54) 98801-0007','fernanda.p@adcaxias.org.br',     'Caxias do Sul','RS','1982-06-02','2004-05-05','2014-11-11'),
    ('dd000003-0000-0000-0000-000000000008',v_org,'Vitor Andreatta',           'Obreiro',   'Ativo','(54) 98801-0008',NULL,                             'Caxias do Sul','RS','1990-02-20',NULL,        '2018-03-07'),
    ('dd000003-0000-0000-0000-000000000009',v_org,'Roberto Galvani',           'Membro',    'Ativo','(54) 98801-0009',NULL,                             'Caxias do Sul','RS','1965-08-08','1988-07-15','2010-09-09'),
    ('dd000003-0000-0000-0000-00000000000a',v_org,'Maria Jose Tonetto',        'Membro',    'Ativo','(54) 98801-0010',NULL,                             'Caxias do Sul','RS','1960-01-25','1985-12-22','2010-01-01'),
    ('dd000003-0000-0000-0000-00000000000b',v_org,'Paulo Eduardo Antoniazzi',  'Diacono',   'Inativo',     '(54) 98801-0011',NULL,'Caxias do Sul','RS','1988-05-17','2010-03-10','2017-06-30'),
    ('dd000003-0000-0000-0000-00000000000c',v_org,'Cristiane Degasperi',       'Membro',    'Inativo',     '(54) 98801-0012',NULL,'Caxias do Sul','RS','1992-10-03',NULL,        '2019-04-20'),
    ('dd000003-0000-0000-0000-00000000000d',v_org,'Rodrigo Maran',             'Membro',    'Inativo',     '(54) 98801-0013',NULL,'Caxias do Sul','RS','1987-03-28',NULL,        '2018-12-01'),
    ('dd000003-0000-0000-0000-00000000000e',v_org,'Simone Bettega',            'Membro',    'Disciplinado','(54) 98801-0014',NULL,'Caxias do Sul','RS','1983-07-11','2005-08-14','2015-09-15'),
    ('dd000003-0000-0000-0000-00000000000f',v_org,'Julio Cesar Brandalise',    'Obreiro',   'Disciplinado','(54) 98801-0015',NULL,'Caxias do Sul','RS','1993-04-04',NULL,        '2020-02-10'),
    ('dd000003-0000-0000-0000-000000000010',v_org,'Patricia Scortegagna',      'Membro',    'Disciplinado','(54) 98801-0016',NULL,'Caxias do Sul','RS','1995-09-19',NULL,        '2021-07-14'),
    ('dd000003-0000-0000-0000-000000000011',v_org,'Anderson Volpato',          'Membro',    'Transferido', '(54) 98801-0017',NULL,'Caxias do Sul','RS','1991-12-25',NULL,        '2020-10-05'),
    ('dd000003-0000-0000-0000-000000000012',v_org,'Elisangela Mantovani',      'Membro',    'Transferido', '(54) 98801-0018',NULL,'Caxias do Sul','RS','1984-02-14','2006-03-19','2016-01-08'),
    ('dd000003-0000-0000-0000-000000000013',v_org,'Rafael Casagrande',         'Jovem',     'Transferido', '(54) 98801-0019',NULL,'Caxias do Sul','RS','2000-06-30',NULL,        '2022-03-25'),
    ('dd000003-0000-0000-0000-000000000014',v_org,'Larissa Fracasso',          'Jovem',     'Falecido',    '(54) 98801-0020',NULL,'Caxias do Sul','RS','2001-11-08',NULL,        '2022-08-12'),
    ('dd000003-0000-0000-0000-000000000015',v_org,'Gustavo Pegoraro',          'Jovem',     'Falecido',    '(54) 98801-0021',NULL,'Caxias do Sul','RS','1999-04-22',NULL,        '2021-05-18'),
    ('dd000003-0000-0000-0000-000000000016',v_org,'Julia Bortolini',           'Jovem',     'Falecido',    '(54) 98801-0022',NULL,'Caxias do Sul','RS','2002-08-15',NULL,        '2023-01-30'),
    ('dd000003-0000-0000-0000-000000000017',v_org,'Thiago Polesso',            'Jovem',     'Visitante',   '(54) 98801-0023',NULL,'Caxias do Sul','RS','1998-03-01',NULL,        '2021-11-20'),
    ('dd000003-0000-0000-0000-000000000018',v_org,'Camila Dallacosta',         'Membro',    'Visitante',   '(54) 98801-0024',NULL,'Caxias do Sul','RS','1986-10-17','2009-04-05','2017-04-25'),
    ('dd000003-0000-0000-0000-000000000019',v_org,'Antonio Cominetto',         'Membro',    'Visitante',   '(54) 98801-0025',NULL,'Caxias do Sul','RS','1958-05-30','1982-10-10','2010-01-01')
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RAISE NOTICE '[02] Membros inseridos: %', v_cnt;

  RAISE NOTICE '[02] OK';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[02] ERRO (bloco revertido): %', SQLERRM;
END $$;


-- ============================================================
-- BLOCO 03 — Cartas de Recomendacao (5)
-- (execute apos BLOCO 02)
-- ============================================================
DO $$
DECLARE
  v_org  uuid := '10000000-0000-0000-0000-000000000002';
  v_name text;
  v_cnt  int  := 0;
BEGIN
  RAISE NOTICE '[03] Cartas de Recomendacao — inicio';

  SELECT name INTO v_name FROM public.organizations WHERE id = v_org;
  IF v_name IS NULL THEN v_name := 'Assembleia de Deus em Caxias do Sul'; END IF;

  INSERT INTO public.recommendation_letters
    (id, organization_id, member_id, member_name, member_email,
     origin_church_name, destination_church, destination_city, destination_state,
     reason, observations, status, requested_at, reviewed_at, approved_at)
  VALUES
    ('dd000004-0000-0000-0000-000000000001',v_org,
     'dd000003-0000-0000-0000-000000000003','Marcos Antonio Rossato','marcos.rossato@adcaxias.org.br',
     v_name,'Assembleia de Deus — Zona Norte','Porto Alegre','RS',
     'Transferencia de residencia','Membro se muda em razao de novo emprego na capital.',
     'requested', now()-interval '14 days', NULL, NULL),

    ('dd000004-0000-0000-0000-000000000002',v_org,
     'dd000003-0000-0000-0000-000000000013','Rafael Casagrande',NULL,
     v_name,'Assembleia de Deus — Campo de Sao Paulo','Sao Paulo','SP',
     'Mudanca para fins de estudo','Membro ingressou em universidade federal. Apresenta-se ao campo local.',
     'requested', now()-interval '7 days', NULL, NULL),

    ('dd000004-0000-0000-0000-000000000003',v_org,
     'dd000003-0000-0000-0000-00000000000e','Simone Bettega',NULL,
     v_name,'Assembleia de Deus — Boqueirao — Curitiba','Curitiba','PR',
     'Apresentacao de membro durante relocacao','Relocacao profissional de 6 meses. Membro em plena comunhao.',
     'under_review', now()-interval '21 days', now()-interval '18 days', NULL),

    ('dd000004-0000-0000-0000-000000000004',v_org,
     'dd000003-0000-0000-0000-000000000007','Fernanda Pasinato','fernanda.p@adcaxias.org.br',
     v_name,'Assembleia de Deus — Campinas — Florianopolis','Florianopolis','SC',
     'Transferencia de congregacao','Membro em plena comunhao. Transferencia solicitada pelo proprio membro.',
     'approved', now()-interval '30 days', now()-interval '27 days', now()-interval '25 days'),

    ('dd000004-0000-0000-0000-000000000005',v_org,
     'dd000003-0000-0000-0000-000000000009','Roberto Galvani',NULL,
     v_name,'Assembleia de Deus — Orlando — FL','Orlando','FL',
     'Viagem missionaria internacional','Membro viajou sem documentacao ministerial completa. Carta nao emitida.',
     'rejected', now()-interval '45 days', now()-interval '42 days', NULL)
  ON CONFLICT (id) DO UPDATE SET
    destination_church   = EXCLUDED.destination_church,
    destination_city     = EXCLUDED.destination_city,
    destination_state    = EXCLUDED.destination_state,
    reason               = EXCLUDED.reason,
    observations         = EXCLUDED.observations;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RAISE NOTICE '[03] Cartas inseridas: %', v_cnt;

  RAISE NOTICE '[03] OK';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[03] ERRO (bloco revertido): %', SQLERRM;
END $$;


-- ============================================================
-- BLOCO 04 — Financeiro Basico (contas, categorias, centros)
-- ============================================================
DO $$
DECLARE
  v_org uuid := '10000000-0000-0000-0000-000000000002';
  v_cnt int  := 0;
BEGIN
  RAISE NOTICE '[04] Financeiro Basico — inicio';

  -- Contas
  INSERT INTO public.finance_accounts
    (id, organization_id, name, type, current_balance, opening_balance, is_active)
  VALUES
    ('dd000005-0000-0000-0000-000000000001',v_org,'Caixa Geral',             'caixa',   12450.00,  5000.00,true),
    ('dd000005-0000-0000-0000-000000000002',v_org,'Conta Corrente Bradesco', 'banco',   38920.50, 10000.00,true),
    ('dd000005-0000-0000-0000-000000000003',v_org,'Fundo de Missoes',        'banco',   15300.00,  2000.00,true),
    ('dd000005-0000-0000-0000-000000000004',v_org,'Fundo de Construcao',     'banco',   89750.00, 50000.00,true),
    ('dd000005-0000-0000-0000-000000000005',v_org,'Caixa Congregacoes',      'caixa',    4210.00,  1000.00,true)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RAISE NOTICE '[04] Contas inseridas: %', v_cnt;

  -- Categorias (codes prefixados com DD- para evitar conflito com categorias existentes)
  INSERT INTO public.finance_account_categories
    (id, organization_id, code, name, type, is_active, is_system)
  VALUES
    ('dd000006-0000-0000-0000-000000000001',v_org,'DD-REC-01','Dizimos',             'receita', true,false),
    ('dd000006-0000-0000-0000-000000000002',v_org,'DD-REC-02','Ofertas',             'receita', true,false),
    ('dd000006-0000-0000-0000-000000000003',v_org,'DD-REC-03','Missoes Doacao',      'receita', true,false),
    ('dd000006-0000-0000-0000-000000000004',v_org,'DD-REC-04','Fundo Construcao',    'receita', true,false),
    ('dd000006-0000-0000-0000-000000000005',v_org,'DD-DEP-01','Aluguel Manutencao',  'despesa', true,false),
    ('dd000006-0000-0000-0000-000000000006',v_org,'DD-DEP-02','Energia Eletrica',    'despesa', true,false),
    ('dd000006-0000-0000-0000-000000000007',v_org,'DD-DEP-03','Material Suprimentos','despesa', true,false),
    ('dd000006-0000-0000-0000-000000000008',v_org,'DD-DEP-04','Acao Social',         'despesa', true,false)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RAISE NOTICE '[04] Categorias inseridas: %', v_cnt;

  -- Centros de custo
  INSERT INTO public.finance_cost_centers
    (id, organization_id, name, type, is_active)
  VALUES
    ('dd000007-0000-0000-0000-000000000001',v_org,'Ministerio de Louvor',  'departamento', true),
    ('dd000007-0000-0000-0000-000000000002',v_org,'Ministerio Infantil',   'departamento', true),
    ('dd000007-0000-0000-0000-000000000003',v_org,'Missoes Nacionais',     'departamento', true),
    ('dd000007-0000-0000-0000-000000000004',v_org,'Administracao Geral',   'matriz',       true)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RAISE NOTICE '[04] Centros de custo inseridos: %', v_cnt;

  RAISE NOTICE '[04] OK';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[04] ERRO (bloco revertido): %', SQLERRM;
END $$;


-- ============================================================
-- BLOCO 05 — Transacoes (30)
-- Requer: BLOCO 04 executado + usuario na organization_users
-- Se nao houver usuario, use: npm run demo:seed-matriz
-- ============================================================
DO $$
DECLARE
  v_org     uuid := '10000000-0000-0000-0000-000000000002';
  v_user_id uuid;
  v_cnt     int  := 0;
  fa1       uuid := 'dd000005-0000-0000-0000-000000000001';
  fa2       uuid := 'dd000005-0000-0000-0000-000000000002';
  fa3       uuid := 'dd000005-0000-0000-0000-000000000003';
  fa4       uuid := 'dd000005-0000-0000-0000-000000000004';
  fc1       uuid := 'dd000006-0000-0000-0000-000000000001';
  fc2       uuid := 'dd000006-0000-0000-0000-000000000002';
  fc3       uuid := 'dd000006-0000-0000-0000-000000000003';
  fc4       uuid := 'dd000006-0000-0000-0000-000000000004';
  fc5       uuid := 'dd000006-0000-0000-0000-000000000005';
  fc6       uuid := 'dd000006-0000-0000-0000-000000000006';
  fc7       uuid := 'dd000006-0000-0000-0000-000000000007';
  fc8       uuid := 'dd000006-0000-0000-0000-000000000008';
BEGIN
  RAISE NOTICE '[05] Transacoes — inicio';

  SELECT user_id INTO v_user_id FROM public.organization_users WHERE organization_id = v_org LIMIT 1;
  IF v_user_id IS NULL THEN
    SELECT user_id INTO v_user_id FROM public.organization_users LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    RAISE NOTICE '[05] IGNORADO: nenhum usuario disponivel. Use: npm run demo:seed-matriz';
    RETURN;
  END IF;

  INSERT INTO public.transactions
    (id, organization_id, user_id, type, category, description, amount, date, status, payment_method, financial_account_id, account_category_id)
  VALUES
    -- Entradas — Dizimos (8)
    ('dd000008-0000-0000-0000-000000000001',v_org,v_user_id,'Entrada','Dizimos','Dizimos culto domingo 02/02/2026', 4800,'2026-02-02','Confirmado','PIX',fa2,fc1),
    ('dd000008-0000-0000-0000-000000000002',v_org,v_user_id,'Entrada','Dizimos','Dizimos culto domingo 02/03/2026', 5100,'2026-03-02','Confirmado','PIX',fa2,fc1),
    ('dd000008-0000-0000-0000-000000000003',v_org,v_user_id,'Entrada','Dizimos','Dizimos culto domingo 06/04/2026', 5350,'2026-04-06','Confirmado','PIX',fa2,fc1),
    ('dd000008-0000-0000-0000-000000000004',v_org,v_user_id,'Entrada','Dizimos','Dizimos culto domingo 04/05/2026', 4950,'2026-05-04','Confirmado','Dinheiro',fa2,fc1),
    ('dd000008-0000-0000-0000-000000000005',v_org,v_user_id,'Entrada','Dizimos','Dizimos culto domingo 01/06/2026', 5200,'2026-06-01','Confirmado','PIX',fa2,fc1),
    ('dd000008-0000-0000-0000-000000000006',v_org,v_user_id,'Entrada','Dizimos','Dizimos culto quarta 11/06/2026',  1800,'2026-06-11','Confirmado','Dinheiro',fa1,fc1),
    ('dd000008-0000-0000-0000-000000000007',v_org,v_user_id,'Entrada','Dizimos','Dizimos online maio 2026',         2300,'2026-05-20','Confirmado','PIX',fa2,fc1),
    ('dd000008-0000-0000-0000-000000000008',v_org,v_user_id,'Entrada','Dizimos','Dizimos culto domingo 15/06/2026', 5400,'2026-06-15','Pendente',  'PIX',fa2,fc1),
    -- Entradas — Ofertas (5)
    ('dd000008-0000-0000-0000-000000000009',v_org,v_user_id,'Entrada','Ofertas','Oferta especial Congresso Oracao',2200,'2026-06-13','Confirmado','Dinheiro',fa1,fc2),
    ('dd000008-0000-0000-0000-00000000000a',v_org,v_user_id,'Entrada','Ofertas','Oferta culto familia maio',      1450,'2026-05-24','Confirmado','Dinheiro',fa1,fc2),
    ('dd000008-0000-0000-0000-00000000000b',v_org,v_user_id,'Entrada','Ofertas','Oferta dominical marco',        1700,'2026-03-08','Confirmado','Dinheiro',fa1,fc2),
    ('dd000008-0000-0000-0000-00000000000c',v_org,v_user_id,'Entrada','Ofertas','Oferta Santa Ceia abril',        850,'2026-04-20','Confirmado','Dinheiro',fa1,fc2),
    ('dd000008-0000-0000-0000-00000000000d',v_org,v_user_id,'Entrada','Ofertas','Oferta missionaria junho',      1200,'2026-06-07','Pendente',  'Dinheiro',fa1,fc2),
    -- Entradas — Missoes (2)
    ('dd000008-0000-0000-0000-00000000000e',v_org,v_user_id,'Entrada','Missoes Doacao','Doacao Projeto Missoes Africa', 3500,'2026-04-15','Confirmado','Transferencia',fa3,fc3),
    ('dd000008-0000-0000-0000-00000000000f',v_org,v_user_id,'Entrada','Missoes Doacao','Doacao Missoes Camboja parceria',2800,'2026-05-10','Confirmado','PIX',fa3,fc3),
    -- Entradas — Construcao (2)
    ('dd000008-0000-0000-0000-000000000010',v_org,v_user_id,'Entrada','Fundo Construcao','Oferta construcao novo templo abr',6200,'2026-04-28','Confirmado','PIX',fa4,fc4),
    ('dd000008-0000-0000-0000-000000000011',v_org,v_user_id,'Entrada','Fundo Construcao','Oferta construcao novo templo mai',5800,'2026-05-26','Confirmado','PIX',fa4,fc4),
    -- Saidas — Aluguel/Manutencao (3)
    ('dd000008-0000-0000-0000-000000000012',v_org,v_user_id,'Saida','Aluguel Manutencao','Aluguel auditorio abril 2026',   1800,'2026-04-05','Confirmado','Transferencia',fa2,fc5),
    ('dd000008-0000-0000-0000-000000000013',v_org,v_user_id,'Saida','Aluguel Manutencao','Manutencao sistema de som',       950,'2026-05-12','Confirmado','PIX',fa2,fc5),
    ('dd000008-0000-0000-0000-000000000014',v_org,v_user_id,'Saida','Aluguel Manutencao','Aluguel auditorio maio 2026',    1800,'2026-05-05','Confirmado','Transferencia',fa2,fc5),
    -- Saidas — Energia (2)
    ('dd000008-0000-0000-0000-000000000015',v_org,v_user_id,'Saida','Energia Eletrica','Conta de luz abril 2026', 420,'2026-04-10','Confirmado','Transferencia',fa2,fc6),
    ('dd000008-0000-0000-0000-000000000016',v_org,v_user_id,'Saida','Energia Eletrica','Conta de luz maio 2026',  390,'2026-05-10','Confirmado','Transferencia',fa2,fc6),
    -- Saidas — Material (3)
    ('dd000008-0000-0000-0000-000000000017',v_org,v_user_id,'Saida','Material Suprimentos','Material EBD apostilas biblias',680,'2026-04-18','Confirmado','PIX',fa1,fc7),
    ('dd000008-0000-0000-0000-000000000018',v_org,v_user_id,'Saida','Material Suprimentos','Material limpeza marco',        180,'2026-03-20','Confirmado','Dinheiro',fa1,fc7),
    ('dd000008-0000-0000-0000-000000000019',v_org,v_user_id,'Saida','Material Suprimentos','Material grafico banner',       350,'2026-06-02','Pendente',  'PIX',fa1,fc7),
    -- Saidas — Acao Social (2)
    ('dd000008-0000-0000-0000-00000000001a',v_org,v_user_id,'Saida','Acao Social','Acao Social Inverno cestas basicas',2400,'2026-05-18','Confirmado','Transferencia',fa2,fc8),
    ('dd000008-0000-0000-0000-00000000001b',v_org,v_user_id,'Saida','Acao Social','Distribuicao cobertores junho',     850,'2026-06-07','Confirmado','Dinheiro',fa1,fc8),
    -- Saidas — Missoes saida (2)
    ('dd000008-0000-0000-0000-00000000001c',v_org,v_user_id,'Saida','Missoes Doacao','Envio apoio missionario Africa mai',3200,'2026-05-28','Confirmado','Transferencia',fa3,fc3),
    ('dd000008-0000-0000-0000-00000000001d',v_org,v_user_id,'Saida','Missoes Doacao','Passagens equipe Camboja',         2100,'2026-06-10','Pendente',  'Transferencia',fa3,fc3),
    -- Saida — Construcao (1)
    ('dd000008-0000-0000-0000-00000000001e',v_org,v_user_id,'Saida','Fundo Construcao','Contrato alvenaria fundacao fase 1',8500,'2026-06-08','Confirmado','Transferencia',fa4,fc4)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RAISE NOTICE '[05] Transacoes inseridas: %', v_cnt;

  RAISE NOTICE '[05] OK';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[05] ERRO (bloco revertido): %', SQLERRM;
END $$;


-- ============================================================
-- BLOCO 06 — Documentos (6) + Eventos (8)
-- ============================================================
DO $$
DECLARE
  v_org uuid := '10000000-0000-0000-0000-000000000002';
  v_cnt int  := 0;
BEGIN
  RAISE NOTICE '[06] Documentos + Eventos — inicio';

  INSERT INTO public.documents (id, organization_id, title, document_type, content)
  VALUES
    ('dd000009-0000-0000-0000-000000000001',v_org,
     'Ata da Assembleia Geral Ordinaria 2025','Ata',
     'ATA DA ASSEMBLEIA GERAL ORDINARIA 2025 — Assembleia de Deus em Caxias do Sul. Data: 28/11/2025, 19h30, Templo Sede. Presentes: 87 membros. Pauta: relatorio pastoral, financeiro, eleicao diretoria, aprovacao projeto de construcao. Resultado: aprovado por unanimidade.'),
    ('dd000009-0000-0000-0000-000000000002',v_org,
     'Declaracao de Membro — Sergio Bortolanza','Declaracao',
     'DECLARACAO DE MEMBRO. A Assembleia de Deus em Caxias do Sul declara que o Pr. Sergio Luiz Bortolanza e membro em plena comunhao desde 10/01/2010. Emitido para os devidos fins.'),
    ('dd000009-0000-0000-0000-000000000003',v_org,
     'Estatuto Social — AD Caxias do Sul','Estatuto',
     'ESTATUTO SOCIAL — ASSEMBLEIA DE DEUS EM CAXIAS DO SUL. Entidade religiosa sem fins lucrativos, Caxias do Sul, RS. Objetivos: pregar o Evangelho, promover adoracao e discipulado, missoes e acao social. Administrada pelo Conselho Pastoral eleito em Assembleia Geral.'),
    ('dd000009-0000-0000-0000-000000000004',v_org,
     'Relatorio Financeiro Semestral 1o Sem 2026','Relatorio',
     'RELATORIO FINANCEIRO 1o SEMESTRE 2026. RECEITAS: Dizimos R$34600, Ofertas R$9850, Missoes R$8500, Construcao R$18200. TOTAL RECEITAS: R$71150. DESPESAS: Aluguel R$8250, Energia R$2380, Material R$3120, Acao Social R$5600, Missoes R$12400, Construcao R$38500. TOTAL DESPESAS: R$70250. SALDO: R$900.'),
    ('dd000009-0000-0000-0000-000000000005',v_org,
     'Autorizacao de Uso de Imagem — Ministerio Infantil','Autorizacao',
     'AUTORIZACAO DE USO DE IMAGEM. Autorizamos o uso da imagem de nosso filho(a) nas atividades do Ministerio Infantil da Assembleia de Deus em Caxias do Sul, para fins eclesiasticos sem fins lucrativos.'),
    ('dd000009-0000-0000-0000-000000000006',v_org,
     'Carta de Recomendacao Arquivada — Fernanda Pasinato','Carta de Recomendacao',
     'CARTA DE RECOMENDACAO ARQUIVADA. Emitida em 21/05/2026 para Fernanda Pasinato, destinada a Assembleia de Deus — Campinas — Florianopolis/SC. Aprovada e validada via Ecclesia Online — codigo DD000004.')
  ON CONFLICT (id) DO UPDATE SET
    content = EXCLUDED.content;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RAISE NOTICE '[06] Documentos inseridos: %', v_cnt;

  INSERT INTO public.events
    (id, organization_id, title, description, starts_at, ends_at, location, event_type, is_public)
  VALUES
    ('dd00000a-0000-0000-0000-000000000001',v_org,'Culto de Ensino — Domingo',      'Tema: Fe que move montanhas.',                              '2026-06-21T10:00:00','2026-06-21T12:00:00','Templo Sede',       'bg-accent',  true),
    ('dd00000a-0000-0000-0000-000000000002',v_org,'Reuniao de Obreiros',             'Reuniao mensal de planejamento com obreiros da Matriz.',     '2026-06-18T19:00:00','2026-06-18T21:00:00','Salao Paroquial',   'bg-primary', false),
    ('dd00000a-0000-0000-0000-000000000003',v_org,'Escola Biblica Dominical',        'Estudo por faixa etaria. Tema: Epistola aos Romanos.',       '2026-06-22T09:00:00','2026-06-22T10:00:00','Salas de Ensino',   'bg-success', true),
    ('dd00000a-0000-0000-0000-000000000004',v_org,'Ensaio do Louvor',                'Ensaio semanal da equipe de louvor e musicos.',              '2026-06-17T19:30:00','2026-06-17T21:30:00','Templo Sede',       'bg-primary', false),
    ('dd00000a-0000-0000-0000-000000000005',v_org,'Atendimento Pastoral',            'Atendimento individual mediante agendamento.',               '2026-06-19T14:00:00','2026-06-19T18:00:00','Sala Pastoral',     'bg-accent',  false),
    ('dd00000a-0000-0000-0000-000000000006',v_org,'Santa Ceia',                      'Celebracao da Santa Ceia no culto da familia.',              '2026-06-28T19:00:00','2026-06-28T21:00:00','Templo Sede',       'bg-success', true),
    ('dd00000a-0000-0000-0000-000000000007',v_org,'Reuniao da Secretaria',           'Reuniao administrativa mensal.',                            '2026-06-25T14:00:00','2026-06-25T16:00:00','Sala Secretaria',   'bg-primary', false),
    ('dd00000a-0000-0000-0000-000000000008',v_org,'Culto de Oracao — Quarta',        'Culto de oracao e intercessao semanal.',                    '2026-06-25T19:30:00','2026-06-25T21:00:00','Templo Sede',       'bg-accent',  true)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RAISE NOTICE '[06] Eventos inseridos: %', v_cnt;

  RAISE NOTICE '[06] OK';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[06] ERRO (bloco revertido): %', SQLERRM;
END $$;


-- ============================================================
-- BLOCO 07 — Escalas (schedules)
-- Nota: coluna "status" pode nao existir dependendo do ambiente.
-- O bloco tenta inserir sem "status"; o default do banco e aplicado.
-- ============================================================
DO $$
DECLARE
  v_org uuid := '10000000-0000-0000-0000-000000000002';
  v_cnt int  := 0;
BEGIN
  RAISE NOTICE '[07] Escalas — inicio';

  -- Inserindo SEM a coluna status (pode nao existir em todos os ambientes)
  -- Se a coluna existir com DEFAULT, o banco aplica automaticamente.
  INSERT INTO public.schedules
    (id, organization_id, title, description, schedule_date, ministry)
  VALUES
    ('dd000010-0000-0000-0000-000000000001',v_org,'Escala de Louvor 21/06',    'Lider: Ana Paula Zanella. Musicos: Gustavo Pegoraro, Vitor Andreatta.','2026-06-21T10:00:00','Louvor e Adoracao'),
    ('dd000010-0000-0000-0000-000000000002',v_org,'Escala de Recepcao 21/06',  'Responsaveis: Leandro Basso e Cristiane Degasperi.',                  '2026-06-21T09:30:00','Recepcao e Acolhimento'),
    ('dd000010-0000-0000-0000-000000000003',v_org,'Escala EBD 22/06',          'Infantil: Fernanda Pasinato. Jovens: Thiago Polesso. Adultos: Marcos.','2026-06-22T09:00:00','Escola Biblica'),
    ('dd000010-0000-0000-0000-000000000004',v_org,'Escala de Intercessao Junho','Equipe: Maria Jose Tonetto, Simone Bettega, Elisangela Mantovani.',   '2026-06-01T00:00:00','Intercessao'),
    ('dd000010-0000-0000-0000-000000000005',v_org,'Escala Santa Ceia 28/06',   'Diaconos: Leandro Basso, Paulo Antoniazzi. Apoio: Anderson Volpato.', '2026-06-28T19:00:00','Ministerio'),
    ('dd000010-0000-0000-0000-000000000006',v_org,'Escala de Louvor 28/06',    'Lider: Ana Paula Zanella. Musicos para Santa Ceia.',                  '2026-06-28T19:00:00','Louvor e Adoracao'),
    ('dd000010-0000-0000-0000-000000000007',v_org,'Escala de Limpeza Semana',  'Responsaveis: Camila Dallacosta e Antonio Cominetto.',                '2026-06-22T07:00:00','Administrativa')
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RAISE NOTICE '[07] Escalas inseridas: %', v_cnt;

  RAISE NOTICE '[07] OK';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[07] ERRO (bloco revertido): %', SQLERRM;
  RAISE NOTICE '[07] Se o erro for "column status does not exist", o bloco foi pulado com seguranca.';
END $$;


-- ============================================================
-- BLOCO 08 — Grupos (5) + Membros dos Grupos (25)
-- (execute apos BLOCO 02)
-- ============================================================
DO $$
DECLARE
  v_org uuid := '10000000-0000-0000-0000-000000000002';
  g1    uuid := 'dd00000b-0000-0000-0000-000000000001';
  g2    uuid := 'dd00000b-0000-0000-0000-000000000002';
  g3    uuid := 'dd00000b-0000-0000-0000-000000000003';
  g4    uuid := 'dd00000b-0000-0000-0000-000000000004';
  g5    uuid := 'dd00000b-0000-0000-0000-000000000005';
  v_cnt int  := 0;
BEGIN
  RAISE NOTICE '[08] Grupos + Membros dos Grupos — inicio';

  INSERT INTO public.groups
    (id, organization_id, name, description, group_type, meeting_day, meeting_time, location, leader_member_id, is_active)
  VALUES
    (g1,v_org,'Jovens Resgate',    'Grupo jovens 15-30 anos. Evangelismo, discipulado e missoes.',              'jovens',       'Sabado',      '19:00','Salao dos Jovens','dd000003-0000-0000-0000-000000000015',true),
    (g2,v_org,'Casais Agape',      'Grupo casais. Estudo: Amor e Respeito (Ef 5:22-33).',                       'casais',       'Sexta-feira', '20:00','Salao Paroquial', 'dd000003-0000-0000-0000-000000000002',true),
    (g3,v_org,'Mulheres de Fe',    'Grupo mulheres — comunhao, oracao e estudo biblico.',                       'mulheres',     'Terca-feira', '14:00','Salao Paroquial', 'dd000003-0000-0000-0000-000000000007',true),
    (g4,v_org,'Homens de Valor',   'Grupo homens — lideranca familiar e espiritual.',                           'homens',       'Sabado',      '08:00','Sala de Ensino',   'dd000003-0000-0000-0000-000000000005',true),
    (g5,v_org,'Adolescentes Raiz', 'Grupo adolescentes 12-17 anos. Atividades ludicas e biblicas.',             'adolescentes', 'Sabado',      '15:00','Salao dos Jovens','dd000003-0000-0000-0000-000000000008',true)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RAISE NOTICE '[08] Grupos inseridos: %', v_cnt;

  INSERT INTO public.group_members (id, group_id, member_id, role, joined_at)
  VALUES
    -- Jovens Resgate
    ('dd00000c-0000-0000-0000-000000000001',g1,'dd000003-0000-0000-0000-000000000013','member','2022-03-01'),
    ('dd00000c-0000-0000-0000-000000000002',g1,'dd000003-0000-0000-0000-000000000014','member','2022-08-15'),
    ('dd00000c-0000-0000-0000-000000000003',g1,'dd000003-0000-0000-0000-000000000015','leader', '2021-05-20'),
    ('dd00000c-0000-0000-0000-000000000004',g1,'dd000003-0000-0000-0000-000000000016','member','2023-02-01'),
    ('dd00000c-0000-0000-0000-000000000005',g1,'dd000003-0000-0000-0000-000000000017','member','2021-11-22'),
    -- Casais Agape
    ('dd00000c-0000-0000-0000-000000000006',g2,'dd000003-0000-0000-0000-000000000002','leader', '2015-03-25'),
    ('dd00000c-0000-0000-0000-000000000007',g2,'dd000003-0000-0000-0000-000000000003','member','2017-06-10'),
    ('dd00000c-0000-0000-0000-000000000008',g2,'dd000003-0000-0000-0000-000000000006','member','2016-07-05'),
    ('dd00000c-0000-0000-0000-000000000009',g2,'dd000003-0000-0000-0000-00000000000e','member','2018-01-20'),
    ('dd00000c-0000-0000-0000-00000000000a',g2,'dd000003-0000-0000-0000-000000000018','member','2017-04-26'),
    -- Mulheres de Fe
    ('dd00000c-0000-0000-0000-00000000000b',g3,'dd000003-0000-0000-0000-000000000007','leader', '2014-11-15'),
    ('dd00000c-0000-0000-0000-00000000000c',g3,'dd000003-0000-0000-0000-000000000004','member','2015-02-10'),
    ('dd00000c-0000-0000-0000-00000000000d',g3,'dd000003-0000-0000-0000-00000000000a','member','2013-04-05'),
    ('dd00000c-0000-0000-0000-00000000000e',g3,'dd000003-0000-0000-0000-00000000000c','member','2020-01-08'),
    ('dd00000c-0000-0000-0000-00000000000f',g3,'dd000003-0000-0000-0000-000000000012','member','2016-09-30'),
    -- Homens de Valor
    ('dd00000c-0000-0000-0000-000000000010',g4,'dd000003-0000-0000-0000-000000000005','leader', '2011-03-01'),
    ('dd00000c-0000-0000-0000-000000000011',g4,'dd000003-0000-0000-0000-000000000009','member','2012-05-10'),
    ('dd00000c-0000-0000-0000-000000000012',g4,'dd000003-0000-0000-0000-00000000000b','member','2018-02-14'),
    ('dd00000c-0000-0000-0000-000000000013',g4,'dd000003-0000-0000-0000-00000000000f','member','2020-07-01'),
    ('dd00000c-0000-0000-0000-000000000014',g4,'dd000003-0000-0000-0000-000000000019','member','2011-06-15'),
    -- Adolescentes Raiz
    ('dd00000c-0000-0000-0000-000000000015',g5,'dd000003-0000-0000-0000-000000000008','leader', '2018-03-10'),
    ('dd00000c-0000-0000-0000-000000000016',g5,'dd000003-0000-0000-0000-00000000000d','member','2021-04-01'),
    ('dd00000c-0000-0000-0000-000000000017',g5,'dd000003-0000-0000-0000-000000000010','member','2022-03-15'),
    ('dd00000c-0000-0000-0000-000000000018',g5,'dd000003-0000-0000-0000-000000000011','member','2020-10-10'),
    ('dd00000c-0000-0000-0000-000000000019',g5,'dd000003-0000-0000-0000-000000000016','member','2023-09-05')
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RAISE NOTICE '[08] Membros de grupos inseridos: %', v_cnt;

  RAISE NOTICE '[08] OK';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[08] ERRO (bloco revertido): %', SQLERRM;
END $$;


-- ============================================================
-- BLOCO 09 — Assembleias + Comunicados + Pedidos de Oracao
-- ============================================================
DO $$
DECLARE
  v_org uuid := '10000000-0000-0000-0000-000000000002';
  v_cnt int  := 0;
BEGIN
  RAISE NOTICE '[09] Assembleias + Comunicados + Oracoes — inicio';

  INSERT INTO public.assemblies
    (id, organization_id, title, description, assembly_date, starts_at, ends_at, is_visible)
  VALUES
    ('dd00000d-0000-0000-0000-000000000001',v_org,
     'Assembleia Geral Ordinaria 2025',
     'Relatorio pastoral/financeiro, eleicao diretoria e aprovacao construcao novo templo.',
     '2025-11-28','2025-11-28T19:30:00','2025-11-28T22:30:00',true),
    ('dd00000d-0000-0000-0000-000000000002',v_org,
     'Assembleia Extraordinaria — Credito Obra',
     'Votacao para aprovacao de credito para aceleracao da obra do novo templo.',
     '2026-03-15','2026-03-15T19:00:00','2026-03-15T21:30:00',true),
    ('dd00000d-0000-0000-0000-000000000003',v_org,
     'Assembleia Geral Ordinaria 2026',
     'Relatorio semestral, calendario de missoes e plano de acao 2o semestre.',
     '2026-07-26','2026-07-26T19:00:00','2026-07-26T22:00:00',true)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RAISE NOTICE '[09] Assembleias inseridas: %', v_cnt;

  INSERT INTO public.communications
    (id, organization_id, title, content, communication_type, is_public, published_at)
  VALUES
    ('dd00000e-0000-0000-0000-000000000001',v_org,
     'Campanha de Dizimos — Construcao do Novo Templo',
     'Irmaos, a obra do nosso novo templo avanca. Participem da campanha de dizimos. Meta 2o semestre: R$ 80.000.',
     'Importante',true, now()-interval '10 days'),
    ('dd00000e-0000-0000-0000-000000000002',v_org,
     'Santa Ceia — 28 de Junho',
     'Convidamos todos os membros em plena comunhao para a Santa Ceia, dia 28/06 as 19h. Venha preparado!',
     'Normal',true, now()-interval '5 days'),
    ('dd00000e-0000-0000-0000-000000000003',v_org,
     'Convocacao: Reuniao de Obreiros — 18/06',
     'Presenca obrigatoria de todos os obreiros e lideres na reuniao de planejamento do 2o semestre, 18/06 as 19h.',
     'Importante',false, now()-interval '8 days'),
    ('dd00000e-0000-0000-0000-000000000004',v_org,
     'Atualizacao de Cadastro — Prazo: 30/06',
     'Membros devem atualizar cadastro na secretaria ate 30/06. Documentos: foto + comprovante. Seg-Sex 9h-17h.',
     'Normal',true, now()-interval '15 days'),
    ('dd00000e-0000-0000-0000-000000000005',v_org,
     'Conferencia de Jovens 2026 — Inscricoes Abertas',
     'Conferencia de Jovens 2026 confirmada! Inscreva-se ate 10/07. Vagas limitadas.',
     'Normal',true, now()-interval '3 days')
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RAISE NOTICE '[09] Comunicados inseridos: %', v_cnt;

  INSERT INTO public.prayer_requests
    (id, organization_id, title, description, is_private, status)
  VALUES
    ('dd00000f-0000-0000-0000-000000000001',v_org,'Cura de Margarida Ferrari','Pedido pela irma em tratamento de saude. Oracao por restauracao e paz.',false,'Ativo'),
    ('dd00000f-0000-0000-0000-000000000002',v_org,'Obras do Novo Templo','Intercessao para Deus guiar a construcao do novo templo.',false,'Ativo'),
    ('dd00000f-0000-0000-0000-000000000003',v_org,'Provisao para familia Maran','Rodrigo Maran desempregado ha 2 meses. Oracao por provisao.',false,'Ativo'),
    ('dd00000f-0000-0000-0000-000000000004',v_org,'Missao Africa — protecao','Equipe missionaria em Mocambique: protecao e frutos evangelisticos.',false,'Ativo'),
    ('dd00000f-0000-0000-0000-000000000005',v_org,'Reconciliacao familiar Volpato','Pedido reservado de restauracao familiar.',true,'Ativo'),
    ('dd00000f-0000-0000-0000-000000000006',v_org,'Agradecimento — recuperacao Cominetto','Antonio Cominetto recebeu alta hospitalar. Deus e fiel!',false,'Respondido')
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RAISE NOTICE '[09] Pedidos de oracao inseridos: %', v_cnt;

  RAISE NOTICE '[09] OK';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[09] ERRO (bloco revertido): %', SQLERRM;
END $$;


-- ============================================================
-- BLOCO FINAL — Verificacao obrigatoria
-- Falha com EXCEPTION se dados criticos nao foram inseridos.
-- ============================================================
DO $$
DECLARE
  v_org  uuid := '10000000-0000-0000-0000-000000000002';
  n_set  int; n_con int; n_mem int; n_let int;
  n_doc  int; n_evt int; n_grp int; n_asm int;
BEGIN
  RAISE NOTICE '[FIN] Verificacao — inicio';

  SELECT count(*) INTO n_set FROM public.organizations WHERE id::text LIKE 'dd000001%';
  SELECT count(*) INTO n_con FROM public.organizations WHERE id::text LIKE 'dd000002%';
  SELECT count(*) INTO n_mem FROM public.members WHERE organization_id = v_org AND id::text LIKE 'dd000003%';
  SELECT count(*) INTO n_let FROM public.recommendation_letters WHERE organization_id = v_org AND id::text LIKE 'dd000004%';
  SELECT count(*) INTO n_doc FROM public.documents WHERE organization_id = v_org AND id::text LIKE 'dd000009%';
  SELECT count(*) INTO n_evt FROM public.events WHERE organization_id = v_org AND id::text LIKE 'dd00000a%';
  SELECT count(*) INTO n_grp FROM public.groups WHERE organization_id = v_org AND id::text LIKE 'dd00000b%';
  SELECT count(*) INTO n_asm FROM public.assemblies WHERE organization_id = v_org AND id::text LIKE 'dd00000d%';

  RAISE NOTICE '══════════════════════════════════════════════';
  RAISE NOTICE 'RESULTADO FINAL — org %', v_org;
  RAISE NOTICE '  Setores         (dd000001): % / 5',  n_set;
  RAISE NOTICE '  Congregacoes    (dd000002): % / 10', n_con;
  RAISE NOTICE '  Membros         (dd000003): % / 25', n_mem;
  RAISE NOTICE '  Cartas          (dd000004): % / 5',  n_let;
  RAISE NOTICE '  Documentos      (dd000009): % / 6',  n_doc;
  RAISE NOTICE '  Eventos         (dd00000a): % / 8',  n_evt;
  RAISE NOTICE '  Grupos          (dd00000b): % / 5',  n_grp;
  RAISE NOTICE '  Assembleias     (dd00000d): % / 3',  n_asm;
  RAISE NOTICE '══════════════════════════════════════════════';

  IF n_mem = 0 THEN
    RAISE EXCEPTION 'FALHA CRITICA: nenhum membro inserido (BLOCO 02). Verifique logs acima.';
  END IF;
  IF n_set = 0 THEN
    RAISE EXCEPTION 'FALHA CRITICA: nenhum setor inserido (BLOCO 01). Verifique logs acima.';
  END IF;
  IF n_let = 0 THEN
    RAISE EXCEPTION 'FALHA CRITICA: nenhuma carta inserida (BLOCO 03). Verifique logs acima.';
  END IF;

  RAISE NOTICE 'Seed verificado com sucesso!';
  RAISE NOTICE 'Acesse /admin/* como Admin Municipal Caxias para ver o resultado.';
END $$;
