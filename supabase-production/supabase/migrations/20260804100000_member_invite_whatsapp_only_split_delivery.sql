-- ==========================================================================
-- Convite de membro: WhatsApp exclusivo e link/código em mensagens separadas
-- Timestamp: 20260804100000
-- ==========================================================================
--
-- Telefone continua obrigatório como dado cadastral, mas nunca participa da
-- ativação. O desafio OTP é vinculado exclusivamente a members.whatsapp.
-- A Secretaria envia manualmente primeiro o link e depois o código.
-- ==========================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.member_invites') IS NULL
     OR to_regclass('public.member_otp_challenges') IS NULL
     OR to_regprocedure('public._normalize_phone_e164_br(text)') IS NULL THEN
    RAISE EXCEPTION 'member_invite_whatsapp_only_split_delivery preflight failed';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_generate_member_invite_otp(
  p_invite_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_invite public.member_invites%ROWTYPE;
  v_member record;
  v_whatsapp text;
  v_random bytea;
  v_code text;
  v_code_hash text;
  v_expires_at timestamptz := now() + interval '10 minutes';
  v_challenge_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_invite
  FROM public.member_invites
  WHERE id = p_invite_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_not_found');
  END IF;
  IF NOT public.has_org_role(
    auth.uid(),
    v_invite.organization_id,
    ARRAY['admin','church_admin','secretary','pastor','leader']
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;
  IF v_invite.status <> 'pending' OR v_invite.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_not_pending');
  END IF;

  SELECT id, full_name, whatsapp INTO v_member
  FROM public.members
  WHERE id = v_invite.member_id
    AND organization_id = v_invite.organization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'member_not_found');
  END IF;

  v_whatsapp := public._normalize_phone_e164_br(v_member.whatsapp);
  IF v_whatsapp IS NULL OR length(v_whatsapp) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'member_missing_whatsapp');
  END IF;

  UPDATE public.member_otp_challenges
  SET used_at = now(), consumed_result = 'superseded'
  WHERE invite_id = v_invite.id
    AND purpose = 'invite_activation'
    AND used_at IS NULL;

  v_random := gen_random_bytes(4);
  v_code := lpad((
    (
      (get_byte(v_random, 0) & 127) * 16777216
      + get_byte(v_random, 1) * 65536
      + get_byte(v_random, 2) * 256
      + get_byte(v_random, 3)
    ) % 1000000
  )::text, 6, '0');
  v_code_hash := encode(digest(v_code, 'sha256'), 'hex');

  INSERT INTO public.member_otp_challenges (
    organization_id, member_id, invite_id, phone_normalized, code_hash,
    purpose, transport_mode, requested_by_admin, max_attempts, expires_at
  ) VALUES (
    v_invite.organization_id, v_invite.member_id, v_invite.id, v_whatsapp,
    v_code_hash, 'invite_activation', 'manual_invite', auth.uid(), 5, v_expires_at
  )
  RETURNING id INTO v_challenge_id;

  INSERT INTO public.member_invite_otp_audit (
    organization_id, member_id, invite_id, actor_user_id,
    challenge_id, action
  ) VALUES (
    v_invite.organization_id, v_invite.member_id, v_invite.id, auth.uid(),
    v_challenge_id, 'manual_code_generated'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'member_name', v_member.full_name,
    'whatsapp_normalized', v_whatsapp,
    'code', v_code,
    'expires_at', v_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._verify_member_invite_otp_internal(
  p_invite_token text,
  p_phone text,
  p_code text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_whatsapp text := public._normalize_phone_e164_br(p_phone);
  v_invite public.member_invites%ROWTYPE;
  v_member record;
  v_challenge public.member_otp_challenges%ROWTYPE;
  v_code_hash text;
BEGIN
  IF p_invite_token IS NULL OR btrim(p_invite_token) = ''
     OR v_whatsapp IS NULL OR length(v_whatsapp) < 10
     OR p_code IS NULL OR btrim(p_code) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_arguments');
  END IF;

  SELECT * INTO v_invite
  FROM public.member_invites
  WHERE token = btrim(p_invite_token)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_not_found');
  END IF;
  IF v_invite.status <> 'pending' OR v_invite.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_not_pending');
  END IF;

  SELECT whatsapp INTO v_member
  FROM public.members
  WHERE id = v_invite.member_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'member_not_found');
  END IF;
  IF v_whatsapp IS DISTINCT FROM public._normalize_phone_e164_br(v_member.whatsapp) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'whatsapp_mismatch');
  END IF;

  SELECT * INTO v_challenge
  FROM public.member_otp_challenges
  WHERE invite_id = v_invite.id
    AND member_id = v_invite.member_id
    AND phone_normalized = v_whatsapp
    AND purpose = 'invite_activation'
    AND transport_mode = 'manual_invite'
    AND used_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_active_challenge');
  END IF;
  IF v_challenge.expires_at <= now() THEN
    UPDATE public.member_otp_challenges
    SET used_at = now(), consumed_result = 'expired'
    WHERE id = v_challenge.id;
    RETURN jsonb_build_object('ok', false, 'error', 'challenge_expired');
  END IF;
  IF v_challenge.attempt_count >= v_challenge.max_attempts THEN
    UPDATE public.member_otp_challenges
    SET used_at = now(), consumed_result = 'max_attempts'
    WHERE id = v_challenge.id;
    RETURN jsonb_build_object('ok', false, 'error', 'max_attempts_exceeded');
  END IF;

  v_code_hash := encode(digest(btrim(p_code), 'sha256'), 'hex');
  IF v_code_hash IS DISTINCT FROM v_challenge.code_hash THEN
    UPDATE public.member_otp_challenges
    SET attempt_count = attempt_count + 1
    WHERE id = v_challenge.id;
    RETURN jsonb_build_object(
      'ok', false, 'error', 'invalid_code',
      'attempts_remaining',
      GREATEST(v_challenge.max_attempts - (v_challenge.attempt_count + 1), 0)
    );
  END IF;

  UPDATE public.member_otp_challenges
  SET used_at = now(), consumed_result = 'verified'
  WHERE id = v_challenge.id;

  RETURN jsonb_build_object(
    'ok', true,
    'member_id', v_invite.member_id,
    'organization_id', v_invite.organization_id,
    'invite_id', v_invite.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_generate_member_invite_otp(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_generate_member_invite_otp(uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public._verify_member_invite_otp_internal(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._verify_member_invite_otp_internal(text, text, text)
  TO service_role;

DO $$
BEGIN
  IF to_regprocedure('public.admin_generate_member_invite_otp(uuid)') IS NULL
     OR to_regprocedure('public._verify_member_invite_otp_internal(text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'member_invite_whatsapp_only_split_delivery verification failed';
  END IF;
  RAISE NOTICE 'member_invite_whatsapp_only_split_delivery: WhatsApp exclusivo confirmado';
END;
$$;

COMMIT;
