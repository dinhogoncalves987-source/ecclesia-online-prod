/**
 * useEffectiveOrganization.ts
 *
 * Hook central que resolve a organização efetiva do usuário atual.
 *
 * Regras:
 *   - Usuário comum de igreja:    effectiveChurch = church do vínculo
 *   - Plataforma sem contexto:    effectiveChurch = null
 *   - Plataforma com contexto:    effectiveChurch = activeSupportOrg
 *
 * Este hook é a fonte única de verdade para organization_id efetivo.
 * Módulos que precisam do org_id devem usar este hook em vez de useChurch diretamente.
 * Para retrocompatibilidade, useChurch() já retorna o valor correto quando SupportContext
 * está integrado ao ChurchProvider.
 */

import { useChurch } from "@/hooks/useChurchContext";
import { useSupportContext } from "@/contexts/SupportContext";
import type { Church } from "@/hooks/useChurchContext";

export interface EffectiveOrganization {
  /** Organização efetiva (null = sem contexto para plataforma, ou ainda carregando) */
  effectiveChurch: Church | null;
  /** ID da organização efetiva */
  effectiveOrganizationId: string | null;
  /** true se é usuário de plataforma */
  isPlatformUser: boolean;
  /** true se está em modo suporte ativo (plataforma com org selecionada) */
  isSupportModeActive: boolean;
  /** true se a organização ainda está sendo carregada */
  loading: boolean;
}

export function useEffectiveOrganization(): EffectiveOrganization {
  const { church, loading: churchLoading } = useChurch();
  const { isPlatformUser, activeSupportOrg, isSupportModeActive, loadingPlatformRole } = useSupportContext();

  const effectiveChurch = isPlatformUser ? activeSupportOrg : church;

  return {
    effectiveChurch,
    effectiveOrganizationId: effectiveChurch?.id ?? null,
    isPlatformUser,
    isSupportModeActive,
    loading: churchLoading || loadingPlatformRole,
  };
}
