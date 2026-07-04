-- =============================================================================
-- Ecclesia Chat Definitivo — Migração 3: Chamadas de Voz/Vídeo
-- =============================================================================
-- Cria tabela para rastrear chamadas de áudio/vídeo.
-- Suporta múltiplos providers: jitsi (provisório) e livekit (definitivo).
-- Feature flag VITE_CALL_PROVIDER controla qual provider é ativo.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.chat_calls (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id        uuid        REFERENCES public.internal_threads(id)  ON DELETE SET NULL,
  group_id         uuid        REFERENCES public.chat_groups(id)        ON DELETE SET NULL,
  organization_id  uuid        NOT NULL,
  initiated_by     uuid        NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  call_type        text        NOT NULL DEFAULT 'video'
    CHECK (call_type IN ('audio', 'video')),
  status           text        NOT NULL DEFAULT 'initiated'
    CHECK (status IN ('initiated', 'ringing', 'active', 'ended', 'missed', 'rejected', 'failed')),
  provider         text        NOT NULL DEFAULT 'jitsi'
    CHECK (provider IN ('jitsi', 'livekit', 'webrtc')),
  room_name        text,
  room_sid         text,
  livekit_token    text,
  jitsi_room_url   text,
  started_at       timestamptz,
  ended_at         timestamptz,
  duration_seconds integer,
  participants     jsonb       NOT NULL DEFAULT '[]',
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_calls_thread
  ON public.chat_calls (thread_id, created_at DESC)
  WHERE thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_calls_group
  ON public.chat_calls (group_id, created_at DESC)
  WHERE group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_calls_org_status
  ON public.chat_calls (organization_id, status, created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.chat_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_calls_select_participant"
  ON public.chat_calls FOR SELECT
  USING (
    initiated_by = auth.uid()
    OR (participants @> jsonb_build_array(auth.uid()::text))
    OR EXISTS (
      SELECT 1 FROM public.organization_users ou
      WHERE ou.organization_id = chat_calls.organization_id
        AND ou.user_id = auth.uid()
        AND ou.is_active = true
        AND ou.role IN ('church_admin', 'super_admin')
    )
  );

CREATE POLICY "chat_calls_insert_auth"
  ON public.chat_calls FOR INSERT
  WITH CHECK (initiated_by = auth.uid());

CREATE POLICY "chat_calls_update_participant"
  ON public.chat_calls FOR UPDATE
  USING (
    initiated_by = auth.uid()
    OR (participants @> jsonb_build_array(auth.uid()::text))
  );

-- ── Trigger updated_at ───────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_chat_calls_updated_at ON public.chat_calls;
CREATE TRIGGER trg_chat_calls_updated_at
  BEFORE UPDATE ON public.chat_calls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Publicar no Realtime ──────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_calls;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'chat_calls já está na publicação supabase_realtime.';
END $$;

-- ── Comentários ───────────────────────────────────────────────────────────────

COMMENT ON TABLE public.chat_calls IS
  'Registro de chamadas de áudio/vídeo. Provider: jitsi (atual provisório),
   livekit (definitivo quando VPS estiver pronta). Controlado via VITE_CALL_PROVIDER.';

COMMENT ON COLUMN public.chat_calls.participants IS
  'Array JSON de user_ids dos participantes da chamada.';

COMMENT ON COLUMN public.chat_calls.room_name IS
  'Nome único da sala (compartilhado entre os participantes).';

COMMENT ON COLUMN public.chat_calls.livekit_token IS
  'Token JWT para LiveKit (gerado pelo backend, nunca exposto via RLS pública).';
