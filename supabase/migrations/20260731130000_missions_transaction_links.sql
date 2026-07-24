-- ============================================================================
-- Migration: missions_transaction_links
-- Timestamp: 20260731130000
-- OPERAÇÃO 4 — Missões completa sobre a fundação revisada do Ecclesia
-- ============================================================================
--
-- WinTechi: "Lançamentos das Contribuições" + "Movimentação de Pagamentos" +
-- "Emissão de Recibos" (base). Vínculo entre uma transação financeira REAL
-- (public.transactions) e EXATAMENTE um contexto missionário — nunca um
-- caixa/saldo/conta paralelo. O valor monetário permanece exclusivamente em
-- public.transactions.
--
-- Regra de capability (contrato §6): toda operação financeira exige
-- finance.read/finance.write REAIS na organização da transação E
-- missions.finance REAL na organização do contexto missionário — nunca uma
-- capability substitui a outra.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.transactions') IS NULL THEN v_missing := array_append(v_missing, 'public.transactions'); END IF;
  IF to_regclass('public.campaigns') IS NULL THEN v_missing := array_append(v_missing, 'public.campaigns'); END IF;
  IF to_regclass('public.missions_missionaries') IS NULL THEN v_missing := array_append(v_missing, 'public.missions_missionaries'); END IF;
  IF to_regclass('public.missions_projects') IS NULL THEN v_missing := array_append(v_missing, 'public.missions_projects'); END IF;
  IF to_regclass('public.missions_commitment_installments') IS NULL THEN
    v_missing := array_append(v_missing, 'public.missions_commitment_installments');
  END IF;
  IF to_regprocedure('public._recompute_missions_installment_status(uuid)') IS NULL THEN
    v_missing := array_append(v_missing, 'public._recompute_missions_installment_status()');
  END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'missions_transaction_links preflight failed; missing: %', array_to_string(v_missing, ', ');
  END IF;
END;
$$;

-- ── missions_transaction_links ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.missions_transaction_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  -- Snapshot da organização real da transação (auditoria/índice; a
  -- AUTORIZAÇÃO sempre reconfirma dinamicamente via JOIN em transactions).
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,

  link_type text NOT NULL CHECK (link_type IN ('compromisso', 'projeto', 'missionario', 'campanha', 'outro')),

  installment_id uuid REFERENCES public.missions_commitment_installments(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.missions_projects(id) ON DELETE SET NULL,
  missionary_id uuid REFERENCES public.missions_missionaries(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,

  notes text,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Exatamente UM contexto válido — nunca dois, nunca nenhum.
  CHECK (num_nonnulls(installment_id, project_id, missionary_id, campaign_id) = 1)
);

-- Uma transação só pode ter UM vínculo missionário (evita contar o mesmo
-- lançamento financeiro duas vezes em contextos diferentes).
CREATE UNIQUE INDEX IF NOT EXISTS missions_transaction_links_transaction_idx
  ON public.missions_transaction_links (transaction_id);

CREATE INDEX IF NOT EXISTS idx_missions_tx_links_installment ON public.missions_transaction_links (installment_id);
CREATE INDEX IF NOT EXISTS idx_missions_tx_links_project ON public.missions_transaction_links (project_id);
CREATE INDEX IF NOT EXISTS idx_missions_tx_links_missionary ON public.missions_transaction_links (missionary_id);
CREATE INDEX IF NOT EXISTS idx_missions_tx_links_campaign ON public.missions_transaction_links (campaign_id);

CREATE UNIQUE INDEX IF NOT EXISTS missions_transaction_links_legacy_unique_idx
  ON public.missions_transaction_links (organization_id, legacy_source, COALESCE(legacy_module, ''), legacy_code)
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

ALTER TABLE public.missions_transaction_links ENABLE ROW LEVEL SECURITY;

-- Leitura exige AMBAS as capabilities reais — finance.read na organização
-- da transação E missions.read na organização do contexto missionário.
DROP POLICY IF EXISTS "missions_transaction_links capability select" ON public.missions_transaction_links;
CREATE POLICY "missions_transaction_links capability select" ON public.missions_transaction_links
FOR SELECT TO authenticated
USING (
  public.has_org_access_permission(auth.uid(), organization_id, 'finance.read')
  AND (
    (
      installment_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.missions_commitment_installments i
        WHERE i.id = missions_transaction_links.installment_id
          AND public.has_org_access_permission(auth.uid(), i.organization_id, 'missions.read')
      )
    )
    OR (
      project_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.missions_projects p
        WHERE p.id = missions_transaction_links.project_id
          AND public.has_org_access_permission(auth.uid(), p.organization_id, 'missions.read')
      )
    )
    OR (
      missionary_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.missions_missionaries m
        WHERE m.id = missions_transaction_links.missionary_id
          AND public.has_org_access_permission(auth.uid(), m.organization_id, 'missions.read')
      )
    )
    OR (
      campaign_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.campaigns c
        WHERE c.id = missions_transaction_links.campaign_id
          AND public.has_org_access_permission(auth.uid(), c.organization_id, 'missions.read')
      )
    )
  )
);

