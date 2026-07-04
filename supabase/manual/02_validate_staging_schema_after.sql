-- ============================================================
-- ECCLESIA ONLINE — VALIDAÇÃO PÓS-APLICAÇÃO
-- Arquivo: 02_validate_staging_schema_after.sql
-- Quando rodar: APÓS 01_apply_staging_schema_package.sql
-- Objetivo: confirmar que todas as mudanças foram aplicadas.
--           Levanta EXCEPTION se algo crítico estiver faltando.
-- ============================================================

-- ── 1. MEMBERS — colunas estendidas ──────────────────────────────────────────
DO $$
DECLARE
  cols text[] := ARRAY[
    'photo_url','gender','marital_status','cpf','rg','rg_issuer','rg_issue_date',
    'whatsapp','zip_code','street','address_number','address_complement','neighborhood',
    'conversion_date','administrative_role','father_name','mother_name','spouse_name',
    'sector_id','congregation_id'
  ];
  c text; missing text[] := '{}';
BEGIN
  FOREACH c IN ARRAY cols LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='members' AND column_name=c
    ) THEN missing := array_append(missing, c); END IF;
  END LOOP;
  IF array_length(missing,1) > 0 THEN
    RAISE EXCEPTION '[FALHA] members extended: colunas faltando: %', array_to_string(missing,', ');
  ELSE
    RAISE NOTICE '[OK] members extended: todas as 20 colunas presentes ✓';
  END IF;
END $$;

-- ── 2. MEMBERS — constraint de status ────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'members_status_check' AND conrelid = 'public.members'::regclass
  ) THEN
    RAISE EXCEPTION '[FALHA] members_status_check constraint AUSENTE';
  ELSE
    RAISE NOTICE '[OK] members_status_check presente ✓';
  END IF;
END $$;

-- ── 3. MEMBER_INVITES — tabela, indexes, funções ──────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='member_invites'
  ) THEN RAISE EXCEPTION '[FALHA] tabela member_invites AUSENTE';
  ELSE RAISE NOTICE '[OK] tabela member_invites presente ✓';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='member_invites'
      AND indexname='idx_member_invites_token'
  ) THEN RAISE EXCEPTION '[FALHA] index idx_member_invites_token AUSENTE';
  ELSE RAISE NOTICE '[OK] idx_member_invites_token ✓';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='get_member_invite_by_token')
  THEN RAISE EXCEPTION '[FALHA] função get_member_invite_by_token AUSENTE';
  ELSE RAISE NOTICE '[OK] get_member_invite_by_token ✓';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='accept_member_invite')
  THEN RAISE EXCEPTION '[FALHA] função accept_member_invite AUSENTE';
  ELSE RAISE NOTICE '[OK] accept_member_invite ✓';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='member_invites'
      AND policyname='member_invites staff select'
  ) THEN RAISE EXCEPTION '[FALHA] policy "member_invites staff select" AUSENTE';
  ELSE RAISE NOTICE '[OK] member_invites RLS policies ✓';
  END IF;
END $$;

-- ── 4. CAMPAIGNS — funções RLS (versão com pastor/secretary) ─────────────────
DO $$
DECLARE v_def text;
BEGIN
  SELECT prosrc INTO v_def FROM pg_proc WHERE proname='is_org_campaign_writer' LIMIT 1;
  IF v_def IS NULL THEN
    RAISE EXCEPTION '[FALHA] função is_org_campaign_writer AUSENTE';
  ELSIF v_def LIKE '%pastor%' THEN
    RAISE NOTICE '[OK] is_org_campaign_writer versão nova (pastor/secretary) ✓';
  ELSE
    RAISE EXCEPTION '[FALHA] is_org_campaign_writer ainda na versão antiga (sem pastor)';
  END IF;
END $$;

-- ── 5. ACCESS_INVITES — tabela, indexes, funções ──────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='access_invites'
  ) THEN RAISE EXCEPTION '[FALHA] tabela access_invites AUSENTE';
  ELSE RAISE NOTICE '[OK] tabela access_invites presente ✓';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='access_invites'
      AND indexname='idx_access_invites_token'
  ) THEN RAISE EXCEPTION '[FALHA] index idx_access_invites_token AUSENTE';
  ELSE RAISE NOTICE '[OK] idx_access_invites_token ✓';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='get_access_invite_by_token')
  THEN RAISE EXCEPTION '[FALHA] função get_access_invite_by_token AUSENTE';
  ELSE RAISE NOTICE '[OK] get_access_invite_by_token ✓';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='access_invites'
      AND policyname='access_invites admin select'
  ) THEN RAISE EXCEPTION '[FALHA] policy "access_invites admin select" AUSENTE';
  ELSE RAISE NOTICE '[OK] access_invites RLS policies ✓';
  END IF;
END $$;

