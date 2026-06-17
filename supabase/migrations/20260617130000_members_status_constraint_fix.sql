-- ============================================================
-- Migration: Corrigir CHECK constraint de status em members
-- Data: 2026-06-17
-- Razão: secretariaConstants.ts usa 'Em disciplina', 'Afastado',
--         'Congregado' mas a constraint anterior só tinha 'Disciplinado'.
--         Qualquer UPDATE com estes status falhava silenciosamente.
-- ============================================================
-- COMO APLICAR:
--   Supabase Dashboard → SQL Editor → colar este arquivo → Run
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'members'
  ) THEN
    -- Drop constraint antiga (qualquer nome)
    ALTER TABLE public.members DROP CONSTRAINT IF EXISTS members_status_check;

    -- Recriar com todos os valores usados pelo app
    BEGIN
      ALTER TABLE public.members
        ADD CONSTRAINT members_status_check
        CHECK (status IN (
          'Ativo',
          'Inativo',
          'Visitante',
          'Congregado',
          'Transferido',
          'Falecido',
          'Em disciplina',
          'Disciplinado',
          'Afastado'
        ));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    RAISE NOTICE 'members_status_check atualizado com todos os status do app ✓';
  END IF;
END $$;
