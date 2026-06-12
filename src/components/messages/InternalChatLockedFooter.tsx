import { useLanguage } from "@/hooks/useLanguage";
import { Lock } from "lucide-react";

type Props = {
  message?: string;
};

/** Barra inferior estilo WhatsApp quando o membro não pode enviar. */
export function InternalChatLockedFooter({ message }: Props) {
  const { t } = useLanguage();
  const text =
    message ??
    t("Somente administradores podem enviar mensagens nesta campanha.");

  return (
    <div className="flex-shrink-0 border-t border-border/50 bg-muted/40 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-center gap-2 text-center">
        <Lock size={14} className="text-muted-foreground flex-shrink-0" />
        <p className="text-xs sm:text-sm text-muted-foreground leading-snug">{text}</p>
      </div>
    </div>
  );
}
