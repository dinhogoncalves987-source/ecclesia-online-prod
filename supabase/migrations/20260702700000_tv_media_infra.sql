-- =============================================================================
-- Ecclesia TV Digital — Infra Real: Heartbeat, Viewer Count, RRULE, Auto-Publish
-- =============================================================================

-- ── 1. Colunas adicionais em tv_channels ────────────────────────────────────

-- Publica automaticamente no Canal Ecclesia quando recording_status = uploaded
ALTER TABLE public.tv_channels
  ADD COLUMN IF NOT EXISTS auto_publish_to_canal   boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_canal_channel_id uuid
    REFERENCES public.ecclesia_channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS max_recording_minutes   integer     NOT NULL DEFAULT 240,
  ADD COLUMN IF NOT EXISTS heartbeat_interval_sec  integer     NOT NULL DEFAULT 30;

-- ── 2. Colunas adicionais em tv_live_sessions ────────────────────────────────

-- hls_path: path relativo gerado pelo MediaMTX (ex: /hls/live/ecclesia_abc/index.m3u8)
ALTER TABLE public.tv_live_sessions
  ADD COLUMN IF NOT EXISTS hls_path       text,
  ADD COLUMN IF NOT EXISTS rtmp_path      text,
  ADD COLUMN IF NOT EXISTS session_token  text;   -- token opaco para chamadas externas

-- ── 3. Colunas adicionais em tv_replays ─────────────────────────────────────

ALTER TABLE public.tv_replays
  ADD COLUMN IF NOT EXISTS file_size_bytes  bigint,
  ADD COLUMN IF NOT EXISTS processing_error text;

-- ── 4. RPC: update_live_session_heartbeat ───────────────────────────────────
-- Chamado pelo script on_publish (MediaMTX) e periodicamente pelo heartbeat_monitor.sh.
-- Atualiza last_heartbeat_at e pode incrementar viewer_count.

