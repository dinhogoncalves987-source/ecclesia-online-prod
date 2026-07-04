-- ============================================================
-- Migration: platform_support_departments
-- Data: 2026-06-26
-- ============================================================
-- Departamentos dinâmicos de suporte da plataforma Ecclesia.
-- Permite criar, editar, ativar e desativar departamentos.
-- Não hardcoded — totalmente configurável pelo Super Admin.
--
-- NÃO APLICAR AUTOMATICAMENTE. Executar manualmente no Supabase.
-- ============================================================

-- ── 1. platform_support_departments ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_support_departments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  slug        text        NOT NULL,
  description text,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  icon_key    text,
  color_key   text,
  module_keys text[]      NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_dept_slug UNIQUE (slug)
);

COMMENT ON TABLE public.platform_support_departments IS
  'Departamentos dinâmicos de suporte da plataforma Ecclesia.
   Cada departamento agrupa módulos relacionados e define a área de atuação dos agentes.
   Totalmente configurável — não hardcoded no código.
   module_keys são as chaves de módulo relacionadas (secretaria, financeiro, etc).';

CREATE INDEX IF NOT EXISTS idx_dept_active     ON public.platform_support_departments(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_dept_slug       ON public.platform_support_departments(slug);

ALTER TABLE public.platform_support_departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dept read"   ON public.platform_support_departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "dept manage" ON public.platform_support_departments FOR ALL    TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- ── 2. platform_support_agent_departments ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_support_agent_departments (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_user_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id uuid        NOT NULL REFERENCES public.platform_support_departments(id) ON DELETE CASCADE,
  is_primary    boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_agent_dept UNIQUE (agent_user_id, department_id)
);

COMMENT ON TABLE public.platform_support_agent_departments IS
  'Vínculo entre agentes da plataforma e departamentos de suporte.
   Um agente pode atuar em múltiplos departamentos.
   is_primary = true indica o departamento principal do agente.';

CREATE INDEX IF NOT EXISTS idx_agent_dept_user ON public.platform_support_agent_departments(agent_user_id);
CREATE INDEX IF NOT EXISTS idx_agent_dept_dept ON public.platform_support_agent_departments(department_id);

ALTER TABLE public.platform_support_agent_departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_dept read" ON public.platform_support_agent_departments FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR auth.uid() = agent_user_id);

CREATE POLICY "agent_dept manage" ON public.platform_support_agent_departments FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- ── 3. Adicionar department_id em platform_support_tickets ───────────────────
-- Tabela já existe — adicionar coluna se não existir.
-- Compatibilidade retroativa: department (text) continua como fallback.

ALTER TABLE public.platform_support_tickets
  ADD COLUMN IF NOT EXISTS department_id uuid
    REFERENCES public.platform_support_departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_dept_id ON public.platform_support_tickets(department_id);

COMMENT ON COLUMN public.platform_support_tickets.department_id IS
  'Referência ao departamento dinâmico. Preferir sobre o campo "department" (text legado).
   department (text) mantido para compatibilidade retroativa.';

-- ── 4. Seed: Departamentos padrão (idempotente) ───────────────────────────────

INSERT INTO public.platform_support_departments
  (name, slug, description, sort_order, module_keys)
VALUES
  ('Administração',   'administracao',  'Gestão geral da plataforma, operações internas e auditoria.',          1,  ARRAY['dashboard','conversas','suporte','auditoria']),
  ('Secretaria',      'secretaria',     'Suporte para secretaria de igrejas: membros, cartas, documentos.',     2,  ARRAY['secretaria','membros','carteira_membros','cartas_recomendacao','solicitacoes','documentos','comunicacao','agenda','escalas','pequenos_grupos','assembleia_geral']),
  ('Financeiro',      'financeiro',     'Suporte financeiro: contas, transações, relatórios.',                  3,  ARRAY['financeiro','relatorios']),
  ('Culto & Louvor',  'culto_louvor',   'Suporte para culto, louvor, roteiros e escalas de músicos.',           4,  ARRAY['culto_louvor','escalas','campanhas']),
  ('Técnico',         'tecnico',        'Suporte técnico: configurações, integrações e diagnósticos.',          5,  ARRAY['unidades_locais','configuracoes','auditoria','suporte']),
  ('Implantação',     'implantacao',    'Onboarding e implantação de novas igrejas na plataforma.',             6,  ARRAY['unidades_locais','gerenciador_acesso','secretaria','membros','documentos','solicitacoes']),
  ('TV Digital',      'tv_digital',     'Suporte para transmissões ao vivo, TV online e mídia digital.',        7,  ARRAY['tv_online','culto_louvor','midia','transmissao']),
  ('Comunidade',      'comunidade',     'Suporte para módulo de comunidade, comunicação e engajamento.',        8,  ARRAY['comunidade','comunicacao','membros']),
  ('Marketplace',     'marketplace',    'Suporte para marketplace e integrações comerciais.',                   9,  ARRAY['marketplace','comunidade','financeiro'])
ON CONFLICT (slug) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      sort_order  = EXCLUDED.sort_order,
      module_keys = EXCLUDED.module_keys,
      updated_at  = now();

-- ── Finalização ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '==========================================================';
  RAISE NOTICE 'platform_support_departments aplicada!';
  RAISE NOTICE '';
  RAISE NOTICE 'Tabelas criadas:';
  RAISE NOTICE '  platform_support_departments       (departamentos dinâmicos)';
  RAISE NOTICE '  platform_support_agent_departments (vínculo agente/depto)';
  RAISE NOTICE '';
  RAISE NOTICE 'Coluna adicionada:';
  RAISE NOTICE '  platform_support_tickets.department_id';
  RAISE NOTICE '';
  RAISE NOTICE 'Departamentos padrão criados: 9 departamentos';
  RAISE NOTICE '  administracao, secretaria, financeiro, culto_louvor,';
  RAISE NOTICE '  tecnico, implantacao, tv_digital, comunidade, marketplace';
  RAISE NOTICE '==========================================================';
END $$;
