-- ============================================================================
-- Migration: reconcile_common_management_integrity
-- Timestamp: 20260716110000 (posterior ao baseline de produção 20260715170000)
-- ============================================================================
--
-- OBJETIVO
-- Substituir a promoção em bloco de 33 arquivos históricos de staging para o
-- workdir executável de produção (commit c94024e, revertida pela mesma tarefa
-- que introduziu este arquivo) por uma única migration forward-only, comum a
-- staging e produção, idempotente e com preflight fail-closed.
--
-- Esta migration reconcilia exclusivamente FOREIGN KEYs de auditoria/autoria
-- que referenciam auth.users(id) e que uma auditoria externa encontrou
-- presentes em staging e ausentes em produção. Ela NÃO cria tabelas, NÃO
-- insere/atualiza/exclui dados, NÃO recria políticas antigas nem funções
-- inseguras, e NÃO toca em organizations, membros, usuários, mensagens ou
-- registros financeiros — apenas adiciona (quando ausente e sem órfãos) ou
-- valida (quando já presente) as constraints listadas abaixo.
--
-- ---------------------------------------------------------------------------
-- DIVERGÊNCIA ENCONTRADA EM RELAÇÃO À LISTA "AUTORITATIVA" DE 49 CONSTRAINTS
-- ---------------------------------------------------------------------------
-- A tarefa que originou este arquivo forneceu uma lista de exatamente 49
-- nomes de constraint como "conjunto autoritativo", com a instrução explícita
-- de nunca inventar uma definição sem origem. Ao extrair as definições reais
-- de `supabase/migrations/`, 10 dos 49 nomes não puderam ser verificados:
--
--   1. members_civil_document_validated_by_fkey — nenhuma coluna
--      `civil_document_validated_by` existe em `members` em nenhuma migration
--      rastreada, nem há qualquer referência no restante do repositório.
--   2. organization_responsibles_assigned_by_fkey — a tabela
--      `organization_responsibles` não existe em nenhuma migration rastreada
--      nem é referenciada em nenhum arquivo do repositório.
--   3. organization_responsibles_user_id_fkey — mesmo caso do item 2.
--   4–10. platform_support_agent_departments_agent_user_id_fkey,
--      platform_support_agent_presence_user_id_fkey,
--      platform_support_agents_user_id_fkey,
--      platform_support_audit_logs_actor_user_id_fkey,
--      platform_support_ticket_events_actor_user_id_fkey,
--      platform_support_tickets_assigned_to_user_id_fkey,
--      platform_support_tickets_opened_by_user_id_fkey — as tabelas
--      `platform_support_*` SÃO usadas de fato pelo frontend (ver
--      src/pages/SuperAdmin.tsx, src/pages/GerenciarAcessos.tsx,
--      src/lib/platformSupportAudit.ts, todas com `as any` — sinal de tabela
--      sem tipos gerados), mas nenhuma migration em `supabase/migrations/`
--      cria essas tabelas. Não há como extrair a definição exata (ON DELETE)
--      de uma origem que não existe no código rastreado.
--
-- Seguindo a instrução explícita "não invente outras constraints" e "copie a
-- definição exata da origem", este arquivo reconcilia apenas as 39 constraints
-- com origem verificável abaixo. As 10 acima exigem decisão humana: ou (a)
-- localizar/commitar a migration original que criou essas tabelas antes de
-- reconciliar suas FKs, ou (b) confirmar que a lista de 49 continha um erro.
-- Ver relatório de entrega desta tarefa para o texto completo desta análise.
--
-- ---------------------------------------------------------------------------
-- SOBRE TABELAS DE MÓDULOS AINDA NÃO PROMOVIDOS (Campanhas, Culto & Louvor)
-- ---------------------------------------------------------------------------
-- 7 das 39 constraints abaixo pertencem a tabelas de módulos classificados em
-- supabase/migration-manifest.json como "staging_feature"/"mixed_needs_split"
-- (Campanhas, Culto & Louvor) — ou seja, ainda não promovidos formalmente para
-- produção. O preflight desta migration (FASE 3) verifica a existência de
-- cada tabela ANTES de qualquer ALTER; se uma dessas tabelas ainda não existir
-- no banco de destino (ex.: produção, antes da promoção formal do módulo), a
-- transação inteira aborta com RAISE EXCEPTION identificando exatamente qual
-- tabela está ausente — nunca falha silenciosamente, nunca cria a tabela.
-- Isso é intencional: esta mesma migration poderá ser reexecutada com sucesso
-- depois que o módulo correspondente for promovido, sem precisar de edição.
--
-- ============================================================================

BEGIN;

DO $reconcile_common_management_integrity$
DECLARE
  fk               record;
  org_count_before bigint;
  org_count_after  bigint;
  orphan_count     bigint;
  existing_confrelid regclass;
  existing_deltype   text;
  func_def           text;
  constraints_esperadas int;
  constraints_presentes int := 0;
  constraints_validadas int := 0;
