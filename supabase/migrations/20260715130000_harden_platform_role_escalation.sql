-- ============================================================================
-- Migration: harden_platform_role_escalation
-- FASE 1 — Eliminar escalada para super_admin (P0)
--
-- PROBLEMA COMPROVADO (schema real inspecionado nesta revisão):
--   1. public.handle_new_user() (definida em
--      supabase/migrations/20260512090000_staging_core_baseline.sql e
--      redefinida em 20260513120000_staging_org_invite_link.sql) copiava
--      `platform_role` diretamente de `raw_user_meta_data`:
--
--        NULLIF(NEW.raw_user_meta_data->>'platform_role', '')
--
--      Como `raw_user_meta_data` é fornecido pelo PRÓPRIO cliente em
--      `supabase.auth.signUp({ options: { data: { platform_role: 'super_admin' } } })`,
--      qualquer pessoa podia se autopromover a super_admin no cadastro.
--
--   2. A policy "profiles users update own" (mesma migration) usava:
--        USING (auth.uid() = user_id OR is_platform_admin(auth.uid()))
--        WITH CHECK (auth.uid() = user_id OR is_platform_admin(auth.uid()))
--
--      Isso autoriza a LINHA (auth.uid() = user_id), mas não restringe QUAIS
--      COLUNAS podem mudar. Qualquer usuário autenticado podia rodar
--      `update({ platform_role: 'super_admin' }).eq('user_id', auth.uid())`
--      e a policy aprovava, porque ele está de fato atualizando a própria
--      linha — apenas a coluna errada.
--
--   3. public.is_platform_admin(_user_id) confiava em
--      `profiles.platform_role`, ou seja, a mesma coluna que o item 1/2
--      permitiam o próprio usuário escrever. A autoridade administrativa
--      dependia de um dado editável pelo usuário comum.
--
-- CORREÇÃO (forward-only, não edita migrations antigas):
--   A. handle_new_user(): passa a IGNORAR platform_role/role/church_role/
--      qualquer permissão vinda de raw_user_meta_data. Cria o profile
--      apenas com full_name/email, sempre com platform_role = NULL.
--      (O bloco de auto-join por church_slug é tratado na migration da
--      FASE 2 — 20260715141000 — para manter a separação de escopo.)
--
--   B. Grants por coluna em public.profiles: nenhuma sessão comum
--      (`authenticated`) pode mais fazer UPDATE nas colunas
--      platform_role/user_id/email — apenas nas colunas comprovadamente
--      seguras (full_name, role_title, phone, avatar_url). Isso protege a
--      coluna mesmo que uma policy futura volte a ser permissiva por erro
--      (defesa em profundidade, independente da RLS).
--
--   C. Trigger de proteção (public.protect_profiles_admin_columns): reforça
--      a mesma regra a nível de linha/trigger, revertendo qualquer tentativa
--      de alterar platform_role/user_id/email fora da RPC administrativa
--      abaixo — cobre também clientes que usam SECURITY DEFINER próprios ou
--      chamadas diretas com a service role indevidamente.
--
--   D. RPC segura public.admin_set_platform_role(_target_user_id, _new_role):
--      único caminho para conceder/revogar platform_role de OUTRO usuário.
--      SECURITY DEFINER, search_path fixo, valida is_platform_admin(auth.uid())
--      internamente, EXECUTE revogado de anon/public, concedido apenas a
--      authenticated (o próprio corpo da função nega quem não é admin).
--      Substitui os updates diretos que existiam em
--      src/pages/GerenciarAcessos.tsx e src/pages/SuperAdmin.tsx.
--
--   E. is_platform_admin(_user_id): deixa de ler profiles.platform_role e
--      user_roles. A única raiz de autoridade passa a ser super_admins.
--      Isso evita herdar policies legadas de user_roles que permitiam a uma
--      conta com papel "admin" inserir outros papéis globais.
--
--   F. Policies legadas de super_admins/user_roles são removidas e recriadas
--      sobre a nova raiz de autoridade. Também redefine is_superadmin() e
--      is_platform_finance_admin(), eliminando atalhos antigos que ainda
--      confiavam em profiles.platform_role/user_roles.
--
-- ATENÇÃO OPERACIONAL (não executada automaticamente por esta migration):
--   Depois que esta migration remover profiles.platform_role da autoridade,
--   qualquer conta que hoje só tem platform_role/user_roles setado (sem linha
--   em super_admins) PERDE acesso administrativo real. A regularização da
--   autoridade raiz deve ocorrer diretamente em super_admins, após auditoria
--   humana, por um administrador legítimo do banco.
--   Use o arquivo de auditoria (somente leitura)
--   supabase/audits/20260715_audit_platform_role.sql ANTES de aplicar esta
--   migration em qualquer ambiente, para saber quem precisa de regularização.
--
-- NÃO aplicar em produção sem revisão e aprovação explícita.
-- ============================================================================

-- ── A. handle_new_user(): nunca copiar platform_role/roles/permissões ───────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_slug text;
  org_id uuid;
