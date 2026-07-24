-- ============================================================================
-- Migration: missions_history_and_reports
-- Timestamp: 20260731140000
-- OPERAÇÃO 4 — Missões completa sobre a fundação revisada do Ecclesia
-- ============================================================================
--
-- Estende o catálogo FECHADO de public.member_history.history_type (criado
-- na Operação 1, já estendido pela Operação 2) com os 4 marcos
-- institucionais de Missões auditados no contrato da operação — nenhum
-- outro tipo genérico de formação se aplica à semântica de envio/retorno
-- missionário, por isso a extensão é justificada (não reaproveita
-- matricula/inicio_formacao/etc. de Discipulado/Teologia).
--
-- Também entrega: diretório mínimo de membros (busca server-side) e RPCs de
-- leitura DERIVADA para os relatórios do contrato (§12) — nada é persistido
-- como tabela de relatório.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.member_history') IS NULL THEN v_missing := array_append(v_missing, 'public.member_history'); END IF;
  IF to_regclass('public.missions_missionaries') IS NULL THEN v_missing := array_append(v_missing, 'public.missions_missionaries'); END IF;
  IF to_regclass('public.missions_project_assignments') IS NULL THEN v_missing := array_append(v_missing, 'public.missions_project_assignments'); END IF;
  IF to_regclass('public.missions_commitment_installments') IS NULL THEN v_missing := array_append(v_missing, 'public.missions_commitment_installments'); END IF;
  IF to_regclass('public.missions_transaction_links') IS NULL THEN v_missing := array_append(v_missing, 'public.missions_transaction_links'); END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'missions_history_and_reports preflight failed; missing: %', array_to_string(v_missing, ', ');
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
  'matricula', 'inicio_formacao', 'conclusao_formacao', 'desligamento_formacao',
  'transferencia_turma',
  -- OPERAÇÃO 4 (Missões) — marcos de atividade missionária, semanticamente
  -- distintos dos marcos de formação de Discipulado/Teologia.
  'envio_missionario', 'retorno_missionario', 'encerramento_atividade_missionaria',
  'vinculacao_projeto_missionario'
));

-- Mesmo motivo do Discipulado/Teologia: register_member_history_event() é
-- SECURITY DEFINER e sua ÚNICA lista de validação precisa refletir o
-- catálogo real, mesmo que Missões grave via helper próprio abaixo (defesa
-- em profundidade — nenhum outro caminho de escrita quebra).
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
    'transferencia_turma',
    'envio_missionario', 'retorno_missionario', 'encerramento_atividade_missionaria',
    'vinculacao_projeto_missionario'
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

