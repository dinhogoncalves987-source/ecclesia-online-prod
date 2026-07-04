-- =============================================================================
-- Ecclesia Canal — Fase 2: Banco de Dados
-- =============================================================================
-- Plataforma de vídeos sob demanda (VOD) integrada à TV Digital.
-- Supabase: apenas metadados. Vídeos: Cloudflare R2 via URL assinada.
-- =============================================================================

-- ── 1. CANAIS DO ECCLESIA ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ecclesia_channels (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL,
  -- Dono do canal (admin que criou; pode ser null para canais da org)
  owner_user_id   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  name            text        NOT NULL,
  slug            text        NOT NULL,
  description     text,
  logo_url        text,
  banner_url      text,
  visibility      text        NOT NULL DEFAULT 'org_members'
    CHECK (visibility IN ('public', 'org_members', 'private')),
  status          text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  -- Contadores denormalizados (mantidos por triggers)
  subscriber_count integer    NOT NULL DEFAULT 0,
  video_count      integer    NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_ecclesia_channels_org
  ON public.ecclesia_channels (organization_id, status);

-- ── 2. VÍDEOS ─────────────────────────────────────────────────────────────────
-- Metadados apenas. O arquivo de vídeo fica no Cloudflare R2.
-- playback_url = URL pública do R2/CDN para reprodução direta (MP4 ou HLS).

CREATE TABLE IF NOT EXISTS public.ecclesia_videos (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id          uuid        NOT NULL REFERENCES public.ecclesia_channels(id) ON DELETE CASCADE,
  organization_id     uuid        NOT NULL,
  title               text        NOT NULL,
  description         text,
  category            text        NOT NULL DEFAULT 'general'
    CHECK (category IN ('culto', 'pregacao', 'louvor', 'estudo', 'infantil',
                        'jovens', 'mulheres', 'homens', 'missoes',
                        'testemunho', 'noticiario', 'general')),
  duration_seconds    integer,
  thumbnail_url       text,
  -- Cloudflare R2 — chave de armazenamento (gestão futura, revogação, etc.)
  r2_storage_key      text,
  -- URL para reprodução direta (MP4 do R2 ou manifesto HLS)
  playback_url        text,
  -- URL HLS separada (após transcodificação futura pelo FFmpeg/MediaMTX)
  hls_url             text,
  -- ── Integração TV Digital ────────────────────────────────────────────────
  -- Se este vídeo foi importado de uma transmissão ao vivo, referencia a sessão
  tv_live_session_id  uuid        REFERENCES public.tv_live_sessions(id) ON DELETE SET NULL,
  -- ─────────────────────────────────────────────────────────────────────────
  visibility          text        NOT NULL DEFAULT 'org_members'
    CHECK (visibility IN ('public', 'org_members', 'private')),
  status              text        NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'ready', 'failed', 'archived', 'draft')),
  uploaded_by         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Contadores denormalizados
  view_count          integer     NOT NULL DEFAULT 0,
  like_count          integer     NOT NULL DEFAULT 0,
  comment_count       integer     NOT NULL DEFAULT 0,
  published_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecclesia_videos_channel
  ON public.ecclesia_videos (channel_id, status, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_ecclesia_videos_org
  ON public.ecclesia_videos (organization_id, status);

-- ── 3. VISUALIZAÇÕES ─────────────────────────────────────────────────────────
-- Registra quanto cada usuário assistiu. UNIQUE por user + video (autenticado).

CREATE TABLE IF NOT EXISTS public.ecclesia_video_views (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id        uuid        NOT NULL REFERENCES public.ecclesia_videos(id) ON DELETE CASCADE,
  user_id         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Para viewers não autenticados
  anonymous_id    text,
  watched_seconds integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Único por user autenticado por vídeo
CREATE UNIQUE INDEX IF NOT EXISTS idx_ecclesia_video_views_user
  ON public.ecclesia_video_views (video_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ecclesia_video_views_video
  ON public.ecclesia_video_views (video_id);

-- ── 4. CURTIDAS ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ecclesia_video_likes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id   uuid        NOT NULL REFERENCES public.ecclesia_videos(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ecclesia_video_likes_video
  ON public.ecclesia_video_likes (video_id);

-- ── 5. COMENTÁRIOS ────────────────────────────────────────────────────────────
-- Suporte a threading de 2 níveis (comentário + respostas).

CREATE TABLE IF NOT EXISTS public.ecclesia_video_comments (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id          uuid        NOT NULL REFERENCES public.ecclesia_videos(id) ON DELETE CASCADE,
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- NULL = comentário raiz; preenchido = resposta a outro comentário
  parent_comment_id uuid        REFERENCES public.ecclesia_video_comments(id) ON DELETE CASCADE,
  body              text        NOT NULL CHECK (length(trim(body)) > 0),
  is_deleted        boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecclesia_comments_video
  ON public.ecclesia_video_comments (video_id, created_at)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_ecclesia_comments_parent
  ON public.ecclesia_video_comments (parent_comment_id)
  WHERE parent_comment_id IS NOT NULL;

-- ── 6. INSCRIÇÕES ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ecclesia_subscriptions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid        NOT NULL REFERENCES public.ecclesia_channels(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ecclesia_subscriptions_user
  ON public.ecclesia_subscriptions (user_id);

-- ── 7. HISTÓRICO DE ASSISTÊNCIA ───────────────────────────────────────────────
-- Grava last_position a cada ~30s. Permite retomar de onde parou.

CREATE TABLE IF NOT EXISTS public.ecclesia_watch_history (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id        uuid        NOT NULL REFERENCES public.ecclesia_videos(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  watched_seconds integer     NOT NULL DEFAULT 0,
  -- Posição em segundos onde o usuário parou (para resume)
  last_position   integer     NOT NULL DEFAULT 0,
  -- Marcado como true quando assistiu >= 90% do vídeo
  completed       boolean     NOT NULL DEFAULT false,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ecclesia_watch_history_user
  ON public.ecclesia_watch_history (user_id, updated_at DESC);

-- ── 8. PLAYLISTS ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ecclesia_video_playlists (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id      uuid        NOT NULL REFERENCES public.ecclesia_channels(id) ON DELETE CASCADE,
  organization_id uuid        NOT NULL,
  title           text        NOT NULL,
  description     text,
  thumbnail_url   text,
  visibility      text        NOT NULL DEFAULT 'org_members'
    CHECK (visibility IN ('public', 'org_members', 'private')),
  video_count     integer     NOT NULL DEFAULT 0,
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ecclesia_playlist_items (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid        NOT NULL REFERENCES public.ecclesia_video_playlists(id) ON DELETE CASCADE,
  video_id    uuid        NOT NULL REFERENCES public.ecclesia_videos(id) ON DELETE CASCADE,
  position    integer     NOT NULL DEFAULT 0,
  added_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (playlist_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_ecclesia_playlist_items
  ON public.ecclesia_playlist_items (playlist_id, position);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.ecclesia_channels          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecclesia_videos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecclesia_video_views       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecclesia_video_likes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecclesia_video_comments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecclesia_subscriptions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecclesia_watch_history     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecclesia_video_playlists   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecclesia_playlist_items    ENABLE ROW LEVEL SECURITY;

-- Helper: membro da organização (reutiliza is_tv_org_member se existir)
CREATE OR REPLACE FUNCTION public.is_canal_org_member(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
      AND is_active = true
  );
$$;

-- ecclesia_channels
CREATE POLICY "ec_channels_select" ON public.ecclesia_channels FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid() AND is_active = true)
    OR visibility = 'public'
  );
CREATE POLICY "ec_channels_insert" ON public.ecclesia_channels FOR INSERT
  WITH CHECK (public.is_canal_org_member(organization_id));
CREATE POLICY "ec_channels_update" ON public.ecclesia_channels FOR UPDATE
  USING (public.is_canal_org_member(organization_id));
CREATE POLICY "ec_channels_delete" ON public.ecclesia_channels FOR DELETE
  USING (public.is_canal_org_member(organization_id));

-- ecclesia_videos
CREATE POLICY "ec_videos_select" ON public.ecclesia_videos FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid() AND is_active = true)
    OR visibility = 'public'
  );
CREATE POLICY "ec_videos_insert" ON public.ecclesia_videos FOR INSERT
  WITH CHECK (public.is_canal_org_member(organization_id));
CREATE POLICY "ec_videos_update" ON public.ecclesia_videos FOR UPDATE
  USING (public.is_canal_org_member(organization_id));

-- ecclesia_video_views: qualquer autenticado pode inserir própria view
CREATE POLICY "ec_views_insert" ON public.ecclesia_video_views FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL OR anonymous_id IS NOT NULL);
CREATE POLICY "ec_views_select" ON public.ecclesia_video_views FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "ec_views_update" ON public.ecclesia_video_views FOR UPDATE
  USING (user_id = auth.uid());

-- ecclesia_video_likes
CREATE POLICY "ec_likes_select" ON public.ecclesia_video_likes FOR SELECT
  USING (true);
CREATE POLICY "ec_likes_insert" ON public.ecclesia_video_likes FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "ec_likes_delete" ON public.ecclesia_video_likes FOR DELETE
  USING (user_id = auth.uid());

-- ecclesia_video_comments
CREATE POLICY "ec_comments_select" ON public.ecclesia_video_comments FOR SELECT
  USING (true);
CREATE POLICY "ec_comments_insert" ON public.ecclesia_video_comments FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "ec_comments_update" ON public.ecclesia_video_comments FOR UPDATE
  USING (user_id = auth.uid());

-- ecclesia_subscriptions
CREATE POLICY "ec_subs_select"  ON public.ecclesia_subscriptions FOR SELECT  USING (true);
CREATE POLICY "ec_subs_insert"  ON public.ecclesia_subscriptions FOR INSERT  WITH CHECK (user_id = auth.uid());
CREATE POLICY "ec_subs_delete"  ON public.ecclesia_subscriptions FOR DELETE  USING (user_id = auth.uid());

-- ecclesia_watch_history
CREATE POLICY "ec_history_select" ON public.ecclesia_watch_history FOR SELECT  USING (user_id = auth.uid());
CREATE POLICY "ec_history_insert" ON public.ecclesia_watch_history FOR INSERT  WITH CHECK (user_id = auth.uid());
CREATE POLICY "ec_history_update" ON public.ecclesia_watch_history FOR UPDATE  USING (user_id = auth.uid());

-- ecclesia_video_playlists + items
CREATE POLICY "ec_playlists_select" ON public.ecclesia_video_playlists FOR SELECT
  USING (public.is_canal_org_member(organization_id) OR visibility = 'public');
CREATE POLICY "ec_playlists_insert" ON public.ecclesia_video_playlists FOR INSERT
  WITH CHECK (public.is_canal_org_member(organization_id));
CREATE POLICY "ec_playlists_update" ON public.ecclesia_video_playlists FOR UPDATE
  USING (public.is_canal_org_member(organization_id));
CREATE POLICY "ec_playlists_delete" ON public.ecclesia_video_playlists FOR DELETE
  USING (public.is_canal_org_member(organization_id));

CREATE POLICY "ec_playlist_items_select" ON public.ecclesia_playlist_items FOR SELECT USING (true);
CREATE POLICY "ec_playlist_items_insert" ON public.ecclesia_playlist_items FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "ec_playlist_items_delete" ON public.ecclesia_playlist_items FOR DELETE USING (auth.uid() IS NOT NULL);

-- ── Triggers: updated_at ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.canal_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  CREATE TRIGGER ec_channels_updated_at
    BEFORE UPDATE ON public.ecclesia_channels
    FOR EACH ROW EXECUTE FUNCTION public.canal_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER ec_videos_updated_at
    BEFORE UPDATE ON public.ecclesia_videos
    FOR EACH ROW EXECUTE FUNCTION public.canal_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER ec_comments_updated_at
    BEFORE UPDATE ON public.ecclesia_video_comments
    FOR EACH ROW EXECUTE FUNCTION public.canal_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Triggers: contadores denormalizados ───────────────────────────────────────

-- video_count no canal
CREATE OR REPLACE FUNCTION public.ec_update_channel_video_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'ready' THEN
    UPDATE public.ecclesia_channels SET video_count = video_count + 1 WHERE id = NEW.channel_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status != 'ready' AND NEW.status = 'ready' THEN
      UPDATE public.ecclesia_channels SET video_count = video_count + 1 WHERE id = NEW.channel_id;
    ELSIF OLD.status = 'ready' AND NEW.status != 'ready' THEN
      UPDATE public.ecclesia_channels SET video_count = GREATEST(0, video_count - 1) WHERE id = NEW.channel_id;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'ready' THEN
    UPDATE public.ecclesia_channels SET video_count = GREATEST(0, video_count - 1) WHERE id = OLD.channel_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER ec_video_count_trigger
    AFTER INSERT OR UPDATE OF status OR DELETE ON public.ecclesia_videos
    FOR EACH ROW EXECUTE FUNCTION public.ec_update_channel_video_count();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- subscriber_count no canal
CREATE OR REPLACE FUNCTION public.ec_update_subscriber_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.ecclesia_channels SET subscriber_count = subscriber_count + 1 WHERE id = NEW.channel_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.ecclesia_channels SET subscriber_count = GREATEST(0, subscriber_count - 1) WHERE id = OLD.channel_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER ec_subscriber_count_trigger
    AFTER INSERT OR DELETE ON public.ecclesia_subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.ec_update_subscriber_count();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- like_count no vídeo
CREATE OR REPLACE FUNCTION public.ec_update_like_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.ecclesia_videos SET like_count = like_count + 1 WHERE id = NEW.video_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.ecclesia_videos SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.video_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER ec_like_count_trigger
    AFTER INSERT OR DELETE ON public.ecclesia_video_likes
    FOR EACH ROW EXECUTE FUNCTION public.ec_update_like_count();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- comment_count no vídeo
CREATE OR REPLACE FUNCTION public.ec_update_comment_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NOT NEW.is_deleted THEN
    UPDATE public.ecclesia_videos SET comment_count = comment_count + 1 WHERE id = NEW.video_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.is_deleted = false AND NEW.is_deleted = true THEN
    UPDATE public.ecclesia_videos SET comment_count = GREATEST(0, comment_count - 1) WHERE id = NEW.video_id;
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER ec_comment_count_trigger
    AFTER INSERT OR UPDATE OF is_deleted ON public.ecclesia_video_comments
    FOR EACH ROW EXECUTE FUNCTION public.ec_update_comment_count();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Realtime ──────────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ecclesia_video_comments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ecclesia_videos;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RPC: Importar Transmissão da TV Digital → Canal Ecclesia ──────────────────
-- Pipeline: tv_live_sessions (gravada no R2) → ecclesia_videos
-- O admin chama esta função após uma transmissão ter sido gravada no R2.

CREATE OR REPLACE FUNCTION public.import_tv_session_to_canal(
  p_session_id  uuid,
  p_channel_id  uuid,
  p_title       text,
  p_category    text  DEFAULT 'culto',
  p_description text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session   record;
  v_channel   record;
  v_video_id  uuid;
BEGIN
  -- Buscar sessão da TV Digital
  SELECT * INTO v_session
  FROM public.tv_live_sessions
  WHERE id = p_session_id
    AND status_transmissao = 'ended';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sessão não encontrada ou ainda não encerrada.');
  END IF;

  IF v_session.r2_storage_key IS NULL AND v_session.hls_url IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sessão sem gravação disponível no R2.');
  END IF;

  -- Buscar canal destino
  SELECT * INTO v_channel FROM public.ecclesia_channels WHERE id = p_channel_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Canal não encontrado.');
  END IF;

  -- Verificar se já foi importada
  SELECT id INTO v_video_id
  FROM public.ecclesia_videos
  WHERE tv_live_session_id = p_session_id;

  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta transmissão já foi importada.', 'video_id', v_video_id);
  END IF;

  -- Criar o vídeo
  INSERT INTO public.ecclesia_videos (
    channel_id, organization_id, title, description, category,
    r2_storage_key, playback_url, hls_url,
    tv_live_session_id, status, visibility,
    uploaded_by, published_at
  ) VALUES (
    p_channel_id,
    v_channel.organization_id,
    p_title,
    COALESCE(p_description, 'Transmissão ao vivo importada da TV Digital Ecclesia.'),
    p_category,
    v_session.r2_storage_key,
    COALESCE(v_session.playback_url, v_session.hls_url),
    v_session.hls_url,
    p_session_id,
    CASE WHEN (v_session.r2_storage_key IS NOT NULL OR v_session.hls_url IS NOT NULL) THEN 'ready' ELSE 'processing' END,
    'org_members',
    auth.uid(),
    now()
  )
  RETURNING id INTO v_video_id;

  RETURN jsonb_build_object('ok', true, 'video_id', v_video_id);
END;
$$;

-- ── RPC: Buscar comentários com perfil do usuário ─────────────────────────────

CREATE OR REPLACE FUNCTION public.get_video_comments(
  p_video_id uuid,
  p_limit    integer DEFAULT 20,
  p_offset   integer DEFAULT 0
)
RETURNS TABLE (
  id                uuid,
  video_id          uuid,
  user_id           uuid,
  parent_comment_id uuid,
  body              text,
  is_deleted        boolean,
  created_at        timestamptz,
  user_name         text,
  user_avatar       text,
  reply_count       bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    c.id,
    c.video_id,
    c.user_id,
    c.parent_comment_id,
    CASE WHEN c.is_deleted THEN '[Comentário removido]' ELSE c.body END AS body,
    c.is_deleted,
    c.created_at,
    COALESCE(p.full_name, 'Usuário') AS user_name,
    p.avatar_url AS user_avatar,
    (SELECT count(*) FROM public.ecclesia_video_comments r
     WHERE r.parent_comment_id = c.id AND NOT r.is_deleted) AS reply_count
  FROM public.ecclesia_video_comments c
  LEFT JOIN public.profiles p ON p.user_id = c.user_id
  WHERE c.video_id = p_video_id
    AND c.parent_comment_id IS NULL
  ORDER BY c.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- ── RPC: Salvar posição no histórico de assistência ──────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_watch_history(
  p_video_id      uuid,
  p_last_position integer,
  p_duration      integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_completed boolean;
BEGIN
  v_completed := p_duration IS NOT NULL AND p_duration > 0
    AND p_last_position >= (p_duration * 0.9)::integer;

  INSERT INTO public.ecclesia_watch_history (
    video_id, user_id, last_position, watched_seconds, completed
  )
  VALUES (
    p_video_id, auth.uid(), p_last_position, p_last_position, v_completed
  )
  ON CONFLICT (video_id, user_id) DO UPDATE
    SET last_position   = EXCLUDED.last_position,
        watched_seconds = GREATEST(ecclesia_watch_history.watched_seconds, EXCLUDED.watched_seconds),
        completed       = EXCLUDED.completed OR ecclesia_watch_history.completed,
        updated_at      = now();

  -- Incrementar view_count apenas uma vez por usuário por vídeo
  INSERT INTO public.ecclesia_video_views (video_id, user_id, watched_seconds)
  VALUES (p_video_id, auth.uid(), p_last_position)
  ON CONFLICT (video_id, user_id) WHERE user_id IS NOT NULL
  DO UPDATE SET watched_seconds = GREATEST(
    ecclesia_video_views.watched_seconds,
    EXCLUDED.watched_seconds
  );
END;
$$;

-- ── Comentários ───────────────────────────────────────────────────────────────

COMMENT ON TABLE public.ecclesia_channels IS
  'Canais de vídeo do Ecclesia. Cada organização pode ter múltiplos canais.';

COMMENT ON TABLE public.ecclesia_videos IS
  'Vídeos do Canal Ecclesia. Metadados apenas — o arquivo fica no Cloudflare R2.
   tv_live_session_id: preenchido quando o vídeo foi importado da TV Digital.';

COMMENT ON FUNCTION public.import_tv_session_to_canal IS
  'Pipeline TV Digital → Canal Ecclesia: importa uma transmissão gravada (com r2_storage_key)
   para a tabela ecclesia_videos, criando um vídeo sob demanda diretamente.';

COMMENT ON FUNCTION public.upsert_watch_history IS
  'Salva posição de reprodução e marca como completo quando >= 90% assistido.
   Chamado pelo frontend a cada ~30s durante a reprodução.';
