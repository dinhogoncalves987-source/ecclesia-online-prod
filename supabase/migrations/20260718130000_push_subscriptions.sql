-- ============================================================================
-- Migration: push_subscriptions
-- Timestamp: 20260718130000
-- ============================================================================
--
-- OBJETIVO
-- Suportar notificação real de mensagem quando o app está totalmente
-- fechado ou o celular está travado (Web Push), e não apenas em segundo
-- plano com a aba/app ainda aberto (que já era coberto por
-- src/lib/chatNotifications.ts + Notification API).
--
-- Cada linha é UMA inscrição de push de UM dispositivo/navegador de UM
-- usuário (endpoint do serviço de push do navegador — FCM no Chrome/
-- Android, Mozilla no Firefox, APNs web push no Safari/iOS 16.4+ — e as
-- chaves públicas de criptografia da inscrição). O envio real acontece na
-- Edge Function send-chat-push, usando as chaves VAPID (segredo
-- VAPID_PRIVATE_KEY, nunca neste banco).
--
-- Um mesmo usuário pode ter várias inscrições (várias abas/dispositivos);
-- por isso a chave é (user_id, endpoint), não apenas user_id.
--
-- Idempotente e forward-only.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint     text NOT NULL,
  p256dh       text NOT NULL,
  auth_key     text NOT NULL,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

COMMENT ON TABLE public.push_subscriptions IS
  'Inscrições de Web Push (PushSubscription do navegador) por usuário/dispositivo — usadas pela Edge Function send-chat-push para notificar mensagens novas mesmo com o app fechado.';
COMMENT ON COLUMN public.push_subscriptions.endpoint IS 'URL do serviço de push do navegador (FCM/Mozilla/APNs) — não é segredo, mas é específico do dispositivo.';
COMMENT ON COLUMN public.push_subscriptions.p256dh IS 'Chave pública de criptografia da inscrição (PushSubscription.getKey("p256dh"), base64url).';
COMMENT ON COLUMN public.push_subscriptions.auth_key IS 'Segredo de autenticação da inscrição (PushSubscription.getKey("auth"), base64url) — usado só para cifrar o payload enviado a este endpoint específico.';

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push subscriptions own select" ON public.push_subscriptions;
CREATE POLICY "push subscriptions own select" ON public.push_subscriptions
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "push subscriptions own insert" ON public.push_subscriptions;
CREATE POLICY "push subscriptions own insert" ON public.push_subscriptions
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push subscriptions own update" ON public.push_subscriptions;
CREATE POLICY "push subscriptions own update" ON public.push_subscriptions
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push subscriptions own delete" ON public.push_subscriptions;
CREATE POLICY "push subscriptions own delete" ON public.push_subscriptions
FOR DELETE TO authenticated
USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;

-- ============================================================================
-- Verificação final
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.push_subscriptions') IS NULL THEN
    RAISE EXCEPTION 'public.push_subscriptions não foi criada';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.push_subscriptions'::regclass) THEN
    RAISE EXCEPTION 'public.push_subscriptions sem RLS habilitado';
  END IF;

  RAISE NOTICE 'Migration push_subscriptions: confirmado ✓';
END $$;
