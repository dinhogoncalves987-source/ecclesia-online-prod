-- =============================================================================
-- ECCLESIA ADMIN — DEMO SEED
-- Dados de demonstração para pastores, diretoria e líderes internacionais.
-- Idempotente: seguro para executar múltiplas vezes.
-- =============================================================================

DO $$
DECLARE
  v_convencao  uuid := '11111111-0000-0000-0000-000000000001';
  v_matriz     uuid := '11111111-0000-0000-0000-000000000002';
  v_setor      uuid := '11111111-0000-0000-0000-000000000003';
  v_congr      uuid := '11111111-0000-0000-0000-000000000004';
  v_user_id    uuid;
BEGIN

  -- ─────────────────────────────────────────────────────────────────
  -- 1. Hierarquia institucional
  -- ─────────────────────────────────────────────────────────────────
  INSERT INTO public.organizations (id, name, slug, organization_type, city, state, country_code, language_code, active)
  VALUES
    (v_convencao, 'Convenção Batista Nacional', 'convencao-batista-nacional', 'convencao', 'Brasília', 'DF', 'BR', 'pt-BR', true),
    (v_matriz,    'Igreja Batista Central São Paulo', 'ibc-sao-paulo', 'matriz', 'São Paulo', 'SP', 'BR', 'pt-BR', true),
    (v_setor,     'Setor Regional Norte SP', 'setor-regional-norte-sp', 'setor', 'São Paulo', 'SP', 'BR', 'pt-BR', true),
    (v_congr,     'Congregação Batista Jardim América', 'congregacao-jardim-america', 'congregacao', 'São Paulo', 'SP', 'BR', 'pt-BR', true)
  ON CONFLICT (id) DO NOTHING;

  -- Parent chain (only sets if not already set)
  UPDATE public.organizations SET parent_id = v_convencao WHERE id = v_matriz     AND parent_id IS NULL;
  UPDATE public.organizations SET parent_id = v_matriz    WHERE id = v_setor      AND parent_id IS NULL;
  UPDATE public.organizations SET parent_id = v_setor     WHERE id = v_congr      AND parent_id IS NULL;

  -- ─────────────────────────────────────────────────────────────────
  -- 2. Membros da Congregação
  -- ─────────────────────────────────────────────────────────────────
  INSERT INTO public.members (id, organization_id, full_name, member_role, status, phone, email, joined_at)
  VALUES
    ('22222222-0000-0000-0000-000000000001', v_congr, 'Pr. João Paulo Ferreira',  'Pastor',           'Ativo',     '(11) 99999-0001', 'pastor@ibca.com.br',    '2015-03-15'),
    ('22222222-0000-0000-0000-000000000002', v_congr, 'Maria Aparecida Santos',   'Diaconisa',        'Ativo',     '(11) 99999-0002', 'maria.santos@ibca.com', '2016-06-20'),
    ('22222222-0000-0000-0000-000000000003', v_congr, 'Carlos Roberto Lima',      'Diácono',          'Ativo',     '(11) 99999-0003', 'carlos.lima@ibca.com',  '2017-01-10'),
    ('22222222-0000-0000-0000-000000000004', v_congr, 'Ana Cristina Oliveira',    'Membro',           'Ativo',     '(11) 99999-0004', 'ana.oliveira@ibca.com', '2018-09-05'),
    ('22222222-0000-0000-0000-000000000005', v_congr, 'Paulo Henrique Costa',     'Líder de Jovens',  'Ativo',     '(11) 99999-0005', 'paulo.costa@ibca.com',  '2019-03-22'),
    ('22222222-0000-0000-0000-000000000006', v_congr, 'Fernanda Maria Alves',     'Secretária',       'Ativo',     '(11) 99999-0006', 'fernanda@ibca.com',     '2019-11-14'),
    ('22222222-0000-0000-0000-000000000007', v_congr, 'Ricardo José Pereira',     'Tesoureiro',       'Ativo',     '(11) 99999-0007', 'tesoureiro@ibca.com',   '2020-02-28'),
    ('22222222-0000-0000-0000-000000000008', v_congr, 'Juliana Cristina Ramos',   'Membro',           'Ativo',     '(11) 99999-0008', NULL,                    '2021-05-10'),
    ('22222222-0000-0000-0000-000000000009', v_congr, 'Lucas Eduardo Souza',      'Obreiro',          'Ativo',     '(11) 99999-0009', NULL,                    '2022-01-17'),
    ('22222222-0000-0000-0000-000000000010', v_congr, 'Beatriz Helena Martins',   'Membro',           'Ativo',     '(11) 99999-0010', NULL,                    '2022-08-30'),
    ('22222222-0000-0000-0000-000000000011', v_congr, 'Rodrigo Almeida Torres',   'Visitante',        'Visitante', '(11) 99999-0011', NULL,                    '2026-05-05'),
    ('22222222-0000-0000-0000-000000000012', v_congr, 'Silvia Regina Campos',     'Membro',           'Ativo',     '(11) 99999-0012', NULL,                    '2023-03-12'),
    ('22222222-0000-0000-0000-000000000013', v_congr, 'André Luís Nascimento',    'Diácono',          'Ativo',     '(11) 99999-0013', NULL,                    '2020-08-05'),
    ('22222222-0000-0000-0000-000000000014', v_congr, 'Priscila Fontes Correia',  'Membro',           'Ativo',     NULL,              NULL,                    '2024-01-20'),
    ('22222222-0000-0000-0000-000000000015', v_congr, 'Marcos Vinícius Rocha',    'Obreiro',          'Inativo',   NULL,              NULL,                    '2021-11-08')
  ON CONFLICT (id) DO NOTHING;

  -- ─────────────────────────────────────────────────────────────────
  -- 3. Eventos (maio e junho de 2026)
  -- ─────────────────────────────────────────────────────────────────
  INSERT INTO public.events (id, organization_id, title, starts_at, ends_at, location, event_type)
  VALUES
    ('33333333-0000-0000-0000-000000000001', v_congr, 'Culto de Adoração — Domingo', '2026-05-24T10:00:00', '2026-05-24T12:00:00', 'Templo Principal', 'bg-accent'),
    ('33333333-0000-0000-0000-000000000002', v_congr, 'Culto da Família',            '2026-05-24T19:00:00', '2026-05-24T20:30:00', 'Templo Principal', 'bg-accent'),
    ('33333333-0000-0000-0000-000000000003', v_congr, 'Culto de Oração — Quarta',    '2026-05-27T19:30:00', '2026-05-27T21:00:00', 'Salão de Reuniões', 'bg-primary'),
    ('33333333-0000-0000-0000-000000000004', v_congr, 'Reunião de Jovens',           '2026-05-30T19:00:00', '2026-05-30T21:00:00', 'Salão dos Jovens', 'bg-primary'),
    ('33333333-0000-0000-0000-000000000005', v_congr, 'Culto de Adoração — Domingo', '2026-05-31T10:00:00', '2026-05-31T12:00:00', 'Templo Principal', 'bg-accent'),
    ('33333333-0000-0000-0000-000000000006', v_congr, 'Seminário de Liderança',      '2026-06-06T09:00:00', '2026-06-06T17:00:00', 'Auditório Central', 'bg-success'),
    ('33333333-0000-0000-0000-000000000007', v_congr, 'Culto de Adoração — Domingo', '2026-06-07T10:00:00', '2026-06-07T12:00:00', 'Templo Principal', 'bg-accent'),
    ('33333333-0000-0000-0000-000000000008', v_congr, 'Congresso de Oração e Missões', '2026-06-13T19:00:00', '2026-06-14T18:00:00', 'Templo Principal', 'bg-success'),
    ('33333333-0000-0000-0000-000000000009', v_congr, 'Culto de Adoração — Domingo', '2026-06-14T10:00:00', '2026-06-14T12:00:00', 'Templo Principal', 'bg-accent'),
    ('33333333-0000-0000-0000-000000000010', v_congr, 'Culto de Aniversário da Igreja', '2026-06-21T10:00:00', '2026-06-21T13:00:00', 'Templo Principal', 'bg-accent'),
    ('33333333-0000-0000-0000-000000000011', v_congr, 'Retiro de Casais',            '2026-06-27T08:00:00', '2026-06-29T18:00:00', 'Centro de Retiros Betânia', 'bg-primary')
  ON CONFLICT (id) DO NOTHING;

  -- ─────────────────────────────────────────────────────────────────
  -- 4. Comunicados
  -- ─────────────────────────────────────────────────────────────────
  INSERT INTO public.communications (id, organization_id, title, content, communication_type, is_public, published_at)
  VALUES
    ('44444444-0000-0000-0000-000000000001', v_congr,
      'Bem-vindos ao Ecclesia Admin',
      'Prezados irmãos, com muito júbilo anunciamos a implantação do Ecclesia Admin — nosso novo sistema de gestão pastoral integrada. Acesse pelo computador ou celular para acompanhar eventos, comunicados, devocionais, financeiro e muito mais. Deus seja louvado por esta conquista!',
      'Normal', true, '2026-05-19T09:00:00'),
    ('44444444-0000-0000-0000-000000000002', v_congr,
      'Seminário de Liderança — Inscrições Abertas',
      'O Seminário de Liderança acontecerá no dia 06 de junho (sábado), das 9h às 17h, no Auditório Central. Palestrantes confirmados: Pr. Marcos Oliveira (RJ) e Pastora Ana Lima (SP). Vagas limitadas a 80 participantes. Inscrições na secretaria ou pelo app.',
      'Importante', true, '2026-05-18T14:00:00'),
    ('44444444-0000-0000-0000-000000000003', v_congr,
      'Congresso de Oração e Missões — 13 e 14 de junho',
      'Realizaremos nosso Congresso Anual de Oração e Missões com o tema "Até os Confins da Terra" (Atos 1:8). Programação: pregações, momentos de intercessão, testemunhos missionários e oferta especial para missões nacionais. Toda a família está convidada!',
      'Importante', true, '2026-05-15T10:00:00'),
    ('44444444-0000-0000-0000-000000000004', v_congr,
      'Atualização de Cadastro — Prazo: 30 de maio',
      'Solicitamos que todos os membros regularizem seu cadastro junto à secretaria até o dia 30 de maio. É necessário apresentar: documento oficial com foto e comprovante de residência atualizado. Horário de atendimento: segunda a sexta, 9h às 17h.',
      'Normal', true, '2026-05-10T08:00:00')
  ON CONFLICT (id) DO NOTHING;

  -- ─────────────────────────────────────────────────────────────────
  -- 5. Documentos
  -- ─────────────────────────────────────────────────────────────────
  INSERT INTO public.documents (id, organization_id, title, content, document_type)
  VALUES
    ('55555555-0000-0000-0000-000000000001', v_congr,
      'Estatuto da Congregação',
      E'ESTATUTO DA CONGREGAÇÃO BATISTA JARDIM AMÉRICA\n\nCAPÍTULO I — DA DENOMINAÇÃO\nArt. 1º — A Congregação Batista Jardim América, fundada em 21 de junho de 2001, é uma entidade religiosa sem fins lucrativos, filiada à Igreja Batista Central São Paulo e à Convenção Batista Nacional.\n\nCAPÍTULO II — DOS OBJETIVOS\nArt. 2º — São objetivos da Congregação:\na) A evangelização e o discipulado;\nb) A adoração e o culto;\nc) O serviço e a missão.\n\nCAPÍTULO III — DOS MEMBROS\nArt. 3º — São membros os professantes de fé cristã aceitos conforme este estatuto.\n\nCAPÍTULO IV — DA ADMINISTRAÇÃO\nArt. 4º — A Congregação é administrada pelo Pastor, Conselho de Diáconos e Assembleia Geral.',
      'Estatuto'),
    ('55555555-0000-0000-0000-000000000002', v_congr,
      'Ata da Assembleia Geral — Maio 2026',
      E'ATA DA ASSEMBLEIA GERAL ORDINÁRIA\nData: 10 de maio de 2026 | Hora: 11h00 | Local: Templo Principal\n\nPresentes: 45 membros\nMesa: Pr. João Paulo Ferreira (Presidente), Fernanda Alves (Secretária)\n\nPAUTA:\n1. Leitura e aprovação da ata anterior — aprovada por unanimidade.\n2. Relatório financeiro do 1º trimestre 2026 — saldo positivo de R$ 8.750,00. Aprovado.\n3. Aprovação do calendário de eventos para o 2º semestre — aprovado com 1 abstenção.\n4. Eleição do novo conselho de diáconos — eleitos por votação secreta: Irmão Carlos Lima e Irmão André Nascimento.\n5. Proposta de reforma do banheiro do templo — aprovada por 38 votos a 4. Valor estimado: R$ 12.000,00.\n\nNada mais havendo a tratar, encerrou-se a reunião às 12h45.\n\nPr. João Paulo Ferreira — Presidente | Fernanda Alves — Secretária',
      'Ata'),
    ('55555555-0000-0000-0000-000000000003', v_congr,
      'Manual do Novo Membro',
      E'BEM-VINDO À NOSSA FAMÍLIA!\n\nEste manual foi preparado com carinho para ajudá-lo a conhecer melhor a nossa congregação e a se integrar à nossa vida comunitária.\n\nNOSSA VISÃO\n"Ser uma comunidade que transforma vidas pelo poder do Evangelho de Jesus Cristo."\n\nNOSSOS VALORES\n• Palavra: a Bíblia como fundamento de tudo\n• Oração: comunhão constante com Deus\n• Comunidade: relacionamentos genuínos\n• Missão: alcançar o perdido\n\nMINISTÉRIOS DISPONÍVEIS\n• Ministério de Louvor e Adoração\n• Ministério Infantil (0-12 anos)\n• Grupo de Jovens Resgate (13-30 anos)\n• Grupo de Casais Ágape\n• Ministério de Misericórdia\n• Escolas Bíblicas Dominicais\n\nCOMPROMISSOS DO MEMBRO\n• Participar regularmente dos cultos\n• Contribuir com dízimos e ofertas\n• Servir em algum ministério\n• Manter comunhão com os irmãos\n\nCONTATOS\nPastor João Paulo: (11) 99999-0001\nSecretaria: seg-sex 9h-17h',
      'Geral')
  ON CONFLICT (id) DO NOTHING;

  -- ─────────────────────────────────────────────────────────────────
  -- 6. Pequenos Grupos
  -- ─────────────────────────────────────────────────────────────────
  INSERT INTO public.groups (id, organization_id, name, description)
  VALUES
    ('66666666-0000-0000-0000-000000000001', v_congr,
      'Jovens Resgate',
      'Grupo de jovens com idades entre 15 e 30 anos. Reuniões aos sábados às 19h no Salão dos Jovens. Líder: Paulo Henrique Costa. Foco em evangelismo, discipulado e missões urbanas.'),
    ('66666666-0000-0000-0000-000000000002', v_congr,
      'Casais Ágape',
      'Grupo para casais em todas as fases do casamento. Reuniões quinzenais às sextas-feiras às 20h. Coordenação: Ricardo e Juliana Pereira. Estudo atual: "Amor e Respeito" (Ef 5:22-33).')
  ON CONFLICT (id) DO NOTHING;

  -- ─────────────────────────────────────────────────────────────────
  -- 7. Pedidos de Oração
  -- ─────────────────────────────────────────────────────────────────
  INSERT INTO public.prayer_requests (id, organization_id, title, description, status)
  VALUES
    ('77777777-0000-0000-0000-000000000001', v_congr,
      'Cura e restauração da Irmã Maria',
      'Nosso caro pedido de oração é pela irmã Maria Santos, que realizou uma cirurgia cardíaca na semana passada. Que o Senhor conceda cura completa, paz e conforto a ela e a sua família neste momento de recuperação.',
      'Em Oração'),
    ('77777777-0000-0000-0000-000000000002', v_congr,
      'Provisão financeira para família Souza',
      'O irmão Lucas Souza está passando por um período de desemprego há três meses. Sua família depende de sua renda. Intercedemos para que o Senhor abra portas de trabalho e fortaleça a fé dessa família.',
      'Em Oração'),
    ('77777777-0000-0000-0000-000000000003', v_congr,
      'Ungimento do Congresso de Oração',
      'Pedimos intercessão especial para o Congresso de Oração e Missões de junho. Que o Espírito Santo prepare os corações, que os pregadores sejam ungidos e que muitos sejam tocados pelo chamado missionário.',
      'Pendente')
  ON CONFLICT (id) DO NOTHING;

  -- ─────────────────────────────────────────────────────────────────
  -- 8. Transações financeiras (requer usuário existente)
  -- ─────────────────────────────────────────────────────────────────
  SELECT user_id INTO v_user_id FROM public.profiles LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.transactions (id, organization_id, user_id, date, description, type, amount, status, category, payment_method)
    VALUES
      ('88888888-0000-0000-0000-000000000001', v_congr, v_user_id, '2026-05-04', 'Dízimos — 1ª semana de maio',          'Entrada', 3250.00, 'Confirmado', 'Dizimos',       'PIX'),
      ('88888888-0000-0000-0000-000000000002', v_congr, v_user_id, '2026-05-04', 'Aluguel do Templo — maio/2026',         'Saida',   2800.00, 'Pago',       'Administrativo','Banco'),
      ('88888888-0000-0000-0000-000000000003', v_congr, v_user_id, '2026-05-11', 'Dízimos — 2ª semana de maio',          'Entrada', 2890.00, 'Confirmado', 'Dizimos',       'PIX'),
      ('88888888-0000-0000-0000-000000000004', v_congr, v_user_id, '2026-05-11', 'Energia Elétrica — maio',              'Saida',    480.00, 'Pago',       'Manutencao',    'Banco'),
      ('88888888-0000-0000-0000-000000000005', v_congr, v_user_id, '2026-05-11', 'Oferta de Missões Nacionais',          'Entrada',  850.00, 'Confirmado', 'Missoes',       'Especie'),
      ('88888888-0000-0000-0000-000000000006', v_congr, v_user_id, '2026-05-18', 'Dízimos — 3ª semana de maio',          'Entrada', 3100.00, 'Confirmado', 'Dizimos',       'PIX'),
      ('88888888-0000-0000-0000-000000000007', v_congr, v_user_id, '2026-05-18', 'Material de Limpeza e Manutenção',     'Saida',    145.00, 'Pago',       'Manutencao',    'Especie'),
      ('88888888-0000-0000-0000-000000000008', v_congr, v_user_id, '2026-05-18', 'Oferta Especial — Culto de Louvor',    'Entrada',  620.00, 'Confirmado', 'Ofertas',       'Especie'),
      ('88888888-0000-0000-0000-000000000009', v_congr, v_user_id, '2026-05-04', 'Honorários Pastorais — maio',          'Saida',   4000.00, 'Pago',       'Folha/Pastoral','Banco'),
      ('88888888-0000-0000-0000-000000000010', v_congr, v_user_id, '2026-05-11', 'Internet e Sistema — Ecclesia Admin',  'Saida',    299.00, 'Pago',       'Administrativo','Banco')
    ON CONFLICT (id) DO NOTHING;
  END IF;

END $$;

-- =============================================================================
-- 9. Anúncio Global de Plataforma (visible on all dashboards)
-- =============================================================================
INSERT INTO public.platform_announcements (
  id, title, short_description, is_active, button_label, button_link, starts_at
)
VALUES (
  '99999999-0000-0000-0000-000000000001',
  'Ecclesia Admin — Sistema em Demonstração',
  'Você está explorando o Ecclesia Admin com dados de demonstração. Acesse a Bíblia com IA pastoral, devocionais inteligentes, financeiro, secretaria e muito mais.',
  true,
  'Explorar Bíblia IA',
  '/admin/biblia',
  now() - interval '1 hour'
)
ON CONFLICT (id) DO NOTHING;
