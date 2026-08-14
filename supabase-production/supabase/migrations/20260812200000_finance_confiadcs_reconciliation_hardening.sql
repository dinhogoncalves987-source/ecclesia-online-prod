-- =============================================================================
-- FINANCE CONFIADCS — ENDURECIMENTO DA RECONCILIAÇÃO (FASE 1D-B1.1)
-- Migration: 20260812200000_finance_confiadcs_reconciliation_hardening.sql
--
-- OBJETIVO:
--   Fechar os bloqueios identificados na revisão da FASE 1D-B1:
--
--   1) "Sucesso parcial" deixa de existir como categoria implícita. Uma linha
--      persistida com pendência de catálogo NUNCA conta como reconciliada.
--      finance_import_batch_rows.status passa a distinguir 5 estados finais,
--      nunca um sexto "meio-termo":
--        - persisted_reconciled  (persistida, ZERO pendência de catálogo)
--        - persisted_pending     (persistida, mas com >=1 pendência de catálogo)
--        - duplicate             (legacy_record_number já importado)
--        - excluded_invalid      (falha de validação de negócio — dado ruim)
--        - failed                (erro inesperado do sistema, nunca "engolido")
--
--   2) "TODAS" (campo CONGREGAÇÃO - ORIGEM 2) é reconhecida como opção
--      OPERACIONAL — nunca uma congregação real, nunca uma pendência de
--      reconciliação. finance_import_catalog_aliases.resolution ganha o
--      valor 'operational' para essa distinção ficar auditável.
--
--   3) finalize_finance_import_batch() é reescrita para NUNCA aceitar valores
--      esperados vindos do cliente — os totais oficiais da planilha
--      CONFIADCS1-2-26 (29.957 lançamentos, 14.908 entradas, 15.049 saídas,
--      R$ 10.655.451,68 / R$ 23.962.542,86, 01/11/2024–11/08/2026) ficam
--      embutidos como constantes na própria função, e todo valor comparado é
--      recalculado a partir do que está de fato persistido em
--      public.transactions / finance_import_batch_rows — nunca do que o
--      chamador afirma. Só marca reconciled=true quando lidas=processadas E
--      todas as 12 condições do contrato batem exatamente.
--
--      Como o frontend ainda cria um lote por chamada de RPC (limite de 1000
--      linhas), a função agrega TODOS os lotes de source_type='confiadcs' da
--      mesma organização — não apenas o lote informado — para que o total de
--      29.957 possa ser verificado mesmo com múltiplas chamadas em partes.
--
-- SEGURANÇA:
--   Idempotente. DROP FUNCTION explícito onde a assinatura muda (mesmo
--   padrão já usado em 20260812190000). Nenhuma tabela é destruída, nenhuma
--   coluna é removida, nenhum dado é apagado.
--
-- REVISÃO HUMANA OBRIGATÓRIA antes de aplicar em produção.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- PREFLIGHT — exige que as migrations da FASE 1D-B1 já tenham sido aplicadas.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.finance_import_batch_rows') IS NULL THEN
    RAISE EXCEPTION '1D-B1.1 preflight failed: finance_import_batch_rows ausente — aplique 20260812180000 primeiro';
  END IF;
  IF to_regprocedure('public.import_finance_transactions_bulk(jsonb, uuid)') IS NULL THEN
    RAISE EXCEPTION '1D-B1.1 preflight failed: RPC de importação da FASE 1D-B1 ausente — aplique 20260812190000 primeiro';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 1: finance_import_batches — novos contadores (reconciliado vs.
-- pendente deixam de ser somados silenciosamente em "persisted").
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.finance_import_batches
  ADD COLUMN IF NOT EXISTS rows_persisted_reconciled integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rows_persisted_pending    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rows_failed               integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.finance_import_batches.rows_persisted_reconciled IS
  'Linhas persistidas SEM nenhuma pendência de catálogo — únicas que contam '
  'para o total de "lançamentos reconciliados" exigido por finalize_finance_import_batch.';
COMMENT ON COLUMN public.finance_import_batches.rows_persisted_pending IS
  'Linhas persistidas COM ao menos uma pendência de catálogo (FK nula com '
  'motivo registrado em finance_import_catalog_aliases). Nunca contam como '
  'sucesso pleno — bloqueiam reconciled=true até resolução manual.';
COMMENT ON COLUMN public.finance_import_batches.rows_failed IS
  'Linhas que geraram erro INESPERADO do sistema (não uma falha de validação '
  'de negócio conhecida) — nunca silenciadas, sempre contadas separadamente '
  'de excluded_invalid.';

-- rows_persisted (coluna da FASE 1D-B1) é preservada como soma agregada
-- (reconciled + pending) para compatibilidade com leitores existentes.

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 2: finance_import_batch_rows.status — 5 estados finais explícitos
-- ─────────────────────────────────────────────────────────────────────────────

-- Migra dados de um eventual estado anterior (status='persisted' genérico)
-- antes de endurecer a constraint — nunca deixa linha antiga órfã de status.
UPDATE public.finance_import_batch_rows
SET status = 'persisted_reconciled'
WHERE status = 'persisted';

ALTER TABLE public.finance_import_batch_rows
  DROP CONSTRAINT IF EXISTS finance_import_batch_rows_status_check;
