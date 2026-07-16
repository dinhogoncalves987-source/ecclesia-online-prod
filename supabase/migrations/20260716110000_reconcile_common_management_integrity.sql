-- ============================================================================
-- Migration: reconcile_common_management_integrity
-- Timestamp: 20260716110000 (posterior ao baseline de produção 20260715170000)
-- ============================================================================
--
-- OBJETIVO
-- Substituir a promoção em bloco de 33 arquivos históricos do banco de
-- teste/staging para o workdir executável do banco de produção (commit
-- c94024e, revertida por esta mesma correção) por uma única migration
-- forward-only, comum aos dois ambientes e idempotente, com preflight
-- fail-closed.
--
-- Esta migration reconcilia exclusivamente FOREIGN KEYs de auditoria/autoria
-- que referenciam auth.users(id) e que uma auditoria direta de schema
-- encontrou presentes no banco de teste/staging e ausentes no banco de
-- produção. Ela NÃO cria tabelas, NÃO insere/atualiza/exclui dados, NÃO
-- recria políticas antigas nem funções inseguras, e NÃO toca em
-- organizations, membros, usuários, mensagens ou registros financeiros —
-- apenas adiciona (quando ausente e sem órfãos) ou valida integralmente
-- (quando já presente) as 49 constraints listadas abaixo.
--
-- ---------------------------------------------------------------------------
-- AMBIENTES (regra absoluta de nomenclatura)
-- ---------------------------------------------------------------------------
-- - "staging" / "banco de teste/staging" = ambiente de teste/homologação,
--   projeto Supabase qkiiwopkbcslquyfhdec. Dados fictícios ou controlados.
-- - "production" / "banco de produção" = ambiente real, projeto Supabase
--   zsonukpxahaxffugavfu. Organizações e membros reais, operação oficial.
-- - "common" (nome desta migration) significa apenas que o MESMO arquivo
--   estrutural (byte a byte idêntico, mesmo SHA256) é mantido nos dois
--   workdirs. Isso NÃO mistura os bancos nem transfere dados entre eles: a
--   execução é sempre separada — primeiro no banco de teste/staging, com
--   validação completa, e só depois, manualmente, no banco de produção, com
--   nova validação completa. Nenhuma linha de dado é copiada de um banco
--   para o outro por esta migration.
--
-- ---------------------------------------------------------------------------
-- ORIGEM DAS 49 CONSTRAINTS (nenhuma foi inventada)
-- ---------------------------------------------------------------------------
-- 39 das 49 constraints têm origem rastreável diretamente nas migrations de
-- `supabase/migrations/` (a coluna com `REFERENCES auth.users(id) ON DELETE
-- ...` foi localizada e copiada literalmente da migration que a criou).
--
-- As outras 10 constraints (members_civil_document_validated_by_fkey,
-- organization_responsibles_assigned_by_fkey,
-- organization_responsibles_user_id_fkey e as 7 constraints de
-- platform_support_*) NÃO possuem migration histórica rastreada no
-- repositório — as tabelas platform_support_* são usadas de fato pelo
-- frontend (src/pages/SuperAdmin.tsx, src/pages/GerenciarAcessos.tsx,
-- src/lib/platformSupportAudit.ts, todas com `as any`, sinal de tabela sem
-- tipos gerados), mas nenhum arquivo `.sql` do repositório as cria.
--
-- Essas 10 definições foram recuperadas diretamente do inventário estrutural
-- exportado do banco de teste/staging (qkiiwopkbcslquyfhdec), por meio das
-- definições retornadas por `pg_get_constraintdef` no catálogo PostgreSQL
-- real desse banco — não foram inferidas nem inventadas. Antes de qualquer
-- execução real desta migration no banco de teste/staging, o preflight desta
-- própria migration (FASE 3/4) confirmará, com o catálogo do banco de
-- destino, que tabela, coluna e definição batem exatamente com o que está
-- descrito aqui; qualquer divergência aborta a transação inteira sem
-- alterar nada.
--
-- ---------------------------------------------------------------------------
-- SOBRE TABELAS DE MÓDULOS AINDA NÃO PROMOVIDOS (Campanhas, Culto & Louvor)
-- ---------------------------------------------------------------------------
-- 7 das 49 constraints pertencem a tabelas de módulos classificados em
-- supabase/migration-manifest.json como "staging_feature"/"mixed_needs_split"
-- (Campanhas, Culto & Louvor) — ou seja, ainda não promovidos formalmente
-- para o banco de produção. O preflight desta migration (FASE 3) verifica a
-- existência de cada tabela ANTES de qualquer ALTER; se uma dessas tabelas
-- ainda não existir no banco de destino, a transação inteira aborta com
-- RAISE EXCEPTION identificando exatamente qual tabela está ausente — nunca
-- falha silenciosamente, nunca cria a tabela. Esta mesma migration poderá ser
-- reexecutada com sucesso depois que o módulo correspondente for promovido.
--
-- ============================================================================

