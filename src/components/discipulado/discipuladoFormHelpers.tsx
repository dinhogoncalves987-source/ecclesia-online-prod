/**
 * Helpers de formulário compartilhados pelas telas do Discipulado
 * (OPERAÇÃO 2). Mesmo padrão de `<select>`/`<input>` nativo já usado em
 * src/pages/MemberProfile.tsx (FormSelectLabeled) — não introduz um
 * componente Select de terceiros novo, evitando risco de regressão visual
 * ou de acessibilidade nesta operação.
 */
import type { ReactNode } from "react";

export function FormSelectLabeled({ label, value, onChange, options, required, placeholder }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring w-full"
      >
        <option value="">— {placeholder ?? "Selecionar"} —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function FormInputLabeled({ label, value, onChange, required, type = "text", placeholder, min, max, step }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring w-full"
      />
    </div>
  );
}

export function FormTextareaLabeled({ label, value, onChange, required, rows = 3, placeholder }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring w-full resize-none"
      />
    </div>
  );
}

export function FormCheckboxLabeled({ label, checked, onChange }: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-input accent-primary"
      />
      {label}
    </label>
  );
}

const BADGE_TONE_CLASSES: Record<"neutral" | "success" | "warning" | "danger" | "info", string> = {
  neutral: "bg-secondary text-secondary-foreground",
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  danger: "bg-destructive/15 text-destructive",
  info: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
};

/** Pill de status simples, reutilizado em todas as telas do módulo. */
export function StatusPill({ label, tone = "neutral" }: { label: ReactNode; tone?: keyof typeof BADGE_TONE_CLASSES }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${BADGE_TONE_CLASSES[tone]}`}>
      {label}
    </span>
  );
}

/** Estado vazio padronizado — explica sempre o próximo passo (requisito de UX da OPERAÇÃO 2). */
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-10 px-4 border border-dashed border-border rounded-xl">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
