-- Módulo: Solicitações Administrativas
-- Tabela para gerenciar solicitações recebidas pela secretaria da organização.

CREATE TABLE IF NOT EXISTS public.administrative_requests (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id        uuid        REFERENCES public.members(id) ON DELETE SET NULL,
  requester_name   text        NOT NULL DEFAULT '',
  request_type     text        NOT NULL DEFAULT 'solicitacao_geral'
    CHECK (request_type IN (
      'declaracao_membro',
      'atualizacao_cadastral',
      'solicitacao_geral',
      'segunda_via',
      'contato_pastoral'
    )),
  description      text,
  status           text        NOT NULL DEFAULT 'aberta'
    CHECK (status IN (
      'aberta',
      'em_analise',
      'aguardando_documento',
      'concluida',
      'rejeitada'
    )),
  assigned_to      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  internal_notes   text,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_requests_org_status
  ON public.administrative_requests(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_admin_requests_org_created
  ON public.administrative_requests(organization_id, created_at DESC);

DROP TRIGGER IF EXISTS update_administrative_requests_updated_at ON public.administrative_requests;
CREATE TRIGGER update_administrative_requests_updated_at
  BEFORE UPDATE ON public.administrative_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.administrative_requests ENABLE ROW LEVEL SECURITY;

-- Membros da organização podem ler
DROP POLICY IF EXISTS "admin_requests_org_read" ON public.administrative_requests;
CREATE POLICY "admin_requests_org_read"
  ON public.administrative_requests FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Membros da organização podem inserir/atualizar
DROP POLICY IF EXISTS "admin_requests_org_write" ON public.administrative_requests;
CREATE POLICY "admin_requests_org_write"
  ON public.administrative_requests FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

DROP POLICY IF EXISTS "admin_requests_org_update" ON public.administrative_requests;
CREATE POLICY "admin_requests_org_update"
  ON public.administrative_requests FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

DROP POLICY IF EXISTS "admin_requests_org_delete" ON public.administrative_requests;
CREATE POLICY "admin_requests_org_delete"
  ON public.administrative_requests FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );
