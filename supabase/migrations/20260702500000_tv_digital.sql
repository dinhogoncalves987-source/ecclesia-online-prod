-- =============================================================================
-- Ecclesia TV Digital — Fase 1: Banco de Dados
-- =============================================================================
-- Cria toda a estrutura de dados da TV Digital Ecclesia.
-- Fontes de transmissão: OBS Studio | Celular | Computador
-- Stack: Supabase (metadados) + Cloudflare R2 (vídeos) + MediaMTX + HLS
-- =============================================================================

-- ── 1. CANAIS DE TV ───────────────────────────────────────────────────────────
-- Cada organização pode ter múltiplos canais (Canal Geral, Canal Jovens, etc.).

CREATE TABLE IF NOT EXISTS public.tv_channels (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL,
  church_id       uuid,
  name            text        NOT NULL,
  -- URL-friendly, único por organização (ex: "ad-caxias-do-sul")
  slug            text        NOT NULL,
  description     text,
  logo_url        text,
  cover_url       text,
  -- Visibilidade: público (qualquer pessoa), org_members, privado
  visibility      text        NOT NULL DEFAULT 'org_members'
    CHECK (visibility IN ('public', 'org_members', 'private')),
  status          text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_tv_channels_org
  ON public.tv_channels (organization_id, status);

-- ── 2. STREAM KEYS ────────────────────────────────────────────────────────────
-- Uma stream key por fonte (OBS, celular, computador).
-- A chave real NUNCA é armazenada — apenas o hash SHA-256 e os últimos 4 chars.
-- MediaMTX verifica: recebe key → hash → compara com stream_key_hash.

CREATE TABLE IF NOT EXISTS public.tv_stream_keys (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL,
  church_id           uuid,
  tv_channel_id       uuid        NOT NULL REFERENCES public.tv_channels(id) ON DELETE CASCADE,
  -- Identificação visual (admin vê "****abcd")
  stream_key_last4    text        NOT NULL,
  -- Hash SHA-256 da stream key (chave real nunca armazenada)
  stream_key_hash     text        NOT NULL,
  -- Fonte de transmissão rastreável
  stream_source_type  text        NOT NULL DEFAULT 'obs'
    CHECK (stream_source_type IN ('obs', 'mobile', 'computer')),
  label               text,         -- Ex: "OBS Principal", "Celular Pastoral"
  is_active           boolean     NOT NULL DEFAULT true,
  last_used_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tv_stream_keys_channel
  ON public.tv_stream_keys (tv_channel_id, is_active);

-- ── 3. PROGRAMAS ──────────────────────────────────────────────────────────────
-- Programas são templates reutilizáveis (ex: "Culto Dominical", "Escola Bíblica").

CREATE TABLE IF NOT EXISTS public.tv_programs (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid        NOT NULL,
  church_id                uuid,
  tv_channel_id            uuid        NOT NULL REFERENCES public.tv_channels(id) ON DELETE CASCADE,
  title                    text        NOT NULL,
  description              text,
  program_type             text        NOT NULL DEFAULT 'general'
    CHECK (program_type IN ('culto', 'pregacao', 'louvor', 'estudo', 'infantil',
                            'jovens', 'mulheres', 'homens', 'missoes',
                            'intervalo', 'noticiario', 'general')),
  host_name                text,
  ministry_id              uuid,
  thumbnail_url            text,
  default_duration_minutes integer     NOT NULL DEFAULT 60,
  status                   text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tv_programs_channel
  ON public.tv_programs (tv_channel_id, status);

-- ── 4. GRADE DE PROGRAMAÇÃO ────────────────────────────────────────────────────
-- Blocos de programação na grade linear.
-- Suporta blocos únicos e recorrentes (via recurrence_rule RRULE).

CREATE TABLE IF NOT EXISTS public.tv_schedule_blocks (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  church_id        uuid,
  tv_channel_id    uuid        NOT NULL REFERENCES public.tv_channels(id) ON DELETE CASCADE,
  program_id       uuid        REFERENCES public.tv_programs(id) ON DELETE SET NULL,
  -- Janela de exibição
  start_time       timestamptz NOT NULL,
  end_time         timestamptz NOT NULL,
  -- Recorrência RRULE-compatible (ex: 'FREQ=WEEKLY;BYDAY=SU' = todo domingo)
  recurrence_rule  text,
  -- Tipo do bloco na grade
  block_type       text        NOT NULL DEFAULT 'program'
    CHECK (block_type IN ('live', 'replay', 'program', 'interval', 'placeholder')),
  -- Para blocos de replay: referência ao asset de vídeo
  source_video_id  uuid,
  source_asset_url text,
  -- Estado atual do bloco
  status           text        NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'live', 'completed', 'cancelled')),
  -- Prioridade para sobreposição (live tem prioridade > replay)
  priority         integer     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tv_schedule_blocks_time_check CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_tv_schedule_channel_time
  ON public.tv_schedule_blocks (tv_channel_id, start_time, end_time)
  WHERE status != 'cancelled';

-- ── 5. SESSÕES DE TRANSMISSÃO AO VIVO ─────────────────────────────────────────
-- Rastreia cada transmissão, independentemente da fonte.
-- Campos obrigatórios para rastreabilidade do sinal (OBS/celular/computador).

CREATE TABLE IF NOT EXISTS public.tv_live_sessions (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid        NOT NULL,
  church_id            uuid,
  tv_channel_id        uuid        NOT NULL REFERENCES public.tv_channels(id) ON DELETE CASCADE,
  schedule_block_id    uuid        REFERENCES public.tv_schedule_blocks(id) ON DELETE SET NULL,
  program_id           uuid        REFERENCES public.tv_programs(id) ON DELETE SET NULL,
  stream_key_id        uuid        REFERENCES public.tv_stream_keys(id) ON DELETE SET NULL,
  -- Rastreabilidade da fonte de transmissão
  stream_source_type   text
    CHECK (stream_source_type IN ('obs', 'mobile', 'computer', 'mock', 'scheduled')),
  -- Estado da transmissão (publicado no Realtime para atualização em tempo real)
  status_transmissao   text        NOT NULL DEFAULT 'offline'
    CHECK (status_transmissao IN ('offline', 'waiting', 'live', 'ended', 'error')),
  -- URLs de ingest (para OBS) e playback (para viewers)
  ingest_url           text,
  playback_url         text,
  hls_url              text,
  rtmp_url             text,
  -- Linha do tempo
  started_at           timestamptz,
  ended_at             timestamptz,
  -- Heartbeat: atualizado pelo servidor de streaming a cada ~30s
  last_heartbeat_at    timestamptz,
  -- Analytics de audiência
  viewer_count         integer     NOT NULL DEFAULT 0,
  peak_viewer_count    integer     NOT NULL DEFAULT 0,
  -- Gravação no R2
  recording_status     text        NOT NULL DEFAULT 'idle'
    CHECK (recording_status IN ('idle', 'recording', 'processing', 'completed', 'failed')),
  r2_storage_key       text,
  -- Diagnóstico de erros
  error_message        text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tv_live_sessions_channel_status
  ON public.tv_live_sessions (tv_channel_id, status_transmissao, started_at DESC);

-- ── 6. REPLAYS ────────────────────────────────────────────────────────────────
-- Assets de vídeo gravados para exibição na grade (pseudo-live).

CREATE TABLE IF NOT EXISTS public.tv_replays (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  church_id        uuid,
  tv_channel_id    uuid        NOT NULL REFERENCES public.tv_channels(id) ON DELETE CASCADE,
  live_session_id  uuid        REFERENCES public.tv_live_sessions(id) ON DELETE SET NULL,
  program_id       uuid        REFERENCES public.tv_programs(id) ON DELETE SET NULL,
  title            text        NOT NULL,
  description      text,
  thumbnail_url    text,
  -- URL do manifesto HLS hospedado no R2/CDN
  hls_url          text,
  -- Chave de storage no R2 (para gerenciamento futuro)
  r2_storage_key   text,
  duration_seconds integer,
  file_size_bytes  bigint,
  status           text        NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'ready', 'failed', 'archived')),
  recorded_at      timestamptz,
  published_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tv_replays_channel_status
  ON public.tv_replays (tv_channel_id, status);

-- ── 7. INTERVALOS / AVISOS ────────────────────────────────────────────────────
-- Conteúdo exibido entre programas: avisos, anúncios regionais, chamadas.

CREATE TABLE IF NOT EXISTS public.tv_intervals (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid       NOT NULL,
  church_id      uuid,
  -- NULL = global para toda a org; preenchido = específico do canal
  tv_channel_id  uuid        REFERENCES public.tv_channels(id) ON DELETE CASCADE,
  title          text        NOT NULL,
  description    text,
  interval_type  text        NOT NULL DEFAULT 'aviso'
    CHECK (interval_type IN ('aviso', 'anuncio', 'chamada', 'propaganda')),
  -- Mídia do intervalo
  media_url      text,
  media_type     text        CHECK (media_type IN ('video', 'image', 'html')),
  duration_seconds integer   NOT NULL DEFAULT 30,
  is_active      boolean     NOT NULL DEFAULT true,
  -- Janela de exibição (NULL = sempre ativo)
  display_from   timestamptz,
  display_until  timestamptz,
  priority       integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── 8. EVENTOS DE AUDIÊNCIA ────────────────────────────────────────────────────
-- Analytics: quem assistiu, por quanto tempo, em que posição.

CREATE TABLE IF NOT EXISTS public.tv_view_events (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid        NOT NULL,
  tv_channel_id           uuid        NOT NULL REFERENCES public.tv_channels(id) ON DELETE CASCADE,
  live_session_id         uuid        REFERENCES public.tv_live_sessions(id) ON DELETE SET NULL,
  replay_id               uuid        REFERENCES public.tv_replays(id) ON DELETE SET NULL,
  viewer_user_id          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Para viewers não autenticados
  viewer_session_id       text,
  event_type              text        NOT NULL
    CHECK (event_type IN ('join', 'leave', 'heartbeat', 'error')),
  watch_duration_seconds  integer,
  player_position_seconds integer,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tv_view_events_session
  ON public.tv_view_events (live_session_id, created_at)
  WHERE live_session_id IS NOT NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.tv_channels         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_stream_keys      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_programs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_schedule_blocks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_live_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_replays          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_intervals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_view_events      ENABLE ROW LEVEL SECURITY;

-- Helper: membro da organização (select)
-- Reusa is_org_member se existir, senão cria inline
CREATE OR REPLACE FUNCTION public.is_tv_org_member(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
      AND is_active = true
  );
$$;

-- Channels: org members can view; admins can manage
CREATE POLICY "tv_channels_select"
  ON public.tv_channels FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users
      WHERE user_id = auth.uid() AND is_active = true
    )
    OR visibility = 'public'
  );

CREATE POLICY "tv_channels_insert"
  ON public.tv_channels FOR INSERT
  WITH CHECK (public.is_tv_org_member(organization_id));

CREATE POLICY "tv_channels_update"
  ON public.tv_channels FOR UPDATE
  USING (public.is_tv_org_member(organization_id));

CREATE POLICY "tv_channels_delete"
  ON public.tv_channels FOR DELETE
  USING (public.is_tv_org_member(organization_id));

-- Stream keys: admins only
CREATE POLICY "tv_stream_keys_select"
  ON public.tv_stream_keys FOR SELECT
  USING (public.is_tv_org_member(organization_id));

CREATE POLICY "tv_stream_keys_insert"
  ON public.tv_stream_keys FOR INSERT
  WITH CHECK (public.is_tv_org_member(organization_id));

CREATE POLICY "tv_stream_keys_update"
  ON public.tv_stream_keys FOR UPDATE
  USING (public.is_tv_org_member(organization_id));

CREATE POLICY "tv_stream_keys_delete"
  ON public.tv_stream_keys FOR DELETE
  USING (public.is_tv_org_member(organization_id));

-- Programs
CREATE POLICY "tv_programs_select"
  ON public.tv_programs FOR SELECT
  USING (public.is_tv_org_member(organization_id));

CREATE POLICY "tv_programs_insert"
  ON public.tv_programs FOR INSERT
  WITH CHECK (public.is_tv_org_member(organization_id));

CREATE POLICY "tv_programs_update"
  ON public.tv_programs FOR UPDATE
  USING (public.is_tv_org_member(organization_id));

CREATE POLICY "tv_programs_delete"
  ON public.tv_programs FOR DELETE
  USING (public.is_tv_org_member(organization_id));

-- Schedule blocks
CREATE POLICY "tv_schedule_blocks_select"
  ON public.tv_schedule_blocks FOR SELECT
  USING (public.is_tv_org_member(organization_id));

CREATE POLICY "tv_schedule_blocks_insert"
  ON public.tv_schedule_blocks FOR INSERT
  WITH CHECK (public.is_tv_org_member(organization_id));

CREATE POLICY "tv_schedule_blocks_update"
  ON public.tv_schedule_blocks FOR UPDATE
  USING (public.is_tv_org_member(organization_id));

CREATE POLICY "tv_schedule_blocks_delete"
  ON public.tv_schedule_blocks FOR DELETE
  USING (public.is_tv_org_member(organization_id));

-- Live sessions
CREATE POLICY "tv_live_sessions_select"
  ON public.tv_live_sessions FOR SELECT
  USING (public.is_tv_org_member(organization_id));

CREATE POLICY "tv_live_sessions_insert"
  ON public.tv_live_sessions FOR INSERT
  WITH CHECK (public.is_tv_org_member(organization_id));

CREATE POLICY "tv_live_sessions_update"
  ON public.tv_live_sessions FOR UPDATE
  USING (public.is_tv_org_member(organization_id));

-- Replays
CREATE POLICY "tv_replays_select"
  ON public.tv_replays FOR SELECT
  USING (public.is_tv_org_member(organization_id));

CREATE POLICY "tv_replays_insert"
  ON public.tv_replays FOR INSERT
  WITH CHECK (public.is_tv_org_member(organization_id));

CREATE POLICY "tv_replays_update"
  ON public.tv_replays FOR UPDATE
  USING (public.is_tv_org_member(organization_id));

-- Intervals
CREATE POLICY "tv_intervals_select"
  ON public.tv_intervals FOR SELECT
  USING (public.is_tv_org_member(organization_id));

CREATE POLICY "tv_intervals_insert"
  ON public.tv_intervals FOR INSERT
  WITH CHECK (public.is_tv_org_member(organization_id));

CREATE POLICY "tv_intervals_update"
  ON public.tv_intervals FOR UPDATE
  USING (public.is_tv_org_member(organization_id));

CREATE POLICY "tv_intervals_delete"
  ON public.tv_intervals FOR DELETE
  USING (public.is_tv_org_member(organization_id));

-- View events: any authenticated user can insert; admins can view
CREATE POLICY "tv_view_events_insert"
  ON public.tv_view_events FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "tv_view_events_select"
  ON public.tv_view_events FOR SELECT
  USING (public.is_tv_org_member(organization_id));

-- ── Realtime: status de transmissão ao vivo ──────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tv_live_sessions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tv_channels;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RPC: getCurrentTvBlock ────────────────────────────────────────────────────
-- Lógica de pseudo-live: calcula o que está tocando agora e o offset correto.
-- Devolve JSON com { type, block?, replay?, session?, hls_url, offset_seconds }.
--
-- Tipos retornados:
--   'live'     — há uma sessão ao vivo ativa
--   'replay'   — está passando uma reprise (com offset_seconds calculado)
--   'program'  — bloco genérico de programa
--   'interval' — intervalo/aviso
--   'offline'  — nada programado para agora

CREATE OR REPLACE FUNCTION public.get_current_tv_block(
  p_channel_id uuid,
  p_at         timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session  record;
  v_block    record;
  v_replay   record;
  v_offset   integer;
BEGIN
  -- 1. Verificar sessão live ativa
  SELECT ls.*
  INTO v_session
  FROM public.tv_live_sessions ls
  WHERE ls.tv_channel_id = p_channel_id
    AND ls.status_transmissao = 'live'
  ORDER BY ls.started_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'type',           'live',
      'session_id',     v_session.id,
      'hls_url',        v_session.hls_url,
      'rtmp_url',       v_session.rtmp_url,
      'viewer_count',   v_session.viewer_count,
      'started_at',     v_session.started_at,
      'offset_seconds', 0
    );
  END IF;

  -- 2. Verificar bloco agendado no momento atual
  SELECT sb.*
  INTO v_block
  FROM public.tv_schedule_blocks sb
  WHERE sb.tv_channel_id = p_channel_id
    AND sb.start_time <= p_at
    AND sb.end_time   >  p_at
    AND sb.status NOT IN ('cancelled')
  ORDER BY sb.priority DESC, sb.start_time DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'offline');
  END IF;

  -- Offset dentro do bloco (para iniciar o vídeo no tempo correto)
  v_offset := GREATEST(0, EXTRACT(EPOCH FROM (p_at - v_block.start_time))::integer);

  -- 3. Bloco de replay com asset de vídeo
  IF v_block.block_type IN ('replay', 'live') AND v_block.source_video_id IS NOT NULL THEN
    SELECT r.*
    INTO v_replay
    FROM public.tv_replays r
    WHERE r.id = v_block.source_video_id
      AND r.status = 'ready';

    IF FOUND THEN
      -- Garantir que o offset não ultrapasse a duração do vídeo
      IF v_replay.duration_seconds IS NOT NULL THEN
        v_offset := LEAST(v_offset, GREATEST(0, v_replay.duration_seconds - 5));
      END IF;

      RETURN jsonb_build_object(
        'type',           'replay',
        'block_id',       v_block.id,
        'program_id',     v_block.program_id,
        'hls_url',        COALESCE(v_replay.hls_url, v_block.source_asset_url),
        'offset_seconds', v_offset,
        'replay_id',      v_replay.id,
        'replay_title',   v_replay.title,
        'replay_duration', v_replay.duration_seconds,
        'block_start',    v_block.start_time,
        'block_end',      v_block.end_time
      );
    END IF;
  END IF;

  -- 4. Intervalo
  IF v_block.block_type = 'interval' THEN
    RETURN jsonb_build_object(
      'type',           'interval',
      'block_id',       v_block.id,
      'source_url',     v_block.source_asset_url,
      'offset_seconds', v_offset,
      'block_start',    v_block.start_time,
      'block_end',      v_block.end_time
    );
  END IF;

  -- 5. Bloco de programa genérico (sem asset de vídeo ainda)
  RETURN jsonb_build_object(
    'type',           'program',
    'block_id',       v_block.id,
    'program_id',     v_block.program_id,
    'hls_url',        v_block.source_asset_url,
    'offset_seconds', v_offset,
    'block_start',    v_block.start_time,
    'block_end',      v_block.end_time
  );
END;
$$;

-- ── RPC: get_tv_schedule ──────────────────────────────────────────────────────
-- Retorna a grade dos próximos 7 dias para um canal.

CREATE OR REPLACE FUNCTION public.get_tv_schedule(
  p_channel_id uuid,
  p_from       timestamptz DEFAULT now(),
  p_days       integer     DEFAULT 7
)
RETURNS TABLE (
  block_id       uuid,
  channel_id     uuid,
  program_title  text,
  block_type     text,
  start_time     timestamptz,
  end_time       timestamptz,
  status         text,
  thumbnail_url  text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    sb.id,
    sb.tv_channel_id,
    COALESCE(p.title, 'Programa') AS program_title,
    sb.block_type,
    sb.start_time,
    sb.end_time,
    sb.status,
    p.thumbnail_url
  FROM public.tv_schedule_blocks sb
  LEFT JOIN public.tv_programs p ON p.id = sb.program_id
  WHERE sb.tv_channel_id = p_channel_id
    AND sb.start_time >= p_from
    AND sb.start_time <  p_from + (p_days || ' days')::interval
    AND sb.status != 'cancelled'
  ORDER BY sb.start_time ASC;
$$;

-- ── Triggers: updated_at ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tv_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  CREATE TRIGGER tv_channels_updated_at
    BEFORE UPDATE ON public.tv_channels
    FOR EACH ROW EXECUTE FUNCTION public.tv_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER tv_programs_updated_at
    BEFORE UPDATE ON public.tv_programs
    FOR EACH ROW EXECUTE FUNCTION public.tv_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER tv_schedule_blocks_updated_at
    BEFORE UPDATE ON public.tv_schedule_blocks
    FOR EACH ROW EXECUTE FUNCTION public.tv_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER tv_live_sessions_updated_at
    BEFORE UPDATE ON public.tv_live_sessions
    FOR EACH ROW EXECUTE FUNCTION public.tv_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Comentários ───────────────────────────────────────────────────────────────

COMMENT ON TABLE public.tv_channels IS
  'Canais de TV da organização. Cada canal tem sua grade, programas e transmissões.';

COMMENT ON TABLE public.tv_stream_keys IS
  'Chaves de transmissão por fonte (OBS/celular/computador).
   stream_key_hash: SHA-256 da chave real (que jamais é armazenada).
   MediaMTX verifica o sinal hasheando a key recebida e comparando com este campo.';

COMMENT ON TABLE public.tv_live_sessions IS
  'Sessões de transmissão ao vivo. Publicadas no Realtime para atualização instantânea.
   stream_source_type: rastreabilidade da fonte (obs|mobile|computer|mock).
   last_heartbeat_at: atualizado pelo servidor a cada ~30s para detectar quedas.';

COMMENT ON FUNCTION public.get_current_tv_block IS
  'Lógica de pseudo-live: retorna o que está sendo transmitido agora com o offset correto.
   Se há live ativa → retorna type=live.
   Se há bloco de replay → retorna type=replay + offset_seconds calculado (sensação de TV linear).
   Se não há nada → retorna type=offline.';
