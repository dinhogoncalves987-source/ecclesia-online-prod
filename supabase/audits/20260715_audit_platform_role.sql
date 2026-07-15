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
-- Objetivo: listar contas com profiles.platform_role ou user_roles globais
-- preenchidos e comparar com a única raiz de autoridade aceita depois do
-- hardening: public.super_admins. Nenhum dado é regularizado automaticamente.
-- A primeira regularização de uma conta raiz deve ser feita diretamente em
-- super_admins por um administrador legítimo do banco, depois de confirmar a
-- identidade humana correspondente.
--
-- NENHUM UPDATE/DELETE/INSERT neste arquivo. NÃO execute nada além dos
-- SELECTs abaixo.
-- ============================================================================

-- 1. Perfis com platform_role preenchido. A coluna continua servindo para
--    permissões de suporte, mas deixa de ser raiz de superadmin/RLS.
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
      AND ur.role::text IN ('platform_admin', 'super_admin', 'superadmin')
  )                                                                                   AS has_global_user_roles_row
FROM public.profiles p
WHERE p.platform_role IS NOT NULL
  AND btrim(p.platform_role) <> ''
ORDER BY p.created_at ASC;

-- 2. Contagem de perfis administrativos sem linha em super_admins.
SELECT count(*) AS profiles_losing_authority_after_hardening
FROM public.profiles p
WHERE p.platform_role IS NOT NULL
  AND btrim(p.platform_role) <> ''
  AND NOT EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = p.user_id);

-- 3. Linhas em super_admins hoje (fonte de autoridade que passa a ser
--    primária) — apenas para conferência visual, nenhuma alteração.
SELECT sa.user_id, sa.notes, sa.created_at, p.email, p.full_name
FROM public.super_admins sa
LEFT JOIN public.profiles p ON p.user_id = sa.user_id
ORDER BY sa.created_at ASC;

-- 4. Linhas administrativas em user_roles: apenas inventário legado. Depois
--    do hardening elas NÃO concedem is_platform_admin sem super_admins.
SELECT ur.user_id, ur.role, ur.created_at, p.email, p.full_name
FROM public.user_roles ur
LEFT JOIN public.profiles p ON p.user_id = ur.user_id
WHERE ur.role::text IN ('platform_admin', 'super_admin', 'superadmin')
ORDER BY ur.created_at ASC;
