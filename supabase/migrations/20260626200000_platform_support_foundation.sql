-- ============================================================
-- Migration: platform_support_foundation
-- Data: 2026-06-26
-- ============================================================
-- Fundação completa de suporte da plataforma Ecclesia.
--
-- Tabelas:
--   platform_support_agents       — agentes de suporte da plataforma
--   platform_support_tickets      — chamados abertos por organizações
--   platform_support_ticket_events — eventos/histórico de chamado
--   platform_support_agent_presence — presença/status dos agentes
--   platform_support_audit_logs   — auditoria de ações de suporte
--   platform_support_permissions  — matriz de permissões por perfil/módulo
--
-- REGRA: Não aplicar automaticamente. Executar manualmente no Supabase.
-- ============================================================

-- ── 1. platform_support_agents ───────────────────────────────────────────────
-- Perfis de agentes de suporte da plataforma.
-- Um agente pode ser super_admin, platform_admin, ou support_*.

CREATE TABLE IF NOT EXISTS public.platform_support_agents (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform_role   text        NOT NULL,
  display_name    text,
  area_notes      text,
  is_active       boolean     NOT NULL DEFAULT true,
  current_status  text        NOT NULL DEFAULT 'offline',
  last_seen_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_support_agent_user UNIQUE (user_id),
  CONSTRAINT chk_platform_role CHECK (platform_role IN (
    'super_admin', 'platform_admin',
    'support_secretaria', 'support_financeiro', 'support_culto_louvor',
    'support_tecnico', 'support_implantacao', 'support_readonly'
  )),
  CONSTRAINT chk_current_status CHECK (current_status IN (
    'online', 'offline', 'busy', 'away', 'in_ticket', 'in_call'
  ))
);

COMMENT ON TABLE public.platform_support_agents IS
  'Agentes de suporte da plataforma Ecclesia. Cada agente tem perfil/role de plataforma.
   platform_role deve espelhar profiles.platform_role.
   current_status é atualizado pelo frontend via upsert periódico.';

CREATE INDEX IF NOT EXISTS idx_support_agents_user     ON public.platform_support_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_support_agents_role     ON public.platform_support_agents(platform_role);
CREATE INDEX IF NOT EXISTS idx_support_agents_active   ON public.platform_support_agents(is_active, current_status);

ALTER TABLE public.platform_support_agents ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer agente ativo da plataforma
CREATE POLICY "support_agents select" ON public.platform_support_agents
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR auth.uid() = user_id
  );

-- Escrita: super_admin/platform_admin gerem; agente gere só o próprio status
CREATE POLICY "support_agents insert" ON public.platform_support_agents
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "support_agents update" ON public.platform_support_agents
  FOR UPDATE TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR auth.uid() = user_id
  );

CREATE POLICY "support_agents delete" ON public.platform_support_agents
  FOR DELETE TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- ── 2. platform_support_tickets ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_support_tickets (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  opened_by_user_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to_user_id  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  department           text        NOT NULL DEFAULT 'geral',
  module_key           text,
  title                text        NOT NULL,
  description          text,
  status               text        NOT NULL DEFAULT 'open',
  priority             text        NOT NULL DEFAULT 'normal',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  closed_at            timestamptz,
  CONSTRAINT chk_ticket_status CHECK (status IN (
    'open', 'assigned', 'in_progress', 'waiting_church',
    'waiting_support', 'resolved', 'closed', 'escalated'
  )),
  CONSTRAINT chk_ticket_priority CHECK (priority IN (
    'low', 'normal', 'high', 'urgent'
  )),
  CONSTRAINT chk_ticket_department CHECK (department IN (
    'geral', 'secretaria', 'financeiro', 'culto_louvor',
    'tecnico', 'implantacao', 'administracao'
  ))
);

COMMENT ON TABLE public.platform_support_tickets IS
  'Chamados de suporte abertos por organizações para a equipe da plataforma.
   Ciclo: open → assigned → in_progress → resolved → closed
   Escalation: qualquer status → escalated → reassigned';

