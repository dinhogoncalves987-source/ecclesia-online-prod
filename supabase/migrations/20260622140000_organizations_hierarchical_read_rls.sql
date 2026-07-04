-- ============================================================
-- Migration: leitura/administração hierárquica em organizations
-- Data: 2026-06-22
-- ============================================================
-- PROBLEMA RESOLVIDO:
--   A policy de SELECT antiga ("organizations members read") usava
--   public.is_org_user(), que só reconhece vínculo DIRETO. Com isso:
--     • admin da Matriz não enxergava setores filhos;
--     • admin de Setor não enxergava congregações filhas;
--     • a tela Setores/Distritos mostrava "0 congregações" mesmo com
--       o parent_id correto no banco (o SELECT autenticado voltava vazio).
--
-- REGRA NOVA (hierárquica, baseada em parent_id):
--   Um usuário pode LER uma organização se for membro dela OU de
--   qualquer ANCESTRAL dela (Matriz vê setores e congregações;
--   setor vê suas congregações; congregação vê só a si mesma).
--   Um usuário pode ADMINISTRAR (update / criar filhos) se tiver
--   role admin/church_admin nela ou em qualquer ancestral.
--   Platform/super admin continua vendo e administrando tudo.
--
-- SEGURANÇA:
--   • Funções SECURITY DEFINER (search_path = public) — a varredura
--     da árvore roda como owner, evitando recursão de RLS.
--   • CTE recursiva com guarda de profundidade (<10) contra ciclos.
--   • Não altera dados. Não remove a hierarquia institucional.
--   • Mantém intactas as policies de INSERT de platform admin e DELETE.
-- ============================================================
-- COMO APLICAR:
--   Supabase Dashboard → SQL Editor → colar este arquivo → Run
-- ============================================================

-- ── Função: pode LER a organização (membro dela ou de ancestral) ──────────────
CREATE OR REPLACE FUNCTION public.can_read_organization(
  _user_id uuid,
  _organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user_id)
  OR EXISTS (
    WITH RECURSIVE chain AS (
      SELECT id, parent_id, 1 AS depth
      FROM public.organizations
      WHERE id = _organization_id
      UNION ALL
      SELECT o.id, o.parent_id, c.depth + 1
      FROM public.organizations o
      JOIN chain c ON o.id = c.parent_id
      WHERE c.depth < 10
    )
    SELECT 1
    FROM chain
    JOIN public.organization_users ou ON ou.organization_id = chain.id
    WHERE ou.user_id = _user_id
      AND COALESCE(ou.is_active, true) = true
  );
$$;

COMMENT ON FUNCTION public.can_read_organization(uuid, uuid) IS
  'True se o usuário é membro da organização ou de qualquer ancestral (ou platform admin).';

-- ── Função: pode ADMINISTRAR a organização (admin dela ou de ancestral) ───────
CREATE OR REPLACE FUNCTION public.can_admin_organization(
  _user_id uuid,
  _organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user_id)
  OR EXISTS (
    WITH RECURSIVE chain AS (
      SELECT id, parent_id, 1 AS depth
      FROM public.organizations
      WHERE id = _organization_id
      UNION ALL
      SELECT o.id, o.parent_id, c.depth + 1
      FROM public.organizations o
      JOIN chain c ON o.id = c.parent_id
      WHERE c.depth < 10
    )
    SELECT 1
    FROM chain
    JOIN public.organization_users ou ON ou.organization_id = chain.id
    WHERE ou.user_id = _user_id
      AND COALESCE(ou.is_active, true) = true
      AND ou.role IN ('admin', 'church_admin')
  );
$$;

COMMENT ON FUNCTION public.can_admin_organization(uuid, uuid) IS
  'True se o usuário tem role admin/church_admin na organização ou em qualquer ancestral (ou platform admin).';

-- ── SELECT: leitura hierárquica ───────────────────────────────────────────────
DROP POLICY IF EXISTS "organizations members read" ON public.organizations;
CREATE POLICY "organizations members read" ON public.organizations
FOR SELECT TO authenticated
USING (public.can_read_organization(auth.uid(), id));

-- ── UPDATE: admin direto ou de ancestral ──────────────────────────────────────
DROP POLICY IF EXISTS "organizations admins update" ON public.organizations;
CREATE POLICY "organizations admins update" ON public.organizations
FOR UPDATE TO authenticated
USING (public.can_admin_organization(auth.uid(), id))
WITH CHECK (public.can_admin_organization(auth.uid(), id));

-- ── INSERT de filhos: admin do pai (direto ou ancestral) + hierarquia válida ──
DROP POLICY IF EXISTS "organizations admins insert children" ON public.organizations;
CREATE POLICY "organizations admins insert children" ON public.organizations
FOR INSERT TO authenticated
WITH CHECK (
  parent_id IS NOT NULL
  AND public.can_admin_organization(auth.uid(), parent_id)
  AND EXISTS (
    SELECT 1
    FROM public.organizations AS parent_org
    WHERE parent_org.id = parent_id
      AND COALESCE(parent_org.active, true) = true
      AND public.is_valid_organization_hierarchy(parent_org.organization_type, organization_type)
  )
);

-- Mantidas sem alteração:
--   "organizations platform admins insert"  (insert irrestrito p/ platform admin)
--   "organizations platform admins delete"  (delete restrito a platform admin)

DO $$ BEGIN
  RAISE NOTICE 'organizations: leitura/admin hierárquicos habilitados ✓';
END $$;
