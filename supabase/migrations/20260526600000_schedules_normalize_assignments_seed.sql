-- Escalas (DB-1): normaliza public.schedules, cria schedule_assignments, RLS e seed demo.
-- Compatível com schema remoto confirmado (description, schedule_date timestamptz).
-- Não recria schedules; não apaga dados existentes.
-- Requer: organizations, members, is_platform_admin(), is_org_user(), has_org_role().

-- ══════════════════════════════════════════════════════════════════════════════
-- A) Normalizar public.schedules
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS schedule_time time;

-- Valores nulos → rascunho
UPDATE public.schedules
SET status = 'rascunho'
WHERE status IS NULL;

-- Legado staging (se existir em algum ambiente)
UPDATE public.schedules
SET status = 'rascunho'
WHERE status = 'Pendente';

UPDATE public.schedules
SET status = 'publicada'
WHERE status = 'Confirmado';

-- Qualquer valor fora do domínio novo → rascunho (seguro antes do CHECK)
UPDATE public.schedules
SET status = 'rascunho'
WHERE status NOT IN ('rascunho', 'publicada', 'concluida');

ALTER TABLE public.schedules
  ALTER COLUMN status SET DEFAULT 'rascunho';

ALTER TABLE public.schedules
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.schedules
  DROP CONSTRAINT IF EXISTS schedules_status_check;

ALTER TABLE public.schedules
  ADD CONSTRAINT schedules_status_check
  CHECK (status IN ('rascunho', 'publicada', 'concluida'));

-- ══════════════════════════════════════════════════════════════════════════════
-- B) schedule_assignments: DDL
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.schedule_assignments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid        NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  member_id   uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  role        text        NOT NULL
    CHECK (char_length(trim(role)) > 0),
  status      text        NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'confirmado', 'recusado')),
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, member_id, role)
);

CREATE INDEX IF NOT EXISTS idx_schedule_assignments_schedule_id
  ON public.schedule_assignments(schedule_id);

CREATE INDEX IF NOT EXISTS idx_schedule_assignments_member_id
  ON public.schedule_assignments(member_id);

CREATE INDEX IF NOT EXISTS idx_schedule_assignments_status
  ON public.schedule_assignments(status);

-- Trigger updated_at (só se o helper existir — baseline staging já o define)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    INNER JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'update_updated_at_column'
  ) THEN
    DROP TRIGGER IF EXISTS update_schedule_assignments_updated_at
      ON public.schedule_assignments;
    CREATE TRIGGER update_schedule_assignments_updated_at
    BEFORE UPDATE ON public.schedule_assignments
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  ELSE
    RAISE NOTICE 'update_updated_at_column() not found; schedule_assignments.updated_at trigger skipped';
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- C) Helpers + RLS schedule_assignments
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_schedule_assignee(_user_id uuid, _assignment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.schedule_assignments sa
    INNER JOIN public.members m ON m.id = sa.member_id
    WHERE sa.id = _assignment_id
      AND m.user_id IS NOT NULL
      AND m.user_id = _user_id
  );
$$;

ALTER TABLE public.schedule_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schedule_assignments org read" ON public.schedule_assignments;
CREATE POLICY "schedule_assignments org read" ON public.schedule_assignments
FOR SELECT TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.schedules s
    WHERE s.id = schedule_assignments.schedule_id
      AND public.is_org_user(auth.uid(), s.organization_id)
  )
);

DROP POLICY IF EXISTS "schedule_assignments org staff insert" ON public.schedule_assignments;
CREATE POLICY "schedule_assignments org staff insert" ON public.schedule_assignments
FOR INSERT TO authenticated
WITH CHECK (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.schedules s
    WHERE s.id = schedule_assignments.schedule_id
      AND public.has_org_role(
        auth.uid(), s.organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
  )
);

DROP POLICY IF EXISTS "schedule_assignments org staff update" ON public.schedule_assignments;
CREATE POLICY "schedule_assignments org staff update" ON public.schedule_assignments
FOR UPDATE TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.schedules s
    WHERE s.id = schedule_assignments.schedule_id
      AND public.has_org_role(
        auth.uid(), s.organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
  )
)
WITH CHECK (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.schedules s
    WHERE s.id = schedule_assignments.schedule_id
      AND public.has_org_role(
        auth.uid(), s.organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
  )
);

-- Escalado confirma/recusa a própria linha (requer members.user_id preenchido)
DROP POLICY IF EXISTS "schedule_assignments assignee status update" ON public.schedule_assignments;
CREATE POLICY "schedule_assignments assignee status update" ON public.schedule_assignments
FOR UPDATE TO authenticated
USING (public.is_schedule_assignee(auth.uid(), id))
WITH CHECK (
  public.is_schedule_assignee(auth.uid(), id)
  AND status IN ('confirmado', 'recusado')
);

DROP POLICY IF EXISTS "schedule_assignments org staff delete" ON public.schedule_assignments;
CREATE POLICY "schedule_assignments org staff delete" ON public.schedule_assignments
FOR DELETE TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.schedules s
    WHERE s.id = schedule_assignments.schedule_id
      AND public.has_org_role(
        auth.uid(), s.organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor']
      )
  )
);

-- ══════════════════════════════════════════════════════════════════════════════
-- D) Limpeza policies legadas duplicadas em schedules + recriação org-scoped
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "schedules admins delete" ON public.schedules;
DROP POLICY IF EXISTS "schedules admins insert" ON public.schedules;
DROP POLICY IF EXISTS "schedules admins update" ON public.schedules;
DROP POLICY IF EXISTS "schedules members read" ON public.schedules;

ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schedules org members read" ON public.schedules;
CREATE POLICY "schedules org members read" ON public.schedules
FOR SELECT TO authenticated
USING (public.is_org_user(auth.uid(), organization_id));

