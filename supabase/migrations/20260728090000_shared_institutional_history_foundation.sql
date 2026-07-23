-- ============================================================================
-- Migration: shared_institutional_history_foundation
-- Timestamp: 20260728090000
-- OPERAÇÃO 1 — Fundação compartilhada dos domínios + Secretaria
-- ============================================================================
--
-- OBJETIVO
-- Criar a base do "histórico institucional" que será compartilhada por
-- Secretaria (consumidor real nesta operação) e, futuramente, por
-- Discipulado, Teologia e Missões (consumidores que reutilizarão os MESMOS
-- pontos de extensão, sem duplicar tabela, sem duplicar pessoa/membro).
--
-- CONTRATO CENTRAL (ver docs/architecture/contrato-dominios-institucionais.md)
--   1. Pessoa é sempre public.members — nenhuma tabela de pessoa paralela.
--   2. Organização é sempre public.organizations — nenhuma hierarquia paralela.
--   3. Todo evento institucional de uma pessoa é uma linha em
--      public.member_history. Módulos especializados (ocorrências,
--      ordenações, transferências, e futuramente matrículas de Discipulado/
--      Teologia/Missões) criam a linha de histórico chamando a MESMA função
--      SECURITY DEFINER: public.register_member_history_event(). Isso evita
--      um "motor genérico" (não existe uma tabela "eventos" universal com
--      payload livre) mas também evita 4 timelines competindo.
--   4. source_module identifica quem originou o evento (secretaria hoje;
--      discipulado/teologia/missoes/sistema no futuro). source_table +
--      source_id apontam para o registro especializado quando existir.
--   5. Confidencialidade: eventos pastorais sensíveis usam
--      visibility = 'confidential' e exigem a nova capability
--      'members.confidential' — que NÃO é concedida a Secretário(a) comum,
--      apenas a quem já possui todas as permissões de governança
--      (church_admin / responsible_pastor) ou a quem for explicitamente
--      autorizado no futuro. 'members.read'/'members.write' continuam
--      bastando para o histórico NÃO confidencial.
--   6. Origem legada: legacy_source + legacy_module + legacy_code (+ índice
--      único parcial) preparam a futura importação idempotente do WinTechi
--      sem implementá-la agora.
--
-- NÃO faz: não implementa Discipulado/Teologia/Missões, não altera
-- Financeiro, não aplica a migration, não insere dados reais.
-- ============================================================================

BEGIN;

-- ── Preflight ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.members') IS NULL THEN v_missing := array_append(v_missing, 'public.members'); END IF;
  IF to_regclass('public.organizations') IS NULL THEN v_missing := array_append(v_missing, 'public.organizations'); END IF;
  IF to_regclass('public.documents') IS NULL THEN v_missing := array_append(v_missing, 'public.documents'); END IF;
  IF to_regclass('public.access_responsibility_definitions') IS NULL THEN
    v_missing := array_append(v_missing, 'public.access_responsibility_definitions');
  END IF;
  IF to_regproc('public.has_org_access_permission(uuid,uuid,text)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.has_org_access_permission()');
  END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'shared institutional history preflight failed; missing: %', array_to_string(v_missing, ', ');
  END IF;
END;
$$;

-- ── Nova capability: members.confidential ───────────────────────────────
-- Concedida hoje somente a quem já tem TODAS as permissões (governança:
-- church_admin, responsible_pastor). Secretário(a)/Subsecretário(a)/
-- Operador de membros NÃO recebem automaticamente — isso é o requisito de
-- produto "dados pastorais confidenciais não podem ficar visíveis para todo
-- usuário que consegue consultar membros". Update seletivo e idempotente —
-- não reescreve o catálogo inteiro, só acrescenta a chave nova onde faltar.
UPDATE public.access_responsibility_definitions
SET permission_keys = array_append(COALESCE(permission_keys, ARRAY[]::text[]), 'members.confidential'),
    updated_at = now()
WHERE responsibility_type IN ('church_admin', 'responsible_pastor')
  AND NOT ('members.confidential' = ANY(COALESCE(permission_keys, ARRAY[]::text[])));

