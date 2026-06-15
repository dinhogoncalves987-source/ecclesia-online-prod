-- ============================================================
-- Seed demo: recommendation_letters (5 exemplos para staging)
-- ============================================================
-- Executar no SQL Editor do Supabase (postgres role ou service role).
-- NÃO é uma migration — não rodar em produção.
--
-- Idempotente: ON CONFLICT (id) DO NOTHING
-- Usa a mesma organização-matriz dos outros seeds do projeto:
--   v_org = '11111111-0000-0000-0000-000000000002'
-- ============================================================

DO $$
DECLARE
  v_org      uuid := '11111111-0000-0000-0000-000000000002';
  v_org_name text;
BEGIN
  SELECT name INTO v_org_name FROM public.organizations WHERE id = v_org;
  IF v_org_name IS NULL THEN
    RAISE NOTICE 'Organização demo não encontrada (id: %). Seed ignorado.', v_org;
    RETURN;
  END IF;

  INSERT INTO public.recommendation_letters (
    id, organization_id,
    member_id, member_name, member_email,
    origin_church_name,
    destination_church, destination_city, destination_state,
    reason, observations,
    status,
    requested_at, reviewed_at, approved_at
  ) VALUES
    -- 1. Solicitada (requested)
    (
      'cccccccc-0000-0000-0000-000000000001', v_org,
      NULL, 'João Carlos Ferreira', 'joao.ferreira@exemplo.com',
      v_org_name,
      'Assembleia de Deus — Central', 'Porto Alegre', 'RS',
      'Mudança de residência por novo emprego',
      'Membro se mudará para Porto Alegre em função de nova oportunidade profissional. Solicita carta para apresentação e comunhão.',
      'requested',
      now() - interval '5 days', NULL, NULL
    ),
    -- 2. Solicitada (requested)
    (
      'cccccccc-0000-0000-0000-000000000002', v_org,
      NULL, 'Maria Aparecida Santos', 'maria.santos@exemplo.com',
      v_org_name,
      'Primeira Igreja Batista de São Paulo', 'São Paulo', 'SP',
      'Transferência familiar',
      'Família transferida para São Paulo. Membro solicita carta para apresentação à nova congregação.',
      'requested',
      now() - interval '3 days', NULL, NULL
    ),
    -- 3. Em análise (under_review)
    (
      'cccccccc-0000-0000-0000-000000000003', v_org,
      NULL, 'Paulo Roberto Almeida', 'paulo.almeida@exemplo.com',
      v_org_name,
      'Igreja Evangélica Quadrangular', 'Curitiba', 'PR',
      'Visita missionária',
      'Viagem missionária de 60 dias. Necessita de carta de apresentação para comunhão local durante o período.',
      'under_review',
      now() - interval '10 days', now() - interval '7 days', NULL
    ),
    -- 4. Aprovada (approved) — tem QR code e link de validação
    (
      'cccccccc-0000-0000-0000-000000000004', v_org,
      NULL, 'Ana Beatriz Oliveira', 'ana.oliveira@exemplo.com',
      v_org_name,
      'Igreja Presbiteriana de Florianópolis', 'Florianópolis', 'SC',
      'Transferência para fins de estudo',
      'Membro ingressou em universidade federal e solicita carta de apresentação à congregação local.',
      'approved',
      now() - interval '15 days', now() - interval '12 days', now() - interval '10 days'
    ),
    -- 5. Rejeitada (rejected)
    (
      'cccccccc-0000-0000-0000-000000000005', v_org,
      NULL, 'Carlos Eduardo Lima', 'carlos.lima@exemplo.com',
      v_org_name,
      'Igreja Evangélica de Goiânia', 'Goiânia', 'GO',
      'Apresentação durante viagem a negócios',
      'Solicitação realizada para viagem temporária de negócios. Secretaria optou por não emitir carta nesta ocasião.',
      'rejected',
      now() - interval '20 days', now() - interval '18 days', NULL
    )
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'Seed concluído — 5 cartas de recomendação demo inseridas para org: %', v_org_name;
END $$;
