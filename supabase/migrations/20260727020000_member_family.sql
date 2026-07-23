-- ============================================================================
-- Migration: member_family — familia e dependentes relacionais
-- Timestamp: 20260727020000
-- Parte 1 — Fundacao Cadastral do Membro (Ecclesia Online)
-- ============================================================================
--
-- REVISADO (auditoria pos-implementacao): mesma correcao de RLS aplicada em
-- 20260727010000_member_addresses.sql — ver comentario la para o raciocinio
-- completo. Resumo: has_org_role() com roles fixos ('admin', ...) substituido
-- por has_org_access_permission() com capacidades 'members.read'/'members.write'
-- resolvidas pela organizacao efetiva do MEMBRO (mesmo padrao real usado por
-- public.members), com suporte a hierarquia.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.member_family (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Relacionamento
  relation text NOT NULL,
  -- Valores: pai, mae, esposo, esposa, filho, filha, enteado, enteada,
  --         dependente, responsavel, outro

  -- Dados do familiar
  full_name text NOT NULL,
  related_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  -- preenchido quando o familiar tambem e membro (relacao bidirecional)

  birth_date date,
  gender text,
  cpf text,
  phone text,
  notes text,

  -- Se a relacao esta ativa
  is_active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_member_family_member ON public.member_family (member_id);
CREATE INDEX IF NOT EXISTS idx_member_family_org ON public.member_family (organization_id);
CREATE INDEX IF NOT EXISTS idx_member_family_relation ON public.member_family (member_id, relation);
CREATE INDEX IF NOT EXISTS idx_member_family_related ON public.member_family (related_member_id) WHERE related_member_id IS NOT NULL;

-- Impede duplicacao evidente: mesmo membro, mesmo familiar (nome), mesma
-- relacao. Nao limita a quantidade de filhos/dependentes — apenas bloqueia
-- cadastrar o "mesmo" familiar duas vezes com o mesmo nome e relacao.
CREATE UNIQUE INDEX IF NOT EXISTS member_family_unique_relation
  ON public.member_family (member_id, relation, full_name)
  WHERE is_active = true;

-- RLS
ALTER TABLE public.member_family ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "member_family org read" ON public.member_family;
DROP POLICY IF EXISTS "member_family staff insert" ON public.member_family;
DROP POLICY IF EXISTS "member_family staff update" ON public.member_family;
DROP POLICY IF EXISTS "member_family staff delete" ON public.member_family;

CREATE POLICY "member_family capability select" ON public.member_family
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_family.member_id
      AND public.has_org_access_permission(
        auth.uid(), COALESCE(m.congregation_id, m.sector_id, m.organization_id), 'members.read'
      )
  )
);

CREATE POLICY "member_family capability insert" ON public.member_family
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_family.member_id
      AND m.organization_id = member_family.organization_id
      AND public.has_org_access_permission(
        auth.uid(), COALESCE(m.congregation_id, m.sector_id, m.organization_id), 'members.write'
      )
  )
);

CREATE POLICY "member_family capability update" ON public.member_family
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_family.member_id
      AND public.has_org_access_permission(
        auth.uid(), COALESCE(m.congregation_id, m.sector_id, m.organization_id), 'members.write'
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_family.member_id
      AND public.has_org_access_permission(
        auth.uid(), COALESCE(m.congregation_id, m.sector_id, m.organization_id), 'members.write'
      )
  )
);

CREATE POLICY "member_family capability delete" ON public.member_family
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_family.member_id
      AND public.has_org_access_permission(
        auth.uid(), COALESCE(m.congregation_id, m.sector_id, m.organization_id), 'members.write'
      )
  )
);

DROP TRIGGER IF EXISTS update_member_family_updated_at ON public.member_family;
CREATE TRIGGER update_member_family_updated_at
BEFORE UPDATE ON public.member_family
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_family TO authenticated;

-- ── Verificacao final ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'member_family'
  ) THEN
    RAISE EXCEPTION 'Migration member_family: tabela nao foi criada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'member_family'
      AND policyname = 'member_family capability select'
  ) THEN
    RAISE EXCEPTION 'Migration member_family: policy de leitura nao foi criada';
  END IF;

  RAISE NOTICE 'Migration member_family: tabela, indices e policies confirmados ✓';
END $$;

COMMIT;
