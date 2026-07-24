-- ============================================================================
-- Migration: member_login_otp_admin_test
-- Timestamp: 20260802110000
-- OPERAÇÃO ESPECIAL — Auditoria e conclusão de TV Digital, Canal Eclésia e
-- Ecclesia Chat / Login por telefone (Parte D — teste controlado do OTP)
-- ============================================================================
--
-- Adiciona a capability "member_login.otp_test" ao catálogo já existente de
-- access_responsibility_definitions (20260716130000_hierarchical_access_
-- responsibilities.sql). Segue o MESMO padrão de members.confidential/
-- discipleship.confidential/theology.confidential/missions.confidential:
-- nunca concedida por conveniência junto de outra responsabilidade — apenas
-- a quem já detém governança (church_admin/responsible_pastor) na unidade.
-- Revelar um código de teste, mesmo de forma curta e auditada, é uma ação
-- sensível o bastante para não ser automática para secretário/tesoureiro/etc.
--
-- Também cria:
--   * member_otp_admin_audit — trilha de quem gerou um teste manual, para
--     qual membro, quando (nunca grava o código nem seu hash);
--   * public.admin_generate_manual_test_otp(uuid) — única forma de criar um
--     desafio OTP realmente utilizável nesta operação. Exige
--     transport_mode='manual_test' (ver migration anterior; produção
--     permanece 'disabled' e portanto esta RPC também falha fechado lá),
--     exige a capability acima na organização do membro-alvo, supera
--     qualquer desafio manual_test anterior (garante "um membro por vez") e
--     retorna o código em texto puro APENAS na resposta desta chamada — não
--     persiste, não loga.
--
-- Esta migration NÃO é aplicada.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.member_otp_challenges') IS NULL THEN
    v_missing := array_append(v_missing, 'public.member_otp_challenges (rode 20260802100000 antes)');
  END IF;
  IF to_regclass('public.member_otp_settings') IS NULL THEN
    v_missing := array_append(v_missing, 'public.member_otp_settings');
  END IF;
  IF to_regclass('public.access_responsibility_definitions') IS NULL THEN
    v_missing := array_append(v_missing, 'public.access_responsibility_definitions');
  END IF;
  IF to_regprocedure('public.has_org_access_permission(uuid,uuid,text)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.has_org_access_permission(uuid,uuid,text)');
  END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'member_login_otp_admin_test preflight failed; missing: %', array_to_string(v_missing, ', ');
  END IF;
END;
$$;

-- ── 1. Capability nova: member_login.otp_test ───────────────────────────────
-- Idempotente: só concede a quem JÁ é church_admin/responsible_pastor,
-- nunca a outra responsabilidade. Espelha exatamente o padrão usado por
-- members.confidential em 20260728090000_shared_institutional_history_
-- foundation.sql (update seletivo, não reescreve o catálogo inteiro).
UPDATE public.access_responsibility_definitions
SET permission_keys = array_append(COALESCE(permission_keys, ARRAY[]::text[]), 'member_login.otp_test'),
    updated_at = now()
WHERE responsibility_type IN ('church_admin', 'responsible_pastor')
  AND NOT ('member_login.otp_test' = ANY(COALESCE(permission_keys, ARRAY[]::text[])));

-- ── 2. member_otp_admin_audit ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.member_otp_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL DEFAULT 'manual_test_generated' CHECK (action IN ('manual_test_generated')),
  challenge_id uuid REFERENCES public.member_otp_challenges(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_otp_admin_audit_org ON public.member_otp_admin_audit (organization_id);
CREATE INDEX IF NOT EXISTS idx_member_otp_admin_audit_member ON public.member_otp_admin_audit (member_id);
CREATE INDEX IF NOT EXISTS idx_member_otp_admin_audit_actor ON public.member_otp_admin_audit (actor_user_id);

ALTER TABLE public.member_otp_admin_audit ENABLE ROW LEVEL SECURITY;

-- Leitura restrita a quem tem a mesma capability na organização do registro
-- (auditoria só é visível para quem poderia ter gerado o teste).
CREATE POLICY member_otp_admin_audit_select ON public.member_otp_admin_audit
FOR SELECT TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'member_login.otp_test'));
-- Nenhuma policy de INSERT/UPDATE/DELETE: gravação só pela RPC abaixo.

-- ── 3. admin_generate_manual_test_otp ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_generate_manual_test_otp(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_member record;
  v_settings record;
  v_phone text;
  v_code text;
  v_code_hash text;
  v_expires_at timestamptz;
  v_challenge_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT id, organization_id, phone, whatsapp, full_name
    INTO v_member
    FROM public.members
   WHERE id = p_member_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'member_not_found');
  END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_member.organization_id, 'member_login.otp_test') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  SELECT transport_mode INTO v_settings FROM public.member_otp_settings LIMIT 1;
  IF v_settings.transport_mode IS DISTINCT FROM 'manual_test' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'manual_test_disabled');
  END IF;

  v_phone := COALESCE(
    public._normalize_phone_e164_br(v_member.whatsapp),
    public._normalize_phone_e164_br(v_member.phone)
  );
  IF v_phone IS NULL OR length(v_phone) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'member_missing_phone');
  END IF;

  -- "Apenas um membro por vez": supera qualquer desafio manual_test ainda
  -- ativo antes de emitir um novo (também protegido pelo índice único
  -- parcial uniq_member_otp_challenges_manual_test_active sob concorrência).
  UPDATE public.member_otp_challenges
  SET used_at = now(), consumed_result = 'superseded'
  WHERE transport_mode = 'manual_test' AND used_at IS NULL;

  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  v_code_hash := encode(digest(v_code, 'sha256'), 'hex');
  v_expires_at := now() + interval '5 minutes';

  INSERT INTO public.member_otp_challenges (
    organization_id, member_id, phone_normalized, code_hash, transport_mode,
    requested_by_admin, expires_at
  ) VALUES (
    v_member.organization_id, v_member.id, v_phone, v_code_hash, 'manual_test',
    auth.uid(), v_expires_at
  )
  RETURNING id INTO v_challenge_id;

  INSERT INTO public.member_otp_admin_audit (organization_id, member_id, actor_user_id, challenge_id)
  VALUES (v_member.organization_id, v_member.id, auth.uid(), v_challenge_id);

  RETURN jsonb_build_object(
    'ok', true,
    'member_id', v_member.id,
    'member_name', v_member.full_name,
    'phone_normalized', v_phone,
    'code', v_code,
    'expires_at', v_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_generate_manual_test_otp(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_generate_manual_test_otp(uuid) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.access_responsibility_definitions
    WHERE responsibility_type IN ('church_admin', 'responsible_pastor')
      AND 'member_login.otp_test' = ANY(permission_keys)
  ) THEN
    RAISE EXCEPTION 'Migration member_login_otp_admin_test: capability member_login.otp_test nao foi concedida a nenhuma responsabilidade de governanca';
  END IF;
  IF to_regprocedure('public.admin_generate_manual_test_otp(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Migration member_login_otp_admin_test: RPC admin_generate_manual_test_otp nao foi criada';
  END IF;
  RAISE NOTICE 'Migration member_login_otp_admin_test: capability, auditoria e RPC de teste manual confirmadas ✓';
END $$;

COMMIT;
