-- ============================================================
-- Migration: "Apagar conversa" (apagar para mim) no Chat interno.
-- Data: 2026-07-18
--
-- "Apagar para mim" deve ocultar a conversa somente para o usuário que
-- apagou, sem afetar os demais participantes nem as mensagens em si — por
-- isso é uma tabela de "ocultação por usuário", não um DELETE da thread ou
-- das mensagens (regra explícita da tarefa: não apagar mensagens dos
-- outros).
--
-- "Apagar para todos" (destruir a conversa/mensagens para todos os
-- participantes) NÃO foi implementado nesta migration: a tarefa exige que
-- essa ação só exista "com regra e permissão explícita", e não há hoje no
-- produto uma regra definida de quem pode fazer isso nem de como proteger
-- conversas institucionais obrigatórias. Implementar isso sem essa
-- definição seria arriscar perda de dados real. Ver relatório de entrega.
--
-- Idempotente e forward-only.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.internal_thread_hidden_for_user (
  thread_id uuid NOT NULL REFERENCES public.internal_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hidden_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

COMMENT ON TABLE public.internal_thread_hidden_for_user IS
  '"Apagar para mim" — oculta uma conversa apenas para o usuário que apagou. Não afeta outros participantes nem as mensagens.';

CREATE INDEX IF NOT EXISTS idx_internal_thread_hidden_for_user_user
  ON public.internal_thread_hidden_for_user (user_id);

ALTER TABLE public.internal_thread_hidden_for_user ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "internal thread hidden own select" ON public.internal_thread_hidden_for_user;
CREATE POLICY "internal thread hidden own select" ON public.internal_thread_hidden_for_user
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "internal thread hidden own insert" ON public.internal_thread_hidden_for_user;
CREATE POLICY "internal thread hidden own insert" ON public.internal_thread_hidden_for_user
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND public.can_read_internal_thread(auth.uid(), thread_id));

DROP POLICY IF EXISTS "internal thread hidden own delete" ON public.internal_thread_hidden_for_user;
CREATE POLICY "internal thread hidden own delete" ON public.internal_thread_hidden_for_user
FOR DELETE TO authenticated
USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.internal_thread_hidden_for_user TO authenticated;

-- ============================================================
-- Verificação final
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'internal_thread_hidden_for_user'
  ) THEN
    RAISE EXCEPTION 'internal_thread_hidden_for_user não foi criada';
  END IF;

  RAISE NOTICE 'Migration internal_threads hide-for-user: confirmado ✓';
END $$;
