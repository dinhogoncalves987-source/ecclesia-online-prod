-- =============================================================================
-- Gerenciador de Acessos hierárquico e cumulativo
--
-- Esta migration é comum aos bancos de TESTE/STAGING e PRODUÇÃO. Ela altera
-- somente estrutura, catálogo de permissões e autorizações já existentes; não
-- cria dados de demonstração e nunca altera `members.member_role`.
--
-- Princípios:
--   1. todo usuário continua tendo uma identidade-base de membro;
--   2. responsabilidades são cumulativas e vinculadas a uma unidade;
--   3. função eclesiástica não concede acesso ao aplicativo;
--   4. toda concessão/revogação passa por RPC SECURITY DEFINER;
--   5. a hierarquia é validada novamente no banco (fail closed).
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.organizations') IS NULL THEN
    v_missing := array_append(v_missing, 'public.organizations');
  END IF;
  IF to_regclass('public.organization_users') IS NULL THEN
    v_missing := array_append(v_missing, 'public.organization_users');
  END IF;
  IF to_regclass('public.members') IS NULL THEN
    v_missing := array_append(v_missing, 'public.members');
  END IF;
  IF to_regclass('public.profiles') IS NULL THEN
    v_missing := array_append(v_missing, 'public.profiles');
  END IF;
  IF to_regclass('public.access_invites') IS NULL THEN
    v_missing := array_append(v_missing, 'public.access_invites');
  END IF;
  IF to_regclass('public.member_invites') IS NULL THEN
    v_missing := array_append(v_missing, 'public.member_invites');
  END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'access architecture preflight failed; missing tables: %', array_to_string(v_missing, ', ');
  END IF;
END;
$$;

-- ── Catálogo central ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.access_responsibility_definitions (
  responsibility_type text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL,
  category text NOT NULL CHECK (category IN ('governance', 'secretariat', 'finance', 'operations', 'ministries')),
  permission_keys text[] NOT NULL DEFAULT ARRAY[]::text[],
  inherits_to_descendants boolean NOT NULL DEFAULT false,
  is_governance boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.access_responsibility_definitions (
  responsibility_type, label, description, category, permission_keys,
  inherits_to_descendants, is_governance, sort_order
)
VALUES
  ('church_admin', 'Administrador da unidade', 'Administração da unidade e de sua estrutura subordinada.', 'governance',
    ARRAY['access.manage','organization.manage','members.read','members.write','members.invite','finance.read','finance.write','finance.approve','documents.read','documents.write','agenda.read','agenda.write','communications.read','communications.write','groups.read','groups.manage','schedules.read','schedules.write','worship.read','worship.write','gatekeeper.use','requests.read','requests.manage','chat.secretaria'], true, true, 10),
  ('responsible_pastor', 'Pastor responsável', 'Responsabilidade pastoral e administrativa na unidade e em suas unidades subordinadas.', 'governance',
    ARRAY['access.manage','organization.manage','members.read','members.write','members.invite','finance.read','finance.write','finance.approve','documents.read','documents.write','agenda.read','agenda.write','communications.read','communications.write','groups.read','groups.manage','schedules.read','schedules.write','worship.read','worship.write','gatekeeper.use','requests.read','requests.manage','chat.secretaria'], true, true, 20),
  ('access_manager', 'Gestor de acessos', 'Delega trabalhos dentro do limite hierárquico recebido.', 'governance',
    ARRAY['access.manage','members.read'], true, true, 30),
  ('secretary', 'Secretário(a)', 'Opera membros, documentos, agenda, comunicação, solicitações e chat da secretaria.', 'secretariat',
    ARRAY['members.read','members.write','members.invite','documents.read','documents.write','agenda.read','agenda.write','communications.read','communications.write','requests.read','requests.manage','chat.secretaria'], false, false, 40),
  ('assistant_secretary', 'Subsecretário(a)', 'Apoia a secretaria em membros, documentos, agenda e solicitações.', 'secretariat',
    ARRAY['members.read','members.write','members.invite','documents.read','documents.write','agenda.read','agenda.write','requests.read','requests.manage','chat.secretaria'], false, false, 50),
  ('treasurer', 'Tesoureiro(a)', 'Opera e aprova o financeiro da unidade.', 'finance',
    ARRAY['finance.read','finance.write','finance.approve'], false, false, 60),
  ('assistant_treasurer', 'Subtesoureiro(a)', 'Apoia lançamentos financeiros sem aprovação final.', 'finance',
    ARRAY['finance.read','finance.write'], false, false, 70),
  ('accountant', 'Contador(a)', 'Consulta o financeiro e seus relatórios para conferência.', 'finance',
    ARRAY['finance.read'], false, false, 80),
  ('member_manager', 'Operador de membros', 'Trabalha exclusivamente no cadastro e na validação de membros.', 'secretariat',
    ARRAY['members.read','members.write','members.invite'], false, false, 90),
  ('documents_manager', 'Operador de documentos', 'Cria e organiza documentos da unidade.', 'operations',
    ARRAY['documents.read','documents.write'], false, false, 100),
  ('schedule_manager', 'Coordenador de agenda e escalas', 'Organiza agenda, eventos e escalas.', 'operations',
    ARRAY['agenda.read','agenda.write','schedules.read','schedules.write'], false, false, 110),
  ('communications_manager', 'Responsável por comunicação', 'Publica comunicados e administra a comunicação.', 'operations',
    ARRAY['communications.read','communications.write'], false, false, 120),
  ('worship_manager', 'Responsável por culto e louvor', 'Organiza repertórios, roteiros e recursos do culto.', 'ministries',
    ARRAY['worship.read','worship.write','schedules.read','schedules.write'], false, false, 130),
  ('group_manager', 'Coordenador de grupos e departamentos', 'Cria e coordena grupos e departamentos.', 'ministries',
    ARRAY['groups.read','groups.manage','schedules.read','schedules.write'], false, false, 140),
  ('gatekeeper', 'Porteiro / recepção', 'Valida a carteira e o QR Code de membros.', 'operations',
    ARRAY['gatekeeper.use','members.read'], false, false, 150),
  ('requests_manager', 'Operador de solicitações', 'Atende solicitações administrativas.', 'operations',
    ARRAY['requests.read','requests.manage','members.read'], false, false, 160)
ON CONFLICT (responsibility_type) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  permission_keys = EXCLUDED.permission_keys,
  inherits_to_descendants = EXCLUDED.inherits_to_descendants,
  is_governance = EXCLUDED.is_governance,
  is_active = true,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- A tabela já existe nos dois bancos reais; CREATE IF NOT EXISTS torna a
-- arquitetura reproduzível sem reescrever o histórico anterior.
CREATE TABLE IF NOT EXISTS public.organization_responsibles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  responsibility_type text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_responsibles_user_active
  ON public.organization_responsibles(user_id, organization_id)
  WHERE is_active;

DO $$
DECLARE
  v_duplicates text;
BEGIN
  SELECT string_agg(format('%s/%s/%s', organization_id, user_id, responsibility_type), ', ')
  INTO v_duplicates
  FROM (
    SELECT organization_id,
           user_id,
           CASE responsibility_type
             WHEN 'admin' THEN 'church_admin'
             WHEN 'pastor' THEN 'responsible_pastor'
             WHEN 'tesoureiro' THEN 'treasurer'
             WHEN 'contador' THEN 'accountant'
             WHEN 'leader' THEN 'group_manager'
             WHEN 'lider' THEN 'group_manager'
             WHEN 'porteiro' THEN 'gatekeeper'
             ELSE responsibility_type
           END AS responsibility_type
    FROM public.organization_responsibles
    WHERE is_active
    GROUP BY organization_id, user_id,
      CASE responsibility_type
        WHEN 'admin' THEN 'church_admin'
        WHEN 'pastor' THEN 'responsible_pastor'
        WHEN 'tesoureiro' THEN 'treasurer'
        WHEN 'contador' THEN 'accountant'
        WHEN 'leader' THEN 'group_manager'
        WHEN 'lider' THEN 'group_manager'
        WHEN 'porteiro' THEN 'gatekeeper'
        ELSE responsibility_type
      END
    HAVING count(*) > 1
  ) duplicated;

  IF v_duplicates IS NOT NULL THEN
    RAISE EXCEPTION 'access architecture preflight failed; duplicate active responsibilities: %', v_duplicates;
  END IF;
END;
$$;

-- O índice histórico permitia apenas uma pessoa ativa por função na unidade.
-- Subacessos exigem várias pessoas na mesma função; a unicidade correta é por
-- pessoa + unidade + responsabilidade.
DROP INDEX IF EXISTS public.idx_org_resp_unique_active;

UPDATE public.organization_responsibles
SET responsibility_type = CASE responsibility_type
      WHEN 'admin' THEN 'church_admin'
      WHEN 'pastor' THEN 'responsible_pastor'
      WHEN 'tesoureiro' THEN 'treasurer'
      WHEN 'contador' THEN 'accountant'
      WHEN 'leader' THEN 'group_manager'
      WHEN 'lider' THEN 'group_manager'
      WHEN 'porteiro' THEN 'gatekeeper'
      ELSE responsibility_type
    END,
    updated_at = now()
WHERE responsibility_type IN ('admin','pastor','tesoureiro','contador','leader','lider','porteiro');

CREATE UNIQUE INDEX IF NOT EXISTS organization_responsibles_one_active
  ON public.organization_responsibles(organization_id, user_id, responsibility_type)
  WHERE is_active;

CREATE TABLE IF NOT EXISTS public.organization_access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('grant', 'revoke', 'replace', 'invite_accept')),
  responsibility_types text[] NOT NULL DEFAULT ARRAY[]::text[],
  source text NOT NULL DEFAULT 'access_manager',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organization_access_audit_org_created
  ON public.organization_access_audit(organization_id, created_at DESC);