BEGIN
  -- ── FASE 3 (parte 1): preflight de pré-condições globais ──────────────────
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Preflight: auth.users ausente — abortando sem alterar nada';
  END IF;

  IF to_regclass('public.organizations') IS NULL THEN
    RAISE EXCEPTION 'Preflight: public.organizations ausente — abortando sem alterar nada';
  END IF;

  SELECT count(*) INTO org_count_before FROM public.organizations;

  -- ── FASE 4: as 39 constraints com origem verificada em supabase/migrations ─
  -- (nome da constraint, tabela, coluna, ação ON DELETE — copiados
  -- literalmente da migration original que criou cada coluna)
  FOR fk IN
    SELECT * FROM (VALUES
      ('access_invites_accepted_user_id_fkey',            'access_invites',                'accepted_user_id', 'SET NULL'),
      ('access_invites_invited_by_fkey',                  'access_invites',                'invited_by',       'SET NULL'),
      ('administrative_requests_assigned_to_fkey',        'administrative_requests',        'assigned_to',      'SET NULL'),
      ('assemblies_created_by_fkey',                      'assemblies',                     'created_by',       'SET NULL'),
      ('campaign_contributions_contributed_by_fkey',      'campaign_contributions',         'contributed_by',   'SET NULL'),
      ('campaign_media_uploaded_by_fkey',                 'campaign_media',                 'uploaded_by',      'SET NULL'),
      ('campaign_updates_created_by_fkey',                'campaign_updates',               'created_by',       'SET NULL'),
      ('campaigns_approved_by_fkey',                      'campaigns',                      'approved_by',      'SET NULL'),
      ('campaigns_created_by_fkey',                       'campaigns',                      'created_by',       'SET NULL'),
      ('communications_created_by_fkey',                  'communications',                 'created_by',       'SET NULL'),
      ('documents_created_by_fkey',                       'documents',                      'created_by',       'SET NULL'),
      ('events_created_by_fkey',                          'events',                         'created_by',       'SET NULL'),
      ('finance_monthly_closings_closed_by_fkey',         'finance_monthly_closings',        'closed_by',        'SET NULL'),
      ('finance_transaction_audit_logs_changed_by_fkey',  'finance_transaction_audit_logs',  'changed_by',       'SET NULL'),
      ('group_messages_author_user_id_fkey',              'group_messages',                 'author_user_id',   'CASCADE'),
      ('groups_created_by_fkey',                          'groups',                         'created_by',       'SET NULL'),
      ('internal_message_attachments_uploaded_by_fkey',   'internal_message_attachments',   'uploaded_by',      'SET NULL'),
      ('internal_messages_sender_user_id_fkey',           'internal_messages',              'sender_user_id',   'SET NULL'),
      ('internal_threads_assigned_to_fkey',                'internal_threads',              'assigned_to',      'SET NULL'),
      ('internal_threads_created_by_fkey',                'internal_threads',               'created_by',       'SET NULL'),
      ('member_invites_accepted_user_id_fkey',            'member_invites',                 'accepted_user_id', 'SET NULL'),
      ('member_invites_invited_by_fkey',                  'member_invites',                 'invited_by',       'SET NULL'),
      ('members_created_by_fkey',                         'members',                        'created_by',       'SET NULL'),
      ('members_user_id_fkey',                             'members',                        'user_id',          'CASCADE'),
      ('organization_users_user_id_fkey',                 'organization_users',             'user_id',          'CASCADE'),
      ('platform_announcements_created_by_fkey',          'platform_announcements',          'created_by',       'SET NULL'),
      ('prayer_requests_created_by_fkey',                  'prayer_requests',                'created_by',       'SET NULL'),
      ('prayer_requests_user_id_fkey',                     'prayer_requests',                'user_id',          'SET NULL'),
      ('profiles_user_id_fkey',                            'profiles',                       'user_id',          'CASCADE'),
      ('recommendation_letters_approved_by_fkey',          'recommendation_letters',          'approved_by',      'SET NULL'),
      ('recommendation_letters_reviewed_by_fkey',          'recommendation_letters',          'reviewed_by',      'SET NULL'),
      ('schedules_created_by_fkey',                        'schedules',                      'created_by',       'SET NULL'),
      ('transactions_created_by_fkey',                     'transactions',                   'created_by',       'SET NULL'),
      ('transactions_responsible_id_fkey',                 'transactions',                   'responsible_id',   'SET NULL'),
      ('transactions_updated_by_fkey',                     'transactions',                   'updated_by',       'SET NULL'),
      ('transactions_user_id_fkey',                        'transactions',                   'user_id',          'CASCADE'),
      ('user_roles_user_id_fkey',                          'user_roles',                     'user_id',          'CASCADE'),
      ('worship_setlists_created_by_fkey',                 'worship_setlists',               'created_by',       'SET NULL'),
      ('worship_songs_created_by_fkey',                    'worship_songs',                  'created_by',       'SET NULL')
    ) AS t(name, tbl, col, del)
  LOOP
    -- FASE 3 (parte 2): preflight por constraint — tabela e coluna precisam existir
    IF to_regclass('public.' || fk.tbl) IS NULL THEN
      RAISE EXCEPTION 'Preflight: tabela public.% ausente — necessária para %', fk.tbl, fk.name;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = fk.tbl AND column_name = fk.col
    ) THEN
      RAISE EXCEPTION 'Preflight: coluna public.%.% ausente — necessária para %', fk.tbl, fk.col, fk.name;
    END IF;

    -- A constraint já existe? Comparar com a definição esperada.
    SELECT c.confrelid::regclass,
           CASE c.confdeltype
             WHEN 'c' THEN 'CASCADE'
             WHEN 'n' THEN 'SET NULL'
             WHEN 'd' THEN 'SET DEFAULT'
             WHEN 'r' THEN 'RESTRICT'
             ELSE 'NO ACTION'
           END
      INTO existing_confrelid, existing_deltype
      FROM pg_constraint c
      WHERE c.conname = fk.name
        AND c.conrelid = ('public.' || fk.tbl)::regclass
        AND c.contype = 'f';

    IF existing_confrelid IS NOT NULL THEN
      IF existing_confrelid <> 'auth.users'::regclass OR existing_deltype <> fk.del THEN
        RAISE EXCEPTION
          'Preflight: % já existe com definição diferente da esperada (destino=%, on_delete=% — esperado destino=auth.users, on_delete=%)',
          fk.name, existing_confrelid, existing_deltype, fk.del;
      END IF;

      -- Já existe com a definição correta — garantir que está validada e seguir.
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = fk.name AND conrelid = ('public.' || fk.tbl)::regclass AND convalidated
      ) THEN
        EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', fk.tbl, fk.name);
      END IF;

      constraints_presentes := constraints_presentes + 1;
      constraints_validadas := constraints_validadas + 1;
      CONTINUE;
    END IF;

    -- Não existe ainda: verificar órfãos antes de criar (fail-closed).
    EXECUTE format(
      'SELECT count(*) FROM public.%I t WHERE t.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.%I)',
      fk.tbl, fk.col, fk.col
    ) INTO orphan_count;

    IF orphan_count > 0 THEN
      RAISE EXCEPTION
        'Preflight: % registro(s) órfão(s) em public.%.% impedem a criação de % — nenhuma alteração de dados foi feita',
        orphan_count, fk.tbl, fk.col, fk.name;
    END IF;

    -- Sem órfãos: criar NOT VALID e validar em seguida (evita lock longo).
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE %s NOT VALID',
      fk.tbl, fk.name, fk.col, fk.del
    );
    EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', fk.tbl, fk.name);

    constraints_presentes := constraints_presentes + 1;
    constraints_validadas := constraints_validadas + 1;
  END LOOP;

  constraints_esperadas := 39;

  -- ── FASE 5: verificação final antes do COMMIT ──────────────────────────────
  IF constraints_presentes <> constraints_esperadas OR constraints_validadas <> constraints_esperadas THEN
    RAISE EXCEPTION
      'Verificação final: esperado % constraints presentes/validadas, obtido presentes=%, validadas=%',
      constraints_esperadas, constraints_presentes, constraints_validadas;
  END IF;

  SELECT count(*) INTO org_count_after FROM public.organizations;
  IF org_count_after <> org_count_before THEN
    RAISE EXCEPTION
      'Verificação final: contagem de organizations mudou (% -> %) — esta migration nunca deveria alterar organizations',
      org_count_before, org_count_after;
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

  SELECT lower(pg_get_functiondef('public.is_platform_admin(uuid)'::regprocedure)) INTO func_def;
  IF func_def NOT LIKE '%public.super_admins%'
     OR func_def LIKE '%public.profiles%'
     OR func_def LIKE '%public.user_roles%' THEN
    RAISE EXCEPTION 'Verificação final: is_platform_admin não está baseada exclusivamente em public.super_admins';
  END IF;

  IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN
    SELECT lower(pg_get_functiondef('public.handle_new_user()'::regprocedure)) INTO func_def;
    IF position('raw_user_meta_data->>''platform_role''' IN func_def) > 0
       OR position('raw_user_meta_data->''platform_role''' IN func_def) > 0 THEN
      RAISE EXCEPTION 'Verificação final: handle_new_user ainda aceita platform_role vindo de raw_user_meta_data (cliente)';
    END IF;
  END IF;

  RAISE NOTICE 'reconcile_common_management_integrity: % constraints presentes e validadas, organizations preservada (%), autoridade e funções inseguras conferidas ✓',
    constraints_presentes, org_count_after;
