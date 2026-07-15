-- ============================================================================
-- Migration: fix_member_invite_accept_safety
-- Corrige bug critico no aceite de convite de membro:
-- - impede rebaixamento de admin/church_admin para member
-- - impede sobrescrita de organization_users.role
-- - impede vincular members.user_id a conta ja vinculada a organizacao
-- - corrige a RPC antiga accept_member_invite(text)
-- - cria wrapper seguro accept_member_invite(text, uuid)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.accept_member_invite(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite record;
  v_member record;
  v_existing_org_user record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'not_authenticated',
      'message', 'Usuario nao autenticado.'
    );
  END IF;

  SELECT *
  INTO v_invite
  FROM public.member_invites
  WHERE token = _token
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invite_not_found',
      'message', 'Convite nao encontrado.'
    );
  END IF;

  IF v_invite.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invite_not_pending',
      'message', 'Este convite nao esta mais pendente.'
    );
  END IF;

  IF v_invite.expires_at < now() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invite_expired',
      'message', 'Este convite expirou.'
    );
  END IF;

  SELECT id, user_id, organization_id
  INTO v_member
  FROM public.members
  WHERE id = v_invite.member_id
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'member_not_found',
      'message', 'Membro nao encontrado.'
    );
  END IF;

  IF v_member.organization_id IS DISTINCT FROM v_invite.organization_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'organization_mismatch',
      'message', 'O convite nao pertence a mesma organizacao do membro.'
    );
  END IF;

  IF v_member.user_id IS NOT NULL AND v_member.user_id <> auth.uid() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'member_already_linked',
      'message', 'Este membro ja esta vinculado a outra conta.'
    );
  END IF;

  SELECT role, is_active
  INTO v_existing_org_user
  FROM public.organization_users
  WHERE organization_id = v_invite.organization_id
    AND user_id = auth.uid()
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'existing_org_access',
      'message', 'Voce ja possui acesso nesta igreja. Saia da conta atual e abra o link com a conta correta do membro.'
    );
  END IF;

  UPDATE public.members
  SET user_id = auth.uid()
  WHERE id = v_invite.member_id;

  INSERT INTO public.organization_users (
    organization_id,
    user_id,
    role,
    is_active
  )
  VALUES (
    v_invite.organization_id,
    auth.uid(),
    'member',
    true
  );

  UPDATE public.member_invites
  SET status = 'accepted',
      accepted_user_id = auth.uid(),
      accepted_at = now()
  WHERE id = v_invite.id;

  RETURN jsonb_build_object(
    'success', true,
    'member_id', v_member.id,
    'organization_id', v_invite.organization_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_member_invite(
  p_token text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'not_authenticated',
      'message', 'Usuario nao autenticado.'
    );
  END IF;

  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'user_mismatch',
      'message', 'Usuario autenticado nao corresponde ao usuario informado.'
    );
  END IF;

  RETURN public.accept_member_invite(p_token);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_member_invite(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_member_invite(text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.accept_member_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_member_invite(text, uuid) TO authenticated;
