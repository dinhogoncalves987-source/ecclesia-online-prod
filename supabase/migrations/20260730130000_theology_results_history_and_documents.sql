-- ============================================================================
-- Migration: theology_results_history_and_documents
-- Timestamp: 20260730130000
-- OPERAÇÃO 3 — Teologia completa sobre a fundação revisada do Ecclesia
-- ============================================================================
--
-- Liga theology_enrollments à MESMA timeline institucional compartilhada
-- (public.member_history) via register_member_history_event() — reaproveita
-- os 5 marcos genéricos já criados pela Operação 2 (matricula,
-- inicio_formacao, conclusao_formacao, desligamento_formacao,
-- transferencia_turma) e o marco certificado_emitido (Operação 1). NENHUMA
-- extensão de catálogo é necessária — a CHECK de member_history.history_type
-- já cobre todos os valores usados aqui (ver
-- 20260729120000_discipleship_permissions_and_history.sql).
--
-- Também entrega: diretório mínimo de membros (busca server-side), contrato
-- de certificado idempotente, e RPCs de leitura DERIVADA para boletim/
-- histórico de unidades concluídas/formandos — nada disso é persistido como
-- tabela de relatório (ver prompt da operação, §8: "não persista relatórios
-- que possam ser derivados").
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.member_history') IS NULL THEN
    RAISE EXCEPTION 'theology_results_history_and_documents preflight failed: public.member_history nao existe (Operacao 1)';
  END IF;
  IF to_regclass('public.theology_enrollments') IS NULL THEN
    RAISE EXCEPTION 'theology_results_history_and_documents preflight failed: theology_enrollments nao existe';
  END IF;
  IF to_regprocedure('public.register_member_history_event(uuid,text,text,text,timestamptz,text,text,uuid,uuid,text,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'theology_results_history_and_documents preflight failed: register_member_history_event() nao existe (Operacao 1)';
  END IF;
  IF to_regprocedure('public.can_operate_theology_class(uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'theology_results_history_and_documents preflight failed: can_operate_theology_class() nao existe';
  END IF;
END;
$$;

-- ── Helper interno: registra marcos de Teologia na timeline compartilhada ─
-- Mesmo motivo do helper equivalente do Discipulado: register_member_history_
-- event() exige members.write, o que faria uma matrícula lançada por
-- coordenador/secretário/professor autorizado (mas sem members.write) falhar
-- no trigger. Aqui a autorização é reconfirmada no escopo da turma.
CREATE OR REPLACE FUNCTION public._register_theology_member_history(
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
  v_enrollment public.theology_enrollments%ROWTYPE;
  v_class public.theology_classes%ROWTYPE;
  v_member_org uuid;
  v_history_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_enrollment FROM public.theology_enrollments WHERE id = p_enrollment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'enrollment not found'; END IF;

  SELECT * INTO v_class FROM public.theology_classes WHERE id = v_enrollment.class_id;

  IF NOT public.can_operate_theology_class(auth.uid(), v_class.id, v_class.organization_id) THEN
    RAISE EXCEPTION 'access denied to register theology history';
  END IF;

  SELECT COALESCE(congregation_id, sector_id, organization_id) INTO v_member_org
  FROM public.members WHERE id = v_enrollment.member_id;

  IF v_member_org IS NULL
     OR NOT public.is_organization_descendant_or_self(v_class.organization_id, v_member_org) THEN
    RAISE EXCEPTION 'enrollment member is outside the class organization scope';
  END IF;

  IF p_history_type NOT IN (
    'matricula', 'inicio_formacao', 'conclusao_formacao',
    'desligamento_formacao', 'transferencia_turma', 'certificado_emitido'
  ) THEN
    RAISE EXCEPTION 'invalid theology history type: %', p_history_type;
  END IF;

  IF NULLIF(btrim(p_title), '') IS NULL THEN
    RAISE EXCEPTION 'theology history title is required';
  END IF;

  INSERT INTO public.member_history (
    member_id, organization_id, history_type, title, description, occurred_at,
    source_module, source_table, source_id, document_id, visibility,
    created_by, legacy_source, legacy_module, legacy_code
  ) VALUES (
    v_enrollment.member_id, v_member_org, p_history_type, btrim(p_title),
    p_description, now(), 'teologia', 'theology_enrollments',
    v_enrollment.id, p_document_id, 'normal', auth.uid(),
    v_enrollment.legacy_source, v_enrollment.legacy_module, v_enrollment.legacy_code
  )
  RETURNING id INTO v_history_id;

  RETURN v_history_id;
END;
$$;

REVOKE ALL ON FUNCTION public._register_theology_member_history(uuid, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;

-- ── Trigger: marcos da matrícula viram evento na timeline compartilhada ──
CREATE OR REPLACE FUNCTION public._theology_enrollments_register_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_program_name text;
  v_class_name text;
  v_history_type text;
  v_title text;
BEGIN
  SELECT p.name, c.name INTO v_program_name, v_class_name
  FROM public.theology_classes c
  JOIN public.theology_programs p ON p.id = c.program_id
  WHERE c.id = NEW.class_id;

  IF TG_OP = 'INSERT' THEN
    v_history_type := 'matricula';
    v_title := 'Matrícula em Teologia: ' || COALESCE(v_program_name, 'programa') || ' — ' || COALESCE(v_class_name, 'turma');
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    v_history_type := CASE
      WHEN NEW.status = 'ativo' THEN 'inicio_formacao'
      WHEN NEW.status = 'concluido' THEN 'conclusao_formacao'
      WHEN NEW.status IN ('reprovado', 'desistente', 'cancelado') THEN 'desligamento_formacao'
      WHEN NEW.status = 'transferido' THEN 'transferencia_turma'
      ELSE NULL
    END;
    v_title := CASE v_history_type
      WHEN 'inicio_formacao' THEN 'Início da formação: ' || COALESCE(v_program_name, 'programa')
      WHEN 'conclusao_formacao' THEN 'Conclusão da formação: ' || COALESCE(v_program_name, 'programa')
      WHEN 'desligamento_formacao' THEN 'Desligamento da formação: ' || COALESCE(v_program_name, 'programa')
      WHEN 'transferencia_turma' THEN 'Transferência de turma: ' || COALESCE(v_program_name, 'programa')
      ELSE NULL
    END;
  ELSE
    RETURN NEW;
  END IF;

  IF v_history_type IS NULL THEN RETURN NEW; END IF;

  PERFORM public._register_theology_member_history(NEW.id, v_history_type, v_title, NEW.administrative_notes, NULL);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS theology_enrollments_register_history_insert ON public.theology_enrollments;
CREATE TRIGGER theology_enrollments_register_history_insert
AFTER INSERT ON public.theology_enrollments
FOR EACH ROW EXECUTE FUNCTION public._theology_enrollments_register_history();

DROP TRIGGER IF EXISTS theology_enrollments_register_history_update ON public.theology_enrollments;
CREATE TRIGGER theology_enrollments_register_history_update
AFTER UPDATE OF status ON public.theology_enrollments
FOR EACH ROW EXECUTE FUNCTION public._theology_enrollments_register_history();

REVOKE ALL ON FUNCTION public._theology_enrollments_register_history() FROM PUBLIC, anon, authenticated;

-- ── Diretório mínimo de membros (busca server-side) ──────────────────────
CREATE OR REPLACE FUNCTION public.search_theology_members(
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
      OR COALESCE(m.legacy_code, '') ILIKE ('%' || v_query || '%')
      OR COALESCE(m.legacy_registration, '') ILIKE ('%' || v_query || '%')
    )
  ORDER BY COALESCE(NULLIF(m.known_name, ''), m.full_name), m.full_name
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_theology_members(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_theology_members(uuid, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_theology_member_labels(
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
  IF NOT public.has_org_access_permission(auth.uid(), p_organization_id, 'theology.read') THEN
    RAISE EXCEPTION 'access denied to theology member directory';
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

REVOKE ALL ON FUNCTION public.get_theology_member_labels(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_theology_member_labels(uuid, uuid[]) TO authenticated;

-- ── Contrato de emissão de certificado (elegibilidade + registro) ───────
-- Mesmo contrato do Discipulado: a emissão VISUAL (PDF/layout) está fora do
-- escopo desta operação. O que é entregue é elegibilidade calculável
-- (nenhuma unidade obrigatória pendente, matrícula concluída) + registro
-- auditado quando um documento (emitido por fora, no módulo Documentos já
-- existente) é vinculado à matrícula concluída.
ALTER TABLE public.theology_enrollments
  ADD COLUMN IF NOT EXISTS certificate_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS certificate_issued_at timestamptz;

CREATE OR REPLACE FUNCTION public.mark_theology_certificate_issued(
  p_enrollment_id uuid,
  p_document_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.theology_enrollments%ROWTYPE;
  v_class public.theology_classes%ROWTYPE;
  v_program public.theology_programs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_row FROM public.theology_enrollments WHERE id = p_enrollment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'enrollment not found'; END IF;

  SELECT * INTO v_class FROM public.theology_classes WHERE id = v_row.class_id;
  SELECT * INTO v_program FROM public.theology_programs WHERE id = v_class.program_id;

  -- Emissão de certificado é decisão de quem administra o módulo — não
  -- delegada a theology.teach mesmo que o professor esteja atribuído.
  IF NOT public.has_org_access_permission(auth.uid(), v_class.organization_id, 'theology.manage') THEN
    RAISE EXCEPTION 'access denied to issue certificate';
  END IF;

  IF v_row.status <> 'concluido' THEN
    RAISE EXCEPTION 'only concluded enrollments are eligible for a certificate';
  END IF;

  IF p_document_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = p_document_id
      AND public.is_organization_descendant_or_self(d.organization_id, v_class.organization_id)
  ) THEN
    RAISE EXCEPTION 'document not found in the class organization tree';
  END IF;

  -- Repetir a mesma ação (duplo clique/retry de rede) é idempotente.
  IF v_row.certificate_document_id = p_document_id AND v_row.certificate_issued_at IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE public.theology_enrollments
  SET certificate_document_id = p_document_id, certificate_issued_at = now()
  WHERE id = p_enrollment_id;

  PERFORM public._register_theology_member_history(
    v_row.id, 'certificado_emitido', 'Certificado emitido: ' || COALESCE(v_program.name, 'programa'),
    NULL, p_document_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_theology_certificate_issued(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_theology_certificate_issued(uuid, uuid) TO authenticated;

-- ── Boletim / histórico de unidades concluídas (leitura derivada) ───────
-- Nunca persistido — sempre calculado sobre as tabelas reais no momento da
-- consulta (§8 do prompt da operação: "não persista relatórios que possam
-- ser derivados").
CREATE OR REPLACE FUNCTION public.get_theology_student_transcript(
  p_member_id uuid,
  p_organization_id uuid
)
RETURNS TABLE (
  enrollment_id uuid,
  class_id uuid,
  class_name text,
  program_name text,
  enrollment_status text,
  offering_enrollment_id uuid,
  subject_name text,
  attempt_number integer,
  offering_status text,
  final_grade numeric,
  final_result text,
  is_mandatory boolean,
  completed_at date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT public.has_org_access_permission(auth.uid(), p_organization_id, 'theology.read') THEN
    RAISE EXCEPTION 'access denied to theology transcript';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = p_member_id
      AND public.is_organization_descendant_or_self(
            p_organization_id, COALESCE(m.congregation_id, m.sector_id, m.organization_id)
          )
  ) THEN
    RAISE EXCEPTION 'member not found in this organization scope';
  END IF;

  RETURN QUERY
  SELECT
    e.id, e.class_id, c.name, p.name, e.status,
    oe.id, s.name, oe.attempt_number, oe.status, oe.final_grade, oe.final_result,
    ci.is_mandatory, oe.completed_at
  FROM public.theology_enrollments e
  JOIN public.theology_classes c ON c.id = e.class_id
  JOIN public.theology_programs p ON p.id = c.program_id
  LEFT JOIN public.theology_offering_enrollments oe ON oe.enrollment_id = e.id
  LEFT JOIN public.theology_class_offerings o ON o.id = oe.offering_id
  LEFT JOIN public.theology_curriculum_items ci ON ci.id = o.curriculum_item_id
  LEFT JOIN public.theology_subjects s ON s.id = ci.subject_id
  WHERE e.member_id = p_member_id
    AND public.has_org_access_permission(auth.uid(), c.organization_id, 'theology.read')
  ORDER BY e.enrolled_at DESC, oe.attempt_number ASC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.get_theology_student_transcript(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_theology_student_transcript(uuid, uuid) TO authenticated;

-- ── Formandos no período letivo (leitura derivada) ───────────────────────
-- Elegível = todas as unidades obrigatórias ativas do programa concluídas
-- com aprovação e matrícula em situação compatível (ativo/concluido). A
-- formatura NÃO depende de pagamento — nenhuma regra financeira foi
-- encontrada no legado real que condicione isso automaticamente (ver
-- docs/architecture/operacao-3-teologia.md, limitações).
CREATE OR REPLACE FUNCTION public.list_theology_period_graduates(p_period_id uuid)
RETURNS TABLE (
  enrollment_id uuid,
  member_id uuid,
  class_id uuid,
  class_name text,
  program_name text,
  enrollment_status text,
  already_concluded boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT organization_id INTO v_org_id FROM public.theology_periods WHERE id = p_period_id;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'period not found'; END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_org_id, 'theology.read') THEN
    RAISE EXCEPTION 'access denied to graduates list';
  END IF;

  RETURN QUERY
  SELECT e.id, e.member_id, e.class_id, c.name, p.name, e.status, (e.status = 'concluido')
  FROM public.theology_enrollments e
  JOIN public.theology_classes c ON c.id = e.class_id
  JOIN public.theology_programs p ON p.id = c.program_id
  WHERE c.period_id = p_period_id
    AND e.status IN ('ativo', 'concluido')
    AND NOT EXISTS (
      SELECT 1 FROM public.theology_curriculum_items ci
      WHERE ci.program_id = p.id AND ci.is_mandatory AND ci.status = 'ativo'
        AND NOT EXISTS (
          SELECT 1 FROM public.theology_offering_enrollments oe
          JOIN public.theology_class_offerings o ON o.id = oe.offering_id
          WHERE oe.enrollment_id = e.id AND o.curriculum_item_id = ci.id
            AND oe.status = 'concluida' AND oe.final_result = 'aprovado'
        )
    )
  ORDER BY c.name, p.name;
END;
$$;

REVOKE ALL ON FUNCTION public.list_theology_period_graduates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_theology_period_graduates(uuid) TO authenticated;

-- ── Verificação final ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'theology_enrollments_register_history_insert'
  ) THEN
    RAISE EXCEPTION 'Migration theology_results_history_and_documents: trigger de matricula nao foi criado';
  END IF;
  IF to_regprocedure('public.mark_theology_certificate_issued(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Migration theology_results_history_and_documents: mark_theology_certificate_issued nao foi criada';
  END IF;
  IF to_regprocedure('public.get_theology_student_transcript(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Migration theology_results_history_and_documents: get_theology_student_transcript nao foi criada';
  END IF;
  RAISE NOTICE 'Migration theology_results_history_and_documents: historico, certificado e leituras derivadas confirmados ✓';
END $$;

COMMIT;