ALTER TABLE public.finance_import_batch_rows
  ADD CONSTRAINT finance_import_batch_rows_status_check
  CHECK (status IN ('persisted_reconciled', 'persisted_pending', 'duplicate', 'excluded_invalid', 'failed'));

COMMENT ON COLUMN public.finance_import_batch_rows.status IS
  'Estado final da linha — exatamente um dos 5 valores, nunca um "sucesso '
  'parcial" implícito: persisted_reconciled (zero pendência), '
  'persisted_pending (persistida mas com pendência de catálogo — não conta '
  'como reconciliada), duplicate (legacy_record_number repetido), '
  'excluded_invalid (falha de validação de negócio), failed (erro inesperado).';

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 3: finance_import_catalog_aliases.resolution — adiciona 'operational'
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.finance_import_catalog_aliases
  DROP CONSTRAINT IF EXISTS finance_import_catalog_aliases_resolution_check;
ALTER TABLE public.finance_import_catalog_aliases
  ADD CONSTRAINT finance_import_catalog_aliases_resolution_check
  CHECK (resolution IN ('auto_exact', 'manual', 'pending', 'operational', 'historical_preserved'));

COMMENT ON COLUMN public.finance_import_catalog_aliases.resolution IS
  'auto_exact = correspondência determinística encontrada; manual = decidida '
  'por humano; pending = sem correspondência, aguardando decisão; '
  'operational = rótulo que NÃO é uma pendência por design (ex.: "TODAS" em '
  'CONGREGAÇÃO - ORIGEM 2 significa "aplica-se a todas", não uma congregação '
  'desconhecida) — nunca bloqueia reconciled=true; historical_preserved = '
  'rótulo histórico sem QUALQUER destino atual comprovado (investigado e '
  'confirmado pela própria planilha, ex.: DALLAGNOL, LOT RECH) — o texto é '
  'preservado integralmente, nenhuma correspondência é inventada, e a linha '
  'conta como reconciliada (nunca como pendência) — decisão humana final '
  'registrada na FASE B1.2 "CORREÇÃO FINAL DIRETA".';

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 4: _finance_upsert_catalog_alias — ganha parâmetros p_operational e
-- p_historical_preserved
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public._finance_upsert_catalog_alias(uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public._finance_upsert_catalog_alias(uuid, text, text, uuid, boolean);

CREATE OR REPLACE FUNCTION public._finance_upsert_catalog_alias(
  p_organization_id uuid,
  p_catalog_type text,
  p_raw_label text,
  p_resolved_id uuid,
  p_operational boolean DEFAULT false,
  p_historical_preserved boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_label text := NULLIF(btrim(p_raw_label), '');
  v_resolution text;
BEGIN
  IF v_label IS NULL THEN
    RETURN;
  END IF;

  v_resolution := CASE
    WHEN p_resolved_id IS NOT NULL THEN 'auto_exact'
    WHEN p_operational THEN 'operational'
    WHEN p_historical_preserved THEN 'historical_preserved'
    ELSE 'pending'
  END;

  INSERT INTO public.finance_import_catalog_aliases (
    organization_id, catalog_type, raw_label, normalized_label, resolved_id, resolution
  ) VALUES (
    p_organization_id, p_catalog_type, v_label,
    public._finance_normalize_catalog_label(v_label),
    p_resolved_id, v_resolution
  )
  ON CONFLICT (organization_id, catalog_type, raw_label) DO UPDATE SET
    resolved_id = CASE
      WHEN public.finance_import_catalog_aliases.resolution = 'manual'
        THEN public.finance_import_catalog_aliases.resolved_id
      ELSE COALESCE(EXCLUDED.resolved_id, public.finance_import_catalog_aliases.resolved_id)
    END,
    resolution = CASE
      WHEN public.finance_import_catalog_aliases.resolution = 'manual' THEN 'manual'
      WHEN EXCLUDED.resolved_id IS NOT NULL THEN 'auto_exact'
      WHEN EXCLUDED.resolution = 'operational' THEN 'operational'
      WHEN EXCLUDED.resolution = 'historical_preserved' THEN 'historical_preserved'
      ELSE public.finance_import_catalog_aliases.resolution
    END,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public._finance_upsert_catalog_alias(uuid, text, text, uuid, boolean, boolean)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._finance_upsert_catalog_alias(uuid, text, text, uuid, boolean, boolean) IS
  'Uso interno da RPC de importação. p_operational=true (ex.: congregação '
  '"TODAS") grava resolution=operational em vez de pending; '
  'p_historical_preserved=true (ex.: DALLAGNOL, LOT RECH) grava '
  'resolution=historical_preserved — nenhum dos dois é sobrescrito por uma '
  'resolução manual pré-existente nem sobrescreve uma.';

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 5: import_finance_transactions_bulk — status de 5 estados + TODAS
-- Mesma assinatura pública (jsonb, uuid) — CREATE OR REPLACE é suficiente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.import_finance_transactions_bulk(
  p_rows jsonb,
  p_import_batch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row jsonb;
  v_org uuid;
  v_date date;
  v_account_category_id uuid;
  v_financial_account_id uuid;
  v_cost_center_id uuid;
  v_accounting_group_id uuid;
  v_document_type_id uuid;
  v_congregation_id uuid;
  v_district_id uuid;
  v_congregation_raw text;
  v_is_operational_congregation boolean;
  v_is_historical_preserved_district boolean;
  v_is_historical_preserved_congregation boolean;
  v_is_historical_preserved_account_category boolean;
  v_period_label text;
  v_period_id uuid;
  v_raw_timestamp timestamptz;
  v_persisted_reconciled integer := 0;
  v_persisted_pending integer := 0;
  v_duplicate integer := 0;
  v_excluded_invalid integer := 0;
  v_failed integer := 0;
  v_skipped_closed_month integer := 0;
  v_row_index integer := 0;
  v_checked_orgs uuid[] := ARRAY[]::uuid[];
  v_errors jsonb := '[]'::jsonb;
  v_batch_id uuid;
  v_batch_org uuid;
  v_transaction_id uuid;
  v_pending_fields jsonb;
  v_row_status text;
  v_constraint_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Autenticação obrigatória.');
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object('error', 'p_rows deve ser um array JSON.');
  END IF;
  IF jsonb_array_length(p_rows) > 1000 THEN
    RETURN jsonb_build_object('error', 'O lote excede o limite de 1000 lançamentos.');
  END IF;
  IF jsonb_array_length(p_rows) = 0 THEN
    RETURN jsonb_build_object(
      'inserted', 0, 'persisted_reconciled', 0, 'persisted_pending', 0,
      'duplicate', 0, 'excluded_invalid', 0, 'failed', 0,
      'skipped_closed_month', 0, 'pending_reconciliation_rows', 0,
      'batch_id', p_import_batch_id, 'errors', NULL
    );
  END IF;

  -- ── Resolve/valida o lote de importação (reconciliação por lote) ───────────
  IF p_import_batch_id IS NOT NULL THEN
    SELECT organization_id INTO v_batch_org
    FROM public.finance_import_batches
    WHERE id = p_import_batch_id;

    IF v_batch_org IS NULL THEN
      RETURN jsonb_build_object('error', 'Lote de importação informado não existe.');
    END IF;
    IF NOT public.is_org_finance_writer(auth.uid(), v_batch_org) THEN
      RETURN jsonb_build_object('error', 'Sem permissão de tesouraria para este lote.');
    END IF;
    v_batch_id := p_import_batch_id;
  ELSE
    v_batch_org := (p_rows->0->>'organization_id')::uuid;
    IF v_batch_org IS NULL OR NOT public.is_org_finance_writer(auth.uid(), v_batch_org) THEN
      RETURN jsonb_build_object('error', 'Sem permissão de tesouraria para esta organização.');
    END IF;
    INSERT INTO public.finance_import_batches (
      organization_id, source_type, status, created_by, total_rows
    ) VALUES (
      v_batch_org, 'confiadcs', 'processing', auth.uid(), jsonb_array_length(p_rows)
    )
    RETURNING id INTO v_batch_id;
  END IF;
  v_checked_orgs := v_checked_orgs || v_batch_org;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_row_index := v_row_index + 1;
    v_pending_fields := '[]'::jsonb;
    v_transaction_id := NULL;
    v_period_id := NULL;

    BEGIN
      v_org := (v_row->>'organization_id')::uuid;
      v_date := (v_row->>'date')::date;
      v_account_category_id := NULLIF(v_row->>'account_category_id', '')::uuid;
      v_financial_account_id := NULLIF(v_row->>'financial_account_id', '')::uuid;
      v_cost_center_id := NULLIF(v_row->>'cost_center_id', '')::uuid;
      v_accounting_group_id := NULLIF(v_row->>'accounting_group_id', '')::uuid;
      v_document_type_id := NULLIF(v_row->>'document_type_id', '')::uuid;
      v_congregation_id := NULLIF(v_row->>'congregation_id', '')::uuid;
      v_district_id := NULLIF(v_row->>'district_id', '')::uuid;
      v_raw_timestamp := NULLIF(v_row->>'raw_timestamp', '')::timestamptz;
      v_congregation_raw := NULLIF(btrim(v_row->>'congregation_raw_label'), '');
      -- "TODAS" é opção operacional (aplica-se a todas as congregações do
      -- distrito) — NUNCA uma congregação real, NUNCA uma pendência de
      -- reconciliação. Recalculado aqui a partir do texto, nunca aceito de
      -- uma flag enviada pelo cliente (FASE 1D-B1.1, item 1/2).
      v_is_operational_congregation := v_congregation_raw IS NOT NULL
        AND public._finance_normalize_catalog_label(v_congregation_raw) = 'TODAS';

      -- Rótulos históricos SEM QUALQUER destino atual comprovado (decisão
      -- humana final, FASE B1.2 "CORREÇÃO FINAL DIRETA", item 2) —
      -- recalculado aqui a partir do texto bruto, nunca aceito de uma flag
      -- enviada pelo cliente (mesmo padrão já usado para "TODAS" acima).
      -- Lista fixa, comprovada por inspeção da própria planilha — nunca
      -- fuzzy, nunca inventada.
      v_is_historical_preserved_district := NULLIF(btrim(v_row->>'district_raw_label'), '') IS NOT NULL
        AND public._finance_normalize_catalog_label(v_row->>'district_raw_label')
          = public._finance_normalize_catalog_label('24 - DALLAGNOL');
      v_is_historical_preserved_congregation := v_congregation_raw IS NOT NULL
        AND public._finance_normalize_catalog_label(v_congregation_raw) IN (
          public._finance_normalize_catalog_label('DALLAGNOL'),
          public._finance_normalize_catalog_label('LOT RECH')
        );
      v_is_historical_preserved_account_category := NULLIF(btrim(v_row->>'account_category_raw_label'), '') IS NOT NULL
        AND public._finance_normalize_catalog_label(v_row->>'account_category_raw_label') IN (
          public._finance_normalize_catalog_label('15107 MATERIAL PARA EVANGELISMO E MISSÕES'),
          public._finance_normalize_catalog_label('REEMBOLSO'),
          public._finance_normalize_catalog_label('3500 TAXAS DE REGULARIZAÇÕES')
        );

      IF NOT (v_org = ANY(v_checked_orgs)) THEN
        IF NOT public.is_org_finance_writer(auth.uid(), v_org) THEN
          RAISE EXCEPTION 'Sem permissão de tesouraria para esta organização.' USING ERRCODE = 'CV001';
        END IF;
        v_checked_orgs := v_checked_orgs || v_org;
      END IF;

      IF NULLIF(btrim(v_row->>'description'), '') IS NULL
         OR NULLIF(btrim(v_row->>'category'), '') IS NULL
         OR (v_row->>'amount')::numeric <= 0
         OR v_row->>'type' NOT IN ('Entrada', 'Saida')
      THEN
        RAISE EXCEPTION 'Descrição, categoria, tipo e valor devem ser válidos.' USING ERRCODE = 'CV001';
      END IF;

      IF v_account_category_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.finance_account_categories
        WHERE id = v_account_category_id AND organization_id = v_org
      ) THEN
        RAISE EXCEPTION 'Conta contábil fora da organização.' USING ERRCODE = 'CV001';
      END IF;
      IF v_financial_account_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.finance_accounts
        WHERE id = v_financial_account_id AND organization_id = v_org
      ) THEN
        RAISE EXCEPTION 'Conta financeira fora da organização.' USING ERRCODE = 'CV001';
      END IF;
      IF v_cost_center_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.finance_cost_centers
        WHERE id = v_cost_center_id AND organization_id = v_org
      ) THEN
        RAISE EXCEPTION 'Centro de custo fora da organização.' USING ERRCODE = 'CV001';
      END IF;
      IF v_accounting_group_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.finance_accounting_groups
        WHERE id = v_accounting_group_id
          AND (organization_id IS NULL OR organization_id = v_org)
      ) THEN
        RAISE EXCEPTION 'Grupo contábil fora da organização.' USING ERRCODE = 'CV001';
      END IF;
      IF v_document_type_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.finance_document_types
        WHERE id = v_document_type_id
          AND (organization_id IS NULL OR organization_id = v_org)
      ) THEN
        RAISE EXCEPTION 'Tipo de documento fora da organização.' USING ERRCODE = 'CV001';
      END IF;
      IF v_congregation_id IS NOT NULL AND (
        NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_congregation_id)
        OR NOT public.is_organization_descendant_or_self(v_org, v_congregation_id)
      ) THEN
        RAISE EXCEPTION 'Congregação fora da árvore da organização.' USING ERRCODE = 'CV001';
      END IF;
      IF v_district_id IS NOT NULL AND (
        NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_district_id)
        OR NOT public.is_organization_descendant_or_self(v_org, v_district_id)
      ) THEN
        RAISE EXCEPTION 'Distrito fora da árvore da organização.' USING ERRCODE = 'CV001';
      END IF;

      IF public.is_finance_month_closed(v_org, v_date) THEN
        v_skipped_closed_month := v_skipped_closed_month + 1;
        CONTINUE;
      END IF;

      -- ── PERÍODO: identidade própria, find-or-create sem ambiguidade ────────
      v_period_label := NULLIF(btrim(v_row->>'period_label'), '');
      IF v_period_label IS NOT NULL THEN
        INSERT INTO public.finance_periods (organization_id, label)
        VALUES (v_org, v_period_label)
        ON CONFLICT (organization_id, label) DO NOTHING;
        SELECT id INTO v_period_id FROM public.finance_periods
        WHERE organization_id = v_org AND label = v_period_label;
      END IF;

      -- ── Catálogos com risco real de alias/ambiguidade: nunca inventa,
      -- sempre registra pendência explícita quando não resolvido ────────────
      PERFORM public._finance_upsert_catalog_alias(
        v_org, 'district', v_row->>'district_raw_label', v_district_id, false, v_is_historical_preserved_district);
      IF NULLIF(btrim(v_row->>'district_raw_label'), '') IS NOT NULL AND v_district_id IS NULL
         AND NOT v_is_historical_preserved_district THEN
        v_pending_fields := v_pending_fields || jsonb_build_array(jsonb_build_object(
          'field', 'district', 'catalog_type', 'district', 'raw_value', v_row->>'district_raw_label'));
      END IF;

      PERFORM public._finance_upsert_catalog_alias(
        v_org, 'congregation', v_congregation_raw, v_congregation_id,
        v_is_operational_congregation, v_is_historical_preserved_congregation);
      IF v_congregation_raw IS NOT NULL AND v_congregation_id IS NULL
         AND NOT v_is_operational_congregation AND NOT v_is_historical_preserved_congregation THEN
        v_pending_fields := v_pending_fields || jsonb_build_array(jsonb_build_object(
          'field', 'congregation', 'catalog_type', 'congregation', 'raw_value', v_congregation_raw));
      END IF;

      PERFORM public._finance_upsert_catalog_alias(v_org, 'financial_account', v_row->>'financial_account_raw_label', v_financial_account_id);
      IF NULLIF(btrim(v_row->>'financial_account_raw_label'), '') IS NOT NULL AND v_financial_account_id IS NULL THEN
        v_pending_fields := v_pending_fields || jsonb_build_array(jsonb_build_object(
          'field', 'financial_account', 'catalog_type', 'financial_account', 'raw_value', v_row->>'financial_account_raw_label'));
      END IF;

      PERFORM public._finance_upsert_catalog_alias(v_org, 'accounting_group', v_row->>'accounting_group_raw_label', v_accounting_group_id);
      IF NULLIF(btrim(v_row->>'accounting_group_raw_label'), '') IS NOT NULL AND v_accounting_group_id IS NULL THEN
        v_pending_fields := v_pending_fields || jsonb_build_array(jsonb_build_object(
          'field', 'accounting_group', 'catalog_type', 'accounting_group', 'raw_value', v_row->>'accounting_group_raw_label'));
      END IF;

      PERFORM public._finance_upsert_catalog_alias(
        v_org, 'account_category', v_row->>'account_category_raw_label', v_account_category_id,
        false, v_is_historical_preserved_account_category);
      IF NULLIF(btrim(v_row->>'account_category_raw_label'), '') IS NOT NULL AND v_account_category_id IS NULL
         AND NOT v_is_historical_preserved_account_category THEN
        v_pending_fields := v_pending_fields || jsonb_build_array(jsonb_build_object(
          'field', 'account_category', 'catalog_type', 'account_category', 'raw_value', v_row->>'account_category_raw_label'));
      END IF;

      PERFORM public._finance_upsert_catalog_alias(v_org, 'document_type', v_row->>'document_type_raw_label', v_document_type_id);
      IF NULLIF(btrim(v_row->>'document_type_raw_label'), '') IS NOT NULL AND v_document_type_id IS NULL THEN
        v_pending_fields := v_pending_fields || jsonb_build_array(jsonb_build_object(
          'field', 'document_type', 'catalog_type', 'document_type', 'raw_value', v_row->>'document_type_raw_label'));
      END IF;

      INSERT INTO public.transactions (
        organization_id, user_id, created_by, date, amount, type, category,
        description, status, source_module, notes, account_category_id,
        financial_account_id, cost_center_id, accounting_group_id,
        document_type_id, document_number, congregation_id, district_id,
        supplier_beneficiary_name, supplier_beneficiary_document,
        contributor_name, contributor_document, collector_name, treasurer_name,
        period_label, legacy_record_number, issue_date, accounting_date, origin,
        raw_timestamp, district_raw_label, congregation_raw_label,
        financial_account_raw_label, accounting_group_raw_label,
        account_category_raw_label, document_type_raw_label,
        source_observation, period_id, has_pending_reconciliation,
        import_source_row_number, import_batch_id
      ) VALUES (
        v_org, auth.uid(), auth.uid(), v_date, (v_row->>'amount')::numeric,
        v_row->>'type', v_row->>'category', v_row->>'description', 'Confirmado',
        'spreadsheet_import', v_row->>'notes', v_account_category_id,
        v_financial_account_id, v_cost_center_id, v_accounting_group_id,
        v_document_type_id, v_row->>'document_number', v_congregation_id,
        v_district_id, v_row->>'supplier_beneficiary_name',
        v_row->>'supplier_beneficiary_document', v_row->>'contributor_name',
        v_row->>'contributor_document', v_row->>'collector_name',
        v_row->>'treasurer_name', v_period_label,
        v_row->>'legacy_record_number',
        COALESCE(NULLIF(v_row->>'issue_date', '')::date, v_date),
        v_date, 'spreadsheet',
        v_raw_timestamp, v_row->>'district_raw_label', v_congregation_raw,
        v_row->>'financial_account_raw_label', v_row->>'accounting_group_raw_label',
        v_row->>'account_category_raw_label', v_row->>'document_type_raw_label',
        v_row->>'source_observation', v_period_id, jsonb_array_length(v_pending_fields) > 0,
        v_row_index, v_batch_id
      )
      RETURNING id INTO v_transaction_id;

      IF jsonb_array_length(v_pending_fields) > 0 THEN
        v_row_status := 'persisted_pending';
        v_persisted_pending := v_persisted_pending + 1;
      ELSE
        v_row_status := 'persisted_reconciled';
        v_persisted_reconciled := v_persisted_reconciled + 1;
      END IF;

      INSERT INTO public.finance_import_batch_rows (
        import_batch_id, source_row_number, legacy_record_number, status,
        transaction_id, pending_fields
      ) VALUES (
        v_batch_id, v_row_index, v_row->>'legacy_record_number', v_row_status,
        v_transaction_id, v_pending_fields
      )
      ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET
        legacy_record_number = EXCLUDED.legacy_record_number,
        status = EXCLUDED.status,
        transaction_id = EXCLUDED.transaction_id,
        pending_fields = EXCLUDED.pending_fields,
        exclusion_reason = NULL;
    EXCEPTION
      WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
        IF v_constraint_name = 'transactions_org_legacy_record_spreadsheet_uidx' THEN
          v_duplicate := v_duplicate + 1;
          INSERT INTO public.finance_import_batch_rows (
            import_batch_id, source_row_number, legacy_record_number, status, exclusion_reason
          ) VALUES (
            v_batch_id, v_row_index, v_row->>'legacy_record_number', 'duplicate',
            'legacy_record_number já importado anteriormente para esta organização'
          )
          ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET
            legacy_record_number = EXCLUDED.legacy_record_number,
            status = EXCLUDED.status,
            transaction_id = NULL,
            pending_fields = '[]'::jsonb,
            exclusion_reason = EXCLUDED.exclusion_reason;
        ELSE
          -- Violação de unicidade NÃO prevista (não é a de REGISTRO) — erro
          -- inesperado do sistema, nunca confundido com dado inválido.
          v_failed := v_failed + 1;
          v_errors := v_errors || jsonb_build_array(jsonb_build_object('row_index', v_row_index, 'error', SQLERRM));
          INSERT INTO public.finance_import_batch_rows (
            import_batch_id, source_row_number, legacy_record_number, status, exclusion_reason
          ) VALUES (
            v_batch_id, v_row_index, v_row->>'legacy_record_number', 'failed', SQLERRM
          )
          ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET
            legacy_record_number = EXCLUDED.legacy_record_number,
            status = EXCLUDED.status,
            transaction_id = NULL,
            pending_fields = '[]'::jsonb,
            exclusion_reason = EXCLUDED.exclusion_reason;
        END IF;
      WHEN SQLSTATE 'CV001' THEN
        -- Falha de validação de NEGÓCIO conhecida e esperada (dado ruim na
        -- planilha) — nunca confundida com um erro inesperado do sistema.
        v_excluded_invalid := v_excluded_invalid + 1;
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('row_index', v_row_index, 'error', SQLERRM));
        INSERT INTO public.finance_import_batch_rows (
          import_batch_id, source_row_number, legacy_record_number, status, exclusion_reason
        ) VALUES (
          v_batch_id, v_row_index, v_row->>'legacy_record_number', 'excluded_invalid', SQLERRM
        )
        ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET
          legacy_record_number = EXCLUDED.legacy_record_number,
          status = EXCLUDED.status,
          transaction_id = NULL,
          pending_fields = '[]'::jsonb,
          exclusion_reason = EXCLUDED.exclusion_reason;
      WHEN OTHERS THEN
        -- Erro verdadeiramente inesperado (bug, timeout, etc.) — nunca
        -- silenciado, nunca contado como "excluded_invalid" comum.
        v_failed := v_failed + 1;
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('row_index', v_row_index, 'error', SQLERRM));
        INSERT INTO public.finance_import_batch_rows (
          import_batch_id, source_row_number, legacy_record_number, status, exclusion_reason
        ) VALUES (
          v_batch_id, v_row_index, v_row->>'legacy_record_number', 'failed', SQLERRM
        )
        ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET
          legacy_record_number = EXCLUDED.legacy_record_number,
          status = EXCLUDED.status,
          transaction_id = NULL,
          pending_fields = '[]'::jsonb,
          exclusion_reason = EXCLUDED.exclusion_reason;
    END;
  END LOOP;

  UPDATE public.finance_import_batches SET
    rows_read = rows_read + jsonb_array_length(p_rows),
    rows_persisted = rows_persisted + v_persisted_reconciled + v_persisted_pending,
    rows_persisted_reconciled = rows_persisted_reconciled + v_persisted_reconciled,
    rows_persisted_pending = rows_persisted_pending + v_persisted_pending,
    rows_duplicate = rows_duplicate + v_duplicate,
    rows_excluded_invalid = rows_excluded_invalid + v_excluded_invalid,
    rows_failed = rows_failed + v_failed,
    rows_pending_reconciliation = rows_pending_reconciliation + v_persisted_pending,
    imported_rows = imported_rows + v_persisted_reconciled + v_persisted_pending,
    failed_rows = failed_rows + v_excluded_invalid + v_failed,
    total_rows = GREATEST(total_rows, rows_read + jsonb_array_length(p_rows))
  WHERE id = v_batch_id;

  RETURN jsonb_build_object(
    'inserted', v_persisted_reconciled + v_persisted_pending,
    'persisted_reconciled', v_persisted_reconciled,
    'persisted_pending', v_persisted_pending,
    'duplicate', v_duplicate,
    'excluded_invalid', v_excluded_invalid,
    'failed', v_failed,
    'skipped_closed_month', v_skipped_closed_month,
    'pending_reconciliation_rows', v_persisted_pending,
    'batch_id', v_batch_id,
    'errors', (
      SELECT jsonb_agg(value)
      FROM (
        SELECT value
        FROM jsonb_array_elements(v_errors)
        LIMIT 20
      ) limited_errors
    )
  );
