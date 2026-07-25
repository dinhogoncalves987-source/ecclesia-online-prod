-- ============================================================================
-- Migration: tv_canal_foundation
-- Timestamp: 20260802120000
-- OPERAÇÃO ESPECIAL — Auditoria e conclusão de TV Digital, Canal Eclésia e
-- Ecclesia Chat / Login por telefone (Parte A + B — fundação de banco)
-- ============================================================================
--
-- CONTEXTO (auditoria desta operação):
--   src/lib/tvDigital.ts e src/lib/canalEcclesia.ts já implementam um
--   contrato de frontend COMPLETO (tipos, mappers, chamadas .from()/.rpc())
--   para dezenas de tabelas/RPCs de TV Digital e Canal Eclésia. Ambientes
--   antigos de staging podem conter uma fundação parcial de TV criada fora
--   do histórico local; por isso esta migration também reconcilia esse
--   legado de forma idempotente, preservando dados e substituindo policies
--   permissivas. Em banco limpo, cria o mesmo schema canônico desde zero.
--
-- ESCOPO desta migration (fundação — consumo, catálogo e grade):
--   TV Digital: tv_channels, tv_stream_keys, tv_programs, tv_schedule_blocks,
--   tv_live_sessions, tv_replays + RPCs get_tv_schedule, get_current_tv_block,
--   track_tv_view_event, generate_recurring_instances.
--   Canal Eclésia: ecclesia_channels, ecclesia_videos, ecclesia_video_likes,
--   ecclesia_video_comments, ecclesia_subscriptions, ecclesia_watch_history,
--   ecclesia_video_playlists, ecclesia_playlist_items + RPCs
--   get_video_comments, upsert_watch_history.
--   Vínculo TV↔Canal (idempotente) + import_tv_session_to_canal.
--
-- FORA desta migration (ver 20260802130000_tv_canal_live_production.sql):
--   produção ao vivo baseada em device_id (tv_camera_sessions,
--   tv_studio_rooms, tv_studio_cameras, tv_cut_log e as RPCs de direção).
--
-- PRINCÍPIOS aplicados (contrato da operação):
--   * "ao vivo" nunca é um estado inventado no frontend: status_transmissao
--     é uma coluna com CHECK explícito (offline/waiting/live/ended/error) e
--     só muda via RPC/RLS server-side — nunca setState puro.
--   * consumo (assistir/navegar) é liberado a qualquer membro da própria
--     organização OU de uma organização descendente dela (a congregação
--     assiste ao canal da Sede) — nunca exige uma capability de GESTÃO só
--     para assistir. Gestão (tv.manage/canal.manage), operação ao vivo
--     (tv.live_operate) e moderação (canal.moderate) são capabilities
--     separadas, na tabela de definições já existente
--     (access_responsibility_definitions), nunca concedidas por
--     conveniência a secretário/tesoureiro/etc.
--   * canalMockData.ts (frontend) permanece isolado como amostra de
--     desenvolvimento — esta migration não lê nem grava nada a partir dele;
--     é uma correção de frontend tratada separadamente, fora do escopo SQL.
--
-- Esta migration NÃO é aplicada.
-- ============================================================================

BEGIN;

-- ── Preflight ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.organizations') IS NULL THEN v_missing := array_append(v_missing, 'public.organizations'); END IF;
  IF to_regclass('public.organization_users') IS NULL THEN v_missing := array_append(v_missing, 'public.organization_users'); END IF;
  IF to_regprocedure('public.is_organization_descendant_or_self(uuid,uuid)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.is_organization_descendant_or_self(uuid,uuid)');
  END IF;
  IF to_regprocedure('public.has_org_access_permission(uuid,uuid,text)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.has_org_access_permission(uuid,uuid,text)');
  END IF;
  IF to_regprocedure('public.is_platform_admin(uuid)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.is_platform_admin(uuid)');
  END IF;
  IF to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    v_missing := array_append(v_missing, 'public.update_updated_at_column()');
  END IF;
  IF to_regclass('public.access_responsibility_definitions') IS NULL THEN
    v_missing := array_append(v_missing, 'public.access_responsibility_definitions');
  END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'tv_canal_foundation preflight failed; missing: %', array_to_string(v_missing, ', ');
  END IF;
END;
$$;

-- ── Capabilities novas (tv.*/canal.*) ───────────────────────────────────────
-- Mesmo catálogo já usado pelo frontend em src/lib/accessControl.ts
-- (ACCESS_PERMISSION_KEYS). Não concedidas a nenhuma responsabilidade
-- existente por conveniência — apenas às DUAS responsabilidades novas de
-- governança implícita (church_admin/responsible_pastor), no mesmo padrão
-- idempotente usado por Discipulado/Teologia/Missões.
UPDATE public.access_responsibility_definitions
SET permission_keys = (
      SELECT ARRAY(SELECT DISTINCT unnest(
        COALESCE(permission_keys, ARRAY[]::text[])
        || ARRAY['tv.read', 'tv.manage', 'tv.live_operate', 'canal.read', 'canal.manage', 'canal.moderate']
      ))
    ),
    updated_at = now()
WHERE responsibility_type IN ('church_admin', 'responsible_pastor')
  AND NOT (
    'tv.read' = ANY(COALESCE(permission_keys, ARRAY[]::text[]))
    AND 'tv.manage' = ANY(COALESCE(permission_keys, ARRAY[]::text[]))
    AND 'tv.live_operate' = ANY(COALESCE(permission_keys, ARRAY[]::text[]))
    AND 'canal.read' = ANY(COALESCE(permission_keys, ARRAY[]::text[]))
    AND 'canal.manage' = ANY(COALESCE(permission_keys, ARRAY[]::text[]))
    AND 'canal.moderate' = ANY(COALESCE(permission_keys, ARRAY[]::text[]))
  );

-- ── Responsabilidades operacionais novas de TV/Canal ────────────────────────
-- Mesmo formato local já usado por Discipulado/Teologia/Missões
-- (src/lib/accessControl.ts define o espelho exato no frontend).
-- "tv_operator" NUNCA recebe tv.manage: opera câmeras/direção/transmissão nas
-- produções em que está escalado, mas não cria/edita canais, grade ou
-- configurações. "canal_moderator" modera comentários/conteúdo publicado sem
-- criar/excluir canais. Nenhuma delas é concedida automaticamente a
-- secretary/assistant_secretary — precisa ser atribuída explicitamente pelo
-- Gestor de Acessos.
INSERT INTO public.access_responsibility_definitions (
  responsibility_type, label, description, category, permission_keys,
  inherits_to_descendants, is_governance, sort_order
)
VALUES
  ('tv_manager', 'Gestor(a) de TV Digital',
    'Administra canais, programação, biblioteca e configurações da TV Digital da unidade.',
    'ministries', ARRAY['tv.read', 'tv.manage', 'tv.live_operate'], false, false, 120),
  ('tv_operator', 'Operador(a) de transmissão',
    'Opera direção, câmeras e transmissão ao vivo nas produções da TV Digital; não altera canais nem configurações.',
    'ministries', ARRAY['tv.read', 'tv.live_operate'], false, false, 121),
  ('canal_manager', 'Gestor(a) do Canal Eclésia',
    'Cria e administra canais, vídeos e playlists do Canal Eclésia da unidade.',
    'ministries', ARRAY['canal.read', 'canal.manage'], false, false, 122),
  ('canal_moderator', 'Moderador(a) do Canal Eclésia',
    'Modera comentários e conteúdo publicado no Canal Eclésia, sem criar ou excluir canais.',
    'ministries', ARRAY['canal.read', 'canal.moderate'], false, false, 123)
