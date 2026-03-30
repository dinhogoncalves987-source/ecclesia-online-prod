import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useChurch } from "@/hooks/useChurch";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Navigate } from "react-router-dom";
import {
  Church, Plus, Loader2, MapPin, Phone, Mail, User, Copy,
  Share2, Trash2, Edit, ChevronRight, Building2
} from "lucide-react";

interface Congregation {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  pastor_name: string | null;
  is_matriz: boolean;
  parent_church_id: string | null;
}

export default function Congregacoes() {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useRole();
  const { church, isMatriz } = useChurch();
  const { t } = useLanguage();
  const [congregations, setCongregations] = useState<Congregation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", address: "", city: "", state: "", phone: "", email: "", pastor_name: ""
  });

  useEffect(() => {
    if (!user || roleLoading || !church) return;
    loadCongregations();
  }, [user, roleLoading, church]);

  const loadCongregations = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("churches")
      .select("*")
      .eq("parent_church_id", church!.id);

    if (data) {
      setCongregations(data.map((c) => ({
        id: c.id, name: c.name, slug: c.slug, address: c.address,
        city: c.city, state: c.state, phone: c.phone, email: c.email,
        pastor_name: c.pastor_name, is_matriz: c.is_matriz,
        parent_church_id: c.parent_church_id,
      })));
    }
    setLoading(false);
  };

  const generateSlug = (name: string) =>
    name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: t("Nome é obrigatório"), variant: "destructive" });
      return;
    }

    const slug = generateSlug(form.name) + "-" + Date.now().toString(36);

    if (editingId) {
      const { error } = await supabase
        .from("churches")
        .update({
          name: form.name, address: form.address || null, city: form.city || null,
          state: form.state || null, phone: form.phone || null, email: form.email || null,
          pastor_name: form.pastor_name || null,
        })
        .eq("id", editingId);

      if (error) {
        toast({ title: t("Erro ao atualizar"), description: error.message, variant: "destructive" });
      } else {
        toast({ title: t("Congregação atualizada com sucesso!") });
      }
    } else {
      const { error } = await supabase
        .from("churches")
        .insert({
          name: form.name, slug, parent_church_id: church!.id, is_matriz: false,
          address: form.address || null, city: form.city || null, state: form.state || null,
          phone: form.phone || null, email: form.email || null, pastor_name: form.pastor_name || null,
        });

      if (error) {
        toast({ title: t("Erro ao criar congregação"), description: error.message, variant: "destructive" });
      } else {
        toast({ title: t("Congregação criada com sucesso!") });
      }
    }

    setForm({ name: "", address: "", city: "", state: "", phone: "", email: "", pastor_name: "" });
    setShowForm(false);
    setEditingId(null);
    loadCongregations();
  };

  const handleEdit = (c: Congregation) => {
    setForm({
      name: c.name, address: c.address || "", city: c.city || "",
      state: c.state || "", phone: c.phone || "", email: c.email || "",
      pastor_name: c.pastor_name || "",
    });
    setEditingId(c.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("churches" as any).delete().eq("id", id);
    if (error) {
      toast({ title: t("Erro ao excluir"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("Congregação excluída") });
      loadCongregations();
    }
  };

  const handleShareInvite = (c: Congregation) => {
    const url = `${window.location.origin}/signup?church=${c.slug}`;
    navigator.clipboard.writeText(url);
    toast({ title: t("Link copiado!"), description: t("Compartilhe este link para convidar membros para esta congregação.") });
  };

  if (!roleLoading && !isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif tracking-tight flex items-center gap-2">
              <Building2 size={28} className="text-accent" />
              {t("Congregações")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isMatriz
                ? t("Gerencie as congregações vinculadas à matriz")
                : t("Visualize informações da sua congregação")}
            </p>
          </div>
          {isMatriz && isAdmin && (
            <button
              onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ name: "", address: "", city: "", state: "", phone: "", email: "", pastor_name: "" }); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus size={16} /> {t("Nova Congregação")}
            </button>
          )}
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-card rounded-xl shadow-executive p-5 space-y-4">
            <h2 className="font-medium text-sm">{editingId ? t("Editar Congregação") : t("Nova Congregação")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={t("Nome da congregação *")}
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
              <input value={form.pastor_name} onChange={e => setForm(f => ({ ...f, pastor_name: e.target.value }))}
                placeholder={t("Nome do pastor/líder")}
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
              <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder={t("Endereço")}
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
              <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                placeholder={t("Cidade")}
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
              <input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                placeholder={t("Estado")}
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder={t("Telefone")}
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
              <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder={t("E-mail")}
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                {editingId ? t("Salvar Alterações") : t("Criar Congregação")}
              </button>
              <button onClick={() => { setShowForm(false); setEditingId(null); }}
                className="px-4 py-2 bg-secondary text-foreground rounded-lg text-sm hover:bg-secondary/80 transition-colors">
                {t("Cancelar")}
              </button>
            </div>
          </div>
        )}

        {/* Congregations list */}
        <div className="bg-card rounded-xl shadow-executive overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : congregations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">{t("Nenhuma congregação cadastrada")}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {congregations.map(c => (
                <div key={c.id} className="p-4 hover:bg-secondary/20 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
                      <Church size={20} className="text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{c.name}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                        {c.pastor_name && (
                          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                            <User size={10} /> {c.pastor_name}
                          </span>
                        )}
                        {c.city && (
                          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                            <MapPin size={10} /> {c.city}{c.state ? `, ${c.state}` : ""}
                          </span>
                        )}
                        {c.phone && (
                          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                            <Phone size={10} /> {c.phone}
                          </span>
                        )}
                        {c.email && (
                          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                            <Mail size={10} /> {c.email}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => handleShareInvite(c)}
                        className="p-2 rounded-lg hover:bg-secondary transition-colors" title={t("Copiar link de convite")}>
                        <Share2 size={14} className="text-muted-foreground" />
                      </button>
                      <button onClick={() => handleEdit(c)}
                        className="p-2 rounded-lg hover:bg-secondary transition-colors" title={t("Editar")}>
                        <Edit size={14} className="text-muted-foreground" />
                      </button>
                      <button onClick={() => handleDelete(c.id)}
                        className="p-2 rounded-lg hover:bg-destructive/10 transition-colors" title={t("Excluir")}>
                        <Trash2 size={14} className="text-destructive" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Matriz info card */}
        {church && (
          <div className="bg-card rounded-xl shadow-executive p-5">
            <h2 className="font-medium text-sm mb-3 flex items-center gap-2">
              <Church size={16} className="text-accent" />
              {t("Informações da Matriz")}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{t("Nome")}</p>
                <p className="font-medium">{church.name}</p>
              </div>
              {church.pastor_name && (
                <div>
                  <p className="text-xs text-muted-foreground">{t("Pastor")}</p>
                  <p className="font-medium">{church.pastor_name}</p>
                </div>
              )}
              {church.city && (
                <div>
                  <p className="text-xs text-muted-foreground">{t("Cidade")}</p>
                  <p className="font-medium">{church.city}{church.state ? `, ${church.state}` : ""}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">{t("Total de Congregações")}</p>
                <p className="font-medium">{congregations.length}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
