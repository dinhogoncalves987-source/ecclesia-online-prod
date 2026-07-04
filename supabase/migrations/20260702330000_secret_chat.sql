-- =============================================================================
-- Ecclesia Chat Definitivo — Migração 4: Conversas Secretas (E2EE)
-- =============================================================================
-- Cria estrutura para conversas criptografadas ponta a ponta.
-- O servidor é apenas transporte — nunca armazena o conteúdo em plaintext.
-- Implementação: ECDH P-256 + AES-GCM 256.
-- Chaves privadas ficam SOMENTE no dispositivo do usuário (IndexedDB).
-- =============================================================================

-- ── Threads de conversas secretas ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.secret_threads (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid,
  participant_a    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_b    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participant_a, participant_b),
  -- Garantir que participant_a < participant_b (normalização do par)
  CHECK (participant_a < participant_b)
);

CREATE INDEX IF NOT EXISTS idx_secret_threads_participants
  ON public.secret_threads (participant_a, participant_b);

CREATE INDEX IF NOT EXISTS idx_secret_threads_user_a
  ON public.secret_threads (participant_a);

CREATE INDEX IF NOT EXISTS idx_secret_threads_user_b
  ON public.secret_threads (participant_b);

-- ── Eventos de mensagens secretas ────────────────────────────────────────────
-- Armazena payload CIFRADO temporariamente para entrega.
-- Após entrega confirmada (delivered_at IS NOT NULL), pode ser removido via cron.
-- TTL padrão: 7 dias (expires_at).
-- O conteúdo do campo encrypted_payload é opaco ao servidor.

CREATE TABLE IF NOT EXISTS public.secret_message_events (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id         uuid        NOT NULL REFERENCES public.secret_threads(id) ON DELETE CASCADE,
  sender_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Payload cifrado: { iv: base64, data: base64 } — servidor não pode decifrar
  encrypted_payload text        NOT NULL,
  message_type      text        NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'image', 'audio', 'video', 'document', 'deleted')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  delivered_at      timestamptz,
  expires_at        timestamptz NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_sme_thread_created
  ON public.secret_message_events (thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sme_recipient_undelivered
  ON public.secret_message_events (recipient_id, delivered_at)
  WHERE delivered_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sme_expires
  ON public.secret_message_events (expires_at)
  WHERE delivered_at IS NOT NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.secret_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secret_message_events ENABLE ROW LEVEL SECURITY;

-- Apenas os dois participantes podem ver a thread
CREATE POLICY "secret_threads_select_participant"
  ON public.secret_threads FOR SELECT
  USING (participant_a = auth.uid() OR participant_b = auth.uid());

CREATE POLICY "secret_threads_insert_participant"
  ON public.secret_threads FOR INSERT
  WITH CHECK (participant_a = auth.uid() OR participant_b = auth.uid());

-- Apenas remetente ou destinatário podem ver o evento
CREATE POLICY "sme_select_participant"
  ON public.secret_message_events FOR SELECT
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

-- Apenas o remetente pode inserir
CREATE POLICY "sme_insert_sender"
  ON public.secret_message_events FOR INSERT
  WITH CHECK (sender_id = auth.uid());

-- Destinatário pode marcar como entregue (UPDATE delivered_at)
CREATE POLICY "sme_update_recipient"
  ON public.secret_message_events FOR UPDATE
  USING (recipient_id = auth.uid() OR sender_id = auth.uid());

-- ── Publicar threads e eventos no Realtime ────────────────────────────────────
-- Necessário para que o destinatário receba mensagens em tempo real.

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.secret_threads;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.secret_message_events;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Limpeza automática de payloads expirados ──────────────────────────────────
-- Função chamada via pg_cron ou Supabase Edge Function scheduled.

CREATE OR REPLACE FUNCTION public.cleanup_expired_secret_messages()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_count integer;
BEGIN
  DELETE FROM public.secret_message_events
  WHERE expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── Comentários ───────────────────────────────────────────────────────────────

COMMENT ON TABLE public.secret_threads IS
  'Threads de conversas secretas E2EE. Par normalizado: participant_a < participant_b (UUID sort).
   O servidor não armazena plaintext — apenas metadados de existência da conversa.';

COMMENT ON TABLE public.secret_message_events IS
  'Envelopes temporários de mensagens cifradas. encrypted_payload é opaco ao servidor.
   Após entrega, o payload não é mais necessário. TTL = 7 dias por padrão.
   Criptografia: ECDH P-256 (troca de chaves) + AES-GCM 256 (cifragem do conteúdo).';

COMMENT ON COLUMN public.secret_message_events.encrypted_payload IS
  'JSON cifrado: { iv: "<base64>", data: "<base64>" }.
   NUNCA descriptografar no servidor. O servidor é apenas um canal de transporte.';
