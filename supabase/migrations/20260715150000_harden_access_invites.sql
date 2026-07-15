-- ============================================================================
-- Migration: harden_access_invites
-- FASE 3 — Endurecer convite de acesso administrativo
--
-- PROBLEMAS COMPROVADOS em public.access_invites / accept_access_invite
-- (20260618120000_access_invites.sql + 20260618130000_fix_accept_access_
-- invite_email_check.sql):
--
--   1. `email` era opcional (coluna nullable, sem constraint). Quando um
--      convite era criado sem e-mail, accept_access_invite() PULAVA a
--      checagem de e-mail inteiramente:
--        IF inv.email IS NOT NULL AND inv.email <> '' THEN ... END IF;
--      Ou seja, QUALQUER usuário autenticado que apenas conhecesse o token
--      (ex.: um link compartilhado por engano) podia aceitar o convite e
--      ganhar o papel (admin/church_admin/etc.) na organização — aceite de
--      convite de outra pessoa apenas conhecendo o token.
--
--   2. accept_access_invite() não travava a linha do convite
--      (sem `FOR UPDATE`) antes de consumi-lo — duas requisições
--      concorrentes com o mesmo token podiam ambas passar pela checagem de
--      `status <> 'accepted'` antes de qualquer UPDATE, criando uma janela
--      de corrida (TOCTOU).
--
--   3. O INSERT em organization_users usava
--        ON CONFLICT (organization_id, user_id) DO UPDATE SET role = inv.role
--      substituindo silenciosamente um papel já existente do usuário na
--      organização (ex.: um 'member' que já era 'admin' por outro motivo
--      podia ser sobrescrito por um convite de papel menor, ou vice-versa,
--      sem qualquer decisão explícita de um administrador).
--
--   4. A comparação de e-mail usava apenas lower(), sem trim().
--
-- CORREÇÃO (forward-only):
--   A. Constraint NOT VALID exigindo e-mail não vazio em NOVOS convites
--      (NOT VALID não falha a migration por causa de linhas antigas sem
--      e-mail; continua validando 100% dos INSERT/UPDATE novos).
--   B. accept_access_invite() reescrita: SELECT ... FOR UPDATE, e-mail
--      obrigatório (rejeita convites legados sem e-mail com
--      'invite_email_missing'), comparação com btrim+lower nos dois lados,
--      e bloqueio explícito (sem ON CONFLICT DO UPDATE) se o usuário já tem
--      QUALQUER vínculo ativo na organização — nunca sobrescreve papel
--      existente silenciosamente.
--
-- NÃO aplicar em produção sem revisão e aprovação explícita.
-- ============================================================================

-- ── A. E-mail obrigatório em novos convites (NOT VALID = seguro para linhas antigas) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'access_invites_email_required'
  ) THEN
    ALTER TABLE public.access_invites
      ADD CONSTRAINT access_invites_email_required
      CHECK (email IS NOT NULL AND btrim(email) <> '') NOT VALID;
  END IF;
END;
$$;

-- ── B. accept_access_invite(): lock, e-mail obrigatório, sem overwrite silencioso ──
CREATE OR REPLACE FUNCTION public.accept_access_invite(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid          uuid := auth.uid();
  caller_email text := lower(btrim(coalesce(auth.email(), '')));
  inv          public.access_invites%ROWTYPE;
  v_existing   record;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Trava a linha do convite antes de qualquer decisão — impede que duas
  -- requisições concorrentes consumam o mesmo token simultaneamente.
  SELECT * INTO inv
  FROM public.access_invites
  WHERE token = _token
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF inv.status = 'accepted' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_accepted');
  END IF;

  IF inv.status IN ('revoked', 'expired') OR inv.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired_or_revoked');
  END IF;

  -- ── E-mail é obrigatório: nunca aceitar apenas por conhecimento do token ──
  IF inv.email IS NULL OR btrim(inv.email) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_email_missing');
  END IF;

  IF caller_email = '' OR caller_email <> lower(btrim(inv.email)) THEN
    RETURN jsonb_build_object(
      'ok',           false,
      'error',        'email_mismatch',
      'invite_email', inv.email
    );
  END IF;

  -- ── Nunca sobrescrever silenciosamente um vínculo já existente ──────────
  SELECT role, is_active INTO v_existing
  FROM public.organization_users
  WHERE organization_id = inv.organization_id
    AND user_id = uid
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', 'existing_org_access',
      'role',  v_existing.role
    );
  END IF;

  INSERT INTO public.organization_users (organization_id, user_id, role, is_active)
  VALUES (inv.organization_id, uid, inv.role, true);

  UPDATE public.access_invites
  SET status           = 'accepted',
      accepted_at      = now(),
      accepted_user_id = uid
  WHERE id = inv.id;

  RETURN jsonb_build_object(
    'ok',              true,
    'organization_id', inv.organization_id,
    'role',            inv.role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_access_invite(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_access_invite(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_access_invite(text) TO authenticated;
