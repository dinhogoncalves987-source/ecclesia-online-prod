--
-- PostgreSQL database dump
--

\restrict I1bZ5JPkfOcUR5djsPKwZ7EevAEarGl17qyXwOfpeYhSbjd0TFOm7vJI0A2nUnq

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: accept_access_invite(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_access_invite(_token text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  uid          uuid := auth.uid();
  caller_email text := lower(auth.email());
  inv          public.access_invites%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;
  SELECT * INTO inv FROM public.access_invites WHERE token = _token LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF inv.status = 'accepted' THEN RETURN jsonb_build_object('ok', false, 'error', 'already_accepted'); END IF;
  IF inv.status IN ('revoked','expired') OR inv.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired_or_revoked');
  END IF;
  -- Validação de e-mail: impede que admin aceite convite no lugar do convidado real
  IF inv.email IS NOT NULL AND inv.email <> '' THEN
    IF caller_email IS DISTINCT FROM lower(inv.email) THEN
      RETURN jsonb_build_object(
        'ok', false, 'error', 'email_mismatch', 'invite_email', inv.email
      );
    END IF;
  END IF;
  INSERT INTO public.organization_users (organization_id, user_id, role, is_active)
  VALUES (inv.organization_id, uid, inv.role, true)
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = inv.role, is_active = true;
  UPDATE public.access_invites
  SET status='accepted', accepted_at=now(), accepted_user_id=uid WHERE id=inv.id;
  RETURN jsonb_build_object('ok', true, 'organization_id', inv.organization_id, 'role', inv.role);
END;
$$;


--
-- Name: accept_member_invite(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_member_invite(_token text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  uid uuid := auth.uid();
  inv public.member_invites%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;
  SELECT * INTO inv FROM public.member_invites WHERE token = _token LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF inv.status = 'accepted' THEN RETURN jsonb_build_object('ok', false, 'error', 'already_accepted'); END IF;
  IF inv.status IN ('revoked','expired') OR inv.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired_or_revoked');
  END IF;
  UPDATE public.members SET updated_at = now() WHERE id = inv.member_id;
  INSERT INTO public.organization_users (organization_id, user_id, role, is_active)
  VALUES (inv.organization_id, uid, inv.role, true)
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = inv.role, is_active = true;
  UPDATE public.member_invites
  SET status='accepted', accepted_at=now(), accepted_user_id=uid WHERE id=inv.id;
  RETURN jsonb_build_object('ok', true, 'organization_id', inv.organization_id,
    'member_id', inv.member_id, 'role', inv.role);
END;
$$;


--
-- Name: audit_finance_transaction(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_finance_transaction() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  target_org uuid;
  target_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_org := OLD.organization_id;
    target_id := NULL;
  ELSE
    target_org := NEW.organization_id;
    target_id := NEW.id;
  END IF;

  INSERT INTO public.finance_transaction_audit_logs (
    transaction_id,
    organization_id,
    action,
    changed_by,
    old_data,
    new_data
  ) VALUES (
    target_id,
    target_org,
    lower(TG_OP),
    auth.uid(),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: campaign_allows_replies(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.campaign_allows_replies(_campaign_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT c.allow_replies FROM public.campaigns c WHERE c.id = _campaign_id),
    false
  );
$$;


--
-- Name: can_admin_organization(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_admin_organization(_user_id uuid, _organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.is_platform_admin(_user_id)
  OR EXISTS (
    WITH RECURSIVE chain AS (
      SELECT id, parent_id, 1 AS depth
      FROM public.organizations WHERE id = _organization_id
      UNION ALL
      SELECT o.id, o.parent_id, c.depth + 1
      FROM public.organizations o
      JOIN chain c ON o.id = c.parent_id
      WHERE c.depth < 10
    )
    SELECT 1 FROM chain
    JOIN public.organization_users ou ON ou.organization_id = chain.id
    WHERE ou.user_id = _user_id
      AND COALESCE(ou.is_active, true) = true
      AND ou.role IN ('admin','church_admin')
  );
$$;


--
-- Name: FUNCTION can_admin_organization(_user_id uuid, _organization_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.can_admin_organization(_user_id uuid, _organization_id uuid) IS 'Permite administracao da organizacao quando o usuario e admin dela ou de qualquer ancestral.';


--
-- Name: can_read_internal_thread(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_read_internal_thread(_user_id uuid, _thread_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.internal_threads t
    WHERE  t.id = _thread_id
      AND  (
        public.is_platform_admin(_user_id)
        OR public.is_internal_message_staff(_user_id, t.organization_id)
        OR t.created_by = _user_id
        OR EXISTS (
          SELECT 1 FROM public.members m
          WHERE  m.id = t.member_id AND m.user_id = _user_id
        )
        OR (
          -- Campanha: qualquer membro da organização pode ler
          t.source = 'campaign'
          AND public.is_org_user(_user_id, t.organization_id)
        )
      )
  );
$$;


--
-- Name: can_read_organization(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_read_organization(_user_id uuid, _organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.is_platform_admin(_user_id)
  OR EXISTS (
    WITH RECURSIVE chain AS (
      SELECT id, parent_id, 1 AS depth
      FROM public.organizations WHERE id = _organization_id
      UNION ALL
      SELECT o.id, o.parent_id, c.depth + 1
      FROM public.organizations o
      JOIN chain c ON o.id = c.parent_id
      WHERE c.depth < 10
    )
    SELECT 1 FROM chain
    JOIN public.organization_users ou ON ou.organization_id = chain.id
    WHERE ou.user_id = _user_id AND COALESCE(ou.is_active, true) = true
  );
$$;


--
-- Name: FUNCTION can_read_organization(_user_id uuid, _organization_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.can_read_organization(_user_id uuid, _organization_id uuid) IS 'Permite leitura da organizacao quando o usuario pertence a ela ou a qualquer ancestral.';


--
-- Name: can_send_on_internal_thread(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_send_on_internal_thread(_user_id uuid, _thread_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.internal_threads t
    WHERE  t.id = _thread_id
      AND  (
        public.is_platform_admin(_user_id)
        OR (
          -- Staff pode enviar sempre (mesmo thread fechada / replies desabilitados)
          public.is_internal_message_staff(_user_id, t.organization_id)
          AND public.is_org_user(_user_id, t.organization_id)
        )
        OR (
          -- Campanha compartilhada: qualquer membro org pode enviar se permitido
          t.source = 'campaign'
          AND t.reply_enabled = true
          AND t.status IN ('open', 'pending', 'answered')
          AND public.is_org_user(_user_id, t.organization_id)
          AND public.campaign_allows_replies(t.campaign_id)
        )
        OR (
          -- Outros contextos (não campanha): dono da thread
          t.source <> 'campaign'
          AND t.reply_enabled = true
          AND t.status IN ('open', 'pending', 'answered')
          AND public.is_internal_thread_owner(_user_id, t.id)
          AND public.is_org_user(_user_id, t.organization_id)
        )
      )
  );
$$;


--
-- Name: get_access_invite_by_token(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_access_invite_by_token(_token text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  inv public.access_invites%ROWTYPE;
  org RECORD;
BEGIN
  SELECT * INTO inv FROM public.access_invites WHERE token = _token LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF inv.status = 'accepted' THEN RETURN jsonb_build_object('ok', false, 'error', 'already_accepted'); END IF;
  IF inv.status = 'revoked'  THEN RETURN jsonb_build_object('ok', false, 'error', 'revoked'); END IF;
  IF inv.expires_at < now() THEN
    UPDATE public.access_invites SET status = 'expired' WHERE id = inv.id;
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;
  SELECT name, city, state INTO org FROM public.organizations WHERE id = inv.organization_id LIMIT 1;
  RETURN jsonb_build_object(
    'ok', true, 'invite_id', inv.id, 'token', inv.token,
    'organization_id', inv.organization_id,
    'full_name', COALESCE(inv.full_name,''), 'email', COALESCE(inv.email,''),
    'phone', COALESCE(inv.phone,''), 'role', inv.role, 'expires_at', inv.expires_at,
    'church_name', COALESCE(org.name,''), 'church_city', COALESCE(org.city,''),
    'church_state', COALESCE(org.state,'')
  );
END;
$$;


--
-- Name: get_member_invite_by_token(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_member_invite_by_token(_token text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  inv  public.member_invites%ROWTYPE;
  m    RECORD;
  org  RECORD;
  cong RECORD;
BEGIN
  SELECT * INTO inv FROM public.member_invites WHERE token = _token LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF inv.status = 'accepted' THEN RETURN jsonb_build_object('ok', false, 'error', 'already_accepted'); END IF;
  IF inv.status = 'revoked'  THEN RETURN jsonb_build_object('ok', false, 'error', 'revoked'); END IF;
  IF inv.expires_at < now() THEN
    UPDATE public.member_invites SET status = 'expired' WHERE id = inv.id;
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;
  SELECT full_name, member_role, photo_url INTO m FROM public.members WHERE id = inv.member_id LIMIT 1;
  SELECT name, city, state INTO org FROM public.organizations WHERE id = inv.organization_id LIMIT 1;
  SELECT name INTO cong FROM public.organizations WHERE id = COALESCE(inv.congregation_id, inv.sector_id) LIMIT 1;
  RETURN jsonb_build_object(
    'ok', true, 'invite_id', inv.id, 'token', inv.token,
    'member_id', inv.member_id, 'organization_id', inv.organization_id,
    'sector_id', inv.sector_id, 'congregation_id', inv.congregation_id,
    'role', inv.role, 'expires_at', inv.expires_at,
    'member_name', COALESCE(m.full_name,''), 'member_role', COALESCE(m.member_role,''),
    'member_photo', COALESCE(m.photo_url,''),
    'church_name', COALESCE(org.name,''), 'church_city', COALESCE(org.city,''),
    'church_state', COALESCE(org.state,''), 'congregation', COALESCE(cong.name,'')
  );
END;
$$;


--
-- Name: get_platform_support_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_platform_support_role(_user_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select p.platform_role
  from public.profiles p
  where p.user_id = _user_id
  limit 1;
$$;


--
-- Name: guard_closed_finance_month(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_closed_finance_month() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  target_org uuid;
  target_date date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_org := OLD.organization_id;
    target_date := OLD.date;
  ELSE
    target_org := NEW.organization_id;
    target_date := NEW.date;
  END IF;

  IF public.is_finance_month_closed(target_org, target_date) THEN
    RAISE EXCEPTION 'Periodo financeiro fechado para edicao';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  NEW.updated_at := now();
  NEW.updated_by := auth.uid();

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.responsible_id := COALESCE(NEW.responsible_id, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  invite_slug text;
  org_id uuid;
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email, platform_role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'platform_role', '')
  )
  ON CONFLICT (user_id) DO NOTHING;

  invite_slug := NULLIF(trim(NEW.raw_user_meta_data->>'church_slug'), '');
  IF invite_slug IS NOT NULL THEN
    SELECT o.id INTO org_id
    FROM public.organizations o
    WHERE o.slug = invite_slug
      AND COALESCE(o.active, true) = true
    LIMIT 1;

    IF org_id IS NOT NULL THEN
      INSERT INTO public.organization_users (organization_id, user_id, role, is_active)
      VALUES (org_id, NEW.id, 'member', true)
      ON CONFLICT (organization_id, user_id)
      DO UPDATE SET is_active = true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: has_org_finance_role(uuid, uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_org_finance_role(_user_id uuid, _organization_id uuid, _roles text[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.is_platform_finance_admin(_user_id)
  OR EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = _user_id
      AND ou.organization_id = _organization_id
      AND COALESCE(ou.is_active, true) = true
      AND COALESCE(ou.role, 'member') = ANY(_roles)
  );
$$;


--
-- Name: has_org_role(uuid, uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_org_role(_user_id uuid, _organization_id uuid, _roles text[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.is_platform_admin(_user_id)
  OR EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = _user_id
      AND ou.organization_id = _organization_id
      AND COALESCE(ou.is_active, true) = true
      AND ou.role = ANY(_roles)
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.organization_id = _organization_id
      AND ur.role = ANY(_roles)
  );
$$;


--
-- Name: is_finance_month_closed(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_finance_month_closed(_organization_id uuid, _date date) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.finance_monthly_closings fmc
    WHERE fmc.organization_id = _organization_id
      AND fmc.month = to_char(_date, 'YYYY-MM')
  );
$$;


--
-- Name: is_group_message_staff(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_group_message_staff(_user_id uuid, _group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.groups g
    WHERE g.id = _group_id
      AND public.has_org_role(
        _user_id, g.organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
  );
$$;


--
-- Name: is_group_participant(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_group_participant(_user_id uuid, _group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members gm
    INNER JOIN public.members m ON m.id = gm.member_id
    WHERE gm.group_id = _group_id
      AND m.user_id = _user_id
  );
$$;


--
-- Name: is_internal_message_staff(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_internal_message_staff(_user_id uuid, _organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.is_platform_admin(_user_id)
  OR public.has_org_role(
    _user_id,
    _organization_id,
    ARRAY['admin', 'church_admin', 'leader', 'tesoureiro']
  );
$$;


--
-- Name: is_internal_thread_owner(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_internal_thread_owner(_user_id uuid, _thread_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.internal_threads t
    WHERE t.id = _thread_id
      AND (
        t.created_by = _user_id
        OR EXISTS (
          SELECT 1
          FROM public.members m
          WHERE m.id = t.member_id
            AND m.user_id = _user_id
        )
      )
  );
$$;


--
-- Name: is_org_campaign_finance_reader(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_org_campaign_finance_reader(_user_id uuid, _organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.is_platform_admin(_user_id)
  OR public.has_org_role(
    _user_id,
    _organization_id,
    ARRAY['admin', 'church_admin', 'leader', 'tesoureiro', 'contador']
  );
$$;


--
-- Name: is_org_campaign_media_writer(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_org_campaign_media_writer(_user_id uuid, _organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.is_platform_admin(_user_id)
  OR public.has_org_role(
    _user_id,
    _organization_id,
    ARRAY['admin', 'church_admin', 'leader', 'tesoureiro']
  );
$$;


--
-- Name: is_org_campaign_update_writer(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_org_campaign_update_writer(_user_id uuid, _organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.is_platform_admin(_user_id)
  OR public.has_org_role(_user_id, _organization_id,
    ARRAY['admin','church_admin','pastor','secretary']);
$$;


--
-- Name: is_org_campaign_writer(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_org_campaign_writer(_user_id uuid, _organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.is_platform_admin(_user_id)
  OR public.has_org_role(_user_id, _organization_id,
    ARRAY['admin','church_admin','pastor','secretary']);
$$;


--
-- Name: is_org_finance_reader(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_org_finance_reader(_user_id uuid, _organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.has_org_finance_role(
    _user_id,
    _organization_id,
    ARRAY['admin', 'church_admin', 'tesoureiro', 'contador']
  );
$$;


--
-- Name: is_org_finance_writer(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_org_finance_writer(_user_id uuid, _organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.has_org_finance_role(
    _user_id,
    _organization_id,
    ARRAY['admin', 'church_admin', 'tesoureiro']
  );
$$;


--
-- Name: is_org_user(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_org_user(_user_id uuid, _organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.is_platform_admin(_user_id)
  OR EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = _user_id
      AND ou.organization_id = _organization_id
      AND COALESCE(ou.is_active, true) = true
  );
$$;


--
-- Name: is_platform_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_platform_admin(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = _user_id
      AND COALESCE(p.platform_role, '') IN ('platform_admin', 'super_admin', 'superadmin')
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.organization_id IS NULL
      AND ur.role IN ('platform_admin', 'super_admin', 'superadmin')
  );
$$;


--
-- Name: is_platform_finance_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_platform_finance_admin(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = _user_id
      AND COALESCE(p.platform_role, '') IN ('platform_admin', 'super_admin', 'superadmin')
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role::text IN ('platform_admin', 'super_admin', 'superadmin')
  );
$$;


--
-- Name: is_platform_support_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_platform_support_user(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = _user_id
      and p.platform_role in (
        'super_admin',
        'platform_admin',
        'atendente_central',
        'support_secretaria',
        'support_financeiro',
        'support_culto_louvor',
        'support_tecnico',
        'support_implantacao',
        'support_tv_digital',
        'support_comunidade',
        'support_marketplace',
        'support_readonly'
      )
  );
$$;


--
-- Name: is_schedule_assignee(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_schedule_assignee(_user_id uuid, _assignment_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.schedule_assignments sa
    INNER JOIN public.members m ON m.id = sa.member_id
    WHERE sa.id = _assignment_id
      AND m.user_id IS NOT NULL
      AND m.user_id = _user_id
  );
$$;


--
-- Name: is_valid_organization_hierarchy(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_valid_organization_hierarchy(_parent_type text, _child_type text) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT CASE

    -- ── Internacional ──────────────────────────────────────────────────────────
    -- Organizações internacionais podem criar qualquer nível abaixo.
    -- Suporta: Restauração Internacional → Portugal → Lisboa
    --          Restauração Internacional → Campo Espanha
    --          Restauração Internacional → AD Brasil (nacional) → ...
    WHEN _parent_type = 'international_convention'
         AND _child_type IN ('national_convention', 'state_convention', 'convencao', 'matriz', 'sede')
    THEN true

    -- ── Nacional ──────────────────────────────────────────────────────────────
    -- Nacional pode criar Estadual OU pular para Matriz/Sede diretamente.
    -- Suporta: AD Brasil → CIEPADERGS (estadual)
    --          AD Brasil → AD Caxias (matriz, sem convenção estadual formal)
    WHEN _parent_type = 'national_convention'
         AND _child_type IN ('state_convention', 'convencao', 'matriz', 'sede')
    THEN true

    -- ── Estadual ─────────────────────────────────────────────────────────────
    WHEN _parent_type = 'state_convention'
         AND _child_type IN ('matriz', 'sede')
    THEN true

    -- Convenção legada (compatibilidade)
    WHEN _parent_type = 'convencao'
         AND _child_type IN ('matriz', 'sede')
    THEN true

    -- ── Municipal / Campo / Sede ──────────────────────────────────────────────
    -- Matriz/Sede podem criar Setor OU Congregação direta (sem setor intermediário)
    WHEN _parent_type = 'matriz'
         AND _child_type IN ('setor', 'congregacao')
    THEN true

    WHEN _parent_type = 'sede'
         AND _child_type IN ('setor', 'congregacao')
    THEN true

    -- ── Intermediário ─────────────────────────────────────────────────────────
    WHEN _parent_type = 'setor'
         AND _child_type = 'congregacao'
    THEN true

    -- ── Todos os outros pares são bloqueados ─────────────────────────────────
    -- Inclui: congregacao criando qualquer filho
    --         setor criando matriz/sede/nacional/estadual
    --         qualquer filho criando seu pai ou avô
    ELSE false
  END;
$$;


--
-- Name: FUNCTION is_valid_organization_hierarchy(_parent_type text, _child_type text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_valid_organization_hierarchy(_parent_type text, _child_type text) IS 'Valida pares parent/child de organization_type para hierarquia flexível multi-cliente.
   Hierarquia AD Brasil:
     national_convention → state_convention/convencao → matriz/sede → setor → congregacao
   Hierarquia Internacional:
     international_convention → national_convention/state_convention/matriz/sede → ...
   Atalho permitido: matriz/sede → congregacao (sem setor intermediário).
   Múltiplas raízes coexistem com parent_id IS NULL.';


--
-- Name: join_organization_by_slug(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_organization_by_slug(_slug text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  uid uuid := auth.uid();
  org_id uuid;
  normalized_slug text;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  normalized_slug := NULLIF(trim(_slug), '');
  IF normalized_slug IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_slug');
  END IF;

  SELECT o.id INTO org_id
  FROM public.organizations o
  WHERE o.slug = normalized_slug
    AND COALESCE(o.active, true) = true
  LIMIT 1;

  IF org_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'organization_not_found');
  END IF;

  INSERT INTO public.organization_users (organization_id, user_id, role, is_active)
  VALUES (org_id, uid, 'member', true)
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET is_active = true;

  RETURN jsonb_build_object('ok', true, 'organization_id', org_id);
END;
$$;


--
-- Name: refresh_campaign_raised_amount(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_campaign_raised_amount(p_campaign_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.campaigns c
  SET raised_amount = COALESCE((
    SELECT SUM(cc.amount)
    FROM public.campaign_contributions cc
    WHERE cc.campaign_id = p_campaign_id
      AND cc.payment_status = 'confirmed'
  ), 0),
  updated_at = now()
  WHERE c.id = p_campaign_id;
END;
$$;


--
-- Name: seed_finance_defaults_for_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_finance_defaults_for_org() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.finance_account_categories (organization_id, code, name, type, is_system)
  VALUES
    (NEW.id, '1.01', 'Dizimos', 'receita', true),
    (NEW.id, '1.02', 'Ofertas', 'receita', true),
    (NEW.id, '1.03', 'Campanhas', 'receita', true),
    (NEW.id, '1.04', 'Missoes', 'receita', true),
    (NEW.id, '1.05', 'Eventos', 'receita', true),
    (NEW.id, '2.01', 'Administrativo', 'despesa', true),
    (NEW.id, '2.02', 'Manutencao', 'despesa', true),
    (NEW.id, '2.03', 'Folha/Pastoral', 'despesa', true),
    (NEW.id, '2.04', 'Missoes', 'despesa', true),
    (NEW.id, '2.05', 'Eventos', 'despesa', true)
  ON CONFLICT (organization_id, code) DO NOTHING;

  INSERT INTO public.finance_cost_centers (organization_id, name, type)
  VALUES
    (NEW.id, 'Matriz', 'matriz'),
    (NEW.id, 'Congregacoes', 'congregacao'),
    (NEW.id, 'Departamentos', 'departamento'),
    (NEW.id, 'Eventos', 'evento')
  ON CONFLICT (organization_id, name) DO NOTHING;

  INSERT INTO public.finance_accounts (organization_id, name, type)
  VALUES
    (NEW.id, 'Caixa', 'caixa'),
    (NEW.id, 'Banco', 'banco'),
    (NEW.id, 'PIX', 'pix'),
    (NEW.id, 'Especie', 'especie')
  ON CONFLICT (organization_id, name) DO NOTHING;

  RETURN NEW;
END;
$$;


--
-- Name: set_campaign_featured(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_campaign_featured(p_organization_id uuid, p_campaign_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.is_org_campaign_writer(auth.uid(), p_organization_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.campaigns c
    WHERE c.id = p_campaign_id
      AND c.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'campaign not found';
  END IF;

  UPDATE public.campaigns
  SET is_featured = false,
      updated_at = now()
  WHERE organization_id = p_organization_id
    AND is_featured = true
    AND id <> p_campaign_id;

  UPDATE public.campaigns
  SET is_featured = true,
      updated_at = now()
  WHERE id = p_campaign_id
    AND organization_id = p_organization_id;
END;
$$;


--
-- Name: touch_internal_thread_last_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_internal_thread_last_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_is_staff boolean := false;
BEGIN
  IF NEW.sender_user_id IS NOT NULL THEN
    v_is_staff := public.is_internal_message_staff(NEW.sender_user_id, NEW.organization_id);
  END IF;

  IF NOT v_is_staff AND NEW.sender_role IS NOT NULL THEN
    v_is_staff := NEW.sender_role IN ('admin', 'church_admin', 'leader', 'tesoureiro', 'secretary', 'pastor');
  END IF;

  UPDATE public.internal_threads
  SET last_message_at = NEW.created_at,
      updated_at = now(),
      status = CASE
        WHEN status = 'closed' THEN status
        WHEN v_is_staff THEN 'answered'
        ELSE 'pending'
      END
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;


--
-- Name: trg_refresh_campaign_raised_amount(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_refresh_campaign_raised_amount() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_campaign_id uuid;
BEGIN
  v_campaign_id := COALESCE(NEW.campaign_id, OLD.campaign_id);
  IF v_campaign_id IS NOT NULL THEN
    PERFORM public.refresh_campaign_raised_amount(v_campaign_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: access_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token text DEFAULT encode(extensions.gen_random_bytes(24), 'hex'::text) NOT NULL,
    organization_id uuid NOT NULL,
    invited_by uuid,
    full_name text DEFAULT ''::text NOT NULL,
    email text,
    phone text,
    role text DEFAULT 'member'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    accepted_at timestamp with time zone,
    accepted_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT access_invites_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text, 'revoked'::text])))
);


--
-- Name: administrative_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.administrative_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    member_id uuid,
    requester_name text DEFAULT ''::text NOT NULL,
    request_type text DEFAULT 'solicitacao_geral'::text NOT NULL,
    description text,
    status text DEFAULT 'aberta'::text NOT NULL,
    assigned_to uuid,
    internal_notes text,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT administrative_requests_request_type_check CHECK ((request_type = ANY (ARRAY['declaracao_membro'::text, 'atualizacao_cadastral'::text, 'solicitacao_geral'::text, 'segunda_via'::text, 'contato_pastoral'::text]))),
    CONSTRAINT administrative_requests_status_check CHECK ((status = ANY (ARRAY['aberta'::text, 'em_analise'::text, 'aguardando_documento'::text, 'concluida'::text, 'rejeitada'::text])))
);


--
-- Name: assemblies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assemblies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    created_by uuid,
    title text NOT NULL,
    description text,
    period text,
    assembly_date date DEFAULT CURRENT_DATE NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    youtube_url text,
    is_visible boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: assembly_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assembly_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assembly_id uuid NOT NULL,
    title text NOT NULL,
    file_url text,
    file_type text,
    youtube_url text,
    attachment_type text DEFAULT 'document'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: campaign_contributions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_contributions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    member_id uuid,
    transaction_id uuid,
    contributed_by uuid,
    amount numeric(14,2) NOT NULL,
    gateway text DEFAULT 'demo'::text,
    gateway_fee_amount numeric(14,2) DEFAULT 0 NOT NULL,
    platform_fee_amount numeric(14,2) DEFAULT 0 NOT NULL,
    net_amount numeric(14,2) DEFAULT 0 NOT NULL,
    payment_status text DEFAULT 'confirmed'::text NOT NULL,
    payment_method text DEFAULT 'pix'::text,
    contributed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT campaign_contributions_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT campaign_contributions_gateway_fee_amount_check CHECK ((gateway_fee_amount >= (0)::numeric)),
    CONSTRAINT campaign_contributions_net_amount_check CHECK ((net_amount >= (0)::numeric)),
    CONSTRAINT campaign_contributions_payment_status_check CHECK ((payment_status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'failed'::text, 'refunded'::text]))),
    CONSTRAINT campaign_contributions_platform_fee_amount_check CHECK ((platform_fee_amount >= (0)::numeric))
);


--
-- Name: campaign_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    uploaded_by uuid,
    media_type text DEFAULT 'image'::text NOT NULL,
    storage_bucket text NOT NULL,
    storage_path text NOT NULL,
    public_url text,
    title text,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_cover boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT campaign_media_sort_order_check CHECK ((sort_order >= 0)),
    CONSTRAINT campaign_media_type_check CHECK ((media_type = ANY (ARRAY['image'::text, 'video'::text, 'document'::text])))
);


--
-- Name: campaign_updates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_updates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    created_by uuid,
    title text NOT NULL,
    content text,
    media_url text,
    update_type text DEFAULT 'progress'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    created_by uuid,
    approved_by uuid,
    title text NOT NULL,
    description text,
    type text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    goal_amount numeric(14,2) DEFAULT 0 NOT NULL,
    raised_amount numeric(14,2) DEFAULT 0 NOT NULL,
    start_date date,
    end_date date,
    cover_image_url text,
    visibility text DEFAULT 'organization'::text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_featured boolean DEFAULT false NOT NULL,
    allow_replies boolean DEFAULT false NOT NULL,
    CONSTRAINT campaigns_goal_amount_check CHECK ((goal_amount >= (0)::numeric)),
    CONSTRAINT campaigns_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT campaigns_raised_amount_check CHECK ((raised_amount >= (0)::numeric)),
    CONSTRAINT campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'closed'::text, 'archived'::text]))),
    CONSTRAINT campaigns_visibility_check CHECK ((visibility = ANY (ARRAY['organization'::text, 'hierarchy'::text, 'platform'::text])))
);


--
-- Name: communications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.communications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    communication_type text,
    is_public boolean DEFAULT true,
    target_role text,
    published_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    content text,
    document_type text DEFAULT 'Geral'::text NOT NULL,
    file_url text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone,
    location text,
    event_type text,
    is_public boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: finance_account_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_account_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT finance_account_categories_type_check CHECK ((type = ANY (ARRAY['receita'::text, 'despesa'::text])))
);


--
-- Name: finance_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    pix_key text,
    opening_balance numeric DEFAULT 0 NOT NULL,
    current_balance numeric DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT finance_accounts_type_check CHECK ((type = ANY (ARRAY['caixa'::text, 'banco'::text, 'pix'::text, 'especie'::text])))
);


--
-- Name: finance_cost_centers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_cost_centers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT finance_cost_centers_type_check CHECK ((type = ANY (ARRAY['matriz'::text, 'congregacao'::text, 'departamento'::text, 'evento'::text])))
);


--
-- Name: finance_monthly_closings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_monthly_closings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    month text NOT NULL,
    closed_by uuid,
    closed_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    CONSTRAINT finance_monthly_closings_month_check CHECK ((month ~ '^[0-9]{4}-[0-9]{2}$'::text))
);


--
-- Name: finance_transaction_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_transaction_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_id uuid,
    organization_id uuid NOT NULL,
    action text NOT NULL,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    old_data jsonb,
    new_data jsonb,
    CONSTRAINT finance_transaction_audit_logs_action_check CHECK ((action = ANY (ARRAY['insert'::text, 'update'::text, 'delete'::text])))
);


--
-- Name: group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    member_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT group_members_role_check CHECK ((role = ANY (ARRAY['member'::text, 'leader'::text, 'co_leader'::text])))
);


--
-- Name: group_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    author_user_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT group_messages_body_check CHECK ((char_length(TRIM(BOTH FROM body)) > 0))
);


--
-- Name: groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    group_type text,
    leader_member_id uuid,
    location text,
    meeting_day text,
    meeting_time text,
    is_active boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: internal_message_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.internal_message_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    thread_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    uploaded_by uuid,
    storage_bucket text DEFAULT 'internal-message-media'::text NOT NULL,
    storage_path text NOT NULL,
    public_url text,
    file_name text,
    file_type text,
    file_size bigint,
    duration_seconds integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: internal_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.internal_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    sender_user_id uuid,
    sender_member_id uuid,
    sender_role text,
    body text,
    message_type text DEFAULT 'text'::text NOT NULL,
    reply_to_message_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone,
    CONSTRAINT internal_messages_body_or_attachment CHECK (((body IS NOT NULL) OR (message_type <> 'text'::text))),
    CONSTRAINT internal_messages_type_check CHECK ((message_type = ANY (ARRAY['text'::text, 'image'::text, 'audio'::text, 'video'::text, 'document'::text, 'system'::text])))
);


--
-- Name: internal_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.internal_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    campaign_id uuid,
    member_id uuid,
    created_by uuid,
    assigned_to uuid,
    subject text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    source text DEFAULT 'general'::text NOT NULL,
    reply_enabled boolean DEFAULT true NOT NULL,
    last_message_at timestamp with time zone,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT internal_threads_source_check CHECK ((source = ANY (ARRAY['campaign'::text, 'community'::text, 'group'::text, 'pastoral'::text, 'finance'::text, 'secretariat'::text, 'prayer'::text, 'general'::text]))),
    CONSTRAINT internal_threads_status_check CHECK ((status = ANY (ARRAY['open'::text, 'pending'::text, 'answered'::text, 'closed'::text])))
);


--
-- Name: member_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token text DEFAULT encode(extensions.gen_random_bytes(24), 'hex'::text) NOT NULL,
    member_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    sector_id uuid,
    congregation_id uuid,
    invited_by uuid,
    role text DEFAULT 'member'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    accepted_at timestamp with time zone,
    accepted_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT member_invites_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text, 'revoked'::text])))
);


--
-- Name: members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    full_name text NOT NULL,
    member_role text,
    status text DEFAULT 'Ativo'::text NOT NULL,
    phone text,
    email text,
    address text,
    city text,
    state text,
    country_code text,
    birth_date date,
    baptized_at date,
    joined_at date,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    photo_url text,
    gender text,
    marital_status text,
    cpf text,
    rg text,
    rg_issuer text,
    rg_issue_date date,
    whatsapp text,
    zip_code text,
    street text,
    address_number text,
    address_complement text,
    neighborhood text,
    conversion_date date,
    administrative_role text,
    father_name text,
    mother_name text,
    spouse_name text,
    sector_id uuid,
    congregation_id uuid,
    civil_document_type text,
    civil_document_status text DEFAULT 'Pendente'::text,
    civil_document_url text,
    civil_document_notes text,
    civil_document_uploaded_at timestamp with time zone,
    civil_document_validated_at timestamp with time zone,
    civil_document_validated_by uuid,
    holy_spirit_baptism_date date,
    consecration_date date,
    CONSTRAINT members_status_check CHECK ((status = ANY (ARRAY['Ativo'::text, 'Inativo'::text, 'Visitante'::text, 'Congregado'::text, 'Transferido'::text, 'Falecido'::text, 'Em disciplina'::text, 'Disciplinado'::text, 'Afastado'::text])))
);


--
-- Name: COLUMN members.photo_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.photo_url IS 'URL da foto do membro — bucket avatars, path: members/{id}.{ext}';


--
-- Name: COLUMN members.gender; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.gender IS 'Sexo: Masculino | Feminino';


--
-- Name: COLUMN members.marital_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.marital_status IS 'Estado civil: Solteiro(a) | Casado(a) | Divorciado(a) | Viúvo(a) | Separado(a) | União Estável';


--
-- Name: COLUMN members.cpf; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.cpf IS 'CPF (texto livre, sem formatação obrigatória)';


--
-- Name: COLUMN members.rg; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.rg IS 'Número do RG';


--
-- Name: COLUMN members.rg_issuer; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.rg_issuer IS 'Órgão emissor do RG (ex: SSP/RS)';


--
-- Name: COLUMN members.rg_issue_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.rg_issue_date IS 'Data de emissão do RG';


--
-- Name: COLUMN members.whatsapp; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.whatsapp IS 'Número de WhatsApp (pode ser diferente do telefone)';


--
-- Name: COLUMN members.zip_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.zip_code IS 'CEP do endereço';


--
-- Name: COLUMN members.street; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.street IS 'Logradouro/rua';


--
-- Name: COLUMN members.address_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.address_number IS 'Número do endereço';


--
-- Name: COLUMN members.address_complement; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.address_complement IS 'Complemento do endereço';


--
-- Name: COLUMN members.neighborhood; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.neighborhood IS 'Bairro';


--
-- Name: COLUMN members.conversion_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.conversion_date IS 'Data de conversão/aceitação';


--
-- Name: COLUMN members.administrative_role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.administrative_role IS 'Cargo administrativo — separado da função eclesiástica';


--
-- Name: COLUMN members.father_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.father_name IS 'Nome do pai';


--
-- Name: COLUMN members.mother_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.mother_name IS 'Nome da mãe';


--
-- Name: COLUMN members.spouse_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.spouse_name IS 'Nome do cônjuge';


--
-- Name: COLUMN members.sector_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.sector_id IS 'Setor/Distrito onde o membro congrega';


--
-- Name: COLUMN members.congregation_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.congregation_id IS 'Congregação específica onde o membro congrega';


--
-- Name: COLUMN members.civil_document_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.civil_document_type IS 'Tipo de certidÃ£o exigida: CertidÃ£o de nascimento | CertidÃ£o de casamento | CertidÃ£o de divÃ³rcio';


--
-- Name: COLUMN members.civil_document_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.civil_document_status IS 'Status da documentaÃ§Ã£o civil: Pendente | Apresentado | Validado | Rejeitado';


--
-- Name: COLUMN members.civil_document_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.civil_document_url IS 'URL do arquivo/anexo da certidÃ£o (Supabase Storage ou externo)';


--
-- Name: COLUMN members.civil_document_notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.civil_document_notes IS 'ObservaÃ§Ãµes da secretaria sobre a documentaÃ§Ã£o civil';


--
-- Name: COLUMN members.civil_document_uploaded_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.civil_document_uploaded_at IS 'Data/hora em que o documento foi enviado';


--
-- Name: COLUMN members.civil_document_validated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.civil_document_validated_at IS 'Data/hora em que a secretaria validou o documento';


--
-- Name: COLUMN members.civil_document_validated_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.civil_document_validated_by IS 'UsuÃ¡rio (secretaria) que validou o documento';


--
-- Name: COLUMN members.holy_spirit_baptism_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.holy_spirit_baptism_date IS 'Data do batismo com o EspÃ­rito Santo (glossolalia)';


--
-- Name: COLUMN members.consecration_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.consecration_date IS 'Data de consagraÃ§Ã£o ministerial (Auxiliar, DiÃ¡cono, PresbÃ­tero, Evangelista, Pastor)';


--
-- Name: organization_affiliations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_affiliations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    affiliated_organization_id uuid,
    affiliation_type text DEFAULT 'fraterna'::text NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE organization_affiliations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.organization_affiliations IS 'Agrupamentos/vínculos laterais entre organizações (fraternas, grupos regionais, eventos).
   NÃO é relação parent/child hierárquica — não substitui Setor/Distrito.
   affiliation_type: fraterna | regional_group | event_group | pastoral_group';


--
-- Name: organization_hierarchy_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_hierarchy_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_type text NOT NULL,
    child_type text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE organization_hierarchy_rules; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.organization_hierarchy_rules IS 'REFERÊNCIA DOCUMENTACIONAL das regras de hierarquia organizacional.
   A validação executável está na função is_valid_organization_hierarchy().
   Esta tabela serve para documentação, auditoria e futura externalização das regras.';


--
-- Name: organization_responsibles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_responsibles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    responsibility_type text NOT NULL,
    user_id uuid NOT NULL,
    assigned_by uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE organization_responsibles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.organization_responsibles IS 'Responsáveis formais por unidade (pastor, secretário, tesoureiro, contato principal).
   Separado de organization_users (acesso) para distinguir responsabilidade titular de acesso operacional.
   responsibility_type: pastor_responsavel | secretario_responsavel | tesoureiro_responsavel | contato_principal';


--
-- Name: organization_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid,
    name text NOT NULL,
    slug text,
    organization_type text DEFAULT 'matriz'::text NOT NULL,
    city text,
    state text,
    country_code text DEFAULT 'BR'::text,
    language_code text DEFAULT 'pt-BR'::text,
    email text,
    phone text,
    logo_url text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    unit_status text DEFAULT 'Ativa'::text NOT NULL,
    denomination_type text,
    hierarchy_model text,
    top_level_label text,
    top_level_label_plural text,
    municipal_level_label text,
    municipal_level_label_plural text,
    intermediate_level_label text,
    intermediate_level_label_plural text,
    local_unit_label text,
    local_unit_label_plural text,
    uses_convention_level boolean,
    uses_municipal_level boolean,
    uses_intermediate_level boolean,
    uses_local_units boolean,
    zip_code text,
    street text,
    address_number text,
    address_complement text,
    neighborhood text,
    website_url text,
    has_operational_cashbox boolean DEFAULT true,
    is_financially_autonomous boolean DEFAULT false,
    financially_consolidates_to_id uuid,
    cnpj text,
    financial_policy_notes text
);


--
-- Name: COLUMN organizations.unit_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.unit_status IS 'Status operacional da unidade: Ativa | Em implantação | Inativa | Arquivada';


--
-- Name: COLUMN organizations.denomination_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.denomination_type IS 'Ex: "Assembleia de Deus", "Adventista", "Independente", "Church"';


--
-- Name: COLUMN organizations.hierarchy_model; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.hierarchy_model IS 'Ex: convention_matriz_intermediate_local | single_church | church_with_campuses | custom';


--
-- Name: COLUMN organizations.intermediate_level_label; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.intermediate_level_label IS 'Nome singular do nível intermediário. Ex: Setor, Distrito, Região, Área, Campo';


--
-- Name: COLUMN organizations.local_unit_label; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.local_unit_label IS 'Nome singular da unidade local. Ex: Congregação, Igreja local, Filial, Campus, Templo';


--
-- Name: COLUMN organizations.uses_intermediate_level; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.uses_intermediate_level IS 'Se false, a Matriz gerencia unidades locais diretamente (sem nível intermediário).';


--
-- Name: COLUMN organizations.zip_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.zip_code IS 'CEP ou código postal da unidade/organização.';


--
-- Name: COLUMN organizations.street; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.street IS 'Rua/logradouro da unidade/organização.';


--
-- Name: COLUMN organizations.address_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.address_number IS 'Número do endereço da unidade/organização.';


--
-- Name: COLUMN organizations.address_complement; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.address_complement IS 'Complemento do endereço da unidade/organização.';


--
-- Name: COLUMN organizations.neighborhood; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.neighborhood IS 'Bairro da unidade/organização.';


--
-- Name: COLUMN organizations.website_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.website_url IS 'Site institucional da unidade/organização.';


--
-- Name: COLUMN organizations.has_operational_cashbox; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.has_operational_cashbox IS 'Unidade opera caixa próprio (operacional). Padrão true.';


--
-- Name: COLUMN organizations.is_financially_autonomous; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.is_financially_autonomous IS 'Unidade tem autonomia financeira plena (não consolida para cima). Padrão false.';


--
-- Name: COLUMN organizations.financially_consolidates_to_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.financially_consolidates_to_id IS 'Referência da unidade para a qual esta consolida seu financeiro.';


--
-- Name: COLUMN organizations.cnpj; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.cnpj IS 'CNPJ da unidade (pessoa jurídica própria).';


--
-- Name: COLUMN organizations.financial_policy_notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.financial_policy_notes IS 'Notas de política financeira desta unidade.';


--
-- Name: platform_announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    short_description text NOT NULL,
    full_content text NOT NULL,
    target_type text DEFAULT 'global'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    image_url text,
    button_label text,
    button_link text,
    organization_id uuid,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_support_agent_departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_support_agent_departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_user_id uuid NOT NULL,
    department_id uuid NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE platform_support_agent_departments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.platform_support_agent_departments IS 'Vínculo entre agentes da plataforma e departamentos de suporte.';


--
-- Name: platform_support_agent_presence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_support_agent_presence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    status text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    metadata jsonb
);


--
-- Name: TABLE platform_support_agent_presence; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.platform_support_agent_presence IS 'Histórico de presença/status dos agentes de suporte.';


--
-- Name: platform_support_agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_support_agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    platform_role text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    current_status text DEFAULT 'offline'::text NOT NULL,
    last_seen_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    primary_department_id uuid,
    base_city text,
    base_state text,
    base_country text DEFAULT 'BR'::text,
    reference_church text,
    referred_by text,
    internal_notes text,
    credential_status text DEFAULT 'pending'::text NOT NULL,
    priority_region text
);


--
-- Name: TABLE platform_support_agents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.platform_support_agents IS 'Agentes da equipe de suporte da plataforma Ecclesia.';


--
-- Name: platform_support_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_support_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_user_id uuid NOT NULL,
    target_organization_id uuid,
    ticket_id uuid,
    module_key text,
    action text NOT NULL,
    entity_table text,
    entity_id uuid,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE platform_support_audit_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.platform_support_audit_logs IS 'Auditoria das ações de suporte/plataforma dentro de organizações atendidas.';


--
-- Name: platform_support_departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_support_departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    icon_key text,
    color_key text,
    module_keys text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE platform_support_departments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.platform_support_departments IS 'Departamentos dinâmicos de suporte da plataforma Ecclesia.';


--
-- Name: platform_support_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_support_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    platform_role text NOT NULL,
    module_key text NOT NULL,
    can_view boolean DEFAULT false NOT NULL,
    can_create boolean DEFAULT false NOT NULL,
    can_edit boolean DEFAULT false NOT NULL,
    can_delete boolean DEFAULT false NOT NULL,
    can_manage boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE platform_support_permissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.platform_support_permissions IS 'Matriz documentacional de permissões por perfil de suporte da plataforma.';


--
-- Name: platform_support_ticket_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_support_ticket_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    actor_user_id uuid,
    event_type text NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE platform_support_ticket_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.platform_support_ticket_events IS 'Histórico imutável de eventos dos chamados de suporte.';


--
-- Name: platform_support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    opened_by_user_id uuid,
    assigned_to_user_id uuid,
    department text NOT NULL,
    module_key text,
    title text NOT NULL,
    description text,
    status text DEFAULT 'open'::text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    department_id uuid
);


--
-- Name: TABLE platform_support_tickets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.platform_support_tickets IS 'Chamados de suporte abertos pelas organizações/clientes da plataforma.';


--
-- Name: COLUMN platform_support_tickets.department_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.platform_support_tickets.department_id IS 'Departamento dinâmico responsável pelo chamado. Mantém department text como fallback legado.';


--
-- Name: prayer_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prayer_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid,
    title text NOT NULL,
    description text,
    status text DEFAULT 'Ativo'::text,
    is_private boolean DEFAULT false,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT prayer_requests_status_check CHECK ((status = ANY (ARRAY['Ativo'::text, 'Respondido'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    full_name text,
    role_title text DEFAULT 'Membro'::text,
    phone text,
    email text,
    avatar_url text,
    platform_role text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: recommendation_letters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recommendation_letters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    member_id uuid,
    member_name text NOT NULL,
    member_email text,
    destination_church text NOT NULL,
    destination_city text NOT NULL,
    destination_state text,
    reason text NOT NULL,
    observations text,
    status text DEFAULT 'requested'::text NOT NULL,
    public_token uuid DEFAULT gen_random_uuid() NOT NULL,
    origin_church_name text DEFAULT ''::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    approved_at timestamp with time zone,
    reviewed_by uuid,
    approved_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT recommendation_letters_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'under_review'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: schedule_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    schedule_id uuid NOT NULL,
    member_id uuid NOT NULL,
    role text NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT schedule_assignments_role_check CHECK ((char_length(TRIM(BOTH FROM role)) > 0)),
    CONSTRAINT schedule_assignments_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'confirmado'::text, 'recusado'::text])))
);


--
-- Name: schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    schedule_date timestamp with time zone DEFAULT now() NOT NULL,
    ministry text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'rascunho'::text NOT NULL,
    schedule_time time without time zone,
    CONSTRAINT schedules_status_check CHECK ((status = ANY (ARRAY['rascunho'::text, 'publicada'::text, 'concluida'::text])))
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    description text NOT NULL,
    type text NOT NULL,
    amount numeric NOT NULL,
    status text DEFAULT 'Pendente'::text NOT NULL,
    category text NOT NULL,
    account_category_id uuid,
    cost_center_id uuid,
    financial_account_id uuid,
    responsible_id uuid,
    payment_method text,
    receipt_url text,
    notes text,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    campaign_id uuid,
    source_module text DEFAULT 'manual'::text,
    CONSTRAINT transactions_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT transactions_category_check CHECK ((length(TRIM(BOTH FROM category)) > 0)),
    CONSTRAINT transactions_type_check CHECK ((type = ANY (ARRAY['Entrada'::text, 'Saida'::text])))
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: worship_setlists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worship_setlists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    created_by uuid,
    title text NOT NULL,
    service_date date,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT worship_setlists_steps_is_array CHECK ((jsonb_typeof(steps) = 'array'::text))
);


--
-- Name: worship_songs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worship_songs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    created_by uuid,
    title text NOT NULL,
    lyrics text DEFAULT ''::text NOT NULL,
    musical_key text,
    category text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Data for Name: access_invites; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.access_invites (id, token, organization_id, invited_by, full_name, email, phone, role, status, expires_at, accepted_at, accepted_user_id, created_at) FROM stdin;
9028fdc8-8fb8-46fc-93f9-a239b4593c4f	4b2b13beffdabae7db66a8af8c5ee401fac3dd1fb7e152aa	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	Edson g roquete	dinhogoncalves987@gmail.com	54996842709	tesoureiro	accepted	2026-06-24 16:19:46.636624+00	2026-06-17 16:36:48.214098+00	129a8a20-1e51-4025-9d05-1516e48b188a	2026-06-17 16:19:46.636624+00
b83592ee-bdfa-4b8e-9839-14bd4eaf9da3	51b169ef9b989e5a0a247a274189469b9f0085c33b249ac3	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	Edson Gonçalves Roquete	dinhoroquete@gmail.com	\N	member	pending	2026-06-25 02:50:25.79654+00	\N	\N	2026-06-18 02:50:25.79654+00
3f89e71b-c319-462c-833e-22b31944d023	36df67a15b3f242328774b0047206675d654be4e73f8d2d3	c2364ea8-4057-453e-af72-d22ae6058b57	129a8a20-1e51-4025-9d05-1516e48b188a	teste teste	dinhogoncalves987@gmail.com	54996842709	pastor	pending	2026-06-30 21:56:53.014835+00	\N	\N	2026-06-23 21:56:53.014835+00
\.


--
-- Data for Name: administrative_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.administrative_requests (id, organization_id, member_id, requester_name, request_type, description, status, assigned_to, internal_notes, completed_at, created_at, updated_at) FROM stdin;
dd000015-0000-0000-0000-000000000001	10000000-0000-0000-0000-000000000002	\N	Marcos Antonio Bettega	declaracao_membro	Solicita declaração de membro ativo para fins de financiamento habitacional.	aberta	\N	\N	\N	2026-06-13 23:04:54.772+00	2026-06-15 23:04:55.918569+00
dd000015-0000-0000-0000-000000000003	10000000-0000-0000-0000-000000000002	\N	Paulo Antoniazzi	solicitacao_geral	Solicita informações sobre agenda de atendimento pastoral.	aberta	\N	\N	\N	2026-06-12 23:04:54.772+00	2026-06-15 23:04:55.918569+00
dd000015-0000-0000-0000-000000000004	10000000-0000-0000-0000-000000000002	\N	Ana Paula Zanella	segunda_via	Segunda via do cartão de membro. Original extraviado.	em_analise	\N	Aguardar confirmação de identidade presencial.	\N	2026-06-10 23:04:54.772+00	2026-06-15 23:04:55.918569+00
dd000015-0000-0000-0000-000000000005	10000000-0000-0000-0000-000000000002	\N	Leandro Basso	contato_pastoral	Precisa de orientação pastoral para situação familiar.	em_analise	\N	Agendado para conversa reservada.	\N	2026-06-11 23:04:54.772+00	2026-06-15 23:04:55.918569+00
dd000015-0000-0000-0000-000000000006	10000000-0000-0000-0000-000000000002	\N	Simone Polesso	atualizacao_cadastral	Atualização do estado civil após casamento em 03/05/2026.	em_analise	\N	\N	\N	2026-06-09 23:04:54.772+00	2026-06-15 23:04:55.918569+00
dd000015-0000-0000-0000-000000000007	10000000-0000-0000-0000-000000000002	\N	Rodrigo Maran	declaracao_membro	Declaração para apresentação em assembleia condominial.	aguardando_documento	\N	Solicitar foto 3x4 atualizada.	\N	2026-06-05 23:04:54.772+00	2026-06-15 23:04:55.918569+00
dd000015-0000-0000-0000-000000000008	10000000-0000-0000-0000-000000000002	\N	Cristiane Degasperi	segunda_via	Segunda via do histórico de batismo. Documento necessário para transferência.	aguardando_documento	\N	Membro deve trazer testemunho de dois membros antigos.	\N	2026-06-07 23:04:54.772+00	2026-06-15 23:04:55.918569+00
dd000015-0000-0000-0000-000000000009	10000000-0000-0000-0000-000000000002	\N	Thiago Volpato	atualizacao_cadastral	Atualização de dados por mudança de cidade. Nova cidade: Porto Alegre/RS.	concluida	\N	\N	2026-06-03 23:04:54.772+00	2026-06-01 23:04:54.772+00	2026-06-15 23:04:55.918569+00
dd000015-0000-0000-0000-00000000000a	10000000-0000-0000-0000-000000000002	\N	Camila Dallacosta	declaracao_membro	Declaração de membro para inscrição em curso de formação ministerial.	concluida	\N	\N	2026-06-08 23:04:54.772+00	2026-06-06 23:04:54.772+00	2026-06-15 23:04:55.918569+00
dd000015-0000-0000-0000-00000000000b	10000000-0000-0000-0000-000000000002	\N	Anderson Cominetto	contato_pastoral	Solicitou visita domiciliar após alta hospitalar.	concluida	\N	\N	2026-06-12 23:04:54.772+00	2026-06-02 23:04:54.772+00	2026-06-15 23:04:55.918569+00
dd000015-0000-0000-0000-00000000000c	10000000-0000-0000-0000-000000000002	\N	Elisangela Mantovani	solicitacao_geral	Solicitação de uso do salão para evento de casamento. Fora do padrão da política.	rejeitada	\N	Salão é exclusivo para atividades ministeriais.	2026-06-11 23:04:54.772+00	2026-06-09 23:04:54.772+00	2026-06-15 23:04:55.918569+00
dd000015-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000002	\N	Fernanda Tonetto	atualizacao_cadastral	Atualização de endereço e telefone após mudança de bairro.	aberta	\N	\N	2026-06-22 16:10:03.502+00	2026-06-14 23:04:54.772+00	2026-06-22 16:10:07.348281+00
\.


--
-- Data for Name: assemblies; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.assemblies (id, organization_id, created_by, title, description, period, assembly_date, starts_at, ends_at, youtube_url, is_visible, created_at, updated_at) FROM stdin;
aaaaaaaa-0000-0000-0000-000000000001	11111111-0000-0000-0000-000000000004	\N	Assembleia Geral Ordinária — Maio 2026	CONVOCAÇÃO\nA Congregação Jardim América, da Assembleia de Deus em Caxias do Sul/RS, convoca todos os membros e obreiros para a Assembleia Geral Ordinária, no dia 18 de maio de 2026, às 19h30, no Templo da Congregação, Caxias do Sul.\n\nPAUTA\n1. Abertura em oração e leitura bíblica\n2. Relatório pastoral do trimestre\n3. Prestação de contas da Tesouraria\n4. Organização dos ministérios para o 2º semestre de 2026\n5. Calendário de eventos congregacionais e missões locais\n6. Assuntos gerais e encaminhamentos\n\nDECISÕES REGISTRADAS\n• Aprovação do relatório financeiro apresentado pela Tesouraria\n• Autorização do calendário de cultos especiais de junho/2026\n• Reforço da mobilização da EBD e dos Pequenos Grupos (Jovens Resgate e Casais Ágape)\n• Encaminhamento à Secretaria para atualização cadastral dos membros ativos	2º Trimestre 2026	2026-05-18	\N	\N	\N	t	2026-06-05 19:24:47.926245+00	2026-06-05 19:27:54.714886+00
aaaaaaaa-0000-0000-0000-000000000002	11111111-0000-0000-0000-000000000004	\N	Assembleia Ministerial — Organização dos Ministérios	CONVOCAÇÃO\nReunião ministerial da Congregação Jardim América para alinhamento das lideranças de Louvor, Infantil, Jovens, Recepção, Intercessão e Mídia, em Caxias do Sul/RS.\n\nPAUTA\n1. Revisão das escalas de junho/2026\n2. Metas de discipulado por ministério\n3. Integração de novos obreiros\n4. Comunicação com a Secretaria AD Caxias do Sul\n\nDECISÕES REGISTRADAS\n• Confirmação das equipes de Louvor e Recepção para os cultos dominicais\n• Início da mobilização do Seminário de Liderança congregacional\n• Padronização dos relatórios mensais enviados à Secretaria	Maio 2026	2026-05-10	\N	\N	\N	t	2026-06-05 19:24:47.926245+00	2026-06-05 19:47:53.497066+00
dd00000d-0000-0000-0000-000000000001	10000000-0000-0000-0000-000000000002	\N	Assembleia Geral Ordinária 2025	Relatório pastoral/financeiro, eleição diretoria e aprovação construção novo templo.	\N	2025-11-28	2025-11-28 19:30:00+00	2025-11-28 22:30:00+00	\N	t	2026-06-15 21:46:47.925623+00	2026-06-15 21:46:47.925623+00
dd00000d-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000002	\N	Assembleia Extraordinária — Crédito de Obra	Votação para aprovação de crédito para aceleração da obra do novo templo.	\N	2026-03-15	2026-03-15 19:00:00+00	2026-03-15 21:30:00+00	\N	t	2026-06-15 21:46:47.925623+00	2026-06-15 21:46:47.925623+00
dd00000d-0000-0000-0000-000000000003	10000000-0000-0000-0000-000000000002	\N	Assembleia Geral Ordinária 2026	Relatório semestral, calendário de missões e plano de ação 2º semestre.	\N	2026-07-26	2026-07-26 19:00:00+00	2026-07-26 22:00:00+00	\N	t	2026-06-15 21:46:47.925623+00	2026-06-15 21:46:47.925623+00
\.


--
-- Data for Name: assembly_attachments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.assembly_attachments (id, assembly_id, title, file_url, file_type, youtube_url, attachment_type, created_at) FROM stdin;
aaaaaaaa-0000-0000-0000-000000000011	aaaaaaaa-0000-0000-0000-000000000001	Ata da Assembleia Geral Ordinária — Maio 2026	\N	\N	\N	minutes	2026-06-05 19:24:47.926245+00
aaaaaaaa-0000-0000-0000-000000000012	aaaaaaaa-0000-0000-0000-000000000001	Relatório Financeiro — 2º Trimestre 2026	\N	\N	\N	report	2026-06-05 19:24:47.926245+00
aaaaaaaa-0000-0000-0000-000000000021	aaaaaaaa-0000-0000-0000-000000000002	Ata da Assembleia Ministerial — Maio 2026	\N	\N	\N	minutes	2026-06-05 19:24:47.926245+00
aa2ef555-ac7d-4463-9d4e-55002870d48b	aaaaaaaa-0000-0000-0000-000000000002	teste 03	\N	png	\N	video	2026-06-05 19:47:43.573598+00
027311a2-0ff1-4ea3-8aa2-bedab841af7a	aaaaaaaa-0000-0000-0000-000000000001	Captura de tela 2024-09-04 195441	https://qkiiwopkbcslquyfhdec.supabase.co/storage/v1/object/public/assemblies/11111111-0000-0000-0000-000000000004/aaaaaaaa-0000-0000-0000-000000000001/1780690441845.png	png	\N	document	2026-06-05 20:14:01.379062+00
\.


--
-- Data for Name: campaign_contributions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.campaign_contributions (id, campaign_id, organization_id, member_id, transaction_id, contributed_by, amount, gateway, gateway_fee_amount, platform_fee_amount, net_amount, payment_status, payment_method, contributed_at, created_at) FROM stdin;
cccccccc-0000-0000-0000-000000000001	aaaaaaaa-0000-0000-0000-000000000001	11111111-0000-0000-0000-000000000002	22222222-0000-0000-0000-000000000004	88888888-0000-0000-0000-000000000011	00000000-0000-0000-0000-00000000b001	5000.00	demo	50.00	75.00	4875.00	confirmed	pix	2026-05-10 10:00:00+00	2026-06-08 19:00:29.312695+00
cccccccc-0000-0000-0000-000000000002	aaaaaaaa-0000-0000-0000-000000000002	11111111-0000-0000-0000-000000000002	22222222-0000-0000-0000-000000000008	88888888-0000-0000-0000-000000000012	00000000-0000-0000-0000-00000000b001	8500.00	demo	85.00	127.50	8287.50	confirmed	pix	2026-05-12 14:30:00+00	2026-06-08 19:00:29.312695+00
cccccccc-0000-0000-0000-000000000003	aaaaaaaa-0000-0000-0000-000000000003	11111111-0000-0000-0000-000000000002	22222222-0000-0000-0000-000000000002	88888888-0000-0000-0000-000000000013	00000000-0000-0000-0000-00000000b001	3200.00	demo	32.00	48.00	3120.00	confirmed	pix	2026-05-14 09:15:00+00	2026-06-08 19:00:29.312695+00
cccccccc-0000-0000-0000-000000000004	aaaaaaaa-0000-0000-0000-000000000004	11111111-0000-0000-0000-000000000004	22222222-0000-0000-0000-000000000010	88888888-0000-0000-0000-000000000014	00000000-0000-0000-0000-00000000b001	3500.00	demo	35.00	52.50	3412.50	confirmed	pix	2026-05-08 16:00:00+00	2026-06-08 19:00:29.312695+00
cccccccc-0000-0000-0000-000000000005	aaaaaaaa-0000-0000-0000-000000000005	11111111-0000-0000-0000-000000000002	22222222-0000-0000-0000-000000000005	88888888-0000-0000-0000-000000000015	00000000-0000-0000-0000-00000000b001	1200.00	demo	12.00	18.00	1170.00	confirmed	pix	2026-05-16 19:45:00+00	2026-06-08 19:00:29.312695+00
cccccccc-0000-0000-0000-000000000011	aaaaaaaa-0000-0000-0000-000000000001	11111111-0000-0000-0000-000000000002	22222222-0000-0000-0000-000000000001	\N	\N	107500.00	demo	1075.00	1612.50	104812.50	confirmed	pix	2026-04-20 12:00:00+00	2026-06-08 19:00:29.312695+00
cccccccc-0000-0000-0000-000000000012	aaaaaaaa-0000-0000-0000-000000000002	11111111-0000-0000-0000-000000000002	22222222-0000-0000-0000-000000000007	\N	\N	259900.00	demo	2599.00	3898.50	253402.50	confirmed	transfer	2026-04-25 10:00:00+00	2026-06-08 19:00:29.312695+00
cccccccc-0000-0000-0000-000000000013	aaaaaaaa-0000-0000-0000-000000000003	11111111-0000-0000-0000-000000000002	22222222-0000-0000-0000-000000000003	\N	\N	58000.00	demo	580.00	870.00	56550.00	confirmed	pix	2026-05-01 08:00:00+00	2026-06-08 19:00:29.312695+00
cccccccc-0000-0000-0000-000000000014	aaaaaaaa-0000-0000-0000-000000000004	11111111-0000-0000-0000-000000000004	22222222-0000-0000-0000-000000000006	\N	\N	31500.00	demo	315.00	472.50	30712.50	confirmed	pix	2026-05-05 15:00:00+00	2026-06-08 19:00:29.312695+00
cccccccc-0000-0000-0000-000000000015	aaaaaaaa-0000-0000-0000-000000000005	11111111-0000-0000-0000-000000000002	22222222-0000-0000-0000-000000000009	\N	\N	18600.00	demo	186.00	279.00	18135.00	confirmed	pix	2026-05-18 11:00:00+00	2026-06-08 19:00:29.312695+00
cccccccc-0000-0000-0000-000000000021	aaaaaaaa-0000-0000-0000-000000000006	11111111-0000-0000-0000-000000000002	22222222-0000-0000-0000-000000000003	\N	\N	78300.00	demo	783.00	1174.50	76342.50	confirmed	pix	2026-05-20 10:00:00+00	2026-06-08 20:25:37.117761+00
cccccccc-0000-0000-0000-000000000022	aaaaaaaa-0000-0000-0000-000000000007	11111111-0000-0000-0000-000000000002	22222222-0000-0000-0000-000000000009	\N	\N	31400.00	demo	314.00	471.00	30615.00	confirmed	pix	2026-05-22 15:00:00+00	2026-06-08 20:25:37.117761+00
cccccccc-0000-0000-0000-000000000023	aaaaaaaa-0000-0000-0000-000000000008	11111111-0000-0000-0000-000000000004	22222222-0000-0000-0000-000000000012	\N	\N	9600.00	demo	96.00	144.00	9360.00	confirmed	pix	2026-05-24 08:00:00+00	2026-06-08 20:25:37.117761+00
cccccccc-0000-0000-0000-000000000024	aaaaaaaa-0000-0000-0000-000000000009	11111111-0000-0000-0000-000000000002	22222222-0000-0000-0000-000000000002	\N	\N	4200.00	demo	42.00	63.00	4095.00	confirmed	pix	2026-05-17 12:00:00+00	2026-06-08 20:25:37.117761+00
\.


--
-- Data for Name: campaign_media; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.campaign_media (id, campaign_id, organization_id, uploaded_by, media_type, storage_bucket, storage_path, public_url, title, description, sort_order, is_cover, created_at) FROM stdin;
f2055ecf-3d48-4e40-91b3-5f301ec81df5	aaaaaaaa-0000-0000-0000-000000000008	11111111-0000-0000-0000-000000000004	3a7e972d-f9d5-417a-984c-3652d6c2f28f	image	campaign-media	11111111-0000-0000-0000-000000000004/aaaaaaaa-0000-0000-0000-000000000008/dd7a3d0e-df92-4b39-8605-0d4755a34aab.png	https://qkiiwopkbcslquyfhdec.supabase.co/storage/v1/object/public/campaign-media/11111111-0000-0000-0000-000000000004/aaaaaaaa-0000-0000-0000-000000000008/dd7a3d0e-df92-4b39-8605-0d4755a34aab.png	Captura de tela 2025-01-12 224715.png	\N	0	f	2026-06-08 22:49:22.324299+00
918bbe09-813d-4a4f-8d7a-219736cd23da	aaaaaaaa-0000-0000-0000-000000000008	11111111-0000-0000-0000-000000000004	3a7e972d-f9d5-417a-984c-3652d6c2f28f	image	campaign-media	11111111-0000-0000-0000-000000000004/aaaaaaaa-0000-0000-0000-000000000008/a28fd926-20d3-4d2e-825a-85ad69b045e6.png	https://qkiiwopkbcslquyfhdec.supabase.co/storage/v1/object/public/campaign-media/11111111-0000-0000-0000-000000000004/aaaaaaaa-0000-0000-0000-000000000008/a28fd926-20d3-4d2e-825a-85ad69b045e6.png	Captura de tela 2024-12-12 143621.png	\N	2	f	2026-06-08 22:49:55.144959+00
e0015e73-f8d2-43d7-9831-d643c93e016d	aaaaaaaa-0000-0000-0000-000000000008	11111111-0000-0000-0000-000000000004	3a7e972d-f9d5-417a-984c-3652d6c2f28f	image	campaign-media	11111111-0000-0000-0000-000000000004/aaaaaaaa-0000-0000-0000-000000000008/8959da66-c8b7-4bb0-909d-40f483b6e4f8.png	https://qkiiwopkbcslquyfhdec.supabase.co/storage/v1/object/public/campaign-media/11111111-0000-0000-0000-000000000004/aaaaaaaa-0000-0000-0000-000000000008/8959da66-c8b7-4bb0-909d-40f483b6e4f8.png	Captura de tela 2024-12-26 220128.png	\N	3	f	2026-06-08 22:50:02.432661+00
960fab8a-c2f6-4c34-a677-e1fcbfeb25b6	aaaaaaaa-0000-0000-0000-000000000008	11111111-0000-0000-0000-000000000004	3a7e972d-f9d5-417a-984c-3652d6c2f28f	document	campaign-media	11111111-0000-0000-0000-000000000004/aaaaaaaa-0000-0000-0000-000000000008/6f60070f-c52b-4e88-a70f-2ff03db276a5.pdf	https://qkiiwopkbcslquyfhdec.supabase.co/storage/v1/object/public/campaign-media/11111111-0000-0000-0000-000000000004/aaaaaaaa-0000-0000-0000-000000000008/6f60070f-c52b-4e88-a70f-2ff03db276a5.pdf	Vantagens-para-Investidores.pdf	\N	0	f	2026-06-08 22:53:05.43637+00
0fb59b15-79f6-4f0e-9627-87c1fd7244ec	aaaaaaaa-0000-0000-0000-000000000008	11111111-0000-0000-0000-000000000004	3a7e972d-f9d5-417a-984c-3652d6c2f28f	video	campaign-media	11111111-0000-0000-0000-000000000004/aaaaaaaa-0000-0000-0000-000000000008/f574615c-138b-41f1-b08e-5e623e220601.mp4	https://qkiiwopkbcslquyfhdec.supabase.co/storage/v1/object/public/campaign-media/11111111-0000-0000-0000-000000000004/aaaaaaaa-0000-0000-0000-000000000008/f574615c-138b-41f1-b08e-5e623e220601.mp4	video ex.mp4	\N	0	f	2026-06-08 22:54:47.209165+00
15f28566-3111-4ac7-8f5b-92563618b652	aaaaaaaa-0000-0000-0000-000000000006	11111111-0000-0000-0000-000000000004	3a7e972d-f9d5-417a-984c-3652d6c2f28f	image	campaign-media	11111111-0000-0000-0000-000000000004/aaaaaaaa-0000-0000-0000-000000000006/60009fa8-386e-4b02-b600-b0d36cba533c.jpg	https://qkiiwopkbcslquyfhdec.supabase.co/storage/v1/object/public/campaign-media/11111111-0000-0000-0000-000000000004/aaaaaaaa-0000-0000-0000-000000000006/60009fa8-386e-4b02-b600-b0d36cba533c.jpg	images[1].jpg	\N	0	t	2026-06-09 15:16:27.20241+00
\.


--
-- Data for Name: campaign_updates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.campaign_updates (id, campaign_id, organization_id, created_by, title, content, media_url, update_type, created_at) FROM stdin;
bbbbbbbb-0000-0000-0000-000000000001	aaaaaaaa-0000-0000-0000-000000000001	11111111-0000-0000-0000-000000000002	\N	Nova foto adicionada	Registro fotográfico da fachada em revitalização.	\N	media	2026-05-24 14:00:00+00
bbbbbbbb-0000-0000-0000-000000000002	aaaaaaaa-0000-0000-0000-000000000003	11111111-0000-0000-0000-000000000002	\N	Meta atingiu 50%	Campanha Missões África alcançou metade da meta financeira.	\N	progress	2026-05-22 10:30:00+00
bbbbbbbb-0000-0000-0000-000000000003	aaaaaaaa-0000-0000-0000-000000000004	11111111-0000-0000-0000-000000000004	\N	Prestação de contas publicada	Relatório de entrega de cobertores e cestas básicas disponível.	\N	accountability	2026-05-20 16:45:00+00
bbbbbbbb-0000-0000-0000-000000000004	aaaaaaaa-0000-0000-0000-000000000002	11111111-0000-0000-0000-000000000002	\N	Relatório fotográfico da obra	Avanço da alvenaria e cobertura da congregação São José.	\N	media	2026-05-18 09:15:00+00
bbbbbbbb-0000-0000-0000-000000000005	aaaaaaaa-0000-0000-0000-000000000005	11111111-0000-0000-0000-000000000002	\N	Inscrições abertas	Congresso de Jovens 2026 — inscrições pelo ministério.	\N	progress	2026-05-15 11:00:00+00
bbbbbbbb-0000-0000-0000-000000000006	aaaaaaaa-0000-0000-0000-000000000006	11111111-0000-0000-0000-000000000002	\N	Orçamento da van aprovado	Conselho missionário aprovou orçamento preliminar do veículo.	\N	progress	2026-05-25 11:00:00+00
bbbbbbbb-0000-0000-0000-000000000007	aaaaaaaa-0000-0000-0000-000000000007	11111111-0000-0000-0000-000000000002	\N	Meta atingiu 60%	Campanha de instrumentos alcançou 60% da meta.	\N	progress	2026-05-23 18:30:00+00
bbbbbbbb-0000-0000-0000-000000000008	aaaaaaaa-0000-0000-0000-000000000008	11111111-0000-0000-0000-000000000004	\N	Projeto apresentado à congregação	Capela de Oração 24h apresentada no culto de domingo.	\N	progress	2026-05-21 09:00:00+00
bbbbbbbb-0000-0000-0000-000000000009	aaaaaaaa-0000-0000-0000-000000000009	11111111-0000-0000-0000-000000000002	\N	Inscrições abrem em junho	Encontro de Mulheres 2026 — inscrições a partir de 01/06.	\N	progress	2026-05-19 14:00:00+00
\.


--
-- Data for Name: campaigns; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.campaigns (id, organization_id, created_by, approved_by, title, description, type, status, goal_amount, raised_amount, start_date, end_date, cover_image_url, visibility, priority, published_at, created_at, updated_at, is_featured, allow_replies) FROM stdin;
aaaaaaaa-0000-0000-0000-000000000008	11111111-0000-0000-0000-000000000004	\N	\N	Capela de Oração 24h	Projeto ministerial de capela de oração contínua na Congregação Jardim América: adequação do espaço, climatização e mobiliário.	projeto_ministerial	closed	28000.00	9600.00	2026-05-01	2026-12-01	/campaigns/prayer/prayer-06.jpg	organization	normal	2026-06-08 22:54:46.025+00	2026-06-08 20:25:37.117761+00	2026-06-26 17:10:21.840165+00	f	f
aaaaaaaa-0000-0000-0000-000000000006	11111111-0000-0000-0000-000000000002	\N	\N	Veículo para Missões Regionais	Aquisição de van para transporte de equipes missionárias, visitas a congregações do interior e ação social nas comunidades da região da Serra.	veiculos	active	165000.00	78300.00	2026-03-01	2026-10-15	\N	hierarchy	normal	2026-05-14 20:25:37.117761+00	2026-06-08 20:25:37.117761+00	2026-06-08 20:25:37.117761+00	f	f
aaaaaaaa-0000-0000-0000-000000000007	11111111-0000-0000-0000-000000000002	\N	\N	Instrumentos para Louvor	Renovação do parque de instrumentos do ministério de louvor: teclado, bateria, amplificadores e microfones sem fio para cultos e eventos.	instrumentos	active	52000.00	31400.00	2026-04-10	2026-07-20	\N	organization	normal	2026-05-21 20:25:37.117761+00	2026-06-08 20:25:37.117761+00	2026-06-08 20:25:37.117761+00	f	f
aaaaaaaa-0000-0000-0000-000000000009	11111111-0000-0000-0000-000000000002	\N	\N	Encontro de Mulheres 2026	Realização do Encontro de Mulheres com tema Mulheres de Fé — palestras, momentos de oração, ação social e kit para participantes.	evento	draft	22000.00	4200.00	2026-06-01	2026-09-05	\N	organization	low	2026-06-03 20:25:37.117761+00	2026-06-08 20:25:37.117761+00	2026-06-08 20:25:37.117761+00	f	f
aaaaaaaa-0000-0000-0000-000000000001	11111111-0000-0000-0000-000000000002	\N	\N	Reforma do Templo Central	Revitalização do templo da sede da Assembleia de Deus em Caxias do Sul: pintura externa, adequação elétrica, acessibilidade e salas de EBD.	reforma	active	180000.00	112500.00	2026-01-15	2026-09-30	\N	organization	high	2026-05-09 19:00:29.312695+00	2026-06-08 19:00:29.312695+00	2026-06-08 21:26:08.634536+00	t	f
d6b5e615-b6c2-4287-b4c7-d79a505090c0	11111111-0000-0000-0000-000000000004	3a7e972d-f9d5-417a-984c-3652d6c2f28f	\N	Ganhando Almas	A campanha Ganhando Almas tem como propósito fortalecer a evangelização e alcançar novas vidas para Cristo através de ações missionárias, visitas, distribuição de materiais evangelísticos, eventos e apoio aos voluntários envolvidos na obra. Os recursos arrecadados serão destinados à expansão das atividades evangelísticas, aquisição de materiais e suporte às equipes que atuam na proclamação do Evangelho. Nosso objetivo é levar esperança, fé e transformação a mais pessoas, cumprindo a missão de anunciar Jesus Cristo e fazer discípulos.	missoes	active	50000.00	0.00	2026-07-02	2026-08-02	\N	organization	high	2026-06-08 22:06:00.105+00	2026-06-08 22:06:02.371566+00	2026-06-08 22:06:02.371566+00	f	t
a6b3ec47-2a93-4b80-8537-79aef313d08b	11111111-0000-0000-0000-000000000004	3a7e972d-f9d5-417a-984c-3652d6c2f28f	\N	Ganhando Almas	A campanha Ganhando Almas tem como propósito fortalecer a evangelização e alcançar novas vidas para Cristo através de ações missionárias, visitas, distribuição de materiais evangelísticos, eventos e apoio aos voluntários envolvidos na obra. Os recursos arrecadados serão destinados à expansão das atividades evangelísticas, aquisição de materiais e suporte às equipes que atuam na proclamação do Evangelho. Nosso objetivo é levar esperança, fé e transformação a mais pessoas, cumprindo a missão de anunciar Jesus Cristo e fazer discípulos.	missoes	active	50000.00	0.00	2026-07-02	2026-08-02	\N	organization	high	2026-06-08 22:06:13.601+00	2026-06-08 22:06:14.622739+00	2026-06-08 22:06:14.622739+00	f	t
aaaaaaaa-0000-0000-0000-000000000002	11111111-0000-0000-0000-000000000002	\N	\N	Construção Congregação São José	Obra da nova congregação São José em Caxias do Sul/RS: fundação concluída, fase de alvenaria e cobertura.	construcao	active	420000.00	268400.00	2025-06-01	2027-03-15	\N	organization	normal	2026-04-09 19:00:29.312695+00	2026-06-08 19:00:29.312695+00	2026-06-08 19:00:29.312695+00	f	f
aaaaaaaa-0000-0000-0000-000000000003	11111111-0000-0000-0000-000000000002	\N	\N	Missões África	Envio de equipe missionária e apoio logístico para projetos de plantação de igrejas e ação social em Moçambique.	missoes	active	95000.00	61200.00	2026-02-01	2026-11-20	\N	hierarchy	normal	2026-04-24 19:00:29.312695+00	2026-06-08 19:00:29.312695+00	2026-06-08 19:00:29.312695+00	f	f
aaaaaaaa-0000-0000-0000-000000000004	11111111-0000-0000-0000-000000000004	\N	\N	Ação Social Inverno	Distribuição de cobertores, cestas básicas e kits de higiene para famílias em vulnerabilidade em Caxias do Sul.	acao_social	closed	35000.00	35000.00	2026-03-01	2026-06-30	\N	organization	normal	2026-03-10 19:00:29.312695+00	2026-06-08 19:00:29.312695+00	2026-06-08 19:00:29.312695+00	f	f
aaaaaaaa-0000-0000-0000-000000000005	11111111-0000-0000-0000-000000000002	\N	\N	Congresso de Jovens	Realização do Congresso de Jovens 2026 com palestras, workshops e mobilização dos ministérios Jovens Resgate da região.	congresso	active	48000.00	19800.00	2026-04-01	2026-08-10	\N	organization	normal	2026-05-19 19:00:29.312695+00	2026-06-08 19:00:29.312695+00	2026-06-08 19:00:29.312695+00	f	f
\.


--
-- Data for Name: communications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.communications (id, organization_id, title, content, communication_type, is_public, target_role, published_at, created_by, created_at, updated_at) FROM stdin;
44444444-0000-0000-0000-000000000001	11111111-0000-0000-0000-000000000004	Bem-vindos ao Ecclesia Admin	Prezados irmãos, com muito júbilo anunciamos a implantação do Ecclesia Admin — nosso novo sistema de gestão pastoral integrada. Acesse pelo computador ou celular para acompanhar eventos, comunicados, devocionais, financeiro e muito mais. Deus seja louvado por esta conquista!	Normal	t	\N	2026-05-19 09:00:00+00	\N	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
44444444-0000-0000-0000-000000000002	11111111-0000-0000-0000-000000000004	Seminário de Liderança — Inscrições Abertas	O Seminário de Liderança acontecerá no dia 06 de junho (sábado), das 9h às 17h, no Auditório Central. Palestrantes confirmados: Pr. Marcos Oliveira (RJ) e Pastora Ana Lima (SP). Vagas limitadas a 80 participantes. Inscrições na secretaria ou pelo app.	Importante	t	\N	2026-05-18 14:00:00+00	\N	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
44444444-0000-0000-0000-000000000003	11111111-0000-0000-0000-000000000004	Congresso de Oração e Missões — 13 e 14 de junho	Realizaremos nosso Congresso Anual de Oração e Missões com o tema "Até os Confins da Terra" (Atos 1:8). Programação: pregações, momentos de intercessão, testemunhos missionários e oferta especial para missões nacionais. Toda a família está convidada!	Importante	t	\N	2026-05-15 10:00:00+00	\N	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
44444444-0000-0000-0000-000000000004	11111111-0000-0000-0000-000000000004	Atualização de Cadastro — Prazo: 30 de maio	Solicitamos que todos os membros regularizem seu cadastro junto à secretaria até o dia 30 de maio. É necessário apresentar: documento oficial com foto e comprovante de residência atualizado. Horário de atendimento: segunda a sexta, 9h às 17h.	Normal	t	\N	2026-05-10 08:00:00+00	\N	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
8a61750d-72ba-4cc9-82b8-5c700af2e343	11111111-0000-0000-0000-000000000004	teste	teste	Normal	t	\N	2026-06-04 21:57:40.767+00	3a7e972d-f9d5-417a-984c-3652d6c2f28f	2026-06-04 21:57:39.101554+00	2026-06-04 21:57:39.101554+00
dd00000e-0000-0000-0000-000000000001	10000000-0000-0000-0000-000000000002	Campanha de Dízimos — Construção do Novo Templo	Irmãos, a obra do nosso novo templo avança. Participem da campanha de dízimos. Meta 2º semestre: R$ 80.000.	Importante	t	\N	2026-06-05 21:46:47.979+00	\N	2026-06-15 21:46:48.993186+00	2026-06-15 21:46:48.993186+00
dd00000e-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000002	Santa Ceia — 28 de Junho	Convidamos todos os membros em plena comunhão para a Santa Ceia, dia 28/06 às 19h. Venha preparado!	Normal	t	\N	2026-06-10 21:46:47.979+00	\N	2026-06-15 21:46:48.993186+00	2026-06-15 21:46:48.993186+00
dd00000e-0000-0000-0000-000000000003	10000000-0000-0000-0000-000000000002	Convocação: Reunião de Obreiros — 18/06	Presença obrigatória de todos os obreiros e líderes na reunião de planejamento do 2º semestre, 18/06 às 19h.	Importante	f	\N	2026-06-07 21:46:47.979+00	\N	2026-06-15 21:46:48.993186+00	2026-06-15 21:46:48.993186+00
dd00000e-0000-0000-0000-000000000004	10000000-0000-0000-0000-000000000002	Atualização de Cadastro — Prazo: 30/06	Membros devem atualizar cadastro na secretaria até 30/06. Documentos: foto + comprovante. Seg-Sex 9h–17h.	Normal	t	\N	2026-05-31 21:46:47.979+00	\N	2026-06-15 21:46:48.993186+00	2026-06-15 21:46:48.993186+00
dd00000e-0000-0000-0000-000000000005	10000000-0000-0000-0000-000000000002	Conferência de Jovens 2026 — Inscrições Abertas	Conferência de Jovens 2026 confirmada! Inscreva-se até 10/07. Vagas limitadas.	Normal	t	\N	2026-06-12 21:46:47.979+00	\N	2026-06-15 21:46:48.993186+00	2026-06-15 21:46:48.993186+00
\.


--
-- Data for Name: documents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.documents (id, organization_id, title, content, document_type, file_url, created_by, created_at, updated_at) FROM stdin;
a8297828-a38c-4de4-8b26-bdda174eb157	00000000-0000-0000-0000-0000000000a1	estudo-biblico-2026-03-30	Graça e paz! É um privilégio poder conversar com você sobre a Palavra de Deus.\n\nComo seu assistente bíblico, estou aqui para servir ao seu crescimento espiritual e ao seu ministério. A Bíblia nos diz em **Salmos 119:105**: *"Lâmpada para os meus pés é tua palavra e luz, para o meu caminho."* Meu objetivo é ajudar você a mergulhar nessa Luz.\n\n**Como posso ajudar você hoje?**\n\nAqui estão algumas sugestões do que podemos fazer:\n\n1.  **Esboço de Pregação:** Se você tem um tema ou versículo em mente, posso estruturar uma mensagem com introdução, tópicos exegéticos e conclusão.\n2.  **Estudo Bíblico:** Podemos analisar profundamente um livro da Bíblia, um personagem (como Davi, Paulo ou Rute) ou um tema teológico (como a Graça, a Justificação ou o Fruto do Espírito).\n3.  **Dúvidas Teológicas:** Tem dificuldade em entender algum texto difícil ou quer saber o contexto histórico de uma passagem?\n4.  **Aconselhamento Bíblico:** Procura passagens bíblicas para lidar com ansiedade, consolo, tomada de decisões ou vida familiar?\n5.  **Curiosidades:** Quer saber mais sobre os costumes dos tempos bíblicos, as línguas originais (Hebraico e Grego) ou geografia bíblica?\n\nSinta-se à vontade para perguntar o que estiver no seu coração. Que o Espírito Santo conduza nossa conversa!\n\n**O que você gostaria de estudar ou saber agora?**	Geral	\N	0f30d31a-27a8-40e1-ba0f-f8ef42f0666f	2026-05-19 17:25:34.821932+00	2026-05-19 17:25:34.821932+00
bc6190d9-457c-417e-a355-9fe3efd08d1b	00000000-0000-0000-0000-0000000000a1	Texto colado	• Added src\\pages\\JamesTraining.tsx (+551 -0)\r\n      1 +import { useState, useEffect, useCallback } from 'react'\r\n      2 +import AppLayout from '../components/AppLayout'\r\n      3 +import { supabase } from '../lib/supabase'\r\n      4 +import { useTenant } from '../contexts/TenantContext'\r\n      5 +\r\n      6 +type MemorySpeaker = 'sistema' | 'cliente' | 'estabelecimento' | 'edson'\r\n      7 +\r\n      8 +interface JamesMemoryRow {\r\n      9 +  id: string\r\n     10 +  tenant_id: string | null\r\n     11 +  speaker: MemorySpeaker\r\n     12 +  category: string | null\r\n     13 +  input: string\r\n     14 +  response: string\r\n     15 +  important: boolean\r\n     16 +  tags: string[] | null\r\n     17 +  created_at: string\r\n     18 +}\r\n     19 +\r\n     20 +interface Metrics {\r\n     21 +  total: number\r\n     22 +  important: number\r\n     23 +  strategic: number\r\n     24 +  recent: number\r\n     25 +}\r\n     26 +\r\n     27 +interface TrainingPreset {\r\n     28 +  title: string\r\n     29 +  category: string\r\n     30 +  input: string\r\n     31 +  response: string\r\n     32 +  important?: boolean\r\n     33 +  tags?: string[]\r\n     34 +}\r\n     35 +\r\n     36 +const JAMES_BASE_CONTEXT: TrainingPreset[] = [\r\n     37 +  {\r\n     38 +    title: 'O Nucleo',\r\n     39 +    category: 'negocio',\r\n     40 +    input: 'O que e O Nucleo?',\r\n     41 +    response: 'O Nucleo e a camada executiva de operacao da holding. Ele centraliza inteligencia, leitura de dados, campanhas, relacao come\r\n         rcial e decisao operacional.',\r\n     42 +    important: true,\r\n     43 +    tags: ['nucleo', 'posicionamento', 'executivo'],\r\n     44 +  },\r\n     45 +  {\r\n     46 +    title: 'The Beauty Hub',\r\n     47 +    category: 'negocio',\r\n     48 +    input: 'O que e The Beauty Hub?',\r\n     49 +    response: 'The Beauty Hub e a operacao principal validada neste piloto. O sistema organiza estabelecimentos, clientes, campanhas, afili\r\n         acao, cashback e acao comercial orientada por dados.',\r\n     50 +    important: true,\r\n     51 +    tags: ['beauty-hub', 'piloto', 'negocio'],\r\n     52 +  },\r\n     53 +  {\r\n     54 +    title: 'Fornecedor e estabelecimento',\r\n     55 +    category: 'estabelecimento',\r\n     56 +    input: 'Como funciona fornecedor ou estabelecimento dentro do sistema?',\r\n     57 +    response: 'Cada estabelecimento entra como unidade operacional da rede. O papel do James e apoiar cadastro, leitura de performance, ati\r\n         vacao de campanhas e recomendacao de proxima acao comercial.',\r\n     58 +    important: true,\r\n     59 +    tags: ['estabelecimento', 'fornecedor', 'operacao'],\r\n     60 +  },\r\n     61 +  {\r\n     62 +    title: 'Cliente',\r\n     63 +    category: 'cliente',\r\n     64 +    input: 'Como o sistema enxerga o cliente final?',\r\n     65 +    response: 'Cliente e ativo recorrente da operacao. O objetivo nao e apenas captar, mas aumentar retorno, frequencia, ticket e retencao\r\n         com mensagens objetivas e acao no momento certo.',\r\n     66 +    important: true,\r\n     67 +    tags: ['cliente', 'retencao', 'ticket'],\r\n     68 +  },\r\n     69 +  {\r\n     70 +    title: 'Afiliado e comissao',\r\n     71 +    category: 'negociacao',\r\n     72 +    input: 'Como funciona afiliado e comissao?',\r\n     73 +    response: 'Afiliado e um originador de demanda. O sistema precisa rastrear origem, conversao, GMV e comissao para mostrar impacto real\r\n         de parceria e evitar decisao baseada em achismo.',\r\n     74 +    important: true,\r\n     75 +    tags: ['afiliado', 'comissao', 'gmv'],\r\n     76 +  },\r\n     77 +  {\r\n     78 +    title: 'Cashback',\r\n     79 +    category: 'cliente',\r\n     80 +    input: 'Qual e o papel do cashback?',\r\n     81 +    response: 'Cashback nao e brinde. E mecanismo de reativacao e frequencia. O uso correto e empurrar recompra em janelas de baixa ocupaca\r\n         o e elevar o valor do ciclo do cliente.',\r\n     82 +    important: true,\r\n     83 +    tags: ['cashback', 'reativacao', 'frequencia'],\r\n     84 +  },\r\n     85 +  {\r\n     86 +    title: 'Campanhas',\r\n     87 +    category: 'operacao',\r\n     88 +    input: 'Qual e o objetivo das campanhas?',\r\n     89 +    response: 'Campanha existe para mover receita, ocupacao e retorno, nao para gerar ruido. James deve recomendar campanha com alvo claro,\r\n          momento certo e criterio de resultado.',\r\n     90 +    important: true,\r\n     91 +    tags: ['campanha', 'ocupacao', 'receita'],\r\n     92 +  },\r\n     93 +  {\r\n     94 +    title: 'Postura executiva',\r\n     95 +    category: 'comportamento',\r\n     96 +    input: 'Como James deve responder para diretoria e investidores?',\r\n     97 +    response: 'James responde como executivo digital. Linguagem curta, objetiva e estrategica. Sem tom de chatbot, sem rodeio, sem excesso\r\n         de gentileza e sempre com foco em decisao, risco, resultado e proxima acao.',\r\n     98 +    important: true,\r\n     99 +    tags: ['executivo', 'diretoria', 'investidor'],\r\n    100 +  },\r\n    101 +]\r\n    102 +\r\n    103 +const IDEAL_RESPONSE_EXAMPLES: TrainingPreset[] = [\r\n    104 +  {\r\n    105 +    title: 'Analise de negocio',\r\n    106 +    category: 'negocio',\r\n    107 +    input: 'Analise o negocio deste mes.',\r\n    108 +    response: 'O ponto central e conversao, nao volume. Se leads cresceram e receita nao acompanhou, o gargalo esta entre abordagem, oferta\r\n          e follow-up. Minha recomendacao e revisar a sequencia comercial e medir retorno por campanha.',\r\n    109 +    important: true,\r\n    110 +    tags: ['analise', 'receita', 'conversao'],\r\n    111 +  },\r\n    112 +  {\r\n    113 +    title: 'Proposta de campanha',\r\n    114 +    category: 'operacao',\r\n    115 +    input: 'Que campanha devemos rodar esta semana?',\r\n    116 +    response: 'Prioridade em reativacao da base morna com oferta simples e prazo curto. Campanha boa aqui e recuperar clientes de 30 a 60 d\r\n         ias sem retorno e medir agendamento gerado em vez de clique ou resposta.',\r\n    117 +    important: true,\r\n    118 +    tags: ['campanha', 'reativacao', 'agendamento'],\r\n    119 +  },\r\n    120 +  {\r\n    121 +    title: 'Leitura de dados',\r\n    122 +    category: 'calculo',\r\n    123 +    input: 'O que os dados estao dizendo?',\r\n    124 +    response: 'Os dados precisam responder tres pontos: onde a receita entra, onde trava e qual acao corrige isso rapido. Se eu nao tiver e\r\n         ssas tres respostas, falta contexto operacional e nao vale concluir antes.',\r\n    125 +    important: true,\r\n    126 +    tags: ['dados', 'analise', 'decisao'],\r\n    127 +  },\r\n    128 +  {\r\n    129 +    title: 'Sugestao de acao',\r\n    130 +    category: 'operacao',\r\n    131 +    input: 'Qual e a proxima acao recomendada?',\r\n    132 +    response: 'Minha sugestao e atacar a alavanca de menor custo e maior velocidade: reativar base existente, corrigir abordagem comercial\r\n         e rodar uma campanha com meta de agendamento. Expansao vem depois que a base responder.',\r\n    133 +    important: true,\r\n    134 +    tags: ['acao', 'prioridade', 'estrategia'],\r\n    135 +  },\r\n    136 +]\r\n    137 +\r\n    138 +function MetricCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {\r\n    139 +  return (\r\n    140 +    <div className="rounded-xl border p-5 flex flex-col gap-1"\r\n    141 +      style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>\r\n    142 +      <div className="flex items-center justify-between mb-1">\r\n    143 +        <span className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{label}</span>\r\n    144 +        <span className="text-lg">{icon}</span>\r\n    145 +      </div>\r\n    146 +      <span className="text-2xl font-bold" style={{ color: 'var(--text-main)' }}>{value}</span>\r\n    147 +    </div>\r\n    148 +  )\r\n    149 +}\r\n    150 +\r\n    151 +function Toast({ msg, type }: { msg: string; type: 'success' | 'error' }) {\r\n    152 +  return (\r\n    153 +    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border text-sm font-medium\r\n    154 +      ${type === 'success' ? 'bg-emerald-900/90 border-emerald-500/40 text-emerald-300' : 'bg-red-900/90 border-red-500/40 text-red-300'}`}\r\n         >\r\n    155 +      {type === 'success' ? 'OK' : 'ERRO'} {msg}\r\n    156 +    </div>\r\n    157 +  )\r\n    158 +}\r\n    159 +\r\n    160 +export default function JamesTraining() {\r\n    161 +  const { tenant } = useTenant()\r\n    162 +  const [memories, setMemories] = useState<JamesMemoryRow[]>([])\r\n    163 +  const [metrics, setMetrics] = useState<Metrics>({ total: 0, important: 0, strategic: 0, recent: 0 })\r\n    164 +  const [loading, setLoading] = useState(true)\r\n    165 +  const [saving, setSaving] = useState(false)\r\n    166 +  const [seeding, setSeeding] = useState(false)\r\n    167 +  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)\r\n    168 +  const [editId, setEditId] = useState<string | null>(null)\r\n    169 +  const [form, setForm] = useState({\r\n    170 +    speaker: 'sistema' as MemorySpeaker,\r\n    171 +    category: 'negocio',\r\n    172 +    input: '',\r\n    173 +    response: '',\r\n    174 +    tags: 'executivo,beauty-hub',\r\n    175 +    important: true,\r\n    176 +  })\r\n    177 +\r\n    178 +  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {\r\n    179 +    setToast({ msg, type })\r\n    180 +    setTimeout(() => setToast(null), 3000)\r\n    181 +  }\r\n    182 +\r\n    183 +  const fetchMemories = useCallback(async () => {\r\n    184 +    if (!tenant?.id) return\r\n    185 +    setLoading(true)\r\n    186 +    const { data, error } = await supabase\r\n    187 +      .from('james_memories')\r\n    188 +      .select('id, tenant_id, speaker, category, input, response, important, tags, created_at')\r\n    189 +      .eq('tenant_id', tenant.id)\r\n    190 +      .order('important', { ascending: false })\r\n    191 +      .order('created_at', { ascending: false })\r\n    192 +      .limit(150)\r\n    193 +\r\n    194 +    if (!error && data) {\r\n    195 +      const rows = data as JamesMemoryRow[]\r\n    196 +      setMemories(rows)\r\n    197 +      setMetrics({\r\n    198 +        total: rows.length,\r\n    199 +        important: rows.filter(r => r.important).length,\r\n    200 +        strategic: rows.filter(r => ['negocio', 'operacao', 'negociacao', 'calculo', 'comportamento'].includes(r.category ?? '')).length,\r\n    201 +        recent: rows.filter(r => Date.now() - new Date(r.created_at).getTime() < 86_400_000).length,\r\n    202 +      })\r\n    203 +    }\r\n    204 +    setLoading(false)\r\n    205 +  }, [tenant?.id])\r\n    206 +\r\n    207 +  useEffect(() => { void fetchMemories() }, [fetchMemories])\r\n    208 +\r\n    209 +  const resetForm = () => {\r\n    210 +    setEditId(null)\r\n    211 +    setForm({\r\n    212 +      speaker: 'sistema',\r\n    213 +      category: 'negocio',\r\n    214 +      input: '',\r\n    215 +      response: '',\r\n    216 +      tags: 'executivo,beauty-hub',\r\n    217 +      important: true,\r\n    218 +    })\r\n    219 +  }\r\n    220 +\r\n    221 +  const handleSave = async () => {\r\n    222 +    if (!tenant?.id) return\r\n    223 +    if (!form.input.trim() || !form.response.trim()) {\r\n    224 +      showToast('Preencha contexto e resposta ideal.', 'error')\r\n    225 +      return\r\n    226 +    }\r\n    227 +\r\n    228 +    setSaving(true)\r\n    229 +    const payload = {\r\n    230 +      tenant_id: tenant.id,\r\n    231 +      speaker: form.speaker,\r\n    232 +      category: form.category.trim() || null,\r\n    233 +      input: form.input.trim(),\r\n    234 +      response: form.response.trim(),\r\n    235 +      important: form.important,\r\n    236 +      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),\r\n    237 +    }\r\n    238 +\r\n    239 +    const { error } = editId\r\n    240 +      ? await supabase.from('james_memories').update(payload).eq('id', editId)\r\n    241 +      : await supabase.from('james_memories').insert([payload])\r\n    242 +\r\n    243 +    setSaving(false)\r\n    244 +    if (error) {\r\n    245 +      showToast(error.message, 'error')\r\n    246 +      return\r\n    247 +    }\r\n    248 +\r\n    249 +    showToast(editId ? 'Memoria executiva atualizada.' : 'Memoria executiva adicionada.')\r\n    250 +    resetForm()\r\n    251 +    void fetchMemories()\r\n    252 +  }\r\n    253 +\r\n    254 +  const handleEdit = (memory: JamesMemoryRow) => {\r\n    255 +    setEditId(memory.id)\r\n    256 +    setForm({\r\n    257 +      speaker: memory.speaker,\r\n    258 +      category: memory.category ?? 'geral',\r\n    259 +      input: memory.input,\r\n    260 +      response: memory.response,\r\n    261 +      tags: (memory.tags ?? []).join(', '),\r\n    262 +      important: memory.important,\r\n    263 +    })\r\n    264 +  }\r\n    265 +\r\n    266 +  const handleDelete = async (id: string) => {\r\n    267 +    if (!confirm('Apagar esta memoria executiva?')) return\r\n    268 +    const { error } = await supabase.from('james_memories').delete().eq('id', id)\r\n    269 +    if (error) {\r\n    270 +      showToast(error.message, 'error')\r\n    271 +      return\r\n    272 +    }\r\n    273 +    showToast('Memoria removida.')\r\n    274 +    void fetchMemories()\r\n    275 +  }\r\n    276 +\r\n    277 +  const insertPresetSet = async (presets: TrainingPreset[]) => {\r\n    278 +    if (!tenant?.id) return\r\n    279 +\r\n    280 +    const inputs = presets.map(p => p.input)\r\n    281 +    const { data: existing } = await supabase\r\n    282 +      .from('james_memories')\r\n    283 +      .select('input')\r\n    284 +      .eq('tenant_id', tenant.id)\r\n    285 +      .in('input', inputs)\r\n    286 +\r\n    287 +    const existingInputs = new Set((existing ?? []).map((row: { input: string }) => row.input))\r\n    288 +    const fresh = presets\r\n    289 +      .filter(p => !existingInputs.has(p.input))\r\n    290 +      .map(p => ({\r\n    291 +        tenant_id: tenant.id,\r\n    292 +        speaker: 'sistema' as const,\r\n    293 +        category: p.category,\r\n    294 +        input: p.input,\r\n    295 +        response: p.response,\r\n    296 +        important: p.important ?? true,\r\n    297 +        tags: p.tags ?? [],\r\n    298 +      }))\r\n    299 +\r\n    300 +    if (!fresh.length) {\r\n    301 +      showToast('Esse bloco ja esta carregado.')\r\n    302 +      return\r\n    303 +    }\r\n    304 +\r\n    305 +    const { error } = await supabase.from('james_memories').insert(fresh)\r\n    306 +    if (error) {\r\n    307 +      showToast(error.message, 'error')\r\n    308 +      return\r\n    309 +    }\r\n    310 +\r\n    311 +    showToast(`${fresh.length} memorias adicionadas.`)\r\n    312 +    void fetchMemories()\r\n    313 +  }\r\n    314 +\r\n    315 +  const handleSeedBaseContext = async () => {\r\n    316 +    setSeeding(true)\r\n    317 +    await insertPresetSet(JAMES_BASE_CONTEXT)\r\n    318 +    setSeeding(false)\r\n    319 +  }\r\n    320 +\r\n    321 +  const handleSeedExamples = async () => {\r\n    322 +    setSeeding(true)\r\n    323 +    await insertPresetSet(IDEAL_RESPONSE_EXAMPLES)\r\n    324 +    setSeeding(false)\r\n    325 +  }\r\n    326 +\r\n    327 +  const fieldClass = 'w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]'\r\n    328 +  const fieldStyle = { background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text-main)' }\r\n    329 +\r\n    330 +  return (\r\n    331 +    <AppLayout title="James Executive Training" subtitle="Contexto estrategico, posicionamento e memoria executiva do James">\r\n    332 +      {toast && <Toast msg={toast.msg} type={toast.type} />}\r\n    333 +\r\n    334 +      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">\r\n    335 +        <MetricCard label="Memorias" value={metrics.total} icon="MEM" />\r\n    336 +        <MetricCard label="Prioritarias" value={metrics.important} icon="TOP" />\r\n    337 +        <MetricCard label="Estrategicas" value={metrics.strategic} icon="ROI" />\r\n    338 +        <MetricCard label="Ultimas 24h" value={metrics.recent} icon="NOW" />\r\n    339 +      </div>\r\n    340 +\r\n    341 +      <div className="rounded-2xl p-6 mb-6" style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>\r\n    342 +        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">\r\n    343 +          <div>\r\n    344 +            <h2 className="text-sm font-bold" style={{ color: 'var(--text-main)' }}>Base executiva do James</h2>\r\n    345 +            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>\r\n    346 +              Este painel grava contexto no mesmo repositório consultado pelo James em produção. O objetivo aqui e posicionar o James como\r\n         executivo digital, nao como chatbot operacional.\r\n    347 +            </p>\r\n    348 +          </div>\r\n    349 +          <div className="flex gap-2 flex-wrap">\r\n    350 +            <button onClick={handleSeedBaseContext} disabled={seeding} className="btn-primary text-sm gap-2">\r\n    351 +              {seeding ? 'Carregando...' : 'Carregar contexto-base'}\r\n    352 +            </button>\r\n    353 +            <button onClick={handleSeedExamples} disabled={seeding} className="btn-secondary text-sm gap-2">\r\n    354 +              {seeding ? 'Carregando...' : 'Carregar respostas ideais'}\r\n    355 +            </button>\r\n    356 +          </div>\r\n    357 +        </div>\r\n    358 +\r\n    359 +        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">\r\n    360 +          <div className="rounded-xl p-4" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>\r\n    361 +            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--accent)' }}>Posicionamento</p>\r\n    362 +            <p className="text-sm" style={{ color: 'var(--text-main)', lineHeight: 1.6 }}>\r\n    363 +              James deve falar como executivo digital: direto, claro, estrategico, orientado a resultado, sem linguagem de chatbot e sem fl\r\n         oreio desnecessario.\r\n    364 +            </p>\r\n    365 +          </div>\r\n    366 +          <div className="rounded-xl p-4" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>\r\n    367 +            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--accent)' }}>Escopo de negocio</p>\r\n    368 +            <p className="text-sm" style={{ color: 'var(--text-main)', lineHeight: 1.6 }}>\r\n    369 +              O contexto cobre O Nucleo, The Beauty Hub, fornecedores, estabelecimentos, clientes, afiliacao, cashback, campanhas e leitura\r\n          de dados para decisao executiva.\r\n    370 +            </p>\r\n    371 +          </div>\r\n    372 +        </div>\r\n    373 +      </div>\r\n    374 +\r\n    375 +      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">\r\n    376 +        <div className="rounded-2xl p-6 space-y-4" style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>\r\n    377 +          <h2 className="text-sm font-bold" style={{ color: 'var(--text-main)' }}>\r\n    378 +            {editId ? 'Editar memoria executiva' : 'Criar memoria executiva'}\r\n    379 +          </h2>\r\n    380 +\r\n    381 +          <div className="grid grid-cols-2 gap-3">\r\n    382 +            <div>\r\n    383 +              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Speaker</label>\r\n    384 +              <select\r\n    385 +                value={form.speaker}\r\n    386 +                onChange={e => setForm(f => ({ ...f, speaker: e.target.value as MemorySpeaker }))}\r\n    387 +                className={fieldClass}\r\n    388 +                style={fieldStyle}\r\n    389 +              >\r\n    390 +                <option value="sistema">Sistema</option>\r\n    391 +                <option value="cliente">Cliente</option>\r\n    392 +                <option value="estabelecimento">Estabelecimento</option>\r\n    393 +                <option value="edson">Edson</option>\r\n    394 +              </select>\r\n    395 +            </div>\r\n    396 +            <div>\r\n    397 +              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Categoria</label>\r\n    398 +              <input\r\n    399 +                value={form.category}\r\n    400 +                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}\r\n    401 +                placeholder="negocio, operacao, cliente, negociacao"\r\n    402 +                className={fieldClass}\r\n    403 +                style={fieldStyle}\r\n    404 +              />\r\n    405 +            </div>\r\n    406 +          </div>\r\n    407 +\r\n    408 +          <div>\r\n    409 +            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Pergunta ou contexto</label>\r\n    410 +            <textarea\r\n    411 +              rows={3}\r\n    412 +              value={form.input}\r\n    413 +              onChange={e => setForm(f => ({ ...f, input: e.target.value }))}\r\n    414 +              placeholder="Ex: Como James deve responder para um investidor?"\r\n    415 +              className={`${fieldClass} resize-none`}\r\n    416 +              style={fieldStyle}\r\n    417 +            />\r\n    418 +          </div>\r\n    419 +\r\n    420 +          <div>\r\n    421 +            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Resposta ideal</label>\r\n    422 +            <textarea\r\n    423 +              rows={5}\r\n    424 +              value={form.response}\r\n    425 +              onChange={e => setForm(f => ({ ...f, response: e.target.value }))}\r\n    426 +              placeholder="Resposta executiva, curta, acionavel e com foco em negocio."\r\n    427 +              className={`${fieldClass} resize-none`}\r\n    428 +              style={fieldStyle}\r\n    429 +            />\r\n    430 +          </div>\r\n    431 +\r\n    432 +          <div>\r\n    433 +            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Tags</label>\r\n    434 +            <input\r\n    435 +              value={form.tags}\r\n    436 +              onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}\r\n    437 +              placeholder="executivo, estrategia, beauty-hub"\r\n    438 +              className={fieldClass}\r\n    439 +              style={fieldStyle}\r\n    440 +            />\r\n    441 +          </div>\r\n    442 +\r\n    443 +          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-main)' }}>\r\n    444 +            <input\r\n    445 +              type="checkbox"\r\n    446 +              checked={form.important}\r\n    447 +              onChange={e => setForm(f => ({ ...f, important: e.target.checked }))}\r\n    448 +            />\r\n    449 +            Priorizar esta memoria nas respostas do James\r\n    450 +          </label>\r\n    451 +\r\n    452 +          <div className="flex gap-2 pt-1">\r\n    453 +            <button\r\n    454 +              onClick={handleSave}\r\n    455 +              disabled={saving}\r\n    456 +              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40"\r\n    457 +              style={{ background: 'var(--gradient-accent)' }}\r\n    458 +            >\r\n    459 +              {saving ? 'Salvando...' : editId ? 'Atualizar memoria' : 'Salvar memoria'}\r\n    460 +            </button>\r\n    461 +            {editId && (\r\n    462 +              <button\r\n    463 +                onClick={resetForm}\r\n    464 +                className="px-4 py-2.5 rounded-xl text-sm transition-all"\r\n    465 +                style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}\r\n    466 +              >\r\n    467 +                Cancelar\r\n    468 +              </button>\r\n    469 +            )}\r\n    470 +          </div>\r\n    471 +        </div>\r\n    472 +\r\n    473 +        <div className="rounded-2xl p-6 space-y-4" style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>\r\n    474 +          <h2 className="text-sm font-bold" style={{ color: 'var(--text-main)' }}>Exemplos ideais de postura executiva</h2>\r\n    475 +          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>\r\n    476 +            Estes exemplos mostram o tom esperado: leitura de negocio, recomendacao objetiva, foco em resultado e proxima acao.\r\n    477 +          </p>\r\n    478 +\r\n    479 +          <div className="flex flex-col gap-3">\r\n    480 +            {IDEAL_RESPONSE_EXAMPLES.map(example => (\r\n    481 +              <div key={example.title} className="rounded-xl p-4" style={{ background: 'var(--surface-hover)', border: '1px solid var(--bor\r\n         der)' }}>\r\n    482 +                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--accent)' }}>{example.title}</p>\r\n    483 +                <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>{example.input}</p>\r\n    484 +                <p className="text-sm" style={{ color: 'var(--text-main)', lineHeight: 1.6 }}>{example.response}</p>\r\n    485 +              </div>\r\n    486 +            ))}\r\n    487 +          </div>\r\n    488 +        </div>\r\n    489 +      </div>\r\n    490 +\r\n    491 +      <div className="mt-6 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>\r\n    492 +        <div className="flex items-center justify-between px-5 py-3" style={{ background: 'var(--surface-card)', borderBottom: '1px solid v\r\n         ar(--border)' }}>\r\n    493 +          <h2 className="text-sm font-bold" style={{ color: 'var(--text-main)' }}>Memorias executivas salvas</h2>\r\n    494 +          <button onClick={() => void fetchMemories()} className="text-xs transition-colors" style={{ color: 'var(--accent)' }}>Atualizar</\r\n         button>\r\n    495 +        </div>\r\n    496 +\r\n    497 +        {loading ? (\r\n    498 +          <div className="text-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>Carregando...</div>\r\n    499 +        ) : memories.length === 0 ? (\r\n    500 +          <div className="text-center py-12 text-sm" style={{ color: 'var(--text-muted)', background: 'var(--surface-card)' }}>\r\n    501 +            Nenhuma memoria executiva cadastrada ainda.\r\n    502 +          </div>\r\n    503 +        ) : (\r\n    504 +          <table className="w-full text-sm" style={{ background: 'var(--surface-card)' }}>\r\n    505 +            <thead>\r\n    506 +              <tr className="text-xs uppercase tracking-wider" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)'\r\n          }}>\r\n    507 +                <th className="text-left px-5 py-3">Contexto</th>\r\n    508 +                <th className="text-left px-5 py-3 hidden md:table-cell">Resposta</th>\r\n    509 +                <th className="text-left px-5 py-3 hidden lg:table-cell">Categoria</th>\r\n    510 +                <th className="text-center px-5 py-3 hidden lg:table-cell">Prioridade</th>\r\n    511 +                <th className="text-right px-5 py-3">Acoes</th>\r\n    512 +              </tr>\r\n    513 +            </thead>\r\n    514 +            <tbody>\r\n    515 +              {memories.map(memory => (\r\n    516 +                <tr key={memory.id} className="group transition-colors" style={{ borderTop: '1px solid var(--border)' }}>\r\n    517 +                  <td className="px-5 py-3 max-w-[220px]">\r\n    518 +                    <p className="truncate text-xs" style={{ color: 'var(--text-main)' }}>{memory.input}</p>\r\n    519 +                  </td>\r\n    520 +                  <td className="px-5 py-3 max-w-[280px] hidden md:table-cell">\r\n    521 +                    <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>{memory.response}</p>\r\n    522 +                  </td>\r\n    523 +                  <td className="px-5 py-3 hidden lg:table-cell">\r\n    524 +                    <span className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: 'var(--border)', color: 'var(--accent)'\r\n          }}>\r\n    525 +                      {memory.category ?? 'geral'}\r\n    529 +                    <span className="text-xs font-bold" style={{ color: memory.important ? 'var(--gold)' : 'var(--text-muted)' }}>\r\n    530 +                      {memory.important ? 'ALTA' : 'NORMAL'}\r\n         00 hover:bg-red-800/50 transition-colors">\r\n    539 +                        Apagar\r\n    540 +                      </button>\r\n    541 +                    </div>\r\n    542 +                  </td>\r\n    543 +                </tr>\r\n    544 +              ))}\r\n    545 +            </tbody>\r\n    546 +          </table>\r\n    547 +        )}\r\n    548 +      </div>\r\n    549 +    </AppLayout>\r\n    550 +  )\r\n    551 +}\r\n\r\n─ Worked for 2m 08s ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\r\n\r\n• A página de treinamento foi convertida para trabalhar com a tabela real consumida pelo James. Vou rodar uma checagem rápida só no frontend para\r\n  garantir que não introduzi erro de tipagem nessa página.\r\n\r\n✔ You approved codex to run npx tsc -p tsconfig.app.json --noEmit this time\r\n\r\n• Ran npx tsc -p tsconfig.app.json --noEmit\r\n  └ src/lib/bubble.ts(67,26): error TS6133: 'T' is declared but its value is never read.\r\n    src/pages/ChipsMonitor.tsx(4,14): error TS6133: 'Plus' is declared but its value is never read.\r\n    … +2 lines\r\n    src/pages/Leads.tsx(65,7): error TS6133: 'VALIDATION_ICON' is declared but its value is never read.\r\n    src/pages/Leads.tsx(125,11): error TS6133: 'phones' is declared but its value is never read.\r\n\r\n────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\r\n\r\n• Atualizei src/pages/JamesTraining.tsx para virar um painel de treinamento real, sem tocar em backend, rotas ou infraestrutura.\r\n\r\n  O que mudou:\r\n\r\n  - a página agora usa a tabela real james_memories, que o James já consulta no backend\r\n  - troquei o modelo fake antigo por memórias executivas com os campos que o motor atual entende: tenant_id, speaker, category, input, response,\r\n    important, tags\r\n  - adicionei um contexto-base do James com:\r\n      - o que é O Núcleo\r\n      - o que é The Beauty Hub\r\n      - papel de estabelecimento, cliente, afiliado, cashback e campanha\r\n      - postura executiva esperada\r\n  - adicionei exemplos ideais de resposta para:\r\n      - análise de negócio\r\n      - campanha\r\n      - leitura de dados\r\n      - sugestão de ação\r\n  - incluí botões para carregar esse contexto-base e esses exemplos no banco sem quebrar o fluxo atual\r\n  - mantive edição manual de memória, agora alinhada ao uso real do James\r\n\r\n  Resultado prático:\r\n\r\n  - o James passa a poder usar esse posicionamento executivo via james_memories, sem mudança no motor\r\n  - o training deixa de ser um simulador isolado e vira fonte real de contexto\r\n\r\n  Verificação:\r\n\r\n  - rodei npx tsc -p tsconfig.app.json --noEmit\r\n  - os erros restantes são antigos e não vêm dessa alteração; não apareceu erro novo da página de treinamento\r\n\r\n  Se quiser, o próximo passo seguro é lapidar o conteúdo do contexto-base e dos exemplos para o tom exato que você quer para diretoria e\r\n  investidores.\r\n\r\n\r\n› Implement {feature}\r\n\r\n  gpt-5.4 default · 18% left · ~\\OneDrive\\Documentos\\the-beauty-hub-os	Geral	\N	0f30d31a-27a8-40e1-ba0f-f8ef42f0666f	2026-05-19 17:25:59.484341+00	2026-05-19 17:25:59.484341+00
c20c12ae-6f7f-4d0e-b97b-ec8486b68b1d	00000000-0000-0000-0000-0000000000a1	teste 02	conteudo de testes e de comparacao ao anterior	Geral	\N	0f30d31a-27a8-40e1-ba0f-f8ef42f0666f	2026-05-19 17:27:08.988177+00	2026-05-19 17:27:08.988177+00
181ff9ed-aa47-495b-87cd-858adf9e27df	00000000-0000-0000-0000-0000000000a1	teste 02	conteudo de testes e de comparacao ao anterior	Geral	\N	0f30d31a-27a8-40e1-ba0f-f8ef42f0666f	2026-05-19 17:27:09.457911+00	2026-05-19 17:27:09.457911+00
55555555-0000-0000-0000-000000000002	11111111-0000-0000-0000-000000000004	Ata de Reunião Ministerial — Maio 2026	ATA DE REUNIÃO MINISTERIAL\r\nAssembleia de Deus em Caxias do Sul — Congregação Jardim América\r\nData: 10 de maio de 2026 | Horário: 19h30 | Local: Salão de Reuniões\r\n\r\nPresentes: Pr. João Paulo Ferreira (Pastor), Fernanda Maria Alves (Secretaria), lideranças dos ministérios de Louvor, Infantil, Jovens, Recepção e Intercessão.\r\n\r\nPAUTA:\r\n1. Abertura em oração e leitura bíblica.\r\n2. Planejamento dos cultos e atividades de junho/2026 na sede de Caxias do Sul.\r\n3. Escalas ministeriais: confirmação das equipes de Louvor e Recepção.\r\n4. Mobilização da EBD e dos Pequenos Grupos (Jovens Resgate e Casais Ágape).\r\n5. Orientações da Secretaria sobre cadastro de membros e documentação congregacional.\r\n\r\nEncerramento às 21h00, com benção apostólica.\r\n\r\nPr. João Paulo Ferreira — Pastor\r\nFernanda Maria Alves — Secretaria AD Caxias do Sul / Congregação Jardim América	Ata	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-05 17:28:09.501145+00
55555555-0000-0000-0000-000000000001	11111111-0000-0000-0000-000000000004	Estatuto Interno — Assembleia de Deus Caxias do Sul	ESTATUTO INTERNO — CONGREGAÇÃO JARDIM AMÉRICA\r\nASSEMBLEIA DE DEUS EM CAXIAS DO SUL\r\n\r\nCAPÍTULO I — DA IDENTIFICAÇÃO\r\nArt. 1º — A Congregação Jardim América, localizada em Caxias do Sul/RS, é congregação da Assembleia de Deus em Caxias do Sul, entidade religiosa sem fins lucrativos, sob orientação pastoral e regimento interno da Secretaria administrativa da obra.\r\n\r\nCAPÍTULO II — DOS OBJETIVOS\r\nArt. 2º — São objetivos da Congregação:\r\na) Pregar o Evangelho de Jesus Cristo;\r\nb) Promover adoração, discipulado e santa comunhão;\r\nc) Servir à cidade de Caxias do Sul em missões e ação social.\r\n\r\nCAPÍTULO III — DOS MEMBROS\r\nArt. 3º — São membros os que confessam fé evangélica, são integrados pela liderança pastoral e acompanhados pela Secretaria da congregação.\r\n\r\nCAPÍTULO IV — DA ADMINISTRAÇÃO\r\nArt. 4º — A Congregação é administrada pelo Pastor local, pastores auxiliares, presbíteros, diáconos e lideranças ministeriais, em harmonia com a direção da Assembleia de Deus em Caxias do Sul.	Estatuto	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-05 17:28:09.501145+00
55555555-0000-0000-0000-000000000003	11111111-0000-0000-0000-000000000004	Manual de Integração de Novos Membros — AD Caxias do Sul	MANUAL DE INTEGRAÇÃO DE NOVOS MEMBROS\r\nAssembleia de Deus em Caxias do Sul — Congregação Jardim América\r\n\r\nBEM-VINDO À FAMÍLIA DE DEUS!\r\n\r\nA Secretaria da Congregação Jardim América preparou este material para ajudá-lo a integrar-se à vida congregacional da Assembleia de Deus em Caxias do Sul.\r\n\r\nNOSSA IDENTIDADE\r\nSomos uma congregação evangélica pentecostal, comprometida com a Palavra de Deus, a oração e a obra missionária na cidade de Caxias do Sul.\r\n\r\nMINISTÉRIOS DA CONGREGAÇÃO\r\n• Louvor e Adoração\r\n• Infantil\r\n• Jovens Resgate\r\n• Casais Ágape\r\n• Recepção e Acolhimento\r\n• Intercessão\r\n• Escola Bíblica Dominical\r\n\r\nPRIMEIROS PASSOS\r\n1. Participar do culto de boas-vindas\r\n2. Encontro com a liderança pastoral\r\n3. Cadastro na Secretaria (documento com foto e dados pessoais)\r\n4. Inscrição em um ministério ou pequeno grupo\r\n\r\nCONTATOS\r\nPastor João Paulo Ferreira — (11) 99999-0001\r\nSecretaria AD Caxias do Sul / Congregação Jardim América — seg a sex, 9h às 17h	Geral	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-05 17:28:09.501145+00
dd000009-0000-0000-0000-000000000001	10000000-0000-0000-0000-000000000002	Ata da Assembleia Geral Ordinária 2025	ATA DA ASSEMBLEIA GERAL ORDINÁRIA 2025 — Assembleia de Deus em Caxias do Sul. Data: 28/11/2025, 19h30, Templo Sede. Presentes: 87 membros. Pauta: relatório pastoral, financeiro, eleição diretoria, aprovação projeto de construção. Resultado: aprovado por unanimidade.	Ata	\N	\N	2026-06-15 21:46:42.279126+00	2026-06-16 21:53:27.197884+00
dd000009-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000002	Declaração de Membro — Sergio Bortolanza	DECLARAÇÃO DE MEMBRO. A Assembleia de Deus em Caxias do Sul declara que o Pr. Sergio Luiz Bortolanza é membro em plena comunhão desde 10/01/2010. Emitido para os devidos fins.	Declaração	\N	\N	2026-06-15 21:46:42.279126+00	2026-06-16 21:53:27.197884+00
dd000009-0000-0000-0000-000000000003	10000000-0000-0000-0000-000000000002	Estatuto Social — AD Caxias do Sul	ESTATUTO SOCIAL — ASSEMBLEIA DE DEUS EM CAXIAS DO SUL. Entidade religiosa sem fins lucrativos, Caxias do Sul, RS. Objetivos: pregar o Evangelho, promover adoração e discipulado, missões e ação social.	Estatuto	\N	\N	2026-06-15 21:46:42.279126+00	2026-06-16 21:53:27.197884+00
dd000009-0000-0000-0000-000000000004	10000000-0000-0000-0000-000000000002	Relatório Financeiro Semestral 1º Sem 2026	RELATÓRIO FINANCEIRO 1º SEMESTRE 2026. RECEITAS: Dízimos R$34.600, Ofertas R$9.850, Missões R$8.500, Construção R$18.200. TOTAL RECEITAS: R$71.150. DESPESAS: R$70.250. SALDO: R$900.	Relatório	\N	\N	2026-06-15 21:46:42.279126+00	2026-06-16 21:53:27.197884+00
dd000009-0000-0000-0000-000000000005	10000000-0000-0000-0000-000000000002	Autorização de Uso de Imagem — Ministério Infantil	AUTORIZAÇÃO DE USO DE IMAGEM. Autorizamos o uso da imagem de nosso filho(a) nas atividades do Ministério Infantil da Assembleia de Deus em Caxias do Sul, para fins eclesiásticos sem fins lucrativos.	Autorização	\N	\N	2026-06-15 21:46:42.279126+00	2026-06-16 21:53:27.197884+00
dd000009-0000-0000-0000-000000000006	10000000-0000-0000-0000-000000000002	Carta de Recomendação Arquivada — Fernanda Pasinato	CARTA DE RECOMENDAÇÃO ARQUIVADA. Emitida em 21/05/2026 para Fernanda Pasinato, destinada à Assembleia de Deus — Campinas — Florianópolis/SC. Aprovada e validada via Ecclesia Online — código DD000004.	Carta de Recomendação	\N	\N	2026-06-15 21:46:42.279126+00	2026-06-16 21:53:27.197884+00
\.


--
-- Data for Name: events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.events (id, organization_id, title, description, starts_at, ends_at, location, event_type, is_public, created_by, created_at, updated_at) FROM stdin;
33333333-0000-0000-0000-000000000001	11111111-0000-0000-0000-000000000004	Culto de Adoração — Domingo	\N	2026-05-24 10:00:00+00	2026-05-24 12:00:00+00	Templo Principal	bg-accent	t	\N	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
33333333-0000-0000-0000-000000000002	11111111-0000-0000-0000-000000000004	Culto da Família	\N	2026-05-24 19:00:00+00	2026-05-24 20:30:00+00	Templo Principal	bg-accent	t	\N	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
33333333-0000-0000-0000-000000000003	11111111-0000-0000-0000-000000000004	Culto de Oração — Quarta	\N	2026-05-27 19:30:00+00	2026-05-27 21:00:00+00	Salão de Reuniões	bg-primary	t	\N	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
33333333-0000-0000-0000-000000000004	11111111-0000-0000-0000-000000000004	Reunião de Jovens	\N	2026-05-30 19:00:00+00	2026-05-30 21:00:00+00	Salão dos Jovens	bg-primary	t	\N	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
33333333-0000-0000-0000-000000000005	11111111-0000-0000-0000-000000000004	Culto de Adoração — Domingo	\N	2026-05-31 10:00:00+00	2026-05-31 12:00:00+00	Templo Principal	bg-accent	t	\N	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
33333333-0000-0000-0000-000000000006	11111111-0000-0000-0000-000000000004	Seminário de Liderança	\N	2026-06-06 09:00:00+00	2026-06-06 17:00:00+00	Auditório Central	bg-success	t	\N	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
33333333-0000-0000-0000-000000000007	11111111-0000-0000-0000-000000000004	Culto de Adoração — Domingo	\N	2026-06-07 10:00:00+00	2026-06-07 12:00:00+00	Templo Principal	bg-accent	t	\N	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
33333333-0000-0000-0000-000000000008	11111111-0000-0000-0000-000000000004	Congresso de Oração e Missões	\N	2026-06-13 19:00:00+00	2026-06-14 18:00:00+00	Templo Principal	bg-success	t	\N	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
33333333-0000-0000-0000-000000000009	11111111-0000-0000-0000-000000000004	Culto de Adoração — Domingo	\N	2026-06-14 10:00:00+00	2026-06-14 12:00:00+00	Templo Principal	bg-accent	t	\N	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
33333333-0000-0000-0000-000000000010	11111111-0000-0000-0000-000000000004	Culto de Aniversário da Igreja	\N	2026-06-21 10:00:00+00	2026-06-21 13:00:00+00	Templo Principal	bg-accent	t	\N	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
33333333-0000-0000-0000-000000000011	11111111-0000-0000-0000-000000000004	Retiro de Casais	\N	2026-06-27 08:00:00+00	2026-06-29 18:00:00+00	Centro de Retiros Betânia	bg-primary	t	\N	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
dd00000a-0000-0000-0000-000000000001	10000000-0000-0000-0000-000000000002	Culto de Ensino — Domingo	Tema: Fé que move montanhas.	2026-06-21 10:00:00+00	2026-06-21 12:00:00+00	Templo Sede	bg-accent	t	\N	2026-06-15 21:46:43.317395+00	2026-06-15 21:46:43.317395+00
dd00000a-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000002	Reunião de Obreiros	Reunião mensal de planejamento com obreiros da Matriz.	2026-06-18 19:00:00+00	2026-06-18 21:00:00+00	Salão Paroquial	bg-primary	f	\N	2026-06-15 21:46:43.317395+00	2026-06-15 21:46:43.317395+00
dd00000a-0000-0000-0000-000000000003	10000000-0000-0000-0000-000000000002	Escola Bíblica Dominical	Estudo por faixa etária. Tema: Epístola aos Romanos.	2026-06-22 09:00:00+00	2026-06-22 10:00:00+00	Salas de Ensino	bg-success	t	\N	2026-06-15 21:46:43.317395+00	2026-06-15 21:46:43.317395+00
dd00000a-0000-0000-0000-000000000004	10000000-0000-0000-0000-000000000002	Ensaio do Louvor	Ensaio semanal da equipe de louvor e músicos.	2026-06-17 19:30:00+00	2026-06-17 21:30:00+00	Templo Sede	bg-primary	f	\N	2026-06-15 21:46:43.317395+00	2026-06-15 21:46:43.317395+00
dd00000a-0000-0000-0000-000000000005	10000000-0000-0000-0000-000000000002	Atendimento Pastoral	Atendimento individual mediante agendamento.	2026-06-19 14:00:00+00	2026-06-19 18:00:00+00	Sala Pastoral	bg-accent	f	\N	2026-06-15 21:46:43.317395+00	2026-06-15 21:46:43.317395+00
dd00000a-0000-0000-0000-000000000006	10000000-0000-0000-0000-000000000002	Santa Ceia	Celebração da Santa Ceia no culto da família.	2026-06-28 19:00:00+00	2026-06-28 21:00:00+00	Templo Sede	bg-success	t	\N	2026-06-15 21:46:43.317395+00	2026-06-15 21:46:43.317395+00
dd00000a-0000-0000-0000-000000000007	10000000-0000-0000-0000-000000000002	Reunião da Secretaria	Reunião administrativa mensal.	2026-06-25 14:00:00+00	2026-06-25 16:00:00+00	Sala Secretaria	bg-primary	f	\N	2026-06-15 21:46:43.317395+00	2026-06-15 21:46:43.317395+00
dd00000a-0000-0000-0000-000000000008	10000000-0000-0000-0000-000000000002	Culto de Oração — Quarta	Culto de oração e intercessão semanal.	2026-06-25 19:30:00+00	2026-06-25 21:00:00+00	Templo Sede	bg-accent	t	\N	2026-06-15 21:46:43.317395+00	2026-06-15 21:46:43.317395+00
\.


--
-- Data for Name: finance_account_categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.finance_account_categories (id, organization_id, code, name, type, is_system, is_active, created_at, updated_at) FROM stdin;
e66fa45e-a404-4f76-8539-ae20a3695324	00000000-0000-0000-0000-0000000000a1	1.01	Dizimos	receita	t	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
fdd20f0a-01e3-41b5-aeaa-a7f119b32c35	00000000-0000-0000-0000-0000000000a1	1.02	Ofertas	receita	t	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
58d7f923-d5ba-4b17-908e-021c2cfea518	00000000-0000-0000-0000-0000000000a1	1.03	Campanhas	receita	t	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
e9d32e03-c0c7-478a-835a-9146459d2b50	00000000-0000-0000-0000-0000000000a1	1.04	Missoes	receita	t	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
530dccb3-f4ce-4ecf-bef4-d5341c5a8b64	00000000-0000-0000-0000-0000000000a1	1.05	Eventos	receita	t	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
b2f97607-3f48-41ed-a174-8c2509fc4f92	00000000-0000-0000-0000-0000000000a1	2.01	Administrativo	despesa	t	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
7197ab15-720f-4ef3-9dad-b8c46ac8e9cb	00000000-0000-0000-0000-0000000000a1	2.02	Manutencao	despesa	t	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
a5a52231-81cb-4c3e-8d0e-c525e81a781c	00000000-0000-0000-0000-0000000000a1	2.03	Folha/Pastoral	despesa	t	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
2fd729ce-2a65-409d-8a73-d4f8d9ed823f	00000000-0000-0000-0000-0000000000a1	2.04	Missoes	despesa	t	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
54be0236-8601-4b31-8fc7-4fada4ed0748	00000000-0000-0000-0000-0000000000a1	2.05	Eventos	despesa	t	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
02d4f18c-23c1-46d9-a268-22056bef018f	00000000-0000-0000-0000-0000000000b1	1.01	Dizimos	receita	t	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
794aaa6d-3095-427d-bb93-5bd0d78df45f	00000000-0000-0000-0000-0000000000b1	1.02	Ofertas	receita	t	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
55286482-1fd6-4fbe-a87c-51a094af4108	00000000-0000-0000-0000-0000000000b1	1.03	Campanhas	receita	t	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
f9405a90-0254-4b0c-a863-2502ca71b86f	00000000-0000-0000-0000-0000000000b1	1.04	Missoes	receita	t	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
c6a99c0e-d210-4e0f-b9d0-383fa43c130b	00000000-0000-0000-0000-0000000000b1	1.05	Eventos	receita	t	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
1289e17f-53b2-454a-93dc-043705a01020	00000000-0000-0000-0000-0000000000b1	2.01	Administrativo	despesa	t	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
597439fa-232c-4b9c-9fc3-ef14cbec3537	00000000-0000-0000-0000-0000000000b1	2.02	Manutencao	despesa	t	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
d078edb1-1915-4f9f-a321-cabcdcc9767f	00000000-0000-0000-0000-0000000000b1	2.03	Folha/Pastoral	despesa	t	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
d533c32c-d9b5-4321-b757-778c9ce3b6bc	00000000-0000-0000-0000-0000000000b1	2.04	Missoes	despesa	t	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
89210ad3-57e8-4c7a-82d7-fd74338e748f	00000000-0000-0000-0000-0000000000b1	2.05	Eventos	despesa	t	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
19892475-21c9-483c-aece-3160ba7fe75c	00000000-0000-0000-0000-0000000000a1	RLS-super_admin	RLS Category super_admin	receita	f	t	2026-05-13 02:44:40.059356+00	2026-05-13 02:44:40.059356+00
2f0bb1a8-6b35-4db3-96de-b6c17a2d865a	00000000-0000-0000-0000-0000000000a1	RLS-platform_admin	RLS Category platform_admin	receita	f	t	2026-05-13 02:44:40.059356+00	2026-05-13 02:44:40.059356+00
7704521f-8b34-495d-a2bb-0165a27f041a	00000000-0000-0000-0000-0000000000a1	RLS-church_admin	RLS Category church_admin	receita	f	t	2026-05-13 02:44:40.059356+00	2026-05-13 02:44:40.059356+00
9509570e-2999-48b8-8898-cfea38bda71f	00000000-0000-0000-0000-0000000000a1	RLS-tesoureiro	RLS Category tesoureiro	receita	f	t	2026-05-13 02:44:40.059356+00	2026-05-13 02:44:40.059356+00
c93177a4-d4be-4810-babb-a0f5183754a1	d4fb8a81-e301-42ae-8ba6-f8b2aa026278	1.01	Dizimos	receita	t	t	2026-05-14 18:01:17.621546+00	2026-05-14 18:01:17.621546+00
bb64ac00-29c2-40d0-bec6-fd75cedfcceb	d4fb8a81-e301-42ae-8ba6-f8b2aa026278	1.02	Ofertas	receita	t	t	2026-05-14 18:01:17.621546+00	2026-05-14 18:01:17.621546+00
d74fb05c-9446-409d-9c0d-6125f32a29e8	d4fb8a81-e301-42ae-8ba6-f8b2aa026278	1.03	Campanhas	receita	t	t	2026-05-14 18:01:17.621546+00	2026-05-14 18:01:17.621546+00
c5dc18e4-7f35-4501-8071-3b92fa7d5e5d	d4fb8a81-e301-42ae-8ba6-f8b2aa026278	1.04	Missoes	receita	t	t	2026-05-14 18:01:17.621546+00	2026-05-14 18:01:17.621546+00
ad32b170-fdcb-4bf4-9d39-00dbf0328c45	d4fb8a81-e301-42ae-8ba6-f8b2aa026278	1.05	Eventos	receita	t	t	2026-05-14 18:01:17.621546+00	2026-05-14 18:01:17.621546+00
371aab5f-c5b3-42e3-9219-44a1c758d68b	d4fb8a81-e301-42ae-8ba6-f8b2aa026278	2.01	Administrativo	despesa	t	t	2026-05-14 18:01:17.621546+00	2026-05-14 18:01:17.621546+00
70a2536d-7e3a-40b4-81cc-4f153f48f0bf	d4fb8a81-e301-42ae-8ba6-f8b2aa026278	2.02	Manutencao	despesa	t	t	2026-05-14 18:01:17.621546+00	2026-05-14 18:01:17.621546+00
a0ce6e98-61a4-49fc-a382-2c8612208f77	d4fb8a81-e301-42ae-8ba6-f8b2aa026278	2.03	Folha/Pastoral	despesa	t	t	2026-05-14 18:01:17.621546+00	2026-05-14 18:01:17.621546+00
e6e71116-c62f-45d8-84a7-eadc9204ec1b	d4fb8a81-e301-42ae-8ba6-f8b2aa026278	2.04	Missoes	despesa	t	t	2026-05-14 18:01:17.621546+00	2026-05-14 18:01:17.621546+00
90a49108-b746-43dd-8f91-d8a46bb1d9be	d4fb8a81-e301-42ae-8ba6-f8b2aa026278	2.05	Eventos	despesa	t	t	2026-05-14 18:01:17.621546+00	2026-05-14 18:01:17.621546+00
43015ef1-49fc-4cfd-8e35-7a0ec9e5be1e	a26456f5-9140-438c-9bd3-755ac06bf804	1.01	Dizimos	receita	t	t	2026-05-14 18:02:07.592224+00	2026-05-14 18:02:07.592224+00
56c63cee-430a-4704-ae89-a56ca12133e3	a26456f5-9140-438c-9bd3-755ac06bf804	1.02	Ofertas	receita	t	t	2026-05-14 18:02:07.592224+00	2026-05-14 18:02:07.592224+00
ebfd4f43-181f-48d0-9eed-824216a694df	a26456f5-9140-438c-9bd3-755ac06bf804	1.03	Campanhas	receita	t	t	2026-05-14 18:02:07.592224+00	2026-05-14 18:02:07.592224+00
010062a4-476f-4d9f-aab3-cff0ad33f2eb	a26456f5-9140-438c-9bd3-755ac06bf804	1.04	Missoes	receita	t	t	2026-05-14 18:02:07.592224+00	2026-05-14 18:02:07.592224+00
40d89834-8709-45ab-9f16-34b6b3508784	a26456f5-9140-438c-9bd3-755ac06bf804	1.05	Eventos	receita	t	t	2026-05-14 18:02:07.592224+00	2026-05-14 18:02:07.592224+00
2df8ce8b-a6c2-4ec1-989f-64166c111564	a26456f5-9140-438c-9bd3-755ac06bf804	2.01	Administrativo	despesa	t	t	2026-05-14 18:02:07.592224+00	2026-05-14 18:02:07.592224+00
b7ec4f2f-4d32-44af-9e5c-0a2f3c59c751	a26456f5-9140-438c-9bd3-755ac06bf804	2.02	Manutencao	despesa	t	t	2026-05-14 18:02:07.592224+00	2026-05-14 18:02:07.592224+00
2039999e-bb69-499e-ad40-08e976403279	a26456f5-9140-438c-9bd3-755ac06bf804	2.03	Folha/Pastoral	despesa	t	t	2026-05-14 18:02:07.592224+00	2026-05-14 18:02:07.592224+00
c7689b96-1509-477e-832d-d4a722c6bddd	a26456f5-9140-438c-9bd3-755ac06bf804	2.04	Missoes	despesa	t	t	2026-05-14 18:02:07.592224+00	2026-05-14 18:02:07.592224+00
567958d7-5c0a-43a3-9429-cfddeda75f7f	a26456f5-9140-438c-9bd3-755ac06bf804	2.05	Eventos	despesa	t	t	2026-05-14 18:02:07.592224+00	2026-05-14 18:02:07.592224+00
ef989f88-6bcc-49ed-8eb0-8032aa6d1b05	659de9d8-8220-4349-b606-67037f2fd7ab	1.01	Dizimos	receita	t	t	2026-05-18 21:38:14.137103+00	2026-05-18 21:38:14.137103+00
d632dcd6-adfd-42fb-977f-4a5f18d28509	659de9d8-8220-4349-b606-67037f2fd7ab	1.02	Ofertas	receita	t	t	2026-05-18 21:38:14.137103+00	2026-05-18 21:38:14.137103+00
c8a83c21-d001-4cfc-8e91-64813da1e62c	659de9d8-8220-4349-b606-67037f2fd7ab	1.03	Campanhas	receita	t	t	2026-05-18 21:38:14.137103+00	2026-05-18 21:38:14.137103+00
00117b8f-f223-49c0-b474-373aa47f670a	659de9d8-8220-4349-b606-67037f2fd7ab	1.04	Missoes	receita	t	t	2026-05-18 21:38:14.137103+00	2026-05-18 21:38:14.137103+00
86ce2ddd-4e97-4a3a-856b-0f5a1b4df59e	659de9d8-8220-4349-b606-67037f2fd7ab	1.05	Eventos	receita	t	t	2026-05-18 21:38:14.137103+00	2026-05-18 21:38:14.137103+00
19c54151-1955-42b3-b240-defaf0197388	659de9d8-8220-4349-b606-67037f2fd7ab	2.01	Administrativo	despesa	t	t	2026-05-18 21:38:14.137103+00	2026-05-18 21:38:14.137103+00
ecd1265d-cb71-4009-85e3-956ccf018ae0	659de9d8-8220-4349-b606-67037f2fd7ab	2.02	Manutencao	despesa	t	t	2026-05-18 21:38:14.137103+00	2026-05-18 21:38:14.137103+00
051a83b3-c892-44da-9503-c9017edf52a4	659de9d8-8220-4349-b606-67037f2fd7ab	2.03	Folha/Pastoral	despesa	t	t	2026-05-18 21:38:14.137103+00	2026-05-18 21:38:14.137103+00
297a6571-8ff1-4f3a-8284-de272836c5ad	659de9d8-8220-4349-b606-67037f2fd7ab	2.04	Missoes	despesa	t	t	2026-05-18 21:38:14.137103+00	2026-05-18 21:38:14.137103+00
4ff96804-eaf8-47c7-8e2a-b9cf2e0845ee	659de9d8-8220-4349-b606-67037f2fd7ab	2.05	Eventos	despesa	t	t	2026-05-18 21:38:14.137103+00	2026-05-18 21:38:14.137103+00
4dd54902-5d72-4f59-83ba-1d4b08aa8acf	10000000-0000-0000-0000-000000000001	1.01	Dizimos	receita	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
fec906b5-75bd-42b0-b2e7-375741c873ff	10000000-0000-0000-0000-000000000001	1.02	Ofertas	receita	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
fa0fd32f-eb61-4f9c-b8b3-7b4b9199738b	10000000-0000-0000-0000-000000000001	1.03	Campanhas	receita	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
71fc37ab-00f6-46f2-b615-0290d8b62a50	10000000-0000-0000-0000-000000000001	1.04	Missoes	receita	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
bc67f762-a887-48c6-bac0-94e4e9067e2e	10000000-0000-0000-0000-000000000001	1.05	Eventos	receita	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
d4846927-eb19-4718-8c19-c35722b68314	10000000-0000-0000-0000-000000000001	2.01	Administrativo	despesa	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
77a1e41a-afc1-4a36-83c6-9aab976bd61c	10000000-0000-0000-0000-000000000001	2.02	Manutencao	despesa	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
24a40de0-b7d9-432e-88ec-932fe5f91008	10000000-0000-0000-0000-000000000001	2.03	Folha/Pastoral	despesa	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
3b9b6e8c-ba04-4145-aa23-cbcc0132b00c	10000000-0000-0000-0000-000000000001	2.04	Missoes	despesa	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
38dbc4ae-3e0c-4894-82aa-1a393a4ff685	10000000-0000-0000-0000-000000000001	2.05	Eventos	despesa	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
daee6f5f-2089-4553-ac2b-07e8922c2251	10000000-0000-0000-0000-000000000002	1.01	Dizimos	receita	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
d3440724-9da7-4411-b9a3-fc4326cbd6a0	10000000-0000-0000-0000-000000000002	1.02	Ofertas	receita	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
6a976be3-6815-4756-998a-cc6125607c03	10000000-0000-0000-0000-000000000002	1.03	Campanhas	receita	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
4c4eaa87-1d34-4b0e-bd71-8c2048c10abf	10000000-0000-0000-0000-000000000002	1.04	Missoes	receita	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
168f75bf-69eb-482f-95d7-dc9d06ce3183	10000000-0000-0000-0000-000000000002	1.05	Eventos	receita	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
9c8c4cdd-375e-43ba-b222-9052d4a2037f	10000000-0000-0000-0000-000000000002	2.01	Administrativo	despesa	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
c9294ce9-518b-41fd-b313-a8db245dc195	10000000-0000-0000-0000-000000000002	2.02	Manutencao	despesa	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
e5a38507-2245-445b-825e-cfc94c130bcc	10000000-0000-0000-0000-000000000002	2.03	Folha/Pastoral	despesa	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
38d113c4-102e-4d64-8195-1696ddc408c6	10000000-0000-0000-0000-000000000002	2.04	Missoes	despesa	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
18eacf0c-9c48-4f94-b443-24860e4ebbba	10000000-0000-0000-0000-000000000002	2.05	Eventos	despesa	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
880d641a-332f-488a-966e-406dafa63e1b	10000000-0000-0000-0000-000000000003	1.01	Dizimos	receita	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
247f6421-7a68-45b9-8dda-6588748e48dc	10000000-0000-0000-0000-000000000003	1.02	Ofertas	receita	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
47eb8387-8b1a-4ef4-8de6-33845b7713ab	10000000-0000-0000-0000-000000000003	1.03	Campanhas	receita	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
cc644236-7965-4e11-8e4f-fb87775ed1c9	10000000-0000-0000-0000-000000000003	1.04	Missoes	receita	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
b1481499-942b-4c38-9b4d-e13789131bc4	10000000-0000-0000-0000-000000000003	1.05	Eventos	receita	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
c4b7a36f-8116-4c50-952e-81d6547edd97	10000000-0000-0000-0000-000000000003	2.01	Administrativo	despesa	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
5a4a964b-1ecc-43e0-8369-551084b5793a	10000000-0000-0000-0000-000000000003	2.02	Manutencao	despesa	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
bce0f997-bc61-4260-9f69-1995b6472959	10000000-0000-0000-0000-000000000003	2.03	Folha/Pastoral	despesa	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
53ec3ab5-31cc-49b2-8cc1-12ac902ae44c	10000000-0000-0000-0000-000000000003	2.04	Missoes	despesa	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
048d19e5-b36b-4446-bf5a-f25ab41964e5	10000000-0000-0000-0000-000000000003	2.05	Eventos	despesa	t	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
1d53e81e-ec68-4d4c-8a70-0a985339bb81	dd000001-0000-0000-0000-000000000001	1.01	Dizimos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
dc3189e3-ea21-4d52-af9e-a4638c2dd286	dd000001-0000-0000-0000-000000000001	1.02	Ofertas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
8ee9218f-e0dd-41e7-8ea0-226e9b889798	dd000001-0000-0000-0000-000000000001	1.03	Campanhas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
38aefe38-de34-40ca-a23b-4b68399e7b60	dd000001-0000-0000-0000-000000000001	1.04	Missoes	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
ca6ea90f-3ba9-42c1-8a88-c2ed934b8692	dd000001-0000-0000-0000-000000000001	1.05	Eventos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
0840d1ca-ee45-4db9-be0c-c825d148f742	dd000001-0000-0000-0000-000000000001	2.01	Administrativo	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
6899326f-fe32-462f-a6a9-4f2adc27bfca	dd000001-0000-0000-0000-000000000001	2.02	Manutencao	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
9995efbf-2e40-4de4-bc47-20ae246ae902	dd000001-0000-0000-0000-000000000001	2.03	Folha/Pastoral	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
12046da1-f3bd-40fd-b12c-b12ac5eedab3	dd000001-0000-0000-0000-000000000001	2.04	Missoes	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
12530b48-2e4c-42c6-adf4-cf4083c82073	dd000001-0000-0000-0000-000000000001	2.05	Eventos	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
ec73bb12-9ac9-4941-98b1-283c9f361e7f	dd000001-0000-0000-0000-000000000002	1.01	Dizimos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
c177cb35-66bf-47b3-9b2e-f8b1155c4082	dd000001-0000-0000-0000-000000000002	1.02	Ofertas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
4025d505-d1d2-4db3-a728-29179aca7346	dd000001-0000-0000-0000-000000000002	1.03	Campanhas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
8b255a89-ce35-41c5-901c-f079d3cb45d4	dd000001-0000-0000-0000-000000000002	1.04	Missoes	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
d1e7e508-0cfb-4c8f-b782-b2b657bca41a	dd000001-0000-0000-0000-000000000002	1.05	Eventos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
33732506-7941-4a83-9231-2dc47fb0efa1	dd000001-0000-0000-0000-000000000002	2.01	Administrativo	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
d4ca3102-8971-483f-a3bc-c96bea271da0	dd000001-0000-0000-0000-000000000002	2.02	Manutencao	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
665335ed-a244-49cd-9d97-b49c753c8a69	dd000001-0000-0000-0000-000000000002	2.03	Folha/Pastoral	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
0e966fbe-ddd4-4341-a478-95519767c959	dd000001-0000-0000-0000-000000000002	2.04	Missoes	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
05bdd8e5-88e6-4399-9f1e-ff718fda4bf6	dd000001-0000-0000-0000-000000000002	2.05	Eventos	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
32089773-74a6-4eca-8fee-b633d8ffbc51	dd000001-0000-0000-0000-000000000003	1.01	Dizimos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
22a0e596-3700-4117-8808-921b4653ad3f	dd000001-0000-0000-0000-000000000003	1.02	Ofertas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
dea4313f-08ea-4880-b3df-784542fbc1e7	dd000001-0000-0000-0000-000000000003	1.03	Campanhas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
c10ca36b-f430-421b-90a7-73c7f1c4ca85	dd000001-0000-0000-0000-000000000003	1.04	Missoes	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
6757afb3-a83c-43a6-bdea-31c82a52c02f	dd000001-0000-0000-0000-000000000003	1.05	Eventos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
a4e63e0d-e6ef-4603-a8bc-670a0cd96122	dd000001-0000-0000-0000-000000000003	2.01	Administrativo	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
f3bc4221-4b0e-4560-8a81-0032d4ec63e9	dd000001-0000-0000-0000-000000000003	2.02	Manutencao	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
5192f9db-9928-498e-957f-0a96dfa088c0	dd000001-0000-0000-0000-000000000003	2.03	Folha/Pastoral	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
dc657bf7-3ac2-417e-b2c0-05bfc597439f	dd000001-0000-0000-0000-000000000003	2.04	Missoes	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
3ce13bfa-b4d4-4993-b03f-302959135a61	dd000001-0000-0000-0000-000000000003	2.05	Eventos	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
6c8ebacc-5509-4810-8adb-471bbca6d621	dd000001-0000-0000-0000-000000000004	1.01	Dizimos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
935d9667-24f3-4a1c-91d5-b6bc821a0912	dd000001-0000-0000-0000-000000000004	1.02	Ofertas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
f1dbc836-2009-47a9-a368-dee40f6cf355	dd000001-0000-0000-0000-000000000004	1.03	Campanhas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
fa7564c9-e8b0-4eb3-a861-98582205b777	dd000001-0000-0000-0000-000000000004	1.04	Missoes	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
d5de610c-6b17-4419-847f-534d9151e235	dd000001-0000-0000-0000-000000000004	1.05	Eventos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
cf23e6d3-ce3f-488d-8f49-2290a7657a19	dd000001-0000-0000-0000-000000000004	2.01	Administrativo	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
a4fd94d9-3248-45d4-a728-f2dcb7a1c2bb	dd000001-0000-0000-0000-000000000004	2.02	Manutencao	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
2602743b-e9aa-4a59-bd02-4f45f63003f9	dd000001-0000-0000-0000-000000000004	2.03	Folha/Pastoral	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
53d7fb46-5560-4747-983a-b0a638be9a90	dd000001-0000-0000-0000-000000000004	2.04	Missoes	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
cca113f4-6e2b-4048-91e9-2ad0db148f10	dd000001-0000-0000-0000-000000000004	2.05	Eventos	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
e4cc0813-e246-4efc-9d90-1eb67f3e5df9	11111111-0000-0000-0000-000000000001	1.01	Dizimos	receita	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
b5d77243-a748-4c38-94d3-d5b92a80af99	11111111-0000-0000-0000-000000000001	1.02	Ofertas	receita	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
06802460-cd9f-4dde-9d2a-5f7454c1ac00	11111111-0000-0000-0000-000000000001	1.03	Campanhas	receita	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
95f5c368-ea1b-42db-90c3-27cc9de7623c	11111111-0000-0000-0000-000000000001	1.04	Missoes	receita	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
d5212bb3-9a93-4a52-aa4a-6c4648982913	11111111-0000-0000-0000-000000000001	1.05	Eventos	receita	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
40b0209c-9145-4453-906a-abb06a5acd38	11111111-0000-0000-0000-000000000001	2.01	Administrativo	despesa	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
1807ff34-5c3e-49a8-a0ee-cabb85dc7b26	11111111-0000-0000-0000-000000000001	2.02	Manutencao	despesa	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
15caafcb-76ce-4ea2-bb3c-4d8ee1250ddc	11111111-0000-0000-0000-000000000001	2.03	Folha/Pastoral	despesa	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
fbfa5ded-9d0b-4854-ab80-d1efeb305fdd	11111111-0000-0000-0000-000000000001	2.04	Missoes	despesa	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
a76a4653-b190-4bb6-b227-d38518ffa734	11111111-0000-0000-0000-000000000001	2.05	Eventos	despesa	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
35ec9580-cf3b-4be4-803c-b9f384cb62d7	11111111-0000-0000-0000-000000000002	1.01	Dizimos	receita	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
2215e611-b205-4c4e-82ba-4eb60f4e716e	11111111-0000-0000-0000-000000000002	1.02	Ofertas	receita	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
88abcac5-4a91-4516-954c-261cb024b82f	11111111-0000-0000-0000-000000000002	1.03	Campanhas	receita	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
94b3cc7a-ac95-4b97-bb35-4b9381501e78	11111111-0000-0000-0000-000000000002	1.04	Missoes	receita	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
b69afc48-db75-45c5-8e78-837f4dc9cb09	11111111-0000-0000-0000-000000000002	1.05	Eventos	receita	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
e88e75dd-99ee-463d-a2d6-49c39a25a172	11111111-0000-0000-0000-000000000002	2.01	Administrativo	despesa	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
156842d5-924c-4c1f-8ac4-33fbee41bb1f	11111111-0000-0000-0000-000000000002	2.02	Manutencao	despesa	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
3ec19398-2495-425a-8633-fa51ad692de6	11111111-0000-0000-0000-000000000002	2.03	Folha/Pastoral	despesa	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
1a83d814-c74a-473b-8a45-0a1b69cffef3	11111111-0000-0000-0000-000000000002	2.04	Missoes	despesa	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
6a9d57f2-fef4-45a0-92d7-970e0d71a52d	11111111-0000-0000-0000-000000000002	2.05	Eventos	despesa	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
c96612c5-cdf3-44bd-b440-54980f79d19f	11111111-0000-0000-0000-000000000003	1.01	Dizimos	receita	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
5265711a-62f6-4e2f-8a5a-de85f968ea38	11111111-0000-0000-0000-000000000003	1.02	Ofertas	receita	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
048974aa-92c4-4ef2-9d81-4837ac0b12d6	11111111-0000-0000-0000-000000000003	1.03	Campanhas	receita	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
e9364863-1eaa-440c-9f2c-04ea6a162053	11111111-0000-0000-0000-000000000003	1.04	Missoes	receita	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
47207879-7902-4794-86fe-9607adb79519	11111111-0000-0000-0000-000000000003	1.05	Eventos	receita	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
4334f5c8-122f-490f-9d5c-d40a7c287934	11111111-0000-0000-0000-000000000003	2.01	Administrativo	despesa	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
05f82c09-15f0-4c22-9571-081cc944d9f0	11111111-0000-0000-0000-000000000003	2.02	Manutencao	despesa	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
91aec61e-d5d3-4ce8-aa91-80f536116c1d	11111111-0000-0000-0000-000000000003	2.03	Folha/Pastoral	despesa	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
67fd1540-54a4-41f5-aada-0a6a9a758cde	11111111-0000-0000-0000-000000000003	2.04	Missoes	despesa	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
e01e9ff7-b2ea-4b41-b418-f62f7b905d0d	11111111-0000-0000-0000-000000000003	2.05	Eventos	despesa	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
0a08fe45-a1ce-4dc9-bf40-e472d9f5b479	11111111-0000-0000-0000-000000000004	1.01	Dizimos	receita	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
e1a28895-5ef0-4e91-bea1-387c65acc82a	11111111-0000-0000-0000-000000000004	1.02	Ofertas	receita	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
32deb430-fd42-4628-936f-8a7056f30942	11111111-0000-0000-0000-000000000004	1.03	Campanhas	receita	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
a2d830da-fdb4-4949-8738-62cc22bb8989	11111111-0000-0000-0000-000000000004	1.04	Missoes	receita	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
03529eff-b1ba-4d51-90ff-13871a3df666	11111111-0000-0000-0000-000000000004	1.05	Eventos	receita	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
94c9dc0b-f426-4df6-9ced-eb55a1ddc609	11111111-0000-0000-0000-000000000004	2.01	Administrativo	despesa	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
5a04f068-6eb3-4e5e-86e7-a139504002e6	11111111-0000-0000-0000-000000000004	2.02	Manutencao	despesa	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
2a63991f-1e84-4f8c-8f50-5f03b326f839	11111111-0000-0000-0000-000000000004	2.03	Folha/Pastoral	despesa	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
4b1327e7-4b9f-4a83-b7a3-9dc5ffafd32e	11111111-0000-0000-0000-000000000004	2.04	Missoes	despesa	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
1df23c2f-289e-4f6f-a540-1e8901a1da30	11111111-0000-0000-0000-000000000004	2.05	Eventos	despesa	t	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
90ba2df1-11e0-4da3-a61c-af622b8d49d5	dd000001-0000-0000-0000-000000000005	1.01	Dizimos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
746de628-01e5-49bd-8714-ad469dba7d65	dd000001-0000-0000-0000-000000000005	1.02	Ofertas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
20efeef0-3720-4101-8b99-7685abf73a51	dd000001-0000-0000-0000-000000000005	1.03	Campanhas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
cfe6f766-b5e8-40cf-8544-cbbf49cb7aa6	dd000001-0000-0000-0000-000000000005	1.04	Missoes	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
28a3ba00-add7-4822-ba12-dd4f2d8bbe2f	dd000001-0000-0000-0000-000000000005	1.05	Eventos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
c2b0b4a6-3055-4c46-8cd2-7eeb0f6aba6d	dd000001-0000-0000-0000-000000000005	2.01	Administrativo	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
ec8d1384-4bbc-4c4f-84b6-d39a14370aa1	dd000001-0000-0000-0000-000000000005	2.02	Manutencao	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
f9451ae9-a4c9-419a-b34e-6f8a89ff4aa8	dd000001-0000-0000-0000-000000000005	2.03	Folha/Pastoral	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
eeeb420a-83e8-48db-bb93-782a35690c32	dd000001-0000-0000-0000-000000000005	2.04	Missoes	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
a127cfc3-b756-4741-a1f3-464ce7b8fa4f	dd000001-0000-0000-0000-000000000005	2.05	Eventos	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
77ca5503-4435-4c69-951f-30d4bc9e71aa	dd000002-0000-0000-0000-000000000001	1.01	Dizimos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
206436c0-11bb-46f1-b128-b6e326df41c5	dd000002-0000-0000-0000-000000000001	1.02	Ofertas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
31ee3c99-1c01-4c9b-9b55-9116a22e4692	dd000002-0000-0000-0000-000000000001	1.03	Campanhas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
d1cceb2e-b75f-4efd-9250-0db93555c771	dd000002-0000-0000-0000-000000000001	1.04	Missoes	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
7566d227-9078-42fd-9070-57af744ac1ba	dd000002-0000-0000-0000-000000000001	1.05	Eventos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
35bacb50-2a99-4d22-bb5a-226a66589cf4	dd000002-0000-0000-0000-000000000001	2.01	Administrativo	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
e2a11c5d-24a7-42f4-b8b5-4c650142b911	dd000002-0000-0000-0000-000000000001	2.02	Manutencao	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
60573ac5-ae34-4dc7-8a90-22c27ebaf006	dd000002-0000-0000-0000-000000000001	2.03	Folha/Pastoral	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
e178925a-0613-4097-8581-054817ba0e27	dd000002-0000-0000-0000-000000000001	2.04	Missoes	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
bfaa4e61-2587-479e-9507-5efa30f1e772	dd000002-0000-0000-0000-000000000001	2.05	Eventos	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
bc6e450c-886c-4caf-afe7-ec71e5733deb	dd000002-0000-0000-0000-000000000002	1.01	Dizimos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
6c2b3c9f-14a0-4d87-96dd-2d5a6b051552	dd000002-0000-0000-0000-000000000002	1.02	Ofertas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
d2079e1e-7544-4e37-b93a-db2f6b14a709	dd000002-0000-0000-0000-000000000002	1.03	Campanhas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
306b4f0a-ae8c-44d7-a67f-ebc05a98f3ef	dd000002-0000-0000-0000-000000000002	1.04	Missoes	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
19d5e271-d96e-4a54-b2f0-cbac9fbba9cd	dd000002-0000-0000-0000-000000000002	1.05	Eventos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
63a1afd4-66ec-4ace-a0be-9ff3ef7a4d6c	dd000002-0000-0000-0000-000000000002	2.01	Administrativo	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
5d8b0c56-8fdf-4cee-a0f3-63cb4db65ff8	dd000002-0000-0000-0000-000000000002	2.02	Manutencao	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
0cf87f18-0307-4898-a46d-65fbd08de276	dd000002-0000-0000-0000-000000000002	2.03	Folha/Pastoral	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
72fc98df-1ba4-49e0-977e-2a95b8c24237	dd000002-0000-0000-0000-000000000002	2.04	Missoes	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
f366d9cd-b1a9-4b17-a353-b34b32c55a8d	dd000002-0000-0000-0000-000000000002	2.05	Eventos	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
4d48e305-da94-437e-ad91-5d2ca72b90dc	dd000002-0000-0000-0000-000000000003	1.01	Dizimos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
26d2fcd1-148b-4ae7-bcb9-a48626e32879	dd000002-0000-0000-0000-000000000003	1.02	Ofertas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
7194bd1f-9d65-4402-8586-15abc8c5744f	dd000002-0000-0000-0000-000000000003	1.03	Campanhas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
1751cd5a-4744-44c8-a156-74c6e9f89d00	dd000002-0000-0000-0000-000000000003	1.04	Missoes	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
9e8bf4d0-e38c-47ad-a6bc-084b056d180a	dd000002-0000-0000-0000-000000000003	1.05	Eventos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
e869e841-c5f6-4a86-bd8b-b11a3c73abb5	dd000002-0000-0000-0000-000000000003	2.01	Administrativo	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
edc08781-9e8c-4458-9ef4-fd69a38deeb3	dd000002-0000-0000-0000-000000000003	2.02	Manutencao	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
85440d3a-14f2-4c83-9d7c-7b530de48a8a	dd000002-0000-0000-0000-000000000003	2.03	Folha/Pastoral	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
8cb5e1f2-39bb-457b-ad0c-98e377add405	dd000002-0000-0000-0000-000000000003	2.04	Missoes	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
62747165-75ca-4bbc-bb22-045210e00e2b	dd000002-0000-0000-0000-000000000003	2.05	Eventos	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
1b742a04-ee81-48ef-a2df-7fec9f0deebe	dd000002-0000-0000-0000-000000000004	1.01	Dizimos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
8538a751-7c20-4a4a-8cca-9c8221d9a5f3	dd000002-0000-0000-0000-000000000004	1.02	Ofertas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
afceda82-631f-4e4b-b467-928f3278fd53	dd000002-0000-0000-0000-000000000004	1.03	Campanhas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
07d9913b-9536-481d-b78a-4d9487d7310e	dd000002-0000-0000-0000-000000000004	1.04	Missoes	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
17efa246-482f-44f9-bda4-e7bac9b8f9a5	dd000002-0000-0000-0000-000000000004	1.05	Eventos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
d5157d7e-efda-47ae-83b4-cadb112ded66	dd000002-0000-0000-0000-000000000004	2.01	Administrativo	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
53b67b5a-7ae8-4fbd-82da-40e2e387860c	dd000002-0000-0000-0000-000000000004	2.02	Manutencao	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
47d47e55-4fe5-4f22-8eab-b47e59c83567	dd000002-0000-0000-0000-000000000004	2.03	Folha/Pastoral	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
8411c878-80b5-423d-9a7e-93e311ea46ae	dd000002-0000-0000-0000-000000000004	2.04	Missoes	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
faf4ab65-cffb-492d-af9e-f3fbdf285b35	dd000002-0000-0000-0000-000000000004	2.05	Eventos	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
8dd662d4-220d-445b-9ac7-f26d520a1c48	dd000002-0000-0000-0000-000000000005	1.01	Dizimos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
8d90cd63-b818-49c6-9398-f002db3b5f1d	dd000002-0000-0000-0000-000000000005	1.02	Ofertas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
70a9fc97-1ece-40f1-b64b-87f74353e936	dd000002-0000-0000-0000-000000000005	1.03	Campanhas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
7dc7ae1e-18f5-4eff-80b3-6f449a6eeec5	dd000002-0000-0000-0000-000000000005	1.04	Missoes	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
33ad824b-5bba-4afa-a36e-df8370df7505	dd000002-0000-0000-0000-000000000005	1.05	Eventos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
79976093-47b5-464d-8d99-6d7874bd3b41	dd000002-0000-0000-0000-000000000005	2.01	Administrativo	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
c0f0ba38-4db6-4296-a4c7-025f4ff13049	dd000002-0000-0000-0000-000000000005	2.02	Manutencao	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
d0ebb62b-4b43-42d6-9dde-5dbf5484f3b7	dd000002-0000-0000-0000-000000000005	2.03	Folha/Pastoral	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
3925fa48-e382-421c-85a8-5d5e30bd0906	dd000002-0000-0000-0000-000000000005	2.04	Missoes	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
4752ddbd-7b83-4f7f-845d-4e05b7b97891	dd000002-0000-0000-0000-000000000005	2.05	Eventos	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
a8f39ea0-f3cb-4ddb-a3fc-b34dad9be80d	dd000002-0000-0000-0000-000000000006	1.01	Dizimos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
a02bbef0-ef52-4ce1-81e9-bd26d402722a	dd000002-0000-0000-0000-000000000006	1.02	Ofertas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
10f46289-06f5-4e82-9b4a-f496feb16e30	dd000002-0000-0000-0000-000000000006	1.03	Campanhas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
a9e494d6-2172-4558-87f0-d7fcb539dc07	dd000002-0000-0000-0000-000000000006	1.04	Missoes	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
d79d03b9-90cd-4ea9-bc43-68b301240430	dd000002-0000-0000-0000-000000000006	1.05	Eventos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
ee9a4ae6-b55c-4a0e-ba33-2699d4aeb41e	dd000002-0000-0000-0000-000000000006	2.01	Administrativo	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
254a5886-8a52-4646-94ee-04c8c4d45566	dd000002-0000-0000-0000-000000000006	2.02	Manutencao	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
5e151550-1d4e-439f-9c23-facc92964a75	dd000002-0000-0000-0000-000000000006	2.03	Folha/Pastoral	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
eecb955d-e452-4960-b48a-e0f0fab742df	dd000002-0000-0000-0000-000000000006	2.04	Missoes	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
4d6b8e34-efa6-4304-a139-2358a33a329d	dd000002-0000-0000-0000-000000000006	2.05	Eventos	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
aceb5d69-e715-4282-8c6c-80164e398e9e	dd000002-0000-0000-0000-000000000007	1.01	Dizimos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
b1fab9fa-b43d-4288-abfc-c29c9f42a965	dd000002-0000-0000-0000-000000000007	1.02	Ofertas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
fa03eda9-a8ba-4aa4-8e11-157a1310ea5a	dd000002-0000-0000-0000-000000000007	1.03	Campanhas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
88c18651-8a19-4a6b-9429-fc5ea4c10714	dd000002-0000-0000-0000-000000000007	1.04	Missoes	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
e0cfc811-8722-4766-9b43-2d18bcb02b87	dd000002-0000-0000-0000-000000000007	1.05	Eventos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
29306790-d511-42be-b448-91984825127b	dd000002-0000-0000-0000-000000000007	2.01	Administrativo	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
a298b704-a42d-4c4c-9984-0df7b89386e1	dd000002-0000-0000-0000-000000000007	2.02	Manutencao	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
03dbdde8-04c4-4a09-8d26-1166a3b318aa	dd000002-0000-0000-0000-000000000007	2.03	Folha/Pastoral	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
d4771ecb-bc5e-4e2f-bcaa-fe07c8a3ed9d	dd000002-0000-0000-0000-000000000007	2.04	Missoes	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
3f975d95-bd07-4645-ac08-f51035f8eb0f	dd000002-0000-0000-0000-000000000007	2.05	Eventos	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
18e1c94f-6bdb-4378-9340-48cdba3666b9	dd000002-0000-0000-0000-000000000008	1.01	Dizimos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
7f5cd8a8-ad9c-4f14-aabd-c07313a296af	dd000002-0000-0000-0000-000000000008	1.02	Ofertas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
6e8f8708-74df-4643-9345-90b0b0c36737	dd000002-0000-0000-0000-000000000008	1.03	Campanhas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
9bc95e41-a6f6-4989-b564-297d7e96278d	dd000002-0000-0000-0000-000000000008	1.04	Missoes	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
25d1b5e1-ab70-4eaf-b09b-dab9c81c5394	dd000002-0000-0000-0000-000000000008	1.05	Eventos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
fc6cd65d-6a39-4108-88e0-d70fe6f21fee	dd000002-0000-0000-0000-000000000008	2.01	Administrativo	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
0af52488-bda6-40a8-9b52-91db29789e8c	dd000002-0000-0000-0000-000000000008	2.02	Manutencao	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
0fd133c8-ecb5-406a-b2bf-069ae40a931e	dd000002-0000-0000-0000-000000000008	2.03	Folha/Pastoral	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
39cabd84-06c5-4bcf-9265-818f5d462b6c	dd000002-0000-0000-0000-000000000008	2.04	Missoes	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
086bd83d-7e31-49f6-9e63-6445f6086763	dd000002-0000-0000-0000-000000000008	2.05	Eventos	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
de499acc-c14e-431f-9f62-3cca877e3bfc	dd000002-0000-0000-0000-000000000009	1.01	Dizimos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
de8f2573-ea26-4b57-8edb-336a3f14cbe3	dd000002-0000-0000-0000-000000000009	1.02	Ofertas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
355c7aec-05bb-4b02-87a6-90d4b874b900	dd000002-0000-0000-0000-000000000009	1.03	Campanhas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
6861eae3-ad0a-4b92-a3be-772c012292a7	dd000002-0000-0000-0000-000000000009	1.04	Missoes	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
162737ea-c4b4-411e-8192-9b053792e3da	dd000002-0000-0000-0000-000000000009	1.05	Eventos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
626b871f-1a55-46d8-88e6-4e1763bf5a1d	dd000002-0000-0000-0000-000000000009	2.01	Administrativo	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
7b71249a-0878-4950-aad5-ae7fdb5187b2	dd000002-0000-0000-0000-000000000009	2.02	Manutencao	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
22ebc89e-3ad9-4649-a3bc-689794056182	dd000002-0000-0000-0000-000000000009	2.03	Folha/Pastoral	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
462d4569-230e-435a-8359-04f3bad0dab6	dd000002-0000-0000-0000-000000000009	2.04	Missoes	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
3d7b1c4a-24f9-47b4-b547-98fd85f03239	dd000002-0000-0000-0000-000000000009	2.05	Eventos	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
b2c034c0-ce7a-42b1-a0da-5ec93d0879ed	dd000002-0000-0000-0000-00000000000a	1.01	Dizimos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
bb87a331-89fd-43c5-842c-924ad8033222	dd000002-0000-0000-0000-00000000000a	1.02	Ofertas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
78cbba82-0043-4543-a109-1889f7d4506c	dd000002-0000-0000-0000-00000000000a	1.03	Campanhas	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
0f904445-7648-4772-b8b5-1660a8f28d5d	dd000002-0000-0000-0000-00000000000a	1.04	Missoes	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
fa0d2a66-9973-46e7-8769-e84767c0de8c	dd000002-0000-0000-0000-00000000000a	1.05	Eventos	receita	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
f9c6ab8c-ecd2-4a6b-ba6f-4fc0f731b899	dd000002-0000-0000-0000-00000000000a	2.01	Administrativo	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
ddfa2009-1f92-4a7e-8e92-8043ed04549e	dd000002-0000-0000-0000-00000000000a	2.02	Manutencao	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
7aef6ed2-122b-4a42-92b9-74aa941d6843	dd000002-0000-0000-0000-00000000000a	2.03	Folha/Pastoral	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
47b4aeac-1722-4ff9-8b38-f54e16d32488	dd000002-0000-0000-0000-00000000000a	2.04	Missoes	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
85598657-a3a1-4206-9189-b230b78be6b4	dd000002-0000-0000-0000-00000000000a	2.05	Eventos	despesa	t	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
dd000006-0000-0000-0000-000000000001	10000000-0000-0000-0000-000000000002	DD-REC-01	Dizimos	receita	f	t	2026-06-15 20:58:59.31546+00	2026-06-15 20:58:59.31546+00
dd000006-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000002	DD-REC-02	Ofertas	receita	f	t	2026-06-15 20:58:59.31546+00	2026-06-15 20:58:59.31546+00
dd000006-0000-0000-0000-000000000003	10000000-0000-0000-0000-000000000002	DD-REC-03	Missoes Doacao	receita	f	t	2026-06-15 20:58:59.31546+00	2026-06-15 20:58:59.31546+00
dd000006-0000-0000-0000-000000000004	10000000-0000-0000-0000-000000000002	DD-REC-04	Fundo Construcao	receita	f	t	2026-06-15 20:58:59.31546+00	2026-06-15 20:58:59.31546+00
dd000006-0000-0000-0000-000000000005	10000000-0000-0000-0000-000000000002	DD-DEP-01	Aluguel Manutencao	despesa	f	t	2026-06-15 20:58:59.31546+00	2026-06-15 20:58:59.31546+00
dd000006-0000-0000-0000-000000000006	10000000-0000-0000-0000-000000000002	DD-DEP-02	Energia Eletrica	despesa	f	t	2026-06-15 20:58:59.31546+00	2026-06-15 20:58:59.31546+00
dd000006-0000-0000-0000-000000000007	10000000-0000-0000-0000-000000000002	DD-DEP-03	Material Suprimentos	despesa	f	t	2026-06-15 20:58:59.31546+00	2026-06-15 20:58:59.31546+00
dd000006-0000-0000-0000-000000000008	10000000-0000-0000-0000-000000000002	DD-DEP-04	Acao Social	despesa	f	t	2026-06-15 20:58:59.31546+00	2026-06-15 20:58:59.31546+00
634afb31-55c7-4611-a26d-baabe7a7b703	ee000010-0000-0000-0000-000000000001	1.01	Dizimos	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
601ded00-b119-4937-8f36-98b02fdcc826	ee000010-0000-0000-0000-000000000001	1.02	Ofertas	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
f890df96-733b-4c6d-88c9-aa51440bc5c5	ee000010-0000-0000-0000-000000000001	1.03	Campanhas	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
6461c7a9-8aa5-4f8a-8973-c632c107155b	ee000010-0000-0000-0000-000000000001	1.04	Missoes	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
992c9d1f-bd73-4d11-99b2-f7d8966eb6f5	ee000010-0000-0000-0000-000000000001	1.05	Eventos	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
1c809a68-31ea-4361-8754-9bce672b87a5	ee000010-0000-0000-0000-000000000001	2.01	Administrativo	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
fb08b070-1018-4c43-9b28-fb1a8c465780	ee000010-0000-0000-0000-000000000001	2.02	Manutencao	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
46d9f600-387f-4c11-bf2f-95a4de9696f8	ee000010-0000-0000-0000-000000000001	2.03	Folha/Pastoral	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
2a86e25f-e34c-4b3d-9274-74453ae3d57d	ee000010-0000-0000-0000-000000000001	2.04	Missoes	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
8b01a1a3-77f8-40ee-a9b2-9b7f43a64409	ee000010-0000-0000-0000-000000000001	2.05	Eventos	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
a3e3d448-7260-471d-8685-155553b6a74a	ee000010-0000-0000-0000-000000000002	1.01	Dizimos	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
c9a7adb6-0c44-483c-9b96-88f84806291b	ee000010-0000-0000-0000-000000000002	1.02	Ofertas	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
58b9649f-7f3b-4abc-a504-32ca6d400ef6	ee000010-0000-0000-0000-000000000002	1.03	Campanhas	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
e757a1a2-f57b-44ca-a290-c3bd76b7bcfe	ee000010-0000-0000-0000-000000000002	1.04	Missoes	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
a02b1bee-e3cc-4a31-adc1-bc8fa36f04cd	ee000010-0000-0000-0000-000000000002	1.05	Eventos	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
c0bbfc09-de17-4e1b-b26e-f5dfb4b09f98	ee000010-0000-0000-0000-000000000002	2.01	Administrativo	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
bd5664ec-7d1a-42e4-a3ab-1284d7886c4c	ee000010-0000-0000-0000-000000000002	2.02	Manutencao	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
8b3b6a3a-8dc7-4e74-85bd-09bd16e3d12a	ee000010-0000-0000-0000-000000000002	2.03	Folha/Pastoral	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
f4c8ad59-9164-47f4-9dbe-d90b4d1cfea8	ee000010-0000-0000-0000-000000000002	2.04	Missoes	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
40e49c6a-77bc-4bf4-a45e-a5f0f1d55f29	ee000010-0000-0000-0000-000000000002	2.05	Eventos	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
608db37d-d9cc-46f7-a6ab-9987bb36bfd1	ee000010-0000-0000-0000-000000000003	1.01	Dizimos	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
4be67462-f7ea-4c9c-901e-0515d532ccdb	ee000010-0000-0000-0000-000000000003	1.02	Ofertas	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
758287e9-3b43-4b4d-9121-afe5349545bc	ee000010-0000-0000-0000-000000000003	1.03	Campanhas	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
b19d7f0d-4414-458e-b7cb-6447288f7577	ee000010-0000-0000-0000-000000000003	1.04	Missoes	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
95eb9d99-9112-4b53-a8d2-b3051989d5d3	ee000010-0000-0000-0000-000000000003	1.05	Eventos	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
77cb9a11-dc91-4ef2-89ed-8b21d90c2f4d	ee000010-0000-0000-0000-000000000003	2.01	Administrativo	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
822f2397-f6c4-4aa3-8a28-3c4c84bf4aef	ee000010-0000-0000-0000-000000000003	2.02	Manutencao	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
1a6c3207-e51c-44f4-82d8-91be013c9101	ee000010-0000-0000-0000-000000000003	2.03	Folha/Pastoral	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
c9658bdd-d806-48a2-a4c3-c74f39d48782	ee000010-0000-0000-0000-000000000003	2.04	Missoes	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
09c3ff47-b0e3-4e6c-a754-39ebfb8490e3	ee000010-0000-0000-0000-000000000003	2.05	Eventos	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
b7f4ba13-17bf-4501-90dc-073184fb1276	ee000020-0000-0000-0000-000000000001	1.01	Dizimos	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
bad11e76-78bc-4565-9652-8b2cbfe1f0ca	ee000020-0000-0000-0000-000000000001	1.02	Ofertas	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
0f1934ff-6b8f-41ac-9411-686cf2fbe9c6	ee000020-0000-0000-0000-000000000001	1.03	Campanhas	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
7958e5c9-5a9d-48ae-9ee9-9b499eb00d86	ee000020-0000-0000-0000-000000000001	1.04	Missoes	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
49398b05-5860-470c-bc17-555ac06a4549	ee000020-0000-0000-0000-000000000001	1.05	Eventos	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
429b7db3-e4db-46e4-80ef-5dcc0382a725	ee000020-0000-0000-0000-000000000001	2.01	Administrativo	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
38ad8b4f-a467-4952-bc87-88b9f6690d4c	ee000020-0000-0000-0000-000000000001	2.02	Manutencao	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
3c45d666-dd67-49c6-b25e-54a7e3b5460f	ee000020-0000-0000-0000-000000000001	2.03	Folha/Pastoral	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
39595b6f-1432-4b6c-9299-c83dff07bde2	ee000020-0000-0000-0000-000000000001	2.04	Missoes	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
c32c9c9e-f142-4bae-a20d-dffa40b5b309	ee000020-0000-0000-0000-000000000001	2.05	Eventos	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
19a611c6-d24b-4379-91ea-009443ddfa38	ee000020-0000-0000-0000-000000000002	1.01	Dizimos	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
c92700aa-2e12-43e5-815b-8cdc579b30ca	ee000020-0000-0000-0000-000000000002	1.02	Ofertas	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
77d12334-0c50-4b25-8549-0a889f6da755	ee000020-0000-0000-0000-000000000002	1.03	Campanhas	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
0d8e517d-59a1-4184-bf85-c33a23184d2f	ee000020-0000-0000-0000-000000000002	1.04	Missoes	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
51ec396c-0d5b-4074-8a6c-9735dc3dc72b	ee000020-0000-0000-0000-000000000002	1.05	Eventos	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
38c3a11d-3137-44c7-a29f-cf660b2f07bc	ee000020-0000-0000-0000-000000000002	2.01	Administrativo	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
c7e9b884-cf89-4142-8143-a770b7ceb4c7	ee000020-0000-0000-0000-000000000002	2.02	Manutencao	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
a4362478-02d4-4e41-b504-864ce41b52fe	ee000020-0000-0000-0000-000000000002	2.03	Folha/Pastoral	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
7b95828d-bac4-4cff-94ef-afbb262b7a10	ee000020-0000-0000-0000-000000000002	2.04	Missoes	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
49a645bb-69e8-426e-a1f6-c726314e5736	ee000020-0000-0000-0000-000000000002	2.05	Eventos	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
a4e480d7-64c0-4451-96e2-2ef95c249b30	ee000020-0000-0000-0000-000000000003	1.01	Dizimos	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
214e216e-0b8a-4c61-8e71-aa437aaa826f	ee000020-0000-0000-0000-000000000003	1.02	Ofertas	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
97f88345-d57e-4c00-9291-e654151aae16	ee000020-0000-0000-0000-000000000003	1.03	Campanhas	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
e66c4663-aad8-4e4d-9a12-567294b1f658	ee000020-0000-0000-0000-000000000003	1.04	Missoes	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
46e3cafc-5940-466f-a6cb-616b82b0a3c2	ee000020-0000-0000-0000-000000000003	1.05	Eventos	receita	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
f7831b49-5406-436b-a6e5-90443c7fe7cc	ee000020-0000-0000-0000-000000000003	2.01	Administrativo	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
55f99050-8122-47f1-ac5e-b115eb7d64dc	ee000020-0000-0000-0000-000000000003	2.02	Manutencao	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
470eccbe-d27d-4c5e-ac3d-59d42fb3b83a	ee000020-0000-0000-0000-000000000003	2.03	Folha/Pastoral	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
bbe97459-b078-45a5-95fd-b8c421a2b0dd	ee000020-0000-0000-0000-000000000003	2.04	Missoes	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
6a5357d7-27d3-4d15-91d4-f676a78da934	ee000020-0000-0000-0000-000000000003	2.05	Eventos	despesa	t	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
b9b2e215-a577-4366-adb6-13c938bd9851	c2364ea8-4057-453e-af72-d22ae6058b57	1.01	Dizimos	receita	t	t	2026-06-23 19:32:42.502714+00	2026-06-23 19:32:42.502714+00
159dfce7-6208-4c8e-a9ab-86e66cbf3282	c2364ea8-4057-453e-af72-d22ae6058b57	1.02	Ofertas	receita	t	t	2026-06-23 19:32:42.502714+00	2026-06-23 19:32:42.502714+00
5698eb0c-e183-4e9b-aff0-5bfe1861c61a	c2364ea8-4057-453e-af72-d22ae6058b57	1.03	Campanhas	receita	t	t	2026-06-23 19:32:42.502714+00	2026-06-23 19:32:42.502714+00
724f00e5-c3e0-4994-a856-ad550dc4376f	c2364ea8-4057-453e-af72-d22ae6058b57	1.04	Missoes	receita	t	t	2026-06-23 19:32:42.502714+00	2026-06-23 19:32:42.502714+00
94a7cd74-b133-484a-8072-aed167bdb2d6	c2364ea8-4057-453e-af72-d22ae6058b57	1.05	Eventos	receita	t	t	2026-06-23 19:32:42.502714+00	2026-06-23 19:32:42.502714+00
d84af51b-2f7f-4db5-a435-c1b9a067aa45	c2364ea8-4057-453e-af72-d22ae6058b57	2.01	Administrativo	despesa	t	t	2026-06-23 19:32:42.502714+00	2026-06-23 19:32:42.502714+00
2779f0fd-6d25-46b4-a160-577b7d31eebf	c2364ea8-4057-453e-af72-d22ae6058b57	2.02	Manutencao	despesa	t	t	2026-06-23 19:32:42.502714+00	2026-06-23 19:32:42.502714+00
b891929d-d87a-4a00-8048-2c07af8ea51f	c2364ea8-4057-453e-af72-d22ae6058b57	2.03	Folha/Pastoral	despesa	t	t	2026-06-23 19:32:42.502714+00	2026-06-23 19:32:42.502714+00
23b27f0b-0495-4a4b-ad1d-fe6c56996fae	c2364ea8-4057-453e-af72-d22ae6058b57	2.04	Missoes	despesa	t	t	2026-06-23 19:32:42.502714+00	2026-06-23 19:32:42.502714+00
e4918b1d-6273-4852-b944-d7decf03580a	c2364ea8-4057-453e-af72-d22ae6058b57	2.05	Eventos	despesa	t	t	2026-06-23 19:32:42.502714+00	2026-06-23 19:32:42.502714+00
\.


--
-- Data for Name: finance_accounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.finance_accounts (id, organization_id, name, type, pix_key, opening_balance, current_balance, is_active, created_at, updated_at) FROM stdin;
9010e04a-61fe-4b23-8b07-9736a995caea	00000000-0000-0000-0000-0000000000a1	Caixa	caixa	\N	0	0	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
c2b29b34-efde-45d7-83c0-41ee0f09753d	00000000-0000-0000-0000-0000000000a1	Banco	banco	\N	0	0	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
e7072a81-a8ec-4850-b505-f16ca54473df	00000000-0000-0000-0000-0000000000a1	PIX	pix	\N	0	0	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
49a7fa1a-89ff-48c2-b6ef-deb82f88ac8f	00000000-0000-0000-0000-0000000000a1	Especie	especie	\N	0	0	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
27d8c6e7-7fe3-41e1-9fcf-813ac3c6ec09	00000000-0000-0000-0000-0000000000b1	Caixa	caixa	\N	0	0	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
485a6f86-a324-471c-ad09-7ac7236e681a	00000000-0000-0000-0000-0000000000b1	Banco	banco	\N	0	0	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
b25626e6-8717-421f-885a-243097f5a1e4	00000000-0000-0000-0000-0000000000b1	PIX	pix	\N	0	0	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
46e404d4-7a88-4535-a809-58dc0233b89b	00000000-0000-0000-0000-0000000000b1	Especie	especie	\N	0	0	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
595620fb-7598-44b1-951d-cc9a8ff96276	00000000-0000-0000-0000-0000000000a1	RLS Account super_admin	caixa	\N	0	0	t	2026-05-13 02:44:40.059356+00	2026-05-13 02:44:40.059356+00
41d4bdd1-1260-44c4-8cb9-7b60e846ef5d	00000000-0000-0000-0000-0000000000a1	RLS Account platform_admin	caixa	\N	0	0	t	2026-05-13 02:44:40.059356+00	2026-05-13 02:44:40.059356+00
d906de6b-f315-4fd0-8abc-9e9c76004812	00000000-0000-0000-0000-0000000000a1	RLS Account church_admin	caixa	\N	0	0	t	2026-05-13 02:44:40.059356+00	2026-05-13 02:44:40.059356+00
ae39cff6-25f3-481e-a4e3-424fdcd2eb84	00000000-0000-0000-0000-0000000000a1	RLS Account tesoureiro	caixa	\N	0	0	t	2026-05-13 02:44:40.059356+00	2026-05-13 02:44:40.059356+00
3da57e52-c770-427a-a6b8-8bb83112eb59	d4fb8a81-e301-42ae-8ba6-f8b2aa026278	Caixa	caixa	\N	0	0	t	2026-05-14 18:01:17.621546+00	2026-05-14 18:01:17.621546+00
29b32429-a5ff-4464-8ce6-ef88f75f32d7	d4fb8a81-e301-42ae-8ba6-f8b2aa026278	Banco	banco	\N	0	0	t	2026-05-14 18:01:17.621546+00	2026-05-14 18:01:17.621546+00
b9bf3a48-d1e4-41ca-be3f-c6031c0a0256	d4fb8a81-e301-42ae-8ba6-f8b2aa026278	PIX	pix	\N	0	0	t	2026-05-14 18:01:17.621546+00	2026-05-14 18:01:17.621546+00
5ff86925-da75-4967-981f-b95822d9f685	d4fb8a81-e301-42ae-8ba6-f8b2aa026278	Especie	especie	\N	0	0	t	2026-05-14 18:01:17.621546+00	2026-05-14 18:01:17.621546+00
13938230-c990-47ad-aeba-8182d0fb5497	a26456f5-9140-438c-9bd3-755ac06bf804	Caixa	caixa	\N	0	0	t	2026-05-14 18:02:07.592224+00	2026-05-14 18:02:07.592224+00
823b4025-efc6-4573-b65d-0a907ee2d842	a26456f5-9140-438c-9bd3-755ac06bf804	Banco	banco	\N	0	0	t	2026-05-14 18:02:07.592224+00	2026-05-14 18:02:07.592224+00
0e33f1f6-2e85-4c0a-acc8-4858a96c1e62	a26456f5-9140-438c-9bd3-755ac06bf804	PIX	pix	\N	0	0	t	2026-05-14 18:02:07.592224+00	2026-05-14 18:02:07.592224+00
098efccf-dbbf-4faa-be9f-8363d04ea319	a26456f5-9140-438c-9bd3-755ac06bf804	Especie	especie	\N	0	0	t	2026-05-14 18:02:07.592224+00	2026-05-14 18:02:07.592224+00
0c7a92d3-09ea-4c47-b8a2-e81a5bd8767e	659de9d8-8220-4349-b606-67037f2fd7ab	Caixa	caixa	\N	0	0	t	2026-05-18 21:38:14.137103+00	2026-05-18 21:38:14.137103+00
e46f2373-a071-4ad0-a362-96b2d2da3516	659de9d8-8220-4349-b606-67037f2fd7ab	Banco	banco	\N	0	0	t	2026-05-18 21:38:14.137103+00	2026-05-18 21:38:14.137103+00
d8954169-1ef3-46fb-940a-4f27240fb52d	659de9d8-8220-4349-b606-67037f2fd7ab	PIX	pix	\N	0	0	t	2026-05-18 21:38:14.137103+00	2026-05-18 21:38:14.137103+00
1ace3616-965e-4807-b943-3bb4624a80fc	659de9d8-8220-4349-b606-67037f2fd7ab	Especie	especie	\N	0	0	t	2026-05-18 21:38:14.137103+00	2026-05-18 21:38:14.137103+00
ff9926ed-8c7c-4326-a428-761cb5b2f8f8	10000000-0000-0000-0000-000000000001	Caixa	caixa	\N	0	0	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
cd7eaa4e-37ff-4e48-91f4-c6cb71c4ae49	10000000-0000-0000-0000-000000000001	Banco	banco	\N	0	0	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
c977665f-3ac7-4c49-9f3f-af5a78a8929f	10000000-0000-0000-0000-000000000001	PIX	pix	\N	0	0	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
c34ba38b-5f05-40aa-ba9e-1eb9068168c7	10000000-0000-0000-0000-000000000001	Especie	especie	\N	0	0	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
fb19bd3b-540c-48fe-b37e-27d106da6b34	10000000-0000-0000-0000-000000000002	Caixa	caixa	\N	0	0	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
a416ca24-6574-4bc0-93b5-90d59895256f	10000000-0000-0000-0000-000000000002	Banco	banco	\N	0	0	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
fe1af6cd-7f85-4079-96f8-d3f9af7bfeb5	10000000-0000-0000-0000-000000000002	PIX	pix	\N	0	0	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
50a28c3e-7c06-42f6-bc78-2f216340c72e	10000000-0000-0000-0000-000000000002	Especie	especie	\N	0	0	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
2fc3dc40-0fd8-4296-a3f7-cc4accf226f3	10000000-0000-0000-0000-000000000003	Caixa	caixa	\N	0	0	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
f86c637f-77b6-4693-adbe-b39b52f0e59d	10000000-0000-0000-0000-000000000003	Banco	banco	\N	0	0	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
202aa25b-704b-420d-a7ca-5eb8964b698b	10000000-0000-0000-0000-000000000003	PIX	pix	\N	0	0	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
3645c737-1999-44a4-8eeb-54d301e36aa2	10000000-0000-0000-0000-000000000003	Especie	especie	\N	0	0	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
7dfe05a3-abf6-48b7-926f-0d2957371fe9	dd000001-0000-0000-0000-000000000001	Caixa	caixa	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
0ff32e10-008e-4f50-966e-d3997260010e	dd000001-0000-0000-0000-000000000001	Banco	banco	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
8291f429-76e0-414d-88d9-8d9e17bf5f4d	dd000001-0000-0000-0000-000000000001	PIX	pix	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
c8b756c4-6e2c-4f5d-b8bc-a50c7e247435	dd000001-0000-0000-0000-000000000001	Especie	especie	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
e134483b-313f-42a7-a246-064916a92e5a	dd000001-0000-0000-0000-000000000002	Caixa	caixa	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
30a6abb5-4a34-44ed-b5ac-3f8188f2b90c	dd000001-0000-0000-0000-000000000002	Banco	banco	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
2838a007-b24d-4dfe-8301-24c538c2048e	dd000001-0000-0000-0000-000000000002	PIX	pix	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
172e42e0-bf6e-4248-8c9a-cc4cc3a49b0c	dd000001-0000-0000-0000-000000000002	Especie	especie	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
3366c2d2-5825-4dc7-a6f5-d7139d6dbb29	dd000001-0000-0000-0000-000000000003	Caixa	caixa	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
35a80115-85a6-4085-b435-fe7cd2614b7b	dd000001-0000-0000-0000-000000000003	Banco	banco	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
7d4b1543-d0f2-41a9-bf9f-762ee9be1b04	dd000001-0000-0000-0000-000000000003	PIX	pix	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
9286560c-1498-4c93-b093-8ef818207fec	dd000001-0000-0000-0000-000000000003	Especie	especie	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
f60199d5-6df6-4918-b484-3a7d14cc54ad	dd000001-0000-0000-0000-000000000004	Caixa	caixa	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
462c215d-0069-4341-b959-95b84d9b3bf1	dd000001-0000-0000-0000-000000000004	Banco	banco	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
43457155-cf98-484b-9e78-55f9de313b28	dd000001-0000-0000-0000-000000000004	PIX	pix	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
a67a2514-fcf9-405d-8c7f-a8826c8ff2ac	dd000001-0000-0000-0000-000000000004	Especie	especie	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
d6c95b19-0d9f-4332-900d-d69e7a6ca2bb	dd000001-0000-0000-0000-000000000005	Caixa	caixa	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
a033d931-e79d-4874-bba7-d1f6c123b7c3	dd000001-0000-0000-0000-000000000005	Banco	banco	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
ff1288f9-1dd4-404d-bba5-c3bf75ee9c9b	dd000001-0000-0000-0000-000000000005	PIX	pix	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
a2067c0b-f47d-4fff-9819-7538c4fdff92	dd000001-0000-0000-0000-000000000005	Especie	especie	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
c889205d-c11e-458f-9aef-20b5d9704a88	dd000002-0000-0000-0000-000000000001	Caixa	caixa	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
ef404c32-dd28-4b28-ae9a-83bb1a12cc82	dd000002-0000-0000-0000-000000000001	Banco	banco	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
2b81b370-5c23-425d-9bfb-6a91104fdf8e	dd000002-0000-0000-0000-000000000001	PIX	pix	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
e67b3166-ea09-4f4a-843d-f744e4871179	dd000002-0000-0000-0000-000000000001	Especie	especie	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
77365206-6188-4da4-bef9-bb01418dc52b	dd000002-0000-0000-0000-000000000002	Caixa	caixa	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
6cd736a3-8850-4d53-b816-87e522003416	dd000002-0000-0000-0000-000000000002	Banco	banco	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
f4d0edfd-d10f-4dee-88cb-5b7afc491929	dd000002-0000-0000-0000-000000000002	PIX	pix	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
380fd355-9358-4c7b-aa53-fea8688c79e4	dd000002-0000-0000-0000-000000000002	Especie	especie	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
b2029d2c-655b-424a-ac41-b9c038362d79	dd000002-0000-0000-0000-000000000003	Caixa	caixa	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
ff7836be-c56a-4e08-a49b-bc4da3f494ae	dd000002-0000-0000-0000-000000000003	Banco	banco	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
1997d4ff-11d9-4831-9117-ac6755e93cd4	dd000002-0000-0000-0000-000000000003	PIX	pix	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
42553ff9-6103-4947-b500-decd64e60f28	dd000002-0000-0000-0000-000000000003	Especie	especie	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
2ee4b54e-553b-4d57-85a4-25cd2d8ebe4c	dd000002-0000-0000-0000-000000000004	Caixa	caixa	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
4d364167-9d65-4f60-b2d8-a8ed19e719db	dd000002-0000-0000-0000-000000000004	Banco	banco	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
565bf3ea-4969-400d-a733-772a80490811	dd000002-0000-0000-0000-000000000004	PIX	pix	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
67f78811-2713-43de-9c08-1e45e664bc00	dd000002-0000-0000-0000-000000000004	Especie	especie	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
554da2bf-fa9a-4583-a461-ca90b361fd5b	dd000002-0000-0000-0000-000000000005	Caixa	caixa	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
7aaa0349-66cb-4d5b-9e87-36dbae33119b	dd000002-0000-0000-0000-000000000005	Banco	banco	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
e3944de1-b08b-4e2a-ace6-fa83145e877d	dd000002-0000-0000-0000-000000000005	PIX	pix	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
cca411a8-d19d-45c4-b80d-2d3dd06be7af	dd000002-0000-0000-0000-000000000005	Especie	especie	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
3f475a2a-b58d-4819-ab27-e6d8398a98f4	dd000002-0000-0000-0000-000000000006	Caixa	caixa	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
0eb3e95d-5c94-4143-b89b-775c6ad43e79	dd000002-0000-0000-0000-000000000006	Banco	banco	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
a044f951-31f5-4ec4-8400-f7680344cef7	dd000002-0000-0000-0000-000000000006	PIX	pix	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
09495871-1c33-4237-ac35-d6d2a6e4064e	dd000002-0000-0000-0000-000000000006	Especie	especie	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
d9d72341-3042-4a64-8f54-1d3ad90aa482	dd000002-0000-0000-0000-000000000007	Caixa	caixa	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
1cce7979-bd86-43f1-a631-8f0027a70435	dd000002-0000-0000-0000-000000000007	Banco	banco	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
908f4b65-7d05-4c72-963d-b9ead6c73036	dd000002-0000-0000-0000-000000000007	PIX	pix	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
ecf399c2-7969-4c76-88c9-4d34439472f0	dd000002-0000-0000-0000-000000000007	Especie	especie	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
769376d6-713e-40c2-966c-21f42ac8c827	11111111-0000-0000-0000-000000000001	Caixa	caixa	\N	0	0	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
5d2777ca-5992-45ca-a7f5-de30a199cfd9	11111111-0000-0000-0000-000000000001	Banco	banco	\N	0	0	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
59d8d372-78c8-4519-9f75-9cef94418200	11111111-0000-0000-0000-000000000001	PIX	pix	\N	0	0	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
79daadef-3370-4508-ae36-ce7115d2a566	11111111-0000-0000-0000-000000000001	Especie	especie	\N	0	0	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
54bb7c63-afb2-45ad-a2f5-4e9719d06652	11111111-0000-0000-0000-000000000002	Caixa	caixa	\N	0	0	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
b7124033-f668-42cd-a2ff-42329b345fab	11111111-0000-0000-0000-000000000002	Banco	banco	\N	0	0	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
05e4dc3b-9186-4dd7-a5d6-f0a72426abcd	11111111-0000-0000-0000-000000000002	PIX	pix	\N	0	0	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
aacaf3a7-c76b-40c8-b133-533a741d23e5	11111111-0000-0000-0000-000000000002	Especie	especie	\N	0	0	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
a59e99cc-1562-41a7-b985-c8753c700c22	11111111-0000-0000-0000-000000000003	Caixa	caixa	\N	0	0	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
7f3a45e6-a110-4111-9825-ce3c26014241	11111111-0000-0000-0000-000000000003	Banco	banco	\N	0	0	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
d64db709-cded-465c-bd6e-49d68491098b	11111111-0000-0000-0000-000000000003	PIX	pix	\N	0	0	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
1772dd6a-0f40-40e6-abbb-db796b41b999	11111111-0000-0000-0000-000000000003	Especie	especie	\N	0	0	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
9e34f581-c6ba-4cb1-9432-a7e6ed683f27	11111111-0000-0000-0000-000000000004	Caixa	caixa	\N	0	0	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
eb8a78e9-4180-4583-9cb8-e2ba7d85a42c	11111111-0000-0000-0000-000000000004	Banco	banco	\N	0	0	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
d07ffcf8-9883-4d72-90d8-b850b543ca5d	11111111-0000-0000-0000-000000000004	PIX	pix	\N	0	0	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
4eb2c03b-ab0f-42e3-93c7-0f86762efaf8	11111111-0000-0000-0000-000000000004	Especie	especie	\N	0	0	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
0225da53-b8b4-4554-958c-6a3d85577d34	dd000002-0000-0000-0000-000000000008	Caixa	caixa	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
95eec16a-1317-40f4-b7a2-d8cc1373a753	dd000002-0000-0000-0000-000000000008	Banco	banco	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
6b22e20e-f4ca-47af-baf3-1b8325702985	dd000002-0000-0000-0000-000000000008	PIX	pix	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
76486823-f0a3-43ef-abe2-2f9fbc45d673	dd000002-0000-0000-0000-000000000008	Especie	especie	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
ade1e80a-d89a-42d0-8857-c5583a7240d2	dd000002-0000-0000-0000-000000000009	Caixa	caixa	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
d78b2bc0-2d2c-4188-a86b-e75f00ba6269	dd000002-0000-0000-0000-000000000009	Banco	banco	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
b8517de4-78ff-4765-a218-6c5ae559d5b0	dd000002-0000-0000-0000-000000000009	PIX	pix	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
5fbd779f-ae91-48f2-9400-13f763b73a90	dd000002-0000-0000-0000-000000000009	Especie	especie	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
91043b6a-d50d-48bb-b511-e9c77ed028e2	dd000002-0000-0000-0000-00000000000a	Caixa	caixa	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
3e2238f5-7f96-4af0-8475-305d1537a4b0	dd000002-0000-0000-0000-00000000000a	Banco	banco	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
32802f92-74a2-4051-83b5-3e6eaa26f22c	dd000002-0000-0000-0000-00000000000a	PIX	pix	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
a8b65140-856c-4ef4-a6ea-03b015e053ed	dd000002-0000-0000-0000-00000000000a	Especie	especie	\N	0	0	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
dd000005-0000-0000-0000-000000000001	10000000-0000-0000-0000-000000000002	Caixa Geral	caixa	\N	5000.00	12450.00	t	2026-06-15 20:58:59.31546+00	2026-06-15 20:58:59.31546+00
dd000005-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000002	Conta Corrente Bradesco	banco	\N	10000.00	38920.50	t	2026-06-15 20:58:59.31546+00	2026-06-15 20:58:59.31546+00
dd000005-0000-0000-0000-000000000003	10000000-0000-0000-0000-000000000002	Fundo de Missoes	banco	\N	2000.00	15300.00	t	2026-06-15 20:58:59.31546+00	2026-06-15 20:58:59.31546+00
dd000005-0000-0000-0000-000000000004	10000000-0000-0000-0000-000000000002	Fundo de Construcao	banco	\N	50000.00	89750.00	t	2026-06-15 20:58:59.31546+00	2026-06-15 20:58:59.31546+00
dd000005-0000-0000-0000-000000000005	10000000-0000-0000-0000-000000000002	Caixa Congregacoes	caixa	\N	1000.00	4210.00	t	2026-06-15 20:58:59.31546+00	2026-06-15 20:58:59.31546+00
db99b41e-cab6-4568-afb8-dc07e0a53693	ee000010-0000-0000-0000-000000000001	Caixa	caixa	\N	0	0	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
56d8cc10-a396-4371-8df3-702cbe602f72	ee000010-0000-0000-0000-000000000001	Banco	banco	\N	0	0	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
376e220a-8d77-4b5c-8459-18015e649df9	ee000010-0000-0000-0000-000000000001	PIX	pix	\N	0	0	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
ac3a7b5b-b5dd-40de-8934-f2f05c3ac5fa	ee000010-0000-0000-0000-000000000001	Especie	especie	\N	0	0	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
1e5138bf-b47d-4be7-89c0-ddf93f43b677	ee000010-0000-0000-0000-000000000002	Caixa	caixa	\N	0	0	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
536e40f8-7acc-4cf6-8f1a-256ffcd60292	ee000010-0000-0000-0000-000000000002	Banco	banco	\N	0	0	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
255af88c-1aa6-4ae7-a87b-2f334ed143c8	ee000010-0000-0000-0000-000000000002	PIX	pix	\N	0	0	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
06162b57-2e46-4e24-8246-e84fe0161a92	ee000010-0000-0000-0000-000000000002	Especie	especie	\N	0	0	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
c4ba3af4-b645-4b1d-be81-c1db31c3ee24	ee000010-0000-0000-0000-000000000003	Caixa	caixa	\N	0	0	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
66ea2bd3-12a8-4333-b2e9-6ae01adbbf69	ee000010-0000-0000-0000-000000000003	Banco	banco	\N	0	0	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
81102cae-1fc6-46c2-b8e2-c11a27cacb03	ee000010-0000-0000-0000-000000000003	PIX	pix	\N	0	0	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
1c228eef-8b1d-49f5-b8c1-9f1ab2e4e3f4	ee000010-0000-0000-0000-000000000003	Especie	especie	\N	0	0	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
ff7aebbc-e2d9-4e65-bdd7-91feb6fb1976	ee000020-0000-0000-0000-000000000001	Caixa	caixa	\N	0	0	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
1c74771e-fc8f-446a-9937-a17c071572cf	ee000020-0000-0000-0000-000000000001	Banco	banco	\N	0	0	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
dc7ade2d-af8c-41e4-8035-b6f7120f422c	ee000020-0000-0000-0000-000000000001	PIX	pix	\N	0	0	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
8a66271e-6232-493e-b706-8abb7060674d	ee000020-0000-0000-0000-000000000001	Especie	especie	\N	0	0	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
565c94e9-9b0d-4040-b78a-6fe0f3d6ef77	ee000020-0000-0000-0000-000000000002	Caixa	caixa	\N	0	0	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
ff0b9470-e4a5-4a1a-ad69-8dc3262e954e	ee000020-0000-0000-0000-000000000002	Banco	banco	\N	0	0	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
5a8ca6ec-127d-430d-b52f-37f2964c9844	ee000020-0000-0000-0000-000000000002	PIX	pix	\N	0	0	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
cbcbcff2-7e40-4412-a17b-38572632feb6	ee000020-0000-0000-0000-000000000002	Especie	especie	\N	0	0	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
2622e814-4f5c-48fa-bcad-bb737b3d5f83	ee000020-0000-0000-0000-000000000003	Caixa	caixa	\N	0	0	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
5bf8ff9d-8446-4d14-a27c-f531fa533535	ee000020-0000-0000-0000-000000000003	Banco	banco	\N	0	0	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
a740585d-5778-473b-a47f-f091730b3135	ee000020-0000-0000-0000-000000000003	PIX	pix	\N	0	0	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
0edc21df-ef0d-4663-aa03-949432cf961b	ee000020-0000-0000-0000-000000000003	Especie	especie	\N	0	0	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
efef91f9-69f6-43e4-a840-ac17aa75c12d	c2364ea8-4057-453e-af72-d22ae6058b57	Caixa	caixa	\N	0	0	t	2026-06-23 19:32:42.502714+00	2026-06-23 19:32:42.502714+00
616f3cf4-5e9c-40d5-878f-639df77a5b37	c2364ea8-4057-453e-af72-d22ae6058b57	Banco	banco	\N	0	0	t	2026-06-23 19:32:42.502714+00	2026-06-23 19:32:42.502714+00
35394bbe-2d60-41be-be65-b34be086cd22	c2364ea8-4057-453e-af72-d22ae6058b57	PIX	pix	\N	0	0	t	2026-06-23 19:32:42.502714+00	2026-06-23 19:32:42.502714+00
2a6c9525-d476-43f9-84b6-91adebe5f05c	c2364ea8-4057-453e-af72-d22ae6058b57	Especie	especie	\N	0	0	t	2026-06-23 19:32:42.502714+00	2026-06-23 19:32:42.502714+00
\.


--
-- Data for Name: finance_cost_centers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.finance_cost_centers (id, organization_id, name, type, is_active, created_at, updated_at) FROM stdin;
4824cf69-35a2-4b32-b00c-b38314b6a935	00000000-0000-0000-0000-0000000000a1	Matriz	matriz	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
e918f51b-67ae-41c2-b07d-a8a9c6825f0c	00000000-0000-0000-0000-0000000000a1	Congregacoes	congregacao	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
fddd762f-719a-4255-a774-adba81aaaf65	00000000-0000-0000-0000-0000000000a1	Departamentos	departamento	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
1866a1ef-ce59-44cc-928d-c5237d72d042	00000000-0000-0000-0000-0000000000a1	Eventos	evento	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
d4a93b8d-6b02-43fa-84c7-6e17259828e6	00000000-0000-0000-0000-0000000000b1	Matriz	matriz	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
7a75d7b8-5d22-413b-b35a-dea9aa7e9d7a	00000000-0000-0000-0000-0000000000b1	Congregacoes	congregacao	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
a6c279eb-2f16-46c5-ab23-c7f23447fbae	00000000-0000-0000-0000-0000000000b1	Departamentos	departamento	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
6be14619-3ac4-44d1-952d-5cb08e4a802f	00000000-0000-0000-0000-0000000000b1	Eventos	evento	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00
92f2a1c0-212e-47df-99bf-a5a1a123a9b4	00000000-0000-0000-0000-0000000000a1	RLS Center super_admin	departamento	t	2026-05-13 02:44:40.059356+00	2026-05-13 02:44:40.059356+00
b4aea073-f702-4cb8-9c00-575a1afae180	00000000-0000-0000-0000-0000000000a1	RLS Center platform_admin	departamento	t	2026-05-13 02:44:40.059356+00	2026-05-13 02:44:40.059356+00
e56ccb6d-1e4e-476d-846c-8d8c2027ea01	00000000-0000-0000-0000-0000000000a1	RLS Center church_admin	departamento	t	2026-05-13 02:44:40.059356+00	2026-05-13 02:44:40.059356+00
c668b78d-0f6b-4139-9428-07d465e6415a	00000000-0000-0000-0000-0000000000a1	RLS Center tesoureiro	departamento	t	2026-05-13 02:44:40.059356+00	2026-05-13 02:44:40.059356+00
25e3231f-3cc7-4ad4-bab8-456cd9bf7b94	d4fb8a81-e301-42ae-8ba6-f8b2aa026278	Matriz	matriz	t	2026-05-14 18:01:17.621546+00	2026-05-14 18:01:17.621546+00
a651c082-0040-4037-a800-dafbab2f310c	d4fb8a81-e301-42ae-8ba6-f8b2aa026278	Congregacoes	congregacao	t	2026-05-14 18:01:17.621546+00	2026-05-14 18:01:17.621546+00
b8499599-30bc-4086-8426-48f1eea1d953	d4fb8a81-e301-42ae-8ba6-f8b2aa026278	Departamentos	departamento	t	2026-05-14 18:01:17.621546+00	2026-05-14 18:01:17.621546+00
96da96aa-b8a7-4d48-ac31-5a535f8fbd3c	d4fb8a81-e301-42ae-8ba6-f8b2aa026278	Eventos	evento	t	2026-05-14 18:01:17.621546+00	2026-05-14 18:01:17.621546+00
159421ef-e19c-415f-8a23-bbb3e72dfe90	a26456f5-9140-438c-9bd3-755ac06bf804	Matriz	matriz	t	2026-05-14 18:02:07.592224+00	2026-05-14 18:02:07.592224+00
c9717b99-a8ce-4216-9e62-6176df772041	a26456f5-9140-438c-9bd3-755ac06bf804	Congregacoes	congregacao	t	2026-05-14 18:02:07.592224+00	2026-05-14 18:02:07.592224+00
388c161d-9c09-43fc-a39f-8e300bc6ca26	a26456f5-9140-438c-9bd3-755ac06bf804	Departamentos	departamento	t	2026-05-14 18:02:07.592224+00	2026-05-14 18:02:07.592224+00
3b6739f3-de92-42ba-a7aa-ad8c60afe00d	a26456f5-9140-438c-9bd3-755ac06bf804	Eventos	evento	t	2026-05-14 18:02:07.592224+00	2026-05-14 18:02:07.592224+00
98810e2d-3d04-4cbe-b354-55c678c566e7	659de9d8-8220-4349-b606-67037f2fd7ab	Matriz	matriz	t	2026-05-18 21:38:14.137103+00	2026-05-18 21:38:14.137103+00
d7b816d2-d5bd-437c-8e3c-9d3bbae8b282	659de9d8-8220-4349-b606-67037f2fd7ab	Congregacoes	congregacao	t	2026-05-18 21:38:14.137103+00	2026-05-18 21:38:14.137103+00
6058159d-9b6b-4f85-90c5-1ed2fd027ca2	659de9d8-8220-4349-b606-67037f2fd7ab	Departamentos	departamento	t	2026-05-18 21:38:14.137103+00	2026-05-18 21:38:14.137103+00
a4c53291-0366-4e7c-b663-09199728a34d	659de9d8-8220-4349-b606-67037f2fd7ab	Eventos	evento	t	2026-05-18 21:38:14.137103+00	2026-05-18 21:38:14.137103+00
dd4c45df-5d70-4507-b3a3-d66844806f4c	10000000-0000-0000-0000-000000000001	Matriz	matriz	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
84b92aec-7dcd-41c3-b461-c33c7ff3bfe8	10000000-0000-0000-0000-000000000001	Congregacoes	congregacao	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
199c25f2-ec0a-4168-9d9d-cf1ede52c121	10000000-0000-0000-0000-000000000001	Departamentos	departamento	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
d278407d-4ddb-41d9-b68e-2e7ddf13c822	10000000-0000-0000-0000-000000000001	Eventos	evento	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
6cf970d2-915d-4202-97f6-5212ad21ab88	10000000-0000-0000-0000-000000000002	Matriz	matriz	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
ede0ce17-f879-4b79-b1e6-19d5510304fd	10000000-0000-0000-0000-000000000002	Congregacoes	congregacao	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
5aac983e-6735-47ab-a7f7-c802dca20ac7	10000000-0000-0000-0000-000000000002	Departamentos	departamento	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
18724b11-b9a4-40af-916b-394fea9dc91b	10000000-0000-0000-0000-000000000002	Eventos	evento	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
9b428f8f-5a28-4449-97de-077a7f03441c	10000000-0000-0000-0000-000000000003	Matriz	matriz	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
0bf3445f-dfda-4b90-831b-cc229a816e42	10000000-0000-0000-0000-000000000003	Congregacoes	congregacao	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
ba6b0db6-d3d0-4385-9e00-0f1aa8e4d354	10000000-0000-0000-0000-000000000003	Departamentos	departamento	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
07bd89a2-d463-45ef-bec8-2d7e3d7e6453	10000000-0000-0000-0000-000000000003	Eventos	evento	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:12:52.343663+00
9de96310-cc1a-4e8d-9548-1cc3ce0b22a2	dd000001-0000-0000-0000-000000000001	Matriz	matriz	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
2c893c63-d4f5-4f12-b174-2cc3fff19d47	dd000001-0000-0000-0000-000000000001	Congregacoes	congregacao	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
2b1a7ca1-f25e-40f2-8a3a-4b572f336978	dd000001-0000-0000-0000-000000000001	Departamentos	departamento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
93dc17d8-84af-4457-b323-37d24b55f387	dd000001-0000-0000-0000-000000000001	Eventos	evento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
bd0bf994-715e-4e6a-9518-1b3c373df301	dd000001-0000-0000-0000-000000000002	Matriz	matriz	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
83d006fa-67f7-4747-9033-e8a39d0269f7	dd000001-0000-0000-0000-000000000002	Congregacoes	congregacao	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
80985534-bbea-4504-b82a-89e9631485b1	dd000001-0000-0000-0000-000000000002	Departamentos	departamento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
3339fbfa-fbb7-4955-80a6-b19a137950da	dd000001-0000-0000-0000-000000000002	Eventos	evento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
dff458ee-5bcf-4124-b773-dcc35df68f1d	dd000001-0000-0000-0000-000000000003	Matriz	matriz	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
606c0877-8c1e-4699-961c-16a4a5c1c2ee	dd000001-0000-0000-0000-000000000003	Congregacoes	congregacao	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
3a1a2b0e-42f0-4c14-b052-951527353df6	dd000001-0000-0000-0000-000000000003	Departamentos	departamento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
01c961d9-9be3-4865-896d-e78a3e681cb1	dd000001-0000-0000-0000-000000000003	Eventos	evento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
c3f0aebe-15ff-4a63-8b73-3a5b80d40a72	dd000001-0000-0000-0000-000000000004	Matriz	matriz	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
1394f736-47cc-44b7-890e-49dbf44c544d	dd000001-0000-0000-0000-000000000004	Congregacoes	congregacao	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
c9ff5dca-3396-4e8a-b1d5-749ed89f6e09	dd000001-0000-0000-0000-000000000004	Departamentos	departamento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
91ca4b1f-cabd-45e6-82f1-c2944af34dca	dd000001-0000-0000-0000-000000000004	Eventos	evento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
7e7e0352-e0b6-40df-8fbe-b2b4b1bdfb01	dd000001-0000-0000-0000-000000000005	Matriz	matriz	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
3c83bfc4-2b88-4e19-8439-92f914543aa2	dd000001-0000-0000-0000-000000000005	Congregacoes	congregacao	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
e405e990-770f-4caf-829b-b7313475e9ae	dd000001-0000-0000-0000-000000000005	Departamentos	departamento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
374ead2b-6504-4a1d-bf8a-1143dc8aacdb	dd000001-0000-0000-0000-000000000005	Eventos	evento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
93984ef4-11ab-4b79-8257-07b55d224565	dd000002-0000-0000-0000-000000000001	Matriz	matriz	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
d9d39be4-dd35-40cc-99b6-1893172301f9	dd000002-0000-0000-0000-000000000001	Congregacoes	congregacao	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
a262ba35-1b55-425e-a62a-a873acf79efe	dd000002-0000-0000-0000-000000000001	Departamentos	departamento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
1b76a79c-fd92-493f-b94a-579cf9c86420	dd000002-0000-0000-0000-000000000001	Eventos	evento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
528c06c6-f09a-4f93-b56b-6f582a5be670	dd000002-0000-0000-0000-000000000002	Matriz	matriz	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
32cde17c-5565-4c5a-a912-afb983bd0012	dd000002-0000-0000-0000-000000000002	Congregacoes	congregacao	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
15374e74-61d4-41f6-a674-c3cebd45f904	dd000002-0000-0000-0000-000000000002	Departamentos	departamento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
82964023-dc75-42d9-b567-463643b3a13b	dd000002-0000-0000-0000-000000000002	Eventos	evento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
d4137a1a-fd6a-423c-86d2-d7f693876d7d	dd000002-0000-0000-0000-000000000003	Matriz	matriz	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
d88ac929-d7f7-4fb5-9a0d-afad8d3c06a1	dd000002-0000-0000-0000-000000000003	Congregacoes	congregacao	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
ec65d7df-66dd-4ef2-b389-11c6b8ed82f1	dd000002-0000-0000-0000-000000000003	Departamentos	departamento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
3eb89efd-a3d1-4557-af76-cecc6321dca3	dd000002-0000-0000-0000-000000000003	Eventos	evento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
1be4e01b-ada2-4d77-8d84-22d437246330	dd000002-0000-0000-0000-000000000004	Matriz	matriz	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
3473c04c-695b-421d-a114-8b79e21352b0	dd000002-0000-0000-0000-000000000004	Congregacoes	congregacao	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
1ae86da9-4612-4213-9790-de536c1e6872	dd000002-0000-0000-0000-000000000004	Departamentos	departamento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
feb6e3af-fd17-4ceb-8510-c3a527770e92	dd000002-0000-0000-0000-000000000004	Eventos	evento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
6023ce98-a2ac-4163-8c50-45fc2006e044	dd000002-0000-0000-0000-000000000005	Matriz	matriz	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
50207b57-516a-424a-89a0-145492ddb4b2	dd000002-0000-0000-0000-000000000005	Congregacoes	congregacao	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
bd794dab-426e-4cd9-ba54-f90e032a14c1	dd000002-0000-0000-0000-000000000005	Departamentos	departamento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
6dda6f0d-6a54-408b-9f16-a31c997702a0	dd000002-0000-0000-0000-000000000005	Eventos	evento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
0eac6f23-db25-406f-844b-548f3ee6f8bd	dd000002-0000-0000-0000-000000000006	Matriz	matriz	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
192caec8-279d-4f54-8fd4-e709a14a7ee1	dd000002-0000-0000-0000-000000000006	Congregacoes	congregacao	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
00f729f4-b948-4a0e-9e9e-9567b829d6d1	dd000002-0000-0000-0000-000000000006	Departamentos	departamento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
1429f997-6a30-4ae1-884e-242b9783a8d6	dd000002-0000-0000-0000-000000000006	Eventos	evento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
2ba011db-9c9b-4999-8624-1064bdd42f17	dd000002-0000-0000-0000-000000000007	Matriz	matriz	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
43357fc8-8213-45f7-bdbd-9d9d75c4341a	dd000002-0000-0000-0000-000000000007	Congregacoes	congregacao	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
23e24fe9-9e5e-475d-9a7d-831a0c9f4a58	dd000002-0000-0000-0000-000000000007	Departamentos	departamento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
319fd5d1-b408-4885-97bf-0116f39d3705	dd000002-0000-0000-0000-000000000007	Eventos	evento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
6ed8d2c0-b752-40eb-88b4-ba11b2bdfab3	11111111-0000-0000-0000-000000000001	Matriz	matriz	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
b9641085-2ba5-419d-8182-daef26faf271	11111111-0000-0000-0000-000000000001	Congregacoes	congregacao	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
3ae20797-955c-4954-b5a2-96294045f1d0	11111111-0000-0000-0000-000000000001	Departamentos	departamento	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
8b9ed1b4-5dac-4969-8b63-7ffc9f178d37	11111111-0000-0000-0000-000000000001	Eventos	evento	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
cf4b32ba-5887-4c34-a63e-c0601d793780	11111111-0000-0000-0000-000000000002	Matriz	matriz	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
692fe0d5-0a44-46d6-aab6-2e991b95ca2c	11111111-0000-0000-0000-000000000002	Congregacoes	congregacao	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
c6b39b1c-07e7-480c-a49c-913c7fe204de	11111111-0000-0000-0000-000000000002	Departamentos	departamento	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
4438b85b-6f56-46c9-957e-78410e165fa4	11111111-0000-0000-0000-000000000002	Eventos	evento	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
5c7027f9-5791-4d44-9530-a44dbb1b5ef6	11111111-0000-0000-0000-000000000003	Matriz	matriz	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
1827a545-48f3-4d4f-b053-1e0c22814a91	11111111-0000-0000-0000-000000000003	Congregacoes	congregacao	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
73de34fc-d115-4959-a737-3a2f4b777add	11111111-0000-0000-0000-000000000003	Departamentos	departamento	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
fa7af021-4634-4351-baea-cbcf143fd473	11111111-0000-0000-0000-000000000003	Eventos	evento	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
7523d5d8-4aa9-4d87-82cb-1245c910a190	11111111-0000-0000-0000-000000000004	Matriz	matriz	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
e473381d-3ac3-45c9-9a1e-bc142e0e7507	11111111-0000-0000-0000-000000000004	Congregacoes	congregacao	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
3ae19bf3-b681-4ef6-a42b-2125cb3ca196	11111111-0000-0000-0000-000000000004	Departamentos	departamento	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
d96e942c-fc80-4cce-8537-af860e7e809b	11111111-0000-0000-0000-000000000004	Eventos	evento	t	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00
ae43e8cc-0856-4a2f-8c93-aefd7a9b8ed1	dd000002-0000-0000-0000-000000000008	Matriz	matriz	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
a8b88b86-7cf5-4ba0-a9a3-eb6b23707959	dd000002-0000-0000-0000-000000000008	Congregacoes	congregacao	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
198a6257-98a0-430d-890c-b9ce93290a8c	dd000002-0000-0000-0000-000000000008	Departamentos	departamento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
9c824310-f02f-4633-befc-3c80e3c997b7	dd000002-0000-0000-0000-000000000008	Eventos	evento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
e8306b03-8095-49d9-bb65-353fb3e067ce	dd000002-0000-0000-0000-000000000009	Matriz	matriz	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
dc76a898-3e11-4324-9ebb-7b292ad444f2	dd000002-0000-0000-0000-000000000009	Congregacoes	congregacao	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
f002c574-e5b6-4f96-8e1e-629d72d53864	dd000002-0000-0000-0000-000000000009	Departamentos	departamento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
61994347-6a71-4003-8163-0c496a64e591	dd000002-0000-0000-0000-000000000009	Eventos	evento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
10259017-c849-476e-9190-fc0170d8f604	dd000002-0000-0000-0000-00000000000a	Matriz	matriz	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
868c7103-00c4-4d06-a51e-8282dbce0222	dd000002-0000-0000-0000-00000000000a	Congregacoes	congregacao	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
26bcb674-bb11-4ddb-9c2f-1ea83c6ab3bc	dd000002-0000-0000-0000-00000000000a	Departamentos	departamento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
2681d7a2-efe2-4e02-a16f-ea3948db71e7	dd000002-0000-0000-0000-00000000000a	Eventos	evento	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00
dd000007-0000-0000-0000-000000000001	10000000-0000-0000-0000-000000000002	Ministerio de Louvor	departamento	t	2026-06-15 20:58:59.31546+00	2026-06-15 20:58:59.31546+00
dd000007-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000002	Ministerio Infantil	departamento	t	2026-06-15 20:58:59.31546+00	2026-06-15 20:58:59.31546+00
dd000007-0000-0000-0000-000000000003	10000000-0000-0000-0000-000000000002	Missoes Nacionais	departamento	t	2026-06-15 20:58:59.31546+00	2026-06-15 20:58:59.31546+00
dd000007-0000-0000-0000-000000000004	10000000-0000-0000-0000-000000000002	Administracao Geral	matriz	t	2026-06-15 20:58:59.31546+00	2026-06-15 20:58:59.31546+00
9054b2bd-d752-4c24-b059-2828cffb99f6	ee000010-0000-0000-0000-000000000001	Matriz	matriz	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
8efbcabb-45e4-4e45-a00b-a5c1645b419a	ee000010-0000-0000-0000-000000000001	Congregacoes	congregacao	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
17873101-4dde-4e6a-9b01-927351ac3e39	ee000010-0000-0000-0000-000000000001	Departamentos	departamento	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
7a765fda-8943-4a2b-9ab5-3130cde1852a	ee000010-0000-0000-0000-000000000001	Eventos	evento	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
cfda3f1f-4185-42ea-ae0b-ee7fa8affa4e	ee000010-0000-0000-0000-000000000002	Matriz	matriz	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
25987936-409f-418a-9be1-8700bf0ca167	ee000010-0000-0000-0000-000000000002	Congregacoes	congregacao	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
b127fe82-b927-41e4-852f-89da6de275d1	ee000010-0000-0000-0000-000000000002	Departamentos	departamento	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
050d349c-4e90-4550-977f-766be00a2601	ee000010-0000-0000-0000-000000000002	Eventos	evento	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
6be221c1-a424-4548-a5e3-c467d0284ff7	ee000010-0000-0000-0000-000000000003	Matriz	matriz	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
8132e6f1-d03c-4c24-8a4c-720f53fd8281	ee000010-0000-0000-0000-000000000003	Congregacoes	congregacao	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
50d031f6-c5fa-4b6b-89f1-a45d88a17dfb	ee000010-0000-0000-0000-000000000003	Departamentos	departamento	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
4e79345f-4ecd-49ab-b743-bb4835a5157a	ee000010-0000-0000-0000-000000000003	Eventos	evento	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
678b2030-672f-4be7-967c-4d89cd7c15a4	ee000020-0000-0000-0000-000000000001	Matriz	matriz	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
92b896ad-dcf4-4c65-81db-72c6e2fbc5a3	ee000020-0000-0000-0000-000000000001	Congregacoes	congregacao	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
14a8c9a1-0aa7-4ec3-881f-41e469e1491a	ee000020-0000-0000-0000-000000000001	Departamentos	departamento	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
156056d9-bcbd-4bc5-9530-1832c31136d4	ee000020-0000-0000-0000-000000000001	Eventos	evento	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
d03e1ae0-ffe3-413b-b7c6-8090b00f7fa6	ee000020-0000-0000-0000-000000000002	Matriz	matriz	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
431993a5-5a5c-4511-acf1-b883d947f93e	ee000020-0000-0000-0000-000000000002	Congregacoes	congregacao	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
3a9c92b8-01d5-422d-9054-10fbc3645372	ee000020-0000-0000-0000-000000000002	Departamentos	departamento	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
990d8b31-2ba4-4958-b2fb-b22741ae0bbf	ee000020-0000-0000-0000-000000000002	Eventos	evento	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
c3fc3400-0a34-464a-a231-63578dcf23e4	ee000020-0000-0000-0000-000000000003	Matriz	matriz	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
d929036d-4d84-40cb-9b5c-3265757558f4	ee000020-0000-0000-0000-000000000003	Congregacoes	congregacao	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
0edc8d7d-43c3-4315-bd2b-ce89d88d00b7	ee000020-0000-0000-0000-000000000003	Departamentos	departamento	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
e64792c2-22cd-4b68-805e-e10a17a08e67	ee000020-0000-0000-0000-000000000003	Eventos	evento	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00
befe9716-6ee4-46fa-b3ef-ef343c47ffce	c2364ea8-4057-453e-af72-d22ae6058b57	Matriz	matriz	t	2026-06-23 19:32:42.502714+00	2026-06-23 19:32:42.502714+00
76ee85d0-e2ae-40a5-a2d3-ba69d3da01b2	c2364ea8-4057-453e-af72-d22ae6058b57	Congregacoes	congregacao	t	2026-06-23 19:32:42.502714+00	2026-06-23 19:32:42.502714+00
b91c09cf-02e6-4d45-aaea-ef3e18d0529d	c2364ea8-4057-453e-af72-d22ae6058b57	Departamentos	departamento	t	2026-06-23 19:32:42.502714+00	2026-06-23 19:32:42.502714+00
ab84f3f2-ef74-49b7-ac23-94fe8f0dffd6	c2364ea8-4057-453e-af72-d22ae6058b57	Eventos	evento	t	2026-06-23 19:32:42.502714+00	2026-06-23 19:32:42.502714+00
\.


--
-- Data for Name: finance_monthly_closings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.finance_monthly_closings (id, organization_id, month, closed_by, closed_at, notes) FROM stdin;
ffabec82-be87-4b1c-b35e-4fe516668132	00000000-0000-0000-0000-0000000000a1	2026-01	\N	2026-05-13 00:55:05.875172+00	RLS closed month seed
45dfd21f-ae57-4353-982d-23fe725f7d13	00000000-0000-0000-0000-0000000000b1	2026-01	\N	2026-05-13 00:55:05.875172+00	RLS closed month seed
b3300d43-aa7a-4c3c-b97a-0c23d1c839c4	00000000-0000-0000-0000-0000000000a1	2027-01	\N	2026-05-13 02:44:40.059356+00	rls close
ede16fd0-c44c-4f38-9847-cc87e136a997	00000000-0000-0000-0000-0000000000a1	2027-02	\N	2026-05-13 02:44:40.059356+00	rls close
e9d30d3e-9fb5-4caf-80aa-7417d9d2143e	00000000-0000-0000-0000-0000000000a1	2027-03	\N	2026-05-13 02:44:40.059356+00	rls close
e3bc80af-d829-4272-9483-ea585a8d8356	00000000-0000-0000-0000-0000000000a1	2027-04	\N	2026-05-13 02:44:40.059356+00	rls close
\.


--
-- Data for Name: finance_transaction_audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.finance_transaction_audit_logs (id, transaction_id, organization_id, action, changed_by, changed_at, old_data, new_data) FROM stdin;
9b1a6b18-5a39-4f79-8559-01c2e038a063	\N	00000000-0000-0000-0000-0000000000a1	delete	00000000-0000-0000-0000-00000000b001	2026-05-13 03:19:21.206751+00	{"id": "3d609a0a-447f-4005-a092-fdcbf9055186", "date": "2026-05-13", "type": "Entrada", "notes": "REST update super_admin", "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000b001", "category": "Dizimos", "created_at": "2026-05-13T03:19:20.316909+00:00", "created_by": "00000000-0000-0000-0000-00000000b001", "updated_at": "2026-05-13T03:19:20.774899+00:00", "updated_by": "00000000-0000-0000-0000-00000000b001", "description": "REST RLS super_admin", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000b001", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
86a34f76-0f6d-4617-882a-d207be0b32c8	\N	00000000-0000-0000-0000-0000000000a1	delete	00000000-0000-0000-0000-00000000b002	2026-05-13 03:19:23.884317+00	{"id": "a78885be-a531-4c7b-8b9c-5648cb8a6e95", "date": "2026-05-13", "type": "Entrada", "notes": "REST update platform_admin", "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000b002", "category": "Dizimos", "created_at": "2026-05-13T03:19:22.999351+00:00", "created_by": "00000000-0000-0000-0000-00000000b002", "updated_at": "2026-05-13T03:19:23.456236+00:00", "updated_by": "00000000-0000-0000-0000-00000000b002", "description": "REST RLS platform_admin", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000b002", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
d218866f-5aeb-4adb-83f6-58883a8bbcaa	\N	00000000-0000-0000-0000-0000000000a1	delete	00000000-0000-0000-0000-00000000b003	2026-05-13 03:19:26.143351+00	{"id": "ca019295-bf51-4aa6-a830-1c2abb46b7a8", "date": "2026-05-13", "type": "Entrada", "notes": "REST update church_admin", "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000b003", "category": "Dizimos", "created_at": "2026-05-13T03:19:25.25667+00:00", "created_by": "00000000-0000-0000-0000-00000000b003", "updated_at": "2026-05-13T03:19:25.734896+00:00", "updated_by": "00000000-0000-0000-0000-00000000b003", "description": "REST RLS church_admin", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000b003", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
73b8678b-4a36-4a5e-b96c-1b5ba65481d1	\N	00000000-0000-0000-0000-0000000000a1	delete	00000000-0000-0000-0000-00000000b004	2026-05-13 03:19:28.30238+00	{"id": "56e9ccc5-65cb-4cee-be64-e47089b0beb6", "date": "2026-05-13", "type": "Entrada", "notes": "REST update tesoureiro", "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000b004", "category": "Dizimos", "created_at": "2026-05-13T03:19:27.426625+00:00", "created_by": "00000000-0000-0000-0000-00000000b004", "updated_at": "2026-05-13T03:19:27.86277+00:00", "updated_by": "00000000-0000-0000-0000-00000000b004", "description": "REST RLS tesoureiro", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000b004", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
5215d929-e2fd-421a-a4cf-dbd5520e54f4	\N	00000000-0000-0000-0000-0000000000b1	delete	\N	2026-05-13 03:28:35.093792+00	{"id": "6840525e-9155-4098-9cc7-da45a8781e7a", "date": "2026-05-13", "type": "Entrada", "notes": null, "amount": 200, "status": "Confirmado", "user_id": "00000000-0000-0000-0000-00000000a001", "category": "Dizimos", "created_at": "2026-05-13T00:55:05.875172+00:00", "created_by": "00000000-0000-0000-0000-00000000a001", "updated_at": "2026-05-13T00:55:05.875172+00:00", "updated_by": null, "description": "RLS Org B seed income", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000a001", "organization_id": "00000000-0000-0000-0000-0000000000b1", "account_category_id": null, "financial_account_id": null}	\N
8d17b4a0-d272-4003-893b-3ca4c35a3177	\N	00000000-0000-0000-0000-0000000000a1	delete	\N	2026-05-13 03:28:35.093792+00	{"id": "fe7f06a5-1aa9-4776-b29d-1b72b7a48c07", "date": "2026-05-13", "type": "Entrada", "notes": null, "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000a003", "category": "Dizimos", "created_at": "2026-05-13T03:13:30.583039+00:00", "created_by": "00000000-0000-0000-0000-00000000a003", "updated_at": "2026-05-13T03:13:30.583039+00:00", "updated_by": "00000000-0000-0000-0000-00000000a003", "description": "RLS insert church_admin", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000a003", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
b79a7b27-4b51-49ef-986d-a28181a1c0cf	\N	00000000-0000-0000-0000-0000000000a1	delete	\N	2026-05-13 03:28:35.093792+00	{"id": "c16abebd-587b-47f5-8a0f-fec3d6a99e3c", "date": "2026-05-13", "type": "Entrada", "notes": null, "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000a005", "category": "Dizimos", "created_at": "2026-05-13T02:50:09.214599+00:00", "created_by": "00000000-0000-0000-0000-00000000a005", "updated_at": "2026-05-13T02:50:09.214599+00:00", "updated_by": "00000000-0000-0000-0000-00000000a005", "description": "RLS delete target contador", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000a005", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
e0eef899-83f8-4ce2-824d-7d9e3997b758	\N	00000000-0000-0000-0000-0000000000a1	delete	\N	2026-05-13 03:28:35.093792+00	{"id": "f3e43090-bc3b-4425-9643-73a6ff409530", "date": "2026-05-13", "type": "Entrada", "notes": null, "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000a006", "category": "Dizimos", "created_at": "2026-05-13T02:50:09.214599+00:00", "created_by": "00000000-0000-0000-0000-00000000a005", "updated_at": "2026-05-13T02:50:09.214599+00:00", "updated_by": "00000000-0000-0000-0000-00000000a005", "description": "RLS delete target pastor", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000a005", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
1dac7a68-97fa-413a-86d6-3d3914fd5a16	\N	00000000-0000-0000-0000-0000000000a1	delete	\N	2026-05-13 03:28:35.093792+00	{"id": "7ed4b754-c168-44c2-8928-776c53fddd93", "date": "2026-05-13", "type": "Entrada", "notes": null, "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000a007", "category": "Dizimos", "created_at": "2026-05-13T02:50:09.214599+00:00", "created_by": "00000000-0000-0000-0000-00000000a005", "updated_at": "2026-05-13T02:50:09.214599+00:00", "updated_by": "00000000-0000-0000-0000-00000000a005", "description": "RLS delete target secretary", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000a005", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
66505ca6-ae6a-4780-ac77-4aa1af59e512	\N	00000000-0000-0000-0000-0000000000a1	delete	\N	2026-05-13 03:28:35.093792+00	{"id": "a4d49ba2-3d11-411b-a53b-ab9884a1a8d2", "date": "2026-05-13", "type": "Entrada", "notes": null, "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000a008", "category": "Dizimos", "created_at": "2026-05-13T02:50:09.214599+00:00", "created_by": "00000000-0000-0000-0000-00000000a005", "updated_at": "2026-05-13T02:50:09.214599+00:00", "updated_by": "00000000-0000-0000-0000-00000000a005", "description": "RLS delete target leader", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000a005", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
a92773d2-578b-4547-b215-aa237f848fe8	\N	00000000-0000-0000-0000-0000000000a1	delete	\N	2026-05-13 03:28:35.093792+00	{"id": "606fa53b-9d4d-4612-966a-0867847ef9a8", "date": "2026-05-13", "type": "Entrada", "notes": null, "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000a009", "category": "Dizimos", "created_at": "2026-05-13T02:50:09.214599+00:00", "created_by": "00000000-0000-0000-0000-00000000a005", "updated_at": "2026-05-13T02:50:09.214599+00:00", "updated_by": "00000000-0000-0000-0000-00000000a005", "description": "RLS delete target member", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000a005", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
838898dd-cd5c-4186-ab4c-bbf491a7c680	\N	00000000-0000-0000-0000-0000000000a1	delete	\N	2026-05-13 03:28:35.093792+00	{"id": "0ba5e767-2bef-47ac-8197-130a3629774f", "date": "2026-05-13", "type": "Entrada", "notes": null, "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000a001", "category": "Dizimos", "created_at": "2026-05-13T03:12:42.445644+00:00", "created_by": "00000000-0000-0000-0000-00000000a001", "updated_at": "2026-05-13T03:12:42.445644+00:00", "updated_by": "00000000-0000-0000-0000-00000000a001", "description": "RLS insert super_admin", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000a001", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
95548552-d9d1-46f5-9992-81a18d54f922	\N	00000000-0000-0000-0000-0000000000a1	delete	\N	2026-05-13 03:28:35.093792+00	{"id": "05375caa-023e-4d62-a8e4-1fea64397b3f", "date": "2026-05-13", "type": "Entrada", "notes": null, "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000a002", "category": "Dizimos", "created_at": "2026-05-13T03:12:42.445644+00:00", "created_by": "00000000-0000-0000-0000-00000000a002", "updated_at": "2026-05-13T03:12:42.445644+00:00", "updated_by": "00000000-0000-0000-0000-00000000a002", "description": "RLS insert platform_admin", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000a002", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
778da644-c89a-4d00-b92e-3c764f789eb3	\N	00000000-0000-0000-0000-0000000000a1	delete	\N	2026-05-13 03:28:35.093792+00	{"id": "a32236a2-01d8-4d8c-a279-6536fde6af78", "date": "2026-05-13", "type": "Entrada", "notes": null, "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000a003", "category": "Dizimos", "created_at": "2026-05-13T03:12:42.445644+00:00", "created_by": "00000000-0000-0000-0000-00000000a003", "updated_at": "2026-05-13T03:12:42.445644+00:00", "updated_by": "00000000-0000-0000-0000-00000000a003", "description": "RLS insert church_admin", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000a003", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
661e8ca3-20e0-46aa-9de2-241f0886b8f4	\N	00000000-0000-0000-0000-0000000000a1	delete	\N	2026-05-13 03:28:35.093792+00	{"id": "1103425a-a1ca-4d4f-9ecc-dd0336ce937f", "date": "2026-05-13", "type": "Entrada", "notes": null, "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000a004", "category": "Dizimos", "created_at": "2026-05-13T03:13:30.583039+00:00", "created_by": "00000000-0000-0000-0000-00000000a004", "updated_at": "2026-05-13T03:13:30.583039+00:00", "updated_by": "00000000-0000-0000-0000-00000000a004", "description": "RLS insert tesoureiro", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000a004", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
0cefc561-cd77-4d41-af6f-6fea41776468	\N	00000000-0000-0000-0000-0000000000a1	delete	\N	2026-05-13 03:28:35.093792+00	{"id": "edd5da30-29b3-4e72-8753-f771231a80c6", "date": "2026-05-13", "type": "Entrada", "notes": null, "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000a004", "category": "Dizimos", "created_at": "2026-05-13T03:12:42.445644+00:00", "created_by": "00000000-0000-0000-0000-00000000a004", "updated_at": "2026-05-13T03:12:42.445644+00:00", "updated_by": "00000000-0000-0000-0000-00000000a004", "description": "RLS insert tesoureiro", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000a004", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
904edd8a-97eb-4fbf-8ed0-a9d50a7de297	\N	00000000-0000-0000-0000-0000000000a1	delete	\N	2026-05-13 03:28:35.093792+00	{"id": "9ab6256a-6b85-4653-8658-5f061637966b", "date": "2026-05-13", "type": "Entrada", "notes": null, "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000a005", "category": "Dizimos", "created_at": "2026-05-13T03:12:42.445644+00:00", "created_by": "00000000-0000-0000-0000-00000000a005", "updated_at": "2026-05-13T03:12:42.445644+00:00", "updated_by": "00000000-0000-0000-0000-00000000a005", "description": "RLS delete target contador", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000a005", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
363ae294-ee1f-4fbe-8ee8-0f4cfdc115e2	\N	00000000-0000-0000-0000-0000000000a1	delete	\N	2026-05-13 03:28:35.093792+00	{"id": "b59f9640-2f90-4718-948c-2087d74a9300", "date": "2026-05-13", "type": "Entrada", "notes": null, "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000a006", "category": "Dizimos", "created_at": "2026-05-13T03:12:42.445644+00:00", "created_by": "00000000-0000-0000-0000-00000000a005", "updated_at": "2026-05-13T03:12:42.445644+00:00", "updated_by": "00000000-0000-0000-0000-00000000a005", "description": "RLS delete target pastor", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000a005", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
b9ef2006-883f-44b8-8b34-1fe4d3072332	\N	00000000-0000-0000-0000-0000000000a1	delete	\N	2026-05-13 03:28:35.093792+00	{"id": "ca8e6a5d-2eca-453f-a0f9-73242f7bab72", "date": "2026-05-13", "type": "Entrada", "notes": null, "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000a007", "category": "Dizimos", "created_at": "2026-05-13T03:12:42.445644+00:00", "created_by": "00000000-0000-0000-0000-00000000a005", "updated_at": "2026-05-13T03:12:42.445644+00:00", "updated_by": "00000000-0000-0000-0000-00000000a005", "description": "RLS delete target secretary", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000a005", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
6e4cf106-96c8-4ac6-95ec-05f9e3ac3217	\N	00000000-0000-0000-0000-0000000000a1	delete	\N	2026-05-13 03:28:35.093792+00	{"id": "630d419d-31d5-47b5-975f-fa4a3f86276c", "date": "2026-05-13", "type": "Entrada", "notes": null, "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000a008", "category": "Dizimos", "created_at": "2026-05-13T03:12:42.445644+00:00", "created_by": "00000000-0000-0000-0000-00000000a005", "updated_at": "2026-05-13T03:12:42.445644+00:00", "updated_by": "00000000-0000-0000-0000-00000000a005", "description": "RLS delete target leader", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000a005", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
ef022947-f2e2-4840-888e-2a4af868c37f	\N	00000000-0000-0000-0000-0000000000a1	delete	\N	2026-05-13 03:28:35.093792+00	{"id": "00312c7a-274a-48b6-b78f-559c99a3d2a5", "date": "2026-05-13", "type": "Entrada", "notes": null, "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000a009", "category": "Dizimos", "created_at": "2026-05-13T03:12:42.445644+00:00", "created_by": "00000000-0000-0000-0000-00000000a005", "updated_at": "2026-05-13T03:12:42.445644+00:00", "updated_by": "00000000-0000-0000-0000-00000000a005", "description": "RLS delete target member", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000a005", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
8542cca4-36c0-4eb7-aa2d-acfeb017df8e	\N	00000000-0000-0000-0000-0000000000a1	delete	\N	2026-05-13 03:28:35.093792+00	{"id": "5f2a4cec-80c3-4c9f-9941-ef49d4ee2977", "date": "2026-05-13", "type": "Entrada", "notes": null, "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000a001", "category": "Dizimos", "created_at": "2026-05-13T03:13:30.583039+00:00", "created_by": "00000000-0000-0000-0000-00000000a001", "updated_at": "2026-05-13T03:13:30.583039+00:00", "updated_by": "00000000-0000-0000-0000-00000000a001", "description": "RLS insert super_admin", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000a001", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
5a35028d-36e3-486b-bf65-52c979deb04a	\N	00000000-0000-0000-0000-0000000000a1	delete	\N	2026-05-13 03:28:35.093792+00	{"id": "2ae04cdb-b782-4c65-b53a-0f689b9aa633", "date": "2026-05-13", "type": "Entrada", "notes": null, "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000a002", "category": "Dizimos", "created_at": "2026-05-13T03:13:30.583039+00:00", "created_by": "00000000-0000-0000-0000-00000000a002", "updated_at": "2026-05-13T03:13:30.583039+00:00", "updated_by": "00000000-0000-0000-0000-00000000a002", "description": "RLS insert platform_admin", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000a002", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
be8c8a2d-e21c-4847-896c-447f82da9b83	\N	00000000-0000-0000-0000-0000000000a1	delete	\N	2026-05-13 03:28:35.093792+00	{"id": "25a3325b-1e80-4d38-be5c-971e6d3585c1", "date": "2026-05-13", "type": "Entrada", "notes": "rls update", "amount": 100, "status": "Confirmado", "user_id": "00000000-0000-0000-0000-00000000a004", "category": "Dizimos", "created_at": "2026-05-13T00:55:05.875172+00:00", "created_by": "00000000-0000-0000-0000-00000000a004", "updated_at": "2026-05-13T03:13:30.583039+00:00", "updated_by": "00000000-0000-0000-0000-00000000a004", "description": "RLS Org A seed income", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000a004", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
dd21896d-b623-4598-88c2-03aa6934c6d6	\N	00000000-0000-0000-0000-0000000000a1	delete	\N	2026-05-13 03:28:35.093792+00	{"id": "e7dc74c5-7889-4787-b93c-7442b9613a3d", "date": "2026-05-13", "type": "Entrada", "notes": null, "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000a005", "category": "Dizimos", "created_at": "2026-05-13T03:13:30.583039+00:00", "created_by": "00000000-0000-0000-0000-00000000a005", "updated_at": "2026-05-13T03:13:30.583039+00:00", "updated_by": "00000000-0000-0000-0000-00000000a005", "description": "RLS delete target contador", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000a005", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
c9581141-406e-4a0f-889e-c2547ca7f271	\N	00000000-0000-0000-0000-0000000000a1	delete	\N	2026-05-13 03:28:35.093792+00	{"id": "b8e3acc3-fe07-41bf-a255-62ad89dfee6a", "date": "2026-05-13", "type": "Entrada", "notes": null, "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000a006", "category": "Dizimos", "created_at": "2026-05-13T03:13:30.583039+00:00", "created_by": "00000000-0000-0000-0000-00000000a005", "updated_at": "2026-05-13T03:13:30.583039+00:00", "updated_by": "00000000-0000-0000-0000-00000000a005", "description": "RLS delete target pastor", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000a005", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
0e1f15fa-5d26-41ca-a136-b9ec2abe3ea4	\N	00000000-0000-0000-0000-0000000000a1	delete	\N	2026-05-13 03:28:35.093792+00	{"id": "6b794f8c-3bd4-428b-8fd8-fe2f295b8ce5", "date": "2026-05-13", "type": "Entrada", "notes": null, "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000a007", "category": "Dizimos", "created_at": "2026-05-13T03:13:30.583039+00:00", "created_by": "00000000-0000-0000-0000-00000000a005", "updated_at": "2026-05-13T03:13:30.583039+00:00", "updated_by": "00000000-0000-0000-0000-00000000a005", "description": "RLS delete target secretary", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000a005", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
5ec93828-b681-443c-8127-a6ff98354410	\N	00000000-0000-0000-0000-0000000000a1	delete	\N	2026-05-13 03:28:35.093792+00	{"id": "be8c6351-f3d6-40be-99fb-96125ce86369", "date": "2026-05-13", "type": "Entrada", "notes": null, "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000a008", "category": "Dizimos", "created_at": "2026-05-13T03:13:30.583039+00:00", "created_by": "00000000-0000-0000-0000-00000000a005", "updated_at": "2026-05-13T03:13:30.583039+00:00", "updated_by": "00000000-0000-0000-0000-00000000a005", "description": "RLS delete target leader", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000a005", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
b06d04d2-bbc9-45b5-aca9-5ea5f34f67e5	\N	00000000-0000-0000-0000-0000000000a1	delete	\N	2026-05-13 03:28:35.093792+00	{"id": "fbb356e1-ae08-430a-bc22-121d46730c1b", "date": "2026-05-13", "type": "Entrada", "notes": null, "amount": 1, "status": "Pendente", "user_id": "00000000-0000-0000-0000-00000000a009", "category": "Dizimos", "created_at": "2026-05-13T03:13:30.583039+00:00", "created_by": "00000000-0000-0000-0000-00000000a005", "updated_at": "2026-05-13T03:13:30.583039+00:00", "updated_by": "00000000-0000-0000-0000-00000000a005", "description": "RLS delete target member", "receipt_url": null, "cost_center_id": null, "payment_method": null, "responsible_id": "00000000-0000-0000-0000-00000000a005", "organization_id": "00000000-0000-0000-0000-0000000000a1", "account_category_id": null, "financial_account_id": null}	\N
1e34eb42-7457-498a-9082-a3bb563d189f	88888888-0000-0000-0000-000000000001	11111111-0000-0000-0000-000000000004	insert	\N	2026-06-04 19:03:23.834365+00	\N	{"id": "88888888-0000-0000-0000-000000000001", "date": "2026-05-04", "type": "Entrada", "notes": null, "amount": 3250.00, "status": "Confirmado", "user_id": "00000000-0000-0000-0000-00000000b001", "category": "Dizimos", "created_at": "2026-06-04T19:03:23.834365+00:00", "created_by": null, "updated_at": "2026-06-04T19:03:23.834365+00:00", "updated_by": null, "description": "Dízimos — 1ª semana de maio", "receipt_url": null, "cost_center_id": null, "payment_method": "PIX", "responsible_id": null, "organization_id": "11111111-0000-0000-0000-000000000004", "account_category_id": null, "financial_account_id": null}
7eb1bca8-898d-454b-9bff-566a84842e7c	88888888-0000-0000-0000-000000000002	11111111-0000-0000-0000-000000000004	insert	\N	2026-06-04 19:03:23.834365+00	\N	{"id": "88888888-0000-0000-0000-000000000002", "date": "2026-05-04", "type": "Saida", "notes": null, "amount": 2800.00, "status": "Pago", "user_id": "00000000-0000-0000-0000-00000000b001", "category": "Administrativo", "created_at": "2026-06-04T19:03:23.834365+00:00", "created_by": null, "updated_at": "2026-06-04T19:03:23.834365+00:00", "updated_by": null, "description": "Aluguel do Templo — maio/2026", "receipt_url": null, "cost_center_id": null, "payment_method": "Banco", "responsible_id": null, "organization_id": "11111111-0000-0000-0000-000000000004", "account_category_id": null, "financial_account_id": null}
9113f213-374d-485a-b56c-33d9dfa3da78	88888888-0000-0000-0000-000000000003	11111111-0000-0000-0000-000000000004	insert	\N	2026-06-04 19:03:23.834365+00	\N	{"id": "88888888-0000-0000-0000-000000000003", "date": "2026-05-11", "type": "Entrada", "notes": null, "amount": 2890.00, "status": "Confirmado", "user_id": "00000000-0000-0000-0000-00000000b001", "category": "Dizimos", "created_at": "2026-06-04T19:03:23.834365+00:00", "created_by": null, "updated_at": "2026-06-04T19:03:23.834365+00:00", "updated_by": null, "description": "Dízimos — 2ª semana de maio", "receipt_url": null, "cost_center_id": null, "payment_method": "PIX", "responsible_id": null, "organization_id": "11111111-0000-0000-0000-000000000004", "account_category_id": null, "financial_account_id": null}
910a7f48-610e-421c-858f-8e08b5691ded	88888888-0000-0000-0000-000000000004	11111111-0000-0000-0000-000000000004	insert	\N	2026-06-04 19:03:23.834365+00	\N	{"id": "88888888-0000-0000-0000-000000000004", "date": "2026-05-11", "type": "Saida", "notes": null, "amount": 480.00, "status": "Pago", "user_id": "00000000-0000-0000-0000-00000000b001", "category": "Manutencao", "created_at": "2026-06-04T19:03:23.834365+00:00", "created_by": null, "updated_at": "2026-06-04T19:03:23.834365+00:00", "updated_by": null, "description": "Energia Elétrica — maio", "receipt_url": null, "cost_center_id": null, "payment_method": "Banco", "responsible_id": null, "organization_id": "11111111-0000-0000-0000-000000000004", "account_category_id": null, "financial_account_id": null}
fef940a1-b2e6-470b-ae37-e4b451ab3a99	88888888-0000-0000-0000-000000000005	11111111-0000-0000-0000-000000000004	insert	\N	2026-06-04 19:03:23.834365+00	\N	{"id": "88888888-0000-0000-0000-000000000005", "date": "2026-05-11", "type": "Entrada", "notes": null, "amount": 850.00, "status": "Confirmado", "user_id": "00000000-0000-0000-0000-00000000b001", "category": "Missoes", "created_at": "2026-06-04T19:03:23.834365+00:00", "created_by": null, "updated_at": "2026-06-04T19:03:23.834365+00:00", "updated_by": null, "description": "Oferta de Missões Nacionais", "receipt_url": null, "cost_center_id": null, "payment_method": "Especie", "responsible_id": null, "organization_id": "11111111-0000-0000-0000-000000000004", "account_category_id": null, "financial_account_id": null}
20a05a91-3305-4e3f-980b-8a8d2a44c7d9	88888888-0000-0000-0000-000000000006	11111111-0000-0000-0000-000000000004	insert	\N	2026-06-04 19:03:23.834365+00	\N	{"id": "88888888-0000-0000-0000-000000000006", "date": "2026-05-18", "type": "Entrada", "notes": null, "amount": 3100.00, "status": "Confirmado", "user_id": "00000000-0000-0000-0000-00000000b001", "category": "Dizimos", "created_at": "2026-06-04T19:03:23.834365+00:00", "created_by": null, "updated_at": "2026-06-04T19:03:23.834365+00:00", "updated_by": null, "description": "Dízimos — 3ª semana de maio", "receipt_url": null, "cost_center_id": null, "payment_method": "PIX", "responsible_id": null, "organization_id": "11111111-0000-0000-0000-000000000004", "account_category_id": null, "financial_account_id": null}
47e40fcb-5860-4bd5-ba4e-21a08642d0cb	88888888-0000-0000-0000-000000000007	11111111-0000-0000-0000-000000000004	insert	\N	2026-06-04 19:03:23.834365+00	\N	{"id": "88888888-0000-0000-0000-000000000007", "date": "2026-05-18", "type": "Saida", "notes": null, "amount": 145.00, "status": "Pago", "user_id": "00000000-0000-0000-0000-00000000b001", "category": "Manutencao", "created_at": "2026-06-04T19:03:23.834365+00:00", "created_by": null, "updated_at": "2026-06-04T19:03:23.834365+00:00", "updated_by": null, "description": "Material de Limpeza e Manutenção", "receipt_url": null, "cost_center_id": null, "payment_method": "Especie", "responsible_id": null, "organization_id": "11111111-0000-0000-0000-000000000004", "account_category_id": null, "financial_account_id": null}
b97e0cf8-798d-44a8-b0f6-32971d897d1c	88888888-0000-0000-0000-000000000008	11111111-0000-0000-0000-000000000004	insert	\N	2026-06-04 19:03:23.834365+00	\N	{"id": "88888888-0000-0000-0000-000000000008", "date": "2026-05-18", "type": "Entrada", "notes": null, "amount": 620.00, "status": "Confirmado", "user_id": "00000000-0000-0000-0000-00000000b001", "category": "Ofertas", "created_at": "2026-06-04T19:03:23.834365+00:00", "created_by": null, "updated_at": "2026-06-04T19:03:23.834365+00:00", "updated_by": null, "description": "Oferta Especial — Culto de Louvor", "receipt_url": null, "cost_center_id": null, "payment_method": "Especie", "responsible_id": null, "organization_id": "11111111-0000-0000-0000-000000000004", "account_category_id": null, "financial_account_id": null}
3e975234-0653-44ba-9fdf-39a9f9153c78	88888888-0000-0000-0000-000000000009	11111111-0000-0000-0000-000000000004	insert	\N	2026-06-04 19:03:23.834365+00	\N	{"id": "88888888-0000-0000-0000-000000000009", "date": "2026-05-04", "type": "Saida", "notes": null, "amount": 4000.00, "status": "Pago", "user_id": "00000000-0000-0000-0000-00000000b001", "category": "Folha/Pastoral", "created_at": "2026-06-04T19:03:23.834365+00:00", "created_by": null, "updated_at": "2026-06-04T19:03:23.834365+00:00", "updated_by": null, "description": "Honorários Pastorais — maio", "receipt_url": null, "cost_center_id": null, "payment_method": "Banco", "responsible_id": null, "organization_id": "11111111-0000-0000-0000-000000000004", "account_category_id": null, "financial_account_id": null}
776d6944-2878-497d-95d7-cb79d907314c	88888888-0000-0000-0000-000000000010	11111111-0000-0000-0000-000000000004	insert	\N	2026-06-04 19:03:23.834365+00	\N	{"id": "88888888-0000-0000-0000-000000000010", "date": "2026-05-11", "type": "Saida", "notes": null, "amount": 299.00, "status": "Pago", "user_id": "00000000-0000-0000-0000-00000000b001", "category": "Administrativo", "created_at": "2026-06-04T19:03:23.834365+00:00", "created_by": null, "updated_at": "2026-06-04T19:03:23.834365+00:00", "updated_by": null, "description": "Internet e Sistema — Ecclesia Admin", "receipt_url": null, "cost_center_id": null, "payment_method": "Banco", "responsible_id": null, "organization_id": "11111111-0000-0000-0000-000000000004", "account_category_id": null, "financial_account_id": null}
57d285ec-a730-4e18-8f19-9df88413ed68	88888888-0000-0000-0000-000000000011	11111111-0000-0000-0000-000000000002	insert	\N	2026-06-08 19:00:29.312695+00	\N	{"id": "88888888-0000-0000-0000-000000000011", "date": "2026-05-10", "type": "Entrada", "notes": null, "amount": 5000.00, "status": "Confirmado", "user_id": "00000000-0000-0000-0000-00000000b001", "category": "Campanhas", "created_at": "2026-06-08T19:00:29.312695+00:00", "created_by": null, "updated_at": "2026-06-08T19:00:29.312695+00:00", "updated_by": null, "campaign_id": "aaaaaaaa-0000-0000-0000-000000000001", "description": "Campanha — Reforma do Templo Central", "receipt_url": null, "source_module": "campaign", "cost_center_id": null, "payment_method": "PIX", "responsible_id": null, "organization_id": "11111111-0000-0000-0000-000000000002", "account_category_id": null, "financial_account_id": null}
1461f76a-5772-4d72-869b-70bfce7996b0	88888888-0000-0000-0000-000000000012	11111111-0000-0000-0000-000000000002	insert	\N	2026-06-08 19:00:29.312695+00	\N	{"id": "88888888-0000-0000-0000-000000000012", "date": "2026-05-12", "type": "Entrada", "notes": null, "amount": 8500.00, "status": "Confirmado", "user_id": "00000000-0000-0000-0000-00000000b001", "category": "Campanhas", "created_at": "2026-06-08T19:00:29.312695+00:00", "created_by": null, "updated_at": "2026-06-08T19:00:29.312695+00:00", "updated_by": null, "campaign_id": "aaaaaaaa-0000-0000-0000-000000000002", "description": "Campanha — Construção São José", "receipt_url": null, "source_module": "campaign", "cost_center_id": null, "payment_method": "PIX", "responsible_id": null, "organization_id": "11111111-0000-0000-0000-000000000002", "account_category_id": null, "financial_account_id": null}
4bc2a9a5-6de3-47dc-bab8-6cb1948bc5d6	88888888-0000-0000-0000-000000000013	11111111-0000-0000-0000-000000000002	insert	\N	2026-06-08 19:00:29.312695+00	\N	{"id": "88888888-0000-0000-0000-000000000013", "date": "2026-05-14", "type": "Entrada", "notes": null, "amount": 3200.00, "status": "Confirmado", "user_id": "00000000-0000-0000-0000-00000000b001", "category": "Campanhas", "created_at": "2026-06-08T19:00:29.312695+00:00", "created_by": null, "updated_at": "2026-06-08T19:00:29.312695+00:00", "updated_by": null, "campaign_id": "aaaaaaaa-0000-0000-0000-000000000003", "description": "Campanha — Missões África", "receipt_url": null, "source_module": "campaign", "cost_center_id": null, "payment_method": "PIX", "responsible_id": null, "organization_id": "11111111-0000-0000-0000-000000000002", "account_category_id": null, "financial_account_id": null}
0a53f379-5cab-4c39-adb5-62f68e6f9081	88888888-0000-0000-0000-000000000014	11111111-0000-0000-0000-000000000004	insert	\N	2026-06-08 19:00:29.312695+00	\N	{"id": "88888888-0000-0000-0000-000000000014", "date": "2026-05-08", "type": "Entrada", "notes": null, "amount": 3500.00, "status": "Confirmado", "user_id": "00000000-0000-0000-0000-00000000b001", "category": "Campanhas", "created_at": "2026-06-08T19:00:29.312695+00:00", "created_by": null, "updated_at": "2026-06-08T19:00:29.312695+00:00", "updated_by": null, "campaign_id": "aaaaaaaa-0000-0000-0000-000000000004", "description": "Campanha — Ação Social Inverno", "receipt_url": null, "source_module": "campaign", "cost_center_id": null, "payment_method": "PIX", "responsible_id": null, "organization_id": "11111111-0000-0000-0000-000000000004", "account_category_id": null, "financial_account_id": null}
289b6d5d-a815-4618-acae-0d23f31195c4	88888888-0000-0000-0000-000000000015	11111111-0000-0000-0000-000000000002	insert	\N	2026-06-08 19:00:29.312695+00	\N	{"id": "88888888-0000-0000-0000-000000000015", "date": "2026-05-16", "type": "Entrada", "notes": null, "amount": 1200.00, "status": "Confirmado", "user_id": "00000000-0000-0000-0000-00000000b001", "category": "Campanhas", "created_at": "2026-06-08T19:00:29.312695+00:00", "created_by": null, "updated_at": "2026-06-08T19:00:29.312695+00:00", "updated_by": null, "campaign_id": "aaaaaaaa-0000-0000-0000-000000000005", "description": "Campanha — Congresso de Jovens", "receipt_url": null, "source_module": "campaign", "cost_center_id": null, "payment_method": "PIX", "responsible_id": null, "organization_id": "11111111-0000-0000-0000-000000000002", "account_category_id": null, "financial_account_id": null}
c2bea92c-83d7-42cd-9842-15216f20de3b	dd000008-0000-0000-0000-000000000001	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-000000000001", "date": "2026-02-02", "type": "Entrada", "notes": null, "amount": 4800, "status": "Confirmado", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Dizimos", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Dizimos culto domingo 02/02/2026", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "PIX", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000001", "financial_account_id": "dd000005-0000-0000-0000-000000000002"}
e051a9b3-60df-4287-8098-f093004becd3	dd000008-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-000000000002", "date": "2026-03-02", "type": "Entrada", "notes": null, "amount": 5100, "status": "Confirmado", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Dizimos", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Dizimos culto domingo 02/03/2026", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "PIX", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000001", "financial_account_id": "dd000005-0000-0000-0000-000000000002"}
24a7f80a-458f-40fa-bb12-12b9299e557c	dd000008-0000-0000-0000-000000000003	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-000000000003", "date": "2026-04-06", "type": "Entrada", "notes": null, "amount": 5350, "status": "Confirmado", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Dizimos", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Dizimos culto domingo 06/04/2026", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "PIX", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000001", "financial_account_id": "dd000005-0000-0000-0000-000000000002"}
8b52890a-4b89-4317-8709-fdfef2dacdbb	dd000008-0000-0000-0000-000000000004	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-000000000004", "date": "2026-05-04", "type": "Entrada", "notes": null, "amount": 4950, "status": "Confirmado", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Dizimos", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Dizimos culto domingo 04/05/2026", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "Dinheiro", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000001", "financial_account_id": "dd000005-0000-0000-0000-000000000002"}
4520c1dc-8c07-465a-afb9-136a4ceed4c8	dd000008-0000-0000-0000-000000000005	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-000000000005", "date": "2026-06-01", "type": "Entrada", "notes": null, "amount": 5200, "status": "Confirmado", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Dizimos", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Dizimos culto domingo 01/06/2026", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "PIX", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000001", "financial_account_id": "dd000005-0000-0000-0000-000000000002"}
a9033eb7-8249-42c5-bab0-119253ef68b8	dd000008-0000-0000-0000-000000000006	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-000000000006", "date": "2026-06-11", "type": "Entrada", "notes": null, "amount": 1800, "status": "Confirmado", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Dizimos", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Dizimos culto quarta 11/06/2026", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "Dinheiro", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000001", "financial_account_id": "dd000005-0000-0000-0000-000000000001"}
ccb94d01-7f5f-4501-b6a3-016c67fec4e4	dd000008-0000-0000-0000-000000000007	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-000000000007", "date": "2026-05-20", "type": "Entrada", "notes": null, "amount": 2300, "status": "Confirmado", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Dizimos", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Dizimos online maio 2026", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "PIX", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000001", "financial_account_id": "dd000005-0000-0000-0000-000000000002"}
7ec64052-68b8-429c-81f0-1c5280477f4b	dd000008-0000-0000-0000-000000000008	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-000000000008", "date": "2026-06-15", "type": "Entrada", "notes": null, "amount": 5400, "status": "Pendente", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Dizimos", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Dizimos culto domingo 15/06/2026", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "PIX", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000001", "financial_account_id": "dd000005-0000-0000-0000-000000000002"}
8b9ce508-cbe7-4f51-a2a5-453b902e900a	dd000008-0000-0000-0000-000000000009	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-000000000009", "date": "2026-06-13", "type": "Entrada", "notes": null, "amount": 2200, "status": "Confirmado", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Ofertas", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Oferta especial Congresso Oracao", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "Dinheiro", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000002", "financial_account_id": "dd000005-0000-0000-0000-000000000001"}
18b571bb-1978-4e65-813f-ad37b0453685	dd000008-0000-0000-0000-00000000000a	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-00000000000a", "date": "2026-05-24", "type": "Entrada", "notes": null, "amount": 1450, "status": "Confirmado", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Ofertas", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Oferta culto familia maio", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "Dinheiro", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000002", "financial_account_id": "dd000005-0000-0000-0000-000000000001"}
aa5818f8-ed32-4fad-9543-3095e955e664	dd000008-0000-0000-0000-00000000000b	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-00000000000b", "date": "2026-03-08", "type": "Entrada", "notes": null, "amount": 1700, "status": "Confirmado", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Ofertas", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Oferta dominical marco", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "Dinheiro", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000002", "financial_account_id": "dd000005-0000-0000-0000-000000000001"}
67ff7d25-6171-4867-9d7d-724246bc3a76	dd000008-0000-0000-0000-00000000000c	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-00000000000c", "date": "2026-04-20", "type": "Entrada", "notes": null, "amount": 850, "status": "Confirmado", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Ofertas", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Oferta Santa Ceia abril", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "Dinheiro", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000002", "financial_account_id": "dd000005-0000-0000-0000-000000000001"}
f6142af2-e020-4694-aed9-d2e839018233	dd000008-0000-0000-0000-00000000000d	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-00000000000d", "date": "2026-06-07", "type": "Entrada", "notes": null, "amount": 1200, "status": "Pendente", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Ofertas", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Oferta missionaria junho", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "Dinheiro", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000002", "financial_account_id": "dd000005-0000-0000-0000-000000000001"}
77e9b929-5dfe-4ee6-b8f4-e0f4f0f5612a	dd000008-0000-0000-0000-00000000000e	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-00000000000e", "date": "2026-04-15", "type": "Entrada", "notes": null, "amount": 3500, "status": "Confirmado", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Missoes Doacao", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Doacao Projeto Missoes Africa", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "Transferencia", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000003", "financial_account_id": "dd000005-0000-0000-0000-000000000003"}
5eb225a7-dcd4-4c1a-a34c-d6cf8dce25dd	dd000008-0000-0000-0000-00000000000f	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-00000000000f", "date": "2026-05-10", "type": "Entrada", "notes": null, "amount": 2800, "status": "Confirmado", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Missoes Doacao", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Doacao Missoes Camboja parceria", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "PIX", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000003", "financial_account_id": "dd000005-0000-0000-0000-000000000003"}
b1ee831c-3c43-4036-8713-8c43460654ff	dd000008-0000-0000-0000-000000000010	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-000000000010", "date": "2026-04-28", "type": "Entrada", "notes": null, "amount": 6200, "status": "Confirmado", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Fundo Construcao", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Oferta construcao novo templo abr", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "PIX", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000004", "financial_account_id": "dd000005-0000-0000-0000-000000000004"}
871dcec4-5d9f-4b2c-b941-7c2f34a07546	dd000008-0000-0000-0000-000000000011	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-000000000011", "date": "2026-05-26", "type": "Entrada", "notes": null, "amount": 5800, "status": "Confirmado", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Fundo Construcao", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Oferta construcao novo templo mai", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "PIX", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000004", "financial_account_id": "dd000005-0000-0000-0000-000000000004"}
de137e41-b374-4255-b3b8-dad53e5caa57	dd000008-0000-0000-0000-000000000012	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-000000000012", "date": "2026-04-05", "type": "Saida", "notes": null, "amount": 1800, "status": "Confirmado", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Aluguel Manutencao", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Aluguel auditorio abril 2026", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "Transferencia", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000005", "financial_account_id": "dd000005-0000-0000-0000-000000000002"}
32c521ee-8300-4370-914e-d39c297c825f	dd000008-0000-0000-0000-000000000013	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-000000000013", "date": "2026-05-12", "type": "Saida", "notes": null, "amount": 950, "status": "Confirmado", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Aluguel Manutencao", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Manutencao sistema de som", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "PIX", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000005", "financial_account_id": "dd000005-0000-0000-0000-000000000002"}
2570a9e5-ce6e-4e66-af56-e46bae79726c	dd000008-0000-0000-0000-000000000014	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-000000000014", "date": "2026-05-05", "type": "Saida", "notes": null, "amount": 1800, "status": "Confirmado", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Aluguel Manutencao", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Aluguel auditorio maio 2026", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "Transferencia", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000005", "financial_account_id": "dd000005-0000-0000-0000-000000000002"}
5e9849bf-ce24-4f5d-8f9c-13fafd6cce8d	dd000008-0000-0000-0000-000000000015	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-000000000015", "date": "2026-04-10", "type": "Saida", "notes": null, "amount": 420, "status": "Confirmado", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Energia Eletrica", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Conta de luz abril 2026", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "Transferencia", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000006", "financial_account_id": "dd000005-0000-0000-0000-000000000002"}
41204e6e-6811-4ae1-8d9d-e513b9eb57af	dd000008-0000-0000-0000-000000000016	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-000000000016", "date": "2026-05-10", "type": "Saida", "notes": null, "amount": 390, "status": "Confirmado", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Energia Eletrica", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Conta de luz maio 2026", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "Transferencia", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000006", "financial_account_id": "dd000005-0000-0000-0000-000000000002"}
15f02f3c-52c4-491e-b2e3-487800a1c538	dd000008-0000-0000-0000-000000000017	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-000000000017", "date": "2026-04-18", "type": "Saida", "notes": null, "amount": 680, "status": "Confirmado", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Material Suprimentos", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Material EBD apostilas biblias", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "PIX", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000007", "financial_account_id": "dd000005-0000-0000-0000-000000000001"}
c5378a20-fdd9-482d-8145-5223bafafbfe	dd000008-0000-0000-0000-000000000018	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-000000000018", "date": "2026-03-20", "type": "Saida", "notes": null, "amount": 180, "status": "Confirmado", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Material Suprimentos", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Material limpeza marco", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "Dinheiro", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000007", "financial_account_id": "dd000005-0000-0000-0000-000000000001"}
cd71c56d-4641-4077-87a0-1b16f2568f8e	dd000008-0000-0000-0000-000000000019	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-000000000019", "date": "2026-06-02", "type": "Saida", "notes": null, "amount": 350, "status": "Pendente", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Material Suprimentos", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Material grafico banner", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "PIX", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000007", "financial_account_id": "dd000005-0000-0000-0000-000000000001"}
3c21d092-f7a3-4d01-8712-baf277376963	dd000008-0000-0000-0000-00000000001a	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-00000000001a", "date": "2026-05-18", "type": "Saida", "notes": null, "amount": 2400, "status": "Confirmado", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Acao Social", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Acao Social Inverno cestas basicas", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "Transferencia", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000008", "financial_account_id": "dd000005-0000-0000-0000-000000000002"}
00f403a6-53df-4528-b21f-538ef28881b7	dd000008-0000-0000-0000-00000000001b	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-00000000001b", "date": "2026-06-07", "type": "Saida", "notes": null, "amount": 850, "status": "Confirmado", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Acao Social", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Distribuicao cobertores junho", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "Dinheiro", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000008", "financial_account_id": "dd000005-0000-0000-0000-000000000001"}
3b098147-399d-4be7-96a1-6fe392e29b3f	dd000008-0000-0000-0000-00000000001c	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-00000000001c", "date": "2026-05-28", "type": "Saida", "notes": null, "amount": 3200, "status": "Confirmado", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Missoes Doacao", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Envio apoio missionario Africa mai", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "Transferencia", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000003", "financial_account_id": "dd000005-0000-0000-0000-000000000003"}
61ea3cf8-8c0d-4260-b224-46787bb77aa8	dd000008-0000-0000-0000-00000000001d	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-00000000001d", "date": "2026-06-10", "type": "Saida", "notes": null, "amount": 2100, "status": "Pendente", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Missoes Doacao", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Passagens equipe Camboja", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "Transferencia", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000003", "financial_account_id": "dd000005-0000-0000-0000-000000000003"}
2334145f-e4f0-4973-9fdc-f8723547fa46	dd000008-0000-0000-0000-00000000001e	10000000-0000-0000-0000-000000000002	insert	\N	2026-06-15 21:02:47.308861+00	\N	{"id": "dd000008-0000-0000-0000-00000000001e", "date": "2026-06-08", "type": "Saida", "notes": null, "amount": 8500, "status": "Confirmado", "user_id": "129a8a20-1e51-4025-9d05-1516e48b188a", "category": "Fundo Construcao", "created_at": "2026-06-15T21:02:47.308861+00:00", "created_by": null, "updated_at": "2026-06-15T21:02:47.308861+00:00", "updated_by": null, "campaign_id": null, "description": "Contrato alvenaria fundacao fase 1", "receipt_url": null, "source_module": "manual", "cost_center_id": null, "payment_method": "Transferencia", "responsible_id": null, "organization_id": "10000000-0000-0000-0000-000000000002", "account_category_id": "dd000006-0000-0000-0000-000000000004", "financial_account_id": "dd000005-0000-0000-0000-000000000004"}
\.


--
-- Data for Name: group_members; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.group_members (id, group_id, member_id, role, joined_at, created_at) FROM stdin;
88888888-0000-0000-0000-000000000001	66666666-0000-0000-0000-000000000001	22222222-0000-0000-0000-000000000005	leader	2026-06-05 15:46:00.21485+00	2026-06-05 15:46:00.21485+00
88888888-0000-0000-0000-000000000002	66666666-0000-0000-0000-000000000001	22222222-0000-0000-0000-000000000009	member	2026-06-05 15:46:00.21485+00	2026-06-05 15:46:00.21485+00
88888888-0000-0000-0000-000000000003	66666666-0000-0000-0000-000000000001	22222222-0000-0000-0000-000000000010	member	2026-06-05 15:46:00.21485+00	2026-06-05 15:46:00.21485+00
88888888-0000-0000-0000-000000000004	66666666-0000-0000-0000-000000000001	22222222-0000-0000-0000-000000000004	member	2026-06-05 15:46:00.21485+00	2026-06-05 15:46:00.21485+00
88888888-0000-0000-0000-000000000005	66666666-0000-0000-0000-000000000001	22222222-0000-0000-0000-000000000014	member	2026-06-05 15:46:00.21485+00	2026-06-05 15:46:00.21485+00
88888888-0000-0000-0000-000000000006	66666666-0000-0000-0000-000000000002	22222222-0000-0000-0000-000000000007	leader	2026-06-05 15:46:00.21485+00	2026-06-05 15:46:00.21485+00
88888888-0000-0000-0000-000000000007	66666666-0000-0000-0000-000000000002	22222222-0000-0000-0000-000000000008	co_leader	2026-06-05 15:46:00.21485+00	2026-06-05 15:46:00.21485+00
88888888-0000-0000-0000-000000000008	66666666-0000-0000-0000-000000000002	22222222-0000-0000-0000-000000000003	member	2026-06-05 15:46:00.21485+00	2026-06-05 15:46:00.21485+00
88888888-0000-0000-0000-000000000009	66666666-0000-0000-0000-000000000002	22222222-0000-0000-0000-000000000002	member	2026-06-05 15:46:00.21485+00	2026-06-05 15:46:00.21485+00
dd00000c-0000-0000-0000-000000000001	dd00000b-0000-0000-0000-000000000001	dd000003-0000-0000-0000-000000000013	member	2022-03-01 00:00:00+00	2026-06-15 21:56:50.708091+00
dd00000c-0000-0000-0000-000000000002	dd00000b-0000-0000-0000-000000000001	dd000003-0000-0000-0000-000000000014	member	2022-08-15 00:00:00+00	2026-06-15 21:56:50.708091+00
dd00000c-0000-0000-0000-000000000003	dd00000b-0000-0000-0000-000000000001	dd000003-0000-0000-0000-000000000015	leader	2021-05-20 00:00:00+00	2026-06-15 21:56:50.708091+00
dd00000c-0000-0000-0000-000000000004	dd00000b-0000-0000-0000-000000000001	dd000003-0000-0000-0000-000000000016	member	2023-02-01 00:00:00+00	2026-06-15 21:56:50.708091+00
dd00000c-0000-0000-0000-000000000005	dd00000b-0000-0000-0000-000000000001	dd000003-0000-0000-0000-000000000017	member	2021-11-22 00:00:00+00	2026-06-15 21:56:50.708091+00
dd00000c-0000-0000-0000-000000000006	dd00000b-0000-0000-0000-000000000002	dd000003-0000-0000-0000-000000000002	leader	2015-03-25 00:00:00+00	2026-06-15 21:56:50.708091+00
dd00000c-0000-0000-0000-000000000007	dd00000b-0000-0000-0000-000000000002	dd000003-0000-0000-0000-000000000003	member	2017-06-10 00:00:00+00	2026-06-15 21:56:50.708091+00
dd00000c-0000-0000-0000-000000000008	dd00000b-0000-0000-0000-000000000002	dd000003-0000-0000-0000-000000000006	member	2016-07-05 00:00:00+00	2026-06-15 21:56:50.708091+00
dd00000c-0000-0000-0000-000000000009	dd00000b-0000-0000-0000-000000000002	dd000003-0000-0000-0000-00000000000e	member	2018-01-20 00:00:00+00	2026-06-15 21:56:50.708091+00
dd00000c-0000-0000-0000-00000000000a	dd00000b-0000-0000-0000-000000000002	dd000003-0000-0000-0000-000000000018	member	2017-04-26 00:00:00+00	2026-06-15 21:56:50.708091+00
dd00000c-0000-0000-0000-00000000000b	dd00000b-0000-0000-0000-000000000003	dd000003-0000-0000-0000-000000000007	leader	2014-11-15 00:00:00+00	2026-06-15 21:56:50.708091+00
dd00000c-0000-0000-0000-00000000000c	dd00000b-0000-0000-0000-000000000003	dd000003-0000-0000-0000-000000000004	member	2015-02-10 00:00:00+00	2026-06-15 21:56:50.708091+00
dd00000c-0000-0000-0000-00000000000d	dd00000b-0000-0000-0000-000000000003	dd000003-0000-0000-0000-00000000000a	member	2013-04-05 00:00:00+00	2026-06-15 21:56:50.708091+00
dd00000c-0000-0000-0000-00000000000e	dd00000b-0000-0000-0000-000000000003	dd000003-0000-0000-0000-00000000000c	member	2020-01-08 00:00:00+00	2026-06-15 21:56:50.708091+00
dd00000c-0000-0000-0000-00000000000f	dd00000b-0000-0000-0000-000000000003	dd000003-0000-0000-0000-000000000012	member	2016-09-30 00:00:00+00	2026-06-15 21:56:50.708091+00
dd00000c-0000-0000-0000-000000000010	dd00000b-0000-0000-0000-000000000004	dd000003-0000-0000-0000-000000000005	leader	2011-03-01 00:00:00+00	2026-06-15 21:56:50.708091+00
dd00000c-0000-0000-0000-000000000011	dd00000b-0000-0000-0000-000000000004	dd000003-0000-0000-0000-000000000009	member	2012-05-10 00:00:00+00	2026-06-15 21:56:50.708091+00
dd00000c-0000-0000-0000-000000000012	dd00000b-0000-0000-0000-000000000004	dd000003-0000-0000-0000-00000000000b	member	2018-02-14 00:00:00+00	2026-06-15 21:56:50.708091+00
dd00000c-0000-0000-0000-000000000013	dd00000b-0000-0000-0000-000000000004	dd000003-0000-0000-0000-00000000000f	member	2020-07-01 00:00:00+00	2026-06-15 21:56:50.708091+00
dd00000c-0000-0000-0000-000000000014	dd00000b-0000-0000-0000-000000000004	dd000003-0000-0000-0000-000000000019	member	2011-06-15 00:00:00+00	2026-06-15 21:56:50.708091+00
dd00000c-0000-0000-0000-000000000015	dd00000b-0000-0000-0000-000000000005	dd000003-0000-0000-0000-000000000008	leader	2018-03-10 00:00:00+00	2026-06-15 21:56:50.708091+00
dd00000c-0000-0000-0000-000000000016	dd00000b-0000-0000-0000-000000000005	dd000003-0000-0000-0000-00000000000d	member	2021-04-01 00:00:00+00	2026-06-15 21:56:50.708091+00
dd00000c-0000-0000-0000-000000000017	dd00000b-0000-0000-0000-000000000005	dd000003-0000-0000-0000-000000000010	member	2022-03-15 00:00:00+00	2026-06-15 21:56:50.708091+00
dd00000c-0000-0000-0000-000000000018	dd00000b-0000-0000-0000-000000000005	dd000003-0000-0000-0000-000000000011	member	2020-10-10 00:00:00+00	2026-06-15 21:56:50.708091+00
dd00000c-0000-0000-0000-000000000019	dd00000b-0000-0000-0000-000000000005	dd000003-0000-0000-0000-000000000016	member	2023-09-05 00:00:00+00	2026-06-15 21:56:50.708091+00
\.


--
-- Data for Name: group_messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.group_messages (id, group_id, author_user_id, body, created_at) FROM stdin;
99999999-0000-0000-0000-000000000001	66666666-0000-0000-0000-000000000001	00000000-0000-0000-0000-00000000b001	Bem-vindos ao grupo Jovens Resgate! Neste sábado teremos estudo sobre missões urbanas.	2026-06-02 16:13:16.385349+00
99999999-0000-0000-0000-000000000002	66666666-0000-0000-0000-000000000001	00000000-0000-0000-0000-00000000b001	Lembrem-se de convidar um amigo para o encontro da próxima semana.	2026-06-04 16:13:16.385349+00
99999999-0000-0000-0000-000000000003	66666666-0000-0000-0000-000000000002	00000000-0000-0000-0000-00000000b001	Casais Ágape: nosso próximo encontro será sobre Efésios 5. Tragam o caderno de anotações.	2026-06-03 16:13:16.385349+00
99999999-0000-0000-0000-000000000004	66666666-0000-0000-0000-000000000002	00000000-0000-0000-0000-00000000b001	Oremos juntos pelas famílias da congregação que estão passando por desafios.	2026-06-05 04:13:16.385349+00
fb06e8f2-ec43-484a-90fa-429728e2541d	66666666-0000-0000-0000-000000000002	3a7e972d-f9d5-417a-984c-3652d6c2f28f	oi	2026-06-05 16:18:58.665452+00
e9191d59-f9b6-473b-834e-0e5cf0dfa731	66666666-0000-0000-0000-000000000002	3a7e972d-f9d5-417a-984c-3652d6c2f28f	vamos orar	2026-06-05 16:19:12.609322+00
e7ae96c9-b216-4c55-b09e-28e51506c1d7	66666666-0000-0000-0000-000000000001	3a7e972d-f9d5-417a-984c-3652d6c2f28f	ola grupo	2026-06-05 16:25:35.427043+00
12f28644-a7a2-4bff-b9f9-04e156188d13	ca4afafc-2bad-49a6-878b-93e5eb73b7e6	19a640de-eea1-4c89-8167-54c2ca1ccee4	Ola	2026-06-09 04:37:52.906402+00
\.


--
-- Data for Name: groups; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.groups (id, organization_id, name, description, group_type, leader_member_id, location, meeting_day, meeting_time, is_active, created_by, created_at, updated_at) FROM stdin;
66666666-0000-0000-0000-000000000001	11111111-0000-0000-0000-000000000004	Jovens Resgate	Grupo de jovens com idades entre 15 e 30 anos. Reuniões aos sábados às 19h no Salão dos Jovens. Líder: Paulo Henrique Costa. Foco em evangelismo, discipulado e missões urbanas.	\N	22222222-0000-0000-0000-000000000005	\N	\N	\N	t	\N	2026-06-04 19:03:23.834365+00	2026-06-05 15:46:00.21485+00
66666666-0000-0000-0000-000000000002	11111111-0000-0000-0000-000000000004	Casais Ágape	Grupo para casais em todas as fases do casamento. Reuniões quinzenais às sextas-feiras às 20h. Coordenação: Ricardo e Juliana Pereira. Estudo atual: "Amor e Respeito" (Ef 5:22-33).	\N	22222222-0000-0000-0000-000000000007	\N	\N	\N	t	\N	2026-06-04 19:03:23.834365+00	2026-06-05 15:46:00.21485+00
ca4afafc-2bad-49a6-878b-93e5eb73b7e6	10000000-0000-0000-0000-000000000001	Teste	Teste	Jovens	\N	Teste 	19	20	t	19a640de-eea1-4c89-8167-54c2ca1ccee4	2026-06-09 04:37:42.733883+00	2026-06-09 04:39:02.8418+00
dd00000b-0000-0000-0000-000000000001	10000000-0000-0000-0000-000000000002	Jovens Resgate	Grupo jovens 15-30 anos. Evangelismo, discipulado e missões.	jovens	dd000003-0000-0000-0000-000000000015	Salão dos Jovens	Sábado	19:00	t	\N	2026-06-15 21:46:45.369813+00	2026-06-15 21:46:45.369813+00
dd00000b-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000002	Casais Ágape	Grupo casais. Estudo: Amor e Respeito (Ef 5:22-33).	casais	dd000003-0000-0000-0000-000000000002	Salão Paroquial	Sexta-feira	20:00	t	\N	2026-06-15 21:46:45.369813+00	2026-06-15 21:46:45.369813+00
dd00000b-0000-0000-0000-000000000003	10000000-0000-0000-0000-000000000002	Mulheres de Fé	Grupo mulheres — comunhão, oração e estudo bíblico.	mulheres	dd000003-0000-0000-0000-000000000007	Salão Paroquial	Terça-feira	14:00	t	\N	2026-06-15 21:46:45.369813+00	2026-06-15 21:46:45.369813+00
dd00000b-0000-0000-0000-000000000004	10000000-0000-0000-0000-000000000002	Homens de Valor	Grupo homens — liderança familiar e espiritual.	homens	dd000003-0000-0000-0000-000000000005	Sala de Ensino	Sábado	08:00	t	\N	2026-06-15 21:46:45.369813+00	2026-06-15 21:46:45.369813+00
dd00000b-0000-0000-0000-000000000005	10000000-0000-0000-0000-000000000002	Adolescentes Raiz	Grupo adolescentes 12-17 anos. Atividades lúdicas e bíblicas.	adolescentes	dd000003-0000-0000-0000-000000000008	Salão dos Jovens	Sábado	15:00	t	\N	2026-06-15 21:46:45.369813+00	2026-06-15 21:46:45.369813+00
\.


--
-- Data for Name: internal_message_attachments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.internal_message_attachments (id, message_id, thread_id, organization_id, uploaded_by, storage_bucket, storage_path, public_url, file_name, file_type, file_size, duration_seconds, created_at) FROM stdin;
003d9b6b-e942-452f-aeca-38e207b53224	672ffd8f-3036-4f38-9ad9-a78f2e44583b	668e26da-7fcc-4df1-9dd9-7eeb66daf964	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	internal-message-media	10000000-0000-0000-0000-000000000002/668e26da-7fcc-4df1-9dd9-7eeb66daf964/edb211ae-17de-4616-b8db-74ca73ff6abe.webm	https://qkiiwopkbcslquyfhdec.supabase.co/storage/v1/object/public/internal-message-media/10000000-0000-0000-0000-000000000002/668e26da-7fcc-4df1-9dd9-7eeb66daf964/edb211ae-17de-4616-b8db-74ca73ff6abe.webm	audio-1781639162098.webm	audio/webm;codecs=opus	131641	\N	2026-06-16 19:46:04.472154+00
570b2530-312c-4a2f-b611-efd9090e528e	af2cb348-6f7d-4aba-84cf-aa212962e0cd	668e26da-7fcc-4df1-9dd9-7eeb66daf964	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	internal-message-media	10000000-0000-0000-0000-000000000002/668e26da-7fcc-4df1-9dd9-7eeb66daf964/dcf3afec-90e6-4994-80a4-c88b9236a6bc.webm	https://qkiiwopkbcslquyfhdec.supabase.co/storage/v1/object/public/internal-message-media/10000000-0000-0000-0000-000000000002/668e26da-7fcc-4df1-9dd9-7eeb66daf964/dcf3afec-90e6-4994-80a4-c88b9236a6bc.webm	audio-1781647247650.webm	audio/webm;codecs=opus	64427	\N	2026-06-16 22:00:49.670042+00
17841e79-3ada-42f6-bd01-1e13934bd4c2	779aa392-9b04-4f93-9ed0-73125dcba55b	dd000014-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	internal-message-media	10000000-0000-0000-0000-000000000002/dd000014-0000-0000-0000-000000000002/aceffc27-20c4-417a-bd4e-8a7752b861a8.webm	https://qkiiwopkbcslquyfhdec.supabase.co/storage/v1/object/public/internal-message-media/10000000-0000-0000-0000-000000000002/dd000014-0000-0000-0000-000000000002/aceffc27-20c4-417a-bd4e-8a7752b861a8.webm	audio-1782172091528.webm	audio/webm;codecs=opus	83907	\N	2026-06-22 23:48:13.260077+00
\.


--
-- Data for Name: internal_messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.internal_messages (id, thread_id, organization_id, sender_user_id, sender_member_id, sender_role, body, message_type, reply_to_message_id, created_at, read_at) FROM stdin;
f128bb54-655e-4a78-a25a-c59612dfcfcd	92b1840d-c6a3-4931-8d52-d12f927c6ca4	11111111-0000-0000-0000-000000000004	3a7e972d-f9d5-417a-984c-3652d6c2f28f	\N	super_admin	oi	text	\N	2026-06-12 14:58:57.80279+00	\N
dd000014-0001-0000-0000-000000000001	dd000014-0000-0000-0000-000000000001	10000000-0000-0000-0000-000000000002	\N	\N	secretary	Favor conferir o cadastro do irmão Marcos antes da emissão da carta.	text	\N	2026-06-09 23:04:53.704+00	\N
dd000014-0001-0000-0000-000000000002	dd000014-0000-0000-0000-000000000001	10000000-0000-0000-0000-000000000002	\N	\N	admin	Verificado. Cadastro está completo e atualizado.	text	\N	2026-06-10 00:04:53.704+00	\N
dd000014-0001-0000-0000-000000000003	dd000014-0000-0000-0000-000000000001	10000000-0000-0000-0000-000000000002	\N	\N	secretary	Reunião de obreiros confirmada para quinta-feira às 19h.	text	\N	2026-06-10 23:04:53.704+00	\N
dd000014-0001-0000-0000-000000000004	dd000014-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000002	\N	\N	treasurer	Tesouraria solicitou conferência do relatório mensal.	text	\N	2026-06-11 23:04:53.704+00	\N
dd000014-0001-0000-0000-000000000005	dd000014-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000002	\N	\N	secretary	Relatório enviado. Total de entradas: R$ 54.000 / Saídas: R$ 23.620.	text	\N	2026-06-12 01:04:53.704+00	\N
dd000014-0001-0000-0000-000000000006	dd000014-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000002	\N	\N	admin	Recebido. Aprovar o fechamento mensal?	text	\N	2026-06-12 23:04:53.704+00	\N
dd000014-0001-0000-0000-000000000007	dd000014-0000-0000-0000-000000000003	10000000-0000-0000-0000-000000000002	\N	\N	secretary	Carta de recomendação da irmã Fernanda já foi aprovada.	text	\N	2026-06-13 23:04:53.704+00	\N
dd000014-0001-0000-0000-000000000008	dd000014-0000-0000-0000-000000000003	10000000-0000-0000-0000-000000000002	\N	\N	pastor	Ótimo. Já assinei digitalmente. Pode enviar ao destinatário.	text	\N	2026-06-13 23:34:53.704+00	\N
dd000014-0001-0000-0000-000000000009	dd000014-0000-0000-0000-000000000003	10000000-0000-0000-0000-000000000002	\N	\N	secretary	Pendente: carta para o irmão Rodrigo Maran. Aguardando documentação.	text	\N	2026-06-14 23:04:53.704+00	\N
dd000014-0001-0000-0000-00000000000a	dd000014-0000-0000-0000-000000000004	10000000-0000-0000-0000-000000000002	\N	\N	secretary	Documento de atualização cadastral recebido pela secretaria.	text	\N	2026-06-06 23:04:53.704+00	\N
dd000014-0001-0000-0000-00000000000b	dd000014-0000-0000-0000-000000000004	10000000-0000-0000-0000-000000000002	\N	\N	admin	Processar e arquivar. Qualquer divergência, retornar ao membro.	text	\N	2026-06-07 23:04:53.704+00	\N
dd000014-0001-0000-0000-00000000000c	dd000014-0000-0000-0000-000000000004	10000000-0000-0000-0000-000000000002	\N	\N	secretary	Concluído. Todos os cadastros atualizados e arquivados.	text	\N	2026-06-08 23:04:53.704+00	\N
31e03501-5ef0-426d-b5c3-cfecb86cacf8	dd000014-0000-0000-0000-000000000003	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	\N	church_admin	Ok	text	\N	2026-06-16 19:27:44.543547+00	\N
8576eb91-a882-4099-9428-f364b830f2a1	668e26da-7fcc-4df1-9dd9-7eeb66daf964	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	\N	church_admin	Pas do Senhor meu Irmão	text	\N	2026-06-16 19:29:02.642125+00	\N
672ffd8f-3036-4f38-9ad9-a78f2e44583b	668e26da-7fcc-4df1-9dd9-7eeb66daf964	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	\N	church_admin	\N	audio	\N	2026-06-16 19:46:03.362624+00	\N
af2cb348-6f7d-4aba-84cf-aa212962e0cd	668e26da-7fcc-4df1-9dd9-7eeb66daf964	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	\N	church_admin	\N	audio	\N	2026-06-16 22:00:48.851092+00	\N
77762b59-6344-4eca-8b96-73ab1380fc2f	dd000014-0000-0000-0000-000000000004	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	\N	church_admin	Ola	text	\N	2026-06-17 11:42:07.292896+00	\N
86fc6322-6bac-4502-9d64-b4c8468af7db	dd000014-0000-0000-0000-000000000004	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	\N	church_admin	Tudo bem, vou analizar	text	\N	2026-06-17 11:42:18.549509+00	\N
6407695c-2741-4a89-920d-ca73e99e29a4	edbf3b0d-c831-4566-b795-fd22984a4c7c	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	\N	church_admin	Paz do Senhor meu Irmão	text	\N	2026-06-17 11:43:35.342561+00	\N
60de49bb-78fa-4691-9d68-235ba6747d3c	edbf3b0d-c831-4566-b795-fd22984a4c7c	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	\N	church_admin	Teste	text	\N	2026-06-17 11:44:03.018598+00	\N
190dd8eb-f938-47c7-b8dc-bc64532ad5bc	09b82cdb-14e4-4783-8328-6b19223e998c	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	\N	church_admin	Paz do Senhor Irmão Edson	text	\N	2026-06-17 14:29:19.806951+00	\N
210a0f19-27a5-481d-ac8e-b9160738d1ec	09b82cdb-14e4-4783-8328-6b19223e998c	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	\N	church_admin	Essa mensagem é uma mensagem de teste do chat da secretaria com membros cadastrados e ativos no nosso sistema.	text	\N	2026-06-17 14:30:22.594603+00	\N
7b69a012-9de6-4c11-b541-4bfa738f7747	09b82cdb-14e4-4783-8328-6b19223e998c	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	\N	church_admin	Obrigado por nos ajudar a testar nosso sistema.	text	\N	2026-06-17 14:31:00.1351+00	\N
b8cd9e72-e7fa-4c27-b5ed-627c2de6ab26	a2d3fc9f-ed98-4af7-a2f1-46710226e9aa	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	\N	admin	📹 Reunião "Diretoria" criada. Use os botões de ligação/vídeo para entrar na sala.	text	\N	2026-06-18 03:04:54.648677+00	\N
779aa392-9b04-4f93-9ed0-73125dcba55b	dd000014-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	\N	church_admin	\N	audio	\N	2026-06-22 23:48:12.163319+00	\N
5b522795-0e0e-4063-a43d-84db0d0c2a42	48ab8816-2acb-4727-8628-d84ea692e454	11111111-0000-0000-0000-000000000004	3a7e972d-f9d5-417a-984c-3652d6c2f28f	\N	super_admin	Ola	text	\N	2026-06-26 17:12:09.984524+00	\N
\.


--
-- Data for Name: internal_threads; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.internal_threads (id, organization_id, campaign_id, member_id, created_by, assigned_to, subject, status, source, reply_enabled, last_message_at, closed_at, created_at, updated_at) FROM stdin;
a2d3fc9f-ed98-4af7-a2f1-46710226e9aa	10000000-0000-0000-0000-000000000002	\N	\N	129a8a20-1e51-4025-9d05-1516e48b188a	\N	Diretoria	answered	secretariat	t	2026-06-18 03:04:54.648677+00	\N	2026-06-18 03:04:53.791638+00	2026-06-18 03:04:54.648677+00
e5f7d64a-9427-4142-acd3-d2cfc532e988	10000000-0000-0000-0000-000000000002	\N	dd000003-0000-0000-0000-000000000016	129a8a20-1e51-4025-9d05-1516e48b188a	\N	Julia Bortolini	open	secretariat	t	\N	\N	2026-06-18 03:06:43.532265+00	2026-06-18 03:06:43.532265+00
dd000014-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000002	\N	\N	\N	\N	Tesouraria e Financeiro	answered	secretariat	t	2026-06-22 23:48:12.163319+00	\N	2026-06-10 23:04:52.691+00	2026-06-22 23:48:12.163319+00
92b1840d-c6a3-4931-8d52-d12f927c6ca4	11111111-0000-0000-0000-000000000004	a6b3ec47-2a93-4b80-8537-79aef313d08b	\N	3a7e972d-f9d5-417a-984c-3652d6c2f28f	\N	Ganhando Almas	open	campaign	t	2026-06-12 14:58:57.80279+00	\N	2026-06-12 14:58:57.250562+00	2026-06-12 15:09:09.124641+00
dd000014-0000-0000-0000-000000000001	10000000-0000-0000-0000-000000000002	\N	\N	\N	\N	Secretaria Geral	answered	secretariat	t	2026-06-10 23:04:53.704+00	\N	2026-06-08 23:04:52.691+00	2026-06-15 23:04:54.802025+00
dd000014-0000-0000-0000-000000000003	10000000-0000-0000-0000-000000000002	\N	\N	\N	\N	Cartas de Recomendação	answered	secretariat	t	2026-06-16 19:27:44.543547+00	\N	2026-06-12 23:04:52.691+00	2026-06-16 19:27:44.543547+00
48ab8816-2acb-4727-8628-d84ea692e454	11111111-0000-0000-0000-000000000004	\N	403ad07d-fade-4fe6-ba75-176261bd0ab5	3a7e972d-f9d5-417a-984c-3652d6c2f28f	\N	pedro teste	answered	secretariat	t	2026-06-26 17:12:09.984524+00	\N	2026-06-26 17:11:53.787029+00	2026-06-26 17:12:09.984524+00
668e26da-7fcc-4df1-9dd9-7eeb66daf964	10000000-0000-0000-0000-000000000002	\N	\N	129a8a20-1e51-4025-9d05-1516e48b188a	\N	Secretaria Geral	open	secretariat	t	2026-06-16 22:00:48.851092+00	\N	2026-06-16 19:28:26.202124+00	2026-06-16 23:18:14.028178+00
dd000014-0000-0000-0000-000000000004	10000000-0000-0000-0000-000000000002	\N	\N	\N	\N	Documentos e Cadastros	answered	secretariat	t	2026-06-17 11:42:18.549509+00	\N	2026-06-05 23:04:52.691+00	2026-06-17 11:42:18.549509+00
edbf3b0d-c831-4566-b795-fd22984a4c7c	10000000-0000-0000-0000-000000000002	\N	ff0cafc7-94bc-4bea-a60c-5e93f7fa191a	129a8a20-1e51-4025-9d05-1516e48b188a	\N	Pedro Antonio teste	answered	secretariat	t	2026-06-17 11:44:03.018598+00	\N	2026-06-17 11:43:11.414319+00	2026-06-17 11:44:03.018598+00
09b82cdb-14e4-4783-8328-6b19223e998c	10000000-0000-0000-0000-000000000002	\N	5ca26fda-7777-40b9-9882-4cdce9e19aae	129a8a20-1e51-4025-9d05-1516e48b188a	\N	Edson G Roquete	answered	secretariat	t	2026-06-17 14:31:00.1351+00	\N	2026-06-17 14:29:00.683231+00	2026-06-17 14:31:00.1351+00
\.


--
-- Data for Name: member_invites; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.member_invites (id, token, member_id, organization_id, sector_id, congregation_id, invited_by, role, status, expires_at, accepted_at, accepted_user_id, created_at) FROM stdin;
da4de403-aac5-4fbe-a78b-66933ebf7593	a614c47b1778054291388f5309a87e0472d6001e2869cf9f	5ca26fda-7777-40b9-9882-4cdce9e19aae	10000000-0000-0000-0000-000000000002	dd000001-0000-0000-0000-000000000005	dd000002-0000-0000-0000-000000000001	129a8a20-1e51-4025-9d05-1516e48b188a	member	pending	2026-07-17 15:40:25.226439+00	\N	\N	2026-06-17 15:40:25.226439+00
\.


--
-- Data for Name: members; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.members (id, organization_id, full_name, member_role, status, phone, email, address, city, state, country_code, birth_date, baptized_at, joined_at, notes, created_by, created_at, updated_at, user_id, photo_url, gender, marital_status, cpf, rg, rg_issuer, rg_issue_date, whatsapp, zip_code, street, address_number, address_complement, neighborhood, conversion_date, administrative_role, father_name, mother_name, spouse_name, sector_id, congregation_id, civil_document_type, civil_document_status, civil_document_url, civil_document_notes, civil_document_uploaded_at, civil_document_validated_at, civil_document_validated_by, holy_spirit_baptism_date, consecration_date) FROM stdin;
403ad07d-fade-4fe6-ba75-176261bd0ab5	11111111-0000-0000-0000-000000000004	pedro teste	membro	Disciplinado	54996842709	dinhogoncalves987@gmail.com	\N	\N	\N	\N	\N	\N	2026-06-04	\N	3a7e972d-f9d5-417a-984c-3652d6c2f28f	2026-06-04 21:19:24.490118+00	2026-06-04 21:19:24.490118+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
22222222-0000-0000-0000-000000000014	11111111-0000-0000-0000-000000000004	Priscila Fontes Correia	Membro	Ativo	\N	\N	\N	Caxias do Sul	RS	\N	\N	\N	2024-01-20	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-05 19:06:54.40282+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
22222222-0000-0000-0000-000000000015	11111111-0000-0000-0000-000000000004	Marcos Vinícius Rocha	Obreiro	Inativo	\N	\N	\N	Caxias do Sul	RS	\N	\N	\N	2021-11-08	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-05 19:06:54.40282+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
22222222-0000-0000-0000-000000000016	11111111-0000-0000-0000-000000000004	Antonio Mendes da Silva	Membro	Falecido	\N	\N	\N	Caxias do Sul	RS	\N	\N	\N	1998-04-12	\N	\N	2026-06-04 19:03:26.0894+00	2026-06-05 19:06:54.40282+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
22222222-0000-0000-0000-000000000017	11111111-0000-0000-0000-000000000004	Helena Costa Ribeiro	Membro	Transferido	\N	\N	\N	Caxias do Sul	RS	\N	\N	\N	2010-07-03	\N	\N	2026-06-04 19:03:26.0894+00	2026-06-05 19:06:54.40282+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
22222222-0000-0000-0000-000000000008	11111111-0000-0000-0000-000000000004	Juliana Cristina Ramos	Membro	Ativo	(54) 99999-0008	\N	\N	Caxias do Sul	RS	\N	\N	\N	2021-05-10	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-05 19:06:54.40282+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
22222222-0000-0000-0000-000000000009	11111111-0000-0000-0000-000000000004	Lucas Eduardo Souza	Obreiro	Ativo	(54) 99999-0009	\N	\N	Caxias do Sul	RS	\N	\N	\N	2022-01-17	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-05 19:06:54.40282+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
22222222-0000-0000-0000-000000000010	11111111-0000-0000-0000-000000000004	Beatriz Helena Martins	Membro	Ativo	(54) 99999-0010	\N	\N	Caxias do Sul	RS	\N	\N	\N	2022-08-30	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-05 19:06:54.40282+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
22222222-0000-0000-0000-000000000011	11111111-0000-0000-0000-000000000004	Rodrigo Almeida Torres	Visitante	Visitante	(54) 99999-0011	\N	\N	Caxias do Sul	RS	\N	\N	\N	2026-05-05	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-05 19:06:54.40282+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
22222222-0000-0000-0000-000000000012	11111111-0000-0000-0000-000000000004	Silvia Regina Campos	Membro	Ativo	(54) 99999-0012	\N	\N	Caxias do Sul	RS	\N	\N	\N	2023-03-12	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-05 19:06:54.40282+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
22222222-0000-0000-0000-000000000013	11111111-0000-0000-0000-000000000004	André Luís Nascimento	Diácono	Ativo	(54) 99999-0013	\N	\N	Caxias do Sul	RS	\N	\N	\N	2020-08-05	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-05 19:06:54.40282+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
22222222-0000-0000-0000-000000000001	11111111-0000-0000-0000-000000000004	Pr. João Paulo Ferreira	Pastor	Ativo	(54) 99999-0001	pastor@adcaxias.org.br	\N	Caxias do Sul	RS	\N	\N	\N	2015-03-15	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-05 19:06:54.40282+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
22222222-0000-0000-0000-000000000002	11111111-0000-0000-0000-000000000004	Maria Aparecida Santos	Diaconisa	Ativo	(54) 99999-0002	maria.santos@adcaxias.org.br	\N	Caxias do Sul	RS	\N	\N	\N	2016-06-20	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-05 19:06:54.40282+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
22222222-0000-0000-0000-000000000003	11111111-0000-0000-0000-000000000004	Carlos Roberto Lima	Diácono	Ativo	(54) 99999-0003	carlos.lima@adcaxias.org.br	\N	Caxias do Sul	RS	\N	\N	\N	2017-01-10	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-05 19:06:54.40282+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
22222222-0000-0000-0000-000000000004	11111111-0000-0000-0000-000000000004	Ana Cristina Oliveira	Membro	Ativo	(54) 99999-0004	ana.oliveira@adcaxias.org.br	\N	Caxias do Sul	RS	\N	\N	\N	2018-09-05	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-05 19:06:54.40282+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
22222222-0000-0000-0000-000000000005	11111111-0000-0000-0000-000000000004	Paulo Henrique Costa	Líder de Jovens	Ativo	(54) 99999-0005	paulo.costa@adcaxias.org.br	\N	Caxias do Sul	RS	\N	\N	\N	2019-03-22	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-05 19:06:54.40282+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
22222222-0000-0000-0000-000000000006	11111111-0000-0000-0000-000000000004	Fernanda Maria Alves	Secretária	Ativo	(54) 99999-0006	fernanda@adcaxias.org.br	\N	Caxias do Sul	RS	\N	\N	\N	2019-11-14	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-05 19:06:54.40282+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
22222222-0000-0000-0000-000000000007	11111111-0000-0000-0000-000000000004	Ricardo José Pereira	Tesoureiro	Ativo	(54) 99999-0007	tesoureiro@adcaxias.org.br	\N	Caxias do Sul	RS	\N	\N	\N	2020-02-28	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-05 19:06:54.40282+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
dd000003-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000002	Ana Paula Zanella	Lider	Ativo	(54) 98801-0002	anapz@adcaxias.org.br	\N	Caxias do Sul	RS	\N	1980-07-22	2002-06-08	2015-03-20	\N	\N	2026-06-15 20:50:46.117348+00	2026-06-15 21:07:55.86857+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
dd000003-0000-0000-0000-000000000011	10000000-0000-0000-0000-000000000002	Anderson Volpato	Membro	Transferido	(54) 98801-0017	\N	\N	Caxias do Sul	RS	\N	1991-12-25	\N	2020-10-05	\N	\N	2026-06-15 20:50:46.117348+00	2026-06-15 21:07:55.86857+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
dd000003-0000-0000-0000-000000000019	10000000-0000-0000-0000-000000000002	Antonio Cominetto	Membro	Visitante	(54) 98801-0025	\N	\N	Caxias do Sul	RS	\N	1958-05-30	1982-10-10	2010-01-01	\N	\N	2026-06-15 20:50:46.117348+00	2026-06-15 21:07:55.86857+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
dd000003-0000-0000-0000-000000000018	10000000-0000-0000-0000-000000000002	Camila Dallacosta	Membro	Visitante	(54) 98801-0024	\N	\N	Caxias do Sul	RS	\N	1986-10-17	2009-04-05	2017-04-25	\N	\N	2026-06-15 20:50:46.117348+00	2026-06-15 21:07:55.86857+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
dd000003-0000-0000-0000-00000000000c	10000000-0000-0000-0000-000000000002	Cristiane Degasperi	Membro	Inativo	(54) 98801-0012	\N	\N	Caxias do Sul	RS	\N	1992-10-03	\N	2019-04-20	\N	\N	2026-06-15 20:50:46.117348+00	2026-06-15 21:07:55.86857+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
dd000003-0000-0000-0000-000000000012	10000000-0000-0000-0000-000000000002	Elisangela Mantovani	Membro	Transferido	(54) 98801-0018	\N	\N	Caxias do Sul	RS	\N	1984-02-14	2006-03-19	2016-01-08	\N	\N	2026-06-15 20:50:46.117348+00	2026-06-15 21:07:55.86857+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
dd000003-0000-0000-0000-000000000007	10000000-0000-0000-0000-000000000002	Fernanda Pasinato	Lider	Ativo	(54) 98801-0007	fernanda.p@adcaxias.org.br	\N	Caxias do Sul	RS	\N	1982-06-02	2004-05-05	2014-11-11	\N	\N	2026-06-15 20:50:46.117348+00	2026-06-15 21:07:55.86857+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
dd000003-0000-0000-0000-000000000005	10000000-0000-0000-0000-000000000002	Gilberto Pedro Colombo	Tesoureiro	Ativo	(54) 98801-0005	tesoureiro@adcaxias.org.br	\N	Caxias do Sul	RS	\N	1972-09-30	1995-03-25	2011-02-28	\N	\N	2026-06-15 20:50:46.117348+00	2026-06-15 21:07:55.86857+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
dd000003-0000-0000-0000-000000000015	10000000-0000-0000-0000-000000000002	Gustavo Pegoraro	Jovem	Falecido	(54) 98801-0021	\N	\N	Caxias do Sul	RS	\N	1999-04-22	\N	2021-05-18	\N	\N	2026-06-15 20:50:46.117348+00	2026-06-15 21:07:55.86857+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
dd000003-0000-0000-0000-000000000016	10000000-0000-0000-0000-000000000002	Julia Bortolini	Jovem	Falecido	(54) 98801-0022	\N	\N	Caxias do Sul	RS	\N	2002-08-15	\N	2023-01-30	\N	\N	2026-06-15 20:50:46.117348+00	2026-06-15 21:07:55.86857+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
dd000003-0000-0000-0000-00000000000f	10000000-0000-0000-0000-000000000002	Julio Cesar Brandalise	Obreiro	Disciplinado	(54) 98801-0015	\N	\N	Caxias do Sul	RS	\N	1993-04-04	\N	2020-02-10	\N	\N	2026-06-15 20:50:46.117348+00	2026-06-15 21:07:55.86857+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
dd000003-0000-0000-0000-000000000014	10000000-0000-0000-0000-000000000002	Larissa Fracasso	Jovem	Falecido	(54) 98801-0020	\N	\N	Caxias do Sul	RS	\N	2001-11-08	\N	2022-08-12	\N	\N	2026-06-15 20:50:46.117348+00	2026-06-15 21:07:55.86857+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
dd000003-0000-0000-0000-000000000006	10000000-0000-0000-0000-000000000002	Leandro Basso	Diacono	Ativo	(54) 98801-0006	leandro.basso@adcaxias.org.br	\N	Caxias do Sul	RS	\N	1985-12-14	2007-11-12	2016-07-04	\N	\N	2026-06-15 20:50:46.117348+00	2026-06-15 21:07:55.86857+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
dd000003-0000-0000-0000-000000000003	10000000-0000-0000-0000-000000000002	Marcos Antonio Rossato	Obreiro	Ativo	(54) 98801-0003	marcos.rossato@adcaxias.org.br	\N	Caxias do Sul	RS	\N	1975-11-05	1998-09-20	2012-05-15	\N	\N	2026-06-15 20:50:46.117348+00	2026-06-15 21:07:55.86857+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
dd000003-0000-0000-0000-00000000000a	10000000-0000-0000-0000-000000000002	Maria Jose Tonetto	Membro	Ativo	(54) 98801-0010	\N	\N	Caxias do Sul	RS	\N	1960-01-25	1985-12-22	2010-01-01	\N	\N	2026-06-15 20:50:46.117348+00	2026-06-15 21:07:55.86857+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
dd000003-0000-0000-0000-000000000010	10000000-0000-0000-0000-000000000002	Patricia Scortegagna	Membro	Disciplinado	(54) 98801-0016	\N	\N	Caxias do Sul	RS	\N	1995-09-19	\N	2021-07-14	\N	\N	2026-06-15 20:50:46.117348+00	2026-06-15 21:07:55.86857+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
dd000003-0000-0000-0000-00000000000b	10000000-0000-0000-0000-000000000002	Paulo Eduardo Antoniazzi	Diacono	Inativo	(54) 98801-0011	\N	\N	Caxias do Sul	RS	\N	1988-05-17	2010-03-10	2017-06-30	\N	\N	2026-06-15 20:50:46.117348+00	2026-06-15 21:07:55.86857+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
dd000003-0000-0000-0000-000000000001	10000000-0000-0000-0000-000000000002	Pr. Sergio Luiz Bortolanza	Pastor	Ativo	(54) 98801-0001	pastor@adcaxias.org.br	\N	Caxias do Sul	RS	\N	1970-03-12	1990-04-15	2010-01-10	\N	\N	2026-06-15 20:50:46.117348+00	2026-06-15 21:07:55.86857+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
dd000003-0000-0000-0000-000000000013	10000000-0000-0000-0000-000000000002	Rafael Casagrande	Jovem	Transferido	(54) 98801-0019	\N	\N	Caxias do Sul	RS	\N	2000-06-30	\N	2022-03-25	\N	\N	2026-06-15 20:50:46.117348+00	2026-06-15 21:07:55.86857+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
dd000003-0000-0000-0000-000000000009	10000000-0000-0000-0000-000000000002	Roberto Galvani	Membro	Ativo	(54) 98801-0009	\N	\N	Caxias do Sul	RS	\N	1965-08-08	1988-07-15	2010-09-09	\N	\N	2026-06-15 20:50:46.117348+00	2026-06-15 21:07:55.86857+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
dd000003-0000-0000-0000-00000000000d	10000000-0000-0000-0000-000000000002	Rodrigo Maran	Membro	Inativo	(54) 98801-0013	\N	\N	Caxias do Sul	RS	\N	1987-03-28	\N	2018-12-01	\N	\N	2026-06-15 20:50:46.117348+00	2026-06-15 21:07:55.86857+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
dd000003-0000-0000-0000-000000000004	10000000-0000-0000-0000-000000000002	Roseli Maria Ferrari	Secretaria	Ativo	(54) 98801-0004	secretaria@adcaxias.org.br	\N	Caxias do Sul	RS	\N	1978-04-18	2000-01-30	2013-08-01	\N	\N	2026-06-15 20:50:46.117348+00	2026-06-15 21:07:55.86857+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
dd000003-0000-0000-0000-00000000000e	10000000-0000-0000-0000-000000000002	Simone Bettega	Membro	Disciplinado	(54) 98801-0014	\N	\N	Caxias do Sul	RS	\N	1983-07-11	2005-08-14	2015-09-15	\N	\N	2026-06-15 20:50:46.117348+00	2026-06-15 21:07:55.86857+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
dd000003-0000-0000-0000-000000000017	10000000-0000-0000-0000-000000000002	Thiago Polesso	Jovem	Visitante	(54) 98801-0023	\N	\N	Caxias do Sul	RS	\N	1998-03-01	\N	2021-11-20	\N	\N	2026-06-15 20:50:46.117348+00	2026-06-15 21:07:55.86857+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
dd000003-0000-0000-0000-000000000008	10000000-0000-0000-0000-000000000002	Vitor Andreatta	Obreiro	Ativo	(54) 98801-0008	\N	\N	Caxias do Sul	RS	\N	1990-02-20	\N	2018-03-07	\N	\N	2026-06-15 20:50:46.117348+00	2026-06-15 21:07:55.86857+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
ff0cafc7-94bc-4bea-a60c-5e93f7fa191a	10000000-0000-0000-0000-000000000002	Pedro Antonio teste	Membro	Ativo	54996842709	dinhogoncalves987@gmail.com	\N	\N	\N	\N	\N	\N	2026-06-16	\N	129a8a20-1e51-4025-9d05-1516e48b188a	2026-06-16 22:04:11.547789+00	2026-06-16 22:04:11.547789+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
5ca26fda-7777-40b9-9882-4cdce9e19aae	10000000-0000-0000-0000-000000000002	Edson G Roquete	Membro	Ativo	54996842709	dinhogoncalves987@gmail.com	Rua Dom Arthur Kratz, 121, Panazzolo, Caxias do Sul, RS	Caxias do Sul	RS	\N	1982-08-19	2023-04-17	2026-05-17	\N	129a8a20-1e51-4025-9d05-1516e48b188a	2026-06-17 14:21:54.516209+00	2026-06-17 15:40:18.270628+00	\N	https://qkiiwopkbcslquyfhdec.supabase.co/storage/v1/object/public/avatars/members/5ca26fda-7777-40b9-9882-4cdce9e19aae.png	Masculino	Casado(a)	03293994970	11105206531	SSP/RS	2017-08-17	54996842709	95080410	Rua Dom Arthur Kratz	121	CASA	Panazzolo	2022-05-12	\N	Valdoir P Roquete	Marlisa G Roquete	Graziela B Francischetti	dd000001-0000-0000-0000-000000000005	dd000002-0000-0000-0000-000000000001	\N	Pendente	\N	\N	\N	\N	\N	\N	\N
ee000030-0000-0000-0000-000000000001	10000000-0000-0000-0000-000000000002	[STAGING] Carlos Teste	Membro	Ativo	(54) 99001-0000	staging.membro.1@ecclesia.test	Rua Staging 1, 10, Centro, Caxias do Sul, RS	Caxias do Sul	RS	\N	1950-01-01	1999-11-01	2000-03-01	[STAGING] Membro fictício #1 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Masculino	Solteiro(a)	001.050.100-01	\N	\N	\N	(54) 99001-0000	95010-001	Rua Staging 1	10	\N	Centro	\N	\N	Pai de Carlos — STAGING	Mãe de Carlos — STAGING	\N	\N	\N	Certidão de nascimento	Pendente	\N	Documentação civil pendente — aguardando apresentação ao secretário.	\N	\N	\N	1999-12-01	\N
ee000030-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000002	[STAGING] Maria Demo	Membro	Ativo	(54) 99002-0001	staging.membro.2@ecclesia.test	Rua Staging 2, 20, Centro, Caxias do Sul, RS	Caxias do Sul	RS	\N	1963-02-02	2000-11-02	2001-03-02	[STAGING] Membro fictício #2 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Feminino	Casado(a)	002.051.101-02	\N	\N	\N	(54) 99002-0001	95010-001	Rua Staging 2	20	\N	Centro	\N	\N	Pai de Maria — STAGING	Mãe de Maria — STAGING	Cônjuge de Maria — STAGING	\N	\N	Certidão de casamento	Apresentado	\N	\N	\N	\N	\N	\N	\N
ee000030-0000-0000-0000-000000000003	10000000-0000-0000-0000-000000000002	[STAGING] João Staging	Membro	Ativo	(54) 99003-0002	staging.membro.3@ecclesia.test	Rua Staging 3, 30, Centro, Caxias do Sul, RS	Caxias do Sul	RS	\N	1976-03-03	2001-11-03	2002-03-03	[STAGING] Membro fictício #3 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Masculino	Casado(a)	003.052.102-03	\N	\N	\N	(54) 99003-0002	95010-001	Rua Staging 3	30	\N	Centro	\N	\N	Pai de João — STAGING	Mãe de João — STAGING	Cônjuge de João — STAGING	\N	\N	Certidão de casamento	Validado	\N	\N	\N	\N	\N	\N	\N
ee000030-0000-0000-0000-000000000004	10000000-0000-0000-0000-000000000002	[STAGING] Juliana Fictício	Membro	Ativo	(54) 99004-0003	staging.membro.4@ecclesia.test	Rua Staging 4, 40, Centro, Caxias do Sul, RS	Caxias do Sul	RS	\N	1989-04-04	2002-11-04	2003-03-04	[STAGING] Membro fictício #4 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Feminino	Divorciado(a)	004.053.103-04	\N	\N	\N	(54) 99004-0003	95010-001	Rua Staging 4	40	\N	Centro	\N	\N	Pai de Juliana — STAGING	Mãe de Juliana — STAGING	\N	\N	\N	Certidão de divórcio	Validado	\N	\N	\N	\N	\N	2002-12-01	\N
ee000030-0000-0000-0000-000000000005	10000000-0000-0000-0000-000000000002	[STAGING] Paulo Simulado	Membro	Inativo	(54) 99005-0004	staging.membro.5@ecclesia.test	Rua Staging 5, 50, Centro, Caxias do Sul, RS	Caxias do Sul	RS	\N	1952-05-05	2003-11-05	2004-03-05	[STAGING] Membro fictício #5 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Masculino	Viúvo(a)	005.054.104-05	\N	\N	\N	(54) 99005-0004	95010-001	Rua Staging 5	50	\N	Centro	\N	\N	Pai de Paulo — STAGING	Mãe de Paulo — STAGING	\N	\N	\N	\N	Rejeitado	\N	Documento apresentado estava ilegível — solicitar reapresentação.	\N	\N	\N	\N	\N
ee000030-0000-0000-0000-000000000006	10000000-0000-0000-0000-000000000002	[STAGING] Camila Teste	Auxiliar	Visitante	(54) 99006-0005	staging.membro.6@ecclesia.test	Rua Staging 6, 60, Centro, Caxias do Sul, RS	Caxias do Sul	RS	\N	1965-06-06	2004-11-06	2005-03-06	[STAGING] Membro fictício #6 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Feminino	Solteiro(a)	006.055.105-06	\N	\N	\N	(54) 99006-0005	95010-001	Rua Staging 6	60	\N	Centro	\N	\N	Pai de Camila — STAGING	Mãe de Camila — STAGING	\N	\N	\N	Certidão de nascimento	Pendente	\N	Documentação civil pendente — aguardando apresentação ao secretário.	\N	\N	\N	\N	2007-06-01
ee000030-0000-0000-0000-000000000007	10000000-0000-0000-0000-000000000002	[STAGING] Felipe Demo	Diácono	Congregado	(54) 99007-0006	staging.membro.7@ecclesia.test	Rua Staging 7, 70, Centro, Caxias do Sul, RS	Caxias do Sul	RS	\N	1978-07-07	2005-11-07	2006-03-07	[STAGING] Membro fictício #7 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Masculino	Casado(a)	007.056.106-07	\N	\N	\N	(54) 99007-0006	95010-001	Rua Staging 7	70	\N	Centro	\N	\N	Pai de Felipe — STAGING	Mãe de Felipe — STAGING	Cônjuge de Felipe — STAGING	\N	\N	Certidão de casamento	Validado	\N	\N	\N	\N	\N	2005-12-01	2008-06-01
ee000030-0000-0000-0000-000000000008	10000000-0000-0000-0000-000000000002	[STAGING] Aline Staging	Presbítero	Em disciplina	(54) 99008-0007	staging.membro.8@ecclesia.test	Rua Staging 8, 80, Centro, Caxias do Sul, RS	Caxias do Sul	RS	\N	1991-08-08	2006-11-08	2007-03-08	[STAGING] Membro fictício #8 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Feminino	Casado(a)	008.057.107-08	\N	\N	\N	(54) 99008-0007	95010-001	Rua Staging 8	80	\N	Centro	\N	\N	Pai de Aline — STAGING	Mãe de Aline — STAGING	Cônjuge de Aline — STAGING	\N	\N	Certidão de casamento	Apresentado	\N	\N	\N	\N	\N	\N	2009-06-01
ee000030-0000-0000-0000-000000000009	10000000-0000-0000-0000-000000000002	[STAGING] Rafael Fictício	Evangelista	Transferido	(54) 99009-0008	staging.membro.9@ecclesia.test	Rua Staging 9, 90, Centro, Caxias do Sul, RS	Caxias do Sul	RS	\N	1954-09-09	2007-11-09	2008-03-09	[STAGING] Membro fictício #9 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Masculino	Solteiro(a)	009.058.108-09	\N	\N	\N	(54) 99009-0008	95010-001	Rua Staging 9	90	\N	Centro	\N	\N	Pai de Rafael — STAGING	Mãe de Rafael — STAGING	\N	\N	\N	Certidão de nascimento	Pendente	\N	Documentação civil pendente — aguardando apresentação ao secretário.	\N	\N	\N	\N	2010-06-01
ee000030-0000-0000-0000-000000000010	10000000-0000-0000-0000-000000000002	[STAGING] Tatiana Simulado	Pastor	Falecido	(54) 99010-0009	staging.membro.10@ecclesia.test	Rua Staging 10, 100, Centro, Caxias do Sul, RS	Caxias do Sul	RS	\N	1967-10-10	2008-11-10	2009-03-10	[STAGING] Membro fictício #10 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Feminino	Divorciado(a)	010.059.109-10	\N	\N	\N	(54) 99010-0009	95010-001	Rua Staging 10	100	\N	Centro	\N	\N	Pai de Tatiana — STAGING	Mãe de Tatiana — STAGING	\N	\N	\N	Certidão de divórcio	Validado	\N	\N	\N	\N	\N	2008-12-01	2011-06-01
ee000030-0000-0000-0000-000000000011	10000000-0000-0000-0000-000000000002	[STAGING] Eduardo Teste	Membro	Ativo	(54) 99011-0010	staging.membro.11@ecclesia.test	Rua Staging 11, 110, Centro, Caxias do Sul, RS	Caxias do Sul	RS	\N	1980-11-11	2009-11-11	2010-03-11	[STAGING] Membro fictício #11 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Masculino	Solteiro(a)	011.060.110-11	\N	\N	\N	(54) 99011-0010	95010-001	Rua Staging 11	110	\N	Centro	\N	\N	Pai de Eduardo — STAGING	Mãe de Eduardo — STAGING	\N	ee000010-0000-0000-0000-000000000001	\N	Certidão de nascimento	Pendente	\N	Documentação civil pendente — aguardando apresentação ao secretário.	\N	\N	\N	\N	\N
ee000030-0000-0000-0000-000000000012	10000000-0000-0000-0000-000000000002	[STAGING] Bruna Demo	Membro	Ativo	(54) 99012-0011	staging.membro.12@ecclesia.test	Rua Staging 12, 120, Centro, Caxias do Sul, RS	Caxias do Sul	RS	\N	1993-12-12	2010-11-12	2011-03-12	[STAGING] Membro fictício #12 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Feminino	Casado(a)	012.061.111-12	\N	\N	\N	(54) 99012-0011	95010-001	Rua Staging 12	120	\N	Centro	\N	\N	Pai de Bruna — STAGING	Mãe de Bruna — STAGING	Cônjuge de Bruna — STAGING	ee000010-0000-0000-0000-000000000001	\N	Certidão de casamento	Apresentado	\N	\N	\N	\N	\N	\N	\N
ee000030-0000-0000-0000-000000000013	10000000-0000-0000-0000-000000000002	[STAGING] Bruno Staging	Membro	Ativo	(54) 99013-0012	staging.membro.13@ecclesia.test	Rua Staging 13, 130, Centro, Caxias do Sul, RS	Caxias do Sul	RS	\N	1956-01-13	2011-11-13	2012-03-13	[STAGING] Membro fictício #13 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Masculino	Casado(a)	013.062.112-13	\N	\N	\N	(54) 99013-0012	95010-001	Rua Staging 13	130	\N	Centro	\N	\N	Pai de Bruno — STAGING	Mãe de Bruno — STAGING	Cônjuge de Bruno — STAGING	ee000010-0000-0000-0000-000000000001	\N	Certidão de casamento	Validado	\N	\N	\N	\N	\N	2011-12-01	\N
ee000030-0000-0000-0000-000000000014	10000000-0000-0000-0000-000000000002	[STAGING] Caroline Fictício	Membro	Ativo	(54) 99014-0013	staging.membro.14@ecclesia.test	Rua Staging 14, 140, Centro, Caxias do Sul, RS	Caxias do Sul	RS	\N	1969-02-14	2012-11-14	2013-03-14	[STAGING] Membro fictício #14 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Feminino	Divorciado(a)	014.063.113-14	\N	\N	\N	(54) 99014-0013	95010-001	Rua Staging 14	140	\N	Centro	\N	\N	Pai de Caroline — STAGING	Mãe de Caroline — STAGING	\N	ee000010-0000-0000-0000-000000000001	\N	Certidão de divórcio	Validado	\N	\N	\N	\N	\N	\N	\N
ee000030-0000-0000-0000-000000000015	10000000-0000-0000-0000-000000000002	[STAGING] Henrique Simulado	Membro	Inativo	(54) 99015-0014	staging.membro.15@ecclesia.test	Rua Staging 15, 150, Centro, Caxias do Sul, RS	Caxias do Sul	RS	\N	1982-03-15	2013-11-15	2014-03-15	[STAGING] Membro fictício #15 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Masculino	Viúvo(a)	015.064.114-15	\N	\N	\N	(54) 99015-0014	95010-001	Rua Staging 15	150	\N	Centro	\N	Secretário	Pai de Henrique — STAGING	Mãe de Henrique — STAGING	\N	ee000010-0000-0000-0000-000000000001	\N	\N	Rejeitado	\N	Documento apresentado estava ilegível — solicitar reapresentação.	\N	\N	\N	\N	\N
ee000030-0000-0000-0000-000000000016	10000000-0000-0000-0000-000000000002	[STAGING] Natália Teste	Auxiliar	Visitante	(54) 99016-0015	staging.membro.16@ecclesia.test	Rua Staging 16, 160, Centro, Caxias do Sul, RS	Caxias do Sul	RS	\N	1995-04-16	2014-11-16	2015-03-16	[STAGING] Membro fictício #16 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Feminino	Solteiro(a)	016.065.115-16	\N	\N	\N	(54) 99016-0015	95010-001	Rua Staging 16	160	\N	Centro	\N	\N	Pai de Natália — STAGING	Mãe de Natália — STAGING	\N	ee000010-0000-0000-0000-000000000001	\N	Certidão de nascimento	Pendente	\N	Documentação civil pendente — aguardando apresentação ao secretário.	\N	\N	\N	2014-12-01	2017-06-01
ee000030-0000-0000-0000-000000000017	10000000-0000-0000-0000-000000000002	[STAGING] Matheus Demo	Diácono	Congregado	(54) 99017-0016	staging.membro.17@ecclesia.test	Rua Staging 17, 170, Centro, Caxias do Sul, RS	Caxias do Sul	RS	\N	1958-05-17	2015-11-17	2016-03-17	[STAGING] Membro fictício #17 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Masculino	Casado(a)	017.066.116-17	\N	\N	\N	(54) 99017-0016	95010-001	Rua Staging 17	170	\N	Centro	\N	\N	Pai de Matheus — STAGING	Mãe de Matheus — STAGING	Cônjuge de Matheus — STAGING	ee000010-0000-0000-0000-000000000001	\N	Certidão de casamento	Validado	\N	\N	\N	\N	\N	\N	2018-06-01
ee000030-0000-0000-0000-000000000018	10000000-0000-0000-0000-000000000002	[STAGING] Mariana Staging	Presbítero	Em disciplina	(54) 99018-0017	staging.membro.18@ecclesia.test	Rua Staging 18, 180, Centro, Caxias do Sul, RS	Caxias do Sul	RS	\N	1971-06-18	2016-11-18	2017-03-18	[STAGING] Membro fictício #18 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Feminino	Casado(a)	018.067.117-18	\N	\N	\N	(54) 99018-0017	95010-001	Rua Staging 18	180	\N	Centro	\N	\N	Pai de Mariana — STAGING	Mãe de Mariana — STAGING	Cônjuge de Mariana — STAGING	ee000010-0000-0000-0000-000000000001	\N	Certidão de casamento	Apresentado	\N	\N	\N	\N	\N	\N	2019-06-01
ee000030-0000-0000-0000-000000000032	10000000-0000-0000-0000-000000000002	[STAGING] Larissa Demo	Membro	Ativo	(54) 99032-0031	staging.membro.32@ecclesia.test	Rua Staging 32, 320, Bela Vista, Caxias do Sul, RS	Caxias do Sul	RS	\N	1953-08-04	2005-11-04	2006-03-04	[STAGING] Membro fictício #32 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Feminino	Casado(a)	032.081.131-32	\N	\N	\N	(54) 99032-0031	95010-001	Rua Staging 32	320	\N	Bela Vista	\N	\N	Pai de Larissa — STAGING	Mãe de Larissa — STAGING	Cônjuge de Larissa — STAGING	ee000010-0000-0000-0000-000000000001	ee000020-0000-0000-0000-000000000001	Certidão de casamento	Apresentado	\N	\N	\N	\N	\N	\N	\N
ee000030-0000-0000-0000-000000000019	10000000-0000-0000-0000-000000000002	[STAGING] Thiago Fictício	Evangelista	Transferido	(54) 99019-0018	staging.membro.19@ecclesia.test	Rua Staging 19, 190, Centro, Caxias do Sul, RS	Caxias do Sul	RS	\N	1984-07-19	2017-11-19	2018-03-19	[STAGING] Membro fictício #19 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Masculino	Solteiro(a)	019.068.118-19	\N	\N	\N	(54) 99019-0018	95010-001	Rua Staging 19	190	\N	Centro	\N	\N	Pai de Thiago — STAGING	Mãe de Thiago — STAGING	\N	ee000010-0000-0000-0000-000000000001	\N	Certidão de nascimento	Pendente	\N	Documentação civil pendente — aguardando apresentação ao secretário.	\N	\N	\N	2017-12-01	2020-06-01
ee000030-0000-0000-0000-000000000020	10000000-0000-0000-0000-000000000002	[STAGING] Isabela Simulado	Pastor	Falecido	(54) 99020-0019	staging.membro.20@ecclesia.test	Rua Staging 20, 200, Centro, Caxias do Sul, RS	Caxias do Sul	RS	\N	1997-08-20	2018-11-20	2019-03-20	[STAGING] Membro fictício #20 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Feminino	Divorciado(a)	020.069.119-20	\N	\N	\N	(54) 99020-0019	95010-001	Rua Staging 20	200	\N	Centro	\N	Tesoureiro	Pai de Isabela — STAGING	Mãe de Isabela — STAGING	\N	ee000010-0000-0000-0000-000000000001	\N	Certidão de divórcio	Validado	\N	\N	\N	\N	\N	\N	2021-06-01
ee000030-0000-0000-0000-000000000021	10000000-0000-0000-0000-000000000002	[STAGING] Vinícius Teste	Membro	Ativo	(54) 99021-0020	staging.membro.21@ecclesia.test	Rua Staging 21, 210, Centro, Caxias do Sul, RS	Caxias do Sul	RS	\N	1960-09-21	2019-11-21	2020-03-21	[STAGING] Membro fictício #21 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Masculino	Solteiro(a)	021.070.120-21	\N	\N	\N	(54) 99021-0020	95010-001	Rua Staging 21	210	\N	Centro	\N	\N	Pai de Vinícius — STAGING	Mãe de Vinícius — STAGING	\N	ee000010-0000-0000-0000-000000000002	\N	Certidão de nascimento	Pendente	\N	Documentação civil pendente — aguardando apresentação ao secretário.	\N	\N	\N	\N	\N
ee000030-0000-0000-0000-000000000022	10000000-0000-0000-0000-000000000002	[STAGING] Eliane Demo	Membro	Ativo	(54) 99022-0021	staging.membro.22@ecclesia.test	Rua Staging 22, 220, Centro, Caxias do Sul, RS	Caxias do Sul	RS	\N	1973-10-22	2020-11-22	2021-03-22	[STAGING] Membro fictício #22 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Feminino	Casado(a)	022.071.121-22	\N	\N	\N	(54) 99022-0021	95010-001	Rua Staging 22	220	\N	Centro	\N	\N	Pai de Eliane — STAGING	Mãe de Eliane — STAGING	Cônjuge de Eliane — STAGING	ee000010-0000-0000-0000-000000000002	\N	Certidão de casamento	Apresentado	\N	\N	\N	\N	\N	2020-12-01	\N
ee000030-0000-0000-0000-000000000023	10000000-0000-0000-0000-000000000002	[STAGING] Leandro Staging	Membro	Ativo	(54) 99023-0022	staging.membro.23@ecclesia.test	Rua Staging 23, 230, Centro, Caxias do Sul, RS	Caxias do Sul	RS	\N	1986-11-23	2021-11-23	2022-03-23	[STAGING] Membro fictício #23 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Masculino	Casado(a)	023.072.122-23	\N	\N	\N	(54) 99023-0022	95010-001	Rua Staging 23	230	\N	Centro	\N	\N	Pai de Leandro — STAGING	Mãe de Leandro — STAGING	Cônjuge de Leandro — STAGING	ee000010-0000-0000-0000-000000000002	\N	Certidão de casamento	Validado	\N	\N	\N	\N	\N	\N	\N
ee000030-0000-0000-0000-000000000024	10000000-0000-0000-0000-000000000002	[STAGING] Cássia Fictício	Membro	Ativo	(54) 99024-0023	staging.membro.24@ecclesia.test	Rua Staging 24, 240, Centro, Caxias do Sul, RS	Caxias do Sul	RS	\N	1999-12-24	2022-11-24	2023-03-24	[STAGING] Membro fictício #24 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Feminino	Divorciado(a)	024.073.123-24	\N	\N	\N	(54) 99024-0023	95010-001	Rua Staging 24	240	\N	Centro	\N	\N	Pai de Cássia — STAGING	Mãe de Cássia — STAGING	\N	ee000010-0000-0000-0000-000000000002	\N	Certidão de divórcio	Validado	\N	\N	\N	\N	\N	\N	\N
ee000030-0000-0000-0000-000000000025	10000000-0000-0000-0000-000000000002	[STAGING] Fábio Simulado	Membro	Inativo	(54) 99025-0024	staging.membro.25@ecclesia.test	Rua Staging 25, 250, Centro, Caxias do Sul, RS	Caxias do Sul	RS	\N	1962-01-25	2023-11-25	2024-03-25	[STAGING] Membro fictício #25 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Masculino	Viúvo(a)	025.074.124-25	\N	\N	\N	(54) 99025-0024	95010-001	Rua Staging 25	250	\N	Centro	\N	\N	Pai de Fábio — STAGING	Mãe de Fábio — STAGING	\N	ee000010-0000-0000-0000-000000000002	\N	\N	Rejeitado	\N	Documento apresentado estava ilegível — solicitar reapresentação.	\N	\N	\N	2023-12-01	\N
ee000030-0000-0000-0000-000000000026	10000000-0000-0000-0000-000000000002	[STAGING] Ana Teste	Auxiliar	Visitante	(54) 99026-0025	staging.membro.26@ecclesia.test	Rua Staging 26, 260, Bela Vista, Caxias do Sul, RS	Caxias do Sul	RS	\N	1975-02-26	1999-11-26	2000-03-26	[STAGING] Membro fictício #26 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Feminino	Solteiro(a)	026.075.125-26	\N	\N	\N	(54) 99026-0025	95010-001	Rua Staging 26	260	\N	Bela Vista	\N	\N	Pai de Ana — STAGING	Mãe de Ana — STAGING	\N	ee000010-0000-0000-0000-000000000002	\N	Certidão de nascimento	Pendente	\N	Documentação civil pendente — aguardando apresentação ao secretário.	\N	\N	\N	\N	2002-06-01
ee000030-0000-0000-0000-000000000027	10000000-0000-0000-0000-000000000002	[STAGING] Marcos Demo	Diácono	Congregado	(54) 99027-0026	staging.membro.27@ecclesia.test	Rua Staging 27, 270, Bela Vista, Caxias do Sul, RS	Caxias do Sul	RS	\N	1988-03-27	2000-11-27	2001-03-27	[STAGING] Membro fictício #27 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Masculino	Casado(a)	027.076.126-27	\N	\N	\N	(54) 99027-0026	95010-001	Rua Staging 27	270	\N	Bela Vista	\N	\N	Pai de Marcos — STAGING	Mãe de Marcos — STAGING	Cônjuge de Marcos — STAGING	ee000010-0000-0000-0000-000000000002	\N	Certidão de casamento	Validado	\N	\N	\N	\N	\N	\N	2003-06-01
ee000030-0000-0000-0000-000000000028	10000000-0000-0000-0000-000000000002	[STAGING] Fernanda Staging	Presbítero	Em disciplina	(54) 99028-0027	staging.membro.28@ecclesia.test	Rua Staging 28, 280, Bela Vista, Caxias do Sul, RS	Caxias do Sul	RS	\N	1951-04-28	2001-11-28	2002-03-28	[STAGING] Membro fictício #28 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Feminino	Casado(a)	028.077.127-28	\N	\N	\N	(54) 99028-0027	95010-001	Rua Staging 28	280	\N	Bela Vista	\N	\N	Pai de Fernanda — STAGING	Mãe de Fernanda — STAGING	Cônjuge de Fernanda — STAGING	ee000010-0000-0000-0000-000000000002	\N	Certidão de casamento	Apresentado	\N	\N	\N	\N	\N	2001-12-01	2004-06-01
ee000030-0000-0000-0000-000000000029	10000000-0000-0000-0000-000000000002	[STAGING] Pedro Fictício	Evangelista	Transferido	(54) 99029-0028	staging.membro.29@ecclesia.test	Rua Staging 29, 290, Bela Vista, Caxias do Sul, RS	Caxias do Sul	RS	\N	1964-05-01	2002-11-01	2003-03-01	[STAGING] Membro fictício #29 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Masculino	Solteiro(a)	029.078.128-29	\N	\N	\N	(54) 99029-0028	95010-001	Rua Staging 29	290	\N	Bela Vista	\N	\N	Pai de Pedro — STAGING	Mãe de Pedro — STAGING	\N	ee000010-0000-0000-0000-000000000002	\N	Certidão de nascimento	Pendente	\N	Documentação civil pendente — aguardando apresentação ao secretário.	\N	\N	\N	\N	2005-06-01
ee000030-0000-0000-0000-000000000030	10000000-0000-0000-0000-000000000002	[STAGING] Patrícia Simulado	Pastor	Falecido	(54) 99030-0029	staging.membro.30@ecclesia.test	Rua Staging 30, 300, Bela Vista, Caxias do Sul, RS	Caxias do Sul	RS	\N	1977-06-02	2003-11-02	2004-03-02	[STAGING] Membro fictício #30 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Feminino	Divorciado(a)	030.079.129-30	\N	\N	\N	(54) 99030-0029	95010-001	Rua Staging 30	300	\N	Bela Vista	\N	\N	Pai de Patrícia — STAGING	Mãe de Patrícia — STAGING	\N	ee000010-0000-0000-0000-000000000002	\N	Certidão de divórcio	Validado	\N	\N	\N	\N	\N	\N	2006-06-01
ee000030-0000-0000-0000-000000000031	10000000-0000-0000-0000-000000000002	[STAGING] André Teste	Membro	Ativo	(54) 99031-0030	staging.membro.31@ecclesia.test	Rua Staging 31, 310, Bela Vista, Caxias do Sul, RS	Caxias do Sul	RS	\N	1990-07-03	2004-11-03	2005-03-03	[STAGING] Membro fictício #31 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Masculino	Solteiro(a)	031.080.130-31	\N	\N	\N	(54) 99031-0030	95010-001	Rua Staging 31	310	\N	Bela Vista	\N	\N	Pai de André — STAGING	Mãe de André — STAGING	\N	ee000010-0000-0000-0000-000000000001	ee000020-0000-0000-0000-000000000001	Certidão de nascimento	Pendente	\N	Documentação civil pendente — aguardando apresentação ao secretário.	\N	\N	\N	2004-12-01	\N
ee000030-0000-0000-0000-000000000033	10000000-0000-0000-0000-000000000002	[STAGING] Lucas Staging	Membro	Ativo	(54) 99033-0032	staging.membro.33@ecclesia.test	Rua Staging 33, 330, Bela Vista, Caxias do Sul, RS	Caxias do Sul	RS	\N	1966-09-05	2006-11-05	2007-03-05	[STAGING] Membro fictício #33 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Masculino	Casado(a)	033.082.132-33	\N	\N	\N	(54) 99033-0032	95010-001	Rua Staging 33	330	\N	Bela Vista	\N	\N	Pai de Lucas — STAGING	Mãe de Lucas — STAGING	Cônjuge de Lucas — STAGING	ee000010-0000-0000-0000-000000000001	ee000020-0000-0000-0000-000000000001	Certidão de casamento	Validado	\N	\N	\N	\N	\N	\N	\N
ee000030-0000-0000-0000-000000000034	10000000-0000-0000-0000-000000000002	[STAGING] Renata Fictício	Membro	Ativo	(54) 99034-0033	staging.membro.34@ecclesia.test	Rua Staging 34, 340, Bela Vista, Caxias do Sul, RS	Caxias do Sul	RS	\N	1979-10-06	2007-11-06	2008-03-06	[STAGING] Membro fictício #34 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Feminino	Divorciado(a)	034.083.133-34	\N	\N	\N	(54) 99034-0033	95010-001	Rua Staging 34	340	\N	Bela Vista	\N	\N	Pai de Renata — STAGING	Mãe de Renata — STAGING	\N	ee000010-0000-0000-0000-000000000001	ee000020-0000-0000-0000-000000000001	Certidão de divórcio	Validado	\N	\N	\N	\N	\N	2007-12-01	\N
ee000030-0000-0000-0000-000000000035	10000000-0000-0000-0000-000000000002	[STAGING] Rodrigo Simulado	Membro	Inativo	(54) 99035-0034	staging.membro.35@ecclesia.test	Rua Staging 35, 350, Bela Vista, Caxias do Sul, RS	Caxias do Sul	RS	\N	1992-11-07	2008-11-07	2009-03-07	[STAGING] Membro fictício #35 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Masculino	Viúvo(a)	035.084.134-35	\N	\N	\N	(54) 99035-0034	95010-001	Rua Staging 35	350	\N	Bela Vista	\N	Secretário	Pai de Rodrigo — STAGING	Mãe de Rodrigo — STAGING	\N	ee000010-0000-0000-0000-000000000001	ee000020-0000-0000-0000-000000000001	\N	Rejeitado	\N	Documento apresentado estava ilegível — solicitar reapresentação.	\N	\N	\N	\N	\N
ee000030-0000-0000-0000-000000000036	10000000-0000-0000-0000-000000000002	[STAGING] Vanessa Teste	Auxiliar	Visitante	(54) 99036-0035	staging.membro.36@ecclesia.test	Rua Staging 36, 360, Bela Vista, Caxias do Sul, RS	Caxias do Sul	RS	\N	1955-12-08	2009-11-08	2010-03-08	[STAGING] Membro fictício #36 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Feminino	Solteiro(a)	036.085.135-36	\N	\N	\N	(54) 99036-0035	95010-001	Rua Staging 36	360	\N	Bela Vista	\N	\N	Pai de Vanessa — STAGING	Mãe de Vanessa — STAGING	\N	ee000010-0000-0000-0000-000000000001	ee000020-0000-0000-0000-000000000001	Certidão de nascimento	Pendente	\N	Documentação civil pendente — aguardando apresentação ao secretário.	\N	\N	\N	\N	2012-06-01
ee000030-0000-0000-0000-000000000037	10000000-0000-0000-0000-000000000002	[STAGING] Gustavo Demo	Diácono	Congregado	(54) 99037-0036	staging.membro.37@ecclesia.test	Rua Staging 37, 370, Bela Vista, Caxias do Sul, RS	Caxias do Sul	RS	\N	1968-01-09	2010-11-09	2011-03-09	[STAGING] Membro fictício #37 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Masculino	Casado(a)	037.086.136-37	\N	\N	\N	(54) 99037-0036	95010-001	Rua Staging 37	370	\N	Bela Vista	\N	\N	Pai de Gustavo — STAGING	Mãe de Gustavo — STAGING	Cônjuge de Gustavo — STAGING	ee000010-0000-0000-0000-000000000001	ee000020-0000-0000-0000-000000000001	Certidão de casamento	Validado	\N	\N	\N	\N	\N	2010-12-01	2013-06-01
ee000030-0000-0000-0000-000000000038	10000000-0000-0000-0000-000000000002	[STAGING] Amanda Staging	Presbítero	Em disciplina	(54) 99038-0037	staging.membro.38@ecclesia.test	Rua Staging 38, 380, Bela Vista, Caxias do Sul, RS	Caxias do Sul	RS	\N	1981-02-10	2011-11-10	2012-03-10	[STAGING] Membro fictício #38 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Feminino	Casado(a)	038.087.137-38	\N	\N	\N	(54) 99038-0037	95010-001	Rua Staging 38	380	\N	Bela Vista	\N	\N	Pai de Amanda — STAGING	Mãe de Amanda — STAGING	Cônjuge de Amanda — STAGING	ee000010-0000-0000-0000-000000000001	ee000020-0000-0000-0000-000000000001	Certidão de casamento	Apresentado	\N	\N	\N	\N	\N	\N	2014-06-01
ee000030-0000-0000-0000-000000000039	10000000-0000-0000-0000-000000000002	[STAGING] Daniel Fictício	Evangelista	Transferido	(54) 99039-0038	staging.membro.39@ecclesia.test	Rua Staging 39, 390, Bela Vista, Caxias do Sul, RS	Caxias do Sul	RS	\N	1994-03-11	2012-11-11	2013-03-11	[STAGING] Membro fictício #39 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Masculino	Solteiro(a)	039.088.138-39	\N	\N	\N	(54) 99039-0038	95010-001	Rua Staging 39	390	\N	Bela Vista	\N	\N	Pai de Daniel — STAGING	Mãe de Daniel — STAGING	\N	ee000010-0000-0000-0000-000000000001	ee000020-0000-0000-0000-000000000001	Certidão de nascimento	Pendente	\N	Documentação civil pendente — aguardando apresentação ao secretário.	\N	\N	\N	\N	2015-06-01
ee000030-0000-0000-0000-000000000040	10000000-0000-0000-0000-000000000002	[STAGING] Priscila Simulado	Pastor	Falecido	(54) 99040-0039	staging.membro.40@ecclesia.test	Rua Staging 40, 400, Bela Vista, Caxias do Sul, RS	Caxias do Sul	RS	\N	1957-04-12	2013-11-12	2014-03-12	[STAGING] Membro fictício #40 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Feminino	Divorciado(a)	040.089.139-40	\N	\N	\N	(54) 99040-0039	95010-001	Rua Staging 40	400	\N	Bela Vista	\N	Tesoureiro	Pai de Priscila — STAGING	Mãe de Priscila — STAGING	\N	ee000010-0000-0000-0000-000000000001	ee000020-0000-0000-0000-000000000001	Certidão de divórcio	Validado	\N	\N	\N	\N	\N	2013-12-01	2016-06-01
ee000030-0000-0000-0000-000000000041	10000000-0000-0000-0000-000000000002	[STAGING] Leonardo Teste	Membro	Ativo	(54) 99041-0040	staging.membro.41@ecclesia.test	Rua Staging 41, 410, Bela Vista, Caxias do Sul, RS	Caxias do Sul	RS	\N	1970-05-13	2014-11-13	2015-03-13	[STAGING] Membro fictício #41 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Masculino	Solteiro(a)	041.090.140-41	\N	\N	\N	(54) 99041-0040	95010-001	Rua Staging 41	410	\N	Bela Vista	\N	\N	Pai de Leonardo — STAGING	Mãe de Leonardo — STAGING	\N	ee000010-0000-0000-0000-000000000002	ee000020-0000-0000-0000-000000000002	Certidão de nascimento	Pendente	\N	Documentação civil pendente — aguardando apresentação ao secretário.	\N	\N	\N	\N	\N
ee000030-0000-0000-0000-000000000042	10000000-0000-0000-0000-000000000002	[STAGING] Daniela Demo	Membro	Ativo	(54) 99042-0041	staging.membro.42@ecclesia.test	Rua Staging 42, 420, Bela Vista, Caxias do Sul, RS	Caxias do Sul	RS	\N	1983-06-14	2015-11-14	2016-03-14	[STAGING] Membro fictício #42 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Feminino	Casado(a)	042.091.141-42	\N	\N	\N	(54) 99042-0041	95010-001	Rua Staging 42	420	\N	Bela Vista	\N	\N	Pai de Daniela — STAGING	Mãe de Daniela — STAGING	Cônjuge de Daniela — STAGING	ee000010-0000-0000-0000-000000000002	ee000020-0000-0000-0000-000000000002	Certidão de casamento	Apresentado	\N	\N	\N	\N	\N	\N	\N
ee000030-0000-0000-0000-000000000043	10000000-0000-0000-0000-000000000002	[STAGING] Gabriel Staging	Membro	Ativo	(54) 99043-0042	staging.membro.43@ecclesia.test	Rua Staging 43, 430, Bela Vista, Caxias do Sul, RS	Caxias do Sul	RS	\N	1996-07-15	2016-11-15	2017-03-15	[STAGING] Membro fictício #43 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Masculino	Casado(a)	043.092.142-43	\N	\N	\N	(54) 99043-0042	95010-001	Rua Staging 43	430	\N	Bela Vista	\N	\N	Pai de Gabriel — STAGING	Mãe de Gabriel — STAGING	Cônjuge de Gabriel — STAGING	ee000010-0000-0000-0000-000000000002	ee000020-0000-0000-0000-000000000002	Certidão de casamento	Validado	\N	\N	\N	\N	\N	2016-12-01	\N
ee000030-0000-0000-0000-000000000044	10000000-0000-0000-0000-000000000002	[STAGING] Letícia Fictício	Membro	Ativo	(54) 99044-0043	staging.membro.44@ecclesia.test	Rua Staging 44, 440, Bela Vista, Caxias do Sul, RS	Caxias do Sul	RS	\N	1959-08-16	2017-11-16	2018-03-16	[STAGING] Membro fictício #44 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Feminino	Divorciado(a)	044.093.143-44	\N	\N	\N	(54) 99044-0043	95010-001	Rua Staging 44	440	\N	Bela Vista	\N	\N	Pai de Letícia — STAGING	Mãe de Letícia — STAGING	\N	ee000010-0000-0000-0000-000000000002	ee000020-0000-0000-0000-000000000002	Certidão de divórcio	Validado	\N	\N	\N	\N	\N	\N	\N
ee000030-0000-0000-0000-000000000045	10000000-0000-0000-0000-000000000002	[STAGING] Diego Simulado	Membro	Inativo	(54) 99045-0044	staging.membro.45@ecclesia.test	Rua Staging 45, 450, Bela Vista, Caxias do Sul, RS	Caxias do Sul	RS	\N	1972-09-17	2018-11-17	2019-03-17	[STAGING] Membro fictício #45 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Masculino	Viúvo(a)	045.094.144-45	\N	\N	\N	(54) 99045-0044	95010-001	Rua Staging 45	450	\N	Bela Vista	\N	\N	Pai de Diego — STAGING	Mãe de Diego — STAGING	\N	ee000010-0000-0000-0000-000000000002	ee000020-0000-0000-0000-000000000002	\N	Rejeitado	\N	Documento apresentado estava ilegível — solicitar reapresentação.	\N	\N	\N	\N	\N
ee000030-0000-0000-0000-000000000046	10000000-0000-0000-0000-000000000002	[STAGING] Viviane Teste	Auxiliar	Visitante	(54) 99046-0045	staging.membro.46@ecclesia.test	Rua Staging 46, 460, Bela Vista, Caxias do Sul, RS	Caxias do Sul	RS	\N	1985-10-18	2019-11-18	2020-03-18	[STAGING] Membro fictício #46 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Feminino	Solteiro(a)	046.095.145-46	\N	\N	\N	(54) 99046-0045	95010-001	Rua Staging 46	460	\N	Bela Vista	\N	\N	Pai de Viviane — STAGING	Mãe de Viviane — STAGING	\N	ee000010-0000-0000-0000-000000000002	ee000020-0000-0000-0000-000000000002	Certidão de nascimento	Pendente	\N	Documentação civil pendente — aguardando apresentação ao secretário.	\N	\N	\N	2019-12-01	2022-06-01
ee000030-0000-0000-0000-000000000047	10000000-0000-0000-0000-000000000002	[STAGING] Igor Demo	Diácono	Congregado	(54) 99047-0046	staging.membro.47@ecclesia.test	Rua Staging 47, 470, Bela Vista, Caxias do Sul, RS	Caxias do Sul	RS	\N	1998-11-19	2020-11-19	2021-03-19	[STAGING] Membro fictício #47 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Masculino	Casado(a)	047.096.146-47	\N	\N	\N	(54) 99047-0046	95010-001	Rua Staging 47	470	\N	Bela Vista	\N	\N	Pai de Igor — STAGING	Mãe de Igor — STAGING	Cônjuge de Igor — STAGING	ee000010-0000-0000-0000-000000000002	ee000020-0000-0000-0000-000000000002	Certidão de casamento	Validado	\N	\N	\N	\N	\N	\N	2023-06-01
ee000030-0000-0000-0000-000000000048	10000000-0000-0000-0000-000000000002	[STAGING] Sandra Staging	Presbítero	Em disciplina	(54) 99048-0047	staging.membro.48@ecclesia.test	Rua Staging 48, 480, Bela Vista, Caxias do Sul, RS	Caxias do Sul	RS	\N	1961-12-20	2021-11-20	2022-03-20	[STAGING] Membro fictício #48 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Feminino	Casado(a)	048.097.147-48	\N	\N	\N	(54) 99048-0047	95010-001	Rua Staging 48	480	\N	Bela Vista	\N	\N	Pai de Sandra — STAGING	Mãe de Sandra — STAGING	Cônjuge de Sandra — STAGING	ee000010-0000-0000-0000-000000000002	ee000020-0000-0000-0000-000000000002	Certidão de casamento	Apresentado	\N	\N	\N	\N	\N	\N	2024-06-01
ee000030-0000-0000-0000-000000000049	10000000-0000-0000-0000-000000000002	[STAGING] Caio Fictício	Evangelista	Transferido	(54) 99049-0048	staging.membro.49@ecclesia.test	Rua Staging 49, 490, Bela Vista, Caxias do Sul, RS	Caxias do Sul	RS	\N	1974-01-21	2022-11-21	2023-03-21	[STAGING] Membro fictício #49 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Masculino	Solteiro(a)	049.098.148-49	\N	\N	\N	(54) 99049-0048	95010-001	Rua Staging 49	490	\N	Bela Vista	\N	\N	Pai de Caio — STAGING	Mãe de Caio — STAGING	\N	ee000010-0000-0000-0000-000000000002	ee000020-0000-0000-0000-000000000002	Certidão de nascimento	Pendente	\N	Documentação civil pendente — aguardando apresentação ao secretário.	\N	\N	\N	2022-12-01	2025-06-01
ee000030-0000-0000-0000-000000000050	10000000-0000-0000-0000-000000000002	[STAGING] Helena Simulado	Pastor	Falecido	(54) 99050-0049	staging.membro.50@ecclesia.test	Rua Staging 50, 500, Bela Vista, Caxias do Sul, RS	Caxias do Sul	RS	\N	1987-02-22	2023-11-22	2024-03-22	[STAGING] Membro fictício #50 para testes. Não representa pessoa real.	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	2026-06-22 23:45:21.469007+00	2026-06-22 23:45:21.469007+00	\N	\N	Feminino	Divorciado(a)	050.099.149-50	\N	\N	\N	(54) 99050-0049	95010-001	Rua Staging 50	500	\N	Bela Vista	\N	\N	Pai de Helena — STAGING	Mãe de Helena — STAGING	\N	ee000010-0000-0000-0000-000000000002	ee000020-0000-0000-0000-000000000002	Certidão de divórcio	Validado	\N	\N	\N	\N	\N	\N	2026-06-01
\.


--
-- Data for Name: organization_affiliations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.organization_affiliations (id, organization_id, affiliated_organization_id, affiliation_type, name, description, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: organization_hierarchy_rules; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.organization_hierarchy_rules (id, parent_type, child_type, is_active, description, created_at, updated_at) FROM stdin;
997cd049-f710-4391-afcf-7dd01c15de03	international_convention	national_convention	t	Internacional → Nacional (ex: Restauração Internacional → AD Brasil)	2026-06-26 06:01:49.421822+00	2026-06-26 06:01:49.421822+00
c124198f-f162-4606-a91e-1d6997462e19	international_convention	state_convention	t	Internacional → Estadual (missões em estados/províncias)	2026-06-26 06:01:49.421822+00	2026-06-26 06:01:49.421822+00
1bfb0c75-6e05-4cd0-bc3b-a47b95f72800	international_convention	convencao	t	Internacional → Convenção legada (compatibilidade)	2026-06-26 06:01:49.421822+00	2026-06-26 06:01:49.421822+00
86a640e5-0519-4931-9380-242bb3781c5b	international_convention	matriz	t	Internacional → Matriz direta (campo missionário simples)	2026-06-26 06:01:49.421822+00	2026-06-26 06:01:49.421822+00
c9277955-1dbe-47d7-b540-161f4bed7192	international_convention	sede	t	Internacional → Sede direta (escritório regional)	2026-06-26 06:01:49.421822+00	2026-06-26 06:01:49.421822+00
93f2f2ce-911a-4f28-9256-ee83d80c1d5a	national_convention	state_convention	t	Nacional → Convenção Estadual (ex: CGADB → CIEPADERGS)	2026-06-26 06:01:49.421822+00	2026-06-26 06:01:49.421822+00
8a6369a7-1076-46aa-b922-7a78bc5028ba	national_convention	convencao	t	Nacional → Convenção legada (compatibilidade)	2026-06-26 06:01:49.421822+00	2026-06-26 06:01:49.421822+00
358e661a-5f49-4874-89fa-7c3e036e960d	national_convention	matriz	t	Nacional → Matriz direta (sem convenção estadual formal)	2026-06-26 06:01:49.421822+00	2026-06-26 06:01:49.421822+00
5378d771-6fd4-4eb0-a26a-7c16a5590ae0	national_convention	sede	t	Nacional → Sede direta (sem convenção estadual formal)	2026-06-26 06:01:49.421822+00	2026-06-26 06:01:49.421822+00
2cfd026e-cd89-4628-ac74-ede127663da3	state_convention	matriz	t	Estadual → Matriz Municipal	2026-06-26 06:01:49.421822+00	2026-06-26 06:01:49.421822+00
41e18640-32e5-4de1-9fff-bf23fa6cbe5e	state_convention	sede	t	Estadual → Sede	2026-06-26 06:01:49.421822+00	2026-06-26 06:01:49.421822+00
ac750f52-d2f2-49dd-975a-c02cb95d1748	convencao	matriz	t	Convenção legada → Matriz (compatibilidade)	2026-06-26 06:01:49.421822+00	2026-06-26 06:01:49.421822+00
8fff19dc-a7da-4253-bdf5-e0dd82122419	convencao	sede	t	Convenção legada → Sede (compatibilidade)	2026-06-26 06:01:49.421822+00	2026-06-26 06:01:49.421822+00
6557f2d7-cb37-4b1c-99dc-ec3b5a06799a	matriz	setor	t	Matriz → Setor / Distrito	2026-06-26 06:01:49.421822+00	2026-06-26 06:01:49.421822+00
351fe35f-b5db-4d11-b910-4f38e28f9bfa	matriz	congregacao	t	Matriz → Congregação direta (sem setor)	2026-06-26 06:01:49.421822+00	2026-06-26 06:01:49.421822+00
eb095481-20a4-4619-a1bf-685c077ca8f4	sede	setor	t	Sede → Setor / Distrito	2026-06-26 06:01:49.421822+00	2026-06-26 06:01:49.421822+00
9af84920-528c-4f9e-af0f-ad75823ac85b	sede	congregacao	t	Sede → Congregação direta (sem setor)	2026-06-26 06:01:49.421822+00	2026-06-26 06:01:49.421822+00
7272149e-ade4-4a38-9d90-e5edec6bb41f	setor	congregacao	t	Setor → Congregação	2026-06-26 06:01:49.421822+00	2026-06-26 06:01:49.421822+00
\.


--
-- Data for Name: organization_responsibles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.organization_responsibles (id, organization_id, responsibility_type, user_id, assigned_by, assigned_at, is_active, notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: organization_users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.organization_users (id, organization_id, user_id, role, is_active, created_at, updated_at) FROM stdin;
e3e5a8b8-7688-4234-91ed-d6fba2dad2fb	00000000-0000-0000-0000-0000000000a1	00000000-0000-0000-0000-00000000b001	super_admin	t	2026-05-13 03:17:18.686064+00	2026-05-13 03:17:18.686064+00
a8b0dbee-392a-4640-83d7-cec9fa34dd6b	00000000-0000-0000-0000-0000000000b1	00000000-0000-0000-0000-00000000b001	super_admin	t	2026-05-13 03:17:18.686064+00	2026-05-13 03:17:18.686064+00
cff5f1f3-a62b-488b-b17d-88161d2a8f96	00000000-0000-0000-0000-0000000000a1	00000000-0000-0000-0000-00000000b002	platform_admin	t	2026-05-13 03:17:18.686064+00	2026-05-13 03:17:18.686064+00
af886882-507b-4c4a-b645-8536f477333c	00000000-0000-0000-0000-0000000000b1	00000000-0000-0000-0000-00000000b002	platform_admin	t	2026-05-13 03:17:18.686064+00	2026-05-13 03:17:18.686064+00
12061157-7af0-4f7a-ac4e-cd33c928b47e	00000000-0000-0000-0000-0000000000a1	00000000-0000-0000-0000-00000000b003	church_admin	t	2026-05-13 03:17:18.686064+00	2026-05-13 03:17:18.686064+00
f94ac473-74a4-46dc-9d9c-e5cb0a8f8d84	00000000-0000-0000-0000-0000000000a1	00000000-0000-0000-0000-00000000b004	tesoureiro	t	2026-05-13 03:17:18.686064+00	2026-05-13 03:17:18.686064+00
3a988710-a70a-4cfc-96f0-1e18947feb8b	00000000-0000-0000-0000-0000000000a1	00000000-0000-0000-0000-00000000b005	contador	t	2026-05-13 03:17:18.686064+00	2026-05-13 03:17:18.686064+00
a89c1d2c-0efb-4442-a719-7d75250136bd	00000000-0000-0000-0000-0000000000a1	00000000-0000-0000-0000-00000000b006	pastor	t	2026-05-13 03:17:18.686064+00	2026-05-13 03:17:18.686064+00
639af8ca-cbdf-4890-b6ac-55712ff1b965	00000000-0000-0000-0000-0000000000a1	00000000-0000-0000-0000-00000000b007	secretary	t	2026-05-13 03:17:18.686064+00	2026-05-13 03:17:18.686064+00
e73e2988-9740-4c49-b131-c124c5136cf6	00000000-0000-0000-0000-0000000000a1	00000000-0000-0000-0000-00000000b008	leader	t	2026-05-13 03:17:18.686064+00	2026-05-13 03:17:18.686064+00
c10d5561-a0ca-4c07-8563-99da43a4ce45	00000000-0000-0000-0000-0000000000a1	00000000-0000-0000-0000-00000000b009	member	t	2026-05-13 03:17:18.686064+00	2026-05-13 03:17:18.686064+00
dfa6faa9-a8ab-42bc-9268-a8a1a05ffe90	00000000-0000-0000-0000-0000000000a1	df9a9fbf-74bf-4349-8105-5d53e91bbed4	member	t	2026-05-18 21:26:17.333952+00	2026-05-18 21:26:17.333952+00
cca683a8-60d4-401e-9533-97d5b01771cf	d4fb8a81-e301-42ae-8ba6-f8b2aa026278	c4454857-75a7-4b38-92ee-104dca931fe3	church_admin	t	2026-05-21 21:02:42.219824+00	2026-05-21 21:02:42.219824+00
e32b87b2-bfac-4d53-92a1-73967d1fa19e	10000000-0000-0000-0000-000000000001	19a640de-eea1-4c89-8167-54c2ca1ccee4	church_admin	t	2026-05-21 21:31:08.492571+00	2026-05-21 21:31:08.492571+00
02afd343-521c-43c4-94a6-f917408e9a02	10000000-0000-0000-0000-000000000003	6966fdaf-06e4-47f5-a75a-5116d52c4612	church_admin	t	2026-05-21 21:31:27.42263+00	2026-05-21 21:31:27.42263+00
0cd61bf3-cbaa-424f-af44-143f72e359f5	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	church_admin	t	2026-05-21 21:31:18.444901+00	2026-06-17 17:46:23.566185+00
d7ed92c0-abdb-4210-bcd4-ab228a54cde0	10000000-0000-0000-0000-000000000002	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	church_admin	t	2026-06-22 23:45:21.056232+00	2026-06-22 23:45:21.056232+00
6cb65376-a1fb-41ba-bee1-84803b39993a	10000000-0000-0000-0000-000000000002	d1a700c8-df40-4f5e-8657-52ce6237fdb7	secretary	t	2026-06-22 23:45:21.056232+00	2026-06-22 23:45:21.056232+00
40590cbb-b4ac-4b94-b020-3645e789b8ae	10000000-0000-0000-0000-000000000002	ceca19f8-eb06-4f8b-8b6f-a511985498cb	tesoureiro	t	2026-06-22 23:45:21.056232+00	2026-06-22 23:45:21.056232+00
26e87de8-6ce8-46c6-b7db-93322b4d2d93	ee000010-0000-0000-0000-000000000001	2354ec77-5053-4263-8aba-88ad05aa01f0	church_admin	t	2026-06-22 23:45:21.056232+00	2026-06-22 23:45:21.056232+00
30f93821-e542-4163-b2dd-c9d2f55217e4	ee000010-0000-0000-0000-000000000001	930a166e-9120-4a32-9dab-16272a425d6b	secretary	t	2026-06-22 23:45:21.056232+00	2026-06-22 23:45:21.056232+00
4898e134-0772-4422-ab83-4937577e228b	ee000020-0000-0000-0000-000000000001	ea1868ff-7a23-49bc-8f62-c07d41833397	church_admin	t	2026-06-22 23:45:21.056232+00	2026-06-22 23:45:21.056232+00
9ed3e0b2-27c1-4805-9dd6-03af15364ec9	ee000020-0000-0000-0000-000000000001	05c9bc33-7cb7-4415-b228-f36635d7c52e	secretary	t	2026-06-22 23:45:21.056232+00	2026-06-22 23:45:21.056232+00
753ac4c1-45c6-4b6e-84ca-9e8ad7c53cd1	ee000020-0000-0000-0000-000000000001	1eebd10a-e9b5-433b-9b50-b37996a10dbc	member	t	2026-06-22 23:45:21.056232+00	2026-06-22 23:45:21.056232+00
11f39f73-98fc-454b-9bb6-c84557926238	ee000020-0000-0000-0000-000000000001	19421aff-207e-4f42-8dfc-c454d18e8cd6	member	t	2026-06-22 23:45:21.056232+00	2026-06-22 23:45:21.056232+00
4d67f759-d1e3-489f-b599-36a744c6dacb	00000000-0000-0000-0000-0000000000a1	6a15e7f4-86c0-4f9c-b923-55faa0cbbd8e	member	f	2026-05-18 21:36:00.871251+00	2026-06-29 15:04:55.620362+00
9fba2d72-6698-458c-af61-63e14debab61	10000000-0000-0000-0000-000000000002	0f30d31a-27a8-40e1-ba0f-f8ef42f0666f	church_admin	f	2026-05-14 17:39:30.37263+00	2026-06-29 15:04:55.620362+00
\.


--
-- Data for Name: organizations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.organizations (id, parent_id, name, slug, organization_type, city, state, country_code, language_code, email, phone, logo_url, active, created_at, updated_at, unit_status, denomination_type, hierarchy_model, top_level_label, top_level_label_plural, municipal_level_label, municipal_level_label_plural, intermediate_level_label, intermediate_level_label_plural, local_unit_label, local_unit_label_plural, uses_convention_level, uses_municipal_level, uses_intermediate_level, uses_local_units, zip_code, street, address_number, address_complement, neighborhood, website_url, has_operational_cashbox, is_financially_autonomous, financially_consolidates_to_id, cnpj, financial_policy_notes) FROM stdin;
00000000-0000-0000-0000-0000000000a1	\N	RLS Organizacao A	rls-org-a	matriz	Sao Paulo	SP	BR	pt-BR	\N	\N	\N	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
00000000-0000-0000-0000-0000000000b1	\N	RLS Organizacao B	rls-org-b	matriz	Rio de Janeiro	RJ	BR	pt-BR	\N	\N	\N	t	2026-05-13 00:55:05.875172+00	2026-05-13 00:55:05.875172+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
d4fb8a81-e301-42ae-8ba6-f8b2aa026278	00000000-0000-0000-0000-0000000000a1	Edson Goncalves	edson-goncalves-mp5son7n	setor	Caxias do Sul	RS	BR	pt-BR	dinhogoncalves987@gmail.com	54996842709	\N	t	2026-05-14 18:01:17.621546+00	2026-05-14 18:01:17.621546+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
a26456f5-9140-438c-9bd3-755ac06bf804	00000000-0000-0000-0000-0000000000a1	edson g roquete	edson-g-roquete-mp5spplk	setor	Caxias do Sul	RS	BR	pt-BR	dinhoroquete@gmail.com	54996842709	\N	t	2026-05-14 18:02:07.592224+00	2026-05-14 18:02:07.592224+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
659de9d8-8220-4349-b606-67037f2fd7ab	00000000-0000-0000-0000-0000000000a1	Paulo Guedes	paulo-guedes-mpbq70yb	setor	Caxias do Sul	RS	BR	pt-BR	celeiroglobal@gmail.com	54996842709	\N	t	2026-05-18 21:38:14.137103+00	2026-05-18 21:38:14.137103+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
10000000-0000-0000-0000-000000000001	\N	Convenção Estadual RS	convencao-estadual-rs	convencao	Porto Alegre	RS	BR	pt-BR	\N	\N	\N	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:15:59.074614+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
10000000-0000-0000-0000-000000000003	10000000-0000-0000-0000-000000000002	Setor Centro Caxias	setor-centro-caxias	setor	Caxias do Sul	RS	BR	pt-BR	\N	\N	\N	t	2026-05-21 21:12:52.343663+00	2026-05-21 21:15:59.074614+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
11111111-0000-0000-0000-000000000001	\N	Assembleia de Deus — Ministério RS	assembleia-deus-ministerio-rs	convencao	Porto Alegre	RS	BR	pt-BR	\N	\N	\N	t	2026-06-04 19:03:23.834365+00	2026-06-05 17:45:20.178428+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
dd000002-0000-0000-0000-000000000009	dd000001-0000-0000-0000-000000000004	Congregacao Planalto	\N	congregacao	Caxias do Sul	RS	BR	pt-BR	\N	\N	\N	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
11111111-0000-0000-0000-000000000003	11111111-0000-0000-0000-000000000002	Secretaria AD Caxias do Sul	secretaria-ad-caxias-do-sul	setor	Caxias do Sul	RS	BR	pt-BR	\N	\N	\N	t	2026-06-04 19:03:23.834365+00	2026-06-05 17:45:20.178428+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
11111111-0000-0000-0000-000000000004	11111111-0000-0000-0000-000000000003	Congregação Jardim América	congregacao-jardim-america	congregacao	Caxias do Sul	RS	BR	pt-BR	\N	\N	\N	t	2026-06-04 19:03:23.834365+00	2026-06-05 17:45:20.178428+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
dd000001-0000-0000-0000-000000000001	10000000-0000-0000-0000-000000000002	Setor Norte	\N	setor	Caxias do Sul	RS	BR	pt-BR	\N	\N	\N	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
dd000001-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000002	Setor Sul	\N	setor	Caxias do Sul	RS	BR	pt-BR	\N	\N	\N	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
dd000001-0000-0000-0000-000000000003	10000000-0000-0000-0000-000000000002	Setor Leste	\N	setor	Caxias do Sul	RS	BR	pt-BR	\N	\N	\N	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
dd000001-0000-0000-0000-000000000004	10000000-0000-0000-0000-000000000002	Setor Oeste	\N	setor	Caxias do Sul	RS	BR	pt-BR	\N	\N	\N	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
dd000001-0000-0000-0000-000000000005	10000000-0000-0000-0000-000000000002	Setor Centro	\N	setor	Caxias do Sul	RS	BR	pt-BR	\N	\N	\N	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
dd000002-0000-0000-0000-000000000001	10000000-0000-0000-0000-000000000002	Congregacao Central	\N	congregacao	Caxias do Sul	RS	BR	pt-BR	\N	\N	\N	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
dd000002-0000-0000-0000-000000000002	dd000001-0000-0000-0000-000000000001	Congregacao Bela Vista	\N	congregacao	Caxias do Sul	RS	BR	pt-BR	\N	\N	\N	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
dd000002-0000-0000-0000-000000000003	dd000001-0000-0000-0000-000000000001	Congregacao Sao Jose	\N	congregacao	Caxias do Sul	RS	BR	pt-BR	\N	\N	\N	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
dd000002-0000-0000-0000-000000000004	dd000001-0000-0000-0000-000000000002	Congregacao Cruzeiro	\N	congregacao	Caxias do Sul	RS	BR	pt-BR	\N	\N	\N	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
dd000002-0000-0000-0000-000000000005	dd000001-0000-0000-0000-000000000002	Congregacao Santa Catarina	\N	congregacao	Caxias do Sul	RS	BR	pt-BR	\N	\N	\N	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
dd000002-0000-0000-0000-000000000006	dd000001-0000-0000-0000-000000000003	Congregacao Desvio Rizzo	\N	congregacao	Caxias do Sul	RS	BR	pt-BR	\N	\N	\N	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
dd000002-0000-0000-0000-000000000007	dd000001-0000-0000-0000-000000000003	Congregacao Ana Rech	\N	congregacao	Caxias do Sul	RS	BR	pt-BR	\N	\N	\N	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
dd000002-0000-0000-0000-000000000008	dd000001-0000-0000-0000-000000000004	Congregacao Esplanada	\N	congregacao	Caxias do Sul	RS	BR	pt-BR	\N	\N	\N	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
dd000002-0000-0000-0000-00000000000a	dd000001-0000-0000-0000-000000000005	Congregacao Serrano	\N	congregacao	Caxias do Sul	RS	BR	pt-BR	\N	\N	\N	t	2026-06-15 20:49:07.009522+00	2026-06-15 20:49:07.009522+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
ee000010-0000-0000-0000-000000000001	10000000-0000-0000-0000-000000000002	Setor Centro — STAGING	setor-centro-staging	setor	Caxias do Sul	RS	BR	pt-BR	\N	\N	\N	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
ee000010-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000002	Setor Norte — STAGING	setor-norte-staging	setor	Caxias do Sul	RS	BR	pt-BR	\N	\N	\N	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
ee000010-0000-0000-0000-000000000003	10000000-0000-0000-0000-000000000002	Setor Sul — STAGING	setor-sul-staging	setor	Caxias do Sul	RS	BR	pt-BR	\N	\N	\N	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
ee000020-0000-0000-0000-000000000001	ee000010-0000-0000-0000-000000000001	Congregação Centro — STAGING	cong-centro-staging	congregacao	Caxias do Sul	RS	BR	pt-BR	\N	\N	\N	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
ee000020-0000-0000-0000-000000000002	ee000010-0000-0000-0000-000000000002	Congregação Bela Vista — STAGING	cong-bela-vista-staging	congregacao	Caxias do Sul	RS	BR	pt-BR	\N	\N	\N	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
ee000020-0000-0000-0000-000000000003	ee000010-0000-0000-0000-000000000003	Congregação Cruzeiro — STAGING	cong-cruzeiro-staging	congregacao	Caxias do Sul	RS	BR	pt-BR	\N	\N	\N	t	2026-06-22 23:45:16.988795+00	2026-06-22 23:45:16.988795+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
11111111-0000-0000-0000-000000000002	11111111-0000-0000-0000-000000000001	Assembleia de Deus em Caxias do Sul	assembleia-deus-caxias-do-sul	matriz	Caxias do Sul	RS	BR	pt-BR	\N	\N	\N	t	2026-06-04 19:03:23.834365+00	2026-06-23 19:03:31.324255+00	Ativa	Assembleia de Deus	convention_matriz_intermediate_local	Convenção	Convenções	Matriz Municipal	Matrizes Municipais	Distrito	Distritos	Congregação	Congregações	t	t	t	t	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
10000000-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000001	Matriz Municipal Caxias do Sul	matriz-caxias-do-sul	matriz	Caxias do Sul	RS	BR	pt-BR	\N	\N	\N	t	2026-05-21 21:12:52.343663+00	2026-06-23 19:12:17.802665+00	Ativa	Assembleia de Deus	convention_matriz_intermediate_local	Convenção	Convenções	Matriz Municipal	Matrizes Municipais	Distrito	Distritos	Congregação	Congregações	t	t	t	t	\N	\N	\N	\N	\N	\N	t	f	\N	\N	\N
c2364ea8-4057-453e-af72-d22ae6058b57	10000000-0000-0000-0000-000000000002	Assembleia de Deus Santa Fé	edson-goncalves-mqr1k9pc	setor	Caxias do Sul	RS	BR	pt-BR	dinhogoncalves987@gmail.com	54996842709	\N	t	2026-06-23 19:32:42.502714+00	2026-06-23 19:33:57.598556+00	Ativa	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	95080410	Rua Dom Arthur Kratz	121	templo 02	\N	ecclesiabr.online	t	f	\N	\N	\N
\.


--
-- Data for Name: platform_announcements; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_announcements (id, title, short_description, full_content, target_type, is_active, image_url, button_label, button_link, organization_id, starts_at, ends_at, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: platform_support_agent_departments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_support_agent_departments (id, agent_user_id, department_id, is_primary, created_at) FROM stdin;
\.


--
-- Data for Name: platform_support_agent_presence; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_support_agent_presence (id, user_id, status, started_at, ended_at, metadata) FROM stdin;
\.


--
-- Data for Name: platform_support_agents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_support_agents (id, user_id, platform_role, is_active, current_status, last_seen_at, created_at, updated_at, primary_department_id, base_city, base_state, base_country, reference_church, referred_by, internal_notes, credential_status, priority_region) FROM stdin;
5aa2e7c8-8a0f-498b-9acf-fd5e755e0cef	00000000-0000-0000-0000-00000000b001	super_admin	t	offline	\N	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00	\N	\N	\N	BR	\N	\N	\N	pending	\N
eace1526-98e2-48fb-8937-b9af98dc6a02	00000000-0000-0000-0000-00000000b002	platform_admin	t	offline	\N	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00	\N	\N	\N	BR	\N	\N	\N	pending	\N
4c893139-058b-496b-9a5b-341307947836	3a7e972d-f9d5-417a-984c-3652d6c2f28f	super_admin	t	offline	\N	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00	\N	\N	\N	BR	\N	\N	\N	pending	\N
\.


--
-- Data for Name: platform_support_audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_support_audit_logs (id, actor_user_id, target_organization_id, ticket_id, module_key, action, entity_table, entity_id, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: platform_support_departments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_support_departments (id, name, slug, description, is_active, sort_order, icon_key, color_key, module_keys, created_at, updated_at) FROM stdin;
2a46b19e-bd34-4523-ae19-a8b5884b46a7	Administração	administracao	Atendimento administrativo geral da plataforma Ecclesia.	t	10	shield	amber	{dashboard,conversas,suporte,auditoria}	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
bd51d3a9-e62e-4996-be12-422646e28da5	Secretaria	secretaria	Suporte para membros, carteiras, cartas, documentos, solicitações, agenda e rotinas administrativas da igreja.	t	20	clipboard-list	indigo	{secretaria,membros,carteira_membros,cartas_recomendacao,solicitacoes,documentos,comunicacao,agenda,escalas,pequenos_grupos,assembleia_geral}	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
ca1b254d-d299-4350-879f-a446457bcf4f	Financeiro	financeiro	Suporte para financeiro, relatórios, contas, categorias, centros de custo e integrações financeiras.	t	30	wallet	blue	{financeiro,relatorios}	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
9682522e-2315-49c7-884d-7c7ef98c1785	Culto & Louvor	culto_louvor	Suporte para culto, louvor, escalas, campanhas e operação ligada aos cultos.	t	40	music	purple	{culto_louvor,escalas,campanhas}	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
e3cf4cf6-56c5-42c4-b4cb-5358f72ccd37	Técnico	tecnico	Suporte técnico, diagnóstico, integrações, unidades locais, configuração e auditoria técnica.	t	50	settings	slate	{unidades_locais,configuracoes,auditoria,suporte}	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
c233c708-4e55-4f83-bcf6-f47d8c3392be	Implantação	implantacao	Suporte para onboarding de igrejas, estrutura organizacional, acessos iniciais, membros e documentos.	t	60	rocket	emerald	{unidades_locais,gerenciador_acesso,secretaria,membros,documentos,solicitacoes}	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
b0de04c7-b8d2-42d9-921a-6f0cf724869a	TV Digital	tv_digital	Suporte para TV Online, transmissão, mídia, culto online e operação audiovisual.	t	70	tv	red	{tv_online,culto_louvor,midia,transmissao}	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
15287f27-d7a0-4790-8de8-7d35c3ea2b5a	Comunidade	comunidade	Suporte para comunidade, comunicação, membros, interação e recursos sociais do Ecclesia.	t	80	users	cyan	{comunidade,comunicacao,membros}	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
9a5c8d32-38d5-4f90-81b3-af9099278ed5	Marketplace	marketplace	Suporte para marketplace, parcerias, ofertas, comunidade e integrações comerciais futuras.	t	90	shopping-bag	orange	{marketplace,comunidade,financeiro}	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
\.


--
-- Data for Name: platform_support_permissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_support_permissions (id, platform_role, module_key, can_view, can_create, can_edit, can_delete, can_manage, created_at, updated_at) FROM stdin;
bbc1d4e2-5beb-49bd-b06e-6b618ea759de	super_admin	dashboard	t	t	t	t	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
07c362c5-76c9-49e3-92e7-b543ccc6fa34	super_admin	conversas	t	t	t	t	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
ea0509f8-1669-4e40-894b-685773ab4006	super_admin	biblia	t	t	t	t	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
de18342c-e3cf-4032-b5dd-ce30c02171e6	super_admin	culto_louvor	t	t	t	t	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
f164cde0-b5e5-4b95-8999-6b8c4322df63	super_admin	campanhas	t	t	t	t	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
a84e5bd9-c9ea-4614-944e-64423c135ce3	super_admin	secretaria	t	t	t	t	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
dae3a45d-4b08-49d6-b422-303bda03989f	super_admin	membros	t	t	t	t	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
cec1747d-83d6-440b-992b-7bbff75dff0e	super_admin	carteira_membros	t	t	t	t	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
309610be-e527-4cdc-a0d2-870a009f92ae	super_admin	cartas_recomendacao	t	t	t	t	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
b7b38465-e0c1-4b61-b29e-f6071cc5b7ad	super_admin	solicitacoes	t	t	t	t	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
a5c77141-40f4-49bb-8431-356276073779	super_admin	documentos	t	t	t	t	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
ab17fc01-d87c-4854-9ebc-8f0ee7e8e961	super_admin	comunicacao	t	t	t	t	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
67a20266-39d8-4b7c-9f82-5c3ec7c4bc05	super_admin	agenda	t	t	t	t	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
019b89ba-25f6-42d3-b4ec-49362d3b467f	super_admin	escalas	t	t	t	t	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
426beaf2-a836-4083-b54e-5a0abf655563	super_admin	pequenos_grupos	t	t	t	t	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
c8b1a9f9-981b-401d-ae69-3ce6e0a8cbba	super_admin	assembleia_geral	t	t	t	t	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
2b0fc99c-6872-4136-a425-75e68fbaed7e	super_admin	financeiro	t	t	t	t	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
3021b1ab-0d9c-42da-8771-d0776c509664	super_admin	relatorios	t	t	t	t	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
3b093717-c366-4519-8901-eaf0060dfeed	super_admin	comunidade	t	t	t	t	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
a5c8df8e-7171-40d2-b8c1-16b4ee6a02d4	super_admin	marketplace	t	t	t	t	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
3f2c84cf-77a7-4bc4-992c-d5ae2afc205b	super_admin	unidades_locais	t	t	t	t	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
30b5f469-1e06-440b-934c-2cc9dfa5c6af	super_admin	gerenciador_acesso	t	t	t	t	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
da3d98d5-362e-4e30-aa12-bc3953a875fb	super_admin	configuracoes	t	t	t	t	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
d3bf733a-0698-4448-a12a-9323598eed18	super_admin	auditoria	t	t	t	t	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
890811a2-3fee-4e27-bd6e-9c0f2ecd1855	super_admin	suporte	t	t	t	t	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
505918b5-6b4e-4895-88ed-2516b99d404c	platform_admin	dashboard	t	t	t	f	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
ed98c2c1-20bd-4009-8d1a-f0c592dc0b53	platform_admin	conversas	t	t	t	f	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
849a3cc3-e003-42ee-8941-f6f09e06d3a2	platform_admin	secretaria	t	t	t	f	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
47ddb5de-a052-4ee2-8458-539c8e376b2d	platform_admin	membros	t	t	t	f	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
a739a34c-f141-4217-980d-c3d61b97a7b7	platform_admin	financeiro	t	t	t	f	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
55e5cb98-6040-4526-987f-dd1739685fd4	platform_admin	relatorios	t	t	t	f	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
45770953-38a5-4221-a184-0218ada5aaaa	platform_admin	unidades_locais	t	t	t	f	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
6edda70e-a814-4fc0-9b50-5f772318b233	platform_admin	gerenciador_acesso	t	t	t	f	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
7fd89001-3950-458c-842d-106ae5635833	platform_admin	auditoria	t	f	f	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
e5da29db-f4c2-4250-a486-eee271e0c3e6	platform_admin	suporte	t	t	t	f	t	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
6e10e652-f3b8-483d-a78c-4119288fb2be	support_secretaria	dashboard	t	f	f	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
f935c02f-1d21-4801-ac0b-38042e0cf30d	support_secretaria	conversas	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
056dcb9b-9d2c-4fb7-92e7-90af5aef9171	support_secretaria	secretaria	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
7d0b95b4-5a8d-4b13-8c24-537dd964b229	support_secretaria	membros	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
a3e7c3e3-188e-4994-a5c8-deac11e7006b	support_secretaria	carteira_membros	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
b5d864ed-c409-46bf-85a9-cf4d8fe6ee55	support_secretaria	cartas_recomendacao	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
e4520e18-4d74-4f7b-8e41-0a63992c28e0	support_secretaria	solicitacoes	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
48a52bce-94ec-486c-9664-0567a32421e1	support_secretaria	documentos	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
c141216c-d29b-4991-bc03-a6b5a298a404	support_secretaria	comunicacao	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
a88a56d1-8061-423c-93d2-0b53aceca7a1	support_secretaria	agenda	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
726856bc-8664-43ea-ac4b-99ac0232801b	support_secretaria	escalas	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
29797170-3e7a-4b3f-b37a-ff67c146dbdf	support_secretaria	pequenos_grupos	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
267ad8c5-afa7-417b-86ae-4e08728d49db	support_secretaria	assembleia_geral	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
e76d14e6-ec41-4d3c-88a8-80c81b42379a	support_secretaria	suporte	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
143b046e-492b-4e97-9c4b-578b4f9caa07	support_financeiro	dashboard	t	f	f	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
300f993b-0f0e-47ce-85f9-04faf9d709da	support_financeiro	conversas	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
e53f9f96-7e4e-4a09-8bb5-8cbf567545d4	support_financeiro	financeiro	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
00383c0c-dabd-4823-a96b-6fe6609c1919	support_financeiro	relatorios	t	f	f	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
782c7d06-75b2-4703-aaa3-93efaaf1ec86	support_financeiro	membros	t	f	f	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
a5f46b5e-286d-4bb3-93b7-7c7651ef6e31	support_financeiro	suporte	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
e451edc2-1bf8-4922-878b-42f575e06fdd	support_culto_louvor	dashboard	t	f	f	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
05d23861-57d8-45f1-959b-4a48bb5de7bd	support_culto_louvor	conversas	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
ef80dfbe-8dff-4665-9245-12ceaa163cf1	support_culto_louvor	culto_louvor	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
51dc6f00-8f8a-479c-abc6-2268eb3431d8	support_culto_louvor	campanhas	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
82e0efd6-1ca0-4fcc-a2a4-e2c733144315	support_culto_louvor	escalas	t	f	f	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
763406aa-4885-4c5d-ba29-c8c56fc5508f	support_culto_louvor	suporte	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
f85e641d-fe47-4607-bd6c-30b3817b14d3	support_tecnico	dashboard	t	f	f	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
8036b6b7-fc62-41dc-b254-624f93eb0b29	support_tecnico	conversas	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
0f46f715-da03-42be-ba56-93ba31b665c7	support_tecnico	unidades_locais	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
27bba2d6-94bd-41bc-87f4-8ca53737fd87	support_tecnico	configuracoes	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
847f7402-ed53-43e1-a141-1ccfe9a18f4a	support_tecnico	auditoria	t	f	f	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
c2d9d797-cb72-449f-b800-e960d54c1131	support_tecnico	suporte	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
800bb5d1-e6e0-49cc-a4f0-29cc563337a2	support_implantacao	dashboard	t	f	f	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
7ef73baf-d262-4642-ae5b-d57d02c07bdc	support_implantacao	conversas	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
a18f6b95-7a91-4a26-a6b1-a316639ed5e9	support_implantacao	secretaria	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
6b7e3397-7d06-4a30-966f-4aa077e359c3	support_implantacao	membros	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
b0bcf221-135e-48be-8726-8d742bd9c7a0	support_implantacao	documentos	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
5e91ca1f-ccbe-4701-a2c7-724542475dbf	support_implantacao	solicitacoes	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
a4be14ab-2d36-4bcd-adf8-6cc6a4188d2e	support_implantacao	unidades_locais	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
411df727-48de-4fe0-9f32-2da5312fcff8	support_implantacao	gerenciador_acesso	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
e540dbdb-c03d-430e-9b1b-5bca240e5f81	support_implantacao	suporte	t	t	t	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
863f201c-6064-4433-9b6e-57b32549f3a6	support_readonly	dashboard	t	f	f	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
80708294-71df-48cf-aed5-99072ceaf80c	support_readonly	conversas	t	f	f	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
f44c36b0-b9a8-4703-8597-802e8bbff4bc	support_readonly	secretaria	t	f	f	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
501ad3f4-e0bb-4d3e-8a19-304df371636d	support_readonly	membros	t	f	f	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
c75a0ee5-cd42-43fb-a386-d33133ce7a56	support_readonly	documentos	t	f	f	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
e340bb5f-44d7-41a5-83b2-1779b29a9904	support_readonly	financeiro	t	f	f	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
c3b1e82e-21aa-4ea5-a65e-4c65b8b57c52	support_readonly	relatorios	t	f	f	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
e5e25784-07b1-4878-8429-a725a024b673	support_readonly	auditoria	t	f	f	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
d9ce0ae4-6589-45c0-97aa-0ed8fb9f4d5a	support_readonly	suporte	t	f	f	f	f	2026-06-26 20:11:00.547497+00	2026-06-26 20:11:00.547497+00
e93903b7-96fa-450e-b3e8-6febb353e3de	atendente_central	dashboard	t	f	f	f	f	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
6f74ab37-e7a3-450b-b39f-d0af34019b43	atendente_central	conversas	t	t	t	f	f	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
f0d3603d-4a1b-479e-9dd2-34e9d16a106f	atendente_central	suporte	t	t	t	f	f	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
11e9cd2f-561e-4075-ab74-1fce263e54f7	support_tv_digital	dashboard	t	f	f	f	f	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
620a023d-a31e-442a-8d93-71142aca4a64	support_tv_digital	conversas	t	t	t	f	f	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
ae0bd937-6c13-436d-88cb-58394286a72f	support_tv_digital	tv_online	t	t	t	f	f	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
fc34e561-834c-4123-ba0d-05088ff02ef8	support_tv_digital	culto_louvor	t	t	t	f	f	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
21b3ab0f-0bd7-442b-9a76-b068d7a254ea	support_tv_digital	midia	t	t	t	f	f	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
fcf49475-09b4-482a-a6b5-3348b20b441b	support_tv_digital	transmissao	t	t	t	f	f	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
a17511e7-6135-479e-af76-a27536b343e1	support_tv_digital	suporte	t	t	t	f	f	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
f42d1ef9-72bd-4e99-a794-d4a60b0374e9	support_comunidade	dashboard	t	f	f	f	f	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
2402289c-2970-4fa9-bc1e-e8f6ef14e62c	support_comunidade	conversas	t	t	t	f	f	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
b7f4d97a-ae7b-4716-b7c0-4258c14fd15c	support_comunidade	comunidade	t	t	t	f	f	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
f0ae0181-4dd7-4179-8e48-09f580d23291	support_comunidade	comunicacao	t	t	t	f	f	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
d0a120fb-1b7b-4ee2-9937-8055f380a796	support_comunidade	membros	t	f	f	f	f	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
eeb084fd-7386-4978-a959-3ab66d698dc2	support_comunidade	suporte	t	t	t	f	f	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
54d2e23f-5ca3-453e-bcb7-8e3ff577848d	support_marketplace	dashboard	t	f	f	f	f	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
7872889e-3c4f-4651-9bf8-df4d9a72ad2d	support_marketplace	conversas	t	t	t	f	f	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
83bbb024-c9fb-4a90-ac95-902f62ad5891	support_marketplace	marketplace	t	t	t	f	f	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
e3a4168a-15de-48b1-a460-26d32d85b7c7	support_marketplace	comunidade	t	f	f	f	f	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
1e31cdda-df2a-4834-88cd-ddf203421f9f	support_marketplace	financeiro	t	f	f	f	f	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
52d0c764-2d71-4b68-a3a2-e0ee4592950a	support_marketplace	suporte	t	t	t	f	f	2026-06-26 23:40:10.404542+00	2026-06-26 23:40:10.404542+00
\.


--
-- Data for Name: platform_support_ticket_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_support_ticket_events (id, ticket_id, actor_user_id, event_type, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: platform_support_tickets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_support_tickets (id, organization_id, opened_by_user_id, assigned_to_user_id, department, module_key, title, description, status, priority, created_at, updated_at, closed_at, department_id) FROM stdin;
\.


--
-- Data for Name: prayer_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.prayer_requests (id, organization_id, user_id, title, description, status, is_private, created_by, created_at, updated_at) FROM stdin;
77777777-0000-0000-0000-000000000002	11111111-0000-0000-0000-000000000004	\N	Provisão para família Souza — Caxias do Sul	O irmão Lucas Souza, membro da Congregação Jardim América em Caxias do Sul/RS, está desempregado há três meses. Intercedamos para que o Senhor abra portas de trabalho e fortaleça a fé dessa família.	Ativo	f	\N	2026-06-04 19:03:23.834365+00	2026-06-05 20:39:11.708159+00
77777777-0000-0000-0000-000000000003	11111111-0000-0000-0000-000000000004	\N	Intercessão pelo Congresso de Oração e Missões	Agradecemos as orações pelo Congresso de Oração e Missões da Assembleia de Deus em Caxias do Sul. O evento foi abençoado; mantemos gratidão e pedimos continuidade no chamado missionário da congregação.	Respondido	f	\N	2026-06-04 19:03:23.834365+00	2026-06-05 20:39:11.708159+00
dd00000f-0000-0000-0000-000000000001	10000000-0000-0000-0000-000000000002	\N	Cura de Margarida Ferrari	Pedido pela irmã em tratamento de saúde. Oração por restauração e paz.	Ativo	f	\N	2026-06-15 21:46:50.006854+00	2026-06-15 21:46:50.006854+00
dd00000f-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000002	\N	Obras do Novo Templo	Intercessão para Deus guiar a construção do novo templo.	Ativo	f	\N	2026-06-15 21:46:50.006854+00	2026-06-15 21:46:50.006854+00
dd00000f-0000-0000-0000-000000000003	10000000-0000-0000-0000-000000000002	\N	Provisão para família Maran	Rodrigo Maran desempregado há 2 meses. Oração por provisão.	Ativo	f	\N	2026-06-15 21:46:50.006854+00	2026-06-15 21:46:50.006854+00
dd00000f-0000-0000-0000-000000000004	10000000-0000-0000-0000-000000000002	\N	Missão África — proteção	Equipe missionária em Moçambique: proteção e frutos evangelísticos.	Ativo	f	\N	2026-06-15 21:46:50.006854+00	2026-06-15 21:46:50.006854+00
dd00000f-0000-0000-0000-000000000005	10000000-0000-0000-0000-000000000002	\N	Reconciliação familiar Volpato	Pedido reservado de restauração familiar.	Ativo	t	\N	2026-06-15 21:46:50.006854+00	2026-06-15 21:46:50.006854+00
dd00000f-0000-0000-0000-000000000006	10000000-0000-0000-0000-000000000002	\N	Agradecimento — recuperação Cominetto	Antonio Cominetto recebeu alta hospitalar. Deus é fiel!	Respondido	f	\N	2026-06-15 21:46:50.006854+00	2026-06-15 21:46:50.006854+00
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.profiles (id, user_id, full_name, role_title, phone, email, avatar_url, platform_role, created_at, updated_at) FROM stdin;
ce7e4001-de47-4ec1-9843-80f052e9d678	00000000-0000-0000-0000-00000000b001	RLS Real Super Admin	Membro	\N	rls-real-super-admin.staging@gmail.com	\N	super_admin	2026-05-13 03:16:28.239852+00	2026-05-13 03:17:18.686064+00
7111f219-1000-481a-8c6e-a424e51d8b0e	00000000-0000-0000-0000-00000000b002	RLS Real Platform Admin	Membro	\N	rls-real-platform-admin.staging@gmail.com	\N	platform_admin	2026-05-13 03:16:28.639215+00	2026-05-13 03:17:18.686064+00
8b473704-b17d-4028-8a68-5929788e6c9c	00000000-0000-0000-0000-00000000b003	RLS Real Church Admin	Membro	\N	rls-real-church-admin.staging@gmail.com	\N	\N	2026-05-13 03:16:28.982154+00	2026-05-13 03:17:18.686064+00
838e4c90-d703-46ca-ae03-c6c64b89bbd6	00000000-0000-0000-0000-00000000b004	RLS Real Tesoureiro	Membro	\N	rls-real-tesoureiro.staging@gmail.com	\N	\N	2026-05-13 03:16:29.747242+00	2026-05-13 03:17:18.686064+00
6eb1eed9-521b-4520-9524-455a9b73fe6e	00000000-0000-0000-0000-00000000b005	RLS Real Contador	Membro	\N	rls-real-contador.staging@gmail.com	\N	\N	2026-05-13 03:16:30.078227+00	2026-05-13 03:17:18.686064+00
59b4ab58-c441-49dd-9b9c-752b17a88ca1	00000000-0000-0000-0000-00000000b006	RLS Real Pastor	Membro	\N	rls-real-pastor.staging@gmail.com	\N	\N	2026-05-13 03:16:30.415128+00	2026-05-13 03:17:18.686064+00
bd793e72-b9d0-4aa6-b4dc-309a2b096573	00000000-0000-0000-0000-00000000b007	RLS Real Secretary	Membro	\N	rls-real-secretary.staging@gmail.com	\N	\N	2026-05-13 03:16:30.756657+00	2026-05-13 03:17:18.686064+00
9f0f58a3-9e91-4381-a439-1a678ca29d51	00000000-0000-0000-0000-00000000b008	RLS Real Leader	Membro	\N	rls-real-leader.staging@gmail.com	\N	\N	2026-05-13 03:16:31.105597+00	2026-05-13 03:17:18.686064+00
b10cbcef-99c3-45f1-a434-d1dfe8cd918f	00000000-0000-0000-0000-00000000b009	RLS Real Member	Membro	\N	rls-real-member.staging@gmail.com	\N	\N	2026-05-13 03:16:31.726451+00	2026-05-13 03:17:18.686064+00
292d20f0-f090-42fe-9d6a-b390c5e3eec5	0f30d31a-27a8-40e1-ba0f-f8ef42f0666f	pedro	Membro	\N	dinhogoncalves987@gmail.com	\N	\N	2026-05-14 17:32:29.413429+00	2026-05-14 17:32:29.413429+00
cfd0de8e-34b6-44dd-9676-65a30773bfde	6a15e7f4-86c0-4f9c-b923-55faa0cbbd8e	João Sila	Membro	\N	dinhoroquete@gmail.com	\N	\N	2026-05-18 21:05:04.301669+00	2026-05-18 21:05:04.301669+00
d7bf9d2b-022d-4517-85b2-7cc9e818cb40	df9a9fbf-74bf-4349-8105-5d53e91bbed4	Pedro Martins	Membro	\N	appdegarage@gmail.com	\N	\N	2026-05-18 21:26:17.333952+00	2026-05-18 21:26:17.333952+00
8bdd7d8f-0f95-4ce3-b8e0-32a9260adaa4	c4454857-75a7-4b38-92ee-104dca931fe3	admin@ecclesiabr.online	Membro	\N	admin@ecclesiabr.online	\N	\N	2026-05-21 20:45:04.852253+00	2026-05-21 20:45:04.852253+00
2785278c-1d29-45a4-89f2-9c4d3a787a7c	6966fdaf-06e4-47f5-a75a-5116d52c4612	setor@ecclesiabr.online	Membro	\N	setor@ecclesiabr.online	\N	\N	2026-05-21 21:26:22.014638+00	2026-05-21 21:26:22.014638+00
af17a4e5-0133-4345-83c3-1b6ffeed9851	3a7e972d-f9d5-417a-984c-3652d6c2f28f	Super Admin Ecclesia	Membro	\N	superadmin@ecclesiabr.online	\N	super_admin	2026-05-21 21:24:57.854351+00	2026-05-21 21:30:35.056685+00
75ea6bbb-7cbf-4ba2-ac27-173ae3139715	51fa6d58-09cd-42c3-87a4-4f726cef4ba1	XCeleiro	Membro	\N	celeiroglobal@gmail.com	\N	\N	2026-05-28 03:10:06.518528+00	2026-05-28 03:10:06.518528+00
c48bfafc-35eb-4770-a6d8-4b9f1d207aa0	34c2b6da-fcc2-47b6-9e0c-c93f59f09cb0	Rodrigo Lopes	Membro	\N	rodlopesdev@gmail.com	\N	\N	2026-05-29 18:40:09.895754+00	2026-05-29 18:40:09.895754+00
a19e97d2-c8dd-4b9d-95c5-613d2c6ed1c9	db694ea3-59b9-4524-b7ea-89ab059c2118	Humberto Lopes Comodities & Insumos	Membro	\N	humbertolopesnegocios@gmail.com	\N	\N	2026-05-29 19:10:17.742433+00	2026-05-29 19:10:17.742433+00
a01c13a2-55e3-4d0b-ac30-67d8709fe6ad	6dff3f60-ffbd-47ac-83cc-566e1a965612	Marlisa G Roquete	Membro	\N	marlisaroquete@gmail.com	\N	\N	2026-05-29 20:27:03.022396+00	2026-05-29 20:27:03.022396+00
6c710260-35b2-4b5d-a6a5-108b7314192f	129a8a20-1e51-4025-9d05-1516e48b188a	Admin Municipal Caxias	Tesouraria 	5499682709	municipal@ecclesiabr.online	https://qkiiwopkbcslquyfhdec.supabase.co/storage/v1/object/public/avatars/129a8a20-1e51-4025-9d05-1516e48b188a/avatar.png?t=1781736908662	\N	2026-05-21 21:25:46.350844+00	2026-06-17 22:55:10.064478+00
94dee88c-e4c3-41ea-9f6f-e8a8b55e6775	464ac116-23b8-4870-a45d-8a7e001e91b6	Pastor Alexandre almeida	Membro	\N	ritcarol2009@hotmail.com	\N	\N	2026-06-22 00:50:18.925781+00	2026-06-22 00:50:18.925781+00
7497b992-2d8a-48ad-b37a-0f1dcf0d2b88	afb253e4-4ce2-40cf-8fe5-6d87af7b4824	Admin Matriz — STAGING	Membro	\N	admin.matriz.staging@ecclesia.test	\N	\N	2026-06-22 23:45:17.940415+00	2026-06-22 23:45:17.940415+00
5ef26833-dc69-4bb2-b47b-95d706d8dd51	d1a700c8-df40-4f5e-8657-52ce6237fdb7	Secretária Geral — STAGING	Membro	\N	secretaria.geral.staging@ecclesia.test	\N	\N	2026-06-22 23:45:18.335589+00	2026-06-22 23:45:18.335589+00
09042d42-1997-47d3-a080-3f4d3ee2d5ad	ceca19f8-eb06-4f8b-8b6f-a511985498cb	Tesoureiro Geral — STAGING	Membro	\N	tesoureiro.geral.staging@ecclesia.test	\N	\N	2026-06-22 23:45:18.681365+00	2026-06-22 23:45:18.681365+00
a803e7b2-a9e1-434a-a723-d083ceaad097	2354ec77-5053-4263-8aba-88ad05aa01f0	Admin Setor Centro — STAGING	Membro	\N	admin.setor.centro.staging@ecclesia.test	\N	\N	2026-06-22 23:45:19.052868+00	2026-06-22 23:45:19.052868+00
7d19d87f-b8d4-433c-aa5b-5a2929f8a00f	930a166e-9120-4a32-9dab-16272a425d6b	Secretário Setor Centro — STAGING	Membro	\N	secretario.setor.centro.staging@ecclesia.test	\N	\N	2026-06-22 23:45:19.397029+00	2026-06-22 23:45:19.397029+00
efa9f5cd-fbbe-4cf2-a95c-d34604b31bda	ea1868ff-7a23-49bc-8f62-c07d41833397	Admin Congregação Centro — STAGING	Membro	\N	admin.congregacao.centro.staging@ecclesia.test	\N	\N	2026-06-22 23:45:19.739725+00	2026-06-22 23:45:19.739725+00
913fadcb-21ba-4055-af37-aabd9a87e1ed	05c9bc33-7cb7-4415-b228-f36635d7c52e	Secretário Congregação Centro — STAGING	Membro	\N	secretario.congregacao.centro.staging@ecclesia.test	\N	\N	2026-06-22 23:45:20.096253+00	2026-06-22 23:45:20.096253+00
becc723e-0681-4867-922f-eb6b0d064aa0	1eebd10a-e9b5-433b-9b50-b37996a10dbc	Porteiro Centro — STAGING	Membro	\N	porteiro.centro.staging@ecclesia.test	\N	\N	2026-06-22 23:45:20.437535+00	2026-06-22 23:45:20.437535+00
d456b275-b882-465d-923d-2dbcd9e0b5b0	19421aff-207e-4f42-8dfc-c454d18e8cd6	Membro Teste — STAGING	Membro	\N	membro.teste.staging@ecclesia.test	\N	\N	2026-06-22 23:45:20.791654+00	2026-06-22 23:45:20.791654+00
86cf431c-ff57-42fb-a8bc-239b5449c77d	19a640de-eea1-4c89-8167-54c2ca1ccee4	Admin Estadual RS	Membro	\N	estadual@ecclesiabr.online	\N	\N	2026-05-21 21:25:23.595723+00	2026-06-26 18:45:20.884133+00
\.


--
-- Data for Name: recommendation_letters; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.recommendation_letters (id, organization_id, member_id, member_name, member_email, destination_church, destination_city, destination_state, reason, observations, status, public_token, origin_church_name, requested_at, reviewed_at, approved_at, reviewed_by, approved_by, created_at, updated_at) FROM stdin;
dd000004-0000-0000-0000-000000000001	10000000-0000-0000-0000-000000000002	dd000003-0000-0000-0000-000000000003	Marcos Antonio Rossato	marcos.rossato@adcaxias.org.br	Assembleia de Deus — Zona Norte	Porto Alegre	RS	Transferência de residência	Membro se muda em razão de novo emprego na capital.	requested	9bb3aa44-d250-4ad9-ae2d-e79bb44fb4b9	Matriz Municipal Caxias do Sul	2026-06-02 21:53:19.932+00	\N	\N	\N	\N	2026-06-15 20:51:51.75559+00	2026-06-16 21:53:21.336998+00
dd000004-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000002	dd000003-0000-0000-0000-000000000013	Rafael Casagrande	\N	Assembleia de Deus — Campo de São Paulo	São Paulo	SP	Mudança para fins de estudo	Membro ingressou em universidade federal. Apresenta-se ao campo local.	requested	edf299cc-4c0f-45b9-80dd-8bca111bd0c9	Matriz Municipal Caxias do Sul	2026-06-09 21:53:19.932+00	\N	\N	\N	\N	2026-06-15 20:51:51.75559+00	2026-06-16 21:53:21.336998+00
dd000004-0000-0000-0000-000000000003	10000000-0000-0000-0000-000000000002	dd000003-0000-0000-0000-00000000000e	Simone Bettega	\N	Assembleia de Deus — Boqueirão — Curitiba	Curitiba	PR	Apresentação de membro durante relocação	Relocação profissional de 6 meses. Membro em plena comunhão.	under_review	4084c79c-2c19-449a-a477-d08ab0952ff7	Matriz Municipal Caxias do Sul	2026-05-26 21:53:19.932+00	2026-05-29 21:53:19.932+00	\N	\N	\N	2026-06-15 20:51:51.75559+00	2026-06-16 21:53:21.336998+00
dd000004-0000-0000-0000-000000000004	10000000-0000-0000-0000-000000000002	dd000003-0000-0000-0000-000000000007	Fernanda Pasinato	fernanda.p@adcaxias.org.br	Assembleia de Deus — Campinas — Florianópolis	Florianópolis	SC	Transferência de congregação	Membro em plena comunhão. Transferência solicitada pelo próprio membro.	approved	16c1cfdc-8e32-4319-9ecd-a223c3068f4e	Matriz Municipal Caxias do Sul	2026-05-17 21:53:19.932+00	2026-05-20 21:53:19.932+00	2026-05-22 21:53:19.932+00	\N	\N	2026-06-15 20:51:51.75559+00	2026-06-16 21:53:21.336998+00
dd000004-0000-0000-0000-000000000005	10000000-0000-0000-0000-000000000002	dd000003-0000-0000-0000-000000000009	Roberto Galvani	\N	Assembleia de Deus — Orlando — FL	Orlando	FL	Viagem missionária internacional	Membro viajou sem documentação ministerial completa. Carta não emitida.	rejected	c393cd2d-f1b2-4151-be2f-25c333dcf076	Matriz Municipal Caxias do Sul	2026-05-02 21:53:19.932+00	2026-05-05 21:53:19.932+00	\N	\N	\N	2026-06-15 20:51:51.75559+00	2026-06-16 21:53:21.336998+00
\.


--
-- Data for Name: schedule_assignments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.schedule_assignments (id, schedule_id, member_id, role, status, notes, created_at, updated_at) FROM stdin;
77777777-0000-0000-0000-000000110001	77777777-0000-0000-0000-000000100001	22222222-0000-0000-0000-000000000005	Regente	confirmado	\N	2026-06-05 16:55:27.366194+00	2026-06-05 16:55:27.366194+00
77777777-0000-0000-0000-000000110002	77777777-0000-0000-0000-000000100001	22222222-0000-0000-0000-000000000009	Vocal	confirmado	\N	2026-06-05 16:55:27.366194+00	2026-06-05 16:55:27.366194+00
77777777-0000-0000-0000-000000110003	77777777-0000-0000-0000-000000100001	22222222-0000-0000-0000-000000000010	Vocal	pendente	\N	2026-06-05 16:55:27.366194+00	2026-06-05 16:55:27.366194+00
77777777-0000-0000-0000-000000110004	77777777-0000-0000-0000-000000100001	22222222-0000-0000-0000-000000000004	Teclado	pendente	\N	2026-06-05 16:55:27.366194+00	2026-06-05 16:55:27.366194+00
77777777-0000-0000-0000-000000110005	77777777-0000-0000-0000-000000100002	22222222-0000-0000-0000-000000000002	Recepção	confirmado	\N	2026-06-05 16:55:27.366194+00	2026-06-05 16:55:27.366194+00
77777777-0000-0000-0000-000000110006	77777777-0000-0000-0000-000000100002	22222222-0000-0000-0000-000000000003	Estacionamento	confirmado	\N	2026-06-05 16:55:27.366194+00	2026-06-05 16:55:27.366194+00
77777777-0000-0000-0000-000000110007	77777777-0000-0000-0000-000000100002	22222222-0000-0000-0000-000000000012	Café	pendente	\N	2026-06-05 16:55:27.366194+00	2026-06-05 16:55:27.366194+00
77777777-0000-0000-0000-000000110008	77777777-0000-0000-0000-000000100003	22222222-0000-0000-0000-000000000006	Professor	confirmado	\N	2026-06-05 16:55:27.366194+00	2026-06-05 16:55:27.366194+00
77777777-0000-0000-0000-000000110009	77777777-0000-0000-0000-000000100003	22222222-0000-0000-0000-000000000014	Auxiliar	pendente	\N	2026-06-05 16:55:27.366194+00	2026-06-05 16:55:27.366194+00
77777777-0000-0000-0000-000000110010	77777777-0000-0000-0000-000000100003	22222222-0000-0000-0000-000000000008	Recepção Kids	pendente	\N	2026-06-05 16:55:27.366194+00	2026-06-05 16:55:27.366194+00
77777777-0000-0000-0000-000000110011	77777777-0000-0000-0000-000000100004	22222222-0000-0000-0000-000000000013	Som	confirmado	\N	2026-06-05 16:55:27.366194+00	2026-06-05 16:55:27.366194+00
77777777-0000-0000-0000-000000110012	77777777-0000-0000-0000-000000100004	22222222-0000-0000-0000-000000000009	Projeção	recusado	Conflito de agenda	2026-06-05 16:55:27.366194+00	2026-06-05 16:55:27.366194+00
77777777-0000-0000-0000-000000110013	77777777-0000-0000-0000-000000100004	22222222-0000-0000-0000-000000000004	Transmissão	pendente	\N	2026-06-05 16:55:27.366194+00	2026-06-05 16:55:27.366194+00
\.


--
-- Data for Name: schedules; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.schedules (id, organization_id, title, description, schedule_date, ministry, created_by, created_at, updated_at, status, schedule_time) FROM stdin;
77777777-0000-0000-0000-000000100001	11111111-0000-0000-0000-000000000004	Culto de Adoração — Domingo Manhã	Chegar 30 min antes para ensaio.	2026-05-24 13:00:00+00	Louvor	\N	2026-06-05 16:55:27.366194+00	2026-06-05 16:55:27.366194+00	publicada	10:00:00
77777777-0000-0000-0000-000000100003	11111111-0000-0000-0000-000000000004	EBD — Ministério Infantil	Aguardando confirmação de mais um auxiliar.	2026-05-24 13:00:00+00	Infantil	\N	2026-06-05 16:55:27.366194+00	2026-06-05 16:55:27.366194+00	rascunho	10:00:00
77777777-0000-0000-0000-000000100004	11111111-0000-0000-0000-000000000004	Culto de Oração — Quarta	Transmissão ao vivo no culto de oração.	2026-05-27 22:30:00+00	Mídia	\N	2026-06-05 16:55:27.366194+00	2026-06-05 16:55:27.366194+00	publicada	19:30:00
77777777-0000-0000-0000-000000100002	11111111-0000-0000-0000-000000000004	Culto de Adoração — Recepção	Equipe de recepção e acolhimento no culto dominical.	2026-05-24 09:30:00+00	Recepção	\N	2026-06-05 16:55:27.366194+00	2026-06-05 17:09:20.374941+00	publicada	09:30:00
dd000010-0000-0000-0000-000000000001	10000000-0000-0000-0000-000000000002	Escala de Louvor 21/06	Líder: Ana Paula Zanella. Músicos: Gustavo Pegoraro, Vitor Andreatta.	2026-06-21 10:00:00+00	Louvor e Adoração	\N	2026-06-15 21:46:44.367557+00	2026-06-15 21:46:44.367557+00	publicada	\N
dd000010-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000002	Escala de Recepção 21/06	Responsáveis: Leandro Basso e Cristiane Degasperi.	2026-06-21 09:30:00+00	Recepção e Acolhimento	\N	2026-06-15 21:46:44.367557+00	2026-06-15 21:46:44.367557+00	publicada	\N
dd000010-0000-0000-0000-000000000003	10000000-0000-0000-0000-000000000002	Escala EBD 22/06	Infantil: Fernanda Pasinato. Jovens: Thiago Polesso. Adultos: Marcos.	2026-06-22 09:00:00+00	Escola Bíblica	\N	2026-06-15 21:46:44.367557+00	2026-06-15 21:46:44.367557+00	publicada	\N
dd000010-0000-0000-0000-000000000004	10000000-0000-0000-0000-000000000002	Escala de Intercessão Junho	Equipe: Maria José Tonetto, Simone Bettega, Elisangela Mantovani.	2026-06-01 00:00:00+00	Intercessão	\N	2026-06-15 21:46:44.367557+00	2026-06-15 21:46:44.367557+00	publicada	\N
dd000010-0000-0000-0000-000000000005	10000000-0000-0000-0000-000000000002	Escala Santa Ceia 28/06	Diáconos: Leandro Basso, Paulo Antoniazzi. Apoio: Anderson Volpato.	2026-06-28 19:00:00+00	Ministério	\N	2026-06-15 21:46:44.367557+00	2026-06-15 21:46:44.367557+00	publicada	\N
dd000010-0000-0000-0000-000000000006	10000000-0000-0000-0000-000000000002	Escala de Louvor 28/06	Líder: Ana Paula Zanella. Músicos para Santa Ceia.	2026-06-28 19:00:00+00	Louvor e Adoração	\N	2026-06-15 21:46:44.367557+00	2026-06-15 21:46:44.367557+00	publicada	\N
dd000010-0000-0000-0000-000000000007	10000000-0000-0000-0000-000000000002	Escala de Limpeza Semana	Responsáveis: Camila Dallacosta e Antonio Cominetto.	2026-06-22 07:00:00+00	Administrativa	\N	2026-06-15 21:46:44.367557+00	2026-06-15 21:46:44.367557+00	publicada	\N
\.


--
-- Data for Name: transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.transactions (id, organization_id, user_id, date, description, type, amount, status, category, account_category_id, cost_center_id, financial_account_id, responsible_id, payment_method, receipt_url, notes, created_by, updated_by, created_at, updated_at, campaign_id, source_module) FROM stdin;
88888888-0000-0000-0000-000000000001	11111111-0000-0000-0000-000000000004	00000000-0000-0000-0000-00000000b001	2026-05-04	Dízimos — 1ª semana de maio	Entrada	3250.00	Confirmado	Dizimos	\N	\N	\N	\N	PIX	\N	\N	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00	\N	manual
88888888-0000-0000-0000-000000000002	11111111-0000-0000-0000-000000000004	00000000-0000-0000-0000-00000000b001	2026-05-04	Aluguel do Templo — maio/2026	Saida	2800.00	Pago	Administrativo	\N	\N	\N	\N	Banco	\N	\N	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00	\N	manual
88888888-0000-0000-0000-000000000003	11111111-0000-0000-0000-000000000004	00000000-0000-0000-0000-00000000b001	2026-05-11	Dízimos — 2ª semana de maio	Entrada	2890.00	Confirmado	Dizimos	\N	\N	\N	\N	PIX	\N	\N	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00	\N	manual
88888888-0000-0000-0000-000000000004	11111111-0000-0000-0000-000000000004	00000000-0000-0000-0000-00000000b001	2026-05-11	Energia Elétrica — maio	Saida	480.00	Pago	Manutencao	\N	\N	\N	\N	Banco	\N	\N	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00	\N	manual
88888888-0000-0000-0000-000000000005	11111111-0000-0000-0000-000000000004	00000000-0000-0000-0000-00000000b001	2026-05-11	Oferta de Missões Nacionais	Entrada	850.00	Confirmado	Missoes	\N	\N	\N	\N	Especie	\N	\N	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00	\N	manual
88888888-0000-0000-0000-000000000006	11111111-0000-0000-0000-000000000004	00000000-0000-0000-0000-00000000b001	2026-05-18	Dízimos — 3ª semana de maio	Entrada	3100.00	Confirmado	Dizimos	\N	\N	\N	\N	PIX	\N	\N	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00	\N	manual
88888888-0000-0000-0000-000000000007	11111111-0000-0000-0000-000000000004	00000000-0000-0000-0000-00000000b001	2026-05-18	Material de Limpeza e Manutenção	Saida	145.00	Pago	Manutencao	\N	\N	\N	\N	Especie	\N	\N	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00	\N	manual
88888888-0000-0000-0000-000000000008	11111111-0000-0000-0000-000000000004	00000000-0000-0000-0000-00000000b001	2026-05-18	Oferta Especial — Culto de Louvor	Entrada	620.00	Confirmado	Ofertas	\N	\N	\N	\N	Especie	\N	\N	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00	\N	manual
88888888-0000-0000-0000-000000000009	11111111-0000-0000-0000-000000000004	00000000-0000-0000-0000-00000000b001	2026-05-04	Honorários Pastorais — maio	Saida	4000.00	Pago	Folha/Pastoral	\N	\N	\N	\N	Banco	\N	\N	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00	\N	manual
88888888-0000-0000-0000-000000000010	11111111-0000-0000-0000-000000000004	00000000-0000-0000-0000-00000000b001	2026-05-11	Internet e Sistema — Ecclesia Admin	Saida	299.00	Pago	Administrativo	\N	\N	\N	\N	Banco	\N	\N	\N	\N	2026-06-04 19:03:23.834365+00	2026-06-04 19:03:23.834365+00	\N	manual
dd000008-0000-0000-0000-000000000001	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-02-02	Dizimos culto domingo 02/02/2026	Entrada	4800	Confirmado	Dizimos	dd000006-0000-0000-0000-000000000001	\N	dd000005-0000-0000-0000-000000000002	\N	PIX	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-03-02	Dizimos culto domingo 02/03/2026	Entrada	5100	Confirmado	Dizimos	dd000006-0000-0000-0000-000000000001	\N	dd000005-0000-0000-0000-000000000002	\N	PIX	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-000000000003	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-04-06	Dizimos culto domingo 06/04/2026	Entrada	5350	Confirmado	Dizimos	dd000006-0000-0000-0000-000000000001	\N	dd000005-0000-0000-0000-000000000002	\N	PIX	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-000000000004	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-05-04	Dizimos culto domingo 04/05/2026	Entrada	4950	Confirmado	Dizimos	dd000006-0000-0000-0000-000000000001	\N	dd000005-0000-0000-0000-000000000002	\N	Dinheiro	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-000000000005	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-06-01	Dizimos culto domingo 01/06/2026	Entrada	5200	Confirmado	Dizimos	dd000006-0000-0000-0000-000000000001	\N	dd000005-0000-0000-0000-000000000002	\N	PIX	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-000000000006	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-06-11	Dizimos culto quarta 11/06/2026	Entrada	1800	Confirmado	Dizimos	dd000006-0000-0000-0000-000000000001	\N	dd000005-0000-0000-0000-000000000001	\N	Dinheiro	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-000000000007	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-05-20	Dizimos online maio 2026	Entrada	2300	Confirmado	Dizimos	dd000006-0000-0000-0000-000000000001	\N	dd000005-0000-0000-0000-000000000002	\N	PIX	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-000000000008	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-06-15	Dizimos culto domingo 15/06/2026	Entrada	5400	Pendente	Dizimos	dd000006-0000-0000-0000-000000000001	\N	dd000005-0000-0000-0000-000000000002	\N	PIX	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
88888888-0000-0000-0000-000000000011	11111111-0000-0000-0000-000000000002	00000000-0000-0000-0000-00000000b001	2026-05-10	Campanha — Reforma do Templo Central	Entrada	5000.00	Confirmado	Campanhas	\N	\N	\N	\N	PIX	\N	\N	\N	\N	2026-06-08 19:00:29.312695+00	2026-06-08 19:00:29.312695+00	aaaaaaaa-0000-0000-0000-000000000001	campaign
88888888-0000-0000-0000-000000000012	11111111-0000-0000-0000-000000000002	00000000-0000-0000-0000-00000000b001	2026-05-12	Campanha — Construção São José	Entrada	8500.00	Confirmado	Campanhas	\N	\N	\N	\N	PIX	\N	\N	\N	\N	2026-06-08 19:00:29.312695+00	2026-06-08 19:00:29.312695+00	aaaaaaaa-0000-0000-0000-000000000002	campaign
88888888-0000-0000-0000-000000000013	11111111-0000-0000-0000-000000000002	00000000-0000-0000-0000-00000000b001	2026-05-14	Campanha — Missões África	Entrada	3200.00	Confirmado	Campanhas	\N	\N	\N	\N	PIX	\N	\N	\N	\N	2026-06-08 19:00:29.312695+00	2026-06-08 19:00:29.312695+00	aaaaaaaa-0000-0000-0000-000000000003	campaign
88888888-0000-0000-0000-000000000014	11111111-0000-0000-0000-000000000004	00000000-0000-0000-0000-00000000b001	2026-05-08	Campanha — Ação Social Inverno	Entrada	3500.00	Confirmado	Campanhas	\N	\N	\N	\N	PIX	\N	\N	\N	\N	2026-06-08 19:00:29.312695+00	2026-06-08 19:00:29.312695+00	aaaaaaaa-0000-0000-0000-000000000004	campaign
88888888-0000-0000-0000-000000000015	11111111-0000-0000-0000-000000000002	00000000-0000-0000-0000-00000000b001	2026-05-16	Campanha — Congresso de Jovens	Entrada	1200.00	Confirmado	Campanhas	\N	\N	\N	\N	PIX	\N	\N	\N	\N	2026-06-08 19:00:29.312695+00	2026-06-08 19:00:29.312695+00	aaaaaaaa-0000-0000-0000-000000000005	campaign
dd000008-0000-0000-0000-000000000009	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-06-13	Oferta especial Congresso Oracao	Entrada	2200	Confirmado	Ofertas	dd000006-0000-0000-0000-000000000002	\N	dd000005-0000-0000-0000-000000000001	\N	Dinheiro	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-00000000000a	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-05-24	Oferta culto familia maio	Entrada	1450	Confirmado	Ofertas	dd000006-0000-0000-0000-000000000002	\N	dd000005-0000-0000-0000-000000000001	\N	Dinheiro	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-00000000000b	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-03-08	Oferta dominical marco	Entrada	1700	Confirmado	Ofertas	dd000006-0000-0000-0000-000000000002	\N	dd000005-0000-0000-0000-000000000001	\N	Dinheiro	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-00000000000c	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-04-20	Oferta Santa Ceia abril	Entrada	850	Confirmado	Ofertas	dd000006-0000-0000-0000-000000000002	\N	dd000005-0000-0000-0000-000000000001	\N	Dinheiro	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-00000000000d	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-06-07	Oferta missionaria junho	Entrada	1200	Pendente	Ofertas	dd000006-0000-0000-0000-000000000002	\N	dd000005-0000-0000-0000-000000000001	\N	Dinheiro	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-00000000000e	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-04-15	Doacao Projeto Missoes Africa	Entrada	3500	Confirmado	Missoes Doacao	dd000006-0000-0000-0000-000000000003	\N	dd000005-0000-0000-0000-000000000003	\N	Transferencia	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-00000000000f	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-05-10	Doacao Missoes Camboja parceria	Entrada	2800	Confirmado	Missoes Doacao	dd000006-0000-0000-0000-000000000003	\N	dd000005-0000-0000-0000-000000000003	\N	PIX	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-000000000010	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-04-28	Oferta construcao novo templo abr	Entrada	6200	Confirmado	Fundo Construcao	dd000006-0000-0000-0000-000000000004	\N	dd000005-0000-0000-0000-000000000004	\N	PIX	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-000000000011	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-05-26	Oferta construcao novo templo mai	Entrada	5800	Confirmado	Fundo Construcao	dd000006-0000-0000-0000-000000000004	\N	dd000005-0000-0000-0000-000000000004	\N	PIX	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-000000000012	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-04-05	Aluguel auditorio abril 2026	Saida	1800	Confirmado	Aluguel Manutencao	dd000006-0000-0000-0000-000000000005	\N	dd000005-0000-0000-0000-000000000002	\N	Transferencia	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-000000000013	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-05-12	Manutencao sistema de som	Saida	950	Confirmado	Aluguel Manutencao	dd000006-0000-0000-0000-000000000005	\N	dd000005-0000-0000-0000-000000000002	\N	PIX	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-000000000014	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-05-05	Aluguel auditorio maio 2026	Saida	1800	Confirmado	Aluguel Manutencao	dd000006-0000-0000-0000-000000000005	\N	dd000005-0000-0000-0000-000000000002	\N	Transferencia	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-000000000015	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-04-10	Conta de luz abril 2026	Saida	420	Confirmado	Energia Eletrica	dd000006-0000-0000-0000-000000000006	\N	dd000005-0000-0000-0000-000000000002	\N	Transferencia	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-000000000016	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-05-10	Conta de luz maio 2026	Saida	390	Confirmado	Energia Eletrica	dd000006-0000-0000-0000-000000000006	\N	dd000005-0000-0000-0000-000000000002	\N	Transferencia	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-000000000017	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-04-18	Material EBD apostilas biblias	Saida	680	Confirmado	Material Suprimentos	dd000006-0000-0000-0000-000000000007	\N	dd000005-0000-0000-0000-000000000001	\N	PIX	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-000000000018	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-03-20	Material limpeza marco	Saida	180	Confirmado	Material Suprimentos	dd000006-0000-0000-0000-000000000007	\N	dd000005-0000-0000-0000-000000000001	\N	Dinheiro	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-000000000019	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-06-02	Material grafico banner	Saida	350	Pendente	Material Suprimentos	dd000006-0000-0000-0000-000000000007	\N	dd000005-0000-0000-0000-000000000001	\N	PIX	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-00000000001a	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-05-18	Acao Social Inverno cestas basicas	Saida	2400	Confirmado	Acao Social	dd000006-0000-0000-0000-000000000008	\N	dd000005-0000-0000-0000-000000000002	\N	Transferencia	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-00000000001b	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-06-07	Distribuicao cobertores junho	Saida	850	Confirmado	Acao Social	dd000006-0000-0000-0000-000000000008	\N	dd000005-0000-0000-0000-000000000001	\N	Dinheiro	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-00000000001c	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-05-28	Envio apoio missionario Africa mai	Saida	3200	Confirmado	Missoes Doacao	dd000006-0000-0000-0000-000000000003	\N	dd000005-0000-0000-0000-000000000003	\N	Transferencia	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-00000000001d	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-06-10	Passagens equipe Camboja	Saida	2100	Pendente	Missoes Doacao	dd000006-0000-0000-0000-000000000003	\N	dd000005-0000-0000-0000-000000000003	\N	Transferencia	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
dd000008-0000-0000-0000-00000000001e	10000000-0000-0000-0000-000000000002	129a8a20-1e51-4025-9d05-1516e48b188a	2026-06-08	Contrato alvenaria fundacao fase 1	Saida	8500	Confirmado	Fundo Construcao	dd000006-0000-0000-0000-000000000004	\N	dd000005-0000-0000-0000-000000000004	\N	Transferencia	\N	\N	\N	\N	2026-06-15 21:02:47.308861+00	2026-06-15 21:02:47.308861+00	\N	manual
\.


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_roles (id, user_id, organization_id, role, created_at, updated_at) FROM stdin;
0025c487-0b10-45a6-a455-d63d2760e447	00000000-0000-0000-0000-00000000b001	\N	super_admin	2026-05-13 03:17:18.686064+00	2026-05-13 03:17:18.686064+00
f7ffd4b4-758d-41a2-9d19-03aee1ccde22	00000000-0000-0000-0000-00000000b002	\N	platform_admin	2026-05-13 03:17:18.686064+00	2026-05-13 03:17:18.686064+00
ffb04008-06a6-4bd8-ac57-2d0146f501e6	00000000-0000-0000-0000-00000000b003	00000000-0000-0000-0000-0000000000a1	church_admin	2026-05-13 03:17:18.686064+00	2026-05-13 03:17:18.686064+00
a6fece37-91bc-45b6-ba07-fd46612ccf34	00000000-0000-0000-0000-00000000b004	00000000-0000-0000-0000-0000000000a1	tesoureiro	2026-05-13 03:17:18.686064+00	2026-05-13 03:17:18.686064+00
721eb7e7-979a-442a-a2d9-5172b9850e30	00000000-0000-0000-0000-00000000b005	00000000-0000-0000-0000-0000000000a1	contador	2026-05-13 03:17:18.686064+00	2026-05-13 03:17:18.686064+00
77ee9716-6276-4475-adae-8dfccdea050d	00000000-0000-0000-0000-00000000b006	00000000-0000-0000-0000-0000000000a1	pastor	2026-05-13 03:17:18.686064+00	2026-05-13 03:17:18.686064+00
c6c5c36a-ac9d-4afe-9ce6-488d2c69aa04	00000000-0000-0000-0000-00000000b007	00000000-0000-0000-0000-0000000000a1	secretary	2026-05-13 03:17:18.686064+00	2026-05-13 03:17:18.686064+00
c397784c-227e-457e-b87c-7849b77a1fed	00000000-0000-0000-0000-00000000b008	00000000-0000-0000-0000-0000000000a1	leader	2026-05-13 03:17:18.686064+00	2026-05-13 03:17:18.686064+00
4fe38b08-3365-43a8-b730-313067a0cf2f	00000000-0000-0000-0000-00000000b009	00000000-0000-0000-0000-0000000000a1	member	2026-05-13 03:17:18.686064+00	2026-05-13 03:17:18.686064+00
\.


--
-- Data for Name: worship_setlists; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.worship_setlists (id, organization_id, created_by, title, service_date, steps, created_at, updated_at) FROM stdin;
cccccccc-0000-0000-0000-000000000001	11111111-0000-0000-0000-000000000004	\N	Domingo Manhã	2026-06-07	[{"id": "s1", "type": "abertura", "title": "Abertura", "content": "Bem-vindos ao culto de adoração dominical."}, {"id": "s2", "type": "louvor", "title": "Sublime Graça", "songId": "bbbbbbbb-0000-0000-0000-000000000001", "content": ""}, {"id": "s3", "type": "louvor", "title": "Santo, Santo, Santo", "songId": "bbbbbbbb-0000-0000-0000-000000000002", "content": ""}, {"id": "s4", "type": "leitura", "title": "Leitura bíblica", "content": "Salmos 100"}, {"id": "s5", "type": "mensagem", "title": "Mensagem", "content": "Tema: A graça que transforma"}, {"id": "s6", "type": "encerramento", "title": "Encerramento", "content": "Oremos e recebam a bênção apostólica."}]	2026-06-04 19:03:25.657383+00	2026-06-04 19:03:25.657383+00
cccccccc-0000-0000-0000-000000000002	11111111-0000-0000-0000-000000000004	\N	Domingo Noite	2026-06-07	[{"id": "s1", "type": "abertura", "title": "Abertura", "content": "Culto da família — boa noite!"}, {"id": "s2", "type": "louvor", "title": "Grandioso És Tu", "songId": "bbbbbbbb-0000-0000-0000-000000000003", "content": ""}, {"id": "s3", "type": "louvor", "title": "Em Cristo Só", "songId": "bbbbbbbb-0000-0000-0000-000000000004", "content": ""}, {"id": "s4", "type": "oracao", "title": "Oração", "content": "Momento de intercessão pela família."}, {"id": "s5", "type": "mensagem", "title": "Mensagem", "content": "Tema: Famílias firmadas em Cristo"}, {"id": "s6", "type": "louvor", "title": "Teu Fiel Amor", "songId": "bbbbbbbb-0000-0000-0000-000000000005", "content": ""}, {"id": "s7", "type": "encerramento", "title": "Encerramento", "content": "Bênção e despedida."}]	2026-06-04 19:03:25.657383+00	2026-06-04 19:03:25.657383+00
cccccccc-0000-0000-0000-000000000003	11111111-0000-0000-0000-000000000004	\N	Santa Ceia	2026-06-14	[{"id": "s1", "type": "abertura", "title": "Abertura", "content": "Celebração da Santa Ceia do Senhor."}, {"id": "s2", "type": "louvor", "title": "Bendito Seja o Deus de Amor", "songId": "bbbbbbbb-0000-0000-0000-000000000006", "content": ""}, {"id": "s3", "type": "leitura", "title": "Leitura bíblica", "content": "1 Coríntios 11:23-26"}, {"id": "s4", "type": "oracao", "title": "Oração de preparação", "content": "Momento de examinar o coração."}, {"id": "s5", "type": "mensagem", "title": "Meditação", "content": "O significado da Ceia"}, {"id": "s6", "type": "louvor", "title": "Cristo Meu Mestre", "songId": "bbbbbbbb-0000-0000-0000-000000000007", "content": ""}, {"id": "s7", "type": "encerramento", "title": "Encerramento", "content": "Partilhem o pão e o cálice com reverência."}]	2026-06-04 19:03:25.657383+00	2026-06-04 19:03:25.657383+00
cccccccc-0000-0000-0000-000000000004	11111111-0000-0000-0000-000000000004	\N	Culto Jovem	2026-06-21	[{"id": "s1", "type": "abertura", "title": "Abertura", "content": "Culto dos jovens — sejam bem-vindos!"}, {"id": "s2", "type": "louvor", "title": "Canta Aleluia ao Senhor", "songId": "bbbbbbbb-0000-0000-0000-000000000008", "content": ""}, {"id": "s3", "type": "louvor", "title": "Quão Grande És Tu", "songId": "bbbbbbbb-0000-0000-0000-000000000009", "content": ""}, {"id": "s4", "type": "louvor", "title": "Vindo a Cristo", "songId": "bbbbbbbb-0000-0000-0000-000000000010", "content": ""}, {"id": "s5", "type": "mensagem", "title": "Mensagem", "content": "Tema: Jovens que brilham no mundo"}, {"id": "s6", "type": "encerramento", "title": "Encerramento", "content": "Oração final e convite."}]	2026-06-04 19:03:25.657383+00	2026-06-04 19:03:25.657383+00
eceff8d0-c527-4ce6-ace5-c7d891c979a8	11111111-0000-0000-0000-000000000004	3a7e972d-f9d5-417a-984c-3652d6c2f28f	teste	2026-06-08	[{"id": "9f307852-1e4b-47fc-be30-35da7dee4e76", "type": "abertura", "title": "Aberturateste", "content": "efg"}, {"id": "a3f9b83d-4597-4881-8b25-3f906a6b1275", "type": "oracao", "title": "Oração", "content": "teste"}, {"id": "1a512f23-5574-4dc1-ace5-b862c4992c54", "type": "louvor", "title": "Teste", "songId": "68115882-8177-453f-9b32-98f8911d20bb", "content": "teste"}, {"id": "7d9b942f-dde9-459b-9fe6-7d20674d8c80", "type": "leitura", "title": "Leitura bíblica", "content": "teste"}, {"id": "cf943e1b-9ab0-4eb9-be86-728796af0101", "type": "mensagem", "title": "Mensagem", "content": "teste"}, {"id": "99637b49-f15f-4ba2-8842-f1ca6d360128", "type": "encerramento", "title": "Encerramento", "content": "teste"}]	2026-06-04 20:38:09.908+00	2026-06-04 20:39:54.698746+00
\.


--
-- Data for Name: worship_songs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.worship_songs (id, organization_id, created_by, title, lyrics, musical_key, category, notes, created_at, updated_at) FROM stdin;
bbbbbbbb-0000-0000-0000-000000000001	11111111-0000-0000-0000-000000000004	\N	Sublime Graça	Sublime graça! Quão doce o som\nQue a um pecador como eu salvou!	G	Hino clássico	\N	2026-06-04 19:03:25.657383+00	2026-06-04 19:03:25.657383+00
bbbbbbbb-0000-0000-0000-000000000002	11111111-0000-0000-0000-000000000004	\N	Santo, Santo, Santo	Santo, Santo, Santo!\nSenhor onipotente!	D	Adoração	\N	2026-06-04 19:03:25.657383+00	2026-06-04 19:03:25.657383+00
bbbbbbbb-0000-0000-0000-000000000003	11111111-0000-0000-0000-000000000004	\N	Grandioso És Tu	Senhor, meu Deus, ao contemplar\nOs céus, o mar, a imensidão!	C	Adoração	\N	2026-06-04 19:03:25.657383+00	2026-06-04 19:03:25.657383+00
bbbbbbbb-0000-0000-0000-000000000004	11111111-0000-0000-0000-000000000004	\N	Em Cristo Só	Em Cristo só firmado estou,\nNão vacilo, pois nele confio!	A	Confiança	\N	2026-06-04 19:03:25.657383+00	2026-06-04 19:03:25.657383+00
bbbbbbbb-0000-0000-0000-000000000005	11111111-0000-0000-0000-000000000004	\N	Teu Fiel Amor	Teu fiel amor me guia neste vale escuro,\nNão temerei, pois estás comigo!	E	Consolo	\N	2026-06-04 19:03:25.657383+00	2026-06-04 19:03:25.657383+00
bbbbbbbb-0000-0000-0000-000000000006	11111111-0000-0000-0000-000000000004	\N	Bendito Seja o Deus de Amor	Bendito seja o Deus de amor,\nQue enviou seu Filho amado!	F	Gratidão	\N	2026-06-04 19:03:25.657383+00	2026-06-04 19:03:25.657383+00
bbbbbbbb-0000-0000-0000-000000000007	11111111-0000-0000-0000-000000000004	\N	Cristo Meu Mestre	Cristo, meu Mestre, guia-me sempre,\nEm tua luz eu quero caminhar!	Bb	Discipulado	\N	2026-06-04 19:03:25.657383+00	2026-06-04 19:03:25.657383+00
bbbbbbbb-0000-0000-0000-000000000008	11111111-0000-0000-0000-000000000004	\N	Canta Aleluia ao Senhor	Canta aleluia ao Senhor,\nExaltai o seu santo nome!	G	Louvor	\N	2026-06-04 19:03:25.657383+00	2026-06-04 19:03:25.657383+00
bbbbbbbb-0000-0000-0000-000000000009	11111111-0000-0000-0000-000000000004	\N	Quão Grande És Tu	Senhor, meu Deus, quando eu maravilhado\nContemplo toda a tua criação!	D	Adoração	\N	2026-06-04 19:03:25.657383+00	2026-06-04 19:03:25.657383+00
bbbbbbbb-0000-0000-0000-000000000010	11111111-0000-0000-0000-000000000004	\N	Vindo a Cristo	Vem a Cristo, vem agora,\nEle te chama com amor!	C	Convite	\N	2026-06-04 19:03:25.657383+00	2026-06-04 19:03:25.657383+00
68115882-8177-453f-9b32-98f8911d20bb	11111111-0000-0000-0000-000000000004	3a7e972d-f9d5-417a-984c-3652d6c2f28f	Teste	teste	ré	irmãs	teste	2026-06-04 20:32:46.293+00	2026-06-04 20:32:44.525227+00
\.


--
-- Name: access_invites access_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_pkey PRIMARY KEY (id);


--
-- Name: access_invites access_invites_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_token_key UNIQUE (token);


--
-- Name: administrative_requests administrative_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.administrative_requests
    ADD CONSTRAINT administrative_requests_pkey PRIMARY KEY (id);


--
-- Name: assemblies assemblies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assemblies
    ADD CONSTRAINT assemblies_pkey PRIMARY KEY (id);


--
-- Name: assembly_attachments assembly_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assembly_attachments
    ADD CONSTRAINT assembly_attachments_pkey PRIMARY KEY (id);


--
-- Name: campaign_contributions campaign_contributions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_contributions
    ADD CONSTRAINT campaign_contributions_pkey PRIMARY KEY (id);


--
-- Name: campaign_media campaign_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_media
    ADD CONSTRAINT campaign_media_pkey PRIMARY KEY (id);


--
-- Name: campaign_updates campaign_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_updates
    ADD CONSTRAINT campaign_updates_pkey PRIMARY KEY (id);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: communications communications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: finance_account_categories finance_account_categories_organization_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_account_categories
    ADD CONSTRAINT finance_account_categories_organization_id_code_key UNIQUE (organization_id, code);


--
-- Name: finance_account_categories finance_account_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_account_categories
    ADD CONSTRAINT finance_account_categories_pkey PRIMARY KEY (id);


--
-- Name: finance_accounts finance_accounts_organization_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_accounts
    ADD CONSTRAINT finance_accounts_organization_id_name_key UNIQUE (organization_id, name);


--
-- Name: finance_accounts finance_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_accounts
    ADD CONSTRAINT finance_accounts_pkey PRIMARY KEY (id);


--
-- Name: finance_cost_centers finance_cost_centers_organization_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_cost_centers
    ADD CONSTRAINT finance_cost_centers_organization_id_name_key UNIQUE (organization_id, name);


--
-- Name: finance_cost_centers finance_cost_centers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_cost_centers
    ADD CONSTRAINT finance_cost_centers_pkey PRIMARY KEY (id);


--
-- Name: finance_monthly_closings finance_monthly_closings_organization_id_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_monthly_closings
    ADD CONSTRAINT finance_monthly_closings_organization_id_month_key UNIQUE (organization_id, month);


--
-- Name: finance_monthly_closings finance_monthly_closings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_monthly_closings
    ADD CONSTRAINT finance_monthly_closings_pkey PRIMARY KEY (id);


--
-- Name: finance_transaction_audit_logs finance_transaction_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_transaction_audit_logs
    ADD CONSTRAINT finance_transaction_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: group_members group_members_group_id_member_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_group_id_member_id_key UNIQUE (group_id, member_id);


--
-- Name: group_members group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_pkey PRIMARY KEY (id);


--
-- Name: group_messages group_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_messages
    ADD CONSTRAINT group_messages_pkey PRIMARY KEY (id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: internal_message_attachments internal_message_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_message_attachments
    ADD CONSTRAINT internal_message_attachments_pkey PRIMARY KEY (id);


--
-- Name: internal_messages internal_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_messages
    ADD CONSTRAINT internal_messages_pkey PRIMARY KEY (id);


--
-- Name: internal_threads internal_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_threads
    ADD CONSTRAINT internal_threads_pkey PRIMARY KEY (id);


--
-- Name: member_invites member_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_invites
    ADD CONSTRAINT member_invites_pkey PRIMARY KEY (id);


--
-- Name: member_invites member_invites_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_invites
    ADD CONSTRAINT member_invites_token_key UNIQUE (token);


--
-- Name: members members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_pkey PRIMARY KEY (id);


--
-- Name: organization_affiliations organization_affiliations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_affiliations
    ADD CONSTRAINT organization_affiliations_pkey PRIMARY KEY (id);


--
-- Name: organization_hierarchy_rules organization_hierarchy_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_hierarchy_rules
    ADD CONSTRAINT organization_hierarchy_rules_pkey PRIMARY KEY (id);


--
-- Name: organization_responsibles organization_responsibles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_responsibles
    ADD CONSTRAINT organization_responsibles_pkey PRIMARY KEY (id);


--
-- Name: organization_users organization_users_organization_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_organization_id_user_id_key UNIQUE (organization_id, user_id);


--
-- Name: organization_users organization_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_slug_key UNIQUE (slug);


--
-- Name: platform_announcements platform_announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_announcements
    ADD CONSTRAINT platform_announcements_pkey PRIMARY KEY (id);


--
-- Name: platform_support_agent_departments platform_support_agent_departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_support_agent_departments
    ADD CONSTRAINT platform_support_agent_departments_pkey PRIMARY KEY (id);


--
-- Name: platform_support_agent_departments platform_support_agent_departments_user_department_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_support_agent_departments
    ADD CONSTRAINT platform_support_agent_departments_user_department_key UNIQUE (agent_user_id, department_id);


--
-- Name: platform_support_agent_presence platform_support_agent_presence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_support_agent_presence
    ADD CONSTRAINT platform_support_agent_presence_pkey PRIMARY KEY (id);


--
-- Name: platform_support_agents platform_support_agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_support_agents
    ADD CONSTRAINT platform_support_agents_pkey PRIMARY KEY (id);


--
-- Name: platform_support_agents platform_support_agents_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_support_agents
    ADD CONSTRAINT platform_support_agents_user_id_key UNIQUE (user_id);


--
-- Name: platform_support_audit_logs platform_support_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_support_audit_logs
    ADD CONSTRAINT platform_support_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: platform_support_departments platform_support_departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_support_departments
    ADD CONSTRAINT platform_support_departments_pkey PRIMARY KEY (id);


--
-- Name: platform_support_departments platform_support_departments_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_support_departments
    ADD CONSTRAINT platform_support_departments_slug_key UNIQUE (slug);


--
-- Name: platform_support_permissions platform_support_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_support_permissions
    ADD CONSTRAINT platform_support_permissions_pkey PRIMARY KEY (id);


--
-- Name: platform_support_permissions platform_support_permissions_role_module_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_support_permissions
    ADD CONSTRAINT platform_support_permissions_role_module_key UNIQUE (platform_role, module_key);


--
-- Name: platform_support_ticket_events platform_support_ticket_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_support_ticket_events
    ADD CONSTRAINT platform_support_ticket_events_pkey PRIMARY KEY (id);


--
-- Name: platform_support_tickets platform_support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_support_tickets
    ADD CONSTRAINT platform_support_tickets_pkey PRIMARY KEY (id);


--
-- Name: prayer_requests prayer_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prayer_requests
    ADD CONSTRAINT prayer_requests_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);


--
-- Name: recommendation_letters recommendation_letters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendation_letters
    ADD CONSTRAINT recommendation_letters_pkey PRIMARY KEY (id);


--
-- Name: schedule_assignments schedule_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_assignments
    ADD CONSTRAINT schedule_assignments_pkey PRIMARY KEY (id);


--
-- Name: schedule_assignments schedule_assignments_schedule_id_member_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_assignments
    ADD CONSTRAINT schedule_assignments_schedule_id_member_id_role_key UNIQUE (schedule_id, member_id, role);


--
-- Name: schedules schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: organization_hierarchy_rules uq_hierarchy_rule; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_hierarchy_rules
    ADD CONSTRAINT uq_hierarchy_rule UNIQUE (parent_type, child_type);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_organization_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_organization_id_role_key UNIQUE (user_id, organization_id, role);


--
-- Name: worship_setlists worship_setlists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worship_setlists
    ADD CONSTRAINT worship_setlists_pkey PRIMARY KEY (id);


--
-- Name: worship_songs worship_songs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worship_songs
    ADD CONSTRAINT worship_songs_pkey PRIMARY KEY (id);


--
-- Name: idx_access_invites_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_access_invites_org ON public.access_invites USING btree (organization_id);


--
-- Name: idx_access_invites_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_access_invites_status ON public.access_invites USING btree (status);


--
-- Name: idx_access_invites_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_access_invites_token ON public.access_invites USING btree (token);


--
-- Name: idx_admin_requests_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_requests_org_created ON public.administrative_requests USING btree (organization_id, created_at DESC);


--
-- Name: idx_admin_requests_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_requests_org_status ON public.administrative_requests USING btree (organization_id, status);


--
-- Name: idx_assemblies_org_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assemblies_org_date ON public.assemblies USING btree (organization_id, assembly_date DESC);


--
-- Name: idx_assembly_attachments_assembly_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assembly_attachments_assembly_id ON public.assembly_attachments USING btree (assembly_id);


--
-- Name: idx_campaign_contributions_campaign_contributed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_contributions_campaign_contributed ON public.campaign_contributions USING btree (campaign_id, contributed_at DESC);


--
-- Name: idx_campaign_contributions_org_contributed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_contributions_org_contributed ON public.campaign_contributions USING btree (organization_id, contributed_at DESC);


--
-- Name: idx_campaign_contributions_transaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_contributions_transaction ON public.campaign_contributions USING btree (transaction_id);


--
-- Name: idx_campaign_media_campaign_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_media_campaign_sort ON public.campaign_media USING btree (campaign_id, sort_order);


--
-- Name: idx_campaign_media_cover; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_media_cover ON public.campaign_media USING btree (campaign_id) WHERE (is_cover = true);


--
-- Name: idx_campaign_media_one_cover; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_campaign_media_one_cover ON public.campaign_media USING btree (campaign_id) WHERE (is_cover = true);


--
-- Name: idx_campaign_media_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_media_org_created ON public.campaign_media USING btree (organization_id, created_at DESC);


--
-- Name: idx_campaign_updates_campaign_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_updates_campaign_created ON public.campaign_updates USING btree (campaign_id, created_at DESC);


--
-- Name: idx_campaigns_end_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_end_date ON public.campaigns USING btree (end_date);


--
-- Name: idx_campaigns_org_featured; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_org_featured ON public.campaigns USING btree (organization_id) WHERE (is_featured = true);


--
-- Name: idx_campaigns_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_org_status ON public.campaigns USING btree (organization_id, status);


--
-- Name: idx_communications_org_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_communications_org_published ON public.communications USING btree (organization_id, published_at DESC NULLS LAST);


--
-- Name: idx_documents_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_org_created ON public.documents USING btree (organization_id, created_at DESC);


--
-- Name: idx_documents_org_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_org_type ON public.documents USING btree (organization_id, document_type);


--
-- Name: idx_events_org_starts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_org_starts ON public.events USING btree (organization_id, starts_at);


--
-- Name: idx_finance_accounts_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_accounts_org ON public.finance_accounts USING btree (organization_id);


--
-- Name: idx_finance_audit_org_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_audit_org_date ON public.finance_transaction_audit_logs USING btree (organization_id, changed_at DESC);


--
-- Name: idx_finance_categories_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_categories_org ON public.finance_account_categories USING btree (organization_id);


--
-- Name: idx_finance_cost_centers_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_cost_centers_org ON public.finance_cost_centers USING btree (organization_id);


--
-- Name: idx_group_members_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_members_group_id ON public.group_members USING btree (group_id);


--
-- Name: idx_group_members_member_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_members_member_id ON public.group_members USING btree (member_id);


--
-- Name: idx_group_members_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_members_role ON public.group_members USING btree (role);


--
-- Name: idx_group_messages_author_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_messages_author_user_id ON public.group_messages USING btree (author_user_id);


--
-- Name: idx_group_messages_group_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_messages_group_created ON public.group_messages USING btree (group_id, created_at DESC);


--
-- Name: idx_groups_org_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_groups_org_name ON public.groups USING btree (organization_id, name);


--
-- Name: idx_internal_message_attachments_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_internal_message_attachments_message ON public.internal_message_attachments USING btree (message_id);


--
-- Name: idx_internal_message_attachments_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_internal_message_attachments_thread ON public.internal_message_attachments USING btree (thread_id);


--
-- Name: idx_internal_messages_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_internal_messages_org_created ON public.internal_messages USING btree (organization_id, created_at DESC);


--
-- Name: idx_internal_messages_thread_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_internal_messages_thread_created ON public.internal_messages USING btree (thread_id, created_at);


--
-- Name: idx_internal_threads_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_internal_threads_campaign ON public.internal_threads USING btree (campaign_id) WHERE (campaign_id IS NOT NULL);


--
-- Name: idx_internal_threads_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_internal_threads_created_by ON public.internal_threads USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_internal_threads_org_last_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_internal_threads_org_last_message ON public.internal_threads USING btree (organization_id, last_message_at DESC NULLS LAST);


--
-- Name: idx_internal_threads_org_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_internal_threads_org_source ON public.internal_threads USING btree (organization_id, source);


--
-- Name: idx_member_invites_member_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_invites_member_id ON public.member_invites USING btree (member_id);


--
-- Name: idx_member_invites_organization; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_invites_organization ON public.member_invites USING btree (organization_id);


--
-- Name: idx_member_invites_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_invites_token ON public.member_invites USING btree (token);


--
-- Name: idx_members_org_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_members_org_name ON public.members USING btree (organization_id, full_name);


--
-- Name: idx_members_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_members_org_status ON public.members USING btree (organization_id, status);


--
-- Name: idx_members_org_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_members_org_user_id ON public.members USING btree (organization_id, user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_org_affiliations_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_affiliations_active ON public.organization_affiliations USING btree (organization_id, is_active);


--
-- Name: idx_org_affiliations_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_affiliations_org_id ON public.organization_affiliations USING btree (organization_id);


--
-- Name: idx_org_affiliations_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_affiliations_type ON public.organization_affiliations USING btree (affiliation_type);


--
-- Name: idx_org_resp_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_resp_org_id ON public.organization_responsibles USING btree (organization_id);


--
-- Name: idx_org_resp_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_resp_type ON public.organization_responsibles USING btree (responsibility_type);


--
-- Name: idx_org_resp_unique_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_org_resp_unique_active ON public.organization_responsibles USING btree (organization_id, responsibility_type) WHERE (is_active = true);


--
-- Name: idx_org_resp_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_resp_user_id ON public.organization_responsibles USING btree (user_id);


--
-- Name: idx_org_users_user_org_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_users_user_org_active ON public.organization_users USING btree (user_id, organization_id) WHERE (is_active = true);


--
-- Name: idx_organization_users_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_users_organization_id ON public.organization_users USING btree (organization_id);


--
-- Name: idx_organization_users_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_users_user_id ON public.organization_users USING btree (user_id);


--
-- Name: idx_organizations_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizations_active ON public.organizations USING btree (active);


--
-- Name: idx_organizations_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizations_parent_id ON public.organizations USING btree (parent_id);


--
-- Name: idx_platform_announcements_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_announcements_active ON public.platform_announcements USING btree (is_active, starts_at DESC NULLS LAST);


--
-- Name: idx_platform_support_agent_departments_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_support_agent_departments_department ON public.platform_support_agent_departments USING btree (department_id);


--
-- Name: idx_platform_support_agent_departments_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_support_agent_departments_user ON public.platform_support_agent_departments USING btree (agent_user_id);


--
-- Name: idx_platform_support_agent_presence_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_support_agent_presence_user_id ON public.platform_support_agent_presence USING btree (user_id);


--
-- Name: idx_platform_support_agents_platform_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_support_agents_platform_role ON public.platform_support_agents USING btree (platform_role);


--
-- Name: idx_platform_support_agents_primary_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_support_agents_primary_department ON public.platform_support_agents USING btree (primary_department_id);


--
-- Name: idx_platform_support_agents_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_support_agents_user_id ON public.platform_support_agents USING btree (user_id);


--
-- Name: idx_platform_support_audit_logs_actor_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_support_audit_logs_actor_user_id ON public.platform_support_audit_logs USING btree (actor_user_id);


--
-- Name: idx_platform_support_audit_logs_target_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_support_audit_logs_target_organization_id ON public.platform_support_audit_logs USING btree (target_organization_id);


--
-- Name: idx_platform_support_audit_logs_ticket_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_support_audit_logs_ticket_id ON public.platform_support_audit_logs USING btree (ticket_id);


--
-- Name: idx_platform_support_departments_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_support_departments_active ON public.platform_support_departments USING btree (is_active);


--
-- Name: idx_platform_support_departments_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_support_departments_slug ON public.platform_support_departments USING btree (slug);


--
-- Name: idx_platform_support_ticket_events_ticket_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_support_ticket_events_ticket_id ON public.platform_support_ticket_events USING btree (ticket_id);


--
-- Name: idx_platform_support_tickets_assigned_to_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_support_tickets_assigned_to_user_id ON public.platform_support_tickets USING btree (assigned_to_user_id);


--
-- Name: idx_platform_support_tickets_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_support_tickets_department ON public.platform_support_tickets USING btree (department);


--
-- Name: idx_platform_support_tickets_department_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_support_tickets_department_id ON public.platform_support_tickets USING btree (department_id);


--
-- Name: idx_platform_support_tickets_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_support_tickets_organization_id ON public.platform_support_tickets USING btree (organization_id);


--
-- Name: idx_platform_support_tickets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_support_tickets_status ON public.platform_support_tickets USING btree (status);


--
-- Name: idx_prayer_requests_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prayer_requests_org_created ON public.prayer_requests USING btree (organization_id, created_at DESC);


--
-- Name: idx_profiles_platform_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_platform_role ON public.profiles USING btree (platform_role);


--
-- Name: idx_profiles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_user_id ON public.profiles USING btree (user_id);


--
-- Name: idx_recommendation_letters_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendation_letters_member ON public.recommendation_letters USING btree (member_id);


--
-- Name: idx_recommendation_letters_org_requested; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendation_letters_org_requested ON public.recommendation_letters USING btree (organization_id, requested_at DESC);


--
-- Name: idx_recommendation_letters_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendation_letters_org_status ON public.recommendation_letters USING btree (organization_id, status);


--
-- Name: idx_recommendation_letters_public_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_recommendation_letters_public_token ON public.recommendation_letters USING btree (public_token);


--
-- Name: idx_schedule_assignments_member_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_assignments_member_id ON public.schedule_assignments USING btree (member_id);


--
-- Name: idx_schedule_assignments_schedule_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_assignments_schedule_id ON public.schedule_assignments USING btree (schedule_id);


--
-- Name: idx_schedule_assignments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_assignments_status ON public.schedule_assignments USING btree (status);


--
-- Name: idx_schedules_org_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedules_org_date ON public.schedules USING btree (organization_id, schedule_date);


--
-- Name: idx_schedules_org_ministry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedules_org_ministry ON public.schedules USING btree (organization_id, ministry);


--
-- Name: idx_transactions_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_campaign_id ON public.transactions USING btree (campaign_id);


--
-- Name: idx_transactions_cost_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_cost_center ON public.transactions USING btree (cost_center_id);


--
-- Name: idx_transactions_finance_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_finance_account ON public.transactions USING btree (financial_account_id);


--
-- Name: idx_transactions_organization_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_organization_date ON public.transactions USING btree (organization_id, date);


--
-- Name: idx_user_roles_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_organization_id ON public.user_roles USING btree (organization_id);


--
-- Name: idx_user_roles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_user_id ON public.user_roles USING btree (user_id);


--
-- Name: idx_worship_setlists_org_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_worship_setlists_org_date ON public.worship_setlists USING btree (organization_id, service_date DESC NULLS LAST);


--
-- Name: idx_worship_setlists_org_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_worship_setlists_org_updated ON public.worship_setlists USING btree (organization_id, updated_at DESC);


--
-- Name: idx_worship_songs_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_worship_songs_org_created ON public.worship_songs USING btree (organization_id, created_at DESC);


--
-- Name: uniq_campaigns_featured_per_org; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_campaigns_featured_per_org ON public.campaigns USING btree (organization_id) WHERE (is_featured = true);


--
-- Name: uniq_internal_threads_campaign_single; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_internal_threads_campaign_single ON public.internal_threads USING btree (campaign_id) WHERE ((campaign_id IS NOT NULL) AND (source = 'campaign'::text));


--
-- Name: transactions audit_finance_transaction_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_finance_transaction_trigger AFTER INSERT OR DELETE OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.audit_finance_transaction();


--
-- Name: campaign_contributions campaign_contributions_refresh_raised; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER campaign_contributions_refresh_raised AFTER INSERT OR DELETE OR UPDATE ON public.campaign_contributions FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_campaign_raised_amount();


--
-- Name: campaigns campaigns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: transactions guard_closed_finance_month_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_closed_finance_month_trigger BEFORE INSERT OR DELETE OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.guard_closed_finance_month();


--
-- Name: internal_messages internal_messages_touch_thread; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER internal_messages_touch_thread AFTER INSERT ON public.internal_messages FOR EACH ROW EXECUTE FUNCTION public.touch_internal_thread_last_message();


--
-- Name: organizations seed_finance_defaults_on_organization; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER seed_finance_defaults_on_organization AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.seed_finance_defaults_for_org();


--
-- Name: administrative_requests update_administrative_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_administrative_requests_updated_at BEFORE UPDATE ON public.administrative_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: assemblies update_assemblies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_assemblies_updated_at BEFORE UPDATE ON public.assemblies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: communications update_communications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_communications_updated_at BEFORE UPDATE ON public.communications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: documents update_documents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: events update_events_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: groups update_groups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: internal_threads update_internal_threads_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_internal_threads_updated_at BEFORE UPDATE ON public.internal_threads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: members update_members_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_members_updated_at BEFORE UPDATE ON public.members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: organization_users update_organization_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_organization_users_updated_at BEFORE UPDATE ON public.organization_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: organizations update_organizations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: platform_announcements update_platform_announcements_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_platform_announcements_updated_at BEFORE UPDATE ON public.platform_announcements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: prayer_requests update_prayer_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_prayer_requests_updated_at BEFORE UPDATE ON public.prayer_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: recommendation_letters update_recommendation_letters_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_recommendation_letters_updated_at BEFORE UPDATE ON public.recommendation_letters FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: schedule_assignments update_schedule_assignments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_schedule_assignments_updated_at BEFORE UPDATE ON public.schedule_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: schedules update_schedules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON public.schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_roles update_user_roles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_roles_updated_at BEFORE UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: worship_setlists update_worship_setlists_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_worship_setlists_updated_at BEFORE UPDATE ON public.worship_setlists FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: worship_songs update_worship_songs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_worship_songs_updated_at BEFORE UPDATE ON public.worship_songs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: access_invites access_invites_accepted_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_accepted_user_id_fkey FOREIGN KEY (accepted_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: access_invites access_invites_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: access_invites access_invites_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: administrative_requests administrative_requests_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.administrative_requests
    ADD CONSTRAINT administrative_requests_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: administrative_requests administrative_requests_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.administrative_requests
    ADD CONSTRAINT administrative_requests_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE SET NULL;


--
-- Name: administrative_requests administrative_requests_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.administrative_requests
    ADD CONSTRAINT administrative_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: assemblies assemblies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assemblies
    ADD CONSTRAINT assemblies_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: assemblies assemblies_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assemblies
    ADD CONSTRAINT assemblies_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: assembly_attachments assembly_attachments_assembly_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assembly_attachments
    ADD CONSTRAINT assembly_attachments_assembly_id_fkey FOREIGN KEY (assembly_id) REFERENCES public.assemblies(id) ON DELETE CASCADE;


--
-- Name: campaign_contributions campaign_contributions_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_contributions
    ADD CONSTRAINT campaign_contributions_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_contributions campaign_contributions_contributed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_contributions
    ADD CONSTRAINT campaign_contributions_contributed_by_fkey FOREIGN KEY (contributed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: campaign_contributions campaign_contributions_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_contributions
    ADD CONSTRAINT campaign_contributions_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE SET NULL;


--
-- Name: campaign_contributions campaign_contributions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_contributions
    ADD CONSTRAINT campaign_contributions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: campaign_contributions campaign_contributions_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_contributions
    ADD CONSTRAINT campaign_contributions_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE SET NULL;


--
-- Name: campaign_media campaign_media_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_media
    ADD CONSTRAINT campaign_media_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_media campaign_media_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_media
    ADD CONSTRAINT campaign_media_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: campaign_media campaign_media_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_media
    ADD CONSTRAINT campaign_media_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: campaign_updates campaign_updates_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_updates
    ADD CONSTRAINT campaign_updates_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_updates campaign_updates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_updates
    ADD CONSTRAINT campaign_updates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: campaign_updates campaign_updates_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_updates
    ADD CONSTRAINT campaign_updates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: campaigns campaigns_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: campaigns campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: campaigns campaigns_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: communications communications_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: communications communications_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: documents documents_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: documents documents_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: events events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: events events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: finance_account_categories finance_account_categories_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_account_categories
    ADD CONSTRAINT finance_account_categories_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: finance_accounts finance_accounts_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_accounts
    ADD CONSTRAINT finance_accounts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: finance_cost_centers finance_cost_centers_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_cost_centers
    ADD CONSTRAINT finance_cost_centers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: finance_monthly_closings finance_monthly_closings_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_monthly_closings
    ADD CONSTRAINT finance_monthly_closings_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: finance_monthly_closings finance_monthly_closings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_monthly_closings
    ADD CONSTRAINT finance_monthly_closings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: finance_transaction_audit_logs finance_transaction_audit_logs_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_transaction_audit_logs
    ADD CONSTRAINT finance_transaction_audit_logs_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: finance_transaction_audit_logs finance_transaction_audit_logs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_transaction_audit_logs
    ADD CONSTRAINT finance_transaction_audit_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: finance_transaction_audit_logs finance_transaction_audit_logs_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_transaction_audit_logs
    ADD CONSTRAINT finance_transaction_audit_logs_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;


--
-- Name: group_members group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: group_members group_members_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;


--
-- Name: group_messages group_messages_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_messages
    ADD CONSTRAINT group_messages_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: group_messages group_messages_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_messages
    ADD CONSTRAINT group_messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: groups groups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: groups groups_leader_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_leader_member_id_fkey FOREIGN KEY (leader_member_id) REFERENCES public.members(id) ON DELETE SET NULL;


--
-- Name: groups groups_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: internal_message_attachments internal_message_attachments_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_message_attachments
    ADD CONSTRAINT internal_message_attachments_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.internal_messages(id) ON DELETE CASCADE;


--
-- Name: internal_message_attachments internal_message_attachments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_message_attachments
    ADD CONSTRAINT internal_message_attachments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: internal_message_attachments internal_message_attachments_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_message_attachments
    ADD CONSTRAINT internal_message_attachments_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.internal_threads(id) ON DELETE CASCADE;


--
-- Name: internal_message_attachments internal_message_attachments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_message_attachments
    ADD CONSTRAINT internal_message_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: internal_messages internal_messages_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_messages
    ADD CONSTRAINT internal_messages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: internal_messages internal_messages_reply_to_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_messages
    ADD CONSTRAINT internal_messages_reply_to_message_id_fkey FOREIGN KEY (reply_to_message_id) REFERENCES public.internal_messages(id) ON DELETE SET NULL;


--
-- Name: internal_messages internal_messages_sender_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_messages
    ADD CONSTRAINT internal_messages_sender_member_id_fkey FOREIGN KEY (sender_member_id) REFERENCES public.members(id) ON DELETE SET NULL;


--
-- Name: internal_messages internal_messages_sender_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_messages
    ADD CONSTRAINT internal_messages_sender_user_id_fkey FOREIGN KEY (sender_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: internal_messages internal_messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_messages
    ADD CONSTRAINT internal_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.internal_threads(id) ON DELETE CASCADE;


--
-- Name: internal_threads internal_threads_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_threads
    ADD CONSTRAINT internal_threads_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: internal_threads internal_threads_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_threads
    ADD CONSTRAINT internal_threads_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- Name: internal_threads internal_threads_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_threads
    ADD CONSTRAINT internal_threads_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: internal_threads internal_threads_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_threads
    ADD CONSTRAINT internal_threads_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE SET NULL;


--
-- Name: internal_threads internal_threads_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_threads
    ADD CONSTRAINT internal_threads_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: member_invites member_invites_accepted_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_invites
    ADD CONSTRAINT member_invites_accepted_user_id_fkey FOREIGN KEY (accepted_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: member_invites member_invites_congregation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_invites
    ADD CONSTRAINT member_invites_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: member_invites member_invites_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_invites
    ADD CONSTRAINT member_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: member_invites member_invites_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_invites
    ADD CONSTRAINT member_invites_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;


--
-- Name: member_invites member_invites_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_invites
    ADD CONSTRAINT member_invites_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: member_invites member_invites_sector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_invites
    ADD CONSTRAINT member_invites_sector_id_fkey FOREIGN KEY (sector_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: members members_civil_document_validated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_civil_document_validated_by_fkey FOREIGN KEY (civil_document_validated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: members members_congregation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: members members_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: members members_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: members members_sector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_sector_id_fkey FOREIGN KEY (sector_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: members members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: organization_affiliations organization_affiliations_affiliated_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_affiliations
    ADD CONSTRAINT organization_affiliations_affiliated_organization_id_fkey FOREIGN KEY (affiliated_organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: organization_affiliations organization_affiliations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_affiliations
    ADD CONSTRAINT organization_affiliations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_responsibles organization_responsibles_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_responsibles
    ADD CONSTRAINT organization_responsibles_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: organization_responsibles organization_responsibles_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_responsibles
    ADD CONSTRAINT organization_responsibles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_responsibles organization_responsibles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_responsibles
    ADD CONSTRAINT organization_responsibles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: organization_users organization_users_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_users organization_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: organizations organizations_financially_consolidates_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_financially_consolidates_to_id_fkey FOREIGN KEY (financially_consolidates_to_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: organizations organizations_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: platform_announcements platform_announcements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_announcements
    ADD CONSTRAINT platform_announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: platform_announcements platform_announcements_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_announcements
    ADD CONSTRAINT platform_announcements_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: platform_support_agent_departments platform_support_agent_departments_agent_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_support_agent_departments
    ADD CONSTRAINT platform_support_agent_departments_agent_user_id_fkey FOREIGN KEY (agent_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: platform_support_agent_departments platform_support_agent_departments_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_support_agent_departments
    ADD CONSTRAINT platform_support_agent_departments_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.platform_support_departments(id) ON DELETE CASCADE;


--
-- Name: platform_support_agent_presence platform_support_agent_presence_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_support_agent_presence
    ADD CONSTRAINT platform_support_agent_presence_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: platform_support_agents platform_support_agents_primary_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_support_agents
    ADD CONSTRAINT platform_support_agents_primary_department_id_fkey FOREIGN KEY (primary_department_id) REFERENCES public.platform_support_departments(id) ON DELETE SET NULL;


--
-- Name: platform_support_agents platform_support_agents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_support_agents
    ADD CONSTRAINT platform_support_agents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: platform_support_audit_logs platform_support_audit_logs_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_support_audit_logs
    ADD CONSTRAINT platform_support_audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: platform_support_audit_logs platform_support_audit_logs_target_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_support_audit_logs
    ADD CONSTRAINT platform_support_audit_logs_target_organization_id_fkey FOREIGN KEY (target_organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: platform_support_audit_logs platform_support_audit_logs_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_support_audit_logs
    ADD CONSTRAINT platform_support_audit_logs_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.platform_support_tickets(id) ON DELETE SET NULL;


--
-- Name: platform_support_ticket_events platform_support_ticket_events_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_support_ticket_events
    ADD CONSTRAINT platform_support_ticket_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: platform_support_ticket_events platform_support_ticket_events_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_support_ticket_events
    ADD CONSTRAINT platform_support_ticket_events_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.platform_support_tickets(id) ON DELETE CASCADE;


--
-- Name: platform_support_tickets platform_support_tickets_assigned_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_support_tickets
    ADD CONSTRAINT platform_support_tickets_assigned_to_user_id_fkey FOREIGN KEY (assigned_to_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: platform_support_tickets platform_support_tickets_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_support_tickets
    ADD CONSTRAINT platform_support_tickets_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.platform_support_departments(id) ON DELETE SET NULL;


--
-- Name: platform_support_tickets platform_support_tickets_opened_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_support_tickets
    ADD CONSTRAINT platform_support_tickets_opened_by_user_id_fkey FOREIGN KEY (opened_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: platform_support_tickets platform_support_tickets_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_support_tickets
    ADD CONSTRAINT platform_support_tickets_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: prayer_requests prayer_requests_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prayer_requests
    ADD CONSTRAINT prayer_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: prayer_requests prayer_requests_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prayer_requests
    ADD CONSTRAINT prayer_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: prayer_requests prayer_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prayer_requests
    ADD CONSTRAINT prayer_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: recommendation_letters recommendation_letters_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendation_letters
    ADD CONSTRAINT recommendation_letters_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: recommendation_letters recommendation_letters_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendation_letters
    ADD CONSTRAINT recommendation_letters_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: recommendation_letters recommendation_letters_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendation_letters
    ADD CONSTRAINT recommendation_letters_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: schedule_assignments schedule_assignments_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_assignments
    ADD CONSTRAINT schedule_assignments_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;


--
-- Name: schedule_assignments schedule_assignments_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_assignments
    ADD CONSTRAINT schedule_assignments_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.schedules(id) ON DELETE CASCADE;


--
-- Name: schedules schedules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: schedules schedules_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_account_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_account_category_id_fkey FOREIGN KEY (account_category_id) REFERENCES public.finance_account_categories(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_cost_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_cost_center_id_fkey FOREIGN KEY (cost_center_id) REFERENCES public.finance_cost_centers(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_financial_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_financial_account_id_fkey FOREIGN KEY (financial_account_id) REFERENCES public.finance_accounts(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_responsible_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_responsible_id_fkey FOREIGN KEY (responsible_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: worship_setlists worship_setlists_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worship_setlists
    ADD CONSTRAINT worship_setlists_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: worship_setlists worship_setlists_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worship_setlists
    ADD CONSTRAINT worship_setlists_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: worship_songs worship_songs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worship_songs
    ADD CONSTRAINT worship_songs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: worship_songs worship_songs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worship_songs
    ADD CONSTRAINT worship_songs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: access_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.access_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: access_invites access_invites admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "access_invites admin insert" ON public.access_invites FOR INSERT TO authenticated WITH CHECK (public.can_admin_organization(auth.uid(), organization_id));


--
-- Name: access_invites access_invites admin select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "access_invites admin select" ON public.access_invites FOR SELECT TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text]));


--
-- Name: access_invites access_invites admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "access_invites admin update" ON public.access_invites FOR UPDATE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text]));


--
-- Name: access_invites access_invites hierarchy admin select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "access_invites hierarchy admin select" ON public.access_invites FOR SELECT TO authenticated USING (public.can_admin_organization(auth.uid(), organization_id));


--
-- Name: access_invites access_invites hierarchy admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "access_invites hierarchy admin update" ON public.access_invites FOR UPDATE TO authenticated USING (public.can_admin_organization(auth.uid(), organization_id)) WITH CHECK (public.can_admin_organization(auth.uid(), organization_id));


--
-- Name: administrative_requests admin_requests_org_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_requests_org_delete ON public.administrative_requests FOR DELETE USING ((organization_id IN ( SELECT organization_users.organization_id
   FROM public.organization_users
  WHERE ((organization_users.user_id = auth.uid()) AND (organization_users.is_active = true)))));


--
-- Name: administrative_requests admin_requests_org_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_requests_org_read ON public.administrative_requests FOR SELECT USING ((organization_id IN ( SELECT organization_users.organization_id
   FROM public.organization_users
  WHERE ((organization_users.user_id = auth.uid()) AND (organization_users.is_active = true)))));


--
-- Name: administrative_requests admin_requests_org_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_requests_org_update ON public.administrative_requests FOR UPDATE USING ((organization_id IN ( SELECT organization_users.organization_id
   FROM public.organization_users
  WHERE ((organization_users.user_id = auth.uid()) AND (organization_users.is_active = true)))));


--
-- Name: administrative_requests admin_requests_org_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_requests_org_write ON public.administrative_requests FOR INSERT WITH CHECK ((organization_id IN ( SELECT organization_users.organization_id
   FROM public.organization_users
  WHERE ((organization_users.user_id = auth.uid()) AND (organization_users.is_active = true)))));


--
-- Name: administrative_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.administrative_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_affiliations affiliations delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "affiliations delete" ON public.organization_affiliations FOR DELETE TO authenticated USING (public.can_admin_organization(auth.uid(), organization_id));


--
-- Name: organization_affiliations affiliations insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "affiliations insert" ON public.organization_affiliations FOR INSERT TO authenticated WITH CHECK (public.can_admin_organization(auth.uid(), organization_id));


--
-- Name: organization_affiliations affiliations read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "affiliations read" ON public.organization_affiliations FOR SELECT TO authenticated USING (public.can_read_organization(auth.uid(), organization_id));


--
-- Name: organization_affiliations affiliations update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "affiliations update" ON public.organization_affiliations FOR UPDATE TO authenticated USING (public.can_admin_organization(auth.uid(), organization_id));


--
-- Name: assemblies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assemblies ENABLE ROW LEVEL SECURITY;

--
-- Name: assemblies assemblies org members read visible; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "assemblies org members read visible" ON public.assemblies FOR SELECT TO authenticated USING (((organization_id IS NOT NULL) AND public.is_org_user(auth.uid(), organization_id) AND (COALESCE(is_visible, false) = true) AND (NOT public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text])) AND (NOT public.is_platform_admin(auth.uid()))));


--
-- Name: assemblies assemblies org staff delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "assemblies org staff delete" ON public.assemblies FOR DELETE TO authenticated USING ((public.is_platform_admin(auth.uid()) OR ((organization_id IS NOT NULL) AND public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text]))));


--
-- Name: assemblies assemblies org staff insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "assemblies org staff insert" ON public.assemblies FOR INSERT TO authenticated WITH CHECK ((public.is_platform_admin(auth.uid()) OR ((organization_id IS NOT NULL) AND public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]))));


--
-- Name: assemblies assemblies org staff read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "assemblies org staff read" ON public.assemblies FOR SELECT TO authenticated USING ((public.is_platform_admin(auth.uid()) OR ((organization_id IS NOT NULL) AND public.is_org_user(auth.uid(), organization_id) AND public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]))));


--
-- Name: assemblies assemblies org staff update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "assemblies org staff update" ON public.assemblies FOR UPDATE TO authenticated USING ((public.is_platform_admin(auth.uid()) OR ((organization_id IS NOT NULL) AND public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text])))) WITH CHECK ((public.is_platform_admin(auth.uid()) OR ((organization_id IS NOT NULL) AND public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]))));


--
-- Name: assembly_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assembly_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: assembly_attachments assembly_attachments org members read visible; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "assembly_attachments org members read visible" ON public.assembly_attachments FOR SELECT TO authenticated USING (((NOT public.is_platform_admin(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.assemblies a
  WHERE ((a.id = assembly_attachments.assembly_id) AND (a.organization_id IS NOT NULL) AND public.is_org_user(auth.uid(), a.organization_id) AND (COALESCE(a.is_visible, false) = true) AND (NOT public.has_org_role(auth.uid(), a.organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text])))))));


--
-- Name: assembly_attachments assembly_attachments org staff delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "assembly_attachments org staff delete" ON public.assembly_attachments FOR DELETE TO authenticated USING ((public.is_platform_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.assemblies a
  WHERE ((a.id = assembly_attachments.assembly_id) AND (a.organization_id IS NOT NULL) AND public.has_org_role(auth.uid(), a.organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text]))))));


--
-- Name: assembly_attachments assembly_attachments org staff insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "assembly_attachments org staff insert" ON public.assembly_attachments FOR INSERT TO authenticated WITH CHECK ((public.is_platform_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.assemblies a
  WHERE ((a.id = assembly_attachments.assembly_id) AND (a.organization_id IS NOT NULL) AND public.has_org_role(auth.uid(), a.organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]))))));


--
-- Name: assembly_attachments assembly_attachments org staff read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "assembly_attachments org staff read" ON public.assembly_attachments FOR SELECT TO authenticated USING ((public.is_platform_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.assemblies a
  WHERE ((a.id = assembly_attachments.assembly_id) AND (a.organization_id IS NOT NULL) AND public.is_org_user(auth.uid(), a.organization_id) AND public.has_org_role(auth.uid(), a.organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]))))));


--
-- Name: assembly_attachments assembly_attachments org staff update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "assembly_attachments org staff update" ON public.assembly_attachments FOR UPDATE TO authenticated USING ((public.is_platform_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.assemblies a
  WHERE ((a.id = assembly_attachments.assembly_id) AND (a.organization_id IS NOT NULL) AND public.has_org_role(auth.uid(), a.organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text])))))) WITH CHECK ((public.is_platform_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.assemblies a
  WHERE ((a.id = assembly_attachments.assembly_id) AND (a.organization_id IS NOT NULL) AND public.has_org_role(auth.uid(), a.organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]))))));


--
-- Name: campaign_contributions campaign contributions finance read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campaign contributions finance read" ON public.campaign_contributions FOR SELECT TO authenticated USING ((public.is_org_campaign_finance_reader(auth.uid(), organization_id) OR (contributed_by = auth.uid())));


--
-- Name: campaign_contributions campaign contributions insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campaign contributions insert" ON public.campaign_contributions FOR INSERT TO authenticated WITH CHECK ((public.is_org_campaign_writer(auth.uid(), organization_id) OR ((contributed_by = auth.uid()) AND public.is_org_user(auth.uid(), organization_id))));


--
-- Name: campaign_contributions campaign contributions platform admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campaign contributions platform admin all" ON public.campaign_contributions TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));


--
-- Name: campaign_contributions campaign contributions writers delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campaign contributions writers delete" ON public.campaign_contributions FOR DELETE TO authenticated USING (public.is_org_campaign_writer(auth.uid(), organization_id));


--
-- Name: campaign_contributions campaign contributions writers update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campaign contributions writers update" ON public.campaign_contributions FOR UPDATE TO authenticated USING (public.is_org_campaign_writer(auth.uid(), organization_id)) WITH CHECK (public.is_org_campaign_writer(auth.uid(), organization_id));


--
-- Name: campaign_media campaign media org read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campaign media org read" ON public.campaign_media FOR SELECT TO authenticated USING ((public.is_platform_admin(auth.uid()) OR public.is_org_user(auth.uid(), organization_id)));


--
-- Name: campaign_media campaign media platform admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campaign media platform admin all" ON public.campaign_media TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));


--
-- Name: campaign_media campaign media writers delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campaign media writers delete" ON public.campaign_media FOR DELETE TO authenticated USING (public.is_org_campaign_media_writer(auth.uid(), organization_id));


--
-- Name: campaign_media campaign media writers insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campaign media writers insert" ON public.campaign_media FOR INSERT TO authenticated WITH CHECK (public.is_org_campaign_media_writer(auth.uid(), organization_id));


--
-- Name: campaign_media campaign media writers update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campaign media writers update" ON public.campaign_media FOR UPDATE TO authenticated USING (public.is_org_campaign_media_writer(auth.uid(), organization_id)) WITH CHECK (public.is_org_campaign_media_writer(auth.uid(), organization_id));


--
-- Name: campaign_updates campaign updates admins delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campaign updates admins delete" ON public.campaign_updates FOR DELETE TO authenticated USING (public.is_org_campaign_update_writer(auth.uid(), organization_id));


--
-- Name: campaign_updates campaign updates admins update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campaign updates admins update" ON public.campaign_updates FOR UPDATE TO authenticated USING (public.is_org_campaign_update_writer(auth.uid(), organization_id)) WITH CHECK (public.is_org_campaign_update_writer(auth.uid(), organization_id));


--
-- Name: campaign_updates campaign updates admins write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campaign updates admins write" ON public.campaign_updates FOR INSERT TO authenticated WITH CHECK (public.is_org_campaign_update_writer(auth.uid(), organization_id));


--
-- Name: campaign_updates campaign updates org read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campaign updates org read" ON public.campaign_updates FOR SELECT TO authenticated USING (public.is_org_user(auth.uid(), organization_id));


--
-- Name: campaign_updates campaign updates platform admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campaign updates platform admin all" ON public.campaign_updates TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));


--
-- Name: campaign_contributions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_contributions ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_media; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_media ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_updates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_updates ENABLE ROW LEVEL SECURITY;

--
-- Name: campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: campaigns campaigns org members read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campaigns org members read" ON public.campaigns FOR SELECT TO authenticated USING ((public.is_org_user(auth.uid(), organization_id) AND ((status = ANY (ARRAY['active'::text, 'closed'::text, 'paused'::text])) OR public.is_org_campaign_finance_reader(auth.uid(), organization_id))));


--
-- Name: campaigns campaigns platform admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campaigns platform admin all" ON public.campaigns TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));


--
-- Name: campaigns campaigns writers delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campaigns writers delete" ON public.campaigns FOR DELETE TO authenticated USING (public.is_org_campaign_writer(auth.uid(), organization_id));


--
-- Name: campaigns campaigns writers manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campaigns writers manage" ON public.campaigns FOR INSERT TO authenticated WITH CHECK (public.is_org_campaign_writer(auth.uid(), organization_id));


--
-- Name: campaigns campaigns writers update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campaigns writers update" ON public.campaigns FOR UPDATE TO authenticated USING (public.is_org_campaign_writer(auth.uid(), organization_id)) WITH CHECK (public.is_org_campaign_writer(auth.uid(), organization_id));


--
-- Name: communications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;

--
-- Name: communications communications org members read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "communications org members read" ON public.communications FOR SELECT TO authenticated USING (public.is_org_user(auth.uid(), organization_id));


--
-- Name: communications communications org staff delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "communications org staff delete" ON public.communications FOR DELETE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text]));


--
-- Name: communications communications org staff insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "communications org staff insert" ON public.communications FOR INSERT TO authenticated WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]));


--
-- Name: communications communications org staff update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "communications org staff update" ON public.communications FOR UPDATE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text])) WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]));


--
-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

--
-- Name: documents documents admins delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "documents admins delete" ON public.documents FOR DELETE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text]));


--
-- Name: documents documents admins insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "documents admins insert" ON public.documents FOR INSERT TO authenticated WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text]));


--
-- Name: documents documents admins update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "documents admins update" ON public.documents FOR UPDATE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text])) WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text]));


--
-- Name: documents documents members read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "documents members read" ON public.documents FOR SELECT TO authenticated USING (public.is_org_user(auth.uid(), organization_id));


--
-- Name: documents documents org admins delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "documents org admins delete" ON public.documents FOR DELETE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text]));


--
-- Name: documents documents org members read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "documents org members read" ON public.documents FOR SELECT TO authenticated USING (public.is_org_user(auth.uid(), organization_id));


--
-- Name: documents documents org staff insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "documents org staff insert" ON public.documents FOR INSERT TO authenticated WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text]));


--
-- Name: documents documents org staff update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "documents org staff update" ON public.documents FOR UPDATE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text])) WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text]));


--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: events events org members read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "events org members read" ON public.events FOR SELECT TO authenticated USING (public.is_org_user(auth.uid(), organization_id));


--
-- Name: events events org staff delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "events org staff delete" ON public.events FOR DELETE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text]));


--
-- Name: events events org staff insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "events org staff insert" ON public.events FOR INSERT TO authenticated WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]));


--
-- Name: events events org staff update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "events org staff update" ON public.events FOR UPDATE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text])) WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]));


--
-- Name: finance_accounts finance accounts readers read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "finance accounts readers read" ON public.finance_accounts FOR SELECT TO authenticated USING (public.is_org_finance_reader(auth.uid(), organization_id));


--
-- Name: finance_accounts finance accounts writers manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "finance accounts writers manage" ON public.finance_accounts TO authenticated USING (public.is_org_finance_writer(auth.uid(), organization_id)) WITH CHECK (public.is_org_finance_writer(auth.uid(), organization_id));


--
-- Name: finance_transaction_audit_logs finance audit readers read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "finance audit readers read" ON public.finance_transaction_audit_logs FOR SELECT TO authenticated USING (public.is_org_finance_reader(auth.uid(), organization_id));


--
-- Name: finance_account_categories finance categories readers read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "finance categories readers read" ON public.finance_account_categories FOR SELECT TO authenticated USING (public.is_org_finance_reader(auth.uid(), organization_id));


--
-- Name: finance_account_categories finance categories writers manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "finance categories writers manage" ON public.finance_account_categories TO authenticated USING (public.is_org_finance_writer(auth.uid(), organization_id)) WITH CHECK (public.is_org_finance_writer(auth.uid(), organization_id));


--
-- Name: finance_monthly_closings finance closings readers read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "finance closings readers read" ON public.finance_monthly_closings FOR SELECT TO authenticated USING (public.is_org_finance_reader(auth.uid(), organization_id));


--
-- Name: finance_monthly_closings finance closings writers manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "finance closings writers manage" ON public.finance_monthly_closings TO authenticated USING (public.is_org_finance_writer(auth.uid(), organization_id)) WITH CHECK (public.is_org_finance_writer(auth.uid(), organization_id));


--
-- Name: finance_cost_centers finance cost centers readers read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "finance cost centers readers read" ON public.finance_cost_centers FOR SELECT TO authenticated USING (public.is_org_finance_reader(auth.uid(), organization_id));


--
-- Name: finance_cost_centers finance cost centers writers manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "finance cost centers writers manage" ON public.finance_cost_centers TO authenticated USING (public.is_org_finance_writer(auth.uid(), organization_id)) WITH CHECK (public.is_org_finance_writer(auth.uid(), organization_id));


--
-- Name: transactions finance transactions readers read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "finance transactions readers read" ON public.transactions FOR SELECT TO authenticated USING (public.is_org_finance_reader(auth.uid(), organization_id));


--
-- Name: transactions finance transactions writers delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "finance transactions writers delete" ON public.transactions FOR DELETE TO authenticated USING ((public.is_org_finance_writer(auth.uid(), organization_id) AND (NOT public.is_finance_month_closed(organization_id, date))));


--
-- Name: transactions finance transactions writers insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "finance transactions writers insert" ON public.transactions FOR INSERT TO authenticated WITH CHECK ((public.is_org_finance_writer(auth.uid(), organization_id) AND (NOT public.is_finance_month_closed(organization_id, date))));


--
-- Name: transactions finance transactions writers update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "finance transactions writers update" ON public.transactions FOR UPDATE TO authenticated USING ((public.is_org_finance_writer(auth.uid(), organization_id) AND (NOT public.is_finance_month_closed(organization_id, date)))) WITH CHECK ((public.is_org_finance_writer(auth.uid(), organization_id) AND (NOT public.is_finance_month_closed(organization_id, date))));


--
-- Name: finance_account_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_account_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_cost_centers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_cost_centers ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_monthly_closings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_monthly_closings ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_transaction_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_transaction_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: group_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

--
-- Name: group_members group_members org read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "group_members org read" ON public.group_members FOR SELECT TO authenticated USING ((public.is_platform_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.groups g
  WHERE ((g.id = group_members.group_id) AND public.is_org_user(auth.uid(), g.organization_id))))));


--
-- Name: group_members group_members org staff delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "group_members org staff delete" ON public.group_members FOR DELETE TO authenticated USING ((public.is_platform_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.groups g
  WHERE ((g.id = group_members.group_id) AND public.has_org_role(auth.uid(), g.organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text]))))));


--
-- Name: group_members group_members org staff insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "group_members org staff insert" ON public.group_members FOR INSERT TO authenticated WITH CHECK ((public.is_platform_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.groups g
  WHERE ((g.id = group_members.group_id) AND public.has_org_role(auth.uid(), g.organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]))))));


--
-- Name: group_members group_members org staff update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "group_members org staff update" ON public.group_members FOR UPDATE TO authenticated USING ((public.is_platform_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.groups g
  WHERE ((g.id = group_members.group_id) AND public.has_org_role(auth.uid(), g.organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text])))))) WITH CHECK ((public.is_platform_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.groups g
  WHERE ((g.id = group_members.group_id) AND public.has_org_role(auth.uid(), g.organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]))))));


--
-- Name: group_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: group_messages group_messages delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "group_messages delete" ON public.group_messages FOR DELETE TO authenticated USING (((author_user_id = auth.uid()) OR public.is_platform_admin(auth.uid()) OR public.is_group_message_staff(auth.uid(), group_id)));


--
-- Name: group_messages group_messages insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "group_messages insert" ON public.group_messages FOR INSERT TO authenticated WITH CHECK (((author_user_id = auth.uid()) AND (public.is_platform_admin(auth.uid()) OR public.is_group_message_staff(auth.uid(), group_id) OR public.is_group_participant(auth.uid(), group_id))));


--
-- Name: group_messages group_messages read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "group_messages read" ON public.group_messages FOR SELECT TO authenticated USING ((public.is_platform_admin(auth.uid()) OR public.is_group_message_staff(auth.uid(), group_id) OR public.is_group_participant(auth.uid(), group_id)));


--
-- Name: group_messages group_messages update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "group_messages update" ON public.group_messages FOR UPDATE TO authenticated USING (((author_user_id = auth.uid()) OR public.is_platform_admin(auth.uid()) OR public.is_group_message_staff(auth.uid(), group_id))) WITH CHECK (((author_user_id = auth.uid()) OR public.is_platform_admin(auth.uid()) OR public.is_group_message_staff(auth.uid(), group_id)));


--
-- Name: groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

--
-- Name: groups groups org members read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "groups org members read" ON public.groups FOR SELECT TO authenticated USING (public.is_org_user(auth.uid(), organization_id));


--
-- Name: groups groups org staff delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "groups org staff delete" ON public.groups FOR DELETE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text]));


--
-- Name: groups groups org staff insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "groups org staff insert" ON public.groups FOR INSERT TO authenticated WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]));


--
-- Name: groups groups org staff update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "groups org staff update" ON public.groups FOR UPDATE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text])) WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]));


--
-- Name: organization_hierarchy_rules hierarchy_rules authenticated select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hierarchy_rules authenticated select" ON public.organization_hierarchy_rules FOR SELECT TO authenticated USING (true);


--
-- Name: organization_hierarchy_rules hierarchy_rules platform admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hierarchy_rules platform admin all" ON public.organization_hierarchy_rules TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));


--
-- Name: internal_message_attachments internal attachments platform admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "internal attachments platform admin all" ON public.internal_message_attachments TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));


--
-- Name: internal_message_attachments internal attachments staff delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "internal attachments staff delete" ON public.internal_message_attachments FOR DELETE TO authenticated USING ((public.is_platform_admin(auth.uid()) OR public.is_internal_message_staff(auth.uid(), organization_id)));


--
-- Name: internal_message_attachments internal attachments thread insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "internal attachments thread insert" ON public.internal_message_attachments FOR INSERT TO authenticated WITH CHECK ((public.can_send_on_internal_thread(auth.uid(), thread_id) AND ((uploaded_by IS NULL) OR (uploaded_by = auth.uid())) AND (organization_id = ( SELECT t.organization_id
   FROM public.internal_threads t
  WHERE (t.id = internal_message_attachments.thread_id)))));


--
-- Name: internal_message_attachments internal attachments thread read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "internal attachments thread read" ON public.internal_message_attachments FOR SELECT TO authenticated USING (public.can_read_internal_thread(auth.uid(), thread_id));


--
-- Name: internal_messages internal messages platform admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "internal messages platform admin all" ON public.internal_messages TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));


--
-- Name: internal_messages internal messages staff delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "internal messages staff delete" ON public.internal_messages FOR DELETE TO authenticated USING ((public.is_platform_admin(auth.uid()) OR public.is_internal_message_staff(auth.uid(), organization_id)));


--
-- Name: internal_messages internal messages staff update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "internal messages staff update" ON public.internal_messages FOR UPDATE TO authenticated USING (public.is_internal_message_staff(auth.uid(), organization_id)) WITH CHECK (public.is_internal_message_staff(auth.uid(), organization_id));


--
-- Name: internal_messages internal messages thread insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "internal messages thread insert" ON public.internal_messages FOR INSERT TO authenticated WITH CHECK ((public.can_send_on_internal_thread(auth.uid(), thread_id) AND ((sender_user_id IS NULL) OR (sender_user_id = auth.uid())) AND (organization_id = ( SELECT t.organization_id
   FROM public.internal_threads t
  WHERE (t.id = internal_messages.thread_id)))));


--
-- Name: internal_messages internal messages thread read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "internal messages thread read" ON public.internal_messages FOR SELECT TO authenticated USING (public.can_read_internal_thread(auth.uid(), thread_id));


--
-- Name: internal_threads internal threads member insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "internal threads member insert" ON public.internal_threads FOR INSERT TO authenticated WITH CHECK ((public.is_org_user(auth.uid(), organization_id) AND (public.is_internal_message_staff(auth.uid(), organization_id) OR ((reply_enabled = true) AND ((campaign_id IS NULL) OR public.campaign_allows_replies(campaign_id)))) AND ((campaign_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.campaigns c
  WHERE ((c.id = internal_threads.campaign_id) AND (c.organization_id = c.organization_id)))))));


--
-- Name: internal_threads internal threads org read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "internal threads org read" ON public.internal_threads FOR SELECT TO authenticated USING ((public.is_internal_message_staff(auth.uid(), organization_id) OR (created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.members m
  WHERE ((m.id = internal_threads.member_id) AND (m.user_id = auth.uid())))) OR ((source = 'campaign'::text) AND public.is_org_user(auth.uid(), organization_id))));


--
-- Name: internal_threads internal threads platform admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "internal threads platform admin all" ON public.internal_threads TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));


--
-- Name: internal_threads internal threads staff insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "internal threads staff insert" ON public.internal_threads FOR INSERT TO authenticated WITH CHECK (public.is_internal_message_staff(auth.uid(), organization_id));


--
-- Name: internal_threads internal threads staff update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "internal threads staff update" ON public.internal_threads FOR UPDATE TO authenticated USING (public.is_internal_message_staff(auth.uid(), organization_id)) WITH CHECK (public.is_internal_message_staff(auth.uid(), organization_id));


--
-- Name: internal_message_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.internal_message_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: internal_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.internal_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: internal_threads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.internal_threads ENABLE ROW LEVEL SECURITY;

--
-- Name: member_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: member_invites member_invites staff insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "member_invites staff insert" ON public.member_invites FOR INSERT TO authenticated WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]));


--
-- Name: member_invites member_invites staff select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "member_invites staff select" ON public.member_invites FOR SELECT TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]));


--
-- Name: member_invites member_invites staff update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "member_invites staff update" ON public.member_invites FOR UPDATE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]));


--
-- Name: members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

--
-- Name: members members org members read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members org members read" ON public.members FOR SELECT TO authenticated USING (public.is_org_user(auth.uid(), organization_id));


--
-- Name: members members org staff delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members org staff delete" ON public.members FOR DELETE TO authenticated USING (((status <> ALL (ARRAY['Falecido'::text, 'Transferido'::text])) AND public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text])));


--
-- Name: members members org staff insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members org staff insert" ON public.members FOR INSERT TO authenticated WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]));


--
-- Name: members members org staff update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members org staff update" ON public.members FOR UPDATE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text])) WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]));


--
-- Name: organization_users organization users admins delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organization users admins delete" ON public.organization_users FOR DELETE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text]));


--
-- Name: organization_users organization users admins insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organization users admins insert" ON public.organization_users FOR INSERT TO authenticated WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text]));


--
-- Name: organization_users organization users admins update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organization users admins update" ON public.organization_users FOR UPDATE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text])) WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text]));


--
-- Name: organization_users organization users members read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organization users members read" ON public.organization_users FOR SELECT TO authenticated USING (public.is_org_user(auth.uid(), organization_id));


--
-- Name: organization_affiliations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_affiliations ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_hierarchy_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_hierarchy_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_responsibles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_responsibles ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_users ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_users organization_users hierarchy admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organization_users hierarchy admin insert" ON public.organization_users FOR INSERT TO authenticated WITH CHECK (public.can_admin_organization(auth.uid(), organization_id));


--
-- Name: organization_users organization_users hierarchy admin select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organization_users hierarchy admin select" ON public.organization_users FOR SELECT TO authenticated USING (public.can_admin_organization(auth.uid(), organization_id));


--
-- Name: organization_users organization_users hierarchy admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organization_users hierarchy admin update" ON public.organization_users FOR UPDATE TO authenticated USING (public.can_admin_organization(auth.uid(), organization_id)) WITH CHECK (public.can_admin_organization(auth.uid(), organization_id));


--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations organizations admins insert children; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organizations admins insert children" ON public.organizations FOR INSERT TO authenticated WITH CHECK (((parent_id IS NOT NULL) AND public.is_valid_organization_hierarchy(( SELECT organizations_1.organization_type
   FROM public.organizations organizations_1
  WHERE (organizations_1.id = organizations_1.parent_id)
 LIMIT 1), organization_type) AND (public.is_platform_admin(auth.uid()) OR public.can_admin_organization(auth.uid(), parent_id))));


--
-- Name: POLICY "organizations admins insert children" ON organizations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY "organizations admins insert children" ON public.organizations IS 'Permite criação de filhos estruturais por admins hierárquicos (can_admin_organization).
   can_admin_organization é recursiva — um admin nacional pode criar filhos estaduais/municipais.
   Platform admins têm acesso irrestrito.
   Regra de hierarquia validada por is_valid_organization_hierarchy().';


--
-- Name: organizations organizations admins update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organizations admins update" ON public.organizations FOR UPDATE TO authenticated USING (public.can_admin_organization(auth.uid(), id)) WITH CHECK (public.can_admin_organization(auth.uid(), id));


--
-- Name: organizations organizations matriz can create setores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organizations matriz can create setores" ON public.organizations FOR INSERT TO authenticated WITH CHECK (((organization_type = 'setor'::text) AND (parent_id IS NOT NULL) AND public.has_org_role(auth.uid(), parent_id, ARRAY['admin'::text, 'church_admin'::text]) AND (EXISTS ( SELECT 1
   FROM public.organizations parent
  WHERE ((parent.id = organizations.parent_id) AND (parent.organization_type = 'matriz'::text))))));


--
-- Name: organizations organizations members read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organizations members read" ON public.organizations FOR SELECT TO authenticated USING (public.can_read_organization(auth.uid(), id));


--
-- Name: organizations organizations parent admins can read children; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organizations parent admins can read children" ON public.organizations FOR SELECT TO authenticated USING ((public.is_org_user(auth.uid(), id) OR ((parent_id IS NOT NULL) AND public.has_org_role(auth.uid(), parent_id, ARRAY['admin'::text, 'church_admin'::text]))));


--
-- Name: organizations organizations platform admins delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organizations platform admins delete" ON public.organizations FOR DELETE TO authenticated USING (public.is_platform_admin(auth.uid()));


--
-- Name: organizations organizations platform admins insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organizations platform admins insert" ON public.organizations FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin(auth.uid()));


--
-- Name: organizations organizations setor can create congregacoes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organizations setor can create congregacoes" ON public.organizations FOR INSERT TO authenticated WITH CHECK (((organization_type = 'congregacao'::text) AND (parent_id IS NOT NULL) AND public.has_org_role(auth.uid(), parent_id, ARRAY['admin'::text, 'church_admin'::text]) AND (EXISTS ( SELECT 1
   FROM public.organizations parent
  WHERE ((parent.id = organizations.parent_id) AND (parent.organization_type = 'setor'::text))))));


--
-- Name: platform_announcements platform announcements admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform announcements admin write" ON public.platform_announcements TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));


--
-- Name: platform_announcements platform announcements public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform announcements public read" ON public.platform_announcements FOR SELECT TO authenticated, anon USING ((is_active = true));


--
-- Name: platform_announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_support_agent_departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_support_agent_departments ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_support_agent_presence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_support_agent_presence ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_support_agents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_support_agents ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_support_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_support_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_support_departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_support_departments ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_support_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_support_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_support_ticket_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_support_ticket_events ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_support_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_support_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: prayer_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prayer_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: prayer_requests prayer_requests org delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "prayer_requests org delete" ON public.prayer_requests FOR DELETE TO authenticated USING ((public.is_platform_admin(auth.uid()) OR (public.is_org_user(auth.uid(), organization_id) AND ((user_id = auth.uid()) OR public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text])))));


--
-- Name: prayer_requests prayer_requests org members insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "prayer_requests org members insert" ON public.prayer_requests FOR INSERT TO authenticated WITH CHECK ((public.is_platform_admin(auth.uid()) OR (public.is_org_user(auth.uid(), organization_id) AND ((user_id IS NULL) OR (user_id = auth.uid())))));


--
-- Name: prayer_requests prayer_requests org members read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "prayer_requests org members read" ON public.prayer_requests FOR SELECT TO authenticated USING ((public.is_platform_admin(auth.uid()) OR public.is_org_user(auth.uid(), organization_id)));


--
-- Name: prayer_requests prayer_requests org update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "prayer_requests org update" ON public.prayer_requests FOR UPDATE TO authenticated USING ((public.is_platform_admin(auth.uid()) OR (public.is_org_user(auth.uid(), organization_id) AND ((user_id = auth.uid()) OR public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]))))) WITH CHECK ((public.is_platform_admin(auth.uid()) OR public.is_org_user(auth.uid(), organization_id)));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles select scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles select scoped" ON public.profiles FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR public.is_platform_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM (public.organization_users ou_me
     JOIN public.organization_users ou_them ON (((ou_them.organization_id = ou_me.organization_id) AND (ou_them.user_id = profiles.user_id) AND (COALESCE(ou_them.is_active, true) = true))))
  WHERE ((ou_me.user_id = auth.uid()) AND (COALESCE(ou_me.is_active, true) = true))))));


--
-- Name: profiles profiles users insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles users insert own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) OR public.is_platform_admin(auth.uid())));


--
-- Name: profiles profiles users update own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles users update own" ON public.profiles FOR UPDATE TO authenticated USING (((auth.uid() = user_id) OR public.is_platform_admin(auth.uid()))) WITH CHECK (((auth.uid() = user_id) OR public.is_platform_admin(auth.uid())));


--
-- Name: platform_support_agent_departments ps_agent_departments_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_agent_departments_delete ON public.platform_support_agent_departments FOR DELETE USING ((public.get_platform_support_role(auth.uid()) = ANY (ARRAY['super_admin'::text, 'platform_admin'::text])));


--
-- Name: platform_support_agent_departments ps_agent_departments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_agent_departments_insert ON public.platform_support_agent_departments FOR INSERT WITH CHECK ((public.get_platform_support_role(auth.uid()) = ANY (ARRAY['super_admin'::text, 'platform_admin'::text])));


--
-- Name: platform_support_agent_departments ps_agent_departments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_agent_departments_select ON public.platform_support_agent_departments FOR SELECT USING (public.is_platform_support_user(auth.uid()));


--
-- Name: platform_support_agent_departments ps_agent_departments_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_agent_departments_update ON public.platform_support_agent_departments FOR UPDATE USING ((public.get_platform_support_role(auth.uid()) = ANY (ARRAY['super_admin'::text, 'platform_admin'::text]))) WITH CHECK ((public.get_platform_support_role(auth.uid()) = ANY (ARRAY['super_admin'::text, 'platform_admin'::text])));


--
-- Name: platform_support_agents ps_agents_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_agents_delete ON public.platform_support_agents FOR DELETE USING ((public.get_platform_support_role(auth.uid()) = ANY (ARRAY['super_admin'::text, 'platform_admin'::text])));


--
-- Name: platform_support_agents ps_agents_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_agents_insert ON public.platform_support_agents FOR INSERT WITH CHECK ((public.get_platform_support_role(auth.uid()) = ANY (ARRAY['super_admin'::text, 'platform_admin'::text])));


--
-- Name: platform_support_agents ps_agents_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_agents_select ON public.platform_support_agents FOR SELECT USING (public.is_platform_support_user(auth.uid()));


--
-- Name: platform_support_agents ps_agents_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_agents_update ON public.platform_support_agents FOR UPDATE USING (((user_id = auth.uid()) OR (public.get_platform_support_role(auth.uid()) = ANY (ARRAY['super_admin'::text, 'platform_admin'::text])))) WITH CHECK (((user_id = auth.uid()) OR (public.get_platform_support_role(auth.uid()) = ANY (ARRAY['super_admin'::text, 'platform_admin'::text]))));


--
-- Name: platform_support_audit_logs ps_audit_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_audit_insert ON public.platform_support_audit_logs FOR INSERT WITH CHECK (public.is_platform_support_user(auth.uid()));


--
-- Name: platform_support_audit_logs ps_audit_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_audit_select ON public.platform_support_audit_logs FOR SELECT USING (public.is_platform_support_user(auth.uid()));


--
-- Name: platform_support_departments ps_departments_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_departments_delete ON public.platform_support_departments FOR DELETE USING ((public.get_platform_support_role(auth.uid()) = ANY (ARRAY['super_admin'::text, 'platform_admin'::text])));


--
-- Name: platform_support_departments ps_departments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_departments_insert ON public.platform_support_departments FOR INSERT WITH CHECK ((public.get_platform_support_role(auth.uid()) = ANY (ARRAY['super_admin'::text, 'platform_admin'::text])));


--
-- Name: platform_support_departments ps_departments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_departments_select ON public.platform_support_departments FOR SELECT USING (public.is_platform_support_user(auth.uid()));


--
-- Name: platform_support_departments ps_departments_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_departments_update ON public.platform_support_departments FOR UPDATE USING ((public.get_platform_support_role(auth.uid()) = ANY (ARRAY['super_admin'::text, 'platform_admin'::text]))) WITH CHECK ((public.get_platform_support_role(auth.uid()) = ANY (ARRAY['super_admin'::text, 'platform_admin'::text])));


--
-- Name: platform_support_ticket_events ps_events_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_events_insert ON public.platform_support_ticket_events FOR INSERT WITH CHECK (public.is_platform_support_user(auth.uid()));


--
-- Name: platform_support_ticket_events ps_events_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_events_select ON public.platform_support_ticket_events FOR SELECT USING (public.is_platform_support_user(auth.uid()));


--
-- Name: platform_support_permissions ps_permissions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_permissions_delete ON public.platform_support_permissions FOR DELETE USING ((public.get_platform_support_role(auth.uid()) = ANY (ARRAY['super_admin'::text, 'platform_admin'::text])));


--
-- Name: platform_support_permissions ps_permissions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_permissions_insert ON public.platform_support_permissions FOR INSERT WITH CHECK ((public.get_platform_support_role(auth.uid()) = ANY (ARRAY['super_admin'::text, 'platform_admin'::text])));


--
-- Name: platform_support_permissions ps_permissions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_permissions_select ON public.platform_support_permissions FOR SELECT USING (public.is_platform_support_user(auth.uid()));


--
-- Name: platform_support_permissions ps_permissions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_permissions_update ON public.platform_support_permissions FOR UPDATE USING ((public.get_platform_support_role(auth.uid()) = ANY (ARRAY['super_admin'::text, 'platform_admin'::text]))) WITH CHECK ((public.get_platform_support_role(auth.uid()) = ANY (ARRAY['super_admin'::text, 'platform_admin'::text])));


--
-- Name: platform_support_agent_presence ps_presence_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_presence_insert ON public.platform_support_agent_presence FOR INSERT WITH CHECK (((user_id = auth.uid()) OR (public.get_platform_support_role(auth.uid()) = ANY (ARRAY['super_admin'::text, 'platform_admin'::text]))));


--
-- Name: platform_support_agent_presence ps_presence_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_presence_select ON public.platform_support_agent_presence FOR SELECT USING (public.is_platform_support_user(auth.uid()));


--
-- Name: platform_support_agent_presence ps_presence_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_presence_update ON public.platform_support_agent_presence FOR UPDATE USING (((user_id = auth.uid()) OR (public.get_platform_support_role(auth.uid()) = ANY (ARRAY['super_admin'::text, 'platform_admin'::text])))) WITH CHECK (((user_id = auth.uid()) OR (public.get_platform_support_role(auth.uid()) = ANY (ARRAY['super_admin'::text, 'platform_admin'::text]))));


--
-- Name: platform_support_tickets ps_tickets_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_tickets_delete ON public.platform_support_tickets FOR DELETE USING ((public.get_platform_support_role(auth.uid()) = ANY (ARRAY['super_admin'::text, 'platform_admin'::text])));


--
-- Name: platform_support_tickets ps_tickets_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_tickets_insert ON public.platform_support_tickets FOR INSERT WITH CHECK (public.is_platform_support_user(auth.uid()));


--
-- Name: platform_support_tickets ps_tickets_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_tickets_select ON public.platform_support_tickets FOR SELECT USING (public.is_platform_support_user(auth.uid()));


--
-- Name: platform_support_tickets ps_tickets_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_tickets_update ON public.platform_support_tickets FOR UPDATE USING (public.is_platform_support_user(auth.uid())) WITH CHECK (public.is_platform_support_user(auth.uid()));


--
-- Name: recommendation_letters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recommendation_letters ENABLE ROW LEVEL SECURITY;

--
-- Name: recommendation_letters recommendation_letters delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "recommendation_letters delete" ON public.recommendation_letters FOR DELETE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text]));


--
-- Name: recommendation_letters recommendation_letters insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "recommendation_letters insert" ON public.recommendation_letters FOR INSERT TO authenticated WITH CHECK ((public.is_org_user(auth.uid(), organization_id) AND ((member_id IS NULL) OR (member_id = auth.uid()) OR public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text]))));


--
-- Name: recommendation_letters recommendation_letters public read approved; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "recommendation_letters public read approved" ON public.recommendation_letters FOR SELECT TO anon USING (((status = 'approved'::text) AND (public_token IS NOT NULL)));


--
-- Name: recommendation_letters recommendation_letters read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "recommendation_letters read" ON public.recommendation_letters FOR SELECT TO authenticated USING ((public.is_org_user(auth.uid(), organization_id) AND (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text]) OR (member_id = auth.uid()))));


--
-- Name: recommendation_letters recommendation_letters update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "recommendation_letters update" ON public.recommendation_letters FOR UPDATE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text])) WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text]));


--
-- Name: organization_responsibles responsibles delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "responsibles delete" ON public.organization_responsibles FOR DELETE TO authenticated USING (public.can_admin_organization(auth.uid(), organization_id));


--
-- Name: organization_responsibles responsibles insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "responsibles insert" ON public.organization_responsibles FOR INSERT TO authenticated WITH CHECK (public.can_admin_organization(auth.uid(), organization_id));


--
-- Name: organization_responsibles responsibles read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "responsibles read" ON public.organization_responsibles FOR SELECT TO authenticated USING (public.can_read_organization(auth.uid(), organization_id));


--
-- Name: organization_responsibles responsibles update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "responsibles update" ON public.organization_responsibles FOR UPDATE TO authenticated USING (public.can_admin_organization(auth.uid(), organization_id));


--
-- Name: schedule_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schedule_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: schedule_assignments schedule_assignments assignee status update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "schedule_assignments assignee status update" ON public.schedule_assignments FOR UPDATE TO authenticated USING (public.is_schedule_assignee(auth.uid(), id)) WITH CHECK ((public.is_schedule_assignee(auth.uid(), id) AND (status = ANY (ARRAY['confirmado'::text, 'recusado'::text]))));


--
-- Name: schedule_assignments schedule_assignments org read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "schedule_assignments org read" ON public.schedule_assignments FOR SELECT TO authenticated USING ((public.is_platform_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.schedules s
  WHERE ((s.id = schedule_assignments.schedule_id) AND public.is_org_user(auth.uid(), s.organization_id))))));


--
-- Name: schedule_assignments schedule_assignments org staff delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "schedule_assignments org staff delete" ON public.schedule_assignments FOR DELETE TO authenticated USING ((public.is_platform_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.schedules s
  WHERE ((s.id = schedule_assignments.schedule_id) AND public.has_org_role(auth.uid(), s.organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text]))))));


--
-- Name: schedule_assignments schedule_assignments org staff insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "schedule_assignments org staff insert" ON public.schedule_assignments FOR INSERT TO authenticated WITH CHECK ((public.is_platform_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.schedules s
  WHERE ((s.id = schedule_assignments.schedule_id) AND public.has_org_role(auth.uid(), s.organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]))))));


--
-- Name: schedule_assignments schedule_assignments org staff update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "schedule_assignments org staff update" ON public.schedule_assignments FOR UPDATE TO authenticated USING ((public.is_platform_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.schedules s
  WHERE ((s.id = schedule_assignments.schedule_id) AND public.has_org_role(auth.uid(), s.organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text])))))) WITH CHECK ((public.is_platform_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.schedules s
  WHERE ((s.id = schedule_assignments.schedule_id) AND public.has_org_role(auth.uid(), s.organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]))))));


--
-- Name: schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: schedules schedules org admins delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "schedules org admins delete" ON public.schedules FOR DELETE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text]));


--
-- Name: schedules schedules org members read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "schedules org members read" ON public.schedules FOR SELECT TO authenticated USING (public.is_org_user(auth.uid(), organization_id));


--
-- Name: schedules schedules org staff insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "schedules org staff insert" ON public.schedules FOR INSERT TO authenticated WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]));


--
-- Name: schedules schedules org staff update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "schedules org staff update" ON public.schedules FOR UPDATE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text])) WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]));


--
-- Name: internal_messages staff_can_update_internal_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_can_update_internal_messages ON public.internal_messages FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = internal_messages.organization_id) AND (ou.user_id = auth.uid()) AND (ou.role = ANY (ARRAY['super_admin'::text, 'church_admin'::text, 'admin'::text, 'pastor'::text, 'secretary'::text])) AND (ou.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = internal_messages.organization_id) AND (ou.user_id = auth.uid()) AND (ou.role = ANY (ARRAY['super_admin'::text, 'church_admin'::text, 'admin'::text, 'pastor'::text, 'secretary'::text])) AND (ou.is_active = true)))));


--
-- Name: transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles user roles platform admins manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user roles platform admins manage" ON public.user_roles TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));


--
-- Name: user_roles user roles users read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user roles users read own" ON public.user_roles FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR public.is_platform_admin(auth.uid())));


--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: internal_messages users_can_update_own_internal_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_can_update_own_internal_messages ON public.internal_messages FOR UPDATE TO authenticated USING ((auth.uid() = sender_user_id)) WITH CHECK ((auth.uid() = sender_user_id));


--
-- Name: worship_setlists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.worship_setlists ENABLE ROW LEVEL SECURITY;

--
-- Name: worship_setlists worship_setlists org members read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "worship_setlists org members read" ON public.worship_setlists FOR SELECT TO authenticated USING (public.is_org_user(auth.uid(), organization_id));


--
-- Name: worship_setlists worship_setlists org staff delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "worship_setlists org staff delete" ON public.worship_setlists FOR DELETE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]));


--
-- Name: worship_setlists worship_setlists org staff insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "worship_setlists org staff insert" ON public.worship_setlists FOR INSERT TO authenticated WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]));


--
-- Name: worship_setlists worship_setlists org staff update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "worship_setlists org staff update" ON public.worship_setlists FOR UPDATE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text])) WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]));


--
-- Name: worship_songs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.worship_songs ENABLE ROW LEVEL SECURITY;

--
-- Name: worship_songs worship_songs org members read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "worship_songs org members read" ON public.worship_songs FOR SELECT TO authenticated USING (public.is_org_user(auth.uid(), organization_id));


--
-- Name: worship_songs worship_songs org staff delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "worship_songs org staff delete" ON public.worship_songs FOR DELETE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]));


--
-- Name: worship_songs worship_songs org staff insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "worship_songs org staff insert" ON public.worship_songs FOR INSERT TO authenticated WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]));


--
-- Name: worship_songs worship_songs org staff update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "worship_songs org staff update" ON public.worship_songs FOR UPDATE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text])) WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['admin'::text, 'church_admin'::text, 'secretary'::text, 'pastor'::text, 'leader'::text]));


--
-- PostgreSQL database dump complete
--

\unrestrict I1bZ5JPkfOcUR5djsPKwZ7EevAEarGl17qyXwOfpeYhSbjd0TFOm7vJI0A2nUnq

