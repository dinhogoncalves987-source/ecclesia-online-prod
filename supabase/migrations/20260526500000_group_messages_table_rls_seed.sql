-- Pequenos Grupos: group_messages + members.user_id + RLS + seed demo.
-- Requer: groups, group_members, members, is_platform_admin(), is_org_user(), has_org_role().

-- ── members.user_id (ponte opcional auth ↔ cadastro pastoral) ─────────────────
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_members_org_user_id
  ON public.members(organization_id, user_id)
  WHERE user_id IS NOT NULL;

-- ── Helpers: participante e staff do grupo ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_group_participant(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members gm
    INNER JOIN public.members m ON m.id = gm.member_id
    WHERE gm.group_id = _group_id
      AND m.user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_message_staff(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.groups g
    WHERE g.id = _group_id
      AND public.has_org_role(
        _user_id, g.organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
  );
$$;

-- ── group_messages: DDL ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.group_messages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        uuid        NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  author_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body            text        NOT NULL CHECK (char_length(trim(body)) > 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_messages_group_created
  ON public.group_messages(group_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_group_messages_author_user_id
  ON public.group_messages(author_user_id);

-- ── group_messages: RLS ──────────────────────────────────────────────────────
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "group_messages read" ON public.group_messages;
CREATE POLICY "group_messages read" ON public.group_messages
FOR SELECT TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR public.is_group_message_staff(auth.uid(), group_id)
  OR public.is_group_participant(auth.uid(), group_id)
);

DROP POLICY IF EXISTS "group_messages insert" ON public.group_messages;
CREATE POLICY "group_messages insert" ON public.group_messages
FOR INSERT TO authenticated
WITH CHECK (
  author_user_id = auth.uid()
  AND (
    public.is_platform_admin(auth.uid())
    OR public.is_group_message_staff(auth.uid(), group_id)
    OR public.is_group_participant(auth.uid(), group_id)
  )
);

DROP POLICY IF EXISTS "group_messages update" ON public.group_messages;
CREATE POLICY "group_messages update" ON public.group_messages
FOR UPDATE TO authenticated
USING (
  author_user_id = auth.uid()
  OR public.is_platform_admin(auth.uid())
  OR public.is_group_message_staff(auth.uid(), group_id)
)
WITH CHECK (
  author_user_id = auth.uid()
  OR public.is_platform_admin(auth.uid())
  OR public.is_group_message_staff(auth.uid(), group_id)
);

DROP POLICY IF EXISTS "group_messages delete" ON public.group_messages;
CREATE POLICY "group_messages delete" ON public.group_messages
FOR DELETE TO authenticated
USING (
  author_user_id = auth.uid()
  OR public.is_platform_admin(auth.uid())
  OR public.is_group_message_staff(auth.uid(), group_id)
);

-- ── Demo seed: mensagens (somente se houver usuário em profiles) ───────────────
DO $$
DECLARE
  v_user_id      uuid;
  v_group_jovens uuid := '66666666-0000-0000-0000-000000000001';
  v_group_casais uuid := '66666666-0000-0000-0000-000000000002';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.groups WHERE id = v_group_jovens) THEN
    RAISE NOTICE 'group_messages seed skipped: demo group not found';
    RETURN;
  END IF;

  SELECT user_id INTO v_user_id FROM public.profiles LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'group_messages seed skipped: no profile user for author_user_id';
    RETURN;
  END IF;

  INSERT INTO public.group_messages (id, group_id, author_user_id, body, created_at)
  VALUES
    (
      '99999999-0000-0000-0000-000000000001',
      v_group_jovens,
      v_user_id,
      'Bem-vindos ao grupo Jovens Resgate! Neste sábado teremos estudo sobre missões urbanas.',
      now() - interval '3 days'
    ),
    (
      '99999999-0000-0000-0000-000000000002',
      v_group_jovens,
      v_user_id,
      'Lembrem-se de convidar um amigo para o encontro da próxima semana.',
      now() - interval '1 day'
    ),
    (
      '99999999-0000-0000-0000-000000000003',
      v_group_casais,
      v_user_id,
      'Casais Ágape: nosso próximo encontro será sobre Efésios 5. Tragam o caderno de anotações.',
      now() - interval '2 days'
    ),
    (
      '99999999-0000-0000-0000-000000000004',
      v_group_casais,
      v_user_id,
      'Oremos juntos pelas famílias da congregação que estão passando por desafios.',
      now() - interval '12 hours'
    )
  ON CONFLICT (id) DO NOTHING;
END $$;
