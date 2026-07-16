-- ============================================================
-- Sprint 2: Restrict profiles SELECT exposure (RLS hardening)
-- ============================================================
--
-- Problem:  The baseline migration created:
--             CREATE POLICY "profiles authenticated read" … USING (true);
--           Any authenticated user could read every row in profiles.
--
-- Fix:      Replace the open policy with a scoped one that grants
--           SELECT only when one of these conditions is true:
--
--   1. auth.uid() = user_id          — reading your own row
--   2. is_platform_admin(auth.uid()) — platform / super admin sees all
--   3. Shared active org membership  — the viewer and the profile owner
--                                      both belong to the same active org
--
-- No changes to INSERT / UPDATE policies — they already scope by auth.uid().
-- No schema changes; Supabase types do not need regeneration.
-- ============================================================

-- ── 1. Drop every legacy open-read variant ──────────────────────────────────
-- The policy may have been created under either name depending on which
-- baseline migration was applied first.
DROP POLICY IF EXISTS "profiles authenticated read"  ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles"  ON public.profiles;

-- ── 2. Composite partial index ───────────────────────────────────────────────
-- Speeds up the same-org EXISTS subquery that runs for every evaluated row.
-- The WHERE clause limits index size to only active memberships.
CREATE INDEX IF NOT EXISTS idx_org_users_user_org_active
  ON public.organization_users (user_id, organization_id)
  WHERE is_active = true;

-- ── 3. New scoped SELECT policy ──────────────────────────────────────────────
-- IF EXISTS: torna esta migration reaplicável com segurança caso a política
-- já tenha sido criada manualmente (fora do controle de migrations) antes
-- deste arquivo ser efetivamente registrado como aplicado.
DROP POLICY IF EXISTS "profiles select scoped" ON public.profiles;

CREATE POLICY "profiles select scoped" ON public.profiles
FOR SELECT TO authenticated
USING (

  -- Condition 1: user is reading their own profile
  auth.uid() = user_id

  -- Condition 2: platform / super admin (SECURITY DEFINER — bypasses RLS,
  --              reads profiles as DB owner → no recursion)
  OR public.is_platform_admin(auth.uid())

  -- Condition 3: viewer and profile owner share at least one active org
  OR EXISTS (
    SELECT 1
    FROM   public.organization_users ou_me
    JOIN   public.organization_users ou_them
           ON  ou_them.organization_id = ou_me.organization_id
           AND ou_them.user_id         = profiles.user_id
           AND COALESCE(ou_them.is_active, true) = true
    WHERE  ou_me.user_id = auth.uid()
      AND  COALESCE(ou_me.is_active, true) = true
  )

);