ON CONFLICT (responsibility_type) DO NOTHING;

-- ── Helper: consumo (assistir/navegar) por hierarquia ──────────────────────
-- Um membro pode CONSUMIR conteúdo de uma organização se pertence a ela ou a
-- uma organização descendente (congregação assiste ao canal da Sede/distrito
-- proprietário). Isto NUNCA autoriza gestão — apenas leitura de conteúdo já
-- publicado; toda escrita usa has_org_access_permission com a capability
-- específica (tv.manage/tv.live_operate/canal.manage/canal.moderate).
CREATE OR REPLACE FUNCTION public._can_consume_org_content(_user_id uuid, _content_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_platform_admin(_user_id)
  OR EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = _user_id
      AND COALESCE(ou.is_active, true) = true
      AND public.is_organization_descendant_or_self(_content_org_id, ou.organization_id)
  );
$$;

REVOKE ALL ON FUNCTION public._can_consume_org_content(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._can_consume_org_content(uuid, uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- PARTE A — TV DIGITAL (fundação)
-- ════════════════════════════════════════════════════════════════════════

-- Staging histórico possuía policies de TV criadas fora do histórico local,
-- inclusive INSERT anônimo em tv_camera_sessions. As tabelas abaixo recebem
-- policies canônicas nesta/na próxima migration; remova toda policy legada
-- antes de recriá-las. Em banco limpo o loop não encontra nenhuma linha.
DO $$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'tv_channels',
        'tv_stream_keys',
        'tv_programs',
        'tv_schedule_blocks',
        'tv_live_sessions',
        'tv_replays',
        'tv_intervals',
        'tv_view_events'
      )
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

-- ── tv_channels ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tv_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  church_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (btrim(name) <> ''),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  description text,
  logo_url text,
  cover_url text,
  visibility text NOT NULL DEFAULT 'org_members' CHECK (visibility IN ('public', 'org_members', 'private')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  -- Vínculo idempotente com o Canal Eclésia (ver 20260802130000, trigger
  -- _tv_channels_link_ecclesia_channel). NUNCA aponta para um canal de OUTRA
  -- organização — reforçado por trigger, não apenas pela FK.
  auto_publish_to_canal boolean NOT NULL DEFAULT false,
  default_canal_channel_id uuid,
  max_recording_minutes integer NOT NULL DEFAULT 240 CHECK (max_recording_minutes > 0),
  heartbeat_interval_sec integer NOT NULL DEFAULT 30 CHECK (heartbeat_interval_sec > 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_tv_channels_org_slug UNIQUE (organization_id, slug)
);

-- Compatibilidade com a fundação legada do staging. ADD COLUMN é no-op em
-- banco limpo/novo e preserva todas as linhas existentes.
ALTER TABLE public.tv_channels
  ADD COLUMN IF NOT EXISTS auto_publish_to_canal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_canal_channel_id uuid,
  ADD COLUMN IF NOT EXISTS max_recording_minutes integer NOT NULL DEFAULT 240
    CHECK (max_recording_minutes > 0),
  ADD COLUMN IF NOT EXISTS heartbeat_interval_sec integer NOT NULL DEFAULT 30
    CHECK (heartbeat_interval_sec > 0),
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.tv_channels
  DROP CONSTRAINT IF EXISTS tv_channels_organization_id_fkey,
  DROP CONSTRAINT IF EXISTS tv_channels_church_id_fkey,
  DROP CONSTRAINT IF EXISTS tv_channels_name_check,
  DROP CONSTRAINT IF EXISTS tv_channels_slug_check;
ALTER TABLE public.tv_channels
  ADD CONSTRAINT tv_channels_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT tv_channels_church_id_fkey
    FOREIGN KEY (church_id) REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD CONSTRAINT tv_channels_name_check CHECK (btrim(name) <> ''),
  ADD CONSTRAINT tv_channels_slug_check CHECK (slug ~ '^[a-z0-9-]+$');

ALTER TABLE public.tv_channels
  DROP CONSTRAINT IF EXISTS tv_channels_organization_id_slug_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.tv_channels'::regclass
      AND conname = 'uniq_tv_channels_org_slug'
  ) THEN
    ALTER TABLE public.tv_channels
      ADD CONSTRAINT uniq_tv_channels_org_slug UNIQUE (organization_id, slug);
  END IF;
END;
$$;

DROP INDEX IF EXISTS public.idx_tv_channels_org;
CREATE INDEX idx_tv_channels_org
  ON public.tv_channels (organization_id)
  WHERE status <> 'archived';

DROP TRIGGER IF EXISTS update_tv_channels_updated_at ON public.tv_channels;
DROP TRIGGER IF EXISTS tv_channels_updated_at ON public.tv_channels;
CREATE TRIGGER update_tv_channels_updated_at
BEFORE UPDATE ON public.tv_channels
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tv_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY tv_channels_select ON public.tv_channels
FOR SELECT TO authenticated
USING (status <> 'archived' AND public._can_consume_org_content(auth.uid(), organization_id));

CREATE POLICY tv_channels_insert ON public.tv_channels
FOR INSERT TO authenticated
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'tv.manage'));

CREATE POLICY tv_channels_update ON public.tv_channels
FOR UPDATE TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'tv.manage'))
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'tv.manage'));
-- Nenhuma policy de DELETE: exclusão real é proibida (deleteTvChannel() do
-- frontend já usa UPDATE status='archived' — nunca DELETE físico, preserva
-- histórico/auditoria).

-- ── tv_stream_keys ──────────────────────────────────────────────────────
-- Chave de stream: NUNCA em texto puro. Apenas hash + últimos 4 caracteres
-- (mesma regra já documentada no cabeçalho de tvDigital.ts). RLS restringe
-- leitura/escrita a quem tem tv.manage — nunca visível para consumo comum.
CREATE TABLE IF NOT EXISTS public.tv_stream_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  church_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  tv_channel_id uuid NOT NULL REFERENCES public.tv_channels(id) ON DELETE CASCADE,
  stream_key_hash text NOT NULL UNIQUE,
  stream_key_last4 text NOT NULL,
  stream_source_type text NOT NULL DEFAULT 'obs'
    CHECK (stream_source_type IN ('obs', 'mobile', 'computer', 'mock', 'scheduled')),
  label text,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tv_stream_keys
  ADD COLUMN IF NOT EXISTS church_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.tv_stream_keys
  DROP CONSTRAINT IF EXISTS tv_stream_keys_organization_id_fkey,
  DROP CONSTRAINT IF EXISTS tv_stream_keys_church_id_fkey;
ALTER TABLE public.tv_stream_keys
  ADD CONSTRAINT tv_stream_keys_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT tv_stream_keys_church_id_fkey
    FOREIGN KEY (church_id) REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.tv_stream_keys
  DROP CONSTRAINT IF EXISTS tv_stream_keys_stream_source_type_check;
ALTER TABLE public.tv_stream_keys
  ADD CONSTRAINT tv_stream_keys_stream_source_type_check
  CHECK (stream_source_type IN ('obs', 'mobile', 'computer', 'mock', 'scheduled'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.tv_stream_keys'::regclass
      AND conname = 'tv_stream_keys_stream_key_hash_key'
  ) THEN
    ALTER TABLE public.tv_stream_keys
      ADD CONSTRAINT tv_stream_keys_stream_key_hash_key UNIQUE (stream_key_hash);
  END IF;
END;
$$;

DROP INDEX IF EXISTS public.idx_tv_stream_keys_channel;
CREATE INDEX idx_tv_stream_keys_channel ON public.tv_stream_keys (tv_channel_id);

ALTER TABLE public.tv_stream_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY tv_stream_keys_all ON public.tv_stream_keys
FOR ALL TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'tv.manage'))
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'tv.manage'));

