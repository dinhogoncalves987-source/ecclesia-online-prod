-- ============================================================================
-- Migration: theology_finance_links_and_permissions
-- Timestamp: 20260730140000
-- OPERAÇÃO 3 — Teologia completa sobre a fundação revisada do Ecclesia
-- ============================================================================
--
-- Vínculo entre uma transação financeira REAL (public.transactions) e uma
-- matrícula/período de Teologia — nunca um caixa, saldo, conta ou fechamento
-- paralelo. O valor monetário continua exclusivamente em
-- public.transactions; esta tabela apenas documenta o CONTEXTO acadêmico de
-- uma transação já lançada no Financeiro real.
--
-- Regra de capability (contrato §6.5 da operação): operações financeiras
-- exigem finance.read/finance.write REAIS — theology.manage NUNCA substitui
-- ou basta isoladamente para ler/escrever um vínculo financeiro.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.transactions') IS NULL THEN
    RAISE EXCEPTION 'theology_finance_links_and_permissions preflight failed: public.transactions nao existe';
  END IF;
  IF to_regclass('public.theology_enrollments') IS NULL THEN
    RAISE EXCEPTION 'theology_finance_links_and_permissions preflight failed: theology_enrollments nao existe';
  END IF;
  IF to_regclass('public.theology_periods') IS NULL THEN
    RAISE EXCEPTION 'theology_finance_links_and_permissions preflight failed: theology_periods nao existe';
  END IF;
END;
$$;

-- ── theology_transaction_links (contexto acadêmico de uma transação real) ─
CREATE TABLE IF NOT EXISTS public.theology_transaction_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  -- Snapshot da organização da transação, validada contra a organização do
  -- vínculo acadêmico no momento da criação (auditoria/índice; a
  -- AUTORIZAÇÃO real sempre reconfirma a organização real da transação).
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  enrollment_id uuid REFERENCES public.theology_enrollments(id) ON DELETE SET NULL,
  period_id uuid REFERENCES public.theology_periods(id) ON DELETE SET NULL,

  link_type text NOT NULL DEFAULT 'matricula'
    CHECK (link_type IN ('matricula', 'mensalidade', 'contribuicao', 'material', 'outro')),
  notes text,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CHECK ((enrollment_id IS NOT NULL) <> (period_id IS NOT NULL))
);

-- Uma transação só pode ter UM vínculo acadêmico (evita contar a mesma
-- entrada financeira duas vezes em contextos diferentes).
CREATE UNIQUE INDEX IF NOT EXISTS theology_transaction_links_transaction_idx
  ON public.theology_transaction_links (transaction_id);

CREATE INDEX IF NOT EXISTS idx_theology_transaction_links_enrollment
  ON public.theology_transaction_links (enrollment_id);
CREATE INDEX IF NOT EXISTS idx_theology_transaction_links_period
  ON public.theology_transaction_links (period_id);

CREATE UNIQUE INDEX IF NOT EXISTS theology_transaction_links_legacy_unique_idx
  ON public.theology_transaction_links (organization_id, legacy_source, COALESCE(legacy_module, ''), legacy_code)
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

ALTER TABLE public.theology_transaction_links ENABLE ROW LEVEL SECURITY;

-- Leitura exige AMBAS as capabilities reais — nunca theology.manage sozinho
-- para ver dado financeiro, nem finance.read sozinho para ver contexto
-- acadêmico (a interseção é o vínculo).
DROP POLICY IF EXISTS "theology_transaction_links capability select" ON public.theology_transaction_links;
CREATE POLICY "theology_transaction_links capability select" ON public.theology_transaction_links
FOR SELECT TO authenticated
USING (
  public.has_org_access_permission(auth.uid(), organization_id, 'finance.read')
  AND (
    (
      enrollment_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.theology_enrollments e
        JOIN public.theology_classes c ON c.id = e.class_id
        WHERE e.id = theology_transaction_links.enrollment_id
          AND public.has_org_access_permission(auth.uid(), c.organization_id, 'theology.read')
      )
    )
    OR (
      period_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.theology_periods p
        WHERE p.id = theology_transaction_links.period_id
          AND public.has_org_access_permission(auth.uid(), p.organization_id, 'theology.read')
      )
    )
  )
);

-- Escrita somente por RPC (valida transação real, escopo e ambas as
-- capabilities). Sem policy de DELETE: vínculo é trilha de auditoria.
REVOKE INSERT, UPDATE, DELETE ON public.theology_transaction_links FROM authenticated;
GRANT SELECT ON public.theology_transaction_links TO authenticated;

