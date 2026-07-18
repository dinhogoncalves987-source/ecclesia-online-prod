-- ============================================================
-- Migration: identificador seguro de sala de chamada (Jitsi).
-- Data: 2026-07-18
--
-- Antes, o nome da sala Jitsi era derivado apenas de organization_id +
-- thread_id (truncados) — determinístico e adivinhável por quem
-- conhecesse (ou soubesse o padrão de) esses IDs, já que meet.jit.si é
-- público e não há senha/JWT de sala.
--
-- Esta migration adiciona um token aleatório e imprevisível por thread
-- (call_room_token), gerado pelo Postgres (gen_random_uuid()), usado para
-- compor o nome da sala em vez dos IDs previsíveis. Como é persistido na
-- própria thread, os dois participantes continuam entrando na mesma sala.
--
-- Idempotente e forward-only.
-- ============================================================

ALTER TABLE public.internal_threads
  ADD COLUMN IF NOT EXISTS call_room_token uuid NOT NULL DEFAULT gen_random_uuid();

COMMENT ON COLUMN public.internal_threads.call_room_token IS
  'Token aleatório usado para compor o nome da sala Jitsi — evita salas previsíveis a partir do thread_id/organization_id.';

-- ============================================================
-- Verificação final
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'internal_threads' AND column_name = 'call_room_token'
  ) THEN
    RAISE EXCEPTION 'internal_threads.call_room_token não foi criada';
  END IF;

  RAISE NOTICE 'Migration internal_threads call_room_token: confirmado ✓';
END $$;
