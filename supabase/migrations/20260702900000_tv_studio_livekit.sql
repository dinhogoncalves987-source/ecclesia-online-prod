-- =============================================================================
-- Ecclesia Studio — Sessões LiveKit multicâmeras (tv_studio_rooms + tv_camera_sessions)
-- =============================================================================

-- ── 1. Salas de estúdio ───────────────────────────────────────────────────────
-- Uma sala por sessão ao vivo. Cada sala pode ter até 6 câmeras + 1 diretor.

CREATE TABLE IF NOT EXISTS public.tv_studio_rooms (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES public.organizations(id)  ON DELETE CASCADE,
  church_id        uuid        REFERENCES public.organizations(id)            ON DELETE SET NULL,
  tv_channel_id    uuid        NOT NULL REFERENCES public.tv_channels(id)    ON DELETE CASCADE,
  live_session_id  uuid        REFERENCES public.tv_live_sessions(id)        ON DELETE SET NULL,
  room_name        text        NOT NULL,
  provider         text        NOT NULL DEFAULT 'livekit'
                               CHECK (provider IN ('livekit', 'mock')),
  status           text        NOT NULL DEFAULT 'waiting'
                               CHECK (status IN ('waiting', 'active', 'ended', 'error')),
  max_cameras      integer     NOT NULL DEFAULT 6 CHECK (max_cameras BETWEEN 1 AND 6),
  director_user_id uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at       timestamptz,
  ended_at         timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, room_name)
);

CREATE INDEX IF NOT EXISTS idx_tv_studio_rooms_live_session
  ON public.tv_studio_rooms (live_session_id);
CREATE INDEX IF NOT EXISTS idx_tv_studio_rooms_channel
  ON public.tv_studio_rooms (tv_channel_id, status);

-- ── 2. Sessões individuais de câmeras ─────────────────────────────────────────
-- Uma linha por participante (diretor ou câmera) em uma sala.

