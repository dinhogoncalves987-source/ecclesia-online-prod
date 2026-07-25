-- ============================================================================
-- Migration: tv_canal_live_production
-- Timestamp: 20260802130000
-- OPERAÇÃO ESPECIAL — Auditoria e conclusão de TV Digital, Canal Eclésia e
-- Ecclesia Chat / Login por telefone (Parte A + B — produção ao vivo e
-- vínculo idempotente TV ↔ Canal)
-- ============================================================================
--
-- Depende de 20260802120000_tv_canal_foundation.sql (tv_channels,
-- tv_live_sessions, ecclesia_channels já devem existir).
--
-- ESTA MIGRATION:
--   1. Produção ao vivo por device_id (Direção pelo computador + convidados/
--      celulares como câmera — ver src/hooks/useLiveKitStudio.ts,
--      src/hooks/useStudioCameras.ts, src/pages/TvStudioCamera.tsx):
--      tv_studio_rooms, tv_camera_sessions, tv_studio_cameras, tv_cut_log +
--      as 12 RPCs já chamadas por src/lib/tvDigital.ts.
--   2. Vínculo idempotente TV → Canal Eclésia (contrato §8): ao criar um
--      canal de TV, cria/vincula automaticamente um canal correspondente no
--      Canal Eclésia da MESMA organização, protegido por advisory lock
--      (nunca dois canais equivalentes por duplo clique/retry/concorrência).
--   3. import_tv_session_to_canal — transforma uma transmissão gravada em
--      vídeo do Canal, idempotente por (tv_live_session_id, channel_id).
--
-- Nenhum estado "ao vivo"/"conectado" é inventado: toda transição de status
-- passa por estas RPCs (SECURITY DEFINER, com capability check), nunca só
-- por um setState do frontend.
--
-- Esta migration NÃO é aplicada.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.tv_channels') IS NULL THEN
    v_missing := array_append(v_missing, 'public.tv_channels (rode 20260802120000 antes)');
  END IF;
  IF to_regclass('public.tv_live_sessions') IS NULL THEN v_missing := array_append(v_missing, 'public.tv_live_sessions'); END IF;
  IF to_regclass('public.ecclesia_channels') IS NULL THEN v_missing := array_append(v_missing, 'public.ecclesia_channels'); END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'tv_canal_live_production preflight failed; missing: %', array_to_string(v_missing, ', ');
  END IF;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 1. PRODUÇÃO AO VIVO (device_id)
-- ════════════════════════════════════════════════════════════════════════

-- Remove policies legadas antes de instalar o contrato canônico. O staging
-- histórico possuía INSERT anônimo em tv_camera_sessions; nenhuma policy de
-- escrita direta deve sobreviver, pois toda mutação passa pelas RPCs abaixo.
DO $$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('tv_studio_rooms', 'tv_camera_sessions')
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      v_policy.policyname,
      v_policy.schemaname,
      v_policy.tablename
    );
  END LOOP;
END;
$$;

CREATE TABLE IF NOT EXISTS public.tv_studio_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  church_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  tv_channel_id uuid NOT NULL REFERENCES public.tv_channels(id) ON DELETE CASCADE,
  live_session_id uuid REFERENCES public.tv_live_sessions(id) ON DELETE SET NULL,
  room_name text NOT NULL,
  provider text NOT NULL DEFAULT 'livekit' CHECK (provider IN ('livekit', 'mock')),
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'active', 'ended', 'error')),
  max_cameras integer NOT NULL DEFAULT 6 CHECK (max_cameras >= 1 AND max_cameras <= 6),
  director_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  director_device_id text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at timestamptz,
  ended_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tv_studio_rooms_organization_id_room_name_key UNIQUE (organization_id, room_name),
  CONSTRAINT uniq_tv_studio_rooms_session UNIQUE (live_session_id)
);

ALTER TABLE public.tv_studio_rooms
  ADD COLUMN IF NOT EXISTS church_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'livekit',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'waiting',
  ADD COLUMN IF NOT EXISTS max_cameras integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS director_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS director_device_id text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.tv_studio_rooms
SET is_active = status NOT IN ('ended', 'error')
WHERE is_active IS DISTINCT FROM (status NOT IN ('ended', 'error'));

ALTER TABLE public.tv_studio_rooms
  DROP CONSTRAINT IF EXISTS tv_studio_rooms_provider_check,
  DROP CONSTRAINT IF EXISTS tv_studio_rooms_status_check,
  DROP CONSTRAINT IF EXISTS tv_studio_rooms_max_cameras_check;
