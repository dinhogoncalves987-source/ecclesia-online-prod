-- Pequenos Grupos: tabela group_members + RLS org-scoped + seed demo pastoral.
-- Requer: public.groups, public.members, is_platform_admin(), is_org_user(), has_org_role().

-- ── group_members: DDL ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.group_members (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid        NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  member_id   uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  role        text        NOT NULL DEFAULT 'member'
    CHECK (role IN ('member', 'leader', 'co_leader')),
  joined_at   timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group_id
  ON public.group_members(group_id);

CREATE INDEX IF NOT EXISTS idx_group_members_member_id
  ON public.group_members(member_id);

CREATE INDEX IF NOT EXISTS idx_group_members_role
  ON public.group_members(role);

-- ── group_members: RLS ───────────────────────────────────────────────────────
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "group_members org read" ON public.group_members;
CREATE POLICY "group_members org read" ON public.group_members
FOR SELECT TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.groups g
    WHERE g.id = group_members.group_id
      AND public.is_org_user(auth.uid(), g.organization_id)
  )
);

DROP POLICY IF EXISTS "group_members org staff insert" ON public.group_members;
CREATE POLICY "group_members org staff insert" ON public.group_members
FOR INSERT TO authenticated
WITH CHECK (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.groups g
    WHERE g.id = group_members.group_id
      AND public.has_org_role(
        auth.uid(), g.organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
  )
);

DROP POLICY IF EXISTS "group_members org staff update" ON public.group_members;
CREATE POLICY "group_members org staff update" ON public.group_members
FOR UPDATE TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.groups g
    WHERE g.id = group_members.group_id
      AND public.has_org_role(
        auth.uid(), g.organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
  )
)
WITH CHECK (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.groups g
    WHERE g.id = group_members.group_id
      AND public.has_org_role(
        auth.uid(), g.organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
  )
);

DROP POLICY IF EXISTS "group_members org staff delete" ON public.group_members;
CREATE POLICY "group_members org staff delete" ON public.group_members
FOR DELETE TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.groups g
    WHERE g.id = group_members.group_id
      AND public.has_org_role(
        auth.uid(), g.organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor']
      )
  )
);

-- ── Demo seed: participantes dos pequenos grupos (Congregação Jardim América) ─
DO $$
DECLARE
  v_group_jovens  uuid := '66666666-0000-0000-0000-000000000001';
  v_group_casais  uuid := '66666666-0000-0000-0000-000000000002';
  v_paulo         uuid := '22222222-0000-0000-0000-000000000005';
  v_lucas         uuid := '22222222-0000-0000-0000-000000000009';
  v_beatriz       uuid := '22222222-0000-0000-0000-000000000010';
  v_ana           uuid := '22222222-0000-0000-0000-000000000004';
  v_priscila      uuid := '22222222-0000-0000-0000-000000000014';
  v_ricardo       uuid := '22222222-0000-0000-0000-000000000007';
  v_juliana       uuid := '22222222-0000-0000-0000-000000000008';
  v_carlos        uuid := '22222222-0000-0000-0000-000000000003';
  v_maria         uuid := '22222222-0000-0000-0000-000000000002';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.groups WHERE id = v_group_jovens) THEN
    RAISE NOTICE 'group_members seed skipped: demo group Jovens Resgate not found';
    RETURN;
  END IF;

  -- Sincroniza líder canônico em groups.leader_member_id (coluna já existente).
  UPDATE public.groups
  SET leader_member_id = v_paulo
  WHERE id = v_group_jovens
    AND leader_member_id IS DISTINCT FROM v_paulo;

  UPDATE public.groups
  SET leader_member_id = v_ricardo
  WHERE id = v_group_casais
    AND leader_member_id IS DISTINCT FROM v_ricardo;

  INSERT INTO public.group_members (id, group_id, member_id, role)
  VALUES
    ('88888888-0000-0000-0000-000000000001', v_group_jovens, v_paulo,   'leader'),
    ('88888888-0000-0000-0000-000000000002', v_group_jovens, v_lucas,   'member'),
    ('88888888-0000-0000-0000-000000000003', v_group_jovens, v_beatriz, 'member'),
    ('88888888-0000-0000-0000-000000000004', v_group_jovens, v_ana,     'member'),
    ('88888888-0000-0000-0000-000000000005', v_group_jovens, v_priscila,'member'),
    ('88888888-0000-0000-0000-000000000006', v_group_casais, v_ricardo, 'leader'),
    ('88888888-0000-0000-0000-000000000007', v_group_casais, v_juliana, 'co_leader'),
    ('88888888-0000-0000-0000-000000000008', v_group_casais, v_carlos,  'member'),
    ('88888888-0000-0000-0000-000000000009', v_group_casais, v_maria,   'member')
  ON CONFLICT (id) DO NOTHING;
END $$;
