-- Ecclesia Chat: Conversa única por campanha.
-- Substitui modelo CRM (uma thread por membro) por thread compartilhada por campanha.
-- Deduplicação segura para staging: mantém thread mais antiga e reassocia mensagens.

-- ---------------------------------------------------------------------------
-- 1. Deduplicar threads existentes por campanha
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  dup_campaign_id uuid;
  keeper_id       uuid;
BEGIN
  FOR dup_campaign_id IN
    SELECT campaign_id
    FROM   public.internal_threads
    WHERE  campaign_id IS NOT NULL
      AND  source = 'campaign'
    GROUP  BY campaign_id
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO keeper_id
    FROM   public.internal_threads
    WHERE  campaign_id = dup_campaign_id
      AND  source = 'campaign'
    ORDER  BY created_at ASC
    LIMIT  1;

    UPDATE public.internal_messages
       SET thread_id = keeper_id
     WHERE thread_id IN (
       SELECT id FROM public.internal_threads
       WHERE campaign_id = dup_campaign_id
         AND source = 'campaign'
         AND id <> keeper_id
     );

    UPDATE public.internal_message_attachments
       SET thread_id = keeper_id
     WHERE thread_id IN (
       SELECT id FROM public.internal_threads
       WHERE campaign_id = dup_campaign_id
         AND source = 'campaign'
         AND id <> keeper_id
     );

    DELETE FROM public.internal_threads
     WHERE campaign_id = dup_campaign_id
       AND source = 'campaign'
       AND id <> keeper_id;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Substituir índice único: de (campaign_id, created_by) para (campaign_id)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS uniq_internal_threads_campaign_creator;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_internal_threads_campaign_single
  ON public.internal_threads(campaign_id)
  WHERE campaign_id IS NOT NULL AND source = 'campaign';

-- ---------------------------------------------------------------------------
-- 3. Atualizar can_read_internal_thread: membros leem threads de campanha da org
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_read_internal_thread(
  _user_id        uuid,
  _thread_id      uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.internal_threads t
    WHERE  t.id = _thread_id
      AND  (
        public.is_platform_admin(_user_id)
        OR public.is_internal_message_staff(_user_id, t.organization_id)
        OR t.created_by = _user_id
        OR EXISTS (
          SELECT 1 FROM public.members m
          WHERE  m.id = t.member_id AND m.user_id = _user_id
        )
        OR (
          -- Campanha: qualquer membro da organização pode ler
          t.source = 'campaign'
          AND public.is_org_user(_user_id, t.organization_id)
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Atualizar can_send_on_internal_thread: membros enviam em thread compartilhada
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_send_on_internal_thread(
  _user_id        uuid,
  _thread_id      uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.internal_threads t
    WHERE  t.id = _thread_id
      AND  (
        public.is_platform_admin(_user_id)
        OR (
          -- Staff pode enviar sempre (mesmo thread fechada / replies desabilitados)
          public.is_internal_message_staff(_user_id, t.organization_id)
          AND public.is_org_user(_user_id, t.organization_id)
        )
        OR (
          -- Campanha compartilhada: qualquer membro org pode enviar se permitido
          t.source = 'campaign'
          AND t.reply_enabled = true
          AND t.status IN ('open', 'pending', 'answered')
          AND public.is_org_user(_user_id, t.organization_id)
          AND public.campaign_allows_replies(t.campaign_id)
        )
        OR (
          -- Outros contextos (não campanha): dono da thread
          t.source <> 'campaign'
          AND t.reply_enabled = true
          AND t.status IN ('open', 'pending', 'answered')
          AND public.is_internal_thread_owner(_user_id, t.id)
          AND public.is_org_user(_user_id, t.organization_id)
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. Atualizar policy de SELECT em internal_threads
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "internal threads org read" ON public.internal_threads;
CREATE POLICY "internal threads org read" ON public.internal_threads
FOR SELECT TO authenticated
USING (
  public.is_internal_message_staff(auth.uid(), organization_id)
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.members m
    WHERE  m.id = internal_threads.member_id AND m.user_id = auth.uid()
  )
  OR (
    -- Campanha: qualquer membro da organização pode ler a thread compartilhada
    source = 'campaign'
    AND public.is_org_user(auth.uid(), organization_id)
  )
);

-- ---------------------------------------------------------------------------
-- 6. Atualizar policy de INSERT em internal_threads
--    Staff e membros (se permitido) podem criar a thread compartilhada.
--    created_by continua gravado como metadado do criador.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "internal threads member insert" ON public.internal_threads;
CREATE POLICY "internal threads member insert" ON public.internal_threads
FOR INSERT TO authenticated
WITH CHECK (
  public.is_org_user(auth.uid(), organization_id)
  AND (
    public.is_internal_message_staff(auth.uid(), organization_id)
    OR (
      reply_enabled = true
      AND (
        campaign_id IS NULL
        OR public.campaign_allows_replies(campaign_id)
      )
    )
  )
  AND (
    campaign_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE  c.id = campaign_id AND c.organization_id = organization_id
    )
  )
);
