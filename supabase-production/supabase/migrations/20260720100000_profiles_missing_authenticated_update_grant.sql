-- ============================================================================
-- Migration: profiles_missing_authenticated_update_grant
-- Timestamp: 20260720100000
-- ============================================================================
--
-- OBJETIVO
-- Corrigir GRANT de nível de tabela ausente em produção para public.profiles:
-- a tabela tem RLS habilitado e uma policy correta de UPDATE para
-- "authenticated" ("profiles users update own" — auth.uid() = user_id OR
-- is_platform_admin(auth.uid())), mas o papel "authenticated" nunca recebeu
-- o GRANT UPDATE de tabela correspondente. Sem esse GRANT de base, o
-- Postgres bloqueia qualquer UPDATE ANTES de avaliar a policy de RLS
-- ("permission denied for table profiles"), o que explica por que salvar
-- nome, telefone, função ou foto de perfil nunca persiste em produção,
-- mesmo com a tela mostrando sucesso local/otimista.
--
-- Mesma classe de bug já corrigida para as tabelas de Chat em
-- 20260718120000_internal_chat_missing_authenticated_grants.sql.
--
-- ESCOPO
-- Esta migration NÃO cria tabela, NÃO altera nenhuma policy de RLS
-- existente, NÃO insere/atualiza/exclui dados, e NÃO concede nenhum
-- privilégio que não estivesse já implicitamente autorizado pelas policies
-- de RLS ativas para "authenticated" em public.profiles (SELECT/INSERT/
-- UPDATE já existem, cobrindo o mesmo owner-only ou platform admin).
--
-- Idempotente e forward-only.
-- ============================================================================

BEGIN;

DO $profiles_update_grant$
DECLARE
  v_tem_grant_update boolean;
BEGIN
  -- ── Preflight: a tabela precisa existir, ter RLS habilitado e ter ao ────
  -- menos uma policy de UPDATE para "authenticated".
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Preflight: public.profiles ausente — abortando sem conceder nenhum GRANT';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass) THEN
    RAISE EXCEPTION 'Preflight: public.profiles não tem RLS habilitado — abortando sem conceder nenhum GRANT';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND 'authenticated' = ANY(roles)
      AND cmd IN ('UPDATE', 'ALL')
  ) THEN
    RAISE EXCEPTION 'Preflight: public.profiles não tem policy de UPDATE/ALL para authenticated — abortando sem conceder nenhum GRANT';
  END IF;

  -- ── GRANT: authenticated ganha exatamente UPDATE, já limitado ────────────
  -- linha-a-linha pela policy "profiles users update own" auditada acima.
  GRANT UPDATE ON public.profiles TO authenticated;

  -- ── Verificação final ────────────────────────────────────────────────────
  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
  ) INTO v_tem_grant_update;

  IF NOT v_tem_grant_update THEN
    RAISE EXCEPTION 'Verificação final: authenticated ainda sem GRANT UPDATE em public.profiles após a correção';
  END IF;

  RAISE NOTICE 'profiles_missing_authenticated_update_grant: GRANT UPDATE concedido a authenticated em public.profiles ✓';
END $profiles_update_grant$;

COMMIT;
