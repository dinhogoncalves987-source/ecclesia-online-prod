-- =============================================================================
-- FINANCE — EXCLUSÃO SEGURA DE IMPORTAÇÕES (FASE 1D-C2)
-- Migration: 20260814120000_finance_import_batch_deletion.sql
--
-- OBJETIVO:
--   Disponibilizar 2 RPCs SECURITY DEFINER para permitir, exclusivamente
--   pelo aplicativo (nunca por SQL manual), que uma organização:
--     1) exclua integralmente UMA importação financeira específica
--        (delete_finance_import_batch);
--     2) zere TODOS os dados importados do Financeiro da organização,
--        preservando lançamentos manuais, catálogos, contas, períodos e
--        configurações (reset_organization_finance_imports).
--
--   Nenhuma tabela, coluna, RLS policy ou função de permissão é inventada
--   aqui — ambas as RPCs reaproveitam exatamente o que já existe:
--     - public.is_org_finance_writer(uuid, uuid)      (permissão já usada em
--       toda RPC destrutiva de Financeiro, incl. DELETE de transactions);
--     - public.finance_import_batches                 (20260707100000);
--     - public.finance_import_batch_rows               (20260812180000);
--     - public.finance_transaction_audit_logs           (20260512100000);
--     - public.transactions.import_batch_id            (FK ON DELETE SET
--       NULL — por isso as transações do lote são apagadas explicitamente
--       aqui, nunca deixadas "órfãs" com import_batch_id nulo).
--
--   IDENTIFICAÇÃO DA ORGANIZAÇÃO ("atual/autorizada"):
--   O schema deste projeto NUNCA resolve "a organização atual" dentro do
--   banco — não existe coluna de "organização padrão" em profiles nem
--   função SQL equivalente (a org ativa é 100% uma escolha client-side,
--   persistida em localStorage — ver src/hooks/useChurch.tsx). Toda RPC
--   financeira existente (import_finance_transactions_bulk,
--   finalize_finance_import_batch) recebe a organização explicitamente e a
--   autoriza com is_org_finance_writer antes de agir — nunca infere. As 2
--   RPCs desta migration seguem exatamente o mesmo padrão:
--   reset_organization_finance_imports(p_organization_id uuid) recebe o id
--   explicitamente, mas NUNCA aceita esse valor como "arbitrário": só
--   executa depois de confirmar is_org_finance_writer(auth.uid(),
--   p_organization_id) para EXATAMENTE aquele id — nunca a primeira
--   organização do usuário, nunca uma inferida sem checagem.
--
-- ORDEM EXATA DE EXCLUSÃO (idêntica nas duas RPCs, por lote):
--   1) finance_transaction_audit_logs ligados diretamente às transações do
--      lote (transaction_id = ANY(...)) — seriam removidos de qualquer
--      forma pelo ON DELETE CASCADE ao apagar as transações no passo 3, mas
--      são apagados explicitamente aqui para contabilizar com precisão.
--   2) finance_import_batch_rows do lote (ON DELETE CASCADE ao apagar o
--      lote no passo 4, mas apagados explicitamente aqui pela mesma razão).
--   3) as próprias transactions do lote (import_batch_id = ANY(...)) —
--      NUNCA lançamentos manuais (origin='manual' nunca tem
--      import_batch_id preenchido) nem transações de outro lote.
--   4) o(s) finance_import_batches.
--
--   audit_finance_transaction_trigger grava, para cada transação apagada no
--   passo 3, um NOVO registro de auditoria da própria exclusão
--   (transaction_id fica NULL porque a linha já não existe mais — ver
--   20260513111500_fix_finance_delete_audit_fk.sql). Esse registro
--   "fantasma" documentaria apenas a remoção da importação em si; como o
--   contrato desta fase exige "auditorias correspondentes = 0" depois de
--   remover uma importação, cada RPC remove exatamente esses registros
--   depois do passo 3 — identificados sem ambiguidade pelo id ORIGINAL da
--   transação preservado dentro de old_data (nunca por uma janela de
--   tempo, nunca por heurística). Nenhum outro registro de auditoria (de
--   outra transação, de outro lote, de outra organização) é tocado. Nenhum
--   trigger, RLS ou auditoria é desabilitado — nem temporária nem
--   permanentemente.
--
-- SEGURANÇA:
--   - Ambas exigem auth.uid() (autenticação obrigatória).
--   - Ambas exigem is_org_finance_writer(auth.uid(), organização) — a
--     mesma permissão administrativa financeira já usada pela RLS de
--     DELETE em public.transactions.
--   - delete_finance_import_batch: lote inexistente OU de outra
--     organização levanta exatamente a MESMA excecão ('import batch not
--     found') — nunca revela se o lote existe em uma organização à qual o
--     chamador não tem acesso.
--   - reset_organization_finance_imports: nunca aceita p_organization_id
--     sem checagem; nunca toca em outra organização (todo DELETE é filtrado
--     por organization_id = p_organization_id ou por
--     import_batch_id/id = ANY(lotes daquela organização)).
--   - REVOKE ALL FROM PUBLIC, anon nas duas — anônimo nunca executa.
--   - GRANT EXECUTE apenas para authenticated e service_role.
--   - Qualquer erro (inclusive o guard_closed_finance_month_trigger
--     bloqueando a exclusão de uma transação em mês fechado) propaga sem
--     ser engolido — toda a transação SQL é revertida automaticamente
--     (rollback integral), nunca um "sucesso parcial".
--
-- REVISÃO HUMANA OBRIGATÓRIA antes de aplicar em produção.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- PREFLIGHT — exige que o schema financeiro/CONFIADCS já exista.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.finance_import_batches') IS NULL THEN
    RAISE EXCEPTION '1D-C2 preflight failed: finance_import_batches ausente — aplique 20260707100000 primeiro';
  END IF;
  IF to_regclass('public.finance_import_batch_rows') IS NULL THEN
    RAISE EXCEPTION '1D-C2 preflight failed: finance_import_batch_rows ausente — aplique 20260812180000 primeiro';
  END IF;
  IF to_regclass('public.finance_transaction_audit_logs') IS NULL THEN
    RAISE EXCEPTION '1D-C2 preflight failed: finance_transaction_audit_logs ausente — aplique 20260512100000 primeiro';
  END IF;
  IF to_regprocedure('public.is_org_finance_writer(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION '1D-C2 preflight failed: is_org_finance_writer ausente — permissão financeira já existente não encontrada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'import_batch_id'
  ) THEN
    RAISE EXCEPTION '1D-C2 preflight failed: transactions.import_batch_id ausente — aplique 20260707100000 primeiro';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 1: delete_finance_import_batch — exclui integralmente UM lote
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_finance_import_batch(
  p_batch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid;
  v_transaction_ids uuid[];
  v_transactions_removed integer := 0;
  v_audit_logs_removed integer := 0;
  v_delete_action_logs_removed integer := 0;
  v_batch_rows_removed integer := 0;
  v_batches_removed integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'import batch not found';
  END IF;

  SELECT organization_id INTO v_org
  FROM public.finance_import_batches
  WHERE id = p_batch_id;

  -- Lote inexistente OU de organização à qual o chamador não tem permissão
  -- administrativa financeira: MESMA mensagem genérica — nunca revela se o
  -- lote existe em outra organização.
  IF v_org IS NULL OR NOT public.is_org_finance_writer(auth.uid(), v_org) THEN
    RAISE EXCEPTION 'import batch not found';
  END IF;

  SELECT array_agg(id) INTO v_transaction_ids
  FROM public.transactions
  WHERE import_batch_id = p_batch_id;

  -- ── 1) Auditorias ligadas diretamente às transações do lote ───────────────
  IF v_transaction_ids IS NOT NULL THEN
    DELETE FROM public.finance_transaction_audit_logs
    WHERE transaction_id = ANY(v_transaction_ids);
    GET DIAGNOSTICS v_audit_logs_removed = ROW_COUNT;
  END IF;

  -- ── 2) Linhas auxiliares da importação (auditoria linha a linha) ──────────
  DELETE FROM public.finance_import_batch_rows
  WHERE import_batch_id = p_batch_id;
  GET DIAGNOSTICS v_batch_rows_removed = ROW_COUNT;

  -- ── 3) As próprias transações do lote — nunca manuais, nunca de outro lote
  IF v_transaction_ids IS NOT NULL THEN
    DELETE FROM public.transactions
    WHERE id = ANY(v_transaction_ids);
    GET DIAGNOSTICS v_transactions_removed = ROW_COUNT;

    -- Remove exatamente os registros "fantasma" de auditoria da própria
    -- exclusão (transaction_id NULL) gerados pelo passo acima — identificados
    -- sem ambiguidade pelo id original da transação preservado em old_data.
    DELETE FROM public.finance_transaction_audit_logs
    WHERE transaction_id IS NULL
      AND action = 'delete'
      AND organization_id = v_org
      AND (old_data->>'id')::uuid = ANY(v_transaction_ids);
    GET DIAGNOSTICS v_delete_action_logs_removed = ROW_COUNT;
  END IF;

  -- ── 4) O próprio lote ───────────────────────────────────────────────────────
  DELETE FROM public.finance_import_batches
  WHERE id = p_batch_id;
  GET DIAGNOSTICS v_batches_removed = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'batch_id', p_batch_id,
    'transactions_removed', v_transactions_removed,
    'audit_logs_removed', v_audit_logs_removed + v_delete_action_logs_removed,
    'batch_rows_removed', v_batch_rows_removed,
    'batches_removed', v_batches_removed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_finance_import_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_finance_import_batch(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.delete_finance_import_batch(uuid) IS
  'Exclui atomicamente UM lote de importação financeira: auditorias e '
  'linhas auxiliares dependentes, as transações originadas daquele lote e '
  'o próprio lote — nesta ordem. Nunca afeta lançamentos manuais nem '
  'transações de outro lote/organização. Exige autenticação e '
  'is_org_finance_writer sobre a organização do lote; lote inexistente ou '
  'de outra organização falha com a mesma mensagem genérica, sem revelar '
  'dados. Rollback integral automático em qualquer falha (inclusive mês '
  'financeiro fechado).';

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 2: reset_organization_finance_imports — zera TODAS as importações
-- de uma organização, preservando lançamentos manuais e catálogos.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reset_organization_finance_imports(
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch_ids uuid[];
  v_transaction_ids uuid[];
  v_transactions_removed integer := 0;
  v_audit_logs_removed integer := 0;
  v_delete_action_logs_removed integer := 0;
  v_batch_rows_removed integer := 0;
  v_batches_removed integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;
  -- Nunca aceita organization_id arbitrário: só executa depois de confirmar
  -- permissão administrativa financeira do chamador para EXATAMENTE esta
  -- organização — nunca a primeira organização do usuário, nunca inferida.
  IF NOT public.is_org_finance_writer(auth.uid(), p_organization_id) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  SELECT array_agg(id) INTO v_batch_ids
  FROM public.finance_import_batches
  WHERE organization_id = p_organization_id;

  -- Lançamentos manuais nunca têm import_batch_id preenchido — este filtro
  -- por import_batch_id (a única coluna que liga uma transaction a um lote)
  -- é o que garante que eles nunca são tocados por este reset.
  SELECT array_agg(t.id) INTO v_transaction_ids
  FROM public.transactions t
  WHERE t.organization_id = p_organization_id
    AND t.import_batch_id = ANY(COALESCE(v_batch_ids, ARRAY[]::uuid[]));

  -- ── 1) Auditorias ligadas diretamente às transações importadas ────────────
  IF v_transaction_ids IS NOT NULL THEN
    DELETE FROM public.finance_transaction_audit_logs
    WHERE transaction_id = ANY(v_transaction_ids);
    GET DIAGNOSTICS v_audit_logs_removed = ROW_COUNT;
  END IF;

  -- ── 2) Linhas auxiliares de todos os lotes da organização ──────────────────
  IF v_batch_ids IS NOT NULL THEN
    DELETE FROM public.finance_import_batch_rows
    WHERE import_batch_id = ANY(v_batch_ids);
    GET DIAGNOSTICS v_batch_rows_removed = ROW_COUNT;
  END IF;

  -- ── 3) As transações importadas — catálogos, contas, períodos, grupos,
  -- categorias, tipos documentais, campanhas, orçamento e patrimônio nunca
  -- são tocados por este reset (nenhum DELETE nesta função referencia essas
  -- tabelas).
  IF v_transaction_ids IS NOT NULL THEN
    DELETE FROM public.transactions
    WHERE id = ANY(v_transaction_ids);
    GET DIAGNOSTICS v_transactions_removed = ROW_COUNT;

    DELETE FROM public.finance_transaction_audit_logs
    WHERE transaction_id IS NULL
      AND action = 'delete'
      AND organization_id = p_organization_id
      AND (old_data->>'id')::uuid = ANY(v_transaction_ids);
    GET DIAGNOSTICS v_delete_action_logs_removed = ROW_COUNT;
  END IF;

  -- ── 4) Todos os lotes da organização ────────────────────────────────────────
  IF v_batch_ids IS NOT NULL THEN
    DELETE FROM public.finance_import_batches
    WHERE id = ANY(v_batch_ids);
    GET DIAGNOSTICS v_batches_removed = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'organization_id', p_organization_id,
    'transactions_removed', v_transactions_removed,
    'audit_logs_removed', v_audit_logs_removed + v_delete_action_logs_removed,
    'batch_rows_removed', v_batch_rows_removed,
    'batches_removed', v_batches_removed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reset_organization_finance_imports(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_organization_finance_imports(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.reset_organization_finance_imports(uuid) IS
  'Zera TODAS as importações financeiras (transações, auditorias e lotes) '
  'de UMA organização, preservando integralmente lançamentos manuais, '
  'catálogos financeiros (contas, períodos, grupos, categorias, tipos '
  'documentais), campanhas, orçamento, patrimônio, configurações e todas as '
  'demais organizações. Exige autenticação e is_org_finance_writer sobre '
  'p_organization_id — nunca aceito sem essa checagem. Execução atômica; '
  'rollback integral automático em qualquer falha.';

-- =============================================================================
-- FIM DA MIGRATION
-- Nome: 20260814120000_finance_import_batch_deletion.sql
-- Revisão humana obrigatória antes de aplicar em produção Supabase.
-- =============================================================================
