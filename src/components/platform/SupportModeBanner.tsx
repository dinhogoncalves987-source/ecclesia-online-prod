/**
 * SupportModeBanner.tsx
 *
 * Banner fixo exibido quando o usuário de plataforma está em modo suporte ativo.
 * Mostra a organização em atendimento + botões de troca e saída do modo suporte.
 * NÃO aparece para usuários comuns de igreja.
 */

import { useState } from "react";
import { Building2, RefreshCw, X, ChevronDown } from "lucide-react";
import { useSupportContext } from "@/contexts/SupportContext";
import { SupportOrganizationSelector } from "./SupportOrganizationSelector";
import { getTypeBadgeLabel } from "@/lib/organizationHierarchy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PLATFORM_ROLE_LABELS } from "@/lib/platformSupportPermissions";

export function SupportModeBanner() {
  const {
    isPlatformUser,
    isSupportModeActive,
    activeSupportOrg,
    clearSupportOrg,
    platformRole,
  } = useSupportContext();

  const [selectorOpen, setSelectorOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Only render for platform users
  if (!isPlatformUser) return null;

  const roleLabel = platformRole ? (PLATFORM_ROLE_LABELS[platformRole] ?? platformRole) : null;

  if (!isSupportModeActive) {
    // Compact header: "Sem organização selecionada"
    return (
      <>
        <div className="w-full bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-3 text-sm">
          <div className="flex items-center gap-2 text-amber-700">
            <Building2 size={14} />
            <span className="font-medium">Sem organização selecionada</span>
          </div>
          <span className="text-amber-600 text-xs hidden sm:inline">
            Selecione uma organização para acessar os módulos operacionais.
          </span>
          <div className="ml-auto">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
              onClick={() => setSelectorOpen(true)}
            >
              Selecionar organização
            </Button>
          </div>
        </div>
        <SupportOrganizationSelector open={selectorOpen} onClose={() => setSelectorOpen(false)} />
      </>
    );
  }

  if (collapsed) {
    return (
      <>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="w-full bg-accent/10 border-b border-accent/20 px-4 py-1.5 flex items-center gap-2 text-xs text-accent hover:bg-accent/15 transition-colors"
        >
          <Building2 size={12} />
          <span className="font-medium truncate">
            Modo suporte: {activeSupportOrg!.name}
          </span>
          <ChevronDown size={12} className="ml-auto shrink-0" />
        </button>
        <SupportOrganizationSelector open={selectorOpen} onClose={() => setSelectorOpen(false)} />
      </>
    );
  }

  return (
    <>
      <div className="w-full bg-accent/10 border-b border-accent/25 px-4 py-2">
        <div className="flex items-start gap-3">
          <div className="flex items-center gap-2 shrink-0 mt-0.5">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="text-xs font-semibold text-accent uppercase tracking-wide">Modo Suporte Ativo</span>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{activeSupportOrg!.name}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 font-normal border-accent/30 text-accent"
              >
                {getTypeBadgeLabel(activeSupportOrg!.organization_type)}
              </Badge>
              {(activeSupportOrg!.city || activeSupportOrg!.state) && (
                <span className="text-xs text-muted-foreground">
                  {[activeSupportOrg!.city, activeSupportOrg!.state].filter(Boolean).join(", ")}
                </span>
              )}
              {roleLabel && (
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  — {roleLabel}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs hover:bg-accent/10"
              onClick={() => setSelectorOpen(true)}
              title="Trocar organização"
            >
              <RefreshCw size={12} className="mr-1" />
              <span className="hidden sm:inline">Trocar</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={clearSupportOrg}
              title="Sair do modo suporte"
            >
              <X size={12} className="mr-1" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => setCollapsed(true)}
              title="Minimizar banner"
            >
              <ChevronDown size={12} className="rotate-180" />
            </Button>
          </div>
        </div>
      </div>
      <SupportOrganizationSelector open={selectorOpen} onClose={() => setSelectorOpen(false)} />
    </>
  );
}
