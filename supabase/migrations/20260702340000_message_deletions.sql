-- =============================================================================
-- Ecclesia Chat Definitivo — Migração 5: Exclusão de Mensagens (WhatsApp-style)
-- =============================================================================
-- Implementa:
--   • "Apagar para mim" — registro por usuário em message_user_deletions
--   • "Apagar para todos" — flag deleted_for_everyone na mensagem
-- Mantém compatibilidade com o soft-delete existente (message_type='deleted').
-- =============================================================================

-- ── Campos de exclusão em internal_messages ──────────────────────────────────

ALTER TABLE public.internal_messages
  ADD COLUMN IF NOT EXISTS deleted_for_everyone boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_by           uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at           timestamptz;

CREATE INDEX IF NOT EXISTS idx_internal_messages_deleted_org
  ON public.internal_messages (organization_id, deleted_for_everyone)
  WHERE deleted_for_everyone = true;

-- ── Tabela "Apagar para mim" ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.message_user_deletions (
  message_id  uuid        NOT NULL REFERENCES public.internal_messages(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id)               ON DELETE CASCADE,
  deleted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_mud_user
  ON public.message_user_deletions (user_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.message_user_deletions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mud_insert_own"
  ON public.message_user_deletions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "mud_select_own"
  ON public.message_user_deletions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "mud_delete_own"
  ON public.message_user_deletions FOR DELETE
  USING (user_id = auth.uid());

-- ── RPC: delete_message_for_everyone ─────────────────────────────────────────
-- Deleta para todos: soft-delete com flag + compatibilidade com message_type.

CREATE OR REPLACE FUNCTION public.delete_message_for_everyone(
  p_message_id     uuid,
  p_organization_id uuid
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_user_id uuid;
  v_role text;
BEGIN
  -- Buscar o remetente e checar se é o autor ou admin
  SELECT sender_user_id INTO v_sender_user_id
  FROM internal_messages
  WHERE id = p_message_id AND organization_id = p_organization_id;

  IF NOT FOUND THEN RETURN false; END IF;

  -- Apenas o remetente ou admin da organização pode apagar para todos
  IF v_sender_user_id <> auth.uid() THEN
    SELECT role INTO v_role
    FROM organization_users
    WHERE organization_id = p_organization_id
      AND user_id = auth.uid()
      AND is_active = true;

    IF v_role NOT IN ('church_admin', 'super_admin') THEN
      -- Checar se é platform admin
      IF NOT EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.user_id = auth.uid()
          AND p.platform_role IN ('super_admin', 'platform_admin')
      ) THEN
        RAISE EXCEPTION 'permission_denied';
      END IF;
    END IF;
  END IF;

  UPDATE internal_messages
  SET
    message_type         = 'deleted',
    body                 = NULL,
    deleted_for_everyone = true,
    deleted_by           = auth.uid(),
    deleted_at           = now()
  WHERE id = p_message_id
    AND organization_id = p_organization_id;

  RETURN FOUND;
END;
$$;

-- ── Comentários ───────────────────────────────────────────────────────────────

COMMENT ON TABLE public.message_user_deletions IS
  'Registra mensagens apagadas apenas para um usuário específico ("Apagar para mim").
   Não afeta os outros participantes da conversa.';

COMMENT ON COLUMN public.internal_messages.deleted_for_everyone IS
  'true quando a mensagem foi apagada para todos os participantes pelo remetente ou admin.';
