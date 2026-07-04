-- =============================================================================
-- Ecclesia Studio — Multicâmeras, Presets e Log de Cortes
-- =============================================================================

-- ── 1. Câmeras nomeadas por canal ────────────────────────────────────────────
-- Cada entrada representa uma câmera/posição nomeada pelo produtor.
-- camera_type:
--   'local'     → webcam/USB no navegador (deviceId do browser)
--   'remote'    → celular/remoto via WebRTC (remote_token)
--   'obs_scene' → cena do OBS (scene_name)

CREATE TABLE IF NOT EXISTS public.tv_studio_cameras (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tv_channel_id   uuid        NOT NULL REFERENCES public.tv_channels(id)   ON DELETE CASCADE,
  name            text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  camera_type     text        NOT NULL DEFAULT 'local'
                              CHECK (camera_type IN ('local', 'remote', 'obs_scene')),
  device_id       text,       -- browser MediaDevice.deviceId para 'local'
  scene_name      text,       -- nome da cena OBS para 'obs_scene'
  remote_token    text        DEFAULT encode(gen_random_bytes(16), 'hex'),
  icon_name       text        DEFAULT 'video', -- video|user|church|mic
  sort_order      integer     NOT NULL DEFAULT 0,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tv_studio_cameras_channel
  ON public.tv_studio_cameras (tv_channel_id, sort_order);

-- ── 2. Presets de produção (Templo, Externo, etc.) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.tv_studio_presets (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tv_channel_id   uuid        NOT NULL REFERENCES public.tv_channels(id)   ON DELETE CASCADE,
  name            text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  mode            text        NOT NULL DEFAULT 'temple'
                              CHECK (mode IN ('temple', 'external', 'podcast', 'custom')),
  -- Lista ordenada de IDs de câmeras para este preset
  camera_ids      uuid[]      NOT NULL DEFAULT '{}',
  -- Câmera padrão ao iniciar este preset
  default_camera_id uuid,
  is_default      boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tv_studio_presets_channel
  ON public.tv_studio_presets (tv_channel_id);

-- ── 3. Log de cortes ao vivo ─────────────────────────────────────────────────
-- Registra cada troca de câmera durante a transmissão.
-- Usado para recriar o vídeo final já editado via FFmpeg.
CREATE TABLE IF NOT EXISTS public.tv_cut_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  live_session_id uuid        NOT NULL REFERENCES public.tv_live_sessions(id) ON DELETE CASCADE,
  camera_id       uuid        REFERENCES public.tv_studio_cameras(id) ON DELETE SET NULL,
  camera_name     text        NOT NULL,  -- denormalizado para histórico
  cut_at          timestamptz NOT NULL DEFAULT now(),
  session_elapsed_seconds integer NOT NULL DEFAULT 0,
  director_user_id uuid       REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tv_cut_log_session
  ON public.tv_cut_log (live_session_id, cut_at);

-- ── 4. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.tv_studio_cameras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_studio_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_cut_log        ENABLE ROW LEVEL SECURITY;

-- Cameras: leitura para membros da org, escrita para admins
DO $$ BEGIN
  CREATE POLICY "studio_cameras_select" ON public.tv_studio_cameras
    FOR SELECT USING (
      organization_id IN (
        SELECT organization_id FROM public.organization_users
        WHERE user_id = auth.uid() AND is_active = true
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "studio_cameras_write" ON public.tv_studio_cameras
    FOR ALL USING (
      organization_id IN (
        SELECT organization_id FROM public.organization_users
        WHERE user_id = auth.uid() AND is_active = true
          AND role IN ('church_admin', 'pastor', 'secretary', 'super_admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Presets
DO $$ BEGIN
  CREATE POLICY "studio_presets_select" ON public.tv_studio_presets
    FOR SELECT USING (
      organization_id IN (
        SELECT organization_id FROM public.organization_users
        WHERE user_id = auth.uid() AND is_active = true
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "studio_presets_write" ON public.tv_studio_presets
    FOR ALL USING (
      organization_id IN (
        SELECT organization_id FROM public.organization_users
        WHERE user_id = auth.uid() AND is_active = true
          AND role IN ('church_admin', 'pastor', 'secretary', 'super_admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Cut log
DO $$ BEGIN
  CREATE POLICY "cut_log_select" ON public.tv_cut_log
    FOR SELECT USING (
      organization_id IN (
        SELECT organization_id FROM public.organization_users
        WHERE user_id = auth.uid() AND is_active = true
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "cut_log_insert" ON public.tv_cut_log
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 5. RPC: registrar corte ao vivo ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_camera_cut(
  p_session_id      uuid,
  p_camera_id       uuid,
  p_camera_name     text,
  p_elapsed_seconds integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.tv_live_sessions WHERE id = p_session_id;

  INSERT INTO public.tv_cut_log (
    organization_id, live_session_id, camera_id,
    camera_name, session_elapsed_seconds, director_user_id
  ) VALUES (
    v_org_id, p_session_id, p_camera_id,
    p_camera_name, p_elapsed_seconds, auth.uid()
  );
END;
$$;

-- ── 6. RPC: buscar câmeras do canal ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_studio_cameras(p_channel_id uuid)
RETURNS TABLE (
  id              uuid,
  name            text,
  camera_type     text,
  device_id       text,
  scene_name      text,
  remote_token    text,
  icon_name       text,
  sort_order      integer,
  is_active       boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id, name, camera_type, device_id, scene_name, remote_token, icon_name, sort_order, is_active
  FROM public.tv_studio_cameras
  WHERE tv_channel_id = p_channel_id
    AND is_active = true
  ORDER BY sort_order, created_at;
$$;

COMMENT ON TABLE public.tv_studio_cameras IS
  'Câmeras nomeadas para o Ecclesia Studio. Cada canal pode ter até 6 câmeras.
   Tipos: local (webcam/USB), remote (celular via WebRTC), obs_scene (cena OBS).';

COMMENT ON TABLE public.tv_cut_log IS
  'Registro de todos os cortes feitos ao vivo pelo diretor. Permite recriar
   o vídeo final editado automaticamente com FFmpeg usando os timestamps.';
