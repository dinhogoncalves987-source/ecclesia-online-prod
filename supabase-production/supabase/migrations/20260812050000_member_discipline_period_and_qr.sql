-- Período disciplinar integrado a member_occurrences e validação segura do QR.
-- Não cria datas artificiais para membros legados já em disciplina.
BEGIN;
ALTER TABLE public.member_occurrences
  ADD COLUMN IF NOT EXISTS ended_at date,
  ADD COLUMN IF NOT EXISTS ended_by uuid;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'member_occurrences_ended_by_fkey'
      AND conrelid = 'public.member_occurrences'::regclass
  ) THEN
    ALTER TABLE public.member_occurrences
      ADD CONSTRAINT member_occurrences_ended_by_fkey
      FOREIGN KEY (ended_by)
      REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;
ALTER TABLE public.member_occurrences
  DROP CONSTRAINT IF EXISTS member_occurrences_occurrence_type_check;
ALTER TABLE public.member_occurrences
  ADD CONSTRAINT member_occurrences_occurrence_type_check
  CHECK (
    occurrence_type = ANY (
      ARRAY[
        'acompanhamento_pastoral',
        'carta_recomendada',
        'transferencia',
        'desligamento',
        'falecimento',
        'recebimento',
        'reconciliacao',
        'ordenacao',
        'credencial_emitida',
        'disciplina',
        'outro'
      ]::text[]
    )
  );
ALTER TABLE public.member_occurrences
  DROP CONSTRAINT IF EXISTS member_occurrences_discipline_period_check;
ALTER TABLE public.member_occurrences
  ADD CONSTRAINT member_occurrences_discipline_period_check
  CHECK (
    occurrence_type <> 'disciplina'
    OR (
      occurred_time IS NULL
      AND (valid_until IS NULL OR valid_until >= occurred_at)
      AND (ended_at IS NULL OR ended_at >= occurred_at)
      AND (
        (status = 'em_andamento' AND ended_at IS NULL)
        OR
        (status IN ('concluida', 'cancelada') AND ended_at IS NOT NULL)
      )
    )
  );
CREATE UNIQUE INDEX IF NOT EXISTS
  member_occurrences_one_open_discipline_per_member
ON public.member_occurrences(member_id)
WHERE occurrence_type = 'disciplina'
  AND status = 'em_andamento'
  AND ended_at IS NULL;
CREATE INDEX IF NOT EXISTS
  idx_member_occurrences_current_discipline
ON public.member_occurrences(member_id, occurred_at DESC)
WHERE occurrence_type = 'disciplina'
  AND status = 'em_andamento'
  AND ended_at IS NULL;
COMMENT ON COLUMN public.member_occurrences.ended_at IS
  'Data real de encerramento da ocorrência. Para disciplina, é preenchida quando o membro deixa o status Em disciplina.';
COMMENT ON COLUMN public.member_occurrences.ended_by IS
  'Usuário autenticado que encerrou a ocorrência.';
