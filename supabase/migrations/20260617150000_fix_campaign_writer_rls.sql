-- Fix: align campaign write RLS with frontend CAMPAIGN_MANAGE_ROLES.
--
-- Before this migration:
--   is_org_campaign_writer       → admin, church_admin, leader, tesoureiro
--   is_org_campaign_update_writer → admin, church_admin, leader, tesoureiro
--
-- A tesoureiro or leader could bypass the frontend and INSERT/UPDATE/DELETE
-- campaigns directly via the Supabase client or REST API.
--
-- After this migration (matches src/lib/campaignFormUtils.ts):
--   is_org_campaign_writer       → admin, church_admin, pastor, secretary
--   is_org_campaign_update_writer → admin, church_admin, pastor, secretary
--
-- READ access (is_org_campaign_finance_reader) is intentionally unchanged —
-- tesoureiro and contador keep full SELECT access to campaign data.

CREATE OR REPLACE FUNCTION public.is_org_campaign_writer(
  _user_id uuid,
  _organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user_id)
  OR public.has_org_role(
    _user_id,
    _organization_id,
    ARRAY['admin', 'church_admin', 'pastor', 'secretary']
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_campaign_update_writer(
  _user_id uuid,
  _organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user_id)
  OR public.has_org_role(
    _user_id,
    _organization_id,
    ARRAY['admin', 'church_admin', 'pastor', 'secretary']
  );
$$;
