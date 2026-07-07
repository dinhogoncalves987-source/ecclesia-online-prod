-- Migration: adiciona campos institucionais à tabela organizations
-- e cria bucket organization-assets para upload de logos.
-- Todos os campos nullable para não quebrar dados existentes.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS short_name text,
  ADD COLUMN IF NOT EXISTS acronym text,
  ADD COLUMN IF NOT EXISTS pastor_president_name text;

COMMENT ON COLUMN public.organizations.short_name IS 'Nome curto/abreviado da organização para exibição compacta';
COMMENT ON COLUMN public.organizations.acronym IS 'Sigla/iniciais da organização (ex: IEADCS)';
COMMENT ON COLUMN public.organizations.pastor_president_name IS 'Nome do pastor presidente ou responsável máximo da organização';

-- Bucket para logos e assets das organizações
INSERT INTO storage.buckets (id, name, public)
VALUES ('organization-assets', 'organization-assets', true)
ON CONFLICT (id) DO NOTHING;
