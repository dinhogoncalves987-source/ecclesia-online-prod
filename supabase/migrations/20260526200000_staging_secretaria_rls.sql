-- Secretaria: RLS org-scoped para membros, comunicação, grupos, orações e assembleias.
-- Amplia delete em documents para secretary/pastor.
-- Relaxa CHECK de status em members para demo pastoral.

-- ── members: status ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'members'
  ) THEN
    ALTER TABLE public.members DROP CONSTRAINT IF EXISTS members_status_check;
    BEGIN
      ALTER TABLE public.members
        ADD CONSTRAINT members_status_check
        CHECK (status IN (
          'Ativo', 'Inativo', 'Disciplinado', 'Transferido', 'Falecido', 'Visitante'
        ));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- ── members: RLS ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'members' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Authenticated users can view all members" ON public.members;
    DROP POLICY IF EXISTS "Authenticated users can insert members" ON public.members;
    DROP POLICY IF EXISTS "Authenticated users can update own members" ON public.members;
    DROP POLICY IF EXISTS "Authenticated users can delete own members" ON public.members;
    DROP POLICY IF EXISTS "Users can view church members" ON public.members;
    DROP POLICY IF EXISTS "Users can insert church members" ON public.members;
    DROP POLICY IF EXISTS "members org members read" ON public.members;
    DROP POLICY IF EXISTS "members org staff insert" ON public.members;
    DROP POLICY IF EXISTS "members org staff update" ON public.members;
    DROP POLICY IF EXISTS "members org staff delete" ON public.members;

    CREATE POLICY "members org members read" ON public.members
    FOR SELECT TO authenticated
    USING (public.is_org_user(auth.uid(), organization_id));

    CREATE POLICY "members org staff insert" ON public.members
    FOR INSERT TO authenticated
    WITH CHECK (
      public.has_org_role(
        auth.uid(), organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
    );

    CREATE POLICY "members org staff update" ON public.members
    FOR UPDATE TO authenticated
    USING (
      public.has_org_role(
        auth.uid(), organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
    )
    WITH CHECK (
      public.has_org_role(
        auth.uid(), organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
    );

    CREATE POLICY "members org staff delete" ON public.members
    FOR DELETE TO authenticated
    USING (
      public.has_org_role(
        auth.uid(), organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor']
      )
    );
  END IF;
END $$;

-- ── communications: RLS ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'communications' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "communications org members read" ON public.communications;
    DROP POLICY IF EXISTS "communications org staff insert" ON public.communications;
    DROP POLICY IF EXISTS "communications org staff update" ON public.communications;
    DROP POLICY IF EXISTS "communications org staff delete" ON public.communications;

    CREATE POLICY "communications org members read" ON public.communications
    FOR SELECT TO authenticated
    USING (public.is_org_user(auth.uid(), organization_id));

    CREATE POLICY "communications org staff insert" ON public.communications
    FOR INSERT TO authenticated
    WITH CHECK (
      public.has_org_role(
        auth.uid(), organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
    );

    CREATE POLICY "communications org staff update" ON public.communications
    FOR UPDATE TO authenticated
    USING (
      public.has_org_role(
        auth.uid(), organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
    )
    WITH CHECK (
      public.has_org_role(
        auth.uid(), organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
    );

    CREATE POLICY "communications org staff delete" ON public.communications
    FOR DELETE TO authenticated
    USING (
      public.has_org_role(
        auth.uid(), organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor']
      )
    );
  END IF;
END $$;

-- ── groups: RLS ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'groups' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "groups org members read" ON public.groups;
    DROP POLICY IF EXISTS "groups org staff insert" ON public.groups;
    DROP POLICY IF EXISTS "groups org staff update" ON public.groups;
    DROP POLICY IF EXISTS "groups org staff delete" ON public.groups;

    CREATE POLICY "groups org members read" ON public.groups
    FOR SELECT TO authenticated
    USING (public.is_org_user(auth.uid(), organization_id));

    CREATE POLICY "groups org staff insert" ON public.groups
    FOR INSERT TO authenticated
    WITH CHECK (
      public.has_org_role(
        auth.uid(), organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
    );

    CREATE POLICY "groups org staff update" ON public.groups
    FOR UPDATE TO authenticated
    USING (
      public.has_org_role(
        auth.uid(), organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
    )
    WITH CHECK (
      public.has_org_role(
        auth.uid(), organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
    );

    CREATE POLICY "groups org staff delete" ON public.groups
    FOR DELETE TO authenticated
    USING (
      public.has_org_role(
        auth.uid(), organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor']
      )
    );
  END IF;
END $$;

-- ── prayer_requests: RLS ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prayer_requests' AND column_name = 'organization_id'
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

    CREATE POLICY "prayer_requests org members read" ON public.prayer_requests
    FOR SELECT TO authenticated
    USING (public.is_org_user(auth.uid(), organization_id));

    CREATE POLICY "prayer_requests org members insert" ON public.prayer_requests
    FOR INSERT TO authenticated
    WITH CHECK (
      public.is_org_user(auth.uid(), organization_id)
      AND (user_id IS NULL OR user_id = auth.uid())
    );

    CREATE POLICY "prayer_requests org update" ON public.prayer_requests
    FOR UPDATE TO authenticated
    USING (
      public.is_org_user(auth.uid(), organization_id)
      AND (
        user_id = auth.uid()
        OR public.has_org_role(
          auth.uid(), organization_id,
          ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
        )
      )
    )
    WITH CHECK (
      public.is_org_user(auth.uid(), organization_id)
    );

    CREATE POLICY "prayer_requests org delete" ON public.prayer_requests
    FOR DELETE TO authenticated
    USING (
      public.is_org_user(auth.uid(), organization_id)
      AND (
        user_id = auth.uid()
        OR public.has_org_role(
          auth.uid(), organization_id,
          ARRAY['admin', 'church_admin', 'secretary', 'pastor']
        )
      )
    );
  END IF;
END $$;

-- ── assemblies: RLS (organization_id) ───────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assemblies' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.assemblies ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can view visible assemblies or own church" ON public.assemblies;
    DROP POLICY IF EXISTS "Admins can insert assemblies" ON public.assemblies;
    DROP POLICY IF EXISTS "Admins can update own church assemblies" ON public.assemblies;
    DROP POLICY IF EXISTS "Admins can delete own assemblies" ON public.assemblies;
    DROP POLICY IF EXISTS "assemblies org members read" ON public.assemblies;
    DROP POLICY IF EXISTS "assemblies org staff insert" ON public.assemblies;
    DROP POLICY IF EXISTS "assemblies org staff update" ON public.assemblies;
    DROP POLICY IF EXISTS "assemblies org staff delete" ON public.assemblies;

    CREATE POLICY "assemblies org members read" ON public.assemblies
    FOR SELECT TO authenticated
    USING (public.is_org_user(auth.uid(), organization_id));

    CREATE POLICY "assemblies org staff insert" ON public.assemblies
    FOR INSERT TO authenticated
    WITH CHECK (
      public.has_org_role(
        auth.uid(), organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
    );

    CREATE POLICY "assemblies org staff update" ON public.assemblies
    FOR UPDATE TO authenticated
    USING (
      public.has_org_role(
        auth.uid(), organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
    )
    WITH CHECK (
      public.has_org_role(
        auth.uid(), organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
    );

    CREATE POLICY "assemblies org staff delete" ON public.assemblies
    FOR DELETE TO authenticated
    USING (
      public.has_org_role(
        auth.uid(), organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor']
      )
    );
  END IF;
END $$;

-- assembly_attachments: staff via parent assembly org
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'assembly_attachments'
  ) THEN
    ALTER TABLE public.assembly_attachments ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can view assembly attachments" ON public.assembly_attachments;
    DROP POLICY IF EXISTS "assembly_attachments org read" ON public.assembly_attachments;
    DROP POLICY IF EXISTS "assembly_attachments org staff write" ON public.assembly_attachments;
    DROP POLICY IF EXISTS "assembly_attachments org staff delete" ON public.assembly_attachments;

    CREATE POLICY "assembly_attachments org read" ON public.assembly_attachments
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.assemblies a
        WHERE a.id = assembly_id
          AND public.is_org_user(auth.uid(), a.organization_id)
      )
    );

    CREATE POLICY "assembly_attachments org staff insert" ON public.assembly_attachments
    FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.assemblies a
        WHERE a.id = assembly_id
          AND public.has_org_role(
            auth.uid(), a.organization_id,
            ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
          )
      )
    );

    CREATE POLICY "assembly_attachments org staff update" ON public.assembly_attachments
    FOR UPDATE TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.assemblies a
        WHERE a.id = assembly_id
          AND public.has_org_role(
            auth.uid(), a.organization_id,
            ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
          )
      )
    );

    CREATE POLICY "assembly_attachments org staff delete" ON public.assembly_attachments
    FOR DELETE TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.assemblies a
        WHERE a.id = assembly_id
          AND public.has_org_role(
            auth.uid(), a.organization_id,
            ARRAY['admin', 'church_admin', 'secretary', 'pastor']
          )
      )
    );
  END IF;
END $$;

-- documents: allow secretary/pastor to delete
DROP POLICY IF EXISTS "documents org admins delete" ON public.documents;
CREATE POLICY "documents org admins delete" ON public.documents
FOR DELETE TO authenticated
USING (
  public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor']
  )
);

-- Demo: membros Falecido e Transferido (org Jardim América)
INSERT INTO public.members (id, organization_id, full_name, member_role, status, phone, email, city, state, joined_at)
VALUES
  (
    '22222222-0000-0000-0000-000000000016',
    '11111111-0000-0000-0000-000000000004',
    'Antonio Mendes da Silva',
    'Membro',
    'Falecido',
    NULL,
    NULL,
    'Caxias do Sul',
    'RS',
    '1998-04-12'
  ),
  (
    '22222222-0000-0000-0000-000000000017',
    '11111111-0000-0000-0000-000000000004',
    'Helena Costa Ribeiro',
    'Membro',
    'Transferido',
    NULL,
    NULL,
    'Caxias do Sul',
    'RS',
    '2010-07-03'
  )
ON CONFLICT (id) DO NOTHING;
