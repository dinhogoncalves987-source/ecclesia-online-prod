-- ============================================================================
-- AUDITORIA SOMENTE LEITURA — platform_role suspeito
-- FASE 1 — item 10
--
-- Este arquivo NÃO deve ser incluído em supabase/migrations/ e NÃO deve ser
-- aplicado via `supabase migration up` / `db push`. Ele não modifica nenhum
-- dado — apenas SELECTs — e deve ser executado manualmente (ex.: Supabase
-- SQL Editor, com uma conexão de leitura) por quem tiver acesso legítimo,
-- ANTES de aplicar 20260715130000_harden_platform_role_escalation.sql em
-- qualquer ambiente.
--
-- Objetivo: listar contas com profiles.platform_role preenchido que NÃO têm
-- nenhuma fonte de autoridade "não editável" (super_admins ou user_roles
-- global). Depois que a migration de hardening for aplicada, is_platform_admin
-- deixa de considerar profiles.platform_role — então qualquer conta que só
-- aparece aqui por causa dessa coluna PERDE acesso administrativo real até
-- ser regularizada via:
--   select public.admin_set_platform_role('<user_id>', '<role>');
-- (o que exige que QUEM EXECUTA já seja is_platform_admin — ou seja, a
-- primeira regularização de uma conta "raiz" precisa ser feita por INSERT
-- direto em super_admins/user_roles por quem tem acesso de administrador do
-- banco, não pela RPC).
--
-- NENHUM UPDATE/DELETE/INSERT neste arquivo. NÃO execute nada além dos
-- SELECTs abaixo.
-- ============================================================================

-- 1. Perfis com platform_role preenchido, mas SEM linha em super_admins e
--    SEM user_roles global (organization_id IS NULL) com papel administrativo.
--    Estes são os "suspeitos": hoje só têm autoridade porque a coluna
--    profiles.platform_role está setada — o que, antes desta revisão, era
--    autoescrevível pelo próprio usuário via metadata de signup ou update.
SELECT
  p.user_id,
  p.email,
  p.full_name,
  p.platform_role,
  p.created_at,
  p.updated_at,
  EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = p.user_id)          AS has_super_admins_row,
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.user_id
      AND ur.organization_id IS NULL
      AND ur.role IN ('platform_admin', 'super_admin', 'superadmin')
  )                                                                                   AS has_global_user_roles_row
FROM public.profiles p
WHERE p.platform_role IS NOT NULL
  AND btrim(p.platform_role) <> ''
ORDER BY p.created_at ASC;

-- 2. Contagem rápida de quantos perfis ficariam sem autoridade real após a
--    migration de hardening (apenas para dimensionar o impacto).
SELECT count(*) AS profiles_losing_authority_after_hardening
FROM public.profiles p
WHERE p.platform_role IS NOT NULL
  AND btrim(p.platform_role) <> ''
  AND NOT EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = p.user_id)
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.user_id
      AND ur.organization_id IS NULL
      AND ur.role IN ('platform_admin', 'super_admin', 'superadmin')
  );

-- 3. Linhas em super_admins hoje (fonte de autoridade que passa a ser
--    primária) — apenas para conferência visual, nenhuma alteração.
SELECT sa.user_id, sa.notes, sa.created_at, p.email, p.full_name
FROM public.super_admins sa
LEFT JOIN public.profiles p ON p.user_id = sa.user_id
ORDER BY sa.created_at ASC;

-- 4. Linhas em user_roles globais (organization_id IS NULL) com papel
--    administrativo — segunda fonte de autoridade aceita por is_platform_admin.
SELECT ur.user_id, ur.role, ur.created_at, p.email, p.full_name
FROM public.user_roles ur
LEFT JOIN public.profiles p ON p.user_id = ur.user_id
WHERE ur.organization_id IS NULL
  AND ur.role IN ('platform_admin', 'super_admin', 'superadmin')
ORDER BY ur.created_at ASC;
