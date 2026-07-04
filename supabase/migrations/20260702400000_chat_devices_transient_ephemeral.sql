-- =============================================================================
-- Ecclesia Chat — Migração 5: Dispositivos, Mensagens Transitórias e Efêmeras
-- =============================================================================
-- Ajustes finais de arquitetura:
--   1. Renomear secret_message_events → transient_secret_messages
--      (fila temporária de transporte, não histórico)
--   2. Remover expires_at: remoção agora é IMEDIATA após entrega pelo destinatário
--   3. Adicionar política DELETE para o destinatário remover o envelope entregue
--   4. Criar tabela chat_devices (chaves ECDH por dispositivo, não em profiles)
--   5. Adicionar ephemeral_duration nas threads (mensagens temporárias — opt-in)
-- =============================================================================

-- ── 1. Renomear tabela ────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS public.secret_message_events
  RENAME TO transient_secret_messages;

-- ── 2. Remover expires_at (TTL fixo removido; remoção é imediata) ─────────────

ALTER TABLE public.transient_secret_messages
  DROP COLUMN IF EXISTS expires_at;

-- ── 3. Atualizar políticas RLS ────────────────────────────────────────────────
-- Políticas seguem o OID da tabela após rename, mas vamos recriar com nomes claros.

DROP POLICY IF EXISTS "sme_select_participant"   ON public.transient_secret_messages;
DROP POLICY IF EXISTS "sme_insert_sender"        ON public.transient_secret_messages;
DROP POLICY IF EXISTS "sme_update_recipient"     ON public.transient_secret_messages;
DROP POLICY IF EXISTS "tsm_select_participant"   ON public.transient_secret_messages;
DROP POLICY IF EXISTS "tsm_insert_sender"        ON public.transient_secret_messages;
DROP POLICY IF EXISTS "tsm_update_recipient"     ON public.transient_secret_messages;
DROP POLICY IF EXISTS "tsm_delete_participant"   ON public.transient_secret_messages;

CREATE POLICY "tsm_select_participant"
  ON public.transient_secret_messages FOR SELECT
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "tsm_insert_sender"
  ON public.transient_secret_messages FOR INSERT
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "tsm_update_recipient"
  ON public.transient_secret_messages FOR UPDATE
  USING (recipient_id = auth.uid());

-- NOVA: Permite ao destinatário (e remetente) deletar o envelope após entrega.
-- Isso é o mecanismo de remoção imediata — o servidor nunca mantém plaintext.
CREATE POLICY "tsm_delete_participant"
  ON public.transient_secret_messages FOR DELETE
  USING (recipient_id = auth.uid() OR sender_id = auth.uid());

-- ── 4. Recriar índices com nomes limpos ───────────────────────────────────────

DROP INDEX IF EXISTS public.idx_sme_thread_created;
DROP INDEX IF EXISTS public.idx_sme_recipient_undelivered;
DROP INDEX IF EXISTS public.idx_sme_expires;

CREATE INDEX IF NOT EXISTS idx_tsm_thread_created
  ON public.transient_secret_messages (thread_id, created_at DESC);

-- Índice principal: busca de envelopes pendentes por destinatário
CREATE INDEX IF NOT EXISTS idx_tsm_recipient_pending
  ON public.transient_secret_messages (recipient_id, created_at)
  WHERE delivered_at IS NULL;

-- ── 5. Atualizar função de limpeza ────────────────────────────────────────────
-- Agora remove apenas envelopes NUNCA entregues após p_days dias (default: 30).
-- Envelopes entregues são deletados imediatamente pelo cliente após descriptografar.

