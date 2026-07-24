-- ============================================================================
-- Migration: internal_chat_identity_hardening
-- Timestamp: 20260802090000
-- OPERAÇÃO ESPECIAL — Auditoria e conclusão de TV Digital, Canal Eclésia e
-- Ecclesia Chat / Login por telefone (Parte C — Ecclesia Chat)
-- ============================================================================
--
-- CONTEXTO (auditoria read-only desta operação):
--   1. `findOrCreateDirectThread()` (src/lib/internalMessageMutations.ts) só
--      deduplica no aplicativo (SELECT ... depois INSERT) — sem UNIQUE no
--      banco, uma corrida (duplo clique / retry) pode criar duas threads
--      'secretariat' para o mesmo par (organização, membro).
--   2. Não existe nenhuma proteção de banco contra uma thread "consigo
--      mesmo": nada impede member_id apontar para o mesmo members.user_id de
--      created_by numa thread source='secretariat'. Um bug real de frontend
--      (Congregacoes.tsx `openChatWithResponsible` → ChatSecretaria.tsx efeito
--      `openDm`) já passa auth.users.id no lugar de members.id — corrigido em
--      código nesta mesma operação, mas o banco não pode depender só disso.
--   3. O remetente de internal_messages já é validado no banco
--      (`internal messages thread insert` WITH CHECK sender_user_id =
--      auth.uid()) — não há regressão a corrigir aqui, apenas reforço da
--      identidade do PAR da conversa (thread), que é o que faltava.
--
-- ESTA MIGRATION:
--   * UNIQUE (organization_id, member_id) WHERE source = 'secretariat' — no
--     máximo uma thread direta por par (organização, membro), igual ao
--     contrato já documentado no comentário de findOrCreateDirectThread();
--   * trigger que rejeita, em qualquer INSERT/UPDATE de internal_threads,
--     uma thread source='secretariat' cujo member_id resolva para o MESMO
--     auth.users.id de created_by (auto-conversa via seletor administrativo);
--   * nenhuma alteração em internal_messages, RLS existente de envio, ou
--     qualquer política/trigger já aplicada por migrations anteriores.
--
-- Esta migration NÃO é aplicada. Não altera nenhuma outra tabela/módulo.
-- ============================================================================

BEGIN;

-- ── Preflight ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.internal_threads') IS NULL THEN
    v_missing := array_append(v_missing, 'public.internal_threads');
  END IF;
  IF to_regclass('public.members') IS NULL THEN
    v_missing := array_append(v_missing, 'public.members');
  END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'internal_chat_identity_hardening preflight failed; missing: %', array_to_string(v_missing, ', ');
  END IF;
END;
$$;

-- ── 1. No máximo uma thread direta (secretariat) por par (org, membro) ────
-- Mesma garantia que o código já tenta manter em app; agora também no banco,
-- para que uma corrida (duplo clique/retry) não crie duas conversas com a
-- mesma pessoa. Threads existentes duplicadas (se houver) NÃO são
-- apagadas/mescladas por esta migration — apenas passam a ser impedidas daqui
-- em diante; qualquer limpeza de dados históricos fica fora de escopo (nunca
-- exclusão automática de histórico de conversa).
DO $$
BEGIN
  IF EXISTS (
    SELECT organization_id, member_id
    FROM public.internal_threads
    WHERE source = 'secretariat' AND member_id IS NOT NULL
    GROUP BY organization_id, member_id
    HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'internal_chat_identity_hardening: já existem threads secretariat duplicadas para o mesmo par (organização, membro) — o índice único abaixo será criado apenas se o banco permitir (CREATE UNIQUE INDEX falhará explicitamente se houver duplicata, sem apagar nada silenciosamente).';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_internal_threads_secretariat_member
  ON public.internal_threads (organization_id, member_id)
  WHERE source = 'secretariat' AND member_id IS NOT NULL;

-- ── 2. Bloqueio de auto-conversa (thread consigo mesmo) ───────────────────
-- Nunca permite que uma thread source='secretariat' vincule member_id a uma
-- pessoa cujo members.user_id seja o mesmo auth.users.id de created_by. Isto
-- é a trava de banco para o bug de identidade (seletor administrativo
-- passando o próprio usuário como "membro" da conversa). "Mensagens salvas"
-- (conversa consigo mesmo autorizada) é um recurso futuro explícito, fora
-- desta operação — por isso o bloqueio aqui é incondicional para
-- source='secretariat'.
CREATE OR REPLACE FUNCTION public._internal_threads_reject_self_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member_user_id uuid;
BEGIN
  IF NEW.source = 'secretariat' AND NEW.member_id IS NOT NULL AND NEW.created_by IS NOT NULL THEN
    SELECT user_id INTO v_member_user_id
    FROM public.members
    WHERE id = NEW.member_id;

    IF v_member_user_id IS NOT NULL AND v_member_user_id = NEW.created_by THEN
      RAISE EXCEPTION 'self_thread_not_allowed: uma conversa direta não pode ter o membro selecionado igual ao usuário autenticado que a está criando';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._internal_threads_reject_self_conversation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS internal_threads_reject_self_conversation ON public.internal_threads;
CREATE TRIGGER internal_threads_reject_self_conversation
BEFORE INSERT OR UPDATE OF member_id, created_by, source ON public.internal_threads
FOR EACH ROW EXECUTE FUNCTION public._internal_threads_reject_self_conversation();

-- ── Verificação final ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uniq_internal_threads_secretariat_member'
  ) THEN
    RAISE EXCEPTION 'Migration internal_chat_identity_hardening: indice uniq_internal_threads_secretariat_member nao foi criado';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'internal_threads_reject_self_conversation'
  ) THEN
    RAISE EXCEPTION 'Migration internal_chat_identity_hardening: trigger internal_threads_reject_self_conversation nao foi criada';
  END IF;
  RAISE NOTICE 'Migration internal_chat_identity_hardening: unicidade de thread direta e bloqueio de auto-conversa confirmados ✓';
END $$;

COMMIT;
