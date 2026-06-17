-- ============================================================
-- Migration: access_invites — convite de acesso administrativo
-- Data: 2026-06-18
-- ============================================================
-- COMO APLICAR:
--   Supabase Dashboard → SQL Editor → colar este arquivo → Run
-- ============================================================

-- ── Tabela ───────────────────────────────────────────────────────────────────

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
                               CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at      timestamptz,
  accepted_user_id uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_invites_token ON public.access_invites(token);
CREATE INDEX IF NOT EXISTS idx_access_invites_org   ON public.access_invites(organization_id);
CREATE INDEX IF NOT EXISTS idx_access_invites_status ON public.access_invites(status);

-- ── RLS ──────────────────────────────────────────────────────────────────────

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

-- ── Função pública: buscar convite por token (sem autenticação) ───────────────

CREATE OR REPLACE FUNCTION public.get_access_invite_by_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv  public.access_invites%ROWTYPE;
  org  RECORD;
BEGIN
  SELECT * INTO inv FROM public.access_invites WHERE token = _token LIMIT 1;

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
    UPDATE public.access_invites SET status = 'expired' WHERE id = inv.id;
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  SELECT name, city, state INTO org FROM public.organizations
  WHERE id = inv.organization_id LIMIT 1;

  RETURN jsonb_build_object(
    'ok',              true,
    'invite_id',       inv.id,
    'token',           inv.token,
    'organization_id', inv.organization_id,
    'full_name',       COALESCE(inv.full_name, ''),
    'email',           COALESCE(inv.email, ''),
    'phone',           COALESCE(inv.phone, ''),
    'role',            inv.role,
    'expires_at',      inv.expires_at,
    'church_name',     COALESCE(org.name, ''),
    'church_city',     COALESCE(org.city, ''),
    'church_state',    COALESCE(org.state, '')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_access_invite_by_token(text) TO anon, authenticated;

-- ── Função autenticada: aceitar convite de acesso ─────────────────────────────

CREATE OR REPLACE FUNCTION public.accept_access_invite(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid  uuid := auth.uid();
  inv  public.access_invites%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO inv FROM public.access_invites WHERE token = _token LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF inv.status = 'accepted' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_accepted');
  END IF;

  IF inv.status IN ('revoked', 'expired') OR inv.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired_or_revoked');
  END IF;

  -- Criar ou atualizar vínculo na organização
  INSERT INTO public.organization_users (organization_id, user_id, role, is_active)
  VALUES (inv.organization_id, uid, inv.role, true)
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET role = inv.role, is_active = true;

  -- Marcar convite como aceito
  UPDATE public.access_invites
  SET status           = 'accepted',
      accepted_at      = now(),
      accepted_user_id = uid
  WHERE id = inv.id;

  RETURN jsonb_build_object(
    'ok',              true,
    'organization_id', inv.organization_id,
    'role',            inv.role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_access_invite(text) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'access_invites: tabela e funções criadas ✓'; END $$;
