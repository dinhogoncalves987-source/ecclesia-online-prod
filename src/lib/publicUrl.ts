import { environment } from "@/config/environment";

/**
 * getPublicAppUrl — retorna a URL base pública da aplicação para o ambiente
 * atual (produção OU staging), sempre a partir de `VITE_PUBLIC_APP_URL`
 * (validada por src/config/environment.ts).
 *
 * NÃO existe fallback silencioso para o domínio oficial de produção: se
 * `VITE_PUBLIC_APP_URL` estiver ausente ou inválida, a aplicação já falha
 * fechado na inicialização (import de `environment`) — este helper nunca
 * precisa (nem pode) inventar um domínio.
 *
 * NUNCA usa window.location.origin para links compartilháveis (WhatsApp,
 * Email, QR Code) porque em desenvolvimento retornaria localhost, e em
 * staging poderia gerar links inconsistentes com o domínio configurado.
 */
export function getPublicAppUrl(): string {
  return environment.publicAppUrl;
}
