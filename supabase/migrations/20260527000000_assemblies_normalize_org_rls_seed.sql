-- Assembleia Geral (DB-1): normaliza schema org-scoped, RLS e seed demo AD Caxias.
-- Compatível com FE atual (organization_id, created_by, period, assembly_date).
-- Idempotente: não apaga dados existentes fora dos IDs demo fixos no seed.
-- Não altera storage policies (bucket garantido apenas se ausente).

-- ══════════════════════════════════════════════════════════════════════════════
-- A) Normalizar public.assemblies
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.assemblies (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  title           text        NOT NULL,
  description     text,
  period          text,
  assembly_date   date        NOT NULL DEFAULT CURRENT_DATE,
  starts_at       timestamptz,
  ends_at         timestamptz,
  youtube_url     text,
  is_visible      boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.assemblies
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS title           text,
  ADD COLUMN IF NOT EXISTS description     text,
  ADD COLUMN IF NOT EXISTS period          text,
  ADD COLUMN IF NOT EXISTS assembly_date   date,
  ADD COLUMN IF NOT EXISTS starts_at       timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at         timestamptz,
  ADD COLUMN IF NOT EXISTS youtube_url     text,
  ADD COLUMN IF NOT EXISTS is_visible      boolean,
  ADD COLUMN IF NOT EXISTS created_at      timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at      timestamptz DEFAULT now();

-- Legado church_id/user_id → org-scoped (quando colunas legadas existirem)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assemblies' AND column_name = 'user_id'
  ) THEN
    UPDATE public.assemblies
    SET created_by = user_id
    WHERE created_by IS NULL AND user_id IS NOT NULL;
  END IF;
END $$;

UPDATE public.assemblies
SET assembly_date = COALESCE(assembly_date, CURRENT_DATE)
WHERE assembly_date IS NULL;

UPDATE public.assemblies
SET is_visible = COALESCE(is_visible, false)
WHERE is_visible IS NULL;

UPDATE public.assemblies
SET created_at = COALESCE(created_at, now())
WHERE created_at IS NULL;

UPDATE public.assemblies
SET updated_at = COALESCE(updated_at, now())
WHERE updated_at IS NULL;

ALTER TABLE public.assemblies
  ALTER COLUMN assembly_date SET DEFAULT CURRENT_DATE;

ALTER TABLE public.assemblies
  ALTER COLUMN is_visible SET DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_assemblies_org_date
  ON public.assemblies(organization_id, assembly_date DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    INNER JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
  ) THEN
    DROP TRIGGER IF EXISTS update_assemblies_updated_at ON public.assemblies;
    CREATE TRIGGER update_assemblies_updated_at
    BEFORE UPDATE ON public.assemblies
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- B) Normalizar public.assembly_attachments
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.assembly_attachments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id     uuid        NOT NULL REFERENCES public.assemblies(id) ON DELETE CASCADE,
  title           text        NOT NULL,
  file_url        text,
  file_type       text,
  youtube_url     text,
  attachment_type text        NOT NULL DEFAULT 'document',
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.assembly_attachments
  ADD COLUMN IF NOT EXISTS title           text,
  ADD COLUMN IF NOT EXISTS file_url        text,
  ADD COLUMN IF NOT EXISTS file_type       text,
  ADD COLUMN IF NOT EXISTS youtube_url     text,
  ADD COLUMN IF NOT EXISTS attachment_type text DEFAULT 'document',
  ADD COLUMN IF NOT EXISTS created_at      timestamptz DEFAULT now();

UPDATE public.assembly_attachments
SET attachment_type = COALESCE(NULLIF(trim(attachment_type), ''), 'document')
WHERE attachment_type IS NULL OR trim(attachment_type) = '';

