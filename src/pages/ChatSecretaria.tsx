import { useState } from "react";
import { MessageSquarePlus, Loader2, X } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { InternalThreadList } from "@/components/messages/InternalThreadList";
import { InternalChatPanel } from "@/components/messages/InternalChatPanel";
import { useInternalThreads } from "@/hooks/useInternalThreads";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { useRole } from "@/hooks/useRole";
import { useToast } from "@/hooks/use-toast";
import { createSecretariatThread, sendInternalMessage } from "@/lib/internalMessageMutations";
import type { InternalThread } from "@/lib/internalMessages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  "Secretaria Geral",
  "Tesouraria e Financeiro",
  "Cartas de Recomendação",
  "Documentos e Cadastros",
  "Solicitações",
  "Pastoral",
];

export default function ChatSecretaria() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { church, loading: churchLoading } = useChurch();
  const { isAdmin } = useRole();

  const { threads, loading, refetch } = useInternalThreads({
    organizationId: church?.id,
    source: "secretariat",
    enabled: Boolean(church?.id),
  });

  const [selectedThread, setSelectedThread] = useState<InternalThread | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [mobileShowThread, setMobileShowThread] = useState(false);

  const handleSelectThread = (thread: InternalThread) => {
    setSelectedThread(thread);
    setMobileShowThread(true);
  };

  const handleCreateThread = async () => {
    if (!church?.id || !user?.id || !newSubject.trim()) return;
    setCreating(true);

    const result = await createSecretariatThread(church.id, user.id, newSubject.trim());

    if (!result.ok || !result.thread) {
      toast({ title: "Erro ao criar conversa", description: result.error, variant: "destructive" });
      setCreating(false);
      return;
    }

    if (newMessage.trim()) {
      await sendInternalMessage(church.id, result.thread.id, user.id, {
        body: newMessage.trim(),
        senderRole: isAdmin ? "admin" : "secretary",
      });
    }

    await refetch();
    setSelectedThread(result.thread);
    setMobileShowThread(true);
    setShowNew(false);
    setNewSubject("");
    setNewMessage("");
    setCreating(false);
    toast({ title: "Conversa criada com sucesso" });
  };

  if (churchLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-full py-20">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)] sm:h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border/50">
          <div>
            <h1 className="text-lg font-semibold">Chat da Secretaria</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Comunicação interna administrativa</p>
          </div>
          <Button size="sm" onClick={() => setShowNew(true)}>
            <MessageSquarePlus size={16} className="mr-1.5" />
            Nova Conversa
          </Button>
        </div>

        {/* Layout: lista + painel */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Sidebar — lista de threads */}
          <div
            className={cn(
              "flex flex-col border-r border-border/50 overflow-hidden",
              "w-full sm:w-72 lg:w-80 flex-shrink-0",
              mobileShowThread ? "hidden sm:flex" : "flex",
            )}
          >
            <div className="flex-shrink-0 px-3 py-2 border-b border-border/30 bg-muted/30">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Conversas
              </p>
            </div>
            <InternalThreadList
              threads={threads}
              selectedId={selectedThread?.id ?? null}
              loading={loading}
              onSelect={handleSelectThread}
            />
          </div>

          {/* Painel de mensagens */}
          <div
            className={cn(
              "flex flex-col flex-1 min-w-0 overflow-hidden",
              mobileShowThread ? "flex" : "hidden sm:flex",
            )}
          >
            {selectedThread ? (
              <>
                {/* Botão voltar (mobile) */}
                <div className="flex sm:hidden flex-shrink-0 items-center gap-2 px-3 py-2 border-b border-border/50">
                  <button
                    type="button"
                    onClick={() => setMobileShowThread(false)}
                    className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground"
                  >
                    <X size={16} />
                  </button>
                  <span className="text-sm font-medium truncate">{selectedThread.subject}</span>
                </div>
                <InternalChatPanel
                  organizationId={church?.id ?? ""}
                  thread={selectedThread}
                  currentUserId={user?.id ?? null}
                  allowReplies
                  isStaff
                  title={selectedThread.subject}
                  subtitle="Secretaria"
                  onThreadCreated={(t) => setSelectedThread(t)}
                  onThreadUpdated={() => void refetch()}
                />
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center px-6">
                <MessageSquarePlus size={40} className="text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Selecione uma conversa ou crie uma nova
                </p>
                <Button variant="outline" size="sm" onClick={() => setShowNew(true)}>
                  Nova Conversa
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal: Nova Conversa */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Conversa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Assunto</label>
              <Input
                placeholder="Ex: Secretaria Geral"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setNewSubject(cat)}
                    className={cn(
                      "text-xs px-2 py-1 rounded-full border transition-colors",
                      newSubject === cat
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary/50 text-muted-foreground",
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Primeira mensagem (opcional)</label>
              <textarea
                className="w-full min-h-[80px] resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Digite uma mensagem inicial..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button onClick={handleCreateThread} disabled={creating || !newSubject.trim()}>
              {creating ? <Loader2 size={15} className="animate-spin mr-1.5" /> : null}
              Criar Conversa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
