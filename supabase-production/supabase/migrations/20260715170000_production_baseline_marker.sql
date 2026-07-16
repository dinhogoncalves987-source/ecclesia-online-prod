-- Baseline exclusivo da produção.
--
-- A reconciliação de segurança foi aplicada manualmente no projeto
-- zsonukpxahaxffugavfu em 2026-07-15 e retornou ok=true. Esta migration não
-- repete a reconciliação e não altera schema nem dados. Ela apenas valida o
-- estado existente antes de a CLI registrar esta versão no histórico remoto.
-- Qualquer divergência aborta a transação e impede um baseline falso.

DO $production_baseline$
DECLARE
  admin_definition text;
  super_admins_oid regclass;
  access_invites_oid regclass;
  profiles_oid regclass;
BEGIN
  super_admins_oid := to_regclass('public.super_admins');
  access_invites_oid := to_regclass('public.access_invites');
  profiles_oid := to_regclass('public.profiles');

  IF super_admins_oid IS NULL THEN
    RAISE EXCEPTION 'Baseline recusado: public.super_admins ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = super_admins_oid
      AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Baseline recusado: RLS de public.super_admins desabilitado';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.super_admins) THEN
    RAISE EXCEPTION 'Baseline recusado: nenhuma autoridade raiz regularizada';
  END IF;

  IF to_regprocedure('public.is_platform_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Baseline recusado: public.is_platform_admin(uuid) ausente';
  END IF;

  SELECT lower(pg_get_functiondef('public.is_platform_admin(uuid)'::regprocedure))
  INTO admin_definition;

  IF admin_definition NOT LIKE '%public.super_admins%'
     OR admin_definition LIKE '%public.profiles%'
     OR admin_definition LIKE '%public.user_roles%' THEN
    RAISE EXCEPTION 'Baseline recusado: autoridade raiz usa fonte insegura';
  END IF;

  IF to_regprocedure('public.join_organization_by_slug(text)') IS NOT NULL THEN
    RAISE EXCEPTION 'Baseline recusado: ingresso aberto por slug ainda existe';
  END IF;

  IF to_regprocedure('public.finalize_member_invite_activation(text,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'Baseline recusado: finalização insegura de convite ainda existe';
  END IF;

  IF profiles_oid IS NULL OR NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = profiles_oid
      AND tgname = 'protect_profiles_admin_columns'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Baseline recusado: proteção de autoridade em profiles ausente';
  END IF;

  IF access_invites_oid IS NULL THEN
    RAISE EXCEPTION 'Baseline recusado: public.access_invites ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = access_invites_oid
      AND conname = 'access_invites_email_required'
  ) THEN
    RAISE EXCEPTION 'Baseline recusado: e-mail obrigatório de access_invites ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = access_invites_oid
      AND conname = 'access_invites_role_allowed'
  ) THEN
    RAISE EXCEPTION 'Baseline recusado: papéis permitidos de access_invites ausentes';
  END IF;
END;
$production_baseline$;
