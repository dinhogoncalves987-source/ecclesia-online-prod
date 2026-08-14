-- =============================================================================
-- FINANCE — EXTENSÃO DE finance_dashboard_aggregates (CORREÇÃO C3.1)
-- Migration: 20260814150000_finance_dashboard_aggregates_extended.sql
--
-- OBJETIVO:
--   A correção C3.1 elimina os últimos fetch-all de transactions no
--   Financeiro (abas Executivo, Dízimos & Ofertas, Orçamento, Prestação de
--   Contas, Inteligência). Duas informações que essas abas usavam — antes
--   calculadas em memória sobre TODAS as linhas — ainda não tinham
--   equivalente agregado server-side:
--
--     1) "Contas vencidas" (Executivo/Inteligência): quantidade e soma de
--        despesas com status pendente e data anterior a hoje — antes
--        calculado com transactions.filter(...) sobre o array completo em
--        src/lib/financeInsights.ts.
--     2) "Dízimos & Ofertas por congregação": quantia por congregação e
--        categoria (dízimo/oferta/missionária/especial) — antes calculado
--        agrupando o array completo de transactions em memória por
--        congregation_id em FinanceTithesOfferings.tsx.
--
--   Esta migration substitui (CREATE OR REPLACE, MESMA assinatura) a função
--   finance_dashboard_aggregates criada em 20260814140000, adicionando
--   exatamente 2 chaves novas ao jsonb de retorno:
--     overdue:                  { count, amount }
--     by_congregation_category: [ { congregation_id, category, type, total } ]
--
--   Nenhuma chave existente é removida ou renomeada; nenhum parâmetro é
--   adicionado; nenhuma tabela, RLS ou permissão é alterada. A função
--   permanece SEM SECURITY DEFINER (mesma RLS de is_org_finance_reader que
--   já protege toda leitura de transactions).
--
-- REVISÃO HUMANA OBRIGATÓRIA antes de aplicar em produção.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- PREFLIGHT
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.finance_dashboard_aggregates(uuid, uuid[], date, date)') IS NULL THEN
    RAISE EXCEPTION 'C3.1 preflight failed: public.finance_dashboard_aggregates ausente — aplique 20260814140000 antes desta migration';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- finance_dashboard_aggregates — CREATE OR REPLACE, mesma assinatura,
