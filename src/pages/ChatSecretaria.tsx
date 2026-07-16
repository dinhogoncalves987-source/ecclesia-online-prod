import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  HeadphonesIcon,
  Loader2,
  MessageSquarePlus,
  Search,
  Users,
  Video,
} from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { InternalChat } from "@/components/messages/InternalChat";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { useRole } from "@/hooks/useRole";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import {
  createSecretariatThread,
  findOrCreateDirectThread,
  sendInternalMessage,
} from "@/lib/internalMessageMutations";
import { JitsiCallModal } from "@/components/messages/JitsiCallModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { InternalThread } from "@/lib/internalMessages";

// ── Tipos ───────────────────────────────────────────────────────────────────

type DialogMode = "topic" | "direct" | "meeting";

type MemberResult = {
  id: string;
  full_name: string;
  member_role: string | null;
};

// ── Constantes ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "Secretaria Geral",
  "Tesouraria e Financeiro",
  "Cartas de Recomendação",
  "Documentos e Cadastros",
  "Solicitações",
  "Pastoral",
];

const ROLE_LABEL: Record<string, string> = {
  member: "Membro",
  leader: "Líder",
  co_leader: "Co-líder",
  pastor: "Pastor",
  secretary: "Secretário(a)",
  treasurer: "Tesoureiro(a)",
  deacon: "Diácono/Diaconisa",
  elder: "Presbítero",
  church_admin: "Administrador",
};

// ── Componente ────────────────────────────────────────────────────────────────

