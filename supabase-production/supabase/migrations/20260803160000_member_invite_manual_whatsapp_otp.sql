-- ============================================================================
-- Convite de membro: código manual pelo WhatsApp, sem Meta/API automática
-- Timestamp: 20260803160000
-- ============================================================================
--
-- Nesta fase a Secretaria gera explicitamente o código e abre o WhatsApp
-- Business com link + código preenchidos. O envio só acontece quando a pessoa
-- responsável confirma no WhatsApp. Nenhuma mensagem é disparada ao cadastrar
-- o membro e nenhuma API da Meta é chamada.
--
-- O código aparece uma única vez na resposta da RPC autorizada; no banco fica
-- apenas SHA-256, com expiração, uso único, limite de tentativas e auditoria.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.member_invites') IS NULL
     OR to_regclass('public.member_otp_challenges') IS NULL
     OR to_regprocedure('public._normalize_phone_e164_br(text)') IS NULL THEN
    RAISE EXCEPTION 'member_invite_manual_whatsapp_otp preflight failed';
  END IF;
END;
$$;

ALTER TABLE public.member_otp_challenges
  ADD COLUMN IF NOT EXISTS invite_id uuid
    REFERENCES public.member_invites(id) ON DELETE CASCADE;

ALTER TABLE public.member_otp_challenges
  DROP CONSTRAINT IF EXISTS member_otp_challenges_purpose_check;
ALTER TABLE public.member_otp_challenges
  ADD CONSTRAINT member_otp_challenges_purpose_check
    CHECK (purpose IN ('login', 'invite_activation'));

ALTER TABLE public.member_otp_challenges
  DROP CONSTRAINT IF EXISTS member_otp_challenges_transport_mode_check;
ALTER TABLE public.member_otp_challenges
  ADD CONSTRAINT member_otp_challenges_transport_mode_check
    CHECK (transport_mode IN ('manual_test', 'manual_invite', 'provider'));

CREATE UNIQUE INDEX IF NOT EXISTS uniq_member_otp_challenges_invite_active
  ON public.member_otp_challenges(invite_id)
  WHERE purpose = 'invite_activation' AND used_at IS NULL;

CREATE TABLE IF NOT EXISTS public.member_invite_otp_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  invite_id uuid NOT NULL REFERENCES public.member_invites(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id uuid REFERENCES public.member_otp_challenges(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('manual_code_generated')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.member_invite_otp_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "member invite otp audit staff select"
  ON public.member_invite_otp_audit;
CREATE POLICY "member invite otp audit staff select"
ON public.member_invite_otp_audit
FOR SELECT TO authenticated
USING (
  public.has_org_role(
    auth.uid(),
    organization_id,
    ARRAY['admin','church_admin','secretary','pastor','leader']
  )
);
GRANT SELECT ON public.member_invite_otp_audit TO authenticated;

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
  v_phone text;
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

  SELECT id, full_name, phone, whatsapp INTO v_member
  FROM public.members
  WHERE id = v_invite.member_id
    AND organization_id = v_invite.organization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'member_not_found');
  END IF;

  v_phone := COALESCE(
    public._normalize_phone_e164_br(v_member.whatsapp),
    public._normalize_phone_e164_br(v_member.phone)
  );
  IF v_phone IS NULL OR length(v_phone) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'member_missing_phone');
  END IF;

  UPDATE public.member_otp_challenges
  SET used_at = now(), consumed_result = 'superseded'
  WHERE invite_id = v_invite.id
    AND purpose = 'invite_activation'
    AND used_at IS NULL;

  -- 31 bits de gen_random_bytes; código nunca usa random() pseudoaleatório.
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
    v_invite.organization_id, v_invite.member_id, v_invite.id, v_phone,
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
    'phone_normalized', v_phone,
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
  v_phone text := public._normalize_phone_e164_br(p_phone);
  v_invite public.member_invites%ROWTYPE;
  v_member record;
  v_challenge public.member_otp_challenges%ROWTYPE;
  v_code_hash text;
BEGIN
  IF p_invite_token IS NULL OR btrim(p_invite_token) = ''
     OR v_phone IS NULL OR length(v_phone) < 10
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

  SELECT phone, whatsapp INTO v_member
  FROM public.members
  WHERE id = v_invite.member_id;

  IF v_phone IS DISTINCT FROM public._normalize_phone_e164_br(v_member.whatsapp)
     AND v_phone IS DISTINCT FROM public._normalize_phone_e164_br(v_member.phone) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'phone_mismatch');
  END IF;

  SELECT * INTO v_challenge
  FROM public.member_otp_challenges
  WHERE invite_id = v_invite.id
    AND member_id = v_invite.member_id
    AND phone_normalized = v_phone
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
    RAISE EXCEPTION 'member_invite_manual_whatsapp_otp verification failed';
  END IF;
  RAISE NOTICE 'member_invite_manual_whatsapp_otp: fluxo manual sem Meta confirmado ✓';
END;
$$;

COMMIT;
