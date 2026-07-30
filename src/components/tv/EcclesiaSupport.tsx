/**
 * EcclesiaSupport — Card de preparação do Suporte Ecclesia.
 *
 * Módulo separado do EcclesiaStudio. Gerencia a ativação do agente de suporte
 * autorizado para manutenção remota controlada pela equipe Ecclesia.
 *
 * UX: sem nenhum termo técnico visível ao operador da igreja.
 * Toda linguagem usa os termos oficiais do produto Ecclesia.
 */

import { useState } from "react";
import { Headphones, CheckCircle2, AlertCircle, Loader2, ShieldCheck } from "lucide-react";

type SupportState = "idle" | "confirming" | "preparing" | "success" | "error";

interface Props {
  /** Se true, exibe versão compacta (sem cartão externo) */
  compact?: boolean;
}

export function EcclesiaSupport({ compact = false }: Props) {
  const [state, setState] = useState<SupportState>("idle");

  async function handlePrepare() {
    setState("preparing");
    try {
      // Placeholder: aguarda o instalador real do Ecclesia Support Kit
      await new Promise<void>((resolve) => setTimeout(resolve, 2500));
      setState("success");
    } catch {
      setState("error");
    }
  }

  // ── Conteúdo por estado ──────────────────────────────────────────────────

  function renderContent() {
    switch (state) {
      case "confirming":
        return (
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Preparar Ecclesia Support?</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  O Windows poderá pedir permissão para continuar.
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setState("idle")}
                className="flex-1 py-2 rounded-xl border border-border text-sm hover:bg-muted transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handlePrepare()}
                className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition"
              >
                Continuar
              </button>
            </div>
          </div>
        );

      case "preparing":
        return (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="w-7 h-7 text-blue-500 animate-spin" />
            <p className="text-sm text-muted-foreground">Preparando suporte Ecclesia...</p>
          </div>
        );

      case "success":
        return (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              Suporte preparado com sucesso.
            </p>
            <p className="text-xs text-muted-foreground">
              A equipe Ecclesia está pronta para auxiliar.
            </p>
            <button
              onClick={() => setState("idle")}
              className="mt-2 text-xs text-primary hover:underline"
            >
              Encerrar suporte
            </button>
          </div>
        );

      case "error":
        return (
          <div className="flex flex-col items-center gap-2 py-3 text-center">
            <AlertCircle className="w-7 h-7 text-red-500" />
            <p className="text-sm font-medium text-red-700 dark:text-red-400">
              Não foi possível preparar o suporte.
            </p>
            <p className="text-xs text-muted-foreground">Chame o suporte Ecclesia.</p>
            <button
              onClick={() => setState("idle")}
              className="mt-1 text-xs text-primary hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        );

      default: // idle
        return (
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <Headphones className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Ecclesia Support</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Permite que a equipe Ecclesia auxilie neste computador de forma controlada.
                  Ative somente quando solicitado pelo suporte.
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setState("confirming")}
                className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition"
              >
                Preparar suporte
              </button>
            </div>
          </div>
        );
    }
  }

  if (compact) {
    return (
      <div className="p-3 bg-muted/40 border border-border rounded-xl">
        {renderContent()}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Headphones className="w-4 h-4 text-primary" />
        <h2 className="font-semibold text-sm">Suporte Ecclesia</h2>
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 font-medium">
          Autorizado
        </span>
      </div>

      <div className="space-y-4">
        {renderContent()}

        {/* Info footer */}
        {state === "idle" && (
          <p className="text-[11px] text-muted-foreground border-t border-border pt-3 mt-1">
            O Ecclesia Support é ativado apenas mediante autorização da diretoria da igreja.
          </p>
        )}
      </div>
    </div>
  );
}
