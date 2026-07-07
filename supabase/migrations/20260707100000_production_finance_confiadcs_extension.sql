-- =============================================================================
-- PRODUCTION FINANCE — EXTENSÃO CONFIADCS
-- Migration: 20260707100000_production_finance_confiadcs_extension.sql
--
-- OBJETIVO:
--   Evoluir a tabela transactions e criar tabelas auxiliares para comportar
--   todos os campos do sistema CONFIADCS (Controle Financeiro da AD Caxias do Sul),
--   preservando 100% de compatibilidade com dashboards, auditoria e tesouraria.
--
-- SEGURANÇA:
--   Idempotente — pode ser rodada múltiplas vezes sem efeito colateral.
--   Usa ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING.
--   NÃO destrói colunas, NÃO recriar tabelas existentes, NÃO altera CHECK existente.
--
-- REVISÃO HUMANA OBRIGATÓRIA antes de aplicar em produção.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 1: TABELAS AUXILIARES NOVAS
-- ─────────────────────────────────────────────────────────────────────────────

-- 1.1 Tipos de Documento (Recibo, NF, Cupom, Pix, etc.)
CREATE TABLE IF NOT EXISTS public.finance_document_types (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code              text        NULL,
  name              text        NOT NULL,
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (organization_id, name)
);

COMMENT ON TABLE public.finance_document_types IS
  'Tipos de documento financeiro (Recibo, NF, Pix, etc.). '
  'organization_id NULL = registro global disponível para todas as orgs.';

-- 1.2 Grupos Contábeis (Receita / Despesa — compatível com CONFIADCS GRUPO CONTÁBIL)
CREATE TABLE IF NOT EXISTS public.finance_accounting_groups (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code              text        NULL,
  name              text        NOT NULL,
  type              text        NULL CHECK (type IN ('receita', 'despesa')),
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (organization_id, type, name)
);

COMMENT ON TABLE public.finance_accounting_groups IS
  'Grupos contábeis do CONFIADCS. Mapeia o campo GRUPO CONTÁBIL da planilha.';

-- Bloco idempotente: corrige bancos que já existam com a constraint antiga
-- (organization_id, name) → substitui por (organization_id, type, name).
DO $$
BEGIN
  -- Remover constraint antiga se ainda existir
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'finance_accounting_groups_organization_id_name_key'
      AND table_name = 'finance_accounting_groups'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.finance_accounting_groups
      DROP CONSTRAINT finance_accounting_groups_organization_id_name_key;
  END IF;

  -- Criar constraint correta se ainda não existir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'finance_accounting_groups_organization_id_type_name_key'
      AND table_name = 'finance_accounting_groups'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.finance_accounting_groups
      ADD CONSTRAINT finance_accounting_groups_organization_id_type_name_key
      UNIQUE NULLS NOT DISTINCT (organization_id, type, name);
  END IF;
END;
$$;

-- 1.3 Lotes de Importação (rastreabilidade de cada importação CONFIADCS/XLSM)
CREATE TABLE IF NOT EXISTS public.finance_import_batches (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_file_name  text        NULL,
  source_type       text        NOT NULL DEFAULT 'confiadcs',
  total_rows        integer     NOT NULL DEFAULT 0,
  imported_rows     integer     NOT NULL DEFAULT 0,
  failed_rows       integer     NOT NULL DEFAULT 0,
  status            text        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'done', 'error')),
  created_by        uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz NULL,
  error_report      jsonb       NULL
);

COMMENT ON TABLE public.finance_import_batches IS
  'Rastreia cada importação de arquivo CONFIADCS/XLSM para o Ecclesia. '
  'Permite reprocessamento, auditoria e rollback por lote.';

