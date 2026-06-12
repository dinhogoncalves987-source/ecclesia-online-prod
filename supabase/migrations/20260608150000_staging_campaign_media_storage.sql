-- Staging: Campanhas Fase 2B — mídia (campaign_media + Storage buckets).
-- Requires: campaigns, organizations, is_platform_admin(), is_org_user(), has_org_role(),
--           is_org_campaign_writer(), is_org_campaign_update_writer() from 20260608130000.

-- ---------------------------------------------------------------------------
-- 1. Tabela campaign_media
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaign_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  media_type text NOT NULL DEFAULT 'image',
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  public_url text,
  title text,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  is_cover boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_media_type_check CHECK (
    media_type IN ('image', 'video', 'document')
  ),
  CONSTRAINT campaign_media_sort_order_check CHECK (sort_order >= 0)
);

CREATE INDEX IF NOT EXISTS idx_campaign_media_campaign_sort
  ON public.campaign_media(campaign_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_campaign_media_org_created
  ON public.campaign_media(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_media_cover
  ON public.campaign_media(campaign_id)
  WHERE is_cover = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_media_one_cover
  ON public.campaign_media(campaign_id)
  WHERE is_cover = true;

-- ---------------------------------------------------------------------------
-- 2. Helper RLS — mídia (leader pode gerenciar; member só lê)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_org_campaign_media_writer(
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
-- 3. RLS campaign_media
-- ---------------------------------------------------------------------------
ALTER TABLE public.campaign_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaign media platform admin all" ON public.campaign_media;
CREATE POLICY "campaign media platform admin all" ON public.campaign_media
FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "campaign media org read" ON public.campaign_media;
CREATE POLICY "campaign media org read" ON public.campaign_media
FOR SELECT TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR public.is_org_user(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "campaign media writers insert" ON public.campaign_media;
CREATE POLICY "campaign media writers insert" ON public.campaign_media
FOR INSERT TO authenticated
WITH CHECK (public.is_org_campaign_media_writer(auth.uid(), organization_id));

DROP POLICY IF EXISTS "campaign media writers update" ON public.campaign_media;
CREATE POLICY "campaign media writers update" ON public.campaign_media
FOR UPDATE TO authenticated
USING (public.is_org_campaign_media_writer(auth.uid(), organization_id))
WITH CHECK (public.is_org_campaign_media_writer(auth.uid(), organization_id));

DROP POLICY IF EXISTS "campaign media writers delete" ON public.campaign_media;
CREATE POLICY "campaign media writers delete" ON public.campaign_media
FOR DELETE TO authenticated
USING (public.is_org_campaign_media_writer(auth.uid(), organization_id));

-- ---------------------------------------------------------------------------
-- 4. Storage buckets
-- campaign-library: imagens oficiais Ecclesia (leitura ampla em staging)
-- campaign-media: fotos/vídeos reais por campanha (path: {org_id}/{campaign_id}/...)
-- Backlog produção: bucket privado + signed URLs, path org-scoped estrito.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('campaign-library', 'campaign-library', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('campaign-media', 'campaign-media', true)
ON CONFLICT (id) DO NOTHING;

-- campaign-library: leitura autenticada; escrita só platform admin
DROP POLICY IF EXISTS "campaign library storage select" ON storage.objects;
CREATE POLICY "campaign library storage select" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'campaign-library');

DROP POLICY IF EXISTS "campaign library storage admin insert" ON storage.objects;
CREATE POLICY "campaign library storage admin insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'campaign-library'
  AND public.is_platform_admin(auth.uid())
);

DROP POLICY IF EXISTS "campaign library storage admin update" ON storage.objects;
CREATE POLICY "campaign library storage admin update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'campaign-library'
  AND public.is_platform_admin(auth.uid())
)
WITH CHECK (
  bucket_id = 'campaign-library'
  AND public.is_platform_admin(auth.uid())
);

DROP POLICY IF EXISTS "campaign library storage admin delete" ON storage.objects;
CREATE POLICY "campaign library storage admin delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'campaign-library'
  AND public.is_platform_admin(auth.uid())
);

-- campaign-media: leitura org members; escrita staff autorizado
DROP POLICY IF EXISTS "campaign media storage select" ON storage.objects;
CREATE POLICY "campaign media storage select" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'campaign-media');

DROP POLICY IF EXISTS "campaign media storage staff insert" ON storage.objects;
CREATE POLICY "campaign media storage staff insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'campaign-media'
  AND (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.organization_users ou
      WHERE ou.user_id = auth.uid()
        AND COALESCE(ou.is_active, true) = true
        AND ou.role IN ('admin', 'church_admin', 'leader', 'tesoureiro')
    )
  )
);

DROP POLICY IF EXISTS "campaign media storage staff update" ON storage.objects;
CREATE POLICY "campaign media storage staff update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'campaign-media'
  AND (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.organization_users ou
      WHERE ou.user_id = auth.uid()
        AND COALESCE(ou.is_active, true) = true
        AND ou.role IN ('admin', 'church_admin', 'leader', 'tesoureiro')
    )
  )
)
WITH CHECK (
  bucket_id = 'campaign-media'
  AND (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.organization_users ou
      WHERE ou.user_id = auth.uid()
        AND COALESCE(ou.is_active, true) = true
        AND ou.role IN ('admin', 'church_admin', 'leader', 'tesoureiro')
    )
  )
);

DROP POLICY IF EXISTS "campaign media storage staff delete" ON storage.objects;
CREATE POLICY "campaign media storage staff delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'campaign-media'
  AND (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.organization_users ou
      WHERE ou.user_id = auth.uid()
        AND COALESCE(ou.is_active, true) = true
        AND ou.role IN ('admin', 'church_admin', 'leader', 'tesoureiro')
    )
  )
);
