/**
 * organizationContextGuard.ts
 *
 * Pequeno helper compartilhado para substituir o padrão silencioso
 * `if (!user || !church) return;` usado antes de qualquer escrita que
 * depende de `organization_id` (Membros, Comunicação, Documentos, etc).
 *
 * Esse guard silencioso escondia um bug real: durante o refetch em segundo
 * plano do bootstrap de autenticação, `church` podia ficar momentaneamente
 * `null` para usuários de plataforma em modo suporte (ver correção em
 * `useChurch.tsx`), e a operação de salvar simplesmente não fazia nada —
 * sem toast, sem erro no console, sem chamada de rede. Mesmo agora que a
 * causa raiz está corrigida, nunca falhar silenciosamente aqui evita que
 * qualquer outra causa futura (ex.: usuário de plataforma sem organização
 * selecionada) volte a se comportar como um botão "quebrado".
 *
 * Este helper distingue "contexto ainda carregando" (`loading`) de
 * "nenhuma organização ativa" (`missing`) para que o autor da tela escolha
 * a mensagem/ação adequada — nunca aborta a operação sem informar o motivo.
 */

export type OrganizationContextBlockReason = "loading" | "missing";

export type OrganizationContextCheck =
  | { ok: true }
  | { ok: false; reason: OrganizationContextBlockReason; message: string };

const LOADING_MESSAGE =
  "Contexto da organização ainda está carregando. Aguarde um instante e tente novamente.";
const MISSING_MESSAGE =
  "Nenhuma organização ativa selecionada. Selecione uma organização antes de continuar.";

/**
 * Verifica se é seguro prosseguir com uma escrita que depende de
 * `church.id`. Nunca retorna `ok: true` com `church` ausente — o chamador
 * ainda deve fazer sua própria checagem `if (!church) return` para o
 * TypeScript estreitar o tipo antes de usar `church.id`, mas agora tem uma
 * mensagem pronta para mostrar em vez de abortar em silêncio.
 */
export function checkOrganizationContext(
  churchId: string | null | undefined,
  churchLoading: boolean,
): OrganizationContextCheck {
  if (churchLoading) {
    return { ok: false, reason: "loading", message: LOADING_MESSAGE };
  }
  if (!churchId) {
    return { ok: false, reason: "missing", message: MISSING_MESSAGE };
  }
  return { ok: true };
}
