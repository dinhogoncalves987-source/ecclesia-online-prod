-- ============================================================================
-- Migration: discipleship_permissions_and_history
-- Timestamp: 20260729120000
-- OPERAÇÃO 2 — Discipulado completo sobre a fundação revisada do Ecclesia
-- ============================================================================
--
-- Estende o catálogo FECHADO de public.member_history.history_type (criado
-- na Operação 1) com os marcos institucionais do Discipulado, e liga
-- discipleship_enrollments à MESMA timeline compartilhada via
-- register_member_history_event() — nenhuma tabela de eventos própria do
-- módulo. Presenças, aulas e notas NÃO entram aqui (ver
-- 20260729110000_discipleship_learning_records.sql) — somente:
--   - matrícula
--   - início da formação
--   - conclusão da formação
--   - desligamento da formação (desistência/cancelamento)
--   - transferência de turma
--   - certificado emitido (reaproveita o tipo já existente da Operação 1)
--
-- Os 5 novos valores ('matricula', 'inicio_formacao', 'conclusao_formacao',
-- 'desligamento_formacao', 'transferencia_turma') são genéricos de propósito
-- — Teologia poderá reutilizá-los para matrícula/formatura sem precisar de
-- uma nova migration de catálogo.
--
-- NÃO altera a migration original da Operação 1
-- (20260728090000_shared_institutional_history_foundation.sql) — apenas
-- estende a CHECK constraint e redefine a função (CREATE OR REPLACE, mesma
-- assinatura) via uma migration NOVA, preservando o trabalho já revisado.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.member_history') IS NULL THEN
    RAISE EXCEPTION 'discipleship_permissions_and_history preflight failed: public.member_history nao existe (Operacao 1)';
  END IF;
  IF to_regclass('public.discipleship_enrollments') IS NULL THEN
    RAISE EXCEPTION 'discipleship_permissions_and_history preflight failed: discipleship_enrollments nao existe';
  END IF;
  IF to_regprocedure('public.register_member_history_event(uuid,text,text,text,timestamptz,text,text,uuid,uuid,text,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'discipleship_permissions_and_history preflight failed: register_member_history_event() nao existe (Operacao 1)';
  END IF;
END;
$$;

-- ── Extensão do catálogo fechado de member_history.history_type ─────────
ALTER TABLE public.member_history DROP CONSTRAINT IF EXISTS member_history_history_type_check;
ALTER TABLE public.member_history ADD CONSTRAINT member_history_history_type_check CHECK (history_type IN (
  'cadastro', 'admissao', 'batismo', 'mudanca_situacao', 'mudanca_congregacao',
  'mudanca_setor', 'mudanca_organizacao', 'nomeacao', 'encerramento_funcao',
  'ordenacao', 'transferencia', 'ocorrencia', 'documento_emitido',
  'credencial_emitida', 'carta_emitida', 'certificado_emitido',
  'registro_importado', 'outro',
  -- Novos marcos institucionais (genéricos — reutilizáveis por Teologia):
  'matricula', 'inicio_formacao', 'conclusao_formacao', 'desligamento_formacao',
  'transferencia_turma'
));

-- register_member_history_event() precisa da MESMA lista na validação
-- interna (a função não lê a CHECK constraint do banco). CREATE OR REPLACE
-- preserva assinatura/param names/defaults — nenhum chamador existente
-- (triggers da Operação 1) quebra.
CREATE OR REPLACE FUNCTION public.register_member_history_event(
  p_member_id uuid,
  p_history_type text,
  p_title text,
  p_description text DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT now(),
  p_source_module text DEFAULT 'secretaria',
  p_source_table text DEFAULT NULL,
  p_source_id uuid DEFAULT NULL,
  p_document_id uuid DEFAULT NULL,
  p_attachment_path text DEFAULT NULL,
  p_visibility text DEFAULT 'normal',
  p_legacy_source text DEFAULT NULL,
  p_legacy_module text DEFAULT NULL,
  p_legacy_code text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id uuid;
  v_visibility text := COALESCE(p_visibility, 'normal');
  v_history_id uuid;
BEGIN
  IF p_history_type IS NULL OR p_history_type NOT IN (
    'cadastro', 'admissao', 'batismo', 'mudanca_situacao', 'mudanca_congregacao',
    'mudanca_setor', 'mudanca_organizacao', 'nomeacao', 'encerramento_funcao',
    'ordenacao', 'transferencia', 'ocorrencia', 'documento_emitido',
    'credencial_emitida', 'carta_emitida', 'certificado_emitido',
    'registro_importado', 'outro',
    'matricula', 'inicio_formacao', 'conclusao_formacao', 'desligamento_formacao',
    'transferencia_turma'
  ) THEN
    RAISE EXCEPTION 'invalid member history type: %', p_history_type;
  END IF;

  IF NULLIF(btrim(p_title), '') IS NULL THEN
    RAISE EXCEPTION 'member history title is required';
  END IF;

  IF COALESCE(p_source_module, 'secretaria') NOT IN (
    'secretaria', 'discipulado', 'teologia', 'missoes', 'sistema'
  ) THEN
    RAISE EXCEPTION 'invalid member history source module: %', p_source_module;
  END IF;

  IF v_visibility NOT IN ('normal', 'confidential') THEN
    RAISE EXCEPTION 'invalid member history visibility: %', v_visibility;
  END IF;

  IF (p_source_table IS NULL) <> (p_source_id IS NULL) THEN
    RAISE EXCEPTION 'source_table and source_id must be informed together';
  END IF;

  SELECT COALESCE(congregation_id, sector_id, organization_id) INTO v_org_id
  FROM public.members
  WHERE id = p_member_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'member % not found or has no organization', p_member_id;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    IF NOT public.has_org_access_permission(auth.uid(), v_org_id, 'members.write') THEN
      RAISE EXCEPTION 'access denied to register history for this member';
    END IF;

    IF v_visibility = 'confidential'
       AND NOT public.has_org_access_permission(auth.uid(), v_org_id, 'members.confidential') THEN
      RAISE EXCEPTION 'access denied to register confidential history for this member';
    END IF;
  END IF;

  INSERT INTO public.member_history (
    member_id, organization_id, history_type, title, description, occurred_at,
    source_module, source_table, source_id, document_id, attachment_path,
    visibility, created_by, legacy_source, legacy_module, legacy_code
  ) VALUES (
    p_member_id, v_org_id, p_history_type, btrim(p_title), p_description, COALESCE(p_occurred_at, now()),
    COALESCE(p_source_module, 'secretaria'), p_source_table, p_source_id, p_document_id, p_attachment_path,
    v_visibility, auth.uid(), p_legacy_source, p_legacy_module, p_legacy_code
  )
  RETURNING id INTO v_history_id;

  RETURN v_history_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_member_history_event(
  uuid, text, text, text, timestamptz, text, text, uuid, uuid, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_member_history_event(
  uuid, text, text, text, timestamptz, text, text, uuid, uuid, text, text, text, text, text
) TO service_role;

-- Helper interno do módulo. A função compartilhada da Secretaria exige
-- members.write, o que faria uma matrícula lançada por coordenador ou
-- professor autorizado falhar no trigger de histórico. Aqui a autorização é
-- reconfirmada no escopo da turma e a inserção continua append-only.
CREATE OR REPLACE FUNCTION public._register_discipleship_member_history(
  p_enrollment_id uuid,
  p_history_type text,
  p_title text,
  p_description text DEFAULT NULL,
  p_document_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_enrollment public.discipleship_enrollments%ROWTYPE;
  v_class public.discipleship_classes%ROWTYPE;
  v_member_org uuid;
  v_history_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_enrollment
  FROM public.discipleship_enrollments
  WHERE id = p_enrollment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'enrollment not found'; END IF;

  SELECT * INTO v_class
  FROM public.discipleship_classes
  WHERE id = v_enrollment.class_id;

  IF NOT public.can_operate_discipleship_class(auth.uid(), v_class.id, v_class.organization_id) THEN
    RAISE EXCEPTION 'access denied to register discipleship history';
  END IF;

  SELECT COALESCE(congregation_id, sector_id, organization_id)
    INTO v_member_org
  FROM public.members
  WHERE id = v_enrollment.member_id;

  IF v_member_org IS NULL
     OR NOT public.is_organization_descendant_or_self(v_class.organization_id, v_member_org) THEN
    RAISE EXCEPTION 'enrollment member is outside the class organization scope';
  END IF;

  IF p_history_type NOT IN (
    'matricula', 'inicio_formacao', 'conclusao_formacao',
    'desligamento_formacao', 'transferencia_turma', 'certificado_emitido'
  ) THEN
    RAISE EXCEPTION 'invalid discipleship history type: %', p_history_type;
  END IF;

  IF NULLIF(btrim(p_title), '') IS NULL THEN
    RAISE EXCEPTION 'discipleship history title is required';
  END IF;

  INSERT INTO public.member_history (
    member_id, organization_id, history_type, title, description, occurred_at,
    source_module, source_table, source_id, document_id, visibility,
    created_by, legacy_source, legacy_module, legacy_code
  ) VALUES (
    v_enrollment.member_id, v_member_org, p_history_type, btrim(p_title),
    p_description, now(), 'discipulado', 'discipleship_enrollments',
    v_enrollment.id, p_document_id, 'normal', auth.uid(),
    v_enrollment.legacy_source, v_enrollment.legacy_module,
    v_enrollment.legacy_code
  )
  RETURNING id INTO v_history_id;

  RETURN v_history_id;
END;
$$;

REVOKE ALL ON FUNCTION public._register_discipleship_member_history(
  uuid, text, text, text, uuid
) FROM PUBLIC, anon, authenticated;

-- Diretório mínimo para o módulo. Evita baixar CPF, telefone, e-mail e todos
-- os milhares de membros no navegador apenas para escolher um nome.
CREATE OR REPLACE FUNCTION public.search_discipleship_members(
  p_organization_id uuid,
  p_query text DEFAULT NULL,
  p_limit integer DEFAULT 30
)
RETURNS TABLE (
  id uuid,
  full_name text,
  known_name text,
  member_code text
)
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
      OR COALESCE(m.legacy_code, '') ILIKE ('%' || v_query || '%')
      OR COALESCE(m.legacy_registration, '') ILIKE ('%' || v_query || '%')
    )
  ORDER BY COALESCE(NULLIF(m.known_name, ''), m.full_name), m.full_name
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_discipleship_members(uuid, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_discipleship_members(uuid, text, integer)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_discipleship_member_labels(
  p_organization_id uuid,
  p_member_ids uuid[]
)
RETURNS TABLE (
  id uuid,
  full_name text,
  known_name text,
  member_code text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT public.has_org_access_permission(auth.uid(), p_organization_id, 'discipleship.read') THEN
    RAISE EXCEPTION 'access denied to discipleship member directory';
  END IF;
  IF p_member_ids IS NULL OR cardinality(p_member_ids) = 0 THEN RETURN; END IF;

  RETURN QUERY
  SELECT m.id, m.full_name, m.known_name, m.member_code
  FROM public.members m
  WHERE m.id = ANY(p_member_ids)
    AND public.is_organization_descendant_or_self(
          p_organization_id,
          COALESCE(m.congregation_id, m.sector_id, m.organization_id)
        )
  ORDER BY COALESCE(NULLIF(m.known_name, ''), m.full_name), m.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_discipleship_member_labels(uuid, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_discipleship_member_labels(uuid, uuid[])
  TO authenticated;

-- ── Contrato de emissão de certificado (elegibilidade + registro) ───────
-- A emissão VISUAL do certificado (PDF/layout) está fora do escopo desta
-- operação (ver docs/architecture/operacao-2-discipulado.md, pendências).
-- O que esta operação entrega é o CONTRATO: elegibilidade calculável
-- (get_discipleship_enrollment_progress + regras do curso) e o registro
-- auditado do evento quando um documento (emitido por fora, no módulo
-- Documentos já existente) é vinculado à matrícula concluída.
ALTER TABLE public.discipleship_enrollments
  ADD COLUMN IF NOT EXISTS certificate_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS certificate_issued_at timestamptz;

CREATE OR REPLACE FUNCTION public.mark_discipleship_certificate_issued(
  p_enrollment_id uuid,
  p_document_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.discipleship_enrollments%ROWTYPE;
  v_class public.discipleship_classes%ROWTYPE;
  v_course public.discipleship_courses%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT * INTO v_row FROM public.discipleship_enrollments WHERE id = p_enrollment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'enrollment not found';
  END IF;

  SELECT * INTO v_class FROM public.discipleship_classes WHERE id = v_row.class_id;
  SELECT * INTO v_course FROM public.discipleship_courses WHERE id = v_class.course_id;

  -- Emissão de certificado é decisão de quem administra o módulo — não é
  -- delegada a discipleship.teach mesmo que o professor esteja atribuído.
  IF NOT public.has_org_access_permission(auth.uid(), v_class.organization_id, 'discipleship.manage') THEN
    RAISE EXCEPTION 'access denied to issue certificate';
  END IF;

  IF v_row.status <> 'concluido' THEN
    RAISE EXCEPTION 'only concluded enrollments are eligible for a certificate';
  END IF;

  IF p_document_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.documents d
    WHERE d.id = p_document_id
      AND public.is_organization_descendant_or_self(d.organization_id, v_class.organization_id)
  ) THEN
    RAISE EXCEPTION 'document not found in the class organization tree';
  END IF;

  -- Repetir a mesma ação (duplo clique/retry de rede) é idempotente.
  IF v_row.certificate_document_id = p_document_id
     AND v_row.certificate_issued_at IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE public.discipleship_enrollments
  SET certificate_document_id = p_document_id, certificate_issued_at = now()
  WHERE id = p_enrollment_id;

  PERFORM public._register_discipleship_member_history(
    v_row.id, 'certificado_emitido',
    'Certificado emitido: ' || v_course.name,
    NULL, p_document_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_discipleship_certificate_issued(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_discipleship_certificate_issued(uuid, uuid) TO authenticated;

-- ── Trigger: marcos da matrícula viram evento na timeline compartilhada ──
CREATE OR REPLACE FUNCTION public._discipleship_enrollments_register_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_course_name text;
  v_class_name text;
  v_history_type text;
  v_title text;
BEGIN
  SELECT co.name, cl.name INTO v_course_name, v_class_name
  FROM public.discipleship_classes cl
  JOIN public.discipleship_courses co ON co.id = cl.course_id
  WHERE cl.id = NEW.class_id;

  IF TG_OP = 'INSERT' THEN
    v_history_type := 'matricula';
    v_title := 'Matrícula em Discipulado: ' || COALESCE(v_course_name, 'curso') || ' — ' || COALESCE(v_class_name, 'turma');
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    v_history_type := CASE
      WHEN NEW.status = 'ativo' THEN 'inicio_formacao'
      WHEN NEW.status = 'concluido' THEN 'conclusao_formacao'
      WHEN NEW.status IN ('desistente', 'cancelado') THEN 'desligamento_formacao'
      WHEN NEW.status = 'transferido' THEN 'transferencia_turma'
      ELSE NULL
    END;
    v_title := CASE v_history_type
      WHEN 'inicio_formacao' THEN 'Início da formação: ' || COALESCE(v_course_name, 'curso')
      WHEN 'conclusao_formacao' THEN 'Conclusão da formação: ' || COALESCE(v_course_name, 'curso')
      WHEN 'desligamento_formacao' THEN 'Desligamento da formação: ' || COALESCE(v_course_name, 'curso')
      WHEN 'transferencia_turma' THEN 'Transferência de turma: ' || COALESCE(v_course_name, 'curso')
      ELSE NULL
    END;
  ELSE
    RETURN NEW;
  END IF;

  IF v_history_type IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public._register_discipleship_member_history(
    NEW.id, v_history_type, v_title, NEW.administrative_notes, NULL
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS discipleship_enrollments_register_history_insert ON public.discipleship_enrollments;
CREATE TRIGGER discipleship_enrollments_register_history_insert
AFTER INSERT ON public.discipleship_enrollments
FOR EACH ROW EXECUTE FUNCTION public._discipleship_enrollments_register_history();

DROP TRIGGER IF EXISTS discipleship_enrollments_register_history_update ON public.discipleship_enrollments;
CREATE TRIGGER discipleship_enrollments_register_history_update
AFTER UPDATE OF status ON public.discipleship_enrollments
FOR EACH ROW EXECUTE FUNCTION public._discipleship_enrollments_register_history();

REVOKE ALL ON FUNCTION public._discipleship_enrollments_register_history() FROM PUBLIC, anon, authenticated;

-- ── Verificação final ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'discipleship_enrollments_register_history_insert'
  ) THEN
    RAISE EXCEPTION 'Migration discipleship_permissions_and_history: trigger de matricula nao foi criado';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'discipleship_enrollments_register_history_update'
  ) THEN
    RAISE EXCEPTION 'Migration discipleship_permissions_and_history: trigger de mudanca de status nao foi criado';
  END IF;
  IF to_regprocedure('public.mark_discipleship_certificate_issued(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Migration discipleship_permissions_and_history: mark_discipleship_certificate_issued nao foi criada';
  END IF;
  RAISE NOTICE 'Migration discipleship_permissions_and_history: catalogo estendido, funcao redefinida e triggers confirmados ✓';
END $$;

COMMIT;
