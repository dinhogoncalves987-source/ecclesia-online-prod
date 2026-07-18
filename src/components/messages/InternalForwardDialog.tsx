import { useMemo, useState } from "react";
import { Forward, Loader2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import type { InternalMessage, InternalThread } from "@/lib/internalMessages";
import { forwardInternalMessage } from "@/lib/internalMessageMutations";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: InternalMessage | null;
  threads: InternalThread[];
  currentThreadId?: string | null;
  organizationId: string;
  userId: string;
  onForwarded?: (targetThreadId: string, message: InternalMessage) => void;
};

export function InternalForwardDialog({
  open,
  onOpenChange,
  message,
  threads,
  currentThreadId,
  organizationId,
  userId,
  onForwarded,
}: Props) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);

  const candidates = useMemo(
    () => threads.filter((th) => th.id !== currentThreadId),
    [threads, currentThreadId],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return candidates;
    const q = query.toLowerCase();
    return candidates.filter(
      (th) => th.subject?.toLowerCase().includes(q) || th.participantName?.toLowerCase().includes(q),
    );
  }, [candidates, query]);

  const handleForward = async (thread: InternalThread) => {
    if (!message) return;
    setSendingId(thread.id);
    const result = await forwardInternalMessage(organizationId, thread.id, userId, message);
    setSendingId(null);

    if (!result.ok) {
      toast({
        title: t("Não foi possível reenviar"),
        description: result.error ?? t("Tente novamente"),
        variant: "destructive",
      });
      return;
    }

    toast({ title: t("Mensagem reenviada"), description: thread.participantName ?? thread.subject });
    if (result.message) onForwarded?.(thread.id, result.message);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setQuery(""); onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Forward size={16} />
            {t("Reenviar mensagem")}
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            autoFocus
            placeholder={t("Pesquisar conversa...")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg bg-muted/50 border border-border/40 placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring/50 focus:bg-background transition-colors"
          />
        </div>

        <div className="max-h-80 overflow-y-auto -mx-1 px-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t("Nenhuma conversa encontrada.")}
            </p>
          ) : (
            <ul className="divide-y divide-border/40">
              {filtered.map((thread) => (
                <li key={thread.id}>
                  <button
                    type="button"
                    disabled={sendingId !== null}
                    onClick={() => void handleForward(thread)}
                    className={cn(
                      "w-full text-left px-2 py-2.5 rounded-lg flex items-center justify-between gap-2 hover:bg-secondary/50 transition-colors disabled:opacity-60",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {thread.participantName ?? thread.subject}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{thread.subject}</p>
                    </div>
                    {sendingId === thread.id && (
                      <Loader2 size={14} className="animate-spin text-muted-foreground flex-shrink-0" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
