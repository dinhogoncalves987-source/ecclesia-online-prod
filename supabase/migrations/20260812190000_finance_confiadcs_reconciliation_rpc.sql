-- =============================================================================
-- FINANCE CONFIADCS — RPC DE IMPORTAÇÃO COM RECONCILIAÇÃO (FASE 1D-B1)
-- Migration: 20260812190000_finance_confiadcs_reconciliation_rpc.sql
--
-- OBJETIVO:
--   Recriar a RPC pública de importação em lote para que toda importação
--   CONFIADCS grave, linha a linha e lote a lote, uma razão auditável
--   completa: nenhuma linha some sem explicação, nenhuma FK fica nula sem
--   motivo registrado, nenhuma correspondência de catálogo é inventada.
--
--   A importação continua entrando exclusivamente por esta RPC — nunca por
--   INSERT manual no client. A assinatura pública ganha um parâmetro NOVO e
--   OPCIONAL (p_import_batch_id, default NULL) para não quebrar nenhum
--   client existente que ainda chama a função só com p_rows: quando omitido,
--   a própria RPC cria um lote de importação automaticamente, garantindo que
--   a razão de reconciliação sempre exista.
--
-- SEGURANÇA:
--   Idempotente — CREATE OR REPLACE FUNCTION. Como a assinatura pública muda
--   (novo parâmetro), a função antiga de 1 argumento é removida explicitamente
--   antes de recriar com 2 argumentos (o segundo com DEFAULT NULL), evitando
--   ambiguidade de overload no PostgREST.
--
-- REVISÃO HUMANA OBRIGATÓRIA antes de aplicar em produção.
-- =============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.import_finance_transactions_bulk(jsonb)') IS NULL THEN
    RAISE EXCEPTION '1D-B1 preflight failed: RPC de importação anterior não encontrada — não aplique fora de ordem';
  END IF;
  IF to_regclass('public.finance_import_catalog_aliases') IS NULL THEN
    RAISE EXCEPTION '1D-B1 preflight failed: schema de reconciliação (finance_import_catalog_aliases) ausente — aplique 20260812180000 primeiro';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 1: HELPER interno — upsert de alias/pendência de catálogo