-- ── tv_programs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tv_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  church_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  tv_channel_id uuid NOT NULL REFERENCES public.tv_channels(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (btrim(title) <> ''),
  description text,
  program_type text NOT NULL DEFAULT 'general' CHECK (program_type IN (
    'culto', 'pregacao', 'louvor', 'estudo', 'infantil', 'jovens', 'mulheres',
    'homens', 'missoes', 'intervalo', 'noticiario', 'general'
  )),
  host_name text,
  ministry_id uuid,
  thumbnail_url text,
  default_duration_minutes integer NOT NULL DEFAULT 60 CHECK (default_duration_minutes > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tv_programs
  ADD COLUMN IF NOT EXISTS church_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ministry_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.tv_programs
  DROP CONSTRAINT IF EXISTS tv_programs_organization_id_fkey,
  DROP CONSTRAINT IF EXISTS tv_programs_church_id_fkey,
  DROP CONSTRAINT IF EXISTS tv_programs_title_check,
  DROP CONSTRAINT IF EXISTS tv_programs_default_duration_minutes_check;
ALTER TABLE public.tv_programs
  ADD CONSTRAINT tv_programs_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT tv_programs_church_id_fkey
    FOREIGN KEY (church_id) REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD CONSTRAINT tv_programs_title_check CHECK (btrim(title) <> ''),
  ADD CONSTRAINT tv_programs_default_duration_minutes_check
    CHECK (default_duration_minutes > 0);

DROP INDEX IF EXISTS public.idx_tv_programs_channel;
CREATE INDEX idx_tv_programs_channel
  ON public.tv_programs (tv_channel_id)
  WHERE status <> 'archived';

DROP TRIGGER IF EXISTS tv_programs_updated_at ON public.tv_programs;
DROP TRIGGER IF EXISTS update_tv_programs_updated_at ON public.tv_programs;
CREATE TRIGGER update_tv_programs_updated_at
BEFORE UPDATE ON public.tv_programs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tv_programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tv_programs_select ON public.tv_programs
FOR SELECT TO authenticated
USING (status <> 'archived' AND public._can_consume_org_content(auth.uid(), organization_id));

CREATE POLICY tv_programs_write ON public.tv_programs
FOR ALL TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'tv.manage'))
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'tv.manage'));

-- ── tv_schedule_blocks ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tv_schedule_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  church_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  tv_channel_id uuid NOT NULL REFERENCES public.tv_channels(id) ON DELETE CASCADE,
  program_id uuid REFERENCES public.tv_programs(id) ON DELETE SET NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  recurrence_rule text,
  block_type text NOT NULL DEFAULT 'program'
    CHECK (block_type IN ('live', 'replay', 'program', 'interval', 'placeholder')),
  source_video_id uuid,
  source_asset_url text,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'live', 'completed', 'cancelled')),
  priority integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tv_schedule_blocks_time_order CHECK (end_time > start_time)
);

ALTER TABLE public.tv_schedule_blocks
  ADD COLUMN IF NOT EXISTS church_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.tv_schedule_blocks
  DROP CONSTRAINT IF EXISTS tv_schedule_blocks_organization_id_fkey,
  DROP CONSTRAINT IF EXISTS tv_schedule_blocks_church_id_fkey;
ALTER TABLE public.tv_schedule_blocks
  ADD CONSTRAINT tv_schedule_blocks_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT tv_schedule_blocks_church_id_fkey
    FOREIGN KEY (church_id) REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.tv_schedule_blocks
  DROP CONSTRAINT IF EXISTS tv_schedule_blocks_time_check;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.tv_schedule_blocks'::regclass
      AND conname = 'tv_schedule_blocks_time_order'
  ) THEN
    ALTER TABLE public.tv_schedule_blocks
      ADD CONSTRAINT tv_schedule_blocks_time_order CHECK (end_time > start_time);
  END IF;
END;
$$;

DROP INDEX IF EXISTS public.idx_tv_schedule_channel_time;
DROP INDEX IF EXISTS public.idx_tv_schedule_blocks_channel_time;
CREATE INDEX idx_tv_schedule_blocks_channel_time
  ON public.tv_schedule_blocks (tv_channel_id, start_time);

DROP TRIGGER IF EXISTS tv_schedule_blocks_updated_at ON public.tv_schedule_blocks;
DROP TRIGGER IF EXISTS update_tv_schedule_blocks_updated_at ON public.tv_schedule_blocks;
CREATE TRIGGER update_tv_schedule_blocks_updated_at
BEFORE UPDATE ON public.tv_schedule_blocks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tv_schedule_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tv_schedule_blocks_select ON public.tv_schedule_blocks
FOR SELECT TO authenticated
USING (status <> 'cancelled' AND public._can_consume_org_content(auth.uid(), organization_id));

CREATE POLICY tv_schedule_blocks_write ON public.tv_schedule_blocks
FOR ALL TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'tv.manage'))
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'tv.manage'));

-- ── tv_live_sessions ────────────────────────────────────────────────────
-- Colunas de produção ao vivo por device_id (mode, title, director_*,
-- studio_room_id) são preenchidas pelas RPCs da próxima migration
-- (SECURITY DEFINER, ignoram RLS). As policies aqui cobrem o caminho direto
-- já usado por tvDigital.ts (fetchLiveSession/fetchRecentSessions/
-- startMockLiveSession/endLiveSession).
CREATE TABLE IF NOT EXISTS public.tv_live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  church_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  tv_channel_id uuid NOT NULL REFERENCES public.tv_channels(id) ON DELETE CASCADE,
  schedule_block_id uuid REFERENCES public.tv_schedule_blocks(id) ON DELETE SET NULL,
  program_id uuid REFERENCES public.tv_programs(id) ON DELETE SET NULL,
  stream_key_id uuid REFERENCES public.tv_stream_keys(id) ON DELETE SET NULL,
  stream_source_type text CHECK (stream_source_type IN ('obs', 'mobile', 'computer', 'mock', 'scheduled')),
  status_transmissao text NOT NULL DEFAULT 'offline'
    CHECK (status_transmissao IN ('offline', 'waiting', 'live', 'ended', 'error')),
  ingest_url text,
  playback_url text,
  hls_url text,
  rtmp_url text,
  started_at timestamptz,
  ended_at timestamptz,
  last_heartbeat_at timestamptz,
  viewer_count integer NOT NULL DEFAULT 0 CHECK (viewer_count >= 0),
  peak_viewer_count integer NOT NULL DEFAULT 0 CHECK (peak_viewer_count >= 0),
  recording_status text NOT NULL DEFAULT 'idle'
    CHECK (recording_status IN ('idle', 'recording', 'processing', 'completed', 'failed')),
  r2_storage_key text,
  error_message text,
  -- Produção ao vivo (device_id) — preenchidas por
  -- 20260802130000_tv_canal_live_production.sql.
  mode text CHECK (mode IN ('temple', 'external', 'podcast')),
  title text,
  director_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  director_device_id text,
  director_last_seen_at timestamptz,
  studio_room_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tv_live_sessions
  ADD COLUMN IF NOT EXISTS church_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS studio_room_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.tv_live_sessions
  DROP CONSTRAINT IF EXISTS tv_live_sessions_organization_id_fkey,
  DROP CONSTRAINT IF EXISTS tv_live_sessions_church_id_fkey,
  DROP CONSTRAINT IF EXISTS tv_live_sessions_viewer_count_check,
  DROP CONSTRAINT IF EXISTS tv_live_sessions_peak_viewer_count_check;