CREATE OR REPLACE FUNCTION public._member_occurrences_register_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_label text;
BEGIN
  v_label := CASE NEW.occurrence_type
    WHEN 'acompanhamento_pastoral' THEN 'Acompanhamento pastoral'
    WHEN 'carta_recomendada' THEN 'Carta recomendada'
    WHEN 'transferencia' THEN 'Transferência'
    WHEN 'desligamento' THEN 'Desligamento'
    WHEN 'falecimento' THEN 'Falecimento'
    WHEN 'recebimento' THEN 'Recebimento'
    WHEN 'reconciliacao' THEN 'Reconciliação'
    WHEN 'ordenacao' THEN 'Ordenação'
    WHEN 'credencial_emitida' THEN 'Credencial emitida'
    WHEN 'disciplina' THEN 'Período disciplinar'
    ELSE 'Ocorrência'
  END;
  PERFORM public.register_member_history_event(
    NEW.member_id,
    'ocorrencia',
    v_label,
    NEW.description,
    NEW.occurred_at::timestamptz,
    'secretaria',
    'member_occurrences',
    NEW.id,
    NEW.document_id,
    NEW.attachment_path,
    NEW.visibility,
    NEW.legacy_source,
    NEW.legacy_module,
    NEW.legacy_code
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._member_occurrences_register_history()
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._member_occurrences_register_history()
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public._member_occurrences_register_history()
  TO service_role;
CREATE OR REPLACE FUNCTION public.set_member_status_with_discipline(
  p_member_id uuid,
  p_new_status text,
  p_discipline_started_at date DEFAULT NULL,
  p_discipline_expected_end_at date DEFAULT NULL,
  p_discipline_description text DEFAULT NULL,
  p_discipline_ended_at date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member record;
  v_scope_org_id uuid;
  v_new_status text;
  v_old_is_discipline boolean;
  v_new_is_discipline boolean;
  v_period public.member_occurrences%ROWTYPE;
  v_end_date date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  v_new_status := CASE btrim(COALESCE(p_new_status, ''))
    WHEN 'Disciplinado' THEN 'Em disciplina'
    ELSE btrim(COALESCE(p_new_status, ''))
  END;
  IF v_new_status NOT IN (
    'Ativo',
    'Inativo',
    'Transferido',
    'Em disciplina',
    'Afastado',
    'Falecido',
    'Visitante',
    'Congregado'
  ) THEN
    RAISE EXCEPTION 'invalid member status: %', v_new_status;
  END IF;
  SELECT
    m.id,
    m.status,
    m.organization_id,
    m.sector_id,
    m.congregation_id
  INTO v_member
  FROM public.members m
  WHERE m.id = p_member_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'member not found';
  END IF;
  v_scope_org_id := COALESCE(
    v_member.congregation_id,
    v_member.sector_id,
    v_member.organization_id
  );
  IF NOT public.has_org_access_permission(
    auth.uid(),
    v_scope_org_id,
    'members.write'
  ) THEN
    RAISE EXCEPTION 'access denied to update member status';
  END IF;
  v_old_is_discipline :=
    v_member.status IN ('Em disciplina', 'Disciplinado');
  v_new_is_discipline := v_new_status = 'Em disciplina';
  SELECT o.*
  INTO v_period
  FROM public.member_occurrences o
  WHERE o.member_id = p_member_id
    AND o.occurrence_type = 'disciplina'
    AND o.status = 'em_andamento'
    AND o.ended_at IS NULL
  ORDER BY o.occurred_at DESC, o.created_at DESC
  LIMIT 1
  FOR UPDATE;
  IF v_new_is_discipline THEN
    IF NOT public.has_org_access_permission(
      auth.uid(),
      v_scope_org_id,
      'members.confidential'
    ) THEN
      RAISE EXCEPTION
        'access denied to register confidential discipline period';
    END IF;
    IF p_discipline_started_at IS NULL THEN
      RAISE EXCEPTION 'discipline start date is required';
    END IF;
    IF p_discipline_started_at > CURRENT_DATE THEN
      RAISE EXCEPTION
        'discipline start date cannot be in the future';
    END IF;
    IF p_discipline_expected_end_at IS NOT NULL
       AND p_discipline_expected_end_at < p_discipline_started_at THEN
      RAISE EXCEPTION
        'discipline expected end date cannot precede start date';
    END IF;
    IF v_period.id IS NULL THEN
      INSERT INTO public.member_occurrences (
        member_id,
        organization_id,
        occurrence_type,
        occurred_at,
        occurred_time,
        valid_until,
        description,
        status,
        visibility,
        created_by,
        ended_at,
        ended_by
      )
      VALUES (
        p_member_id,
        v_scope_org_id,
        'disciplina',
        p_discipline_started_at,
        NULL,
        p_discipline_expected_end_at,
        NULLIF(btrim(p_discipline_description), ''),
        'em_andamento',
        'confidential',
        auth.uid(),
        NULL,
        NULL
      )
      RETURNING * INTO v_period;
    ELSE
      UPDATE public.member_occurrences
      SET
        occurred_at = p_discipline_started_at,
        valid_until = p_discipline_expected_end_at,
        description = COALESCE(
          NULLIF(btrim(p_discipline_description), ''),
          description
        ),
        updated_at = now()
      WHERE id = v_period.id
      RETURNING * INTO v_period;
    END IF;
    IF v_member.status IS DISTINCT FROM v_new_status THEN
      UPDATE public.members
      SET status = v_new_status
      WHERE id = p_member_id;
    END IF;
  ELSE
    IF v_old_is_discipline THEN
      IF v_period.id IS NULL THEN
        RAISE EXCEPTION
          'open discipline period is required before leaving discipline';
      END IF;
      v_end_date := COALESCE(
        p_discipline_ended_at,
        CURRENT_DATE
      );
      IF v_end_date < v_period.occurred_at THEN
        RAISE EXCEPTION
          'discipline actual end date cannot precede start date';
      END IF;
      UPDATE public.member_occurrences
      SET
        status = 'concluida',
        ended_at = v_end_date,
        ended_by = auth.uid(),
        updated_at = now()
      WHERE id = v_period.id
      RETURNING * INTO v_period;
    ELSIF v_period.id IS NOT NULL THEN
      RAISE EXCEPTION
        'data inconsistency: open discipline period without disciplinary member status';
    END IF;
    IF v_member.status IS DISTINCT FROM v_new_status THEN
      UPDATE public.members
      SET status = v_new_status
      WHERE id = p_member_id;
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'member_id', p_member_id,
    'previous_status', v_member.status,
    'status', v_new_status,
    'discipline_period_id', v_period.id,
    'discipline_started_at', v_period.occurred_at,
    'discipline_expected_end_at', v_period.valid_until,
    'discipline_ended_at', v_period.ended_at
  );
END;
$$;
COMMENT ON FUNCTION public.set_member_status_with_discipline(
  uuid, text, date, date, text, date
) IS
  'Altera o status do membro e abre, atualiza ou encerra seu período disciplinar de forma atômica. Não inventa datas para registros legados.';
REVOKE ALL ON FUNCTION public.set_member_status_with_discipline(
  uuid, text, date, date, text, date
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_member_status_with_discipline(
  uuid, text, date, date, text, date
) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_member_status_with_discipline(
  uuid, text, date, date, text, date
) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.get_current_member_discipline_period(
  p_member_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member record;
  v_scope_org_id uuid;
  v_period record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'found', false,
      'reason', 'not_authenticated'
    );
  END IF;
  SELECT
    m.id,
    m.user_id,
    m.organization_id,
    m.sector_id,
    m.congregation_id
  INTO v_member
  FROM public.members m
  WHERE m.id = p_member_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', false,
      'reason', 'member_not_found'
    );
  END IF;
  v_scope_org_id := COALESCE(
    v_member.congregation_id,
    v_member.sector_id,
    v_member.organization_id
  );
  IF NOT (
    v_member.user_id = auth.uid()
    OR public.has_org_access_permission(
      auth.uid(),
      v_scope_org_id,
      'members.read'
    )
  ) THEN
    RETURN jsonb_build_object(
      'found', false,
      'reason', 'permission_denied'
    );
  END IF;
  SELECT
    o.id,
    o.occurred_at,
    o.valid_until
  INTO v_period
  FROM public.member_occurrences o
  WHERE o.member_id = p_member_id
    AND o.occurrence_type = 'disciplina'
    AND o.status = 'em_andamento'
    AND o.ended_at IS NULL
  ORDER BY o.occurred_at DESC, o.created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', false,
      'reason', 'discipline_period_not_recorded'
    );
  END IF;
  RETURN jsonb_build_object(
    'found', true,
    'discipline_period_id', v_period.id,
    'discipline_started_at', v_period.occurred_at,
    'discipline_expected_end_at', v_period.valid_until
  );
