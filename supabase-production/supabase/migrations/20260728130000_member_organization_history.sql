-- ============================================================================
-- Migration: member_organization_history
-- Timestamp: 20260728130000
-- OPERAÇÃO 1 — Fundação compartilhada dos domínios + Secretaria
-- ============================================================================
--
-- Histórico temporal de vínculo organizacional do membro (organização base,
-- setor, congregação). O ESTADO ATUAL continua sendo somente
-- members.organization_id / members.sector_id / members.congregation_id —
-- exatamente como hoje. Esta tabela é 100% DERIVADA por trigger a partir de
-- members: nunca há duas fontes concorrentes de "onde a pessoa está agora".
-- Ninguém grava direto nesta tabela (sem policy de INSERT/UPDATE/DELETE para
-- authenticated) — só os triggers SECURITY DEFINER abaixo escrevem nela.
--
-- Esta migration também adiciona os triggers em public.members que:
--   1. No INSERT: abrem a primeira linha de vínculo organizacional (para
--      organization_id sempre, e para sector_id/congregation_id quando
--      preenchidos) e registram na timeline os eventos "Cadastro" (sempre),
--      "Batismo" (quando baptized_at já vem preenchido) e "Admissão"
--      (quando joined_at já vem preenchido) — SEM exigir nenhuma alteração
--      no wizard existente (Membros.tsx): a Secretaria passa a ser
--      consumidora real da fundação automaticamente, pelo simples fato de
--      continuar cadastrando membros como já faz hoje.
--   2. No UPDATE de organization_id/sector_id/congregation_id: fecha a linha
--      de vínculo aberta correspondente e abre uma nova, e registra o evento
--      "Alteração de congregação/setor/organização" na timeline.
--   3. No UPDATE de status: registra o evento "Mudança de situação".
--
-- Os triggers são defensivos (IF NEW IS DISTINCT FROM OLD) e nunca abortam a
-- transação por falta de capability quando chamados em contexto de
-- backend/service_role (auth.uid() IS NULL) — ver register_member_history_
-- event() na migration 20260728090000.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.member_history') IS NULL THEN
    RAISE EXCEPTION 'member_organization_history preflight failed: public.member_history nao existe (aplique 20260728090000 primeiro)';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.member_organization_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  link_type text NOT NULL CHECK (link_type IN ('organization', 'sector', 'congregation')),

  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  change_reason text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_org_history_member ON public.member_organization_history (member_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_org_history_org ON public.member_organization_history (organization_id);

-- Somente um vínculo ABERTO (ended_at IS NULL) por pessoa+tipo de vínculo —
-- é essa regra que impede duas fontes concorrentes de "vínculo atual".
CREATE UNIQUE INDEX IF NOT EXISTS member_org_history_one_open
  ON public.member_organization_history (member_id, link_type)
  WHERE ended_at IS NULL;

ALTER TABLE public.member_organization_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "member_organization_history capability select" ON public.member_organization_history;
CREATE POLICY "member_organization_history capability select" ON public.member_organization_history
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_organization_history.member_id
      AND public.has_org_access_permission(
        auth.uid(), COALESCE(m.congregation_id, m.sector_id, m.organization_id), 'members.read'
      )
  )
);

-- Sem policy de INSERT/UPDATE/DELETE para authenticated: esta tabela é
-- inteiramente derivada pelos triggers SECURITY DEFINER abaixo. Isso é o que
-- garante que nunca existam duas fontes concorrentes editáveis pelo usuário.
GRANT SELECT ON public.member_organization_history TO authenticated;

