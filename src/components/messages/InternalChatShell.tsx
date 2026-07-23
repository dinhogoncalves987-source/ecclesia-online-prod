import { Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { InternalChatPanel } from "@/components/messages/InternalChatPanel";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import {
  fetchCampaignSharedThread,
  type InternalThread,
  type InternalThreadSource,
} from "@/lib/internalMessages";
import { cn } from "@/lib/utils";

type Props = {
  organizationId: string;
  source?: InternalThreadSource;
  campaignId?: string;
  campaignTitle?: string;
  allowReplies?: boolean;
  /** Usuário atual tem permissão de gestão (pode enviar mesmo com replies fechadas, pode deletar). */
  isStaff?: boolean;
  onClose?: () => void;
  className?: string;
};

export function InternalChatShell({
  organizationId,
  campaignId,
  campaignTitle,
  allowReplies = true,
  isStaff = false,
  onClose,
  className,
}: Props) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [thread, setThread] = useState<InternalThread | null>(null);
  const [threadLoading, setThreadLoading] = useState(true);

  const loadThread = useCallback(async () => {
    if (!campaignId) {
      setThreadLoading(false);
      return;
    }
    setThreadLoading(true);
    const existing = await fetchCampaignSharedThread(organizationId, campaignId, user?.id ?? null);
    setThread(existing);
    setThreadLoading(false);
  }, [organizationId, campaignId, user?.id]);

  useEffect(() => {
    void loadThread();
  }, [loadThread]);

  const handleThreadCreated = (newThread: InternalThread) => {
    setThread(newThread);
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full min-h-0 w-full bg-card overflow-hidden",
        onClose ? "rounded-xl border border-border/50" : "",
        className,
      )}
    >
      {onClose ? (
        <div className="flex-shrink-0 flex items-center justify-end px-2 pt-2 sm:hidden">
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-secondary text-muted-foreground"
            aria-label={t("Fechar")}
          >
            <X size={18} />
          </button>
        </div>
      ) : null}

      {threadLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 size={22} className="animate-spin text-muted-foreground" />
        </div>
      ) : (
        <InternalChatPanel
          organizationId={organizationId}
          thread={thread}
          currentUserId={user?.id ?? null}
          allowReplies={allowReplies}
          isStaff={isStaff}
          campaignId={campaignId}
          campaignTitle={campaignTitle}
          title={campaignTitle}
          subtitle={t("Equipe da campanha")}
          onThreadCreated={handleThreadCreated}
          onThreadUpdated={() => void loadThread()}
        />
      )}

      {onClose ? (
        <div className="hidden sm:flex flex-shrink-0 justify-end px-3 py-2 border-t border-border/50">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5"
          >
            {t("Fechar")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
