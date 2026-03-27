import { AdminLayout } from "@/components/AdminLayout";
import { MessageSquare, Plus, X, Clock, AlertTriangle, Info, Bell } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Announcement = {
  id: string;
  title: string;
  content: string;
  priority: string;
  created_at: string;
  user_id: string;
};

const priorityConfig: Record<string, { icon: any; color: string; label: string }> = {
  Urgente: { icon: AlertTriangle, color: "text-destructive bg-destructive/10", label: "Urgente" },
  Importante: { icon: Bell, color: "text-amber-600 bg-amber-500/10", label: "Importante" },
  Normal: { icon: Info, color: "text-blue-600 bg-blue-500/10", label: "Normal" },
};

export default function Comunicacao() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState("Normal");

  const fetch_ = async () => {
    const { data } = await supabase.from("announcements").select("*").order("created_at", { ascending: false });
    setAnnouncements((data as Announcement[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetch_(); }, []);

  const handleAdd = async () => {
    if (!title.trim() || !content.trim() || !user) return;
    const { error } = await supabase.from("announcements").insert({ user_id: user.id, title: title.trim(), content: content.trim(), priority } as any);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setTitle(""); setContent(""); setPriority("Normal"); setShowForm(false);
    toast({ title: "Comunicado publicado!" });
    fetch_();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("announcements").delete().eq("id", id);
    fetch_();
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif font-bold text-foreground">Comunicação</h1>
            <p className="text-sm text-muted-foreground mt-1">Avisos e comunicados para a comunidade</p>
          </div>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus size={16} /> Novo Comunicado
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando...</div>
        ) : announcements.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare size={48} className="mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">Nenhum comunicado publicado</p>
          </div>
        ) : (
          <div className="space-y-4">
            {announcements.map((ann, i) => {
              const cfg = priorityConfig[ann.priority] || priorityConfig.Normal;
              const Icon = cfg.icon;
              return (
                <motion.div key={ann.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="bg-card rounded-xl p-5 shadow-sm border border-border/50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>
                          <Icon size={12} /> {cfg.label}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock size={12} /> {format(new Date(ann.created_at), "dd MMM yyyy", { locale: ptBR })}
                        </span>
                      </div>
                      <h3 className="font-semibold text-foreground text-lg">{ann.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{ann.content}</p>
                    </div>
                    {ann.user_id === user?.id && (
                      <button onClick={() => handleDelete(ann.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showForm && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40" onClick={() => setShowForm(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed inset-x-4 top-1/2 -translate-y-1/2 sm:inset-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-md bg-card rounded-2xl p-6 shadow-xl z-50">
              <h2 className="text-lg font-serif font-bold mb-4">Novo Comunicado</h2>
              <div className="space-y-3">
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título" className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
                <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Conteúdo do comunicado" rows={4} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm resize-none" />
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Prioridade</label>
                  <div className="flex gap-2">
                    {["Normal", "Importante", "Urgente"].map(p => (
                      <button key={p} onClick={() => setPriority(p)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${priority === p ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-lg bg-secondary text-sm font-medium">Cancelar</button>
                <button onClick={handleAdd} className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">Publicar</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}
