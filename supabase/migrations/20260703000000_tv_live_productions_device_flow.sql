-- =============================================================================
-- Ecclesia TV Digital — Produções ao vivo com fluxo de dispositivo
-- =============================================================================
-- Migration incremental: não altera migrations anteriores, apenas adiciona.
-- Adiciona campos necessários para:
--   - Identificar director por device_id (não apenas user_id)
--   - Título e modo de cada produção ao vivo
--   - Numeração automática de câmeras
--   - RPCs para fluxo completo de produções
-- =============================================================================

-- ── 1. Campos adicionais em tv_live_sessions ──────────────────────────────────

ALTER TABLE public.tv_live_sessions
  ADD COLUMN IF NOT EXISTS title              text,
  ADD COLUMN IF NOT EXISTS mode               text DEFAULT 'temple'
    CHECK (mode IN ('temple', 'external', 'podcast')),
  ADD COLUMN IF NOT EXISTS director_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS director_device_id text,
  ADD COLUMN IF NOT EXISTS director_last_seen_at timestamptz;

-- ── 2. Campos adicionais em tv_studio_rooms ───────────────────────────────────

ALTER TABLE public.tv_studio_rooms
  ADD COLUMN IF NOT EXISTS director_device_id text;

-- ── 3. Campos adicionais em tv_camera_sessions ───────────────────────────────

ALTER TABLE public.tv_camera_sessions
  ADD COLUMN IF NOT EXISTS device_id     text,
  ADD COLUMN IF NOT EXISTS camera_number integer,
  ADD COLUMN IF NOT EXISTS source_type   text DEFAULT 'logged_device'
    CHECK (source_type IN ('logged_device', 'external_link', 'local_demo'));

-- Índice único por (live_session_id, device_id) para evitar câmera duplicada
-- no mesmo dispositivo sem depender de user_id (mesmo login em vários devices).
CREATE UNIQUE INDEX IF NOT EXISTS uq_camera_sessions_session_device
  ON public.tv_camera_sessions (live_session_id, device_id)
  WHERE status NOT IN ('disconnected', 'error') AND device_id IS NOT NULL;

-- ── 4. RPC: create_live_production ────────────────────────────────────────────
-- Cria tv_live_session + tv_studio_room atomicamente.
-- Retorna os IDs das duas entidades criadas.

