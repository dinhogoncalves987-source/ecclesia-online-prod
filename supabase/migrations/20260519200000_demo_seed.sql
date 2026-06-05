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
    (v_convencao, 'Assembleia de Deus — Ministério RS', 'assembleia-deus-ministerio-rs', 'convencao', 'Porto Alegre', 'RS', 'BR', 'pt-BR', true),
    (v_matriz,    'Assembleia de Deus em Caxias do Sul', 'assembleia-deus-caxias-do-sul', 'matriz', 'Caxias do Sul', 'RS', 'BR', 'pt-BR', true),
    (v_setor,     'Secretaria AD Caxias do Sul', 'secretaria-ad-caxias-do-sul', 'setor', 'Caxias do Sul', 'RS', 'BR', 'pt-BR', true),
    (v_congr,     'Congregação Jardim América', 'congregacao-jardim-america', 'congregacao', 'Caxias do Sul', 'RS', 'BR', 'pt-BR', true)
  ON CONFLICT (id) DO NOTHING;

  -- Parent chain (only sets if not already set)
  UPDATE public.organizations SET parent_id = v_convencao WHERE id = v_matriz     AND parent_id IS NULL;
  UPDATE public.organizations SET parent_id = v_matriz    WHERE id = v_setor      AND parent_id IS NULL;
  UPDATE public.organizations SET parent_id = v_setor     WHERE id = v_congr      AND parent_id IS NULL;

  -- ─────────────────────────────────────────────────────────────────
  -- 2. Membros da Congregação
  -- ─────────────────────────────────────────────────────────────────
  INSERT INTO public.members (id, organization_id, full_name, member_role, status, phone, email, city, state, joined_at)
  VALUES
    ('22222222-0000-0000-0000-000000000001', v_congr, 'Pr. João Paulo Ferreira',  'Pastor',           'Ativo',     '(54) 99999-0001', 'pastor@adcaxias.org.br',    'Caxias do Sul', 'RS', '2015-03-15'),
    ('22222222-0000-0000-0000-000000000002', v_congr, 'Maria Aparecida Santos',   'Diaconisa',        'Ativo',     '(54) 99999-0002', 'maria.santos@adcaxias.org.br', 'Caxias do Sul', 'RS', '2016-06-20'),
    ('22222222-0000-0000-0000-000000000003', v_congr, 'Carlos Roberto Lima',      'Diácono',          'Ativo',     '(54) 99999-0003', 'carlos.lima@adcaxias.org.br',  'Caxias do Sul', 'RS', '2017-01-10'),
    ('22222222-0000-0000-0000-000000000004', v_congr, 'Ana Cristina Oliveira',    'Membro',           'Ativo',     '(54) 99999-0004', 'ana.oliveira@adcaxias.org.br', 'Caxias do Sul', 'RS', '2018-09-05'),
    ('22222222-0000-0000-0000-000000000005', v_congr, 'Paulo Henrique Costa',     'Líder de Jovens',  'Ativo',     '(54) 99999-0005', 'paulo.costa@adcaxias.org.br',  'Caxias do Sul', 'RS', '2019-03-22'),
    ('22222222-0000-0000-0000-000000000006', v_congr, 'Fernanda Maria Alves',     'Secretária',       'Ativo',     '(54) 99999-0006', 'fernanda@adcaxias.org.br',     'Caxias do Sul', 'RS', '2019-11-14'),
    ('22222222-0000-0000-0000-000000000007', v_congr, 'Ricardo José Pereira',     'Tesoureiro',       'Ativo',     '(54) 99999-0007', 'tesoureiro@adcaxias.org.br',   'Caxias do Sul', 'RS', '2020-02-28'),
    ('22222222-0000-0000-0000-000000000008', v_congr, 'Juliana Cristina Ramos',   'Membro',           'Ativo',     '(54) 99999-0008', NULL,                           'Caxias do Sul', 'RS', '2021-05-10'),
    ('22222222-0000-0000-0000-000000000009', v_congr, 'Lucas Eduardo Souza',      'Obreiro',          'Ativo',     '(54) 99999-0009', NULL,                           'Caxias do Sul', 'RS', '2022-01-17'),
    ('22222222-0000-0000-0000-000000000010', v_congr, 'Beatriz Helena Martins',   'Membro',           'Ativo',     '(54) 99999-0010', NULL,                           'Caxias do Sul', 'RS', '2022-08-30'),
    ('22222222-0000-0000-0000-000000000011', v_congr, 'Rodrigo Almeida Torres',   'Visitante',        'Visitante', '(54) 99999-0011', NULL,                           'Caxias do Sul', 'RS', '2026-05-05'),
    ('22222222-0000-0000-0000-000000000012', v_congr, 'Silvia Regina Campos',     'Membro',           'Ativo',     '(54) 99999-0012', NULL,                           'Caxias do Sul', 'RS', '2023-03-12'),
    ('22222222-0000-0000-0000-000000000013', v_congr, 'André Luís Nascimento',    'Diácono',          'Ativo',     '(54) 99999-0013', NULL,                           'Caxias do Sul', 'RS', '2020-08-05'),
    ('22222222-0000-0000-0000-000000000014', v_congr, 'Priscila Fontes Correia',  'Membro',           'Ativo',     NULL,              NULL,                           'Caxias do Sul', 'RS', '2024-01-20'),
    ('22222222-0000-0000-0000-000000000015', v_congr, 'Marcos Vinícius Rocha',    'Obreiro',          'Inativo',   NULL,              NULL,                           'Caxias do Sul', 'RS', '2021-11-08')
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
      'Estatuto Interno — Assembleia de Deus Caxias do Sul',
      E'ESTATUTO INTERNO — CONGREGAÇÃO JARDIM AMÉRICA\nASSEMBLEIA DE DEUS EM CAXIAS DO SUL\n\nCAPÍTULO I — DA IDENTIFICAÇÃO\nArt. 1º — A Congregação Jardim América, localizada em Caxias do Sul/RS, é congregação da Assembleia de Deus em Caxias do Sul, entidade religiosa sem fins lucrativos, sob orientação pastoral e regimento interno da Secretaria administrativa da obra.\n\nCAPÍTULO II — DOS OBJETIVOS\nArt. 2º — São objetivos da Congregação:\na) Pregar o Evangelho de Jesus Cristo;\nb) Promover adoração, discipulado e santa comunhão;\nc) Servir à cidade de Caxias do Sul em missões e ação social.\n\nCAPÍTULO III — DOS MEMBROS\nArt. 3º — São membros os que confessam fé evangélica, são integrados pela liderança pastoral e acompanhados pela Secretaria da congregação.\n\nCAPÍTULO IV — DA ADMINISTRAÇÃO\nArt. 4º — A Congregação é administrada pelo Pastor local, pastores auxiliares, presbíteros, diáconos e lideranças ministeriais, em harmonia com a direção da Assembleia de Deus em Caxias do Sul.',
      'Estatuto'),
    ('55555555-0000-0000-0000-000000000002', v_congr,
      'Ata de Reunião Ministerial — Maio 2026',
      E'ATA DE REUNIÃO MINISTERIAL\nAssembleia de Deus em Caxias do Sul — Congregação Jardim América\nData: 10 de maio de 2026 | Horário: 19h30 | Local: Salão de Reuniões\n\nPresentes: Pr. João Paulo Ferreira (Pastor), Fernanda Maria Alves (Secretaria), lideranças dos ministérios de Louvor, Infantil, Jovens, Recepção e Intercessão.\n\nPAUTA:\n1. Abertura em oração e leitura bíblica.\n2. Planejamento dos cultos e atividades de junho/2026 na sede de Caxias do Sul.\n3. Escalas ministeriais: confirmação das equipes de Louvor e Recepção.\n4. Mobilização da EBD e dos Pequenos Grupos (Jovens Resgate e Casais Ágape).\n5. Orientações da Secretaria sobre cadastro de membros e documentação congregacional.\n\nEncerramento às 21h00, com benção apostólica.\n\nPr. João Paulo Ferreira — Pastor\nFernanda Maria Alves — Secretaria AD Caxias do Sul / Congregação Jardim América',
      'Ata'),
    ('55555555-0000-0000-0000-000000000003', v_congr,
      'Manual de Integração de Novos Membros — AD Caxias do Sul',
      E'MANUAL DE INTEGRAÇÃO DE NOVOS MEMBROS\nAssembleia de Deus em Caxias do Sul — Congregação Jardim América\n\nBEM-VINDO À FAMÍLIA DE DEUS!\n\nA Secretaria da Congregação Jardim América preparou este material para ajudá-lo a integrar-se à vida congregacional da Assembleia de Deus em Caxias do Sul.\n\nNOSSA IDENTIDADE\nSomos uma congregação evangélica pentecostal, comprometida com a Palavra de Deus, a oração e a obra missionária na cidade de Caxias do Sul.\n\nMINISTÉRIOS DA CONGREGAÇÃO\n• Louvor e Adoração\n• Infantil\n• Jovens Resgate\n• Casais Ágape\n• Recepção e Acolhimento\n• Intercessão\n• Escola Bíblica Dominical\n\nPRIMEIROS PASSOS\n1. Participar do culto de boas-vindas\n2. Encontro com a liderança pastoral\n3. Cadastro na Secretaria (documento com foto e dados pessoais)\n4. Inscrição em um ministério ou pequeno grupo\n\nCONTATOS\nPastor João Paulo Ferreira — (11) 99999-0001\nSecretaria AD Caxias do Sul / Congregação Jardim América — seg a sex, 9h às 17h',
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
      'Cura e restauração — Irmã Maria',
      'Pedido de intercessão pela irmã Maria Santos, da Congregação Jardim América (Assembleia de Deus em Caxias do Sul/RS), em recuperação após cirurgia cardíaca. Oremos por cura completa, paz e conforto para ela e sua família.',
      'Ativo'),
    ('77777777-0000-0000-0000-000000000002', v_congr,
      'Provisão para família Souza — Caxias do Sul',
      'O irmão Lucas Souza, membro da Congregação Jardim América em Caxias do Sul/RS, está desempregado há três meses. Intercedamos para que o Senhor abra portas de trabalho e fortaleça a fé dessa família.',
      'Ativo'),
    ('77777777-0000-0000-0000-000000000003', v_congr,
      'Intercessão pelo Congresso de Oração e Missões',
      'Agradecemos as orações pelo Congresso de Oração e Missões da Assembleia de Deus em Caxias do Sul. O evento foi abençoado; mantemos gratidão e pedimos continuidade no chamado missionário da congregação.',
      'Respondido')
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
  id, title, short_description, full_content, target_type, is_active, button_label, button_link, starts_at
)
VALUES (
  '99999999-0000-0000-0000-000000000001',
  'Ecclesia Admin — Sistema em Demonstração',
  'Você está explorando o Ecclesia Admin com dados de demonstração. Acesse a Bíblia com IA pastoral, devocionais inteligentes, financeiro, secretaria e muito mais.',
  'Você está explorando o Ecclesia Admin com dados de demonstração. Acesse a Bíblia com IA pastoral, devocionais inteligentes, financeiro, secretaria e muito mais. Este anúncio é exibido em todos os painéis da plataforma.',
  'global',
  true,
  'Explorar Bíblia IA',
  '/admin/biblia',
  now() - interval '1 hour'
)
ON CONFLICT (id) DO NOTHING;
