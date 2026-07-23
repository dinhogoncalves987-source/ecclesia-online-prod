/**
 * Helpers de formulário do módulo de Teologia (OPERAÇÃO 3).
 *
 * Reaproveita DIRETAMENTE os átomos de UI genéricos já criados pela
 * OPERAÇÃO 2 (`<select>`/`<input>` nativo, pill de status, estado vazio
 * padronizado) — nenhum deles contém lógica de domínio de Discipulado, são
 * puramente visuais, então duplicá-los aqui criaria dois componentes
 * paralelos para o mesmo padrão visual (contrário à instrução de reutilizar
 * UX/componentes visuais quando a semântica de domínio não muda).
 */
export {
  FormSelectLabeled,
  FormInputLabeled,
  FormTextareaLabeled,
  FormCheckboxLabeled,
  StatusPill,
  EmptyState,
} from "@/components/discipulado/discipuladoFormHelpers";
