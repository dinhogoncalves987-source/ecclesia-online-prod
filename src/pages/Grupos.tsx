import { AdminLayout } from "@/components/AdminLayout";
import { UsersRound, Plus, X, MapPin, Clock, Tag, MessageCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { ptBR, enUS, es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { useRole } from "@/hooks/useRole";
import { canWriteSecretaria } from "@/lib/permissions";
import { insertWithOrganizationScope } from "@/lib/organizationScope";

type SmallGroup = {
  id: string; name: string; group_type: string | null; meeting_day: string | null;
  meeting_time: string | null; location: string | null; description: string | null;
  is_active: boolean | null; created_by: string | null; leader_member_id: string | null;
};

type GroupParticipant = {
  id: string;
  role: string;
  full_name: string;
};

type GroupMessage = {
  id: string;
  body: string;
  created_at: string;
  author_user_id: string;
  authorLabel: string;
};

const groupTypes = ["Estudo Bíblico", "Jovens", "Casais", "Mulheres", "Homens", "Missões", "Geral"];

const participantRoleOrder = (role: string) => {
  if (role === "leader") return 0;
  if (role === "co_leader") return 1;
  return 2;
};

const participantRoleLabel = (role: string, t: (key: string) => string) => {
  if (role === "leader") return t("Líder");
  if (role === "co_leader") return t("Co-líder");
  return t("Membro");
};

const emptyForm = () => ({
  name: "",
  group_type: "Estudo Bíblico",
  meeting_day: "",
  meeting_time: "",
  location: "",
  description: "",
});

export default function Grupos() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, lang } = useLanguage();
  const { church, loading: churchLoading } = useChurch();
  const { canonicalRole } = useRole();
  const canWrite = canWriteSecretaria(canonicalRole);
  const [groups, setGroups] = useState<SmallGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [detailGroup, setDetailGroup] = useState<SmallGroup | null>(null);
  const [detailLeaderName, setDetailLeaderName] = useState<string | null>(null);
  const [detailParticipants, setDetailParticipants] = useState<GroupParticipant[]>([]);
  const [detailParticipantsLoading, setDetailParticipantsLoading] = useState(false);
  const [detailParticipantsError, setDetailParticipantsError] = useState(false);
  const [chatMessages, setChatMessages] = useState<GroupMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatLoadError, setChatLoadError] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatSendError, setChatSendError] = useState<string | null>(null);

  const dateLoc = lang === "en" ? enUS : lang === "es" ? es : ptBR;

  const loadGroupMessages = useCallback(async (groupId: string) => {
    setChatLoading(true);
    setChatLoadError(false);
    const { data, error } = await supabase
      .from("group_messages")
      .select("id, body, created_at, author_user_id")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true });

    if (error) {
      setChatLoadError(true);
      setChatMessages([]);
      setChatLoading(false);
      return;
    }

    const rows = data || [];
    const authorIds = [...new Set(rows.map(row => row.author_user_id))];
    const nameByUserId = new Map<string, string>();

    if (authorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", authorIds);
      for (const profile of profiles || []) {
        if (profile.full_name) nameByUserId.set(profile.user_id, profile.full_name);
      }
    }

    setChatMessages(
      rows.map(row => ({
        id: row.id,
        body: row.body,
        created_at: row.created_at,
        author_user_id: row.author_user_id,
        authorLabel:
          row.author_user_id === user?.id
            ? t("Você")
            : nameByUserId.get(row.author_user_id) || t("Participante"),
      })),
    );
    setChatLoading(false);
  }, [t, user?.id]);

  const loadGroupDetail = useCallback(async (group: SmallGroup) => {
    setDetailLeaderName(null);
    setDetailParticipants([]);
    setDetailParticipantsError(false);
    setDetailParticipantsLoading(true);

    if (group.leader_member_id) {
      const { data: leaderRow } = await supabase
        .from("members")
        .select("full_name")
        .eq("id", group.leader_member_id)
        .maybeSingle();
      setDetailLeaderName(leaderRow?.full_name ?? null);
    }

    const { data: roster, error: rosterError } = await supabase
      .from("group_members")
      .select("id, role, member_id, members(full_name)")
      .eq("group_id", group.id);

    if (rosterError) {
      setDetailParticipantsError(true);
      setDetailParticipantsLoading(false);
      return;
    }

    const participants = (roster || [])
      .map(row => {
        const member = row.members as { full_name: string } | null;
        return {
          id: row.id,
          role: row.role || "member",
          full_name: member?.full_name || t("Membro"),
        };
      })
      .sort((a, b) => participantRoleOrder(a.role) - participantRoleOrder(b.role));

    setDetailParticipants(participants);
    setDetailParticipantsLoading(false);
  }, [t]);

  const openGroupDetail = (g: SmallGroup) => {
    setDetailGroup(g);
    setChatInput("");
    setChatSendError(null);
    void loadGroupDetail(g);
    void loadGroupMessages(g.id);
  };

  const closeGroupDetail = () => {
    setDetailGroup(null);
    setDetailLeaderName(null);
    setDetailParticipants([]);
    setDetailParticipantsError(false);
    setDetailParticipantsLoading(false);
    setChatMessages([]);
    setChatLoading(false);
    setChatLoadError(false);
    setChatInput("");
    setChatSending(false);
    setChatSendError(null);
  };

  const handleSendMessage = async () => {
    if (!detailGroup || !user || !chatInput.trim()) return;
    setChatSending(true);
    setChatSendError(null);
    const { error } = await supabase.from("group_messages").insert({
      group_id: detailGroup.id,
      author_user_id: user.id,
      body: chatInput.trim(),
    });
    if (error) {
      setChatSendError(error.message);
      setChatSending(false);
      return;
    }
    setChatInput("");
    await loadGroupMessages(detailGroup.id);
    setChatSending(false);
  };

  const refreshDetailIfOpen = async (groupId: string) => {
    if (!church || !detailGroup || detailGroup.id !== groupId) return;
    const { data } = await supabase
      .from("groups")
      .select("*")
      .eq("id", groupId)
      .eq("organization_id", church.id)
      .maybeSingle();
    if (data) {
      const updated = data as SmallGroup;
      setDetailGroup(updated);
      await loadGroupDetail(updated);
    }
  };

  const openCreateForm = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEditForm = (g: SmallGroup) => {
    setEditingId(g.id);
    setForm({
      name: g.name,
      group_type: g.group_type && groupTypes.includes(g.group_type) ? g.group_type : "Geral",
      meeting_day: g.meeting_day || "",
      meeting_time: g.meeting_time || "",
      location: g.location || "",
      description: g.description || "",
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  const fetch_ = async () => {
    if (!church) return;
    const { data } = await supabase.from("groups").select("*").eq("organization_id", church.id).order("created_at", { ascending: false });
    setGroups((data as SmallGroup[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (churchLoading) return;
    if (!church) { setLoading(false); return; }
    fetch_();
  }, [church, churchLoading]);

  const handleSave = async () => {
    if (!form.name.trim() || !church) return;

    if (editingId) {
      const { error } = await supabase
        .from("groups")
        .update({
          name: form.name.trim(),
          group_type: form.group_type || "Geral",
          meeting_day: form.meeting_day || null,
          meeting_time: form.meeting_time || null,
          location: form.location || null,
          description: form.description || null,
        })
        .eq("id", editingId)
        .eq("organization_id", church.id);
      if (error) {
        toast({ title: t("Erro"), description: error.message, variant: "destructive" });
        return;
      }
      closeForm();
      toast({ title: t("Grupo atualizado!") });
      fetch_();
      void refreshDetailIfOpen(editingId);
      return;
    }

    if (!user) return;
    const { error } = await insertWithOrganizationScope("groups", church.id, {
      created_by: user.id,
      name: form.name.trim(),
      group_type: form.group_type || "Geral",
      meeting_day: form.meeting_day || null,
      meeting_time: form.meeting_time || null,
      location: form.location || null,
      description: form.description || null,
      is_active: true,
    });
    if (error) { toast({ title: t("Erro"), description: error.message, variant: "destructive" }); return; }
    closeForm();
    toast({ title: t("Grupo criado!") });
    fetch_();
  };

  const toggleActive = async (g: SmallGroup) => {
    if (!church) return;
    const next = g.is_active === false;
    const { error } = await supabase
      .from("groups")
      .update({ is_active: next })
      .eq("id", g.id)
      .eq("organization_id", church.id);
    if (error) {
      toast({ title: t("Erro"), description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: next ? t("Grupo ativado") : t("Grupo desativado") });
    fetch_();
    void refreshDetailIfOpen(g.id);
  };

  const handleDelete = async (id: string) => {
    if (!church) return;
    const { error } = await supabase
      .from("groups")
      .delete()
      .eq("id", id)
      .eq("organization_id", church.id);
    if (error) {
      toast({ title: t("Erro"), description: error.message, variant: "destructive" });
      return;
    }
    if (detailGroup?.id === id) closeGroupDetail();
    toast({ title: t("Grupo removido") });
    fetch_();
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif font-bold text-foreground">{t("Pequenos Grupos")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("Gerencie os grupos de comunhão e estudo")}</p>
          </div>
          {canWrite && (
          <button onClick={openCreateForm} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus size={16} /> {t("Novo Grupo")}
          </button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">{t("Carregando...")}</div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <UsersRound size={32} className="text-primary/60" />
            </div>
            <h3 className="font-serif text-lg font-semibold text-foreground mb-1">{t("Nenhum grupo cadastrado")}</h3>
            <p className="text-sm text-muted-foreground max-w-xs mb-5">{t("Crie grupos de comunhão, estudo bíblico ou ministérios para organizar sua comunidade.")}</p>
            {canWrite && (
            <button onClick={openCreateForm} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
              <Plus size={16} />{t("Criar Primeiro Grupo")}
            </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g, i) => (
              <motion.div key={g.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                onClick={() => openGroupDetail(g)}
                className="bg-card rounded-xl p-5 shadow-sm border border-border/50 cursor-pointer hover:border-primary/40 hover:shadow-md transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{g.name}</h3>
                    {g.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{g.description}</p>}
                  </div>
                  <span className={`ml-2 flex-shrink-0 text-xs px-2 py-0.5 rounded-full ${g.is_active !== false ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground"}`}>
                    {g.is_active !== false ? t("Ativo") : t("Inativo")}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {g.group_type && <div className="flex items-center gap-1.5"><Tag size={12} /> {t(g.group_type)}</div>}
                  {g.meeting_day && <div className="flex items-center gap-1.5"><Clock size={12} /> {g.meeting_day}{g.meeting_time && ` às ${g.meeting_time}`}</div>}
                  {g.location && <div className="flex items-center gap-1.5"><MapPin size={12} /> {g.location}</div>}
                </div>
                {canWrite && (
                  <div className="mt-3 pt-2 border-t border-border/30 flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEditForm(g)} className="text-xs text-muted-foreground hover:bg-secondary px-2 py-1 rounded transition-colors">
                      {t("Editar")}
                    </button>
                    <button onClick={() => toggleActive(g)} className="text-xs text-muted-foreground hover:bg-secondary px-2 py-1 rounded transition-colors">
                      {g.is_active !== false ? t("Desativar") : t("Ativar")}
                    </button>
                    <button onClick={() => handleDelete(g.id)} className="text-xs text-destructive hover:bg-destructive/10 px-2 py-1 rounded transition-colors">{t("Remover")}</button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {detailGroup && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40" onClick={closeGroupDetail} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-lg bg-card rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto pointer-events-auto"
                onClick={e => e.stopPropagation()}
              >
                <div className="sticky top-0 bg-card border-b border-border/50 px-6 py-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-serif font-bold text-foreground truncate">{detailGroup.name}</h2>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {detailGroup.group_type && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Tag size={12} /> {t(detailGroup.group_type)}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${detailGroup.is_active !== false ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground"}`}>
                        {detailGroup.is_active !== false ? t("Ativo") : t("Inativo")}
                      </span>
                    </div>
                  </div>
                  <button type="button" onClick={closeGroupDetail} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground" aria-label={t("Fechar")}>
                    <X size={18} />
                  </button>
                </div>

                <div className="px-6 py-4 space-y-5">
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{t("Informações")}</h3>
                    <div className="space-y-1.5 text-sm text-foreground">
                      {detailGroup.meeting_day && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock size={14} />
                          <span>{detailGroup.meeting_day}{detailGroup.meeting_time ? ` · ${detailGroup.meeting_time}` : ""}</span>
                        </div>
                      )}
                      {detailGroup.location && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin size={14} />
                          <span>{detailGroup.location}</span>
                        </div>
                      )}
                      {detailGroup.description ? (
                        <p className="text-sm text-muted-foreground pt-1">{detailGroup.description}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">{t("Sem descrição")}</p>
                      )}
                    </div>
                  </section>

                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{t("Liderança")}</h3>
                    <p className="text-sm font-medium text-foreground">
                      {detailLeaderName || t("Líder não definido")}
                    </p>
                  </section>

                  <section>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Participantes")}</h3>
                      <span className="text-xs text-muted-foreground">
                        {t("Total")}: {detailParticipantsLoading ? "…" : detailParticipants.length}
                      </span>
                    </div>
                    {detailParticipantsLoading ? (
                      <p className="text-sm text-muted-foreground">{t("Carregando...")}</p>
                    ) : detailParticipantsError ? (
                      <p className="text-sm text-destructive">{t("Erro ao carregar participantes")}</p>
                    ) : detailParticipants.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">{t("Nenhum participante cadastrado")}</p>
                    ) : (
                      <ul className="space-y-2">
                        {detailParticipants.map(p => (
                          <li key={p.id} className="flex items-center justify-between gap-2 text-sm py-1.5 px-2 rounded-lg bg-secondary/50">
                            <span className="font-medium text-foreground truncate">{p.full_name}</span>
                            <span className="text-xs text-muted-foreground flex-shrink-0">{participantRoleLabel(p.role, t)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <MessageCircle size={16} className="text-muted-foreground" />
                      <h3 className="text-sm font-medium text-foreground">{t("Chat do grupo")}</h3>
                    </div>
                    {chatLoading ? (
                      <p className="text-sm text-muted-foreground">{t("Carregando...")}</p>
                    ) : chatLoadError ? (
                      <p className="text-sm text-destructive">{t("Erro ao carregar mensagens")}</p>
                    ) : chatMessages.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic mb-3">{t("Nenhuma mensagem ainda")}</p>
                    ) : (
                      <ul className="space-y-3 max-h-48 overflow-y-auto mb-3 pr-1">
                        {chatMessages.map(msg => (
                          <li key={msg.id} className="text-sm rounded-lg bg-card border border-border/40 px-3 py-2">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-xs font-medium text-foreground truncate">{msg.authorLabel}</span>
                              <span className="text-[10px] text-muted-foreground flex-shrink-0">
                                {format(new Date(msg.created_at), "dd MMM yyyy HH:mm", { locale: dateLoc })}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{msg.body}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                    {chatSendError && (
                      <p className="text-xs text-destructive mb-2">{chatSendError}</p>
                    )}
                    {user ? (
                      <div className="flex gap-2">
                        <input
                          value={chatInput}
                          onChange={e => setChatInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSendMessage(); } }}
                          placeholder={t("Escreva uma mensagem...")}
                          disabled={chatSending}
                          className="flex-1 px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => void handleSendMessage()}
                          disabled={chatSending || !chatInput.trim()}
                          className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                        >
                          {chatSending ? t("Enviando...") : t("Enviar")}
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">{t("Faça login para enviar mensagens")}</p>
                    )}
                  </section>

                  {canWrite && (
                    <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-border/30">
                      <button type="button" onClick={() => { closeGroupDetail(); openEditForm(detailGroup); }} className="text-xs text-muted-foreground hover:bg-secondary px-3 py-1.5 rounded transition-colors">
                        {t("Editar")}
                      </button>
                      <button type="button" onClick={() => toggleActive(detailGroup)} className="text-xs text-muted-foreground hover:bg-secondary px-3 py-1.5 rounded transition-colors">
                        {detailGroup.is_active !== false ? t("Desativar") : t("Ativar")}
                      </button>
                      <button type="button" onClick={() => handleDelete(detailGroup.id)} className="text-xs text-destructive hover:bg-destructive/10 px-3 py-1.5 rounded transition-colors">
                        {t("Remover")}
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && canWrite && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40" onClick={closeForm} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-md bg-card rounded-2xl p-6 shadow-xl max-h-[85vh] overflow-y-auto">
                <h2 className="text-lg font-serif font-bold mb-4">{editingId ? t("Editar Grupo") : t("Novo Grupo")}</h2>
                <div className="space-y-3">
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t("Nome do grupo")} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t("Tipo")}</label>
                    <div className="flex gap-2 flex-wrap">
                      {groupTypes.map(gt => (
                        <button key={gt} type="button" onClick={() => setForm(f => ({ ...f, group_type: gt }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${form.group_type === gt ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                          {t(gt)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={form.meeting_day} onChange={e => setForm(f => ({ ...f, meeting_day: e.target.value }))} placeholder={t("Dia (ex: Quarta)")} className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
                    <input value={form.meeting_time} onChange={e => setForm(f => ({ ...f, meeting_time: e.target.value }))} placeholder={t("Horário")} className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
                  </div>
                  <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder={t("Local")} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t("Descrição (opcional)")} rows={2} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm resize-none" />
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={closeForm} className="flex-1 py-2 rounded-lg bg-secondary text-sm font-medium">{t("Cancelar")}</button>
                  <button onClick={handleSave} className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
                    {editingId ? t("Salvar Alterações") : t("Criar Grupo")}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}