END;
$$;
COMMENT ON FUNCTION public.get_current_member_discipline_period(uuid) IS
  'Retorna somente início e término previsto do período disciplinar aberto. Não expõe motivo ou descrição confidencial.';
REVOKE ALL ON FUNCTION public.get_current_member_discipline_period(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_current_member_discipline_period(uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.get_current_member_discipline_period(uuid)
  TO authenticated, service_role;
REVOKE ALL ON TABLE public.member_occurrences FROM anon;
CREATE OR REPLACE FUNCTION public.validate_member_validation_token(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token_hash text;
  v_token_row record;
  v_member record;
  v_org_name text;
  v_discipline_started_at date;
  v_discipline_expected_end_at date;
  v_discipline_period_recorded boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'valid', false,
      'reason', 'not_authenticated'
    );
  END IF;
  v_token_hash := encode(
    digest(p_token, 'sha256'),
    'hex'
  );
  SELECT
    id,
    member_id,
    organization_id,
    expires_at,
    used_at
  INTO v_token_row
  FROM public.member_validation_tokens
  WHERE token_hash = v_token_hash;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false,
      'reason', 'invalid_token'
    );
  END IF;
  IF v_token_row.used_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'valid', false,
      'reason', 'token_already_used'
    );
  END IF;
  IF v_token_row.expires_at <= now() THEN
    RETURN jsonb_build_object(
      'valid', false,
      'reason', 'token_expired'
    );
  END IF;
  IF NOT public.has_org_role(
    auth.uid(),
    v_token_row.organization_id,
    ARRAY[
      'admin',
      'church_admin',
      'pastor',
      'secretary',
      'porteiro'
    ]
  ) THEN
    RETURN jsonb_build_object(
      'valid', false,
      'reason', 'permission_denied'
    );
  END IF;
  UPDATE public.member_validation_tokens
  SET
    used_at = now(),
    used_by = auth.uid()
  WHERE id = v_token_row.id
    AND expires_at > now()
    AND used_at IS NULL
  RETURNING
    id,
    member_id,
    organization_id,
    expires_at,
    used_at,
    used_by
  INTO v_token_row;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false,
      'reason', 'token_already_used'
    );
  END IF;
  SELECT
    id,
    full_name,
    photo_url,
    status,
    member_role,
    organization_id,
    congregation_id,
    sector_id
  INTO v_member
  FROM public.members
  WHERE id = v_token_row.member_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false,
      'reason', 'member_not_found'
    );
  END IF;
  SELECT name
  INTO v_org_name
  FROM public.organizations
  WHERE id = v_token_row.organization_id;
  IF v_member.status IN ('Em disciplina', 'Disciplinado') THEN
    SELECT
      o.occurred_at,
      o.valid_until
    INTO
      v_discipline_started_at,
      v_discipline_expected_end_at
    FROM public.member_occurrences o
    WHERE o.member_id = v_member.id
      AND o.occurrence_type = 'disciplina'
      AND o.status = 'em_andamento'
      AND o.ended_at IS NULL
    ORDER BY o.occurred_at DESC, o.created_at DESC
    LIMIT 1;
    v_discipline_period_recorded :=
      v_discipline_started_at IS NOT NULL;
  END IF;
  RETURN jsonb_build_object(
    'valid', true,
    'member_id', v_member.id,
    'full_name', v_member.full_name,
    'photo_url', v_member.photo_url,
    'status', v_member.status,
    'member_role', COALESCE(v_member.member_role, 'Membro'),
    'organization_id', v_member.organization_id,
    'organization_name', v_org_name,
    'congregation_id', v_member.congregation_id,
    'sector_id', v_member.sector_id,
    'matricula', upper(left(v_member.id::text, 8)),
    'discipline_period_recorded', v_discipline_period_recorded,
    'discipline_started_at', v_discipline_started_at,
    'discipline_expected_end_at', v_discipline_expected_end_at
  );
END;
$$;
COMMENT ON FUNCTION public.validate_member_validation_token(text) IS
  'Valida token de uso único e retorna dados seguros atuais do membro. Para disciplina, inclui somente início e término previsto; nunca expõe motivo ou descrição confidencial.';
REVOKE ALL ON FUNCTION public.validate_member_validation_token(text)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_member_validation_token(text)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_member_validation_token(text)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.generate_member_validation_token(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_member_validation_token(uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_member_validation_token(uuid)
  TO authenticated, service_role;
COMMIT;