DROP POLICY IF EXISTS "schedules org staff insert" ON public.schedules;
CREATE POLICY "schedules org staff insert" ON public.schedules
FOR INSERT TO authenticated
WITH CHECK (
  public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
  )
);

DROP POLICY IF EXISTS "schedules org staff update" ON public.schedules;
CREATE POLICY "schedules org staff update" ON public.schedules
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

DROP POLICY IF EXISTS "schedules org admins delete" ON public.schedules;
CREATE POLICY "schedules org admins delete" ON public.schedules
FOR DELETE TO authenticated
USING (
  public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor']
  )
);

-- ══════════════════════════════════════════════════════════════════════════════
-- E) Seed demo pastoral — Congregação Jardim América
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_org           uuid := '11111111-0000-0000-0000-000000000004';
  v_sched_louvor  uuid := '77777777-0000-0000-0000-000000100001';
  v_sched_recep   uuid := '77777777-0000-0000-0000-000000100002';
  v_sched_inf     uuid := '77777777-0000-0000-0000-000000100003';
  v_sched_midia   uuid := '77777777-0000-0000-0000-000000100004';
  v_maria         uuid := '22222222-0000-0000-0000-000000000002';
  v_carlos        uuid := '22222222-0000-0000-0000-000000000003';
  v_ana           uuid := '22222222-0000-0000-0000-000000000004';
  v_paulo         uuid := '22222222-0000-0000-0000-000000000005';
  v_fernanda      uuid := '22222222-0000-0000-0000-000000000006';
  v_juliana       uuid := '22222222-0000-0000-0000-000000000008';
  v_lucas         uuid := '22222222-0000-0000-0000-000000000009';
  v_beatriz       uuid := '22222222-0000-0000-0000-000000000010';
  v_silvia        uuid := '22222222-0000-0000-0000-000000000012';
  v_andre         uuid := '22222222-0000-0000-0000-000000000013';
  v_priscila      uuid := '22222222-0000-0000-0000-000000000014';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org) THEN
    RAISE NOTICE 'schedules demo seed skipped: org Jardim America not found';
    RETURN;
  END IF;

  INSERT INTO public.schedules (
    id, organization_id, title, description, schedule_date, schedule_time,
    ministry, status, created_at, updated_at
  )
  VALUES
    (
      v_sched_louvor, v_org,
      'Culto de Adoração — Domingo Manhã',
      'Chegar 30 min antes para ensaio.',
      '2026-05-24T10:00:00-03:00'::timestamptz,
      '10:00'::time,
      'Louvor', 'publicada', now(), now()
    ),
    (
      v_sched_recep, v_org,
      'Culto de Adoração — Recepção',
      'Equipe de recepção e acolhimento no culto dominical.',
      '2026-05-24T09:45:00-03:00'::timestamptz,
      '09:45'::time,
      'Recepção', 'publicada', now(), now()
    ),
    (
      v_sched_inf, v_org,
      'EBD — Ministério Infantil',
      'Aguardando confirmação de mais um auxiliar.',
      '2026-05-24T10:00:00-03:00'::timestamptz,
      '10:00'::time,
      'Infantil', 'rascunho', now(), now()
    ),
    (
      v_sched_midia, v_org,
      'Culto de Oração — Quarta',
      'Transmissão ao vivo no culto de oração.',
      '2026-05-27T19:30:00-03:00'::timestamptz,
      '19:30'::time,
      'Mídia', 'publicada', now(), now()
    )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.schedule_assignments (id, schedule_id, member_id, role, status, notes)
  VALUES
    -- Louvor
    ('77777777-0000-0000-0000-000000110001', v_sched_louvor, v_paulo,   'Regente',         'confirmado', NULL),
    ('77777777-0000-0000-0000-000000110002', v_sched_louvor, v_lucas,   'Vocal',           'confirmado', NULL),
    ('77777777-0000-0000-0000-000000110003', v_sched_louvor, v_beatriz, 'Vocal',           'pendente',   NULL),
    ('77777777-0000-0000-0000-000000110004', v_sched_louvor, v_ana,     'Teclado',         'pendente',   NULL),
    -- Recepção
    ('77777777-0000-0000-0000-000000110005', v_sched_recep,  v_maria,   'Recepção',        'confirmado', NULL),
    ('77777777-0000-0000-0000-000000110006', v_sched_recep,  v_carlos,  'Estacionamento',  'confirmado', NULL),
    ('77777777-0000-0000-0000-000000110007', v_sched_recep,  v_silvia,  'Café',            'pendente',   NULL),
    -- Infantil
    ('77777777-0000-0000-0000-000000110008', v_sched_inf,    v_fernanda,'Professor',       'confirmado', NULL),
    ('77777777-0000-0000-0000-000000110009', v_sched_inf,    v_priscila,'Auxiliar',        'pendente',   NULL),
    ('77777777-0000-0000-0000-000000110010', v_sched_inf,    v_juliana, 'Recepção Kids',   'pendente',   NULL),
    -- Mídia
    ('77777777-0000-0000-0000-000000110011', v_sched_midia,  v_andre,   'Som',             'confirmado', NULL),
    ('77777777-0000-0000-0000-000000110012', v_sched_midia,  v_lucas,   'Projeção',        'recusado',   'Conflito de agenda'),
    ('77777777-0000-0000-0000-000000110013', v_sched_midia,  v_ana,     'Transmissão',     'pendente',   NULL)
  ON CONFLICT (id) DO NOTHING;
END $$;
