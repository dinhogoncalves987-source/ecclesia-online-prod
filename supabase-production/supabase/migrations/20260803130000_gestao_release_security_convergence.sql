-- =============================================================================
-- Gestão: convergência de segurança para homologação e promoção
--
-- Migration estrutural compartilhada por staging e produção. Não cria seeds,
-- não remove dados e não depende de nomes/dados da Assembleia de Deus.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'organizations',
    'organization_users',
    'members',
    'documents',
    'events',
    'communications',
    'schedules',
    'administrative_requests',
    'assemblies',
    'assembly_attachments',
    'access_responsibility_definitions'
  ] LOOP
    IF to_regclass('public.' || v_table) IS NULL THEN
      v_missing := array_append(v_missing, 'public.' || v_table);
    END IF;
  END LOOP;

  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'gestao security convergence preflight failed; missing: %',
      array_to_string(v_missing, ', ');
  END IF;

  IF to_regprocedure('public.has_org_access_permission(uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'gestao security convergence preflight failed; missing has_org_access_permission';
  END IF;
END;
$$;

-- A ficha completa contém CPF, RG, endereço, família e referências a
-- documentos civis. "members.read" permanece como permissão de diretório;
-- esta capability nova é a única que libera a ficha completa.
UPDATE public.access_responsibility_definitions
SET permission_keys = array_append(permission_keys, 'members.sensitive.read'),
    updated_at = now()
WHERE responsibility_type IN (
    'church_admin',
    'responsible_pastor',
    'secretary',
    'assistant_secretary',
    'member_manager'
  )
  AND NOT ('members.sensitive.read' = ANY(permission_keys));

CREATE OR REPLACE FUNCTION public.can_read_member_directory(
  _user_id uuid,
  _organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_platform_admin(_user_id)
    OR public.has_org_access_permission(_user_id, _organization_id, 'members.read')
    OR public.has_org_access_permission(_user_id, _organization_id, 'members.sensitive.read')
    OR public.has_org_access_permission(_user_id, _organization_id, 'documents.read')
    OR public.has_org_access_permission(_user_id, _organization_id, 'groups.read')
    OR public.has_org_access_permission(_user_id, _organization_id, 'schedules.read')
    OR public.has_org_access_permission(_user_id, _organization_id, 'chat.secretaria')
    OR public.has_org_access_permission(_user_id, _organization_id, 'requests.read')
    OR public.has_org_access_permission(_user_id, _organization_id, 'gatekeeper.use');
$$;

REVOKE ALL ON FUNCTION public.can_read_member_directory(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_member_directory(uuid, uuid) TO authenticated;

-- Diretório mínimo e explicitamente autorizado para seletores de escala,
-- grupos, chat, documentos e solicitações. Nenhum documento civil, CPF, RG,
-- endereço, parentesco ou anotação pastoral é exposto.
CREATE OR REPLACE VIEW public.member_directory
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  m.id,
  m.organization_id,
  m.sector_id,
  m.congregation_id,
  m.user_id,
  m.full_name,
  m.member_role,
  m.administrative_role,
  m.email,
  m.phone,
  m.baptized_at,
  m.joined_at,
  m.city,
  m.state,
  m.status
FROM public.members m
WHERE public.can_read_member_directory(
  auth.uid(),
  COALESCE(m.congregation_id, m.sector_id, m.organization_id)
);

REVOKE ALL ON public.member_directory FROM PUBLIC;
GRANT SELECT ON public.member_directory TO authenticated;

-- ── Members: remover policies permissivas antigas ────────────────────────────

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view all members" ON public.members;
DROP POLICY IF EXISTS "Authenticated users can insert members" ON public.members;
DROP POLICY IF EXISTS "Authenticated users can update own members" ON public.members;
DROP POLICY IF EXISTS "Authenticated users can delete own members" ON public.members;
DROP POLICY IF EXISTS "Users can view church members" ON public.members;
DROP POLICY IF EXISTS "Users can insert church members" ON public.members;
DROP POLICY IF EXISTS "members org members read" ON public.members;
DROP POLICY IF EXISTS "members org staff insert" ON public.members;
DROP POLICY IF EXISTS "members org staff update" ON public.members;
DROP POLICY IF EXISTS "members org staff delete" ON public.members;
DROP POLICY IF EXISTS "members capability select" ON public.members;
DROP POLICY IF EXISTS "members capability insert" ON public.members;
DROP POLICY IF EXISTS "members capability update" ON public.members;
DROP POLICY IF EXISTS "members capability delete" ON public.members;

CREATE POLICY "members sensitive capability select" ON public.members
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_org_access_permission(
    auth.uid(),
    COALESCE(congregation_id, sector_id, organization_id),
    'members.sensitive.read'
  )
);

CREATE POLICY "members capability insert" ON public.members
FOR INSERT TO authenticated
WITH CHECK (
  public.has_org_access_permission(
    auth.uid(),
    COALESCE(congregation_id, sector_id, organization_id),
    'members.write'
  )
);

CREATE POLICY "members capability update" ON public.members
FOR UPDATE TO authenticated
USING (
  public.has_org_access_permission(
    auth.uid(),
    COALESCE(congregation_id, sector_id, organization_id),
    'members.write'
  )
)
WITH CHECK (
  public.has_org_access_permission(
    auth.uid(),
    COALESCE(congregation_id, sector_id, organization_id),
    'members.write'
  )
);

CREATE POLICY "members capability delete" ON public.members
FOR DELETE TO authenticated
USING (
  status <> ALL (ARRAY['Falecido'::text, 'Transferido'::text])
  AND public.has_org_access_permission(
    auth.uid(),
    COALESCE(congregation_id, sector_id, organization_id),
    'members.write'
  )
);

-- Importação em lote é uma única transação no banco: uma linha inválida
-- rejeita o lote inteiro, evitando cadastros parciais difíceis de conciliar.
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
    NULLIF(btrim(row_data->>'email'), ''),
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

-- ── CRUD de Gestão: uma única autoridade por capability ─────────────────────

DROP POLICY IF EXISTS "documents org members read" ON public.documents;
DROP POLICY IF EXISTS "Auth users can view documents" ON public.documents;
DROP POLICY IF EXISTS "Auth users can insert documents" ON public.documents;
DROP POLICY IF EXISTS "Auth users can update own documents" ON public.documents;
DROP POLICY IF EXISTS "Auth users can delete own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can view church documents" ON public.documents;
DROP POLICY IF EXISTS "Users can insert church documents" ON public.documents;
DROP POLICY IF EXISTS "documents org staff insert" ON public.documents;
DROP POLICY IF EXISTS "documents org staff update" ON public.documents;
DROP POLICY IF EXISTS "documents org admins delete" ON public.documents;
DROP POLICY IF EXISTS "documents org secretariat delete" ON public.documents;
DROP POLICY IF EXISTS "documents capability select" ON public.documents;
DROP POLICY IF EXISTS "documents capability insert" ON public.documents;
DROP POLICY IF EXISTS "documents capability update" ON public.documents;
DROP POLICY IF EXISTS "documents capability delete" ON public.documents;

CREATE POLICY "documents capability select" ON public.documents
FOR SELECT TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'documents.read'));
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