CREATE TABLE IF NOT EXISTS public.tv_camera_sessions (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id               uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  church_id                     uuid        REFERENCES public.organizations(id)          ON DELETE SET NULL,
  tv_channel_id                 uuid        NOT NULL REFERENCES public.tv_channels(id)  ON DELETE CASCADE,
  live_session_id               uuid        REFERENCES public.tv_live_sessions(id)      ON DELETE SET NULL,
  studio_room_id                uuid        NOT NULL REFERENCES public.tv_studio_rooms(id) ON DELETE CASCADE,
  user_id                       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  camera_name                   text        NOT NULL,
  device_name                   text,
  device_type                   text        NOT NULL DEFAULT 'browser'
                                            CHECK (device_type IN ('mobile', 'desktop', 'obs', 'browser')),
  role                          text        NOT NULL DEFAULT 'camera'
                                            CHECK (role IN ('director', 'camera')),
  status                        text        NOT NULL DEFAULT 'waiting'
                                            CHECK (status IN ('waiting', 'connected', 'live', 'disconnected', 'error')),
  is_on_air                     boolean     NOT NULL DEFAULT false,
  livekit_room_name             text,
  livekit_participant_identity  text,
  livekit_track_sid             text,
  connected_at                  timestamptz,
  disconnected_at               timestamptz,
  last_heartbeat_at             timestamptz,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tv_camera_sessions_room_status
  ON public.tv_camera_sessions (studio_room_id, status);
CREATE INDEX IF NOT EXISTS idx_tv_camera_sessions_live_session
  ON public.tv_camera_sessions (live_session_id);
CREATE INDEX IF NOT EXISTS idx_tv_camera_sessions_user
  ON public.tv_camera_sessions (user_id);

-- ── 3. Trigger: atualizar updated_at ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  CREATE TRIGGER tv_studio_rooms_touch_updated
    BEFORE UPDATE ON public.tv_studio_rooms
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER tv_camera_sessions_touch_updated
    BEFORE UPDATE ON public.tv_camera_sessions
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 4. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.tv_studio_rooms     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_camera_sessions  ENABLE ROW LEVEL SECURITY;

-- tv_studio_rooms: leitura para membros da org
DO $$ BEGIN
  CREATE POLICY "studio_rooms_select" ON public.tv_studio_rooms
    FOR SELECT USING (
      organization_id IN (
        SELECT organization_id FROM public.organization_users
        WHERE user_id = auth.uid() AND is_active = true
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "studio_rooms_write" ON public.tv_studio_rooms
    FOR ALL USING (
      organization_id IN (
        SELECT organization_id FROM public.organization_users
        WHERE user_id = auth.uid() AND is_active = true
          AND role IN ('super_admin', 'church_admin', 'pastor', 'secretary')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- tv_camera_sessions: leitura para membros da org
DO $$ BEGIN
  CREATE POLICY "camera_sessions_select" ON public.tv_camera_sessions
    FOR SELECT USING (
      organization_id IN (
        SELECT organization_id FROM public.organization_users
        WHERE user_id = auth.uid() AND is_active = true
      )
      OR user_id = auth.uid()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Escrita: admin/staff e o próprio participante
DO $$ BEGIN
  CREATE POLICY "camera_sessions_admin_write" ON public.tv_camera_sessions
    FOR ALL USING (
      organization_id IN (
        SELECT organization_id FROM public.organization_users
        WHERE user_id = auth.uid() AND is_active = true
          AND role IN ('super_admin', 'church_admin', 'pastor', 'secretary')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "camera_sessions_self_update" ON public.tv_camera_sessions
    FOR UPDATE USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Participante anônimo pode inserir sua própria sessão (via service role na Edge Function)
DO $$ BEGIN
  CREATE POLICY "camera_sessions_anon_insert" ON public.tv_camera_sessions
    FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 5. RPC: create_tv_studio_room ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_tv_studio_room(
  p_live_session_id uuid DEFAULT NULL
)
RETURNS TABLE (studio_room_id uuid, room_name text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id      uuid;
  v_channel_id  uuid;
  v_room_name   text;
  v_room_id     uuid;
BEGIN
  -- Resolver org_id e channel_id via sessão live, se fornecida
  IF p_live_session_id IS NOT NULL THEN
    SELECT organization_id, tv_channel_id
    INTO   v_org_id, v_channel_id
    FROM   public.tv_live_sessions
    WHERE  id = p_live_session_id;
  END IF;

  -- Fallback: buscar org do usuário autenticado
  IF v_org_id IS NULL THEN
    SELECT organization_id INTO v_org_id
    FROM   public.organization_users
    WHERE  user_id = auth.uid() AND is_active = true
    LIMIT 1;
  END IF;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem organização';
  END IF;

  -- Se não temos channel ainda, buscar o primeiro canal ativo da org
  IF v_channel_id IS NULL THEN
    SELECT id INTO v_channel_id
    FROM   public.tv_channels
    WHERE  organization_id = v_org_id AND status = 'active'
    ORDER  BY created_at LIMIT 1;
  END IF;

  -- Gerar room_name único
  v_room_name := 'ecclesia-studio-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || substr(gen_random_uuid()::text, 1, 8);

  -- Criar sala
  INSERT INTO public.tv_studio_rooms (
    organization_id, church_id, tv_channel_id, live_session_id,
    room_name, status, director_user_id, created_by, started_at
  ) VALUES (
    v_org_id, v_org_id, v_channel_id, p_live_session_id,
    v_room_name, 'active', auth.uid(), auth.uid(), now()
  )
  RETURNING id INTO v_room_id;

  RETURN QUERY SELECT v_room_id, v_room_name;
END;
$$;

-- ── 6. RPC: join_tv_studio_as_camera ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.join_tv_studio_as_camera(
  p_studio_room_id  uuid,
  p_camera_name     text,
  p_device_type     text DEFAULT 'browser',
  p_user_id         uuid DEFAULT NULL
)
RETURNS TABLE (camera_session_id uuid, livekit_room_name text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id      uuid;
  v_channel_id  uuid;
  v_session_id  uuid;
  v_cam_count   integer;
  v_room_name   text;
  v_live_session_id uuid;
  v_effective_user uuid;
BEGIN
  v_effective_user := COALESCE(p_user_id, auth.uid());

  -- Buscar dados da sala
  SELECT organization_id, tv_channel_id, live_session_id, room_name
  INTO   v_org_id, v_channel_id, v_live_session_id, v_room_name
  FROM   public.tv_studio_rooms
  WHERE  id = p_studio_room_id AND status != 'ended';

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Sala não encontrada ou encerrada';
  END IF;

  -- Verificar limite de 6 câmeras (excluir desconectadas)
  SELECT COUNT(*) INTO v_cam_count
  FROM public.tv_camera_sessions
  WHERE studio_room_id = p_studio_room_id
    AND role = 'camera'
    AND status IN ('waiting', 'connected', 'live');

  IF v_cam_count >= 6 THEN
    RAISE EXCEPTION 'Limite de 6 câmeras atingido para esta sala';
  END IF;

  -- Criar ou reutilizar sessão de câmera (mesmo usuário reconectando)
  INSERT INTO public.tv_camera_sessions (
    organization_id, church_id, tv_channel_id, live_session_id, studio_room_id,
    user_id, camera_name, device_type, role, status,
    livekit_room_name,
    livekit_participant_identity,
    connected_at, last_heartbeat_at
  ) VALUES (
    v_org_id, v_org_id, v_channel_id, v_live_session_id, p_studio_room_id,
    v_effective_user, p_camera_name, p_device_type, 'camera', 'connected',
    v_room_name,
    'camera:' || gen_random_uuid()::text,
    now(), now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_session_id;

  IF v_session_id IS NULL THEN
    -- Câmera já existe, atualizar status
    UPDATE public.tv_camera_sessions
    SET status = 'connected', connected_at = now(), last_heartbeat_at = now(),
        camera_name = p_camera_name, device_type = p_device_type,
        livekit_room_name = v_room_name, disconnected_at = NULL
    WHERE studio_room_id = p_studio_room_id
      AND user_id = v_effective_user
      AND role = 'camera'
    RETURNING id INTO v_session_id;
  END IF;

  RETURN QUERY SELECT v_session_id, v_room_name;
END;
$$;

-- ── 7. RPC: set_camera_on_air ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_camera_on_air(
  p_camera_session_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room_id      uuid;
  v_org_id       uuid;
  v_session_id   uuid;
  v_cam_name     text;
  v_live_session uuid;
  v_elapsed      integer;
BEGIN
  -- Buscar dados da câmera
  SELECT studio_room_id, organization_id, camera_name, live_session_id
  INTO   v_room_id, v_org_id, v_cam_name, v_live_session
  FROM   public.tv_camera_sessions
  WHERE  id = p_camera_session_id AND status IN ('connected', 'live');

  IF v_room_id IS NULL THEN
    RETURN false;
  END IF;

  -- Tirar todas as câmeras da sala do ar
  UPDATE public.tv_camera_sessions
  SET is_on_air = false, status = 'connected'
  WHERE studio_room_id = v_room_id AND role = 'camera';

  -- Colocar a câmera escolhida no ar
  UPDATE public.tv_camera_sessions
  SET is_on_air = true, status = 'live'
  WHERE id = p_camera_session_id;

  -- Registrar corte no tv_cut_log
  IF v_live_session IS NOT NULL THEN
    SELECT EXTRACT(EPOCH FROM (now() - started_at))::integer
    INTO   v_elapsed
    FROM   public.tv_live_sessions
    WHERE  id = v_live_session;

    INSERT INTO public.tv_cut_log (
      organization_id, live_session_id, camera_id,
      camera_name, session_elapsed_seconds, director_user_id
    ) VALUES (
      v_org_id, v_live_session, NULL,
      v_cam_name, COALESCE(v_elapsed, 0), auth.uid()
    );
  END IF;

  RETURN true;
END;
$$;

-- ── 8. RPC: update_camera_heartbeat ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_camera_heartbeat(
  p_camera_session_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tv_camera_sessions
  SET last_heartbeat_at = now(), status = CASE
      WHEN is_on_air THEN 'live'
      ELSE 'connected'
    END
  WHERE id = p_camera_session_id
    AND status IN ('connected', 'live', 'waiting');
  RETURN FOUND;
END;
$$;

-- ── 9. RPC: disconnect_camera ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.disconnect_camera(
  p_camera_session_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room_id uuid;
BEGIN
  SELECT studio_room_id INTO v_room_id
  FROM public.tv_camera_sessions WHERE id = p_camera_session_id;

  UPDATE public.tv_camera_sessions
  SET is_on_air = false, status = 'disconnected', disconnected_at = now()
  WHERE id = p_camera_session_id;

  RETURN FOUND;
END;
$$;

-- ── 10. Realtime Publications ─────────────────────────────────────────────────
-- Publicar atualizações para o diretor em tempo real

ALTER PUBLICATION supabase_realtime ADD TABLE public.tv_studio_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tv_camera_sessions;

COMMENT ON TABLE public.tv_studio_rooms IS
  'Salas de estúdio LiveKit. Cada sala corresponde a uma sessão de transmissão ao vivo
   e pode ter até 6 câmeras simultâneas mais o diretor.';

COMMENT ON TABLE public.tv_camera_sessions IS
  'Participantes individuais de uma sala de estúdio. Uma câmera por linha.
   Somente câmeras com status connected/live aparecem no painel do diretor.
   Regra: apenas uma câmera pode ter is_on_air = true por sala.';
