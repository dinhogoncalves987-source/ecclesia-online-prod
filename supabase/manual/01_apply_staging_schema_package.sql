-- ============================================================
-- ECCLESIA ONLINE — PACOTE DE SCHEMA CONSOLIDADO PARA STAGING
-- Arquivo: 01_apply_staging_schema_package.sql
-- Quando rodar: APÓS 00_check_staging_schema_before.sql
-- Inclui: migrations 20260617120000 a 20260623150000
-- SEGURANÇA: 100% idempotente — seguro para re-executar.
-- PROIBIDO: não há DROP TABLE, TRUNCATE, DELETE em massa.
-- ============================================================
-- ORDEM DE SEÇÕES:
--   §1  members — campos estendidos (2026-06-17)
--   §2  members — constraint de status (2026-06-17)
--   §3  member_invites — tabela + RLS + funções (2026-06-17)
--   §4  campaigns — RLS writer fix (2026-06-17)
--   §5  access_invites — tabela + RLS + funções (2026-06-18)
--   §6  access_invites — validação de e-mail (2026-06-18)
--   §7  members — civil + eclesiástico (2026-06-22)
--   §8  organizations — RLS hierárquico (2026-06-22)
--   §9  organizations — unit_status (2026-06-23)
--   §10 organizations — config multi-denominacional (2026-06-23)
-- ============================================================


-- ══════════════════════════════════════════════════════════════
-- §1  MEMBERS — CAMPOS ESTENDIDOS
--     Origem: 20260617120000_members_extended_fields.sql
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS photo_url          text,
  ADD COLUMN IF NOT EXISTS gender             text,
  ADD COLUMN IF NOT EXISTS marital_status     text,
  ADD COLUMN IF NOT EXISTS cpf                text,
  ADD COLUMN IF NOT EXISTS rg                 text,
  ADD COLUMN IF NOT EXISTS rg_issuer          text,
  ADD COLUMN IF NOT EXISTS rg_issue_date      date,
  ADD COLUMN IF NOT EXISTS whatsapp           text,
  ADD COLUMN IF NOT EXISTS zip_code           text,
  ADD COLUMN IF NOT EXISTS street             text,
  ADD COLUMN IF NOT EXISTS address_number     text,
  ADD COLUMN IF NOT EXISTS address_complement text,
  ADD COLUMN IF NOT EXISTS neighborhood       text,
  ADD COLUMN IF NOT EXISTS conversion_date    date,
  ADD COLUMN IF NOT EXISTS administrative_role text,
  ADD COLUMN IF NOT EXISTS father_name        text,
  ADD COLUMN IF NOT EXISTS mother_name        text,
  ADD COLUMN IF NOT EXISTS spouse_name        text,
  ADD COLUMN IF NOT EXISTS sector_id          uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS congregation_id    uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

-- Storage: bucket avatars (idempotente)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas storage avatars
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Anyone can view avatars'
  ) THEN
    CREATE POLICY "Anyone can view avatars" ON storage.objects
      FOR SELECT USING (bucket_id = 'avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Auth users can upload avatars'
  ) THEN
    CREATE POLICY "Auth users can upload avatars" ON storage.objects
      FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Users can update own avatars'
  ) THEN
    CREATE POLICY "Users can update own avatars" ON storage.objects
      FOR UPDATE TO authenticated USING (bucket_id = 'avatars');
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE '§1 members extended fields ✓'; END $$;


-- ══════════════════════════════════════════════════════════════
-- §2  MEMBERS — CONSTRAINT DE STATUS
--     Origem: 20260617130000_members_status_constraint_fix.sql
-- ══════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='members'
  ) THEN
    -- Remove constraint antiga se existir (qualquer nome registrado)
    ALTER TABLE public.members DROP CONSTRAINT IF EXISTS members_status_check;

    -- Recria com todos os valores aceitos pelo app
    BEGIN
      ALTER TABLE public.members
        ADD CONSTRAINT members_status_check
        CHECK (status IN (
          'Ativo', 'Inativo', 'Visitante', 'Congregado',
          'Transferido', 'Falecido', 'Em disciplina',
          'Disciplinado', 'Afastado'
        ));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE '§2 members status_check ✓'; END $$;