-- Convites carregam o conjunto cumulativo de responsabilidades e a unidade
-- alvo. As colunas legadas `role` permanecem como `member` por compatibilidade.
ALTER TABLE public.access_invites
  ADD COLUMN IF NOT EXISTS responsibility_types text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE public.member_invites
  ADD COLUMN IF NOT EXISTS target_organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS responsibility_types text[] NOT NULL DEFAULT ARRAY[]::text[];

-- Preserva convites administrativos antigos sem transformar um convite comum
-- de membro em autorização de trabalho.
UPDATE public.access_invites
SET responsibility_types = ARRAY[
  CASE role
    WHEN 'church_admin' THEN 'church_admin'
    WHEN 'admin' THEN 'church_admin'
    WHEN 'pastor' THEN 'responsible_pastor'
    WHEN 'secretary' THEN 'secretary'
    WHEN 'tesoureiro' THEN 'treasurer'
    WHEN 'contador' THEN 'accountant'
    WHEN 'leader' THEN 'group_manager'
    WHEN 'lider' THEN 'group_manager'
    WHEN 'porteiro' THEN 'gatekeeper'
  END
]
WHERE cardinality(responsibility_types) = 0
  AND role IN ('church_admin','admin','pastor','secretary','tesoureiro','contador','leader','lider','porteiro');

