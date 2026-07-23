-- ============================================================================
-- Migration: discipleship_classes_and_enrollments
-- Timestamp: 20260729100000
-- OPERAÇÃO 2 — Discipulado completo sobre a fundação revisada do Ecclesia
-- ============================================================================
--
-- Turmas (coortes de um curso), equipe (coordenador/secretário/discipulador/
-- professor/auxiliar) e matrículas de membros existentes. Nenhuma pessoa é
-- criada aqui — member_id sempre referencia public.members.
--
-- NOTA DE DEPENDÊNCIA INTENCIONAL: a RPC update_discipleship_enrollment_status
-- (transição para 'concluido') consulta public.discipleship_attendance e
-- public.discipleship_assessment_results, criadas na migration seguinte
-- (20260729110000_discipleship_learning_records.sql). Isso é seguro: o corpo
-- de uma função PL/pgSQL não é validado contra a existência de tabelas no
-- momento do CREATE, apenas na primeira execução — e todas as migrations
-- desta operação são aplicadas em sequência antes de qualquer uso real.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.discipleship_courses') IS NULL THEN
    RAISE EXCEPTION 'discipleship_classes_and_enrollments preflight failed: discipleship_courses nao existe (aplique 20260729090000 primeiro)';
  END IF;
  IF to_regprocedure('public.is_organization_descendant_or_self(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'discipleship_classes_and_enrollments preflight failed: is_organization_descendant_or_self() nao existe';
  END IF;
END;
$$;

-- ── discipleship_classes (turmas/coortes de um curso) ────────────────────
CREATE TABLE IF NOT EXISTS public.discipleship_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.discipleship_courses(id) ON DELETE RESTRICT,
  -- Organização responsável pela turma (matriz, setor ou congregação).
  -- Validada por trigger contra a árvore da organização do curso — nunca uma
  -- hierarquia paralela, sempre public.organizations.
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES public.discipleship_locations(id) ON DELETE RESTRICT,

  code text,
  name text NOT NULL CHECK (btrim(name) <> ''),
  short_name text,

  start_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_end_date date,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  modality text NOT NULL DEFAULT 'presencial' CHECK (modality IN ('presencial', 'online', 'hibrida')),

  status text NOT NULL DEFAULT 'planejamento' CHECK (status IN (
    'planejamento', 'inscricoes_abertas', 'em_andamento', 'concluida', 'cancelada', 'arquivada'
  )),
  notes text,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (expected_end_date IS NULL OR expected_end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_discipleship_classes_org_status
  ON public.discipleship_classes (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_discipleship_classes_course
  ON public.discipleship_classes (course_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS discipleship_classes_org_code_idx
  ON public.discipleship_classes (organization_id, lower(btrim(code)))
  WHERE code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS discipleship_classes_legacy_unique_idx
  ON public.discipleship_classes (organization_id, legacy_source, COALESCE(legacy_module, ''), legacy_code)
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

DROP TRIGGER IF EXISTS update_discipleship_classes_updated_at ON public.discipleship_classes;
CREATE TRIGGER update_discipleship_classes_updated_at
BEFORE UPDATE ON public.discipleship_classes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- A turma deve pertencer à MESMA árvore organizacional do curso (pode ser a
-- própria organização do curso ou uma unidade subordinada) — nunca uma
-- organização de outra denominação/convenção, o que vazaria dados entre
-- tenants não relacionados.
CREATE OR REPLACE FUNCTION public._discipleship_classes_validate_org_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_course_org uuid;
  v_location_org uuid;
BEGIN
  SELECT organization_id INTO v_course_org FROM public.discipleship_courses WHERE id = NEW.course_id;
  IF v_course_org IS NULL THEN
    RAISE EXCEPTION 'course not found';
  END IF;

  IF NOT public.is_organization_descendant_or_self(v_course_org, NEW.organization_id) THEN
    RAISE EXCEPTION 'class organization must be the course organization or one of its descendants';
  END IF;

  IF NEW.location_id IS NOT NULL THEN
    SELECT organization_id INTO v_location_org
    FROM public.discipleship_locations
    WHERE id = NEW.location_id;

    IF v_location_org IS NULL THEN
      RAISE EXCEPTION 'discipleship location not found';
    END IF;

    IF NOT public.is_organization_descendant_or_self(v_location_org, NEW.organization_id) THEN
      RAISE EXCEPTION 'class location must belong to the class organization tree';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS discipleship_classes_validate_org_scope ON public.discipleship_classes;
CREATE TRIGGER discipleship_classes_validate_org_scope
BEFORE INSERT OR UPDATE ON public.discipleship_classes
FOR EACH ROW EXECUTE FUNCTION public._discipleship_classes_validate_org_scope();

REVOKE ALL ON FUNCTION public._discipleship_classes_validate_org_scope()
  FROM PUBLIC, anon, authenticated;

ALTER TABLE public.discipleship_classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "discipleship_classes capability select" ON public.discipleship_classes;
CREATE POLICY "discipleship_classes capability select" ON public.discipleship_classes
FOR SELECT TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'discipleship.read'));

DROP POLICY IF EXISTS "discipleship_classes capability insert" ON public.discipleship_classes;
CREATE POLICY "discipleship_classes capability insert" ON public.discipleship_classes
FOR INSERT TO authenticated
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'discipleship.manage'));

