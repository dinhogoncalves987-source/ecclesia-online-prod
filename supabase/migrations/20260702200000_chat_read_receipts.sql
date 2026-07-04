-- =============================================================================
-- Ecclesia Chat — Fase 2: Status de Leitura, Badges e Indicador Entregue/Lido
-- =============================================================================
-- Ambiente: TESTE apenas.
-- NÃO aplicar em produção sem revisão e aprovação explícita.
--
-- O que esta migration faz:
--   1. Cria tabela message_read_receipts (por mensagem por usuário)
--   2. Índices de performance
--   3. RLS segura (INSERT e SELECT por org/user)
--   4. RPC mark_thread_messages_read — marca lidas em lote, atualiza read_at
--   5. RPC get_unread_counts_by_org — contagem de não-lidas por thread
-- =============================================================================

-- ── 1. Tabela de confirmação de leitura por mensagem ─────────────────────────

CREATE TABLE IF NOT EXISTS public.message_read_receipts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      uuid        NOT NULL REFERENCES public.internal_messages(id) ON DELETE CASCADE,
  thread_id       uuid        NOT NULL REFERENCES public.internal_threads(id)  ON DELETE CASCADE,
  organization_id uuid        NOT NULL,
  user_id         uuid        NOT NULL REFERENCES auth.users(id)               ON DELETE CASCADE,
  read_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mrr_message_user_unique UNIQUE (message_id, user_id)
);

-- ── 2. Índices ────────────────────────────────────────────────────────────────

-- Busca rápida de "quais mensagens desta thread este usuário já leu"
CREATE INDEX IF NOT EXISTS idx_mrr_thread_user
  ON public.message_read_receipts (thread_id, user_id);

-- Busca rápida por mensagem (para listar quem leu uma mensagem)
CREATE INDEX IF NOT EXISTS idx_mrr_message
  ON public.message_read_receipts (message_id);

-- Busca por organização (usada no RPC de contagem)
CREATE INDEX IF NOT EXISTS idx_mrr_org_user
  ON public.message_read_receipts (organization_id, user_id);

-- ── 3. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.message_read_receipts ENABLE ROW LEVEL SECURITY;

-- Usuário registra a própria leitura
CREATE POLICY "mrr_insert_own"
  ON public.message_read_receipts
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Usuário lê recibos da própria organização
CREATE POLICY "mrr_select_org"
  ON public.message_read_receipts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_users ou
      WHERE ou.organization_id = message_read_receipts.organization_id
        AND ou.user_id = auth.uid()
        AND ou.is_active = true
    )
    OR
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.platform_role IN (
          'super_admin', 'platform_admin',
          'support_secretaria', 'support_financeiro'
        )
    )
  );

-- ── 4. RPC: mark_thread_messages_read ─────────────────────────────────────────
-- Marca todas as mensagens não-lidas de uma thread como lidas pelo usuário atual.
-- Também atualiza internal_messages.read_at na primeira leitura (para o ✓✓).
-- Retorna a quantidade de mensagens marcadas.

CREATE OR REPLACE FUNCTION public.mark_thread_messages_read(
  p_thread_id      uuid,
  p_organization_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id  uuid;
  v_count   integer := 0;
BEGIN
  -- Usuário deve estar autenticado
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Resolve organization_id
  IF p_organization_id IS NOT NULL THEN
    v_org_id := p_organization_id;
  ELSE
    SELECT organization_id INTO v_org_id
      FROM public.internal_threads
     WHERE id = p_thread_id
     LIMIT 1;
  END IF;

  IF v_org_id IS NULL THEN
    RETURN 0; -- thread não encontrada, ignorar silenciosamente
  END IF;

  -- Inserir recibos para mensagens ainda não lidas pelo usuário
  -- (ignora as próprias mensagens do usuário e mensagens de sistema/deletadas)
  INSERT INTO public.message_read_receipts (message_id, thread_id, organization_id, user_id, read_at)
  SELECT
    m.id,
    m.thread_id,
    v_org_id,
    v_user_id,
    now()
  FROM public.internal_messages m
  WHERE m.thread_id       = p_thread_id
    AND (m.sender_user_id IS NULL OR m.sender_user_id <> v_user_id)
    AND m.message_type NOT IN ('system', 'deleted')
    AND NOT EXISTS (
      SELECT 1
      FROM public.message_read_receipts r
      WHERE r.message_id = m.id
        AND r.user_id    = v_user_id
    )
  ON CONFLICT (message_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Atualizar read_at nas mensagens (primeira vez que alguém além do remetente lê)
  -- Isso alimenta o indicador ✓✓ no lado do remetente via Realtime.
  UPDATE public.internal_messages
     SET read_at = now()
   WHERE thread_id       = p_thread_id
     AND (sender_user_id IS NULL OR sender_user_id <> v_user_id)
     AND message_type NOT IN ('system', 'deleted')
     AND read_at IS NULL;

  RETURN v_count;
END;
$$;

-- ── 5. RPC: get_unread_counts_by_org ─────────────────────────────────────────
-- Retorna contagem de mensagens não-lidas por thread para o usuário atual,
-- dentro de uma organização.

CREATE OR REPLACE FUNCTION public.get_unread_counts_by_org(
  p_organization_id uuid
)
RETURNS TABLE (thread_id uuid, unread_count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.thread_id,
    count(*)::bigint AS unread_count
  FROM public.internal_messages m
  WHERE m.organization_id = p_organization_id
    AND (m.sender_user_id IS NULL OR m.sender_user_id <> auth.uid())
    AND m.message_type NOT IN ('system', 'deleted')
    AND NOT EXISTS (
      SELECT 1
      FROM public.message_read_receipts r
      WHERE r.message_id = m.id
        AND r.user_id    = auth.uid()
    )
  GROUP BY m.thread_id;
$$;

-- ── Comentários ───────────────────────────────────────────────────────────────

COMMENT ON TABLE public.message_read_receipts IS
  'Confirmação de leitura por mensagem por usuário.
   Alimenta: badge de não-lidas nas threads e indicador ✓✓ nas mensagens.';

COMMENT ON FUNCTION public.mark_thread_messages_read IS
  'Marca todas as mensagens não-lidas de uma thread como lidas pelo usuário atual.
   Atualiza internal_messages.read_at para o primeiro leitor (habilita indicador ✓✓).
   Retorna count de mensagens marcadas.';

COMMENT ON FUNCTION public.get_unread_counts_by_org IS
  'Retorna {thread_id, unread_count} para todas as threads com mensagens
   não-lidas pelo usuário atual dentro da organização dada.';