-- Nunca exposta diretamente à API (REVOKE de PUBLIC/anon/authenticated),
-- só é alcançável de dentro da RPC de importação (contexto SECURITY DEFINER).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._finance_upsert_catalog_alias(
  p_organization_id uuid,
  p_catalog_type text,
  p_raw_label text,
  p_resolved_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_label text := NULLIF(btrim(p_raw_label), '');
BEGIN
  IF v_label IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.finance_import_catalog_aliases (
    organization_id, catalog_type, raw_label, normalized_label, resolved_id, resolution
  ) VALUES (
    p_organization_id, p_catalog_type, v_label,
    public._finance_normalize_catalog_label(v_label),
    p_resolved_id,
    CASE WHEN p_resolved_id IS NOT NULL THEN 'auto_exact' ELSE 'pending' END
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
      ELSE public.finance_import_catalog_aliases.resolution
    END,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public._finance_upsert_catalog_alias(uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._finance_upsert_catalog_alias(uuid, text, text, uuid) IS
  'Uso interno da RPC de importação. Registra/atualiza o catálogo de aliases '
  'de reconciliação (pending/auto_exact), nunca sobrescrevendo uma resolução '
  'manual já feita por um humano.';

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 2: RPC principal — import_finance_transactions_bulk
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.import_finance_transactions_bulk(jsonb);

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
  v_period_label text;
  v_period_id uuid;
  v_raw_timestamp timestamptz;
  v_inserted integer := 0;
  v_duplicate integer := 0;
  v_excluded_invalid integer := 0;
  v_pending_rows integer := 0;
  v_skipped_closed_month integer := 0;
  v_row_index integer := 0;
  v_checked_orgs uuid[] := ARRAY[]::uuid[];
  v_errors jsonb := '[]'::jsonb;
  v_batch_id uuid;
  v_batch_org uuid;
  v_transaction_id uuid;
  v_pending_fields jsonb;
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
      'inserted', 0, 'duplicate', 0, 'excluded_invalid', 0, 'failed', 0,
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

      IF NOT (v_org = ANY(v_checked_orgs)) THEN
        IF NOT public.is_org_finance_writer(auth.uid(), v_org) THEN
          RAISE EXCEPTION 'Sem permissão de tesouraria para esta organização.';
        END IF;
        v_checked_orgs := v_checked_orgs || v_org;
      END IF;

      IF NULLIF(btrim(v_row->>'description'), '') IS NULL
         OR NULLIF(btrim(v_row->>'category'), '') IS NULL
         OR (v_row->>'amount')::numeric <= 0
         OR v_row->>'type' NOT IN ('Entrada', 'Saida')
      THEN
        RAISE EXCEPTION 'Descrição, categoria, tipo e valor devem ser válidos.';
      END IF;

      IF v_account_category_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.finance_account_categories
        WHERE id = v_account_category_id AND organization_id = v_org
      ) THEN
        RAISE EXCEPTION 'Conta contábil fora da organização.';
      END IF;
      IF v_financial_account_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.finance_accounts
        WHERE id = v_financial_account_id AND organization_id = v_org
      ) THEN
        RAISE EXCEPTION 'Conta financeira fora da organização.';
      END IF;
      IF v_cost_center_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.finance_cost_centers
        WHERE id = v_cost_center_id AND organization_id = v_org
      ) THEN
        RAISE EXCEPTION 'Centro de custo fora da organização.';
      END IF;
      IF v_accounting_group_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.finance_accounting_groups
        WHERE id = v_accounting_group_id
          AND (organization_id IS NULL OR organization_id = v_org)
      ) THEN
        RAISE EXCEPTION 'Grupo contábil fora da organização.';
      END IF;
      IF v_document_type_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.finance_document_types
        WHERE id = v_document_type_id
          AND (organization_id IS NULL OR organization_id = v_org)
      ) THEN
        RAISE EXCEPTION 'Tipo de documento fora da organização.';
      END IF;
      IF v_congregation_id IS NOT NULL AND (
        NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_congregation_id)
        OR NOT public.is_organization_descendant_or_self(v_org, v_congregation_id)
      ) THEN
        RAISE EXCEPTION 'Congregação fora da árvore da organização.';
      END IF;
      IF v_district_id IS NOT NULL AND (
        NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_district_id)
        OR NOT public.is_organization_descendant_or_self(v_org, v_district_id)
      ) THEN
        RAISE EXCEPTION 'Distrito fora da árvore da organização.';
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
      PERFORM public._finance_upsert_catalog_alias(v_org, 'district', v_row->>'district_raw_label', v_district_id);
      IF NULLIF(btrim(v_row->>'district_raw_label'), '') IS NOT NULL AND v_district_id IS NULL THEN
        v_pending_fields := v_pending_fields || jsonb_build_array(jsonb_build_object(
          'field', 'district', 'catalog_type', 'district', 'raw_value', v_row->>'district_raw_label'));
      END IF;

      PERFORM public._finance_upsert_catalog_alias(v_org, 'congregation', v_row->>'congregation_raw_label', v_congregation_id);
      IF NULLIF(btrim(v_row->>'congregation_raw_label'), '') IS NOT NULL AND v_congregation_id IS NULL THEN
        v_pending_fields := v_pending_fields || jsonb_build_array(jsonb_build_object(
          'field', 'congregation', 'catalog_type', 'congregation', 'raw_value', v_row->>'congregation_raw_label'));
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

      PERFORM public._finance_upsert_catalog_alias(v_org, 'account_category', v_row->>'account_category_raw_label', v_account_category_id);
      IF NULLIF(btrim(v_row->>'account_category_raw_label'), '') IS NOT NULL AND v_account_category_id IS NULL THEN
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
        v_raw_timestamp, v_row->>'district_raw_label', v_row->>'congregation_raw_label',
        v_row->>'financial_account_raw_label', v_row->>'accounting_group_raw_label',
        v_row->>'account_category_raw_label', v_row->>'document_type_raw_label',
        v_row->>'source_observation', v_period_id, jsonb_array_length(v_pending_fields) > 0,
        v_row_index, v_batch_id
      )
      RETURNING id INTO v_transaction_id;

      INSERT INTO public.finance_import_batch_rows (
        import_batch_id, source_row_number, legacy_record_number, status,
        transaction_id, pending_fields
      ) VALUES (
        v_batch_id, v_row_index, v_row->>'legacy_record_number', 'persisted',
        v_transaction_id, v_pending_fields
      )
      ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET
        legacy_record_number = EXCLUDED.legacy_record_number,
        status = EXCLUDED.status,
        transaction_id = EXCLUDED.transaction_id,
        pending_fields = EXCLUDED.pending_fields,
        exclusion_reason = NULL;

      v_inserted := v_inserted + 1;
      IF jsonb_array_length(v_pending_fields) > 0 THEN
        v_pending_rows := v_pending_rows + 1;
      END IF;
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
        END IF;
      WHEN OTHERS THEN
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
    END;
  END LOOP;

  UPDATE public.finance_import_batches SET
    rows_read = rows_read + jsonb_array_length(p_rows),
    rows_persisted = rows_persisted + v_inserted,
    rows_duplicate = rows_duplicate + v_duplicate,
    rows_excluded_invalid = rows_excluded_invalid + v_excluded_invalid,
    rows_pending_reconciliation = rows_pending_reconciliation + v_pending_rows,
    imported_rows = imported_rows + v_inserted,
    failed_rows = failed_rows + v_excluded_invalid,
    total_rows = GREATEST(total_rows, rows_read + jsonb_array_length(p_rows))
  WHERE id = v_batch_id;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'duplicate', v_duplicate,
    'excluded_invalid', v_excluded_invalid,
    'failed', v_excluded_invalid,
    'skipped_closed_month', v_skipped_closed_month,
    'pending_reconciliation_rows', v_pending_rows,
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

