-- Storage RLS: bucket assemblies (upload de anexos em Assembleia Geral).
-- Idempotente. Não altera tabelas public nem seeds.
-- Backlog: path org-scoped, bucket privado, signed URL, delete sincronizado com DB.

INSERT INTO storage.buckets (id, name, public)
VALUES ('assemblies', 'assemblies', true)
ON CONFLICT (id) DO NOTHING;

-- Remover policies legadas/ausentes (nomes históricos)
DROP POLICY IF EXISTS "Auth users can upload assembly files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view assembly files" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can delete own assembly files" ON storage.objects;
DROP POLICY IF EXISTS "assemblies storage authenticated select" ON storage.objects;
DROP POLICY IF EXISTS "assemblies storage staff insert" ON storage.objects;
DROP POLICY IF EXISTS "assemblies storage staff update" ON storage.objects;
DROP POLICY IF EXISTS "assemblies storage staff delete" ON storage.objects;

-- SELECT: leitura para usuários autenticados (bucket público; consistência RLS)
CREATE POLICY "assemblies storage authenticated select" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'assemblies');

-- INSERT: platform admin ou staff de qualquer organização ativa
CREATE POLICY "assemblies storage staff insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'assemblies'
  AND (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.organization_users ou
      WHERE ou.user_id = auth.uid()
        AND COALESCE(ou.is_active, true) = true
        AND ou.role IN ('admin', 'church_admin', 'secretary', 'pastor', 'leader')
    )
  )
);

-- UPDATE: platform admin ou staff autenticado
CREATE POLICY "assemblies storage staff update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'assemblies'
  AND (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.organization_users ou
      WHERE ou.user_id = auth.uid()
        AND COALESCE(ou.is_active, true) = true
        AND ou.role IN ('admin', 'church_admin', 'secretary', 'pastor', 'leader')
    )
  )
)
WITH CHECK (
  bucket_id = 'assemblies'
  AND (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.organization_users ou
      WHERE ou.user_id = auth.uid()
        AND COALESCE(ou.is_active, true) = true
        AND ou.role IN ('admin', 'church_admin', 'secretary', 'pastor', 'leader')
    )
  )
);

-- DELETE: platform admin ou staff autenticado
-- Risco: sem path org-scoped, staff pode remover objetos de outras orgs no bucket.
CREATE POLICY "assemblies storage staff delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'assemblies'
  AND (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.organization_users ou
      WHERE ou.user_id = auth.uid()
        AND COALESCE(ou.is_active, true) = true
        AND ou.role IN ('admin', 'church_admin', 'secretary', 'pastor', 'leader')
    )
  )
);
