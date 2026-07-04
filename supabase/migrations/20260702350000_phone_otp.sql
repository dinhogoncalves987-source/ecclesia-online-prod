-- =============================================================================
-- Ecclesia Chat Definitivo — Migração 6: Login por Telefone / OTP WhatsApp
-- =============================================================================
-- Implementa fluxo de autenticação por telefone via código OTP enviado pelo
-- Gateway WhatsApp. Exclusivo para membros previamente cadastrados pela igreja.
-- =============================================================================

-- ── OTPs de membros por telefone ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.member_phone_otps (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  phone        text        NOT NULL,
  -- Hash bcrypt ou SHA-256 do código OTP. NUNCA armazenar o código em plaintext.
  code_hash    text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT (now() + INTERVAL '10 minutes'),
  used_at      timestamptz,
  attempts     integer     NOT NULL DEFAULT 0,
  max_attempts integer     NOT NULL DEFAULT 5,
  ip_address   text,
  user_agent   text
);

CREATE INDEX IF NOT EXISTS idx_mpo_phone_expires
  ON public.member_phone_otps (phone, expires_at)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mpo_member
  ON public.member_phone_otps (member_id, created_at DESC);

-- ── Log de mensagens WhatsApp ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.whatsapp_message_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_phone text        NOT NULL,
  message_type    text        NOT NULL DEFAULT 'otp'
    CHECK (message_type IN ('otp', 'invite', 'notification', 'broadcast')),
  status          text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'rejected')),
  -- ID retornado pelo gateway WhatsApp (para rastreamento)
  gateway_message_id text,
  payload_preview text,
  sent_at         timestamptz,
  delivered_at    timestamptz,
  error_message   text,
  retry_count     integer     NOT NULL DEFAULT 0,
  organization_id uuid,
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wml_status
  ON public.whatsapp_message_log (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wml_org
  ON public.whatsapp_message_log (organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.member_phone_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_message_log ENABLE ROW LEVEL SECURITY;

-- OTPs são gerenciados exclusivamente por Edge Functions (SECURITY DEFINER)
-- Nenhum acesso direto via cliente.
CREATE POLICY "mpo_no_direct_access"
  ON public.member_phone_otps FOR ALL
  USING (false)
  WITH CHECK (false);

-- Admins da org podem ver o log de mensagens WhatsApp
CREATE POLICY "wml_select_admin"
  ON public.whatsapp_message_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      WHERE ou.organization_id = whatsapp_message_log.organization_id
        AND ou.user_id = auth.uid()
        AND ou.is_active = true
        AND ou.role IN ('church_admin', 'super_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.platform_role IN ('super_admin', 'platform_admin')
    )
  );

-- ── Comentários ───────────────────────────────────────────────────────────────

COMMENT ON TABLE public.member_phone_otps IS
  'Códigos OTP para login por telefone via WhatsApp.
   Exclusivo para membros previamente cadastrados pela secretaria.
   code_hash = hash SHA-256 do código. NUNCA armazenar o código em plaintext.
   Gerenciado via Edge Functions com SECURITY DEFINER.';

COMMENT ON TABLE public.whatsapp_message_log IS
  'Log de todas as mensagens enviadas pelo Gateway WhatsApp.
   Usado para rastreamento, retry e auditoria.';
