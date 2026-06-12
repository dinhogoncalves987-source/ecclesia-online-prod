import { cn } from "@/lib/utils";

type Props = {
  /**
   * ID único do elemento — usado como referência para impressão seletiva futura.
   * V1 imprime via window.print() (página inteira).
   * V2: printArea(id) isolará apenas este bloco.
   */
  id: string;
  children: React.ReactNode;
  className?: string;
};

/**
 * Wrapper semântico para áreas imprimíveis.
 * Adicionar `data-print-area` para uso futuro com @media print.
 *
 * Aplicar ao conteúdo que deve aparecer no PDF/impressão.
 * Não aplicar em navegação, filtros, botões de ação.
 */
export function DocPrintView({ id, children, className }: Props) {
  return (
    <div id={id} data-print-area className={cn(className)}>
      {children}
    </div>
  );
}
