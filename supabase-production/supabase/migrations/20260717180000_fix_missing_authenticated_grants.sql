-- ============================================================================
-- Migration: fix_missing_authenticated_grants
-- Timestamp: 20260717180000 (posterior a 20260716130000, a mais recente
-- registrada nos dois workdirs em 2026-07-17)
-- ============================================================================
--
-- OBJETIVO
-- Corrigir uma falha de GRANT de nível de tabela detectada em produção em
-- 2026-07-17 durante investigação de um incidente real: usuários autenticados
-- recebiam "permission denied for table user_roles" (42501/HTTP 403) ao abrir
-- o aplicativo, o que o bootstrap de sessão (src/hooks/useAuthBootstrap.ts)
-- corretamente tratava como falha real (não como "sem função/vínculo") e
-- exibia a tela de erro "Não foi possível confirmar sua sessão".
--
-- CAUSA RAIZ
-- 43 tabelas em public já tinham Row Level Security habilitado e policies
-- corretas para o papel "authenticated" (e, em duas tabelas, também para
-- "anon"), mas nunca receberam o GRANT de tabela correspondente. Sem esse
-- GRANT de base, o PostgreSQL bloqueia a consulta antes de chegar a avaliar
-- qualquer policy de RLS — por isso o erro era "permission denied" (falha de
-- permissão), não simplesmente "0 linhas" (que seria o comportamento normal
-- de uma policy de RLS restritiva). Auditoria em 2026-07-17 confirmou que
-- staging (qkiiwopkbcslquyfhdec) NÃO tem esta falha — é exclusiva de
-- produção (zsonukpxahaxffugavfu). O GRANT é reaplicado aqui em ambos os
-- workdirs apenas para manter os dois ambientes estruturalmente idênticos;
-- em staging esta migration é um no-op comprovado pelo preflight.
--
-- ESCOPO
-- Esta migration NÃO cria tabelas, NÃO altera nenhuma policy de RLS
-- existente, NÃO insere/atualiza/exclui dados, e NÃO concede nenhum
-- privilégio que não estivesse já implicitamente autorizado por uma policy
-- de RLS ativa para o mesmo papel. Ela apenas GRANTa, tabela a tabela, os
-- comandos (SELECT/INSERT/UPDATE/DELETE) que já têm policy correspondente
-- para "authenticated" (e, quando aplicável, "anon"), conforme auditoria
-- direta do catálogo (pg_policies) feita antes de qualquer GRANT.
--
-- public.member_validation_tokens foi auditada e excluída deliberadamente:
-- tem RLS habilitado e ZERO policies (para qualquer papel), ou seja, é
-- acessível apenas por funções SECURITY DEFINER (que rodam como o owner da
-- tabela, ignorando GRANTs) — esse é o desenho intencional da tabela de
-- tokens de validação, não uma falha a corrigir.
--
-- ============================================================================

BEGIN;

DO $fix_missing_authenticated_grants$
DECLARE
  t                      record;
  v_tables_esperadas     int := 43;
  v_tables_corrigidas    int := 0;
  v_tables_sem_grant_pos int;
  v_anon_pendente        int;
