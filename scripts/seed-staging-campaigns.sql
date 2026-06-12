-- Fase 2F.8 — Seed/normalização de campanhas reais (staging)
-- Executar no SQL Editor do Supabase (postgres role) — NÃO é migration.
-- Idempotente: ON CONFLICT DO UPDATE — não apaga campaign_media.

DO $$
DECLARE
  v_matriz uuid := '11111111-0000-0000-0000-000000000002';
  v_congr  uuid := '11111111-0000-0000-0000-000000000004';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_matriz) THEN
    RAISE EXCEPTION 'Organização matriz demo não encontrada';
  END IF;

  INSERT INTO public.campaigns (
    id, organization_id, title, description, type, status, goal_amount,
    start_date, end_date, visibility, priority, allow_replies, is_featured, published_at
  ) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000010', v_matriz, 'Ganhando Almas',
     'Campanha de evangelismo nas ruas, visitas e cultos de salvação. Meta: alcançar famílias da região com o evangelho.',
     'projeto_ministerial', 'active', 5000, '2026-04-01', '2026-10-31', 'organization', 'high', true, false, now() - interval '20 days'),
    ('aaaaaaaa-0000-0000-0000-000000000003', v_matriz, 'Missões África',
     'Envio de equipe missionária e apoio logístico para plantação de igrejas e ação social em Moçambique.',
     'missoes', 'active', 15000, '2026-02-01', '2026-11-20', 'hierarchy', 'normal', true, false, now() - interval '45 days'),
    ('aaaaaaaa-0000-0000-0000-000000000011', v_matriz, 'Missões Camboja',
     'Projeto missionário no Camboja: tradução de materiais, escola bíblica para jovens e apoio a pastores locais.',
     'missoes', 'active', 12000, '2026-03-15', '2026-12-15', 'hierarchy', 'normal', false, false, now() - interval '30 days'),
    ('aaaaaaaa-0000-0000-0000-000000000004', v_congr, 'Ação Social Inverno',
     'Distribuição de cobertores, cestas básicas e kits de higiene para famílias em vulnerabilidade.',
     'acao_social', 'closed', 8000, '2026-03-01', '2026-06-30', 'organization', 'normal', false, false, now() - interval '90 days'),
    ('aaaaaaaa-0000-0000-0000-000000000008', v_congr, 'Reforma da Capela de Oração',
     'Reforma e adequação da capela de oração contínua: climatização, acústica e mobiliário.',
     'reform', 'active', 20000, '2026-05-01', '2026-12-01', 'organization', 'high', true, false, now() - interval '10 days'),
    ('aaaaaaaa-0000-0000-0000-000000000002', v_matriz, 'Construção do Novo Templo',
     'Obra do novo templo da sede: alvenaria, cobertura e acabamento interno.',
     'construcao', 'active', 150000, '2025-06-01', '2027-03-15', 'hierarchy', 'urgent', true, false, now() - interval '60 days'),
    ('aaaaaaaa-0000-0000-0000-000000000006', v_matriz, 'Veículo Missionário',
     'Aquisição de van missionária para transporte de equipes e ação social na Serra.',
     'veiculos', 'paused', 80000, '2026-03-01', '2026-10-15', 'hierarchy', 'normal', false, false, now() - interval '25 days'),
    ('aaaaaaaa-0000-0000-0000-000000000007', v_matriz, 'Projeto Crianças para Cristo',
     'Material didático, lanches e eventos para o ministério infantil.',
     'projeto_ministerial', 'active', 6000, '2026-04-15', '2026-08-30', 'organization', 'normal', true, false, now() - interval '18 days'),
    ('aaaaaaaa-0000-0000-0000-000000000005', v_matriz, 'Conferência de Jovens 2026',
     'Conferência de Jovens 2026 com palestras, workshops e louvor.',
     'congresso', 'active', 10000, '2026-04-01', '2026-08-10', 'organization', 'normal', true, false, now() - interval '20 days'),
    ('aaaaaaaa-0000-0000-0000-000000000009', v_matriz, 'Escola Bíblica Comunitária',
     'Estudo bíblico comunitário: apostilas, bíblias e encontros semanais abertos à vizinhança.',
     'projeto_ministerial', 'draft', 7000, '2026-06-01', '2026-11-30', 'organization', 'low', false, false, NULL),
    ('aaaaaaaa-0000-0000-0000-000000000001', v_matriz, 'Reforma do Templo Central',
     'Revitalização do templo da sede — campanha anterior encerrada.',
     'reform', 'closed', 180000, '2026-01-15', '2026-09-30', 'organization', 'normal', false, false, now() - interval '120 days')
  ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    type = EXCLUDED.type,
    status = EXCLUDED.status,
    goal_amount = EXCLUDED.goal_amount,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    visibility = EXCLUDED.visibility,
    priority = EXCLUDED.priority,
    allow_replies = EXCLUDED.allow_replies,
    published_at = COALESCE(EXCLUDED.published_at, public.campaigns.published_at),
    updated_at = now();

  UPDATE public.campaigns SET is_featured = false WHERE organization_id IN (v_matriz, v_congr) AND is_featured = true;
  UPDATE public.campaigns SET is_featured = true, updated_at = now()
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000010' AND organization_id = v_matriz;
  UPDATE public.campaigns SET is_featured = true, updated_at = now()
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000008' AND organization_id = v_congr;

  INSERT INTO public.campaign_updates (id, campaign_id, organization_id, title, content, update_type, created_at)
  VALUES
    ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000010', v_matriz,
     'Primeira semana de evangelismo concluída', 'Equipe realizou 12 visitas e três cultos de salvação.', 'progress', '2026-05-20T10:00:00+00'),
    ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000003', v_matriz,
     'Equipe chegou ao campo missionário', 'Missionários desembarcaram em Maputo.', 'progress', '2026-05-22T14:30:00+00'),
    ('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000011', v_matriz,
     'Compra de materiais concluída', 'Apostilas e Bíblias em khmer adquiridas.', 'progress', '2026-05-23T09:15:00+00'),
    ('dddddddd-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000002', v_matriz,
     'Primeira etapa finalizada', 'Alvenaria do térreo concluída.', 'progress', '2026-05-18T11:00:00+00'),
    ('dddddddd-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000008', v_congr,
     'Culto inaugural realizado', 'Capela reinaugurada com vigília de intercessão.', 'achievement', '2026-05-24T19:00:00+00'),
    ('dddddddd-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000004', v_congr,
     'Prestação de contas publicada', 'Relatório de cobertores e cestas entregue.', 'accountability', '2026-05-20T16:45:00+00'),
    ('dddddddd-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000005', v_matriz,
     'Inscrições abertas', 'Conferência de Jovens 2026 — inscrições abertas.', 'announcement', '2026-05-15T11:00:00+00')
  ON CONFLICT (id) DO NOTHING;
END $$;
