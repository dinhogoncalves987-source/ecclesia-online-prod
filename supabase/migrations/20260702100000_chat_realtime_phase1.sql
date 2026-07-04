-- =============================================================================
-- Ecclesia Chat — Fase 1: Realtime + Correção de Constraints
-- =============================================================================
-- Ambiente: TESTE apenas.
-- NÃO aplicar em produção sem revisão e aprovação explícita.
--
-- O que esta migration faz:
--   1. Publica internal_messages e internal_threads no Supabase Realtime
--   2. Corrige CHECK constraint de message_type (adiciona 'deleted', 'call', 'location')
--   3. Corrige CHECK constraint de source   (adiciona 'direct', 'ministry', 'broadcast', 'support')
--   4. Cria índice composto para queries de mensagens por thread
-- =============================================================================

-- ── 1. Supabase Realtime Publication ─────────────────────────────────────────
-- Usa DO/EXCEPTION para ser idempotente — não falha se a tabela já estiver publicada.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_messages;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'internal_messages já está na publicação supabase_realtime — ignorando.';
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_threads;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'internal_threads já está na publicação supabase_realtime — ignorando.';
END $$;

-- ── 2. Corrigir CHECK constraint de message_type ─────────────────────────────
-- Adiciona: 'deleted' (soft-delete), 'call' (evento de chamada), 'location'
-- Remove e recria para ser idempotente.

ALTER TABLE public.internal_messages
  DROP CONSTRAINT IF EXISTS internal_messages_type_check;

ALTER TABLE public.internal_messages
  ADD CONSTRAINT internal_messages_type_check
    CHECK (message_type IN (
      'text',
      'image',
      'audio',
      'video',
      'document',
      'system',
      'deleted',
      'call',
      'location'
    ));

-- ── 3. Corrigir CHECK constraint de source em internal_threads ───────────────
-- Adiciona: 'direct' (DM 1:1), 'ministry' (grupo de ministério),
--           'broadcast' (avisos unidirecionais), 'support' (suporte plataforma)
-- Remove e recria para ser idempotente.

ALTER TABLE public.internal_threads
  DROP CONSTRAINT IF EXISTS internal_threads_source_check;

ALTER TABLE public.internal_threads
  ADD CONSTRAINT internal_threads_source_check
    CHECK (source IN (
      'campaign',
      'community',
      'group',
      'ministry',
      'pastoral',
      'finance',
      'secretariat',
      'prayer',
      'general',
      'direct',
      'broadcast',
      'support'
    ));

-- ── 4. Índice de performance para queries de mensagens por thread ─────────────
-- Usado por fetchThreadMessages e pelo Realtime filter.
-- CONCURRENTLY para não bloquear operações durante a criação.

CREATE INDEX IF NOT EXISTS idx_internal_messages_thread_created
  ON public.internal_messages(thread_id, created_at DESC);

-- ── 5. Índice de suporte para queries de threads por organização ──────────────
-- Evita seq scan na subscription do Realtime e em fetchThreadsBySource.

CREATE INDEX IF NOT EXISTS idx_internal_threads_org_source_last
  ON public.internal_threads(organization_id, source, last_message_at DESC NULLS LAST);

-- ── Comentários de documentação ───────────────────────────────────────────────

COMMENT ON TABLE public.internal_messages IS
  'Mensagens de chat interno. Publicada no supabase_realtime para push em tempo real.
   Fase 1: INSERT subscription por thread_id no frontend.';

COMMENT ON TABLE public.internal_threads IS
  'Conversas/threads do chat interno. Publicada no supabase_realtime.
   Fase 1: UPDATE subscription por organization_id para reordenar lista em tempo real.';
