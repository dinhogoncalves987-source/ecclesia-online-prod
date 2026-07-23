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
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

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
    (origin_type = 'interna') OR (origin_organization_id IS NULL)
  ),
  CHECK (
    (destination_type = 'interna') OR (destination_organization_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_member_transfers_member ON public.member_transfers (member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_transfers_org ON public.member_transfers (organization_id);
CREATE INDEX IF NOT EXISTS idx_member_transfers_status ON public.member_transfers (organization_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS member_transfers_legacy_unique_idx
  ON public.member_transfers (organization_id, legacy_source, legacy_code)
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
CREATE POLICY "member_transfers capability insert" ON public.member_transfers
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_transfers.member_id
      AND m.organization_id = member_transfers.organization_id
      AND public.has_org_access_permission(
        auth.uid(), COALESCE(m.congregation_id, m.sector_id, m.organization_id), 'members.write'
      )
  )
);

DROP POLICY IF EXISTS "member_transfers capability update" ON public.member_transfers;
CREATE POLICY "member_transfers capability update" ON public.member_transfers
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_transfers.member_id
      AND public.has_org_access_permission(
        auth.uid(), COALESCE(m.congregation_id, m.sector_id, m.organization_id), 'members.write'
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_transfers.member_id
      AND public.has_org_access_permission(
        auth.uid(), COALESCE(m.congregation_id, m.sector_id, m.organization_id), 'members.write'
      )
  )
);

GRANT SELECT, INSERT, UPDATE ON public.member_transfers TO authenticated;

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
      NEW.legacy_source,
      NEW.legacy_module,
      NEW.legacy_code
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