-- ── 6. ACCEPT_ACCESS_INVITE — versão com validação de e-mail ─────────────────
DO $$
DECLARE v_def text;
BEGIN
  SELECT prosrc INTO v_def FROM pg_proc WHERE proname='accept_access_invite' LIMIT 1;
  IF v_def IS NULL THEN
    RAISE EXCEPTION '[FALHA] função accept_access_invite AUSENTE';
  ELSIF v_def LIKE '%email_mismatch%' THEN
    RAISE NOTICE '[OK] accept_access_invite com validação de e-mail ✓';
  ELSE
    RAISE EXCEPTION '[FALHA] accept_access_invite sem validação de e-mail (versão desatualizada)';
  END IF;
END $$;

-- ── 7. MEMBERS — colunas civil + eclesiásticas ────────────────────────────────
DO $$
DECLARE
  cols text[] := ARRAY[
    'civil_document_type','civil_document_status','civil_document_url',
    'civil_document_notes','civil_document_uploaded_at','civil_document_validated_at',
    'civil_document_validated_by','holy_spirit_baptism_date','consecration_date'
  ];
  c text; missing text[] := '{}';
BEGIN
  FOREACH c IN ARRAY cols LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='members' AND column_name=c
    ) THEN missing := array_append(missing, c); END IF;
  END LOOP;
  IF array_length(missing,1) > 0 THEN
    RAISE EXCEPTION '[FALHA] members civil+eclesiastico: colunas faltando: %', array_to_string(missing,', ');
  ELSE
    RAISE NOTICE '[OK] members civil+eclesiastico: todas as 9 colunas ✓';
  END IF;
END $$;

-- ── 8. ORGANIZATIONS — funções e policies RLS hierárquico ─────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='can_read_organization')
  THEN RAISE EXCEPTION '[FALHA] função can_read_organization AUSENTE';
  ELSE RAISE NOTICE '[OK] can_read_organization ✓';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='can_admin_organization')
  THEN RAISE EXCEPTION '[FALHA] função can_admin_organization AUSENTE';
  ELSE RAISE NOTICE '[OK] can_admin_organization ✓';
  END IF;

  -- Verificar se a policy usa can_read_organization (não is_org_user)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='organizations'
      AND policyname='organizations members read'
      AND qual LIKE '%can_read_organization%'
  ) THEN
    RAISE EXCEPTION '[FALHA] policy "organizations members read" não usa can_read_organization';
  ELSE
    RAISE NOTICE '[OK] organizations SELECT policy hierárquica ✓';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='organizations'
      AND policyname='organizations admins update'
  ) THEN RAISE EXCEPTION '[FALHA] policy "organizations admins update" AUSENTE';
  ELSE RAISE NOTICE '[OK] organizations UPDATE policy ✓';
  END IF;
END $$;

-- ── 9. ORGANIZATIONS — unit_status ───────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='organizations'
      AND column_name='unit_status'
  ) THEN RAISE EXCEPTION '[FALHA] organizations.unit_status AUSENTE';
  ELSE RAISE NOTICE '[OK] organizations.unit_status ✓';
  END IF;
END $$;

-- ── 10. ORGANIZATIONS — campos multi-denominacionais ─────────────────────────
DO $$
DECLARE
  cols text[] := ARRAY[
    'denomination_type','hierarchy_model',
    'top_level_label','top_level_label_plural',
    'municipal_level_label','municipal_level_label_plural',
    'intermediate_level_label','intermediate_level_label_plural',
    'local_unit_label','local_unit_label_plural',
    'uses_convention_level','uses_municipal_level',
    'uses_intermediate_level','uses_local_units'
  ];
  c text; missing text[] := '{}';
BEGIN
  FOREACH c IN ARRAY cols LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='organizations' AND column_name=c
    ) THEN missing := array_append(missing, c); END IF;
  END LOOP;
  IF array_length(missing,1) > 0 THEN
    RAISE EXCEPTION '[FALHA] organizations multi-denominacional: colunas faltando: %', array_to_string(missing,', ');
  ELSE
    RAISE NOTICE '[OK] organizations multi-denominacional: todas as 14 colunas ✓';
  END IF;
END $$;

-- ── RESUMO FINAL ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE 'VALIDAÇÃO CONCLUÍDA — schema staging OK ✓';
  RAISE NOTICE 'Sem exceções = todos os itens confirmados.';
  RAISE NOTICE '============================================';
END $$;

-- Leitura de conferência: colunas de organizations (estruturais + unit_status)
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name='organizations'
  AND column_name IN (
    'unit_status','denomination_type','hierarchy_model',
    'top_level_label','top_level_label_plural',
    'municipal_level_label','intermediate_level_label',
    'local_unit_label','uses_intermediate_level',
    'uses_convention_level','uses_municipal_level','uses_local_units'
  )
ORDER BY column_name;