ALTER TABLE public.tv_studio_rooms
  ADD CONSTRAINT tv_studio_rooms_provider_check
    CHECK (provider IN ('livekit', 'mock')),
  ADD CONSTRAINT tv_studio_rooms_status_check
    CHECK (status IN ('waiting', 'active', 'ended', 'error')),
  ADD CONSTRAINT tv_studio_rooms_max_cameras_check
    CHECK (max_cameras >= 1 AND max_cameras <= 6);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.tv_studio_rooms
    WHERE live_session_id IS NOT NULL
    GROUP BY live_session_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'tv_studio_rooms possui live_session_id duplicado; reconcilie os dados antes de continuar';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.tv_studio_rooms'::regclass
      AND conname = 'uniq_tv_studio_rooms_session'
  ) THEN
    ALTER TABLE public.tv_studio_rooms
      ADD CONSTRAINT uniq_tv_studio_rooms_session UNIQUE (live_session_id);
  END IF;
END;
$$;

DROP INDEX IF EXISTS public.idx_tv_studio_rooms_channel;
DROP INDEX IF EXISTS public.idx_tv_studio_rooms_live_session;
CREATE INDEX idx_tv_studio_rooms_channel
  ON public.tv_studio_rooms (tv_channel_id, status);
CREATE INDEX idx_tv_studio_rooms_live_session
  ON public.tv_studio_rooms (live_session_id);

DROP TRIGGER IF EXISTS tv_studio_rooms_touch_updated ON public.tv_studio_rooms;
DROP TRIGGER IF EXISTS update_tv_studio_rooms_updated_at ON public.tv_studio_rooms;
CREATE TRIGGER update_tv_studio_rooms_updated_at
BEFORE UPDATE ON public.tv_studio_rooms
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tv_studio_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY tv_studio_rooms_select ON public.tv_studio_rooms
FOR SELECT TO authenticated
USING (public._can_consume_org_content(auth.uid(), organization_id));
-- Nenhuma policy de escrita: só as RPCs abaixo (create_live_production/
-- create_tv_studio_room/end_live_production) criam/desativam salas.

