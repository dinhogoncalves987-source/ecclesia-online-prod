import type { ReactElement } from "react";
import { isModuleEnabled, type ModuleId } from "@/config/modules";
import ModuleUnavailable from "@/pages/ModuleUnavailable";

/**
 * Guarda de rota por módulo. Quando o módulo está desabilitado no ambiente
 * atual, o componente real (`children`) nunca é montado — apenas
 * `ModuleUnavailable` é renderizado, sem disparar nenhuma consulta ao
 * Supabase. Usa a mesma `isModuleEnabled` do menu (AdminLayout), nunca uma
 * regra paralela.
 */
export function ModuleGate({
  moduleId,
  children,
}: {
  moduleId: ModuleId;
  children: ReactElement;
}) {
  if (!isModuleEnabled(moduleId)) {
    return <ModuleUnavailable />;
  }
  return children;
}
