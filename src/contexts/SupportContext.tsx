/**
 * SupportContext.tsx
 *
 * Contexto global de suporte da plataforma Ecclesia.
 *
 * Responsabilidades:
 *   - Detectar se o usuário logado é um usuário de plataforma (super_admin, platform_admin, support_*)
 *   - Gerenciar a organização em atendimento (activeSupportOrg)
 *   - Persistir contexto em sessionStorage (limpa ao fechar o browser, por segurança)
 *   - Expor helpers para definir/limpar o contexto de suporte
 *
 * Hierarquia de providers:
 *   AuthProvider → SupportContextProvider → ChurchProvider → páginas
 *
 * Para usuários comuns de igreja (não plataforma):
 *   - isPlatformUser = false
 *   - activeSupportOrg = null
 *   - Nenhum comportamento especial
 *
 * Para Super Admin / suporte sem org selecionada:
 *   - isPlatformUser = true
 *   - activeSupportOrg = null
 *   - ChurchProvider define church = null → módulos operacionais mostram estado vazio
 *
 * Para Super Admin / suporte com org selecionada:
 *   - isPlatformUser = true
 *   - activeSupportOrg = Church (org em atendimento)
 *   - ChurchProvider usa activeSupportOrg como church ativo
 *   - Todos os módulos operam no contexto dessa organização
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { isPlatformRole, type PlatformRole } from "@/lib/platformSupportPermissions";
import { logSupportAudit } from "@/lib/platformSupportAudit";
import type { Church } from "@/hooks/useChurchContext";

// ── Storage ──────────────────────────────────────────────────────────────────
const SUPPORT_ORG_KEY = "ecclesia.supportOrg";

interface PersistedSupportOrg {
  id: string;
  name: string;
  slug: string;
  organization_type: string | null;
  city: string | null;
  state: string | null;
  hierarchy_model: string | null;
  selectedAt: string;
}

// ── Context shape ─────────────────────────────────────────────────────────────

export interface SupportContextType {
  /** true se o usuário logado tem perfil de plataforma (não é usuário de igreja) */
  isPlatformUser: boolean;
  /** Perfil da plataforma do usuário logado */
  platformRole: PlatformRole | null;
  /** Organização em atendimento (null = nenhuma selecionada) */
  activeSupportOrg: Church | null;
  /** true se há uma organização selecionada em modo suporte */
  isSupportModeActive: boolean;
  /** true enquanto detecta se o usuário é de plataforma */
  loadingPlatformRole: boolean;
  /** Define a organização em atendimento */
  setSupportOrg: (org: Church) => void;
  /** Remove a organização em atendimento */
  clearSupportOrg: () => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const SupportContext = createContext<SupportContextType>({
  isPlatformUser:      false,
  platformRole:        null,
  activeSupportOrg:    null,
  isSupportModeActive: false,
  loadingPlatformRole: true,
  setSupportOrg:       () => undefined,
  clearSupportOrg:     () => undefined,
});

// ── Select columns for org fetch ──────────────────────────────────────────────

const ORG_SELECT = [
  "id", "parent_id", "name", "slug", "organization_type",
  "city", "state", "email", "phone", "logo_url", "active",
  "unit_status", "denomination_type", "hierarchy_model",
  "top_level_label", "top_level_label_plural",
  "municipal_level_label", "municipal_level_label_plural",
  "intermediate_level_label", "intermediate_level_label_plural",
  "local_unit_label", "local_unit_label_plural",
  "uses_convention_level", "uses_municipal_level",
  "uses_intermediate_level", "uses_local_units",
  "has_operational_cashbox", "is_financially_autonomous",
  "financially_consolidates_to_id", "cnpj", "financial_policy_notes",
].join(",");