CREATE OR REPLACE FUNCTION public.update_live_session_heartbeat(
  p_session_id   uuid,
  p_viewer_count integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tv_live_sessions
  SET
    last_heartbeat_at = now(),
    status_transmissao = CASE
      WHEN status_transmissao IN ('waiting', 'offline') THEN 'live'
      ELSE status_transmissao
    END,
    viewer_count       = COALESCE(p_viewer_count, viewer_count),
    peak_viewer_count  = GREATEST(peak_viewer_count, COALESCE(p_viewer_count, viewer_count))
  WHERE id = p_session_id;
END;
$$;

-- ── 5. RPC: check_stale_live_sessions ───────────────────────────────────────
-- Detecta transmissões que pararam sem encerramento explícito.
-- Chamado pelo pg_cron (se disponível) ou pelo Edge Function check-stale-sessions.

CREATE OR REPLACE FUNCTION public.check_stale_live_sessions(
  p_timeout_seconds integer DEFAULT 90
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.tv_live_sessions
  SET
    status_transmissao = 'error',
    error_message      = 'Transmissão sem heartbeat por mais de ' || p_timeout_seconds || 's',
    ended_at           = COALESCE(ended_at, now()),
    updated_at         = now()
  WHERE status_transmissao = 'live'
    AND last_heartbeat_at IS NOT NULL
    AND last_heartbeat_at < now() - (p_timeout_seconds || ' seconds')::interval;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── 6. RPC: track_tv_view_event ─────────────────────────────────────────────
-- Chamado pelo frontend ao abrir/fechar o player e a cada 30s de heartbeat.

CREATE OR REPLACE FUNCTION public.track_tv_view_event(
  p_channel_id      uuid,
  p_session_id      uuid        DEFAULT NULL,
  p_event_type      text        DEFAULT 'heartbeat',
  p_viewer_session  text        DEFAULT NULL,
  p_watched_seconds integer     DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.tv_view_events (
    organization_id,
    tv_channel_id,
    live_session_id,
    viewer_user_id,
    viewer_session_id,
    event_type,
    watch_duration_seconds
  )
  SELECT
    ch.organization_id,
    p_channel_id,
    p_session_id,
    auth.uid(),
    p_viewer_session,
    p_event_type,
    p_watched_seconds
  FROM public.tv_channels ch
  WHERE ch.id = p_channel_id;

  -- Se for 'join' ou 'heartbeat', atualizar viewer_count ao vivo
  IF p_session_id IS NOT NULL AND p_event_type IN ('join', 'heartbeat') THEN
    UPDATE public.tv_live_sessions ls
    SET viewer_count = (
      SELECT COUNT(DISTINCT COALESCE(viewer_user_id::text, viewer_session_id))
      FROM public.tv_view_events
      WHERE live_session_id = p_session_id
        AND event_type IN ('join', 'heartbeat')
        AND created_at > now() - interval '3 minutes'
    ),
    peak_viewer_count = GREATEST(
      peak_viewer_count,
      (
        SELECT COUNT(DISTINCT COALESCE(viewer_user_id::text, viewer_session_id))
        FROM public.tv_view_events
        WHERE live_session_id = p_session_id
          AND event_type IN ('join', 'heartbeat')
          AND created_at > now() - interval '3 minutes'
      )
    )
    WHERE ls.id = p_session_id;
  END IF;
END;
$$;

-- ── 7. RPC: generate_recurring_instances ────────────────────────────────────
-- Expande um bloco recorrente em instâncias concretas para os próximos N dias.
-- Suporta: FREQ=WEEKLY;BYDAY=SU,MO,...  e FREQ=DAILY;INTERVAL=N

CREATE OR REPLACE FUNCTION public.generate_recurring_instances(
  p_block_id   uuid,
  p_weeks      integer DEFAULT 4
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_block         record;
  v_rule          text;
  v_freq          text;
  v_interval      integer := 1;
  v_byday         text[];
  v_duration      interval;
  v_current_date  date;
  v_end_date      date := CURRENT_DATE + (p_weeks * 7);
  v_instance_start timestamptz;
  v_created       integer := 0;
  v_day_map       integer[];
  v_dow           integer;
  v_block_dow     integer;
  d               integer;
BEGIN
  SELECT * INTO v_block FROM public.tv_schedule_blocks WHERE id = p_block_id;
  IF NOT FOUND OR v_block.recurrence_rule IS NULL THEN
    RETURN 0;
  END IF;

  v_rule     := v_block.recurrence_rule;
  v_duration := v_block.end_time - v_block.start_time;

  -- Extrair FREQ
  SELECT (regexp_match(v_rule, 'FREQ=(\w+)'))[1] INTO v_freq;
  IF v_freq IS NULL THEN RETURN 0; END IF;

  -- Extrair INTERVAL
  SELECT COALESCE((regexp_match(v_rule, 'INTERVAL=(\d+)'))[1]::integer, 1) INTO v_interval;

  -- Extrair BYDAY (SU,MO,TU,WE,TH,FR,SA → 0,1,2,3,4,5,6)
  SELECT
    ARRAY(
      SELECT CASE x
        WHEN 'SU' THEN 0 WHEN 'MO' THEN 1 WHEN 'TU' THEN 2
        WHEN 'WE' THEN 3 WHEN 'TH' THEN 4 WHEN 'FR' THEN 5
        WHEN 'SA' THEN 6
      END
      FROM unnest(string_to_array((regexp_match(v_rule, 'BYDAY=([A-Z,]+)'))[1], ',')) x
    )
  INTO v_day_map;

  v_current_date := CURRENT_DATE;

  LOOP
    EXIT WHEN v_current_date > v_end_date;

    v_dow := EXTRACT(DOW FROM v_current_date)::integer;  -- 0=Sun..6=Sat

    IF v_freq = 'DAILY' THEN
      -- Gerar instância apenas a cada v_interval dias
      v_block_dow := EXTRACT(DOW FROM v_block.start_time::date)::integer;
      IF MOD(v_current_date - v_block.start_time::date, v_interval) = 0 THEN
        v_instance_start := v_current_date + v_block.start_time::time;
        -- Verificar se já existe bloco nesse horário
        IF NOT EXISTS (
          SELECT 1 FROM public.tv_schedule_blocks
          WHERE tv_channel_id = v_block.tv_channel_id
            AND start_time = v_instance_start
            AND status != 'cancelled'
        ) THEN
          INSERT INTO public.tv_schedule_blocks (
            organization_id, church_id, tv_channel_id, program_id,
            start_time, end_time, block_type, status, priority
          ) VALUES (
            v_block.organization_id, v_block.church_id, v_block.tv_channel_id, v_block.program_id,
            v_instance_start, v_instance_start + v_duration,
            v_block.block_type, 'scheduled', v_block.priority
          );
          v_created := v_created + 1;
        END IF;
      END IF;

    ELSIF v_freq = 'WEEKLY' THEN
      -- Verificar se o dia atual está na lista BYDAY
      IF v_dow = ANY(v_day_map) THEN
        v_instance_start := v_current_date + v_block.start_time::time;
        IF NOT EXISTS (
          SELECT 1 FROM public.tv_schedule_blocks
          WHERE tv_channel_id = v_block.tv_channel_id
            AND start_time = v_instance_start
            AND status != 'cancelled'
        ) THEN
          INSERT INTO public.tv_schedule_blocks (
            organization_id, church_id, tv_channel_id, program_id,
            start_time, end_time, block_type, status, priority
          ) VALUES (
            v_block.organization_id, v_block.church_id, v_block.tv_channel_id, v_block.program_id,
            v_instance_start, v_instance_start + v_duration,
            v_block.block_type, 'scheduled', v_block.priority
          );
          v_created := v_created + 1;
        END IF;
      END IF;
    END IF;

    v_current_date := v_current_date + 1;
  END LOOP;

  RETURN v_created;
END;
$$;

-- ── 8. Trigger: auto-publish TV → Canal quando recording_status = uploaded ──

CREATE OR REPLACE FUNCTION public.tv_auto_publish_to_canal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_channel record;
  v_result  jsonb;
BEGIN
  -- Só age quando recording_status muda para 'uploaded'
  IF NEW.recording_status = 'uploaded'
     AND (OLD.recording_status IS DISTINCT FROM 'uploaded')
     AND NEW.r2_storage_key IS NOT NULL
  THEN
    SELECT * INTO v_channel
    FROM public.tv_channels
    WHERE id = NEW.tv_channel_id
      AND auto_publish_to_canal = true
      AND default_canal_channel_id IS NOT NULL;

    IF FOUND THEN
      SELECT public.import_tv_session_to_canal(
        NEW.id,
        v_channel.default_canal_channel_id,
        COALESCE(
          (SELECT title FROM public.tv_programs WHERE id = NEW.program_id LIMIT 1),
          'Transmissão ao vivo — ' || to_char(NEW.started_at, 'DD/MM/YYYY HH24:MI')
        ),
        'culto',
        NULL
      ) INTO v_result;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER tv_live_sessions_auto_publish
    AFTER UPDATE OF recording_status ON public.tv_live_sessions
    FOR EACH ROW EXECUTE FUNCTION public.tv_auto_publish_to_canal();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 9. pg_cron: checar sessões sem heartbeat a cada 2 minutos ────────────────
-- Requer extensão pg_cron habilitada no Supabase (Dashboard → Extensions).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'ecclesia-check-stale-sessions',
      '*/2 * * * *',
      'SELECT public.check_stale_live_sessions(90)'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron não disponível; usar Edge Function check-stale-sessions com cron externo
  NULL;
END $$;

-- ── 10. RPC: get_session_detail ───────────────────────────────────────────────
-- Retorna detalhes completos de uma sessão ao vivo para o painel admin.

CREATE OR REPLACE FUNCTION public.get_tv_session_detail(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_session record;
  v_channel record;
  v_key     record;
BEGIN
  SELECT ls.*, c.name AS channel_name, c.slug AS channel_slug
  INTO v_session
  FROM public.tv_live_sessions ls
  JOIN public.tv_channels c ON c.id = ls.tv_channel_id
  WHERE ls.id = p_session_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO v_key
  FROM public.tv_stream_keys
  WHERE id = v_session.stream_key_id;

  RETURN jsonb_build_object(
    'found',              true,
    'id',                 v_session.id,
    'status',             v_session.status_transmissao,
    'channel_name',       v_session.channel_name,
    'channel_slug',       v_session.channel_slug,
    'hls_url',            v_session.hls_url,
    'rtmp_url',           v_session.rtmp_url,
    'hls_path',           v_session.hls_path,
    'rtmp_path',          v_session.rtmp_path,
    'started_at',         v_session.started_at,
    'ended_at',           v_session.ended_at,
    'last_heartbeat_at',  v_session.last_heartbeat_at,
    'viewer_count',       v_session.viewer_count,
    'peak_viewer_count',  v_session.peak_viewer_count,
    'recording_status',   v_session.recording_status,
    'r2_storage_key',     v_session.r2_storage_key,
    'error_message',      v_session.error_message,
    'stream_key_last4',   v_key.stream_key_last4,
    'stream_source_type', v_session.stream_source_type
  );
END;
$$;

-- ── Comentários ───────────────────────────────────────────────────────────────

COMMENT ON FUNCTION public.check_stale_live_sessions IS
  'Detecta transmissões que pararam sem encerramento. Idealmente chamada pelo pg_cron
   a cada 2 minutos. Fallback: Edge Function check-stale-sessions chamada externamente.';

COMMENT ON FUNCTION public.generate_recurring_instances IS
  'Expande um bloco com recurrence_rule em instâncias concretas no tv_schedule_blocks.
   Suporta FREQ=WEEKLY/DAILY com BYDAY e INTERVAL.
   Útil para: criar blocos de culto dominical automaticamente para os próximos N meses.';

COMMENT ON COLUMN public.tv_channels.auto_publish_to_canal IS
  'Se true + default_canal_channel_id preenchido: ao concluir gravação (recording_status=uploaded),
   importa automaticamente para ecclesia_videos via trigger.';
