-- Staging: Campanhas CRUD — is_featured, allow_replies, RLS leader, destaque por coluna dedicada.
-- Requires: public.campaigns, is_org_campaign_writer(), has_org_role().

-- ---------------------------------------------------------------------------
-- 1. Colunas
-- ---------------------------------------------------------------------------
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS allow_replies boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 2. Backfill seguro — uma featured por org a partir de priority='high' (não altera priority)
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    c.id,
    ROW_NUMBER() OVER (
      PARTITION BY c.organization_id
      ORDER BY c.created_at DESC, c.id DESC
    ) AS rn
  FROM public.campaigns c
  WHERE c.priority = 'high'
)
UPDATE public.campaigns AS target
SET is_featured = true,
    updated_at = now()
FROM ranked AS source
WHERE target.id = source.id
  AND source.rn = 1
  AND target.is_featured = false;

-- Garantir no máximo uma featured por org antes do índice único
WITH dupes AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.campaigns
  WHERE is_featured = true
)
UPDATE public.campaigns AS target
SET is_featured = false,
    updated_at = now()
FROM dupes AS source
WHERE target.id = source.id
  AND source.rn > 1;

-- ---------------------------------------------------------------------------
-- 3. Índices — lookup + unicidade por organização
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_campaigns_org_featured
  ON public.campaigns (organization_id)
  WHERE is_featured = true;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_campaigns_featured_per_org
  ON public.campaigns (organization_id)
  WHERE is_featured = true;

-- ---------------------------------------------------------------------------
-- 4. RLS helper — incluir leader na escrita de campanhas
-- ---------------------------------------------------------------------------
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
    ARRAY['admin', 'church_admin', 'leader', 'tesoureiro']
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. RPC — destacar campanha (is_featured only, não altera priority)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_campaign_featured(
  p_organization_id uuid,
  p_campaign_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.is_org_campaign_writer(auth.uid(), p_organization_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.campaigns c
    WHERE c.id = p_campaign_id
      AND c.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'campaign not found';
  END IF;

  UPDATE public.campaigns
  SET is_featured = false,
      updated_at = now()
  WHERE organization_id = p_organization_id
    AND is_featured = true
    AND id <> p_campaign_id;

  UPDATE public.campaigns
  SET is_featured = true,
      updated_at = now()
  WHERE id = p_campaign_id
    AND organization_id = p_organization_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_campaign_featured(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_campaign_featured(uuid, uuid) TO authenticated;
