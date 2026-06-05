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
    (v_convencao, 'Assembleia de Deus — Ministerio RS',       'assembleia-deus-ministerio-rs',    'convencao',   'Porto Alegre', 'RS', 'BR', 'pt-BR', true),
    (v_matriz,    'Assembleia de Deus em Caxias do Sul',      'assembleia-deus-caxias-do-sul',    'matriz',      'Caxias do Sul', 'RS', 'BR', 'pt-BR', true),
    (v_setor,     'Secretaria AD Caxias do Sul',              'secretaria-ad-caxias-do-sul',      'setor',       'Caxias do Sul', 'RS', 'BR', 'pt-BR', true),
    (v_congr,     'Congregacao Jardim America',               'congregacao-jardim-america',       'congregacao', 'Caxias do Sul', 'RS', 'BR', 'pt-BR', true)
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.organizations SET parent_id = v_convencao WHERE id = v_matriz  AND parent_id IS NULL;
  UPDATE public.organizations SET parent_id = v_matriz    WHERE id = v_setor   AND parent_id IS NULL;
  UPDATE public.organizations SET parent_id = v_setor     WHERE id = v_congr   AND parent_id IS NULL;

  -- ─────────────────────────────────────────────────────────────────
  -- 2. Membros da Congregação (15 pessoas realistas)
  -- ─────────────────────────────────────────────────────────────────
  INSERT INTO public.members (id, organization_id, full_name, member_role, status, phone, email, city, state, joined_at)
  VALUES
    ('22222222-0000-0000-0000-000000000001', v_congr, 'Pr. Joao Paulo Ferreira',   'Pastor',          'Ativo',     '(54) 99999-0001', 'pastor@adcaxias.org.br',       'Caxias do Sul', 'RS', '2015-03-15'),
    ('22222222-0000-0000-0000-000000000002', v_congr, 'Maria Aparecida Santos',    'Diaconisa',       'Ativo',     '(54) 99999-0002', 'maria.santos@adcaxias.org.br', 'Caxias do Sul', 'RS', '2016-06-20'),
    ('22222222-0000-0000-0000-000000000003', v_congr, 'Carlos Roberto Lima',       'Diacono',         'Ativo',     '(54) 99999-0003', 'carlos.lima@adcaxias.org.br',  'Caxias do Sul', 'RS', '2017-01-10'),
    ('22222222-0000-0000-0000-000000000004', v_congr, 'Ana Cristina Oliveira',     'Membro',          'Ativo',     '(54) 99999-0004', 'ana.oliveira@adcaxias.org.br', 'Caxias do Sul', 'RS', '2018-09-05'),
    ('22222222-0000-0000-0000-000000000005', v_congr, 'Paulo Henrique Costa',      'Lider de Jovens', 'Ativo',     '(54) 99999-0005', 'paulo.costa@adcaxias.org.br',  'Caxias do Sul', 'RS', '2019-03-22'),
    ('22222222-0000-0000-0000-000000000006', v_congr, 'Fernanda Maria Alves',      'Secretaria',      'Ativo',     '(54) 99999-0006', 'fernanda@adcaxias.org.br',     'Caxias do Sul', 'RS', '2019-11-14'),
    ('22222222-0000-0000-0000-000000000007', v_congr, 'Ricardo Jose Pereira',      'Tesoureiro',      'Ativo',     '(54) 99999-0007', 'tesoureiro@adcaxias.org.br',   'Caxias do Sul', 'RS', '2020-02-28'),
    ('22222222-0000-0000-0000-000000000008', v_congr, 'Juliana Cristina Ramos',    'Membro',          'Ativo',     '(54) 99999-0008', NULL,                           'Caxias do Sul', 'RS', '2021-05-10'),
    ('22222222-0000-0000-0000-000000000009', v_congr, 'Lucas Eduardo Souza',       'Obreiro',         'Ativo',     '(54) 99999-0009', NULL,                           'Caxias do Sul', 'RS', '2022-01-17'),
    ('22222222-0000-0000-0000-000000000010', v_congr, 'Beatriz Helena Martins',    'Membro',          'Ativo',     '(54) 99999-0010', NULL,                           'Caxias do Sul', 'RS', '2022-08-30'),
    ('22222222-0000-0000-0000-000000000011', v_congr, 'Rodrigo Almeida Torres',    'Visitante',       'Visitante', '(54) 99999-0011', NULL,                           'Caxias do Sul', 'RS', '2026-05-05'),
    ('22222222-0000-0000-0000-000000000012', v_congr, 'Silvia Regina Campos',      'Membro',          'Ativo',     '(54) 99999-0012', NULL,                           'Caxias do Sul', 'RS', '2023-03-12'),
    ('22222222-0000-0000-0000-000000000013', v_congr, 'Andre Luis Nascimento',     'Diacono',         'Ativo',     '(54) 99999-0013', NULL,                           'Caxias do Sul', 'RS', '2020-08-05'),
    ('22222222-0000-0000-0000-000000000014', v_congr, 'Priscila Fontes Correia',   'Membro',          'Ativo',     NULL,              NULL,                           'Caxias do Sul', 'RS', '2024-01-20'),
    ('22222222-0000-0000-0000-000000000015', v_congr, 'Marcos Vinicius Rocha',     'Obreiro',         'Inativo',   NULL,              NULL,                           'Caxias do Sul', 'RS', '2021-11-08')
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
      'Estatuto Interno — Assembleia de Deus Caxias do Sul',
      'ESTATUTO INTERNO — CONGREGACAO JARDIM AMERICA\nASSEMBLEIA DE DEUS EM CAXIAS DO SUL\n\nCAPITULO I - DA IDENTIFICACAO\nArt. 1o - A Congregacao Jardim America, localizada em Caxias do Sul/RS, e congregacao da Assembleia de Deus em Caxias do Sul, entidade religiosa sem fins lucrativos, sob orientacao pastoral e regimento interno da Secretaria administrativa da obra.\n\nCAPITULO II - DOS OBJETIVOS\nArt. 2o - a) Pregar o Evangelho de Jesus Cristo; b) Promover adoracao, discipulado e santa comunhao; c) Servir a cidade de Caxias do Sul em missoes e acao social.\n\nCAPITULO III - DOS MEMBROS\nArt. 3o - Sao membros os que confessam fe evangelica, sao integrados pela lideranca pastoral e acompanhados pela Secretaria da congregacao.\n\nCAPITULO IV - DA ADMINISTRACAO\nArt. 4o - Administrada pelo Pastor local, pastores auxiliares, presbiteros, diaconos e liderancas ministeriais, em harmonia com a direcao da Assembleia de Deus em Caxias do Sul.',
      'Estatuto'),
    ('55555555-0000-0000-0000-000000000002', v_congr,
      'Ata de Reuniao Ministerial — Maio 2026',
      'ATA DE REUNIAO MINISTERIAL\nAssembleia de Deus em Caxias do Sul — Congregacao Jardim America\nData: 10 de maio de 2026 | Horario: 19h30 | Local: Salao de Reunioes\n\nPresentes: Pr. Joao Paulo Ferreira (Pastor), Fernanda Maria Alves (Secretaria), liderancas dos ministerios de Louvor, Infantil, Jovens, Recepcao e Intercessao.\n\nPAUTA:\n1. Abertura em oracao e leitura biblica.\n2. Planejamento dos cultos e atividades de junho/2026 na sede de Caxias do Sul.\n3. Escalas ministeriais: confirmacao das equipes de Louvor e Recepcao.\n4. Mobilizacao da EBD e dos Pequenos Grupos (Jovens Resgate e Casais Agape).\n5. Orientacoes da Secretaria sobre cadastro de membros e documentacao congregacional.\n\nEncerramento as 21h00, com bencao apostolica.\n\nPr. Joao Paulo Ferreira — Pastor\nFernanda Maria Alves — Secretaria AD Caxias do Sul / Congregacao Jardim America',
      'Ata'),
    ('55555555-0000-0000-0000-000000000003', v_congr,
      'Manual de Integracao de Novos Membros — AD Caxias do Sul',
      'MANUAL DE INTEGRACAO DE NOVOS MEMBROS\nAssembleia de Deus em Caxias do Sul — Congregacao Jardim America\n\nBEM-VINDO A FAMILIA DE DEUS!\n\nA Secretaria da Congregacao Jardim America preparou este material para ajuda-lo a integrar-se a vida congregacional da Assembleia de Deus em Caxias do Sul.\n\nNOSSA IDENTIDADE\nSomos uma congregacao evangelica pentecostal, comprometida com a Palavra de Deus, a oracao e a obra missionaria na cidade de Caxias do Sul.\n\nMINISTERIOS DA CONGREGACAO\n- Louvor e Adoracao\n- Infantil\n- Jovens Resgate\n- Casais Agape\n- Recepcao e Acolhimento\n- Intercessao\n- Escola Biblica Dominical\n\nPRIMEIROS PASSOS\n1. Participar do culto de boas-vindas\n2. Encontro com a lideranca pastoral\n3. Cadastro na Secretaria (documento com foto e dados pessoais)\n4. Inscricao em um ministerio ou pequeno grupo\n\nCONTATOS\nPastor Joao Paulo Ferreira — (11) 99999-0001\nSecretaria AD Caxias do Sul / Congregacao Jardim America — seg a sex, 9h as 17h',
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
      'Cura e restauracao — Irma Maria',
      'Pedido de intercessao pela irma Maria Santos, da Congregacao Jardim America (Assembleia de Deus em Caxias do Sul/RS), em recuperacao apos cirurgia cardiaca. Oremos por cura completa, paz e conforto para ela e sua familia.',
      'Ativo'),
    ('77777777-0000-0000-0000-000000000002', v_congr,
      'Provisao para familia Souza — Caxias do Sul',
      'O irmao Lucas Souza, membro da Congregacao Jardim America em Caxias do Sul/RS, esta desempregado ha tres meses. Intercedamos para que o Senhor abra portas de trabalho e fortaleca a fe dessa familia.',
      'Ativo'),
    ('77777777-0000-0000-0000-000000000003', v_congr,
      'Intercessao pelo Congresso de Oracao e Missoes',
      'Agradecemos as oracoes pelo Congresso de Oracao e Missoes da Assembleia de Deus em Caxias do Sul. O evento foi abencoado; mantemos gratidao e pedimos continuidade no chamado missionario da congregacao.',
      'Respondido')
  ON CONFLICT (id) DO NOTHING;

END $$;

-- =============================================================================
-- Anúncio Global de Plataforma
-- =============================================================================
INSERT INTO public.platform_announcements (
  id, title, short_description, full_content, target_type, is_active, button_label, button_link, starts_at
)
VALUES (
  '99999999-0000-0000-0000-000000000001',
  'Ecclesia Admin em Demonstracao',
  'Explore o sistema com dados de demonstracao. Biblia com IA pastoral, devocionais inteligentes, secretaria, financeiro e muito mais.',
  'Explore o Ecclesia Admin com dados de demonstracao. Biblia com IA pastoral, devocionais inteligentes, secretaria, financeiro e muito mais. Este anuncio e exibido em todos os paineis da plataforma.',
  'global',
  true,
  'Explorar Biblia IA',
  '/admin/biblia',
  NOW() - INTERVAL '1 hour'
)
ON CONFLICT (id) DO NOTHING;
