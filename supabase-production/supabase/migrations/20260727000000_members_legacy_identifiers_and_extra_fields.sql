-- ============================================================================
-- Migration: members_legacy_identifiers_and_extra_fields
-- Timestamp: 20260727000000
-- Parte 1 — Fundação Cadastral do Membro (Ecclesia Online)
-- ============================================================================
--
-- OBJETIVO
-- Adicionar à tabela public.members:
--   1. Identificadores de sistema legado (Wintechi e outros);
--   2. Dados pessoais faltantes (nome conhecido, naturalidade, nacionalidade,
--      escolaridade, profissão);
--   3. Dados eclesiásticos faltantes (local do batismo, forma de admissão,
--      número CGADB);
--   4. Flags para cadastro incompleto e importação pendente de legado;
--   5. Índices para pesquisa por código legado.
--
-- NÃO remove colunas existentes. Idempotente (IF NOT EXISTS).
-- NÃO altera constraints ou políticas RLS existentes.
-- NÃO cria campos de redes sociais externas.
-- ============================================================================

BEGIN;

-- ── 1. Identificadores de sistema legado ────────────────────────────────
-- member_code (já existe) = código operacional no Ecclesia
-- Novos campos:

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS legacy_code text;
COMMENT ON COLUMN public.members.legacy_code IS 'Código antigo do sistema legado (ex.: Wintechi)';

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS legacy_registration text;
COMMENT ON COLUMN public.members.legacy_registration IS 'Matrícula antiga do sistema legado (ex.: número de cadastro Wintechi)';

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS legacy_source text;
COMMENT ON COLUMN public.members.legacy_source IS 'Origem do registro legado (ex.: ''wintechi'') — null para membros criados diretamente no Ecclesia';

-- Índices compostos para busca idempotente e pesquisa:
-- Unicidade apenas para membros da mesma organização com o mesmo código legado
-- da mesma origem. Admite membros sem código legado (criados no Ecclesia).
CREATE UNIQUE INDEX IF NOT EXISTS members_org_legacy_unique_idx
  ON public.members (organization_id, legacy_source, legacy_code)
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

-- Índice para pesquisa rápida por código legado
CREATE INDEX IF NOT EXISTS idx_members_legacy_code
  ON public.members (organization_id, legacy_code)
  WHERE legacy_code IS NOT NULL;

-- Índice para pesquisa por matrícula antiga
CREATE INDEX IF NOT EXISTS idx_members_legacy_registration
  ON public.members (organization_id, legacy_registration)
  WHERE legacy_registration IS NOT NULL;


-- ── 2. Dados pessoais faltantes ─────────────────────────────────────────

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS known_name text;
COMMENT ON COLUMN public.members.known_name IS 'Nome conhecido/apelido do membro — usado em buscas';

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS birth_place text;
COMMENT ON COLUMN public.members.birth_place IS 'Naturalidade (cidade/estado de nascimento)';

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS nationality text;
COMMENT ON COLUMN public.members.nationality IS 'Nacionalidade (ex.: Brasileiro, Boliviano, Haitiano)';

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS education_level text;
COMMENT ON COLUMN public.members.education_level IS 'Grau de instrução / escolaridade';

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS profession text;
COMMENT ON COLUMN public.members.profession IS 'Profissão do membro';


-- ── 3. Dados eclesiásticos faltantes ────────────────────────────────────

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS baptism_place text;
COMMENT ON COLUMN public.members.baptism_place IS 'Local onde foi batizado nas águas';

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS admission_type text;
COMMENT ON COLUMN public.members.admission_type IS 'Forma de admissão (ex.: batismo, aclamação, carta)';

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS cgadb_number text;
COMMENT ON COLUMN public.members.cgadb_number IS 'Número de cadastro na CGADB';


-- ── 4. Flags de cadastro incompleto (prepara futuro importador legado) ──
-- Estas colunas NÃO são expostas no cadastro manual comum — apenas a futura
-- importação do Wintechi poderá setá-las. O wizard manual nunca as ativa.

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS incomplete_registration boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.members.incomplete_registration IS 'TRUE quando o cadastro veio do legado com dados pendentes de revisão pela Secretaria';

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS cpf_pending boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.members.cpf_pending IS 'TRUE quando o CPF ainda não foi informado pelo sistema legado';

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS contact_pending boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.members.contact_pending IS 'TRUE quando telefone/e-mail ainda não foram informados pelo sistema legado';

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS requires_review boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.members.requires_review IS 'TRUE quando o cadastro importado precisa de revisão manual pela Secretaria';


-- ── 5. Índices de apoio à pesquisa (sem duplicar os já existentes) ─────

CREATE INDEX IF NOT EXISTS idx_members_known_name
  ON public.members (organization_id, known_name)
  WHERE known_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_members_cgadb_number
  ON public.members (organization_id, cgadb_number)
  WHERE cgadb_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_members_requires_review
  ON public.members (organization_id, requires_review)
  WHERE requires_review = true;

COMMIT;
