-- ============================================================================
-- Migration: remove_open_slug_join
-- FASE 2 — Remover entrada aberta por slug
--
-- PROBLEMA COMPROVADO:
--   public.handle_new_user() (redefinida por 20260715130000_harden_
--   platform_role_escalation.sql, herdando o bloco original de
--   20260513120000_staging_org_invite_link.sql) associava automaticamente
--   qualquer novo cadastro a uma organização com base em `church_slug` vindo
--   de raw_user_meta_data — sem qualquer convite, token ou aprovação:
--
--     invite_slug := NEW.raw_user_meta_data->>'church_slug';
--     ... INSERT INTO organization_users (..., role: 'member', ...)
--
--   Além disso, a RPC pública public.join_organization_by_slug(_slug text)
--   (mesma origem) permitia que QUALQUER usuário autenticado se auto-
--   associasse como 'member' de QUALQUER organização apenas conhecendo o
--   `slug` público (visível na própria URL de /share, ex.: /share?church=...).
--   Não havia convite, token, nem aprovação de um administrador da
--   organização — bastava saber (ou adivinhar) o slug.
--
--   O frontend acionava esse caminho a partir de:
--     - src/pages/Signup.tsx (?church=<slug> vindo de src/pages/SharePublic.tsx)
--     - src/hooks/useChurch.tsx -> ensureOrganizationMembership() sempre que
--       um usuário autenticado não tinha nenhuma organização ativa.
--
-- CORREÇÃO (forward-only):
--   1. handle_new_user() é redefinida SEM o bloco de auto-join por slug —
--      o cadastro cria apenas o profile (sem platform_role, sem vínculo
--      organizacional).
--   2. join_organization_by_slug(text) é revogada e removida de forma
--      idempotente, usando to_regprocedure para checar a assinatura exata
--      antes de qualquer REVOKE/DROP (não falha se a função já não existir).
--   3. Ingresso em organização passa a ocorrer exclusivamente pelos convites
--      tokenizados já existentes (member_invites -> accept_member_invite,
--      access_invites -> accept_access_invite), ambos vinculados ao e-mail
--      da identidade autenticada — nunca por slug público.
--   4. O frontend (Signup.tsx, SharePublic.tsx, useChurch.tsx,
--      organizationMembership.ts) é corrigido em arquivo separado
--      (não-SQL) nesta mesma revisão para deixar de chamar esse caminho.
--
-- NÃO aplicar em produção sem revisão e aprovação explícita.
-- ============================================================================

-- ── 1. handle_new_user(): sem platform_role (já corrigido) e sem slug join ──
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- SEGURANÇA: platform_role nunca é lido de raw_user_meta_data (FASE 1).
  -- SEGURANÇA: nenhuma associação organizacional é criada a partir de
  -- church_slug/raw_user_meta_data (FASE 2). Ingresso em organização só
  -- ocorre por convite tokenizado (accept_member_invite / accept_access_invite).
  INSERT INTO public.profiles (user_id, full_name, email, platform_role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    NULL
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ── 2. Remoção idempotente de join_organization_by_slug(text) ──────────────
-- Usa to_regprocedure com a assinatura EXATA confirmada em
-- supabase/migrations/20260513120000_staging_org_invite_link.sql
-- (`CREATE OR REPLACE FUNCTION public.join_organization_by_slug(_slug text)`).
-- to_regprocedure retorna NULL (sem erro) se a função/assinatura não existir,
-- o que torna este bloco seguro para rodar em qualquer ambiente, mesmo que a
-- função já tenha sido removida antes.
DO $$
BEGIN
  IF to_regprocedure('public.join_organization_by_slug(text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.join_organization_by_slug(text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.join_organization_by_slug(text) FROM anon;
    REVOKE ALL ON FUNCTION public.join_organization_by_slug(text) FROM authenticated;
    DROP FUNCTION public.join_organization_by_slug(text);
  END IF;
END;
$$;
