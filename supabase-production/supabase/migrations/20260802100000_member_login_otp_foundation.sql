-- ============================================================================
-- Migration: member_login_otp_foundation
-- Timestamp: 20260802100000
-- OPERAÇÃO ESPECIAL — Auditoria e conclusão de TV Digital, Canal Eclésia e
-- Ecclesia Chat / Login por telefone (Parte D — Login por telefone/WhatsApp)
-- ============================================================================
--
-- CONTRATO (ver docs/architecture/contrato-dominios-institucionais.md):
--   1. Pessoa continua sendo exclusivamente public.members. Este login NUNCA
--      cria uma segunda pessoa — apenas vincula um auth.users.id EXISTENTE (ou
--      criado por este fluxo, quando ainda não existir) ao members.id já
--      cadastrado pela Secretaria, usando a MESMA ponte já usada por
--      member_invites/accept_member_invite: public.members.user_id.
--   2. Telefone/WhatsApp é o IDENTIFICADOR DE ENTRADA, nunca prova de
--      identidade sozinho — o código de verificação é a prova de posse do
--      número. Nenhuma linha desta migration pode marcar um membro como
--      autenticado sem um código validado.
--   3. Transporte de envio é modelado explicitamente e falha fechado:
--      'disabled' | 'manual_test' | 'provider'. NENHUM provedor real de
--      WhatsApp/SMS é chamado por este código — 'provider' está sempre
--      indisponível nesta operação (ver função request_member_login_otp).
--      Produção deve iniciar em 'disabled' (linha semente abaixo).
--   4. Nenhum código é armazenado em texto puro. Apenas o hash sha256
--      (mesmo padrão de member_validation_tokens). O código em texto puro só
--      existe no valor de retorno da RPC administrativa de teste manual
--      (20260802110000_member_login_otp_admin_test.sql) — nunca gravado,
--      nunca em RAISE NOTICE/LOG.
--   5. Ambiguidade/duplicidade de telefone falha explicitamente
--      ('ambiguous_phone') — esta migration NUNCA adivinha qual membro é o
--      dono do número quando mais de um cadastro compartilha o mesmo
--      telefone normalizado.
--   6. A emissão da SESSÃO autenticada (auth.users + JWT) não pode ser feita
--      em SQL puro — depende da Admin API do Supabase Auth, que só existe do
--      lado do service_role (Edge Function). Por isso as funções de
--      verificação/vínculo desta migration são REVOGADAS de anon/authenticated
--      e concedidas apenas a service_role: são chamadas exclusivamente pela
--      Edge Function supabase/functions/verify-member-login-otp (Parte D,
--      item 7 do desafio → sessão). O frontend nunca vê o hash nem o código.
--
-- ESTA MIGRATION (fundação):
--   * member_otp_settings — singleton de transporte (disabled/manual_test/
--     provider), nunca guarda credencial;
--   * member_otp_request_log — rastro leve para limitar taxa de pedidos por
--     telefone, mesmo quando o pedido falha (transporte desligado);
--   * member_otp_challenges — desafios com hash, expiração, tentativas;
--   * public._normalize_phone_e164_br(text) — normalização única e
--     reaproveitada por toda a Parte D;
--   * public.request_member_login_otp(text) — RPC pública (anon+authenticated)
--     que resolve o membro pelo telefone e decide se um desafio pode ser
--     emitido; SEMPRE falha fechado nesta operação (transporte real ausente);
--   * public._verify_member_login_otp_internal(text, text) — validação
--     atômica do código, uso único, RESTRITA a service_role;
--   * public.link_member_auth_user(uuid, uuid) — vínculo idempotente
--     members.user_id ↔ auth.users.id, RESTRITA a service_role, nunca
--     sobrescreve um vínculo existente para outro usuário.
--
-- Esta migration NÃO é aplicada. Não altera members, member_invites,
-- access_invites nem nenhum outro módulo.
-- ============================================================================

BEGIN;