DROP POLICY IF EXISTS "events org staff insert" ON public.events;
DROP POLICY IF EXISTS "Authenticated users can view all events" ON public.events;
DROP POLICY IF EXISTS "Authenticated users can insert events" ON public.events;
DROP POLICY IF EXISTS "Authenticated users can update own events" ON public.events;
DROP POLICY IF EXISTS "Authenticated users can delete own events" ON public.events;
DROP POLICY IF EXISTS "Users can view church events" ON public.events;
DROP POLICY IF EXISTS "Users can insert church events" ON public.events;
DROP POLICY IF EXISTS "events org staff update" ON public.events;
DROP POLICY IF EXISTS "events org staff delete" ON public.events;
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

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_time_order_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_time_order_check
  CHECK (ends_at IS NULL OR ends_at > starts_at) NOT VALID;

DROP POLICY IF EXISTS "communications org staff insert" ON public.communications;
DROP POLICY IF EXISTS "communications org staff update" ON public.communications;
DROP POLICY IF EXISTS "communications org staff delete" ON public.communications;
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

DROP POLICY IF EXISTS "schedules org staff insert" ON public.schedules;
DROP POLICY IF EXISTS "Auth users can view schedules" ON public.schedules;
DROP POLICY IF EXISTS "Auth users can insert schedules" ON public.schedules;
DROP POLICY IF EXISTS "Auth users can update own schedules" ON public.schedules;
DROP POLICY IF EXISTS "Auth users can delete own schedules" ON public.schedules;
DROP POLICY IF EXISTS "Users can view church schedules" ON public.schedules;
DROP POLICY IF EXISTS "Users can insert church schedules" ON public.schedules;
DROP POLICY IF EXISTS "schedules org staff update" ON public.schedules;
DROP POLICY IF EXISTS "schedules org admins delete" ON public.schedules;
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

