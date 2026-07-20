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

import { useEffect, useMemo, useState } from "react";
import { Bell, BellOff, CheckSquare, Loader2, MessageSquarePlus, Search, Trash2, X } from "lucide-react";
import { InternalChatPanel } from "@/components/messages/InternalChatPanel";
import { InternalForwardDialog } from "@/components/messages/InternalForwardDialog";
import { InternalThreadList } from "@/components/messages/InternalThreadList";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useInternalThreads } from "@/hooks/useInternalThreads";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import {
  getChatNotificationPermission,
  requestChatNotificationPermission,
  type ChatNotificationPermission,
} from "@/lib/chatNotifications";
import {
  fetchCampaignSharedThread,
  hideInternalThreadForUser,
  type InternalMessage,
  type InternalThread,
  type InternalThreadSource,
} from "@/lib/internalMessages";
import { cn } from "@/lib/utils";
import { subscribeToWebPush } from "@/lib/webPush";

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
  /** Thread a selecionar assim que a lista carregar (ex: thread recém-criada). */
  forcedThread?: InternalThread | null;
  onForcedThreadConsumed?: () => void;
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
  forcedThread,
  onForcedThreadConsumed,
}: Props) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();

  // ── Apagar conversas (seleção múltipla, "apagar para mim") ──────────────
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedThreadIds, setSelectedThreadIds] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletingThreads, setDeletingThreads] = useState(false);

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedThreadIds(new Set());
  };

  const toggleThreadSelection = (thread: InternalThread) => {
    setSelectedThreadIds((prev) => {
      const next = new Set(prev);
      if (next.has(thread.id)) next.delete(thread.id);
      else next.add(thread.id);
      return next;
    });
  };

  // Lixeira que aparece ao passar o mouse/dedo sobre a conversa (estilo
  // WhatsApp) — apaga direto, sem precisar entrar no modo de seleção
  // múltipla. Reaproveita o mesmo diálogo de confirmação e a mesma rotina
  // de exclusão ("apagar para mim") usados pela seleção múltipla.
  const requestDeleteSingleThread = (thread: InternalThread) => {
    setSelectedThreadIds(new Set([thread.id]));
    setConfirmDeleteOpen(true);
  };

  // ── Notificações do navegador — solicitação explícita e visível ─────────
  const [notifPermission, setNotifPermission] = useState<ChatNotificationPermission>(
    getChatNotificationPermission(),
  );
  const [notifBannerDismissed, setNotifBannerDismissed] = useState(false);

  const handleRequestNotifPermission = async () => {
    const result = await requestChatNotificationPermission();
    setNotifPermission(result);
    if (result === "granted" && user?.id) {
      void subscribeToWebPush(user.id);
    }
  };

  // Permissão já concedida em visita anterior (ex.: recarregou a página) —
  // garante que este dispositivo continua com uma inscrição de Web Push
  // válida, sem precisar que o usuário clique no banner novamente.
  useEffect(() => {
    if (notifPermission === "granted" && user?.id) {
      void subscribeToWebPush(user.id);
    }
  }, [notifPermission, user?.id]);

  // ── INBOX: lista de threads ───────────────────────────────────────────────
  const {
    threads,
    loading: threadsLoading,
    refetch: refetchThreads,
  } = useInternalThreads({
    organizationId,
    source,
    currentUserId: user?.id ?? null,
    enabled: mode === "inbox" && Boolean(organizationId),
  });

  const [selectedThread, setSelectedThread] = useState<InternalThread | null>(null);
  const [mobileShowPanel, setMobileShowPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [forwardMessage, setForwardMessage] = useState<InternalMessage | null>(null);

  // Auto-selecionar primeira conversa ao carregar (inbox) ou forcedThread
  useEffect(() => {
    if (mode !== "inbox" || threadsLoading) return;

    // forcedThread tem prioridade: encontrar na lista ou usar direto
    if (forcedThread) {
      const found = threads.find((t) => t.id === forcedThread.id) ?? forcedThread;
      setSelectedThread(found);
      setMobileShowPanel(true);
      onForcedThreadConsumed?.();
      return;
    }

    if (threads.length > 0 && selectedThread === null) {
      setSelectedThread(threads[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, threadsLoading, threads, forcedThread]);

  // Filtrar conversas pelo texto de busca (subject ou participantName)
  const filteredThreads = useMemo(() => {
    if (!searchQuery.trim()) return threads;
    const q = searchQuery.toLowerCase();
    return threads.filter((t) =>
      t.subject?.toLowerCase().includes(q) ||
      t.participantName?.toLowerCase().includes(q),
    );
  }, [threads, searchQuery]);

  const selectAllVisible = () => setSelectedThreadIds(new Set(filteredThreads.map((t) => t.id)));

  const handleConfirmDeleteThreads = async () => {
    if (!user?.id) return;
    setDeletingThreads(true);

    const ids = Array.from(selectedThreadIds);
    const results = await Promise.all(ids.map((id) => hideInternalThreadForUser(id, user.id)));
    const failed = results.filter((r) => !r.ok).length;

    setDeletingThreads(false);
    setConfirmDeleteOpen(false);

    if (selectedThread && selectedThreadIds.has(selectedThread.id)) {
      setSelectedThread(null);
    }

    exitSelectionMode();
    await refetchThreads();

    if (failed > 0) {
      toast({
        title: t("Algumas conversas não puderam ser apagadas"),
        description: t("Tente novamente ou contate o administrador."),
        variant: "destructive",
      });
    } else {
      toast({ title: ids.length > 1 ? t("Conversas apagadas") : t("Conversa apagada") });
    }
  };

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
          {/* Aviso de notificações — só quando ainda não decidido/negado, e não dispensado */}
          {mode === "inbox" && !notifBannerDismissed && notifPermission !== "unsupported" && notifPermission !== "granted" && (
            <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200/60 dark:border-amber-800/40 text-[11px]">
              {notifPermission === "denied" ? (
                <>
                  <BellOff size={13} className="text-amber-600 flex-shrink-0" />
                  <span className="flex-1 text-amber-800 dark:text-amber-300">
                    {t("Notificações bloqueadas pelo navegador. Ative nas configurações do site para receber avisos de novas mensagens.")}
                  </span>
                </>
              ) : (
                <>
                  <Bell size={13} className="text-amber-600 flex-shrink-0" />
                  <span className="flex-1 text-amber-800 dark:text-amber-300">
                    {t("Ativar notificações de novas mensagens?")}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleRequestNotifPermission()}
                    className="text-amber-900 dark:text-amber-200 font-semibold underline flex-shrink-0"
                  >
                    {t("Ativar")}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setNotifBannerDismissed(true)}
                className="text-amber-600 hover:text-amber-800 flex-shrink-0"
                aria-label={t("Dispensar")}
              >
                <X size={13} />
              </button>
            </div>
          )}

          {/* Barra de busca WhatsApp-style OU barra de seleção (apagar conversas) */}
          {selectionMode ? (
            <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border/30 bg-card">
              <button
                type="button"
                onClick={exitSelectionMode}
                className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground"
                aria-label={t("Cancelar seleção")}
              >
                <X size={16} />
              </button>
              <span className="text-xs font-medium flex-1">
                {selectedThreadIds.size} {t("selecionada(s)")}
              </span>
              <button
                type="button"
                onClick={selectAllVisible}
                className="text-xs text-primary font-medium hover:underline"
              >
                {t("Selecionar todas")}
              </button>
              <button
                type="button"
                disabled={selectedThreadIds.size === 0}
                onClick={() => setConfirmDeleteOpen(true)}
                className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label={t("Apagar conversa")}
                title={t("Apagar conversa")}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ) : (
            <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 border-b border-border/30 bg-card">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Pesquisar conversas..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg bg-muted/50 border border-border/40 placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring/50 focus:bg-background transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              {filteredThreads.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectionMode(true)}
                  className="flex-shrink-0 p-1.5 rounded-md hover:bg-secondary text-muted-foreground"
                  aria-label={t("Selecionar conversas")}
                  title={t("Selecionar conversas")}
                >
                  <CheckSquare size={16} />
                </button>
              )}
            </div>
          )}
          <InternalThreadList
            threads={filteredThreads}
            selectedId={activeThread?.id ?? null}
            loading={threadsLoading}
            onSelect={(t) => {
              setSelectedThread(t);
              setMobileShowPanel(true);
            }}
            selectionMode={selectionMode}
            selectedIds={selectedThreadIds}
            onToggleSelect={toggleThreadSelection}
            onDeleteThread={requestDeleteSingleThread}
          />
          {!threadsLoading && searchQuery && filteredThreads.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center text-muted-foreground">
              <Search size={24} className="mb-2 opacity-30" />
              <p className="text-xs">Nenhuma conversa encontrada para<br />"{searchQuery}"</p>
            </div>
          )}
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
                onForwardMessage={(message) => setForwardMessage(message)}
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

      <InternalForwardDialog
        open={forwardMessage !== null}
        onOpenChange={(open) => { if (!open) setForwardMessage(null); }}
        message={forwardMessage}
        threads={threads}
        currentThreadId={activeThread?.id ?? null}
        organizationId={organizationId}
        userId={user?.id ?? ""}
        onForwarded={() => setForwardMessage(null)}
      />

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedThreadIds.size > 1 ? t("Apagar conversas selecionadas?") : t("Apagar conversa?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("A conversa será ocultada apenas para você. Os outros participantes continuarão vendo normalmente e nenhuma mensagem será apagada.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingThreads}>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingThreads}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDeleteThreads();
              }}
            >
              {t("Apagar para mim")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
