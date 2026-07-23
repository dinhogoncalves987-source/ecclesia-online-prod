-- ============================================================================
-- Migration: members_cpf_validation
-- Timestamp: 20260727030000
-- Parte 1 — Fundacao Cadastral do Membro (Ecclesia Online)
-- ============================================================================
--
-- OBJETIVO
-- Ate esta migration, o CPF em public.members nao tinha NENHUMA validacao
-- no banco — qualquer texto era aceito e duplicatas na mesma organizacao
-- eram permitidas. Isso violava o requisito de produto: cadastro manual
-- exige CPF valido e sem duplicidade.
--
-- REGRAS
--   1. CPF, quando preenchido E cpf_pending = false, deve ter exatamente 11
--      digitos (apos remover pontuacao) — mesma regra usada pelo helper
--      src/lib/cpfValidation.ts no frontend. O digito verificador NAO é
--      validado aqui (ficaria caro/duplicado em SQL); a validacao completa
--      do digito verificador acontece no frontend antes do INSERT/UPDATE.
--      Esta constraint e uma rede de seguranca contra dados obviamente
--      invalidos (texto livre, poucos digitos, etc.), nao a unica linha de
--      defesa.
--   2. CPF e unico por organizacao QUANDO nao esta marcado como pendente
--      (cpf_pending = false) — permite que futuras importacoes do legado
--      gravem cpf_pending = true sem CPF (ou com CPF a confirmar) sem
--      quebrar a unicidade.
--
-- NAO altera nem apaga dados existentes. A CHECK constraint e adicionada
-- como NOT VALID para nao falhar a migration caso já existam linhas com CPF
-- em formato inesperado — ela passa a valer para INSERTs/UPDATEs novos
-- imediatamente, e pode ser validada retroativamente depois (VALIDATE
-- CONSTRAINT) em uma limpeza de dados separada, fora do escopo desta parte.
-- ============================================================================

BEGIN;

-- ── 1. Formato do CPF (rede de seguranca) ───────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'members_cpf_format_check'
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_cpf_format_check
      CHECK (
        cpf IS NULL
        OR cpf_pending = true
        OR length(regexp_replace(cpf, '\D', '', 'g')) = 11
      ) NOT VALID;
  END IF;
END $$;

COMMENT ON CONSTRAINT members_cpf_format_check ON public.members IS
  'Garante 11 dígitos numéricos quando o CPF não está marcado como pendente (legado). NOT VALID: não força validação retroativa de linhas já existentes.';

-- ── 2. Unicidade de CPF por organização (quando não pendente) ───────────
-- Índice parcial: só considera linhas com cpf preenchido E cpf_pending = false.
-- Isso permite múltiplos registros legados com CPF pendente/nulo sem
-- conflito, mas bloqueia duplicidade real no cadastro comum/manual.
CREATE UNIQUE INDEX IF NOT EXISTS members_org_cpf_unique_idx
  ON public.members (organization_id, cpf)
  WHERE cpf IS NOT NULL AND cpf_pending = false;

-- ── Verificação final ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'members_cpf_format_check'
  ) THEN
    RAISE EXCEPTION 'Migration members_cpf_validation: constraint de formato não foi criada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'members' AND indexname = 'members_org_cpf_unique_idx'
  ) THEN
    RAISE EXCEPTION 'Migration members_cpf_validation: índice único de CPF não foi criado';
  END IF;

  RAISE NOTICE 'Migration members_cpf_validation: constraint e índice confirmados ✓';
END $$;

COMMIT;
