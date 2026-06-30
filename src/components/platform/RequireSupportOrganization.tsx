/**
 * RequireSupportOrganization.tsx
 *
 * Guard component para módulos operacionais.
 *
 * Para usuários de plataforma sem organização selecionada:
 *   → Mostra tela de seleção de organização (não carrega dados operacionais)
 *
 * Para usuários de plataforma com organização selecionada:
 *   → Renderiza children normalmente
 *
 * Para usuários comuns de igreja (não plataforma):
 *   → Renderiza children normalmente (sem intervenção)
 *
 * Uso: wrapping de módulos operacionais no AdminLayout
 */

import { useState } from "react";
import { Building2, ArrowRight } from "lucide-react";
import { useSupportContext } from "@/contexts/SupportContext";
import { SupportOrganizationSelector } from "./SupportOrganizationSelector";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
  /** Opcional: label do módulo para mensagem contextual */
  moduleLabel?: string;
}

export function RequireSupportOrganization({ children, moduleLabel }: Props) {
  const { isPlatformUser, isSupportModeActive, loadingPlatformRole } = useSupportContext();
  const [selectorOpen, setSelectorOpen] = useState(false);

  // Still detecting platform role — render nothing (avoids flash)
  if (loadingPlatformRole) return null;

  // Not a platform user — render normally
  if (!isPlatformUser) return <>{children}</>;

  // Platform user with active support org — render normally
  if (isSupportModeActive) return <>{children}</>;

  // Platform user without support org — show empty state
  return (
    <>
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-5">
          <Building2 size={32} className="text-muted-foreground opacity-60" />
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2">
          Nenhuma organização selecionada
        </h2>
        <p className="text-sm text-muted-foreground max-w-xs mb-6">
          {moduleLabel
            ? `Selecione uma organização para acessar o módulo de ${moduleLabel} em modo suporte.`
            : "Selecione uma igreja, matriz, convenção, setor ou congregação para acessar este módulo em modo suporte."
          }
        </p>
        <Button
          className="gap-2"
          onClick={() => setSelectorOpen(true)}
        >
          <Building2 size={15} />
          Selecionar organização
          <ArrowRight size={14} />
        </Button>
        <p className="text-xs text-muted-foreground mt-4 max-w-xs">
          Após selecionar, todos os módulos operacionais serão carregados com os dados daquela organização.
        </p>
      </div>

      <SupportOrganizationSelector
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
      />
    </>
  );
}