CREATE INDEX IF NOT EXISTS idx_tickets_org         ON public.platform_support_tickets(organization_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee    ON public.platform_support_tickets(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status      ON public.platform_support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority    ON public.platform_support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_dept        ON public.platform_support_tickets(department);
CREATE INDEX IF NOT EXISTS idx_tickets_created     ON public.platform_support_tickets(created_at DESC);

ALTER TABLE public.platform_support_tickets ENABLE ROW LEVEL SECURITY;

-- Igreja pode criar e ver seus próprios chamados
CREATE POLICY "tickets org read" ON public.platform_support_tickets
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.can_read_organization(auth.uid(), organization_id)
  );

CREATE POLICY "tickets org insert" ON public.platform_support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR public.can_read_organization(auth.uid(), organization_id)
  );

CREATE POLICY "tickets platform update" ON public.platform_support_tickets
  FOR UPDATE TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.can_read_organization(auth.uid(), organization_id)
  );

-- ── 3. platform_support_ticket_events ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_support_ticket_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     uuid        NOT NULL REFERENCES public.platform_support_tickets(id) ON DELETE CASCADE,
  actor_user_id uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type    text        NOT NULL,
  message       text,
  metadata      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_event_type CHECK (event_type IN (
    'created', 'assigned', 'accepted', 'transferred', 'escalated',
    'status_changed', 'priority_changed', 'commented', 'resolved', 'closed', 'reopened'
  ))
);

COMMENT ON TABLE public.platform_support_ticket_events IS
  'Histórico completo de eventos por chamado. Imutável — nunca deletar/atualizar.';

CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket ON public.platform_support_ticket_events(ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_events_actor  ON public.platform_support_ticket_events(actor_user_id);

ALTER TABLE public.platform_support_ticket_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket_events read" ON public.platform_support_ticket_events
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.platform_support_tickets t
      WHERE t.id = ticket_id
        AND public.can_read_organization(auth.uid(), t.organization_id)
    )
  );

CREATE POLICY "ticket_events insert" ON public.platform_support_ticket_events
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.platform_support_tickets t
      WHERE t.id = ticket_id
        AND public.can_read_organization(auth.uid(), t.organization_id)
    )
  );

-- ── 4. platform_support_agent_presence ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_support_agent_presence (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     text        NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at   timestamptz,
  metadata   jsonb,
  CONSTRAINT chk_presence_status CHECK (status IN (
    'online', 'offline', 'busy', 'away', 'in_ticket', 'in_call'
  ))
);

COMMENT ON TABLE public.platform_support_agent_presence IS
  'Histórico de presença/status de cada agente. Append-only para auditoria.
   Cada mudança de status cria uma nova linha com ended_at preenchendo a anterior.';

CREATE INDEX IF NOT EXISTS idx_presence_user    ON public.platform_support_agent_presence(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_presence_status  ON public.platform_support_agent_presence(status, ended_at);

ALTER TABLE public.platform_support_agent_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "presence read" ON public.platform_support_agent_presence
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR auth.uid() = user_id
  );

CREATE POLICY "presence insert" ON public.platform_support_agent_presence
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_platform_admin(auth.uid()));

CREATE POLICY "presence update" ON public.platform_support_agent_presence
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_platform_admin(auth.uid()));

