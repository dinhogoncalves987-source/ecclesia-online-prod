import { AdminLayout } from "@/components/AdminLayout";
import { PackageX } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";

/**
 * Página estática exibida quando alguém digita manualmente uma rota
 * desabilitada no ambiente atual (ver src/config/modules.ts e
 * src/components/ModuleGate.tsx). Nunca executa nenhuma consulta ao
 * Supabase — o componente real do módulo nunca é montado.
 */
export default function ModuleUnavailable() {
  const { t } = useLanguage();
  return (
    <AdminLayout>
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/60">
          <PackageX size={28} strokeWidth={1.5} className="text-muted-foreground" />
        </div>
        <h1 className="font-serif text-xl font-semibold">
          {t("Recurso indisponível neste ambiente")}
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {t("Este módulo está disponível apenas no ambiente de staging/teste e não faz parte da versão de gestão em produção.")}
        </p>
      </div>
    </AdminLayout>
  );
}