ALTER TABLE public.tv_live_sessions
  ADD CONSTRAINT tv_live_sessions_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT tv_live_sessions_church_id_fkey
    FOREIGN KEY (church_id) REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD CONSTRAINT tv_live_sessions_viewer_count_check CHECK (viewer_count >= 0),
  ADD CONSTRAINT tv_live_sessions_peak_viewer_count_check CHECK (peak_viewer_count >= 0);

DROP INDEX IF EXISTS public.idx_tv_live_sessions_channel_status;
DROP INDEX IF EXISTS public.idx_tv_live_sessions_org_active;
DROP INDEX IF EXISTS public.idx_tv_live_sessions_channel;
DROP INDEX IF EXISTS public.idx_tv_live_sessions_org_created;
CREATE INDEX idx_tv_live_sessions_channel
  ON public.tv_live_sessions (tv_channel_id, status_transmissao);
CREATE INDEX idx_tv_live_sessions_org_created
  ON public.tv_live_sessions (organization_id, created_at DESC);

DROP TRIGGER IF EXISTS tv_live_sessions_updated_at ON public.tv_live_sessions;
DROP TRIGGER IF EXISTS update_tv_live_sessions_updated_at ON public.tv_live_sessions;
CREATE TRIGGER update_tv_live_sessions_updated_at
BEFORE UPDATE ON public.tv_live_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tv_live_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tv_live_sessions_select ON public.tv_live_sessions
FOR SELECT TO authenticated
USING (public._can_consume_org_content(auth.uid(), organization_id));

CREATE POLICY tv_live_sessions_write ON public.tv_live_sessions
FOR INSERT TO authenticated
WITH CHECK (
  public.has_org_access_permission(auth.uid(), organization_id, 'tv.manage')
  OR public.has_org_access_permission(auth.uid(), organization_id, 'tv.live_operate')
);

CREATE POLICY tv_live_sessions_update ON public.tv_live_sessions
FOR UPDATE TO authenticated
USING (
  public.has_org_access_permission(auth.uid(), organization_id, 'tv.manage')
  OR public.has_org_access_permission(auth.uid(), organization_id, 'tv.live_operate')
)
WITH CHECK (
  public.has_org_access_permission(auth.uid(), organization_id, 'tv.manage')
  OR public.has_org_access_permission(auth.uid(), organization_id, 'tv.live_operate')
);

-- ── tv_replays ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tv_replays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  church_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  tv_channel_id uuid NOT NULL REFERENCES public.tv_channels(id) ON DELETE CASCADE,
  live_session_id uuid REFERENCES public.tv_live_sessions(id) ON DELETE SET NULL,
  program_id uuid REFERENCES public.tv_programs(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (btrim(title) <> ''),
  description text,
  thumbnail_url text,
  hls_url text,
  r2_storage_key text,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  file_size_bytes bigint CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'failed', 'archived')),
  recorded_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tv_replays
  ADD COLUMN IF NOT EXISTS church_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.tv_replays
  DROP CONSTRAINT IF EXISTS tv_replays_organization_id_fkey,
  DROP CONSTRAINT IF EXISTS tv_replays_church_id_fkey,
  DROP CONSTRAINT IF EXISTS tv_replays_title_check,
  DROP CONSTRAINT IF EXISTS tv_replays_duration_seconds_check,
  DROP CONSTRAINT IF EXISTS tv_replays_file_size_bytes_check;
ALTER TABLE public.tv_replays
  ADD CONSTRAINT tv_replays_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT tv_replays_church_id_fkey
    FOREIGN KEY (church_id) REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD CONSTRAINT tv_replays_title_check CHECK (btrim(title) <> ''),
  ADD CONSTRAINT tv_replays_duration_seconds_check
    CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  ADD CONSTRAINT tv_replays_file_size_bytes_check
    CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0);

DROP INDEX IF EXISTS public.idx_tv_replays_channel_status;
DROP INDEX IF EXISTS public.idx_tv_replays_channel;
CREATE INDEX idx_tv_replays_channel
  ON public.tv_replays (tv_channel_id, created_at DESC);

ALTER TABLE public.tv_replays ENABLE ROW LEVEL SECURITY;

CREATE POLICY tv_replays_select ON public.tv_replays
FOR SELECT TO authenticated
USING (status IN ('ready', 'processing') AND public._can_consume_org_content(auth.uid(), organization_id));

CREATE POLICY tv_replays_write ON public.tv_replays
FOR ALL TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'tv.manage'))
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'tv.manage'));

-- ── tv_intervals (legado útil: avisos entre programas) ──────────────────
-- A primeira implementação da TV criou esta tabela diretamente no staging.
-- Ela é preservada e incorporada ao contrato canônico para que a promoção
-- replique a mesma estrutura em produção sem apagar conteúdo existente.
CREATE TABLE IF NOT EXISTS public.tv_intervals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  church_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  tv_channel_id uuid REFERENCES public.tv_channels(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  interval_type text NOT NULL DEFAULT 'aviso'
    CHECK (interval_type IN ('aviso', 'anuncio', 'chamada', 'propaganda')),
  media_url text,
  media_type text CHECK (media_type IN ('video', 'image', 'html')),
  duration_seconds integer NOT NULL DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  display_from timestamptz,
  display_until timestamptz,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tv_intervals
  DROP CONSTRAINT IF EXISTS tv_intervals_organization_id_fkey,
  DROP CONSTRAINT IF EXISTS tv_intervals_church_id_fkey,
  DROP CONSTRAINT IF EXISTS tv_intervals_interval_type_check,
  DROP CONSTRAINT IF EXISTS tv_intervals_media_type_check;
ALTER TABLE public.tv_intervals
  ADD CONSTRAINT tv_intervals_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT tv_intervals_church_id_fkey
    FOREIGN KEY (church_id) REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD CONSTRAINT tv_intervals_interval_type_check
    CHECK (interval_type IN ('aviso', 'anuncio', 'chamada', 'propaganda')),
  ADD CONSTRAINT tv_intervals_media_type_check
    CHECK (media_type IS NULL OR media_type IN ('video', 'image', 'html'));

DROP INDEX IF EXISTS public.idx_tv_intervals_org_active;
CREATE INDEX idx_tv_intervals_org_active
  ON public.tv_intervals (organization_id, is_active, priority DESC);

ALTER TABLE public.tv_intervals ENABLE ROW LEVEL SECURITY;

CREATE POLICY tv_intervals_select ON public.tv_intervals
FOR SELECT TO authenticated
USING (public._can_consume_org_content(auth.uid(), organization_id));

CREATE POLICY tv_intervals_write ON public.tv_intervals
FOR ALL TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'tv.manage'))
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'tv.manage'));

