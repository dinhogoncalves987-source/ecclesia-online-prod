-- Staging: Campanhas + contribuições + integração financeira (Fase 2A).
-- Requires: organizations, members, transactions, update_updated_at_column(),
--           is_platform_admin(), is_org_user(), has_org_role().

-- ---------------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  goal_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (goal_amount >= 0),
  raised_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (raised_amount >= 0),
  start_date date,
  end_date date,
  cover_image_url text,
  visibility text NOT NULL DEFAULT 'organization',
  priority text NOT NULL DEFAULT 'normal',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaigns_status_check CHECK (
    status IN ('draft', 'active', 'paused', 'closed', 'archived')
  ),
  CONSTRAINT campaigns_visibility_check CHECK (
    visibility IN ('organization', 'hierarchy', 'platform')
  ),
  CONSTRAINT campaigns_priority_check CHECK (
    priority IN ('low', 'normal', 'high', 'urgent')
  )
);

CREATE TABLE IF NOT EXISTS public.campaign_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  content text,
  media_url text,
  update_type text NOT NULL DEFAULT 'progress',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campaign_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  contributed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  gateway text DEFAULT 'demo',
  gateway_fee_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (gateway_fee_amount >= 0),
  platform_fee_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (platform_fee_amount >= 0),
  net_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (net_amount >= 0),
  payment_status text NOT NULL DEFAULT 'confirmed',
  payment_method text DEFAULT 'pix',
  contributed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_contributions_payment_status_check CHECK (
    payment_status IN ('pending', 'confirmed', 'failed', 'refunded')
  )
);

-- ---------------------------------------------------------------------------
-- 2. Integração transactions (opcional, não quebra estrutura existente)
-- campaign_contributions.transaction_id liga contribuição de campanha ao financeiro.
-- ---------------------------------------------------------------------------
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS source_module text DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_transactions_campaign_id ON public.transactions(campaign_id);

