-- ============================================================
-- Migration: colunas faltantes de Documentação Civil e Dados
-- Eclesiásticos adicionais em members + bucket member-documents
-- Data: 2026-07-17
--
-- BUG CRÍTICO CORRIGIDO: src/pages/Membros.tsx (buildExtendedPayload)
-- já enviava civil_document_type, civil_document_status,
-- civil_document_url, civil_document_uploaded_at, civil_document_notes,
-- holy_spirit_baptism_date e consecration_date desde que as abas
-- "Documentação Civil"/"Dados Eclesiásticos" foram criadas — mas NENHUMA
-- migration jamais criou essas colunas em public.members, nem o bucket de
-- storage 'member-documents' usado para o upload do documento.
--
-- Como o UPDATE de campos estendidos é um único statement (ver
-- buildExtendedPayload/tryExtended em Membros.tsx), a ausência de QUALQUER
-- uma dessas colunas faz o PostgREST rejeitar o UPDATE inteiro (erro
-- "Could not find the '<coluna>' column ... in the schema cache") — ou
-- seja, TODOS os campos estendidos deixavam de salvar juntos: foto, CPF,
-- endereço, WhatsApp, cônjuge, congregação/setor, etc. O app já tinha um
-- aviso (toast) para esse caso específico, mas o efeito prático era "os
-- dados somem depois de sair da tela", exatamente como relatado.
--
-- Todas as colunas são NULLABLE (exceto o default de civil_document_status)
-- para não quebrar nenhum registro existente. Idempotente e forward-only.
-- ============================================================

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS civil_document_type        text,
  ADD COLUMN IF NOT EXISTS civil_document_status       text NOT NULL DEFAULT 'Pendente',
  ADD COLUMN IF NOT EXISTS civil_document_url          text,
  ADD COLUMN IF NOT EXISTS civil_document_uploaded_at  timestamptz,
  ADD COLUMN IF NOT EXISTS civil_document_notes        text,
  ADD COLUMN IF NOT EXISTS holy_spirit_baptism_date    date,
  ADD COLUMN IF NOT EXISTS consecration_date           date;

COMMENT ON COLUMN public.members.civil_document_type IS 'Documento civil exigido conforme estado civil: Certidão de nascimento | casamento | divórcio';
COMMENT ON COLUMN public.members.civil_document_status IS 'Pendente | Apresentado | Validado | Rejeitado — ver CIVIL_DOCUMENT_STATUS_OPTIONS';
COMMENT ON COLUMN public.members.civil_document_url IS 'Path no bucket privado member-documents (ex: {organization_id}/{member_id}/civil-document.{ext}) — nunca uma URL pública, sempre acessado via signed URL';
COMMENT ON COLUMN public.members.civil_document_uploaded_at IS 'Data/hora do último upload do documento civil';
COMMENT ON COLUMN public.members.civil_document_notes IS 'Observações da secretaria sobre a documentação civil';
COMMENT ON COLUMN public.members.holy_spirit_baptism_date IS 'Data do batismo no Espírito Santo';
COMMENT ON COLUMN public.members.consecration_date IS 'Data de consagração (ordenação/investidura de cargo eclesiástico)';

-- ============================================================
-- Bucket de storage privado — documentos civis contêm dados sensíveis
-- (certidões com CPF/RG), por isso NUNCA público como o bucket avatars.
-- Path obrigatório: {organization_id}/{member_id}/civil-document.{ext}
-- Leitura sempre via createSignedUrl (ver openCivilDocument em Membros.tsx).
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('member-documents', 'member-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "member documents storage select" ON storage.objects;
CREATE POLICY "member documents storage select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'member-documents'
  AND (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.organization_users ou
      WHERE ou.user_id = auth.uid()
        AND COALESCE(ou.is_active, true) = true
        AND ou.role IN ('admin', 'church_admin', 'secretary', 'pastor', 'leader')
        AND ou.organization_id::text = split_part(name, '/', 1)
    )
  )
);

DROP POLICY IF EXISTS "member documents storage insert" ON storage.objects;
CREATE POLICY "member documents storage insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'member-documents'
  AND (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.organization_users ou
      WHERE ou.user_id = auth.uid()
        AND COALESCE(ou.is_active, true) = true
        AND ou.role IN ('admin', 'church_admin', 'secretary', 'pastor', 'leader')
        AND ou.organization_id::text = split_part(name, '/', 1)
    )
  )
);

DROP POLICY IF EXISTS "member documents storage update" ON storage.objects;
CREATE POLICY "member documents storage update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'member-documents'
  AND (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.organization_users ou
      WHERE ou.user_id = auth.uid()
        AND COALESCE(ou.is_active, true) = true
        AND ou.role IN ('admin', 'church_admin', 'secretary', 'pastor', 'leader')
        AND ou.organization_id::text = split_part(name, '/', 1)
    )
  )
);

DROP POLICY IF EXISTS "member documents storage delete" ON storage.objects;
CREATE POLICY "member documents storage delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'member-documents'
  AND (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.organization_users ou
      WHERE ou.user_id = auth.uid()
        AND COALESCE(ou.is_active, true) = true
        AND ou.role IN ('admin', 'church_admin', 'secretary', 'pastor', 'leader')
        AND ou.organization_id::text = split_part(name, '/', 1)
    )
  )
);

-- ============================================================
-- Verificação final
-- ============================================================
DO $$
DECLARE
  missing_cols text[] := ARRAY[]::text[];
  expected_cols text[] := ARRAY[
    'civil_document_type','civil_document_status','civil_document_url',
    'civil_document_uploaded_at','civil_document_notes',
    'holy_spirit_baptism_date','consecration_date'
  ];
  col text;
BEGIN
  FOREACH col IN ARRAY expected_cols LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'members' AND column_name = col
    ) THEN
      missing_cols := array_append(missing_cols, col);
    END IF;
  END LOOP;

  IF array_length(missing_cols, 1) > 0 THEN
    RAISE EXCEPTION 'Colunas ainda faltando em members: %', array_to_string(missing_cols, ', ');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'member-documents') THEN
    RAISE EXCEPTION 'Bucket member-documents não foi criado';
  END IF;

  RAISE NOTICE 'Migration civil_document/ecclesiastical fields: colunas e bucket confirmados ✓';
END $$;