export default function ChatSecretaria() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const { church, loading: churchLoading } = useChurch();
  const { isAdmin } = useRole();
  const location    = useLocation();
  const navigate    = useNavigate();
  const { pathname } = location;

  // On the global route /admin/chat the title is "Conversas".
  // On the legacy /admin/chat-secretaria it stays as "Chat da Secretaria".
  const isGlobalChat = pathname === "/admin/chat";
  const pageTitle    = isGlobalChat ? t("Conversas") : t("Chat da Secretaria");
  const pageSubtitle = isGlobalChat
    ? t("Comunicação interna da organização")
    : t("Comunicação interna administrativa");

  // estado geral
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>("topic");
  const [creating, setCreating] = useState(false);
  const [refetchKey, setRefetchKey] = useState(0);
  const [forcedThread, setForcedThread] = useState<InternalThread | null>(null);

  // ── Auto-open DM when navigated from GerenciarAcessos ───────────────────
  const processedNavState = useRef(false);
  useEffect(() => {
    if (processedNavState.current) return;
    const state = location.state as { openDm?: boolean; userId?: string; userName?: string } | null;
    if (!state?.openDm || !state.userId || !church?.id || !user?.id) return;

    processedNavState.current = true;
    // Clear nav state so back-navigation doesn't re-trigger
    navigate(pathname, { replace: true, state: {} });

    void findOrCreateDirectThread(church.id, user.id, state.userId, state.userName || t("Usuário"))
      .then((result) => {
        if (result.ok && result.thread) {
          setForcedThread(result.thread);
          setRefetchKey((k) => k + 1);
          toast({ title: `${t("Conversa com")} ${state.userName || t("usuário")} ${t("aberta")}` });
        } else {
          toast({ title: t("Erro ao abrir conversa"), description: result.error, variant: "destructive" });
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [church?.id, user?.id]);

  // tópico geral
  const [newSubject, setNewSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");

  // mensagem direta
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState<MemberResult[]>([]);
  const [memberSearching, setMemberSearching] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberResult | null>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // reunião
  const [meetingName, setMeetingName] = useState("");
  const [meetingThread, setMeetingThread] = useState<InternalThread | null>(null);
  const [meetingCallOpen, setMeetingCallOpen] = useState(false);

  // ── Busca de membros ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!church?.id || dialogMode !== "direct") return;

    if (!memberSearch.trim()) {
      setMemberResults([]);
      return;
    }

    if (searchDebounce.current) clearTimeout(searchDebounce.current);

    searchDebounce.current = setTimeout(async () => {
      setMemberSearching(true);
      const { data, error } = await supabase
        .from("members")
        .select("id, full_name, member_role")
        .eq("organization_id", church.id)
        .ilike("full_name", `%${memberSearch.trim()}%`)
        .order("full_name")
        .limit(10);

      if (!error && data) setMemberResults(data as MemberResult[]);
      setMemberSearching(false);
    }, 300);
  }, [memberSearch, church?.id, dialogMode]);

  // ── Ações ──────────────────────────────────────────────────────────────────

  const closeDialog = () => {
    setDialogOpen(false);
    setNewSubject("");
    setNewMessage("");
    setMemberSearch("");
    setMemberResults([]);
    setSelectedMember(null);
    setMeetingName("");
  };

  const handleCreateTopic = async () => {
    if (!church?.id || !user?.id || !newSubject.trim()) return;
    setCreating(true);

    const result = await createSecretariatThread(church.id, user.id, newSubject.trim());
    if (!result.ok || !result.thread) {
      toast({ title: t("Erro ao criar conversa"), description: result.error, variant: "destructive" });
      setCreating(false);
      return;
    }

    if (newMessage.trim()) {
      await sendInternalMessage(church.id, result.thread.id, user.id, {
        body: newMessage.trim(),
        senderRole: isAdmin ? "admin" : "secretary",
      });
    }

    closeDialog();
    setCreating(false);
    setRefetchKey((k) => k + 1);
    toast({ title: t("Conversa criada com sucesso") });
  };

  const handleSupportThread = async () => {
    if (!church?.id || !user?.id) return;
    setCreating(true);

    const result = await createSecretariatThread(church.id, user.id, t("Suporte Ecclesia"));
    if (!result.ok || !result.thread) {
      toast({ title: t("Erro ao criar conversa de suporte"), description: result.error, variant: "destructive" });
      setCreating(false);
      return;
    }

    await sendInternalMessage(church.id, result.thread.id, user.id, {
      body: t("Olá! Preciso de ajuda com a plataforma Ecclesia."),
      senderRole: isAdmin ? "admin" : "secretary",
    });

    closeDialog();
    setCreating(false);
    setForcedThread(result.thread);
    setRefetchKey((k) => k + 1);
    toast({ title: t("Conversa de suporte iniciada") });
  };

  const handleDirectMessage = async () => {
    if (!church?.id || !user?.id || !selectedMember) return;
    setCreating(true);

    const result = await findOrCreateDirectThread(
      church.id,
      user.id,
      selectedMember.id,
      selectedMember.full_name,
    );

    if (!result.ok || !result.thread) {
      toast({ title: t("Erro ao abrir conversa"), description: result.error, variant: "destructive" });
      setCreating(false);
      return;
    }

    closeDialog();
    setCreating(false);
    setForcedThread(result.thread);
    setRefetchKey((k) => k + 1);

    if (result.isNew) {
      toast({ title: `${t("Conversa iniciada com")} ${selectedMember.full_name}` });
    } else {
      toast({ title: `${t("Conversa com")} ${selectedMember.full_name} ${t("aberta")}` });
    }
  };

  const handleCreateMeeting = async () => {
    if (!church?.id || !user?.id || !meetingName.trim()) return;
    setCreating(true);

    const subject = meetingName.trim();
    const result = await createSecretariatThread(church.id, user.id, subject);

    if (!result.ok || !result.thread) {
      toast({ title: t("Erro ao criar reunião"), description: result.error, variant: "destructive" });
      setCreating(false);
      return;
    }

    // Mensagem de convite para a reunião
    await sendInternalMessage(church.id, result.thread.id, user.id, {
      body: `📹 ${t("Reunião")} "${subject}" ${t("criada. Use os botões de ligação/vídeo para entrar na sala.")}`,
      senderRole: isAdmin ? "admin" : "secretary",
    });

    closeDialog();
    setCreating(false);
    setMeetingThread(result.thread);
    setMeetingCallOpen(true);
    setRefetchKey((k) => k + 1);
    toast({ title: `${t("Reunião")} "${subject}" ${t("iniciada")}` });
  };

  // ── Carregando ─────────────────────────────────────────────────────────────

  if (churchLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-full py-20">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  // ── Sem vínculo com organização ────────────────────────────────────────────

  if (!church) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center h-full py-20 gap-4 text-center px-6">
          <MessageSquarePlus size={40} className="text-muted-foreground/40" />
          <div>
            <p className="text-base font-semibold">{t("Chat não disponível")}</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              {t("Sua conta ainda não está vinculada a uma igreja. Use um convite recebido ou solicite vínculo à secretaria.")}
            </p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // ── Header slot ────────────────────────────────────────────────────────────

  const headerSlot = (
    <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border/50">
      <div>
        <h1 className="text-lg font-semibold">{pageTitle}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{pageSubtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setDialogMode("meeting");
            setDialogOpen(true);
          }}
        >
          <Video size={15} className="mr-1.5" />
          <span className="hidden sm:inline">{t("Nova Reunião")}</span>
          <span className="sm:hidden">{t("Reunião")}</span>
        </Button>
        <Button
          size="sm"
          onClick={() => {
            setDialogMode("topic");
            setDialogOpen(true);
          }}
        >
          <MessageSquarePlus size={16} className="mr-1.5" />
          <span className="hidden sm:inline">{t("Nova Conversa")}</span>
          <span className="sm:hidden">{t("Novo")}</span>
        </Button>
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      {/*
        Altura calculada a partir do viewport dinâmico (dvh, mais estável em
        navegadores mobile que escondem/mostram a barra de endereço),
        descontando cabeçalho (4rem), o padding vertical do <main> em cada
        breakpoint (p-4/p-6/p-8) e, no mobile/tablet, a navegação inferior
        fixa (pb-20 = 5rem). O cálculo antigo só descontava o cabeçalho e
        ficava maior que o espaço real disponível, empurrando o rodapé do
        chat para debaixo da navegação inferior fixa.
      */}
      <div className="flex flex-col h-[calc(100dvh-11rem)] sm:h-[calc(100dvh-12rem)] lg:h-[calc(100dvh-8rem)] overflow-hidden">
        <InternalChat
          key={refetchKey}
          mode="inbox"
          source="secretariat"
          organizationId={church?.id ?? ""}
          isStaff
          allowReplies
          subtitle={pageTitle}
          headerSlot={headerSlot}
          className="flex-1 min-h-0"
          forcedThread={forcedThread}
          onForcedThreadConsumed={() => setForcedThread(null)}
        />
      </div>

      {/* Modal Jitsi para reunião recém-criada */}
      {meetingThread && (
        <JitsiCallModal
          open={meetingCallOpen}
          onClose={() => {
            setMeetingCallOpen(false);
            setMeetingThread(null);
          }}
          organizationId={church?.id ?? ""}
          threadId={meetingThread.id}
          mode="video"
          displayName={
            (user?.user_metadata as Record<string, string> | undefined)?.full_name ||
            user?.email?.split("@")[0] ||
            t("Participante")
          }
          callTitle={`${t("Reunião:")} ${meetingThread.subject}`}
        />
      )}

      {/* Modal: Nova Conversa / DM / Suporte / Reunião */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) closeDialog(); else setDialogOpen(true); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "direct"
                ? t("Nova Mensagem Direta")
                : dialogMode === "meeting"
                  ? t("Nova Reunião")
                  : t("Nova Conversa")}
            </DialogTitle>
          </DialogHeader>

          {/* Tabs de modo */}
          <div className="flex gap-1 p-1 bg-muted rounded-lg text-xs mb-2">
            {(["topic", "direct", "meeting"] as DialogMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setDialogMode(m)}
                className={cn(
                  "flex-1 py-1.5 rounded-md font-medium transition-colors",
                  dialogMode === m
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "topic" ? t("Tópico") : m === "direct" ? t("Mensagem Direta") : t("Reunião")}
              </button>
            ))}
          </div>

          {/* ── Modo: Tópico Geral ────────────────────────────────────── */}
          {dialogMode === "topic" && (
            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("Assunto")}</label>
                <Input
                  placeholder={t("Ex: Secretaria Geral")}
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
                      {t(cat)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("Primeira mensagem (opcional)")}</label>
                <textarea
                  className="w-full min-h-[70px] resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder={t("Digite uma mensagem inicial...")}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                />
              </div>
              {/* Atalho para Suporte Ecclesia */}
              <div className="border border-dashed border-border rounded-lg p-3 flex items-center gap-3">
                <HeadphonesIcon size={18} className="text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{t("Falar com Suporte Ecclesia")}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {t("Abrir conversa direta com a equipe da plataforma")}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="flex-shrink-0 text-xs"
                  disabled={creating}
                  onClick={handleSupportThread}
                >
                  {t("Abrir")}
                </Button>
              </div>
            </div>
          )}

          {/* ── Modo: Mensagem Direta ─────────────────────────────────── */}
          {dialogMode === "direct" && (
            <div className="space-y-3 py-1">
              <p className="text-xs text-muted-foreground">
                {t("Busque um membro da organização para iniciar uma conversa privada.")}
              </p>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder={t("Nome do membro...")}
                  value={memberSearch}
                  onChange={(e) => {
                    setMemberSearch(e.target.value);
                    setSelectedMember(null);
                  }}
                />
              </div>

              {memberSearching && (
                <div className="flex justify-center py-4">
                  <Loader2 size={18} className="animate-spin text-muted-foreground" />
                </div>
              )}

              {!memberSearching && memberResults.length > 0 && !selectedMember && (
                <div className="border border-border rounded-md divide-y divide-border max-h-52 overflow-y-auto">
                  {memberResults.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/60 text-left transition-colors"
                      onClick={() => setSelectedMember(m)}
                    >
                      <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center text-xs font-medium text-primary uppercase">
                        {m.full_name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{m.full_name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {t(ROLE_LABEL[m.member_role ?? ""] ?? m.member_role ?? "Membro")}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {!memberSearching && memberSearch.trim() && memberResults.length === 0 && (
                <p className="text-xs text-center text-muted-foreground py-3">
                  {t("Nenhum membro encontrado com esse nome.")}
                </p>
              )}

              {selectedMember && (
                <div className="flex items-center gap-2.5 p-3 bg-muted/50 rounded-md border border-border">
                  <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center text-sm font-medium text-primary uppercase">
                    {selectedMember.full_name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{selectedMember.full_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t(ROLE_LABEL[selectedMember.member_role ?? ""] ?? selectedMember.member_role ?? "Membro")}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => { setSelectedMember(null); setMemberSearch(""); }}
                  >
                    {t("Trocar")}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Modo: Reunião ─────────────────────────────────────────── */}
          {dialogMode === "meeting" && (
            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("Nome da reunião")}</label>
                <Input
                  placeholder={t("Ex: Reunião da Diretoria")}
                  value={meetingName}
                  onChange={(e) => setMeetingName(e.target.value)}
                />
              </div>
              <div className="flex items-start gap-2.5 p-3 bg-muted/40 rounded-md text-xs text-muted-foreground">
                <Users size={14} className="flex-shrink-0 mt-0.5" />
                <p>
                  {t("Uma sala de videoconferência será criada automaticamente. Os participantes entram pela conversa usando os botões de chamada.")}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={creating}>
              {t("Cancelar")}
            </Button>

            {dialogMode === "topic" && (
              <Button onClick={handleCreateTopic} disabled={creating || !newSubject.trim()}>
                {creating ? <Loader2 size={15} className="animate-spin mr-1.5" /> : null}
                {t("Criar Conversa")}
              </Button>
            )}

            {dialogMode === "direct" && (
              <Button onClick={handleDirectMessage} disabled={creating || !selectedMember}>
                {creating ? <Loader2 size={15} className="animate-spin mr-1.5" /> : null}
                {t("Abrir Conversa")}
              </Button>
            )}

            {dialogMode === "meeting" && (
              <Button onClick={handleCreateMeeting} disabled={creating || !meetingName.trim()}>
                {creating ? <Loader2 size={15} className="animate-spin mr-1.5" /> : null}
                {t("Criar e Entrar")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
