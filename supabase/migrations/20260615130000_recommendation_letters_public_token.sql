-- ============================================================
-- Secretaria: Carta de Recomendação — public token + church name snapshot
-- ============================================================
-- Apply after 20260615120000_staging_recommendation_letters.sql.
--
-- Two additions:
--
--   1. public_token (uuid) — unique unguessable identifier used in the public
--      validation URL (/validar/carta/:token). Acts as a capability token;
--      knowing the UUID is sufficient proof of access, no login required.
--
--   2. origin_church_name (text) — snapshot of the issuing church name at
--      request time. Avoids a JOIN on organizations (which requires auth)
--      when rendering the public validation page.
--
--   3. RLS policy for the anon role — allows unauthenticated users to read
--      ONLY approved letters (for the public validation page). The
--      public_token acts as the access gate in the application query.
-- ============================================================

ALTER TABLE public.recommendation_letters
  ADD COLUMN IF NOT EXISTS public_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS origin_church_name text NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_recommendation_letters_public_token
  ON public.recommendation_letters(public_token);

-- Allow anonymous (unauthenticated) readers to fetch APPROVED letters only.
-- The application always queries by public_token, making the token the
-- unguessable key — collisions are astronomically unlikely (UUID v4).
DROP POLICY IF EXISTS "recommendation_letters public read approved" ON public.recommendation_letters;
CREATE POLICY "recommendation_letters public read approved" ON public.recommendation_letters
FOR SELECT TO anon
USING (status = 'approved');
