-- Gestão: todo novo membro operacional precisa nascer apto a receber convite.
-- Registros históricos existentes permanecem preservados e podem ser
-- completados gradualmente pela Secretaria.

DO $$
BEGIN
  IF to_regclass('public.members') IS NULL THEN
    RAISE EXCEPTION 'member required contacts preflight failed: members missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'members'
      AND column_name IN ('full_name', 'cpf', 'phone', 'whatsapp', 'email')
    GROUP BY table_schema, table_name
    HAVING count(*) = 5
  ) THEN
    RAISE EXCEPTION 'member required contacts preflight failed: contact columns missing';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_new_member_required_contacts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NULLIF(btrim(NEW.full_name), '') IS NULL
     OR NULLIF(btrim(NEW.cpf), '') IS NULL
     OR NULLIF(btrim(NEW.phone), '') IS NULL
     OR NULLIF(btrim(NEW.whatsapp), '') IS NULL
     OR NULLIF(btrim(NEW.email), '') IS NULL
  THEN
    RAISE EXCEPTION
      'new_member_requires_name_cpf_phone_whatsapp_email'
      USING ERRCODE = '23514';
  END IF;

  IF btrim(NEW.email) !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN
    RAISE EXCEPTION 'new_member_invalid_email' USING ERRCODE = '23514';
  END IF;

  NEW.email := lower(btrim(NEW.email));
  NEW.phone := btrim(NEW.phone);
  NEW.whatsapp := btrim(NEW.whatsapp);

  -- Telefone e WhatsApp são independentes. Podem ser iguais ou diferentes;
  -- não existe comparação nem índice de unicidade cruzada entre esses campos.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS members_require_contacts_on_insert ON public.members;
CREATE TRIGGER members_require_contacts_on_insert
BEFORE INSERT ON public.members
FOR EACH ROW
EXECUTE FUNCTION public.enforce_new_member_required_contacts();

COMMENT ON FUNCTION public.enforce_new_member_required_contacts() IS
  'Requires name, CPF, phone, WhatsApp and valid e-mail for every new member; phone and WhatsApp may be equal or different.';

-- Mantém a importação em lote na mesma regra do cadastro manual.
CREATE OR REPLACE FUNCTION public.import_members_batch(
  p_organization_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_org_access_permission(
       auth.uid(),
       p_organization_id,
       'members.write'
     ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_rows) = 0
     OR jsonb_array_length(p_rows) > 1000 THEN
    RAISE EXCEPTION 'invalid_batch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) AS row_data
    WHERE btrim(COALESCE(row_data->>'name', '')) = ''
       OR length(regexp_replace(COALESCE(row_data->>'cpf', ''), '\D', '', 'g')) <> 11
       OR btrim(COALESCE(row_data->>'phone', '')) = ''
       OR btrim(COALESCE(row_data->>'whatsapp', '')) = ''
       OR btrim(COALESCE(row_data->>'email', '')) = ''
       OR btrim(row_data->>'email') !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ) THEN
    RAISE EXCEPTION 'invalid_member_row';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) AS row_data
    GROUP BY regexp_replace(row_data->>'cpf', '\D', '', 'g')
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate_cpf_in_batch';
  END IF;

  INSERT INTO public.members (
    organization_id,
    created_by,
    full_name,
    member_code,
    member_role,
    cpf,
    phone,
    whatsapp,
    email,
    joined_at,
    status
  )
  SELECT
    p_organization_id,
    auth.uid(),
    btrim(row_data->>'name'),
    NULLIF(btrim(row_data->>'member_code'), ''),
    COALESCE(NULLIF(btrim(row_data->>'role'), ''), 'Membro'),
    regexp_replace(row_data->>'cpf', '\D', '', 'g'),
    btrim(row_data->>'phone'),
    btrim(row_data->>'whatsapp'),
    lower(btrim(row_data->>'email')),
    current_date,
    CASE
      WHEN row_data->>'status' = ANY (
        ARRAY['Ativo', 'Inativo', 'Visitante', 'Falecido', 'Transferido']
      ) THEN row_data->>'status'
      ELSE 'Ativo'
    END
  FROM jsonb_array_elements(p_rows) AS row_data;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('success', v_count, 'errors', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.import_members_batch(uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_members_batch(uuid, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.import_members_batch(uuid, jsonb) IS
  'Atomically imports members with name, CPF, phone, WhatsApp and e-mail; phone and WhatsApp may be equal or different.';