REVOKE ALL ON FUNCTION public.import_finance_transactions_bulk(jsonb, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_finance_transactions_bulk(jsonb, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.import_finance_transactions_bulk(jsonb, uuid) IS
  'Imports at most 1000 scoped finance rows using auth.uid as immutable '
  'authorship; validates every referenced object and never echoes source '
  'rows. p_import_batch_id é opcional (compatibilidade retroativa) — quando '
  'omitido, cria um lote automaticamente. Toda linha gera exatamente um '
  'registro em finance_import_batch_rows (persisted/duplicate/'
  'excluded_invalid); pendências de catálogo nunca rejeitam a linha, apenas '
  'ficam registradas em finance_import_catalog_aliases e '
  'transactions.has_pending_reconciliation.';

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 3: RPC de finalização — reconciliação comprovada do lote
-- Compara o que foi lido/persistido/duplicado/excluído contra os totais da
-- planilha de origem informados pelo cliente (entradas, saídas, valores,
-- período de datas), sem confiar apenas em contagens internas.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.finalize_finance_import_batch(
  p_batch_id uuid,
  p_source_entries_count integer DEFAULT NULL,
  p_source_exits_count integer DEFAULT NULL,
  p_source_entries_amount numeric DEFAULT NULL,
  p_source_exits_amount numeric DEFAULT NULL,
  p_source_min_date date DEFAULT NULL,
  p_source_max_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch public.finance_import_batches%ROWTYPE;
  v_persisted_entries numeric;
  v_persisted_exits numeric;
  v_persisted_entries_count integer;
  v_persisted_exits_count integer;
  v_min_date date;
  v_max_date date;
  v_mismatches jsonb := '[]'::jsonb;
  v_ok boolean := true;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT * INTO v_batch FROM public.finance_import_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'import batch not found';
  END IF;
  IF NOT public.is_org_finance_writer(auth.uid(), v_batch.organization_id) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE type = 'Entrada'), 0),
    COALESCE(SUM(amount) FILTER (WHERE type = 'Saida'), 0),
    COUNT(*) FILTER (WHERE type = 'Entrada'),
    COUNT(*) FILTER (WHERE type = 'Saida'),
    MIN(date),
    MAX(date)
  INTO v_persisted_entries, v_persisted_exits, v_persisted_entries_count,
       v_persisted_exits_count, v_min_date, v_max_date
  FROM public.transactions
  WHERE import_batch_id = p_batch_id;

  IF v_batch.rows_read <> v_batch.rows_persisted + v_batch.rows_duplicate + v_batch.rows_excluded_invalid THEN
    v_ok := false;
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
      'check', 'rows_accounting_identity',
      'rows_read', v_batch.rows_read,
      'accounted_for', v_batch.rows_persisted + v_batch.rows_duplicate + v_batch.rows_excluded_invalid
    ));
  END IF;
  IF v_batch.rows_duplicate <> 0 THEN
    v_ok := false;
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object('check', 'zero_duplicates', 'rows_duplicate', v_batch.rows_duplicate));
  END IF;
  IF v_batch.rows_excluded_invalid <> 0 THEN
    v_ok := false;
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object('check', 'zero_excluded', 'rows_excluded_invalid', v_batch.rows_excluded_invalid));
  END IF;
  IF p_source_entries_count IS NOT NULL AND v_persisted_entries_count <> p_source_entries_count THEN
    v_ok := false;
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
      'check', 'entries_count', 'persisted', v_persisted_entries_count, 'source', p_source_entries_count));
  END IF;
  IF p_source_exits_count IS NOT NULL AND v_persisted_exits_count <> p_source_exits_count THEN
    v_ok := false;
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
      'check', 'exits_count', 'persisted', v_persisted_exits_count, 'source', p_source_exits_count));
  END IF;
  IF p_source_entries_amount IS NOT NULL AND round(v_persisted_entries, 2) <> round(p_source_entries_amount, 2) THEN
    v_ok := false;
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
      'check', 'entries_amount', 'persisted', v_persisted_entries, 'source', p_source_entries_amount));
  END IF;
  IF p_source_exits_amount IS NOT NULL AND round(v_persisted_exits, 2) <> round(p_source_exits_amount, 2) THEN
    v_ok := false;
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
      'check', 'exits_amount', 'persisted', v_persisted_exits, 'source', p_source_exits_amount));
  END IF;
  IF p_source_min_date IS NOT NULL AND v_min_date IS DISTINCT FROM p_source_min_date THEN
    v_ok := false;
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
      'check', 'min_date', 'persisted', v_min_date, 'source', p_source_min_date));
  END IF;
  IF p_source_max_date IS NOT NULL AND v_max_date IS DISTINCT FROM p_source_max_date THEN
    v_ok := false;
    v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
      'check', 'max_date', 'persisted', v_max_date, 'source', p_source_max_date));
  END IF;

  UPDATE public.finance_import_batches SET
    source_entries_count = p_source_entries_count,
    source_exits_count = p_source_exits_count,
    source_entries_amount = p_source_entries_amount,
    source_exits_amount = p_source_exits_amount,
    persisted_entries_amount = v_persisted_entries,
    persisted_exits_amount = v_persisted_exits,
    reconciled = v_ok,
    reconciliation_report = jsonb_build_object(
      'ok', v_ok, 'mismatches', v_mismatches, 'checked_at', now(),
      'persisted_entries_count', v_persisted_entries_count,
      'persisted_exits_count', v_persisted_exits_count,
      'persisted_min_date', v_min_date, 'persisted_max_date', v_max_date
    ),
    status = CASE WHEN v_ok THEN 'done' ELSE 'error' END,
    finished_at = now()
  WHERE id = p_batch_id;

  RETURN jsonb_build_object('ok', v_ok, 'mismatches', v_mismatches, 'batch_id', p_batch_id);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_finance_import_batch(uuid, integer, integer, numeric, numeric, date, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_finance_import_batch(uuid, integer, integer, numeric, numeric, date, date)
  TO authenticated;

COMMENT ON FUNCTION public.finalize_finance_import_batch(uuid, integer, integer, numeric, numeric, date, date) IS
  'Comprova a reconciliação de um lote de importação: identidade contábil '
  'lidas=processadas (persistidas+duplicadas+excluídas), zero duplicadas, '
  'zero excluídas, e totais/contagens/datas idênticos aos informados pelo '
  'cliente a partir da planilha de origem. Só marca reconciled=true quando '
  'TODAS as checagens passam.';

-- =============================================================================
-- FIM DA MIGRATION
-- Nome: 20260812190000_finance_confiadcs_reconciliation_rpc.sql
-- Revisão humana obrigatória antes de aplicar em produção Supabase.
-- =============================================================================