END;
$reconcile_common_management_integrity$;

-- ── SELECT final (fora do DO, dados recomputados de forma independente) ────
SELECT jsonb_build_object(
  'ok', true,
  'migration', '20260716110000_reconcile_common_management_integrity',
  'constraints_esperadas', 39,
  'constraints_presentes', (
    SELECT count(*) FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid = 'auth.users'::regclass
      AND c.conname IN (
        'access_invites_accepted_user_id_fkey', 'access_invites_invited_by_fkey',
        'administrative_requests_assigned_to_fkey', 'assemblies_created_by_fkey',
        'campaign_contributions_contributed_by_fkey', 'campaign_media_uploaded_by_fkey',
        'campaign_updates_created_by_fkey', 'campaigns_approved_by_fkey', 'campaigns_created_by_fkey',
        'communications_created_by_fkey', 'documents_created_by_fkey', 'events_created_by_fkey',
        'finance_monthly_closings_closed_by_fkey', 'finance_transaction_audit_logs_changed_by_fkey',
        'group_messages_author_user_id_fkey', 'groups_created_by_fkey',
        'internal_message_attachments_uploaded_by_fkey', 'internal_messages_sender_user_id_fkey',
        'internal_threads_assigned_to_fkey', 'internal_threads_created_by_fkey',
        'member_invites_accepted_user_id_fkey', 'member_invites_invited_by_fkey',
        'members_created_by_fkey', 'members_user_id_fkey', 'organization_users_user_id_fkey',
        'platform_announcements_created_by_fkey', 'prayer_requests_created_by_fkey',
        'prayer_requests_user_id_fkey', 'profiles_user_id_fkey',
        'recommendation_letters_approved_by_fkey', 'recommendation_letters_reviewed_by_fkey',
        'schedules_created_by_fkey', 'transactions_created_by_fkey', 'transactions_responsible_id_fkey',
        'transactions_updated_by_fkey', 'transactions_user_id_fkey', 'user_roles_user_id_fkey',
        'worship_setlists_created_by_fkey', 'worship_songs_created_by_fkey'
      )
  ),
  'constraints_validadas', (
    SELECT count(*) FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid = 'auth.users'::regclass
      AND c.convalidated
      AND c.conname IN (
        'access_invites_accepted_user_id_fkey', 'access_invites_invited_by_fkey',
        'administrative_requests_assigned_to_fkey', 'assemblies_created_by_fkey',
        'campaign_contributions_contributed_by_fkey', 'campaign_media_uploaded_by_fkey',
        'campaign_updates_created_by_fkey', 'campaigns_approved_by_fkey', 'campaigns_created_by_fkey',
        'communications_created_by_fkey', 'documents_created_by_fkey', 'events_created_by_fkey',
        'finance_monthly_closings_closed_by_fkey', 'finance_transaction_audit_logs_changed_by_fkey',
        'group_messages_author_user_id_fkey', 'groups_created_by_fkey',
        'internal_message_attachments_uploaded_by_fkey', 'internal_messages_sender_user_id_fkey',
        'internal_threads_assigned_to_fkey', 'internal_threads_created_by_fkey',
        'member_invites_accepted_user_id_fkey', 'member_invites_invited_by_fkey',
        'members_created_by_fkey', 'members_user_id_fkey', 'organization_users_user_id_fkey',
        'platform_announcements_created_by_fkey', 'prayer_requests_created_by_fkey',
        'prayer_requests_user_id_fkey', 'profiles_user_id_fkey',
        'recommendation_letters_approved_by_fkey', 'recommendation_letters_reviewed_by_fkey',
        'schedules_created_by_fkey', 'transactions_created_by_fkey', 'transactions_responsible_id_fkey',
        'transactions_updated_by_fkey', 'transactions_user_id_fkey', 'user_roles_user_id_fkey',
        'worship_setlists_created_by_fkey', 'worship_songs_created_by_fkey'
      )
  ),
  'organizations_preservadas', (SELECT count(*) FROM public.organizations) IS NOT NULL,
  'finalize_inseguro_ausente', to_regprocedure('public.finalize_member_invite_activation(text,uuid)') IS NULL,
  'join_slug_ausente', to_regprocedure('public.join_organization_by_slug(text)') IS NULL,
  'autoridade_endurecida', (
    to_regprocedure('public.is_platform_admin(uuid)') IS NOT NULL
    AND lower(pg_get_functiondef('public.is_platform_admin(uuid)'::regprocedure)) LIKE '%public.super_admins%'
  )
) AS reconcile_common_management_integrity_result;

COMMIT;
