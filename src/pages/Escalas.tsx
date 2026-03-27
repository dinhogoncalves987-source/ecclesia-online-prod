import { AdminLayout } from "@/components/AdminLayout";
import { FileText, Plus, X, Calendar, User, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { format } from "date-fns";
import { ptBR, enUS, es } from "date-fns/locale";

type Schedule = {
  id: string; title: string; schedule_date: string; ministry: string;
  assigned_to: string | null; notes: string | null; status: string; user_id: string;
};

const ministries = ["Louvor", "Infantil", "Mídia", "Recepção", "Intercessão", "Pregação", "Geral"];

export default function Escalas() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, lang } = useLanguage();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", schedule_date: "", ministry: "Geral", assigned_to: "", notes: "" });
  const [filterMinistry, setFilterMinistry] = useState("Todos");

  const dateLoc = lang === "en" ? enUS : lang === "es" ? es : ptBR;

  const fetch_ = async () => {
    const { data } = await supabase.from("schedules").select("*").order("schedule_date", { ascending: true });
    setSchedules((data as Schedule[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetch_(); }, []);

  const handleAdd = async () => {
    if (!form.title.trim() || !form.schedule_date || !user) return;
    const { error } = await supabase.from("schedules").insert({
      user_id: user.id, title: form.title.trim(), schedule_date: form.schedule_date,
      ministry: form.ministry, assigned_to: form.assigned_to || null, notes: form.notes || null,
    } as any);
    if (error) { toast({ title: t("Erro"), description: error.message, variant: "destructive" }); return; }
    setForm({ title: "", schedule_date: "", ministry: "Geral", assigned_to: "", notes: "" });
    setShowForm(false);
    toast({ title: t("Escala criada!") });
    fetch_();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("schedules").delete().eq("id", id);
    fetch_();
  };

  const toggleStatus = async (s: Schedule) => {
    const newStatus = s.status === "Confirmado" ? "Pendente" : "Confirmado";
    await supabase.from("schedules").update({ status: newStatus } as any).eq("id", s.id);
    fetch_();
  };

  const filtered = filterMinistry === "Todos" ? schedules : schedules.filter(s => s.ministry === filterMinistry);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif font-bold text-foreground">{t("Escalas de Serviço")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("Organize as escalas por ministério")}</p>
          </div>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus size={16} /> {t("Nova Escala")}
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {["Todos", ...ministries].map(m => (
            <button key={m} onClick={() => setFilterMinistry(m)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterMinistry === m ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
              {t(m)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">{t("Carregando...")}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <FileText size={48} className="mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">{t("Nenhuma escala encontrada")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((s, i) => (
              <motion.div key={s.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                className="bg-card rounded-xl p-4 shadow-sm border border-border/50 flex items-center gap-4">
                <button onClick={() => toggleStatus(s)} className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${s.status === "Confirmado" ? "bg-green-500/10 text-green-600" : "bg-amber-500/10 text-amber-600"}`}>
                  <CheckCircle size={20} />
                </button>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground">{s.title}</h3>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-1"><Calendar size={12} /> {format(new Date(s.schedule_date + "T12:00:00"), "dd MMM yyyy", { locale: dateLoc })}</span>
                    <span className="px-1.5 py-0.5 rounded bg-secondary">{t(s.ministry)}</span>
                    {s.assigned_to && <span className="flex items-center gap-1"><User size={12} /> {s.assigned_to}</span>}
                  </div>
                  {s.notes && <p className="text-xs text-muted-foreground mt-1">{s.notes}</p>}
                </div>
                {s.user_id === user?.id && (
                  <button onClick={() => handleDelete(s.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
                    <X size={16} />
                  </button>
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
                <h2 className="text-lg font-serif font-bold mb-4">{t("Nova Escala")}</h2>
                <div className="space-y-3">
                  <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder={t("Título (ex: Culto Domingo)")} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
                  <input type="date" value={form.schedule_date} onChange={e => setForm(f => ({ ...f, schedule_date: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t("Ministério")}</label>
                    <div className="flex gap-2 flex-wrap">
                      {ministries.map(m => (
                        <button key={m} onClick={() => setForm(f => ({ ...f, ministry: m }))} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${form.ministry === m ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                          {t(m)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} placeholder={t("Responsável(is)")} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder={t("Observações (opcional)")} rows={2} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm resize-none" />
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-lg bg-secondary text-sm font-medium">{t("Cancelar")}</button>
                  <button onClick={handleAdd} className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">{t("Criar Escala")}</button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}
