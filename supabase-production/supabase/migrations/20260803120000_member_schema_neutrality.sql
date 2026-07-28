-- ============================================================================
-- Cadastro de membros neutro para qualquer denominação
-- ============================================================================
-- Remove identificadores específicos de sistemas anteriores do cadastro
-- canônico. O único identificador operacional continua sendo member_code,
-- definido livremente pela própria igreja.

BEGIN;

-- O trigger de histórico não pode depender das colunas removidas.
CREATE OR REPLACE FUNCTION public._members_seed_history_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public._close_and_open_org_link(
    NEW.id, 'organization', NEW.organization_id, auth.uid(), 'Cadastro inicial'
  );

  IF NEW.sector_id IS NOT NULL THEN
    PERFORM public._close_and_open_org_link(
      NEW.id, 'sector', NEW.sector_id, auth.uid(), 'Cadastro inicial'
    );
  END IF;

  IF NEW.congregation_id IS NOT NULL THEN
    PERFORM public._close_and_open_org_link(
      NEW.id, 'congregation', NEW.congregation_id, auth.uid(), 'Cadastro inicial'
    );
  END IF;

  PERFORM public.register_member_history_event(
    NEW.id, 'cadastro', 'Cadastro no Ecclesia', NULL,
    COALESCE(NEW.created_at, now()),
    'secretaria', 'members', NEW.id, NULL, NULL, 'normal',
    NULL, NULL, NULL
  );

  IF NEW.baptized_at IS NOT NULL THEN
    PERFORM public.register_member_history_event(
      NEW.id, 'batismo', 'Batismo nas águas', NEW.baptism_place,
      NEW.baptized_at::timestamptz,
      'secretaria', 'members', NEW.id, NULL, NULL, 'normal',
      NULL, NULL, NULL
    );
  END IF;

  IF NEW.joined_at IS NOT NULL THEN
    PERFORM public.register_member_history_event(
      NEW.id, 'admissao', 'Admissão', NEW.admission_type,
      NEW.joined_at::timestamptz,
      'secretaria', 'members', NEW.id, NULL, NULL, 'normal',
      NULL, NULL, NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Diretórios de membros passam a pesquisar apenas a identidade canônica da
-- própria igreja. As assinaturas permanecem iguais para não quebrar clientes.
CREATE OR REPLACE FUNCTION public.search_secretaria_members(
  p_organization_id uuid,
  p_query text DEFAULT NULL,
  p_limit integer DEFAULT 30
)
RETURNS TABLE (
  id uuid,
  full_name text,
  known_name text,
  member_code text,
  baptized_at date,
  baptism_place text,
  spouse_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_query text := NULLIF(btrim(COALESCE(p_query, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_organization_id IS NULL
     OR NOT public.has_org_access_permission(auth.uid(), p_organization_id, 'members.read') THEN
    RAISE EXCEPTION 'access denied to search members';
  END IF;

  RETURN QUERY
  SELECT
    m.id, m.full_name, m.known_name, m.member_code, m.baptized_at,
    m.baptism_place, m.spouse_name
  FROM public.members m
  WHERE public.is_organization_descendant_or_self(
      p_organization_id, COALESCE(m.congregation_id, m.sector_id, m.organization_id)
    )
    AND (
      v_query IS NULL
      OR m.full_name ILIKE '%' || v_query || '%'
      OR COALESCE(m.known_name, '') ILIKE '%' || v_query || '%'
      OR COALESCE(m.member_code, '') ILIKE '%' || v_query || '%'
    )
  ORDER BY m.full_name
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 50);
END;
$$;

REVOKE ALL ON FUNCTION public.search_secretaria_members(uuid, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_secretaria_members(uuid, text, integer)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.search_discipleship_members(
  p_organization_id uuid,
  p_query text DEFAULT NULL,
  p_limit integer DEFAULT 30
)
RETURNS TABLE (id uuid, full_name text, known_name text, member_code text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_query text := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 50);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT public.has_org_access_permission(auth.uid(), p_organization_id, 'discipleship.read') THEN
    RAISE EXCEPTION 'access denied to discipleship member directory';
  END IF;

  RETURN QUERY
  SELECT m.id, m.full_name, m.known_name, m.member_code
  FROM public.members m
  WHERE public.is_organization_descendant_or_self(
          p_organization_id,
          COALESCE(m.congregation_id, m.sector_id, m.organization_id)
        )
    AND (
      v_query IS NULL
      OR m.full_name ILIKE ('%' || v_query || '%')
      OR COALESCE(m.known_name, '') ILIKE ('%' || v_query || '%')
      OR COALESCE(m.member_code, '') ILIKE ('%' || v_query || '%')
    )
  ORDER BY COALESCE(NULLIF(m.known_name, ''), m.full_name), m.full_name
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_discipleship_members(uuid, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_discipleship_members(uuid, text, integer)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.search_theology_members(
  p_organization_id uuid,
  p_query text DEFAULT NULL,
  p_limit integer DEFAULT 30
)
RETURNS TABLE (id uuid, full_name text, known_name text, member_code text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_query text := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 50);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT public.has_org_access_permission(auth.uid(), p_organization_id, 'theology.read') THEN
    RAISE EXCEPTION 'access denied to theology member directory';
  END IF;

  RETURN QUERY
  SELECT m.id, m.full_name, m.known_name, m.member_code
  FROM public.members m
  WHERE public.is_organization_descendant_or_self(
          p_organization_id,
          COALESCE(m.congregation_id, m.sector_id, m.organization_id)
        )
    AND (
      v_query IS NULL
      OR m.full_name ILIKE ('%' || v_query || '%')
      OR COALESCE(m.known_name, '') ILIKE ('%' || v_query || '%')
      OR COALESCE(m.member_code, '') ILIKE ('%' || v_query || '%')
    )
  ORDER BY COALESCE(NULLIF(m.known_name, ''), m.full_name), m.full_name
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_theology_members(uuid, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_theology_members(uuid, text, integer)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.search_missions_members(
  p_organization_id uuid,
  p_query text DEFAULT NULL,
  p_limit integer DEFAULT 30
)
RETURNS TABLE (id uuid, full_name text, known_name text, member_code text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_query text := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 50);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT public.has_org_access_permission(auth.uid(), p_organization_id, 'missions.read') THEN
    RAISE EXCEPTION 'access denied to missions member directory';
  END IF;

  RETURN QUERY
  SELECT m.id, m.full_name, m.known_name, m.member_code
  FROM public.members m
  WHERE public.is_organization_descendant_or_self(
          p_organization_id,
          COALESCE(m.congregation_id, m.sector_id, m.organization_id)
        )
    AND (
      v_query IS NULL
      OR m.full_name ILIKE ('%' || v_query || '%')
      OR COALESCE(m.known_name, '') ILIKE ('%' || v_query || '%')
      OR COALESCE(m.member_code, '') ILIKE ('%' || v_query || '%')
    )
  ORDER BY COALESCE(NULLIF(m.known_name, ''), m.full_name), m.full_name
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_missions_members(uuid, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_missions_members(uuid, text, integer)
  TO authenticated;

DROP INDEX IF EXISTS public.members_org_legacy_unique_idx;
DROP INDEX IF EXISTS public.idx_members_legacy_code;
DROP INDEX IF EXISTS public.idx_members_legacy_registration;

ALTER TABLE public.members
  DROP COLUMN IF EXISTS legacy_code,
  DROP COLUMN IF EXISTS legacy_registration,
  DROP COLUMN IF EXISTS legacy_source;

COMMENT ON COLUMN public.members.incomplete_registration IS
  'TRUE quando o cadastro ainda possui informações obrigatórias pendentes';
COMMENT ON COLUMN public.members.cpf_pending IS
  'TRUE quando o CPF ainda precisa ser informado ou validado';
COMMENT ON COLUMN public.members.contact_pending IS
  'TRUE quando telefone ou e-mail ainda precisa ser informado';
COMMENT ON COLUMN public.members.requires_review IS
  'TRUE quando o cadastro precisa de revisão manual pela Secretaria';

COMMIT;
