import { useLanguage } from "@/hooks/useLanguage";
import { usePresenceStatus } from "@/hooks/usePresence";
import type { InternalThread } from "@/lib/internalMessages";
import { cn } from "@/lib/utils";
import { Loader2, MessageCircle, Trash2 } from "lucide-react";

type Props = {
  threads: InternalThread[];
  selectedId: string | null;
  loading?: boolean;
  onSelect: (thread: InternalThread) => void;
  /** Modo de seleção múltipla (apagar conversas) */
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (thread: InternalThread) => void;
  /** Apagar uma única conversa direto pela lixeira que aparece ao passar o
   * mouse/dedo sobre a linha (estilo WhatsApp) — independente do modo de
   * seleção múltipla. */
  onDeleteThread?: (thread: InternalThread) => void;
};

const STATUS_DOT: Record<string, string> = {
  open: "bg-emerald-500",
  pending: "bg-amber-500",
  answered: "bg-blue-500",
  closed: "bg-muted-foreground/40",
};

function initialsFor(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function ThreadAvatar({ thread, online }: { thread: InternalThread; online: boolean }) {
  const label = thread.participantName ?? thread.subject;
  return (
    <div className="relative flex-shrink-0">
      {thread.participantAvatarUrl ? (
        <img
          src={thread.participantAvatarUrl}
          alt={label}
          className="h-10 w-10 rounded-full object-cover bg-muted"
          onError={(e) => {
            // Nunca mostrar imagem quebrada — remove a tag e cai no fallback de iniciais
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center text-sm font-semibold text-primary">
          {initialsFor(label)}
        </div>
      )}
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-card" />
      )}
    </div>
  );
}

export function InternalThreadList({
  threads,
  selectedId,
  loading = false,
  onSelect,
  selectionMode = false,
  selectedIds,
  onToggleSelect,
  onDeleteThread,
}: Props) {
  const { t, lang } = useLanguage();
  const { isOnline } = usePresenceStatus();
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
        const online = isOnline(thread.participantUserId);
        const checked = selectedIds?.has(thread.id) ?? false;

        return (
          <li key={thread.id} className="group relative">
            <div
              role="button"
              tabIndex={0}
              onClick={() => (selectionMode ? onToggleSelect?.(thread) : onSelect(thread))}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                if (selectionMode) onToggleSelect?.(thread);
                else onSelect(thread);
              }}
              className={cn(
                "w-full text-left px-3 sm:px-4 py-3 flex items-start gap-3 hover:bg-secondary/40 transition-colors cursor-pointer",
                !selectionMode && onDeleteThread && "pr-11 sm:pr-12",
                active && !selectionMode && "bg-secondary/60",
                selectionMode && checked && "bg-primary/10",
              )}
            >
              {selectionMode ? (
                <span
                  className={cn(
                    "mt-2.5 h-5 w-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center",
                    checked ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40",
                  )}
                >
                  {checked && <span className="h-2 w-2 rounded-full bg-current" />}
                </span>
              ) : (
                <ThreadAvatar thread={thread} online={online} />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium truncate">
                    {thread.participantName ?? thread.subject}
                  </p>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0 tabular-nums">
                    {time}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className="text-xs text-muted-foreground truncate">
                    {thread.lastMessagePreview || thread.subject}
                  </p>
                  {Boolean(thread.unreadCount) && (
                    <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
                      {thread.unreadCount! > 99 ? "99+" : thread.unreadCount}
                    </span>
                  )}
                </div>
              </div>
              {!selectionMode && (
                <span
                  className={cn(
                    "mt-2 h-2 w-2 rounded-full flex-shrink-0",
                    STATUS_DOT[thread.status] ?? STATUS_DOT.open,
                  )}
                />
              )}
            </div>

            {/* Lixeira estilo WhatsApp — espaço reservado à direita da linha
                (não sobrepõe nome/horário/prévia). No desktop fica invisível
                até o mouse passar sobre a linha (group-hover); em telas
                touch (sem hover real), fica sempre visível com opacidade
                reduzida, e o toque direto nela apaga a conversa sem precisar
                de nenhum modo de seleção. */}
            {!selectionMode && onDeleteThread && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteThread(thread);
                }}
                className={cn(
                  "absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full flex items-center justify-center",
                  "text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10 transition-colors",
                  "opacity-60 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
                )}
                aria-label={t("Apagar conversa")}
                title={t("Apagar conversa")}
              >
                <Trash2 size={15} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