-- ── Hierarquia e autoridade ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_organization_descendant_or_self(
  _ancestor_id uuid,
  _candidate_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH RECURSIVE ancestry AS (
    SELECT o.id, o.parent_id, ARRAY[o.id]::uuid[] AS path
    FROM public.organizations o
    WHERE o.id = _candidate_id
    UNION ALL
    SELECT parent.id, parent.parent_id, ancestry.path || parent.id
    FROM public.organizations parent
    JOIN ancestry ON ancestry.parent_id = parent.id
    WHERE NOT parent.id = ANY(ancestry.path)
  )
  SELECT EXISTS (SELECT 1 FROM ancestry WHERE id = _ancestor_id);
$$;

CREATE OR REPLACE FUNCTION public.has_org_access_permission(
  _user_id uuid,
  _organization_id uuid,
  _permission_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_platform_admin(_user_id)
  OR EXISTS (
    SELECT 1
    FROM public.organization_responsibles responsible
    JOIN public.access_responsibility_definitions definition
      ON definition.responsibility_type = responsible.responsibility_type
     AND definition.is_active
    WHERE responsible.user_id = _user_id
      AND responsible.is_active
      AND _permission_key = ANY(definition.permission_keys)
      AND (
        responsible.organization_id = _organization_id
        OR (
          definition.inherits_to_descendants
          AND public.is_organization_descendant_or_self(responsible.organization_id, _organization_id)
        )
      )
  );
$$;

-- Compatibilidade das policies existentes com o novo modelo cumulativo.
CREATE OR REPLACE FUNCTION public.is_org_finance_reader(_user_id uuid, _organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_platform_admin(_user_id)
    OR public.has_org_access_permission(_user_id, _organization_id, 'finance.read')
    OR public.has_org_role(_user_id, _organization_id, ARRAY['admin','church_admin','tesoureiro','contador']);
$$;

CREATE OR REPLACE FUNCTION public.is_org_finance_writer(_user_id uuid, _organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_platform_admin(_user_id)
    OR public.has_org_access_permission(_user_id, _organization_id, 'finance.write')
    OR public.has_org_role(_user_id, _organization_id, ARRAY['admin','church_admin','tesoureiro']);
$$;

CREATE OR REPLACE FUNCTION public.is_internal_message_staff(_user_id uuid, _organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_platform_admin(_user_id)
    OR public.has_org_access_permission(_user_id, _organization_id, 'chat.secretaria')
    OR public.has_org_role(_user_id, _organization_id, ARRAY['admin','church_admin','leader','tesoureiro']);
$$;

CREATE OR REPLACE FUNCTION public.access_authority_organization(
  _user_id uuid,
  _target_organization_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH RECURSIVE ancestry AS (
    SELECT o.id, o.parent_id, 0 AS depth, ARRAY[o.id]::uuid[] AS path
    FROM public.organizations o
    WHERE o.id = _target_organization_id
    UNION ALL
    SELECT parent.id, parent.parent_id, ancestry.depth + 1, ancestry.path || parent.id
    FROM public.organizations parent
    JOIN ancestry ON ancestry.parent_id = parent.id
    WHERE NOT parent.id = ANY(ancestry.path)
  )
  SELECT ancestry.id
  FROM ancestry
  JOIN public.organization_responsibles responsible
    ON responsible.organization_id = ancestry.id
   AND responsible.user_id = _user_id
   AND responsible.is_active
  JOIN public.access_responsibility_definitions definition
    ON definition.responsibility_type = responsible.responsibility_type
   AND definition.is_active
   AND 'access.manage' = ANY(definition.permission_keys)
  WHERE ancestry.depth = 0 OR definition.inherits_to_descendants
  ORDER BY ancestry.depth
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_access_for_organization(
  _user_id uuid,
  _target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_platform_admin(_user_id)
    OR public.access_authority_organization(_user_id, _target_organization_id) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.member_is_in_organization_scope(
  _member_id uuid,
  _target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.members member
    WHERE member.id = _member_id
      AND (
        member.organization_id = _target_organization_id
        OR member.sector_id = _target_organization_id
        OR member.congregation_id = _target_organization_id
        OR (member.sector_id IS NOT NULL AND public.is_organization_descendant_or_self(_target_organization_id, member.sector_id))
        OR (member.congregation_id IS NOT NULL AND public.is_organization_descendant_or_self(_target_organization_id, member.congregation_id))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public._assert_access_grant_allowed(
  _actor_user_id uuid,
  _target_organization_id uuid,
  _responsibility_types text[],
  _target_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_authority_org uuid;
  v_requested_governance text[];
  v_existing_governance text[];
BEGIN
  IF _actor_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(_responsibility_types, ARRAY[]::text[])) requested
    LEFT JOIN public.access_responsibility_definitions definition
      ON definition.responsibility_type = requested
     AND definition.is_active
    WHERE definition.responsibility_type IS NULL
  ) THEN
    RAISE EXCEPTION 'invalid responsibility type';
  END IF;

  IF public.is_platform_admin(_actor_user_id) THEN
    RETURN;
  END IF;

  v_authority_org := public.access_authority_organization(_actor_user_id, _target_organization_id);
  IF v_authority_org IS NULL THEN
    RAISE EXCEPTION 'access denied for organization';
  END IF;

  IF v_authority_org = _target_organization_id THEN
    SELECT COALESCE(array_agg(requested ORDER BY requested), ARRAY[]::text[])
    INTO v_requested_governance
    FROM unnest(COALESCE(_responsibility_types, ARRAY[]::text[])) requested
    JOIN public.access_responsibility_definitions definition
      ON definition.responsibility_type = requested
    WHERE definition.is_governance;

    SELECT COALESCE(array_agg(responsible.responsibility_type ORDER BY responsible.responsibility_type), ARRAY[]::text[])
    INTO v_existing_governance
    FROM public.organization_responsibles responsible
    JOIN public.access_responsibility_definitions definition
      ON definition.responsibility_type = responsible.responsibility_type
     AND definition.is_governance
    WHERE responsible.organization_id = _target_organization_id
      AND responsible.user_id = _target_user_id
      AND responsible.is_active;

    IF v_requested_governance IS DISTINCT FROM v_existing_governance THEN
      RAISE EXCEPTION 'local manager cannot grant governance responsibility at the same level';
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._assert_access_grant_allowed(uuid, uuid, text[], uuid) FROM PUBLIC, anon, authenticated;

-- ── Aplicador interno atômico ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._apply_organization_responsibilities(
  _actor_user_id uuid,
  _target_user_id uuid,
  _organization_id uuid,
  _responsibility_types text[],
  _replace_existing boolean,
  _audit_source text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_requested text[];
  v_type text;
  v_reactivated_id uuid;
BEGIN
  v_requested := ARRAY(
    SELECT DISTINCT value
    FROM unnest(COALESCE(_responsibility_types, ARRAY[]::text[])) AS value
    WHERE value IS NOT NULL AND btrim(value) <> ''
    ORDER BY value
  );

  IF EXISTS (
    SELECT 1
    FROM unnest(v_requested) requested
    LEFT JOIN public.access_responsibility_definitions definition
      ON definition.responsibility_type = requested
     AND definition.is_active
    WHERE definition.responsibility_type IS NULL
  ) THEN
    RAISE EXCEPTION 'invalid responsibility type';
  END IF;

  -- Serializa concessões concorrentes da mesma pessoa na mesma unidade.
  PERFORM pg_advisory_xact_lock(hashtextextended(_organization_id::text || ':' || _target_user_id::text, 0));

  INSERT INTO public.organization_users (organization_id, user_id, role, is_active)
  VALUES (_organization_id, _target_user_id, 'member', true)
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET is_active = true, updated_at = now();

  IF _replace_existing THEN
    UPDATE public.organization_responsibles
    SET is_active = false, updated_at = now()
    WHERE organization_id = _organization_id
      AND user_id = _target_user_id
      AND is_active
      AND NOT (responsibility_type = ANY(v_requested));
  END IF;

  FOREACH v_type IN ARRAY v_requested LOOP
    v_reactivated_id := NULL;

    SELECT id INTO v_reactivated_id
    FROM public.organization_responsibles
    WHERE organization_id = _organization_id
      AND user_id = _target_user_id
      AND responsibility_type = v_type
      AND NOT is_active
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_reactivated_id IS NOT NULL THEN
      UPDATE public.organization_responsibles
      SET is_active = true,
          assigned_by = _actor_user_id,
          assigned_at = now(),
          updated_at = now()
      WHERE id = v_reactivated_id;
    ELSE
      INSERT INTO public.organization_responsibles (
        organization_id, responsibility_type, user_id, assigned_by, assigned_at, is_active
      )
      SELECT _organization_id, v_type, _target_user_id, _actor_user_id, now(), true
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.organization_responsibles existing
        WHERE existing.organization_id = _organization_id
          AND existing.user_id = _target_user_id
          AND existing.responsibility_type = v_type
          AND existing.is_active
      );
    END IF;
  END LOOP;

  INSERT INTO public.organization_access_audit (
    organization_id, target_user_id, actor_user_id, action,
    responsibility_types, source
  ) VALUES (
    _organization_id,
    _target_user_id,
    _actor_user_id,
    CASE WHEN _replace_existing THEN 'replace' ELSE 'grant' END,
    v_requested,
    COALESCE(NULLIF(_audit_source, ''), 'access_manager')
  );
END;
$$;

REVOKE ALL ON FUNCTION public._apply_organization_responsibilities(uuid, uuid, uuid, text[], boolean, text) FROM PUBLIC, anon, authenticated;

-- Converte papéis legados em responsabilidades iniciais sem apagar nem
-- sobrescrever qualquer vínculo. Depois desta migration, novas alterações são
-- feitas apenas pelas RPCs abaixo.
INSERT INTO public.organization_responsibles (
  organization_id, responsibility_type, user_id, assigned_by, assigned_at, is_active, notes
)
SELECT
  membership.organization_id,
  CASE membership.role
    WHEN 'admin' THEN 'church_admin'
    WHEN 'church_admin' THEN 'church_admin'
    WHEN 'pastor' THEN 'responsible_pastor'
    WHEN 'secretary' THEN 'secretary'
    WHEN 'tesoureiro' THEN 'treasurer'
    WHEN 'contador' THEN 'accountant'
    WHEN 'leader' THEN 'group_manager'
    WHEN 'lider' THEN 'group_manager'
    WHEN 'porteiro' THEN 'gatekeeper'
  END,
  membership.user_id,
  NULL,
  now(),
  true,
  'Migrado automaticamente do papel legado de organization_users'
FROM public.organization_users membership
WHERE membership.is_active
  AND membership.role IN ('admin','church_admin','pastor','secretary','tesoureiro','contador','leader','lider','porteiro')
  AND NOT EXISTS (
    SELECT 1
    FROM public.organization_responsibles existing
    WHERE existing.organization_id = membership.organization_id
      AND existing.user_id = membership.user_id
      AND existing.responsibility_type = CASE membership.role
        WHEN 'admin' THEN 'church_admin'
        WHEN 'church_admin' THEN 'church_admin'
        WHEN 'pastor' THEN 'responsible_pastor'
        WHEN 'secretary' THEN 'secretary'
        WHEN 'tesoureiro' THEN 'treasurer'
        WHEN 'contador' THEN 'accountant'
        WHEN 'leader' THEN 'group_manager'
        WHEN 'lider' THEN 'group_manager'
        WHEN 'porteiro' THEN 'gatekeeper'
      END
      AND existing.is_active
  );

-- ── RPCs do Gerenciador ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_list_organization_access(
  _target_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_access_for_organization(auth.uid(), _target_organization_id) THEN
    RAISE EXCEPTION 'access denied for organization';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.full_name), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      membership.id AS membership_id,
      membership.user_id,
      membership.is_active,
      membership.created_at,
      COALESCE(member.full_name, profile.full_name, profile.email, 'Usuário') AS full_name,
      profile.email,
      profile.avatar_url,
      member.id AS member_id,
      member.member_role AS ecclesiastical_role,
      COALESCE(
        ARRAY(
          SELECT responsible.responsibility_type
          FROM public.organization_responsibles responsible
          JOIN public.access_responsibility_definitions definition
            ON definition.responsibility_type = responsible.responsibility_type
          WHERE responsible.organization_id = _target_organization_id
            AND responsible.user_id = membership.user_id
            AND responsible.is_active
          ORDER BY definition.sort_order, responsible.responsibility_type
        ),
        ARRAY[]::text[]
      ) AS responsibility_types
    FROM public.organization_users membership
    LEFT JOIN public.profiles profile ON profile.user_id = membership.user_id
    LEFT JOIN LATERAL (
      SELECT candidate.id, candidate.full_name, candidate.member_role
      FROM public.members candidate
      WHERE candidate.user_id = membership.user_id
      ORDER BY
        CASE
          WHEN candidate.congregation_id = _target_organization_id THEN 0
          WHEN candidate.sector_id = _target_organization_id THEN 1
          WHEN candidate.organization_id = _target_organization_id THEN 2
          ELSE 3
        END,
        candidate.updated_at DESC NULLS LAST
      LIMIT 1
    ) member ON true
    WHERE membership.organization_id = _target_organization_id
      AND membership.is_active
  ) row_data;

  RETURN jsonb_build_object('ok', true, 'organization_id', _target_organization_id, 'users', v_result);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_search_members_for_access(
  _target_organization_id uuid,
  _query text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_access_for_organization(auth.uid(), _target_organization_id) THEN
    RAISE EXCEPTION 'access denied for organization';
  END IF;

  IF char_length(btrim(COALESCE(_query, ''))) < 2 THEN
    RETURN jsonb_build_object('ok', true, 'members', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.full_name), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      member.id,
      member.full_name,
      member.user_id,
      member.member_role AS ecclesiastical_role,
      member.status,
      member.photo_url,
      member.organization_id,
      member.sector_id,
      member.congregation_id,
      member.email
    FROM public.members member
    WHERE public.member_is_in_organization_scope(member.id, _target_organization_id)
      AND member.full_name ILIKE '%' || btrim(_query) || '%'
    ORDER BY member.full_name
    LIMIT 30
  ) row_data;

  RETURN jsonb_build_object('ok', true, 'members', v_result);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_hierarchy_responsibles(
  _organization_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR EXISTS (
    SELECT 1
    FROM unnest(COALESCE(_organization_ids, ARRAY[]::uuid[])) organization_id
    WHERE NOT public.can_manage_access_for_organization(auth.uid(), organization_id)
  ) THEN
    RAISE EXCEPTION 'access denied for one or more organizations';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.organization_id, row_data.status, row_data.full_name), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT responsible.organization_id,
           responsible.responsibility_type,
           'active'::text AS status,
           responsible.user_id,
           NULL::uuid AS invite_id,
           COALESCE(profile.full_name, profile.email, 'Usuário') AS full_name,
           profile.email
    FROM public.organization_responsibles responsible
    LEFT JOIN public.profiles profile ON profile.user_id = responsible.user_id
    WHERE responsible.organization_id = ANY(COALESCE(_organization_ids, ARRAY[]::uuid[]))
      AND responsible.is_active
      AND responsible.responsibility_type IN ('responsible_pastor','church_admin','secretary','treasurer')

    UNION ALL

    SELECT invite.organization_id,
           responsibility.responsibility_type,
           'pending'::text AS status,
           NULL::uuid AS user_id,
           invite.id AS invite_id,
           invite.full_name,
           invite.email
    FROM public.access_invites invite
    CROSS JOIN LATERAL unnest(invite.responsibility_types) responsibility(responsibility_type)
    WHERE invite.organization_id = ANY(COALESCE(_organization_ids, ARRAY[]::uuid[]))
      AND invite.status = 'pending'
      AND responsibility.responsibility_type IN ('responsible_pastor','church_admin','secretary','treasurer')
  ) row_data;

  RETURN jsonb_build_object('ok', true, 'responsibles', v_result);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_organization_responsibilities(
  _target_organization_id uuid,
  _target_user_id uuid,
  _responsibility_types text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_requested text[];
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _target_user_id) THEN
    RAISE EXCEPTION 'target user not found';
  END IF;

  v_requested := ARRAY(
    SELECT DISTINCT value
    FROM unnest(COALESCE(_responsibility_types, ARRAY[]::text[])) AS value
    WHERE value IS NOT NULL AND btrim(value) <> ''
    ORDER BY value
  );

  -- Uma autoridade local pode distribuir trabalhos internos, mas governança
  -- no mesmo nível só pode ser nomeada por autoridade superior/Super Admin.
  PERFORM public._assert_access_grant_allowed(v_actor, _target_organization_id, v_requested, _target_user_id);

  PERFORM public._apply_organization_responsibilities(
    v_actor, _target_user_id, _target_organization_id,
    v_requested, true, 'access_manager'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'organization_id', _target_organization_id,
    'user_id', _target_user_id,
    'responsibility_types', v_requested
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_member_access_invite(
  _member_id uuid,
  _target_organization_id uuid,
  _responsibility_types text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member record;
  v_invite public.member_invites%ROWTYPE;
BEGIN
  PERFORM public._assert_access_grant_allowed(auth.uid(), _target_organization_id, _responsibility_types, NULL);

  IF cardinality(COALESCE(_responsibility_types, ARRAY[]::text[])) = 0 THEN
    RAISE EXCEPTION 'at least one responsibility is required';
  END IF;

  IF NOT public.member_is_in_organization_scope(_member_id, _target_organization_id) THEN
    RAISE EXCEPTION 'member is outside organization scope';
  END IF;

  SELECT id, user_id, organization_id, sector_id, congregation_id, email
  INTO v_member
  FROM public.members
  WHERE id = _member_id
  FOR UPDATE;

  IF v_member.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'member already has login';
  END IF;
  IF v_member.email IS NULL OR btrim(v_member.email) = '' THEN
    RAISE EXCEPTION 'member email is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(_responsibility_types, ARRAY[]::text[])) requested
    LEFT JOIN public.access_responsibility_definitions definition
      ON definition.responsibility_type = requested AND definition.is_active
    WHERE definition.responsibility_type IS NULL
  ) THEN
    RAISE EXCEPTION 'invalid responsibility type';
  END IF;

  UPDATE public.member_invites
  SET status = 'revoked'
  WHERE member_id = _member_id
    AND target_organization_id = _target_organization_id
    AND status = 'pending';

  INSERT INTO public.member_invites (
    member_id, organization_id, sector_id, congregation_id, target_organization_id,
    invited_by, role, responsibility_types
  ) VALUES (
    v_member.id, v_member.organization_id, v_member.sector_id, v_member.congregation_id,
    _target_organization_id, auth.uid(), 'member', COALESCE(_responsibility_types, ARRAY[]::text[])
  )
  RETURNING * INTO v_invite;

  RETURN jsonb_build_object(
    'ok', true,
    'invite_id', v_invite.id,
    'token', v_invite.token,
    'expires_at', v_invite.expires_at,
    'email', v_member.email
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_external_access_invite(
  _target_organization_id uuid,
  _full_name text,
  _email text,
  _phone text,
  _responsibility_types text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invite public.access_invites%ROWTYPE;
BEGIN
  PERFORM public._assert_access_grant_allowed(auth.uid(), _target_organization_id, _responsibility_types, NULL);
  IF btrim(COALESCE(_full_name, '')) = '' OR btrim(COALESCE(_email, '')) = '' THEN
    RAISE EXCEPTION 'name and email are required';
  END IF;
  IF cardinality(COALESCE(_responsibility_types, ARRAY[]::text[])) = 0 THEN
    RAISE EXCEPTION 'at least one responsibility is required';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(_responsibility_types) requested
    LEFT JOIN public.access_responsibility_definitions definition
      ON definition.responsibility_type = requested AND definition.is_active
    WHERE definition.responsibility_type IS NULL
  ) THEN
    RAISE EXCEPTION 'invalid responsibility type';
  END IF;

  INSERT INTO public.access_invites (
    organization_id, invited_by, full_name, email, phone, role, responsibility_types
  ) VALUES (
    _target_organization_id, auth.uid(), btrim(_full_name), lower(btrim(_email)),
    NULLIF(btrim(COALESCE(_phone, '')), ''), 'member', _responsibility_types
  )
  RETURNING * INTO v_invite;

  RETURN jsonb_build_object(
    'ok', true,
    'invite_id', v_invite.id,
    'token', v_invite.token,
    'expires_at', v_invite.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_access_invites(
  _target_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_access_for_organization(auth.uid(), _target_organization_id) THEN
    RAISE EXCEPTION 'access denied for organization';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(invite) ORDER BY invite.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT id, token, organization_id, full_name, email, phone, status,
           expires_at, accepted_at, created_at, responsibility_types
    FROM public.access_invites
    WHERE organization_id = _target_organization_id
  ) invite;

  RETURN jsonb_build_object('ok', true, 'invites', v_result);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_access_invite(_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.access_invites
  WHERE id = _invite_id
  FOR UPDATE;

  IF v_org_id IS NULL OR auth.uid() IS NULL
     OR NOT public.can_manage_access_for_organization(auth.uid(), v_org_id) THEN
    RAISE EXCEPTION 'access denied for invite';
  END IF;

  UPDATE public.access_invites
  SET status = 'revoked'
  WHERE id = _invite_id AND status = 'pending';

  RETURN jsonb_build_object('ok', true, 'invite_id', _invite_id);
END;
$$;

-- ── Capacidades do usuário autenticado ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_access_capabilities()
RETURNS TABLE (
  organization_id uuid,
  source_organization_id uuid,
  responsibility_type text,
  permission_key text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH RECURSIVE direct_assignments AS (
    SELECT responsible.organization_id AS source_organization_id,
           responsible.responsibility_type,
           definition.permission_keys,
           definition.inherits_to_descendants
    FROM public.organization_responsibles responsible
    JOIN public.access_responsibility_definitions definition
      ON definition.responsibility_type = responsible.responsibility_type
     AND definition.is_active
    WHERE responsible.user_id = auth.uid()
      AND responsible.is_active
  ), expanded AS (
    SELECT assignment.source_organization_id AS organization_id,
           assignment.source_organization_id,
           assignment.responsibility_type,
           assignment.permission_keys,
           assignment.inherits_to_descendants,
           ARRAY[assignment.source_organization_id]::uuid[] AS path
    FROM direct_assignments assignment
    UNION ALL
    SELECT child.id,
           expanded.source_organization_id,
           expanded.responsibility_type,
           expanded.permission_keys,
           expanded.inherits_to_descendants,
           expanded.path || child.id
    FROM expanded
    JOIN public.organizations child ON child.parent_id = expanded.organization_id
    WHERE expanded.inherits_to_descendants
      AND child.active
      AND NOT child.id = ANY(expanded.path)
  )
  SELECT DISTINCT expanded.organization_id,
         expanded.source_organization_id,
         expanded.responsibility_type,
         permission.permission_key
  FROM expanded
  CROSS JOIN LATERAL unnest(expanded.permission_keys) permission(permission_key)

  UNION

  SELECT church_group.organization_id,
         church_group.organization_id,
         'group_leader'::text,
         'groups.read'::text
  FROM public.group_members group_membership
  JOIN public.members member ON member.id = group_membership.member_id
  JOIN public.groups church_group ON church_group.id = group_membership.group_id
  WHERE member.user_id = auth.uid()
    AND group_membership.role IN ('leader', 'co_leader')
    AND church_group.is_active;
$$;

-- ── Aceite seguro de convite externo ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_access_invite_by_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invite public.access_invites%ROWTYPE;
  v_org record;
BEGIN
  SELECT * INTO v_invite
  FROM public.access_invites
  WHERE token = _token
  LIMIT 1;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_invite.status = 'accepted' THEN RETURN jsonb_build_object('ok', false, 'error', 'already_accepted'); END IF;
  IF v_invite.status = 'revoked' THEN RETURN jsonb_build_object('ok', false, 'error', 'revoked'); END IF;
  IF v_invite.expires_at < now() THEN RETURN jsonb_build_object('ok', false, 'error', 'expired'); END IF;

  SELECT name, city, state INTO v_org
  FROM public.organizations WHERE id = v_invite.organization_id;

  RETURN jsonb_build_object(
    'ok', true,
    'invite_id', v_invite.id,
    'token', v_invite.token,
    'organization_id', v_invite.organization_id,
    'full_name', COALESCE(v_invite.full_name, ''),
    'email', COALESCE(v_invite.email, ''),
    'phone', COALESCE(v_invite.phone, ''),
    'role', COALESCE(v_invite.role, 'member'),
    'responsibility_types', v_invite.responsibility_types,
    'expires_at', v_invite.expires_at,
    'church_name', COALESCE(v_org.name, ''),
    'church_city', COALESCE(v_org.city, ''),
    'church_state', COALESCE(v_org.state, '')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_access_invite(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_auth_email text := lower(btrim(COALESCE(auth.email(), '')));
  v_invite public.access_invites%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;

  SELECT * INTO v_invite
  FROM public.access_invites
  WHERE token = _token
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_invite.status = 'accepted' THEN RETURN jsonb_build_object('ok', false, 'error', 'already_accepted'); END IF;
  IF v_invite.status IN ('revoked','expired') OR v_invite.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired_or_revoked');
  END IF;
  IF v_invite.email IS NULL OR btrim(v_invite.email) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_email_missing');
  END IF;
  IF v_auth_email = '' OR v_auth_email <> lower(btrim(v_invite.email)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_mismatch');
  END IF;

  PERFORM public._apply_organization_responsibilities(
    v_invite.invited_by,
    v_user_id,
    v_invite.organization_id,
    v_invite.responsibility_types,
    false,
    'external_invite'
  );

  UPDATE public.access_invites
  SET status = 'accepted', accepted_at = now(), accepted_user_id = v_user_id
  WHERE id = v_invite.id;

  INSERT INTO public.organization_access_audit (
    organization_id, target_user_id, actor_user_id, action,
    responsibility_types, source
  ) VALUES (
    v_invite.organization_id, v_user_id, v_invite.invited_by,
    'invite_accept', v_invite.responsibility_types, 'external_invite'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'organization_id', v_invite.organization_id,
    'role', 'member',
    'responsibility_types', v_invite.responsibility_types
  );
END;
$$;

-- ── Aceite seguro de membro existente sem login ─────────────────────────────

CREATE OR REPLACE FUNCTION public.get_member_invite_by_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invite public.member_invites%ROWTYPE;
  v_member record;
  v_org record;
  v_unit record;
BEGIN
  SELECT * INTO v_invite
  FROM public.member_invites
  WHERE token = _token
  LIMIT 1;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_invite.status = 'accepted' THEN RETURN jsonb_build_object('ok', false, 'error', 'already_accepted'); END IF;
  IF v_invite.status = 'revoked' THEN RETURN jsonb_build_object('ok', false, 'error', 'revoked'); END IF;
  IF v_invite.expires_at < now() THEN RETURN jsonb_build_object('ok', false, 'error', 'expired'); END IF;

  SELECT full_name, member_role, photo_url, email INTO v_member
  FROM public.members WHERE id = v_invite.member_id;
  SELECT name, city, state INTO v_org
  FROM public.organizations WHERE id = v_invite.organization_id;
  SELECT name INTO v_unit
  FROM public.organizations
  WHERE id = COALESCE(v_invite.target_organization_id, v_invite.congregation_id, v_invite.sector_id, v_invite.organization_id);

  RETURN jsonb_build_object(
    'ok', true,
    'invite_id', v_invite.id,
    'token', v_invite.token,
    'member_id', v_invite.member_id,
    'organization_id', v_invite.organization_id,
    'target_organization_id', COALESCE(v_invite.target_organization_id, v_invite.organization_id),
    'sector_id', v_invite.sector_id,
    'congregation_id', v_invite.congregation_id,
    'role', 'member',
    'responsibility_types', v_invite.responsibility_types,
    'expires_at', v_invite.expires_at,
    'member_name', COALESCE(v_member.full_name, ''),
    'member_role', COALESCE(v_member.member_role, ''),
    'member_photo', COALESCE(v_member.photo_url, ''),
    'member_email', COALESCE(v_member.email, ''),
    'church_name', COALESCE(v_org.name, ''),
    'church_city', COALESCE(v_org.city, ''),
    'church_state', COALESCE(v_org.state, ''),
    'congregation', COALESCE(v_unit.name, '')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_member_invite(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_auth_email text := lower(btrim(COALESCE(auth.email(), '')));
  v_invite public.member_invites%ROWTYPE;
  v_member record;
  v_target_org uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated', 'message', 'Usuário não autenticado.');
  END IF;

  SELECT * INTO v_invite
  FROM public.member_invites
  WHERE token = _token
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'invite_not_found', 'message', 'Convite não encontrado.'); END IF;
  IF v_invite.status <> 'pending' THEN RETURN jsonb_build_object('success', false, 'error', 'invite_not_pending', 'message', 'Convite não está pendente.'); END IF;
  IF v_invite.expires_at < now() THEN RETURN jsonb_build_object('success', false, 'error', 'invite_expired', 'message', 'Convite expirado.'); END IF;

  SELECT id, user_id, organization_id, email INTO v_member
  FROM public.members
  WHERE id = v_invite.member_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'member_not_found', 'message', 'Membro não encontrado.'); END IF;
  IF v_member.organization_id IS DISTINCT FROM v_invite.organization_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'organization_mismatch', 'message', 'Convite e membro não pertencem à mesma organização-base.');
  END IF;
  IF v_member.email IS NULL OR btrim(v_member.email) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'member_email_missing', 'message', 'Membro sem e-mail cadastrado.');
  END IF;
  IF v_auth_email = '' OR v_auth_email <> lower(btrim(v_member.email)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'email_mismatch', 'message', 'O e-mail da conta não corresponde ao cadastro do membro.');
  END IF;
  IF v_member.user_id IS NOT NULL AND v_member.user_id <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'member_already_linked', 'message', 'Membro já vinculado a outra conta.');
  END IF;

  v_target_org := COALESCE(v_invite.target_organization_id, v_invite.organization_id);
  IF NOT public.is_organization_descendant_or_self(v_invite.organization_id, v_target_org)
     AND v_target_org <> v_invite.organization_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'target_outside_tree', 'message', 'Unidade alvo fora da estrutura do membro.');
  END IF;

  UPDATE public.members
  SET user_id = v_user_id, updated_at = now()
  WHERE id = v_member.id;

  INSERT INTO public.organization_users (organization_id, user_id, role, is_active)
  VALUES (v_invite.organization_id, v_user_id, 'member', true)
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET is_active = true, updated_at = now();

  PERFORM public._apply_organization_responsibilities(
    v_invite.invited_by,
    v_user_id,
    v_target_org,
    v_invite.responsibility_types,
    false,
    'member_invite'
  );

  UPDATE public.member_invites
  SET status = 'accepted', accepted_user_id = v_user_id, accepted_at = now()
  WHERE id = v_invite.id;

  INSERT INTO public.organization_access_audit (
    organization_id, target_user_id, actor_user_id, action,
    responsibility_types, source
  ) VALUES (
    v_target_org, v_user_id, v_invite.invited_by,
    'invite_accept', v_invite.responsibility_types, 'member_invite'
  );

  RETURN jsonb_build_object(
    'success', true,
    'member_id', v_member.id,
    'organization_id', v_invite.organization_id,
    'target_organization_id', v_target_org,
    'responsibility_types', v_invite.responsibility_types
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_member_invite(p_token text, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_mismatch', 'message', 'Usuário autenticado não corresponde ao usuário informado.');
  END IF;
  RETURN public.accept_member_invite(p_token);
END;
$$;

-- ── Grupos e departamentos ───────────────────────────────────────────────────

-- As páginas continuam usando PostgREST para os dados de negócio. Estas
-- policies adicionais fazem a autorização operacional funcionar de verdade no
-- banco; esconder botões no frontend nunca é considerado proteção.
DO $$
BEGIN
  IF to_regclass('public.organizations') IS NOT NULL THEN
    DROP POLICY IF EXISTS "organizations capability insert" ON public.organizations;
    DROP POLICY IF EXISTS "organizations capability update" ON public.organizations;
    CREATE POLICY "organizations capability insert" ON public.organizations
      FOR INSERT TO authenticated
      WITH CHECK (
        parent_id IS NOT NULL
        AND public.has_org_access_permission(auth.uid(), parent_id, 'organization.manage')
      );
    CREATE POLICY "organizations capability update" ON public.organizations
      FOR UPDATE TO authenticated
      USING (public.has_org_access_permission(auth.uid(), id, 'organization.manage'))
      WITH CHECK (public.has_org_access_permission(auth.uid(), id, 'organization.manage'));
  END IF;

  IF to_regclass('public.members') IS NOT NULL THEN
    DROP POLICY IF EXISTS "members capability select" ON public.members;
    DROP POLICY IF EXISTS "members capability insert" ON public.members;
    DROP POLICY IF EXISTS "members capability update" ON public.members;
    DROP POLICY IF EXISTS "members capability delete" ON public.members;
    CREATE POLICY "members capability insert" ON public.members
      FOR INSERT TO authenticated
      WITH CHECK (public.has_org_access_permission(
        auth.uid(), COALESCE(congregation_id, sector_id, organization_id), 'members.write'
      ));
    CREATE POLICY "members capability select" ON public.members
      FOR SELECT TO authenticated
      USING (public.has_org_access_permission(
        auth.uid(), COALESCE(congregation_id, sector_id, organization_id), 'members.read'
      ));
    CREATE POLICY "members capability update" ON public.members
      FOR UPDATE TO authenticated
      USING (public.has_org_access_permission(
        auth.uid(), COALESCE(congregation_id, sector_id, organization_id), 'members.write'
      ))
      WITH CHECK (public.has_org_access_permission(
        auth.uid(), COALESCE(congregation_id, sector_id, organization_id), 'members.write'
      ));
    CREATE POLICY "members capability delete" ON public.members
      FOR DELETE TO authenticated
      USING (
        status <> ALL (ARRAY['Falecido'::text, 'Transferido'::text])
        AND public.has_org_access_permission(
          auth.uid(), COALESCE(congregation_id, sector_id, organization_id), 'members.write'
        )
      );
  END IF;

  IF to_regclass('public.documents') IS NOT NULL THEN
    DROP POLICY IF EXISTS "documents capability insert" ON public.documents;
    DROP POLICY IF EXISTS "documents capability update" ON public.documents;
    DROP POLICY IF EXISTS "documents capability delete" ON public.documents;
    CREATE POLICY "documents capability insert" ON public.documents
      FOR INSERT TO authenticated
      WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'documents.write'));
    CREATE POLICY "documents capability update" ON public.documents
      FOR UPDATE TO authenticated
      USING (public.has_org_access_permission(auth.uid(), organization_id, 'documents.write'))
      WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'documents.write'));
    CREATE POLICY "documents capability delete" ON public.documents
      FOR DELETE TO authenticated
      USING (public.has_org_access_permission(auth.uid(), organization_id, 'documents.write'));
  END IF;

  IF to_regclass('public.events') IS NOT NULL THEN
    DROP POLICY IF EXISTS "events capability insert" ON public.events;
    DROP POLICY IF EXISTS "events capability update" ON public.events;
    DROP POLICY IF EXISTS "events capability delete" ON public.events;
    CREATE POLICY "events capability insert" ON public.events
      FOR INSERT TO authenticated
      WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'agenda.write'));
    CREATE POLICY "events capability update" ON public.events
      FOR UPDATE TO authenticated
      USING (public.has_org_access_permission(auth.uid(), organization_id, 'agenda.write'))
      WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'agenda.write'));
    CREATE POLICY "events capability delete" ON public.events
      FOR DELETE TO authenticated
      USING (public.has_org_access_permission(auth.uid(), organization_id, 'agenda.write'));
  END IF;

  IF to_regclass('public.communications') IS NOT NULL THEN
    DROP POLICY IF EXISTS "communications capability insert" ON public.communications;
    DROP POLICY IF EXISTS "communications capability update" ON public.communications;
    DROP POLICY IF EXISTS "communications capability delete" ON public.communications;
    CREATE POLICY "communications capability insert" ON public.communications
      FOR INSERT TO authenticated
      WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'communications.write'));
    CREATE POLICY "communications capability update" ON public.communications
      FOR UPDATE TO authenticated
      USING (public.has_org_access_permission(auth.uid(), organization_id, 'communications.write'))
      WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'communications.write'));
    CREATE POLICY "communications capability delete" ON public.communications
      FOR DELETE TO authenticated
      USING (public.has_org_access_permission(auth.uid(), organization_id, 'communications.write'));
  END IF;

  IF to_regclass('public.schedules') IS NOT NULL THEN
    DROP POLICY IF EXISTS "schedules capability insert" ON public.schedules;
    DROP POLICY IF EXISTS "schedules capability update" ON public.schedules;
    DROP POLICY IF EXISTS "schedules capability delete" ON public.schedules;
    CREATE POLICY "schedules capability insert" ON public.schedules
      FOR INSERT TO authenticated
      WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'schedules.write'));
    CREATE POLICY "schedules capability update" ON public.schedules
      FOR UPDATE TO authenticated
      USING (public.has_org_access_permission(auth.uid(), organization_id, 'schedules.write'))
      WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'schedules.write'));
    CREATE POLICY "schedules capability delete" ON public.schedules
      FOR DELETE TO authenticated
      USING (public.has_org_access_permission(auth.uid(), organization_id, 'schedules.write'));
  END IF;

  IF to_regclass('public.administrative_requests') IS NOT NULL THEN
    DROP POLICY IF EXISTS "admin_requests_org_update" ON public.administrative_requests;
    DROP POLICY IF EXISTS "admin_requests_org_delete" ON public.administrative_requests;
    DROP POLICY IF EXISTS "admin requests capability update" ON public.administrative_requests;
    DROP POLICY IF EXISTS "admin requests capability delete" ON public.administrative_requests;
    CREATE POLICY "admin requests capability update" ON public.administrative_requests
      FOR UPDATE TO authenticated
      USING (public.has_org_access_permission(auth.uid(), organization_id, 'requests.manage'))
      WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'requests.manage'));
    CREATE POLICY "admin requests capability delete" ON public.administrative_requests
      FOR DELETE TO authenticated
      USING (public.has_org_access_permission(auth.uid(), organization_id, 'requests.manage'));
  END IF;

  IF to_regclass('public.worship_songs') IS NOT NULL THEN
    DROP POLICY IF EXISTS "worship songs capability write" ON public.worship_songs;
    CREATE POLICY "worship songs capability write" ON public.worship_songs
      FOR ALL TO authenticated
      USING (public.has_org_access_permission(auth.uid(), organization_id, 'worship.write'))
      WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'worship.write'));
  END IF;

  IF to_regclass('public.worship_setlists') IS NOT NULL THEN
    DROP POLICY IF EXISTS "worship setlists capability write" ON public.worship_setlists;
    CREATE POLICY "worship setlists capability write" ON public.worship_setlists
      FOR ALL TO authenticated
      USING (public.has_org_access_permission(auth.uid(), organization_id, 'worship.write'))
      WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'worship.write'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_group(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_platform_admin(_user_id)
  OR EXISTS (
    SELECT 1
    FROM public.groups church_group
    WHERE church_group.id = _group_id
      AND public.has_org_access_permission(_user_id, church_group.organization_id, 'groups.manage')
  )
  OR EXISTS (
    SELECT 1
    FROM public.group_members membership
    JOIN public.members member ON member.id = membership.member_id
    WHERE membership.group_id = _group_id
      AND member.user_id = _user_id
      AND membership.role IN ('leader', 'co_leader')
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_managed_group_ids(_organization_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(array_agg(church_group.id ORDER BY church_group.name), ARRAY[]::uuid[])
  FROM public.groups church_group
  WHERE church_group.organization_id = _organization_id
    AND public.can_manage_group(auth.uid(), church_group.id);
$$;

DO $$
BEGIN
  IF to_regclass('public.groups') IS NOT NULL THEN
    DROP POLICY IF EXISTS "groups org staff insert" ON public.groups;
    DROP POLICY IF EXISTS "groups org staff update" ON public.groups;
    DROP POLICY IF EXISTS "groups org staff delete" ON public.groups;

    CREATE POLICY "groups capability insert" ON public.groups
      FOR INSERT TO authenticated
      WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'groups.manage'));
    CREATE POLICY "groups capability update" ON public.groups
      FOR UPDATE TO authenticated
      USING (public.can_manage_group(auth.uid(), id))
      WITH CHECK (public.can_manage_group(auth.uid(), id));
    CREATE POLICY "groups capability delete" ON public.groups
      FOR DELETE TO authenticated
      USING (public.can_manage_group(auth.uid(), id));
  END IF;

  IF to_regclass('public.group_members') IS NOT NULL THEN
    DROP POLICY IF EXISTS "group_members org staff insert" ON public.group_members;
    DROP POLICY IF EXISTS "group_members org staff update" ON public.group_members;
    DROP POLICY IF EXISTS "group_members org staff delete" ON public.group_members;

    CREATE POLICY "group_members scoped insert" ON public.group_members
      FOR INSERT TO authenticated
      WITH CHECK (public.can_manage_group(auth.uid(), group_id));
    CREATE POLICY "group_members scoped update" ON public.group_members
      FOR UPDATE TO authenticated
      USING (public.can_manage_group(auth.uid(), group_id))
      WITH CHECK (public.can_manage_group(auth.uid(), group_id));
    CREATE POLICY "group_members scoped delete" ON public.group_members
      FOR DELETE TO authenticated
      USING (public.can_manage_group(auth.uid(), group_id));
  END IF;
END;
$$;

-- ── RLS, privilégios e grants ────────────────────────────────────────────────

ALTER TABLE public.access_responsibility_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_responsibles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_access_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "access definitions authenticated read" ON public.access_responsibility_definitions;
CREATE POLICY "access definitions authenticated read"
  ON public.access_responsibility_definitions
  FOR SELECT TO authenticated
  USING (is_active);

DROP POLICY IF EXISTS "organization responsibilities self or manager read" ON public.organization_responsibles;
DROP POLICY IF EXISTS "responsibles read" ON public.organization_responsibles;
DROP POLICY IF EXISTS "responsibles insert" ON public.organization_responsibles;
DROP POLICY IF EXISTS "responsibles update" ON public.organization_responsibles;
DROP POLICY IF EXISTS "responsibles delete" ON public.organization_responsibles;
CREATE POLICY "organization responsibilities self or manager read"
  ON public.organization_responsibles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.can_manage_access_for_organization(auth.uid(), organization_id)
  );