-- corpo estendido com overdue + by_congregation_category.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.finance_dashboard_aggregates(
  p_organization_id uuid,
  p_hierarchy_organization_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_totals jsonb;
  v_by_category jsonb;
  v_by_cost_center jsonb;
  v_by_month jsonb;
  v_by_organization jsonb;
  v_overdue jsonb;
  v_by_congregation_category jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;

  SELECT jsonb_build_object(
    'entries_amount', COALESCE(SUM(t.amount) FILTER (WHERE t.type NOT IN ('Saida', 'Saída')), 0),
    'exits_amount', COALESCE(SUM(t.amount) FILTER (WHERE t.type IN ('Saida', 'Saída')), 0),
    'entries_count', COUNT(*) FILTER (WHERE t.type NOT IN ('Saida', 'Saída')),
    'exits_count', COUNT(*) FILTER (WHERE t.type IN ('Saida', 'Saída')),
    'confirmed_net',
      COALESCE(SUM(t.amount) FILTER (WHERE t.status IN ('Confirmado', 'Pago') AND t.type NOT IN ('Saida', 'Saída')), 0)
      - COALESCE(SUM(t.amount) FILTER (WHERE t.status IN ('Confirmado', 'Pago') AND t.type IN ('Saida', 'Saída')), 0),
    'pending_count', COUNT(*) FILTER (WHERE t.status = 'Pendente')
  )
  INTO v_totals
  FROM public.transactions t
  WHERE t.organization_id = p_organization_id
    AND (p_date_from IS NULL OR t.date >= p_date_from)
    AND (p_date_to IS NULL OR t.date <= p_date_to);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'category', grouped.category,
    'type', grouped.norm_type,
    'total', grouped.total
  ) ORDER BY grouped.category, grouped.norm_type), '[]'::jsonb)
  INTO v_by_category
  FROM (
    SELECT
      COALESCE(t.category, 'Geral') AS category,
      CASE WHEN t.type IN ('Saida', 'Saída') THEN 'Saida' ELSE 'Entrada' END AS norm_type,
      SUM(t.amount) AS total
    FROM public.transactions t
    WHERE t.organization_id = p_organization_id
      AND (p_date_from IS NULL OR t.date >= p_date_from)
      AND (p_date_to IS NULL OR t.date <= p_date_to)
    GROUP BY COALESCE(t.category, 'Geral'), CASE WHEN t.type IN ('Saida', 'Saída') THEN 'Saida' ELSE 'Entrada' END
  ) grouped;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'cost_center_id', grouped.cost_center_id,
    'type', grouped.norm_type,
    'total', grouped.total
  )), '[]'::jsonb)
  INTO v_by_cost_center
  FROM (
    SELECT
      t.cost_center_id,
      CASE WHEN t.type IN ('Saida', 'Saída') THEN 'Saida' ELSE 'Entrada' END AS norm_type,
      SUM(t.amount) AS total
    FROM public.transactions t
    WHERE t.organization_id = p_organization_id
      AND t.cost_center_id IS NOT NULL
      AND (p_date_from IS NULL OR t.date >= p_date_from)
      AND (p_date_to IS NULL OR t.date <= p_date_to)
    GROUP BY t.cost_center_id, CASE WHEN t.type IN ('Saida', 'Saída') THEN 'Saida' ELSE 'Entrada' END
  ) grouped;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'month', grouped.month,
    'type', grouped.norm_type,
    'total', grouped.total
  ) ORDER BY grouped.month), '[]'::jsonb)
  INTO v_by_month
  FROM (
    SELECT
      to_char(t.date, 'YYYY-MM') AS month,
      CASE WHEN t.type IN ('Saida', 'Saída') THEN 'Saida' ELSE 'Entrada' END AS norm_type,
      SUM(t.amount) AS total
    FROM public.transactions t
    WHERE t.organization_id = p_organization_id
      AND (p_date_from IS NULL OR t.date >= p_date_from)
      AND (p_date_to IS NULL OR t.date <= p_date_to)
    GROUP BY to_char(t.date, 'YYYY-MM'), CASE WHEN t.type IN ('Saida', 'Saída') THEN 'Saida' ELSE 'Entrada' END
  ) grouped;

  IF p_hierarchy_organization_ids IS NOT NULL AND array_length(p_hierarchy_organization_ids, 1) > 0 THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'organization_id', grouped.organization_id,
      'entries_amount', grouped.entries_amount
    )), '[]'::jsonb)
    INTO v_by_organization
    FROM (
      SELECT
        t.organization_id,
        COALESCE(SUM(t.amount) FILTER (WHERE t.type NOT IN ('Saida', 'Saída')), 0) AS entries_amount
      FROM public.transactions t
      WHERE t.organization_id = ANY(p_hierarchy_organization_ids)
        AND (p_date_from IS NULL OR t.date >= p_date_from)
        AND (p_date_to IS NULL OR t.date <= p_date_to)
      GROUP BY t.organization_id
    ) grouped;
  ELSE
    v_by_organization := '[]'::jsonb;
  END IF;

  -- ── overdue: contas vencidas — independe de p_date_from/p_date_to. É
  -- sempre "quanto está vencido HOJE" (mesma regra de negócio que existia em
  -- financeInsights.ts sobre transactions.filter(...) no navegador), nunca
  -- uma janela de período selecionada. ───────────────────────────────────
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'amount', COALESCE(SUM(t.amount), 0)
  )
  INTO v_overdue
  FROM public.transactions t
  WHERE t.organization_id = p_organization_id
    AND t.type IN ('Saida', 'Saída')
    AND t.status NOT IN ('Pago', 'Confirmado')
    AND t.date < CURRENT_DATE;

  -- ── by_congregation_category: alimenta "Dízimos & Ofertas por
  -- congregação" sem baixar transações — mesma janela de data de
  -- totals/by_category/by_month acima. ────────────────────────────────────
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'congregation_id', grouped.congregation_id,
    'category', grouped.category,
    'type', grouped.norm_type,
    'total', grouped.total
  )), '[]'::jsonb)
  INTO v_by_congregation_category
  FROM (
    SELECT
      t.congregation_id,
      COALESCE(t.category, 'Geral') AS category,
      CASE WHEN t.type IN ('Saida', 'Saída') THEN 'Saida' ELSE 'Entrada' END AS norm_type,
      SUM(t.amount) AS total
    FROM public.transactions t
    WHERE t.organization_id = p_organization_id
      AND t.congregation_id IS NOT NULL
      AND (p_date_from IS NULL OR t.date >= p_date_from)
      AND (p_date_to IS NULL OR t.date <= p_date_to)
    GROUP BY t.congregation_id, COALESCE(t.category, 'Geral'), CASE WHEN t.type IN ('Saida', 'Saída') THEN 'Saida' ELSE 'Entrada' END
  ) grouped;

  RETURN jsonb_build_object(
    'totals', v_totals,
    'by_category', v_by_category,
    'by_cost_center', v_by_cost_center,
    'by_month', v_by_month,
    'by_organization', v_by_organization,
    'overdue', v_overdue,
    'by_congregation_category', v_by_congregation_category
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finance_dashboard_aggregates(uuid, uuid[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_dashboard_aggregates(uuid, uuid[], date, date) TO authenticated;

COMMENT ON FUNCTION public.finance_dashboard_aggregates(uuid, uuid[], date, date) IS
  'Leitura agregada (SUM/COUNT) de public.transactions para os cards e '
  'gráficos do Financeiro — nunca baixa linha a linha para o navegador. Sem '
  'SECURITY DEFINER: roda com os privilégios de quem chama, sujeita à mesma '
  'RLS (is_org_finance_reader) que já protege toda leitura de transactions. '
  'overdue e by_congregation_category foram adicionados em 20260814150000 '
  '(CORREÇÃO C3.1) para eliminar os últimos fetch-all das abas Executivo, '
  'Dízimos & Ofertas e Inteligência.';

-- =============================================================================
-- FIM DA MIGRATION
-- Nome: 20260814150000_finance_dashboard_aggregates_extended.sql
-- Revisão humana obrigatória antes de aplicar em produção Supabase.
-- =============================================================================