END;
$$;

COMMENT ON FUNCTION public.import_finance_transactions_bulk(jsonb, uuid) IS
  'Imports at most 1000 scoped finance rows using auth.uid as immutable '
  'authorship; validates every referenced object and never echoes source '
  'rows. p_import_batch_id é opcional (compatibilidade retroativa) — quando '
  'omitido, cria um lote automaticamente. Toda linha gera exatamente um '
  'registro em finance_import_batch_rows dentre 5 estados finais '
  '(persisted_reconciled/persisted_pending/duplicate/excluded_invalid/failed) '
  '— pendência de catálogo nunca rejeita a linha, mas também nunca conta '
  'como reconciliada. "TODAS" em congregação é reconhecida como opção '
  'operacional, nunca como pendência.';

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 6: finalize_finance_import_batch — reescrita, finalização rígida
-- Assinatura muda de 7 para 1 argumento — DROP explícito da versão anterior.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.finalize_finance_import_batch(uuid, integer, integer, numeric, numeric, date, date);

CREATE OR REPLACE FUNCTION public.finalize_finance_import_batch(
  p_batch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Contrato oficial da planilha CONFIADCS1-2-26.xlsm (aba "Base de Dados"),
  -- verificado por inspeção direta do arquivo na FASE 1D-B1.1. Constantes
  -- embutidas deliberadamente — o chamador NUNCA pode alegar valores
  -- diferentes; tudo é recalculado a partir do que está persistido no banco
  -- e comparado apenas contra estes números fixos.
  v_expected_persisted_reconciled CONSTANT integer := 29957;
  v_expected_distinct_legacy      CONSTANT integer := 29957;
  v_expected_entries_count        CONSTANT integer := 14908;
  v_expected_exits_count          CONSTANT integer := 15049;
  v_expected_entries_amount       CONSTANT numeric := 10655451.68;
  v_expected_exits_amount         CONSTANT numeric := 23962542.86;
  v_expected_min_date             CONSTANT date    := '2024-11-01';
  v_expected_max_date             CONSTANT date    := '2026-08-11';

  v_org uuid;
  v_batch_ids uuid[];
  v_rows_read integer;
  v_persisted_reconciled integer;
  v_persisted_pending integer;
  v_duplicate integer;
  v_excluded_invalid integer;
  v_failed integer;
  v_distinct_legacy integer;
  v_entries_count integer;
  v_exits_count integer;
  v_entries_amount numeric;
  v_exits_amount numeric;
  v_min_date date;
  v_max_date date;
  v_mismatches jsonb := '[]'::jsonb;
  v_ok boolean := true;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT organization_id INTO v_org
  FROM public.finance_import_batches WHERE id = p_batch_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'import batch not found';
  END IF;
  IF NOT public.is_org_finance_writer(auth.uid(), v_org) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  -- O frontend ainda pode dividir uma importação grande em múltiplos lotes
  -- (um por chamada de RPC) — agregamos TODOS os lotes CONFIADCS da mesma
  -- organização, não apenas o lote informado, para poder verificar o total
  -- oficial de 29.957 lançamentos de uma só vez.
  SELECT array_agg(id) INTO v_batch_ids
  FROM public.finance_import_batches
  WHERE organization_id = v_org AND source_type = 'confiadcs';

  SELECT COALESCE(SUM(rows_read), 0) INTO v_rows_read
  FROM public.finance_import_batches
  WHERE id = ANY(v_batch_ids);

  SELECT
    COUNT(*) FILTER (WHERE status = 'persisted_reconciled'),
    COUNT(*) FILTER (WHERE status = 'persisted_pending'),
    COUNT(*) FILTER (WHERE status = 'duplicate'),
    COUNT(*) FILTER (WHERE status = 'excluded_invalid'),
    COUNT(*) FILTER (WHERE status = 'failed')
  INTO v_persisted_reconciled, v_persisted_pending, v_duplicate, v_excluded_invalid, v_failed
  FROM public.finance_import_batch_rows
  WHERE import_batch_id = ANY(v_batch_ids);

  SELECT
    COUNT(DISTINCT legacy_record_number) FILTER (WHERE legacy_record_number IS NOT NULL),
    COUNT(*) FILTER (WHERE type = 'Entrada'),
    COUNT(*) FILTER (WHERE type = 'Saida'),
    COALESCE(SUM(amount) FILTER (WHERE type = 'Entrada'), 0),
    COALESCE(SUM(amount) FILTER (WHERE type = 'Saida'), 0),
    MIN(date),
    MAX(date)
  INTO v_distinct_legacy, v_entries_count, v_exits_count, v_entries_amount, v_exits_amount,
       v_min_date, v_max_date
  FROM public.transactions
  WHERE import_batch_id = ANY(v_batch_ids);

  -- ── 1) lidas = processadas (identidade contábil de linhas, sempre) ────────
  IF v_rows_read <> v_persisted_reconciled + v_persisted_pending + v_duplicate + v_excluded_invalid + v_failed THEN
    v_ok := false;
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
      'check', 'rows_read_equals_processed',
      'rows_read', v_rows_read,
      'processed', v_persisted_reconciled + v_persisted_pending + v_duplicate + v_excluded_invalid + v_failed
    ));
  END IF;

  -- ── 2) persistidas reconciliadas = 29.957 ─────────────────────────────────
  IF v_persisted_reconciled <> v_expected_persisted_reconciled THEN
    v_ok := false;
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
      'check', 'persisted_reconciled', 'actual', v_persisted_reconciled, 'expected', v_expected_persisted_reconciled));
  END IF;

  -- ── 3) persistidas pendentes = 0 ──────────────────────────────────────────
  IF v_persisted_pending <> 0 THEN
    v_ok := false;
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
      'check', 'zero_persisted_pending', 'actual', v_persisted_pending, 'expected', 0));
  END IF;

  -- ── 4) duplicadas = 0 ─────────────────────────────────────────────────────
  IF v_duplicate <> 0 THEN
    v_ok := false;
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
      'check', 'zero_duplicate', 'actual', v_duplicate, 'expected', 0));
  END IF;

  -- ── 5) inválidas = 0 ──────────────────────────────────────────────────────
  IF v_excluded_invalid <> 0 THEN
    v_ok := false;
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
      'check', 'zero_excluded_invalid', 'actual', v_excluded_invalid, 'expected', 0));
  END IF;

  -- ── 6) falhas = 0 ─────────────────────────────────────────────────────────
  IF v_failed <> 0 THEN
    v_ok := false;
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
      'check', 'zero_failed', 'actual', v_failed, 'expected', 0));
  END IF;

  -- ── 7) registros legados distintos = 29.957 ──────────────────────────────
  IF v_distinct_legacy <> v_expected_distinct_legacy THEN
    v_ok := false;
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
      'check', 'distinct_legacy_records', 'actual', v_distinct_legacy, 'expected', v_expected_distinct_legacy));
  END IF;

  -- ── 8/9) entradas / saídas (contagem) ────────────────────────────────────
  IF v_entries_count <> v_expected_entries_count THEN
    v_ok := false;
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
      'check', 'entries_count', 'actual', v_entries_count, 'expected', v_expected_entries_count));
  END IF;
  IF v_exits_count <> v_expected_exits_count THEN
    v_ok := false;
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
      'check', 'exits_count', 'actual', v_exits_count, 'expected', v_expected_exits_count));
  END IF;

  -- ── 10/11) entradas / saídas (valor) ─────────────────────────────────────
  IF round(v_entries_amount, 2) <> v_expected_entries_amount THEN
    v_ok := false;
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
      'check', 'entries_amount', 'actual', round(v_entries_amount, 2), 'expected', v_expected_entries_amount));
  END IF;
  IF round(v_exits_amount, 2) <> v_expected_exits_amount THEN
    v_ok := false;
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
      'check', 'exits_amount', 'actual', round(v_exits_amount, 2), 'expected', v_expected_exits_amount));
  END IF;

  -- ── 12) menor/maior data contábil ────────────────────────────────────────
  IF v_min_date IS DISTINCT FROM v_expected_min_date THEN
    v_ok := false;
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
      'check', 'min_date', 'actual', v_min_date, 'expected', v_expected_min_date));
  END IF;
  IF v_max_date IS DISTINCT FROM v_expected_max_date THEN
    v_ok := false;
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
      'check', 'max_date', 'actual', v_max_date, 'expected', v_expected_max_date));
  END IF;

  UPDATE public.finance_import_batches SET
    persisted_entries_amount = v_entries_amount,
    persisted_exits_amount = v_exits_amount,
    reconciled = v_ok,
    reconciliation_report = jsonb_build_object(
      'ok', v_ok,
      'mismatches', v_mismatches,
      'checked_at', now(),
      'batches_considered', v_batch_ids,
      'rows_read', v_rows_read,
      'persisted_reconciled', v_persisted_reconciled,
      'persisted_pending', v_persisted_pending,
      'duplicate', v_duplicate,
      'excluded_invalid', v_excluded_invalid,
      'failed', v_failed,
      'distinct_legacy_records', v_distinct_legacy,
      'entries_count', v_entries_count,
      'exits_count', v_exits_count,
      'entries_amount', v_entries_amount,
      'exits_amount', v_exits_amount,
      'min_date', v_min_date,
      'max_date', v_max_date
    ),
    status = CASE WHEN v_ok THEN 'done' ELSE 'error' END,
    finished_at = now()
  WHERE id = ANY(v_batch_ids);

  RETURN jsonb_build_object('ok', v_ok, 'mismatches', v_mismatches, 'batch_ids', v_batch_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_finance_import_batch(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_finance_import_batch(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.finalize_finance_import_batch(uuid) IS
  'Comprova a reconciliação COMPLETA da importação CONFIADCS1-2-26.xlsm: '
  'recalcula todos os totais a partir do que está efetivamente persistido em '
  'transactions/finance_import_batch_rows (nunca aceita valores esperados de '
  'quem chama) e só marca reconciled=true quando as 12 condições do contrato '
  'oficial da planilha batem exatamente — incluindo zero linhas com '
  'pendência de catálogo ainda aberta. Agrega todos os lotes '
  'source_type=''confiadcs'' da mesma organização.';

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 7: GRANTS — reafirma explicitamente (idempotente)
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.import_finance_transactions_bulk(jsonb, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_finance_transactions_bulk(jsonb, uuid)
  TO authenticated;

-- =============================================================================
-- FIM DA MIGRATION
-- Nome: 20260812200000_finance_confiadcs_reconciliation_hardening.sql
-- Revisão humana obrigatória antes de aplicar em produção Supabase.
-- =============================================================================