DROP POLICY IF EXISTS "organization access audit manager read" ON public.organization_access_audit;
CREATE POLICY "organization access audit manager read"
  ON public.organization_access_audit
  FOR SELECT TO authenticated
  USING (public.can_manage_access_for_organization(auth.uid(), organization_id));

REVOKE ALL ON public.organization_responsibles FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.organization_responsibles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.organization_access_audit FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.access_responsibility_definitions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.access_invites FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.organization_users FROM anon, authenticated;

GRANT SELECT ON public.access_responsibility_definitions TO authenticated;
GRANT SELECT ON public.organization_responsibles TO authenticated;
GRANT SELECT ON public.organization_access_audit TO authenticated;

REVOKE ALL ON FUNCTION public.admin_list_organization_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_search_members_for_access(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_hierarchy_responsibles(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_organization_responsibilities(uuid, uuid, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_create_member_access_invite(uuid, uuid, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_create_external_access_invite(uuid, text, text, text, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_access_invites(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_revoke_access_invite(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_access_capabilities() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_managed_group_ids(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_list_organization_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_members_for_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_hierarchy_responsibles(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_organization_responsibilities(uuid, uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_member_access_invite(uuid, uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_external_access_invite(uuid, text, text, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_access_invites(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_access_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_access_capabilities() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_managed_group_ids(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.accept_access_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_access_invite(text) TO authenticated;

REVOKE ALL ON FUNCTION public.accept_member_invite(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_member_invite(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_member_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_member_invite(text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_access_invite_by_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_member_invite_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_access_invite_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_invite_by_token(text) TO anon, authenticated;

COMMIT;
