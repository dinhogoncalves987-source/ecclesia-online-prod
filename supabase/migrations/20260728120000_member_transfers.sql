-- ============================================================================
-- Migration: member_transfers
-- Timestamp: 20260728120000
-- OPERAÇÃO 1 — Fundação compartilhada dos domínios + Secretaria
-- ============================================================================
--
-- Transferências recebidas/emitidas de um membro, internas (entre
-- organizações já cadastradas no Ecclesia) ou externas (igreja fora do
-- sistema, por nome livre). REAPROVEITA public.recommendation_letters via
-- recommendation_letter_id — não recriamos Cartas de Recomendação.
--
-- IMPORTANTE (achado da auditoria): recommendation_letters.member_id não é
-- FK para public.members — guarda o auth.users.id de quem solicitou a carta
-- (ver comentário original da migration 20260615120000). Por isso aqui
-- linkamos apenas pelo id da carta (chave primária), sem qualquer suposição
-- sobre o significado de member_id naquela tabela.
--
-- Esta operação NÃO move automaticamente o membro de congregação quando uma
-- transferência é concluída — isso continua sendo feito manualmente no
-- wizard existente (Membros.tsx). Ver limitação documentada em
-- docs/architecture/operacao-1-secretaria.md.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.member_history') IS NULL THEN v_missing := array_append(v_missing, 'public.member_history'); END IF;
  IF to_regclass('public.recommendation_letters') IS NULL THEN v_missing := array_append(v_missing, 'public.recommendation_letters'); END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'member_transfers preflight failed; missing: %', array_to_string(v_missing, ', ');
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.member_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,

  direction text NOT NULL CHECK (direction IN ('recebida', 'emitida')),

  origin_type text NOT NULL DEFAULT 'interna' CHECK (origin_type IN ('interna', 'externa')),
  origin_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  origin_church_name text,

  destination_type text NOT NULL DEFAULT 'interna' CHECK (destination_type IN ('interna', 'externa')),
  destination_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  destination_church_name text,

  requested_at date,
  approved_at date,
  completed_at date,
  status text NOT NULL DEFAULT 'solicitada'
    CHECK (status IN ('solicitada', 'aprovada', 'concluida', 'rejeitada', 'cancelada')),
  reason text,

  -- Reaproveita Cartas de Recomendação já existentes — sem duplicar recurso.
  recommendation_letter_id uuid REFERENCES public.recommendation_letters(id) ON DELETE SET NULL,

  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  attachment_path text,

  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (
    (origin_type = 'interna' AND origin_organization_id IS NOT NULL AND origin_church_name IS NULL)
    OR
    (origin_type = 'externa' AND origin_organization_id IS NULL AND NULLIF(btrim(origin_church_name), '') IS NOT NULL)
  ),
  CHECK (
    (destination_type = 'interna' AND destination_organization_id IS NOT NULL AND destination_church_name IS NULL)
    OR
    (destination_type = 'externa' AND destination_organization_id IS NULL AND NULLIF(btrim(destination_church_name), '') IS NOT NULL)
  ),
  CHECK (
    origin_organization_id IS NULL
    OR destination_organization_id IS NULL
    OR origin_organization_id <> destination_organization_id
  ),
  CHECK (approved_at IS NULL OR requested_at IS NULL OR approved_at >= requested_at),
  CHECK (completed_at IS NULL OR approved_at IS NULL OR completed_at >= approved_at)
);

CREATE INDEX IF NOT EXISTS idx_member_transfers_member ON public.member_transfers (member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_transfers_org ON public.member_transfers (organization_id);
CREATE INDEX IF NOT EXISTS idx_member_transfers_status ON public.member_transfers (organization_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS member_transfers_legacy_unique_idx
  ON public.member_transfers (
    organization_id, legacy_source, COALESCE(legacy_module, ''), legacy_code
  )
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

DROP TRIGGER IF EXISTS update_member_transfers_updated_at ON public.member_transfers;
CREATE TRIGGER update_member_transfers_updated_at
BEFORE UPDATE ON public.member_transfers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.member_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "member_transfers capability select" ON public.member_transfers;
CREATE POLICY "member_transfers capability select" ON public.member_transfers
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_transfers.member_id
      AND public.has_org_access_permission(
        auth.uid(), COALESCE(m.congregation_id, m.sector_id, m.organization_id), 'members.read'
      )
  )
);

DROP POLICY IF EXISTS "member_transfers capability insert" ON public.member_transfers;
DROP POLICY IF EXISTS "member_transfers capability update" ON public.member_transfers;
REVOKE INSERT, UPDATE, DELETE ON public.member_transfers FROM authenticated;
GRANT SELECT ON public.member_transfers TO authenticated;