-- ── Preflight ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.members') IS NULL THEN v_missing := array_append(v_missing, 'public.members'); END IF;
  IF to_regclass('public.organizations') IS NULL THEN v_missing := array_append(v_missing, 'public.organizations'); END IF;
  IF to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    v_missing := array_append(v_missing, 'public.update_updated_at_column()');
  END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'member_login_otp_foundation preflight failed; missing: %', array_to_string(v_missing, ', ');
  END IF;
END;
$$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. member_otp_settings (singleton, plataforma inteira) ─────────────────
CREATE TABLE IF NOT EXISTS public.member_otp_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true,
  transport_mode text NOT NULL DEFAULT 'disabled'
    CHECK (transport_mode IN ('disabled', 'manual_test', 'provider')),
  -- Apenas o NOME do provedor pretendido (ex.: 'whatsapp_cloud_api'), nunca
  -- credencial/segredo. Sem provider_name configurado, 'provider' nunca é
  -- aceito por request_member_login_otp mesmo que alguém tente setá-lo.
  provider_name text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_otp_settings_singleton UNIQUE (singleton),
  CONSTRAINT member_otp_settings_singleton_true CHECK (singleton)
);

-- Linha semente única. Produção e staging começam ambos em 'disabled' —
-- staging só é elevado para 'manual_test' por uma ação administrativa
-- explícita e auditada (RPC da próxima migration), nunca por padrão de banco.
INSERT INTO public.member_otp_settings (transport_mode)
VALUES ('disabled')
ON CONFLICT (singleton) DO NOTHING;

DROP TRIGGER IF EXISTS update_member_otp_settings_updated_at ON public.member_otp_settings;
CREATE TRIGGER update_member_otp_settings_updated_at
BEFORE UPDATE ON public.member_otp_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.member_otp_settings ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy: leitura/escrita somente por RPC SECURITY DEFINER (abaixo e
-- na próxima migration). Mesmo padrão de member_validation_tokens.

-- ── 2. member_otp_request_log (rate limit, mesmo quando o pedido falha) ────
CREATE TABLE IF NOT EXISTS public.member_otp_request_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_normalized text NOT NULL,
  outcome text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_otp_request_log_phone_time
  ON public.member_otp_request_log (phone_normalized, requested_at DESC);

ALTER TABLE public.member_otp_request_log ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy: só a própria RPC (SECURITY DEFINER) grava/lê este rastro.

