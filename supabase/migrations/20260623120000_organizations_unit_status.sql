-- ============================================================
-- Migration: adiciona unit_status à tabela organizations
-- Data: 2026-06-23
-- ============================================================
-- OBJETIVO:
--   Cada setor/congregação precisa de status operacional visível
--   na tela Setores/Distritos para que gestores saibam a situação
--   da unidade sem precisar abrir Gerenciar Acessos.
--
-- VALORES SUGERIDOS:
--   Ativa | Em implantação | Inativa | Arquivada
--
-- SEGURANÇA:
--   • ADD COLUMN IF NOT EXISTS — idempotente.
--   • Não remove nem altera colunas existentes.
--   • Não altera dados históricos.
--   • Default = 'Ativa' para não quebrar registros existentes.
-- ============================================================
-- COMO APLICAR:
--   Supabase Dashboard → SQL Editor → colar este arquivo → Run
-- ============================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS unit_status text NOT NULL DEFAULT 'Ativa';

COMMENT ON COLUMN public.organizations.unit_status IS
  'Status operacional da unidade: Ativa | Em implantação | Inativa | Arquivada';

DO $$ BEGIN
  RAISE NOTICE 'organizations.unit_status adicionada ✓';
END $$;
