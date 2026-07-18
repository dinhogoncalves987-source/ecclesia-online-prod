-- ============================================================
-- Migration: status real de entrega/leitura + presença (online/visto por
-- último) para o Chat interno (Ecclesia).
-- Data: 2026-07-18
--
-- Contexto: correção da conversa Chat/Perfil/Chamadas para uso real.
-- Regras aplicadas: sem simulação de status, timestamps reais, migration
-- versionada e idempotente, sem alteração manual de dados.
--
-- O que esta migration adiciona:
--   1. internal_messages.delivered_at — timestamp real de quando a
--      mensagem foi entregue ao(s) destinatário(s) (cliente carregou a
--      thread ou recebeu via Realtime). Antes só existia read_at.
--   2. public.mark_internal_thread_delivered(_thread_id) — SECURITY DEFINER,
--      espelha mark_internal_thread_read mas para "entregue". Chamado pelo
--      cliente do destinatário quando abre a lista/thread ou recebe uma
--      mensagem nova via Realtime.
--   3. mark_internal_thread_read agora também garante delivered_at
--      preenchido (uma mensagem lida sempre foi entregue).
--   4. profiles.last_seen_at — timestamp real da última atividade do
--      usuário (heartbeat client-side). Base para "visto por último".
--   5. public.touch_user_presence() — SECURITY DEFINER, atualiza o
--      last_seen_at do próprio usuário autenticado.
--
-- "Online agora" (presença ao vivo) é implementado via Supabase Realtime
-- Presence (canal efêmero, sem necessidade de tabela) no cliente — ver
-- src/hooks/usePresence.tsx. Não há opção de ocultar online/visto por
-- último/confirmação de leitura, por regra explícita do produto.
--
-- Idempotente e forward-only — seguro para rodar múltiplas vezes.
-- ============================================================

-- 1. Coluna delivered_at -------------------------------------------------
ALTER TABLE public.internal_messages
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

COMMENT ON COLUMN public.internal_messages.delivered_at IS
  'Timestamp real de entrega ao destinatário (cliente carregou a thread ou recebeu via Realtime). NULL = ainda pendente de entrega.';

CREATE INDEX IF NOT EXISTS idx_internal_messages_undelivered
  ON public.internal_messages (thread_id)
  WHERE delivered_at IS NULL;

-- 2. mark_internal_thread_delivered -------------------------------------
CREATE OR REPLACE FUNCTION public.mark_internal_thread_delivered(_thread_id uuid)
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
  SET delivered_at = now()
  WHERE thread_id = _thread_id
    AND delivered_at IS NULL
    AND sender_user_id IS DISTINCT FROM auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_internal_thread_delivered(uuid) TO authenticated;

-- 3. mark_internal_thread_read agora também confirma entrega ------------
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
  SET read_at = now(),
      delivered_at = COALESCE(delivered_at, now())
  WHERE thread_id = _thread_id
    AND read_at IS NULL
    AND sender_user_id IS DISTINCT FROM auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_internal_thread_read(uuid) TO authenticated;

-- 4. profiles.last_seen_at ------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

COMMENT ON COLUMN public.profiles.last_seen_at IS
  'Timestamp real da última atividade conhecida do usuário (heartbeat client-side). Base para "visto por último" no chat. Não pode ser ocultado pelo usuário (regra de produto).';

-- 5. touch_user_presence --------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_user_presence()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles SET last_seen_at = now() WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.touch_user_presence() TO authenticated;

-- ============================================================
-- Verificação final
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'internal_messages' AND column_name = 'delivered_at'
  ) THEN
    RAISE EXCEPTION 'internal_messages.delivered_at não foi criada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_seen_at'
  ) THEN
    RAISE EXCEPTION 'profiles.last_seen_at não foi criada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'mark_internal_thread_delivered'
  ) THEN
    RAISE EXCEPTION 'Função mark_internal_thread_delivered não foi criada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'touch_user_presence'
  ) THEN
    RAISE EXCEPTION 'Função touch_user_presence não foi criada';
  END IF;

  RAISE NOTICE 'Migration chat delivery status + presence: confirmado ✓';
END $$;
