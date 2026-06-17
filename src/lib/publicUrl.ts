/**
 * getPublicAppUrl — retorna a URL base pública da aplicação.
 *
 * Prioridade:
 *   1. VITE_PUBLIC_APP_URL  (ex: https://ecclesiabr.online)
 *   2. VITE_SITE_URL        (compatível com Supabase / Vercel)
 *   3. Fallback obrigatório: https://ecclesiabr.online
 *
 * NUNCA usa window.location.origin para links compartilháveis (WhatsApp,
 * Email, QR Code) porque em desenvolvimento retornaria localhost.
 */
export function getPublicAppUrl(): string {
  const fromEnv =
    (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) ||
    (import.meta.env.VITE_SITE_URL as string | undefined);

  if (fromEnv) return fromEnv.replace(/\/$/, "");

  return "https://ecclesiabr.online";
}
