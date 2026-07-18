-- ============================================================================
-- Migration: internal_chat_missing_authenticated_grants
-- Timestamp: 20260718120000
-- ============================================================================
--
-- OBJETIVO
-- Corrigir GRANT de nível de tabela ausente em produção para as 3 tabelas do
-- Chat interno (internal_threads, internal_messages,
-- internal_message_attachments): elas têm RLS habilitado e policies
-- corretas para "authenticated" (auditado em 20260609100000), mas nunca
-- receberam o GRANT de tabela correspondente — sem esse GRANT de base, o
-- Postgres bloqueia a consulta ANTES de avaliar qualquer policy de RLS
-- ("permission denied for table internal_messages"/"internal_threads"),
-- o que explica conversas vazias / falha ao enviar mensagem em produção
-- mesmo com todo o código de Realtime, status e presença corrigido.
--
-- Esta é uma versão restrita, escopada somente às 3 tabelas de Chat, da
-- correção mais amrpla registrada em 20260717180000_fix_missing_authenticated
-- _grants.sql (que cobre 43 tabelas mas está bloqueada em produção pelo seu
-- próprio preflight, porque public.administrative_requests tem uma policy
-- sem "TO authenticated" explícito — problema de um módulo fora do escopo
-- desta tarefa, Chat/Perfil/Chamadas). As 3 tabelas abaixo já têm policy
-- "TO authenticated" explícita, então o preflight desta migration passa
-- independente daquele outro problema.
--
-- ESCOPO
-- Esta migration NÃO cria tabela, NÃO altera nenhuma policy de RLS
-- existente, NÃO insere/atualiza/exclui dados, e NÃO concede nenhum
-- privilégio que não estivesse já implicitamente autorizado por uma policy
-- de RLS ativa para "authenticated" nestas 3 tabelas.
--
-- Idempotente e forward-only.
-- ============================================================================

BEGIN;

DO $internal_chat_grants$
DECLARE
  t                      record;
  v_tables_sem_grant_pos int;
BEGIN
  -- ── Preflight: cada tabela alvo precisa existir, ter RLS habilitado e ────
  -- ter ao menos uma policy para "authenticated" cobrindo SELECT (ou ALL).
  FOR t IN
    SELECT * FROM (VALUES
      ('internal_threads'), ('internal_messages'), ('internal_message_attachments')
    ) AS x(tbl)
  LOOP
    IF to_regclass('public.' || t.tbl) IS NULL THEN
      RAISE EXCEPTION 'Preflight: tabela public.% ausente — abortando sem conceder nenhum GRANT', t.tbl;
    END IF;

    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t.tbl)::regclass) THEN
      RAISE EXCEPTION 'Preflight: public.% não tem RLS habilitado — abortando sem conceder nenhum GRANT', t.tbl;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t.tbl
        AND 'authenticated' = ANY(roles)
        AND cmd IN ('SELECT', 'ALL')
    ) THEN
      RAISE EXCEPTION 'Preflight: public.% não tem policy de SELECT/ALL para authenticated — abortando sem conceder nenhum GRANT', t.tbl;
    END IF;
  END LOOP;

  -- ── GRANT: authenticated ganha exatamente SELECT/INSERT/UPDATE/DELETE, ────
  -- já limitado linha-a-linha pelas policies de RLS auditadas acima.
  GRANT SELECT, INSERT, UPDATE, DELETE ON
    public.internal_threads,
    public.internal_messages,
    public.internal_message_attachments
  TO authenticated;

  -- ── Verificação final ────────────────────────────────────────────────────
  SELECT count(*) INTO v_tables_sem_grant_pos
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relname IN ('internal_threads', 'internal_messages', 'internal_message_attachments')
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.role_table_grants g
      WHERE g.table_schema = 'public' AND g.table_name = c.relname
        AND g.grantee = 'authenticated' AND g.privilege_type = 'SELECT'
    );

  IF v_tables_sem_grant_pos <> 0 THEN
    RAISE EXCEPTION 'Verificação final: % tabela(s) de chat ainda sem GRANT SELECT para authenticated após a correção', v_tables_sem_grant_pos;
  END IF;

  RAISE NOTICE 'internal_chat_missing_authenticated_grants: GRANT concedido a authenticated em internal_threads/internal_messages/internal_message_attachments ✓';
END $internal_chat_grants$;

COMMIT;
