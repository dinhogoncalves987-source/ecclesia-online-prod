import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  parseFinanceDashboardAggregates,
  type FinanceDashboardAggregates,
} from "@/lib/financeDashboardAggregates";

export type FinanceDashboardAggregatesStatus = "idle" | "loading" | "error" | "success";

export interface FinanceDashboardAggregatesState {
  status: FinanceDashboardAggregatesStatus;
  data: FinanceDashboardAggregates | null;
  error: string | null;
}

export interface UseFinanceDashboardAggregatesParams {
  organizationId: string | undefined;
  hierarchyOrganizationIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  /** Incremente para forçar nova busca (ex.: após importar/excluir/zerar). */
  reloadToken?: number;
}

/**
 * FASE 1D-C3 — busca os totais/gráficos do Financeiro via
 * finance_dashboard_aggregates (agregação server-side), nunca baixando a
 * lista completa de transactions. `status` distingue explicitamente
 * "carregando" de "erro" de "zero real" — nenhum card deve exibir zero
 * enquanto `status !== "success"`.
 */
export function useFinanceDashboardAggregates(
  params: UseFinanceDashboardAggregatesParams,
): FinanceDashboardAggregatesState {
  const { organizationId, hierarchyOrganizationIds, dateFrom, dateTo, reloadToken } = params;
  const [state, setState] = useState<FinanceDashboardAggregatesState>({
    status: "idle",
    data: null,
    error: null,
  });
  const requestIdRef = useRef(0);
  const hierarchyKey = (hierarchyOrganizationIds ?? []).join(",");

  useEffect(() => {
    if (!organizationId) {
      setState({ status: "idle", data: null, error: null });
      return;
    }
    const requestId = ++requestIdRef.current;
    setState(prev => ({ status: "loading", data: prev.data, error: null }));

    const hierarchyIds = hierarchyKey ? hierarchyKey.split(",") : null;

    supabase
      .rpc("finance_dashboard_aggregates", {
        p_organization_id: organizationId,
        p_hierarchy_organization_ids: hierarchyIds,
        p_date_from: dateFrom ?? null,
        p_date_to: dateTo ?? null,
      })
      .then(({ data, error }) => {
        // Requisição obsoleta (uma mais nova já foi disparada): nunca
        // sobrescreve o estado atual.
        if (requestId !== requestIdRef.current) return;
        if (error) {
          console.error("[useFinanceDashboardAggregates]", error);
          setState({ status: "error", data: null, error: error.message });
          return;
        }
        const parsed = parseFinanceDashboardAggregates(data);
        if (!parsed) {
          setState({ status: "error", data: null, error: "resposta inválida da agregação financeira" });
          return;
        }
        setState({ status: "success", data: parsed, error: null });
      });
  }, [organizationId, hierarchyKey, dateFrom, dateTo, reloadToken]);

  return state;
}
