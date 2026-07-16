-- Produção real 2026-07-15: reconciliação atômica baseada no inventário
-- de zsonukpxahaxffugavfu. Não remove nem altera organizations.
BEGIN;

DO $$
DECLARE
  required_table text;
BEGIN
  FOREACH required_table IN ARRAY ARRAY[
    'profiles', 'user_roles', 'organizations', 'organization_users',
    'members', 'member_invites', 'access_invites'
  ]
  LOOP
    IF to_regclass('public.' || required_table) IS NULL THEN
      RAISE EXCEPTION 'Preflight: tabela public.% ausente', required_table;
    END IF;
  END LOOP;
END;
$$;

-- 1. Fonte única e não autoeditável de autoridade raiz.
CREATE TABLE IF NOT EXISTS public.super_admins (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  notes      text
);

ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

-- Captura uma única vez a autoridade que o schema legado já reconhecia.
-- Depois deste script, profiles/user_roles não concedem mais autoridade raiz.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.super_admins) THEN
    INSERT INTO public.super_admins (user_id, notes)
    SELECT legacy.user_id, 'Migrado automaticamente da autoridade legada em 2026-07-15'
    FROM (
      SELECT p.user_id
      FROM public.profiles p
      WHERE p.platform_role IN ('platform_admin', 'super_admin', 'superadmin')

      UNION

      SELECT ur.user_id
      FROM public.user_roles ur
      WHERE ur.organization_id IS NULL
        AND ur.role IN ('platform_admin', 'super_admin', 'superadmin')
    ) AS legacy
    JOIN auth.users au ON au.id = legacy.user_id
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.super_admins sa
    WHERE sa.user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_platform_finance_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user_id);
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.is_superadmin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_superadmin(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.is_platform_finance_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_finance_admin(uuid) TO authenticated;

-- 2. Novo usuário: cria perfil, mas nunca cargo nem vínculo por slug.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

DO $$
DECLARE
  v_fn regprocedure;
BEGIN
  v_fn := to_regprocedure('public.join_organization_by_slug(text)');
  IF v_fn IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', v_fn);
    EXECUTE format('DROP FUNCTION %s', v_fn);
  END IF;
END;
$$;

-- 3. profiles.platform_role deixa de ser autoeditável.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, role_title, phone, avatar_url)
ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_profiles_admin_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    NEW.platform_role := OLD.platform_role;
    NEW.user_id := OLD.user_id;
    NEW.email := OLD.email;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profiles_admin_columns ON public.profiles;
CREATE TRIGGER protect_profiles_admin_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profiles_admin_columns();