-- ══════════════════════════════════════════════════════════════
-- §3  MEMBER_INVITES — TABELA + RLS + FUNÇÕES
--     Origem: 20260617140000_member_invites.sql
--     NOTA: bare RAISE NOTICE do original corrigido para DO block.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.member_invites (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token            text        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  member_id        uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  organization_id  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sector_id        uuid        REFERENCES public.organizations(id) ON DELETE SET NULL,
  congregation_id  uuid        REFERENCES public.organizations(id) ON DELETE SET NULL,
  invited_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  role             text        NOT NULL DEFAULT 'member',
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','accepted','expired','revoked')),
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  accepted_at      timestamptz,
  accepted_user_id uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_invites_token        ON public.member_invites(token);
CREATE INDEX IF NOT EXISTS idx_member_invites_member_id    ON public.member_invites(member_id);
CREATE INDEX IF NOT EXISTS idx_member_invites_organization ON public.member_invites(organization_id);

ALTER TABLE public.member_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "member_invites staff select" ON public.member_invites;
CREATE POLICY "member_invites staff select" ON public.member_invites
  FOR SELECT TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id,
    ARRAY['admin','church_admin','secretary','pastor','leader']));

DROP POLICY IF EXISTS "member_invites staff insert" ON public.member_invites;
CREATE POLICY "member_invites staff insert" ON public.member_invites
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(auth.uid(), organization_id,
    ARRAY['admin','church_admin','secretary','pastor','leader']));

DROP POLICY IF EXISTS "member_invites staff update" ON public.member_invites;
CREATE POLICY "member_invites staff update" ON public.member_invites
  FOR UPDATE TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id,
    ARRAY['admin','church_admin','secretary','pastor','leader']));

CREATE OR REPLACE FUNCTION public.get_member_invite_by_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv  public.member_invites%ROWTYPE;
  m    RECORD;
  org  RECORD;
  cong RECORD;