-- Escrita somente por RPC. Sem policy de DELETE/UPDATE: vínculo é trilha de
-- auditoria (desvincular usa a RPC unlink_missions_transaction, que apaga
-- explicitamente e recomputa a parcela afetada).
REVOKE INSERT, UPDATE, DELETE ON public.missions_transaction_links FROM authenticated;
GRANT SELECT ON public.missions_transaction_links TO authenticated;

CREATE OR REPLACE FUNCTION public.link_missions_transaction(
  p_transaction_id uuid,
  p_link_type text,
  p_installment_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_missionary_id uuid DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
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

  -- Capability financeira SEMPRE na organização real da transação.
  IF NOT public.has_org_access_permission(auth.uid(), v_transaction.organization_id, 'finance.write') THEN
    RAISE EXCEPTION 'access denied: finance.write is required to link a transaction';
  END IF;

  IF p_link_type NOT IN ('compromisso', 'projeto', 'missionario', 'campanha', 'outro') THEN
    RAISE EXCEPTION 'invalid link type: %', p_link_type;
  END IF;

  IF num_nonnulls(p_installment_id, p_project_id, p_missionary_id, p_campaign_id) <> 1 THEN
    RAISE EXCEPTION 'exactly one missions context must be informed';
  END IF;

  IF p_installment_id IS NOT NULL THEN
    SELECT organization_id INTO v_context_org FROM public.missions_commitment_installments WHERE id = p_installment_id;
  ELSIF p_project_id IS NOT NULL THEN
    SELECT organization_id INTO v_context_org FROM public.missions_projects WHERE id = p_project_id;
  ELSIF p_missionary_id IS NOT NULL THEN
    SELECT organization_id INTO v_context_org FROM public.missions_missionaries WHERE id = p_missionary_id;
  ELSE
    SELECT organization_id INTO v_context_org FROM public.campaigns WHERE id = p_campaign_id;
  END IF;

  IF v_context_org IS NULL THEN RAISE EXCEPTION 'missions context not found'; END IF;

  -- Capability de Missões SEMPRE na organização real do contexto missionário
  -- — NUNCA substituída pela capability financeira acima.
  IF NOT public.has_org_access_permission(auth.uid(), v_context_org, 'missions.finance') THEN
    RAISE EXCEPTION 'access denied: missions.finance is required in the missions context';
  END IF;

  -- Caixa central pode receber por uma unidade descendente; uma unidade
  -- local nunca deve anexar sua transação a um contexto missionário superior.
  IF NOT public.is_organization_descendant_or_self(v_transaction.organization_id, v_context_org) THEN
    RAISE EXCEPTION 'missions context is outside the transaction organization scope';
  END IF;

  IF EXISTS (SELECT 1 FROM public.missions_transaction_links WHERE transaction_id = p_transaction_id) THEN
    RAISE EXCEPTION 'transaction is already linked to a missions context';
  END IF;

  INSERT INTO public.missions_transaction_links (
    transaction_id, organization_id, link_type, installment_id, project_id,
    missionary_id, campaign_id, notes, created_by
  ) VALUES (
    p_transaction_id, v_transaction.organization_id, p_link_type, p_installment_id, p_project_id,
    p_missionary_id, p_campaign_id, NULLIF(btrim(p_notes), ''), auth.uid()
  )
  RETURNING id INTO v_id;

  IF p_installment_id IS NOT NULL THEN
    PERFORM public._recompute_missions_installment_status(p_installment_id);
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.link_missions_transaction(
  uuid, text, uuid, uuid, uuid, uuid, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_missions_transaction(
  uuid, text, uuid, uuid, uuid, uuid, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.unlink_missions_transaction(p_link_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.missions_transaction_links%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_row FROM public.missions_transaction_links WHERE id = p_link_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'link not found'; END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_row.organization_id, 'finance.write') THEN
    RAISE EXCEPTION 'access denied: finance.write is required to unlink a transaction';
  END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_row.organization_id, 'missions.finance') THEN
    RAISE EXCEPTION 'access denied: missions.finance is required to unlink a transaction';
  END IF;

  DELETE FROM public.missions_transaction_links WHERE id = p_link_id;

  IF v_row.installment_id IS NOT NULL THEN
    PERFORM public._recompute_missions_installment_status(v_row.installment_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.unlink_missions_transaction(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlink_missions_transaction(uuid) TO authenticated;

-- ── Leitura consolidada: transações reais filtradas por contexto ────────
-- Visão sobre public.transactions, nunca cópia dos valores. WinTechi:
-- "Movimentação de Pagamentos" (por contexto).
CREATE OR REPLACE FUNCTION public.list_missions_linked_transactions(
  p_installment_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_missionary_id uuid DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL
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
  IF num_nonnulls(p_installment_id, p_project_id, p_missionary_id, p_campaign_id) <> 1 THEN
    RAISE EXCEPTION 'exactly one missions context must be informed';
  END IF;

  IF p_installment_id IS NOT NULL THEN
    SELECT organization_id INTO v_org_id FROM public.missions_commitment_installments WHERE id = p_installment_id;
  ELSIF p_project_id IS NOT NULL THEN
    SELECT organization_id INTO v_org_id FROM public.missions_projects WHERE id = p_project_id;
  ELSIF p_missionary_id IS NOT NULL THEN
    SELECT organization_id INTO v_org_id FROM public.missions_missionaries WHERE id = p_missionary_id;
  ELSE
    SELECT organization_id INTO v_org_id FROM public.campaigns WHERE id = p_campaign_id;
  END IF;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'context not found'; END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_org_id, 'missions.read')
     OR NOT public.has_org_access_permission(auth.uid(), v_org_id, 'finance.read') THEN
    RAISE EXCEPTION 'access denied: missions.read and finance.read are both required';
  END IF;

  RETURN QUERY
  SELECT l.id, t.id, l.link_type, t.amount, t.type, t.date, t.description, t.status
  FROM public.missions_transaction_links l
  JOIN public.transactions t ON t.id = l.transaction_id
  WHERE (p_installment_id IS NULL OR l.installment_id = p_installment_id)
    AND (p_project_id IS NULL OR l.project_id = p_project_id)
    AND (p_missionary_id IS NULL OR l.missionary_id = p_missionary_id)
    AND (p_campaign_id IS NULL OR l.campaign_id = p_campaign_id)
    AND public.has_org_access_permission(auth.uid(), l.organization_id, 'finance.read')
    AND public.has_org_access_permission(auth.uid(), t.organization_id, 'finance.read')
  ORDER BY t.date DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_missions_linked_transactions(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_missions_linked_transactions(uuid, uuid, uuid, uuid) TO authenticated;

-- ── Trigger: recomputa a parcela quando um vínculo é removido em CASCADE ─
-- (ex.: exclusão administrativa da própria transação por outro fluxo do
-- Financeiro geral — fora do escopo de Missões alterar, mas a parcela
-- precisa refletir a ausência do pagamento).
CREATE OR REPLACE FUNCTION public._missions_transaction_links_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.installment_id IS NOT NULL THEN
    PERFORM public._recompute_missions_installment_status(OLD.installment_id);
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS missions_transaction_links_after_delete ON public.missions_transaction_links;
CREATE TRIGGER missions_transaction_links_after_delete
AFTER DELETE ON public.missions_transaction_links
FOR EACH ROW EXECUTE FUNCTION public._missions_transaction_links_after_delete();

REVOKE ALL ON FUNCTION public._missions_transaction_links_after_delete() FROM PUBLIC, anon, authenticated;

-- ── Verificação final ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'missions_transaction_links') THEN
    RAISE EXCEPTION 'Migration missions_transaction_links: tabela nao foi criada';
  END IF;
  IF to_regprocedure('public.link_missions_transaction(uuid,text,uuid,uuid,uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Migration missions_transaction_links: RPC link_missions_transaction nao foi criada';
  END IF;
  IF to_regprocedure('public.unlink_missions_transaction(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Migration missions_transaction_links: RPC unlink_missions_transaction nao foi criada';
  END IF;
  RAISE NOTICE 'Migration missions_transaction_links: tabela, RLS e RPCs financeiras confirmadas ✓';
END $$;

COMMIT;
