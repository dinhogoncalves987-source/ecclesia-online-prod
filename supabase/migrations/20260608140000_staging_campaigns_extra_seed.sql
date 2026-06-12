-- Campanhas demo adicionais (AD Caxias) — idempotente.
-- Complementa 20260608130000_staging_campaigns_finance_integration.sql

DO $$
DECLARE
  v_matriz  uuid := '11111111-0000-0000-0000-000000000002';
  v_congr   uuid := '11111111-0000-0000-0000-000000000004';
  v_c6 uuid := 'aaaaaaaa-0000-0000-0000-000000000006';
  v_c7 uuid := 'aaaaaaaa-0000-0000-0000-000000000007';
  v_c8 uuid := 'aaaaaaaa-0000-0000-0000-000000000008';
  v_c9 uuid := 'aaaaaaaa-0000-0000-0000-000000000009';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_matriz) THEN
    RAISE NOTICE 'extra campaigns seed skipped: demo matriz not found';
    RETURN;
  END IF;

  INSERT INTO public.campaigns (
    id, organization_id, title, description, type, status, goal_amount,
    start_date, end_date, visibility, priority, published_at
  ) VALUES
    (
      v_c6, v_matriz,
      'Veículo para Missões Regionais',
      'Aquisição de van para transporte de equipes missionárias, visitas a congregações do interior e ação social nas comunidades da região da Serra.',
      'veiculos', 'active', 165000.00,
      '2026-03-01', '2026-10-15', 'hierarchy', 'normal', now() - interval '25 days'
    ),
    (
      v_c7, v_matriz,
      'Instrumentos para Louvor',
      'Renovação do parque de instrumentos do ministério de louvor: teclado, bateria, amplificadores e microfones sem fio para cultos e eventos.',
      'instrumentos', 'active', 52000.00,
      '2026-04-10', '2026-07-20', 'organization', 'normal', now() - interval '18 days'
    ),
    (
      v_c8, v_congr,
      'Capela de Oração 24h',
      'Projeto ministerial de capela de oração contínua na Congregação Jardim América: adequação do espaço, climatização e mobiliário.',
      'projeto_ministerial', 'active', 28000.00,
      '2026-05-01', '2026-12-01', 'organization', 'normal', now() - interval '10 days'
    ),
    (
      v_c9, v_matriz,
      'Encontro de Mulheres 2026',
      'Realização do Encontro de Mulheres com tema Mulheres de Fé — palestras, momentos de oração, ação social e kit para participantes.',
      'evento', 'draft', 22000.00,
      '2026-06-01', '2026-09-05', 'organization', 'low', now() - interval '5 days'
    )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.campaign_updates (id, campaign_id, organization_id, title, content, update_type, created_at)
  VALUES
    ('bbbbbbbb-0000-0000-0000-000000000006', v_c6, v_matriz, 'Orçamento da van aprovado', 'Conselho missionário aprovou orçamento preliminar do veículo.', 'progress', '2026-05-25T11:00:00+00'),
    ('bbbbbbbb-0000-0000-0000-000000000007', v_c7, v_matriz, 'Meta atingiu 60%', 'Campanha de instrumentos alcançou 60% da meta.', 'progress', '2026-05-23T18:30:00+00'),
    ('bbbbbbbb-0000-0000-0000-000000000008', v_c8, v_congr, 'Projeto apresentado à congregação', 'Capela de Oração 24h apresentada no culto de domingo.', 'progress', '2026-05-21T09:00:00+00'),
    ('bbbbbbbb-0000-0000-0000-000000000009', v_c9, v_matriz, 'Inscrições abrem em junho', 'Encontro de Mulheres 2026 — inscrições a partir de 01/06.', 'progress', '2026-05-19T14:00:00+00')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.campaign_contributions (
    id, campaign_id, organization_id, member_id, amount, gateway,
    gateway_fee_amount, platform_fee_amount, net_amount, payment_status, payment_method, contributed_at
  ) VALUES
    ('cccccccc-0000-0000-0000-000000000021', v_c6, v_matriz, '22222222-0000-0000-0000-000000000003', 78300.00, 'demo', 783.00, 1174.50, 76342.50, 'confirmed', 'pix', '2026-05-20T10:00:00+00'),
    ('cccccccc-0000-0000-0000-000000000022', v_c7, v_matriz, '22222222-0000-0000-0000-000000000009', 31400.00, 'demo', 314.00, 471.00, 30615.00, 'confirmed', 'pix', '2026-05-22T15:00:00+00'),
    ('cccccccc-0000-0000-0000-000000000023', v_c8, v_congr, '22222222-0000-0000-0000-000000000012', 9600.00, 'demo', 96.00, 144.00, 9360.00, 'confirmed', 'pix', '2026-05-24T08:00:00+00'),
    ('cccccccc-0000-0000-0000-000000000024', v_c9, v_matriz, '22222222-0000-0000-0000-000000000002', 4200.00, 'demo', 42.00, 63.00, 4095.00, 'confirmed', 'pix', '2026-05-17T12:00:00+00')
  ON CONFLICT (id) DO NOTHING;

  PERFORM public.refresh_campaign_raised_amount(v_c6);
  PERFORM public.refresh_campaign_raised_amount(v_c7);
  PERFORM public.refresh_campaign_raised_amount(v_c8);
  PERFORM public.refresh_campaign_raised_amount(v_c9);
END $$;
