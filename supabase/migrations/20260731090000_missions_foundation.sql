-- ============================================================================
-- Migration: missions_foundation
-- Timestamp: 20260731090000
-- OPERAÇÃO 4 — Missões completa sobre a fundação revisada do Ecclesia
-- ============================================================================
--
-- CONTRATO (ver docs/architecture/contrato-dominios-institucionais.md e
-- docs/architecture/operacao-4-missoes.md):
--   1. Pessoa continua sendo exclusivamente public.members. Missionário,
--      contribuinte/apoiador, coordenador e tesoureiro de Missões são PAPÉIS
--      referenciando members.id — nunca uma nova tabela de pessoa.
--   2. Organização continua sendo exclusivamente public.organizations.
--   3. Autorização por capability (has_org_access_permission), nunca role
--      hardcoded. Capabilities novas: missions.read, missions.manage,
--      missions.finance, missions.confidential.
--   4. Histórico institucional continua sendo exclusivamente
--      public.member_history (extensão de catálogo na migration 6).
--   5. Financeiro continua sendo exclusivamente public.transactions +
--      finance_*. Missões nunca duplica saldo, conta ou fechamento (ver
--      20260731130000_missions_transaction_links.sql). "Portadores" do
--      WinTechi = finance_accounts reais; "Contas/Grupos Contábeis" =
--      finance_account_categories reais (códigos 1.04/2.04 "Missoes" já
--      existem desde 20260512100000_staging_treasury_mvp.sql).
--   6. missions.finance NUNCA substitui finance.read/finance.write — uma RPC
--      financeira de Missões sempre verifica as duas capabilities,
--      separadamente, na organização real de cada lado do vínculo.
--   7. missions.confidential segue o MESMO padrão de members.confidential/
--      discipleship.confidential/theology.confidential: concedida
--      automaticamente apenas a quem já tem TODAS as permissões
--      (church_admin/responsible_pastor). Nenhuma das três responsabilidades
--      operacionais novas (coordinator/secretary/treasurer) a recebe por
--      conveniência.
--
-- ESTA MIGRATION (bloco 1 — fundação e parâmetros):
--   * capabilities + responsabilidades operacionais;
--   * missions_settings (parâmetros organizacionais explícitos — WinTechi
--     "Parâmetros de Missões"). Não guarda segredo/credencial nenhuma.
--
-- Esta migration NÃO é aplicada. NÃO altera Financeiro, Chat, Secretaria,
-- Discipulado, Teologia nem nenhum módulo fora de Missões.
-- ============================================================================

BEGIN;

-- ── Preflight ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.members') IS NULL THEN v_missing := array_append(v_missing, 'public.members'); END IF;
  IF to_regclass('public.organizations') IS NULL THEN v_missing := array_append(v_missing, 'public.organizations'); END IF;
  IF to_regclass('public.documents') IS NULL THEN v_missing := array_append(v_missing, 'public.documents'); END IF;
  IF to_regclass('public.campaigns') IS NULL THEN v_missing := array_append(v_missing, 'public.campaigns'); END IF;
  IF to_regclass('public.access_responsibility_definitions') IS NULL THEN
    v_missing := array_append(v_missing, 'public.access_responsibility_definitions');
  END IF;
  IF to_regclass('public.member_history') IS NULL THEN
    v_missing := array_append(v_missing, 'public.member_history (Operação 1)');
  END IF;
  IF to_regclass('public.finance_accounts') IS NULL THEN v_missing := array_append(v_missing, 'public.finance_accounts'); END IF;
  IF to_regclass('public.finance_account_categories') IS NULL THEN v_missing := array_append(v_missing, 'public.finance_account_categories'); END IF;
  IF to_regclass('public.finance_cost_centers') IS NULL THEN v_missing := array_append(v_missing, 'public.finance_cost_centers'); END IF;
  IF to_regclass('public.transactions') IS NULL THEN v_missing := array_append(v_missing, 'public.transactions'); END IF;
  IF to_regprocedure('public.has_org_access_permission(uuid,uuid,text)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.has_org_access_permission()');
  END IF;
  IF to_regprocedure('public.is_organization_descendant_or_self(uuid,uuid)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.is_organization_descendant_or_self()');
  END IF;
  IF to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    v_missing := array_append(v_missing, 'public.update_updated_at_column()');
  END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'missions_foundation preflight failed; missing: %', array_to_string(v_missing, ', ');
  END IF;
END;
$$;

