-- ============================================================
-- Migration: Membros 2.0 — Campos estendidos da ficha pastoral
-- Data: 2026-06-17
-- Todos os campos são NULLABLE para não quebrar registros antigos.
-- ============================================================
-- COMO APLICAR:
--   Supabase Dashboard → SQL Editor → colar este arquivo → Run
--   OU: supabase db push (se CLI configurado)
-- ============================================================

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS photo_url          text,
  ADD COLUMN IF NOT EXISTS gender             text,
  ADD COLUMN IF NOT EXISTS marital_status     text,
  ADD COLUMN IF NOT EXISTS cpf                text,
  ADD COLUMN IF NOT EXISTS rg                 text,
  ADD COLUMN IF NOT EXISTS rg_issuer          text,
  ADD COLUMN IF NOT EXISTS rg_issue_date      date,
  ADD COLUMN IF NOT EXISTS whatsapp           text,
  ADD COLUMN IF NOT EXISTS zip_code           text,
  ADD COLUMN IF NOT EXISTS street             text,
  ADD COLUMN IF NOT EXISTS address_number     text,
  ADD COLUMN IF NOT EXISTS address_complement text,
  ADD COLUMN IF NOT EXISTS neighborhood       text,
  ADD COLUMN IF NOT EXISTS conversion_date    date,
  ADD COLUMN IF NOT EXISTS administrative_role text,
  ADD COLUMN IF NOT EXISTS father_name        text,
  ADD COLUMN IF NOT EXISTS mother_name        text,
  ADD COLUMN IF NOT EXISTS spouse_name        text,
  ADD COLUMN IF NOT EXISTS sector_id          uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS congregation_id    uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

-- ============================================================
-- Storage: Bucket avatars (já existe — garantir bucket member-photos também)
-- As fotos de membros são salvas no bucket 'avatars' com
-- caminho members/{member_id}.{ext}
-- O bucket avatars já foi criado em migration anterior com
-- políticas de leitura pública e escrita autenticada.
-- ============================================================

-- Garantir existência do bucket avatars (idempotente)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Garantia de políticas no bucket avatars para leitura pública
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Anyone can view avatars'
  ) THEN
    CREATE POLICY "Anyone can view avatars" ON storage.objects
      FOR SELECT USING (bucket_id = 'avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Auth users can upload avatars'
  ) THEN
    CREATE POLICY "Auth users can upload avatars" ON storage.objects
      FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can update own avatars'
  ) THEN
    CREATE POLICY "Users can update own avatars" ON storage.objects
      FOR UPDATE TO authenticated USING (bucket_id = 'avatars');
  END IF;
END $$;

-- ============================================================
-- Comentários descritivos
-- ============================================================
COMMENT ON COLUMN public.members.photo_url IS 'URL da foto do membro — bucket avatars, path: members/{id}.{ext}';
COMMENT ON COLUMN public.members.gender IS 'Sexo: Masculino | Feminino';
COMMENT ON COLUMN public.members.marital_status IS 'Estado civil: Solteiro(a) | Casado(a) | Divorciado(a) | Viúvo(a) | Separado(a) | União Estável';
COMMENT ON COLUMN public.members.cpf IS 'CPF (texto livre, sem formatação obrigatória)';
COMMENT ON COLUMN public.members.rg IS 'Número do RG';
COMMENT ON COLUMN public.members.rg_issuer IS 'Órgão emissor do RG (ex: SSP/RS)';
COMMENT ON COLUMN public.members.rg_issue_date IS 'Data de emissão do RG';
COMMENT ON COLUMN public.members.whatsapp IS 'Número de WhatsApp (pode ser diferente do telefone)';
COMMENT ON COLUMN public.members.zip_code IS 'CEP do endereço';
COMMENT ON COLUMN public.members.street IS 'Logradouro/rua';
COMMENT ON COLUMN public.members.address_number IS 'Número do endereço';
COMMENT ON COLUMN public.members.address_complement IS 'Complemento do endereço';
COMMENT ON COLUMN public.members.neighborhood IS 'Bairro';
COMMENT ON COLUMN public.members.conversion_date IS 'Data de conversão/aceitação';
COMMENT ON COLUMN public.members.administrative_role IS 'Cargo administrativo — separado da função eclesiástica';
COMMENT ON COLUMN public.members.father_name IS 'Nome do pai';
COMMENT ON COLUMN public.members.mother_name IS 'Nome da mãe';
COMMENT ON COLUMN public.members.spouse_name IS 'Nome do cônjuge';
COMMENT ON COLUMN public.members.sector_id IS 'Setor/Distrito onde o membro congrega';
COMMENT ON COLUMN public.members.congregation_id IS 'Congregação específica onde o membro congrega';

-- ============================================================
-- Verificação final
-- ============================================================
DO $$
DECLARE
  missing_cols text[] := ARRAY[]::text[];
  expected_cols text[] := ARRAY[
    'photo_url','gender','marital_status','cpf','rg','rg_issuer','rg_issue_date',
    'whatsapp','zip_code','street','address_number','address_complement','neighborhood',
    'conversion_date','administrative_role','father_name','mother_name','spouse_name',
    'sector_id','congregation_id'
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
  ELSE
    RAISE NOTICE 'Migration Membros 2.0: todas as 20 colunas confirmadas ✓';
  END IF;
END $$;