-- ── 5. platform_support_audit_logs ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_support_audit_logs (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_platform_role     text,
  target_organization_id  uuid        REFERENCES public.organizations(id) ON DELETE SET NULL,
  ticket_id               uuid        REFERENCES public.platform_support_tickets(id) ON DELETE SET NULL,
  module_key              text,
  action                  text        NOT NULL,
  entity_table            text,
  entity_id               uuid,
  metadata                jsonb,
  created_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_support_audit_logs IS
  'Auditoria imutável de ações de suporte da plataforma.
   Eventos principais: support_context_selected, support_context_cleared,
   support_module_accessed, support_access_denied, support_ticket_*.
   Append-only — nunca deletar/atualizar.';

CREATE INDEX IF NOT EXISTS idx_audit_actor   ON public.platform_support_audit_logs(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_org     ON public.platform_support_audit_logs(target_organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_action  ON public.platform_support_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_ticket  ON public.platform_support_audit_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.platform_support_audit_logs(created_at DESC);

ALTER TABLE public.platform_support_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit read" ON public.platform_support_audit_logs
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR auth.uid() = actor_user_id
  );

CREATE POLICY "audit insert" ON public.platform_support_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = actor_user_id);

-- ── 6. platform_support_permissions ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_support_permissions (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_role  text    NOT NULL,
  module_key     text    NOT NULL,
  can_view       boolean NOT NULL DEFAULT false,
  can_create     boolean NOT NULL DEFAULT false,
  can_edit       boolean NOT NULL DEFAULT false,
  can_delete     boolean NOT NULL DEFAULT false,
  can_manage     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_support_perm UNIQUE (platform_role, module_key)
);

COMMENT ON TABLE public.platform_support_permissions IS
  'Matriz de permissões de suporte da plataforma por perfil/módulo.
   Esta tabela é referência — a validação executável está em platformSupportPermissions.ts.
   Pode ser migrada para consulta runtime em versão futura.';

-- Seed: Super Admin — acesso total
INSERT INTO public.platform_support_permissions (platform_role, module_key, can_view, can_create, can_edit, can_delete, can_manage)
SELECT 'super_admin', module_key, true, true, true, true, true
FROM unnest(ARRAY[
  'dashboard','conversas','biblia','culto_louvor','campanhas',
  'secretaria','membros','carteira_membros','cartas_recomendacao',
  'solicitacoes','documentos','comunicacao','agenda','escalas',
  'pequenos_grupos','assembleia_geral','financeiro','relatorios',
  'comunidade','marketplace','unidades_locais','gerenciador_acesso',
  'configuracoes','auditoria','suporte'
]) AS module_key
ON CONFLICT (platform_role, module_key) DO NOTHING;

-- Seed: Platform Admin — acesso amplo
INSERT INTO public.platform_support_permissions (platform_role, module_key, can_view, can_create, can_edit, can_delete, can_manage)
SELECT 'platform_admin', module_key, true, true, true,
  CASE WHEN module_key IN ('configuracoes', 'auditoria') THEN false ELSE true END,
  CASE WHEN module_key IN ('configuracoes') THEN false ELSE true END
FROM unnest(ARRAY[
  'dashboard','conversas','biblia','culto_louvor','campanhas',
  'secretaria','membros','carteira_membros','cartas_recomendacao',
  'solicitacoes','documentos','comunicacao','agenda','escalas',
  'pequenos_grupos','assembleia_geral','financeiro','relatorios',
  'comunidade','marketplace','unidades_locais','gerenciador_acesso',
  'configuracoes','auditoria','suporte'
]) AS module_key
ON CONFLICT (platform_role, module_key) DO NOTHING;

-- Seed: support_secretaria
INSERT INTO public.platform_support_permissions (platform_role, module_key, can_view, can_create, can_edit, can_delete, can_manage)
VALUES
  ('support_secretaria','dashboard',           true,  false, false, false, false),
  ('support_secretaria','secretaria',          true,  true,  true,  false, false),
  ('support_secretaria','membros',             true,  true,  true,  false, false),
  ('support_secretaria','carteira_membros',    true,  false, false, false, false),
  ('support_secretaria','cartas_recomendacao', true,  true,  true,  false, false),
  ('support_secretaria','solicitacoes',        true,  true,  true,  false, false),
  ('support_secretaria','documentos',          true,  true,  true,  false, false),
  ('support_secretaria','comunicacao',         true,  true,  true,  false, false),
  ('support_secretaria','agenda',              true,  true,  true,  false, false),
  ('support_secretaria','escalas',             true,  true,  true,  false, false),
  ('support_secretaria','pequenos_grupos',     true,  true,  true,  false, false),
  ('support_secretaria','assembleia_geral',    true,  true,  true,  false, false),
  ('support_secretaria','conversas',           true,  true,  true,  false, false),
  ('support_secretaria','suporte',             true,  false, false, false, false)
ON CONFLICT (platform_role, module_key) DO NOTHING;

-- Seed: support_financeiro
INSERT INTO public.platform_support_permissions (platform_role, module_key, can_view, can_create, can_edit, can_delete, can_manage)
VALUES
  ('support_financeiro','dashboard',   true,  false, false, false, false),
  ('support_financeiro','financeiro',  true,  true,  true,  false, false),
  ('support_financeiro','relatorios',  true,  false, false, false, false),
  ('support_financeiro','membros',     true,  false, false, false, false),
  ('support_financeiro','conversas',   true,  true,  true,  false, false),
  ('support_financeiro','suporte',     true,  false, false, false, false)
ON CONFLICT (platform_role, module_key) DO NOTHING;

-- Seed: support_culto_louvor
INSERT INTO public.platform_support_permissions (platform_role, module_key, can_view, can_create, can_edit, can_delete, can_manage)
VALUES
  ('support_culto_louvor','dashboard',    true,  false, false, false, false),
  ('support_culto_louvor','culto_louvor', true,  true,  true,  false, false),
  ('support_culto_louvor','campanhas',    true,  true,  true,  false, false),
  ('support_culto_louvor','escalas',      true,  true,  true,  false, false),
  ('support_culto_louvor','conversas',    true,  true,  true,  false, false),
  ('support_culto_louvor','suporte',      true,  false, false, false, false)
ON CONFLICT (platform_role, module_key) DO NOTHING;

-- Seed: support_tecnico
INSERT INTO public.platform_support_permissions (platform_role, module_key, can_view, can_create, can_edit, can_delete, can_manage)
VALUES
  ('support_tecnico','dashboard',        true,  false, false, false, false),
  ('support_tecnico','unidades_locais',  true,  true,  true,  false, false),
  ('support_tecnico','configuracoes',    true,  true,  true,  false, false),
  ('support_tecnico','auditoria',        true,  false, false, false, false),
  ('support_tecnico','conversas',        true,  true,  true,  false, false),
  ('support_tecnico','suporte',          true,  false, false, false, false)
ON CONFLICT (platform_role, module_key) DO NOTHING;

-- Seed: support_implantacao
INSERT INTO public.platform_support_permissions (platform_role, module_key, can_view, can_create, can_edit, can_delete, can_manage)
VALUES
  ('support_implantacao','dashboard',        true,  false, false, false, false),
  ('support_implantacao','unidades_locais',  true,  true,  true,  false, false),
  ('support_implantacao','secretaria',       true,  true,  true,  false, false),
  ('support_implantacao','membros',          true,  true,  true,  false, false),
  ('support_implantacao','documentos',       true,  true,  true,  false, false),
  ('support_implantacao','gerenciador_acesso',true, true,  true,  false, false),
  ('support_implantacao','conversas',        true,  true,  true,  false, false),
  ('support_implantacao','suporte',          true,  false, false, false, false)
ON CONFLICT (platform_role, module_key) DO NOTHING;

-- Seed: support_readonly
INSERT INTO public.platform_support_permissions (platform_role, module_key, can_view, can_create, can_edit, can_delete, can_manage)
SELECT 'support_readonly', module_key, true, false, false, false, false
FROM unnest(ARRAY[
  'dashboard','conversas','biblia','culto_louvor','campanhas',
  'secretaria','membros','carteira_membros','cartas_recomendacao',
  'solicitacoes','documentos','comunicacao','agenda','escalas',
  'pequenos_grupos','assembleia_geral','financeiro','relatorios',
  'comunidade','marketplace','unidades_locais','suporte'
]) AS module_key
ON CONFLICT (platform_role, module_key) DO NOTHING;

ALTER TABLE public.platform_support_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "permissions read" ON public.platform_support_permissions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "permissions manage" ON public.platform_support_permissions
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- ── Finalização ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '==========================================================';
  RAISE NOTICE 'platform_support_foundation aplicada!';
  RAISE NOTICE '';
  RAISE NOTICE 'Tabelas criadas:';
  RAISE NOTICE '  platform_support_agents       (agentes da plataforma)';
  RAISE NOTICE '  platform_support_tickets       (chamados)';
  RAISE NOTICE '  platform_support_ticket_events (histórico de chamados)';
  RAISE NOTICE '  platform_support_agent_presence (presença/status)';
  RAISE NOTICE '  platform_support_audit_logs    (auditoria)';
  RAISE NOTICE '  platform_support_permissions   (matriz de permissões)';
  RAISE NOTICE '';
  RAISE NOTICE 'Perfis de suporte registrados:';
  RAISE NOTICE '  super_admin, platform_admin, support_secretaria,';
  RAISE NOTICE '  support_financeiro, support_culto_louvor,';
  RAISE NOTICE '  support_tecnico, support_implantacao, support_readonly';
  RAISE NOTICE '==========================================================';
END $$;