DROP POLICY IF EXISTS "admin_requests_org_read" ON public.administrative_requests;
DROP POLICY IF EXISTS "admin_requests_org_write" ON public.administrative_requests;
DROP POLICY IF EXISTS "admin_requests_org_update" ON public.administrative_requests;
DROP POLICY IF EXISTS "admin_requests_org_delete" ON public.administrative_requests;
DROP POLICY IF EXISTS "admin requests capability select" ON public.administrative_requests;
DROP POLICY IF EXISTS "admin requests capability insert" ON public.administrative_requests;
DROP POLICY IF EXISTS "admin requests capability update" ON public.administrative_requests;
DROP POLICY IF EXISTS "admin requests capability delete" ON public.administrative_requests;

CREATE POLICY "admin requests capability select" ON public.administrative_requests
FOR SELECT TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'requests.read'));
CREATE POLICY "admin requests capability insert" ON public.administrative_requests
FOR INSERT TO authenticated
WITH CHECK (
  public.has_org_access_permission(auth.uid(), organization_id, 'requests.manage')
  AND status = 'aberta'
  AND assigned_to IS NULL
  AND completed_at IS NULL
);
CREATE POLICY "admin requests capability update" ON public.administrative_requests
FOR UPDATE TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'requests.manage'))
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'requests.manage'));
CREATE POLICY "admin requests capability delete" ON public.administrative_requests
FOR DELETE TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'requests.manage'));

-- ── Assembleias e anexos ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "assemblies org members read" ON public.assemblies;
DROP POLICY IF EXISTS "Users can view visible assemblies or own church" ON public.assemblies;
DROP POLICY IF EXISTS "Admins can insert assemblies" ON public.assemblies;
DROP POLICY IF EXISTS "Admins can update own church assemblies" ON public.assemblies;
DROP POLICY IF EXISTS "Admins can delete own assemblies" ON public.assemblies;
DROP POLICY IF EXISTS "assemblies org staff read" ON public.assemblies;
DROP POLICY IF EXISTS "assemblies org members read visible" ON public.assemblies;
DROP POLICY IF EXISTS "assemblies org staff insert" ON public.assemblies;
DROP POLICY IF EXISTS "assemblies org staff update" ON public.assemblies;
DROP POLICY IF EXISTS "assemblies org staff delete" ON public.assemblies;
DROP POLICY IF EXISTS "assemblies capability select" ON public.assemblies;
DROP POLICY IF EXISTS "assemblies capability insert" ON public.assemblies;
DROP POLICY IF EXISTS "assemblies capability update" ON public.assemblies;
DROP POLICY IF EXISTS "assemblies capability delete" ON public.assemblies;

