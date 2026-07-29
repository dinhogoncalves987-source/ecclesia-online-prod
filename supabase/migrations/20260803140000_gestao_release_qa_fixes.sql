-- Correções finais encontradas na homologação da Gestão.
-- Mantém staging e produção estruturalmente idênticos, sem dados de teste.

DO $$
BEGIN
  IF to_regclass('public.institutional_certificates') IS NULL THEN
    RAISE EXCEPTION 'gestao release QA preflight failed: institutional_certificates missing';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_draft_institutional_certificate(
  p_certificate_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.institutional_certificates%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT *
    INTO v_row
  FROM public.institutional_certificates
  WHERE id = p_certificate_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'certificate not found';
  END IF;
  IF v_row.status <> 'rascunho' THEN
    RAISE EXCEPTION 'only draft certificates can be deleted';
  END IF;

  IF v_row.source_module = 'discipulado' THEN
    IF NOT public.has_org_access_permission(
      auth.uid(), v_row.organization_id, 'discipleship.manage'
    ) THEN
      RAISE EXCEPTION 'access denied to delete discipleship certificate draft';
    END IF;
  ELSIF v_row.source_module = 'teologia' THEN
    IF NOT public.has_org_access_permission(
      auth.uid(), v_row.organization_id, 'theology.manage'
    ) THEN
      RAISE EXCEPTION 'access denied to delete theology certificate draft';
    END IF;
  ELSIF NOT public.has_org_access_permission(
    auth.uid(), v_row.organization_id, 'members.write'
  ) THEN
    RAISE EXCEPTION 'access denied to delete institutional certificate draft';
  END IF;

  DELETE FROM public.institutional_certificates
  WHERE id = v_row.id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_draft_institutional_certificate(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_draft_institutional_certificate(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.delete_draft_institutional_certificate(uuid) IS
  'Deletes only non-issued certificate drafts after capability checks; issued documents remain auditable.';

-- O seed financeiro é interno: triggers/migrations podem executá-lo, mas
-- usuários da API não podem invocar uma função SECURITY DEFINER diretamente.
DO $$
BEGIN
  IF to_regprocedure('public.seed_assembleia_de_deus_finance_template(uuid)') IS NULL THEN
    RAISE EXCEPTION 'gestao release QA preflight failed: finance template seed missing';
  END IF;
  IF to_regprocedure('public.is_organization_descendant_or_self(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'gestao release QA preflight failed: organization scope helper missing';
  END IF;
  IF to_regprocedure('public.import_finance_transactions_bulk(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'gestao release QA preflight failed: finance import RPC missing';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_assembleia_de_deus_finance_template(uuid)
  FROM PUBLIC, anon, authenticated;

-- Backfill idempotente para matrizes/sedes AD que já existiam quando o gatilho
-- do template foi criado. Isso instala configuração contábil, não dados reais.
DO $$
DECLARE
  v_org record;
BEGIN
  FOR v_org IN
    SELECT id
    FROM public.organizations
    WHERE organization_type IN ('matriz', 'sede')
      AND denomination_type IS NOT NULL
      AND lower(denomination_type) LIKE '%assemble%deus%'
  LOOP
    PERFORM public.seed_assembleia_de_deus_finance_template(v_org.id);
  END LOOP;
END;
$$;

-- Recria a RPC de importação com autoria imutável, validação de escopo para
-- todas as FKs e erros sem ecoar linhas que possam conter dados pessoais.
CREATE OR REPLACE FUNCTION public.import_finance_transactions_bulk(p_rows jsonb)
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
  v_inserted integer := 0;
  v_failed integer := 0;
  v_skipped_closed_month integer := 0;
  v_row_index integer := 0;
  v_checked_orgs uuid[] := ARRAY[]::uuid[];
  v_errors jsonb := '[]'::jsonb;
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

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_row_index := v_row_index + 1;
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

      INSERT INTO public.transactions (
        organization_id, user_id, created_by, date, amount, type, category,
        description, status, source_module, notes, account_category_id,
        financial_account_id, cost_center_id, accounting_group_id,
        document_type_id, document_number, congregation_id, district_id,
        supplier_beneficiary_name, supplier_beneficiary_document,
        contributor_name, contributor_document, collector_name, treasurer_name,
        period_label, legacy_record_number, issue_date, accounting_date, origin
      ) VALUES (
        v_org, auth.uid(), auth.uid(), v_date, (v_row->>'amount')::numeric,
        v_row->>'type', v_row->>'category', v_row->>'description', 'Confirmado',
        'spreadsheet_import', v_row->>'notes', v_account_category_id,
        v_financial_account_id, v_cost_center_id, v_accounting_group_id,
        v_document_type_id, v_row->>'document_number', v_congregation_id,
        v_district_id, v_row->>'supplier_beneficiary_name',
        v_row->>'supplier_beneficiary_document', v_row->>'contributor_name',
        v_row->>'contributor_document', v_row->>'collector_name',
        v_row->>'treasurer_name', v_row->>'period_label',
        v_row->>'legacy_record_number',
        COALESCE(NULLIF(v_row->>'issue_date', '')::date, v_date),
        v_date, 'spreadsheet'
      );
      v_inserted := v_inserted + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'row_index', v_row_index,
        'error', SQLERRM
      ));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'failed', v_failed,
    'skipped_closed_month', v_skipped_closed_month,
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

REVOKE ALL ON FUNCTION public.import_finance_transactions_bulk(jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_finance_transactions_bulk(jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.import_finance_transactions_bulk(jsonb) IS
  'Imports at most 1000 scoped finance rows using auth.uid as immutable authorship; validates every referenced object and never echoes source rows.';
