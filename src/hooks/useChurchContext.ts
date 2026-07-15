import { createContext, useContext } from "react";

export interface Church {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string | null;
  parent_church_id: string | null;
  is_matriz: boolean;
  organization_type: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  pastor_name: string | null;
  // ── Status operacional ────────────────────────────────
  unit_status: string | null;
  // ── Configuração denominacional ───────────────────────
  denomination_type: string | null;
  hierarchy_model: string | null;
  // ── Labels configuráveis por nível hierárquico ────────
  // Cada org nomeia seus próprios níveis. NULL = usar fallback no frontend.
  top_level_label: string | null;
  top_level_label_plural: string | null;
  municipal_level_label: string | null;
  municipal_level_label_plural: string | null;
  intermediate_level_label: string | null;
  intermediate_level_label_plural: string | null;
  local_unit_label: string | null;
  local_unit_label_plural: string | null;
  // ── Flags de níveis ativos ────────────────────────────
  uses_convention_level: boolean | null;
  uses_municipal_level: boolean | null;
  uses_intermediate_level: boolean | null;
  uses_local_units: boolean | null;
  // ── Campos financeiros estruturais ───────────────────────
  has_operational_cashbox: boolean | null;
  is_financially_autonomous: boolean | null;
  financially_consolidates_to_id: string | null;
  cnpj: string | null;
  financial_policy_notes: string | null;
  short_name: string | null;
  acronym: string | null;
  pastor_president_name: string | null;
}

export interface ChurchContextType {
  church: Church | null;
  activeChurch: Church | null;
  activeChurchId: string | null;
  profileChurchId: string | null;
  churches: Church[];
  loading: boolean;
  isMatriz: boolean;
  congregations: Church[];
  /** true se o usuário tem pelo menos um vínculo ativo em organization_users */
  hasActiveMembership: boolean;
  /**
   * A REAL failure (network/server/RLS) occurred while loading the shared
   * bootstrap data (profiles/user_roles/organization_users/super_admins)
   * this church resolution depends on. When true, `church`/`churches`/
   * `hasActiveMembership` are STALE (whatever was last known, possibly
   * still the initial empty state) and must NOT be interpreted as "user has
   * no membership" — callers must show a recoverable error state instead.
   */
  bootstrapError: boolean;
  /** Retries the shared bootstrap query (profiles/roles/memberships/super_admins). */
  retryBootstrap: () => void;
  switchChurch: (churchId: string) => boolean;
  clearActiveChurch: () => void;
  refetch: () => void;
}

export const ChurchContext = createContext<ChurchContextType>({
  church: null,
  activeChurch: null,
  activeChurchId: null,
  profileChurchId: null,
  churches: [],
  loading: true,
  isMatriz: false,
  congregations: [],
  hasActiveMembership: false,
  bootstrapError: false,
  retryBootstrap: () => {},
  switchChurch: () => false,
  clearActiveChurch: () => {},
  refetch: () => {},
});

export const useChurch = () => useContext(ChurchContext);
