import { useLanguage } from "@/hooks/useLanguage";
import type { InternalThread } from "@/lib/internalMessages";
import { cn } from "@/lib/utils";
import { Loader2, MessageCircle } from "lucide-react";

type Props = {
  threads: InternalThread[];
  selectedId: string | null;
  loading?: boolean;
  onSelect: (thread: InternalThread) => void;
};

const STATUS_DOT: Record<string, string> = {
  open: "bg-emerald-500",
  pending: "bg-amber-500",
  answered: "bg-blue-500",
  closed: "bg-muted-foreground/40",
};

export function InternalThreadList({
  threads,
  selectedId,
  loading = false,
  onSelect,
}: Props) {
  const { t, lang } = useLanguage();
  const dateLoc = lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR";

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <Loader2 size={22} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center">
        <MessageCircle size={32} className="text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">{t("Nenhuma conversa ainda")}</p>
      </div>
    );
  }

  return (
    <ul className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden divide-y divide-border/40">
      {threads.map((thread) => {
        const active = thread.id === selectedId;
        const previewTime = thread.lastMessageAt ?? thread.createdAt;
        const time = new Date(previewTime).toLocaleDateString(dateLoc, {
          day: "2-digit",
          month: "short",
        });

        return (
          <li key={thread.id}>
            <button
              type="button"
              onClick={() => onSelect(thread)}
              className={cn(
                "w-full text-left px-3 sm:px-4 py-3 flex items-start gap-3 hover:bg-secondary/40 transition-colors",
                active && "bg-secondary/60",
              )}
            >
              <span
                className={cn(
                  "mt-2 h-2 w-2 rounded-full flex-shrink-0",
                  STATUS_DOT[thread.status] ?? STATUS_DOT.open,
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium truncate">
                    {thread.participantName ?? thread.subject}
                  </p>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0 tabular-nums">
                    {time}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{thread.subject}</p>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