-- Campos operacionais (nome, datas, capacidade, local, notas) podem ser
-- editados diretamente por quem administra o módulo. `status` é
-- deliberadamente EXCLUÍDO da concessão de coluna abaixo — a máquina de
-- estados só é alterada pela RPC update_discipleship_class_status(), que
-- valida a transição e nunca aceita "turma concluída recebe lançamento
-- comum". Sem policy de DELETE: turma é histórico institucional (cancelada/
-- arquivada via status, nunca removida fisicamente).
DROP POLICY IF EXISTS "discipleship_classes capability update" ON public.discipleship_classes;
CREATE POLICY "discipleship_classes capability update" ON public.discipleship_classes
FOR UPDATE TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'discipleship.manage'))
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'discipleship.manage'));

REVOKE UPDATE ON public.discipleship_classes FROM authenticated;
GRANT UPDATE (
  location_id, code, name, short_name, start_date, expected_end_date, capacity, modality, notes
) ON public.discipleship_classes TO authenticated;

CREATE OR REPLACE FUNCTION public.update_discipleship_class_status(
  p_class_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.discipleship_classes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT * INTO v_row FROM public.discipleship_classes WHERE id = p_class_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'class not found';
  END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_row.organization_id, 'discipleship.manage') THEN
    RAISE EXCEPTION 'access denied to update class status';
  END IF;

  -- Máquina de estados: planejamento -> inscrições abertas -> em andamento
  -- -> concluída/cancelada. Arquivamento é terminal a partir de concluída ou
  -- cancelada. Reabertura (em_andamento -> volta de concluida/cancelada) é
  -- uma ação controlada e explícita, auditada por esta mesma RPC (nunca por
  -- UPDATE direto), e só é permitida a partir de 'concluida'/'cancelada'
  -- para 'em_andamento' (nunca para os estados iniciais).
  IF NOT (
    (v_row.status = 'planejamento' AND p_status IN ('inscricoes_abertas', 'cancelada'))
    OR (v_row.status = 'inscricoes_abertas' AND p_status IN ('em_andamento', 'cancelada'))
    OR (v_row.status = 'em_andamento' AND p_status IN ('concluida', 'cancelada'))
    OR (v_row.status IN ('concluida', 'cancelada') AND p_status = 'em_andamento') -- reabertura controlada
    OR (v_row.status IN ('concluida', 'cancelada') AND p_status = 'arquivada')
    OR v_row.status = p_status
  ) THEN
    RAISE EXCEPTION 'invalid class status transition: % -> %', v_row.status, p_status;
  END IF;

  IF p_status = 'concluida' THEN
    IF EXISTS (
      SELECT 1
      FROM public.discipleship_enrollments e
      WHERE e.class_id = p_class_id
        AND e.status IN ('lista_espera', 'matriculado', 'ativo')
    ) THEN
      RAISE EXCEPTION 'class cannot be concluded while enrollments are still open';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.discipleship_sessions s
      WHERE s.class_id = p_class_id AND s.status = 'agendada'
    ) THEN
      RAISE EXCEPTION 'class cannot be concluded while sessions are still scheduled';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.discipleship_assessments a
      WHERE a.class_id = p_class_id AND a.status = 'planejada'
    ) THEN
      RAISE EXCEPTION 'class cannot be concluded while assessments are still planned';
    END IF;
  END IF;

  UPDATE public.discipleship_classes SET status = p_status WHERE id = p_class_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_discipleship_class_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_discipleship_class_status(uuid, text) TO authenticated;