-- A interface informa apenas a contraparte. Para recebida, o destino é
-- automaticamente a unidade atual do membro; para emitida, a origem é a
-- unidade atual. Isso elimina transferências internas incompletas e impede o
-- cliente de forjar organization_id/requested_by.
CREATE OR REPLACE FUNCTION public.create_member_transfer(
  p_member_id uuid,
  p_direction text,
  p_counterparty_type text,
  p_counterparty_organization_id uuid DEFAULT NULL,
  p_counterparty_church_name text DEFAULT NULL,
  p_requested_at date DEFAULT CURRENT_DATE,
  p_reason text DEFAULT NULL,
  p_recommendation_letter_id uuid DEFAULT NULL,
  p_document_id uuid DEFAULT NULL,
  p_attachment_path text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id uuid;
  v_base_org_id uuid;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT COALESCE(congregation_id, sector_id, organization_id), organization_id
    INTO v_org_id, v_base_org_id
  FROM public.members
  WHERE id = p_member_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'member not found';
  END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_org_id, 'members.write') THEN
    RAISE EXCEPTION 'access denied to register transfer';
  END IF;

  IF p_direction NOT IN ('recebida', 'emitida') THEN
    RAISE EXCEPTION 'invalid transfer direction';
  END IF;

  IF p_counterparty_type NOT IN ('interna', 'externa') THEN
    RAISE EXCEPTION 'invalid transfer counterparty type';
  END IF;

  IF p_counterparty_type = 'interna' THEN
    IF p_counterparty_organization_id IS NULL THEN
      RAISE EXCEPTION 'internal transfer requires an organization';
    END IF;
    IF p_counterparty_organization_id = v_org_id THEN
      RAISE EXCEPTION 'origin and destination must be different';
    END IF;
    IF NOT public.has_org_access_permission(
      auth.uid(), p_counterparty_organization_id, 'members.read'
    ) THEN
      RAISE EXCEPTION 'transfer organization not found or inaccessible';
    END IF;
  ELSIF NULLIF(btrim(p_counterparty_church_name), '') IS NULL THEN
    RAISE EXCEPTION 'external transfer requires the church name';
  END IF;

  IF p_recommendation_letter_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.recommendation_letters rl
    WHERE rl.id = p_recommendation_letter_id
      AND rl.organization_id = v_base_org_id
  ) THEN
    RAISE EXCEPTION 'recommendation letter not found for this organization';
  END IF;

  IF p_document_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.documents d
    WHERE d.id = p_document_id
      AND d.organization_id = v_base_org_id
  ) THEN
    RAISE EXCEPTION 'document not found for this organization';
  END IF;

  IF p_attachment_path IS NOT NULL
     AND p_attachment_path NOT LIKE (
       v_base_org_id::text || '/' || p_member_id::text || '/%'
     ) THEN
    RAISE EXCEPTION 'invalid member attachment path';
  END IF;

  INSERT INTO public.member_transfers (
    member_id, organization_id, direction,
    origin_type, origin_organization_id, origin_church_name,
    destination_type, destination_organization_id, destination_church_name,
    requested_at, reason, recommendation_letter_id, document_id,
    attachment_path, requested_by
  ) VALUES (
    p_member_id, v_org_id, p_direction,
    CASE WHEN p_direction = 'recebida' THEN p_counterparty_type ELSE 'interna' END,
    CASE
      WHEN p_direction = 'recebida' AND p_counterparty_type = 'interna'
        THEN p_counterparty_organization_id
      WHEN p_direction = 'emitida' THEN v_org_id
      ELSE NULL
    END,
    CASE
      WHEN p_direction = 'recebida' AND p_counterparty_type = 'externa'
        THEN btrim(p_counterparty_church_name)
      ELSE NULL
    END,
    CASE WHEN p_direction = 'emitida' THEN p_counterparty_type ELSE 'interna' END,
    CASE
      WHEN p_direction = 'emitida' AND p_counterparty_type = 'interna'
        THEN p_counterparty_organization_id
      WHEN p_direction = 'recebida' THEN v_org_id
      ELSE NULL
    END,
    CASE
      WHEN p_direction = 'emitida' AND p_counterparty_type = 'externa'
        THEN btrim(p_counterparty_church_name)
      ELSE NULL
    END,
    COALESCE(p_requested_at, CURRENT_DATE), NULLIF(btrim(p_reason), ''),
    p_recommendation_letter_id, p_document_id, p_attachment_path, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_member_transfer(
  uuid, text, text, uuid, text, date, text, uuid, uuid, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_member_transfer(
  uuid, text, text, uuid, text, date, text, uuid, uuid, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_member_transfer_status(
  p_transfer_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.member_transfers%ROWTYPE;
  v_org_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT * INTO v_row
  FROM public.member_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer not found';
  END IF;

  SELECT COALESCE(congregation_id, sector_id, organization_id)
    INTO v_org_id
  FROM public.members
  WHERE id = v_row.member_id;

  IF NOT public.has_org_access_permission(auth.uid(), v_org_id, 'members.write') THEN
    RAISE EXCEPTION 'access denied to update transfer';
  END IF;

  IF NOT (
    (v_row.status = 'solicitada' AND p_status IN ('aprovada', 'rejeitada', 'cancelada'))
    OR (v_row.status = 'aprovada' AND p_status IN ('concluida', 'cancelada'))
    OR v_row.status = p_status
  ) THEN
    RAISE EXCEPTION 'invalid transfer status transition: % -> %', v_row.status, p_status;
  END IF;

  UPDATE public.member_transfers
  SET status = p_status,
      approved_at = CASE
        WHEN p_status = 'aprovada' THEN COALESCE(approved_at, CURRENT_DATE)
        ELSE approved_at
      END,
      approved_by = CASE
        WHEN p_status = 'aprovada' THEN COALESCE(approved_by, auth.uid())
        ELSE approved_by
      END,
      completed_at = CASE
        WHEN p_status = 'concluida' THEN COALESCE(completed_at, CURRENT_DATE)
        ELSE completed_at
      END
  WHERE id = p_transfer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_member_transfer_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_member_transfer_status(uuid, text) TO authenticated;

-- ── Trigger: cria/atualiza automaticamente o evento na timeline ────────
CREATE OR REPLACE FUNCTION public._member_transfers_register_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_title text;
  v_target text;
BEGIN
  v_target := CASE
    WHEN NEW.direction = 'recebida' THEN COALESCE(
      (SELECT name FROM public.organizations WHERE id = NEW.origin_organization_id),
      NEW.origin_church_name, 'origem não informada'
    )
    ELSE COALESCE(
      (SELECT name FROM public.organizations WHERE id = NEW.destination_organization_id),
      NEW.destination_church_name, 'destino não informado'
    )
  END;

  v_title := CASE NEW.direction
    WHEN 'recebida' THEN 'Transferência recebida de ' || v_target
    ELSE 'Transferência emitida para ' || v_target
  END;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.register_member_history_event(
      NEW.member_id,
      'transferencia',
      v_title,
      NEW.reason,
      COALESCE(NEW.requested_at, CURRENT_DATE)::timestamptz,
      'secretaria',
      'member_transfers',
      NEW.id,
      NEW.document_id,
      NEW.attachment_path,
      'normal',
      NULL,
      NULL,
      NULL
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.register_member_history_event(
      NEW.member_id,
      'transferencia',
      v_title || ' — ' || NEW.status,
      NEW.reason,
      COALESCE(NEW.completed_at, NEW.approved_at, NEW.requested_at, CURRENT_DATE)::timestamptz,
      'secretaria',
      'member_transfers',
      NEW.id,
      NEW.document_id,
      NEW.attachment_path,
      'normal',
      NEW.legacy_source,
      NEW.legacy_module,
      NEW.legacy_code
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_transfers_register_history_insert ON public.member_transfers;
CREATE TRIGGER member_transfers_register_history_insert
AFTER INSERT ON public.member_transfers
FOR EACH ROW EXECUTE FUNCTION public._member_transfers_register_history();

DROP TRIGGER IF EXISTS member_transfers_register_history_update ON public.member_transfers;
CREATE TRIGGER member_transfers_register_history_update
AFTER UPDATE OF status ON public.member_transfers
FOR EACH ROW EXECUTE FUNCTION public._member_transfers_register_history();

REVOKE ALL ON FUNCTION public._member_transfers_register_history() FROM PUBLIC, anon, authenticated;

-- ── Verificação final ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'member_transfers') THEN
    RAISE EXCEPTION 'Migration member_transfers: tabela nao foi criada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'member_transfers' AND policyname = 'member_transfers capability select'
  ) THEN
    RAISE EXCEPTION 'Migration member_transfers: policy de leitura nao foi criada';
  END IF;
  RAISE NOTICE 'Migration member_transfers: tabela, policies e triggers confirmados ✓';
END $$;

COMMIT;
