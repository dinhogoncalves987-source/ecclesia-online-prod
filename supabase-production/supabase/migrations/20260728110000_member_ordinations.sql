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
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Texto livre reaproveitando ECCLESIASTICAL_FUNCTIONS / ADMINISTRATIVE_ROLES
  -- (ver comentário no topo do arquivo) — não duplicamos catálogo no banco.
  role_or_function text NOT NULL,

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
  ON public.member_ordinations (member_id, role_or_function, start_date);

CREATE UNIQUE INDEX IF NOT EXISTS member_ordinations_legacy_unique_idx
  ON public.member_ordinations (organization_id, legacy_source, legacy_code)
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
CREATE POLICY "member_ordinations capability insert" ON public.member_ordinations
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_ordinations.member_id
      AND m.organization_id = member_ordinations.organization_id
      AND public.has_org_access_permission(
        auth.uid(), COALESCE(m.congregation_id, m.sector_id, m.organization_id), 'members.write'
      )
  )
);

DROP POLICY IF EXISTS "member_ordinations capability update" ON public.member_ordinations;
CREATE POLICY "member_ordinations capability update" ON public.member_ordinations
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_ordinations.member_id
      AND public.has_org_access_permission(
        auth.uid(), COALESCE(m.congregation_id, m.sector_id, m.organization_id), 'members.write'
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_ordinations.member_id
      AND public.has_org_access_permission(
        auth.uid(), COALESCE(m.congregation_id, m.sector_id, m.organization_id), 'members.write'
      )
  )
);

GRANT SELECT, INSERT, UPDATE ON public.member_ordinations TO authenticated;

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

  IF TG_OP = 'UPDATE' AND NEW.status = 'encerrado' AND OLD.status <> 'encerrado' THEN
    PERFORM public.register_member_history_event(
      NEW.member_id,
      'encerramento_funcao',
      'Encerramento: ' || NEW.role_or_function,
      NEW.notes,
      COALESCE(NEW.end_date, CURRENT_DATE)::timestamptz,
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