-- ── tv_view_events (base de track_tv_view_event) ───────────────────────
CREATE TABLE IF NOT EXISTS public.tv_view_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tv_channel_id uuid NOT NULL REFERENCES public.tv_channels(id) ON DELETE CASCADE,
  live_session_id uuid REFERENCES public.tv_live_sessions(id) ON DELETE SET NULL,
  replay_id uuid REFERENCES public.tv_replays(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('join', 'heartbeat', 'leave', 'error')),
  viewer_session text NOT NULL,
  viewer_session_id text,
  watched_seconds integer NOT NULL DEFAULT 0 CHECK (watched_seconds >= 0),
  watch_duration_seconds integer,
  player_position_seconds integer,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  viewer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tv_view_events
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS replay_id uuid REFERENCES public.tv_replays(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS viewer_session text,
  ADD COLUMN IF NOT EXISTS viewer_session_id text,
  ADD COLUMN IF NOT EXISTS watched_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS watch_duration_seconds integer,
  ADD COLUMN IF NOT EXISTS player_position_seconds integer,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS viewer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.tv_view_events e
SET organization_id = c.organization_id,
    viewer_session = COALESCE(NULLIF(e.viewer_session, ''), NULLIF(e.viewer_session_id, ''), 'legacy-' || e.id::text),
    watched_seconds = GREATEST(COALESCE(e.watched_seconds, e.watch_duration_seconds, 0), 0),
    user_id = COALESCE(e.user_id, e.viewer_user_id)
FROM public.tv_channels c
WHERE c.id = e.tv_channel_id
  AND (
    e.organization_id IS NULL
    OR e.viewer_session IS NULL
    OR e.viewer_session = ''
    OR e.user_id IS NULL
  );

ALTER TABLE public.tv_view_events
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN viewer_session SET NOT NULL,
  ALTER COLUMN watched_seconds SET DEFAULT 0,
  ALTER COLUMN watched_seconds SET NOT NULL;

ALTER TABLE public.tv_view_events
  DROP CONSTRAINT IF EXISTS tv_view_events_organization_id_fkey;
ALTER TABLE public.tv_view_events
  ADD CONSTRAINT tv_view_events_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.tv_view_events
  DROP CONSTRAINT IF EXISTS tv_view_events_event_type_check;
ALTER TABLE public.tv_view_events
  ADD CONSTRAINT tv_view_events_event_type_check
  CHECK (event_type IN ('join', 'heartbeat', 'leave', 'error'));
ALTER TABLE public.tv_view_events
  DROP CONSTRAINT IF EXISTS tv_view_events_watched_seconds_check;
ALTER TABLE public.tv_view_events
  ADD CONSTRAINT tv_view_events_watched_seconds_check
  CHECK (watched_seconds >= 0);

DROP INDEX IF EXISTS public.idx_tv_view_events_session;
CREATE INDEX idx_tv_view_events_session
  ON public.tv_view_events (live_session_id, viewer_session);

ALTER TABLE public.tv_view_events ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy: só a RPC track_tv_view_event (SECURITY DEFINER) grava.

-- ── RPC: get_tv_schedule ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_tv_schedule(
  p_channel_id uuid,
  p_from timestamptz,
  p_days integer DEFAULT 7
)
RETURNS TABLE (
  block_id uuid, channel_id uuid, program_id uuid, start_time timestamptz,
  end_time timestamptz, block_type text, status text, program_title text, thumbnail_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT b.id, b.tv_channel_id, b.program_id, b.start_time, b.end_time,
         b.block_type, b.status, p.title, p.thumbnail_url
  FROM public.tv_schedule_blocks b
  LEFT JOIN public.tv_programs p ON p.id = b.program_id
  WHERE b.tv_channel_id = p_channel_id
    AND b.status <> 'cancelled'
    AND b.start_time < p_from + make_interval(days => GREATEST(p_days, 0))
    AND b.end_time > p_from
    AND EXISTS (
      SELECT 1 FROM public.tv_channels c
      WHERE c.id = p_channel_id AND public._can_consume_org_content(auth.uid(), c.organization_id)
    )
  ORDER BY b.start_time;
$$;

REVOKE ALL ON FUNCTION public.get_tv_schedule(uuid, timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tv_schedule(uuid, timestamptz, integer) TO authenticated;

-- ── RPC: get_current_tv_block ───────────────────────────────────────────
-- Nunca inventa "ao vivo": só retorna type='live' se existir uma
-- tv_live_sessions com status_transmissao='live' de fato. Caso contrário,
-- procura o bloco de grade vigente (program/interval/replay) ou 'offline'.
CREATE OR REPLACE FUNCTION public.get_current_tv_block(
  p_channel_id uuid,
  p_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id uuid;
  v_live record;
  v_block record;
  v_replay record;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.tv_channels WHERE id = p_channel_id;
  IF v_org_id IS NULL OR NOT public._can_consume_org_content(auth.uid(), v_org_id) THEN
    RETURN jsonb_build_object('type', 'offline');
  END IF;

  SELECT id, hls_url, rtmp_url, viewer_count, started_at
    INTO v_live
    FROM public.tv_live_sessions
   WHERE tv_channel_id = p_channel_id AND status_transmissao = 'live'
   ORDER BY started_at DESC NULLS LAST
   LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'type', 'live', 'session_id', v_live.id, 'hls_url', v_live.hls_url,
      'rtmp_url', v_live.rtmp_url, 'viewer_count', v_live.viewer_count, 'started_at', v_live.started_at
    );
  END IF;

  SELECT id, program_id, block_type, source_asset_url, start_time, end_time
    INTO v_block
    FROM public.tv_schedule_blocks
   WHERE tv_channel_id = p_channel_id AND status <> 'cancelled'
     AND start_time <= p_at AND end_time > p_at
   ORDER BY priority DESC, start_time DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'offline');
  END IF;

  IF v_block.block_type = 'interval' THEN
    RETURN jsonb_build_object(
      'type', 'interval', 'block_id', v_block.id, 'source_url', v_block.source_asset_url,
      'offset_seconds', GREATEST(0, EXTRACT(EPOCH FROM (p_at - v_block.start_time))::int),
      'block_start', v_block.start_time, 'block_end', v_block.end_time
    );
  END IF;

  IF v_block.block_type = 'replay' THEN
    SELECT id, title, hls_url, duration_seconds
      INTO v_replay
      FROM public.tv_replays
     WHERE tv_channel_id = p_channel_id AND status = 'ready'
       AND (program_id = v_block.program_id OR v_block.program_id IS NULL)
     ORDER BY published_at DESC NULLS LAST
     LIMIT 1;
    IF NOT FOUND THEN RETURN jsonb_build_object('type', 'offline'); END IF;
    RETURN jsonb_build_object(
      'type', 'replay', 'block_id', v_block.id, 'program_id', v_block.program_id,
      'hls_url', v_replay.hls_url, 'replay_id', v_replay.id, 'replay_title', v_replay.title,
      'replay_duration', v_replay.duration_seconds,
      'offset_seconds', GREATEST(0, EXTRACT(EPOCH FROM (p_at - v_block.start_time))::int),
      'block_start', v_block.start_time, 'block_end', v_block.end_time
    );
  END IF;

  RETURN jsonb_build_object(
    'type', 'program', 'block_id', v_block.id, 'program_id', v_block.program_id, 'hls_url', NULL,
    'offset_seconds', GREATEST(0, EXTRACT(EPOCH FROM (p_at - v_block.start_time))::int),
    'block_start', v_block.start_time, 'block_end', v_block.end_time
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_current_tv_block(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_tv_block(uuid, timestamptz) TO authenticated;

-- ── RPC: track_tv_view_event ────────────────────────────────────────────
-- join incrementa viewer_count/peak; leave decrementa (nunca abaixo de 0);
-- heartbeat só atualiza watched_seconds (via tv_view_events, não muda
-- contagem). Silenciosa por design (analytics não pode quebrar o player).
CREATE OR REPLACE FUNCTION public.track_tv_view_event(
  p_channel_id uuid,
  p_session_id uuid,
  p_event_type text,
  p_viewer_session text,
  p_watched_seconds integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_event_type NOT IN ('join', 'heartbeat', 'leave') THEN
    RETURN;
  END IF;

  SELECT organization_id INTO v_org_id FROM public.tv_channels WHERE id = p_channel_id;
  IF v_org_id IS NULL OR NOT public._can_consume_org_content(auth.uid(), v_org_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.tv_view_events (
    organization_id, tv_channel_id, live_session_id, event_type,
    viewer_session, viewer_session_id, watched_seconds, watch_duration_seconds,
    user_id, viewer_user_id
  ) VALUES (
    v_org_id, p_channel_id, p_session_id, p_event_type,
    p_viewer_session, p_viewer_session, GREATEST(p_watched_seconds, 0),
    GREATEST(p_watched_seconds, 0), auth.uid(), auth.uid()
  );

  IF p_session_id IS NOT NULL AND p_event_type = 'join' THEN
    UPDATE public.tv_live_sessions
    SET viewer_count = viewer_count + 1,
        peak_viewer_count = GREATEST(peak_viewer_count, viewer_count + 1)
    WHERE id = p_session_id;
  ELSIF p_session_id IS NOT NULL AND p_event_type = 'leave' THEN
    UPDATE public.tv_live_sessions
    SET viewer_count = GREATEST(viewer_count - 1, 0)
    WHERE id = p_session_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.track_tv_view_event(uuid, uuid, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.track_tv_view_event(uuid, uuid, text, text, integer) TO authenticated;

-- ── RPC: generate_recurring_instances ───────────────────────────────────
-- Expande um bloco RRULE (FREQ=WEEKLY;BYDAY=.. ou FREQ=DAILY;INTERVAL=n) em
-- instâncias concretas (mesma lógica de expandRruleBlocks no frontend,
-- agora também disponível como fonte de verdade no banco). Idempotente:
-- nunca duplica uma instância já existente no mesmo horário.
CREATE OR REPLACE FUNCTION public.generate_recurring_instances(
  p_block_id uuid,
  p_weeks integer DEFAULT 4
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_block record;
  v_created integer := 0;
  v_cursor date;
  v_end date;
  v_dow integer;
  v_byday text[];
  v_freq text;
  v_interval integer;
  v_day_index integer := 0;
  v_inst_start timestamptz;
  v_inst_end timestamptz;
  v_duration interval;
BEGIN
  SELECT * INTO v_block FROM public.tv_schedule_blocks WHERE id = p_block_id FOR UPDATE;
  IF NOT FOUND OR v_block.recurrence_rule IS NULL THEN
    RETURN 0;
  END IF;
  IF NOT public.has_org_access_permission(auth.uid(), v_block.organization_id, 'tv.manage') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  v_freq := (regexp_match(upper(v_block.recurrence_rule), 'FREQ=(\w+)'))[1];
  v_interval := COALESCE((regexp_match(upper(v_block.recurrence_rule), 'INTERVAL=(\d+)'))[1]::int, 1);
  v_byday := regexp_split_to_array(COALESCE((regexp_match(upper(v_block.recurrence_rule), 'BYDAY=([A-Z,]+)'))[1], ''), ',');
  v_duration := v_block.end_time - v_block.start_time;

  v_cursor := current_date;
  v_end := current_date + (GREATEST(p_weeks, 0) * 7);

  WHILE v_cursor < v_end LOOP
    v_dow := extract(dow FROM v_cursor)::int;
    IF (v_freq = 'WEEKLY' AND (
          (v_dow = 0 AND 'SU' = ANY(v_byday)) OR (v_dow = 1 AND 'MO' = ANY(v_byday)) OR
          (v_dow = 2 AND 'TU' = ANY(v_byday)) OR (v_dow = 3 AND 'WE' = ANY(v_byday)) OR
          (v_dow = 4 AND 'TH' = ANY(v_byday)) OR (v_dow = 5 AND 'FR' = ANY(v_byday)) OR
          (v_dow = 6 AND 'SA' = ANY(v_byday))
        ))
       OR (v_freq = 'DAILY' AND v_day_index % GREATEST(v_interval, 1) = 0)
    THEN
      v_inst_start := v_cursor + (v_block.start_time::time);
      v_inst_end := v_inst_start + v_duration;
      INSERT INTO public.tv_schedule_blocks (
        organization_id, tv_channel_id, program_id, start_time, end_time,
        recurrence_rule, block_type, source_asset_url, priority, created_by
      )
      SELECT v_block.organization_id, v_block.tv_channel_id, v_block.program_id, v_inst_start, v_inst_end,
             NULL, v_block.block_type, v_block.source_asset_url, v_block.priority, auth.uid()
      WHERE NOT EXISTS (
        SELECT 1 FROM public.tv_schedule_blocks x
        WHERE x.tv_channel_id = v_block.tv_channel_id AND x.start_time = v_inst_start
      );
      IF FOUND THEN v_created := v_created + 1; END IF;
    END IF;
    v_cursor := v_cursor + 1;
    v_day_index := v_day_index + 1;
  END LOOP;

  RETURN v_created;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_recurring_instances(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_recurring_instances(uuid, integer) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- PARTE B — CANAL ECLÉSIA (fundação)
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ecclesia_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (btrim(name) <> ''),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  description text,
  logo_url text,
  banner_url text,
  visibility text NOT NULL DEFAULT 'org_members' CHECK (visibility IN ('public', 'org_members', 'private')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  subscriber_count integer NOT NULL DEFAULT 0 CHECK (subscriber_count >= 0),
  video_count integer NOT NULL DEFAULT 0 CHECK (video_count >= 0),
  -- Origem TV↔Canal (o inverso de tv_channels.default_canal_channel_id):
  -- quando este canal foi criado a partir de um canal de TV, guarda a
  -- referência para a relação ficar auditável dos dois lados.
  source_tv_channel_id uuid REFERENCES public.tv_channels(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_ecclesia_channels_org_slug UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_ecclesia_channels_org ON public.ecclesia_channels (organization_id) WHERE status <> 'archived';
CREATE INDEX IF NOT EXISTS idx_ecclesia_channels_source_tv ON public.ecclesia_channels (source_tv_channel_id) WHERE source_tv_channel_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_ecclesia_channels_updated_at ON public.ecclesia_channels;
CREATE TRIGGER update_ecclesia_channels_updated_at
BEFORE UPDATE ON public.ecclesia_channels
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ecclesia_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY ecclesia_channels_select ON public.ecclesia_channels
FOR SELECT TO authenticated
USING (status <> 'archived' AND public._can_consume_org_content(auth.uid(), organization_id));

CREATE POLICY ecclesia_channels_insert ON public.ecclesia_channels
FOR INSERT TO authenticated
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'canal.manage'));

CREATE POLICY ecclesia_channels_update ON public.ecclesia_channels
FOR UPDATE TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'canal.manage'))
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'canal.manage'));

-- ── ecclesia_videos ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ecclesia_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.ecclesia_channels(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (btrim(title) <> ''),
  description text,
  category text NOT NULL DEFAULT 'general' CHECK (category IN (
    'culto', 'pregacao', 'louvor', 'estudo', 'infantil', 'jovens', 'mulheres',
    'homens', 'missoes', 'testemunho', 'noticiario', 'general'
  )),
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  thumbnail_url text,
  r2_storage_key text,
  playback_url text,
  hls_url text,
  tv_live_session_id uuid REFERENCES public.tv_live_sessions(id) ON DELETE SET NULL,
  visibility text NOT NULL DEFAULT 'org_members' CHECK (visibility IN ('public', 'org_members', 'private')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('processing', 'ready', 'failed', 'archived', 'draft')),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  view_count integer NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  like_count integer NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  comment_count integer NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecclesia_videos_channel ON public.ecclesia_videos (channel_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_ecclesia_videos_org ON public.ecclesia_videos (organization_id, published_at DESC);

ALTER TABLE public.ecclesia_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY ecclesia_videos_select ON public.ecclesia_videos
FOR SELECT TO authenticated
USING (
  status IN ('ready', 'processing')
  AND public._can_consume_org_content(auth.uid(), organization_id)
);

CREATE POLICY ecclesia_videos_insert ON public.ecclesia_videos
FOR INSERT TO authenticated
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'canal.manage'));

CREATE POLICY ecclesia_videos_update ON public.ecclesia_videos
FOR UPDATE TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'canal.manage'))
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'canal.manage'));

-- ── ecclesia_video_likes ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ecclesia_video_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.ecclesia_videos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_ecclesia_video_likes UNIQUE (video_id, user_id)
);

