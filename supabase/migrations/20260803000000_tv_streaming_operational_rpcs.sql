-- ============================================================================
-- Migration: tv_streaming_operational_rpcs
-- Timestamp: 20260803000000
-- OPERAÇÃO FINAL — TV Digital, Canal Eclésia e Chat (Parte TV — RPCs
-- operacionais para as Edge Functions que fazem a ponte com a VPS
-- MediaMTX/LiveKit).
-- ============================================================================
--
-- Depende de 20260802120000_tv_canal_foundation.sql e
-- 20260802130000_tv_canal_live_production.sql (imutáveis — não são reabertas
-- aqui; esta é uma migration NOVA e incremental).
--
-- Contexto: as Edge Functions validate-tv-stream-key e update-tv-heartbeat
-- são chamadas pela VPS MediaMTX (webhook com segredo compartilhado), não por
-- um usuário autenticado — por isso não têm auth.uid() disponível e precisam
-- de RPCs SECURITY DEFINER restritas a service_role, com toda a lógica crítica
-- (lookup de chave, criação/atualização de sessão) dentro de uma única
-- transação com FOR UPDATE, em vez de múltiplas queries soltas feitas direto
-- pela Edge Function (que teriam corrida entre o SELECT e o INSERT/UPDATE).
--
-- Esta migration NÃO é aplicada.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.tv_stream_keys') IS NULL THEN v_missing := array_append(v_missing, 'public.tv_stream_keys (rode 20260802120000 antes)'); END IF;
  IF to_regclass('public.tv_channels') IS NULL THEN v_missing := array_append(v_missing, 'public.tv_channels'); END IF;
  IF to_regclass('public.tv_live_sessions') IS NULL THEN v_missing := array_append(v_missing, 'public.tv_live_sessions'); END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'tv_streaming_operational_rpcs preflight failed; missing: %', array_to_string(v_missing, ', ');
  END IF;
END;
$$;

-- Uma organização não pode manter duas produções simultâneas para o mesmo
-- canal. Além de impedir duplo clique/retry, este índice torna inequívoco
-- qual liveSessionId o MediaMTX está autorizado a publicar.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tv_live_sessions_active_channel
ON public.tv_live_sessions (tv_channel_id)
WHERE status_transmissao IN ('waiting', 'live');

-- ── RPC: validate_and_start_tv_stream ───────────────────────────────────────
-- Chamada por validate-tv-stream-key (Edge Function, autenticada via segredo
-- compartilhado MEDIAMTX_WEBHOOK_SECRET, não via auth.uid()). Só service_role
-- pode executar. Recebe o HASH da stream key (nunca a chave em texto puro —
-- o hash é calculado na Edge Function antes de chamar esta RPC) e cria/
-- ativa EXATAMENTE a sessão cujo UUID veio no caminho RTMP. A sessão já deve
-- ter sido criada por create_live_production; esta RPC nunca inventa outra
-- sessão. Isso garante que live/<liveSessionId> no RTMP, HLS e banco represente
-- a mesma produção.
DROP FUNCTION IF EXISTS public.validate_and_start_tv_stream(text, text, text, text);

