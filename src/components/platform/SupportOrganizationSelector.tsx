/**
 * SupportOrganizationSelector.tsx
 *
 * Modal/seletor de organização para Super Admin e equipe de suporte da plataforma.
 * Permite buscar qualquer organização ativa e selecioná-la como contexto de atendimento.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Building2, Search, X, MapPin, ChevronRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSupportContext } from "@/contexts/SupportContext";
import type { Church } from "@/hooks/useChurchContext";
import { getTypeBadgeLabel } from "@/lib/organizationHierarchy";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

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

function mapRow(org: Record<string, unknown>): Church {
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

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SupportOrganizationSelector({ open, onClose }: Props) {
  const { setSupportOrg } = useSupportContext();
  const [query, setQuery]             = useState("");
  const [results, setResults]         = useState<Church[]>([]);
  const [loading, setLoading]         = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    const trimmed = q.trim();
    let dbQuery = supabase
      .from("organizations")
      .select(ORG_SELECT)
      .eq("active", true)
      .order("name")
      .limit(30);

    if (trimmed.length >= 2) {
      dbQuery = dbQuery.ilike("name", `%${trimmed}%`);
    }

    const { data } = await dbQuery;
    setResults((data ?? []).map((r) => mapRow(r as Record<string, unknown>)));
    setLoading(false);
  }, []);

  // Load initial list on open
  useEffect(() => {
    if (!open) return;
    setQuery("");
    void search("");
  }, [open, search]);

  // Debounced search on query change
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void search(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, open, search]);

  const handleSelect = (org: Church) => {
    setSupportOrg(org);
    onClose();
  };

  const orgTypeBadgeColor = (type: string | null) => {
    if (type === "international_convention") return "bg-purple-100 text-purple-700 border-purple-200";
    if (type === "national_convention")      return "bg-blue-100 text-blue-700 border-blue-200";
    if (type === "state_convention" || type === "convencao") return "bg-sky-100 text-sky-700 border-sky-200";
    if (type === "matriz" || type === "sede") return "bg-emerald-100 text-emerald-700 border-emerald-200";
    if (type === "setor")                    return "bg-amber-100 text-amber-700 border-amber-200";
    if (type === "congregacao")              return "bg-slate-100 text-slate-600 border-slate-200";
    return "bg-muted text-muted-foreground border-border";
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 border-b border-border/40">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Building2 size={18} className="text-accent" />
            Selecionar organização em atendimento
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Selecione uma organização para entrar em modo suporte. Todos os módulos operacionais usarão esta organização.
          </p>
        </DialogHeader>

        {/* Search input */}
        <div className="px-5 py-3 border-b border-border/30">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Buscar por nome..."
              className="pl-9 h-9 text-sm"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Building2 size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma organização encontrada.</p>
              {query && <p className="text-xs mt-1">Tente outro termo de busca.</p>}
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {results.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/50 transition-colors text-left group"
                  onClick={() => handleSelect(org)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{org.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 h-4 font-normal ${orgTypeBadgeColor(org.organization_type)}`}
                      >
                        {getTypeBadgeLabel(org.organization_type)}
                      </Badge>
                      {(org.city || org.state) && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin size={10} />
                          {[org.city, org.state].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-muted-foreground shrink-0 group-hover:text-accent transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer count */}
        {!loading && results.length > 0 && (
          <div className="px-5 py-2 border-t border-border/30 bg-muted/30">
            <p className="text-xs text-muted-foreground">
              {results.length} {results.length === 1 ? "organização" : "organizações"} encontrada{results.length !== 1 ? "s" : ""}
              {query.trim().length < 2 ? " (primeiras 30 — use a busca para filtrar)" : ""}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
