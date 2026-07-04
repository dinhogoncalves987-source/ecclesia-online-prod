-- ============================================================
-- Migration: Membros — Documentação Civil + Dados Eclesiásticos
-- Data: 2026-06-22
-- Todos os campos são NULLABLE (não quebram registros antigos).
-- Campos de RG mantidos apenas como legado (ocultos na UI).
-- ============================================================
-- COMO APLICAR:
--   Supabase Dashboard → SQL Editor → colar este arquivo → Run
--   OU: supabase db push (se CLI configurado)
-- ============================================================

ALTER TABLE public.members
  -- Documentação civil obrigatória (baseada no estado civil)
  ADD COLUMN IF NOT EXISTS civil_document_type       text,
  ADD COLUMN IF NOT EXISTS civil_document_status     text DEFAULT 'Pendente',
  ADD COLUMN IF NOT EXISTS civil_document_url        text,
  ADD COLUMN IF NOT EXISTS civil_document_notes      text,
  ADD COLUMN IF NOT EXISTS civil_document_uploaded_at   timestamptz,
  ADD COLUMN IF NOT EXISTS civil_document_validated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS civil_document_validated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Dados eclesiásticos adicionais
  ADD COLUMN IF NOT EXISTS holy_spirit_baptism_date  date,
  ADD COLUMN IF NOT EXISTS consecration_date         date;

-- ============================================================
-- Comentários descritivos
-- ============================================================
COMMENT ON COLUMN public.members.civil_document_type
  IS 'Tipo de certidão exigida: Certidão de nascimento | Certidão de casamento | Certidão de divórcio';

COMMENT ON COLUMN public.members.civil_document_status
  IS 'Status da documentação civil: Pendente | Apresentado | Validado | Rejeitado';

COMMENT ON COLUMN public.members.civil_document_url
  IS 'URL do arquivo/anexo da certidão (Supabase Storage ou externo)';

COMMENT ON COLUMN public.members.civil_document_notes
  IS 'Observações da secretaria sobre a documentação civil';

COMMENT ON COLUMN public.members.civil_document_uploaded_at
  IS 'Data/hora em que o documento foi enviado';

COMMENT ON COLUMN public.members.civil_document_validated_at
  IS 'Data/hora em que a secretaria validou o documento';

COMMENT ON COLUMN public.members.civil_document_validated_by
  IS 'Usuário (secretaria) que validou o documento';

COMMENT ON COLUMN public.members.holy_spirit_baptism_date
  IS 'Data do batismo com o Espírito Santo (glossolalia)';

COMMENT ON COLUMN public.members.consecration_date
  IS 'Data de consagração ministerial (Auxiliar, Diácono, Presbítero, Evangelista, Pastor)';

-- ============================================================
-- Verificação final
-- ============================================================
DO $$
DECLARE
  missing_cols text[] := ARRAY[]::text[];
  expected_cols text[] := ARRAY[
    'civil_document_type', 'civil_document_status', 'civil_document_url',
    'civil_document_notes', 'civil_document_uploaded_at', 'civil_document_validated_at',
    'civil_document_validated_by', 'holy_spirit_baptism_date', 'consecration_date'
  ];
  col text;
BEGIN
  FOREACH col IN ARRAY expected_cols LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'members' AND column_name = col
    ) THEN
      missing_cols := array_append(missing_cols, col);
    END IF;
  END LOOP;

  IF array_length(missing_cols, 1) > 0 THEN
    RAISE EXCEPTION 'Colunas ainda faltando em members: %', array_to_string(missing_cols, ', ');
  ELSE
    RAISE NOTICE 'Migration Civil+Eclesiastico: todas as 9 colunas confirmadas ✓';
  END IF;
END $$;