CREATE OR REPLACE FUNCTION public.admin_set_platform_role(
  _target_user_id uuid,
  _new_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF _target_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_target_user');
  END IF;

  v_normalized_role := NULLIF(btrim(_new_role), '');
  IF v_normalized_role IS NOT NULL AND v_normalized_role NOT IN (
    'super_admin', 'platform_admin', 'support_secretaria',
    'support_financeiro', 'support_culto_louvor', 'support_tecnico',
    'support_implantacao', 'support_readonly'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_platform_role');
  END IF;

  UPDATE public.profiles
  SET platform_role = v_normalized_role
  WHERE user_id = _target_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', _target_user_id,
    'platform_role', v_normalized_role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_platform_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_platform_role(uuid, text) TO authenticated;

DROP POLICY IF EXISTS "Superadmins can view" ON public.super_admins;
DROP POLICY IF EXISTS "Superadmins can insert super_admins" ON public.super_admins;
DROP POLICY IF EXISTS "Superadmins can delete super_admins" ON public.super_admins;
DROP POLICY IF EXISTS "super admins select" ON public.super_admins;
DROP POLICY IF EXISTS "super admins insert" ON public.super_admins;
DROP POLICY IF EXISTS "super admins update" ON public.super_admins;
DROP POLICY IF EXISTS "super admins delete" ON public.super_admins;

CREATE POLICY "super admins select" ON public.super_admins
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

CREATE POLICY "super admins insert" ON public.super_admins
FOR INSERT TO authenticated
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "super admins update" ON public.super_admins
FOR UPDATE TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "super admins delete" ON public.super_admins
FOR DELETE TO authenticated
USING (public.is_platform_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.super_admins TO authenticated;
REVOKE ALL ON public.super_admins FROM anon;

DROP POLICY IF EXISTS "Anyone authenticated can view roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "user roles users read own" ON public.user_roles;
DROP POLICY IF EXISTS "user roles platform admins manage" ON public.user_roles;

CREATE POLICY "user roles users read own" ON public.user_roles
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.is_platform_admin(auth.uid()));

CREATE POLICY "user roles platform admins manage" ON public.user_roles
FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

-- 4. Convite administrativo: e-mail obrigatório, papel permitido e consumo
-- serializado. Nenhum convite pode sobrescrever um acesso já existente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.access_invites'::regclass
      AND conname = 'access_invites_email_required'
  ) THEN
    ALTER TABLE public.access_invites
      ADD CONSTRAINT access_invites_email_required
      CHECK (email IS NOT NULL AND btrim(email) <> '') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.access_invites'::regclass
      AND conname = 'access_invites_role_allowed'
  ) THEN
    ALTER TABLE public.access_invites
      ADD CONSTRAINT access_invites_role_allowed
      CHECK (role IN (
        'church_admin', 'pastor', 'secretary', 'tesoureiro',
        'contador', 'leader', 'porteiro', 'member'
      )) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.access_invites
    WHERE email IS NULL OR btrim(email) = ''
  ) THEN
    ALTER TABLE public.access_invites
      VALIDATE CONSTRAINT access_invites_email_required;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.access_invites
    WHERE role NOT IN (
      'church_admin', 'pastor', 'secretary', 'tesoureiro',
      'contador', 'leader', 'porteiro', 'member'
    )
  ) THEN
    ALTER TABLE public.access_invites
      VALIDATE CONSTRAINT access_invites_role_allowed;
  END IF;