CREATE TABLE IF NOT EXISTS public.tv_camera_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  church_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  tv_channel_id uuid REFERENCES public.tv_channels(id) ON DELETE CASCADE,
  live_session_id uuid REFERENCES public.tv_live_sessions(id) ON DELETE SET NULL,
  studio_room_id uuid REFERENCES public.tv_studio_rooms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  device_id text,
  camera_name text NOT NULL DEFAULT 'Câmera',
  device_name text,
  camera_number integer DEFAULT 0,
  device_type text NOT NULL DEFAULT 'mobile'
    CHECK (device_type IN ('mobile', 'desktop', 'obs', 'browser')),
  role text NOT NULL DEFAULT 'camera' CHECK (role IN ('director', 'camera')),
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'connected', 'live', 'on_air', 'disconnected', 'error')),
  is_on_air boolean NOT NULL DEFAULT false,
  livekit_room_name text,
  livekit_participant_identity text,
  livekit_track_sid text,
  source_type text NOT NULL DEFAULT 'logged_device'
    CHECK (source_type IN ('logged_device', 'external_link', 'local_demo')),
  last_heartbeat_at timestamptz,
  connected_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tv_camera_sessions
  ADD COLUMN IF NOT EXISTS church_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tv_channel_id uuid REFERENCES public.tv_channels(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS studio_room_id uuid REFERENCES public.tv_studio_rooms(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS device_name text,
  ADD COLUMN IF NOT EXISTS livekit_room_name text,
  ADD COLUMN IF NOT EXISTS livekit_participant_identity text,
  ADD COLUMN IF NOT EXISTS livekit_track_sid text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.tv_camera_sessions
  ALTER COLUMN tv_channel_id DROP NOT NULL,
  ALTER COLUMN live_session_id DROP NOT NULL,
  ALTER COLUMN studio_room_id DROP NOT NULL,
  ALTER COLUMN user_id DROP NOT NULL,
  ALTER COLUMN device_id DROP NOT NULL,
  ALTER COLUMN connected_at DROP NOT NULL,
  ALTER COLUMN camera_number DROP NOT NULL,
  ALTER COLUMN camera_name SET DEFAULT 'Câmera',
  ALTER COLUMN camera_number SET DEFAULT 0,
  ALTER COLUMN device_type SET DEFAULT 'mobile';

ALTER TABLE public.tv_camera_sessions
  DROP CONSTRAINT IF EXISTS tv_camera_sessions_device_type_check,
  DROP CONSTRAINT IF EXISTS tv_camera_sessions_role_check,
  DROP CONSTRAINT IF EXISTS tv_camera_sessions_status_check,
  DROP CONSTRAINT IF EXISTS tv_camera_sessions_source_type_check;
ALTER TABLE public.tv_camera_sessions
  ADD CONSTRAINT tv_camera_sessions_device_type_check
    CHECK (device_type IN ('mobile', 'desktop', 'obs', 'browser')),
  ADD CONSTRAINT tv_camera_sessions_role_check
    CHECK (role IN ('director', 'camera')),
  ADD CONSTRAINT tv_camera_sessions_status_check
    CHECK (status IN ('waiting', 'connected', 'live', 'on_air', 'disconnected', 'error')),
  ADD CONSTRAINT tv_camera_sessions_source_type_check
    CHECK (source_type IN ('logged_device', 'external_link', 'local_demo'));

DROP INDEX IF EXISTS public.idx_tv_camera_sessions_device;
DROP INDEX IF EXISTS public.idx_tv_camera_sessions_live_session;
DROP INDEX IF EXISTS public.idx_tv_camera_sessions_room_status;
DROP INDEX IF EXISTS public.idx_tv_camera_sessions_user;
DROP INDEX IF EXISTS public.idx_tv_camera_sessions_session;
DROP INDEX IF EXISTS public.uq_camera_sessions_session_device;
CREATE INDEX idx_tv_camera_sessions_device
  ON public.tv_camera_sessions (device_id, live_session_id);
CREATE INDEX idx_tv_camera_sessions_live_session
  ON public.tv_camera_sessions (live_session_id);
CREATE INDEX idx_tv_camera_sessions_room_status
  ON public.tv_camera_sessions (studio_room_id, status);
CREATE INDEX idx_tv_camera_sessions_user
  ON public.tv_camera_sessions (user_id);
CREATE UNIQUE INDEX uq_camera_sessions_session_device
  ON public.tv_camera_sessions (live_session_id, device_id)
  WHERE status NOT IN ('disconnected', 'error') AND device_id IS NOT NULL;

DROP TRIGGER IF EXISTS tv_camera_sessions_touch_updated ON public.tv_camera_sessions;
DROP TRIGGER IF EXISTS update_tv_camera_sessions_updated_at ON public.tv_camera_sessions;
CREATE TRIGGER update_tv_camera_sessions_updated_at
BEFORE UPDATE ON public.tv_camera_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tv_camera_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tv_camera_sessions_select ON public.tv_camera_sessions
FOR SELECT TO authenticated
USING (public._can_consume_org_content(auth.uid(), organization_id));
-- Nenhuma policy de escrita direta: join/disconnect/heartbeat/corte só pelas
-- RPCs SECURITY DEFINER abaixo — concorrência (2 câmeras entrando ao mesmo
-- tempo, corte simultâneo) exige lock explícito que RLS sozinha não garante.

CREATE TABLE IF NOT EXISTS public.tv_studio_cameras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tv_channel_id uuid NOT NULL REFERENCES public.tv_channels(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> ''),
  camera_type text NOT NULL DEFAULT 'local' CHECK (camera_type IN ('local', 'obs_scene', 'remote')),
  device_id text,
  scene_name text,
  remote_token text,
  icon_name text NOT NULL DEFAULT 'video',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tv_studio_cameras_channel ON public.tv_studio_cameras (tv_channel_id) WHERE is_active;

ALTER TABLE public.tv_studio_cameras ENABLE ROW LEVEL SECURITY;
CREATE POLICY tv_studio_cameras_all ON public.tv_studio_cameras
FOR ALL TO authenticated
USING (
  public.has_org_access_permission(auth.uid(), organization_id, 'tv.manage')
  OR public.has_org_access_permission(auth.uid(), organization_id, 'tv.live_operate')
)
WITH CHECK (
  public.has_org_access_permission(auth.uid(), organization_id, 'tv.manage')
  OR public.has_org_access_permission(auth.uid(), organization_id, 'tv.live_operate')
);

CREATE TABLE IF NOT EXISTS public.tv_cut_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  live_session_id uuid NOT NULL REFERENCES public.tv_live_sessions(id) ON DELETE CASCADE,
  camera_id uuid REFERENCES public.tv_studio_cameras(id) ON DELETE SET NULL,
  camera_name text NOT NULL,
  elapsed_seconds integer NOT NULL DEFAULT 0 CHECK (elapsed_seconds >= 0),
  cut_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tv_cut_log_session ON public.tv_cut_log (live_session_id, created_at);

ALTER TABLE public.tv_cut_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY tv_cut_log_select ON public.tv_cut_log
FOR SELECT TO authenticated
USING (
  public.has_org_access_permission(auth.uid(), organization_id, 'tv.manage')
  OR public.has_org_access_permission(auth.uid(), organization_id, 'tv.live_operate')
);
-- Escrita só via log_camera_cut (RPC).

-- ── RPC: create_tv_studio_room ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_tv_studio_room(p_live_session_id uuid)
RETURNS TABLE (studio_room_id uuid, room_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session record;
  v_room record;
BEGIN
  SELECT id, organization_id, tv_channel_id INTO v_session FROM public.tv_live_sessions WHERE id = p_live_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'live_session_not_found'; END IF;

  IF NOT (
    public.has_org_access_permission(auth.uid(), v_session.organization_id, 'tv.manage')
    OR public.has_org_access_permission(auth.uid(), v_session.organization_id, 'tv.live_operate')
  ) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT id, tv_studio_rooms.room_name INTO v_room FROM public.tv_studio_rooms WHERE live_session_id = p_live_session_id;
  IF FOUND THEN
    UPDATE public.tv_studio_rooms
    SET is_active = true,
        status = 'active',
        director_user_id = auth.uid(),
        started_at = COALESCE(started_at, now()),
        ended_at = NULL
    WHERE id = v_room.id;
    RETURN QUERY SELECT v_room.id, v_room.room_name;
    RETURN;
  END IF;

  INSERT INTO public.tv_studio_rooms (
    organization_id, tv_channel_id, live_session_id, room_name,
    provider, status, director_user_id, created_by, started_at, is_active
  )
  VALUES (
    v_session.organization_id, v_session.tv_channel_id, p_live_session_id,
    'room_' || replace(gen_random_uuid()::text, '-', ''),
    'livekit', 'active', auth.uid(), auth.uid(), now(), true
  )
  ON CONFLICT (live_session_id) DO UPDATE SET
    is_active = true,
    status = 'active',
    director_user_id = auth.uid(),
    started_at = COALESCE(tv_studio_rooms.started_at, now()),
    ended_at = NULL
  RETURNING id, tv_studio_rooms.room_name INTO v_room;

  UPDATE public.tv_live_sessions SET studio_room_id = v_room.id WHERE id = p_live_session_id;

  RETURN QUERY SELECT v_room.id, v_room.room_name;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tv_studio_room(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tv_studio_room(uuid) TO authenticated;

-- ── RPC: get_studio_cameras ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_studio_cameras(p_channel_id uuid)
RETURNS TABLE (
  id uuid, name text, camera_type text, device_id text, scene_name text,
  remote_token text, icon_name text, sort_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.id, c.name, c.camera_type, c.device_id, c.scene_name, c.remote_token, c.icon_name, c.sort_order
  FROM public.tv_studio_cameras c
  JOIN public.tv_channels ch ON ch.id = c.tv_channel_id
  WHERE c.tv_channel_id = p_channel_id
    AND c.is_active
    AND (
      public.has_org_access_permission(auth.uid(), ch.organization_id, 'tv.manage')
      OR public.has_org_access_permission(auth.uid(), ch.organization_id, 'tv.live_operate')
    )
  ORDER BY c.sort_order;
$$;

REVOKE ALL ON FUNCTION public.get_studio_cameras(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_studio_cameras(uuid) TO authenticated;

-- ── RPC: log_camera_cut ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_camera_cut(
  p_session_id uuid,
  p_camera_id uuid,
  p_camera_name text,
  p_elapsed_seconds integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.tv_live_sessions WHERE id = p_session_id;
  IF v_org_id IS NULL THEN RETURN; END IF;
  IF NOT (
    public.has_org_access_permission(auth.uid(), v_org_id, 'tv.manage')
    OR public.has_org_access_permission(auth.uid(), v_org_id, 'tv.live_operate')
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.tv_cut_log (organization_id, live_session_id, camera_id, camera_name, elapsed_seconds, cut_by)
  VALUES (v_org_id, p_session_id, p_camera_id, COALESCE(p_camera_name, 'Câmera'), GREATEST(p_elapsed_seconds, 0), auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.log_camera_cut(uuid, uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_camera_cut(uuid, uuid, text, integer) TO authenticated;

-- ── RPC: list_active_productions ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_active_productions(
  p_org_id uuid,
  p_channel_id uuid DEFAULT NULL
)
RETURNS TABLE (
  live_session_id uuid, channel_id uuid, channel_name text, title text, mode text,
  status_transmissao text, director_user_id uuid, director_device_id text,
  director_last_seen_at timestamptz, camera_count bigint, studio_room_id uuid,
  room_name text, started_at timestamptz, created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.tv_channel_id, c.name, COALESCE(s.title, 'Produção ao vivo'), COALESCE(s.mode, 'temple'),
         s.status_transmissao, s.director_user_id, s.director_device_id, s.director_last_seen_at,
         (SELECT count(*) FROM public.tv_camera_sessions cs
           WHERE cs.live_session_id = s.id AND cs.role = 'camera' AND cs.status NOT IN ('disconnected', 'error')),
         r.id, r.room_name, s.started_at, s.created_at
  FROM public.tv_live_sessions s
  JOIN public.tv_channels c ON c.id = s.tv_channel_id
  LEFT JOIN public.tv_studio_rooms r ON r.live_session_id = s.id
  WHERE s.organization_id = p_org_id
    AND (p_channel_id IS NULL OR s.tv_channel_id = p_channel_id)
    AND s.status_transmissao IN ('waiting', 'live')
    AND (
      public.has_org_access_permission(auth.uid(), p_org_id, 'tv.manage')
      OR public.has_org_access_permission(auth.uid(), p_org_id, 'tv.live_operate')
    )
  ORDER BY s.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.list_active_productions(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_active_productions(uuid, uuid) TO authenticated;

-- ── RPC: create_live_production ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_live_production(
  p_org_id uuid,
  p_channel_id uuid,
  p_title text,
  p_mode text,
  p_director_device_id text
)
RETURNS TABLE (live_session_id uuid, studio_room_id uuid, room_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session_id uuid;
  v_room record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (
    public.has_org_access_permission(auth.uid(), p_org_id, 'tv.manage')
    OR public.has_org_access_permission(auth.uid(), p_org_id, 'tv.live_operate')
  ) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF p_mode NOT IN ('temple', 'external', 'podcast') THEN
    RAISE EXCEPTION 'invalid_mode';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tv_channels WHERE id = p_channel_id AND organization_id = p_org_id) THEN
    RAISE EXCEPTION 'channel_not_found';
  END IF;

  INSERT INTO public.tv_live_sessions (
    organization_id, tv_channel_id, status_transmissao, mode, title,
    director_user_id, director_device_id, director_last_seen_at, created_by
  ) VALUES (
    p_org_id, p_channel_id, 'waiting', p_mode, NULLIF(btrim(p_title), ''),
    auth.uid(), p_director_device_id, now(), auth.uid()
  )
  RETURNING id INTO v_session_id;

  INSERT INTO public.tv_studio_rooms (
    organization_id, tv_channel_id, live_session_id, room_name,
    provider, status, director_user_id, director_device_id, created_by,
    started_at, is_active
  )
  VALUES (
    p_org_id, p_channel_id, v_session_id,
    'room_' || replace(gen_random_uuid()::text, '-', ''),
    'livekit', 'active', auth.uid(), p_director_device_id, auth.uid(),
    now(), true
  )
  RETURNING id, tv_studio_rooms.room_name INTO v_room;

  UPDATE public.tv_live_sessions SET studio_room_id = v_room.id WHERE id = v_session_id;

  INSERT INTO public.tv_camera_sessions (
    organization_id, tv_channel_id, live_session_id, studio_room_id,
    user_id, device_id, camera_name, camera_number,
    device_type, role, status, source_type, last_heartbeat_at, connected_at
  ) VALUES (
    p_org_id, p_channel_id, v_session_id, v_room.id,
    auth.uid(), p_director_device_id, 'Direção', 0,
    'desktop', 'director', 'connected', 'logged_device', now(), now()
  );

  RETURN QUERY SELECT v_session_id, v_room.id, v_room.room_name;
END;
$$;

REVOKE ALL ON FUNCTION public.create_live_production(uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_live_production(uuid, uuid, text, text, text) TO authenticated;

-- ── RPC: claim_production_director ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_production_director(
  p_live_session_id uuid,
  p_director_device_id text,
  p_force boolean DEFAULT false
)
RETURNS TABLE (ok boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session record;
  v_current_stale boolean;
BEGIN
  SELECT * INTO v_session FROM public.tv_live_sessions WHERE id = p_live_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'live_session_not_found'::text; RETURN;
  END IF;
  IF NOT (
    public.has_org_access_permission(auth.uid(), v_session.organization_id, 'tv.manage')
    OR public.has_org_access_permission(auth.uid(), v_session.organization_id, 'tv.live_operate')
  ) THEN
    RETURN QUERY SELECT false, 'permission_denied'::text; RETURN;
  END IF;

  v_current_stale := v_session.director_last_seen_at IS NULL
    OR v_session.director_last_seen_at < now() - interval '90 seconds';

  IF v_session.director_device_id IS NOT NULL
     AND v_session.director_device_id != p_director_device_id
     AND NOT v_current_stale
     AND NOT p_force THEN
    RETURN QUERY SELECT false, 'director_already_active'::text; RETURN;
  END IF;

  UPDATE public.tv_live_sessions
  SET director_user_id = auth.uid(), director_device_id = p_director_device_id, director_last_seen_at = now()
  WHERE id = p_live_session_id;

  INSERT INTO public.tv_camera_sessions (
    organization_id, tv_channel_id, live_session_id, studio_room_id,
    user_id, device_id, camera_name, camera_number,
    device_type, role, status, source_type, last_heartbeat_at, connected_at
  ) VALUES (
    v_session.organization_id, v_session.tv_channel_id, p_live_session_id, v_session.studio_room_id,
    auth.uid(), p_director_device_id, 'Direção', 0,
    'desktop', 'director', 'connected', 'logged_device', now(), now()
  )
  ON CONFLICT (live_session_id, device_id)
    WHERE status NOT IN ('disconnected', 'error') AND device_id IS NOT NULL
  DO UPDATE SET
    tv_channel_id = EXCLUDED.tv_channel_id,
    studio_room_id = EXCLUDED.studio_room_id,
    status = 'connected',
    last_heartbeat_at = now(),
    connected_at = COALESCE(tv_camera_sessions.connected_at, now()),
    disconnected_at = NULL,
    user_id = auth.uid();

  RETURN QUERY SELECT true, 'director_claimed'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_production_director(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_production_director(uuid, text, boolean) TO authenticated;

-- ── RPC: join_production_as_camera ───────────────────────────────────────
-- Qualquer membro autenticado da organização (ou de organização
-- descendente) pode entrar como câmera quando possui o link da produção —
-- "convidados/celulares como câmeras" não exige tv.live_operate, só
-- pertencer à igreja (contrato §5). Corte/direção continuam exigindo
-- tv.manage/tv.live_operate nas RPCs de direção.
CREATE OR REPLACE FUNCTION public.join_production_as_camera(
  p_live_session_id uuid,
  p_device_id text,
  p_camera_name text,
  p_device_type text,
  p_source_type text
)
RETURNS TABLE (camera_session_id uuid, camera_number integer, room_name text, studio_room_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session record;
  v_room record;
  v_next_number integer;
  v_camera_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_device_type NOT IN ('mobile', 'desktop', 'browser') THEN RAISE EXCEPTION 'invalid_device_type'; END IF;
  IF p_source_type NOT IN ('logged_device', 'external_link', 'local_demo') THEN RAISE EXCEPTION 'invalid_source_type'; END IF;

  SELECT * INTO v_session FROM public.tv_live_sessions WHERE id = p_live_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'live_session_not_found'; END IF;
  IF NOT public._can_consume_org_content(auth.uid(), v_session.organization_id) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT id, tv_studio_rooms.room_name INTO v_room FROM public.tv_studio_rooms WHERE live_session_id = p_live_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'studio_room_not_ready'; END IF;

  SELECT COALESCE(MAX(camera_number), 0) + 1 INTO v_next_number
  FROM public.tv_camera_sessions
  WHERE live_session_id = p_live_session_id AND role = 'camera';

  INSERT INTO public.tv_camera_sessions (
    organization_id, tv_channel_id, live_session_id, studio_room_id,
    user_id, device_id, camera_name, camera_number,
    device_type, role, status, source_type, last_heartbeat_at, connected_at
  ) VALUES (
    v_session.organization_id, v_session.tv_channel_id, p_live_session_id, v_room.id,
    auth.uid(), p_device_id,
    COALESCE(NULLIF(btrim(p_camera_name), ''), 'Câmera'), v_next_number,
    p_device_type, 'camera', 'connected', p_source_type, now(), now()
  )
  ON CONFLICT (live_session_id, device_id)
    WHERE status NOT IN ('disconnected', 'error') AND device_id IS NOT NULL
  DO UPDATE SET
    tv_channel_id = EXCLUDED.tv_channel_id,
    studio_room_id = EXCLUDED.studio_room_id,
    status = 'connected',
    last_heartbeat_at = now(),
    connected_at = COALESCE(tv_camera_sessions.connected_at, now()),
    disconnected_at = NULL,
    camera_name = EXCLUDED.camera_name,
    user_id = auth.uid()
  RETURNING id INTO v_camera_id;

  RETURN QUERY SELECT v_camera_id, v_next_number, v_room.room_name, v_room.id;
END;
$$;

REVOKE ALL ON FUNCTION public.join_production_as_camera(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_production_as_camera(uuid, text, text, text, text) TO authenticated;

-- ── RPC: disconnect_camera ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.disconnect_camera(p_camera_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cam record;
BEGIN
  SELECT * INTO v_cam FROM public.tv_camera_sessions WHERE id = p_camera_session_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF NOT (
    v_cam.user_id = auth.uid()
    OR public.has_org_access_permission(auth.uid(), v_cam.organization_id, 'tv.manage')
    OR public.has_org_access_permission(auth.uid(), v_cam.organization_id, 'tv.live_operate')
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.tv_camera_sessions
  SET status = 'disconnected', is_on_air = false, disconnected_at = now()
  WHERE id = p_camera_session_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.disconnect_camera(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disconnect_camera(uuid) TO authenticated;

-- ── RPC: director_heartbeat / update_camera_heartbeat ────────────────────
CREATE OR REPLACE FUNCTION public.director_heartbeat(p_live_session_id uuid, p_director_device_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.tv_live_sessions
  SET director_last_seen_at = now(), last_heartbeat_at = now()
  WHERE id = p_live_session_id AND director_device_id = p_director_device_id AND director_user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.director_heartbeat(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.director_heartbeat(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_camera_heartbeat(p_camera_session_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.tv_camera_sessions
  SET last_heartbeat_at = now()
  WHERE id = p_camera_session_id AND user_id = auth.uid() AND status <> 'disconnected';
$$;

REVOKE ALL ON FUNCTION public.update_camera_heartbeat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_camera_heartbeat(uuid) TO authenticated;

-- ── RPC: end_live_production ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.end_live_production(p_live_session_id uuid, p_director_device_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session record;
BEGIN
  SELECT * INTO v_session FROM public.tv_live_sessions WHERE id = p_live_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  IF NOT (
    (v_session.director_device_id = p_director_device_id AND v_session.director_user_id = auth.uid())
    OR public.has_org_access_permission(auth.uid(), v_session.organization_id, 'tv.manage')
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.tv_live_sessions
  SET status_transmissao = 'ended', ended_at = now()
  WHERE id = p_live_session_id;

  UPDATE public.tv_camera_sessions
  SET status = 'disconnected', is_on_air = false, disconnected_at = now()
  WHERE live_session_id = p_live_session_id AND status <> 'disconnected';

  UPDATE public.tv_studio_rooms
  SET is_active = false, status = 'ended', ended_at = now()
  WHERE live_session_id = p_live_session_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.end_live_production(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_live_production(uuid, text) TO authenticated;

-- ── RPC: set_camera_on_air ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_camera_on_air(p_camera_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cam record;
  v_session record;
BEGIN
  SELECT * INTO v_cam FROM public.tv_camera_sessions WHERE id = p_camera_session_id;
  IF NOT FOUND OR v_cam.status = 'disconnected' THEN RETURN false; END IF;

  SELECT * INTO v_session FROM public.tv_live_sessions WHERE id = v_cam.live_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  IF NOT (
    v_session.director_user_id = auth.uid()
    OR public.has_org_access_permission(auth.uid(), v_session.organization_id, 'tv.manage')
    OR public.has_org_access_permission(auth.uid(), v_session.organization_id, 'tv.live_operate')
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.tv_camera_sessions
  SET is_on_air = false, status = CASE WHEN status = 'on_air' THEN 'connected' ELSE status END
  WHERE live_session_id = v_cam.live_session_id AND id <> p_camera_session_id;

  UPDATE public.tv_camera_sessions SET is_on_air = true, status = 'on_air' WHERE id = p_camera_session_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_camera_on_air(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_camera_on_air(uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 2. VÍNCULO IDEMPOTENTE TV → CANAL ECLÉSIA (contrato §8)
-- ════════════════════════════════════════════════════════════════════════
-- Ao criar um canal de TV, cria OU vincula (nunca duplica) o canal
-- correspondente no Canal Eclésia da MESMA organização. Protegido por
-- advisory lock por (organization_id, slug) para nunca criar dois canais
-- equivalentes em duplo clique/retry/concorrência — mesmo padrão usado por
-- outras operações desta base para exclusão mútua sem lock de tabela
-- inteira. Exclusão/desativação de um lado NUNCA apaga o outro: tv_channels
-- só é arquivado (status='archived', nunca DELETE) e este trigger só roda em
-- INSERT — desativar uma TV não desativa o Canal correspondente.
CREATE OR REPLACE FUNCTION public._tv_channels_link_ecclesia_channel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_canal_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text || ':' || NEW.slug, 0));

  SELECT id INTO v_canal_id
  FROM public.ecclesia_channels
  WHERE organization_id = NEW.organization_id AND slug = NEW.slug;

  IF v_canal_id IS NULL THEN
    INSERT INTO public.ecclesia_channels (
      organization_id, owner_user_id, name, slug, description, logo_url,
      visibility, status, source_tv_channel_id, created_by
    ) VALUES (
      NEW.organization_id, NEW.created_by, NEW.name, NEW.slug, NEW.description, NEW.logo_url,
      NEW.visibility, 'active', NEW.id, NEW.created_by
    )
    ON CONFLICT (organization_id, slug) DO UPDATE SET source_tv_channel_id = EXCLUDED.source_tv_channel_id
    RETURNING id INTO v_canal_id;
  ELSIF (SELECT source_tv_channel_id FROM public.ecclesia_channels WHERE id = v_canal_id) IS NULL THEN
    -- Canal já existia (criado manualmente com o mesmo slug) — apenas
    -- vincula, nunca sobrescreve nome/descrição/visibilidade editados pelo
    -- gestor do Canal.
    UPDATE public.ecclesia_channels SET source_tv_channel_id = NEW.id WHERE id = v_canal_id;
  END IF;

  UPDATE public.tv_channels
  SET auto_publish_to_canal = true, default_canal_channel_id = v_canal_id
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._tv_channels_link_ecclesia_channel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tv_channels_link_ecclesia_channel ON public.tv_channels;
CREATE TRIGGER tv_channels_link_ecclesia_channel
AFTER INSERT ON public.tv_channels
FOR EACH ROW EXECUTE FUNCTION public._tv_channels_link_ecclesia_channel();

-- Trava, em banco, que default_canal_channel_id NUNCA aponte para um canal
-- de OUTRA organização (mesmo se alguém tentar via updateTvChannelAutoPublish).
CREATE OR REPLACE FUNCTION public._tv_channels_validate_canal_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.default_canal_channel_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.ecclesia_channels
      WHERE id = NEW.default_canal_channel_id AND organization_id = NEW.organization_id
    ) THEN
      RAISE EXCEPTION 'canal_link_cross_organization: default_canal_channel_id deve pertencer a mesma organizacao do canal de TV';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._tv_channels_validate_canal_link() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tv_channels_validate_canal_link ON public.tv_channels;
CREATE TRIGGER tv_channels_validate_canal_link
BEFORE INSERT OR UPDATE OF default_canal_channel_id ON public.tv_channels
FOR EACH ROW EXECUTE FUNCTION public._tv_channels_validate_canal_link();

-- ── RPC: import_tv_session_to_canal ──────────────────────────────────────
-- Transforma uma transmissão gravada (tv_live_sessions com recording_status
-- concluído) em vídeo do Canal. Idempotente por (tv_live_session_id,
-- channel_id): duas chamadas para a mesma sessão nunca duplicam o vídeo —
-- retornam o vídeo já existente.
CREATE OR REPLACE FUNCTION public.import_tv_session_to_canal(
  p_session_id uuid,
  p_channel_id uuid,
  p_title text,
  p_category text DEFAULT 'culto',
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session record;
  v_channel record;
  v_existing_video_id uuid;
  v_video_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_session FROM public.tv_live_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'session_not_found'); END IF;

  SELECT * INTO v_channel FROM public.ecclesia_channels WHERE id = p_channel_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'canal_channel_not_found'); END IF;

  IF v_channel.organization_id != v_session.organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cross_organization_not_allowed');
  END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_session.organization_id, 'canal.manage') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  IF v_session.status_transmissao NOT IN ('ended') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_ended');
  END IF;

  IF v_session.r2_storage_key IS NULL AND v_session.hls_url IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'recording_not_available');
  END IF;

  SELECT id INTO v_existing_video_id
  FROM public.ecclesia_videos
  WHERE tv_live_session_id = p_session_id AND channel_id = p_channel_id;

  IF v_existing_video_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'video_id', v_existing_video_id, 'already_existed', true);
  END IF;

  INSERT INTO public.ecclesia_videos (
    channel_id, organization_id, title, description, category,
    r2_storage_key, playback_url, hls_url, tv_live_session_id,
    visibility, status, uploaded_by, published_at
  ) VALUES (
    p_channel_id, v_session.organization_id, COALESCE(NULLIF(btrim(p_title), ''), 'Transmissão'), p_description,
    COALESCE(p_category, 'culto'), v_session.r2_storage_key, COALESCE(v_session.playback_url, v_session.hls_url),
    v_session.hls_url, p_session_id, 'org_members', 'ready', auth.uid(), now()
  )
  RETURNING id INTO v_video_id;

  RETURN jsonb_build_object('ok', true, 'video_id', v_video_id, 'already_existed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.import_tv_session_to_canal(uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_tv_session_to_canal(uuid, uuid, text, text, text) TO authenticated;

-- ── Verificação final ────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.tv_camera_sessions') IS NULL THEN v_missing := array_append(v_missing, 'tv_camera_sessions'); END IF;
  IF to_regclass('public.tv_studio_rooms') IS NULL THEN v_missing := array_append(v_missing, 'tv_studio_rooms'); END IF;
  IF to_regprocedure('public.create_live_production(uuid,uuid,text,text,text)') IS NULL THEN v_missing := array_append(v_missing, 'create_live_production'); END IF;
  IF to_regprocedure('public.join_production_as_camera(uuid,text,text,text,text)') IS NULL THEN v_missing := array_append(v_missing, 'join_production_as_camera'); END IF;
  IF to_regprocedure('public.import_tv_session_to_canal(uuid,uuid,text,text,text)') IS NULL THEN v_missing := array_append(v_missing, 'import_tv_session_to_canal'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tv_channels_link_ecclesia_channel') THEN
    v_missing := array_append(v_missing, 'trigger tv_channels_link_ecclesia_channel');
  END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'Migration tv_canal_live_production: itens ausentes apos criacao: %', array_to_string(v_missing, ', ');
  END IF;
  RAISE NOTICE 'Migration tv_canal_live_production: producao ao vivo e vinculo idempotente TV->Canal confirmados ✓';
END $$;

COMMIT;
