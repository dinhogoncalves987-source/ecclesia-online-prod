-- Membros: impedir DELETE de registros com status terminal (Falecido, Transferido).
-- Reforça regra de negócio pastoral; aplica a todo staff, inclusive platform admin via has_org_role.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'members'
  ) THEN
    DROP POLICY IF EXISTS "members org staff delete" ON public.members;

    CREATE POLICY "members org staff delete" ON public.members
    FOR DELETE TO authenticated
    USING (
      status NOT IN ('Falecido', 'Transferido')
      AND public.has_org_role(
        auth.uid(), organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor']
      )
    );
  END IF;
END $$;