-- ── Capabilities novas ───────────────────────────────────────────────────
-- Mesmo padrão idempotente de members.confidential/discipleship.*/theology.*:
-- concedidas automaticamente a church_admin/responsible_pastor (governança).
UPDATE public.access_responsibility_definitions
SET permission_keys = (
      SELECT ARRAY(SELECT DISTINCT unnest(
        COALESCE(permission_keys, ARRAY[]::text[])
        || ARRAY['missions.read', 'missions.manage', 'missions.finance', 'missions.confidential']
      ))
    ),
    updated_at = now()
WHERE responsibility_type IN ('church_admin', 'responsible_pastor')
  AND NOT (
    'missions.read' = ANY(COALESCE(permission_keys, ARRAY[]::text[]))
    AND 'missions.manage' = ANY(COALESCE(permission_keys, ARRAY[]::text[]))
    AND 'missions.finance' = ANY(COALESCE(permission_keys, ARRAY[]::text[]))
    AND 'missions.confidential' = ANY(COALESCE(permission_keys, ARRAY[]::text[]))
  );

-- ── Responsabilidades operacionais novas de Missões ─────────────────────
-- Coordenador(a): gerencia missionários, projetos, apoiadores e compromissos
-- no escopo recebido, e também pode vincular a organização real da transação
-- ao contexto missionário (missions.finance) — mas isso NUNCA substitui
-- finance.read/finance.write reais exigidos pela mesma RPC.
-- Secretário(a): mesma gestão operacional, sem acesso financeiro missionário.
-- Tesoureiro(a) missionário: só vincula/consulta o lado financeiro
-- missionário (missions.finance) — não recebe missions.manage geral, e
-- continua precisando de finance.read/finance.write reais (responsabilidade
-- de Tesouraria própria) para tocar em public.transactions.
INSERT INTO public.access_responsibility_definitions (
  responsibility_type, label, description, category, permission_keys,
  inherits_to_descendants, is_governance, sort_order
)
VALUES
  ('missions_coordinator', 'Coordenador(a) de Missões',
    'Gerencia missionários, projetos, apoiadores e compromissos de Missões no escopo recebido, incluindo o vínculo financeiro missionário.',
    'ministries', ARRAY['missions.read', 'missions.manage', 'missions.finance'], false, false, 110),
  ('missions_secretary', 'Secretário(a) de Missões',
    'Administra missionários, projetos, apoiadores e compromissos de Missões, sem acesso ao vínculo financeiro missionário.',
    'ministries', ARRAY['missions.read', 'missions.manage'], false, false, 111),
  ('missions_treasurer', 'Tesoureiro(a) de Missões',
    'Consulta e vincula transações reais ao contexto missionário. Não substitui a responsabilidade de Tesouraria: continua exigindo finance.read/finance.write próprios para operar transações.',
    'ministries', ARRAY['missions.read', 'missions.finance'], false, false, 112)
ON CONFLICT (responsibility_type) DO NOTHING;

-- ── missions_settings (Parâmetros de Missões, por organização) ─────────
-- WinTechi: "Parâmetros de Missões". Contém somente parâmetros
-- organizacionais explícitos usados por Missões para sugerir/validar
-- lançamentos — NUNCA segredo/credencial de integração.
CREATE TABLE IF NOT EXISTS public.missions_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,

  default_finance_account_id uuid REFERENCES public.finance_accounts(id) ON DELETE SET NULL,
  default_account_category_id uuid REFERENCES public.finance_account_categories(id) ON DELETE SET NULL,
  default_cost_center_id uuid REFERENCES public.finance_cost_centers(id) ON DELETE SET NULL,

  default_periodicity text NOT NULL DEFAULT 'mensal'
    CHECK (default_periodicity IN ('unica', 'mensal', 'trimestral', 'semestral', 'anual')),
  installment_due_day integer NOT NULL DEFAULT 10 CHECK (installment_due_day BETWEEN 1 AND 28),
  late_alert_days integer NOT NULL DEFAULT 5 CHECK (late_alert_days >= 0),

  notes text,

  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_missions_settings_org ON public.missions_settings (organization_id);

DROP TRIGGER IF EXISTS update_missions_settings_updated_at ON public.missions_settings;
CREATE TRIGGER update_missions_settings_updated_at
BEFORE UPDATE ON public.missions_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.missions_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "missions_settings capability select" ON public.missions_settings;
CREATE POLICY "missions_settings capability select" ON public.missions_settings
FOR SELECT TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'missions.read'));

