-- ============================================================
-- ECCLESIA ONLINE — PRÉ-VERIFICAÇÃO DO SCHEMA STAGING
-- Arquivo: 00_check_staging_schema_before.sql
-- Quando rodar: ANTES de 01_apply_staging_schema_package.sql
-- Objetivo: fotografar o estado atual do banco para saber
--           o que já existe e o que ainda precisa ser criado.
-- SEGURANÇA: somente SELECTs e RAISE NOTICE — não altera nada.
-- ============================================================

-- ── 1. Colunas estendidas de MEMBERS (migration 20260617120000) ───────────────
DO $$
DECLARE
  cols text[] := ARRAY[
    'photo_url','gender','marital_status','cpf','rg','rg_issuer','rg_issue_date',
    'whatsapp','zip_code','street','address_number','address_complement','neighborhood',
    'conversion_date','administrative_role','father_name','mother_name','spouse_name',
    'sector_id','congregation_id'
  ];
  c text; missing text[] := '{}'; found_count int := 0;
BEGIN
  FOREACH c IN ARRAY cols LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='members' AND column_name=c
    ) THEN found_count := found_count + 1;
    ELSE missing := array_append(missing, c);
    END IF;
  END LOOP;
  RAISE NOTICE '[members extended] %/20 colunas presentes. Faltando: %',
    found_count,
    CASE WHEN array_length(missing,1) IS NULL THEN 'nenhuma' ELSE array_to_string(missing,', ') END;
END $$;

-- ── 2. Constraint de status de MEMBERS (migration 20260617130000) ─────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'members_status_check' AND conrelid = 'public.members'::regclass
  ) THEN
    RAISE NOTICE '[members status_check] constraint presente ✓';
  ELSE
    RAISE NOTICE '[members status_check] AUSENTE — precisa ser criada';
  END IF;
END $$;

-- ── 3. Tabela MEMBER_INVITES (migration 20260617140000) ───────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='member_invites'
  ) THEN
    RAISE NOTICE '[member_invites] tabela presente ✓';
  ELSE
    RAISE NOTICE '[member_invites] AUSENTE — precisa ser criada';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_member_invite_by_token')
  THEN RAISE NOTICE '[get_member_invite_by_token] função presente ✓';
  ELSE RAISE NOTICE '[get_member_invite_by_token] AUSENTE';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'accept_member_invite')
  THEN RAISE NOTICE '[accept_member_invite] função presente ✓';
  ELSE RAISE NOTICE '[accept_member_invite] AUSENTE';
  END IF;
END $$;

-- ── 4. Funções RLS de campanhas (migration 20260617150000) ────────────────────
DO $$
DECLARE v_def text;
BEGIN
  SELECT prosrc INTO v_def FROM pg_proc WHERE proname='is_org_campaign_writer' LIMIT 1;
  IF v_def IS NULL THEN
    RAISE NOTICE '[is_org_campaign_writer] função AUSENTE';
  ELSIF v_def LIKE '%pastor%' THEN
    RAISE NOTICE '[is_org_campaign_writer] versão NOVA (pastor/secretary) ✓';
  ELSE
    RAISE NOTICE '[is_org_campaign_writer] versão ANTIGA (tesoureiro/leader) — precisa ser atualizada';
  END IF;
END $$;

-- ── 5. Tabela ACCESS_INVITES (migration 20260618120000) ───────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='access_invites'
  ) THEN
    RAISE NOTICE '[access_invites] tabela presente ✓';
  ELSE
    RAISE NOTICE '[access_invites] AUSENTE — precisa ser criada';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_access_invite_by_token')
  THEN RAISE NOTICE '[get_access_invite_by_token] função presente ✓';
  ELSE RAISE NOTICE '[get_access_invite_by_token] AUSENTE';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'accept_access_invite')
  THEN RAISE NOTICE '[accept_access_invite] função presente ✓';
  ELSE RAISE NOTICE '[accept_access_invite] AUSENTE';
  END IF;
END $$;