-- ── 3. member_otp_challenges ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.member_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  phone_normalized text NOT NULL,
  code_hash text NOT NULL,
  purpose text NOT NULL DEFAULT 'login' CHECK (purpose IN ('login')),
  transport_mode text NOT NULL CHECK (transport_mode IN ('manual_test', 'provider')),
  requested_by_admin uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  consumed_result text CHECK (
    consumed_result IS NULL
    OR consumed_result IN ('verified', 'expired', 'max_attempts', 'superseded')
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_otp_challenges_phone_active
  ON public.member_otp_challenges (phone_normalized, created_at DESC)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_member_otp_challenges_member
  ON public.member_otp_challenges (member_id);

-- No máximo um desafio manual_test "vivo" (não usado) no sistema inteiro —
-- reforça em banco a regra "teste de apenas um membro por vez" (a RPC
-- administrativa também supera desafios manual_test anteriores antes de criar
-- um novo, mas o índice garante isso mesmo sob concorrência).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_member_otp_challenges_manual_test_active
  ON public.member_otp_challenges ((transport_mode))
  WHERE transport_mode = 'manual_test' AND used_at IS NULL;

ALTER TABLE public.member_otp_challenges ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy: leitura/escrita somente pelas RPCs SECURITY DEFINER abaixo.

-- ── 4. Normalização de telefone (E.164 assumindo Brasil, +55) ──────────────
-- Mesma convenção já usada no frontend (formatWhatsappNumber, em
-- src/lib/memberInvites.ts): remove tudo que não é dígito e garante o DDI 55
-- quando ausente. Centralizado aqui para nunca haver duas normalizações
-- divergentes entre o RPC de pedido, o de verificação e o de teste manual.
CREATE OR REPLACE FUNCTION public._normalize_phone_e164_br(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_raw IS NULL OR btrim(p_raw) = '' THEN NULL
    WHEN length(regexp_replace(p_raw, '\D', '', 'g')) >= 12
      AND regexp_replace(p_raw, '\D', '', 'g') LIKE '55%'
      THEN regexp_replace(p_raw, '\D', '', 'g')
    WHEN length(regexp_replace(p_raw, '\D', '', 'g')) >= 10
      THEN '55' || regexp_replace(p_raw, '\D', '', 'g')
    ELSE regexp_replace(p_raw, '\D', '', 'g')
  END;
$$;

REVOKE ALL ON FUNCTION public._normalize_phone_e164_br(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._normalize_phone_e164_br(text) TO service_role;

-- ── 5. request_member_login_otp — ponto de entrada público (pré-login) ─────
-- Sempre falha fechado nesta operação (nenhum transporte real habilitado):
-- resolve o membro (ou falha explicitamente por ausência/ambiguidade) e só
-- então reporta por que o desafio não pode ser emitido agora. Nunca cria um
-- member_otp_challenges utilizável nesta operação — isso é intencional (ver
-- contrato acima, item 3).
CREATE OR REPLACE FUNCTION public.request_member_login_otp(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_phone text;
  v_recent_requests integer;
  v_match_count integer;
  v_settings record;
BEGIN
  v_phone := public._normalize_phone_e164_br(p_phone);
  IF v_phone IS NULL OR length(v_phone) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_phone');
  END IF;

  -- Rate limit: no máximo 5 pedidos por número a cada 15 minutos, contando
  -- inclusive os pedidos que falham (nunca deixa o rastro só para sucesso).
  SELECT count(*) INTO v_recent_requests
  FROM public.member_otp_request_log
  WHERE phone_normalized = v_phone AND requested_at > now() - interval '15 minutes';

  IF v_recent_requests >= 5 THEN
    INSERT INTO public.member_otp_request_log (phone_normalized, outcome)
    VALUES (v_phone, 'rate_limited');
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;

  SELECT count(*) INTO v_match_count
  FROM public.members
  WHERE public._normalize_phone_e164_br(phone) = v_phone
     OR public._normalize_phone_e164_br(whatsapp) = v_phone;

  IF v_match_count = 0 THEN
    INSERT INTO public.member_otp_request_log (phone_normalized, outcome) VALUES (v_phone, 'member_not_found');
    RETURN jsonb_build_object('ok', false, 'error', 'member_not_found');
  END IF;

  IF v_match_count > 1 THEN
    INSERT INTO public.member_otp_request_log (phone_normalized, outcome) VALUES (v_phone, 'ambiguous_phone');
    RETURN jsonb_build_object(
      'ok', false, 'error', 'ambiguous_phone',
      'hint', 'Mais de um cadastro usa este número. Procure a Secretaria da sua igreja.'
    );
  END IF;

  SELECT transport_mode, provider_name INTO v_settings FROM public.member_otp_settings LIMIT 1;

  IF v_settings.transport_mode = 'disabled' THEN
    INSERT INTO public.member_otp_request_log (phone_normalized, outcome) VALUES (v_phone, 'otp_disabled');
    RETURN jsonb_build_object('ok', false, 'error', 'otp_disabled');
  END IF;

  IF v_settings.transport_mode = 'manual_test' THEN
    -- Autoatendimento nunca dispara um desafio manual_test: isso só é
    -- permitido a um administrador autorizado, para UM membro por vez, pela
    -- RPC admin_generate_manual_test_otp (próxima migration). O próprio
    -- código do teste é obtido fora desta chamada.
    INSERT INTO public.member_otp_request_log (phone_normalized, outcome) VALUES (v_phone, 'manual_test_admin_only');
    RETURN jsonb_build_object('ok', false, 'error', 'otp_manual_test_admin_only');
  END IF;

  -- transport_mode = 'provider': nesta operação, NENHUM provedor real está
  -- configurado/autorizado a enviar WhatsApp — falha fechado sempre,
  -- independentemente de provider_name estar preenchido ou não. Habilitar o
  -- envio real é uma operação futura explícita, fora deste escopo.
  INSERT INTO public.member_otp_request_log (phone_normalized, outcome) VALUES (v_phone, 'provider_not_configured');
  RETURN jsonb_build_object('ok', false, 'error', 'otp_provider_not_configured');
END;
$$;

REVOKE ALL ON FUNCTION public.request_member_login_otp(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_member_login_otp(text) TO anon, authenticated;

-- ── 6. _verify_member_login_otp_internal — restrita a service_role ─────────
-- Chamada exclusivamente pela Edge Function verify-member-login-otp (que usa
-- o cliente service_role). Nunca exposta a anon/authenticated via PostgREST:
-- a emissão de sessão precisa da Admin API do Supabase Auth, que só existe
-- no runtime da Edge Function — esta função apenas confirma a posse do
-- número e consome o desafio atomicamente.
CREATE OR REPLACE FUNCTION public._verify_member_login_otp_internal(
  p_phone text,
  p_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_phone text;
  v_code_hash text;
  v_challenge record;
BEGIN
  v_phone := public._normalize_phone_e164_br(p_phone);
  IF v_phone IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_phone');
  END IF;
  IF p_code IS NULL OR btrim(p_code) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  SELECT * INTO v_challenge
  FROM public.member_otp_challenges
  WHERE phone_normalized = v_phone AND used_at IS NULL
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
      'attempts_remaining', GREATEST(v_challenge.max_attempts - (v_challenge.attempt_count + 1), 0)
    );
  END IF;

  UPDATE public.member_otp_challenges
  SET used_at = now(), consumed_result = 'verified'
  WHERE id = v_challenge.id;

  RETURN jsonb_build_object(
    'ok', true,
    'member_id', v_challenge.member_id,
    'organization_id', v_challenge.organization_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public._verify_member_login_otp_internal(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._verify_member_login_otp_internal(text, text) TO service_role;

-- ── 7. link_member_auth_user — vínculo idempotente members.user_id ─────────
-- Mesma ponte já usada por accept_member_invite: nunca cria uma segunda
-- pessoa, apenas grava members.user_id quando ainda vazio. Se o membro já
-- estiver vinculado a OUTRO auth.users.id, falha explicitamente (nunca
-- sobrescreve silenciosamente um vínculo existente).
CREATE OR REPLACE FUNCTION public.link_member_auth_user(
  p_member_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_user_id uuid;
BEGIN
  IF p_member_id IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_arguments');
  END IF;

  SELECT user_id INTO v_current_user_id FROM public.members WHERE id = p_member_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'member_not_found');
  END IF;

  IF v_current_user_id IS NOT NULL AND v_current_user_id != p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'member_already_linked_to_another_user');
  END IF;

  IF v_current_user_id IS NULL THEN
    BEGIN
      UPDATE public.members SET user_id = p_user_id WHERE id = p_member_id;
    EXCEPTION WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'error', 'auth_user_already_linked_to_another_member');
    END;
  END IF;

  RETURN jsonb_build_object('ok', true, 'member_id', p_member_id, 'user_id', p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.link_member_auth_user(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_member_auth_user(uuid, uuid) TO service_role;

-- ── Verificação final ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.member_otp_settings WHERE singleton) THEN
    RAISE EXCEPTION 'Migration member_login_otp_foundation: linha semente de member_otp_settings ausente';
  END IF;
  IF (SELECT transport_mode FROM public.member_otp_settings LIMIT 1) != 'disabled' THEN
    RAISE EXCEPTION 'Migration member_login_otp_foundation: transport_mode inicial deve ser disabled';
  END IF;
  IF to_regprocedure('public.request_member_login_otp(text)') IS NULL THEN
    RAISE EXCEPTION 'Migration member_login_otp_foundation: RPC request_member_login_otp nao foi criada';
  END IF;
  IF to_regprocedure('public._verify_member_login_otp_internal(text,text)') IS NULL THEN
    RAISE EXCEPTION 'Migration member_login_otp_foundation: RPC _verify_member_login_otp_internal nao foi criada';
  END IF;
  IF to_regprocedure('public.link_member_auth_user(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Migration member_login_otp_foundation: RPC link_member_auth_user nao foi criada';
  END IF;
  RAISE NOTICE 'Migration member_login_otp_foundation: tabelas, normalizacao e RPCs de OTP confirmadas ✓';
END $$;

COMMIT;
