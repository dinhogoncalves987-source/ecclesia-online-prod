/**
 * InternalChat — ponto de entrada unificado para todos os módulos de comunicação.
 *
 * Modes:
 *   "inbox"  → lista de threads (esquerda) + painel de mensagens (direita)
 *   "panel"  → apenas o painel de mensagens (thread única por campanha/grupo)
 *
 * Sources suportados (InternalThreadSource):
 *   secretariat | campaign | group | pastoral | finance | prayer | general | community
 *
 * Uso básico:
 *   <InternalChat mode="inbox" source="secretariat" organizationId={id} isStaff />
 *   <InternalChat mode="panel" source="campaign" organizationId={id} campaignId={cid} />
 */

import { useEffect, useState } from "react";
import { Loader2, MessageSquarePlus, X } from "lucide-react";
import { InternalChatPanel } from "@/components/messages/InternalChatPanel";
import { InternalThreadList } from "@/components/messages/InternalThreadList";
import { useAuth } from "@/hooks/useAuth";
import { useInternalThreads } from "@/hooks/useInternalThreads";
import { fetchCampaignSharedThread, type InternalThread, type InternalThreadSource } from "@/lib/internalMessages";
import { cn } from "@/lib/utils";

type Props = {
  mode: "inbox" | "panel";
  organizationId: string;
  source: InternalThreadSource;
  campaignId?: string;
  isStaff?: boolean;
  allowReplies?: boolean;
  title?: string;
  subtitle?: string;
  className?: string;
  onClose?: () => void;
  /** Slot para renderizar header personalizado acima do layout (ex: botão "Nova Conversa"). */
  headerSlot?: React.ReactNode;
};

export function InternalChat({
  mode,
  organizationId,
  source,
  campaignId,
  isStaff = false,
  allowReplies = true,
  title,
  subtitle,
  className,
  onClose,
  headerSlot,
}: Props) {
  const { user } = useAuth();

  // ── INBOX: lista de threads ───────────────────────────────────────────────
  const {
    threads,
    loading: threadsLoading,
    refetch: refetchThreads,
  } = useInternalThreads({
    organizationId,
    source,
    enabled: mode === "inbox" && Boolean(organizationId),
  });

  const [selectedThread, setSelectedThread] = useState<InternalThread | null>(null);
  const [mobileShowPanel, setMobileShowPanel] = useState(false);

  // Auto-selecionar primeira conversa ao carregar (inbox)
  useEffect(() => {
    if (mode === "inbox" && !threadsLoading && threads.length > 0 && selectedThread === null) {
      setSelectedThread(threads[0]);
    }
  }, [mode, threadsLoading, threads, selectedThread]);

  // ── PANEL: thread única (campanha) ────────────────────────────────────────
  const [panelThread, setPanelThread] = useState<InternalThread | null>(null);
  const [panelLoading, setPanelLoading] = useState(mode === "panel");

  useEffect(() => {
    if (mode !== "panel") return;
    if (!campaignId) { setPanelLoading(false); return; }
    let cancelled = false;
    setPanelLoading(true);
    fetchCampaignSharedThread(organizationId, campaignId).then((t) => {
      if (!cancelled) { setPanelThread(t); setPanelLoading(false); }
    });
    return () => { cancelled = true; };
  }, [mode, organizationId, campaignId]);

  // ── Render: PANEL mode ────────────────────────────────────────────────────
  if (mode === "panel") {
    if (panelLoading) {
      return (
        <div className={cn("flex flex-1 items-center justify-center", className)}>
          <Loader2 size={22} className="animate-spin text-muted-foreground" />
        </div>
      );
    }
    return (
      <div className={cn("flex flex-col h-full min-h-0 bg-card overflow-hidden", onClose ? "rounded-xl border border-border/50" : "", className)}>
        {onClose ? (
          <div className="flex-shrink-0 flex items-center justify-end px-2 pt-2 sm:hidden">
            <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-secondary text-muted-foreground">
              <X size={18} />
            </button>
          </div>
        ) : null}
        <InternalChatPanel
          organizationId={organizationId}
          thread={panelThread}
          currentUserId={user?.id ?? null}
          allowReplies={allowReplies}
          isStaff={isStaff}
          campaignId={campaignId}
          campaignTitle={title}
          title={title}
          subtitle={subtitle}
          onThreadCreated={(t) => setPanelThread(t)}
          onThreadUpdated={() => {
            if (campaignId) {
              fetchCampaignSharedThread(organizationId, campaignId).then(setPanelThread);
            }
          }}
        />
        {onClose ? (
          <div className="hidden sm:flex flex-shrink-0 justify-end px-3 py-2 border-t border-border/50">
            <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5">
              Fechar
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  // ── Render: INBOX mode ────────────────────────────────────────────────────
  const activeThread = selectedThread;

  return (
    <div className={cn("flex flex-col h-full min-h-0 overflow-hidden", className)}>
      {headerSlot ? (
        <div className="flex-shrink-0">{headerSlot}</div>
      ) : null}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar de threads */}
        <div
          className={cn(
            "flex flex-col border-r border-border/50 overflow-hidden",
            "w-full sm:w-72 lg:w-80 flex-shrink-0",
            mobileShowPanel ? "hidden sm:flex" : "flex",
          )}
        >
          <div className="flex-shrink-0 px-3 py-2 border-b border-border/30 bg-muted/30">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Conversas
            </p>
          </div>
          <InternalThreadList
            threads={threads}
            selectedId={activeThread?.id ?? null}
            loading={threadsLoading}
            onSelect={(t) => {
              setSelectedThread(t);
              setMobileShowPanel(true);
            }}
          />
        </div>

        {/* Painel de mensagens */}
        <div
          className={cn(
            "flex flex-col flex-1 min-w-0 overflow-hidden",
            mobileShowPanel ? "flex" : "hidden sm:flex",
          )}
        >
          {activeThread ? (
            <>
              {/* Botão voltar (mobile) */}
              <div className="flex sm:hidden flex-shrink-0 items-center gap-2 px-3 py-2 border-b border-border/50">
                <button
                  type="button"
                  onClick={() => setMobileShowPanel(false)}
                  className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground"
                >
                  <X size={16} />
                </button>
                <span className="text-sm font-medium truncate">{activeThread.subject}</span>
              </div>
              <InternalChatPanel
                organizationId={organizationId}
                thread={activeThread}
                currentUserId={user?.id ?? null}
                allowReplies={allowReplies}
                isStaff={isStaff}
                title={activeThread.subject}
                subtitle={subtitle}
                onThreadCreated={(t) => setSelectedThread(t)}
                onThreadUpdated={() => void refetchThreads()}
              />
            </>
          ) : threadsLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 size={22} className="animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center px-6">
              <MessageSquarePlus size={40} className="text-muted-foreground/40" />
              <p className="text-sm font-medium">Nenhuma conversa ainda</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Crie a primeira conversa para iniciar a comunicação.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