UPDATE public.assembly_attachments
SET created_at = COALESCE(created_at, now())
WHERE created_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_assembly_attachments_assembly_id
  ON public.assembly_attachments(assembly_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- C) Storage bucket (sem alterar policies existentes)
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('assemblies', 'assemblies', true)
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- D) RLS — assemblies (staff vê tudo; member só is_visible)
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.assemblies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view visible assemblies or own church" ON public.assemblies;
DROP POLICY IF EXISTS "Admins can insert assemblies" ON public.assemblies;
DROP POLICY IF EXISTS "Admins can update own church assemblies" ON public.assemblies;
DROP POLICY IF EXISTS "Admins can delete own assemblies" ON public.assemblies;
DROP POLICY IF EXISTS "assemblies org members read" ON public.assemblies;
DROP POLICY IF EXISTS "assemblies org staff insert" ON public.assemblies;
DROP POLICY IF EXISTS "assemblies org staff update" ON public.assemblies;
DROP POLICY IF EXISTS "assemblies org staff delete" ON public.assemblies;
DROP POLICY IF EXISTS "assemblies org staff read" ON public.assemblies;
DROP POLICY IF EXISTS "assemblies org members read visible" ON public.assemblies;

CREATE POLICY "assemblies org staff read" ON public.assemblies
FOR SELECT TO authenticated
USING (
  organization_id IS NOT NULL
  AND public.is_org_user(auth.uid(), organization_id)
  AND public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
  )
);

CREATE POLICY "assemblies org members read visible" ON public.assemblies
FOR SELECT TO authenticated
USING (
  organization_id IS NOT NULL
  AND public.is_org_user(auth.uid(), organization_id)
  AND COALESCE(is_visible, false) = true
  AND NOT public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
  )
);

CREATE POLICY "assemblies org staff insert" ON public.assemblies
FOR INSERT TO authenticated
WITH CHECK (
  organization_id IS NOT NULL
  AND public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
  )
);

CREATE POLICY "assemblies org staff update" ON public.assemblies
FOR UPDATE TO authenticated
USING (
  organization_id IS NOT NULL
  AND public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
  )
)
WITH CHECK (
  organization_id IS NOT NULL
  AND public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
  )
);

CREATE POLICY "assemblies org staff delete" ON public.assemblies
FOR DELETE TO authenticated
USING (
  organization_id IS NOT NULL
  AND public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor']
  )
);

-- ══════════════════════════════════════════════════════════════════════════════
-- E) RLS — assembly_attachments (herda visibilidade da assembleia pai)
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.assembly_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view assembly attachments" ON public.assembly_attachments;
DROP POLICY IF EXISTS "Admins can insert attachments" ON public.assembly_attachments;
DROP POLICY IF EXISTS "Admins can delete attachments" ON public.assembly_attachments;
DROP POLICY IF EXISTS "assembly_attachments org read" ON public.assembly_attachments;
DROP POLICY IF EXISTS "assembly_attachments org staff insert" ON public.assembly_attachments;
DROP POLICY IF EXISTS "assembly_attachments org staff update" ON public.assembly_attachments;
DROP POLICY IF EXISTS "assembly_attachments org staff delete" ON public.assembly_attachments;

CREATE POLICY "assembly_attachments org staff read" ON public.assembly_attachments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.assemblies a
    WHERE a.id = assembly_id
      AND a.organization_id IS NOT NULL
      AND public.is_org_user(auth.uid(), a.organization_id)
      AND public.has_org_role(
        auth.uid(), a.organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
  )
);

CREATE POLICY "assembly_attachments org members read visible" ON public.assembly_attachments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.assemblies a
    WHERE a.id = assembly_id
      AND a.organization_id IS NOT NULL
      AND public.is_org_user(auth.uid(), a.organization_id)
      AND COALESCE(a.is_visible, false) = true
      AND NOT public.has_org_role(
        auth.uid(), a.organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
  )
);

CREATE POLICY "assembly_attachments org staff insert" ON public.assembly_attachments
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.assemblies a
    WHERE a.id = assembly_id
      AND a.organization_id IS NOT NULL
      AND public.has_org_role(
        auth.uid(), a.organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
  )
);