BEGIN
  SELECT * INTO inv FROM public.member_invites WHERE token = _token LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF inv.status = 'accepted' THEN RETURN jsonb_build_object('ok', false, 'error', 'already_accepted'); END IF;
  IF inv.status = 'revoked'  THEN RETURN jsonb_build_object('ok', false, 'error', 'revoked'); END IF;
  IF inv.expires_at < now() THEN
    UPDATE public.member_invites SET status = 'expired' WHERE id = inv.id;
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;
  SELECT full_name, member_role, photo_url INTO m FROM public.members WHERE id = inv.member_id LIMIT 1;
  SELECT name, city, state INTO org FROM public.organizations WHERE id = inv.organization_id LIMIT 1;
  SELECT name INTO cong FROM public.organizations WHERE id = COALESCE(inv.congregation_id, inv.sector_id) LIMIT 1;
  RETURN jsonb_build_object(
    'ok', true, 'invite_id', inv.id, 'token', inv.token,
    'member_id', inv.member_id, 'organization_id', inv.organization_id,
    'sector_id', inv.sector_id, 'congregation_id', inv.congregation_id,
    'role', inv.role, 'expires_at', inv.expires_at,
    'member_name', COALESCE(m.full_name,''), 'member_role', COALESCE(m.member_role,''),
    'member_photo', COALESCE(m.photo_url,''),
    'church_name', COALESCE(org.name,''), 'church_city', COALESCE(org.city,''),
    'church_state', COALESCE(org.state,''), 'congregation', COALESCE(cong.name,'')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_invite_by_token(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.accept_member_invite(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  inv public.member_invites%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;
  SELECT * INTO inv FROM public.member_invites WHERE token = _token LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF inv.status = 'accepted' THEN RETURN jsonb_build_object('ok', false, 'error', 'already_accepted'); END IF;
  IF inv.status IN ('revoked','expired') OR inv.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired_or_revoked');
  END IF;
  UPDATE public.members SET updated_at = now() WHERE id = inv.member_id;
  INSERT INTO public.organization_users (organization_id, user_id, role, is_active)
  VALUES (inv.organization_id, uid, inv.role, true)
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = inv.role, is_active = true;
  UPDATE public.member_invites
  SET status='accepted', accepted_at=now(), accepted_user_id=uid WHERE id=inv.id;
  RETURN jsonb_build_object('ok', true, 'organization_id', inv.organization_id,
    'member_id', inv.member_id, 'role', inv.role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_member_invite(text) TO authenticated;

DO $$ BEGIN RAISE NOTICE '§3 member_invites ✓'; END $$;


-- ══════════════════════════════════════════════════════════════
-- §4  CAMPAIGNS — RLS WRITER FIX
--     Origem: 20260617150000_fix_campaign_writer_rls.sql
--     Usa CREATE OR REPLACE — 100% idempotente.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_org_campaign_writer(
  _user_id uuid, _organization_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user_id)
  OR public.has_org_role(_user_id, _organization_id,
    ARRAY['admin','church_admin','pastor','secretary']);
$$;

CREATE OR REPLACE FUNCTION public.is_org_campaign_update_writer(
  _user_id uuid, _organization_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user_id)
  OR public.has_org_role(_user_id, _organization_id,
    ARRAY['admin','church_admin','pastor','secretary']);
$$;

DO $$ BEGIN RAISE NOTICE '§4 campaign writer RLS fix ✓'; END $$;


-- ══════════════════════════════════════════════════════════════
-- §5  ACCESS_INVITES — TABELA + RLS + FUNÇÕES
--     Origem: 20260618120000_access_invites.sql
--     NOTA: accept_access_invite aqui é versão inicial, será
--     sobrescrita pela versão com validação de e-mail no §6.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.access_invites (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token            text        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  organization_id  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invited_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name        text        NOT NULL DEFAULT '',
  email            text,
  phone            text,
  role             text        NOT NULL DEFAULT 'member',
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','accepted','expired','revoked')),
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at      timestamptz,
  accepted_user_id uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_invites_token  ON public.access_invites(token);
CREATE INDEX IF NOT EXISTS idx_access_invites_org    ON public.access_invites(organization_id);
CREATE INDEX IF NOT EXISTS idx_access_invites_status ON public.access_invites(status);

ALTER TABLE public.access_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "access_invites admin select" ON public.access_invites;
CREATE POLICY "access_invites admin select" ON public.access_invites
  FOR SELECT TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id,
    ARRAY['admin','church_admin','secretary','pastor']));

DROP POLICY IF EXISTS "access_invites admin insert" ON public.access_invites;
CREATE POLICY "access_invites admin insert" ON public.access_invites
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(auth.uid(), organization_id,
    ARRAY['admin','church_admin']));

DROP POLICY IF EXISTS "access_invites admin update" ON public.access_invites;
CREATE POLICY "access_invites admin update" ON public.access_invites
  FOR UPDATE TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id,
    ARRAY['admin','church_admin']));

CREATE OR REPLACE FUNCTION public.get_access_invite_by_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.access_invites%ROWTYPE;
  org RECORD;
