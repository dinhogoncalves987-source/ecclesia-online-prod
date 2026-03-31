import { AdminLayout } from "@/components/AdminLayout";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import {
  Shield, Building2, Users, Globe, Bell, Plus, Trash2, Loader2,
  ChevronDown, ChevronUp, Eye, EyeOff
} from "lucide-react";
import { toast } from "sonner";

interface ChurchSummary {
  id: string;
  name: string;
  slug: string;
  is_matriz: boolean;
  city: string | null;
  pastor_name: string | null;
  memberCount: number;
}

interface PlatformNotice {
  id: string;
  title: string;
  content: string;
  priority: string;
  is_active: boolean;
  created_at: string;
}

export default function SuperAdmin() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { role } = useRole();
  const [churches, setChurches] = useState<ChurchSummary[]>([]);
  const [notices, setNotices] = useState<PlatformNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalUsers, setTotalUsers] = useState(0);
  const [expandedChurch, setExpandedChurch] = useState<string | null>(null);

  // Notice form
  const [showNoticeForm, setShowNoticeForm] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeContent, setNoticeContent] = useState("");
  const [noticePriority, setNoticePriority] = useState("Normal");

  const { loading: roleLoading } = useRole();

  useEffect(() => {
    if (roleLoading) return;
    if (role !== "superadmin") { setLoading(false); return; }
    loadData();
  }, [role, roleLoading]);

  const loadData = async () => {
    setLoading(true);

    // Load all churches
    const { data: allChurches } = await supabase.from("churches").select("*");

    // Load member counts per church
    const churchSummaries: ChurchSummary[] = [];
    if (allChurches) {
      for (const c of allChurches) {
        const { count } = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("church_id", c.id);
        churchSummaries.push({
          id: c.id,
          name: c.name,
          slug: c.slug,
          is_matriz: c.is_matriz,
          city: c.city,
          pastor_name: c.pastor_name,
          memberCount: count || 0,
        });
      }
    }
    setChurches(churchSummaries);

    // Total users
    const { count: usersCount } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true });
    setTotalUsers(usersCount || 0);

    // Load platform notices
    const { data: noticesData } = await supabase
      .from("platform_notices")
      .select("*")
      .order("created_at", { ascending: false });
    setNotices((noticesData as PlatformNotice[]) || []);

    setLoading(false);
  };

  const createNotice = async () => {
    if (!noticeTitle.trim() || !noticeContent.trim() || !user) return;
    const { error } = await supabase.from("platform_notices").insert({
      user_id: user.id,
      title: noticeTitle.trim(),
      content: noticeContent.trim(),
      priority: noticePriority,
    });
    if (error) {
      toast.error(t("Erro ao criar aviso"));
      return;
    }
    toast.success(t("Aviso criado com sucesso"));
    setNoticeTitle("");
    setNoticeContent("");
    setShowNoticeForm(false);
    loadData();
  };

  const toggleNotice = async (id: string, currentActive: boolean) => {
    await supabase.from("platform_notices").update({ is_active: !currentActive }).eq("id", id);
    loadData();
  };

  const deleteNotice = async (id: string) => {
    await supabase.from("platform_notices").delete().eq("id", id);
    toast.success(t("Aviso removido"));
    loadData();
  };

  if (role !== "superadmin") {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">{t("Acesso negado")}</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 bg-accent/10 rounded-xl">
              <Shield size={24} className="text-accent" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-serif tracking-tight">{t("Painel da Plataforma")}</h1>
              <p className="text-sm text-muted-foreground">{t("Gestão global — visível apenas para você")}</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: t("Total de Igrejas"), value: churches.length.toString(), icon: Building2, color: "text-blue-600 bg-blue-500/10" },
                { label: t("Usuários na Plataforma"), value: totalUsers.toString(), icon: Users, color: "text-emerald-600 bg-emerald-500/10" },
                { label: t("Avisos Ativos"), value: notices.filter(n => n.is_active).length.toString(), icon: Bell, color: "text-amber-600 bg-amber-500/10" },
              ].map((item, i) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-card rounded-xl p-5 shadow-sm border border-border/50"
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${item.color} mb-3`}>
                    <item.icon size={20} />
                  </div>
                  <p className="text-2xl font-bold">{item.value}</p>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </motion.div>
              ))}
            </div>

            {/* Churches list */}
            <div className="bg-card rounded-xl shadow-sm border border-border/50">
              <div className="p-5 border-b border-border/50">
                <h2 className="font-serif text-lg flex items-center gap-2">
                  <Globe size={18} className="text-accent" />
                  {t("Todas as Igrejas")}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("Dados agregados — sem acesso a dados individuais")}
                </p>
              </div>
              <div className="divide-y divide-border/30">
                {churches.map((c) => (
                  <div key={c.id} className="p-4">
                    <button
                      onClick={() => setExpandedChurch(expandedChurch === c.id ? null : c.id)}
                      className="w-full flex items-center justify-between"
                    >
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{c.name}</span>
                          {c.is_matriz && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/20 text-accent font-semibold">
                              {t("Matriz")}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {c.city || t("Sem cidade")} · {c.memberCount} {t("usuários")}
                        </p>
                      </div>
                      {expandedChurch === c.id ? (
                        <ChevronUp size={16} className="text-muted-foreground" />
                      ) : (
                        <ChevronDown size={16} className="text-muted-foreground" />
                      )}
                    </button>
                    {expandedChurch === c.id && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="mt-3 grid grid-cols-2 gap-2 text-sm"
                      >
                        <div className="bg-secondary/30 rounded-lg p-3">
                          <p className="text-[10px] text-muted-foreground">{t("Pastor")}</p>
                          <p className="font-medium">{c.pastor_name || "—"}</p>
                        </div>
                        <div className="bg-secondary/30 rounded-lg p-3">
                          <p className="text-[10px] text-muted-foreground">Slug</p>
                          <p className="font-medium font-mono text-xs">{c.slug}</p>
                        </div>
                      </motion.div>
                    )}
                  </div>
                ))}
                {churches.length === 0 && (
                  <p className="p-5 text-sm text-muted-foreground text-center">{t("Nenhuma igreja cadastrada")}</p>
                )}
              </div>
            </div>

            {/* Platform notices */}
            <div className="bg-card rounded-xl shadow-sm border border-border/50">
              <div className="p-5 border-b border-border/50 flex items-center justify-between">
                <h2 className="font-serif text-lg flex items-center gap-2">
                  <Bell size={18} className="text-accent" />
                  {t("Avisos da Plataforma")}
                </h2>
                <button
                  onClick={() => setShowNoticeForm(!showNoticeForm)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90"
                >
                  <Plus size={14} /> {t("Novo Aviso")}
                </button>
              </div>

              {showNoticeForm && (
                <div className="p-5 border-b border-border/50 space-y-3">
                  <input
                    type="text"
                    placeholder={t("Título do aviso")}
                    value={noticeTitle}
                    onChange={(e) => setNoticeTitle(e.target.value)}
                    className="w-full bg-secondary/50 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 ring-accent/30"
                  />
                  <textarea
                    placeholder={t("Conteúdo do aviso")}
                    value={noticeContent}
                    onChange={(e) => setNoticeContent(e.target.value)}
                    rows={3}
                    className="w-full bg-secondary/50 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 ring-accent/30 resize-none"
                  />
                  <div className="flex items-center gap-3">
                    <select
                      value={noticePriority}
                      onChange={(e) => setNoticePriority(e.target.value)}
                      className="bg-secondary/50 rounded-lg px-3 py-2 text-sm outline-none"
                    >
                      <option value="Normal">Normal</option>
                      <option value="Urgente">{t("Urgente")}</option>
                    </select>
                    <button
                      onClick={createNotice}
                      className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90"
                    >
                      {t("Publicar")}
                    </button>
                  </div>
                </div>
              )}

              <div className="divide-y divide-border/30">
                {notices.map((n) => (
                  <div key={n.id} className="p-4 flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{n.title}</span>
                        {n.priority === "Urgente" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-600 font-semibold">
                            {t("Urgente")}
                          </span>
                        )}
                        {!n.is_active && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">
                            {t("Inativo")}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{n.content}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {new Date(n.created_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => toggleNotice(n.id, n.is_active)}
                        className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                        title={n.is_active ? t("Desativar") : t("Ativar")}
                      >
                        {n.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <button
                        onClick={() => deleteNotice(n.id)}
                        className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-destructive"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {notices.length === 0 && (
                  <p className="p-5 text-sm text-muted-foreground text-center">{t("Nenhum aviso criado")}</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
