import type { ReactNode } from "react";
import { isModuleEnabled, type ModuleId } from "@/config/modules";
import ModuleUnavailable from "@/pages/ModuleUnavailable";

/**
 * Guarda de rota por módulo. Quando o módulo está desabilitado no ambiente
 * atual, o componente real (`children`) nunca é montado — apenas
 * `ModuleUnavailable` é renderizado, sem disparar nenhuma consulta ao
 * Supabase. Usa a mesma `isModuleEnabled` do menu (AdminLayout), nunca uma
 * regra paralela.
 *
 * `children` aceita `ReactNode` (não apenas `ReactElement`) de propósito:
 * FASE 6 (separação de bundle por build) gate o import lazy do componente
 * staging-only ANTES deste componente (`const X = IS_STAGING_BUILD ?
 * lazy(...) : null`), e o chamador passa `{X && <X />}` — que resolve para
 * `null` num build de produção. Como `isModuleEnabled` já é `false` nesse
 * mesmo cenário (módulo staging-only), este componente sempre retorna
 * `ModuleUnavailable` antes de precisar renderizar esse `null`.
 */
export function ModuleGate({
  moduleId,
  children,
}: {
  moduleId: ModuleId;
  children: ReactNode;
}) {
  if (!isModuleEnabled(moduleId)) {
    return <ModuleUnavailable />;
  }
  return children;
}
