-- ============================================================================
-- Migration: internal_chat_realtime_hardening
-- Timestamp: 20260725090000
-- ============================================================================
--
-- PROBLEMA COMPROVADO (inspeção do schema real de staging E produção nesta
-- revisão):
--   1. public.internal_threads NÃO está na publicação supabase_realtime.
--      src/hooks/useInternalThreads.tsx assina postgres_changes em
--      internal_threads (para atualizar a lista ao criar/atualizar uma
--      conversa) — sem a tabela na publicação, esses eventos NUNCA chegam,
--      silenciosamente.
--   2. public.internal_messages e public.internal_threads usam
--      REPLICA IDENTITY DEFAULT (somente chave primária). O Realtime do
--      Supabase exige REPLICA IDENTITY FULL para poder casar o `filter`
--      (ex.: thread_id=eq.<id>, organization_id=eq.<id>) em eventos UPDATE —
--      sem isso, o evento UPDATE é decodificado do WAL mas o filtro não
--      consegue avaliar as colunas necessárias de forma confiável, e o
--      cliente nunca recebe a atualização.
--      Efeito prático relatado: quando o remetente abre a conversa e a
--      mensagem passa de "enviada" para "entregue"/"lida" (UPDATE em
--      internal_messages.delivered_at/read_at), quem está com a conversa
--      aberta do outro lado só vê o tique atualizar depois de sair e
--      voltar à conversa (o que força um novo SELECT completo), nunca em
--      tempo real.
--
-- CORREÇÃO (forward-only, aditiva, idempotente):
--   A. Adiciona public.internal_threads à publicação supabase_realtime.
--   B. Define REPLICA IDENTITY FULL em internal_messages e internal_threads,
--      para que o Realtime consiga aplicar filtros por colunas não-PK em
--      eventos UPDATE/DELETE de forma confiável.
--
-- Não afeta RLS, policies, grants ou dados existentes.
-- ============================================================================

BEGIN;

DO $internal_chat_realtime_hardening$
BEGIN
  IF to_regclass('public.internal_threads') IS NULL THEN
    RAISE EXCEPTION 'Preflight: public.internal_threads ausente — abortando';
  END IF;

  IF to_regclass('public.internal_messages') IS NULL THEN
    RAISE EXCEPTION 'Preflight: public.internal_messages ausente — abortando';
  END IF;
END $internal_chat_realtime_hardening$;

-- ── A. Publicação Realtime ──────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'internal_threads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_threads;
  END IF;
END $$;

-- ── B. Replica identity — necessário para o Realtime filtrar UPDATE/DELETE
--       por colunas que não são a chave primária (thread_id, organization_id) ──
ALTER TABLE public.internal_messages REPLICA IDENTITY FULL;
ALTER TABLE public.internal_threads REPLICA IDENTITY FULL;

-- ============================================================================
-- Verificação final
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'internal_threads'
  ) THEN
    RAISE EXCEPTION 'Verificação final: internal_threads ainda fora da publicação supabase_realtime';
  END IF;

  IF (SELECT relreplident FROM pg_class WHERE oid = 'public.internal_messages'::regclass) <> 'f' THEN
    RAISE EXCEPTION 'Verificação final: internal_messages ainda sem REPLICA IDENTITY FULL';
  END IF;

  IF (SELECT relreplident FROM pg_class WHERE oid = 'public.internal_threads'::regclass) <> 'f' THEN
    RAISE EXCEPTION 'Verificação final: internal_threads ainda sem REPLICA IDENTITY FULL';
  END IF;

  RAISE NOTICE 'internal_chat_realtime_hardening: publicação + replica identity confirmados ✓';
END $$;

COMMIT;
