-- Ecclesia Chat principal: internal_threads, internal_messages, internal_message_attachments.
-- Requires: organizations, campaigns, members, is_platform_admin(), is_org_user(), has_org_role().
--
-- Ordem de execução:
--   1. Tabelas
--   2. Índices
--   3. Trigger updated_at
--   4. Funções helper (referenciam as tabelas acima)
--   5. RLS e policies
--   6. Storage bucket/policies
--   7. Trigger touch_internal_thread_last_message

-- ---------------------------------------------------------------------------
-- 1. internal_threads
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.internal_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  source text NOT NULL DEFAULT 'general',
  reply_enabled boolean NOT NULL DEFAULT true,
  last_message_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT internal_threads_status_check CHECK (
    status IN ('open', 'pending', 'answered', 'closed')
  ),
  CONSTRAINT internal_threads_source_check CHECK (
    source IN ('campaign', 'community', 'group', 'pastoral', 'finance', 'secretariat', 'prayer', 'general')
  )
);

CREATE INDEX IF NOT EXISTS idx_internal_threads_org_last_message
  ON public.internal_threads(organization_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_internal_threads_org_source
  ON public.internal_threads(organization_id, source);

CREATE INDEX IF NOT EXISTS idx_internal_threads_campaign
  ON public.internal_threads(campaign_id)
  WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_internal_threads_created_by
  ON public.internal_threads(created_by)
  WHERE created_by IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_internal_threads_campaign_creator
  ON public.internal_threads(campaign_id, created_by)
  WHERE campaign_id IS NOT NULL AND created_by IS NOT NULL;

DROP TRIGGER IF EXISTS update_internal_threads_updated_at ON public.internal_threads;
CREATE TRIGGER update_internal_threads_updated_at
BEFORE UPDATE ON public.internal_threads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. internal_messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.internal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.internal_threads(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sender_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  sender_role text,
  body text,
  message_type text NOT NULL DEFAULT 'text',
  reply_to_message_id uuid REFERENCES public.internal_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT internal_messages_type_check CHECK (
    message_type IN ('text', 'image', 'audio', 'video', 'document', 'system')
  ),
  CONSTRAINT internal_messages_body_or_attachment CHECK (
    body IS NOT NULL OR message_type <> 'text'
  )
);

CREATE INDEX IF NOT EXISTS idx_internal_messages_thread_created
  ON public.internal_messages(thread_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_internal_messages_org_created
  ON public.internal_messages(organization_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. internal_message_attachments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.internal_message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.internal_messages(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.internal_threads(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  storage_bucket text NOT NULL DEFAULT 'internal-message-media',
  storage_path text NOT NULL,
  public_url text,
  file_name text,
  file_type text,
  file_size bigint,
  duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_internal_message_attachments_message
  ON public.internal_message_attachments(message_id);

CREATE INDEX IF NOT EXISTS idx_internal_message_attachments_thread
  ON public.internal_message_attachments(thread_id);

-- ---------------------------------------------------------------------------
-- 4. Funções helper (referenciam internal_threads — devem vir após a tabela)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_internal_message_staff(
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

CREATE OR REPLACE FUNCTION public.is_internal_thread_owner(
  _user_id uuid,
  _thread_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.internal_threads t
    WHERE t.id = _thread_id
      AND (
        t.created_by = _user_id
        OR EXISTS (
          SELECT 1
          FROM public.members m
          WHERE m.id = t.member_id
            AND m.user_id = _user_id
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_internal_thread(
  _user_id uuid,
  _thread_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.internal_threads t
    WHERE t.id = _thread_id
      AND (
        public.is_platform_admin(_user_id)
        OR public.is_internal_message_staff(_user_id, t.organization_id)
        OR t.created_by = _user_id
        OR EXISTS (
          SELECT 1
          FROM public.members m
          WHERE m.id = t.member_id
            AND m.user_id = _user_id
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.campaign_allows_replies(_campaign_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT c.allow_replies FROM public.campaigns c WHERE c.id = _campaign_id),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.can_send_on_internal_thread(
  _user_id uuid,
  _thread_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.internal_threads t
    WHERE t.id = _thread_id
      AND (
        public.is_platform_admin(_user_id)
        OR (
          public.is_internal_message_staff(_user_id, t.organization_id)
          AND public.is_org_user(_user_id, t.organization_id)
        )
        OR (
          t.reply_enabled = true
          AND t.status IN ('open', 'pending', 'answered')
          AND public.is_internal_thread_owner(_user_id, t.id)
          AND public.is_org_user(_user_id, t.organization_id)
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS — internal_threads
-- ---------------------------------------------------------------------------
ALTER TABLE public.internal_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "internal threads platform admin all" ON public.internal_threads;
CREATE POLICY "internal threads platform admin all" ON public.internal_threads
FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "internal threads org read" ON public.internal_threads;
CREATE POLICY "internal threads org read" ON public.internal_threads
FOR SELECT TO authenticated
USING (
  public.is_internal_message_staff(auth.uid(), organization_id)
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.id = internal_threads.member_id
      AND m.user_id = auth.uid()
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
    campaign_id IS NULL
    OR (
      public.campaign_allows_replies(campaign_id)
      AND EXISTS (
        SELECT 1
        FROM public.campaigns c
        WHERE c.id = campaign_id
          AND c.organization_id = organization_id
      )
    )
  )
);

DROP POLICY IF EXISTS "internal threads staff insert" ON public.internal_threads;
CREATE POLICY "internal threads staff insert" ON public.internal_threads
FOR INSERT TO authenticated
WITH CHECK (public.is_internal_message_staff(auth.uid(), organization_id));

DROP POLICY IF EXISTS "internal threads staff update" ON public.internal_threads;
CREATE POLICY "internal threads staff update" ON public.internal_threads
FOR UPDATE TO authenticated
USING (public.is_internal_message_staff(auth.uid(), organization_id))
WITH CHECK (public.is_internal_message_staff(auth.uid(), organization_id));

-- ---------------------------------------------------------------------------
-- 6. RLS — internal_messages
-- ---------------------------------------------------------------------------
ALTER TABLE public.internal_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "internal messages platform admin all" ON public.internal_messages;
CREATE POLICY "internal messages platform admin all" ON public.internal_messages
FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "internal messages thread read" ON public.internal_messages;
CREATE POLICY "internal messages thread read" ON public.internal_messages
FOR SELECT TO authenticated
USING (public.can_read_internal_thread(auth.uid(), thread_id));

DROP POLICY IF EXISTS "internal messages thread insert" ON public.internal_messages;
CREATE POLICY "internal messages thread insert" ON public.internal_messages
FOR INSERT TO authenticated
WITH CHECK (
  public.can_send_on_internal_thread(auth.uid(), thread_id)
  AND (
    sender_user_id IS NULL
    OR sender_user_id = auth.uid()
  )
  AND organization_id = (
    SELECT t.organization_id FROM public.internal_threads t WHERE t.id = thread_id
  )
);

DROP POLICY IF EXISTS "internal messages staff update" ON public.internal_messages;
CREATE POLICY "internal messages staff update" ON public.internal_messages
FOR UPDATE TO authenticated
USING (
  public.is_internal_message_staff(
    auth.uid(),
    organization_id
  )
)
WITH CHECK (
  public.is_internal_message_staff(
    auth.uid(),
    organization_id
  )
);

DROP POLICY IF EXISTS "internal messages staff delete" ON public.internal_messages;
CREATE POLICY "internal messages staff delete" ON public.internal_messages
FOR DELETE TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR public.is_internal_message_staff(auth.uid(), organization_id)
);

-- ---------------------------------------------------------------------------
-- 7. RLS — internal_message_attachments
-- ---------------------------------------------------------------------------
ALTER TABLE public.internal_message_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "internal attachments platform admin all" ON public.internal_message_attachments;
CREATE POLICY "internal attachments platform admin all" ON public.internal_message_attachments
FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "internal attachments thread read" ON public.internal_message_attachments;
CREATE POLICY "internal attachments thread read" ON public.internal_message_attachments
FOR SELECT TO authenticated
USING (public.can_read_internal_thread(auth.uid(), thread_id));

DROP POLICY IF EXISTS "internal attachments thread insert" ON public.internal_message_attachments;
CREATE POLICY "internal attachments thread insert" ON public.internal_message_attachments
FOR INSERT TO authenticated
WITH CHECK (
  public.can_send_on_internal_thread(auth.uid(), thread_id)
  AND (
    uploaded_by IS NULL
    OR uploaded_by = auth.uid()
  )
  AND organization_id = (
    SELECT t.organization_id FROM public.internal_threads t WHERE t.id = thread_id
  )
);

DROP POLICY IF EXISTS "internal attachments staff delete" ON public.internal_message_attachments;
CREATE POLICY "internal attachments staff delete" ON public.internal_message_attachments
FOR DELETE TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR public.is_internal_message_staff(auth.uid(), organization_id)
);

-- ---------------------------------------------------------------------------
-- 8. Storage bucket — internal-message-media
-- Staging/demo: bucket público (leitura autenticada). V2/produção: bucket privado + signed URLs.
-- Path obrigatório: {organization_id}/{thread_id}/{filename}
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('internal-message-media', 'internal-message-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "internal message media storage select" ON storage.objects;
CREATE POLICY "internal message media storage select" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'internal-message-media');

DROP POLICY IF EXISTS "internal message media storage insert" ON storage.objects;
CREATE POLICY "internal message media storage insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'internal-message-media'
  AND (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.organization_users ou
      WHERE ou.user_id = auth.uid()
        AND COALESCE(ou.is_active, true) = true
        AND ou.role IN ('admin', 'church_admin', 'leader', 'tesoureiro')
        AND ou.organization_id::text = split_part(name, '/', 1)
    )
    OR EXISTS (
      SELECT 1
      FROM public.internal_threads t
      WHERE t.organization_id::text = split_part(name, '/', 1)
        AND t.id::text = split_part(name, '/', 2)
        AND public.is_internal_thread_owner(auth.uid(), t.id)
    )
  )
);

DROP POLICY IF EXISTS "internal message media storage delete" ON storage.objects;
CREATE POLICY "internal message media storage delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'internal-message-media'
  AND (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.organization_users ou
      WHERE ou.user_id = auth.uid()
        AND COALESCE(ou.is_active, true) = true
        AND ou.role IN ('admin', 'church_admin', 'leader', 'tesoureiro')
        AND ou.organization_id::text = split_part(name, '/', 1)
    )
  )
);

-- ---------------------------------------------------------------------------
-- 9. Trigger — atualizar last_message_at ao inserir mensagem
-- Status: closed permanece closed; staff (sender_user_id ou sender_role) → answered; demais → pending.
-- Não usa auth.uid() — seguro em SECURITY DEFINER e inserts via service role (seed).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_internal_thread_last_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_staff boolean := false;
BEGIN
  IF NEW.sender_user_id IS NOT NULL THEN
    v_is_staff := public.is_internal_message_staff(NEW.sender_user_id, NEW.organization_id);
  END IF;

  IF NOT v_is_staff AND NEW.sender_role IS NOT NULL THEN
    v_is_staff := NEW.sender_role IN ('admin', 'church_admin', 'leader', 'tesoureiro', 'secretary', 'pastor');
  END IF;

  UPDATE public.internal_threads
  SET last_message_at = NEW.created_at,
      updated_at = now(),
      status = CASE
        WHEN status = 'closed' THEN status
        WHEN v_is_staff THEN 'answered'
        ELSE 'pending'
      END
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS internal_messages_touch_thread ON public.internal_messages;
CREATE TRIGGER internal_messages_touch_thread
AFTER INSERT ON public.internal_messages
FOR EACH ROW EXECUTE FUNCTION public.touch_internal_thread_last_message();