-- ── Helper interno: registra marcos de Missões na timeline compartilhada ─
-- register_member_history_event() exige members.write, o que faria um
-- coordenador de Missões autorizado (missions.manage) mas sem members.write
-- falhar. Reconfirma a autorização no escopo de Missões, mesmo padrão de
-- _register_theology_member_history/_register_discipleship_member_history.
CREATE OR REPLACE FUNCTION public._register_missions_member_history(
  p_member_id uuid,
  p_organization_id uuid,
  p_history_type text,
  p_title text,
  p_description text DEFAULT NULL,
  p_source_table text DEFAULT NULL,
  p_source_id uuid DEFAULT NULL,
  p_document_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member_org uuid;
  v_history_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  IF NOT public.has_org_access_permission(auth.uid(), p_organization_id, 'missions.manage') THEN
    RAISE EXCEPTION 'access denied to register missions history';
  END IF;

  IF p_history_type NOT IN (
    'envio_missionario', 'retorno_missionario', 'encerramento_atividade_missionaria',
    'vinculacao_projeto_missionario'
  ) THEN
    RAISE EXCEPTION 'invalid missions history type: %', p_history_type;
  END IF;

  IF NULLIF(btrim(p_title), '') IS NULL THEN
    RAISE EXCEPTION 'missions history title is required';
  END IF;

  SELECT COALESCE(congregation_id, sector_id, organization_id) INTO v_member_org
  FROM public.members WHERE id = p_member_id;

  IF v_member_org IS NULL OR NOT public.is_organization_descendant_or_self(p_organization_id, v_member_org) THEN
    RAISE EXCEPTION 'member is outside the missions organization scope';
  END IF;

  INSERT INTO public.member_history (
    member_id, organization_id, history_type, title, description, occurred_at,
    source_module, source_table, source_id, document_id, visibility, created_by
  ) VALUES (
    p_member_id, v_member_org, p_history_type, btrim(p_title), p_description, now(),
    'missoes', p_source_table, p_source_id, p_document_id, 'normal', auth.uid()
  )
  RETURNING id INTO v_history_id;

  RETURN v_history_id;
END;
$$;

REVOKE ALL ON FUNCTION public._register_missions_member_history(
  uuid, uuid, text, text, text, text, uuid, uuid
) FROM PUBLIC, anon, authenticated;

-- ── Trigger: transições do missionário geram marcos na timeline ─────────
CREATE OR REPLACE FUNCTION public._missions_missionaries_register_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_history_type text;
  v_title text;
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_history_type := CASE
    WHEN NEW.status = 'ativo' AND OLD.status = 'em_preparacao' THEN 'envio_missionario'
    WHEN NEW.status = 'retornado' THEN 'retorno_missionario'
    WHEN NEW.status = 'encerrado' THEN 'encerramento_atividade_missionaria'
    ELSE NULL
  END;

  IF v_history_type IS NULL THEN RETURN NEW; END IF;

  v_title := CASE v_history_type
    WHEN 'envio_missionario' THEN 'Envio missionário'
    WHEN 'retorno_missionario' THEN 'Retorno missionário'
    WHEN 'encerramento_atividade_missionaria' THEN 'Encerramento de atividade missionária'
  END;

  PERFORM public._register_missions_member_history(
    NEW.member_id, NEW.organization_id, v_history_type, v_title, NEW.public_notes,
    'missions_missionaries', NEW.id, NULL
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS missions_missionaries_register_history ON public.missions_missionaries;
CREATE TRIGGER missions_missionaries_register_history
AFTER UPDATE OF status ON public.missions_missionaries
FOR EACH ROW EXECUTE FUNCTION public._missions_missionaries_register_history();

REVOKE ALL ON FUNCTION public._missions_missionaries_register_history() FROM PUBLIC, anon, authenticated;

-- ── Trigger: vínculo de missionário a um projeto gera marco na timeline ─
CREATE OR REPLACE FUNCTION public._missions_project_assignments_register_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project_name text;
  v_org_id uuid;
BEGIN
  IF NEW.role <> 'missionario' THEN RETURN NEW; END IF;

  SELECT name, organization_id INTO v_project_name, v_org_id
  FROM public.missions_projects WHERE id = NEW.project_id;

  PERFORM public._register_missions_member_history(
    NEW.member_id, v_org_id, 'vinculacao_projeto_missionario',
    'Vinculação ao projeto missionário: ' || COALESCE(v_project_name, 'projeto'),
    NEW.notes, 'missions_project_assignments', NEW.id, NULL
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS missions_project_assignments_register_history ON public.missions_project_assignments;
CREATE TRIGGER missions_project_assignments_register_history
AFTER INSERT ON public.missions_project_assignments
FOR EACH ROW EXECUTE FUNCTION public._missions_project_assignments_register_history();

REVOKE ALL ON FUNCTION public._missions_project_assignments_register_history() FROM PUBLIC, anon, authenticated;

-- ── Diretório mínimo de membros (busca server-side) ──────────────────────
CREATE OR REPLACE FUNCTION public.search_missions_members(
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
  IF NOT public.has_org_access_permission(auth.uid(), p_organization_id, 'missions.read') THEN
    RAISE EXCEPTION 'access denied to missions member directory';
  END IF;

  RETURN QUERY
  SELECT m.id, m.full_name, m.known_name, m.member_code
  FROM public.members m
  WHERE public.is_organization_descendant_or_self(
          p_organization_id, COALESCE(m.congregation_id, m.sector_id, m.organization_id)
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

REVOKE ALL ON FUNCTION public.search_missions_members(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_missions_members(uuid, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_missions_member_labels(
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
  IF NOT public.has_org_access_permission(auth.uid(), p_organization_id, 'missions.read') THEN
    RAISE EXCEPTION 'access denied to missions member directory';
  END IF;
  IF p_member_ids IS NULL OR cardinality(p_member_ids) = 0 THEN RETURN; END IF;

  RETURN QUERY
  SELECT m.id, m.full_name, m.known_name, m.member_code
  FROM public.members m
  WHERE m.id = ANY(p_member_ids)
    AND public.is_organization_descendant_or_self(
          p_organization_id, COALESCE(m.congregation_id, m.sector_id, m.organization_id)
        )
  ORDER BY COALESCE(NULLIF(m.known_name, ''), m.full_name), m.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_missions_member_labels(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_missions_member_labels(uuid, uuid[]) TO authenticated;

-- ── Relatórios derivados (contrato §12) ──────────────────────────────────
-- Nunca persistidos — sempre calculados sobre as tabelas reais no momento
-- da consulta, revalidando o escopo organizacional de cada linha.

-- Visão geral: contagens por situação, projetos ativos, apoiadores ativos,
-- parcelas pendentes/atrasadas e comparação previsto × realizado.
CREATE OR REPLACE FUNCTION public.get_missions_dashboard_summary(p_organization_id uuid)
RETURNS TABLE (
  missionaries_candidato bigint,
  missionaries_em_preparacao bigint,
  missionaries_ativo bigint,
  missionaries_em_licenca bigint,
  missionaries_retornado bigint,
  missionaries_encerrado bigint,
  projects_ativo bigint,
  projects_planejado bigint,
  supporters_ativo bigint,
  commitments_ativo bigint,
  installments_pending_count bigint,
  installments_pending_amount numeric,
  installments_overdue_count bigint,
  installments_overdue_amount numeric,
  expected_total_amount numeric,
  received_total_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT public.has_org_access_permission(auth.uid(), p_organization_id, 'missions.read') THEN
    RAISE EXCEPTION 'access denied to missions dashboard';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.missions_missionaries mm WHERE mm.organization_id = p_organization_id AND mm.status = 'candidato'),
    (SELECT COUNT(*) FROM public.missions_missionaries mm WHERE mm.organization_id = p_organization_id AND mm.status = 'em_preparacao'),
    (SELECT COUNT(*) FROM public.missions_missionaries mm WHERE mm.organization_id = p_organization_id AND mm.status = 'ativo'),
    (SELECT COUNT(*) FROM public.missions_missionaries mm WHERE mm.organization_id = p_organization_id AND mm.status = 'em_licenca'),
    (SELECT COUNT(*) FROM public.missions_missionaries mm WHERE mm.organization_id = p_organization_id AND mm.status = 'retornado'),
    (SELECT COUNT(*) FROM public.missions_missionaries mm WHERE mm.organization_id = p_organization_id AND mm.status = 'encerrado'),
    (SELECT COUNT(*) FROM public.missions_projects mp WHERE mp.organization_id = p_organization_id AND mp.status = 'ativo'),
    (SELECT COUNT(*) FROM public.missions_projects mp WHERE mp.organization_id = p_organization_id AND mp.status = 'planejado'),
    (SELECT COUNT(*) FROM public.missions_supporters ms WHERE ms.organization_id = p_organization_id AND ms.status = 'ativo'),
    (SELECT COUNT(*) FROM public.missions_supporter_commitments mc WHERE mc.organization_id = p_organization_id AND mc.status = 'ativo'),
    (SELECT COUNT(*) FROM public.missions_commitment_installments mi WHERE mi.organization_id = p_organization_id AND mi.status IN ('previsto', 'pendente')),
    (SELECT COALESCE(SUM(mi.expected_amount - mi.paid_amount), 0) FROM public.missions_commitment_installments mi WHERE mi.organization_id = p_organization_id AND mi.status IN ('previsto', 'pendente')),
    (SELECT COUNT(*) FROM public.missions_commitment_installments mi WHERE mi.organization_id = p_organization_id AND mi.status = 'atrasado'),
    (SELECT COALESCE(SUM(mi.expected_amount - mi.paid_amount), 0) FROM public.missions_commitment_installments mi WHERE mi.organization_id = p_organization_id AND mi.status = 'atrasado'),
    (SELECT COALESCE(SUM(mi.expected_amount), 0) FROM public.missions_commitment_installments mi WHERE mi.organization_id = p_organization_id AND mi.status NOT IN ('cancelado', 'isento')),
    (SELECT COALESCE(SUM(mi.paid_amount), 0) FROM public.missions_commitment_installments mi WHERE mi.organization_id = p_organization_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_missions_dashboard_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_missions_dashboard_summary(uuid) TO authenticated;

-- Missionários por campo/país/região (WinTechi: "Relatórios do Cadastro").
CREATE OR REPLACE FUNCTION public.list_missions_missionaries_by_field(p_organization_id uuid)
RETURNS TABLE (
  field_country text,
  field_state text,
  field_region text,
  missionary_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT public.has_org_access_permission(auth.uid(), p_organization_id, 'missions.read') THEN
    RAISE EXCEPTION 'access denied to missions field report';
  END IF;

  RETURN QUERY
  SELECT mm.field_country, mm.field_state, mm.field_region, COUNT(*)
  FROM public.missions_missionaries mm
  WHERE mm.organization_id = p_organization_id
    AND mm.status IN ('ativo', 'em_licenca', 'retornado')
  GROUP BY mm.field_country, mm.field_state, mm.field_region
  ORDER BY COUNT(*) DESC, mm.field_country;
END;
$$;

REVOKE ALL ON FUNCTION public.list_missions_missionaries_by_field(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_missions_missionaries_by_field(uuid) TO authenticated;

-- Indicadores por projeto: previsto (compromissos ligados) × realizado
-- (transações reais vinculadas) — WinTechi: "Relatórios Gerenciais".
CREATE OR REPLACE FUNCTION public.list_missions_project_indicators(
  p_organization_id uuid,
  p_project_id uuid DEFAULT NULL
)
RETURNS TABLE (
  project_id uuid,
  project_name text,
  project_status text,
  expected_amount numeric,
  received_amount numeric,
  active_missionaries bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT public.has_org_access_permission(auth.uid(), p_organization_id, 'missions.read') THEN
    RAISE EXCEPTION 'access denied to missions project indicators';
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.name, p.status,
    COALESCE((
      SELECT SUM(mc.committed_amount) FROM public.missions_supporter_commitments mc
      WHERE mc.project_id = p.id AND mc.status = 'ativo'
    ), 0),
    COALESCE((
      SELECT SUM(t.amount) FROM public.missions_transaction_links l
      JOIN public.transactions t ON t.id = l.transaction_id
      WHERE l.project_id = p.id AND t.type = 'Entrada'
    ), 0),
    (SELECT COUNT(*) FROM public.missions_project_assignments a
      WHERE a.project_id = p.id AND a.role = 'missionario' AND a.status = 'ativo')
  FROM public.missions_projects p
  WHERE p.organization_id = p_organization_id
    AND (p_project_id IS NULL OR p.id = p_project_id)
  ORDER BY p.name;
END;
$$;

REVOKE ALL ON FUNCTION public.list_missions_project_indicators(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_missions_project_indicators(uuid, uuid) TO authenticated;

-- Mensalidades a receber (WinTechi: "Mensalidades a Receber") com filtro de
-- status e vencidas. Cada parcela é revalidada contra a organização real.
CREATE OR REPLACE FUNCTION public.list_missions_commitment_installments(
  p_organization_id uuid,
  p_status_filter text DEFAULT NULL,
  p_only_overdue boolean DEFAULT false
)
RETURNS TABLE (
  installment_id uuid,
  commitment_id uuid,
  supporter_member_name text,
  context_label text,
  reference_month text,
  due_date date,
  expected_amount numeric,
  paid_amount numeric,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT public.has_org_access_permission(auth.uid(), p_organization_id, 'missions.read') THEN
    RAISE EXCEPTION 'access denied to missions installments report';
  END IF;

  IF p_status_filter IS NOT NULL AND p_status_filter NOT IN (
    'previsto', 'pendente', 'parcial', 'pago', 'atrasado', 'cancelado', 'isento'
  ) THEN
    RAISE EXCEPTION 'invalid installment status filter: %', p_status_filter;
  END IF;

  RETURN QUERY
  SELECT
    i.id, i.commitment_id, m.full_name,
    COALESCE(mm.field_country, mp.name, c.title, 'Sem contexto'),
    i.reference_month, i.due_date, i.expected_amount, i.paid_amount, i.status
  FROM public.missions_commitment_installments i
  JOIN public.missions_supporter_commitments sc ON sc.id = i.commitment_id
  JOIN public.missions_supporters s ON s.id = sc.supporter_id
  JOIN public.members m ON m.id = s.member_id
  LEFT JOIN public.missions_missionaries mm ON mm.id = sc.missionary_id
  LEFT JOIN public.missions_projects mp ON mp.id = sc.project_id
  LEFT JOIN public.campaigns c ON c.id = sc.campaign_id
  WHERE i.organization_id = p_organization_id
    AND (p_status_filter IS NULL OR i.status = p_status_filter)
    AND (NOT p_only_overdue OR (i.due_date < CURRENT_DATE AND i.status IN ('previsto', 'pendente', 'atrasado', 'parcial')))
  ORDER BY i.due_date ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_missions_commitment_installments(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_missions_commitment_installments(uuid, text, boolean) TO authenticated;

-- ── Verificação final ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'missions_missionaries_register_history'
  ) THEN
    RAISE EXCEPTION 'Migration missions_history_and_reports: trigger de historico do missionario nao foi criado';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'missions_project_assignments_register_history'
  ) THEN
    RAISE EXCEPTION 'Migration missions_history_and_reports: trigger de historico do projeto nao foi criado';
  END IF;
  IF to_regprocedure('public.get_missions_dashboard_summary(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Migration missions_history_and_reports: RPC get_missions_dashboard_summary nao foi criada';
  END IF;
  IF to_regprocedure('public.list_missions_commitment_installments(uuid,text,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Migration missions_history_and_reports: RPC list_missions_commitment_installments nao foi criada';
  END IF;
  RAISE NOTICE 'Migration missions_history_and_reports: historico, diretorio e relatorios derivados confirmados ✓';
END $$;

COMMIT;