BEGIN
  -- ── Preflight: cada tabela alvo precisa existir, ter RLS habilitado e ────
  -- ter ao menos uma policy para "authenticated" cobrindo SELECT (ou ALL).
  -- Se qualquer uma dessas condições falhar para qualquer tabela, a migration
  -- aborta inteira sem conceder nenhum GRANT — nunca concede acesso "as
  -- ciegas" a uma tabela que não tenha sido auditada.
  FOR t IN
    SELECT * FROM (VALUES
      ('access_invites'), ('administrative_requests'), ('assemblies'),
      ('assembly_attachments'), ('campaign_contributions'), ('campaign_media'),
      ('campaign_updates'), ('campaigns'), ('church_asaas_integrations'),
      ('communications'), ('documents'), ('events'),
      ('finance_account_categories'), ('finance_accounting_groups'),
      ('finance_accounts'), ('finance_cost_centers'),
      ('finance_document_types'), ('finance_import_batches'),
      ('finance_monthly_closings'), ('finance_transaction_audit_logs'),
      ('group_members'), ('group_messages'), ('groups'),
      ('internal_message_attachments'), ('internal_messages'),
      ('internal_threads'), ('organization_affiliations'),
      ('organization_hierarchy_rules'), ('platform_announcements'),
      ('platform_support_agent_departments'),
      ('platform_support_agent_presence'), ('platform_support_agents'),
      ('platform_support_audit_logs'), ('platform_support_departments'),
      ('platform_support_permissions'), ('platform_support_ticket_events'),
      ('platform_support_tickets'), ('prayer_requests'),
      ('recommendation_letters'), ('schedule_assignments'), ('schedules'),
      ('user_roles'), ('worship_setlists'), ('worship_songs')
    ) AS x(tbl)
  LOOP
    IF to_regclass('public.' || t.tbl) IS NULL THEN
      RAISE EXCEPTION 'Preflight: tabela public.% ausente — abortando sem conceder nenhum GRANT', t.tbl;
    END IF;

    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t.tbl)::regclass) THEN
      RAISE EXCEPTION 'Preflight: public.% não tem RLS habilitado — abortando sem conceder nenhum GRANT', t.tbl;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t.tbl
        AND 'authenticated' = ANY(roles)
        AND cmd IN ('SELECT', 'ALL')
    ) THEN
      RAISE EXCEPTION 'Preflight: public.% não tem policy de SELECT/ALL para authenticated — abortando sem conceder nenhum GRANT', t.tbl;
    END IF;
  END LOOP;

  -- ── GRANT: authenticated ganha exatamente SELECT/INSERT/UPDATE/DELETE, ────
  -- já limitado linha-a-linha pelas policies de RLS auditadas na FASE acima.
  GRANT SELECT, INSERT, UPDATE, DELETE ON
    public.access_invites, public.administrative_requests, public.assemblies,
    public.assembly_attachments, public.campaign_contributions,
    public.campaign_media, public.campaign_updates, public.campaigns,
    public.church_asaas_integrations, public.communications, public.documents,
    public.events, public.finance_account_categories,
    public.finance_accounting_groups, public.finance_accounts,
    public.finance_cost_centers, public.finance_document_types,
    public.finance_import_batches, public.finance_monthly_closings,
    public.finance_transaction_audit_logs, public.group_members,
    public.group_messages, public.groups, public.internal_message_attachments,
    public.internal_messages, public.internal_threads,
    public.organization_affiliations, public.organization_hierarchy_rules,
    public.platform_announcements, public.platform_support_agent_departments,
    public.platform_support_agent_presence, public.platform_support_agents,
    public.platform_support_audit_logs, public.platform_support_departments,
    public.platform_support_permissions, public.platform_support_ticket_events,
    public.platform_support_tickets, public.prayer_requests,
    public.recommendation_letters, public.schedule_assignments,
    public.schedules, public.user_roles, public.worship_setlists,
    public.worship_songs
  TO authenticated;

  -- ── GRANT: apenas as 2 tabelas com policy explícita para "anon" ───────────
  -- (auditoria confirmou nenhuma outra tabela desta lista tem policy anon).
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'platform_announcements' AND 'anon' = ANY(roles)
  ) THEN
    GRANT SELECT ON public.platform_announcements TO anon;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'recommendation_letters' AND 'anon' = ANY(roles)
  ) THEN
    GRANT SELECT ON public.recommendation_letters TO anon;
  END IF;

  -- ── Verificação final: nenhuma das 43 tabelas pode continuar sem SELECT ──
  -- para authenticated depois do GRANT acima.
  SELECT count(*) INTO v_tables_sem_grant_pos
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relname IN (
      'access_invites','administrative_requests','assemblies','assembly_attachments',
      'campaign_contributions','campaign_media','campaign_updates','campaigns',
      'church_asaas_integrations','communications','documents','events',
      'finance_account_categories','finance_accounting_groups','finance_accounts',
      'finance_cost_centers','finance_document_types','finance_import_batches',
      'finance_monthly_closings','finance_transaction_audit_logs','group_members',
      'group_messages','groups','internal_message_attachments','internal_messages',
      'internal_threads','organization_affiliations','organization_hierarchy_rules',
      'platform_announcements','platform_support_agent_departments',
      'platform_support_agent_presence','platform_support_agents',
      'platform_support_audit_logs','platform_support_departments',
      'platform_support_permissions','platform_support_ticket_events',
      'platform_support_tickets','prayer_requests','recommendation_letters',
      'schedule_assignments','schedules','user_roles','worship_setlists','worship_songs'
    )
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.role_table_grants g
      WHERE g.table_schema = 'public' AND g.table_name = c.relname
        AND g.grantee = 'authenticated' AND g.privilege_type = 'SELECT'
    );

  IF v_tables_sem_grant_pos <> 0 THEN
    RAISE EXCEPTION 'Verificação final: % tabela(s) ainda sem GRANT SELECT para authenticated após a correção', v_tables_sem_grant_pos;
  END IF;

  SELECT count(*) INTO v_anon_pendente
  FROM (VALUES ('platform_announcements'), ('recommendation_letters')) AS x(tbl)
  WHERE EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = x.tbl AND 'anon' = ANY(roles)
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants g
    WHERE g.table_schema = 'public' AND g.table_name = x.tbl
      AND g.grantee = 'anon' AND g.privilege_type = 'SELECT'
  );

  IF v_anon_pendente <> 0 THEN
    RAISE EXCEPTION 'Verificação final: % tabela(s) com policy anon ainda sem GRANT SELECT para anon após a correção', v_anon_pendente;
  END IF;

  v_tables_corrigidas := v_tables_esperadas - v_tables_sem_grant_pos;

  RAISE NOTICE 'fix_missing_authenticated_grants: % de % tabelas confirmadas com GRANT correto para authenticated (member_validation_tokens excluída deliberadamente) ✓',
    v_tables_corrigidas, v_tables_esperadas;
