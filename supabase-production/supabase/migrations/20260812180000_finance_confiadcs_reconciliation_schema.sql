-- =============================================================================
-- FINANCE CONFIADCS — RECONCILIAÇÃO ESTRUTURAL (FASE 1D-B1)
-- Migration: 20260812180000_finance_confiadcs_reconciliation_schema.sql
--
-- OBJETIVO:
--   Dar destino estruturado e auditável a todos os 21 campos da aba
--   "Base de Dados" da planilha oficial CONFIADCS, sem que nenhuma informação
--   sobreviva apenas dentro de `notes`. Sempre que um campo é resolvido para
--   uma FK (distrito, congregação, portador, grupo contábil, conta contábil,
--   tipo de documento, período), o texto original da planilha também é
--   preservado em uma coluna "raw" dedicada — nada é perdido na conversão.
--
--   Introduz um catálogo genérico de aliases/pendências de reconciliação
--   (`finance_import_catalog_aliases`) para que relacionamentos desconhecidos
--   NUNCA sejam descartados silenciosamente, NUNCA gravem FK nula sem motivo
--   registrado, e NUNCA tenham correspondência inventada — toda ambiguidade
--   vira pendência explícita, revisável por um humano depois.
--
--   Introduz reconciliação por lote (`finance_import_batches`, estendida) e
--   por linha (`finance_import_batch_rows`), permitindo provar depois de cada
--   importação que lidas = processadas = persistidas, com totais e datas
--   idênticos à planilha de origem.
--
--   Também cria uma unicidade parcial em `transactions.legacy_record_number`
--   por organização, evitando duplicação de um mesmo REGISTRO em reimportações.
--
-- SEGURANÇA:
--   Idempotente — pode ser rodada múltiplas vezes sem efeito colateral.
--   Usa ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS, DO blocks com
--   checagem de existência para constraints/índices.
--   NÃO destrói colunas, NÃO recria tabelas existentes, NÃO apaga dados.
--
-- REVISÃO HUMANA OBRIGATÓRIA antes de aplicar em produção.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 1: HELPER — normalização de rótulo de catálogo (uso interno/auditoria)
-- Dobra acentuação comum em português e colapsa espaços. É deliberadamente
-- simples: a decisão de auto-resolução acontece no importador (TypeScript),
-- nunca aqui — esta função só serve para o campo normalized_label de
-- diagnóstico/consulta.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._finance_normalize_catalog_label(p_label text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    btrim(
      regexp_replace(
        upper(
          translate(
            coalesce(p_label, ''),
            'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
            'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'
          )
        ),
        '\s+', ' ', 'g'
      )
    ),
    ''
  );
$$;

COMMENT ON FUNCTION public._finance_normalize_catalog_label(text) IS
  'Normalização simples (maiúsculas, sem acento, espaços colapsados) usada '
  'apenas para o campo de diagnóstico normalized_label. Nunca decide sozinha '
  'uma correspondência de catálogo — isso é feito no importador.';

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 2: NOVA TABELA — finance_periods (campo PERIODO da planilha)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.finance_periods (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label             text        NOT NULL,
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, label)
);

COMMENT ON TABLE public.finance_periods IS
  'Catálogo de períodos financeiros do CONFIADCS (campo PERIODO da planilha). '
  'Cada rótulo de período é sua própria identidade — não há ambiguidade de '
  'alias como em distrito/congregação, então o importador pode criar um '
  'período novo sob demanda (find-or-create), nunca uma correspondência '
  'inventada entre dois rótulos distintos.';