CREATE POLICY "assemblies capability select" ON public.assemblies
FOR SELECT TO authenticated
USING (
  public.has_org_access_permission(auth.uid(), organization_id, 'documents.read')
  OR (is_visible AND public.is_org_user(auth.uid(), organization_id))
);
CREATE POLICY "assemblies capability insert" ON public.assemblies
FOR INSERT TO authenticated
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'documents.write'));
CREATE POLICY "assemblies capability update" ON public.assemblies
FOR UPDATE TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'documents.write'))
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'documents.write'));
CREATE POLICY "assemblies capability delete" ON public.assemblies
FOR DELETE TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'documents.write'));

DROP POLICY IF EXISTS "assembly_attachments org read" ON public.assembly_attachments;
DROP POLICY IF EXISTS "Users can view assembly attachments" ON public.assembly_attachments;
DROP POLICY IF EXISTS "Admins can insert attachments" ON public.assembly_attachments;
DROP POLICY IF EXISTS "Admins can delete attachments" ON public.assembly_attachments;
DROP POLICY IF EXISTS "assembly_attachments org staff write" ON public.assembly_attachments;
DROP POLICY IF EXISTS "assembly_attachments org staff read" ON public.assembly_attachments;
DROP POLICY IF EXISTS "assembly_attachments org members read visible" ON public.assembly_attachments;
DROP POLICY IF EXISTS "assembly_attachments org staff insert" ON public.assembly_attachments;
DROP POLICY IF EXISTS "assembly_attachments org staff update" ON public.assembly_attachments;
DROP POLICY IF EXISTS "assembly_attachments org staff delete" ON public.assembly_attachments;
DROP POLICY IF EXISTS "assembly attachments capability select" ON public.assembly_attachments;
DROP POLICY IF EXISTS "assembly attachments capability insert" ON public.assembly_attachments;
DROP POLICY IF EXISTS "assembly attachments capability update" ON public.assembly_attachments;
DROP POLICY IF EXISTS "assembly attachments capability delete" ON public.assembly_attachments;

CREATE POLICY "assembly attachments capability select" ON public.assembly_attachments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.assemblies a
    WHERE a.id = assembly_id
      AND (
        public.has_org_access_permission(auth.uid(), a.organization_id, 'documents.read')
        OR (a.is_visible AND public.is_org_user(auth.uid(), a.organization_id))
      )
  )
);
CREATE POLICY "assembly attachments capability insert" ON public.assembly_attachments
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.assemblies a
    WHERE a.id = assembly_id
      AND public.has_org_access_permission(auth.uid(), a.organization_id, 'documents.write')
  )
);
CREATE POLICY "assembly attachments capability update" ON public.assembly_attachments
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.assemblies a
    WHERE a.id = assembly_id
      AND public.has_org_access_permission(auth.uid(), a.organization_id, 'documents.write')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.assemblies a
    WHERE a.id = assembly_id
      AND public.has_org_access_permission(auth.uid(), a.organization_id, 'documents.write')
  )
);
CREATE POLICY "assembly attachments capability delete" ON public.assembly_attachments
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.assemblies a
    WHERE a.id = assembly_id
      AND public.has_org_access_permission(auth.uid(), a.organization_id, 'documents.write')
  )
);

-- ── Storage: isolamento real por dono/organização/registro ───────────────────

UPDATE storage.buckets
SET public = false
WHERE id IN ('assemblies', 'member-documents');

DROP POLICY IF EXISTS "Auth users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatars" ON storage.objects;
DROP POLICY IF EXISTS "avatars scoped insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars scoped update" ON storage.objects;
DROP POLICY IF EXISTS "avatars scoped delete" ON storage.objects;