-- ── Tabela: member_history (timeline institucional compartilhada) ──────
-- Substitui o "esboço" que existia apenas em src/integrations/supabase/
-- types.ts (sem DDL real, nunca usado em nenhuma tela) por uma estrutura
-- completa o suficiente para os 4 domínios, mas sem campos especulativos
-- não usados por esta operação.
CREATE TABLE IF NOT EXISTS public.member_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  -- Organização efetiva no momento do evento (snapshot para indexação e
  -- relatórios). A AUTORIZAÇÃO real é sempre resolvida dinamicamente via
  -- JOIN com members (ver policies abaixo), nunca confiando só nesta coluna.
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,

  history_type text NOT NULL CHECK (history_type IN (
    'cadastro', 'admissao', 'batismo', 'mudanca_situacao', 'mudanca_congregacao',
    'mudanca_setor', 'mudanca_organizacao', 'nomeacao', 'encerramento_funcao',
    'ordenacao', 'transferencia', 'ocorrencia', 'documento_emitido',
    'credencial_emitida', 'carta_emitida', 'certificado_emitido',
    'registro_importado', 'outro'
  )),
  title text NOT NULL CHECK (btrim(title) <> ''),
  description text,

  -- Data do acontecimento em si (pode ser retroativa, ex.: importação legada)
  -- vs. data em que foi de fato registrado no sistema (auditoria real).
  occurred_at timestamptz NOT NULL DEFAULT now(),
  recorded_at timestamptz NOT NULL DEFAULT now(),

  -- Contrato de extensão para os 4 domínios (ver comentário no topo do arquivo).
  source_module text NOT NULL DEFAULT 'secretaria'
    CHECK (source_module IN ('secretaria', 'discipulado', 'teologia', 'missoes', 'sistema')),
  source_table text,
  source_id uuid,
  CHECK ((source_table IS NULL) = (source_id IS NULL)),

  -- Reaproveita o sistema de documentos já existente (public.documents) em
  -- vez de criar um segundo sistema de arquivos. attachment_path é usado
  -- somente quando o anexo é pessoal/privado e reaproveita o MESMO bucket
  -- privado já usado pelo documento civil do membro (member-documents).
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  attachment_path text,

  visibility text NOT NULL DEFAULT 'normal' CHECK (visibility IN ('normal', 'confidential')),

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Origem legada (WinTechi) — preparação de importação idempotente futura.
  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_history_member ON public.member_history (member_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_history_org ON public.member_history (organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_history_type ON public.member_history (history_type);
CREATE INDEX IF NOT EXISTS idx_member_history_source ON public.member_history (source_table, source_id) WHERE source_table IS NOT NULL;

-- Idempotência de importação legada por EVENTO. Um mesmo registro
-- especializado pode gerar mais de um fato legítimo ao longo do tempo
-- (ex.: nomeação e encerramento), por isso módulo/tipo/origem especializada
-- fazem parte da chave — usar só legacy_source+legacy_code derrubaria a
-- transação no segundo evento.
CREATE UNIQUE INDEX IF NOT EXISTS member_history_legacy_unique_idx
  ON public.member_history (
    organization_id,
    legacy_source,
    COALESCE(legacy_module, ''),
    legacy_code,
    history_type,
    COALESCE(source_table, ''),
    COALESCE(source_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

ALTER TABLE public.member_history ENABLE ROW LEVEL SECURITY;

-- Leitura: members.read para eventos normais; members.confidential
-- ADICIONALMENTE exigido para eventos confidenciais. A organização efetiva é
-- sempre resolvida via JOIN com members (mesmo padrão de member_addresses/
-- member_family), nunca confiando apenas na coluna organization_id local.
DROP POLICY IF EXISTS "member_history capability select" ON public.member_history;
CREATE POLICY "member_history capability select" ON public.member_history
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_history.member_id
      AND public.has_org_access_permission(
        auth.uid(), COALESCE(m.congregation_id, m.sector_id, m.organization_id), 'members.read'
      )
      AND (
        member_history.visibility <> 'confidential'
        OR public.has_org_access_permission(
          auth.uid(), COALESCE(m.congregation_id, m.sector_id, m.organization_id), 'members.confidential'
        )
      )
  )
);

-- A timeline é append-only. Não há policies de INSERT/UPDATE/DELETE para
-- authenticated e a tabela não concede essas operações. Toda gravação passa
-- pela RPC abaixo (ou por trigger que a chama), garantindo ator, organização
-- efetiva, confidencialidade e origem. Correções são novos eventos; o fato
-- original nunca é reescrito.
DROP POLICY IF EXISTS "member_history capability insert" ON public.member_history;
DROP POLICY IF EXISTS "member_history capability update" ON public.member_history;
REVOKE INSERT, UPDATE, DELETE ON public.member_history FROM authenticated;
GRANT SELECT ON public.member_history TO authenticated;

-- ── Função compartilhada: register_member_history_event() ──────────────
-- Ponto de extensão único usado por Secretaria (nesta operação) e, no
-- futuro, por Discipulado/Teologia/Missões — sem cada domínio reimplementar
-- sua própria lógica de autorização/gravação de timeline.
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
    'registro_importado', 'outro'
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

  -- auth.uid() IS NULL identifica um contexto de backend/service_role (que
  -- já contorna RLS em qualquer tabela) — não exigimos capability nesse
  -- caso, pois é exatamente o contexto em que a futura importação em lote
  -- do WinTechi vai rodar. Quando há um usuário autenticado de verdade
  -- (frontend), a checagem de capability abaixo é obrigatória.
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

-- ── Verificação final ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'member_history') THEN
    RAISE EXCEPTION 'Migration shared_institutional_history_foundation: tabela member_history nao foi criada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'member_history' AND policyname = 'member_history capability select'
  ) THEN
    RAISE EXCEPTION 'Migration shared_institutional_history_foundation: policy de leitura nao foi criada';
  END IF;
  IF to_regprocedure('public.register_member_history_event(uuid,text,text,text,timestamptz,text,text,uuid,uuid,text,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Migration shared_institutional_history_foundation: funcao register_member_history_event nao foi criada';
  END IF;
  RAISE NOTICE 'Migration shared_institutional_history_foundation: tabela, funcao, policies e capability confirmados ✓';
END $$;

COMMIT;
