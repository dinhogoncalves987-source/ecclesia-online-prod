-- ============================================================
-- Migration: member_invites — convite de membro via token
-- Data: 2026-06-17
-- ============================================================
-- COMO APLICAR:
--   Supabase Dashboard → SQL Editor → colar este arquivo → Run
-- ============================================================

-- ── Tabela ───────────────────────────────────────────────────────────────────

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
                               CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  accepted_at      timestamptz,
  accepted_user_id uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_invites_token         ON public.member_invites(token);
CREATE INDEX IF NOT EXISTS idx_member_invites_member_id     ON public.member_invites(member_id);
CREATE INDEX IF NOT EXISTS idx_member_invites_organization  ON public.member_invites(organization_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.member_invites ENABLE ROW LEVEL SECURITY;

-- Secretaria/admin pode criar e ler convites da própria organização
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

-- ── Função pública: buscar convite pelo token (sem autenticação) ──────────────

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
  SELECT * INTO inv
  FROM public.member_invites
  WHERE token = _token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF inv.status = 'accepted' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_accepted');
  END IF;

  IF inv.status = 'revoked' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'revoked');
  END IF;

  IF inv.expires_at < now() THEN
    UPDATE public.member_invites SET status = 'expired' WHERE id = inv.id;
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  -- Fetch member name
  SELECT full_name, member_role, photo_url INTO m
  FROM public.members
  WHERE id = inv.member_id
  LIMIT 1;

  -- Fetch organization name
  SELECT name, city, state INTO org
  FROM public.organizations
  WHERE id = inv.organization_id
  LIMIT 1;

  -- Fetch congregation name (if any)
  SELECT name INTO cong
  FROM public.organizations
  WHERE id = COALESCE(inv.congregation_id, inv.sector_id)
  LIMIT 1;

  RETURN jsonb_build_object(
    'ok',              true,
    'invite_id',       inv.id,
    'token',           inv.token,
    'member_id',       inv.member_id,
    'organization_id', inv.organization_id,
    'sector_id',       inv.sector_id,
    'congregation_id', inv.congregation_id,
    'role',            inv.role,
    'expires_at',      inv.expires_at,
    'member_name',     COALESCE(m.full_name, ''),
    'member_role',     COALESCE(m.member_role, ''),
    'member_photo',    COALESCE(m.photo_url, ''),
    'church_name',     COALESCE(org.name, ''),
    'church_city',     COALESCE(org.city, ''),
    'church_state',    COALESCE(org.state, ''),
    'congregation',    COALESCE(cong.name, '')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_invite_by_token(text) TO anon, authenticated;

-- ── Função autenticada: aceitar convite ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.accept_member_invite(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid  uuid := auth.uid();
  inv  public.member_invites%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO inv
  FROM public.member_invites
  WHERE token = _token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF inv.status = 'accepted' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_accepted');
  END IF;

  IF inv.status IN ('revoked', 'expired') OR inv.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired_or_revoked');
  END IF;

  -- Link user to member record (update profiles if email matches or set user on member)
  UPDATE public.members
  SET updated_at = now()
  WHERE id = inv.member_id;

  -- Create or update organization_users membership
  INSERT INTO public.organization_users (organization_id, user_id, role, is_active)
  VALUES (inv.organization_id, uid, inv.role, true)
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET role = inv.role, is_active = true;

  -- Mark invite as accepted
  UPDATE public.member_invites
  SET status           = 'accepted',
      accepted_at      = now(),
      accepted_user_id = uid
  WHERE id = inv.id;

  RETURN jsonb_build_object(
    'ok',              true,
    'organization_id', inv.organization_id,
    'member_id',       inv.member_id,
    'role',            inv.role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_member_invite(text) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'member_invites: tabela e funções criadas ✓'; END $$;
