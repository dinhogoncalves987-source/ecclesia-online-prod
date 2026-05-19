-- Staging-only treasury MVP baseline.
-- Apply only after 20260512090000_staging_core_baseline.sql on the staging project.
-- Do not run the legacy churches/church_id migrations before this file.

CREATE OR REPLACE FUNCTION public.is_platform_finance_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = _user_id
      AND COALESCE(p.platform_role, '') IN ('platform_admin', 'super_admin', 'superadmin')
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role::text IN ('platform_admin', 'super_admin', 'superadmin')
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_finance_role(
  _user_id uuid,
  _organization_id uuid,
  _roles text[]
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_finance_admin(_user_id)
  OR EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = _user_id
      AND ou.organization_id = _organization_id
      AND COALESCE(ou.is_active, true) = true
      AND COALESCE(ou.role, 'member') = ANY(_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_finance_reader(
  _user_id uuid,
  _organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_org_finance_role(
    _user_id,
    _organization_id,
    ARRAY['admin', 'church_admin', 'tesoureiro', 'contador']
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_finance_writer(
  _user_id uuid,
  _organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_org_finance_role(
    _user_id,
    _organization_id,
    ARRAY['admin', 'church_admin', 'tesoureiro']
  );
$$;

CREATE TABLE IF NOT EXISTS public.finance_account_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('receita', 'despesa')),
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS public.finance_cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('matriz', 'congregacao', 'departamento', 'evento')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS public.finance_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('caixa', 'banco', 'pix', 'especie')),
  pix_key text,
  opening_balance numeric NOT NULL DEFAULT 0,
  current_balance numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL,
  type text NOT NULL CHECK (type IN ('Entrada', 'Saida')),
  amount numeric NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'Pendente',
  category text NOT NULL CHECK (length(trim(category)) > 0),
  account_category_id uuid REFERENCES public.finance_account_categories(id) ON DELETE SET NULL,
  cost_center_id uuid REFERENCES public.finance_cost_centers(id) ON DELETE SET NULL,
  financial_account_id uuid REFERENCES public.finance_accounts(id) ON DELETE SET NULL,
  responsible_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payment_method text,
  receipt_url text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.finance_monthly_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  month text NOT NULL CHECK (month ~ '^[0-9]{4}-[0-9]{2}$'),
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  UNIQUE (organization_id, month)
);

CREATE TABLE IF NOT EXISTS public.finance_transaction_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  old_data jsonb,
  new_data jsonb
);

INSERT INTO public.finance_account_categories (organization_id, code, name, type, is_system)
SELECT o.id, seed.code, seed.name, seed.type, true
FROM public.organizations o
CROSS JOIN (VALUES
  ('1.01', 'Dizimos', 'receita'),
  ('1.02', 'Ofertas', 'receita'),
  ('1.03', 'Campanhas', 'receita'),
  ('1.04', 'Missoes', 'receita'),
  ('1.05', 'Eventos', 'receita'),
  ('2.01', 'Administrativo', 'despesa'),
  ('2.02', 'Manutencao', 'despesa'),
  ('2.03', 'Folha/Pastoral', 'despesa'),
  ('2.04', 'Missoes', 'despesa'),
  ('2.05', 'Eventos', 'despesa')
) AS seed(code, name, type)
ON CONFLICT (organization_id, code) DO NOTHING;

INSERT INTO public.finance_cost_centers (organization_id, name, type)
SELECT o.id, seed.name, seed.type
FROM public.organizations o
CROSS JOIN (VALUES
  ('Matriz', 'matriz'),
  ('Congregacoes', 'congregacao'),
  ('Departamentos', 'departamento'),
  ('Eventos', 'evento')
) AS seed(name, type)
ON CONFLICT (organization_id, name) DO NOTHING;

INSERT INTO public.finance_accounts (organization_id, name, type)
SELECT o.id, seed.name, seed.type
FROM public.organizations o
CROSS JOIN (VALUES
  ('Caixa', 'caixa'),
  ('Banco', 'banco'),
  ('PIX', 'pix'),
  ('Especie', 'especie')
) AS seed(name, type)
ON CONFLICT (organization_id, name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_finance_defaults_for_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.finance_account_categories (organization_id, code, name, type, is_system)
  VALUES
    (NEW.id, '1.01', 'Dizimos', 'receita', true),
    (NEW.id, '1.02', 'Ofertas', 'receita', true),
    (NEW.id, '1.03', 'Campanhas', 'receita', true),
    (NEW.id, '1.04', 'Missoes', 'receita', true),
    (NEW.id, '1.05', 'Eventos', 'receita', true),
    (NEW.id, '2.01', 'Administrativo', 'despesa', true),
    (NEW.id, '2.02', 'Manutencao', 'despesa', true),
    (NEW.id, '2.03', 'Folha/Pastoral', 'despesa', true),
    (NEW.id, '2.04', 'Missoes', 'despesa', true),
    (NEW.id, '2.05', 'Eventos', 'despesa', true)
  ON CONFLICT (organization_id, code) DO NOTHING;

  INSERT INTO public.finance_cost_centers (organization_id, name, type)
  VALUES
    (NEW.id, 'Matriz', 'matriz'),
    (NEW.id, 'Congregacoes', 'congregacao'),
    (NEW.id, 'Departamentos', 'departamento'),
    (NEW.id, 'Eventos', 'evento')
  ON CONFLICT (organization_id, name) DO NOTHING;

  INSERT INTO public.finance_accounts (organization_id, name, type)
  VALUES
    (NEW.id, 'Caixa', 'caixa'),
    (NEW.id, 'Banco', 'banco'),
    (NEW.id, 'PIX', 'pix'),
    (NEW.id, 'Especie', 'especie')
  ON CONFLICT (organization_id, name) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_finance_defaults_on_organization ON public.organizations;
CREATE TRIGGER seed_finance_defaults_on_organization
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.seed_finance_defaults_for_org();

CREATE OR REPLACE FUNCTION public.is_finance_month_closed(
  _organization_id uuid,
  _date date
) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.finance_monthly_closings fmc
    WHERE fmc.organization_id = _organization_id
      AND fmc.month = to_char(_date, 'YYYY-MM')
  );
$$;

CREATE OR REPLACE FUNCTION public.guard_closed_finance_month()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  target_org uuid;
  target_date date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_org := OLD.organization_id;
    target_date := OLD.date;
  ELSE
    target_org := NEW.organization_id;
    target_date := NEW.date;
  END IF;

  IF public.is_finance_month_closed(target_org, target_date) THEN
    RAISE EXCEPTION 'Periodo financeiro fechado para edicao';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  NEW.updated_at := now();
  NEW.updated_by := auth.uid();

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.responsible_id := COALESCE(NEW.responsible_id, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_closed_finance_month_trigger ON public.transactions;
CREATE TRIGGER guard_closed_finance_month_trigger
BEFORE INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.guard_closed_finance_month();

CREATE OR REPLACE FUNCTION public.audit_finance_transaction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  target_org uuid;
  target_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_org := OLD.organization_id;
    target_id := OLD.id;
  ELSE
    target_org := NEW.organization_id;
    target_id := NEW.id;
  END IF;

  INSERT INTO public.finance_transaction_audit_logs (
    transaction_id,
    organization_id,
    action,
    changed_by,
    old_data,
    new_data
  ) VALUES (
    target_id,
    target_org,
    lower(TG_OP),
    auth.uid(),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_finance_transaction_trigger ON public.transactions;
CREATE TRIGGER audit_finance_transaction_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.audit_finance_transaction();

CREATE INDEX IF NOT EXISTS idx_finance_categories_org ON public.finance_account_categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_finance_cost_centers_org ON public.finance_cost_centers(organization_id);
CREATE INDEX IF NOT EXISTS idx_finance_accounts_org ON public.finance_accounts(organization_id);
CREATE INDEX IF NOT EXISTS idx_transactions_organization_date ON public.transactions(organization_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_finance_account ON public.transactions(financial_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_cost_center ON public.transactions(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_finance_audit_org_date ON public.finance_transaction_audit_logs(organization_id, changed_at DESC);

ALTER TABLE public.finance_account_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_monthly_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_transaction_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance categories readers read" ON public.finance_account_categories;
CREATE POLICY "finance categories readers read" ON public.finance_account_categories
FOR SELECT TO authenticated
USING (public.is_org_finance_reader(auth.uid(), organization_id));

DROP POLICY IF EXISTS "finance categories writers manage" ON public.finance_account_categories;
CREATE POLICY "finance categories writers manage" ON public.finance_account_categories
FOR ALL TO authenticated
USING (public.is_org_finance_writer(auth.uid(), organization_id))
WITH CHECK (public.is_org_finance_writer(auth.uid(), organization_id));

DROP POLICY IF EXISTS "finance cost centers readers read" ON public.finance_cost_centers;
CREATE POLICY "finance cost centers readers read" ON public.finance_cost_centers
FOR SELECT TO authenticated
USING (public.is_org_finance_reader(auth.uid(), organization_id));

DROP POLICY IF EXISTS "finance cost centers writers manage" ON public.finance_cost_centers;
CREATE POLICY "finance cost centers writers manage" ON public.finance_cost_centers
FOR ALL TO authenticated
USING (public.is_org_finance_writer(auth.uid(), organization_id))
WITH CHECK (public.is_org_finance_writer(auth.uid(), organization_id));

DROP POLICY IF EXISTS "finance accounts readers read" ON public.finance_accounts;
CREATE POLICY "finance accounts readers read" ON public.finance_accounts
FOR SELECT TO authenticated
USING (public.is_org_finance_reader(auth.uid(), organization_id));

DROP POLICY IF EXISTS "finance accounts writers manage" ON public.finance_accounts;
CREATE POLICY "finance accounts writers manage" ON public.finance_accounts
FOR ALL TO authenticated
USING (public.is_org_finance_writer(auth.uid(), organization_id))
WITH CHECK (public.is_org_finance_writer(auth.uid(), organization_id));

DROP POLICY IF EXISTS "finance closings readers read" ON public.finance_monthly_closings;
CREATE POLICY "finance closings readers read" ON public.finance_monthly_closings
FOR SELECT TO authenticated
USING (public.is_org_finance_reader(auth.uid(), organization_id));

DROP POLICY IF EXISTS "finance closings writers manage" ON public.finance_monthly_closings;
CREATE POLICY "finance closings writers manage" ON public.finance_monthly_closings
FOR ALL TO authenticated
USING (public.is_org_finance_writer(auth.uid(), organization_id))
WITH CHECK (public.is_org_finance_writer(auth.uid(), organization_id));

DROP POLICY IF EXISTS "finance audit readers read" ON public.finance_transaction_audit_logs;
CREATE POLICY "finance audit readers read" ON public.finance_transaction_audit_logs
FOR SELECT TO authenticated
USING (public.is_org_finance_reader(auth.uid(), organization_id));

DROP POLICY IF EXISTS "finance transactions readers read" ON public.transactions;
CREATE POLICY "finance transactions readers read" ON public.transactions
FOR SELECT TO authenticated
USING (public.is_org_finance_reader(auth.uid(), organization_id));

DROP POLICY IF EXISTS "finance transactions writers insert" ON public.transactions;
CREATE POLICY "finance transactions writers insert" ON public.transactions
FOR INSERT TO authenticated
WITH CHECK (
  public.is_org_finance_writer(auth.uid(), organization_id)
  AND NOT public.is_finance_month_closed(organization_id, date)
);

DROP POLICY IF EXISTS "finance transactions writers update" ON public.transactions;
CREATE POLICY "finance transactions writers update" ON public.transactions
FOR UPDATE TO authenticated
USING (
  public.is_org_finance_writer(auth.uid(), organization_id)
  AND NOT public.is_finance_month_closed(organization_id, date)
)
WITH CHECK (
  public.is_org_finance_writer(auth.uid(), organization_id)
  AND NOT public.is_finance_month_closed(organization_id, date)
);

DROP POLICY IF EXISTS "finance transactions writers delete" ON public.transactions;
CREATE POLICY "finance transactions writers delete" ON public.transactions
FOR DELETE TO authenticated
USING (
  public.is_org_finance_writer(auth.uid(), organization_id)
  AND NOT public.is_finance_month_closed(organization_id, date)
);