CREATE INDEX IF NOT EXISTS idx_finance_periods_org
  ON public.finance_periods(organization_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 3: NOVA TABELA — finance_import_catalog_aliases
-- Catálogo genérico de aliases/pendências de reconciliação para TODOS os
-- campos com relacionamento por catálogo (distrito, congregação, portador,
-- grupo contábil, conta contábil, tipo de documento, período).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.finance_import_catalog_aliases (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  catalog_type      text        NOT NULL CHECK (catalog_type IN (
                      'district', 'congregation', 'financial_account',
                      'accounting_group', 'account_category', 'document_type',
                      'period'
                    )),
  raw_label         text        NOT NULL,
  normalized_label  text        NOT NULL,
  -- resolved_id aponta para o id na tabela de destino do catalog_type
  -- (organizations.id para district/congregation, finance_accounts.id para
  -- financial_account, finance_accounting_groups.id, finance_account_categories.id,
  -- finance_document_types.id ou finance_periods.id). Não é FK física porque a
  -- tabela alvo varia por catalog_type (design polimórfico documentado, não
  -- oculto) — a integridade é garantida pela RPC de importação, único ponto
  -- de escrita desta tabela.
  resolved_id       uuid        NULL,
  resolution        text        NOT NULL DEFAULT 'pending'
                    CHECK (resolution IN ('auto_exact', 'manual', 'pending')),
  resolved_by       uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at       timestamptz NULL,
  notes             text        NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, catalog_type, raw_label)
);

COMMENT ON TABLE public.finance_import_catalog_aliases IS
  'Catálogo auditável de TODO rótulo textual de origem já visto pela '
  'importação CONFIADCS para campos com relacionamento por catálogo. '
  'resolution=pending significa que o texto da planilha não teve '
  'correspondência exata e automática encontrada — é proibido inventar '
  'correspondência aqui; a resolução pendente aguarda decisão manual '
  'registrada (resolution=manual, resolved_by, resolved_at). '
  'resolution=auto_exact registra correspondência determinística (mesmo '
  'nome normalizado) feita pelo importador — nunca por semelhança/fuzzy.';

CREATE INDEX IF NOT EXISTS idx_finance_catalog_aliases_org_type
  ON public.finance_import_catalog_aliases(organization_id, catalog_type);

CREATE INDEX IF NOT EXISTS idx_finance_catalog_aliases_pending
  ON public.finance_import_catalog_aliases(organization_id, catalog_type)
  WHERE resolution = 'pending';

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 4: EXTENSÃO — finance_import_batches (reconciliação por lote)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.finance_import_batches
  ADD COLUMN IF NOT EXISTS rows_read                    integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rows_persisted               integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rows_duplicate               integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rows_excluded_invalid        integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rows_pending_reconciliation  integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_entries_count         integer     NULL,
  ADD COLUMN IF NOT EXISTS source_exits_count           integer     NULL,
  ADD COLUMN IF NOT EXISTS source_entries_amount        numeric     NULL,
  ADD COLUMN IF NOT EXISTS source_exits_amount          numeric     NULL,
  ADD COLUMN IF NOT EXISTS persisted_entries_amount     numeric     NULL,
  ADD COLUMN IF NOT EXISTS persisted_exits_amount       numeric     NULL,
  ADD COLUMN IF NOT EXISTS reconciled                   boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconciliation_report        jsonb       NULL;

COMMENT ON COLUMN public.finance_import_batches.reconciled IS
  'true somente quando rows_read = rows_persisted + rows_duplicate + '
  'rows_excluded_invalid E persisted_entries_amount/persisted_exits_amount '
  'batem com os totais informados pelo cliente para o lote (source_*).';

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 5: NOVA TABELA — finance_import_batch_rows (reconciliação por linha)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.finance_import_batch_rows (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id       uuid        NOT NULL REFERENCES public.finance_import_batches(id) ON DELETE CASCADE,
  source_row_number     integer     NOT NULL,
  legacy_record_number  text        NULL,
  status                text        NOT NULL CHECK (status IN (
                          'persisted', 'duplicate', 'excluded_invalid'
                        )),
  transaction_id        uuid        NULL REFERENCES public.transactions(id) ON DELETE SET NULL,
  pending_fields        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  exclusion_reason      text        NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_batch_id, source_row_number)
);

