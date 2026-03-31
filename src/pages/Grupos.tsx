import { AdminLayout } from "@/components/AdminLayout";
import { UsersRound, Plus, X, MapPin, Clock, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurch";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";

type SmallGroup = {
  id: string; name: string; leader: string; meeting_day: string | null;
  meeting_time: string | null; location: string | null; description: string | null;
  max_members: number; current_members: number; status: string; user_id: string;
};

export default function Grupos() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();
  const { church, loading: churchLoading } = useChurch();
  const [groups, setGroups] = useState<SmallGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", leader: "", meeting_day: "", meeting_time: "", location: "", description: "", max_members: "12" });


  const fetch_ = async () => {
    if (!church) return;
    const { data } = await supabase.from("small_groups").select("*").eq("church_id", church.id).order("created_at", { ascending: false });
    setGroups((data as SmallGroup[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (churchLoading) return;
    if (!church) { setLoading(false); return; }
    fetch_();
  }, [church, churchLoading]);

  const handleAdd = async () => {
    if (!form.name.trim() || !form.leader.trim() || !user || !church) return;
    const { error } = await supabase.from("small_groups").insert({
      user_id: user.id, church_id: church.id, name: form.name.trim(), leader: form.leader.trim(),
      meeting_day: form.meeting_day || null, meeting_time: form.meeting_time || null,
      location: form.location || null, description: form.description || null,
      max_members: parseInt(form.max_members) || 12,
    } as any);
    if (error) { toast({ title: t("Erro"), description: error.message, variant: "destructive" }); return; }
    setForm({ name: "", leader: "", meeting_day: "", meeting_time: "", location: "", description: "", max_members: "12" });
    setShowForm(false);
    toast({ title: t("Grupo criado!") });
    fetch_();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("small_groups").delete().eq("id", id);
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
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus size={16} /> {t("Novo Grupo")}
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">{t("Carregando...")}</div>
        ) : groups.length === 0 ? (
          <div className="text-center py-12">
            <UsersRound size={48} className="mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">{t("Nenhum grupo cadastrado")}</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g, i) => (
              <motion.div key={g.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="bg-card rounded-xl p-5 shadow-sm border border-border/50">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-foreground">{g.name}</h3>
                    {g.description && <p className="text-xs text-muted-foreground mt-0.5">{g.description}</p>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${g.status === "Ativo" ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground"}`}>
                    {t(g.status)}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5"><User size={12} /> {t("Líder")}: {g.leader}</div>
                  {g.meeting_day && <div className="flex items-center gap-1.5"><Clock size={12} /> {g.meeting_day} {g.meeting_time && `às ${g.meeting_time}`}</div>}
                  {g.location && <div className="flex items-center gap-1.5"><MapPin size={12} /> {g.location}</div>}
                  <div className="flex items-center gap-1.5"><UsersRound size={12} /> {g.current_members}/{g.max_members} {t("membros")}</div>
                </div>
                {g.user_id === user?.id && (
                  <div className="mt-3 pt-2 border-t border-border/30 flex justify-end">
                    <button onClick={() => handleDelete(g.id)} className="text-xs text-destructive hover:bg-destructive/10 px-2 py-1 rounded transition-colors">{t("Remover")}</button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showForm && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40" onClick={() => setShowForm(false)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-md bg-card rounded-2xl p-6 shadow-xl max-h-[85vh] overflow-y-auto">
                <h2 className="text-lg font-serif font-bold mb-4">{t("Novo Grupo")}</h2>
                <div className="space-y-3">
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t("Nome do grupo")} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
                  <input value={form.leader} onChange={e => setForm(f => ({ ...f, leader: e.target.value }))} placeholder={t("Nome do líder")} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={form.meeting_day} onChange={e => setForm(f => ({ ...f, meeting_day: e.target.value }))} placeholder={t("Dia (ex: Quarta)")} className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
                    <input value={form.meeting_time} onChange={e => setForm(f => ({ ...f, meeting_time: e.target.value }))} placeholder={t("Horário")} className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
                  </div>
                  <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder={t("Local")} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t("Descrição (opcional)")} rows={2} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm resize-none" />
                  <input type="number" value={form.max_members} onChange={e => setForm(f => ({ ...f, max_members: e.target.value }))} placeholder={t("Máx. membros")} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-lg bg-secondary text-sm font-medium">{t("Cancelar")}</button>
                  <button onClick={handleAdd} className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">{t("Criar Grupo")}</button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}