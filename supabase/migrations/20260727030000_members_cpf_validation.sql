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
--   1. CPF, quando preenchido E cpf_pending = false, deve ter 11 dígitos,
--      não pode ser uma sequência repetida e precisa passar nos dois dígitos
--      verificadores. A mesma regra existe no frontend por experiência do
--      usuário, mas o banco é a autoridade final para API/importadores.
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

CREATE OR REPLACE FUNCTION public.is_valid_cpf(p_cpf text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
DECLARE
  v_digits text := regexp_replace(p_cpf, '\D', '', 'g');
  v_sum integer := 0;
  v_digit integer;
  i integer;
BEGIN
  IF length(v_digits) <> 11 OR v_digits ~ '^([0-9])\1{10}$' THEN
    RETURN false;
  END IF;

  FOR i IN 1..9 LOOP
    v_sum := v_sum + substr(v_digits, i, 1)::integer * (11 - i);
  END LOOP;
  v_digit := CASE WHEN (v_sum * 10) % 11 = 10 THEN 0 ELSE (v_sum * 10) % 11 END;
  IF v_digit <> substr(v_digits, 10, 1)::integer THEN
    RETURN false;
  END IF;

  v_sum := 0;
  FOR i IN 1..10 LOOP
    v_sum := v_sum + substr(v_digits, i, 1)::integer * (12 - i);
  END LOOP;
  v_digit := CASE WHEN (v_sum * 10) % 11 = 10 THEN 0 ELSE (v_sum * 10) % 11 END;
  RETURN v_digit = substr(v_digits, 11, 1)::integer;
END;
$$;

REVOKE ALL ON FUNCTION public.is_valid_cpf(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_valid_cpf(text) TO authenticated, service_role;

-- ── 1. Validade completa do CPF ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'members_cpf_format_check'
      AND n.nspname = 'public'
      AND t.relname = 'members'
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_cpf_format_check
      CHECK (
        cpf IS NULL
        OR cpf_pending = true
        OR public.is_valid_cpf(cpf)
      ) NOT VALID;
  END IF;
END $$;

COMMENT ON CONSTRAINT members_cpf_format_check ON public.members IS
  'Valida os dois dígitos verificadores do CPF quando não está pendente. NOT VALID: não força validação retroativa de linhas já existentes.';

-- ── 2. Unicidade de CPF por organização (quando não pendente) ───────────
-- Índice parcial: só considera linhas com cpf preenchido E cpf_pending = false.
-- Isso permite múltiplos registros legados com CPF pendente/nulo sem
-- conflito, mas bloqueia duplicidade real no cadastro comum/manual.
DROP INDEX IF EXISTS public.members_org_cpf_unique_idx;
CREATE UNIQUE INDEX members_org_cpf_unique_idx
  ON public.members (organization_id, regexp_replace(cpf, '\D', '', 'g'))
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
