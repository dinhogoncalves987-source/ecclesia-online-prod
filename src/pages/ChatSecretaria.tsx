import { useState } from "react";
import { MessageSquarePlus, Loader2 } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { InternalChat } from "@/components/messages/InternalChat";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { useRole } from "@/hooks/useRole";
import { useToast } from "@/hooks/use-toast";
import { createSecretariatThread, sendInternalMessage } from "@/lib/internalMessageMutations";
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

  const [showNew, setShowNew] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [refetchKey, setRefetchKey] = useState(0);

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

    setShowNew(false);
    setNewSubject("");
    setNewMessage("");
    setCreating(false);
    setRefetchKey((k) => k + 1);
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

  const headerSlot = (
    <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border/50">
      <div>
        <h1 className="text-lg font-semibold">Chat da Secretaria</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Comunicação interna administrativa</p>
      </div>
      <Button size="sm" onClick={() => setShowNew(true)}>
        <MessageSquarePlus size={16} className="mr-1.5" />
        Nova Conversa
      </Button>
    </div>
  );

  return (
    <AdminLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        <InternalChat
          key={refetchKey}
          mode="inbox"
          source="secretariat"
          organizationId={church?.id ?? ""}
          isStaff
          allowReplies
          subtitle="Chat da Secretaria"
          headerSlot={headerSlot}
          className="flex-1 min-h-0"
        />
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
