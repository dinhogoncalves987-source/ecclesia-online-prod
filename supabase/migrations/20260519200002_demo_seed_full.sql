-- =============================================================================
-- ECCLESIA ADMIN — DEMO SEED (Produção)
-- Dados de demonstração sem transações financeiras.
-- Compatível com o schema de produção (organization_id).
-- Idempotente: seguro para executar múltiplas vezes.
-- =============================================================================

DO $$
DECLARE
  v_convencao uuid := '11111111-0000-0000-0000-000000000001';
  v_matriz    uuid := '11111111-0000-0000-0000-000000000002';
  v_setor     uuid := '11111111-0000-0000-0000-000000000003';
  v_congr     uuid := '11111111-0000-0000-0000-000000000004';
BEGIN

  -- ─────────────────────────────────────────────────────────────────
  -- 1. Hierarquia institucional
  -- ─────────────────────────────────────────────────────────────────
  INSERT INTO public.organizations (id, name, slug, organization_type, city, state, country_code, language_code, active)
  VALUES
    (v_convencao, 'Convencao Batista Nacional',       'convencao-batista-nacional',    'convencao',   'Brasilia',  'DF', 'BR', 'pt-BR', true),
    (v_matriz,    'Igreja Batista Central Sao Paulo',  'ibc-sao-paulo',                 'matriz',      'Sao Paulo', 'SP', 'BR', 'pt-BR', true),
    (v_setor,     'Setor Regional Norte SP',           'setor-regional-norte-sp',       'setor',       'Sao Paulo', 'SP', 'BR', 'pt-BR', true),
    (v_congr,     'Congregacao Batista Jardim America','congregacao-jardim-america',     'congregacao', 'Sao Paulo', 'SP', 'BR', 'pt-BR', true)
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.organizations SET parent_id = v_convencao WHERE id = v_matriz  AND parent_id IS NULL;
  UPDATE public.organizations SET parent_id = v_matriz    WHERE id = v_setor   AND parent_id IS NULL;
  UPDATE public.organizations SET parent_id = v_setor     WHERE id = v_congr   AND parent_id IS NULL;

  -- ─────────────────────────────────────────────────────────────────
  -- 2. Membros da Congregação (15 pessoas realistas)
  -- ─────────────────────────────────────────────────────────────────
  INSERT INTO public.members (id, organization_id, full_name, member_role, status, phone, email, joined_at)
  VALUES
    ('22222222-0000-0000-0000-000000000001', v_congr, 'Pr. Joao Paulo Ferreira',   'Pastor',          'Ativo',     '(11) 99999-0001', 'pastor@ibca.com.br',    '2015-03-15'),
    ('22222222-0000-0000-0000-000000000002', v_congr, 'Maria Aparecida Santos',    'Diaconisa',       'Ativo',     '(11) 99999-0002', 'maria.santos@ibca.com', '2016-06-20'),
    ('22222222-0000-0000-0000-000000000003', v_congr, 'Carlos Roberto Lima',       'Diacono',         'Ativo',     '(11) 99999-0003', 'carlos.lima@ibca.com',  '2017-01-10'),
    ('22222222-0000-0000-0000-000000000004', v_congr, 'Ana Cristina Oliveira',     'Membro',          'Ativo',     '(11) 99999-0004', 'ana.oliveira@ibca.com', '2018-09-05'),
    ('22222222-0000-0000-0000-000000000005', v_congr, 'Paulo Henrique Costa',      'Lider de Jovens', 'Ativo',     '(11) 99999-0005', 'paulo.costa@ibca.com',  '2019-03-22'),
    ('22222222-0000-0000-0000-000000000006', v_congr, 'Fernanda Maria Alves',      'Secretaria',      'Ativo',     '(11) 99999-0006', 'fernanda@ibca.com',     '2019-11-14'),
    ('22222222-0000-0000-0000-000000000007', v_congr, 'Ricardo Jose Pereira',      'Tesoureiro',      'Ativo',     '(11) 99999-0007', 'tesoureiro@ibca.com',   '2020-02-28'),
    ('22222222-0000-0000-0000-000000000008', v_congr, 'Juliana Cristina Ramos',    'Membro',          'Ativo',     '(11) 99999-0008', NULL,                    '2021-05-10'),
    ('22222222-0000-0000-0000-000000000009', v_congr, 'Lucas Eduardo Souza',       'Obreiro',         'Ativo',     '(11) 99999-0009', NULL,                    '2022-01-17'),
    ('22222222-0000-0000-0000-000000000010', v_congr, 'Beatriz Helena Martins',    'Membro',          'Ativo',     '(11) 99999-0010', NULL,                    '2022-08-30'),
    ('22222222-0000-0000-0000-000000000011', v_congr, 'Rodrigo Almeida Torres',    'Visitante',       'Visitante', '(11) 99999-0011', NULL,                    '2026-05-05'),
    ('22222222-0000-0000-0000-000000000012', v_congr, 'Silvia Regina Campos',      'Membro',          'Ativo',     NULL,              NULL,                    '2023-03-12'),
    ('22222222-0000-0000-0000-000000000013', v_congr, 'Andre Luis Nascimento',     'Diacono',         'Ativo',     '(11) 99999-0013', NULL,                    '2020-08-05'),
    ('22222222-0000-0000-0000-000000000014', v_congr, 'Priscila Fontes Correia',   'Membro',          'Ativo',     NULL,              NULL,                    '2024-01-20'),
    ('22222222-0000-0000-0000-000000000015', v_congr, 'Marcos Vinicius Rocha',     'Obreiro',         'Inativo',   NULL,              NULL,                    '2021-11-08')
  ON CONFLICT (id) DO NOTHING;

  -- ─────────────────────────────────────────────────────────────────
  -- 3. Eventos (maio e junho de 2026)
  -- ─────────────────────────────────────────────────────────────────
  INSERT INTO public.events (id, organization_id, title, starts_at, ends_at, location, event_type)
  VALUES
    ('33333333-0000-0000-0000-000000000001', v_congr, 'Culto de Adoracao - Domingo',     '2026-05-24T10:00:00', '2026-05-24T12:00:00', 'Templo Principal',         'bg-accent'),
    ('33333333-0000-0000-0000-000000000002', v_congr, 'Culto da Familia',                '2026-05-24T19:00:00', '2026-05-24T20:30:00', 'Templo Principal',         'bg-accent'),
    ('33333333-0000-0000-0000-000000000003', v_congr, 'Culto de Oracao - Quarta',        '2026-05-27T19:30:00', '2026-05-27T21:00:00', 'Salao de Reunioes',        'bg-primary'),
    ('33333333-0000-0000-0000-000000000004', v_congr, 'Reuniao de Jovens',               '2026-05-30T19:00:00', '2026-05-30T21:00:00', 'Salao dos Jovens',         'bg-primary'),
    ('33333333-0000-0000-0000-000000000005', v_congr, 'Culto de Adoracao - Domingo',     '2026-05-31T10:00:00', '2026-05-31T12:00:00', 'Templo Principal',         'bg-accent'),
    ('33333333-0000-0000-0000-000000000006', v_congr, 'Seminario de Lideranca',          '2026-06-06T09:00:00', '2026-06-06T17:00:00', 'Auditorio Central',        'bg-success'),
    ('33333333-0000-0000-0000-000000000007', v_congr, 'Culto de Adoracao - Domingo',     '2026-06-07T10:00:00', '2026-06-07T12:00:00', 'Templo Principal',         'bg-accent'),
    ('33333333-0000-0000-0000-000000000008', v_congr, 'Congresso de Oracao e Missoes',   '2026-06-13T19:00:00', '2026-06-14T18:00:00', 'Templo Principal',         'bg-success'),
    ('33333333-0000-0000-0000-000000000009', v_congr, 'Culto de Adoracao - Domingo',     '2026-06-14T10:00:00', '2026-06-14T12:00:00', 'Templo Principal',         'bg-accent'),
    ('33333333-0000-0000-0000-000000000010', v_congr, 'Culto de Aniversario da Igreja',  '2026-06-21T10:00:00', '2026-06-21T13:00:00', 'Templo Principal',         'bg-accent'),
    ('33333333-0000-0000-0000-000000000011', v_congr, 'Retiro de Casais',                '2026-06-27T08:00:00', '2026-06-29T18:00:00', 'Centro de Retiros Betania','bg-primary')
  ON CONFLICT (id) DO NOTHING;

  -- ─────────────────────────────────────────────────────────────────
  -- 4. Comunicados
  -- ─────────────────────────────────────────────────────────────────
  INSERT INTO public.communications (id, organization_id, title, content, communication_type, is_public, published_at)
  VALUES
    ('44444444-0000-0000-0000-000000000001', v_congr,
      'Bem-vindos ao Ecclesia Admin',
      'Prezados irmaos, com muito jubilo anunciamos a implantacao do Ecclesia Admin - nosso novo sistema de gestao pastoral integrada. Acesse pelo computador ou celular para acompanhar eventos, comunicados, devocionais, financeiro e muito mais. Deus seja louvado!',
      'Normal', true, '2026-05-19T09:00:00'),
    ('44444444-0000-0000-0000-000000000002', v_congr,
      'Seminario de Lideranca - Inscricoes Abertas',
      'O Seminario de Lideranca acontecera no dia 06 de junho (sabado), das 9h as 17h, no Auditorio Central. Palestrantes confirmados: Pr. Marcos Oliveira (RJ) e Pastora Ana Lima (SP). Vagas limitadas a 80 participantes. Inscricoes na secretaria.',
      'Importante', true, '2026-05-18T14:00:00'),
    ('44444444-0000-0000-0000-000000000003', v_congr,
      'Congresso de Oracao e Missoes - 13 e 14 de junho',
      'Realizaremos nosso Congresso Anual de Oracao e Missoes com o tema "Ate os Confins da Terra" (Atos 1:8). Programacao: pregacoes, momentos de intercessao, testemunhos missionarios e oferta especial para missoes nacionais.',
      'Importante', true, '2026-05-15T10:00:00'),
    ('44444444-0000-0000-0000-000000000004', v_congr,
      'Atualizacao de Cadastro - Prazo: 30 de maio',
      'Solicitamos que todos os membros regularizem seu cadastro junto a secretaria ate o dia 30 de maio. Necessario apresentar: documento com foto e comprovante de residencia. Horario: segunda a sexta, 9h as 17h.',
      'Normal', true, '2026-05-10T08:00:00')
  ON CONFLICT (id) DO NOTHING;

  -- ─────────────────────────────────────────────────────────────────
  -- 5. Documentos
  -- ─────────────────────────────────────────────────────────────────
  INSERT INTO public.documents (id, organization_id, title, content, document_type)
  VALUES
    ('55555555-0000-0000-0000-000000000001', v_congr,
      'Estatuto da Congregacao',
      'ESTATUTO DA CONGREGACAO BATISTA JARDIM AMERICA\n\nCAPITULO I - DA DENOMINACAO\nArt. 1o - A Congregacao Batista Jardim America, fundada em 21 de junho de 2001, e uma entidade religiosa sem fins lucrativos, filiada a Igreja Batista Central Sao Paulo.\n\nCAPITULO II - DOS OBJETIVOS\nArt. 2o - a) A evangelizacao e o discipulado; b) A adoracao e o culto; c) O servico e a missao.\n\nCAPITULO III - DOS MEMBROS\nArt. 3o - Sao membros os professantes de fe crista aceitos conforme este estatuto.\n\nCAPITULO IV - DA ADMINISTRACAO\nArt. 4o - Administrada pelo Pastor, Conselho de Diaconos e Assembleia Geral.',
      'Estatuto'),
    ('55555555-0000-0000-0000-000000000002', v_congr,
      'Ata da Assembleia Geral - Maio 2026',
      'ATA DA ASSEMBLEIA GERAL ORDINARIA\nData: 10 de maio de 2026 | Hora: 11h00\n\nPresentes: 45 membros\nMesa: Pr. Joao Paulo Ferreira (Presidente), Fernanda Alves (Secretaria)\n\nPAUTA:\n1. Leitura e aprovacao da ata anterior - aprovada.\n2. Relatorio financeiro do 1o trimestre - saldo positivo.\n3. Aprovacao do calendario de eventos para o 2o semestre.\n4. Eleicao do novo conselho de diaconos - eleitos Carlos Lima e Andre Nascimento.\n5. Reforma do banheiro aprovada - valor estimado R$ 12.000,00.\n\nEncerrado as 12h45.\n\nPr. Joao Paulo Ferreira - Presidente | Fernanda Alves - Secretaria',
      'Ata'),
    ('55555555-0000-0000-0000-000000000003', v_congr,
      'Manual do Novo Membro',
      'BEM-VINDO A NOSSA FAMILIA!\n\nNOSSA VISAO\nSer uma comunidade que transforma vidas pelo poder do Evangelho de Jesus Cristo.\n\nNOSSOS VALORES\n- Palavra: a Biblia como fundamento de tudo\n- Oracao: comunhao constante com Deus\n- Comunidade: relacionamentos genuinos\n- Missao: alcancar o perdido\n\nMINISTERIOS DISPONIVEIS\n- Ministerio de Louvor e Adoracao\n- Ministerio Infantil (0-12 anos)\n- Grupo de Jovens Resgate (13-30 anos)\n- Grupo de Casais Agape\n- Ministerio de Misericordia\n\nCOMPROMISSOS DO MEMBRO\n- Participar dos cultos\n- Contribuir com dizimos\n- Servir em algum ministerio\n\nCONTATOS\nPastor Joao Paulo: (11) 99999-0001\nSecretaria: seg-sex 9h-17h',
      'Geral')
  ON CONFLICT (id) DO NOTHING;

  -- ─────────────────────────────────────────────────────────────────
  -- 6. Pequenos Grupos
  -- ─────────────────────────────────────────────────────────────────
  INSERT INTO public.groups (id, organization_id, name, description)
  VALUES
    ('66666666-0000-0000-0000-000000000001', v_congr,
      'Jovens Resgate',
      'Grupo de jovens com idades entre 15 e 30 anos. Reunioes aos sabados as 19h no Salao dos Jovens. Lider: Paulo Henrique Costa. Foco em evangelismo, discipulado e missoes urbanas.'),
    ('66666666-0000-0000-0000-000000000002', v_congr,
      'Casais Agape',
      'Grupo para casais em todas as fases do casamento. Reunioes quinzenais as sextas-feiras as 20h. Coordenacao: Ricardo e Juliana Pereira. Estudo: Amor e Respeito (Ef 5:22-33).')
  ON CONFLICT (id) DO NOTHING;

  -- ─────────────────────────────────────────────────────────────────
  -- 7. Pedidos de Oração
  -- ─────────────────────────────────────────────────────────────────
  INSERT INTO public.prayer_requests (id, organization_id, title, description, status)
  VALUES
    ('77777777-0000-0000-0000-000000000001', v_congr,
      'Cura e restauracao - Irma Maria',
      'Pedido de intercessao pela irma Maria Santos que realizou uma cirurgia cardiaca. Que o Senhor conceda cura completa, paz e conforto a ela e a sua familia neste momento de recuperacao.',
      'Em Oracao'),
    ('77777777-0000-0000-0000-000000000002', v_congr,
      'Provisao para familia Souza',
      'O irmao Lucas Souza esta desempregado ha tres meses. Sua familia depende de sua renda. Intercedemos para que o Senhor abra portas de trabalho e fortifica a fe dessa familia.',
      'Em Oracao'),
    ('77777777-0000-0000-0000-000000000003', v_congr,
      'Ungimento do Congresso de Oracao',
      'Pedimos intercessao para o Congresso de Oracao e Missoes de junho. Que o Espirito Santo prepare os coracoes e que muitos sejam tocados pelo chamado missionario.',
      'Pendente')
  ON CONFLICT (id) DO NOTHING;

END $$;

-- =============================================================================
-- Anúncio Global de Plataforma
-- =============================================================================
INSERT INTO public.platform_announcements (id, title, short_description, is_active, button_label, button_link, starts_at)
VALUES (
  '99999999-0000-0000-0000-000000000001',
  'Ecclesia Admin em Demonstracao',
  'Explore o sistema com dados de demonstracao. Biblia com IA pastoral, devocionais inteligentes, secretaria, financeiro e muito mais.',
  true,
  'Explorar Biblia IA',
  '/admin/biblia',
  NOW() - INTERVAL '1 hour'
)
ON CONFLICT (id) DO NOTHING;
