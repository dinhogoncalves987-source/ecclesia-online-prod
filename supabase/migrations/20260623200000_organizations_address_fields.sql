-- ============================================================
-- Migration: organizations — campos de endereço completo
-- Data: 2026-06-23
-- Razão: Formulários de Distrito/Setor/Congregação precisam de
--        endereço completo para uso operacional e correspondência.
-- Todos os campos são NULLABLE — não quebram registros antigos.
-- ============================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS zip_code          text,
  ADD COLUMN IF NOT EXISTS street            text,
  ADD COLUMN IF NOT EXISTS address_number    text,
  ADD COLUMN IF NOT EXISTS address_complement text,
  ADD COLUMN IF NOT EXISTS neighborhood      text,
  ADD COLUMN IF NOT EXISTS website_url       text;

COMMENT ON COLUMN public.organizations.zip_code           IS 'CEP do endereço da unidade';
COMMENT ON COLUMN public.organizations.street             IS 'Logradouro/rua';
COMMENT ON COLUMN public.organizations.address_number     IS 'Número do endereço';
COMMENT ON COLUMN public.organizations.address_complement IS 'Complemento do endereço';
COMMENT ON COLUMN public.organizations.neighborhood       IS 'Bairro';
COMMENT ON COLUMN public.organizations.website_url        IS 'Site institucional da unidade';

DO $$
DECLARE
  cols text[] := ARRAY['zip_code','street','address_number','address_complement','neighborhood','website_url'];
  c text; missing text[] := '{}';
BEGIN
  FOREACH c IN ARRAY cols LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='organizations' AND column_name=c
    ) THEN missing := array_append(missing, c); END IF;
  END LOOP;
  IF array_length(missing,1) > 0 THEN
    RAISE EXCEPTION 'Colunas ainda faltando em organizations: %', array_to_string(missing,', ');
  ELSE
    RAISE NOTICE 'organizations address fields: todas as 6 colunas confirmadas ✓';
  END IF;
END $$;