CREATE OR REPLACE FUNCTION public.create_live_production(
  p_org_id        uuid,
  p_channel_id    uuid,
  p_title         text,
  p_mode          text DEFAULT 'temple',
  p_director_device_id text DEFAULT NULL
)
RETURNS TABLE (
  live_session_id uuid,
  studio_room_id  uuid,
  room_name       text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id   uuid;
  v_room_id      uuid;
  v_room_name    text;
  v_active_count integer;
  v_church_id    uuid;
BEGIN
  -- Buscar church_id real do canal (nunca usar org_id como church_id)
  SELECT church_id
  INTO   v_church_id
  FROM   public.tv_channels
  WHERE  id = p_channel_id
    AND  organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Canal de TV não encontrado para esta organização.';
  END IF;

  -- Verificar limite de 5 produções ativas simultâneas
  SELECT COUNT(*)
  INTO   v_active_count
  FROM   public.tv_live_sessions
  WHERE  organization_id = p_org_id
    AND  status_transmissao IN ('waiting', 'live');

  IF v_active_count >= 5 THEN
    RAISE EXCEPTION 'Limite de 5 produções ativas simultâneas atingido para esta organização.';
  END IF;

  -- Criar sessão ao vivo
  INSERT INTO public.tv_live_sessions (
    organization_id, church_id, tv_channel_id,
    title, mode, status_transmissao,
    stream_source_type,
    director_user_id, director_device_id,
    director_last_seen_at,
    started_at, last_heartbeat_at
  ) VALUES (
    p_org_id, v_church_id, p_channel_id,
    p_title, p_mode, 'waiting',
    'mock',
    auth.uid(), p_director_device_id,
    now(),
    now(), now()
  )
  RETURNING id INTO v_session_id;

  -- Gerar nome único para a sala
  v_room_name := 'ecclesia-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' ||
                 substr(v_session_id::text, 1, 8);

  -- Criar sala de estúdio vinculada
  INSERT INTO public.tv_studio_rooms (
    organization_id, church_id, tv_channel_id,
    live_session_id, room_name, provider, status,
    director_user_id, director_device_id,
    created_by, started_at
  ) VALUES (
    p_org_id, v_church_id, p_channel_id,
    v_session_id, v_room_name, 'mock', 'active',
    auth.uid(), p_director_device_id,
    auth.uid(), now()
  )
  RETURNING id INTO v_room_id;

  RETURN QUERY SELECT v_session_id, v_room_id, v_room_name;
END;
$$;

-- ── 5. RPC: claim_production_director ─────────────────────────────────────────
-- Permite que um dispositivo assuma a direção de uma produção.
-- p_force = true: forçar mesmo se já há um diretor (com confirmação no frontend).

CREATE OR REPLACE FUNCTION public.claim_production_director(
  p_live_session_id    uuid,
  p_director_device_id text,
  p_force              boolean DEFAULT false
)
RETURNS TABLE (
  ok      boolean,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_device text;
  v_last_seen      timestamptz;
  v_threshold      interval := interval '90 seconds';
BEGIN
  -- Buscar diretor atual
  SELECT director_device_id, director_last_seen_at
  INTO   v_current_device, v_last_seen
  FROM   public.tv_live_sessions
  WHERE  id = p_live_session_id
    AND  status_transmissao IN ('waiting', 'live');

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Produção não encontrada ou já encerrada.';
    RETURN;
  END IF;

  -- Já sou o diretor
  IF v_current_device = p_director_device_id THEN
    -- Apenas renovar heartbeat
    UPDATE public.tv_live_sessions
    SET director_last_seen_at = now()
    WHERE id = p_live_session_id;
    RETURN QUERY SELECT true, 'Direção confirmada.';
    RETURN;
  END IF;

  -- Já existe outro diretor
  IF v_current_device IS NOT NULL THEN
    -- Verificar se o diretor atual está offline (sem heartbeat por > threshold)
    IF v_last_seen IS NOT NULL AND (now() - v_last_seen) < v_threshold AND NOT p_force THEN
      RETURN QUERY SELECT false, 'Esta produção já possui um diretor ativo. Use p_force=true para assumir.';
      RETURN;
    END IF;
  END IF;

  -- Assumir direção
  UPDATE public.tv_live_sessions
  SET director_user_id     = auth.uid(),
      director_device_id   = p_director_device_id,
      director_last_seen_at = now()
  WHERE id = p_live_session_id;

  -- Atualizar sala vinculada também
  UPDATE public.tv_studio_rooms
  SET director_user_id   = auth.uid(),
      director_device_id = p_director_device_id
  WHERE live_session_id  = p_live_session_id
    AND status            = 'active';

  RETURN QUERY SELECT true, 'Direção assumida com sucesso.';
END;
$$;

-- ── 6. RPC: join_production_as_camera ─────────────────────────────────────────
-- Câmera entra via live_session_id + device_id (não apenas studio_room_id).
-- Atribui automaticamente o próximo número de câmera disponível.

CREATE OR REPLACE FUNCTION public.join_production_as_camera(
  p_live_session_id uuid,
  p_device_id       text,
  p_camera_name     text DEFAULT NULL,
  p_device_type     text DEFAULT 'mobile',
  p_source_type     text DEFAULT 'logged_device'
)
RETURNS TABLE (
  camera_session_id uuid,
  camera_number     integer,
  room_name         text,
  studio_room_id    uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id        uuid;
  v_church_id     uuid;
  v_channel_id    uuid;
  v_room_id       uuid;
  v_room_name     text;
  v_session_id    uuid;
  v_cam_count     integer;
  v_cam_number    integer;
  v_effective_name text;
BEGIN
  -- Buscar dados da sessão + sala (incluindo church_id real)
  SELECT ls.organization_id, ls.church_id, ls.tv_channel_id, sr.id, sr.room_name
  INTO   v_org_id, v_church_id, v_channel_id, v_room_id, v_room_name
  FROM   public.tv_live_sessions ls
  LEFT JOIN public.tv_studio_rooms sr ON sr.live_session_id = ls.id AND sr.status = 'active'
  WHERE  ls.id = p_live_session_id
    AND  ls.status_transmissao IN ('waiting', 'live');

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Produção não encontrada ou já encerrada.';
  END IF;

  IF v_room_id IS NULL THEN
    RAISE EXCEPTION 'Sala de estúdio não encontrada para esta produção.';
  END IF;

  -- Verificar se este device já está conectado
  SELECT id, camera_number INTO v_session_id, v_cam_number
  FROM   public.tv_camera_sessions
  WHERE  live_session_id = p_live_session_id
    AND  device_id = p_device_id
    AND  status NOT IN ('disconnected', 'error');

  IF v_session_id IS NOT NULL THEN
    -- Reconectar (atualizar status e heartbeat)
    UPDATE public.tv_camera_sessions
    SET status = 'connected', last_heartbeat_at = now(), connected_at = now(),
        device_type = p_device_type
    WHERE id = v_session_id;

    RETURN QUERY SELECT v_session_id, v_cam_number, v_room_name, v_room_id;
    RETURN;
  END IF;

  -- Verificar limite de câmeras (máx. 6 ativas)
  SELECT COUNT(*)
  INTO   v_cam_count
  FROM   public.tv_camera_sessions
  WHERE  studio_room_id = v_room_id
    AND  role = 'camera'
    AND  status IN ('waiting', 'connected', 'live');

  IF v_cam_count >= 6 THEN
    RAISE EXCEPTION 'Limite de 6 câmeras atingido para esta produção.';
  END IF;

  -- Calcular próximo número de câmera
  SELECT COALESCE(MAX(camera_number), 0) + 1
  INTO   v_cam_number
  FROM   public.tv_camera_sessions
  WHERE  studio_room_id = v_room_id
    AND  role = 'camera';

  -- Nome automático se não fornecido
  v_effective_name := COALESCE(NULLIF(p_camera_name, ''), 'Câmera ' || v_cam_number);

  -- Inserir nova sessão de câmera
  INSERT INTO public.tv_camera_sessions (
    organization_id, church_id, tv_channel_id,
    live_session_id, studio_room_id,
    user_id, device_id, camera_name, camera_number,
    device_type, role, status, source_type,
    livekit_room_name,
    livekit_participant_identity,
    connected_at, last_heartbeat_at
  ) VALUES (
    v_org_id, v_church_id, v_channel_id,
    p_live_session_id, v_room_id,
    auth.uid(), p_device_id, v_effective_name, v_cam_number,
    p_device_type, 'camera', 'connected', p_source_type,
    v_room_name,
    'camera:' || p_device_id,
    now(), now()
  )
  RETURNING id INTO v_session_id;

  RETURN QUERY SELECT v_session_id, v_cam_number, v_room_name, v_room_id;
END;
$$;

-- ── 7. RPC: end_live_production ───────────────────────────────────────────────
-- Encerra produção e todas as sessões de câmera vinculadas.

CREATE OR REPLACE FUNCTION public.end_live_production(
  p_live_session_id    uuid,
  p_director_device_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_device text;
BEGIN
  -- Apenas o diretor atual pode encerrar (ou admin via force)
  SELECT director_device_id INTO v_current_device
  FROM   public.tv_live_sessions
  WHERE  id = p_live_session_id
    AND  status_transmissao IN ('waiting', 'live');

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_current_device IS NOT NULL AND v_current_device != p_director_device_id THEN
    -- Verificar se o chamador é admin (pode encerrar mesmo não sendo diretor)
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_users
      WHERE user_id = auth.uid() AND is_active = true
        AND role IN ('super_admin', 'church_admin', 'pastor', 'secretary')
    ) THEN
      RETURN false;
    END IF;
  END IF;

  -- Encerrar câmeras ativas
  UPDATE public.tv_camera_sessions
  SET status = 'disconnected', disconnected_at = now(), is_on_air = false
  WHERE live_session_id = p_live_session_id
    AND status IN ('waiting', 'connected', 'live');

  -- Encerrar sala de estúdio
  UPDATE public.tv_studio_rooms
  SET status = 'ended', ended_at = now()
  WHERE live_session_id = p_live_session_id
    AND status = 'active';

  -- Encerrar sessão ao vivo
  UPDATE public.tv_live_sessions
  SET status_transmissao = 'ended', ended_at = now()
  WHERE id = p_live_session_id;

  RETURN true;
END;
$$;

-- ── 8. RPC: list_active_productions ──────────────────────────────────────────
-- Lista produções ativas da organização com contagem de câmeras e dados do estúdio.

CREATE OR REPLACE FUNCTION public.list_active_productions(
  p_org_id     uuid,
  p_channel_id uuid DEFAULT NULL
)
RETURNS TABLE (
  live_session_id      uuid,
  channel_id           uuid,
  channel_name         text,
  title                text,
  mode                 text,
  status_transmissao   text,
  director_user_id     uuid,
  director_device_id   text,
  director_last_seen_at timestamptz,
  camera_count         bigint,
  studio_room_id       uuid,
  room_name            text,
  started_at           timestamptz,
  created_at           timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ls.id,
    ls.tv_channel_id,
    ch.name,
    COALESCE(ls.title, 'Produção ao vivo'),
    COALESCE(ls.mode, 'temple'),
    ls.status_transmissao,
    ls.director_user_id,
    ls.director_device_id,
    ls.director_last_seen_at,
    COUNT(cs.id) FILTER (WHERE cs.status IN ('waiting','connected','live')),
    sr.id,
    sr.room_name,
    ls.started_at,
    ls.created_at
  FROM public.tv_live_sessions ls
  JOIN public.tv_channels ch ON ch.id = ls.tv_channel_id
  LEFT JOIN public.tv_studio_rooms sr ON sr.live_session_id = ls.id AND sr.status = 'active'
  LEFT JOIN public.tv_camera_sessions cs ON cs.live_session_id = ls.id AND cs.role = 'camera'
  WHERE ls.organization_id = p_org_id
    AND ls.status_transmissao IN ('waiting', 'live')
    AND (p_channel_id IS NULL OR ls.tv_channel_id = p_channel_id)
  GROUP BY ls.id, ch.name, sr.id, sr.room_name
  ORDER BY ls.created_at DESC;
END;
$$;

-- ── 9. RPC: director_heartbeat ────────────────────────────────────────────────
-- Atualiza o heartbeat do diretor para indicar que está online.

CREATE OR REPLACE FUNCTION public.director_heartbeat(
  p_live_session_id    uuid,
  p_director_device_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tv_live_sessions
  SET director_last_seen_at = now()
  WHERE id = p_live_session_id
    AND director_device_id = p_director_device_id
    AND status_transmissao IN ('waiting', 'live');
  RETURN FOUND;
END;
$$;

-- ── 10. Índices adicionais ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tv_live_sessions_org_active
  ON public.tv_live_sessions (organization_id, status_transmissao)
  WHERE status_transmissao IN ('waiting', 'live');

CREATE INDEX IF NOT EXISTS idx_tv_camera_sessions_device
  ON public.tv_camera_sessions (device_id, live_session_id);
