/**
 * Helpers de formulário do módulo de Missões (OPERAÇÃO 4).
 *
 * Reaproveita DIRETAMENTE os átomos de UI genéricos já criados pela
 * OPERAÇÃO 2 (`<select>`/`<input>` nativo, pill de status, estado vazio
 * padronizado) — nenhum deles contém lógica de domínio de Discipulado, são
 * puramente visuais, então duplicá-los aqui criaria um terceiro componente
 * paralelo para o mesmo padrão visual (mesma decisão já tomada por
 * src/components/teologia/teologiaFormHelpers.tsx).
 */
export {
  FormSelectLabeled,
  FormInputLabeled,
  FormTextareaLabeled,
  FormCheckboxLabeled,
  StatusPill,
  EmptyState,
} from "@/components/discipulado/discipuladoFormHelpers";
