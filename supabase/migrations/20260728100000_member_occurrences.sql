-- ============================================================================
-- Migration: member_occurrences
-- Timestamp: 20260728100000
-- OPERAÇÃO 1 — Fundação compartilhada dos domínios + Secretaria
-- ============================================================================
--
-- Ocorrências pastorais/administrativas de um membro (acompanhamento,
-- transferência, desligamento, falecimento, recebimento, reconciliação,
-- ordenação, credencial emitida, etc.). Dados pastorais sensíveis usam
-- visibility = 'confidential' e exigem a capability 'members.confidential'
-- (criada na migration anterior) — NÃO ficam visíveis para todo usuário que
-- só tem 'members.read'/'members.write'.
--
-- Toda ocorrência criada gera automaticamente uma linha em member_history
-- via register_member_history_event() (trigger abaixo) — reaproveitando o
-- MESMO ponto de extensão que Discipulado/Teologia/Missões usarão no futuro.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.member_history') IS NULL THEN
    RAISE EXCEPTION 'member_occurrences preflight failed: public.member_history nao existe (aplique 20260728090000 primeiro)';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.member_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,

  occurrence_type text NOT NULL CHECK (occurrence_type IN (
    'acompanhamento_pastoral', 'carta_recomendada', 'transferencia', 'desligamento',
    'falecimento', 'recebimento', 'reconciliacao', 'ordenacao', 'credencial_emitida', 'outro'
  )),
  occurred_at date NOT NULL DEFAULT CURRENT_DATE,
  occurred_time time,
  valid_until date,
  description text,
  status text NOT NULL DEFAULT 'registrada'
    CHECK (status IN ('registrada', 'em_andamento', 'concluida', 'cancelada')),
  visibility text NOT NULL DEFAULT 'normal' CHECK (visibility IN ('normal', 'confidential')),

  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  attachment_path text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (valid_until IS NULL OR valid_until >= occurred_at)
);

CREATE INDEX IF NOT EXISTS idx_member_occurrences_member ON public.member_occurrences (member_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_occurrences_org ON public.member_occurrences (organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_occurrences_type ON public.member_occurrences (occurrence_type);

CREATE UNIQUE INDEX IF NOT EXISTS member_occurrences_legacy_unique_idx
  ON public.member_occurrences (
    organization_id, legacy_source, COALESCE(legacy_module, ''), legacy_code
  )
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

DROP TRIGGER IF EXISTS update_member_occurrences_updated_at ON public.member_occurrences;
CREATE TRIGGER update_member_occurrences_updated_at
BEFORE UPDATE ON public.member_occurrences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.member_occurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "member_occurrences capability select" ON public.member_occurrences;
CREATE POLICY "member_occurrences capability select" ON public.member_occurrences
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_occurrences.member_id
      AND public.has_org_access_permission(
        auth.uid(), COALESCE(m.congregation_id, m.sector_id, m.organization_id), 'members.read'
      )
      AND (
        member_occurrences.visibility <> 'confidential'
        OR public.has_org_access_permission(
          auth.uid(), COALESCE(m.congregation_id, m.sector_id, m.organization_id), 'members.confidential'
        )
      )
  )
);

-- Escrita somente pelas RPCs controladas abaixo. O cliente não pode forjar
-- organization_id/created_by, reatribuir a ocorrência a outra pessoa nem
-- transformar um registro normal em confidencial por UPDATE direto.
DROP POLICY IF EXISTS "member_occurrences capability insert" ON public.member_occurrences;
DROP POLICY IF EXISTS "member_occurrences capability update" ON public.member_occurrences;
REVOKE INSERT, UPDATE, DELETE ON public.member_occurrences FROM authenticated;
GRANT SELECT ON public.member_occurrences TO authenticated;

