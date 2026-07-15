-- ============================================================================
-- Migration: member_validation_tokens
-- Phase: QR Code seguro da Carteira + Modo Porteiro (database foundation)
-- Created: 2026-07-08
--
-- Purpose:
--   Table + RPCs for secure, temporary QR tokens used for member identity
--   validation. Tokens are never stored in plaintext - only sha256 hashes.
--   All access is via SECURITY DEFINER RPCs (no direct table RLS read).
--
-- Tokens expire in 5 minutes (hardcoded).
-- ============================================================================

-- 1. Ensure pgcrypto is available (idempotent) --------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Table --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_validation_tokens (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id       uuid        NOT NULL REFERENCES public.members(id)      ON DELETE CASCADE,
  token_hash      text        NOT NULL UNIQUE,
  expires_at      timestamptz NOT NULL,
  used_at         timestamptz          NULL,
  used_by         uuid                  NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by      uuid                  NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 3. Indexes ------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_member_validation_tokens_hash
  ON public.member_validation_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_member_validation_tokens_org
  ON public.member_validation_tokens (organization_id);
CREATE INDEX IF NOT EXISTS idx_member_validation_tokens_member
  ON public.member_validation_tokens (member_id);
CREATE INDEX IF NOT EXISTS idx_member_validation_tokens_expires
  ON public.member_validation_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_member_validation_tokens_used
  ON public.member_validation_tokens (used_at)
  WHERE used_at IS NULL;

-- 4. RLS - block ALL direct table access (RPC only) ---------------------------
ALTER TABLE public.member_validation_tokens ENABLE ROW LEVEL SECURITY;

-- 5. RPC: generate_member_validation_token ------------------------------------
--    Who can generate:
--      - The member themselves (if user_id links to their auth account)
--      - admin, church_admin, pastor, secretary of the member's organization
--      - Platform admin / super_admin (via has_org_role)
--    Returns: { token, expires_at }
--    Token lifetime: 5 minutes (hardcoded)
CREATE OR REPLACE FUNCTION public.generate_member_validation_token(
  p_member_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_member        record;
  v_token         text;
  v_token_hash    text;
  v_expires_at    timestamptz;
  v_is_owner      boolean;
  v_is_staff      boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  -- fetch only necessary columns
  SELECT id, organization_id, user_id
    INTO v_member
    FROM members
   WHERE id = p_member_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'member_not_found');
  END IF;

  -- permission check #1: is the caller the member themselves?
  v_is_owner := v_member.user_id IS NOT NULL AND v_member.user_id = auth.uid();

  -- permission check #2: staff role in the member's organization
  v_is_staff := has_org_role(
    auth.uid(),
    v_member.organization_id,
    ARRAY['admin','church_admin','pastor','secretary']
  );

  IF NOT (v_is_owner OR v_is_staff) THEN
    RETURN jsonb_build_object('error', 'permission_denied');
  END IF;

  -- generate token + hash + fixed expiry
  v_token      := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');
  v_expires_at := now() + interval '5 minutes';

  -- persist only the hash
  INSERT INTO member_validation_tokens
    (organization_id, member_id, token_hash, expires_at, created_by)
  VALUES
    (v_member.organization_id, p_member_id, v_token_hash,
     v_expires_at, auth.uid());

  RETURN jsonb_build_object(
    'token',      v_token,
    'expires_at', v_expires_at
  );
END;
$$;

-- 6. RPC: validate_member_validation_token ------------------------------------
--    Security order (critical):
--      1. Authenticate
--      2. Lookup token WITHOUT consuming (read-only)
--      3. Check expiry / already-used
--      4. Check permission (only then)
--      5. Consume atomically (UPDATE ... RETURNING with guard conditions)
--      6. Fetch only public-safe member fields
--
--    Who can validate:
--      - super_admin / platform admin
--      - admin, church_admin, pastor, secretary
--      - porteiro
--
--    Returns on success:
--      { valid: true, member_id, full_name, photo_url, status, member_role,
--        organization_id, organization_name, congregation_id, sector_id,
--        matricula }
--    Never returns: cpf, rg, phone, email, address, birth_date, family data,
--                   civil documents, notes, or any sensitive field.
CREATE OR REPLACE FUNCTION public.validate_member_validation_token(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token_hash  text;
  v_token_row   record;
  v_member      record;
  v_org_name    text;
BEGIN
  -- step 1: authenticate
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_authenticated');
  END IF;

  -- step 2: hash the provided token
  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  -- step 3: lookup token WITHOUT consuming
  SELECT id, member_id, organization_id, expires_at, used_at
    INTO v_token_row
    FROM member_validation_tokens
   WHERE token_hash = v_token_hash;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid_token');
  END IF;

  -- step 4: check if already used
  IF v_token_row.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'token_already_used');
  END IF;

  -- step 5: check expiry
  IF v_token_row.expires_at <= now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'token_expired');
  END IF;

  -- step 6: permission check (BEFORE consuming the token)
  IF NOT has_org_role(
    auth.uid(),
    v_token_row.organization_id,
    ARRAY['admin','church_admin','pastor','secretary','porteiro']
  ) THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'permission_denied');
  END IF;

  -- step 7: consume atomically (guard against race between steps 3 and 7)
  UPDATE member_validation_tokens
     SET used_at = now(), used_by = auth.uid()
   WHERE id         = v_token_row.id
     AND expires_at > now()
     AND used_at    IS NULL
  RETURNING id, member_id, organization_id, expires_at, used_at, used_by
    INTO v_token_row;

  IF NOT FOUND THEN
    -- another process consumed it between lookup and this UPDATE
    RETURN jsonb_build_object('valid', false, 'reason', 'token_already_used');
  END IF;

  -- step 8: fetch only public-safe columns
  SELECT id, full_name, photo_url, status, member_role,
         organization_id, congregation_id, sector_id
    INTO v_member
    FROM members
   WHERE id = v_token_row.member_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'member_not_found');
  END IF;

  -- resolve organization name
  SELECT name INTO v_org_name FROM organizations WHERE id = v_token_row.organization_id;

  -- step 9: return only safe public fields
  RETURN jsonb_build_object(
    'valid',              true,
    'member_id',          v_member.id,
    'full_name',          v_member.full_name,
    'photo_url',          v_member.photo_url,
    'status',             v_member.status,
    'member_role',        COALESCE(v_member.member_role, 'Membro'),
    'organization_id',    v_member.organization_id,
    'organization_name',  v_org_name,
    'congregation_id',    v_member.congregation_id,
    'sector_id',          v_member.sector_id,
    'matricula',          upper(left(v_member.id::text, 8))
  );
END;
$$;