ALTER TABLE public.ecclesia_video_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY ecclesia_video_likes_select ON public.ecclesia_video_likes
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.ecclesia_videos v
  WHERE v.id = video_id AND public._can_consume_org_content(auth.uid(), v.organization_id)
));

CREATE POLICY ecclesia_video_likes_insert ON public.ecclesia_video_likes
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND EXISTS (
  SELECT 1 FROM public.ecclesia_videos v
  WHERE v.id = video_id AND public._can_consume_org_content(auth.uid(), v.organization_id)
));

CREATE POLICY ecclesia_video_likes_delete ON public.ecclesia_video_likes
FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- Contador denormalizado (like_count) sempre reflete a tabela real — nunca
-- incrementado só no frontend.
CREATE OR REPLACE FUNCTION public._ecclesia_sync_like_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.ecclesia_videos SET like_count = like_count + 1 WHERE id = NEW.video_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.ecclesia_videos SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.video_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._ecclesia_sync_like_count() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ecclesia_video_likes_sync_count ON public.ecclesia_video_likes;
CREATE TRIGGER ecclesia_video_likes_sync_count
AFTER INSERT OR DELETE ON public.ecclesia_video_likes
FOR EACH ROW EXECUTE FUNCTION public._ecclesia_sync_like_count();