function mapRowToChurch(org: Record<string, unknown>): Church {
  return {
    id:                            org.id as string,
    name:                          org.name as string,
    slug:                          org.slug as string,
    logo_url:                      (org.logo_url as string) ?? null,
    primary_color:                 null,
    parent_church_id:              (org.parent_id as string) ?? null,
    is_matriz:                     org.organization_type === "matriz" || org.organization_type === "sede",
    organization_type:             (org.organization_type as string) ?? null,
    address:                       null,
    city:                          (org.city as string) ?? null,
    state:                         (org.state as string) ?? null,
    phone:                         (org.phone as string) ?? null,
    email:                         (org.email as string) ?? null,
    pastor_name:                   null,
    unit_status:                   (org.unit_status as string) ?? null,
    denomination_type:             (org.denomination_type as string) ?? null,
    hierarchy_model:               (org.hierarchy_model as string) ?? null,
    top_level_label:               (org.top_level_label as string) ?? null,
    top_level_label_plural:        (org.top_level_label_plural as string) ?? null,
    municipal_level_label:         (org.municipal_level_label as string) ?? null,
    municipal_level_label_plural:  (org.municipal_level_label_plural as string) ?? null,
    intermediate_level_label:      (org.intermediate_level_label as string) ?? null,
    intermediate_level_label_plural:(org.intermediate_level_label_plural as string) ?? null,
    local_unit_label:              (org.local_unit_label as string) ?? null,
    local_unit_label_plural:       (org.local_unit_label_plural as string) ?? null,
    uses_convention_level:         (org.uses_convention_level as boolean) ?? null,
    uses_municipal_level:          (org.uses_municipal_level as boolean) ?? null,
    uses_intermediate_level:       (org.uses_intermediate_level as boolean) ?? null,
    uses_local_units:              (org.uses_local_units as boolean) ?? null,
    has_operational_cashbox:       (org.has_operational_cashbox as boolean) ?? null,
    is_financially_autonomous:     (org.is_financially_autonomous as boolean) ?? null,
    financially_consolidates_to_id:(org.financially_consolidates_to_id as string) ?? null,
    cnpj:                          (org.cnpj as string) ?? null,
    financial_policy_notes:        (org.financial_policy_notes as string) ?? null,
  };
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function SupportContextProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [platformRole, setPlatformRole]           = useState<PlatformRole | null>(null);
  const [activeSupportOrg, setActiveSupportOrg]   = useState<Church | null>(null);
  const [loadingPlatformRole, setLoadingPlatformRole] = useState(true);

  // ── Detect platform role on login ─────────────────────────────────────────
  useEffect(() => {
    if (!user) {
      setPlatformRole(null);
      setActiveSupportOrg(null);
      setLoadingPlatformRole(false);
      return;
    }

    let cancelled = false;
    setLoadingPlatformRole(true);

    (async () => {
      // Check profiles.platform_role first
      const { data: profile } = await supabase
        .from("profiles")
        .select("platform_role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      const profileRole = profile?.platform_role ?? null;

      // Also check super_admins table fallback
      let resolvedRole: PlatformRole | null = null;
      if (profileRole && isPlatformRole(profileRole)) {
        resolvedRole = profileRole as PlatformRole;
      } else {
        const { data: saRow } = await supabase
          .from("super_admins")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (saRow?.user_id) resolvedRole = "super_admin";
      }

      if (cancelled) return;
      setPlatformRole(resolvedRole);

      // Restore persisted support org (session only)
      if (resolvedRole) {
        const raw = sessionStorage.getItem(SUPPORT_ORG_KEY);
        if (raw) {
          try {
            const persisted: PersistedSupportOrg = JSON.parse(raw);
            // Fetch full org to have up-to-date data
            const { data } = await supabase
              .from("organizations")
              .select(ORG_SELECT)
              .eq("id", persisted.id)
              .eq("active", true)
              .maybeSingle();
            if (cancelled) return;
            if (data) setActiveSupportOrg(mapRowToChurch(data as Record<string, unknown>));
            else sessionStorage.removeItem(SUPPORT_ORG_KEY);
          } catch {
            sessionStorage.removeItem(SUPPORT_ORG_KEY);
          }
        }
      }

      setLoadingPlatformRole(false);
    })();

    return () => { cancelled = true; };
  }, [user]);

  // ── setSupportOrg ─────────────────────────────────────────────────────────
  const setSupportOrg = useCallback((org: Church) => {
    const persisted: PersistedSupportOrg = {
      id:                org.id,
      name:              org.name,
      slug:              org.slug,
      organization_type: org.organization_type,
      city:              org.city,
      state:             org.state,
      hierarchy_model:   org.hierarchy_model,
      selectedAt:        new Date().toISOString(),
    };
    sessionStorage.setItem(SUPPORT_ORG_KEY, JSON.stringify(persisted));
    setActiveSupportOrg(org);

    if (user && platformRole) {
      void logSupportAudit({
        action:                 "support_context_selected",
        actorUserId:            user.id,
        actorPlatformRole:      platformRole,
        targetOrganizationId:   org.id,
        metadata: { org_name: org.name, org_type: org.organization_type },
      });
    }
  }, [user, platformRole]);

  // ── clearSupportOrg ───────────────────────────────────────────────────────
  const clearSupportOrg = useCallback(() => {
    const prevOrgId = activeSupportOrg?.id;
    sessionStorage.removeItem(SUPPORT_ORG_KEY);
    setActiveSupportOrg(null);

    if (user && platformRole && prevOrgId) {
      void logSupportAudit({
        action:               "support_context_cleared",
        actorUserId:          user.id,
        actorPlatformRole:    platformRole,
        targetOrganizationId: prevOrgId,
      });
    }
  }, [user, platformRole, activeSupportOrg]);

  const value = useMemo<SupportContextType>(() => ({
    isPlatformUser:      platformRole !== null,
    platformRole,
    activeSupportOrg,
    isSupportModeActive: activeSupportOrg !== null,
    loadingPlatformRole,
    setSupportOrg,
    clearSupportOrg,
  }), [platformRole, activeSupportOrg, loadingPlatformRole, setSupportOrg, clearSupportOrg]);

  return (
    <SupportContext.Provider value={value}>
      {children}
    </SupportContext.Provider>
  );
}

// ── Consumer hook ─────────────────────────────────────────────────────────────

export function useSupportContext(): SupportContextType {
  return useContext(SupportContext);
}
