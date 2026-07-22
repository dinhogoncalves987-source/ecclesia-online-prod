import { ArrowLeft, Phone, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import { usePresenceStatus } from "@/hooks/usePresence";
import { useLiveLastSeen } from "@/hooks/useLiveLastSeen";
import { formatLastSeen } from "@/lib/presenceFormat";
import type { InternalThread } from "@/lib/internalMessages";
import { cn } from "@/lib/utils";

type Props = {
  thread: InternalThread | null;
  title?: string;
  subtitle?: string;
  isStaff?: boolean;
  showBack?: boolean;
  onBack?: () => void;
  /** @deprecated removido — chat agora segue modelo WhatsApp sem ticket */
  onCloseThread?: () => void;
  /** @deprecated removido — chat agora segue modelo WhatsApp sem ticket */
  onReopenThread?: () => void;
  onVoiceCall?: () => void;
  onVideoCall?: () => void;
  busy?: boolean;
};

export function InternalChatHeader({
  thread,
  title,
  subtitle,
  isStaff = false,
  showBack = false,
  onBack,
  onVoiceCall,
  onVideoCall,
}: Props) {
  const { t, lang } = useLanguage();
  const { isOnline } = usePresenceStatus();
  const displayTitle = title ?? thread?.subject ?? t("Conversa");

  const online = isOnline(thread?.participantUserId);
  const liveLastSeen = useLiveLastSeen(thread?.participantUserId, thread?.participantLastSeenAt);
  const presenceLabel = online
    ? t("Online")
    : liveLastSeen
      ? formatLastSeen(liveLastSeen, lang)
      : null;

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

      {/* Avatar / ícone da conversa */}
      {thread && (
        <div className="relative flex-shrink-0">
          {thread.participantAvatarUrl ? (
            <img
              src={thread.participantAvatarUrl}
              alt={displayTitle}
              className="h-9 w-9 rounded-full object-cover bg-muted"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center text-sm font-semibold text-primary uppercase">
              {displayTitle.charAt(0)}
            </div>
          )}
          {online && (
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-card" />
          )}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-sm sm:text-base truncate">{displayTitle}</h3>
        {/*
          Conversa 1:1 com participante resolvido: online/último acesso é
          mais útil que um subtítulo genérico de página (ex.: "Chat da
          Secretaria") e por isso tem prioridade — antes, `subtitle` sempre
          "ganhava" e a presença nunca era exibida, mesmo já calculada.
          Também deixou de exigir `isStaff`: membros também devem ver o
          status de quem estão conversando.
        */}
        {thread?.participantName ? (
          <p className={cn("text-[11px] truncate", online ? "text-emerald-600 font-medium" : "text-muted-foreground")}>
            {presenceLabel ?? subtitle ?? thread.participantName}
          </p>
        ) : subtitle ? (
          <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
        ) : null}
      </div>

      {/* Botões de chamada — apenas para staff */}
      {isStaff && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            type="button"
            onClick={onVoiceCall}
            disabled={!onVoiceCall}
            title={
              onVoiceCall
                ? (thread?.participantName ? `Ligar para ${thread.participantName}` : t("Iniciar chamada de voz"))
                : t("Selecione uma conversa para ligar")
            }
            className={cn(
              "h-9 w-9 rounded-full flex items-center justify-center transition-colors",
              onVoiceCall
                ? "hover:bg-secondary text-foreground"
                : "text-muted-foreground/30 cursor-not-allowed",
            )}
            aria-label={t("Ligação de voz")}
          >
            <Phone size={17} />
          </button>

          <button
            type="button"
            onClick={onVideoCall}
            disabled={!onVideoCall}
            title={
              onVideoCall
                ? (thread?.participantName ? `Videochamada com ${thread.participantName}` : t("Iniciar videochamada"))
                : t("Selecione uma conversa para videochamada")
            }
            className={cn(
              "h-9 w-9 rounded-full flex items-center justify-center transition-colors",
              onVideoCall
                ? "hover:bg-secondary text-foreground"
                : "text-muted-foreground/30 cursor-not-allowed",
            )}
            aria-label={t("Videochamada")}
          >
            <Video size={17} />
          </button>
        </div>
      )}
    </header>
  );
}