END;
$fix_missing_authenticated_grants$;

-- ── SELECT final (fora do DO, recomputado de forma independente) ───────────
SELECT jsonb_build_object(
  'ok', true,
  'migration', '20260717180000_fix_missing_authenticated_grants',
  'ambiente_alvo', 'common_structure',
  'tabelas_esperadas', 43,
  'tabelas_com_grant_authenticated', (
    SELECT count(*)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname IN (
        'access_invites','administrative_requests','assemblies','assembly_attachments',
        'campaign_contributions','campaign_media','campaign_updates','campaigns',
        'church_asaas_integrations','communications','documents','events',
        'finance_account_categories','finance_accounting_groups','finance_accounts',
        'finance_cost_centers','finance_document_types','finance_import_batches',
        'finance_monthly_closings','finance_transaction_audit_logs','group_members',
        'group_messages','groups','internal_message_attachments','internal_messages',
        'internal_threads','organization_affiliations','organization_hierarchy_rules',
        'platform_announcements','platform_support_agent_departments',
        'platform_support_agent_presence','platform_support_agents',
        'platform_support_audit_logs','platform_support_departments',
        'platform_support_permissions','platform_support_ticket_events',
        'platform_support_tickets','prayer_requests','recommendation_letters',
        'schedule_assignments','schedules','user_roles','worship_setlists','worship_songs'
      )
      AND EXISTS (
        SELECT 1 FROM information_schema.role_table_grants g
        WHERE g.table_schema = 'public' AND g.table_name = c.relname
          AND g.grantee = 'authenticated' AND g.privilege_type = 'SELECT'
      )
  ),
  'tabelas_com_grant_anon', (
    SELECT count(*)
    FROM (VALUES ('platform_announcements'), ('recommendation_letters')) AS x(tbl)
    WHERE EXISTS (
      SELECT 1 FROM information_schema.role_table_grants g
      WHERE g.table_schema = 'public' AND g.table_name = x.tbl
        AND g.grantee = 'anon' AND g.privilege_type = 'SELECT'
    )
  ),
  'organizations_preservadas', (SELECT count(*) FROM public.organizations)
) AS resultado;

COMMIT;
