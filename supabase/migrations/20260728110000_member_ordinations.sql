-- ============================================================================
-- Migration: member_ordinations
-- Timestamp: 20260728110000
-- OPERAÇÃO 1 — Fundação compartilhada dos domínios + Secretaria
-- ============================================================================
--
-- Histórico temporal de ordenações, cargos e nomeações ministeriais/
-- administrativas de um membro. NÃO substitui members.member_role /
-- members.administrative_role (que continuam sendo a ficha "vigente" do
-- membro, usados por toda a UI já existente — Carteira, listagens, etc.).
-- Esta tabela é um COMPLEMENTO: registra QUANDO cada função começou/acabou,
-- permitindo múltiplos registros ao longo do tempo.
--
-- Catálogo de função/cargo: reaproveita EXATAMENTE os mesmos valores já
-- usados em members.member_role (ECCLESIASTICAL_FUNCTIONS) e
-- members.administrative_role (ADMINISTRATIVE_ROLES), definidos em
-- src/lib/secretariaConstants.ts. Não recriamos esse catálogo no banco —
-- role_or_function é texto livre, validado no frontend pelo mesmo <select>
-- que a ficha do membro já usa, exatamente como member_role/
-- administrative_role hoje (nenhum dos dois tem CHECK constraint no banco).
--
-- Sincronização: esta operação delibera NÃO escrever de volta em
-- members.member_role/administrative_role automaticamente a partir daqui —
-- isso seria uma mudança de comportamento não solicitada e arriscada. A
-- ficha do membro continua sendo atualizada pelo wizard existente; este
-- histórico apenas documenta a linha do tempo em paralelo. Ver documentação
-- de limitações em docs/architecture/operacao-1-secretaria.md.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.member_history') IS NULL THEN
    RAISE EXCEPTION 'member_ordinations preflight failed: public.member_history nao existe (aplique 20260728090000 primeiro)';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.member_ordinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,

  -- Texto livre reaproveitando ECCLESIASTICAL_FUNCTIONS / ADMINISTRATIVE_ROLES
  -- (ver comentário no topo do arquivo) — não duplicamos catálogo no banco.
  role_or_function text NOT NULL CHECK (btrim(role_or_function) <> ''),

  ordination_type text NOT NULL DEFAULT 'nomeacao'
    CHECK (ordination_type IN ('ordenacao', 'nomeacao', 'eleicao', 'consagracao', 'outro')),
  ordination_date date,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'encerrado', 'revogado')),

  -- Autoridade responsável — texto livre e, quando a autoridade também é um
  -- membro cadastrado, vínculo real com public.members (sem duplicar pessoa).
  authority_name text,
  authority_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,

  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  attachment_path text,
  notes text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ended_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_member_ordinations_member ON public.member_ordinations (member_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_member_ordinations_org ON public.member_ordinations (organization_id);
CREATE INDEX IF NOT EXISTS idx_member_ordinations_status ON public.member_ordinations (member_id, status) WHERE status = 'ativo';

-- Guarda simples contra duplo-clique/duplicidade evidente — não impõe regra
-- de negócio de "só uma função ativa por vez" (uma pessoa pode acumular
-- funções distintas simultaneamente, conforme o domínio real da igreja).
CREATE UNIQUE INDEX IF NOT EXISTS member_ordinations_unique_start
  ON public.member_ordinations (member_id, lower(btrim(role_or_function)), start_date);

CREATE UNIQUE INDEX IF NOT EXISTS member_ordinations_legacy_unique_idx
  ON public.member_ordinations (
    organization_id, legacy_source, COALESCE(legacy_module, ''), legacy_code
  )
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

DROP TRIGGER IF EXISTS update_member_ordinations_updated_at ON public.member_ordinations;
CREATE TRIGGER update_member_ordinations_updated_at
BEFORE UPDATE ON public.member_ordinations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.member_ordinations ENABLE ROW LEVEL SECURITY;

-- Sem confidencialidade dedicada aqui: cargo/função ministerial é dado
-- institucional (já público dentro da própria organização hoje, via
-- members.member_role/administrative_role) — segue o mesmo padrão de
-- member_addresses/member_family (members.read / members.write).
DROP POLICY IF EXISTS "member_ordinations capability select" ON public.member_ordinations;
CREATE POLICY "member_ordinations capability select" ON public.member_ordinations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_ordinations.member_id
      AND public.has_org_access_permission(
        auth.uid(), COALESCE(m.congregation_id, m.sector_id, m.organization_id), 'members.read'
      )
  )
);

DROP POLICY IF EXISTS "member_ordinations capability insert" ON public.member_ordinations;
DROP POLICY IF EXISTS "member_ordinations capability update" ON public.member_ordinations;
REVOKE INSERT, UPDATE, DELETE ON public.member_ordinations FROM authenticated;
GRANT SELECT ON public.member_ordinations TO authenticated;

