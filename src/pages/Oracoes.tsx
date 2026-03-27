import { AdminLayout } from "@/components/AdminLayout";
import { Heart, Plus, X, User, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type PrayerRequest = {
  id: string;
  title: string;
  description: string | null;
  is_anonymous: boolean;
  status: string;
  praying_count: number;
  created_at: string;
  user_id: string;
};

export default function Oracoes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [requests, setRequests] = useState<PrayerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [filter, setFilter] = useState<"Todos" | "Ativo" | "Respondido">("Todos");

  const fetchRequests = async () => {
    const query = supabase.from("prayer_requests").select("*").order("created_at", { ascending: false });
    const { data } = await query;
    setRequests((data as PrayerRequest[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchRequests(); }, []);

  const handleAdd = async () => {
    if (!title.trim() || !user) return;
    const { error } = await supabase.from("prayer_requests").insert({
      user_id: user.id, title: title.trim(), description: description.trim() || null, is_anonymous: isAnonymous,
    } as any);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setTitle(""); setDescription(""); setIsAnonymous(false); setShowForm(false);
    toast({ title: "Pedido registrado!" });
    fetchRequests();
  };

  const handlePray = async (req: PrayerRequest) => {
    await supabase.from("prayer_requests").update({ praying_count: req.praying_count + 1 } as any).eq("id", req.id);
    fetchRequests();
  };

  const handleMarkAnswered = async (id: string) => {
    await supabase.from("prayer_requests").update({ status: "Respondido" } as any).eq("id", id);
    fetchRequests();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("prayer_requests").delete().eq("id", id);
    fetchRequests();
  };

  const filtered = filter === "Todos" ? requests : requests.filter(r => r.status === filter);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif font-bold text-foreground">{t("Pedidos de Oração")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("Compartilhe e interceda pelos pedidos da comunidade")}</p>
          </div>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus size={16} /> {t("Novo Pedido")}
          </button>
        </div>

        <div className="flex gap-2">
          {(["Todos", "Ativo", "Respondido"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
              {t(f)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">{t("Carregando...")}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Heart size={48} className="mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">{t("Nenhum pedido de oração encontrado")}</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((req, i) => (
              <motion.div key={req.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="bg-card rounded-xl p-5 shadow-sm border border-border/50 flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{req.title}</h3>
                    {req.description && <p className="text-sm text-muted-foreground mt-1">{req.description}</p>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${req.status === "Respondido" ? "bg-green-500/10 text-green-600" : "bg-accent/10 text-accent"}`}>
                    {req.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><User size={12} />{req.is_anonymous ? t("Anônimo") : t("Membro")}</span>
                  <span className="flex items-center gap-1"><Clock size={12} />{format(new Date(req.created_at), "dd MMM", { locale: ptBR })}</span>
                  <span className="flex items-center gap-1"><Heart size={12} />{req.praying_count} {t("orando")}</span>
                </div>
                {/* AMÉM Button */}
                <button onClick={() => handlePray(req)}
                  className="w-full py-3 rounded-xl bg-accent/10 text-accent hover:bg-accent/20 transition-colors font-bold text-lg tracking-wide mt-1">
                  {t("AMÉM")}
                </button>
                <div className="flex gap-2 mt-auto pt-2 border-t border-border/30">
                  <button onClick={() => handlePray(req)} className="flex-1 text-xs py-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors font-medium">
                    {t("Estou orando")}
                  </button>
                  {req.user_id === user?.id && (
                    <>
                      {req.status !== "Respondido" && (
                        <button onClick={() => handleMarkAnswered(req.id)} className="text-xs py-1.5 px-2 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-500/20 transition-colors">✓</button>
                      )}
                      <button onClick={() => handleDelete(req.id)} className="text-xs py-1.5 px-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">
                        <X size={14} />
                      </button>
                    </>
                  )}
                </div>
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
                <h2 className="text-lg font-serif font-bold mb-4">{t("Novo Pedido de Oração")}</h2>
                <div className="space-y-3">
                  <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("Título do pedido")} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
                  <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={t("Descrição (opcional)")} rows={3} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm resize-none" />
                  <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                    <input type="checkbox" checked={isAnonymous} onChange={e => setIsAnonymous(e.target.checked)} className="rounded" />
                    {t("Enviar de forma anônima")}
                  </label>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-lg bg-secondary text-sm font-medium">{t("Cancelar")}</button>
                  <button onClick={handleAdd} className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">{t("Enviar Pedido")}</button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}