BEGIN;

DO $reconcile_common_management_integrity$
DECLARE
  fk                 record;
  con                record;
  v_org_count_before bigint;
  v_org_count_after  bigint;
  v_orphan_count     bigint;
  v_attnum_src       smallint;
  v_attnum_dst       smallint;
  v_expected_delcode "char";
  v_func_def         text;
  v_issues           text[] := ARRAY[]::text[];
  v_skip_table       text[] := ARRAY[]::text[];
  v_skip_column      text[] := ARRAY[]::text[];
  v_constraints_esperadas int := 49;
  v_constraints_presentes int;
  v_constraints_validadas int;
BEGIN
  -- ── FASE 3 (passo 1): pré-condições globais ────────────────────────────────
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Preflight: auth.users ausente — abortando sem alterar nada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'id'
  ) THEN
    RAISE EXCEPTION 'Preflight: coluna auth.users.id ausente — abortando sem alterar nada';
  END IF;

  IF to_regclass('public.organizations') IS NULL THEN
    RAISE EXCEPTION 'Preflight: public.organizations ausente — abortando sem alterar nada';
  END IF;

  SELECT count(*) INTO v_org_count_before FROM public.organizations;

  -- ── Conjunto autoritativo das 49 constraints (nome, tabela, coluna, ON DELETE) ─
  -- 39 com origem em supabase/migrations/; 10 recuperadas do inventário
  -- estrutural do banco de teste/staging via pg_get_constraintdef (ver
  -- comentário no topo do arquivo). condeferrable/condeferred/confupdtype/
  -- confmatchtype não constam aqui porque são idênticos para todas (false,
  -- false, NO ACTION, MATCH SIMPLE) e são conferidos explicitamente abaixo.
  CREATE TEMP TABLE _reconcile_expected_fks (
    name text PRIMARY KEY,
    tbl  text NOT NULL,
    col  text NOT NULL,
    del  text NOT NULL CHECK (del IN ('CASCADE', 'SET NULL', 'NO ACTION'))
  ) ON COMMIT DROP;

  INSERT INTO _reconcile_expected_fks (name, tbl, col, del) VALUES
    ('access_invites_accepted_user_id_fkey',                  'access_invites',                       'accepted_user_id',    'SET NULL'),
    ('access_invites_invited_by_fkey',                        'access_invites',                       'invited_by',          'SET NULL'),
    ('administrative_requests_assigned_to_fkey',              'administrative_requests',              'assigned_to',         'SET NULL'),
    ('assemblies_created_by_fkey',                            'assemblies',                           'created_by',          'SET NULL'),
    ('campaign_contributions_contributed_by_fkey',            'campaign_contributions',               'contributed_by',      'SET NULL'),
    ('campaign_media_uploaded_by_fkey',                       'campaign_media',                       'uploaded_by',         'SET NULL'),
    ('campaign_updates_created_by_fkey',                      'campaign_updates',                     'created_by',          'SET NULL'),
    ('campaigns_approved_by_fkey',                            'campaigns',                            'approved_by',         'SET NULL'),
    ('campaigns_created_by_fkey',                             'campaigns',                            'created_by',          'SET NULL'),
    ('communications_created_by_fkey',                        'communications',                       'created_by',          'SET NULL'),
    ('documents_created_by_fkey',                             'documents',                            'created_by',          'NO ACTION'),
    ('events_created_by_fkey',                                'events',                               'created_by',          'SET NULL'),
    ('finance_monthly_closings_closed_by_fkey',               'finance_monthly_closings',             'closed_by',           'SET NULL'),
    ('finance_transaction_audit_logs_changed_by_fkey',        'finance_transaction_audit_logs',       'changed_by',          'SET NULL'),
    ('group_messages_author_user_id_fkey',                    'group_messages',                       'author_user_id',      'CASCADE'),
    ('groups_created_by_fkey',                                'groups',                               'created_by',          'SET NULL'),
    ('internal_message_attachments_uploaded_by_fkey',         'internal_message_attachments',         'uploaded_by',         'SET NULL'),
    ('internal_messages_sender_user_id_fkey',                 'internal_messages',                    'sender_user_id',      'SET NULL'),
    ('internal_threads_assigned_to_fkey',                     'internal_threads',                     'assigned_to',         'SET NULL'),
    ('internal_threads_created_by_fkey',                      'internal_threads',                     'created_by',          'SET NULL'),
    ('member_invites_accepted_user_id_fkey',                  'member_invites',                       'accepted_user_id',    'SET NULL'),
    ('member_invites_invited_by_fkey',                        'member_invites',                       'invited_by',          'SET NULL'),
    ('members_created_by_fkey',                               'members',                              'created_by',          'SET NULL'),
    ('members_user_id_fkey',                                  'members',                              'user_id',             'SET NULL'),
    ('organization_users_user_id_fkey',                       'organization_users',                   'user_id',             'CASCADE'),
    ('platform_announcements_created_by_fkey',                'platform_announcements',               'created_by',          'SET NULL'),
    ('prayer_requests_created_by_fkey',                       'prayer_requests',                      'created_by',          'SET NULL'),
    ('prayer_requests_user_id_fkey',                          'prayer_requests',                      'user_id',             'SET NULL'),
    ('profiles_user_id_fkey',                                 'profiles',                             'user_id',             'CASCADE'),
    ('recommendation_letters_approved_by_fkey',               'recommendation_letters',               'approved_by',         'SET NULL'),
    ('recommendation_letters_reviewed_by_fkey',               'recommendation_letters',               'reviewed_by',         'SET NULL'),
    ('schedules_created_by_fkey',                             'schedules',                            'created_by',          'NO ACTION'),
    ('transactions_created_by_fkey',                          'transactions',                         'created_by',          'SET NULL'),
    ('transactions_responsible_id_fkey',                      'transactions',                         'responsible_id',      'SET NULL'),
    ('transactions_updated_by_fkey',                          'transactions',                         'updated_by',          'SET NULL'),
    ('transactions_user_id_fkey',                             'transactions',                         'user_id',             'CASCADE'),
    ('user_roles_user_id_fkey',                               'user_roles',                           'user_id',             'CASCADE'),
    ('worship_setlists_created_by_fkey',                      'worship_setlists',                     'created_by',          'SET NULL'),
    ('worship_songs_created_by_fkey',                         'worship_songs',                        'created_by',          'SET NULL'),
    ('members_civil_document_validated_by_fkey',              'members',                              'civil_document_validated_by', 'SET NULL'),
    ('organization_responsibles_assigned_by_fkey',            'organization_responsibles',            'assigned_by',         'SET NULL'),
    ('organization_responsibles_user_id_fkey',                'organization_responsibles',            'user_id',             'CASCADE'),
    ('platform_support_agent_departments_agent_user_id_fkey', 'platform_support_agent_departments',   'agent_user_id',       'CASCADE'),
    ('platform_support_agent_presence_user_id_fkey',          'platform_support_agent_presence',      'user_id',             'CASCADE'),
    ('platform_support_agents_user_id_fkey',                  'platform_support_agents',              'user_id',             'CASCADE'),
    ('platform_support_audit_logs_actor_user_id_fkey',        'platform_support_audit_logs',          'actor_user_id',       'CASCADE'),
    ('platform_support_ticket_events_actor_user_id_fkey',     'platform_support_ticket_events',       'actor_user_id',       'SET NULL'),
    ('platform_support_tickets_assigned_to_user_id_fkey',     'platform_support_tickets',             'assigned_to_user_id', 'SET NULL'),
    ('platform_support_tickets_opened_by_user_id_fkey',       'platform_support_tickets',             'opened_by_user_id',   'SET NULL');

  IF (SELECT count(*) FROM _reconcile_expected_fks) <> v_constraints_esperadas THEN
    RAISE EXCEPTION 'Preflight: conjunto autoritativo deveria ter % constraints, tem %',
      v_constraints_esperadas, (SELECT count(*) FROM _reconcile_expected_fks);
  END IF;

  -- ── FASE 3 (passo 2): todas as 49 tabelas precisam existir ─────────────────
  FOR fk IN SELECT * FROM _reconcile_expected_fks ORDER BY name LOOP
    IF to_regclass('public.' || fk.tbl) IS NULL THEN
      v_issues := v_issues || format('tabela public.%s ausente (constraint %s)', fk.tbl, fk.name);
      v_skip_table := v_skip_table || fk.name;
    END IF;
  END LOOP;

  -- ── FASE 3 (passo 3): todas as 49 colunas de origem precisam existir ───────
  -- (pulando as constraints cuja tabela já está confirmada ausente, para
  -- evitar erro em cascata — o problema já foi registrado no passo anterior)
  FOR fk IN SELECT * FROM _reconcile_expected_fks WHERE name <> ALL (v_skip_table) ORDER BY name LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = fk.tbl AND column_name = fk.col
    ) THEN
      v_issues := v_issues || format('coluna public.%s.%s ausente (constraint %s)', fk.tbl, fk.col, fk.name);
      v_skip_column := v_skip_column || fk.name;
    END IF;
  END LOOP;

  -- ── FASE 3 (passo 4) / FASE 4: toda constraint já existente precisa ter a ──
  -- definição EXATA esperada (tabela de origem, coluna de origem via conkey,
  -- auth.users(id) via confkey, uma única coluna em cada lado, ON DELETE,
  -- ON UPDATE = NO ACTION, MATCH SIMPLE, NOT DEFERRABLE)
  FOR fk IN
    SELECT * FROM _reconcile_expected_fks
    WHERE name <> ALL (v_skip_table) AND name <> ALL (v_skip_column)
    ORDER BY name
  LOOP
    SELECT c.* INTO con
      FROM pg_constraint c
      WHERE c.conname = fk.name AND c.conrelid = ('public.' || fk.tbl)::regclass;

    IF FOUND THEN
      SELECT a.attnum INTO v_attnum_src
        FROM pg_attribute a
        WHERE a.attrelid = ('public.' || fk.tbl)::regclass AND a.attname = fk.col AND NOT a.attisdropped;

      SELECT a.attnum INTO v_attnum_dst
        FROM pg_attribute a
        WHERE a.attrelid = 'auth.users'::regclass AND a.attname = 'id' AND NOT a.attisdropped;

      v_expected_delcode := CASE fk.del
        WHEN 'CASCADE'   THEN 'c'
        WHEN 'SET NULL'  THEN 'n'
        WHEN 'NO ACTION' THEN 'a'
      END;

      IF con.contype <> 'f'
         OR con.conrelid <> ('public.' || fk.tbl)::regclass
         OR con.confrelid <> 'auth.users'::regclass
         OR con.conkey <> ARRAY[v_attnum_src]
         OR con.confkey <> ARRAY[v_attnum_dst]
         OR array_length(con.conkey, 1) <> 1
         OR array_length(con.confkey, 1) <> 1
         OR con.confdeltype <> v_expected_delcode
         OR con.confupdtype <> 'a'
         OR con.confmatchtype <> 's'
         OR con.condeferrable <> false
         OR con.condeferred <> false
      THEN
        v_issues := v_issues || format(
          'constraint %s já existe em public.%s com definição incompatível (esperado: coluna=%s, destino=auth.users(id), on_delete=%s, on_update=no action, match simple, not deferrable)',
          fk.name, fk.tbl, fk.col, fk.del
        );
      END IF;
    END IF;
  END LOOP;

  -- ── FASE 3 (passo 5): órfãos em todas as 49 relações ───────────────────────
  FOR fk IN
    SELECT * FROM _reconcile_expected_fks
    WHERE name <> ALL (v_skip_table) AND name <> ALL (v_skip_column)
    ORDER BY name
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I t WHERE t.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.%I)',
      fk.tbl, fk.col, fk.col
    ) INTO v_orphan_count;

    IF v_orphan_count > 0 THEN
      v_issues := v_issues || format(
        'constraint=%s tabela=public.%s coluna=%s orfaos=%s', fk.name, fk.tbl, fk.col, v_orphan_count
      );
    END IF;
  END LOOP;

  -- ── FASE 3 (passo 6): abortar se qualquer problema foi encontrado ──────────
  -- em qualquer uma das fases acima, antes de qualquer ALTER TABLE.
  IF array_length(v_issues, 1) > 0 THEN
    RAISE EXCEPTION 'Preflight reprovado (%/% problema(s)) — nenhuma constraint foi alterada: %',
      array_length(v_issues, 1), v_constraints_esperadas, array_to_string(v_issues, ' || ');
  END IF;

  -- ── FASE 3 (passo 7) / FASE 5: preflight aprovado — agora, e só agora, ─────
  -- criar as constraints ausentes e validar todas.
  FOR fk IN SELECT * FROM _reconcile_expected_fks ORDER BY name LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = fk.name AND conrelid = ('public.' || fk.tbl)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE %s NOT VALID',
        fk.tbl, fk.name, fk.col, fk.del
      );
    END IF;

    EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', fk.tbl, fk.name);

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = fk.name AND conrelid = ('public.' || fk.tbl)::regclass AND convalidated
    ) THEN
      RAISE EXCEPTION 'Verificação: % não ficou validada (convalidated=false) após VALIDATE CONSTRAINT', fk.name;
    END IF;
  END LOOP;

  -- ── FASE 6: verificação final antes do COMMIT ──────────────────────────────
  SELECT count(*) INTO v_constraints_presentes
    FROM _reconcile_expected_fks e
    JOIN pg_constraint c ON c.conname = e.name AND c.conrelid = ('public.' || e.tbl)::regclass
    JOIN pg_attribute asrc ON asrc.attrelid = c.conrelid AND asrc.attnum = c.conkey[1]
    JOIN pg_attribute adst ON adst.attrelid = c.confrelid AND adst.attnum = c.confkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = 'auth.users'::regclass
      AND array_length(c.conkey, 1) = 1
      AND array_length(c.confkey, 1) = 1
      AND asrc.attname = e.col
      AND adst.attname = 'id';

  SELECT count(*) INTO v_constraints_validadas
    FROM _reconcile_expected_fks e
    JOIN pg_constraint c ON c.conname = e.name AND c.conrelid = ('public.' || e.tbl)::regclass
    JOIN pg_attribute asrc ON asrc.attrelid = c.conrelid AND asrc.attnum = c.conkey[1]
    JOIN pg_attribute adst ON adst.attrelid = c.confrelid AND adst.attnum = c.confkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = 'auth.users'::regclass
      AND array_length(c.conkey, 1) = 1
      AND array_length(c.confkey, 1) = 1
      AND asrc.attname = e.col
      AND adst.attname = 'id'
      AND c.convalidated;

  IF v_constraints_presentes <> v_constraints_esperadas OR v_constraints_validadas <> v_constraints_esperadas THEN
    RAISE EXCEPTION
      'Verificação final: esperado % constraints presentes/validadas (nome+tabela+coluna+destino), obtido presentes=%, validadas=%',
      v_constraints_esperadas, v_constraints_presentes, v_constraints_validadas;
  END IF;

  SELECT count(*) INTO v_org_count_after FROM public.organizations;
  IF v_org_count_after <> v_org_count_before THEN
    RAISE EXCEPTION
      'Verificação final: contagem de organizations mudou (% -> %) — esta migration nunca deveria alterar organizations',
      v_org_count_before, v_org_count_after;
  END IF;

  IF to_regprocedure('public.finalize_member_invite_activation(text,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'Verificação final: finalize_member_invite_activation ainda presente (deveria ter sido removida)';
  END IF;

  IF to_regprocedure('public.join_organization_by_slug(text)') IS NOT NULL THEN
    RAISE EXCEPTION 'Verificação final: join_organization_by_slug ainda presente (deveria ter sido removida)';
  END IF;

  IF to_regprocedure('public.is_platform_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Verificação final: is_platform_admin ausente';
  END IF;

  SELECT lower(pg_get_functiondef('public.is_platform_admin(uuid)'::regprocedure)) INTO v_func_def;
  IF v_func_def NOT LIKE '%public.super_admins%'
     OR v_func_def LIKE '%public.profiles%'
     OR v_func_def LIKE '%public.user_roles%' THEN
    RAISE EXCEPTION 'Verificação final: is_platform_admin não está baseada exclusivamente em public.super_admins';
  END IF;

  IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN
    SELECT lower(pg_get_functiondef('public.handle_new_user()'::regprocedure)) INTO v_func_def;
    IF position('raw_user_meta_data->>''platform_role''' IN v_func_def) > 0
       OR position('raw_user_meta_data->''platform_role''' IN v_func_def) > 0 THEN
      RAISE EXCEPTION 'Verificação final: handle_new_user ainda aceita platform_role vindo de raw_user_meta_data (cliente)';
    END IF;
  END IF;

  RAISE NOTICE 'reconcile_common_management_integrity: % constraints presentes e validadas (nome+tabela+coluna+destino), organizations preservada (%), autoridade e funções inseguras conferidas ✓',
    v_constraints_presentes, v_org_count_after;
END;
$reconcile_common_management_integrity$;

-- ── FASE 7: SELECT final (fora do DO, dados recomputados de forma independente) ─
SELECT jsonb_build_object(
  'ok', true,
  'migration', '20260716110000_reconcile_common_management_integrity',
  'ambiente_alvo', 'common_structure',
  'constraints_esperadas', 49,
  'constraints_presentes', (
    SELECT count(*)
    FROM _reconcile_expected_fks e
    JOIN pg_constraint c ON c.conname = e.name AND c.conrelid = ('public.' || e.tbl)::regclass
    JOIN pg_attribute asrc ON asrc.attrelid = c.conrelid AND asrc.attnum = c.conkey[1]
    JOIN pg_attribute adst ON adst.attrelid = c.confrelid AND adst.attnum = c.confkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = 'auth.users'::regclass
      AND array_length(c.conkey, 1) = 1
      AND array_length(c.confkey, 1) = 1
      AND asrc.attname = e.col
      AND adst.attname = 'id'
  ),
  'constraints_validadas', (
    SELECT count(*)
    FROM _reconcile_expected_fks e
    JOIN pg_constraint c ON c.conname = e.name AND c.conrelid = ('public.' || e.tbl)::regclass
    JOIN pg_attribute asrc ON asrc.attrelid = c.conrelid AND asrc.attnum = c.conkey[1]
    JOIN pg_attribute adst ON adst.attrelid = c.confrelid AND adst.attnum = c.confkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = 'auth.users'::regclass
      AND array_length(c.conkey, 1) = 1
      AND array_length(c.confkey, 1) = 1
      AND asrc.attname = e.col
      AND adst.attname = 'id'
      AND c.convalidated
  ),
  'organizations_preservadas', (SELECT count(*) FROM public.organizations),
  'finalize_inseguro_ausente', to_regprocedure('public.finalize_member_invite_activation(text,uuid)') IS NULL,
  'join_slug_ausente', to_regprocedure('public.join_organization_by_slug(text)') IS NULL,
  'autoridade_endurecida', (
    to_regprocedure('public.is_platform_admin(uuid)') IS NOT NULL
    AND lower(pg_get_functiondef('public.is_platform_admin(uuid)'::regprocedure)) LIKE '%public.super_admins%'
  )
) AS reconcile_common_management_integrity_result;

COMMIT;