CREATE POLICY "avatars scoped insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (
    split_part(name, '/', 1) = auth.uid()::text
    OR (
      split_part(name, '/', 1) = 'members'
      AND EXISTS (
        SELECT 1
        FROM public.members m
        WHERE m.id::text = split_part(split_part(name, '/', 2), '.', 1)
          AND public.has_org_access_permission(
            auth.uid(),
            COALESCE(m.congregation_id, m.sector_id, m.organization_id),
            'members.write'
          )
      )
    )
  )
);
CREATE POLICY "avatars scoped update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    split_part(name, '/', 1) = auth.uid()::text
    OR (
      split_part(name, '/', 1) = 'members'
      AND EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.id::text = split_part(split_part(name, '/', 2), '.', 1)
          AND public.has_org_access_permission(
            auth.uid(),
            COALESCE(m.congregation_id, m.sector_id, m.organization_id),
            'members.write'
          )
      )
    )
  )
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (
    split_part(name, '/', 1) = auth.uid()::text
    OR (
      split_part(name, '/', 1) = 'members'
      AND EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.id::text = split_part(split_part(name, '/', 2), '.', 1)
          AND public.has_org_access_permission(
            auth.uid(),
            COALESCE(m.congregation_id, m.sector_id, m.organization_id),
            'members.write'
          )
      )
    )
  )
);
CREATE POLICY "avatars scoped delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    split_part(name, '/', 1) = auth.uid()::text
    OR (
      split_part(name, '/', 1) = 'members'
      AND EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.id::text = split_part(split_part(name, '/', 2), '.', 1)
          AND public.has_org_access_permission(
            auth.uid(),
            COALESCE(m.congregation_id, m.sector_id, m.organization_id),
            'members.write'
          )
      )
    )
  )
);

DROP POLICY IF EXISTS "member documents storage select" ON storage.objects;
DROP POLICY IF EXISTS "member documents storage insert" ON storage.objects;
DROP POLICY IF EXISTS "member documents storage update" ON storage.objects;
DROP POLICY IF EXISTS "member documents storage delete" ON storage.objects;

CREATE POLICY "member documents storage select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'member-documents'
  AND EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.organization_id::text = split_part(name, '/', 1)
      AND m.id::text = split_part(name, '/', 2)
      AND (
        m.user_id = auth.uid()
        OR public.has_org_access_permission(
          auth.uid(),
          COALESCE(m.congregation_id, m.sector_id, m.organization_id),
          'members.sensitive.read'
        )
      )
  )
);
CREATE POLICY "member documents storage insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'member-documents'
  AND EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.organization_id::text = split_part(name, '/', 1)
      AND m.id::text = split_part(name, '/', 2)
      AND public.has_org_access_permission(
        auth.uid(),
        COALESCE(m.congregation_id, m.sector_id, m.organization_id),
        'members.write'
      )
  )
);
CREATE POLICY "member documents storage update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'member-documents'
  AND EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.organization_id::text = split_part(name, '/', 1)
      AND m.id::text = split_part(name, '/', 2)
      AND public.has_org_access_permission(
        auth.uid(),
        COALESCE(m.congregation_id, m.sector_id, m.organization_id),
        'members.write'
      )
  )
)
WITH CHECK (
  bucket_id = 'member-documents'
  AND EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.organization_id::text = split_part(name, '/', 1)
      AND m.id::text = split_part(name, '/', 2)
      AND public.has_org_access_permission(
        auth.uid(),
        COALESCE(m.congregation_id, m.sector_id, m.organization_id),
        'members.write'
      )
  )
);
CREATE POLICY "member documents storage delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'member-documents'
  AND EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.organization_id::text = split_part(name, '/', 1)
      AND m.id::text = split_part(name, '/', 2)
      AND public.has_org_access_permission(
        auth.uid(),
        COALESCE(m.congregation_id, m.sector_id, m.organization_id),
        'members.write'
      )
  )
);

