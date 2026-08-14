-- =============================================================================
-- FINANCE — DESEMPENHO E AGREGAÇÕES SERVER-SIDE (FASE 1D-C3)
-- Migration: 20260814140000_finance_dashboard_aggregates.sql
--
-- OBJETIVO:
--   Eliminar a dependência de "baixar todas as transactions" para calcular
--   totais/indicadores exibidos no Financeiro (Tesouraria/Visão Geral,
--   Executivo, Orçamento), e criar índice de suporte para paginação
--   server-side estável e eficiente da listagem de lançamentos.
--
--   Não altera nenhuma tabela existente, nenhuma RLS, nenhuma permissão.
--   Cria apenas:
--     1) 1 índice novo em public.transactions para paginação estável por
--        (organization_id, date, raw_timestamp, id) — a mesma ordenação
--        usada pela listagem server-side da Tesouraria.
--     2) 1 função de leitura agregada — finance_dashboard_aggregates —
--        SEM SECURITY DEFINER (roda com os privilégios de quem chama, a
--        MESMA RLS de sempre em public.transactions:
--        is_org_finance_reader, já usada por toda leitura direta de
--        transactions hoje). Nunca cria uma permissão nova; nunca contorna
--        RLS; nunca aceita organização sem que a própria RLS já a filtre.
--
-- POR QUE SEM SECURITY DEFINER:
--   Todas as RPCs financeiras destrutivas deste projeto (import/finalize/
--   delete/reset) precisam de SECURITY DEFINER porque escrevem e precisam
--   verificar permissão administrativa explicitamente. Esta função é
--   somente leitura e agregada — deixando-a SECURITY INVOKER (padrão,
--   omitido), o Postgres aplica a MESMA RLS de SELECT que já existe em
--   public.transactions automaticamente, sem duplicar nenhuma regra de
--   autorização aqui.
--
-- USO:
--   finance_dashboard_aggregates(p_organization_id, p_hierarchy_organization_ids, p_date_from, p_date_to)
--   retorna jsonb com:
--     totals:         { entries_amount, exits_amount, entries_count, exits_count, confirmed_net, pending_count }
--     by_category:    [ { category, type, total } ]         -- alimenta dízimos/ofertas/campanhas/gráficos
--     by_cost_center: [ { cost_center_id, type, total } ]    -- alimenta "Orçamento" (realizado por centro de custo)
--     by_month:       [ { month, type, total } ]             -- alimenta gráficos de fluxo mensal/acumulado
--     by_organization:[ { organization_id, entries_amount } ] -- alimenta "Consolidado por hierarquia" (Executivo)
--   p_hierarchy_organization_ids é opcional — quando omitido, by_organization
--   volta '[]'::jsonb (nenhuma consulta extra é disparada).
--   p_date_from/p_date_to são opcionais — quando omitidos, agregam todo o
--   histórico da organização (uso: totais gerais); quando informados,
--   restringem a um intervalo (uso: "este mês" para dízimos/ofertas/orçamento
--   mensal).
--
-- REVISÃO HUMANA OBRIGATÓRIA antes de aplicar em produção.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- PREFLIGHT
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.transactions') IS NULL THEN
    RAISE EXCEPTION '1D-C3 preflight failed: public.transactions ausente';
  END IF;
  IF to_regprocedure('public.is_org_finance_reader(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION '1D-C3 preflight failed: is_org_finance_reader ausente — permissão de leitura financeira já existente não encontrada';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 1: índice de suporte à paginação estável da listagem
-- (organization_id, date DESC, raw_timestamp DESC, id DESC) — mesma ordem
-- usada pela query server-side de TransactionList (data contábil, depois
-- carimbo de data/hora, depois id como desempate final e sempre único).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_transactions_org_date_rawts_id
  ON public.transactions (organization_id, date DESC, raw_timestamp DESC, id DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 2: finance_dashboard_aggregates — leitura agregada, SEM SECURITY
-- DEFINER, RLS de sempre.
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

  RETURN jsonb_build_object(
    'totals', v_totals,
    'by_category', v_by_category,
    'by_cost_center', v_by_cost_center,
    'by_month', v_by_month,
    'by_organization', v_by_organization
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
  'p_hierarchy_organization_ids alimenta o "Consolidado por hierarquia" '
  '(Executivo) com 1 única consulta agregada em vez de 1 consulta completa '
  'por unidade. p_date_from/p_date_to permitem escopo mensal (dízimos, '
  'ofertas, orçamento) sem novas linhas de código SQL.';

-- =============================================================================
-- FIM DA MIGRATION
-- Nome: 20260814140000_finance_dashboard_aggregates.sql
-- Revisão humana obrigatória antes de aplicar em produção Supabase.
-- =============================================================================