-- ---------------------------------------------------------------------------
-- 3. Índices
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_campaigns_org_status ON public.campaigns(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_end_date ON public.campaigns(end_date);
CREATE INDEX IF NOT EXISTS idx_campaign_updates_campaign_created ON public.campaign_updates(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_contributions_campaign_contributed ON public.campaign_contributions(campaign_id, contributed_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_contributions_org_contributed ON public.campaign_contributions(organization_id, contributed_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_contributions_transaction ON public.campaign_contributions(transaction_id);

-- ---------------------------------------------------------------------------
-- 4. updated_at em campaigns
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS campaigns_updated_at ON public.campaigns;
CREATE TRIGGER campaigns_updated_at
BEFORE UPDATE ON public.campaigns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 5. Sincronizar raised_amount
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_campaign_raised_amount(p_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.campaigns c
  SET raised_amount = COALESCE((
    SELECT SUM(cc.amount)
    FROM public.campaign_contributions cc
    WHERE cc.campaign_id = p_campaign_id
      AND cc.payment_status = 'confirmed'
  ), 0),
  updated_at = now()
  WHERE c.id = p_campaign_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_campaign_raised_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_id uuid;
BEGIN
  v_campaign_id := COALESCE(NEW.campaign_id, OLD.campaign_id);
  IF v_campaign_id IS NOT NULL THEN
    PERFORM public.refresh_campaign_raised_amount(v_campaign_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS campaign_contributions_refresh_raised ON public.campaign_contributions;
CREATE TRIGGER campaign_contributions_refresh_raised
AFTER INSERT OR UPDATE OR DELETE ON public.campaign_contributions
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_campaign_raised_amount();

-- ---------------------------------------------------------------------------
-- 6. Helpers RLS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_org_campaign_finance_reader(
  _user_id uuid,
  _organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user_id)
  OR public.has_org_role(
    _user_id,
    _organization_id,
    ARRAY['admin', 'church_admin', 'leader', 'tesoureiro', 'contador']
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_campaign_writer(
  _user_id uuid,
  _organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user_id)
  OR public.has_org_role(
    _user_id,
    _organization_id,
    ARRAY['admin', 'church_admin', 'tesoureiro']
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_campaign_update_writer(
  _user_id uuid,
  _organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user_id)
  OR public.has_org_role(
    _user_id,
    _organization_id,
    ARRAY['admin', 'church_admin', 'leader', 'tesoureiro']
  );
$$;

-- ---------------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaigns platform admin all" ON public.campaigns;
CREATE POLICY "campaigns platform admin all" ON public.campaigns
FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "campaigns org members read" ON public.campaigns;
CREATE POLICY "campaigns org members read" ON public.campaigns
FOR SELECT TO authenticated
USING (
  public.is_org_user(auth.uid(), organization_id)
  AND (
    status IN ('active', 'closed', 'paused')
    OR public.is_org_campaign_finance_reader(auth.uid(), organization_id)
  )
);

DROP POLICY IF EXISTS "campaigns writers manage" ON public.campaigns;
CREATE POLICY "campaigns writers manage" ON public.campaigns
FOR INSERT TO authenticated
WITH CHECK (public.is_org_campaign_writer(auth.uid(), organization_id));

DROP POLICY IF EXISTS "campaigns writers update" ON public.campaigns;
CREATE POLICY "campaigns writers update" ON public.campaigns
FOR UPDATE TO authenticated
USING (public.is_org_campaign_writer(auth.uid(), organization_id))
WITH CHECK (public.is_org_campaign_writer(auth.uid(), organization_id));

DROP POLICY IF EXISTS "campaigns writers delete" ON public.campaigns;
CREATE POLICY "campaigns writers delete" ON public.campaigns
FOR DELETE TO authenticated
USING (public.is_org_campaign_writer(auth.uid(), organization_id));

DROP POLICY IF EXISTS "campaign updates platform admin all" ON public.campaign_updates;
CREATE POLICY "campaign updates platform admin all" ON public.campaign_updates
FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "campaign updates org read" ON public.campaign_updates;
CREATE POLICY "campaign updates org read" ON public.campaign_updates
FOR SELECT TO authenticated
USING (public.is_org_user(auth.uid(), organization_id));

DROP POLICY IF EXISTS "campaign updates admins write" ON public.campaign_updates;
CREATE POLICY "campaign updates admins write" ON public.campaign_updates
FOR INSERT TO authenticated
WITH CHECK (public.is_org_campaign_update_writer(auth.uid(), organization_id));

DROP POLICY IF EXISTS "campaign updates admins update" ON public.campaign_updates;
CREATE POLICY "campaign updates admins update" ON public.campaign_updates
FOR UPDATE TO authenticated
USING (public.is_org_campaign_update_writer(auth.uid(), organization_id))
WITH CHECK (public.is_org_campaign_update_writer(auth.uid(), organization_id));

DROP POLICY IF EXISTS "campaign updates admins delete" ON public.campaign_updates;
CREATE POLICY "campaign updates admins delete" ON public.campaign_updates
FOR DELETE TO authenticated
USING (public.is_org_campaign_update_writer(auth.uid(), organization_id));

DROP POLICY IF EXISTS "campaign contributions platform admin all" ON public.campaign_contributions;
CREATE POLICY "campaign contributions platform admin all" ON public.campaign_contributions
FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "campaign contributions finance read" ON public.campaign_contributions;
CREATE POLICY "campaign contributions finance read" ON public.campaign_contributions
FOR SELECT TO authenticated
USING (
  public.is_org_campaign_finance_reader(auth.uid(), organization_id)
  OR contributed_by = auth.uid()
);

DROP POLICY IF EXISTS "campaign contributions insert" ON public.campaign_contributions;
CREATE POLICY "campaign contributions insert" ON public.campaign_contributions
FOR INSERT TO authenticated
WITH CHECK (
  public.is_org_campaign_writer(auth.uid(), organization_id)
  OR (
    contributed_by = auth.uid()
    AND public.is_org_user(auth.uid(), organization_id)
  )
);

DROP POLICY IF EXISTS "campaign contributions writers update" ON public.campaign_contributions;
CREATE POLICY "campaign contributions writers update" ON public.campaign_contributions
FOR UPDATE TO authenticated
USING (public.is_org_campaign_writer(auth.uid(), organization_id))
WITH CHECK (public.is_org_campaign_writer(auth.uid(), organization_id));

DROP POLICY IF EXISTS "campaign contributions writers delete" ON public.campaign_contributions;
CREATE POLICY "campaign contributions writers delete" ON public.campaign_contributions
FOR DELETE TO authenticated
USING (public.is_org_campaign_writer(auth.uid(), organization_id));

-- ---------------------------------------------------------------------------
-- 8. Seed demo AD Caxias (idempotente)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_matriz  uuid := '11111111-0000-0000-0000-000000000002';
  v_congr   uuid := '11111111-0000-0000-0000-000000000004';
  v_user_id uuid;
  v_c1 uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_c2 uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
  v_c3 uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_c4 uuid := 'aaaaaaaa-0000-0000-0000-000000000004';
  v_c5 uuid := 'aaaaaaaa-0000-0000-0000-000000000005';
  v_c6 uuid := 'aaaaaaaa-0000-0000-0000-000000000006';
  v_c7 uuid := 'aaaaaaaa-0000-0000-0000-000000000007';
  v_c8 uuid := 'aaaaaaaa-0000-0000-0000-000000000008';
  v_c9 uuid := 'aaaaaaaa-0000-0000-0000-000000000009';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_matriz) THEN
    RAISE NOTICE 'campaigns seed skipped: demo matriz not found';
    RETURN;
  END IF;

  SELECT user_id INTO v_user_id FROM public.profiles LIMIT 1;

  INSERT INTO public.campaigns (
    id, organization_id, title, description, type, status, goal_amount,
    start_date, end_date, visibility, priority, published_at
  ) VALUES
    (
      v_c1, v_matriz,
      'Reforma do Templo Central',
      'Revitalização do templo da sede da Assembleia de Deus em Caxias do Sul: pintura externa, adequação elétrica, acessibilidade e salas de EBD.',
      'reforma', 'active', 180000.00,
      '2026-01-15', '2026-09-30', 'organization', 'high', now() - interval '30 days'
    ),
    (
      v_c2, v_matriz,
      'Construção Congregação São José',
      'Obra da nova congregação São José em Caxias do Sul/RS: fundação concluída, fase de alvenaria e cobertura.',
      'construcao', 'active', 420000.00,
      '2025-06-01', '2027-03-15', 'organization', 'normal', now() - interval '60 days'
    ),
    (
      v_c3, v_matriz,
      'Missões África',
      'Envio de equipe missionária e apoio logístico para projetos de plantação de igrejas e ação social em Moçambique.',
      'missoes', 'active', 95000.00,
      '2026-02-01', '2026-11-20', 'hierarchy', 'normal', now() - interval '45 days'
    ),
    (
      v_c4, v_congr,
      'Ação Social Inverno',
      'Distribuição de cobertores, cestas básicas e kits de higiene para famílias em vulnerabilidade em Caxias do Sul.',
      'acao_social', 'closed', 35000.00,
      '2026-03-01', '2026-06-30', 'organization', 'normal', now() - interval '90 days'
    ),
    (
      v_c5, v_matriz,
      'Congresso de Jovens',
      'Realização do Congresso de Jovens 2026 com palestras, workshops e mobilização dos ministérios Jovens Resgate da região.',
      'congresso', 'active', 48000.00,
      '2026-04-01', '2026-08-10', 'organization', 'normal', now() - interval '20 days'
    ),
    (
      'aaaaaaaa-0000-0000-0000-000000000006', v_matriz,
      'Veículo para Missões Regionais',
      'Aquisição de van para transporte de equipes missionárias, visitas a congregações do interior e ação social nas comunidades da região da Serra.',
      'veiculos', 'active', 165000.00,
      '2026-03-01', '2026-10-15', 'hierarchy', 'normal', now() - interval '25 days'
    ),
    (
      'aaaaaaaa-0000-0000-0000-000000000007', v_matriz,
      'Instrumentos para Louvor',
      'Renovação do parque de instrumentos do ministério de louvor: teclado, bateria, amplificadores e microfones sem fio para cultos e eventos.',
      'instrumentos', 'active', 52000.00,
      '2026-04-10', '2026-07-20', 'organization', 'normal', now() - interval '18 days'
    ),
    (
      'aaaaaaaa-0000-0000-0000-000000000008', v_congr,
      'Capela de Oração 24h',
      'Projeto ministerial de capela de oração contínua na Congregação Jardim América: adequação do espaço, climatização e mobiliário.',
      'projeto_ministerial', 'active', 28000.00,
      '2026-05-01', '2026-12-01', 'organization', 'normal', now() - interval '10 days'
    ),
    (
      'aaaaaaaa-0000-0000-0000-000000000009', v_matriz,
      'Encontro de Mulheres 2026',
      'Realização do Encontro de Mulheres com tema Mulheres de Fé — palestras, momentos de oração, ação social e kit para participantes.',
      'evento', 'active', 22000.00,
      '2026-06-01', '2026-09-05', 'organization', 'normal', now() - interval '5 days'
    )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.campaign_updates (id, campaign_id, organization_id, title, content, update_type, created_at)
  VALUES
    ('bbbbbbbb-0000-0000-0000-000000000001', v_c1, v_matriz, 'Nova foto adicionada', 'Registro fotográfico da fachada em revitalização.', 'media', '2026-05-24T14:00:00+00'),
    ('bbbbbbbb-0000-0000-0000-000000000002', v_c3, v_matriz, 'Meta atingiu 50%', 'Campanha Missões África alcançou metade da meta financeira.', 'progress', '2026-05-22T10:30:00+00'),
    ('bbbbbbbb-0000-0000-0000-000000000003', v_c4, v_congr, 'Prestação de contas publicada', 'Relatório de entrega de cobertores e cestas básicas disponível.', 'accountability', '2026-05-20T16:45:00+00'),
    ('bbbbbbbb-0000-0000-0000-000000000004', v_c2, v_matriz, 'Relatório fotográfico da obra', 'Avanço da alvenaria e cobertura da congregação São José.', 'media', '2026-05-18T09:15:00+00'),
    ('bbbbbbbb-0000-0000-0000-000000000005', v_c5, v_matriz, 'Inscrições abertas', 'Congresso de Jovens 2026 — inscrições pelo ministério.', 'progress', '2026-05-15T11:00:00+00'),
    ('bbbbbbbb-0000-0000-0000-000000000006', v_c6, v_matriz, 'Orçamento da van aprovado', 'Conselho missionário aprovou orçamento preliminar do veículo.', 'progress', '2026-05-25T11:00:00+00'),
    ('bbbbbbbb-0000-0000-0000-000000000007', v_c7, v_matriz, 'Meta atingiu 60%', 'Campanha de instrumentos alcançou 60% da meta.', 'progress', '2026-05-23T18:30:00+00'),
    ('bbbbbbbb-0000-0000-0000-000000000008', v_c8, v_congr, 'Projeto apresentado à congregação', 'Capela de Oração 24h apresentada no culto de domingo.', 'progress', '2026-05-21T09:00:00+00'),
    ('bbbbbbbb-0000-0000-0000-000000000009', v_c9, v_matriz, 'Inscrições abrem em junho', 'Encontro de Mulheres 2026 — inscrições a partir de 01/06.', 'progress', '2026-05-19T14:00:00+00')
  ON CONFLICT (id) DO NOTHING;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.transactions (
      id, organization_id, user_id, date, description, type, amount, status, category,
      payment_method, campaign_id, source_module
    ) VALUES
      ('88888888-0000-0000-0000-000000000011', v_matriz, v_user_id, '2026-05-10', 'Campanha — Reforma do Templo Central', 'Entrada', 5000.00, 'Confirmado', 'Campanhas', 'PIX', v_c1, 'campaign'),
      ('88888888-0000-0000-0000-000000000012', v_matriz, v_user_id, '2026-05-12', 'Campanha — Construção São José', 'Entrada', 8500.00, 'Confirmado', 'Campanhas', 'PIX', v_c2, 'campaign'),
      ('88888888-0000-0000-0000-000000000013', v_matriz, v_user_id, '2026-05-14', 'Campanha — Missões África', 'Entrada', 3200.00, 'Confirmado', 'Campanhas', 'PIX', v_c3, 'campaign'),
      ('88888888-0000-0000-0000-000000000014', v_congr, v_user_id, '2026-05-08', 'Campanha — Ação Social Inverno', 'Entrada', 3500.00, 'Confirmado', 'Campanhas', 'PIX', v_c4, 'campaign'),
      ('88888888-0000-0000-0000-000000000015', v_matriz, v_user_id, '2026-05-16', 'Campanha — Congresso de Jovens', 'Entrada', 1200.00, 'Confirmado', 'Campanhas', 'PIX', v_c5, 'campaign')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.campaign_contributions (
      id, campaign_id, organization_id, member_id, transaction_id, contributed_by,
      amount, gateway, gateway_fee_amount, platform_fee_amount, net_amount,
      payment_status, payment_method, contributed_at
    ) VALUES
      ('cccccccc-0000-0000-0000-000000000001', v_c1, v_matriz, '22222222-0000-0000-0000-000000000004', '88888888-0000-0000-0000-000000000011', v_user_id,
        5000.00, 'demo', 50.00, 75.00, 4875.00, 'confirmed', 'pix', '2026-05-10T10:00:00+00'),
      ('cccccccc-0000-0000-0000-000000000002', v_c2, v_matriz, '22222222-0000-0000-0000-000000000008', '88888888-0000-0000-0000-000000000012', v_user_id,
        8500.00, 'demo', 85.00, 127.50, 8287.50, 'confirmed', 'pix', '2026-05-12T14:30:00+00'),
      ('cccccccc-0000-0000-0000-000000000003', v_c3, v_matriz, '22222222-0000-0000-0000-000000000002', '88888888-0000-0000-0000-000000000013', v_user_id,
        3200.00, 'demo', 32.00, 48.00, 3120.00, 'confirmed', 'pix', '2026-05-14T09:15:00+00'),
      ('cccccccc-0000-0000-0000-000000000004', v_c4, v_congr, '22222222-0000-0000-0000-000000000010', '88888888-0000-0000-0000-000000000014', v_user_id,
        3500.00, 'demo', 35.00, 52.50, 3412.50, 'confirmed', 'pix', '2026-05-08T16:00:00+00'),
      ('cccccccc-0000-0000-0000-000000000005', v_c5, v_matriz, '22222222-0000-0000-0000-000000000005', '88888888-0000-0000-0000-000000000015', v_user_id,
        1200.00, 'demo', 12.00, 18.00, 1170.00, 'confirmed', 'pix', '2026-05-16T19:45:00+00')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Contribuições adicionais (sem transaction vinculada) para aproximar metas demo
  INSERT INTO public.campaign_contributions (
    id, campaign_id, organization_id, member_id, amount, gateway,
    gateway_fee_amount, platform_fee_amount, net_amount, payment_status, payment_method, contributed_at
  ) VALUES
    ('cccccccc-0000-0000-0000-000000000011', v_c1, v_matriz, '22222222-0000-0000-0000-000000000001', 107500.00, 'demo', 1075.00, 1612.50, 104812.50, 'confirmed', 'pix', '2026-04-20T12:00:00+00'),
    ('cccccccc-0000-0000-0000-000000000012', v_c2, v_matriz, '22222222-0000-0000-0000-000000000007', 259900.00, 'demo', 2599.00, 3898.50, 253402.50, 'confirmed', 'transfer', '2026-04-25T10:00:00+00'),
    ('cccccccc-0000-0000-0000-000000000013', v_c3, v_matriz, '22222222-0000-0000-0000-000000000003', 58000.00, 'demo', 580.00, 870.00, 56550.00, 'confirmed', 'pix', '2026-05-01T08:00:00+00'),
    ('cccccccc-0000-0000-0000-000000000014', v_c4, v_congr, '22222222-0000-0000-0000-000000000006', 31500.00, 'demo', 315.00, 472.50, 30712.50, 'confirmed', 'pix', '2026-05-05T15:00:00+00'),
    ('cccccccc-0000-0000-0000-000000000015', v_c5, v_matriz, '22222222-0000-0000-0000-000000000009', 18600.00, 'demo', 186.00, 279.00, 18135.00, 'confirmed', 'pix', '2026-05-18T11:00:00+00'),
    ('cccccccc-0000-0000-0000-000000000021', v_c6, v_matriz, '22222222-0000-0000-0000-000000000003', 78300.00, 'demo', 783.00, 1174.50, 76342.50, 'confirmed', 'pix', '2026-05-20T10:00:00+00'),
    ('cccccccc-0000-0000-0000-000000000022', v_c7, v_matriz, '22222222-0000-0000-0000-000000000009', 31400.00, 'demo', 314.00, 471.00, 30615.00, 'confirmed', 'pix', '2026-05-22T15:00:00+00'),
    ('cccccccc-0000-0000-0000-000000000023', v_c8, v_congr, '22222222-0000-0000-0000-000000000012', 9600.00, 'demo', 96.00, 144.00, 9360.00, 'confirmed', 'pix', '2026-05-24T08:00:00+00'),
    ('cccccccc-0000-0000-0000-000000000024', v_c9, v_matriz, '22222222-0000-0000-0000-000000000002', 4200.00, 'demo', 42.00, 63.00, 4095.00, 'confirmed', 'pix', '2026-05-17T12:00:00+00')
  ON CONFLICT (id) DO NOTHING;

  PERFORM public.refresh_campaign_raised_amount(v_c1);
  PERFORM public.refresh_campaign_raised_amount(v_c2);
  PERFORM public.refresh_campaign_raised_amount(v_c3);
  PERFORM public.refresh_campaign_raised_amount(v_c4);
  PERFORM public.refresh_campaign_raised_amount(v_c5);
  PERFORM public.refresh_campaign_raised_amount(v_c6);
  PERFORM public.refresh_campaign_raised_amount(v_c7);
  PERFORM public.refresh_campaign_raised_amount(v_c8);
  PERFORM public.refresh_campaign_raised_amount(v_c9);
END $$;