BEGIN
  -- SEGURANÇA: platform_role NUNCA é lido de raw_user_meta_data. O cadastro
  -- cria apenas os campos seguros do perfil; platform_role começa sempre
  -- NULL e só pode ser alterado depois via public.admin_set_platform_role().
  INSERT INTO public.profiles (user_id, full_name, email, platform_role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    NULL
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Bloco de auto-associação por church_slug preservado nesta migration por
  -- compatibilidade histórica; é removido explicitamente pela migration da
  -- FASE 2 (20260715141000_remove_open_slug_join.sql), que substitui esta
  -- função inteira novamente e não recria este bloco.
  invite_slug := NULLIF(trim(NEW.raw_user_meta_data->>'church_slug'), '');
  IF invite_slug IS NOT NULL THEN
    SELECT o.id INTO org_id
    FROM public.organizations o
    WHERE o.slug = invite_slug
      AND COALESCE(o.active, true) = true
    LIMIT 1;

    IF org_id IS NOT NULL THEN
      INSERT INTO public.organization_users (organization_id, user_id, role, is_active)
      VALUES (org_id, NEW.id, 'member', true)
      ON CONFLICT (organization_id, user_id)
      DO UPDATE SET is_active = true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── B. Grants por coluna: só colunas seguras são atualizáveis por authenticated ──
-- Revoga UPDATE geral e concede apenas nas colunas comprovadamente seguras.
-- platform_role, user_id e email deixam de ser alteráveis por qualquer UPDATE
-- vindo da role `authenticated` — independentemente de qualquer policy RLS.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, role_title, phone, avatar_url) ON public.profiles TO authenticated;

-- ── C. Trigger de proteção (defesa em profundidade) ─────────────────────────
-- Mesmo que uma policy futura ou um caminho SECURITY DEFINER mal revisado
-- tente alterar platform_role/user_id/email fora da RPC administrativa, esta
-- trigger reverte essas colunas para o valor anterior antes do commit.
CREATE OR REPLACE FUNCTION public.protect_profiles_admin_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    NEW.platform_role := OLD.platform_role;
    NEW.user_id        := OLD.user_id;
    NEW.email          := OLD.email;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profiles_admin_columns ON public.profiles;
CREATE TRIGGER protect_profiles_admin_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profiles_admin_columns();

-- ── D. RPC segura para conceder/revogar platform_role ───────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_platform_role(
  _target_user_id uuid,
  _new_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF NOT public.is_platform_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF _target_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_target_user');
  END IF;

  v_normalized_role := NULLIF(btrim(_new_role), '');

  IF v_normalized_role IS NOT NULL AND v_normalized_role NOT IN (
    'super_admin',
    'platform_admin',
    'support_secretaria',
    'support_financeiro',
    'support_culto_louvor',
    'support_tecnico',
    'support_implantacao',
    'support_readonly'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_platform_role');
  END IF;

  UPDATE public.profiles
  SET platform_role = v_normalized_role
  WHERE user_id = _target_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'user_id', _target_user_id, 'platform_role', v_normalized_role);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_platform_role(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_platform_role(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_platform_role(uuid, text) TO authenticated;

-- ── E. Autoridade raiz: somente super_admins ───────────────────────────────
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.super_admins sa
    WHERE sa.user_id = _user_id
  );
$$;

-- Alias legado ainda usado por policies históricas: passa a apontar para a
-- mesma fonte de autoridade segura, sem consultar user_roles.
CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user_id);
$$;

-- O helper financeiro antigo confiava diretamente em platform_role e
-- user_roles. Isso manteria um bypass financeiro mesmo após corrigir
-- is_platform_admin; agora ele usa a mesma raiz segura.
CREATE OR REPLACE FUNCTION public.is_platform_finance_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user_id);
$$;

-- ── F. Remover policies legadas que permitiam promoção indireta ────────────
-- Os nomes abaixo existem em diferentes gerações do schema. DROP IF EXISTS
-- torna a migration compatível com os dois ambientes sem presumir qual
-- baseline foi aplicada.
DROP POLICY IF EXISTS "Superadmins can view" ON public.super_admins;
DROP POLICY IF EXISTS "Superadmins can insert super_admins" ON public.super_admins;
DROP POLICY IF EXISTS "Superadmins can delete super_admins" ON public.super_admins;
DROP POLICY IF EXISTS "super admins select" ON public.super_admins;
DROP POLICY IF EXISTS "super admins insert" ON public.super_admins;
DROP POLICY IF EXISTS "super admins update" ON public.super_admins;
DROP POLICY IF EXISTS "super admins delete" ON public.super_admins;

CREATE POLICY "super admins select" ON public.super_admins
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

CREATE POLICY "super admins insert" ON public.super_admins
FOR INSERT TO authenticated
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "super admins update" ON public.super_admins
FOR UPDATE TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "super admins delete" ON public.super_admins
FOR DELETE TO authenticated
USING (public.is_platform_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.super_admins TO authenticated;
REVOKE ALL ON public.super_admins FROM anon;

DROP POLICY IF EXISTS "Anyone authenticated can view roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "user roles users read own" ON public.user_roles;
DROP POLICY IF EXISTS "user roles platform admins manage" ON public.user_roles;

CREATE POLICY "user roles users read own" ON public.user_roles
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.is_platform_admin(auth.uid()));

CREATE POLICY "user roles platform admins manage" ON public.user_roles
FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

-- ── G. Trava adicional: RPCs administrativas nunca para anon ──────────────
REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.is_superadmin(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_superadmin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_superadmin(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.is_platform_finance_admin(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_platform_finance_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_finance_admin(uuid) TO authenticated;
