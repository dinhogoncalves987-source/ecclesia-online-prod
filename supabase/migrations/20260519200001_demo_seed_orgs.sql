-- Minimal demo seed for production — organizations + platform_announcement only
-- Safe to run on production. Idempotent.

INSERT INTO public.organizations (id, name, slug, organization_type, city, state, country_code, language_code, active)
VALUES
  ('11111111-0000-0000-0000-000000000001', 'Convencao Batista Nacional',      'convencao-batista-nacional', 'convencao',    'Brasilia',  'DF', 'BR', 'pt-BR', true),
  ('11111111-0000-0000-0000-000000000002', 'Igreja Batista Central Sao Paulo','ibc-sao-paulo',              'matriz',       'Sao Paulo', 'SP', 'BR', 'pt-BR', true),
  ('11111111-0000-0000-0000-000000000003', 'Setor Regional Norte SP',         'setor-regional-norte-sp',    'setor',        'Sao Paulo', 'SP', 'BR', 'pt-BR', true),
  ('11111111-0000-0000-0000-000000000004', 'Congregacao Batista Jardim America','congregacao-jardim-america','congregacao',  'Sao Paulo', 'SP', 'BR', 'pt-BR', true)
ON CONFLICT (id) DO NOTHING;

UPDATE public.organizations SET parent_id = '11111111-0000-0000-0000-000000000001' WHERE id = '11111111-0000-0000-0000-000000000002' AND parent_id IS NULL;
UPDATE public.organizations SET parent_id = '11111111-0000-0000-0000-000000000002' WHERE id = '11111111-0000-0000-0000-000000000003' AND parent_id IS NULL;
UPDATE public.organizations SET parent_id = '11111111-0000-0000-0000-000000000003' WHERE id = '11111111-0000-0000-0000-000000000004' AND parent_id IS NULL;

INSERT INTO public.platform_announcements (id, title, short_description, is_active, button_label, button_link, starts_at)
VALUES (
  '99999999-0000-0000-0000-000000000001',
  'Ecclesia Admin em Demonstracao',
  'Explore o sistema com dados de demonstracao. Acesse a Biblia com IA pastoral, devocionais inteligentes e muito mais.',
  true,
  'Explorar Biblia IA',
  '/admin/biblia',
  NOW() - INTERVAL '1 hour'
)
ON CONFLICT (id) DO NOTHING;