CREATE OR REPLACE FUNCTION public.cleanup_stale_undelivered_secrets(
  p_days integer DEFAULT 30
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_count integer;
BEGIN
  DELETE FROM public.transient_secret_messages
  WHERE delivered_at IS NULL
    AND created_at < now() - (p_days || ' days')::interval;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Alias de compatibilidade para a função antiga
CREATE OR REPLACE FUNCTION public.cleanup_expired_secret_messages()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN public.cleanup_stale_undelivered_secrets(30);
END;
$$;

-- ── 6. Publicar tabela renomeada no Realtime ──────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.secret_message_events;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.transient_secret_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 7. Criar tabela chat_devices ──────────────────────────────────────────────
-- Chave ECDH por dispositivo (arquitetura definitiva para multi-device E2EE).
-- profiles.public_key_ecdh é mantido como fallback temporário de compatibilidade.
-- Chave PRIVADA: JAMAIS sai do dispositivo. Fica em IndexedDB/localForage.

CREATE TABLE IF NOT EXISTS public.chat_devices (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- device_id gerado pelo cliente (UUID persistido em localStorage)
  device_id       text        NOT NULL,
  -- Chave pública SPKI base64 — pode ser compartilhada com participantes
  public_key_ecdh text        NOT NULL,
  key_algorithm   text        NOT NULL DEFAULT 'ECDH-P-256',
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz,
  -- Preenchido quando o dispositivo é revogado (troca de aparelho, etc.)
  revoked_at      timestamptz,
  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_devices_user_active
  ON public.chat_devices (user_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;

ALTER TABLE public.chat_devices ENABLE ROW LEVEL SECURITY;

-- Usuário vê seus próprios dispositivos + dispositivos de parceiros de conversa secreta
CREATE POLICY "chat_devices_select"
  ON public.chat_devices FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.secret_threads st
      WHERE (st.participant_a = auth.uid() OR st.participant_b = auth.uid())
        AND (st.participant_a = chat_devices.user_id OR st.participant_b = chat_devices.user_id)
    )
  );

CREATE POLICY "chat_devices_insert_own"
  ON public.chat_devices FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "chat_devices_update_own"
  ON public.chat_devices FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "chat_devices_delete_own"
  ON public.chat_devices FOR DELETE
  USING (user_id = auth.uid());

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_devices;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 8. Adicionar ephemeral_duration nas threads ────────────────────────────────
-- Mensagens temporárias são opt-in e independentes do E2EE.
-- NULL = desativado; número = duração em segundos.
-- Valores: 86400 (24h), 604800 (7d), 2592000 (30d), 7776000 (90d).

ALTER TABLE public.internal_threads
  ADD COLUMN IF NOT EXISTS ephemeral_duration integer;

ALTER TABLE public.secret_threads
  ADD COLUMN IF NOT EXISTS ephemeral_duration integer;

-- ── Comentários ───────────────────────────────────────────────────────────────

COMMENT ON TABLE public.transient_secret_messages IS
  'Fila de transporte para mensagens E2EE. Envelope é opaco ao servidor.
   REGRA: Deletar imediatamente após o destinatário descriptografar com sucesso.
   Para destinatários offline: envelope permanece pendente até reconexão.
   Limpeza de envelopes órfãos: cleanup_stale_undelivered_secrets(p_days).
   Jamais armazenar plaintext nesta tabela.';

COMMENT ON TABLE public.chat_devices IS
  'Dispositivos registrados para E2EE por usuário.
   Chave PÚBLICA (public_key_ecdh): compartilhada com parceiros de conversa.
   Chave PRIVADA: SOMENTE no dispositivo (IndexedDB). NUNCA sai do aparelho.
   revoked_at: preenchido quando dispositivo é desautorizado.';

COMMENT ON COLUMN public.internal_threads.ephemeral_duration IS
  'Duração das mensagens temporárias em segundos (opt-in). NULL = desativado.
   Qualquer participante pode ativar/alterar (comportamento WhatsApp).
   Aplica-se APENAS a novas mensagens após ativação.';

COMMENT ON COLUMN public.secret_threads.ephemeral_duration IS
  'Duração das mensagens temporárias em segundos (opt-in). NULL = desativado.
   Independente do E2EE — são recursos separados.
   Expiração remove do armazenamento local (IndexedDB).';
