-- ============================================================================
-- Migration: missions_supporters_commitments
-- Timestamp: 20260731120000
-- OPERAÇÃO 4 — Missões completa sobre a fundação revisada do Ecclesia
-- ============================================================================
--
-- WinTechi: "Contribuintes" + "Mensalidades a Receber".
--
-- missions_supporters = papel de apoiador sobre public.members (um registro
-- por membro por organização — o mesmo membro pode ter vários compromissos).
-- missions_supporter_commitments = obrigação/compromisso PREVISTO com UM
-- contexto (missionário OU projeto OU campanha) — nunca um lançamento real.
-- missions_commitment_installments = parcela esperada de um compromisso.
--
-- REGRA CRÍTICA (contrato §7/§9 da operação): uma parcela nunca pode ser
-- marcada como paga/parcial manualmente. status/paid_amount só são escritos
-- por public._recompute_missions_installment_status(), chamada por um
-- trigger em missions_transaction_links (migration seguinte) quando uma
-- transação REAL é vinculada/desvinculada. A única escrita manual permitida
-- é cancelado/isento, e apenas quando ainda não há valor pago.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.members') IS NULL THEN v_missing := array_append(v_missing, 'public.members'); END IF;
  IF to_regclass('public.organizations') IS NULL THEN v_missing := array_append(v_missing, 'public.organizations'); END IF;
  IF to_regclass('public.campaigns') IS NULL THEN v_missing := array_append(v_missing, 'public.campaigns'); END IF;
  IF to_regclass('public.missions_missionaries') IS NULL THEN v_missing := array_append(v_missing, 'public.missions_missionaries'); END IF;
  IF to_regclass('public.missions_projects') IS NULL THEN v_missing := array_append(v_missing, 'public.missions_projects'); END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'missions_supporters_commitments preflight failed; missing: %', array_to_string(v_missing, ', ');
  END IF;
END;
$$;

-- ── missions_supporters ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.missions_supporters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,

  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'encerrado')),
  contact_preference text NOT NULL DEFAULT 'nenhum'
    CHECK (contact_preference IN ('email', 'whatsapp', 'telefone', 'nenhum')),
  notes text,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (member_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_missions_supporters_org_status ON public.missions_supporters (organization_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS missions_supporters_legacy_unique_idx
  ON public.missions_supporters (organization_id, legacy_source, COALESCE(legacy_module, ''), legacy_code)
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

DROP TRIGGER IF EXISTS update_missions_supporters_updated_at ON public.missions_supporters;
CREATE TRIGGER update_missions_supporters_updated_at
BEFORE UPDATE ON public.missions_supporters
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public._missions_supporters_validate_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member_org uuid;
BEGIN
  SELECT COALESCE(congregation_id, sector_id, organization_id) INTO v_member_org
  FROM public.members WHERE id = NEW.member_id;

  IF v_member_org IS NULL THEN
    RAISE EXCEPTION 'supporter member not found or has no organization';
  END IF;

  IF NOT public.is_organization_descendant_or_self(NEW.organization_id, v_member_org) THEN
    RAISE EXCEPTION 'supporter member is outside the informed organization scope';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._missions_supporters_validate_scope() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS missions_supporters_validate_scope ON public.missions_supporters;
CREATE TRIGGER missions_supporters_validate_scope
BEFORE INSERT OR UPDATE ON public.missions_supporters
FOR EACH ROW EXECUTE FUNCTION public._missions_supporters_validate_scope();

ALTER TABLE public.missions_supporters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "missions_supporters capability select" ON public.missions_supporters;
CREATE POLICY "missions_supporters capability select" ON public.missions_supporters
FOR SELECT TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'missions.read'));

REVOKE INSERT, UPDATE, DELETE ON public.missions_supporters FROM authenticated;
GRANT SELECT ON public.missions_supporters TO authenticated;

