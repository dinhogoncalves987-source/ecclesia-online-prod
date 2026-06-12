import { ArrowLeft, Lock, RotateCcw } from "lucide-react";
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
  busy?: boolean;
};

const STATUS_CLASS: Record<string, string> = {
  open: "bg-emerald-500/15 text-emerald-700",
  pending: "bg-amber-500/15 text-amber-700",
  answered: "bg-blue-500/15 text-blue-700",
  closed: "bg-muted text-muted-foreground",
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

      {thread && isStaff ? (
        <div className="flex items-center gap-1 flex-shrink-0">
          <span
            className={cn(
              "text-[10px] px-2 py-0.5 rounded-full font-medium hidden xs:inline",
              STATUS_CLASS[thread.status] ?? STATUS_CLASS.open,
            )}
          >
            {thread.status}
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
