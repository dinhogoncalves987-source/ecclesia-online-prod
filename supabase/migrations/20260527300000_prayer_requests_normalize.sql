-- MÓDULO 08 — Pedidos de Oração: normalização de status, demo AD Caxias, RLS platform_admin.
-- Status canônicos: Ativo | Respondido

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Normalizar status legados → Ativo | Respondido
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE public.prayer_requests
SET status = 'Respondido'
WHERE status IS NOT NULL
  AND lower(trim(replace(replace(status, 'ç', 'c'), 'ã', 'a'))) IN (
    'respondido', 'answered', 'responded'
  );

UPDATE public.prayer_requests
SET status = 'Ativo'
WHERE status IS NULL
   OR status NOT IN ('Ativo', 'Respondido');

ALTER TABLE public.prayer_requests
  ALTER COLUMN status SET DEFAULT 'Ativo';

ALTER TABLE public.prayer_requests
  DROP CONSTRAINT IF EXISTS prayer_requests_status_check;

ALTER TABLE public.prayer_requests
  ADD CONSTRAINT prayer_requests_status_check
  CHECK (status IN ('Ativo', 'Respondido'));

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Backfill created_by a partir de user_id quando ausente
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'prayer_requests'
      AND column_name = 'created_by'
  ) THEN
    UPDATE public.prayer_requests
    SET created_by = user_id
    WHERE created_by IS NULL AND user_id IS NOT NULL;
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Demo AD Caxias — Congregação Jardim América (2 Ativo + 1 Respondido)
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.prayer_requests (id, organization_id, title, description, status)
VALUES
  (
    '77777777-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000004',
    'Cura e restauração — Irmã Maria',
    'Pedido de intercessão pela irmã Maria Santos, da Congregação Jardim América (Assembleia de Deus em Caxias do Sul/RS), em recuperação após cirurgia cardíaca. Oremos por cura completa, paz e conforto para ela e sua família.',
    'Ativo'
  ),
  (
    '77777777-0000-0000-0000-000000000002',
    '11111111-0000-0000-0000-000000000004',
    'Provisão para família Souza — Caxias do Sul',
    'O irmão Lucas Souza, membro da Congregação Jardim América em Caxias do Sul/RS, está desempregado há três meses. Intercedamos para que o Senhor abra portas de trabalho e fortaleça a fé dessa família.',
    'Ativo'
  ),
  (
    '77777777-0000-0000-0000-000000000003',
    '11111111-0000-0000-0000-000000000004',
    'Intercessão pelo Congresso de Oração e Missões',
    'Agradecemos as orações pelo Congresso de Oração e Missões da Assembleia de Deus em Caxias do Sul. O evento foi abençoado; mantemos gratidão e pedimos continuidade no chamado missionário da congregação.',
    'Respondido'
  )
ON CONFLICT (id) DO UPDATE SET
  organization_id = EXCLUDED.organization_id,
  title           = EXCLUDED.title,
  description     = EXCLUDED.description,
  status          = EXCLUDED.status;

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. RLS — platform_admin bypass (padrão Assembleia Geral)
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'prayer_requests'
      AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.prayer_requests ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Auth users can view prayer requests" ON public.prayer_requests;
    DROP POLICY IF EXISTS "Auth users can insert prayer requests" ON public.prayer_requests;
    DROP POLICY IF EXISTS "Auth users can update own prayer requests" ON public.prayer_requests;
    DROP POLICY IF EXISTS "Auth users can delete own prayer requests" ON public.prayer_requests;
    DROP POLICY IF EXISTS "Users can view church prayer requests" ON public.prayer_requests;
    DROP POLICY IF EXISTS "Users can insert church prayer requests" ON public.prayer_requests;
    DROP POLICY IF EXISTS "prayer_requests org members read" ON public.prayer_requests;
    DROP POLICY IF EXISTS "prayer_requests org members insert" ON public.prayer_requests;
    DROP POLICY IF EXISTS "prayer_requests org update" ON public.prayer_requests;
    DROP POLICY IF EXISTS "prayer_requests org delete" ON public.prayer_requests;

    -- SELECT: platform admin ou membro da organização
    CREATE POLICY "prayer_requests org members read" ON public.prayer_requests
    FOR SELECT TO authenticated
    USING (
      public.is_platform_admin(auth.uid())
      OR public.is_org_user(auth.uid(), organization_id)
    );

    -- INSERT: platform admin ou membro (user_id próprio ou nulo)
    CREATE POLICY "prayer_requests org members insert" ON public.prayer_requests
    FOR INSERT TO authenticated
    WITH CHECK (
      public.is_platform_admin(auth.uid())
      OR (
        public.is_org_user(auth.uid(), organization_id)
        AND (user_id IS NULL OR user_id = auth.uid())
      )
    );

    -- UPDATE: platform admin, autor ou staff (inclui leader para marcar respondido)
    CREATE POLICY "prayer_requests org update" ON public.prayer_requests
    FOR UPDATE TO authenticated
    USING (
      public.is_platform_admin(auth.uid())
      OR (
        public.is_org_user(auth.uid(), organization_id)
        AND (
          user_id = auth.uid()
          OR public.has_org_role(
            auth.uid(), organization_id,
            ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
          )
        )
      )
    )
    WITH CHECK (
      public.is_platform_admin(auth.uid())
      OR public.is_org_user(auth.uid(), organization_id)
    );

    -- DELETE: platform admin, autor próprio OU staff sem leader
    CREATE POLICY "prayer_requests org delete" ON public.prayer_requests
    FOR DELETE TO authenticated
    USING (
      public.is_platform_admin(auth.uid())
      OR (
        public.is_org_user(auth.uid(), organization_id)
        AND (
          user_id = auth.uid()
          OR public.has_org_role(
            auth.uid(), organization_id,
            ARRAY['admin', 'church_admin', 'secretary', 'pastor']
          )
        )
      )
    );
  END IF;
END $$;