CREATE OR REPLACE FUNCTION public.validate_and_start_tv_stream(
  p_session_id uuid,
  p_stream_key_hash text,
  p_source_type text,
  p_hls_url text,
  p_rtmp_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key record;
  v_channel record;
  v_session record;
  v_now timestamptz := now();
BEGIN
  IF p_session_id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid_session_id');
  END IF;
  IF p_stream_key_hash IS NULL OR length(p_stream_key_hash) <> 64 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid_hash_format');
  END IF;

  SELECT * INTO v_key
  FROM public.tv_stream_keys
  WHERE stream_key_hash = p_stream_key_hash AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'key_not_found');
  END IF;

  SELECT * INTO v_channel
  FROM public.tv_channels
  WHERE id = v_key.tv_channel_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'channel_inactive');
  END IF;

  SELECT * INTO v_session
  FROM public.tv_live_sessions
  WHERE id = p_session_id
    AND organization_id = v_key.organization_id
    AND tv_channel_id = v_key.tv_channel_id
    AND status_transmissao IN ('live', 'waiting')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'session_not_found_or_mismatch');
  END IF;

  UPDATE public.tv_stream_keys SET last_used_at = v_now WHERE id = v_key.id;

  UPDATE public.tv_live_sessions
  SET status_transmissao = 'live',
      stream_key_id = v_key.id,
      stream_source_type = COALESCE(p_source_type, stream_source_type, 'obs'),
      hls_url = p_hls_url,
      rtmp_url = p_rtmp_url,
      playback_url = COALESCE(p_hls_url, playback_url),
      started_at = COALESCE(started_at, v_now),
      last_heartbeat_at = v_now,
      error_message = NULL
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'valid', true,
    'session_id', p_session_id,
    'tv_channel_id', v_key.tv_channel_id,
    'organization_id', v_key.organization_id,
    'channel_slug', v_channel.slug,
    'hls_url', p_hls_url,
    'rtmp_url', p_rtmp_url,
    'key_last4', v_key.stream_key_last4
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_and_start_tv_stream(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_and_start_tv_stream(uuid, text, text, text, text) TO service_role;

-- ── RPC: stop_tv_stream_by_session ───────────────────────────────────────────
-- Chamada por um futuro hook "on_publish_done" do MediaMTX (webhook com
-- segredo compartilhado) quando o publisher desconecta — marca a sessão como
-- 'ended' imediatamente, em vez de depender só do timeout de heartbeat.
CREATE OR REPLACE FUNCTION public.stop_tv_stream_by_session(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.tv_live_sessions
  SET status_transmissao = 'ended', ended_at = now()
  WHERE id = p_session_id AND status_transmissao IN ('live', 'waiting');

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.stop_tv_stream_by_session(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stop_tv_stream_by_session(uuid) TO service_role;

-- ── RPC: update_live_session_heartbeat ──────────────────────────────────────
-- Chamada por update-tv-heartbeat (Edge Function, webhook MediaMTX). Mantém
-- last_heartbeat_at e viewer_count atualizados; nunca reativa uma sessão já
-- encerrada (evita "ressuscitar" uma transmissão finalizada por um heartbeat
-- atrasado que chegue fora de ordem).
CREATE OR REPLACE FUNCTION public.update_live_session_heartbeat(
  p_session_id uuid,
  p_viewer_count integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.tv_live_sessions
  SET last_heartbeat_at = now(),
      viewer_count = COALESCE(p_viewer_count, viewer_count),
      peak_viewer_count = GREATEST(peak_viewer_count, COALESCE(p_viewer_count, 0))
  WHERE id = p_session_id AND status_transmissao = 'live';
END;
$$;

REVOKE ALL ON FUNCTION public.update_live_session_heartbeat(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_live_session_heartbeat(uuid, integer) TO service_role;

-- ── RPC: check_stale_tv_live_sessions ────────────────────────────────────────
-- Marca como 'error' qualquer sessão 'live' cujo heartbeat parou de chegar há
-- mais de 90s (2-3x o intervalo esperado do heartbeat_monitor da VPS).
-- Pensada para ser chamada por um cron futuro (pg_cron) OU manualmente pelo
-- Codex; não é agendada automaticamente por esta migration (nenhum cron é
-- criado aqui — apenas a função fica pronta).
CREATE OR REPLACE FUNCTION public.check_stale_tv_live_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.tv_live_sessions
  SET status_transmissao = 'error',
      error_message = 'heartbeat_timeout: nenhum sinal da VPS ha mais de 90s'
  WHERE status_transmissao = 'live'
    AND last_heartbeat_at IS NOT NULL
    AND last_heartbeat_at < now() - interval '90 seconds';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.check_stale_tv_live_sessions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_stale_tv_live_sessions() TO service_role;

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regprocedure('public.validate_and_start_tv_stream(uuid,text,text,text,text)') IS NULL THEN v_missing := array_append(v_missing, 'validate_and_start_tv_stream'); END IF;
  IF to_regprocedure('public.stop_tv_stream_by_session(uuid)') IS NULL THEN v_missing := array_append(v_missing, 'stop_tv_stream_by_session'); END IF;
  IF to_regprocedure('public.update_live_session_heartbeat(uuid,integer)') IS NULL THEN v_missing := array_append(v_missing, 'update_live_session_heartbeat'); END IF;
  IF to_regprocedure('public.check_stale_tv_live_sessions()') IS NULL THEN v_missing := array_append(v_missing, 'check_stale_tv_live_sessions'); END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'Migration tv_streaming_operational_rpcs: itens ausentes apos criacao: %', array_to_string(v_missing, ', ');
  END IF;
  RAISE NOTICE 'Migration tv_streaming_operational_rpcs: RPCs de ingest/heartbeat/stale confirmadas ✓';
END $$;

COMMIT;
