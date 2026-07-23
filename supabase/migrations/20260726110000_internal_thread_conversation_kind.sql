-- Identidade e privacidade das conversas internas.
-- Separa caixa institucional, atendimento secretaria↔membro e conversa
-- privada membro↔membro sem alterar as threads contextuais de campanhas.

BEGIN;

ALTER TABLE public.internal_threads
  ADD COLUMN IF NOT EXISTS conversation_kind text;

UPDATE public.internal_threads t
SET conversation_kind = CASE
  WHEN t.source = 'secretariat' AND t.member_id IS NULL
    THEN 'institutional'
  WHEN t.source = 'secretariat'
    AND t.member_id IS NOT NULL
    AND public.is_internal_message_staff(t.created_by, t.organization_id)
    THEN 'staff_member'
  WHEN t.source = 'secretariat' AND t.member_id IS NOT NULL
    THEN 'member_direct'
  ELSE 'contextual'
END
WHERE t.conversation_kind IS NULL;

ALTER TABLE public.internal_threads
  ALTER COLUMN conversation_kind SET DEFAULT 'contextual',
  ALTER COLUMN conversation_kind SET NOT NULL;

ALTER TABLE public.internal_threads
  DROP CONSTRAINT IF EXISTS internal_threads_conversation_kind_check;

ALTER TABLE public.internal_threads
  ADD CONSTRAINT internal_threads_conversation_kind_check
  CHECK (conversation_kind IN ('contextual', 'institutional', 'staff_member', 'member_direct'));

CREATE INDEX IF NOT EXISTS idx_internal_threads_conversation_kind
  ON public.internal_threads(organization_id, conversation_kind, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_internal_threads_staff_member
  ON public.internal_threads(organization_id, member_id, last_message_at DESC)
  WHERE conversation_kind = 'staff_member';

CREATE INDEX IF NOT EXISTS idx_internal_threads_member_direct
  ON public.internal_threads(organization_id, created_by, member_id, last_message_at DESC)
  WHERE conversation_kind = 'member_direct';

CREATE OR REPLACE FUNCTION public.can_read_internal_thread(
  _user_id uuid,
  _thread_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.internal_threads t
    LEFT JOIN public.members target ON target.id = t.member_id
    WHERE t.id = _thread_id
      AND (
        public.is_platform_admin(_user_id)
        OR (
          t.conversation_kind = 'member_direct'
          AND (t.created_by = _user_id OR target.user_id = _user_id)
        )
        OR (
          t.conversation_kind <> 'member_direct'
          AND (
            public.is_internal_message_staff(_user_id, t.organization_id)
            OR t.created_by = _user_id
            OR target.user_id = _user_id
            OR (
              t.source = 'campaign'
              AND public.is_org_user(_user_id, t.organization_id)
            )
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_send_on_internal_thread(
  _user_id uuid,
  _thread_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.internal_threads t
    LEFT JOIN public.members target ON target.id = t.member_id
    WHERE t.id = _thread_id
      AND (
        public.is_platform_admin(_user_id)
        OR (
          t.conversation_kind = 'member_direct'
          AND t.reply_enabled = true
          AND t.status IN ('open', 'pending', 'answered')
          AND public.is_org_user(_user_id, t.organization_id)
          AND (t.created_by = _user_id OR target.user_id = _user_id)
        )
        OR (
          t.conversation_kind <> 'member_direct'
          AND public.is_internal_message_staff(_user_id, t.organization_id)
          AND public.is_org_user(_user_id, t.organization_id)
        )
        OR (
          t.conversation_kind = 'contextual'
          AND t.source = 'campaign'
          AND t.reply_enabled = true
          AND t.status IN ('open', 'pending', 'answered')
          AND public.is_org_user(_user_id, t.organization_id)
          AND public.campaign_allows_replies(t.campaign_id)
        )
        OR (
          t.conversation_kind <> 'member_direct'
          AND t.source <> 'campaign'
          AND t.reply_enabled = true
          AND t.status IN ('open', 'pending', 'answered')
          AND public.is_internal_thread_owner(_user_id, t.id)
          AND public.is_org_user(_user_id, t.organization_id)
        )
      )
  );
$$;

DROP POLICY IF EXISTS "internal threads org read" ON public.internal_threads;
CREATE POLICY "internal threads org read" ON public.internal_threads
FOR SELECT TO authenticated
USING (
  (
    conversation_kind = 'member_direct'
    AND (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.members target
        WHERE target.id = internal_threads.member_id
          AND target.user_id = auth.uid()
      )
    )
  )
  OR (
    conversation_kind <> 'member_direct'
    AND (
      public.is_internal_message_staff(auth.uid(), organization_id)
      OR created_by = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.members target
        WHERE target.id = internal_threads.member_id
          AND target.user_id = auth.uid()
      )
      OR (
        source = 'campaign'
        AND public.is_org_user(auth.uid(), organization_id)
      )
    )
  )
);

DROP POLICY IF EXISTS "internal threads member insert" ON public.internal_threads;
CREATE POLICY "internal threads member insert" ON public.internal_threads
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND public.is_org_user(auth.uid(), organization_id)
  AND reply_enabled = true
  AND (
    (
      conversation_kind = 'member_direct'
      AND source = 'secretariat'
      AND member_id IS NOT NULL
      AND NOT public.is_internal_message_staff(auth.uid(), organization_id)
      AND EXISTS (
        SELECT 1
        FROM public.members target
        WHERE target.id = internal_threads.member_id
          AND target.organization_id = internal_threads.organization_id
          AND target.user_id IS NOT NULL
          AND target.user_id <> auth.uid()
      )
    )
    OR (
      conversation_kind = 'contextual'
      AND source = 'campaign'
      AND campaign_id IS NOT NULL
      AND public.campaign_allows_replies(campaign_id)
      AND EXISTS (
        SELECT 1
        FROM public.campaigns c
        WHERE c.id = internal_threads.campaign_id
          AND c.organization_id = internal_threads.organization_id
      )
    )
  )
);

CREATE OR REPLACE FUNCTION public.internal_thread_notification_recipients(
  _thread_id uuid,
  _sender_user_id uuid
) RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH thread_data AS (
    SELECT
      t.organization_id,
      t.created_by,
      t.conversation_kind,
      target.user_id AS target_user_id
    FROM public.internal_threads t
    LEFT JOIN public.members target ON target.id = t.member_id
    WHERE t.id = _thread_id
  ),
  staff AS (
    SELECT ur.user_id
    FROM public.user_roles ur
    JOIN thread_data t ON t.organization_id = ur.organization_id
    WHERE ur.role IN ('admin', 'church_admin', 'pastor', 'secretary', 'leader', 'tesoureiro')
  ),
  candidates AS (
    SELECT created_by AS user_id
    FROM thread_data
    WHERE conversation_kind IN ('member_direct', 'institutional')

    UNION

    SELECT target_user_id AS user_id
    FROM thread_data
    WHERE conversation_kind IN ('member_direct', 'staff_member', 'contextual')

    UNION

    SELECT staff.user_id
    FROM staff, thread_data
    WHERE thread_data.conversation_kind <> 'member_direct'
  )
  SELECT DISTINCT candidates.user_id
  FROM candidates
  WHERE candidates.user_id IS NOT NULL
    AND candidates.user_id IS DISTINCT FROM _sender_user_id;
$$;

COMMENT ON COLUMN public.internal_threads.conversation_kind IS
  'contextual, institutional, staff_member ou member_direct; controla identidade, visibilidade e destinatários.';

COMMIT;
