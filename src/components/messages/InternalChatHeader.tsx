import { ArrowLeft, Lock, Phone, RotateCcw, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import type { InternalThread } from "@/lib/internalMessages";
import { cn } from "@/lib/utils";

type Props = {
  thread: InternalThread | null;
  title?: string;
  subtitle?: string;
  isStaff?: boolean;
  showBack?: boolean;
  onBack?: () => void;
  onCloseThread?: () => void;
  onReopenThread?: () => void;
  onVoiceCall?: () => void;
  onVideoCall?: () => void;
  busy?: boolean;
};

const STATUS_CLASS: Record<string, string> = {
  open: "bg-emerald-500/15 text-emerald-700",
  pending: "bg-amber-500/15 text-amber-700",
  answered: "bg-blue-500/15 text-blue-700",
  closed: "bg-muted text-muted-foreground",
};

const STATUS_PT: Record<string, string> = {
  open: "Aberta",
  pending: "Pendente",
  answered: "Respondida",
  closed: "Encerrada",
};

export function InternalChatHeader({
  thread,
  title,
  subtitle,
  isStaff = false,
  showBack = false,
  onBack,
  onCloseThread,
  onReopenThread,
  onVoiceCall,
  onVideoCall,
  busy = false,
}: Props) {
  const { t } = useLanguage();
  const displayTitle = title ?? thread?.subject ?? t("Conversa");
  const isClosed = thread?.status === "closed";

  return (
    <header className="flex-shrink-0 flex items-center gap-2 border-b border-border/50 bg-card px-3 sm:px-4 py-3 min-h-[56px]">
      {showBack && onBack ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 flex-shrink-0 sm:hidden"
          onClick={onBack}
          aria-label={t("Voltar")}
        >
          <ArrowLeft size={18} />
        </Button>
      ) : null}

      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-sm sm:text-base truncate">{displayTitle}</h3>
        {subtitle ? (
          <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
        ) : thread?.participantName && isStaff ? (
          <p className="text-[11px] text-muted-foreground truncate">{thread.participantName}</p>
        ) : null}
      </div>

      {/* Botões de chamada — visíveis para staff; desabilitados quando sem thread ou sem permissão */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button
          type="button"
          onClick={onVoiceCall}
          disabled={!onVoiceCall}
          title={
            onVoiceCall
              ? t("Iniciar chamada de voz")
              : !thread
                ? t("Selecione uma conversa para iniciar chamada")
                : t("Apenas administradores podem iniciar chamadas")
          }
          className={cn(
            "h-8 w-8 rounded-full flex items-center justify-center transition-colors",
            onVoiceCall
              ? "hover:bg-secondary text-foreground"
              : "text-muted-foreground/25 cursor-not-allowed",
          )}
          aria-label={t("Ligação de voz")}
        >
          <Phone size={15} />
        </button>

        <button
          type="button"
          onClick={onVideoCall}
          disabled={!onVideoCall}
          title={
            onVideoCall
              ? t("Iniciar videochamada")
              : !thread
                ? t("Selecione uma conversa para iniciar videochamada")
                : t("Apenas administradores podem iniciar chamadas")
          }
          className={cn(
            "h-8 w-8 rounded-full flex items-center justify-center transition-colors",
            onVideoCall
              ? "hover:bg-secondary text-foreground"
              : "text-muted-foreground/25 cursor-not-allowed",
          )}
          aria-label={t("Videochamada")}
        >
          <Video size={15} />
        </button>
      </div>

      {thread && isStaff ? (
        <div className="flex items-center gap-1 flex-shrink-0">
          <span
            className={cn(
              "text-[10px] px-2 py-0.5 rounded-full font-medium hidden xs:inline",
              STATUS_CLASS[thread.status] ?? STATUS_CLASS.open,
            )}
          >
            {STATUS_PT[thread.status] ?? thread.status}
          </span>

          {isClosed ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={busy}
              onClick={onReopenThread}
            >
              <RotateCcw size={14} className="mr-1" />
              <span className="hidden sm:inline">{t("Reabrir conversa")}</span>
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={busy}
              onClick={onCloseThread}
            >
              <Lock size={14} className="mr-1" />
              <span className="hidden sm:inline">{t("Fechar conversa")}</span>
            </Button>
          )}
        </div>
      ) : null}
    </header>
  );
}