-- ── discipleship_staff_assignments (equipe da turma) ─────────────────────
CREATE TABLE IF NOT EXISTS public.discipleship_staff_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.discipleship_classes(id) ON DELETE RESTRICT,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,

  role text NOT NULL CHECK (role IN ('coordenador', 'secretario', 'discipulador', 'professor', 'auxiliar')),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'encerrado')),
  notes text,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (end_date IS NULL OR end_date >= start_date)
);

-- Uma pessoa não pode receber duas atribuições ativas idênticas (mesmo
-- papel) na mesma turma.
CREATE UNIQUE INDEX IF NOT EXISTS discipleship_staff_unique_active_idx
  ON public.discipleship_staff_assignments (class_id, member_id, role)
  WHERE status = 'ativo';

CREATE INDEX IF NOT EXISTS idx_discipleship_staff_member
  ON public.discipleship_staff_assignments (member_id, status);

DROP TRIGGER IF EXISTS update_discipleship_staff_assignments_updated_at ON public.discipleship_staff_assignments;
CREATE TRIGGER update_discipleship_staff_assignments_updated_at
BEFORE UPDATE ON public.discipleship_staff_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.discipleship_staff_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "discipleship_staff capability select" ON public.discipleship_staff_assignments;
CREATE POLICY "discipleship_staff capability select" ON public.discipleship_staff_assignments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.discipleship_classes c
    WHERE c.id = discipleship_staff_assignments.class_id
      AND public.has_org_access_permission(auth.uid(), c.organization_id, 'discipleship.read')
  )
);

