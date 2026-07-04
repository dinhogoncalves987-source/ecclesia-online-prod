-- ============================================================
-- Migration: organizations_national_operational_foundation
-- Data: 2026-06-26 (atualizado para plataforma multi-cliente)
-- ============================================================
-- OBJETIVO:
--   1. Suporte completo a multi-raiz, multi-cliente e internacional
--   2. Expandir is_valid_organization_hierarchy para hierarquia flexível
--   3. Criar tabela organization_hierarchy_rules (referência documentacional)
--   4. Adicionar campos financeiros estruturais em organizations
--   5. Criar tabela organization_affiliations (fraternas / agrupamentos laterais)
--   6. Criar tabela organization_responsibles (responsáveis formais por unidade)
--   7. RLS policies para novas tabelas
--
-- ARQUITETURA MULTI-CLIENTE:
--   O Ecclesia é plataforma multi-cliente, multi-raiz, internacional.
--   Não existe raiz global única obrigatória.
--   CGADB é uma raiz/cliente possível (AD Brasil).
--   Restauração Internacional é outra raiz/cliente possível.
--   Igrejas simples são raízes independentes.
--   Múltiplas árvores coexistem com parent_id IS NULL.
--
-- HIERARQUIA FLEXÍVEL SUPORTADA:
--   international_convention → national_convention / state_convention / convencao / matriz / sede
--   national_convention      → state_convention / convencao / matriz / sede
--   state_convention         → matriz / sede
--   convencao (legado)       → matriz / sede
--   matriz                   → setor / congregacao (atalho direto)
--   sede                     → setor / congregacao (atalho direto)
--   setor                    → congregacao
-- ============================================================

-- ── 1. Atualizar validação hierárquica — suporte completo ───────────────────

