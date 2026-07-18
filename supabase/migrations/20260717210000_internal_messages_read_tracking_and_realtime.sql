-- ============================================================
-- Migration: leitura/não-lida (badge) + Realtime para internal_messages
-- Data: 2026-07-17
--
-- Objetivo: dar suporte a "o destinatário não sabe que recebeu mensagem" —
-- hoje a coluna internal_messages.read_at existe desde a migration original
-- (20260609100000) mas nunca foi usada por ninguém (nem RPC, nem policy de
-- UPDATE para quem não é staff). Esta migration:
--
--   1. Cria public.mark_internal_thread_read(_thread_id) — SECURITY DEFINER,
--      permite que QUALQUER participante autorizado da thread (staff, dono
--      ou membro vinculado) marque como lidas as mensagens que não enviou,
--      sem precisar de uma policy de UPDATE ampla em internal_messages
--      (que hoje só permite UPDATE para staff).
--   2. Habilita Realtime em internal_messages, para o app conseguir mostrar
--      contador de não lidas/badge quase instantâneo enquanto o app está
--      aberto (aba em primeiro ou segundo plano) — não substitui push
--      notification real de app fechado, que exigiria infraestrutura de
--      Web Push (VAPID) fora do escopo desta correção.
--   3. Índice parcial para a contagem de não lidas ser rápida.
--
-- Idempotente e forward-only — seguro para rodar múltiplas vezes.
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_internal_thread_read(_thread_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_read_internal_thread(auth.uid(), _thread_id) THEN
    RETURN;
  END IF;

  UPDATE public.internal_messages
  SET read_at = now()
  WHERE thread_id = _thread_id
    AND read_at IS NULL
    AND sender_user_id IS DISTINCT FROM auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_internal_thread_read(uuid) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_internal_messages_unread
  ON public.internal_messages (organization_id)
  WHERE read_at IS NULL;

-- Realtime — idempotente (evita "relation is already member of publication")
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'internal_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_messages;
  END IF;
END $$;

-- ============================================================
-- Verificação final
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'mark_internal_thread_read'
  ) THEN
    RAISE EXCEPTION 'Função mark_internal_thread_read não foi criada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'internal_messages'
  ) THEN
    RAISE EXCEPTION 'internal_messages não foi adicionada à publication supabase_realtime';
  END IF;

  RAISE NOTICE 'Migration internal_messages read tracking + realtime: confirmado ✓';
END $$;
