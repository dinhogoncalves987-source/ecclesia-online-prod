-- ============================================================
-- Migration: Código do Membro (member_code)
-- Data: 2026-07-17
--
-- Objetivo: permitir que cada igreja preserve o código/matrícula que já
-- usava no sistema anterior ao migrar seus membros para o Ecclesia. O
-- campo é OPCIONAL — igrejas que nunca tiveram numeração própria continuam
-- funcionando exatamente como hoje.
--
-- Regras de produto:
--   • member_code é livre (aceita zeros à esquerda, letras, etc.) — por
--     isso é `text`, nunca numérico.
--   • Único apenas DENTRO da mesma organização (duas igrejas podem usar o
--     mesmo código sem conflito) e apenas quando preenchido — por isso o
--     índice único é parcial (WHERE member_code IS NOT NULL).
--   • Aceito na criação, edição e importação (ver src/pages/Membros.tsx).
--   • Na Carteira de Membro, quando preenchido, substitui a matrícula
--     técnica gerada automaticamente (ver src/components/MemberWalletCard.tsx).
--
-- Idempotente e forward-only — seguro para rodar múltiplas vezes, seguro
-- em staging e em produção. Não altera nem remove nenhum dado existente.
-- ============================================================

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS member_code text;

CREATE UNIQUE INDEX IF NOT EXISTS members_org_member_code_unique_idx
  ON public.members (organization_id, member_code)
  WHERE member_code IS NOT NULL;

COMMENT ON COLUMN public.members.member_code IS
  'Código/matrícula histórico do membro, preservado do sistema anterior da igreja. Opcional; único apenas dentro da mesma organização quando preenchido. Quando presente, substitui a matrícula automática exibida na Carteira de Membro.';

-- ============================================================
-- Verificação final
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'members' AND column_name = 'member_code'
  ) THEN
    RAISE EXCEPTION 'Migration member_code: coluna members.member_code não foi criada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'members' AND indexname = 'members_org_member_code_unique_idx'
  ) THEN
    RAISE EXCEPTION 'Migration member_code: índice único members_org_member_code_unique_idx não foi criado';
  END IF;

  RAISE NOTICE 'Migration member_code: coluna e índice único confirmados ✓';
END $$;