CREATE POLICY "assembly_attachments org staff update" ON public.assembly_attachments
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.assemblies a
    WHERE a.id = assembly_id
      AND a.organization_id IS NOT NULL
      AND public.has_org_role(
        auth.uid(), a.organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.assemblies a
    WHERE a.id = assembly_id
      AND a.organization_id IS NOT NULL
      AND public.has_org_role(
        auth.uid(), a.organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
  )
);

CREATE POLICY "assembly_attachments org staff delete" ON public.assembly_attachments
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.assemblies a
    WHERE a.id = assembly_id
      AND a.organization_id IS NOT NULL
      AND public.has_org_role(
        auth.uid(), a.organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor']
      )
  )
);

-- ══════════════════════════════════════════════════════════════════════════════
-- F) Seed demo — Congregação Jardim América (AD Caxias do Sul)
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_congr uuid := '11111111-0000-0000-0000-000000000004';
  v_asm_ord  uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_asm_min  uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_congr) THEN
    RAISE NOTICE 'assemblies AD Caxias seed skipped: demo org not found';
    RETURN;
  END IF;

  INSERT INTO public.assemblies (
    id, organization_id, created_by, title, description, period,
    assembly_date, youtube_url, is_visible
  )
  VALUES
    (
      v_asm_ord,
      v_congr,
      NULL,
      'Assembleia Geral Ordinária — Maio 2026',
      E'CONVOCAÇÃO\nA Congregação Jardim América, da Assembleia de Deus em Caxias do Sul/RS, convoca todos os membros e obreiros para a Assembleia Geral Ordinária, no dia 18 de maio de 2026, às 19h30, no Templo da Congregação, Caxias do Sul.\n\nPAUTA\n1. Abertura em oração e leitura bíblica\n2. Relatório pastoral do trimestre\n3. Prestação de contas da Tesouraria\n4. Organização dos ministérios para o 2º semestre de 2026\n5. Calendário de eventos congregacionais e missões locais\n6. Assuntos gerais e encaminhamentos\n\nDECISÕES REGISTRADAS\n• Aprovação do relatório financeiro apresentado pela Tesouraria\n• Autorização do calendário de cultos especiais de junho/2026\n• Reforço da mobilização da EBD e dos Pequenos Grupos (Jovens Resgate e Casais Ágape)\n• Encaminhamento à Secretaria para atualização cadastral dos membros ativos',
      '2º Trimestre 2026',
      '2026-05-18',
      NULL,
      true
    ),
    (
      v_asm_min,
      v_congr,
      NULL,
      'Assembleia Ministerial — Organização dos Ministérios',
      E'CONVOCAÇÃO\nReunião ministerial da Congregação Jardim América para alinhamento das lideranças de Louvor, Infantil, Jovens, Recepção, Intercessão e Mídia, em Caxias do Sul/RS.\n\nPAUTA\n1. Revisão das escalas de junho/2026\n2. Metas de discipulado por ministério\n3. Integração de novos obreiros\n4. Comunicação com a Secretaria AD Caxias do Sul\n\nDECISÕES REGISTRADAS\n• Confirmação das equipes de Louvor e Recepção para os cultos dominicais\n• Início da mobilização do Seminário de Liderança congregacional\n• Padronização dos relatórios mensais enviados à Secretaria',
      'Maio 2026',
      '2026-05-10',
      NULL,
      false
    )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.assembly_attachments (
    id, assembly_id, title, attachment_type, file_url, file_type, youtube_url
  )
  VALUES
    (
      'aaaaaaaa-0000-0000-0000-000000000011',
      v_asm_ord,
      'Ata da Assembleia Geral Ordinária — Maio 2026',
      'minutes',
      NULL,
      NULL,
      NULL
    ),
    (
      'aaaaaaaa-0000-0000-0000-000000000012',
      v_asm_ord,
      'Relatório Financeiro — 2º Trimestre 2026',
      'report',
      NULL,
      NULL,
      NULL
    ),
    (
      'aaaaaaaa-0000-0000-0000-000000000021',
      v_asm_min,
      'Ata da Assembleia Ministerial — Maio 2026',
      'minutes',
      NULL,
      NULL,
      NULL
    )
  ON CONFLICT (id) DO NOTHING;
END $$;