-- Escrita somente por RPC: precisa validar o membro, evitar duplicidade
-- ativa (a unicidade de índice já protege, mas a RPC dá mensagem clara) e
-- impedir que o cliente encerre a atribuição por UPDATE direto sem
-- registrar end_date.
REVOKE INSERT, UPDATE, DELETE ON public.discipleship_staff_assignments FROM authenticated;
GRANT SELECT ON public.discipleship_staff_assignments TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_discipleship_staff(
  p_class_id uuid,
  p_member_id uuid,
  p_role text,
  p_start_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id uuid;
  v_member_org uuid;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT organization_id INTO v_org_id FROM public.discipleship_classes WHERE id = p_class_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'class not found';
  END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_org_id, 'discipleship.manage') THEN
    RAISE EXCEPTION 'access denied to assign staff';
  END IF;

  SELECT COALESCE(congregation_id, sector_id, organization_id)
    INTO v_member_org
  FROM public.members
  WHERE id = p_member_id;

  IF v_member_org IS NULL THEN RAISE EXCEPTION 'member not found'; END IF;

  IF NOT public.is_organization_descendant_or_self(v_org_id, v_member_org) THEN
    RAISE EXCEPTION 'staff member is outside the class organization scope';
  END IF;

  IF p_role NOT IN ('coordenador', 'secretario', 'discipulador', 'professor', 'auxiliar') THEN
    RAISE EXCEPTION 'invalid staff role: %', p_role;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.discipleship_staff_assignments
    WHERE class_id = p_class_id AND member_id = p_member_id AND role = p_role AND status = 'ativo'
  ) THEN
    RAISE EXCEPTION 'member already has an active assignment with this role in this class';
  END IF;

  INSERT INTO public.discipleship_staff_assignments (class_id, member_id, role, start_date, notes, created_by)
  VALUES (p_class_id, p_member_id, p_role, COALESCE(p_start_date, CURRENT_DATE), NULLIF(btrim(p_notes), ''), auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_discipleship_staff(uuid, uuid, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_discipleship_staff(uuid, uuid, text, date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.end_discipleship_staff_assignment(
  p_assignment_id uuid,
  p_end_date date DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.discipleship_staff_assignments%ROWTYPE;
  v_org_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT * INTO v_row FROM public.discipleship_staff_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'assignment not found';
  END IF;

  SELECT organization_id INTO v_org_id FROM public.discipleship_classes WHERE id = v_row.class_id;

  IF NOT public.has_org_access_permission(auth.uid(), v_org_id, 'discipleship.manage') THEN
    RAISE EXCEPTION 'access denied to end assignment';
  END IF;

  IF v_row.status <> 'ativo' THEN
    RAISE EXCEPTION 'assignment is not active';
  END IF;

  UPDATE public.discipleship_staff_assignments
  SET status = 'encerrado', end_date = COALESCE(p_end_date, CURRENT_DATE)
  WHERE id = p_assignment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.end_discipleship_staff_assignment(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_discipleship_staff_assignment(uuid, date) TO authenticated;

-- Helper reutilizado pelas RPCs de frequência/avaliação/acompanhamento
-- (migration seguinte) e pelo frontend (via RPC pública abaixo): true quando
-- o membro do usuário autenticado está atribuído (ativo) àquela turma.
-- Acesso operacional só existe quando members.user_id está vinculado à
-- conta autenticada — uma pessoa sem login pode constar como equipe (fato
-- histórico), mas não consegue lançar nada até ter uma conta vinculada.
CREATE OR REPLACE FUNCTION public._is_discipleship_class_staff(
  _user_id uuid,
  _class_id uuid,
  _roles text[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.discipleship_staff_assignments dsa
    JOIN public.members m ON m.id = dsa.member_id
    WHERE dsa.class_id = _class_id
      AND dsa.status = 'ativo'
      AND m.user_id = _user_id
      AND (_roles IS NULL OR dsa.role = ANY(_roles))
  );
$$;

REVOKE ALL ON FUNCTION public._is_discipleship_class_staff(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;

-- discipleship.manage sempre pode operar a turma; discipleship.teach só
-- opera turmas às quais a pessoa (via seu próprio user_id) está atribuída.
CREATE OR REPLACE FUNCTION public.can_operate_discipleship_class(
  _user_id uuid,
  _class_id uuid,
  _organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.has_org_access_permission(_user_id, _organization_id, 'discipleship.manage')
    OR (
      public.has_org_access_permission(_user_id, _organization_id, 'discipleship.teach')
      AND public._is_discipleship_class_staff(_user_id, _class_id)
    );
$$;

REVOKE ALL ON FUNCTION public.can_operate_discipleship_class(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── discipleship_enrollments (matrícula de um membro numa turma) ─────────
CREATE TABLE IF NOT EXISTS public.discipleship_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.discipleship_classes(id) ON DELETE RESTRICT,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  -- Organização efetiva do membro no momento da matrícula (snapshot para
  -- indexação/relatórios) — a AUTORIZAÇÃO real é sempre resolvida via a
  -- organização da turma (ver policies abaixo).
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,

  enrolled_at timestamptz NOT NULL DEFAULT now(),
  started_at date,
  completed_at date,
  status text NOT NULL DEFAULT 'matriculado' CHECK (status IN (
    'lista_espera', 'matriculado', 'ativo', 'concluido', 'desistente', 'transferido', 'cancelado'
  )),
  final_result text CHECK (final_result IS NULL OR final_result IN ('aprovado', 'reprovado', 'sem_avaliacao')),
  administrative_notes text,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Um membro não pode possuir matrícula ativa duplicada na mesma turma —
-- permite nova matrícula somente após a anterior encerrar (concluído/
-- desistente/transferido/cancelado).
CREATE UNIQUE INDEX IF NOT EXISTS discipleship_enrollments_unique_active_idx
  ON public.discipleship_enrollments (class_id, member_id)
  WHERE status IN ('lista_espera', 'matriculado', 'ativo');

CREATE INDEX IF NOT EXISTS idx_discipleship_enrollments_member
  ON public.discipleship_enrollments (member_id, status);
CREATE INDEX IF NOT EXISTS idx_discipleship_enrollments_class
  ON public.discipleship_enrollments (class_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS discipleship_enrollments_legacy_unique_idx
  ON public.discipleship_enrollments (class_id, legacy_source, COALESCE(legacy_module, ''), legacy_code)
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

DROP TRIGGER IF EXISTS update_discipleship_enrollments_updated_at ON public.discipleship_enrollments;
CREATE TRIGGER update_discipleship_enrollments_updated_at
BEFORE UPDATE ON public.discipleship_enrollments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.discipleship_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "discipleship_enrollments capability select" ON public.discipleship_enrollments;
CREATE POLICY "discipleship_enrollments capability select" ON public.discipleship_enrollments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.discipleship_classes c
    WHERE c.id = discipleship_enrollments.class_id
      AND public.has_org_access_permission(auth.uid(), c.organization_id, 'discipleship.read')
  )
);

-- Escrita somente por RPC — precisa validar capacidade/duplicidade/estado
-- da turma e, na conclusão, as regras de frequência/avaliação do curso.
REVOKE INSERT, UPDATE, DELETE ON public.discipleship_enrollments FROM authenticated;
GRANT SELECT ON public.discipleship_enrollments TO authenticated;

CREATE OR REPLACE FUNCTION public.enroll_member_in_class(
  p_class_id uuid,
  p_member_id uuid,
  p_status text DEFAULT 'matriculado'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_class public.discipleship_classes%ROWTYPE;
  v_member_org uuid;
  v_current_count integer;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- O lock serializa a verificação de capacidade com outras matrículas da
  -- mesma turma, impedindo ultrapassar o limite em requisições concorrentes.
  SELECT * INTO v_class
  FROM public.discipleship_classes
  WHERE id = p_class_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'class not found';
  END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_class.organization_id, 'discipleship.manage') THEN
    RAISE EXCEPTION 'access denied to enroll members';
  END IF;

  IF v_class.status IN ('concluida', 'cancelada', 'arquivada') THEN
    RAISE EXCEPTION 'class is closed and does not accept new enrollments';
  END IF;

  SELECT COALESCE(congregation_id, sector_id, organization_id) INTO v_member_org
  FROM public.members WHERE id = p_member_id;
  IF v_member_org IS NULL THEN
    RAISE EXCEPTION 'member not found';
  END IF;

  IF NOT public.is_organization_descendant_or_self(v_class.organization_id, v_member_org) THEN
    RAISE EXCEPTION 'member is outside the class organization scope';
  END IF;

  IF p_status NOT IN ('lista_espera', 'matriculado') THEN
    RAISE EXCEPTION 'new enrollments must start as lista_espera or matriculado';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.discipleship_enrollments
    WHERE class_id = p_class_id AND member_id = p_member_id
      AND status IN ('lista_espera', 'matriculado', 'ativo')
  ) THEN
    RAISE EXCEPTION 'member already has an active enrollment in this class';
  END IF;

  IF v_class.capacity IS NOT NULL AND p_status = 'matriculado' THEN
    SELECT count(*) INTO v_current_count
    FROM public.discipleship_enrollments
    WHERE class_id = p_class_id AND status IN ('matriculado', 'ativo');
    IF v_current_count >= v_class.capacity THEN
      RAISE EXCEPTION 'class has reached its capacity (%)', v_class.capacity;
    END IF;
  END IF;

  INSERT INTO public.discipleship_enrollments (class_id, member_id, organization_id, status, created_by)
  VALUES (p_class_id, p_member_id, v_member_org, p_status, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enroll_member_in_class(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enroll_member_in_class(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_discipleship_enrollment_status(
  p_enrollment_id uuid,
  p_status text,
  p_final_result text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_override_eligibility boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.discipleship_enrollments%ROWTYPE;
  v_course public.discipleship_courses%ROWTYPE;
  v_class public.discipleship_classes%ROWTYPE;
  v_total_sessions integer;
  v_launched_sessions integer;
  v_present_sessions integer;
  v_attendance_pct numeric;
  v_avg_score numeric;
  v_total_weight numeric;
  v_required_assessments integer;
  v_recorded_assessments integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT * INTO v_row FROM public.discipleship_enrollments WHERE id = p_enrollment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'enrollment not found';
  END IF;

  SELECT * INTO v_class
  FROM public.discipleship_classes
  WHERE id = v_row.class_id
  FOR UPDATE;
  SELECT * INTO v_course FROM public.discipleship_courses WHERE id = v_class.course_id;

  IF NOT public.can_operate_discipleship_class(auth.uid(), v_row.class_id, v_class.organization_id) THEN
    RAISE EXCEPTION 'access denied to update enrollment status';
  END IF;

  IF p_override_eligibility THEN
    IF p_status <> 'concluido' THEN
      RAISE EXCEPTION 'eligibility override is only valid for conclusion';
    END IF;
    IF NOT public.has_org_access_permission(auth.uid(), v_class.organization_id, 'discipleship.manage') THEN
      RAISE EXCEPTION 'only discipleship managers can override completion eligibility';
    END IF;
    IF NULLIF(btrim(p_notes), '') IS NULL THEN
      RAISE EXCEPTION 'override justification is required';
    END IF;
  END IF;

  IF NOT (
    (v_row.status = 'lista_espera' AND p_status IN ('matriculado', 'cancelado'))
    OR (v_row.status = 'matriculado' AND p_status IN ('ativo', 'desistente', 'transferido', 'cancelado'))
    OR (v_row.status = 'ativo' AND p_status IN ('concluido', 'desistente', 'transferido', 'cancelado'))
    OR v_row.status = p_status
  ) THEN
    RAISE EXCEPTION 'invalid enrollment status transition: % -> %', v_row.status, p_status;
  END IF;

  IF v_row.status = 'lista_espera'
     AND p_status = 'matriculado'
     AND v_class.capacity IS NOT NULL
     AND (
       SELECT count(*)
       FROM public.discipleship_enrollments e
       WHERE e.class_id = v_class.id
         AND e.id <> v_row.id
         AND e.status IN ('matriculado', 'ativo')
     ) >= v_class.capacity THEN
    RAISE EXCEPTION 'class has reached its capacity (%)', v_class.capacity;
  END IF;

  -- Conclusão não pode depender apenas de um botão livre: valida as regras
  -- configuradas no curso (frequência mínima e, se exigida, nota mínima),
  -- a menos que um coordenador/gestor (discipleship.manage) registre uma
  -- exceção explícita e justificada via p_override_eligibility.
  IF p_status = 'concluido' AND NOT p_override_eligibility THEN
    IF v_course.requires_attendance THEN
      SELECT count(*) INTO v_total_sessions
      FROM public.discipleship_sessions s
      WHERE s.class_id = v_class.id
        AND s.status = 'realizada'
        AND s.session_date >= v_row.enrolled_at::date;

      SELECT count(*) INTO v_launched_sessions
      FROM public.discipleship_sessions s
      JOIN public.discipleship_attendance a
        ON a.session_id = s.id
       AND a.enrollment_id = p_enrollment_id
       AND a.status IN ('presente', 'ausente', 'justificado')
      WHERE s.class_id = v_class.id
        AND s.status = 'realizada'
        AND s.session_date >= v_row.enrolled_at::date;

      SELECT count(*) INTO v_present_sessions
      FROM public.discipleship_sessions s
      JOIN public.discipleship_attendance a
        ON a.session_id = s.id
       AND a.enrollment_id = p_enrollment_id
       AND a.status IN ('presente', 'justificado')
      WHERE s.class_id = v_class.id
        AND s.status = 'realizada'
        AND s.session_date >= v_row.enrolled_at::date;

      v_attendance_pct := CASE WHEN v_total_sessions > 0 THEN (v_present_sessions::numeric / v_total_sessions) * 100 ELSE 0 END;

      IF v_total_sessions = 0 THEN
        RAISE EXCEPTION 'enrollment has no completed sessions to calculate attendance';
      END IF;

      IF v_launched_sessions <> v_total_sessions THEN
        RAISE EXCEPTION 'attendance is missing for % of % completed sessions',
          v_total_sessions - v_launched_sessions, v_total_sessions;
      END IF;

      IF v_attendance_pct < v_course.minimum_attendance_percentage THEN
        RAISE EXCEPTION 'enrollment does not meet minimum attendance (%.2f%% required, got %.2f%% over % completed sessions)',
          v_course.minimum_attendance_percentage, v_attendance_pct, v_total_sessions;
      END IF;
    END IF;

    IF v_course.requires_assessment THEN
      SELECT count(*) INTO v_required_assessments
      FROM public.discipleship_assessments a
      WHERE a.class_id = v_class.id AND a.status <> 'cancelada';

      SELECT count(*) INTO v_recorded_assessments
      FROM public.discipleship_assessments a
      JOIN public.discipleship_assessment_results r
        ON r.assessment_id = a.id AND r.enrollment_id = p_enrollment_id
      WHERE a.class_id = v_class.id AND a.status = 'aplicada';

      IF v_required_assessments = 0 THEN
        RAISE EXCEPTION 'course requires assessment but this class has no active assessments';
      END IF;

      IF v_recorded_assessments <> v_required_assessments THEN
        RAISE EXCEPTION 'assessment results are incomplete (% of % recorded)',
          v_recorded_assessments, v_required_assessments;
      END IF;

      SELECT sum(((r.score / a.max_score) * 10) * a.weight) / NULLIF(sum(a.weight), 0), sum(a.weight)
        INTO v_avg_score, v_total_weight
      FROM public.discipleship_assessment_results r
      JOIN public.discipleship_assessments a ON a.id = r.assessment_id
      WHERE r.enrollment_id = p_enrollment_id
        AND a.class_id = v_class.id
        AND a.status = 'aplicada';

      IF v_total_weight IS NULL OR v_total_weight = 0 OR v_avg_score < v_course.minimum_passing_score THEN
        RAISE EXCEPTION 'enrollment does not meet minimum passing score (%.2f required, got %)',
          v_course.minimum_passing_score, COALESCE(v_avg_score::text, 'no results');
      END IF;
    END IF;
  END IF;

  IF p_final_result IS NOT NULL AND p_final_result NOT IN ('aprovado', 'reprovado', 'sem_avaliacao') THEN
    RAISE EXCEPTION 'invalid final_result: %', p_final_result;
  END IF;

  UPDATE public.discipleship_enrollments
  SET status = p_status,
      final_result = COALESCE(
        p_final_result,
        CASE WHEN p_status = 'concluido' THEN 'aprovado' ELSE final_result END
      ),
      administrative_notes = COALESCE(NULLIF(btrim(p_notes), ''), administrative_notes),
      started_at = CASE WHEN p_status = 'ativo' AND started_at IS NULL THEN CURRENT_DATE ELSE started_at END,
      completed_at = CASE WHEN p_status IN ('concluido', 'desistente', 'cancelado') AND completed_at IS NULL THEN CURRENT_DATE ELSE completed_at END
  WHERE id = p_enrollment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_discipleship_enrollment_status(uuid, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_discipleship_enrollment_status(uuid, text, text, text, boolean) TO authenticated;

-- ── Verificação final ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'discipleship_classes') THEN
    RAISE EXCEPTION 'Migration discipleship_classes_and_enrollments: tabela discipleship_classes nao foi criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'discipleship_enrollments') THEN
    RAISE EXCEPTION 'Migration discipleship_classes_and_enrollments: tabela discipleship_enrollments nao foi criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'discipleship_classes_validate_org_scope') THEN
    RAISE EXCEPTION 'Migration discipleship_classes_and_enrollments: trigger de validacao de escopo organizacional nao foi criado';
  END IF;
  RAISE NOTICE 'Migration discipleship_classes_and_enrollments: tabelas, policies, RPCs e triggers confirmados ✓';
END $$;

COMMIT;
