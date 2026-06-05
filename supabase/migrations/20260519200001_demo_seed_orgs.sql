-- Minimal demo seed for production — organizations + platform_announcement only
-- Safe to run on production. Idempotent.

INSERT INTO public.organizations (id, name, slug, organization_type, city, state, country_code, language_code, active)
VALUES
  ('11111111-0000-0000-0000-000000000001', 'Assembleia de Deus — Ministerio RS',      'assembleia-deus-ministerio-rs',    'convencao',   'Porto Alegre', 'RS', 'BR', 'pt-BR', true),
  ('11111111-0000-0000-0000-000000000002', 'Assembleia de Deus em Caxias do Sul',     'assembleia-deus-caxias-do-sul',    'matriz',      'Caxias do Sul', 'RS', 'BR', 'pt-BR', true),
  ('11111111-0000-0000-0000-000000000003', 'Secretaria AD Caxias do Sul',             'secretaria-ad-caxias-do-sul',      'setor',       'Caxias do Sul', 'RS', 'BR', 'pt-BR', true),
  ('11111111-0000-0000-0000-000000000004', 'Congregacao Jardim America',              'congregacao-jardim-america',       'congregacao', 'Caxias do Sul', 'RS', 'BR', 'pt-BR', true)
ON CONFLICT (id) DO NOTHING;

UPDATE public.organizations SET parent_id = '11111111-0000-0000-0000-000000000001' WHERE id = '11111111-0000-0000-0000-000000000002' AND parent_id IS NULL;
UPDATE public.organizations SET parent_id = '11111111-0000-0000-0000-000000000002' WHERE id = '11111111-0000-0000-0000-000000000003' AND parent_id IS NULL;
UPDATE public.organizations SET parent_id = '11111111-0000-0000-0000-000000000003' WHERE id = '11111111-0000-0000-0000-000000000004' AND parent_id IS NULL;

INSERT INTO public.platform_announcements (
  id, title, short_description, full_content, target_type, is_active, button_label, button_link, starts_at
)
VALUES (
  '99999999-0000-0000-0000-000000000001',
  'Ecclesia Admin em Demonstracao',
  'Explore o sistema com dados de demonstracao. Acesse a Biblia com IA pastoral, devocionais inteligentes e muito mais.',
  'Explore o Ecclesia Admin com dados de demonstracao. Acesse a Biblia com IA pastoral, devocionais inteligentes, secretaria, financeiro e muito mais. Este anuncio e exibido em todos os paineis da plataforma.',
  'global',
  true,
  'Explorar Biblia IA',
  '/admin/biblia',
  NOW() - INTERVAL '1 hour'
)
ON CONFLICT (id) DO NOTHING;