COMMENT ON TABLE public.finance_import_batch_rows IS
  'Razão auditável linha a linha de cada importação CONFIADCS. Toda linha '
  'enviada para a RPC de importação gera exatamente um registro aqui — '
  'persisted (virou transação, mesmo que com pendências de catálogo em '
  'pending_fields), duplicate (legacy_record_number já existente para a '
  'organização) ou excluded_invalid (dado estruturalmente inválido: data, '
  'valor ou tipo). Nunca existe uma quarta categoria de "sucesso parcial '
  'silencioso" — o status é sempre exatamente um destes três.';

COMMENT ON COLUMN public.finance_import_batch_rows.pending_fields IS
  'Lista de objetos {field, catalog_type, raw_value} para cada campo com '
  'relacionamento por catálogo que não teve correspondência automática. A '
  'transação É persistida mesmo com pendências — pendência de catálogo '
  'nunca é motivo para rejeitar a linha inteira.';

CREATE INDEX IF NOT EXISTS idx_finance_import_batch_rows_batch
  ON public.finance_import_batch_rows(import_batch_id);

CREATE INDEX IF NOT EXISTS idx_finance_import_batch_rows_legacy
  ON public.finance_import_batch_rows(legacy_record_number)
  WHERE legacy_record_number IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 6: EXTENSÃO — transactions
-- Colunas "raw" para os 6 campos com relacionamento por FK + carimbo completo
-- + observação isolada (nunca mais concatenada em notes) + flag de pendência.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS raw_timestamp                 timestamptz NULL,
  ADD COLUMN IF NOT EXISTS district_raw_label            text        NULL,
  ADD COLUMN IF NOT EXISTS congregation_raw_label        text        NULL,
  ADD COLUMN IF NOT EXISTS financial_account_raw_label   text        NULL,
  ADD COLUMN IF NOT EXISTS accounting_group_raw_label    text        NULL,
  ADD COLUMN IF NOT EXISTS account_category_raw_label    text        NULL,
  ADD COLUMN IF NOT EXISTS document_type_raw_label       text        NULL,
  ADD COLUMN IF NOT EXISTS source_observation            text        NULL,
  ADD COLUMN IF NOT EXISTS period_id                     uuid        NULL,
  ADD COLUMN IF NOT EXISTS has_pending_reconciliation    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS import_source_row_number      integer     NULL;

COMMENT ON COLUMN public.transactions.raw_timestamp IS
  'Carimbo de data/hora original da planilha (campo 2 — data E hora, '
  'distinto de issue_date/accounting_date que são apenas data).';

COMMENT ON COLUMN public.transactions.source_observation IS
  'Texto verbatim do campo OBSERVAÇÃO da planilha (campo 11), isolado — '
  'nunca concatenado com fallbacks de outros campos. A coluna notes '
  'permanece livre para anotações internas/manuais.';

COMMENT ON COLUMN public.transactions.has_pending_reconciliation IS
  'true quando pelo menos um campo com relacionamento por catálogo '
  '(distrito, congregação, portador, grupo contábil, conta contábil, tipo '
  'de documento, período) não teve correspondência automática e está '
  'registrado como pendente em finance_import_catalog_aliases.';