-- ── ecclesia_video_comments ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ecclesia_video_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.ecclesia_videos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_comment_id uuid REFERENCES public.ecclesia_video_comments(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (btrim(body) <> ''),
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecclesia_video_comments_video ON public.ecclesia_video_comments (video_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ecclesia_video_comments_parent ON public.ecclesia_video_comments (parent_comment_id) WHERE parent_comment_id IS NOT NULL;

ALTER TABLE public.ecclesia_video_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY ecclesia_video_comments_select ON public.ecclesia_video_comments
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.ecclesia_videos v
  WHERE v.id = video_id AND public._can_consume_org_content(auth.uid(), v.organization_id)
));

CREATE POLICY ecclesia_video_comments_insert ON public.ecclesia_video_comments
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND EXISTS (
  SELECT 1 FROM public.ecclesia_videos v
  WHERE v.id = video_id AND public._can_consume_org_content(auth.uid(), v.organization_id)
));

-- Ocultar (soft-delete): autor OU quem tem canal.moderate na organização do
-- vídeo — moderação nunca depende de canal.manage (separação de
-- responsabilidades pedida no contrato).
CREATE POLICY ecclesia_video_comments_update ON public.ecclesia_video_comments
FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.ecclesia_videos v
    WHERE v.id = video_id AND public.has_org_access_permission(auth.uid(), v.organization_id, 'canal.moderate')
  )
)
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.ecclesia_videos v
    WHERE v.id = video_id AND public.has_org_access_permission(auth.uid(), v.organization_id, 'canal.moderate')
  )
);

CREATE OR REPLACE FUNCTION public._ecclesia_sync_comment_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.ecclesia_videos SET comment_count = comment_count + 1 WHERE id = NEW.video_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND OLD.is_deleted IS DISTINCT FROM NEW.is_deleted THEN
    UPDATE public.ecclesia_videos
    SET comment_count = GREATEST(comment_count + CASE WHEN NEW.is_deleted THEN -1 ELSE 1 END, 0)
    WHERE id = NEW.video_id;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._ecclesia_sync_comment_count() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ecclesia_video_comments_sync_count ON public.ecclesia_video_comments;
CREATE TRIGGER ecclesia_video_comments_sync_count
AFTER INSERT OR UPDATE OF is_deleted ON public.ecclesia_video_comments
FOR EACH ROW EXECUTE FUNCTION public._ecclesia_sync_comment_count();

-- ── RPC: get_video_comments (nível raiz + contagem de respostas) ────────
CREATE OR REPLACE FUNCTION public.get_video_comments(
  p_video_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, video_id uuid, user_id uuid, parent_comment_id uuid, body text,
  is_deleted boolean, created_at timestamptz, user_name text, user_avatar text, reply_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.id, c.video_id, c.user_id, c.parent_comment_id, c.body, c.is_deleted, c.created_at,
         COALESCE(p.full_name, 'Usuário'), p.avatar_url,
         (SELECT count(*) FROM public.ecclesia_video_comments r WHERE r.parent_comment_id = c.id AND NOT r.is_deleted)
  FROM public.ecclesia_video_comments c
  LEFT JOIN public.profiles p ON p.user_id = c.user_id
  WHERE c.video_id = p_video_id
    AND c.parent_comment_id IS NULL
    AND NOT c.is_deleted
    AND EXISTS (
      SELECT 1 FROM public.ecclesia_videos v
      WHERE v.id = p_video_id AND public._can_consume_org_content(auth.uid(), v.organization_id)
    )
  ORDER BY c.created_at DESC
  LIMIT GREATEST(p_limit, 0) OFFSET GREATEST(p_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.get_video_comments(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_video_comments(uuid, integer, integer) TO authenticated;

-- ── ecclesia_subscriptions (seguir canal / sino) ────────────────────────
CREATE TABLE IF NOT EXISTS public.ecclesia_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.ecclesia_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notifications_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_ecclesia_subscriptions UNIQUE (channel_id, user_id)
);

ALTER TABLE public.ecclesia_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY ecclesia_subscriptions_select ON public.ecclesia_subscriptions
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY ecclesia_subscriptions_insert ON public.ecclesia_subscriptions
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND EXISTS (
  SELECT 1 FROM public.ecclesia_channels c
  WHERE c.id = channel_id AND public._can_consume_org_content(auth.uid(), c.organization_id)
));

CREATE POLICY ecclesia_subscriptions_delete ON public.ecclesia_subscriptions
FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public._ecclesia_sync_subscriber_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.ecclesia_channels SET subscriber_count = subscriber_count + 1 WHERE id = NEW.channel_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.ecclesia_channels SET subscriber_count = GREATEST(subscriber_count - 1, 0) WHERE id = OLD.channel_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._ecclesia_sync_subscriber_count() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ecclesia_subscriptions_sync_count ON public.ecclesia_subscriptions;
CREATE TRIGGER ecclesia_subscriptions_sync_count
AFTER INSERT OR DELETE ON public.ecclesia_subscriptions
FOR EACH ROW EXECUTE FUNCTION public._ecclesia_sync_subscriber_count();

-- ── ecclesia_watch_history ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ecclesia_watch_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.ecclesia_videos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_position integer NOT NULL DEFAULT 0 CHECK (last_position >= 0),
  watched_seconds integer NOT NULL DEFAULT 0 CHECK (watched_seconds >= 0),
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_ecclesia_watch_history UNIQUE (video_id, user_id)
);

ALTER TABLE public.ecclesia_watch_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY ecclesia_watch_history_select ON public.ecclesia_watch_history
FOR SELECT TO authenticated
USING (user_id = auth.uid());
-- Nenhuma policy de INSERT/UPDATE direta: só upsert_watch_history (RPC)
-- grava, garantindo view_count e watched_seconds nunca sejam manipulados
-- pelo cliente além do que a RPC permite.

