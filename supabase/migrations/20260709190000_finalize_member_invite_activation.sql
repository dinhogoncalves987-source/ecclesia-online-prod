-- ============================================================================
-- Migration: finalize_member_invite_activation
--
-- Nova RPC de finalizacao usada EXCLUSIVAMENTE pela Edge Function
-- `activate-member-invite` (service role). Ela nao depende de auth.uid(),
-- porque quando chamada pela Edge Function nao existe uma sessao de usuario
-- (a chamada e feita com a service role key). Por isso, toda a seguranca
-- desta funcao depende de validacoes explicitas dentro do proprio corpo:
--
--   - token existe e esta pending
--   - token nao expirou
--   - membro do convite existe e pertence a mesma organizacao do convite
--   - membro tem e-mail cadastrado
--   - o e-mail da conta Auth informada (p_user_id) e IGUAL ao e-mail do
--     cadastro do membro (auth.users.email == members.email)
--   - o membro nao esta vinculado a outra conta diferente de p_user_id
--   - se o usuario ja tiver acesso na organizacao com um papel diferente de
--     'member' (ex.: admin), bloqueia para nao rebaixar/sobrescrever o papel
--
-- Somente entao:
--   - vincula members.user_id = p_user_id
--   - insere/ativa organization_users (role = 'member')
--   - marca o convite como accepted
--
-- SEGURANCA CRITICA: esta funcao SO pode ser executada pela service_role.
-- NAO conceder EXECUTE para anon/authenticated — como nao ha checagem de
-- auth.uid(), qualquer usuario autenticado que pudesse chamar esta RPC
-- poderia vincular QUALQUER user_id a um convite alheio.
--
-- NAO aplicar em producao sem revisao.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.finalize_member_invite_activation(
  p_token text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite             record;
  v_member             record;
  v_auth_email         text;
  v_existing_org_user  record;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_token',
      'message', 'Token invalido.'
    );
  END IF;

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_user',
      'message', 'Usuario invalido.'
    );
  END IF;

  SELECT *
  INTO v_invite
  FROM public.member_invites
  WHERE token = p_token
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
      'message', 'Este convite ja foi utilizado ou nao esta mais disponivel.'
    );
  END IF;

  IF v_invite.expires_at < now() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invite_expired',
      'message', 'Este convite expirou. Solicite um novo link a secretaria.'
    );
  END IF;

  SELECT id, user_id, organization_id, email
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

  IF v_member.email IS NULL OR btrim(v_member.email) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'member_email_missing',
      'message', 'Este membro nao possui e-mail cadastrado. Procure a secretaria para atualizar o cadastro.'
    );
  END IF;

  -- ── E-mail do usuario Auth deve corresponder EXATAMENTE ao e-mail do membro ──
  SELECT email INTO v_auth_email
  FROM auth.users
  WHERE id = p_user_id
  LIMIT 1;

  IF v_auth_email IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'user_not_found',
      'message', 'Usuario informado nao encontrado.'
    );
  END IF;

  IF lower(btrim(v_auth_email)) <> lower(btrim(v_member.email)) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'email_mismatch',
      'message', 'O e-mail da conta informada nao corresponde ao e-mail cadastrado do membro.'
    );
  END IF;

  IF v_member.user_id IS NOT NULL AND v_member.user_id <> p_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'member_already_linked',
      'message', 'Este membro ja esta vinculado a outra conta.'
    );
  END IF;

  -- ── Nao sobrescrever papel elevado (ex.: admin) na mesma organizacao ──────
  SELECT role, is_active
  INTO v_existing_org_user
  FROM public.organization_users
  WHERE organization_id = v_invite.organization_id
    AND user_id = p_user_id
  LIMIT 1;

  IF FOUND AND v_existing_org_user.role <> 'member' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'existing_org_access',
      'message', 'Esta conta ja possui acesso nesta igreja com outro perfil. Contate o administrador.'
    );
  END IF;

  UPDATE public.members
  SET user_id = p_user_id
  WHERE id = v_invite.member_id;

  INSERT INTO public.organization_users (organization_id, user_id, role, is_active)
  VALUES (v_invite.organization_id, p_user_id, 'member', true)
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET role = 'member', is_active = true;

  UPDATE public.member_invites
  SET status = 'accepted',
      accepted_user_id = p_user_id,
      accepted_at = now()
  WHERE id = v_invite.id;

  RETURN jsonb_build_object(
    'success', true,
    'member_id', v_member.id,
    'organization_id', v_invite.organization_id
  );
END;
$$;

-- ── Bloqueio explicito: somente service_role pode executar esta funcao ───────
REVOKE ALL ON FUNCTION public.finalize_member_invite_activation(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_member_invite_activation(text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_member_invite_activation(text, uuid) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.finalize_member_invite_activation(text, uuid) TO service_role;
