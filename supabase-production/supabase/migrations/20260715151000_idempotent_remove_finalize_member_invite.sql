-- ============================================================================
-- Migration: idempotent_remove_finalize_member_invite
-- FASE 3 — item 12: idempotência exata da remoção de
-- finalize_member_invite_activation(text, uuid)
--
-- PROBLEMA:
--   supabase/migrations/20260715120000_harden_remove_finalize_member_invite_
--   activation.sql checa existência por nome (`p.proname = 'finalize_member_
--   invite_activation'`) via pg_proc/pg_namespace, e só então tenta
--   `DROP FUNCTION public.finalize_member_invite_activation(text, uuid)`
--   com a assinatura fixa. Se por qualquer motivo existisse (agora ou no
--   futuro) uma função com o mesmo nome mas assinatura diferente, o `EXISTS`
--   por nome retornaria true, mas o `DROP FUNCTION` com a assinatura
--   `(text, uuid)` falharia com erro ("function ... does not exist"),
--   quebrando a migration em vez de ser genuinamente idempotente.
--
-- CORREÇÃO:
--   Usa to_regprocedure('public.finalize_member_invite_activation(text, uuid)')
--   — resolve a assinatura EXATA e retorna NULL (sem erro) se não existir,
--   nunca lança exceção. Esta migration não depende da 20260715120000 ter
--   sido aplicada antes; é segura para rodar em qualquer ordem/ambiente.
--
-- NÃO aplicar em produção sem revisão e aprovação explícita.
-- ============================================================================

DO $$
DECLARE
  v_fn regprocedure;
BEGIN
  v_fn := to_regprocedure('public.finalize_member_invite_activation(text, uuid)');

  IF v_fn IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', v_fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM service_role', v_fn);
    EXECUTE format('DROP FUNCTION %s', v_fn);
  END IF;
END;
$$;
