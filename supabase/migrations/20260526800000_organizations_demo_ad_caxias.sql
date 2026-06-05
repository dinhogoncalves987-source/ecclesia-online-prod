-- Demo orgs: higienizar hierarquia para Assembleia de Deus Caxias do Sul.
-- Atualiza somente IDs fixos 11111111-0000-0000-0000-000000000001..004.
-- Não altera documents, members nem outras tabelas.

DO $$
DECLARE
  v_convencao uuid := '11111111-0000-0000-0000-000000000001';
  v_matriz    uuid := '11111111-0000-0000-0000-000000000002';
  v_setor     uuid := '11111111-0000-0000-0000-000000000003';
  v_congr     uuid := '11111111-0000-0000-0000-000000000004';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_congr) THEN
    RAISE NOTICE 'organizations AD Caxias update skipped: demo congregacao not found';
    RETURN;
  END IF;

  UPDATE public.organizations
  SET
    name = 'Assembleia de Deus — Ministério RS',
    slug = 'assembleia-deus-ministerio-rs',
    organization_type = 'convencao',
    city = 'Porto Alegre',
    state = 'RS',
    country_code = 'BR',
    language_code = 'pt-BR',
    updated_at = now()
  WHERE id = v_convencao;

  UPDATE public.organizations
  SET
    name = 'Assembleia de Deus em Caxias do Sul',
    slug = 'assembleia-deus-caxias-do-sul',
    organization_type = 'matriz',
    city = 'Caxias do Sul',
    state = 'RS',
    country_code = 'BR',
    language_code = 'pt-BR',
    updated_at = now()
  WHERE id = v_matriz;

  UPDATE public.organizations
  SET
    name = 'Secretaria AD Caxias do Sul',
    slug = 'secretaria-ad-caxias-do-sul',
    organization_type = 'setor',
    city = 'Caxias do Sul',
    state = 'RS',
    country_code = 'BR',
    language_code = 'pt-BR',
    updated_at = now()
  WHERE id = v_setor;

  UPDATE public.organizations
  SET
    name = 'Congregação Jardim América',
    slug = 'congregacao-jardim-america',
    organization_type = 'congregacao',
    city = 'Caxias do Sul',
    state = 'RS',
    country_code = 'BR',
    language_code = 'pt-BR',
    updated_at = now()
  WHERE id = v_congr;

  UPDATE public.organizations SET parent_id = v_convencao WHERE id = v_matriz;
  UPDATE public.organizations SET parent_id = v_matriz    WHERE id = v_setor;
  UPDATE public.organizations SET parent_id = v_setor     WHERE id = v_congr;
END $$;
