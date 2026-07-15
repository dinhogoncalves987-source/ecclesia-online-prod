-- ============================================================================
-- Migration: fix_member_invites_permissions
-- Version: 20260708101000 (timestamp único definido antes da primeira aplicação remota)
-- Phase: PASSO 2.9 — corrigir permissao da tabela member_invites
-- Created: 2026-07-08
--
-- Problem:
--   Frontend calls insert into public.member_invites but receives:
--   "permission denied for table member_invites"
--
-- Root cause:
--   The original migration (20260617140000_member_invites.sql) created RLS
--   policies but never issued GRANT on the table for the authenticated role.
--   In PostgreSQL, table-level GRANT is a prerequisite before RLS policies
--   are even evaluated.
--
-- Fix:
--   1. GRANT SELECT, INSERT, UPDATE TO authenticated
--   2. Recreate RLS policies idempotently (DROP IF EXISTS + CREATE)
--   3. UPDATE policy now includes WITH CHECK (was missing before)
--   4. All policies use has_org_role which already covers super_admin
--      via is_platform_admin internally
--
-- Roles authorized: admin, church_admin, pastor, secretary, leader
-- (super_admin / platform admin covered by has_org_role -> is_platform_admin)
--
-- No changes to: anon permissions, RLS enable/disable, frontend code
-- ============================================================================

-- 1. Grant table-level access to authenticated users ----------------------------
--    This is the missing piece that causes "permission denied".
--    RLS policies below control WHICH rows each user can access.
GRANT SELECT, INSERT, UPDATE ON public.member_invites TO authenticated;

-- 2. Recreate SELECT policy (idempotent) ----------------------------------------
DROP POLICY IF EXISTS "member_invites staff select" ON public.member_invites;
CREATE POLICY "member_invites staff select" ON public.member_invites
  FOR SELECT TO authenticated
  USING (
    has_org_role(
      auth.uid(),
      organization_id,
      ARRAY['admin','church_admin','pastor','secretary','leader']
    )
  );

-- 3. Recreate INSERT policy (idempotent) ----------------------------------------
DROP POLICY IF EXISTS "member_invites staff insert" ON public.member_invites;
CREATE POLICY "member_invites staff insert" ON public.member_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    has_org_role(
      auth.uid(),
      organization_id,
      ARRAY['admin','church_admin','pastor','secretary','leader']
    )
  );

-- 4. Recreate UPDATE policy (idempotent) ---------------------------------------
--    Now includes WITH CHECK (was missing in the original migration).
DROP POLICY IF EXISTS "member_invites staff update" ON public.member_invites;
CREATE POLICY "member_invites staff update" ON public.member_invites
  FOR UPDATE TO authenticated
  USING (
    has_org_role(
      auth.uid(),
      organization_id,
      ARRAY['admin','church_admin','pastor','secretary','leader']
    )
  )
  WITH CHECK (
    has_org_role(
      auth.uid(),
      organization_id,
      ARRAY['admin','church_admin','pastor','secretary','leader']
    )
  );

-- 5. Confirm RLS is still enabled (no-op if already enabled) --------------------
ALTER TABLE public.member_invites ENABLE ROW LEVEL SECURITY;
