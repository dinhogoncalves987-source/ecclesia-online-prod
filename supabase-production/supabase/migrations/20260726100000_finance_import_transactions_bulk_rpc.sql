-- =============================================================================
-- RPC: import_finance_transactions_bulk
-- Migration: 20260726100000_finance_import_transactions_bulk_rpc.sql
--
-- OBJETIVO:
--   A tela de importação de planilhas (SpreadsheetImportModal.tsx) já chama
--   esta RPC hoje, mas ela nunca foi criada — qualquer importação falha.
--   Esta migration cria a função que faltava, replicando exatamente as
--   mesmas regras de permissão e de mês fechado já aplicadas na policy de
--   INSERT de public.transactions (não é um novo modelo de permissão).
--
-- SEGURANÇA:
--   SECURITY DEFINER contorna RLS por padrão — por isso a função reproduz
--   manualmente is_org_finance_writer() e is_finance_month_closed() antes de
--   cada inserção, com a mesma regra de "finance transactions writers insert".
--   Cada linha é inserida em um bloco próprio (SAVEPOINT implícito via
--   BEGIN/EXCEPTION) para que uma linha malformada não descarte o lote
--   inteiro — ela só é contabilizada como falha.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.import_finance_transactions_bulk(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row       jsonb;
  v_org       uuid;
  v_date      date;
  v_inserted  int := 0;
  v_failed    int := 0;
  v_skipped_closed_month int := 0;
  v_checked_orgs uuid[] := ARRAY[]::uuid[];
  v_errors    jsonb := '[]'::jsonb;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object('error', 'p_rows deve ser um array JSON.');
  END IF;

  IF jsonb_array_length(p_rows) = 0 THEN
    RETURN jsonb_build_object('inserted', 0, 'failed', 0);
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_org := NULL;
    BEGIN
      v_org := (v_row->>'organization_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_org := NULL;
    END;

    IF v_org IS NULL THEN
      RETURN jsonb_build_object(
        'error', 'Linha sem organization_id válido.',
        'inserted', v_inserted, 'failed', v_failed
      );
    END IF;

    -- Verifica permissão de tesouraria uma única vez por organização no lote
    IF NOT (v_org = ANY(v_checked_orgs)) THEN
      IF NOT public.is_org_finance_writer(auth.uid(), v_org) THEN
        RETURN jsonb_build_object(
          'error', 'Sem permissão de tesouraria para importar nesta organização.',
          'inserted', v_inserted, 'failed', v_failed
        );
      END IF;
      v_checked_orgs := v_checked_orgs || v_org;
    END IF;

    BEGIN
      v_date := (v_row->>'date')::date;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_object('error', 'Data inválida', 'row', v_row);
      CONTINUE;
    END;

    -- Mesma regra da policy "finance transactions writers insert": não
    -- inserir em mês já fechado. Conta-se separadamente para o usuário
    -- entender por que o total importado é menor que o total enviado.
    IF public.is_finance_month_closed(v_org, v_date) THEN
      v_skipped_closed_month := v_skipped_closed_month + 1;
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO public.transactions (
        organization_id, user_id, created_by, date, amount, type, category, description,
        status, source_module, notes,
        account_category_id, financial_account_id, cost_center_id,
        accounting_group_id, document_type_id, document_number,
        congregation_id, district_id,
        supplier_beneficiary_name, supplier_beneficiary_document,
        contributor_name, contributor_document,
        collector_name, treasurer_name,
        period_label, legacy_record_number,
        issue_date, accounting_date, origin
      ) VALUES (
        v_org,
        COALESCE((v_row->>'user_id')::uuid, auth.uid()),
        COALESCE((v_row->>'created_by')::uuid, auth.uid()),
        v_date,
        (v_row->>'amount')::numeric,
        v_row->>'type',
        v_row->>'category',
        v_row->>'description',
        COALESCE(v_row->>'status', 'Confirmado'),
        COALESCE(v_row->>'source_module', 'confiadcs_import'),
        v_row->>'notes',
        NULLIF(v_row->>'account_category_id', '')::uuid,
        NULLIF(v_row->>'financial_account_id', '')::uuid,
        NULLIF(v_row->>'cost_center_id', '')::uuid,
        NULLIF(v_row->>'accounting_group_id', '')::uuid,
        NULLIF(v_row->>'document_type_id', '')::uuid,
        v_row->>'document_number',
        NULLIF(v_row->>'congregation_id', '')::uuid,
        NULLIF(v_row->>'district_id', '')::uuid,
        v_row->>'supplier_beneficiary_name',
        v_row->>'supplier_beneficiary_document',
        v_row->>'contributor_name',
        v_row->>'contributor_document',
        v_row->>'collector_name',
        v_row->>'treasurer_name',
        v_row->>'period_label',
        v_row->>'legacy_record_number',
        COALESCE(NULLIF(v_row->>'issue_date', '')::date, v_date),
        v_date,
        COALESCE(v_row->>'origin', 'confiadcs')
      );
      v_inserted := v_inserted + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_object('error', SQLERRM, 'row', v_row);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'failed', v_failed,
    'skipped_closed_month', v_skipped_closed_month,
    'errors', (SELECT jsonb_agg(elem) FROM (SELECT elem FROM jsonb_array_elements(v_errors) AS elem LIMIT 20) t)
  );
END;
$$;

COMMENT ON FUNCTION public.import_finance_transactions_bulk(jsonb) IS
  'Importação em lote de lançamentos financeiros (usada pela tela de import '
  'de planilhas .xlsm/.xlsx/.csv). Reproduz manualmente is_org_finance_writer '
  'e is_finance_month_closed pois SECURITY DEFINER não aplica RLS. Cada linha '
  'é isolada em seu próprio bloco de exceção para não descartar o lote inteiro.';

GRANT EXECUTE ON FUNCTION public.import_finance_transactions_bulk(jsonb) TO authenticated;

-- =============================================================================
-- FIM DA MIGRATION
-- Nome: 20260726100000_finance_import_transactions_bulk_rpc.sql
-- =============================================================================
