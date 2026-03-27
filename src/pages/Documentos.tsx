import { AdminLayout } from "@/components/AdminLayout";
import { Archive, Plus, X, FileText, Download, FolderOpen } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Document = {
  id: string;
  title: string;
  category: string;
  description: string | null;
  file_url: string | null;
  file_type: string | null;
  created_at: string;
  user_id: string;
};

const categories = ["Geral", "Atas", "Estatuto", "Financeiro", "Eventos", "Ministerial"];

export default function Documentos() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Geral");
  const [filterCat, setFilterCat] = useState("Todos");

  const fetch_ = async () => {
    const { data } = await supabase.from("documents").select("*").order("created_at", { ascending: false });
    setDocs((data as Document[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetch_(); }, []);

  const handleAdd = async () => {
    if (!title.trim() || !user) return;
    const { error } = await supabase.from("documents").insert({
      user_id: user.id, title: title.trim(), category, description: description.trim() || null,
    } as any);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setTitle(""); setDescription(""); setCategory("Geral"); setShowForm(false);
    toast({ title: "Documento registrado!" });
    fetch_();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("documents").delete().eq("id", id);
    fetch_();
  };

  const filtered = filterCat === "Todos" ? docs : docs.filter(d => d.category === filterCat);
  const uniqueCats = ["Todos", ...new Set(docs.map(d => d.category))];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif font-bold text-foreground">Documentos</h1>
            <p className="text-sm text-muted-foreground mt-1">Biblioteca de documentos da igreja</p>
          </div>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus size={16} /> Novo Documento
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {uniqueCats.map(c => (
            <button key={c} onClick={() => setFilterCat(c)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterCat === c ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
              {c}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <FolderOpen size={48} className="mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">Nenhum documento encontrado</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((doc, i) => (
              <motion.div key={doc.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                className="bg-card rounded-xl p-4 shadow-sm border border-border/50 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <FileText size={20} className="text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground truncate">{doc.title}</h3>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span className="px-1.5 py-0.5 rounded bg-secondary">{doc.category}</span>
                    <span>{format(new Date(doc.created_at), "dd MMM yyyy", { locale: ptBR })}</span>
                  </div>
                  {doc.description && <p className="text-xs text-muted-foreground mt-1 truncate">{doc.description}</p>}
                </div>
                {doc.user_id === user?.id && (
                  <button onClick={() => handleDelete(doc.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
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
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed inset-x-4 top-1/2 -translate-y-1/2 sm:inset-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-md bg-card rounded-2xl p-6 shadow-xl z-50">
              <h2 className="text-lg font-serif font-bold mb-4">Novo Documento</h2>
              <div className="space-y-3">
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título do documento" className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
                <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição (opcional)" rows={2} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm resize-none" />
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Categoria</label>
                  <div className="flex gap-2 flex-wrap">
                    {categories.map(c => (
                      <button key={c} onClick={() => setCategory(c)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${category === c ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-lg bg-secondary text-sm font-medium">Cancelar</button>
                <button onClick={handleAdd} className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">Salvar</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}