-- 1.4 Integração Asaas por Igreja (preparação estrutural — sem API ativa)
CREATE TABLE IF NOT EXISTS public.church_asaas_integrations (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid        NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  environment             text        NOT NULL DEFAULT 'production'
                          CHECK (environment IN ('sandbox', 'production')),
  account_name            text        NULL,
  wallet_id               text        NULL,
  -- ATENÇÃO: api_key_encrypted deve ser criptografada no backend antes de persistir.
  -- NUNCA armazenar a chave em texto puro. NUNCA expor ao frontend.
  api_key_encrypted       text        NULL,
  public_pix_key          text        NULL,
  is_active               boolean     NOT NULL DEFAULT false,
  split_enabled           boolean     NOT NULL DEFAULT false,
  -- Split reservado para uso futuro quando a plataforma Ecclesia tiver conta Asaas própria.
  platform_split_percent  numeric(5,2) NOT NULL DEFAULT 0,
  created_by              uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by              uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.church_asaas_integrations IS
  'Configuração da integração Asaas por igreja. '
  'api_key_encrypted deve ser encriptada no backend — NUNCA expor ao cliente. '
  'split_enabled e platform_split_percent são reservados para uso futuro.';

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 2: EXTENSÃO DA TABELA transactions
-- Adicionar colunas CONFIADCS com ADD COLUMN IF NOT EXISTS (idempotente)
-- ─────────────────────────────────────────────────────────────────────────────

-- 2.1 Campos de rastreamento CONFIADCS
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS legacy_record_number        text        NULL,
  ADD COLUMN IF NOT EXISTS period_label                text        NULL,
  ADD COLUMN IF NOT EXISTS issue_date                  date        NULL,
  ADD COLUMN IF NOT EXISTS accounting_date             date        NULL;

-- 2.2 Campos de documento
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS document_type_id            uuid        NULL,
  ADD COLUMN IF NOT EXISTS document_number             text        NULL;

-- 2.3 Campos de fornecedor/beneficiário e contribuinte
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS supplier_beneficiary_name   text        NULL,
  ADD COLUMN IF NOT EXISTS supplier_beneficiary_document text      NULL,
  ADD COLUMN IF NOT EXISTS contributor_name            text        NULL,
  ADD COLUMN IF NOT EXISTS contributor_document        text        NULL;

-- 2.4 Campos de grupo contábil, congregação e distrito
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS accounting_group_id         uuid        NULL,
  ADD COLUMN IF NOT EXISTS congregation_id             uuid        NULL,
  ADD COLUMN IF NOT EXISTS district_id                 uuid        NULL;

-- 2.5 Campos operacionais CONFIADCS
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS collector_name              text        NULL,
  ADD COLUMN IF NOT EXISTS treasurer_name              text        NULL;

-- 2.6 Campos de origem e rastreamento de importação
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS origin                      text        NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS import_batch_id             uuid        NULL;

-- 2.7 Campos de integração Asaas (preparação — sem uso ativo)
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS asaas_payment_id            text        NULL,
  ADD COLUMN IF NOT EXISTS asaas_customer_id           text        NULL,
  ADD COLUMN IF NOT EXISTS external_reference          text        NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 3: FOREIGN KEYS nas novas colunas de transactions
-- Adicionadas com IF NOT EXISTS via DO block para idempotência
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- FK: transactions.document_type_id → finance_document_types
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_transactions_document_type'
      AND table_name = 'transactions'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT fk_transactions_document_type
      FOREIGN KEY (document_type_id)
      REFERENCES public.finance_document_types(id)
      ON DELETE SET NULL;
  END IF;

  -- FK: transactions.accounting_group_id → finance_accounting_groups
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_transactions_accounting_group'
      AND table_name = 'transactions'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT fk_transactions_accounting_group
      FOREIGN KEY (accounting_group_id)
      REFERENCES public.finance_accounting_groups(id)
      ON DELETE SET NULL;
  END IF;

  -- FK: transactions.import_batch_id → finance_import_batches
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_transactions_import_batch'
      AND table_name = 'transactions'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT fk_transactions_import_batch
      FOREIGN KEY (import_batch_id)
      REFERENCES public.finance_import_batches(id)
      ON DELETE SET NULL;
  END IF;

  -- FK: transactions.congregation_id → organizations
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_transactions_congregation'
      AND table_name = 'transactions'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT fk_transactions_congregation
      FOREIGN KEY (congregation_id)
      REFERENCES public.organizations(id)
      ON DELETE SET NULL;
  END IF;

  -- FK: transactions.district_id → organizations
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_transactions_district'
      AND table_name = 'transactions'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT fk_transactions_district
      FOREIGN KEY (district_id)
      REFERENCES public.organizations(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 4: EXTENSÃO DE finance_account_categories
-- Adicionar vínculo com grupo contábil (opcional — só se não existir)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.finance_account_categories
  ADD COLUMN IF NOT EXISTS accounting_group_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_fac_accounting_group'
      AND table_name = 'finance_account_categories'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.finance_account_categories
      ADD CONSTRAINT fk_fac_accounting_group
      FOREIGN KEY (accounting_group_id)
      REFERENCES public.finance_accounting_groups(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 5: ÍNDICES
-- Complementam os índices já criados na migration base
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_transactions_org_accounting_date
  ON public.transactions(organization_id, accounting_date);

CREATE INDEX IF NOT EXISTS idx_transactions_org_type
  ON public.transactions(organization_id, type);

CREATE INDEX IF NOT EXISTS idx_transactions_org_doc_number
  ON public.transactions(organization_id, document_number);

CREATE INDEX IF NOT EXISTS idx_transactions_org_congregation
  ON public.transactions(organization_id, congregation_id);

CREATE INDEX IF NOT EXISTS idx_transactions_org_district
  ON public.transactions(organization_id, district_id);

CREATE INDEX IF NOT EXISTS idx_transactions_asaas_payment
  ON public.transactions(asaas_payment_id)
  WHERE asaas_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_import_batch
  ON public.transactions(import_batch_id)
  WHERE import_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_finance_doc_types_org
  ON public.finance_document_types(organization_id);

CREATE INDEX IF NOT EXISTS idx_finance_acct_groups_org
  ON public.finance_accounting_groups(organization_id);

CREATE INDEX IF NOT EXISTS idx_finance_import_batches_org
  ON public.finance_import_batches(organization_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 6: ROW LEVEL SECURITY nas novas tabelas
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.finance_document_types       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_accounting_groups    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_import_batches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.church_asaas_integrations    ENABLE ROW LEVEL SECURITY;

-- ── finance_document_types ────────────────────────────────────────────────────
-- Leitura: registros globais (org_id IS NULL) OU reader da organização
DROP POLICY IF EXISTS "doc_types select" ON public.finance_document_types;
CREATE POLICY "doc_types select" ON public.finance_document_types
FOR SELECT TO authenticated
USING (
  organization_id IS NULL
  OR public.is_org_finance_reader(auth.uid(), organization_id)
);

-- Escrita: writer da organização (somente registros da própria org, não globais)
DROP POLICY IF EXISTS "doc_types insert" ON public.finance_document_types;
CREATE POLICY "doc_types insert" ON public.finance_document_types
FOR INSERT TO authenticated
WITH CHECK (
  organization_id IS NOT NULL
  AND public.is_org_finance_writer(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "doc_types update" ON public.finance_document_types;
CREATE POLICY "doc_types update" ON public.finance_document_types
FOR UPDATE TO authenticated
USING (
  organization_id IS NOT NULL
  AND public.is_org_finance_writer(auth.uid(), organization_id)
)
WITH CHECK (
  organization_id IS NOT NULL
  AND public.is_org_finance_writer(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "doc_types delete" ON public.finance_document_types;
CREATE POLICY "doc_types delete" ON public.finance_document_types
FOR DELETE TO authenticated
USING (
  organization_id IS NOT NULL
  AND public.is_org_finance_writer(auth.uid(), organization_id)
);

-- ── finance_accounting_groups ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "acct_groups select" ON public.finance_accounting_groups;
CREATE POLICY "acct_groups select" ON public.finance_accounting_groups
FOR SELECT TO authenticated
USING (
  organization_id IS NULL
  OR public.is_org_finance_reader(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "acct_groups insert" ON public.finance_accounting_groups;
CREATE POLICY "acct_groups insert" ON public.finance_accounting_groups
FOR INSERT TO authenticated
WITH CHECK (
  organization_id IS NOT NULL
  AND public.is_org_finance_writer(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "acct_groups update" ON public.finance_accounting_groups;
CREATE POLICY "acct_groups update" ON public.finance_accounting_groups
FOR UPDATE TO authenticated
USING (
  organization_id IS NOT NULL
  AND public.is_org_finance_writer(auth.uid(), organization_id)
)
WITH CHECK (
  organization_id IS NOT NULL
  AND public.is_org_finance_writer(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "acct_groups delete" ON public.finance_accounting_groups;
CREATE POLICY "acct_groups delete" ON public.finance_accounting_groups
FOR DELETE TO authenticated
USING (
  organization_id IS NOT NULL
  AND public.is_org_finance_writer(auth.uid(), organization_id)
);

-- ── finance_import_batches ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "import_batches select" ON public.finance_import_batches;
CREATE POLICY "import_batches select" ON public.finance_import_batches
FOR SELECT TO authenticated
USING (public.is_org_finance_reader(auth.uid(), organization_id));

DROP POLICY IF EXISTS "import_batches insert" ON public.finance_import_batches;
CREATE POLICY "import_batches insert" ON public.finance_import_batches
FOR INSERT TO authenticated
WITH CHECK (public.is_org_finance_writer(auth.uid(), organization_id));

DROP POLICY IF EXISTS "import_batches update" ON public.finance_import_batches;
CREATE POLICY "import_batches update" ON public.finance_import_batches
FOR UPDATE TO authenticated
USING (public.is_org_finance_writer(auth.uid(), organization_id))
WITH CHECK (public.is_org_finance_writer(auth.uid(), organization_id));

DROP POLICY IF EXISTS "import_batches delete" ON public.finance_import_batches;
CREATE POLICY "import_batches delete" ON public.finance_import_batches
FOR DELETE TO authenticated
USING (public.is_org_finance_writer(auth.uid(), organization_id));

-- ── church_asaas_integrations ─────────────────────────────────────────────────
-- Leitura e escrita: somente admin ou platform finance admin
-- Tesoureiro comum NÃO deve ver api_key_encrypted nem alterar configuração Asaas
DROP POLICY IF EXISTS "asaas select" ON public.church_asaas_integrations;
CREATE POLICY "asaas select" ON public.church_asaas_integrations
FOR SELECT TO authenticated
USING (
  public.is_platform_finance_admin(auth.uid())
  OR public.has_org_finance_role(
    auth.uid(),
    organization_id,
    ARRAY['admin', 'church_admin']
  )
);

DROP POLICY IF EXISTS "asaas insert" ON public.church_asaas_integrations;
CREATE POLICY "asaas insert" ON public.church_asaas_integrations
FOR INSERT TO authenticated
WITH CHECK (
  public.is_platform_finance_admin(auth.uid())
  OR public.has_org_finance_role(
    auth.uid(),
    organization_id,
    ARRAY['admin', 'church_admin']
  )
);

DROP POLICY IF EXISTS "asaas update" ON public.church_asaas_integrations;
CREATE POLICY "asaas update" ON public.church_asaas_integrations
FOR UPDATE TO authenticated
USING (
  public.is_platform_finance_admin(auth.uid())
  OR public.has_org_finance_role(
    auth.uid(),
    organization_id,
    ARRAY['admin', 'church_admin']
  )
)
WITH CHECK (
  public.is_platform_finance_admin(auth.uid())
  OR public.has_org_finance_role(
    auth.uid(),
    organization_id,
    ARRAY['admin', 'church_admin']
  )
);

DROP POLICY IF EXISTS "asaas delete" ON public.church_asaas_integrations;
CREATE POLICY "asaas delete" ON public.church_asaas_integrations
FOR DELETE TO authenticated
USING (public.is_platform_finance_admin(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 7: SEEDS DE TIPOS DE DOCUMENTO E GRUPOS CONTÁBEIS
-- Globais (organization_id = NULL) — disponíveis para todas as orgs
-- Idempotentes via ON CONFLICT DO NOTHING
-- ─────────────────────────────────────────────────────────────────────────────

-- 7.1 Tipos de documento globais
INSERT INTO public.finance_document_types (organization_id, code, name)
VALUES
  (NULL, 'REC',  'Recibo'),
  (NULL, 'NF',   'Nota Fiscal'),
  (NULL, 'CF',   'Cupom Fiscal'),
  (NULL, 'PIX',  'Comprovante Pix'),
  (NULL, 'TRF',  'Transferencia'),
  (NULL, 'OUT',  'Outro')
ON CONFLICT (organization_id, name) DO NOTHING;

-- 7.2 Grupos contábeis globais — Receita
INSERT INTO public.finance_accounting_groups (organization_id, code, name, type)
VALUES
  (NULL, 'R01', 'Dizimos',    'receita'),
  (NULL, 'R02', 'Ofertas',    'receita'),
  (NULL, 'R03', 'Campanhas',  'receita'),
  (NULL, 'R04', 'Missoes',    'receita'),
  (NULL, 'R05', 'Eventos',    'receita')
ON CONFLICT (organization_id, type, name) DO NOTHING;

-- 7.3 Grupos contábeis globais — Despesa
INSERT INTO public.finance_accounting_groups (organization_id, code, name, type)
VALUES
  (NULL, 'D01', 'Administrativo',  'despesa'),
  (NULL, 'D02', 'Manutencao',      'despesa'),
  (NULL, 'D03', 'Folha/Pastoral',  'despesa'),
  (NULL, 'D04', 'Missoes',         'despesa'),
  (NULL, 'D05', 'Eventos',         'despesa')
ON CONFLICT (organization_id, type, name) DO NOTHING;


-- =============================================================================
-- FIM DA MIGRATION
-- Nome: 20260707100000_production_finance_confiadcs_extension.sql
-- Revisão humana obrigatória antes de aplicar em produção Supabase.
-- =============================================================================