CREATE OR REPLACE FUNCTION public.create_member_occurrence(
  p_member_id uuid,
  p_occurrence_type text,
  p_occurred_at date DEFAULT CURRENT_DATE,
  p_occurred_time time DEFAULT NULL,
  p_valid_until date DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_visibility text DEFAULT 'normal',
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
  v_visibility text := COALESCE(p_visibility, 'normal');
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
    RAISE EXCEPTION 'access denied to register occurrence';
  END IF;

  IF v_visibility = 'confidential'
     AND NOT public.has_org_access_permission(auth.uid(), v_org_id, 'members.confidential') THEN
    RAISE EXCEPTION 'access denied to register confidential occurrence';
  END IF;

  IF v_visibility NOT IN ('normal', 'confidential') THEN
    RAISE EXCEPTION 'invalid occurrence visibility';
  END IF;

  IF p_document_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.documents d
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

  INSERT INTO public.member_occurrences (
    member_id, organization_id, occurrence_type, occurred_at, occurred_time,
    valid_until, description, visibility, document_id, attachment_path,
    created_by
  ) VALUES (
    p_member_id, v_org_id, p_occurrence_type, COALESCE(p_occurred_at, CURRENT_DATE),
    p_occurred_time, p_valid_until, NULLIF(btrim(p_description), ''), v_visibility,
    p_document_id, p_attachment_path, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_member_occurrence(
  uuid, text, date, time, date, text, text, uuid, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_member_occurrence(
  uuid, text, date, time, date, text, text, uuid, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_member_occurrence_status(
  p_occurrence_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.member_occurrences%ROWTYPE;
  v_org_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT * INTO v_row
  FROM public.member_occurrences
  WHERE id = p_occurrence_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'occurrence not found';
  END IF;

  SELECT COALESCE(congregation_id, sector_id, organization_id)
    INTO v_org_id
  FROM public.members
  WHERE id = v_row.member_id;

  IF NOT public.has_org_access_permission(auth.uid(), v_org_id, 'members.write')
     OR (
       v_row.visibility = 'confidential'
       AND NOT public.has_org_access_permission(auth.uid(), v_org_id, 'members.confidential')
     ) THEN
    RAISE EXCEPTION 'access denied to update occurrence';
  END IF;

  IF NOT (
    (v_row.status = 'registrada' AND p_status IN ('em_andamento', 'concluida', 'cancelada'))
    OR (v_row.status = 'em_andamento' AND p_status IN ('concluida', 'cancelada'))
    OR v_row.status = p_status
  ) THEN
    RAISE EXCEPTION 'invalid occurrence status transition: % -> %', v_row.status, p_status;
  END IF;

  UPDATE public.member_occurrences
  SET status = p_status
  WHERE id = p_occurrence_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_member_occurrence_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_member_occurrence_status(uuid, text) TO authenticated;

-- ── Trigger: toda ocorrência gera automaticamente um evento na timeline ──
CREATE OR REPLACE FUNCTION public._member_occurrences_register_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_label text;
BEGIN
  v_label := CASE NEW.occurrence_type
    WHEN 'acompanhamento_pastoral' THEN 'Acompanhamento pastoral'
    WHEN 'carta_recomendada' THEN 'Carta recomendada'
    WHEN 'transferencia' THEN 'Transferência'
    WHEN 'desligamento' THEN 'Desligamento'
    WHEN 'falecimento' THEN 'Falecimento'
    WHEN 'recebimento' THEN 'Recebimento'
    WHEN 'reconciliacao' THEN 'Reconciliação'
    WHEN 'ordenacao' THEN 'Ordenação'
    WHEN 'credencial_emitida' THEN 'Credencial emitida'
    ELSE 'Ocorrência'
  END;

  PERFORM public.register_member_history_event(
    NEW.member_id,
    'ocorrencia',
    v_label,
    NEW.description,
    NEW.occurred_at::timestamptz,
    'secretaria',
    'member_occurrences',
    NEW.id,
    NEW.document_id,
    NEW.attachment_path,
    NEW.visibility,
    NEW.legacy_source,
    NEW.legacy_module,
    NEW.legacy_code
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_occurrences_register_history ON public.member_occurrences;
CREATE TRIGGER member_occurrences_register_history
AFTER INSERT ON public.member_occurrences
FOR EACH ROW EXECUTE FUNCTION public._member_occurrences_register_history();

REVOKE ALL ON FUNCTION public._member_occurrences_register_history() FROM PUBLIC, anon, authenticated;

-- ── Verificação final ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'member_occurrences') THEN
    RAISE EXCEPTION 'Migration member_occurrences: tabela nao foi criada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'member_occurrences' AND policyname = 'member_occurrences capability select'
  ) THEN
    RAISE EXCEPTION 'Migration member_occurrences: policy de leitura nao foi criada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'member_occurrences_register_history'
  ) THEN
    RAISE EXCEPTION 'Migration member_occurrences: trigger de historico nao foi criado';
  END IF;
  RAISE NOTICE 'Migration member_occurrences: tabela, policies e trigger confirmados ✓';
END $$;

COMMIT;