DROP POLICY IF EXISTS "Auth users can upload assembly files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view assembly files" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can delete own assembly files" ON storage.objects;
DROP POLICY IF EXISTS "assemblies storage authenticated select" ON storage.objects;
DROP POLICY IF EXISTS "assemblies storage staff insert" ON storage.objects;
DROP POLICY IF EXISTS "assemblies storage staff update" ON storage.objects;
DROP POLICY IF EXISTS "assemblies storage staff delete" ON storage.objects;
DROP POLICY IF EXISTS "assemblies storage scoped select" ON storage.objects;
DROP POLICY IF EXISTS "assemblies storage scoped insert" ON storage.objects;
DROP POLICY IF EXISTS "assemblies storage scoped update" ON storage.objects;
DROP POLICY IF EXISTS "assemblies storage scoped delete" ON storage.objects;

CREATE POLICY "assemblies storage scoped select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'assemblies'
  AND EXISTS (
    SELECT 1 FROM public.assemblies a
    WHERE a.organization_id::text = split_part(name, '/', 1)
      AND a.id::text = split_part(name, '/', 2)
      AND (
        public.has_org_access_permission(auth.uid(), a.organization_id, 'documents.read')
        OR (a.is_visible AND public.is_org_user(auth.uid(), a.organization_id))
      )
  )
);
CREATE POLICY "assemblies storage scoped insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'assemblies'
  AND EXISTS (
    SELECT 1 FROM public.assemblies a
    WHERE a.organization_id::text = split_part(name, '/', 1)
      AND a.id::text = split_part(name, '/', 2)
      AND public.has_org_access_permission(auth.uid(), a.organization_id, 'documents.write')
  )
);
CREATE POLICY "assemblies storage scoped update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'assemblies'
  AND EXISTS (
    SELECT 1 FROM public.assemblies a
    WHERE a.organization_id::text = split_part(name, '/', 1)
      AND a.id::text = split_part(name, '/', 2)
      AND public.has_org_access_permission(auth.uid(), a.organization_id, 'documents.write')
  )
)
WITH CHECK (
  bucket_id = 'assemblies'
  AND EXISTS (
    SELECT 1 FROM public.assemblies a
    WHERE a.organization_id::text = split_part(name, '/', 1)
      AND a.id::text = split_part(name, '/', 2)
      AND public.has_org_access_permission(auth.uid(), a.organization_id, 'documents.write')
  )
);
CREATE POLICY "assemblies storage scoped delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'assemblies'
  AND EXISTS (
    SELECT 1 FROM public.assemblies a
    WHERE a.organization_id::text = split_part(name, '/', 1)
      AND a.id::text = split_part(name, '/', 2)
      AND public.has_org_access_permission(auth.uid(), a.organization_id, 'documents.write')
  )
);

DO $$
DECLARE
  v_forbidden text[] := ARRAY[
    'members org members read',
    'Authenticated users can view all members',
    'Auth users can view documents',
    'Users can view church documents',
    'Users can insert church documents',
    'Authenticated users can view all events',
    'Users can view church events',
    'Users can insert church events',
    'Auth users can view schedules',
    'Users can view church schedules',
    'Users can insert church schedules',
    'Users can view visible assemblies or own church',
    'Admins can insert assemblies',
    'Admins can update own church assemblies',
    'Admins can delete own assemblies',
    'Users can view assembly attachments',
    'Admins can insert attachments',
    'Admins can delete attachments',
    'Auth users can upload avatars',
    'Users can update own avatars',
    'Users can delete own avatars',
    'assemblies storage staff insert',
    'assemblies storage staff update',
    'assemblies storage staff delete',
    'admin_requests_org_read',
    'admin_requests_org_write'
  ];
  v_found text;
BEGIN
  SELECT string_agg(policyname, ', ' ORDER BY policyname)
  INTO v_found
  FROM pg_policies
  WHERE policyname = ANY(v_forbidden);

  IF v_found IS NOT NULL THEN
    RAISE EXCEPTION 'gestao security convergence failed; permissive policies remain: %', v_found;
  END IF;

  RAISE NOTICE 'Gestão security convergence: RLS, storage e capabilities confirmados ✓';
END;
$$;

COMMIT;