-- ── Função central: abre/fecha vínculo + registra timeline ─────────────
CREATE OR REPLACE FUNCTION public._close_and_open_org_link(
  p_member_id uuid,
  p_link_type text,
  p_new_organization_id uuid,
  p_changed_by uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.member_organization_history
  SET ended_at = now()
  WHERE member_id = p_member_id
    AND link_type = p_link_type
    AND ended_at IS NULL;

  IF p_new_organization_id IS NOT NULL THEN
    INSERT INTO public.member_organization_history (
      member_id, organization_id, link_type, started_at, changed_by, change_reason
    ) VALUES (
      p_member_id, p_new_organization_id, p_link_type, now(), p_changed_by, p_reason
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._close_and_open_org_link(uuid, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- ── Trigger: members AFTER INSERT ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public._members_seed_history_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Abre o(s) vínculo(s) organizacional(is) inicial(is).
  PERFORM public._close_and_open_org_link(NEW.id, 'organization', NEW.organization_id, auth.uid(), 'Cadastro inicial');
  IF NEW.sector_id IS NOT NULL THEN
    PERFORM public._close_and_open_org_link(NEW.id, 'sector', NEW.sector_id, auth.uid(), 'Cadastro inicial');
  END IF;
  IF NEW.congregation_id IS NOT NULL THEN
    PERFORM public._close_and_open_org_link(NEW.id, 'congregation', NEW.congregation_id, auth.uid(), 'Cadastro inicial');
  END IF;

  -- Timeline: cadastro sempre; batismo/admissão quando já vierem preenchidos.
  PERFORM public.register_member_history_event(
    NEW.id, 'cadastro', 'Cadastro no Ecclesia', NULL, COALESCE(NEW.created_at, now()),
    'secretaria', 'members', NEW.id, NULL, NULL, 'normal',
    NEW.legacy_source, NULL, NEW.legacy_code
  );

  IF NEW.baptized_at IS NOT NULL THEN
    PERFORM public.register_member_history_event(
      NEW.id, 'batismo', 'Batismo nas águas', NEW.baptism_place, NEW.baptized_at::timestamptz,
      'secretaria', 'members', NEW.id, NULL, NULL, 'normal',
      NEW.legacy_source, NULL, NEW.legacy_code
    );
  END IF;

  IF NEW.joined_at IS NOT NULL THEN
    PERFORM public.register_member_history_event(
      NEW.id, 'admissao', 'Admissão', NEW.admission_type, NEW.joined_at::timestamptz,
      'secretaria', 'members', NEW.id, NULL, NULL, 'normal',
      NEW.legacy_source, NULL, NEW.legacy_code
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS members_seed_history_on_insert ON public.members;
CREATE TRIGGER members_seed_history_on_insert
AFTER INSERT ON public.members
FOR EACH ROW EXECUTE FUNCTION public._members_seed_history_on_insert();

REVOKE ALL ON FUNCTION public._members_seed_history_on_insert() FROM PUBLIC, anon, authenticated;

-- ── Trigger: members AFTER UPDATE (vínculo organizacional) ─────────────
CREATE OR REPLACE FUNCTION public._members_track_organization_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    PERFORM public._close_and_open_org_link(NEW.id, 'organization', NEW.organization_id, auth.uid(), 'Alteração cadastral');
    PERFORM public.register_member_history_event(
      NEW.id, 'mudanca_organizacao', 'Alteração de organização',
      concat_ws(' → ',
        (SELECT name FROM public.organizations WHERE id = OLD.organization_id),
        (SELECT name FROM public.organizations WHERE id = NEW.organization_id)
      ), now(),
      'secretaria', 'members', NEW.id, NULL, NULL, 'normal', NULL, NULL, NULL
    );
  END IF;

  IF NEW.sector_id IS DISTINCT FROM OLD.sector_id THEN
    PERFORM public._close_and_open_org_link(NEW.id, 'sector', NEW.sector_id, auth.uid(), 'Alteração cadastral');
    PERFORM public.register_member_history_event(
      NEW.id, 'mudanca_setor', 'Alteração de setor/distrito',
      concat_ws(' → ',
        (SELECT name FROM public.organizations WHERE id = OLD.sector_id),
        (SELECT name FROM public.organizations WHERE id = NEW.sector_id)
      ), now(),
      'secretaria', 'members', NEW.id, NULL, NULL, 'normal', NULL, NULL, NULL
    );
  END IF;

  IF NEW.congregation_id IS DISTINCT FROM OLD.congregation_id THEN
    PERFORM public._close_and_open_org_link(NEW.id, 'congregation', NEW.congregation_id, auth.uid(), 'Alteração cadastral');
    PERFORM public.register_member_history_event(
      NEW.id, 'mudanca_congregacao', 'Alteração de congregação',
      concat_ws(' → ',
        (SELECT name FROM public.organizations WHERE id = OLD.congregation_id),
        (SELECT name FROM public.organizations WHERE id = NEW.congregation_id)
      ), now(),
      'secretaria', 'members', NEW.id, NULL, NULL, 'normal', NULL, NULL, NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS members_track_organization_change ON public.members;
CREATE TRIGGER members_track_organization_change
AFTER UPDATE OF organization_id, sector_id, congregation_id ON public.members
FOR EACH ROW EXECUTE FUNCTION public._members_track_organization_change();

REVOKE ALL ON FUNCTION public._members_track_organization_change() FROM PUBLIC, anon, authenticated;

-- ── Trigger: members AFTER UPDATE (mudança de situação) ─────────────────
CREATE OR REPLACE FUNCTION public._members_track_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.register_member_history_event(
      NEW.id, 'mudanca_situacao',
      'Situação alterada para "' || NEW.status || '"',
      'Situação anterior: "' || OLD.status || '"',
      now(), 'secretaria', 'members', NEW.id, NULL, NULL, 'normal', NULL, NULL, NULL
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS members_track_status_change ON public.members;
CREATE TRIGGER members_track_status_change
AFTER UPDATE OF status ON public.members
FOR EACH ROW EXECUTE FUNCTION public._members_track_status_change();

REVOKE ALL ON FUNCTION public._members_track_status_change() FROM PUBLIC, anon, authenticated;

-- A tabela nasce depois de members; sem backfill, todos os membros já
-- existentes ficariam sem vínculo atual até a próxima edição cadastral.
-- Criamos somente o snapshot organizacional aberto, sem inventar eventos
-- retroativos na timeline.
INSERT INTO public.member_organization_history (
  member_id, organization_id, link_type, started_at, changed_by, change_reason
)
SELECT m.id, links.organization_id, links.link_type,
       COALESCE(m.created_at, now()), NULL, 'Backfill da fundação institucional'
FROM public.members m
CROSS JOIN LATERAL (
  VALUES
    ('organization'::text, m.organization_id),
    ('sector'::text, m.sector_id),
    ('congregation'::text, m.congregation_id)
) AS links(link_type, organization_id)
WHERE links.organization_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── Verificação final ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'member_organization_history') THEN
    RAISE EXCEPTION 'Migration member_organization_history: tabela nao foi criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'members_seed_history_on_insert') THEN
    RAISE EXCEPTION 'Migration member_organization_history: trigger de insert nao foi criado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'members_track_organization_change') THEN
    RAISE EXCEPTION 'Migration member_organization_history: trigger de mudanca organizacional nao foi criado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'members_track_status_change') THEN
    RAISE EXCEPTION 'Migration member_organization_history: trigger de mudanca de situacao nao foi criado';
  END IF;
  RAISE NOTICE 'Migration member_organization_history: tabela, policies e triggers confirmados ✓';
END $$;

COMMIT;