CREATE OR REPLACE FUNCTION public.create_missions_supporter(
  p_member_id uuid,
  p_organization_id uuid,
  p_contact_preference text DEFAULT 'nenhum',
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  IF NOT public.has_org_access_permission(auth.uid(), p_organization_id, 'missions.manage') THEN
    RAISE EXCEPTION 'access denied to register a supporter';
  END IF;

  IF COALESCE(p_contact_preference, 'nenhum') NOT IN ('email', 'whatsapp', 'telefone', 'nenhum') THEN
    RAISE EXCEPTION 'invalid contact preference: %', p_contact_preference;
  END IF;

  INSERT INTO public.missions_supporters (member_id, organization_id, contact_preference, notes, created_by)
  VALUES (p_member_id, p_organization_id, COALESCE(p_contact_preference, 'nenhum'), NULLIF(btrim(p_notes), ''), auth.uid())
  ON CONFLICT (member_id, organization_id) DO UPDATE SET
    contact_preference = EXCLUDED.contact_preference,
    notes = COALESCE(EXCLUDED.notes, public.missions_supporters.notes)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_missions_supporter(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_missions_supporter(uuid, uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_missions_supporter_status(
  p_supporter_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.missions_supporters%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_row FROM public.missions_supporters WHERE id = p_supporter_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'supporter not found'; END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_row.organization_id, 'missions.manage') THEN
    RAISE EXCEPTION 'access denied to update this supporter';
  END IF;

  IF p_status NOT IN ('ativo', 'inativo', 'encerrado') THEN
    RAISE EXCEPTION 'invalid supporter status: %', p_status;
  END IF;

  IF p_status = v_row.status THEN
    RETURN;
  END IF;

  IF NOT (
    (v_row.status = 'ativo' AND p_status IN ('inativo', 'encerrado'))
    OR (v_row.status = 'inativo' AND p_status IN ('ativo', 'encerrado'))
  ) THEN
    RAISE EXCEPTION 'invalid supporter status transition: % -> %', v_row.status, p_status;
  END IF;

  UPDATE public.missions_supporters SET status = p_status WHERE id = p_supporter_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_missions_supporter_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_missions_supporter_status(uuid, text) TO authenticated;

-- ── missions_supporter_commitments ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.missions_supporter_commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supporter_id uuid NOT NULL REFERENCES public.missions_supporters(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,

  missionary_id uuid REFERENCES public.missions_missionaries(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.missions_projects(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,

  periodicity text NOT NULL DEFAULT 'mensal'
    CHECK (periodicity IN ('unica', 'mensal', 'trimestral', 'semestral', 'anual')),
  committed_amount numeric(14,2) NOT NULL CHECK (committed_amount > 0),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'pausado', 'encerrado', 'cancelado')),
  notes text,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (end_date IS NULL OR end_date >= start_date),
  -- Exatamente UM contexto — nunca dois, nunca nenhum (contrato §7/§8).
  CHECK (num_nonnulls(missionary_id, project_id, campaign_id) = 1)
);

CREATE INDEX IF NOT EXISTS idx_missions_commitments_supporter ON public.missions_supporter_commitments (supporter_id, status);
CREATE INDEX IF NOT EXISTS idx_missions_commitments_missionary ON public.missions_supporter_commitments (missionary_id);
CREATE INDEX IF NOT EXISTS idx_missions_commitments_project ON public.missions_supporter_commitments (project_id);
CREATE INDEX IF NOT EXISTS idx_missions_commitments_campaign ON public.missions_supporter_commitments (campaign_id);

CREATE UNIQUE INDEX IF NOT EXISTS missions_commitments_legacy_unique_idx
  ON public.missions_supporter_commitments (organization_id, legacy_source, COALESCE(legacy_module, ''), legacy_code)
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

DROP TRIGGER IF EXISTS update_missions_commitments_updated_at ON public.missions_supporter_commitments;
CREATE TRIGGER update_missions_commitments_updated_at
BEFORE UPDATE ON public.missions_supporter_commitments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.missions_supporter_commitments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "missions_commitments capability select" ON public.missions_supporter_commitments;
CREATE POLICY "missions_commitments capability select" ON public.missions_supporter_commitments
FOR SELECT TO authenticated
USING (
  public.has_org_access_permission(auth.uid(), organization_id, 'missions.read')
  AND public.has_org_access_permission(auth.uid(), organization_id, 'finance.read')
);

REVOKE INSERT, UPDATE, DELETE ON public.missions_supporter_commitments FROM authenticated;
GRANT SELECT ON public.missions_supporter_commitments TO authenticated;

CREATE OR REPLACE FUNCTION public.create_missions_commitment(
  p_supporter_id uuid,
  p_periodicity text,
  p_committed_amount numeric,
  p_missionary_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_start_date date DEFAULT CURRENT_DATE,
  p_end_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_supporter public.missions_supporters%ROWTYPE;
  v_context_org uuid;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_supporter FROM public.missions_supporters WHERE id = p_supporter_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'supporter not found'; END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_supporter.organization_id, 'missions.manage') THEN
    RAISE EXCEPTION 'access denied to create a commitment for this supporter';
  END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_supporter.organization_id, 'finance.write') THEN
    RAISE EXCEPTION 'access denied: finance.write is required to create a financial commitment';
  END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_supporter.organization_id, 'missions.finance') THEN
    RAISE EXCEPTION 'access denied: missions.finance is required to create a financial commitment';
  END IF;

  IF v_supporter.status <> 'ativo' THEN
    RAISE EXCEPTION 'commitments can only be created for active supporters';
  END IF;

  IF num_nonnulls(p_missionary_id, p_project_id, p_campaign_id) <> 1 THEN
    RAISE EXCEPTION 'exactly one of missionary_id, project_id or campaign_id must be informed';
  END IF;

  IF p_periodicity NOT IN ('unica', 'mensal', 'trimestral', 'semestral', 'anual') THEN
    RAISE EXCEPTION 'invalid periodicity: %', p_periodicity;
  END IF;

  IF p_committed_amount IS NULL OR p_committed_amount <= 0 THEN
    RAISE EXCEPTION 'committed amount must be greater than zero';
  END IF;

  IF p_missionary_id IS NOT NULL THEN
    SELECT organization_id INTO v_context_org
    FROM public.missions_missionaries
    WHERE id = p_missionary_id
      AND status IN ('em_preparacao', 'ativo', 'em_licenca');
  ELSIF p_project_id IS NOT NULL THEN
    SELECT organization_id INTO v_context_org
    FROM public.missions_projects
    WHERE id = p_project_id
      AND status IN ('planejado', 'ativo', 'suspenso');
  ELSE
    SELECT organization_id INTO v_context_org
    FROM public.campaigns
    WHERE id = p_campaign_id
      AND status IN ('active', 'paused');
  END IF;

  IF v_context_org IS NULL THEN
    RAISE EXCEPTION 'commitment context was not found or is not open for new commitments';
  END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_context_org, 'missions.finance') THEN
    RAISE EXCEPTION 'access denied: missions.finance is required in the commitment context';
  END IF;

  IF NOT public.is_organization_descendant_or_self(v_supporter.organization_id, v_context_org) THEN
    RAISE EXCEPTION 'commitment context is outside the supporter organization scope';
  END IF;

  INSERT INTO public.missions_supporter_commitments (
    supporter_id, organization_id, missionary_id, project_id, campaign_id,
    periodicity, committed_amount, start_date, end_date, notes, created_by
  ) VALUES (
    p_supporter_id, v_supporter.organization_id, p_missionary_id, p_project_id, p_campaign_id,
    p_periodicity, p_committed_amount, COALESCE(p_start_date, CURRENT_DATE), p_end_date,
    NULLIF(btrim(p_notes), ''), auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_missions_commitment(
  uuid, text, numeric, uuid, uuid, uuid, date, date, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_missions_commitment(
  uuid, text, numeric, uuid, uuid, uuid, date, date, text
) TO authenticated;

-- ── Máquina de estados do compromisso ────────────────────────────────────
-- ativo -> pausado | encerrado | cancelado
-- pausado -> ativo | encerrado | cancelado
-- encerrado / cancelado -> terminal
CREATE OR REPLACE FUNCTION public.update_missions_commitment_status(
  p_commitment_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.missions_supporter_commitments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_row FROM public.missions_supporter_commitments WHERE id = p_commitment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commitment not found'; END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_row.organization_id, 'missions.manage') THEN
    RAISE EXCEPTION 'access denied to update this commitment';
  END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_row.organization_id, 'finance.write') THEN
    RAISE EXCEPTION 'access denied: finance.write is required to update a financial commitment';
  END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_row.organization_id, 'missions.finance') THEN
    RAISE EXCEPTION 'access denied: missions.finance is required to update a financial commitment';
  END IF;

  IF p_status = v_row.status THEN
    RETURN;
  END IF;

  IF NOT (
    (v_row.status = 'ativo' AND p_status IN ('pausado', 'encerrado', 'cancelado'))
    OR (v_row.status = 'pausado' AND p_status IN ('ativo', 'encerrado', 'cancelado'))
  ) THEN
    RAISE EXCEPTION 'invalid commitment status transition: % -> %', v_row.status, p_status;
  END IF;

  UPDATE public.missions_supporter_commitments SET status = p_status WHERE id = p_commitment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_missions_commitment_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_missions_commitment_status(uuid, text) TO authenticated;

-- ── missions_commitment_installments ─────────────────────────────────────
-- status/paid_amount são SEMPRE derivados (ver cabeçalho do arquivo). O
-- único caminho de escrita manual é set_missions_installment_exemption(),
-- restrito a cancelado/isento e bloqueado se já houver valor pago.
CREATE TABLE IF NOT EXISTS public.missions_commitment_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commitment_id uuid NOT NULL REFERENCES public.missions_supporter_commitments(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,

  reference_month text NOT NULL CHECK (reference_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  due_date date NOT NULL,
  expected_amount numeric(14,2) NOT NULL CHECK (expected_amount > 0),

  paid_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status text NOT NULL DEFAULT 'previsto'
    CHECK (status IN ('previsto', 'pendente', 'parcial', 'pago', 'atrasado', 'cancelado', 'isento')),

  notes text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (commitment_id, reference_month)
);

CREATE INDEX IF NOT EXISTS idx_missions_installments_commitment ON public.missions_commitment_installments (commitment_id);
CREATE INDEX IF NOT EXISTS idx_missions_installments_org_status ON public.missions_commitment_installments (organization_id, status, due_date);

DROP TRIGGER IF EXISTS update_missions_installments_updated_at ON public.missions_commitment_installments;
CREATE TRIGGER update_missions_installments_updated_at
BEFORE UPDATE ON public.missions_commitment_installments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.missions_commitment_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "missions_installments capability select" ON public.missions_commitment_installments;
CREATE POLICY "missions_installments capability select" ON public.missions_commitment_installments
FOR SELECT TO authenticated
USING (
  public.has_org_access_permission(auth.uid(), organization_id, 'missions.read')
  AND public.has_org_access_permission(auth.uid(), organization_id, 'finance.read')
);

REVOKE INSERT, UPDATE, DELETE ON public.missions_commitment_installments FROM authenticated;
GRANT SELECT ON public.missions_commitment_installments TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_missions_commitment_installment(
  p_commitment_id uuid,
  p_reference_month text,
  p_due_date date,
  p_expected_amount numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_commitment public.missions_supporter_commitments%ROWTYPE;
  v_reference_date date;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_commitment FROM public.missions_supporter_commitments WHERE id = p_commitment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commitment not found'; END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_commitment.organization_id, 'missions.manage') THEN
    RAISE EXCEPTION 'access denied to generate installments for this commitment';
  END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_commitment.organization_id, 'finance.write') THEN
    RAISE EXCEPTION 'access denied: finance.write is required to generate a financial installment';
  END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_commitment.organization_id, 'missions.finance') THEN
    RAISE EXCEPTION 'access denied: missions.finance is required to generate a financial installment';
  END IF;

  IF v_commitment.status <> 'ativo' THEN
    RAISE EXCEPTION 'installments can only be generated for active commitments';
  END IF;

  IF p_reference_month IS NULL OR p_reference_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'invalid reference month: %', p_reference_month;
  END IF;

  v_reference_date := (p_reference_month || '-01')::date;

  IF v_reference_date < date_trunc('month', v_commitment.start_date)::date
     OR (
       v_commitment.end_date IS NOT NULL
       AND v_reference_date > date_trunc('month', v_commitment.end_date)::date
     ) THEN
    RAISE EXCEPTION 'reference month is outside the commitment validity period';
  END IF;

  IF p_due_date IS NULL THEN
    RAISE EXCEPTION 'due date is required';
  END IF;

  IF date_trunc('month', p_due_date)::date <> v_reference_date THEN
    RAISE EXCEPTION 'due date must belong to the reference month';
  END IF;

  IF COALESCE(p_expected_amount, v_commitment.committed_amount) <= 0 THEN
    RAISE EXCEPTION 'expected amount must be greater than zero';
  END IF;

  INSERT INTO public.missions_commitment_installments (
    commitment_id, organization_id, reference_month, due_date, expected_amount, created_by
  ) VALUES (
    p_commitment_id, v_commitment.organization_id, p_reference_month, p_due_date,
    COALESCE(p_expected_amount, v_commitment.committed_amount), auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_missions_commitment_installment(uuid, text, date, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_missions_commitment_installment(uuid, text, date, numeric) TO authenticated;

-- ── Recomputação derivada de status (chamada por trigger na migration 5) ─
-- Nunca marca pago/parcial sem paid_amount real vindo de transações
-- vinculadas. cancelado/isento são preservados (não recomputados).
CREATE OR REPLACE FUNCTION public._recompute_missions_installment_status(p_installment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.missions_commitment_installments%ROWTYPE;
  v_paid numeric(14,2);
  v_new_status text;
BEGIN
  SELECT * INTO v_row FROM public.missions_commitment_installments WHERE id = p_installment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_row.status IN ('cancelado', 'isento') THEN
    RETURN;
  END IF;

  -- Soma somente transações REAIS ('Entrada') vinculadas a esta parcela —
  -- nunca um segundo valor monetário guardado só em Missões.
  IF to_regclass('public.missions_transaction_links') IS NOT NULL THEN
    SELECT COALESCE(SUM(t.amount), 0) INTO v_paid
    FROM public.missions_transaction_links l
    JOIN public.transactions t ON t.id = l.transaction_id
    WHERE l.installment_id = p_installment_id
      AND t.type = 'Entrada'
      AND t.status IN ('Confirmado', 'Pago');
  ELSE
    v_paid := 0;
  END IF;

  v_new_status := CASE
    WHEN v_paid >= v_row.expected_amount THEN 'pago'
    WHEN v_paid > 0 THEN 'parcial'
    WHEN v_row.due_date < CURRENT_DATE THEN 'atrasado'
    WHEN v_row.due_date <= CURRENT_DATE THEN 'pendente'
    ELSE 'previsto'
  END;

  UPDATE public.missions_commitment_installments
  SET paid_amount = v_paid, status = v_new_status
  WHERE id = p_installment_id;
END;
$$;

REVOKE ALL ON FUNCTION public._recompute_missions_installment_status(uuid) FROM PUBLIC, anon, authenticated;

-- RPC pública para atualizar a "aging" (previsto -> pendente -> atrasado) de
-- uma parcela sem transação vinculada, quando o usuário abre o compromisso
-- (o sistema não tem infraestrutura de job agendado nesta operação — ver
-- limitações no documento da operação).
CREATE OR REPLACE FUNCTION public.refresh_missions_installment_status(p_installment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT organization_id INTO v_org_id FROM public.missions_commitment_installments WHERE id = p_installment_id;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'installment not found'; END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_org_id, 'missions.read')
     OR NOT public.has_org_access_permission(auth.uid(), v_org_id, 'finance.read') THEN
    RAISE EXCEPTION 'access denied: missions.read and finance.read are required to refresh this installment';
  END IF;

  PERFORM public._recompute_missions_installment_status(p_installment_id);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_missions_installment_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_missions_installment_status(uuid) TO authenticated;

-- Único caminho de escrita manual de status — restrito a cancelado/isento,
-- e bloqueado quando já existe valor pago real (não pode "cancelar" um
-- recebimento que já aconteceu).
CREATE OR REPLACE FUNCTION public.set_missions_installment_exemption(
  p_installment_id uuid,
  p_status text,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.missions_commitment_installments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_row FROM public.missions_commitment_installments WHERE id = p_installment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'installment not found'; END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_row.organization_id, 'missions.manage') THEN
    RAISE EXCEPTION 'access denied to change this installment';
  END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_row.organization_id, 'finance.write') THEN
    RAISE EXCEPTION 'access denied: finance.write is required to change this financial installment';
  END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_row.organization_id, 'missions.finance') THEN
    RAISE EXCEPTION 'access denied: missions.finance is required to change this financial installment';
  END IF;

  IF p_status NOT IN ('cancelado', 'isento') THEN
    RAISE EXCEPTION 'this function only sets cancelado or isento';
  END IF;

  IF v_row.paid_amount > 0 OR v_row.status = 'pago' THEN
    RAISE EXCEPTION 'cannot cancel/exempt an installment that already has a real payment';
  END IF;

  IF NULLIF(btrim(p_notes), '') IS NULL THEN
    RAISE EXCEPTION 'a justification is required to cancel or exempt an installment';
  END IF;

  UPDATE public.missions_commitment_installments
  SET status = p_status,
      notes = NULLIF(btrim(p_notes), '')
  WHERE id = p_installment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_missions_installment_exemption(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_missions_installment_exemption(uuid, text, text) TO authenticated;

-- ── Verificação final ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'missions_supporters') THEN
    RAISE EXCEPTION 'Migration missions_supporters_commitments: tabela missions_supporters nao foi criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'missions_supporter_commitments') THEN
    RAISE EXCEPTION 'Migration missions_supporters_commitments: tabela missions_supporter_commitments nao foi criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'missions_commitment_installments') THEN
    RAISE EXCEPTION 'Migration missions_supporters_commitments: tabela missions_commitment_installments nao foi criada';
  END IF;
  IF to_regprocedure('public._recompute_missions_installment_status(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Migration missions_supporters_commitments: funcao _recompute_missions_installment_status nao foi criada';
  END IF;
  RAISE NOTICE 'Migration missions_supporters_commitments: tabelas, RLS, RPCs e calculo derivado confirmados ✓';
END $$;

COMMIT;