-- ── 6. Validação de e-mail no accept_access_invite (migration 20260618130000) ─
DO $$
DECLARE v_def text;
BEGIN
  SELECT prosrc INTO v_def FROM pg_proc WHERE proname='accept_access_invite' LIMIT 1;
  IF v_def IS NULL THEN
    RAISE NOTICE '[accept_access_invite] função AUSENTE';
  ELSIF v_def LIKE '%email_mismatch%' THEN
    RAISE NOTICE '[accept_access_invite] versão com validação de e-mail ✓';
  ELSE
    RAISE NOTICE '[accept_access_invite] versão ANTIGA sem validação de e-mail — precisa ser atualizada';
  END IF;
END $$;

-- ── 7. Colunas civil/eclesiásticas de MEMBERS (migration 20260622120000) ──────
DO $$
DECLARE
  cols text[] := ARRAY[
    'civil_document_type','civil_document_status','civil_document_url',
    'civil_document_notes','civil_document_uploaded_at','civil_document_validated_at',
    'civil_document_validated_by','holy_spirit_baptism_date','consecration_date'
  ];
  c text; missing text[] := '{}'; found_count int := 0;
BEGIN
  FOREACH c IN ARRAY cols LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='members' AND column_name=c
    ) THEN found_count := found_count + 1;
    ELSE missing := array_append(missing, c);
    END IF;
  END LOOP;
  RAISE NOTICE '[members civil+eclesiastico] %/9 colunas presentes. Faltando: %',
    found_count,
    CASE WHEN array_length(missing,1) IS NULL THEN 'nenhuma' ELSE array_to_string(missing,', ') END;
END $$;

-- ── 8. RLS hierárquico de ORGANIZATIONS (migration 20260622140000) ────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'can_read_organization')
  THEN RAISE NOTICE '[can_read_organization] função presente ✓';
  ELSE RAISE NOTICE '[can_read_organization] AUSENTE — precisa ser criada';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'can_admin_organization')
  THEN RAISE NOTICE '[can_admin_organization] função presente ✓';
  ELSE RAISE NOTICE '[can_admin_organization] AUSENTE — precisa ser criada';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='organizations'
      AND policyname='organizations members read'
  ) THEN
    -- Verificar se a policy usa can_read_organization (nova) ou is_org_user (antiga)
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='organizations'
        AND policyname='organizations members read'
        AND qual LIKE '%can_read_organization%'
    ) THEN
      RAISE NOTICE '[organizations RLS SELECT] policy hierárquica (can_read_organization) ✓';
    ELSE
      RAISE NOTICE '[organizations RLS SELECT] policy ANTIGA (is_org_user) — precisa ser atualizada';
    END IF;
  ELSE
    RAISE NOTICE '[organizations RLS SELECT] policy "organizations members read" AUSENTE';
  END IF;
END $$;

-- ── 9. Coluna UNIT_STATUS em ORGANIZATIONS (migration 20260623120000) ─────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='organizations' AND column_name='unit_status'
  ) THEN
    RAISE NOTICE '[organizations.unit_status] coluna presente ✓';
  ELSE
    RAISE NOTICE '[organizations.unit_status] AUSENTE — precisa ser criada';
  END IF;
END $$;

-- ── 10. Campos estruturais multi-denominacionais (migration 20260623150000) ────
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
  c text; missing text[] := '{}'; found_count int := 0;
BEGIN
  FOREACH c IN ARRAY cols LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='organizations' AND column_name=c
    ) THEN found_count := found_count + 1;
    ELSE missing := array_append(missing, c);
    END IF;
  END LOOP;
  RAISE NOTICE '[organizations multi-denominacional] %/14 colunas presentes. Faltando: %',
    found_count,
    CASE WHEN array_length(missing,1) IS NULL THEN 'nenhuma' ELSE array_to_string(missing,', ') END;
END $$;

-- ── RESUMO: mostrar contagem de organizations por tipo ───────────────────────
SELECT
  organization_type,
  count(*) AS total,
  count(*) FILTER (WHERE active) AS ativos
FROM public.organizations
GROUP BY organization_type
ORDER BY organization_type;

-- ── RESUMO: verificar policies em organizations ──────────────────────────────
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'organizations'
ORDER BY policyname;