CREATE OR REPLACE FUNCTION public.is_valid_organization_hierarchy(
  _parent_type text,
  _child_type  text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE

    -- ── Internacional ──────────────────────────────────────────────────────────
    -- Organizações internacionais podem criar qualquer nível abaixo.
    -- Suporta: Restauração Internacional → Portugal → Lisboa
    --          Restauração Internacional → Campo Espanha
    --          Restauração Internacional → AD Brasil (nacional) → ...
    WHEN _parent_type = 'international_convention'
         AND _child_type IN ('national_convention', 'state_convention', 'convencao', 'matriz', 'sede')
    THEN true

    -- ── Nacional ──────────────────────────────────────────────────────────────
    -- Nacional pode criar Estadual OU pular para Matriz/Sede diretamente.
    -- Suporta: AD Brasil → CIEPADERGS (estadual)
    --          AD Brasil → AD Caxias (matriz, sem convenção estadual formal)
    WHEN _parent_type = 'national_convention'
         AND _child_type IN ('state_convention', 'convencao', 'matriz', 'sede')
    THEN true

    -- ── Estadual ─────────────────────────────────────────────────────────────
    WHEN _parent_type = 'state_convention'
         AND _child_type IN ('matriz', 'sede')
    THEN true

    -- Convenção legada (compatibilidade)
    WHEN _parent_type = 'convencao'
         AND _child_type IN ('matriz', 'sede')
    THEN true

    -- ── Municipal / Campo / Sede ──────────────────────────────────────────────
    -- Matriz/Sede podem criar Setor OU Congregação direta (sem setor intermediário)
    WHEN _parent_type = 'matriz'
         AND _child_type IN ('setor', 'congregacao')
    THEN true

    WHEN _parent_type = 'sede'
         AND _child_type IN ('setor', 'congregacao')
    THEN true

    -- ── Intermediário ─────────────────────────────────────────────────────────
    WHEN _parent_type = 'setor'
         AND _child_type = 'congregacao'
    THEN true

    -- ── Todos os outros pares são bloqueados ─────────────────────────────────
    -- Inclui: congregacao criando qualquer filho
    --         setor criando matriz/sede/nacional/estadual
    --         qualquer filho criando seu pai ou avô
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.is_valid_organization_hierarchy(text, text) IS
  'Valida pares parent/child de organization_type para hierarquia flexível multi-cliente.
   Hierarquia AD Brasil:
     national_convention → state_convention/convencao → matriz/sede → setor → congregacao
   Hierarquia Internacional:
     international_convention → national_convention/state_convention/matriz/sede → ...
   Atalho permitido: matriz/sede → congregacao (sem setor intermediário).
   Múltiplas raízes coexistem com parent_id IS NULL.';

-- ── 2. Tabela de regras de hierarquia (REFERÊNCIA DOCUMENTACIONAL) ──────────
-- ATENÇÃO: esta tabela é informativa/documentacional.
-- A regra executável é a função is_valid_organization_hierarchy acima.
-- Ela NÃO é consultada pela função para validação em tempo real.

CREATE TABLE IF NOT EXISTS public.organization_hierarchy_rules (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_type text        NOT NULL,
  child_type  text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_hierarchy_rule UNIQUE (parent_type, child_type)
);

COMMENT ON TABLE public.organization_hierarchy_rules IS
  'REFERÊNCIA DOCUMENTACIONAL das regras de hierarquia organizacional.
   A validação executável está na função is_valid_organization_hierarchy().
   Esta tabela serve para documentação, auditoria e futura externalização das regras.';

-- Registros completos incluindo internacional e pulos de nível
INSERT INTO public.organization_hierarchy_rules (parent_type, child_type, description) VALUES
  -- Internacional
  ('international_convention', 'national_convention', 'Internacional → Nacional (ex: Restauração Internacional → AD Brasil)'),
  ('international_convention', 'state_convention',    'Internacional → Estadual (missões em estados/províncias)'),
  ('international_convention', 'convencao',           'Internacional → Convenção legada (compatibilidade)'),
  ('international_convention', 'matriz',              'Internacional → Matriz direta (campo missionário simples)'),
  ('international_convention', 'sede',                'Internacional → Sede direta (escritório regional)'),
  -- Nacional
  ('national_convention',      'state_convention',    'Nacional → Convenção Estadual (ex: CGADB → CIEPADERGS)'),
  ('national_convention',      'convencao',           'Nacional → Convenção legada (compatibilidade)'),
  ('national_convention',      'matriz',              'Nacional → Matriz direta (sem convenção estadual formal)'),
  ('national_convention',      'sede',                'Nacional → Sede direta (sem convenção estadual formal)'),
  -- Estadual
  ('state_convention',         'matriz',              'Estadual → Matriz Municipal'),
  ('state_convention',         'sede',                'Estadual → Sede'),
  ('convencao',                'matriz',              'Convenção legada → Matriz (compatibilidade)'),
  ('convencao',                'sede',                'Convenção legada → Sede (compatibilidade)'),
  -- Municipal
  ('matriz',                   'setor',               'Matriz → Setor / Distrito'),
  ('matriz',                   'congregacao',         'Matriz → Congregação direta (sem setor)'),
  ('sede',                     'setor',               'Sede → Setor / Distrito'),
  ('sede',                     'congregacao',         'Sede → Congregação direta (sem setor)'),
  -- Intermediário
  ('setor',                    'congregacao',         'Setor → Congregação')
ON CONFLICT (parent_type, child_type) DO UPDATE
  SET description = EXCLUDED.description,
      updated_at  = now();

-- RLS: leitura pública autenticada; escrita apenas para platform admin
ALTER TABLE public.organization_hierarchy_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hierarchy_rules authenticated select" ON public.organization_hierarchy_rules;
CREATE POLICY "hierarchy_rules authenticated select"
  ON public.organization_hierarchy_rules FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "hierarchy_rules platform admin all" ON public.organization_hierarchy_rules;
CREATE POLICY "hierarchy_rules platform admin all"
  ON public.organization_hierarchy_rules FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- ── 3. Campos financeiros estruturais em organizations ──────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS has_operational_cashbox     boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_financially_autonomous   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS financially_consolidates_to_id uuid
    REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cnpj                        text,
  ADD COLUMN IF NOT EXISTS financial_policy_notes      text;

COMMENT ON COLUMN public.organizations.has_operational_cashbox IS
  'Unidade opera caixa próprio (operacional). Padrão true.';
COMMENT ON COLUMN public.organizations.is_financially_autonomous IS
  'Unidade tem autonomia financeira plena (não consolida para cima). Padrão false.';
COMMENT ON COLUMN public.organizations.financially_consolidates_to_id IS
  'Referência da unidade para a qual esta consolida seu financeiro.';
COMMENT ON COLUMN public.organizations.cnpj IS
  'CNPJ da unidade (pessoa jurídica própria).';
COMMENT ON COLUMN public.organizations.financial_policy_notes IS
  'Notas de política financeira desta unidade.';

-- ── 4. Tabela organization_affiliations (fraternas / agrupamentos laterais) ──
-- Modelo lateral: NÃO é relação parent/child hierárquica.
-- Fraternas ficam na Convenção como agrupamentos laterais.

CREATE TABLE IF NOT EXISTS public.organization_affiliations (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id            uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  affiliated_organization_id uuid        REFERENCES public.organizations(id) ON DELETE SET NULL,
  affiliation_type           text        NOT NULL DEFAULT 'fraterna',
  name                       text        NOT NULL,
  description                text,
  is_active                  boolean     NOT NULL DEFAULT true,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organization_affiliations IS
  'Agrupamentos/vínculos laterais entre organizações (fraternas, grupos regionais, eventos).
   NÃO é relação parent/child hierárquica — não substitui Setor/Distrito.
   affiliation_type: fraterna | regional_group | event_group | pastoral_group';

CREATE INDEX IF NOT EXISTS idx_org_affiliations_org_id  ON public.organization_affiliations(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_affiliations_type    ON public.organization_affiliations(affiliation_type);
CREATE INDEX IF NOT EXISTS idx_org_affiliations_active  ON public.organization_affiliations(organization_id, is_active);

ALTER TABLE public.organization_affiliations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "affiliations read"   ON public.organization_affiliations;
DROP POLICY IF EXISTS "affiliations insert" ON public.organization_affiliations;
DROP POLICY IF EXISTS "affiliations update" ON public.organization_affiliations;
DROP POLICY IF EXISTS "affiliations delete" ON public.organization_affiliations;

CREATE POLICY "affiliations read" ON public.organization_affiliations
  FOR SELECT TO authenticated
  USING (public.can_read_organization(auth.uid(), organization_id));

CREATE POLICY "affiliations insert" ON public.organization_affiliations
  FOR INSERT TO authenticated
  WITH CHECK (public.can_admin_organization(auth.uid(), organization_id));

CREATE POLICY "affiliations update" ON public.organization_affiliations
  FOR UPDATE TO authenticated
  USING (public.can_admin_organization(auth.uid(), organization_id));

CREATE POLICY "affiliations delete" ON public.organization_affiliations
  FOR DELETE TO authenticated
  USING (public.can_admin_organization(auth.uid(), organization_id));

-- ── 5. Tabela organization_responsibles (responsáveis formais por unidade) ───

CREATE TABLE IF NOT EXISTS public.organization_responsibles (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  responsibility_type text        NOT NULL,
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at         timestamptz NOT NULL DEFAULT now(),
  is_active           boolean     NOT NULL DEFAULT true,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organization_responsibles IS
  'Responsáveis formais por unidade (pastor, secretário, tesoureiro, contato principal).
   Separado de organization_users (acesso) para distinguir responsabilidade titular de acesso operacional.
   responsibility_type: pastor_responsavel | secretario_responsavel | tesoureiro_responsavel | contato_principal';

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_resp_unique_active
  ON public.organization_responsibles(organization_id, responsibility_type)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_org_resp_org_id  ON public.organization_responsibles(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_resp_user_id ON public.organization_responsibles(user_id);
CREATE INDEX IF NOT EXISTS idx_org_resp_type    ON public.organization_responsibles(responsibility_type);

ALTER TABLE public.organization_responsibles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "responsibles read"   ON public.organization_responsibles;
DROP POLICY IF EXISTS "responsibles insert" ON public.organization_responsibles;
DROP POLICY IF EXISTS "responsibles update" ON public.organization_responsibles;
DROP POLICY IF EXISTS "responsibles delete" ON public.organization_responsibles;

CREATE POLICY "responsibles read" ON public.organization_responsibles
  FOR SELECT TO authenticated
  USING (public.can_read_organization(auth.uid(), organization_id));

CREATE POLICY "responsibles insert" ON public.organization_responsibles
  FOR INSERT TO authenticated
  WITH CHECK (public.can_admin_organization(auth.uid(), organization_id));

CREATE POLICY "responsibles update" ON public.organization_responsibles
  FOR UPDATE TO authenticated
  USING (public.can_admin_organization(auth.uid(), organization_id));

CREATE POLICY "responsibles delete" ON public.organization_responsibles
  FOR DELETE TO authenticated
  USING (public.can_admin_organization(auth.uid(), organization_id));

-- ── 6. Política de INSERT em organizations ──────────────────────────────────
-- Usa can_admin_organization (hierárquica) em vez de has_org_role no parent_id.
-- Isso permite que um admin nacional crie uma convenção estadual abaixo dele,
-- mesmo que seu papel direto seja só no nível nacional.
-- Platform admins criam raízes (parent_id IS NULL) via policy separada.

DROP POLICY IF EXISTS "organizations admins insert children" ON public.organizations;

CREATE POLICY "organizations admins insert children"
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (
  -- Deve ter parent_id (não é raiz) e a hierarquia deve ser válida
  parent_id IS NOT NULL
  AND public.is_valid_organization_hierarchy(
    (SELECT organization_type FROM public.organizations WHERE id = parent_id LIMIT 1),
    organization_type
  )
  AND (
    -- Platform admins podem criar em qualquer lugar
    public.is_platform_admin(auth.uid())
    -- Ou usuário pode administrar a organização pai (hierárquico)
    OR public.can_admin_organization(auth.uid(), parent_id)
  )
);

COMMENT ON POLICY "organizations admins insert children" ON public.organizations IS
  'Permite criação de filhos estruturais por admins hierárquicos (can_admin_organization).
   can_admin_organization é recursiva — um admin nacional pode criar filhos estaduais/municipais.
   Platform admins têm acesso irrestrito.
   Regra de hierarquia validada por is_valid_organization_hierarchy().';

-- ── Finalização ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '==========================================================';
  RAISE NOTICE 'organizations_national_operational_foundation aplicada!';
  RAISE NOTICE '';
  RAISE NOTICE 'Plataforma multi-cliente, multi-raiz, internacional:';
  RAISE NOTICE '  international_convention → nacional/estadual/matriz/sede';
  RAISE NOTICE '  national_convention → estadual/matriz/sede';
  RAISE NOTICE '  state_convention/convencao → matriz/sede';
  RAISE NOTICE '  matriz/sede → setor/congregacao (atalho direto)';
  RAISE NOTICE '  setor → congregacao';
  RAISE NOTICE '';
  RAISE NOTICE 'Múltiplas raízes independentes via parent_id IS NULL';
  RAISE NOTICE 'INSERT policy usa can_admin_organization (hierárquico)';
  RAISE NOTICE '';
  RAISE NOTICE 'Novas tabelas:';
  RAISE NOTICE '  organization_hierarchy_rules (referência documentacional)';
  RAISE NOTICE '  organization_affiliations (fraternas/laterais)';
  RAISE NOTICE '  organization_responsibles (responsáveis formais)';
  RAISE NOTICE '==========================================================';
END $$;
