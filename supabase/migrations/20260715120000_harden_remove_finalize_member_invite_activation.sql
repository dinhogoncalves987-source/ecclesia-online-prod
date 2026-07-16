-- ============================================================================
-- Migration: harden_remove_finalize_member_invite_activation
-- Hardening — revisão de segurança do commit ee86c3d (bloqueador P0).
--
-- Contexto:
--   `public.finalize_member_invite_activation(text, uuid)` foi criada
--   exclusivamente para ser chamada pela Edge Function `activate-member-invite`
--   com a service_role key, SEM depender de auth.uid() (porque a service role
--   não tem sessão de usuário). Isso a tornava uma RPC de altíssimo poder:
--   qualquer chamador com a service_role key podia vincular QUALQUER
--   `p_user_id` a QUALQUER convite, sem nenhuma prova de sessão/identidade
--   alem da correspondencia de e-mail.
--
--   A propria Edge Function que a utilizava permitia, antes desta revisão,
--   redefinir a senha de uma conta Auth EXISTENTE via
--   `admin.auth.admin.updateUserById(..., { password, email_confirm: true })`
--   a partir de um endpoint publico e nao autenticado — um sequestro de
--   conta (account takeover) classificado como bloqueador P0. A Edge Function
--   foi neutralizada (supabase/functions/activate-member-invite/index.ts agora
--   so responde 410 Gone, sem tocar em Auth ou banco).
--
--   Com a Edge Function neutralizada, esta RPC de service_role deixou de ter
--   qualquer chamador legitimo. O fluxo de convite de membro agora finaliza
--   SEMPRE via `public.accept_member_invite(text, uuid)` (ja existente,
--   inalterada por esta migration), que exige uma sessao autenticada real
--   (`auth.uid()`) e valida `auth.email()` contra `members.email` antes de
--   vincular — nunca um caminho de service role sem sessao.
--
-- Ação desta migration (idempotente, segura mesmo se nunca aplicada):
--   1. Revoga EXECUTE de service_role/authenticated/anon.
--   2. Remove a função por completo.
--
-- IMPORTANTE: esta migration NÃO altera as migrations anteriores que possam
-- já ter sido aplicadas em um banco (20260709190000_finalize_member_invite_
-- activation.sql permanece intocada no histórico) — apenas revoga/remove o
-- efeito dela indo para a frente, como uma migration nova e independente.
--
-- NAO aplicar em producao sem revisao e aprovacao explicita.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'finalize_member_invite_activation'
  ) THEN
    REVOKE ALL ON FUNCTION public.finalize_member_invite_activation(text, uuid) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.finalize_member_invite_activation(text, uuid) FROM anon;
    REVOKE ALL ON FUNCTION public.finalize_member_invite_activation(text, uuid) FROM authenticated;
    REVOKE ALL ON FUNCTION public.finalize_member_invite_activation(text, uuid) FROM service_role;

    DROP FUNCTION public.finalize_member_invite_activation(text, uuid);
  END IF;
END;
$$;