CREATE OR REPLACE FUNCTION public.create_member_ordination(
  p_member_id uuid,
  p_role_or_function text,
  p_ordination_type text DEFAULT 'nomeacao',
  p_ordination_date date DEFAULT NULL,
  p_start_date date DEFAULT CURRENT_DATE,
  p_authority_name text DEFAULT NULL,
  p_authority_member_id uuid DEFAULT NULL,
  p_document_id uuid DEFAULT NULL,
  p_attachment_path text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id uuid;
  v_base_org_id uuid;
  v_authority_org_id uuid;
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
    RAISE EXCEPTION 'access denied to register ordination';
  END IF;

  IF NULLIF(btrim(p_role_or_function), '') IS NULL THEN
    RAISE EXCEPTION 'role or function is required';
  END IF;

  IF p_authority_member_id IS NOT NULL THEN
    SELECT COALESCE(congregation_id, sector_id, organization_id)
      INTO v_authority_org_id
    FROM public.members
    WHERE id = p_authority_member_id;

    IF v_authority_org_id IS NULL
       OR NOT public.has_org_access_permission(auth.uid(), v_authority_org_id, 'members.read') THEN
      RAISE EXCEPTION 'authority member not found or inaccessible';
    END IF;
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

  INSERT INTO public.member_ordinations (
    member_id, organization_id, role_or_function, ordination_type,
    ordination_date, start_date, authority_name, authority_member_id,
    document_id, attachment_path, notes, created_by
  ) VALUES (
    p_member_id, v_org_id, btrim(p_role_or_function),
    COALESCE(p_ordination_type, 'nomeacao'), p_ordination_date,
    COALESCE(p_start_date, CURRENT_DATE), NULLIF(btrim(p_authority_name), ''),
    p_authority_member_id, p_document_id, p_attachment_path,
    NULLIF(btrim(p_notes), ''), auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_member_ordination(
  uuid, text, text, date, date, text, uuid, uuid, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_member_ordination(
  uuid, text, text, date, date, text, uuid, uuid, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_member_ordination_status(
  p_ordination_id uuid,
  p_status text,
  p_end_date date DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.member_ordinations%ROWTYPE;
  v_org_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT * INTO v_row
  FROM public.member_ordinations
  WHERE id = p_ordination_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ordination not found';
  END IF;

  SELECT COALESCE(congregation_id, sector_id, organization_id)
    INTO v_org_id
  FROM public.members
  WHERE id = v_row.member_id;

  IF NOT public.has_org_access_permission(auth.uid(), v_org_id, 'members.write') THEN
    RAISE EXCEPTION 'access denied to update ordination';
  END IF;

  IF NOT (
    (v_row.status = 'ativo' AND p_status IN ('encerrado', 'revogado'))
    OR v_row.status = p_status
  ) THEN
    RAISE EXCEPTION 'invalid ordination status transition: % -> %', v_row.status, p_status;
  END IF;

  IF COALESCE(p_end_date, CURRENT_DATE) < v_row.start_date THEN
    RAISE EXCEPTION 'end date cannot precede start date';
  END IF;

  UPDATE public.member_ordinations
  SET status = p_status,
      end_date = CASE
        WHEN p_status IN ('encerrado', 'revogado') THEN COALESCE(p_end_date, CURRENT_DATE)
        ELSE end_date
      END,
      ended_by = CASE
        WHEN p_status IN ('encerrado', 'revogado') THEN auth.uid()
        ELSE ended_by
      END
  WHERE id = p_ordination_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_member_ordination_status(uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_member_ordination_status(uuid, text, date) TO authenticated;

-- ── Trigger: cria/encerra automaticamente o evento na timeline ─────────
CREATE OR REPLACE FUNCTION public._member_ordinations_register_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_type_label text;
BEGIN
  v_type_label := CASE NEW.ordination_type
    WHEN 'ordenacao' THEN 'Ordenação'
    WHEN 'eleicao' THEN 'Eleição'
    WHEN 'consagracao' THEN 'Consagração'
    WHEN 'outro' THEN 'Nomeação'
    ELSE 'Nomeação'
  END;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.register_member_history_event(
      NEW.member_id,
      CASE WHEN NEW.ordination_type = 'ordenacao' THEN 'ordenacao' ELSE 'nomeacao' END,
      v_type_label || ': ' || NEW.role_or_function,
      NEW.notes,
      COALESCE(NEW.ordination_date, NEW.start_date)::timestamptz,
      'secretaria',
      'member_ordinations',
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

  IF TG_OP = 'UPDATE'
     AND NEW.status IN ('encerrado', 'revogado')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.register_member_history_event(
      NEW.member_id,
      'encerramento_funcao',
      CASE
        WHEN NEW.status = 'revogado' THEN 'Revogação: '
        ELSE 'Encerramento: '
      END || NEW.role_or_function,
      NEW.notes,
      COALESCE(NEW.end_date, CURRENT_DATE)::timestamptz,
      'secretaria',
      'member_ordinations',
      NEW.id,
      NEW.document_id,
      NEW.attachment_path,
      'normal',
      NULL,
      NULL,
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_ordinations_register_history_insert ON public.member_ordinations;
CREATE TRIGGER member_ordinations_register_history_insert
AFTER INSERT ON public.member_ordinations
FOR EACH ROW EXECUTE FUNCTION public._member_ordinations_register_history();

DROP TRIGGER IF EXISTS member_ordinations_register_history_update ON public.member_ordinations;
CREATE TRIGGER member_ordinations_register_history_update
AFTER UPDATE OF status ON public.member_ordinations
FOR EACH ROW EXECUTE FUNCTION public._member_ordinations_register_history();

REVOKE ALL ON FUNCTION public._member_ordinations_register_history() FROM PUBLIC, anon, authenticated;

-- ── Verificação final ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'member_ordinations') THEN
    RAISE EXCEPTION 'Migration member_ordinations: tabela nao foi criada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'member_ordinations' AND policyname = 'member_ordinations capability select'
  ) THEN
    RAISE EXCEPTION 'Migration member_ordinations: policy de leitura nao foi criada';
  END IF;
  RAISE NOTICE 'Migration member_ordinations: tabela, policies e triggers confirmados ✓';
END $$;

COMMIT;
