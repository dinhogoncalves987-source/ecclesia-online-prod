-- Staging treasury RLS fix.
-- Keep audit logs protected while allowing the transaction audit trigger to write.

CREATE OR REPLACE FUNCTION public.audit_finance_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

REVOKE ALL ON FUNCTION public.audit_finance_transaction() FROM PUBLIC;
