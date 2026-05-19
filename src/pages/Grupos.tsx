import { AdminLayout } from "@/components/AdminLayout";
import { UsersRound, Plus, X, MapPin, Clock, Tag } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";

type SmallGroup = {
  id: string; name: string; group_type: string | null; meeting_day: string | null;
  meeting_time: string | null; location: string | null; description: string | null;
  is_active: boolean | null; created_by: string | null;
};

const groupTypes = ["Estudo Bíblico", "Jovens", "Casais", "Mulheres", "Homens", "Missões", "Geral"];

export default function Grupos() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();
  const { church, loading: churchLoading } = useChurch();
  const [groups, setGroups] = useState<SmallGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", group_type: "Estudo Bíblico", meeting_day: "", meeting_time: "", location: "", description: "" });


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

  const handleAdd = async () => {
    if (!form.name.trim() || !user || !church) return;
    const { error } = await supabase.from("groups").insert({
      created_by: user.id, organization_id: church.id, name: form.name.trim(),
      group_type: form.group_type || "Geral",
      meeting_day: form.meeting_day || null, meeting_time: form.meeting_time || null,
      location: form.location || null, description: form.description || null,
      is_active: true,
    } as any);
    if (error) { toast({ title: t("Erro"), description: error.message, variant: "destructive" }); return; }
    setForm({ name: "", group_type: "Estudo Bíblico", meeting_day: "", meeting_time: "", location: "", description: "" });
    setShowForm(false);
    toast({ title: t("Grupo criado!") });
    fetch_();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("groups").delete().eq("id", id);
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
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <UsersRound size={32} className="text-primary/60" />
            </div>
            <h3 className="font-serif text-lg font-semibold text-foreground mb-1">{t("Nenhum grupo cadastrado")}</h3>
            <p className="text-sm text-muted-foreground max-w-xs mb-5">{t("Crie grupos de comunhão, estudo bíblico ou ministérios para organizar sua comunidade.")}</p>
            <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
              <Plus size={16} /> {t("Criar Primeiro Grupo")}
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g, i) => (
              <motion.div key={g.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="bg-card rounded-xl p-5 shadow-sm border border-border/50">
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
                {g.created_by === user?.id && (
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
