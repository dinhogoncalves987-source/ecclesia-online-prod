-- ============================================================================
-- Migration: member_addresses
-- Timestamp: 20260727010000
-- Parte 1 — Fundacao Cadastral do Membro (Ecclesia Online)
-- ============================================================================
--
-- REVISADO (auditoria pos-implementacao):
-- A versao original desta migration usava has_org_role() com um array de
-- roles fixo ('admin','church_admin','secretary','pastor','leader') e SEM
-- suporte a hierarquia (distrito/setor administrando membros de congregacoes
-- abaixo dele). Esse NAO e o modelo de autorizacao real usado hoje pela
-- propria tabela public.members (ver 20260716130000_hierarchical_access_
-- responsibilities.sql, policies "members capability *"), que usa:
--   has_org_access_permission(auth.uid(), COALESCE(congregation_id, sector_id,
--     organization_id), 'members.read' | 'members.write')
-- Alem disso 'admin' nunca existe como role real no projeto (o role canonico
-- e 'church_admin' — ver src/lib/permissions.ts), entao a policy antiga nunca
-- teria autorizado um church_admin comum via essa branch especifica.
-- Esta versao final replica exatamente o padrao real de public.members,
-- resolvendo a organizacao efetiva do endereco via JOIN com members.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.member_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  address_type text NOT NULL DEFAULT 'residencial',
  zip_code text,
  street_type text,
  street text,
  number text,
  complement text,
  neighborhood text,
  city text,
  state text,
  country text DEFAULT 'Brasil',
  reference_point text,
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_addresses_member ON public.member_addresses (member_id);
CREATE INDEX IF NOT EXISTS idx_member_addresses_org ON public.member_addresses (organization_id);
CREATE INDEX IF NOT EXISTS idx_member_addresses_type ON public.member_addresses (member_id, address_type);
CREATE UNIQUE INDEX IF NOT EXISTS member_addresses_one_primary ON public.member_addresses (member_id) WHERE is_primary = true AND is_active = true;

ALTER TABLE public.member_addresses ENABLE ROW LEVEL SECURITY;

-- Autorizacao pelo mesmo modelo de capacidades hierarquicas usado por
-- public.members. A "organizacao efetiva" do endereco e a do MEMBRO
-- (congregation_id > sector_id > organization_id), nao a organization_id
-- bruta gravada na propria linha de member_addresses — isso garante que um
-- administrador de distrito/setor com inheritsToDescendants continue
-- conseguindo ler/escrever enderecos de membros de congregacoes abaixo dele,
-- exatamente como já acontece hoje para a tabela members.
DROP POLICY IF EXISTS "member_addresses org read" ON public.member_addresses;
DROP POLICY IF EXISTS "member_addresses staff insert" ON public.member_addresses;
DROP POLICY IF EXISTS "member_addresses staff update" ON public.member_addresses;
DROP POLICY IF EXISTS "member_addresses staff delete" ON public.member_addresses;

CREATE POLICY "member_addresses capability select" ON public.member_addresses
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_addresses.member_id
      AND public.has_org_access_permission(
        auth.uid(), COALESCE(m.congregation_id, m.sector_id, m.organization_id), 'members.read'
      )
  )
);

CREATE POLICY "member_addresses capability insert" ON public.member_addresses
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_addresses.member_id
      AND m.organization_id = member_addresses.organization_id
      AND public.has_org_access_permission(
        auth.uid(), COALESCE(m.congregation_id, m.sector_id, m.organization_id), 'members.write'
      )
  )
);

CREATE POLICY "member_addresses capability update" ON public.member_addresses
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_addresses.member_id
      AND public.has_org_access_permission(
        auth.uid(), COALESCE(m.congregation_id, m.sector_id, m.organization_id), 'members.write'
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_addresses.member_id
      AND public.has_org_access_permission(
        auth.uid(), COALESCE(m.congregation_id, m.sector_id, m.organization_id), 'members.write'
      )
  )
);

CREATE POLICY "member_addresses capability delete" ON public.member_addresses
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_addresses.member_id
      AND public.has_org_access_permission(
        auth.uid(), COALESCE(m.congregation_id, m.sector_id, m.organization_id), 'members.write'
      )
  )
);

DROP TRIGGER IF EXISTS update_member_addresses_updated_at ON public.member_addresses;
CREATE TRIGGER update_member_addresses_updated_at
BEFORE UPDATE ON public.member_addresses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_addresses TO authenticated;

-- ── Verificacao final ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'member_addresses'
  ) THEN
    RAISE EXCEPTION 'Migration member_addresses: tabela nao foi criada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'member_addresses'
      AND policyname = 'member_addresses capability select'
  ) THEN
    RAISE EXCEPTION 'Migration member_addresses: policy de leitura nao foi criada';
  END IF;

  RAISE NOTICE 'Migration member_addresses: tabela, indices e policies confirmados ✓';
END $$;

COMMIT;