END;
$$;

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
  IF inv.email IS NULL OR btrim(inv.email) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_email_missing');
  END IF;
  IF caller_email = '' OR caller_email <> lower(btrim(inv.email)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_mismatch');
  END IF;
  IF inv.role NOT IN (
    'church_admin', 'pastor', 'secretary', 'tesoureiro',
    'contador', 'leader', 'porteiro', 'member'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_invite_role');
  END IF;

  SELECT role, is_active INTO v_existing
  FROM public.organization_users
  WHERE organization_id = inv.organization_id
    AND user_id = uid
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'existing_org_access',
      'role', v_existing.role
    );
  END IF;

  INSERT INTO public.organization_users (organization_id, user_id, role, is_active)
  VALUES (inv.organization_id, uid, inv.role, true);

  UPDATE public.access_invites
  SET status = 'accepted', accepted_at = now(), accepted_user_id = uid
  WHERE id = inv.id;

  RETURN jsonb_build_object(
    'ok', true,
    'organization_id', inv.organization_id,
    'role', inv.role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_access_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_access_invite(text) TO authenticated;

-- 5. Convite de membro: o token só pode ser consumido pela conta cujo
-- e-mail coincide com o e-mail já cadastrado em members.
CREATE OR REPLACE FUNCTION public.get_member_invite_by_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv  public.member_invites%ROWTYPE;
  m    record;
  org  record;
  cong record;
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

  SELECT full_name, member_role, photo_url, email INTO m
  FROM public.members WHERE id = inv.member_id LIMIT 1;
  SELECT name, city, state INTO org
  FROM public.organizations WHERE id = inv.organization_id LIMIT 1;
  SELECT name INTO cong
  FROM public.organizations
  WHERE id = COALESCE(inv.congregation_id, inv.sector_id)
  LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'invite_id', inv.id,
    'token', inv.token,
    'member_id', inv.member_id,
    'organization_id', inv.organization_id,
    'sector_id', inv.sector_id,
    'congregation_id', inv.congregation_id,
    'role', inv.role,
    'expires_at', inv.expires_at,
    'member_name', COALESCE(m.full_name, ''),
    'member_role', COALESCE(m.member_role, ''),
    'member_photo', COALESCE(m.photo_url, ''),
    'member_email', m.email,
    'church_name', COALESCE(org.name, ''),
    'church_city', COALESCE(org.city, ''),
    'church_state', COALESCE(org.state, ''),
    'congregation', COALESCE(cong.name, '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_member_invite_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_member_invite_by_token(text) TO anon, authenticated;

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
  v_auth_email text := lower(btrim(coalesce(auth.email(), '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_invite
  FROM public.member_invites
  WHERE token = _token
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invite_not_found');
  END IF;
  IF v_invite.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invite_not_pending');
  END IF;
  IF v_invite.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'invite_expired');
  END IF;

  SELECT id, user_id, organization_id, email INTO v_member
  FROM public.members
  WHERE id = v_invite.member_id
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'member_not_found');
  END IF;
  IF v_member.organization_id IS DISTINCT FROM v_invite.organization_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'organization_mismatch');
  END IF;
  IF v_member.email IS NULL OR btrim(v_member.email) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'member_email_missing');
  END IF;
  IF v_auth_email = '' OR v_auth_email <> lower(btrim(v_member.email)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'email_mismatch');
  END IF;
  IF v_member.user_id IS NOT NULL AND v_member.user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'member_already_linked');
  END IF;

  SELECT role, is_active INTO v_existing_org_user
  FROM public.organization_users
  WHERE organization_id = v_invite.organization_id
    AND user_id = auth.uid()
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'existing_org_access');
  END IF;

  UPDATE public.members
  SET user_id = auth.uid()
  WHERE id = v_invite.member_id;

  INSERT INTO public.organization_users (organization_id, user_id, role, is_active)
  VALUES (v_invite.organization_id, auth.uid(), 'member', true);

  UPDATE public.member_invites
  SET status = 'accepted', accepted_user_id = auth.uid(), accepted_at = now()
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
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_mismatch');
  END IF;
  RETURN public.accept_member_invite(p_token);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_member_invite(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_member_invite(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_member_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_member_invite(text, uuid) TO authenticated;

-- 6. Remover definitivamente o fluxo service-role antigo e sem sessão.
DO $$
DECLARE
  v_fn regprocedure;
BEGIN
  v_fn := to_regprocedure('public.finalize_member_invite_activation(text,uuid)');
  IF v_fn IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', v_fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM service_role', v_fn);
    EXECUTE format('DROP FUNCTION %s', v_fn);
  END IF;
END;
$$;

-- 7. Verificação fail-closed antes do COMMIT.
DO $$
DECLARE
  handle_definition text;
  admin_definition text;
BEGIN
  SELECT lower(pg_get_functiondef('public.handle_new_user()'::regprocedure))
  INTO handle_definition;
  IF handle_definition LIKE '%church_slug%'
     OR handle_definition LIKE '%raw_user_meta_data->>''platform_role''%' THEN
    RAISE EXCEPTION 'Verificação: handle_new_user ainda aceita autoridade do cliente';
  END IF;

  SELECT lower(pg_get_functiondef('public.is_platform_admin(uuid)'::regprocedure))
  INTO admin_definition;
  IF admin_definition NOT LIKE '%public.super_admins%'
     OR admin_definition LIKE '%public.profiles%'
     OR admin_definition LIKE '%public.user_roles%' THEN
    RAISE EXCEPTION 'Verificação: is_platform_admin ainda usa fonte legada';
  END IF;

  IF to_regprocedure('public.join_organization_by_slug(text)') IS NOT NULL THEN
    RAISE EXCEPTION 'Verificação: join por slug ainda existe';
  END IF;
  IF to_regprocedure('public.finalize_member_invite_activation(text,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'Verificação: finalize_member_invite_activation ainda existe';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'protect_profiles_admin_columns'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Verificação: trigger de proteção de profiles ausente';
  END IF;
END;
$$;

COMMIT;

SELECT jsonb_build_object(
  'ok', true,
  'ambiente', 'production',
  'organizations_preservadas', (SELECT count(*) FROM public.organizations),
  'super_admins_regularizados', (SELECT count(*) FROM public.super_admins),
  'join_por_slug_removido', to_regprocedure('public.join_organization_by_slug(text)') IS NULL,
  'finalize_inseguro_removido', to_regprocedure('public.finalize_member_invite_activation(text,uuid)') IS NULL,
  'access_invites_endurecido', EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.access_invites'::regclass
      AND conname = 'access_invites_email_required'
  )
) AS resultado_reconciliacao;
