import { useState } from "react";
import { format } from "date-fns";
import { ptBR, enUS, es } from "date-fns/locale";
import { Calendar as CalendarIcon, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLanguage } from "@/hooks/useLanguage";

const DATE_LOCALES = { pt: ptBR, en: enUS, es };

export function parseYmd(ymd: string): Date | undefined {
  if (!ymd) return undefined;
  const parts = ymd.split("-");
  if (parts.length !== 3) return undefined;
  const [y, m, d] = parts.map(Number);
  if (!y || !m || !d) return undefined;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return undefined;
  }
  return date;
}

function toYmd(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  id?: string;
  className?: string;
  error?: boolean;
  allowClear?: boolean;
};

export function DatePicker({
  value,
  onChange,
  placeholder,
  disabled = false,
  minDate,
  maxDate,
  id,
  className,
  error = false,
  allowClear = true,
}: DatePickerProps) {
  const { t, lang } = useLanguage();
  const locale = DATE_LOCALES[lang];
  const selected = parseYmd(value);
  const [open, setOpen] = useState(false);

  const handleSelect = (date: Date | undefined) => {
    if (!date) return;
    onChange(toYmd(date));
    setOpen(false);
  };

  const handleClear = (event: React.MouseEvent) => {
    event.stopPropagation();
    onChange("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-10 w-full justify-start px-3 font-normal",
            !selected && "text-muted-foreground",
            error && "border-destructive",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-70" />
          <span className="truncate">
            {selected ? format(selected, "P", { locale }) : placeholder ?? t("Selecionar data")}
          </span>
          {allowClear && selected && !disabled && (
            <span
              role="button"
              tabIndex={0}
              aria-label={t("Limpar data")}
              className="ml-auto rounded-sm p-0.5 opacity-70 hover:opacity-100"
              onClick={handleClear}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onChange("");
                }
              }}
            >
              <X className="h-4 w-4" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          locale={locale}
          initialFocus
          disabled={(date) => {
            if (minDate && date < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())) {
              return true;
            }
            if (maxDate && date > new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate())) {
              return true;
            }
            return false;
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
