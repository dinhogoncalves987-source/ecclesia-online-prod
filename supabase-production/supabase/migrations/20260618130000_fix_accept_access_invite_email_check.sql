-- ============================================================
-- Migration: corrige accept_access_invite — valida e-mail do convidado
-- Data: 2026-06-18
-- ============================================================
-- PROBLEMA RESOLVIDO:
--   Sem esta correção, qualquer usuário autenticado podia aceitar um
--   convite destinado a outro e-mail, aplicando a role no usuário errado.
--
-- REGRA NOVA:
--   Se o convite tem e-mail cadastrado, auth.email() deve bater com ele.
--   Caso contrário a função retorna error = 'email_mismatch'.
-- ============================================================
-- COMO APLICAR:
--   Supabase Dashboard → SQL Editor → colar este arquivo → Run
-- ============================================================

CREATE OR REPLACE FUNCTION public.accept_access_invite(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid         uuid := auth.uid();
  caller_email text := lower(auth.email());
  inv         public.access_invites%ROWTYPE;
BEGIN
  -- Requer autenticação
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO inv FROM public.access_invites WHERE token = _token LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF inv.status = 'accepted' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_accepted');
  END IF;

  IF inv.status IN ('revoked', 'expired') OR inv.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired_or_revoked');
  END IF;

  -- ── Validação de e-mail ───────────────────────────────────────────────────
  -- Se o convite contém um e-mail destinatário, o usuário autenticado deve
  -- ser exatamente o mesmo. Isso impede que um admin aceite o convite no
  -- lugar do convidado real.
  IF inv.email IS NOT NULL AND inv.email <> '' THEN
    IF caller_email IS DISTINCT FROM lower(inv.email) THEN
      RETURN jsonb_build_object(
        'ok',           false,
        'error',        'email_mismatch',
        'invite_email', inv.email
      );
    END IF;
  END IF;
  -- ─────────────────────────────────────────────────────────────────────────

  -- Criar ou atualizar vínculo na organização
  INSERT INTO public.organization_users (organization_id, user_id, role, is_active)
  VALUES (inv.organization_id, uid, inv.role, true)
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET role = inv.role, is_active = true;

  -- Marcar convite como aceito
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

GRANT EXECUTE ON FUNCTION public.accept_access_invite(text) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'accept_access_invite: validação de e-mail adicionada ✓'; END $$;