-- Escrita somente por RPC: valida que as contas/categorias/centros de custo
-- padrão de fato pertencem à organização informada antes de gravar.
REVOKE INSERT, UPDATE, DELETE ON public.missions_settings FROM authenticated;
GRANT SELECT ON public.missions_settings TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_missions_settings(
  p_organization_id uuid,
  p_default_finance_account_id uuid DEFAULT NULL,
  p_default_account_category_id uuid DEFAULT NULL,
  p_default_cost_center_id uuid DEFAULT NULL,
  p_default_periodicity text DEFAULT 'mensal',
  p_installment_due_day integer DEFAULT 10,
  p_late_alert_days integer DEFAULT 5,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_existing_account_id uuid;
  v_existing_category_id uuid;
  v_existing_cost_center_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  IF NOT public.has_org_access_permission(auth.uid(), p_organization_id, 'missions.manage') THEN
    RAISE EXCEPTION 'access denied to configure missions settings';
  END IF;

  SELECT
    default_finance_account_id,
    default_account_category_id,
    default_cost_center_id
  INTO
    v_existing_account_id,
    v_existing_category_id,
    v_existing_cost_center_id
  FROM public.missions_settings
  WHERE organization_id = p_organization_id;

  IF (
       p_default_finance_account_id IS DISTINCT FROM v_existing_account_id
       OR p_default_account_category_id IS DISTINCT FROM v_existing_category_id
       OR p_default_cost_center_id IS DISTINCT FROM v_existing_cost_center_id
     )
     AND NOT public.has_org_access_permission(auth.uid(), p_organization_id, 'finance.read') THEN
    RAISE EXCEPTION 'access denied: finance.read is required to configure financial defaults';
  END IF;

  IF p_default_periodicity NOT IN ('unica', 'mensal', 'trimestral', 'semestral', 'anual') THEN
    RAISE EXCEPTION 'invalid default periodicity: %', p_default_periodicity;
  END IF;

  IF p_installment_due_day IS NULL OR p_installment_due_day NOT BETWEEN 1 AND 28 THEN
    RAISE EXCEPTION 'installment due day must be between 1 and 28';
  END IF;

  IF p_late_alert_days IS NULL OR p_late_alert_days < 0 THEN
    RAISE EXCEPTION 'late alert days must be zero or positive';
  END IF;

  IF p_default_finance_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.finance_accounts fa
    WHERE fa.id = p_default_finance_account_id AND fa.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'default finance account does not belong to this organization';
  END IF;

  IF p_default_account_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.finance_account_categories fac
    WHERE fac.id = p_default_account_category_id AND fac.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'default account category does not belong to this organization';
  END IF;

  IF p_default_cost_center_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.finance_cost_centers fcc
    WHERE fcc.id = p_default_cost_center_id AND fcc.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'default cost center does not belong to this organization';
  END IF;

  INSERT INTO public.missions_settings (
    organization_id, default_finance_account_id, default_account_category_id,
    default_cost_center_id, default_periodicity, installment_due_day,
    late_alert_days, notes, updated_by
  ) VALUES (
    p_organization_id, p_default_finance_account_id, p_default_account_category_id,
    p_default_cost_center_id, p_default_periodicity, p_installment_due_day,
    p_late_alert_days, NULLIF(btrim(p_notes), ''), auth.uid()
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    default_finance_account_id = EXCLUDED.default_finance_account_id,
    default_account_category_id = EXCLUDED.default_account_category_id,
    default_cost_center_id = EXCLUDED.default_cost_center_id,
    default_periodicity = EXCLUDED.default_periodicity,
    installment_due_day = EXCLUDED.installment_due_day,
    late_alert_days = EXCLUDED.late_alert_days,
    notes = EXCLUDED.notes,
    updated_by = EXCLUDED.updated_by
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_missions_settings(
  uuid, uuid, uuid, uuid, text, integer, integer, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_missions_settings(
  uuid, uuid, uuid, uuid, text, integer, integer, text
) TO authenticated;

-- ── Verificação final ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'missions_settings') THEN
    RAISE EXCEPTION 'Migration missions_foundation: tabela missions_settings nao foi criada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.access_responsibility_definitions WHERE responsibility_type = 'missions_coordinator'
  ) THEN
    RAISE EXCEPTION 'Migration missions_foundation: responsabilidade missions_coordinator nao foi criada';
  END IF;
  IF to_regprocedure('public.upsert_missions_settings(uuid,uuid,uuid,uuid,text,integer,integer,text)') IS NULL THEN
    RAISE EXCEPTION 'Migration missions_foundation: RPC upsert_missions_settings nao foi criada';
  END IF;
  RAISE NOTICE 'Migration missions_foundation: capabilities, responsabilidades e parametros confirmados ✓';
END $$;

COMMIT;