CREATE OR REPLACE FUNCTION public.upsert_watch_history(
  p_video_id uuid,
  p_last_position integer,
  p_duration integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id uuid;
  v_was_new boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  SELECT organization_id INTO v_org_id FROM public.ecclesia_videos WHERE id = p_video_id;
  IF v_org_id IS NULL OR NOT public._can_consume_org_content(auth.uid(), v_org_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.ecclesia_watch_history (video_id, user_id, last_position, watched_seconds, completed, updated_at)
  VALUES (
    p_video_id, auth.uid(), GREATEST(p_last_position, 0), GREATEST(p_last_position, 0),
    p_duration IS NOT NULL AND p_last_position >= (p_duration - 5), now()
  )
  ON CONFLICT (video_id, user_id) DO UPDATE SET
    last_position = GREATEST(p_last_position, 0),
    watched_seconds = GREATEST(public.ecclesia_watch_history.watched_seconds, GREATEST(p_last_position, 0)),
    completed = public.ecclesia_watch_history.completed OR (p_duration IS NOT NULL AND p_last_position >= (p_duration - 5)),
    updated_at = now()
  RETURNING (xmax = 0) INTO v_was_new;

  IF v_was_new THEN
    UPDATE public.ecclesia_videos SET view_count = view_count + 1 WHERE id = p_video_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_watch_history(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_watch_history(uuid, integer, integer) TO authenticated;

-- ── ecclesia_video_playlists + ecclesia_playlist_items ──────────────────
CREATE TABLE IF NOT EXISTS public.ecclesia_video_playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.ecclesia_channels(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (btrim(title) <> ''),
  description text,
  thumbnail_url text,
  visibility text NOT NULL DEFAULT 'org_members' CHECK (visibility IN ('public', 'org_members', 'private')),
  video_count integer NOT NULL DEFAULT 0 CHECK (video_count >= 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecclesia_playlists_channel ON public.ecclesia_video_playlists (channel_id);

ALTER TABLE public.ecclesia_video_playlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY ecclesia_video_playlists_select ON public.ecclesia_video_playlists
FOR SELECT TO authenticated
USING (public._can_consume_org_content(auth.uid(), organization_id));

CREATE POLICY ecclesia_video_playlists_write ON public.ecclesia_video_playlists
FOR ALL TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'canal.manage'))
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'canal.manage'));

CREATE TABLE IF NOT EXISTS public.ecclesia_playlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES public.ecclesia_video_playlists(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.ecclesia_videos(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_ecclesia_playlist_items UNIQUE (playlist_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_ecclesia_playlist_items_playlist ON public.ecclesia_playlist_items (playlist_id, position);

ALTER TABLE public.ecclesia_playlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY ecclesia_playlist_items_select ON public.ecclesia_playlist_items
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.ecclesia_video_playlists pl
  WHERE pl.id = playlist_id AND public._can_consume_org_content(auth.uid(), pl.organization_id)
));

CREATE POLICY ecclesia_playlist_items_write ON public.ecclesia_playlist_items
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.ecclesia_video_playlists pl
  WHERE pl.id = playlist_id AND public.has_org_access_permission(auth.uid(), pl.organization_id, 'canal.manage')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.ecclesia_video_playlists pl
  WHERE pl.id = playlist_id AND public.has_org_access_permission(auth.uid(), pl.organization_id, 'canal.manage')
));

CREATE OR REPLACE FUNCTION public._ecclesia_sync_playlist_video_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.ecclesia_video_playlists SET video_count = video_count + 1 WHERE id = NEW.playlist_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.ecclesia_video_playlists SET video_count = GREATEST(video_count - 1, 0) WHERE id = OLD.playlist_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._ecclesia_sync_playlist_video_count() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ecclesia_playlist_items_sync_count ON public.ecclesia_playlist_items;
CREATE TRIGGER ecclesia_playlist_items_sync_count
AFTER INSERT OR DELETE ON public.ecclesia_playlist_items
FOR EACH ROW EXECUTE FUNCTION public._ecclesia_sync_playlist_video_count();

-- Também mantém ecclesia_channels.video_count coerente com vídeos 'ready'.
CREATE OR REPLACE FUNCTION public._ecclesia_sync_channel_video_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'ready' THEN
    UPDATE public.ecclesia_channels SET video_count = video_count + 1 WHERE id = NEW.channel_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'ready' AND OLD.status <> 'ready' THEN
      UPDATE public.ecclesia_channels SET video_count = video_count + 1 WHERE id = NEW.channel_id;
    ELSIF OLD.status = 'ready' AND NEW.status <> 'ready' THEN
      UPDATE public.ecclesia_channels SET video_count = GREATEST(video_count - 1, 0) WHERE id = NEW.channel_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._ecclesia_sync_channel_video_count() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ecclesia_videos_sync_channel_count ON public.ecclesia_videos;
CREATE TRIGGER ecclesia_videos_sync_channel_count
AFTER INSERT OR UPDATE OF status ON public.ecclesia_videos
FOR EACH ROW EXECUTE FUNCTION public._ecclesia_sync_channel_video_count();

-- ── Verificação final ────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.tv_channels') IS NULL THEN v_missing := array_append(v_missing, 'tv_channels'); END IF;
  IF to_regclass('public.tv_live_sessions') IS NULL THEN v_missing := array_append(v_missing, 'tv_live_sessions'); END IF;
  IF to_regclass('public.ecclesia_channels') IS NULL THEN v_missing := array_append(v_missing, 'ecclesia_channels'); END IF;
  IF to_regclass('public.ecclesia_videos') IS NULL THEN v_missing := array_append(v_missing, 'ecclesia_videos'); END IF;
  IF to_regprocedure('public.get_tv_schedule(uuid,timestamptz,integer)') IS NULL THEN v_missing := array_append(v_missing, 'get_tv_schedule'); END IF;
  IF to_regprocedure('public.get_current_tv_block(uuid,timestamptz)') IS NULL THEN v_missing := array_append(v_missing, 'get_current_tv_block'); END IF;
  IF to_regprocedure('public.track_tv_view_event(uuid,uuid,text,text,integer)') IS NULL THEN v_missing := array_append(v_missing, 'track_tv_view_event'); END IF;
  IF to_regprocedure('public.get_video_comments(uuid,integer,integer)') IS NULL THEN v_missing := array_append(v_missing, 'get_video_comments'); END IF;
  IF to_regprocedure('public.upsert_watch_history(uuid,integer,integer)') IS NULL THEN v_missing := array_append(v_missing, 'upsert_watch_history'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.access_responsibility_definitions WHERE responsibility_type = 'tv_manager') THEN
    v_missing := array_append(v_missing, 'access_responsibility_definitions.tv_manager');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.access_responsibility_definitions WHERE responsibility_type = 'tv_operator') THEN
    v_missing := array_append(v_missing, 'access_responsibility_definitions.tv_operator');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.access_responsibility_definitions WHERE responsibility_type = 'canal_manager') THEN
    v_missing := array_append(v_missing, 'access_responsibility_definitions.canal_manager');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.access_responsibility_definitions WHERE responsibility_type = 'canal_moderator') THEN
    v_missing := array_append(v_missing, 'access_responsibility_definitions.canal_moderator');
  END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'Migration tv_canal_foundation: itens ausentes apos criacao: %', array_to_string(v_missing, ', ');
  END IF;
  RAISE NOTICE 'Migration tv_canal_foundation: tabelas, RLS, RPCs e responsabilidades de TV Digital + Canal Eclesia confirmadas ✓';
END $$;

COMMIT;
