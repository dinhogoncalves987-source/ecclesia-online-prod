-- ============================================================================
-- Migration: internal_thread_hidden_for_user_update_grant
-- Timestamp: 20260720110000
-- ============================================================================
--
-- OBJETIVO
-- public.internal_thread_hidden_for_user ("apagar para mim") foi criada com
-- policies/GRANT de SELECT/INSERT/DELETE apenas (ver
-- 20260718100000_internal_threads_hide_for_user.sql), mas o cliente usa
-- `upsert(..., { onConflict: "thread_id,user_id" })` — que gera
-- `INSERT ... ON CONFLICT (...) DO UPDATE`, exigindo também privilégio de
-- UPDATE na tabela e uma policy de RLS de UPDATE. Sem isso, apagar de novo
-- uma conversa já apagada anteriormente pelo mesmo usuário (ex.: duplo
-- clique, requisição repetida por instabilidade de rede) falha com
-- "permission denied"/RLS ao tentar o UPDATE do conflito.
--
-- ESCOPO
-- Aditiva: só adiciona a policy de UPDATE (mesma regra de dono já usada em
-- SELECT/DELETE — auth.uid() = user_id) e o GRANT de tabela correspondente.
-- Não altera nenhuma policy existente, não insere/apaga dados.
--
-- Idempotente e forward-only.
-- ============================================================================

BEGIN;

DO $hidden_for_user_update_grant$
BEGIN
  IF to_regclass('public.internal_thread_hidden_for_user') IS NULL THEN
    RAISE EXCEPTION 'Preflight: public.internal_thread_hidden_for_user ausente — abortando';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.internal_thread_hidden_for_user'::regclass) THEN
    RAISE EXCEPTION 'Preflight: public.internal_thread_hidden_for_user não tem RLS habilitado — abortando';
  END IF;
END $hidden_for_user_update_grant$;

DROP POLICY IF EXISTS "internal thread hidden own update" ON public.internal_thread_hidden_for_user;
CREATE POLICY "internal thread hidden own update" ON public.internal_thread_hidden_for_user
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

GRANT UPDATE ON public.internal_thread_hidden_for_user TO authenticated;

-- ============================================================================
-- Verificação final
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'internal_thread_hidden_for_user'
      AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
  ) THEN
    RAISE EXCEPTION 'Verificação final: authenticated ainda sem GRANT UPDATE em internal_thread_hidden_for_user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'internal_thread_hidden_for_user'
      AND cmd = 'UPDATE' AND 'authenticated' = ANY(roles)
  ) THEN
    RAISE EXCEPTION 'Verificação final: policy de UPDATE ainda ausente em internal_thread_hidden_for_user';
  END IF;

  RAISE NOTICE 'internal_thread_hidden_for_user_update_grant: policy + GRANT UPDATE confirmados ✓';
END $$;

COMMIT;
