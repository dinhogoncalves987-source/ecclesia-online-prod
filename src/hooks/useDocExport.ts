import { useCallback, useState } from "react";
import { executeDocExportItem, type DocExportItem } from "@/lib/docExport";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";

/**
 * Hook composable de exportação.
 * Centraliza loading state, feedback de toast e execução de ações de export.
 *
 * Uso:
 *   const { execute, busy } = useDocExport();
 *   <button onClick={() => execute({ type: "pdf" })}>PDF</button>
 */
export function useDocExport() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const execute = useCallback(
    async (item: DocExportItem) => {
      if (busy || item.disabled) return;
      setBusy(true);
      try {
        await executeDocExportItem(item);

        // Toast de sucesso por tipo (apenas para ações com feedback relevante)
        if (item.type === "csv") {
          toast({ title: t("Exportado!") });
        } else if (item.type === "share") {
          // A Web Share API já tem seu próprio feedback nativo
        }
      } catch {
        toast({
          title: t("Erro"),
          description: t("Não foi possível executar a ação"),
          variant: "destructive",
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, t, toast],
  );

  return { execute, busy };
}