DO $$
BEGIN
  -- FK: transactions.period_id → finance_periods
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_transactions_period'
      AND table_name = 'transactions'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT fk_transactions_period
      FOREIGN KEY (period_id)
      REFERENCES public.finance_periods(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_transactions_period
  ON public.transactions(period_id)
  WHERE period_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_pending_reconciliation
  ON public.transactions(organization_id)
  WHERE has_pending_reconciliation = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 7: UNICIDADE — evita duplicar um mesmo REGISTRO da planilha
-- (zero duplicadas indevidas, conforme contrato de reconciliação).
-- Parcial: só se aplica a linhas com legacy_record_number preenchido, e só
-- entre lançamentos importados por planilha — nunca afeta lançamentos manuais.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS transactions_org_legacy_record_spreadsheet_uidx
  ON public.transactions (organization_id, legacy_record_number)
  WHERE legacy_record_number IS NOT NULL AND origin = 'spreadsheet';

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 8: ROW LEVEL SECURITY — novas tabelas
-- Reaproveita os helpers já existentes is_org_finance_reader/writer, sem
-- criar nenhuma função nova de RLS.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.finance_periods                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_import_catalog_aliases    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_import_batch_rows         ENABLE ROW LEVEL SECURITY;

-- ── finance_periods ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "finance_periods select" ON public.finance_periods;
CREATE POLICY "finance_periods select" ON public.finance_periods
FOR SELECT TO authenticated
USING (public.is_org_finance_reader(auth.uid(), organization_id));

DROP POLICY IF EXISTS "finance_periods insert" ON public.finance_periods;
CREATE POLICY "finance_periods insert" ON public.finance_periods
FOR INSERT TO authenticated
WITH CHECK (public.is_org_finance_writer(auth.uid(), organization_id));

DROP POLICY IF EXISTS "finance_periods update" ON public.finance_periods;
CREATE POLICY "finance_periods update" ON public.finance_periods
FOR UPDATE TO authenticated
USING (public.is_org_finance_writer(auth.uid(), organization_id))
WITH CHECK (public.is_org_finance_writer(auth.uid(), organization_id));

DROP POLICY IF EXISTS "finance_periods delete" ON public.finance_periods;
CREATE POLICY "finance_periods delete" ON public.finance_periods
FOR DELETE TO authenticated
USING (public.is_org_finance_writer(auth.uid(), organization_id));

-- ── finance_import_catalog_aliases ────────────────────────────────────────────
DROP POLICY IF EXISTS "catalog_aliases select" ON public.finance_import_catalog_aliases;
CREATE POLICY "catalog_aliases select" ON public.finance_import_catalog_aliases
FOR SELECT TO authenticated
USING (public.is_org_finance_reader(auth.uid(), organization_id));

DROP POLICY IF EXISTS "catalog_aliases insert" ON public.finance_import_catalog_aliases;
CREATE POLICY "catalog_aliases insert" ON public.finance_import_catalog_aliases
FOR INSERT TO authenticated
WITH CHECK (public.is_org_finance_writer(auth.uid(), organization_id));

DROP POLICY IF EXISTS "catalog_aliases update" ON public.finance_import_catalog_aliases;
CREATE POLICY "catalog_aliases update" ON public.finance_import_catalog_aliases
FOR UPDATE TO authenticated
USING (public.is_org_finance_writer(auth.uid(), organization_id))
WITH CHECK (public.is_org_finance_writer(auth.uid(), organization_id));

DROP POLICY IF EXISTS "catalog_aliases delete" ON public.finance_import_catalog_aliases;
CREATE POLICY "catalog_aliases delete" ON public.finance_import_catalog_aliases
FOR DELETE TO authenticated
USING (public.is_org_finance_writer(auth.uid(), organization_id));

-- ── finance_import_batch_rows ─────────────────────────────────────────────────
-- Escopo via o lote pai (sem organization_id direto na tabela filha), mesmo
-- padrão já usado por finance_accountability_approvals.
DROP POLICY IF EXISTS "import_batch_rows select" ON public.finance_import_batch_rows;
CREATE POLICY "import_batch_rows select" ON public.finance_import_batch_rows
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.finance_import_batches b
    WHERE b.id = import_batch_id
      AND public.is_org_finance_reader(auth.uid(), b.organization_id)
  )
);

DROP POLICY IF EXISTS "import_batch_rows insert" ON public.finance_import_batch_rows;
CREATE POLICY "import_batch_rows insert" ON public.finance_import_batch_rows
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.finance_import_batches b
    WHERE b.id = import_batch_id
      AND public.is_org_finance_writer(auth.uid(), b.organization_id)
  )
);

-- Linhas de reconciliação são um log de auditoria — nunca editáveis nem
-- deletáveis pela API, somente leitura + inserção pela própria RPC de import.

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 9: GRANTS explícitos para authenticated
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_periods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_import_catalog_aliases TO authenticated;
GRANT SELECT, INSERT ON public.finance_import_batch_rows TO authenticated;

-- =============================================================================
-- FIM DA MIGRATION
-- Nome: 20260812180000_finance_confiadcs_reconciliation_schema.sql
-- Revisão humana obrigatória antes de aplicar em produção Supabase.
-- =============================================================================
