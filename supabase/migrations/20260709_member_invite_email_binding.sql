-- ============================================================================
-- Migration: member_invite_email_binding
-- Corrige o conceito do convite de membro: nao e cadastro/login livre.
-- O convite pertence a um membro JA CADASTRADO, e o e-mail do cadastro
-- (public.members.email) e a chave fixa de vinculo entre a conta Auth e o
-- registro do membro.
--
-- Alteracoes:
-- 1. public.get_member_invite_by_token(_token text)
--    - passa a retornar member_email (email do cadastro do membro).
--    - mantem assinatura, SECURITY DEFINER, grants e todos os campos atuais.
-- 2. public.accept_member_invite(_token text)
--    - bloqueia se o membro nao tiver e-mail cadastrado (member_email_missing).
--    - valida que o e-mail da conta autenticada (auth.users.email) corresponde
--      ao e-mail do cadastro do membro (email_mismatch), antes de vincular.
--    - mantem todas as validacoes de seguranca ja existentes (invite pending,
--      nao expirado, organization match, member nao vinculado a outra conta,
--      usuario sem acesso previo na organizacao).
-- 3. public.accept_member_invite(_token text, p_user_id uuid)
--    - wrapper inalterado, apenas delega para a versao de 1 argumento.
--
-- NAO aplicar em producao sem revisao e aprovacao explicita.
-- ============================================================================

-- ── 1. get_member_invite_by_token — adiciona member_email ao retorno ─────────

CREATE OR REPLACE FUNCTION public.get_member_invite_by_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv  public.member_invites%ROWTYPE;
  m    RECORD;
  org  RECORD;
  cong RECORD;
BEGIN
  SELECT * INTO inv
  FROM public.member_invites
  WHERE token = _token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF inv.status = 'accepted' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_accepted');
  END IF;

  IF inv.status = 'revoked' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'revoked');
  END IF;

  IF inv.expires_at < now() THEN
    UPDATE public.member_invites SET status = 'expired' WHERE id = inv.id;
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  -- Fetch member name + email
  SELECT full_name, member_role, photo_url, email INTO m
  FROM public.members
  WHERE id = inv.member_id
  LIMIT 1;

  -- Fetch organization name
  SELECT name, city, state INTO org
  FROM public.organizations
  WHERE id = inv.organization_id
  LIMIT 1;

  -- Fetch congregation name (if any)
  SELECT name INTO cong
  FROM public.organizations
  WHERE id = COALESCE(inv.congregation_id, inv.sector_id)
  LIMIT 1;

  RETURN jsonb_build_object(
    'ok',              true,
    'invite_id',       inv.id,
    'token',           inv.token,
    'member_id',       inv.member_id,
    'organization_id', inv.organization_id,
    'sector_id',       inv.sector_id,
    'congregation_id', inv.congregation_id,
    'role',            inv.role,
    'expires_at',      inv.expires_at,
    'member_name',     COALESCE(m.full_name, ''),
    'member_role',     COALESCE(m.member_role, ''),
    'member_photo',    COALESCE(m.photo_url, ''),
    'member_email',    m.email,
    'church_name',     COALESCE(org.name, ''),
    'church_city',     COALESCE(org.city, ''),
    'church_state',    COALESCE(org.state, ''),
    'congregation',    COALESCE(cong.name, '')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_invite_by_token(text) TO anon, authenticated;

-- ── 2. accept_member_invite(_token text) — valida e-mail do membro ───────────

CREATE OR REPLACE FUNCTION public.accept_member_invite(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite       record;
  v_member       record;
  v_existing_org_user record;
  v_auth_email   text := lower(auth.email());
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

  -- ── Vinculo por e-mail: o membro precisa ter e-mail cadastrado ───────────
  IF v_member.email IS NULL OR btrim(v_member.email) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'member_email_missing',
      'message', 'Este membro nao possui e-mail cadastrado. Procure a secretaria para atualizar o cadastro.'
    );
  END IF;

  -- ── O e-mail da conta autenticada deve corresponder ao e-mail do membro ──
  IF v_auth_email IS NULL OR btrim(v_auth_email) <> lower(btrim(v_member.email)) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'email_mismatch',
      'message', 'O e-mail da conta autenticada nao corresponde ao e-mail cadastrado do membro.'
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

-- ── 3. Wrapper (_token, p_user_id) — inalterado, apenas delega ───────────────

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
