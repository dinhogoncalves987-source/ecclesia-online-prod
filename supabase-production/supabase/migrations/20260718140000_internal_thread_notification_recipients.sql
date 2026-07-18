-- ============================================================================
-- Migration: internal_thread_notification_recipients
-- Timestamp: 20260718140000
-- ============================================================================
--
-- OBJETIVO
-- Função auxiliar usada pela Edge Function send-chat-push (Web Push) para
-- descobrir, de forma segura e centralizada no banco, QUEM deve ser
-- notificado quando uma nova mensagem chega numa thread de chat interno —
-- sem duplicar a lógica de permissão de public.can_read_internal_thread em
-- código de aplicação.
--
-- REGRA (mesma lógica de participante já usada na UI, ver
-- src/lib/internalMessages.ts):
--   - Se quem enviou é o "participante" (membro, ou quem criou a thread
--     quando não há membro vinculado), os destinatários são a equipe da
--     organização que pode atender a thread (mesmos papéis de
--     is_internal_message_staff: admin/church_admin/leader/tesoureiro).
--   - Se quem enviou é da equipe, o destinatário é o participante (membro
--     ou criador da thread).
--   - O próprio remetente nunca é retornado.
--
-- SECURITY DEFINER porque precisa ler public.user_roles e public.members
-- independente das policies de RLS do chamador — mas só é chamada pela
-- Edge Function com a service role (nunca exposta a "authenticated" como
-- caminho de leitura de dados alheios).
--
-- Idempotente e forward-only.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.internal_thread_notification_recipients(
  _thread_id uuid,
  _sender_user_id uuid
) RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH t AS (
    SELECT
      it.organization_id,
      it.member_id,
      it.created_by,
      m.user_id AS member_user_id
    FROM public.internal_threads it
    LEFT JOIN public.members m ON m.id = it.member_id
    WHERE it.id = _thread_id
  ),
  participant AS (
    SELECT COALESCE(
      (SELECT member_user_id FROM t),
      (SELECT created_by FROM t)
    ) AS user_id
  ),
  candidates AS (
    SELECT ur.user_id
    FROM public.user_roles ur, t
    WHERE ur.organization_id = t.organization_id
      AND ur.role IN ('admin', 'church_admin', 'leader', 'tesoureiro')
    UNION
    SELECT user_id FROM participant WHERE user_id IS NOT NULL
  )
  SELECT DISTINCT c.user_id
  FROM candidates c
  WHERE c.user_id IS NOT NULL
    AND c.user_id IS DISTINCT FROM _sender_user_id;
$$;

COMMENT ON FUNCTION public.internal_thread_notification_recipients(uuid, uuid) IS
  'Usada só pela Edge Function send-chat-push (service role) para decidir quem recebe Web Push de uma mensagem nova — nunca exposta como leitura direta para o cliente.';

-- ============================================================================
-- Verificação final
-- ============================================================================
DO $$
BEGIN
  IF to_regprocedure('public.internal_thread_notification_recipients(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'internal_thread_notification_recipients não foi criada';
  END IF;

  RAISE NOTICE 'Migration internal_thread_notification_recipients: confirmado ✓';
END $$;