BEGIN
  SELECT * INTO inv FROM public.access_invites WHERE token = _token LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF inv.status = 'accepted' THEN RETURN jsonb_build_object('ok', false, 'error', 'already_accepted'); END IF;
  IF inv.status = 'revoked'  THEN RETURN jsonb_build_object('ok', false, 'error', 'revoked'); END IF;
  IF inv.expires_at < now() THEN
    UPDATE public.access_invites SET status = 'expired' WHERE id = inv.id;
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;
  SELECT name, city, state INTO org FROM public.organizations WHERE id = inv.organization_id LIMIT 1;
  RETURN jsonb_build_object(
    'ok', true, 'invite_id', inv.id, 'token', inv.token,
    'organization_id', inv.organization_id,
    'full_name', COALESCE(inv.full_name,''), 'email', COALESCE(inv.email,''),
    'phone', COALESCE(inv.phone,''), 'role', inv.role, 'expires_at', inv.expires_at,
    'church_name', COALESCE(org.name,''), 'church_city', COALESCE(org.city,''),
    'church_state', COALESCE(org.state,'')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_access_invite_by_token(text) TO anon, authenticated;

DO $$ BEGIN RAISE NOTICE '§5 access_invites ✓'; END $$;


-- ══════════════════════════════════════════════════════════════
-- §6  ACCESS_INVITES — VALIDAÇÃO DE E-MAIL (versão final)
--     Origem: 20260618130000_fix_accept_access_invite_email_check.sql
--     Esta versão substitui completamente a função do §5.
--     Usa CREATE OR REPLACE — 100% idempotente.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.accept_access_invite(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid          uuid := auth.uid();
  caller_email text := lower(auth.email());
  inv          public.access_invites%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;
  SELECT * INTO inv FROM public.access_invites WHERE token = _token LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF inv.status = 'accepted' THEN RETURN jsonb_build_object('ok', false, 'error', 'already_accepted'); END IF;
  IF inv.status IN ('revoked','expired') OR inv.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired_or_revoked');
  END IF;
  -- Validação de e-mail: impede que admin aceite convite no lugar do convidado real
  IF inv.email IS NOT NULL AND inv.email <> '' THEN
    IF caller_email IS DISTINCT FROM lower(inv.email) THEN
      RETURN jsonb_build_object(
        'ok', false, 'error', 'email_mismatch', 'invite_email', inv.email
      );
    END IF;
  END IF;
  INSERT INTO public.organization_users (organization_id, user_id, role, is_active)
  VALUES (inv.organization_id, uid, inv.role, true)
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = inv.role, is_active = true;
  UPDATE public.access_invites
  SET status='accepted', accepted_at=now(), accepted_user_id=uid WHERE id=inv.id;
  RETURN jsonb_build_object('ok', true, 'organization_id', inv.organization_id, 'role', inv.role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_access_invite(text) TO authenticated;

DO $$ BEGIN RAISE NOTICE '§6 accept_access_invite com validação de e-mail ✓'; END $$;


-- ══════════════════════════════════════════════════════════════
-- §7  MEMBERS — DOCUMENTAÇÃO CIVIL + DADOS ECLESIÁSTICOS
--     Origem: 20260622120000_members_civil_ecclesiastical.sql
--     ADD COLUMN IF NOT EXISTS — 100% idempotente.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS civil_document_type          text,
  ADD COLUMN IF NOT EXISTS civil_document_status        text DEFAULT 'Pendente',
  ADD COLUMN IF NOT EXISTS civil_document_url           text,
  ADD COLUMN IF NOT EXISTS civil_document_notes         text,
  ADD COLUMN IF NOT EXISTS civil_document_uploaded_at   timestamptz,
  ADD COLUMN IF NOT EXISTS civil_document_validated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS civil_document_validated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS holy_spirit_baptism_date     date,
  ADD COLUMN IF NOT EXISTS consecration_date            date;

DO $$ BEGIN RAISE NOTICE '§7 members civil+eclesiastico ✓'; END $$;


-- ══════════════════════════════════════════════════════════════
-- §8  ORGANIZATIONS — RLS HIERÁRQUICO
--     Origem: 20260622140000_organizations_hierarchical_read_rls.sql
--     CREATE OR REPLACE + DROP POLICY IF EXISTS — 100% idempotente.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.can_read_organization(
  _user_id uuid, _organization_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user_id)
  OR EXISTS (
    WITH RECURSIVE chain AS (
      SELECT id, parent_id, 1 AS depth
      FROM public.organizations WHERE id = _organization_id
      UNION ALL
      SELECT o.id, o.parent_id, c.depth + 1
      FROM public.organizations o
      JOIN chain c ON o.id = c.parent_id
      WHERE c.depth < 10
    )
    SELECT 1 FROM chain
    JOIN public.organization_users ou ON ou.organization_id = chain.id
    WHERE ou.user_id = _user_id AND COALESCE(ou.is_active, true) = true
  );
$$;

CREATE OR REPLACE FUNCTION public.can_admin_organization(
  _user_id uuid, _organization_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user_id)
  OR EXISTS (
    WITH RECURSIVE chain AS (
      SELECT id, parent_id, 1 AS depth
      FROM public.organizations WHERE id = _organization_id
      UNION ALL
      SELECT o.id, o.parent_id, c.depth + 1
      FROM public.organizations o
      JOIN chain c ON o.id = c.parent_id
      WHERE c.depth < 10
    )
    SELECT 1 FROM chain
    JOIN public.organization_users ou ON ou.organization_id = chain.id
    WHERE ou.user_id = _user_id
      AND COALESCE(ou.is_active, true) = true
      AND ou.role IN ('admin','church_admin')
  );
$$;

DROP POLICY IF EXISTS "organizations members read" ON public.organizations;
CREATE POLICY "organizations members read" ON public.organizations
  FOR SELECT TO authenticated
  USING (public.can_read_organization(auth.uid(), id));

DROP POLICY IF EXISTS "organizations admins update" ON public.organizations;
CREATE POLICY "organizations admins update" ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.can_admin_organization(auth.uid(), id))
  WITH CHECK (public.can_admin_organization(auth.uid(), id));

DROP POLICY IF EXISTS "organizations admins insert children" ON public.organizations;
CREATE POLICY "organizations admins insert children" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (
    parent_id IS NOT NULL
    AND public.can_admin_organization(auth.uid(), parent_id)
    AND EXISTS (
      SELECT 1 FROM public.organizations AS parent_org
      WHERE parent_org.id = parent_id
        AND COALESCE(parent_org.active, true) = true
        AND public.is_valid_organization_hierarchy(parent_org.organization_type, organization_type)
    )
  );

DO $$ BEGIN RAISE NOTICE '§8 organizations RLS hierárquico ✓'; END $$;


-- ══════════════════════════════════════════════════════════════
-- §9  ORGANIZATIONS — UNIT_STATUS
--     Origem: 20260623120000_organizations_unit_status.sql
--     ADD COLUMN IF NOT EXISTS — 100% idempotente.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS unit_status text NOT NULL DEFAULT 'Ativa';

COMMENT ON COLUMN public.organizations.unit_status IS
  'Status operacional da unidade: Ativa | Em implantação | Inativa | Arquivada';

DO $$ BEGIN RAISE NOTICE '§9 organizations.unit_status ✓'; END $$;


-- ══════════════════════════════════════════════════════════════
-- §10 ORGANIZATIONS — CONFIGURAÇÃO MULTI-DENOMINACIONAL
--     Origem: 20260623150000_organizations_structural_config.sql
--     ADD COLUMN IF NOT EXISTS — 100% idempotente.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS denomination_type           text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hierarchy_model             text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS top_level_label             text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS top_level_label_plural      text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS municipal_level_label       text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS municipal_level_label_plural text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS intermediate_level_label    text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS intermediate_level_label_plural text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS local_unit_label            text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS local_unit_label_plural     text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uses_convention_level       boolean DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uses_municipal_level        boolean DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uses_intermediate_level     boolean DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uses_local_units            boolean DEFAULT NULL;

COMMENT ON COLUMN public.organizations.denomination_type IS
  'Ex: "Assembleia de Deus", "Adventista", "Independente", "Church"';
COMMENT ON COLUMN public.organizations.hierarchy_model IS
  'Ex: convention_matriz_intermediate_local | single_church | church_with_campuses | custom';
COMMENT ON COLUMN public.organizations.intermediate_level_label IS
  'Nome singular do nível intermediário. Ex: Setor, Distrito, Região, Área, Campo';
COMMENT ON COLUMN public.organizations.local_unit_label IS
  'Nome singular da unidade local. Ex: Congregação, Igreja local, Filial, Campus, Templo';
COMMENT ON COLUMN public.organizations.uses_intermediate_level IS
  'Se false, a Matriz gerencia unidades locais diretamente (sem nível intermediário).';

DO $$ BEGIN RAISE NOTICE '§10 organizations multi-denominacional ✓'; END $$;


-- ══════════════════════════════════════════════════════════════
-- CONCLUSÃO
-- ══════════════════════════════════════════════════════════════
DO $$ BEGIN
  RAISE NOTICE '=== PACOTE STAGING APLICADO COM SUCESSO ===';
  RAISE NOTICE 'Execute 02_validate_staging_schema_after.sql para confirmar.';
END $$;