CREATE OR REPLACE FUNCTION public.link_theology_transaction(
  p_transaction_id uuid,
  p_link_type text,
  p_enrollment_id uuid DEFAULT NULL,
  p_period_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_transaction public.transactions%ROWTYPE;
  v_context_org uuid;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_transaction FROM public.transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'transaction not found'; END IF;

  -- O escopo financeiro é sempre a organização REAL da transação.
  IF NOT public.has_org_access_permission(auth.uid(), v_transaction.organization_id, 'finance.write') THEN
    RAISE EXCEPTION 'access denied: finance.write is required to link a transaction';
  END IF;

  IF p_link_type NOT IN ('matricula', 'mensalidade', 'contribuicao', 'material', 'outro') THEN
    RAISE EXCEPTION 'invalid link type: %', p_link_type;
  END IF;

  IF (p_enrollment_id IS NULL) = (p_period_id IS NULL) THEN
    RAISE EXCEPTION 'exactly one of enrollment_id or period_id must be informed';
  END IF;

  IF p_enrollment_id IS NOT NULL THEN
    SELECT c.organization_id INTO v_context_org
    FROM public.theology_enrollments e
    JOIN public.theology_classes c ON c.id = e.class_id
    WHERE e.id = p_enrollment_id;
    IF v_context_org IS NULL THEN RAISE EXCEPTION 'enrollment not found'; END IF;
  ELSE
    SELECT organization_id INTO v_context_org
    FROM public.theology_periods
    WHERE id = p_period_id;
    IF v_context_org IS NULL THEN RAISE EXCEPTION 'period not found'; END IF;
  END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_context_org, 'theology.manage') THEN
    RAISE EXCEPTION 'access denied: theology.manage is required in the academic context';
  END IF;

  -- Caixa central pode receber por uma unidade descendente; uma unidade
  -- local nunca deve anexar sua transação a um contexto acadêmico superior.
  IF NOT public.is_organization_descendant_or_self(
    v_transaction.organization_id,
    v_context_org
  ) THEN
    RAISE EXCEPTION 'academic context is outside the transaction organization scope';
  END IF;

  IF EXISTS (SELECT 1 FROM public.theology_transaction_links WHERE transaction_id = p_transaction_id) THEN
    RAISE EXCEPTION 'transaction is already linked to an academic context';
  END IF;

  INSERT INTO public.theology_transaction_links (
    transaction_id, organization_id, enrollment_id, period_id, link_type, notes, created_by
  ) VALUES (
    p_transaction_id, v_transaction.organization_id, p_enrollment_id, p_period_id,
    p_link_type, NULLIF(btrim(p_notes), ''), auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.link_theology_transaction(uuid, text, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_theology_transaction(uuid, text, uuid, uuid, text) TO authenticated;

-- Leitura consolidada: transações reais filtradas por contexto acadêmico —
-- a movimentação é uma VISÃO sobre public.transactions, nunca uma cópia dos
-- valores. Continua exigindo as duas capabilities (garantido pela RLS de
-- theology_transaction_links; a junção com transactions usa a RLS própria
-- da tabela transactions, que já exige finance.read).
CREATE OR REPLACE FUNCTION public.list_theology_linked_transactions(
  p_enrollment_id uuid DEFAULT NULL,
  p_period_id uuid DEFAULT NULL
)
RETURNS TABLE (
  link_id uuid,
  transaction_id uuid,
  link_type text,
  amount numeric,
  transaction_type text,
  transaction_date date,
  transaction_description text,
  transaction_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF (p_enrollment_id IS NULL) = (p_period_id IS NULL) THEN
    RAISE EXCEPTION 'exactly one of enrollment_id or period_id must be informed';
  END IF;

  IF p_enrollment_id IS NOT NULL THEN
    SELECT c.organization_id INTO v_org_id
    FROM public.theology_enrollments e
    JOIN public.theology_classes c ON c.id = e.class_id
    WHERE e.id = p_enrollment_id;
  ELSE
    SELECT organization_id INTO v_org_id FROM public.theology_periods WHERE id = p_period_id;
  END IF;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'context not found'; END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_org_id, 'theology.read')
     OR NOT public.has_org_access_permission(auth.uid(), v_org_id, 'finance.read') THEN
    RAISE EXCEPTION 'access denied: theology.read and finance.read are both required';
  END IF;

  RETURN QUERY
  SELECT l.id, t.id, l.link_type, t.amount, t.type, t.date, t.description, t.status
  FROM public.theology_transaction_links l
  JOIN public.transactions t ON t.id = l.transaction_id
  WHERE (p_enrollment_id IS NULL OR l.enrollment_id = p_enrollment_id)
    AND (p_period_id IS NULL OR l.period_id = p_period_id)
    AND public.has_org_access_permission(auth.uid(), l.organization_id, 'finance.read')
    AND public.has_org_access_permission(auth.uid(), t.organization_id, 'finance.read')
    AND (
      (
        l.enrollment_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.theology_enrollments e
          JOIN public.theology_classes c ON c.id = e.class_id
          WHERE e.id = l.enrollment_id
            AND public.has_org_access_permission(auth.uid(), c.organization_id, 'theology.read')
        )
      )
      OR (
        l.period_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.theology_periods p
          WHERE p.id = l.period_id
            AND public.has_org_access_permission(auth.uid(), p.organization_id, 'theology.read')
        )
      )
    )
  ORDER BY t.date DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_theology_linked_transactions(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_theology_linked_transactions(uuid, uuid) TO authenticated;

-- ── Verificação final ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'theology_transaction_links') THEN
    RAISE EXCEPTION 'Migration theology_finance_links_and_permissions: tabela theology_transaction_links nao foi criada';
  END IF;
  IF to_regprocedure('public.link_theology_transaction(uuid,text,uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Migration theology_finance_links_and_permissions: RPC link_theology_transaction nao foi criada';
  END IF;
  RAISE NOTICE 'Migration theology_finance_links_and_permissions: tabela, RLS e RPCs financeiras confirmadas ✓';
END $$;

COMMIT;
