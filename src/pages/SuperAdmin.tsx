import { AdminLayout } from "@/components/AdminLayout";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import {
  Shield, Building2, Users, Globe, Bell, Plus, Trash2, Loader2,
  ChevronDown, ChevronUp, Eye, EyeOff, Copy, Link2, UserPlus,
  Crown, Church, MapPin, Share2
} from "lucide-react";
import { toast } from "sonner";

interface ChurchSummary {
  id: string;
  name: string;
  slug: string;
  is_matriz: boolean;
  hierarchy_level: string;
  city: string | null;
  state: string | null;
  pastor_name: string | null;
  parent_church_id: string | null;
  memberCount: number;
  children: ChurchSummary[];
}

interface PlatformNotice {
  id: string;
  title: string;
  content: string;
  priority: string;
  is_active: boolean;
  created_at: string;
}

interface TeamMember {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  role_id: string;
}

type TabKey = "overview" | "churches" | "team" | "notices";

export default function SuperAdmin() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { role, loading: roleLoading } = useRole();
  const [churches, setChurches] = useState<ChurchSummary[]>([]);
  const [flatChurches, setFlatChurches] = useState<ChurchSummary[]>([]);
  const [notices, setNotices] = useState<PlatformNotice[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalUsers, setTotalUsers] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [expandedChurch, setExpandedChurch] = useState<string | null>(null);

  // Church form
  const [showChurchForm, setShowChurchForm] = useState(false);
  const [churchForm, setChurchForm] = useState({
    name: "", city: "", state: "", pastor_name: "", email: "", phone: "", address: "",
    hierarchy_level: "matriz" as string, parent_church_id: "",
  });

  // Notice form
  const [showNoticeForm, setShowNoticeForm] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeContent, setNoticeContent] = useState("");
  const [noticePriority, setNoticePriority] = useState("Normal");

  // Team form
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [teamUserSearch, setTeamUserSearch] = useState("");
  const [searchResults, setSearchResults] = useState<{ user_id: string; full_name: string | null }[]>([]);

  useEffect(() => {
    if (roleLoading) return;
    if (role !== "superadmin") { setLoading(false); return; }
    loadData();
  }, [role, roleLoading]);

  const loadData = async () => {
    setLoading(true);

    const [churchesRes, usersCountRes, noticesRes, rolesRes] = await Promise.all([
      supabase.from("churches").select("*"),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("platform_notices").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles" as any).select("id, user_id, role").eq("role", "superadmin"),
    ]);

    const allChurches = churchesRes.data || [];
    const profileCounts: Record<string, number> = {};

    // Batch count profiles per church
    if (allChurches.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("church_id");
      if (profiles) {
        for (const p of profiles) {
          if (p.church_id) profileCounts[p.church_id] = (profileCounts[p.church_id] || 0) + 1;
        }
      }
    }

    const flat: ChurchSummary[] = allChurches.map(c => ({
      id: c.id, name: c.name, slug: c.slug, is_matriz: c.is_matriz,
      city: c.city, state: c.state, pastor_name: c.pastor_name,
      parent_church_id: c.parent_church_id,
      memberCount: profileCounts[c.id] || 0, children: [],
    }));
    setFlatChurches(flat);

    // Build tree
    const tree = buildTree(flat);
    setChurches(tree);

    setTotalUsers(usersCountRes.count || 0);
    setNotices((noticesRes.data as PlatformNotice[]) || []);

    // Load team (superadmins)
    const saRoles = (rolesRes.data as any[]) || [];
    if (saRoles.length > 0) {
      const userIds = saRoles.map(r => r.user_id);
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", userIds);
      setTeamMembers((profiles || []).map(p => ({
        ...p, role_id: saRoles.find(r => r.user_id === p.user_id)?.id || "",
      })));
    }

    setLoading(false);
  };

  const buildTree = (flat: ChurchSummary[]): ChurchSummary[] => {
    const map = new Map<string, ChurchSummary>();
    flat.forEach(c => map.set(c.id, { ...c, children: [] }));
    const roots: ChurchSummary[] = [];
    map.forEach(c => {
      if (c.parent_church_id && map.has(c.parent_church_id)) {
        map.get(c.parent_church_id)!.children.push(c);
      } else {
        roots.push(c);
      }
    });
    return roots;
  };

  const generateSlug = (name: string) =>
    name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now().toString(36);

  const handleCreateChurch = async () => {
    if (!churchForm.name.trim()) { toast.error(t("Nome é obrigatório")); return; }
    const slug = generateSlug(churchForm.name);
    const { error } = await supabase.from("churches").insert({
      name: churchForm.name.trim(), slug,
      is_matriz: churchForm.is_matriz,
      parent_church_id: churchForm.parent_church_id || null,
      city: churchForm.city || null, state: churchForm.state || null,
      pastor_name: churchForm.pastor_name || null, email: churchForm.email || null,
      phone: churchForm.phone || null, address: churchForm.address || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(t("Igreja criada com sucesso!"));
    setChurchForm({ name: "", city: "", state: "", pastor_name: "", email: "", phone: "", address: "", is_matriz: true, parent_church_id: "" });
    setShowChurchForm(false);
    loadData();
  };

  const handleDeleteChurch = async (id: string) => {
    const { error } = await supabase.from("churches").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("Igreja removida"));
    loadData();
  };

  const handleCopyInvite = (slug: string, name: string) => {
    const url = `${window.location.origin}/signup?church=${slug}`;
    navigator.clipboard.writeText(url);
    toast.success(`${t("Link copiado para")} ${name}`);
  };

  const createNotice = async () => {
    if (!noticeTitle.trim() || !noticeContent.trim() || !user) return;
    const { error } = await supabase.from("platform_notices").insert({
      user_id: user.id, title: noticeTitle.trim(), content: noticeContent.trim(), priority: noticePriority,
    });
    if (error) { toast.error(t("Erro ao criar aviso")); return; }
    toast.success(t("Aviso criado com sucesso"));
    setNoticeTitle(""); setNoticeContent(""); setShowNoticeForm(false);
    loadData();
  };

  const toggleNotice = async (id: string, active: boolean) => {
    await supabase.from("platform_notices").update({ is_active: !active }).eq("id", id);
    loadData();
  };

  const deleteNotice = async (id: string) => {
    await supabase.from("platform_notices").delete().eq("id", id);
    toast.success(t("Aviso removido"));
    loadData();
  };

  const searchUsersForTeam = async (query: string) => {
    setTeamUserSearch(query);
    if (query.length < 2) { setSearchResults([]); return; }
    const { data } = await supabase.from("profiles").select("user_id, full_name").ilike("full_name", `%${query}%`).limit(5);
    const existingIds = teamMembers.map(m => m.user_id);
    setSearchResults((data || []).filter(p => !existingIds.includes(p.user_id)));
  };

  const promoteToSuperAdmin = async (userId: string) => {
    // Update role to superadmin
    const { error: roleError } = await supabase.from("user_roles" as any).update({ role: "superadmin" } as any).eq("user_id", userId);
    if (roleError) { toast.error(roleError.message); return; }
    // Add to super_admins table
    await supabase.from("super_admins").insert({ user_id: userId } as any);
    toast.success(t("Membro promovido a Super Admin!"));
    setTeamUserSearch(""); setSearchResults([]); setShowTeamForm(false);
    loadData();
  };

  const removeSuperAdmin = async (userId: string) => {
    if (userId === user?.id) { toast.error(t("Você não pode remover a si mesmo")); return; }
    await supabase.from("user_roles" as any).update({ role: "membro" } as any).eq("user_id", userId);
    await supabase.from("super_admins").delete().eq("user_id", userId);
    toast.success(t("Super Admin removido da equipe"));
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

  const tabs: { key: TabKey; label: string; icon: typeof Shield }[] = [
    { key: "overview", label: t("Visão Geral"), icon: Shield },
    { key: "churches", label: t("Igrejas"), icon: Building2 },
    { key: "team", label: t("Equipe"), icon: Users },
    { key: "notices", label: t("Avisos"), icon: Bell },
  ];

  const matrizChurches = flatChurches.filter(c => c.is_matriz);

  const renderChurchTree = (items: ChurchSummary[], level = 0) => (
    items.map(c => (
      <div key={c.id}>
        <div className={`flex items-center justify-between p-3 hover:bg-secondary/20 transition-colors ${level > 0 ? "border-l-2 border-accent/20" : ""}`}
          style={{ paddingLeft: `${16 + level * 24}px` }}>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${c.is_matriz ? "bg-accent/20" : "bg-secondary"}`}>
              <Church size={16} className={c.is_matriz ? "text-accent" : "text-muted-foreground"} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{c.name}</span>
                {c.is_matriz && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/20 text-accent font-semibold shrink-0">
                    {t("Matriz")}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {c.city || t("Sem cidade")}{c.state ? `, ${c.state}` : ""} · {c.memberCount} {t("usuários")} · {c.pastor_name || t("Sem pastor")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => handleCopyInvite(c.slug, c.name)}
              className="p-1.5 rounded-lg hover:bg-secondary transition-colors" title={t("Copiar link de convite")}>
              <Link2 size={14} className="text-muted-foreground" />
            </button>
            <button onClick={() => handleDeleteChurch(c.id)}
              className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors">
              <Trash2 size={14} className="text-destructive" />
            </button>
          </div>
        </div>
        {c.children.length > 0 && renderChurchTree(c.children, level + 1)}
      </div>
    ))
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-accent/10 rounded-xl">
            <Shield size={24} className="text-accent" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif tracking-tight">{t("Painel da Plataforma")}</h1>
            <p className="text-sm text-muted-foreground">{t("Gestão global — visível apenas para sua equipe")}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-secondary/30 rounded-lg p-1">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all flex-1 justify-center ${activeTab === tab.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <tab.icon size={14} /> <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* OVERVIEW TAB */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: t("Igrejas Matriz"), value: matrizChurches.length, icon: Building2, color: "text-blue-600 bg-blue-500/10" },
                    { label: t("Total de Igrejas"), value: flatChurches.length, icon: Globe, color: "text-purple-600 bg-purple-500/10" },
                    { label: t("Usuários"), value: totalUsers, icon: Users, color: "text-emerald-600 bg-emerald-500/10" },
                    { label: t("Equipe SA"), value: teamMembers.length, icon: Crown, color: "text-amber-600 bg-amber-500/10" },
                  ].map((item, i) => (
                    <motion.div key={item.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                      className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${item.color} mb-2`}>
                        <item.icon size={18} />
                      </div>
                      <p className="text-xl font-bold">{item.value}</p>
                      <p className="text-[10px] text-muted-foreground">{item.label}</p>
                    </motion.div>
                  ))}
                </div>

                {/* Quick actions */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button onClick={() => { setActiveTab("churches"); setShowChurchForm(true); }}
                    className="flex items-center gap-3 p-4 bg-card rounded-xl border border-border/50 hover:border-accent/30 transition-colors text-left">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                      <Plus size={20} className="text-accent" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{t("Criar Nova Igreja")}</p>
                      <p className="text-xs text-muted-foreground">{t("Matriz ou congregação")}</p>
                    </div>
                  </button>
                  <button onClick={() => { setActiveTab("team"); setShowTeamForm(true); }}
                    className="flex items-center gap-3 p-4 bg-card rounded-xl border border-border/50 hover:border-accent/30 transition-colors text-left">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                      <UserPlus size={20} className="text-accent" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{t("Adicionar à Equipe")}</p>
                      <p className="text-xs text-muted-foreground">{t("Promover Super Admin")}</p>
                    </div>
                  </button>
                  <button onClick={() => { setActiveTab("notices"); setShowNoticeForm(true); }}
                    className="flex items-center gap-3 p-4 bg-card rounded-xl border border-border/50 hover:border-accent/30 transition-colors text-left">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                      <Bell size={20} className="text-accent" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{t("Enviar Aviso")}</p>
                      <p className="text-xs text-muted-foreground">{t("Para todas as igrejas")}</p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* CHURCHES TAB */}
            {activeTab === "churches" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-serif text-lg">{t("Todas as Igrejas")}</h2>
                  <button onClick={() => setShowChurchForm(!showChurchForm)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90">
                    <Plus size={14} /> {t("Nova Igreja")}
                  </button>
                </div>

                {showChurchForm && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    className="bg-card rounded-xl shadow-sm border border-border/50 p-5 space-y-4">
                    <h3 className="text-sm font-medium">{t("Criar Nova Igreja")}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input value={churchForm.name} onChange={e => setChurchForm(f => ({ ...f, name: e.target.value }))}
                        placeholder={t("Nome da igreja *")}
                        className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                      <input value={churchForm.pastor_name} onChange={e => setChurchForm(f => ({ ...f, pastor_name: e.target.value }))}
                        placeholder={t("Nome do pastor")}
                        className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                      <input value={churchForm.city} onChange={e => setChurchForm(f => ({ ...f, city: e.target.value }))}
                        placeholder={t("Cidade")}
                        className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                      <input value={churchForm.state} onChange={e => setChurchForm(f => ({ ...f, state: e.target.value }))}
                        placeholder={t("Estado / País")}
                        className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                      <input value={churchForm.email} onChange={e => setChurchForm(f => ({ ...f, email: e.target.value }))}
                        placeholder={t("E-mail")}
                        className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                      <input value={churchForm.phone} onChange={e => setChurchForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder={t("Telefone")}
                        className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                      <input value={churchForm.address} onChange={e => setChurchForm(f => ({ ...f, address: e.target.value }))}
                        placeholder={t("Endereço")} className="sm:col-span-2 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={churchForm.is_matriz}
                          onChange={e => setChurchForm(f => ({ ...f, is_matriz: e.target.checked, parent_church_id: e.target.checked ? "" : f.parent_church_id }))}
                          className="rounded border-border" />
                        {t("É uma igreja Matriz (sede)")}
                      </label>

                      {!churchForm.is_matriz && (
                        <select value={churchForm.parent_church_id}
                          onChange={e => setChurchForm(f => ({ ...f, parent_church_id: e.target.value }))}
                          className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
                          <option value="">{t("Selecione a igreja mãe...")}</option>
                          {flatChurches.map(c => (
                            <option key={c.id} value={c.id}>{c.name} {c.is_matriz ? `(${t("Matriz")})` : ""}</option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button onClick={handleCreateChurch}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90">
                        {t("Criar Igreja")}
                      </button>
                      <button onClick={() => setShowChurchForm(false)}
                        className="px-4 py-2 bg-secondary text-foreground rounded-lg text-sm hover:bg-secondary/80">
                        {t("Cancelar")}
                      </button>
                    </div>
                  </motion.div>
                )}

                <div className="bg-card rounded-xl shadow-sm border border-border/50 overflow-hidden">
                  {churches.length === 0 ? (
                    <p className="p-8 text-sm text-muted-foreground text-center">{t("Nenhuma igreja cadastrada")}</p>
                  ) : (
                    <div className="divide-y divide-border/30">
                      {renderChurchTree(churches)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TEAM TAB */}
            {activeTab === "team" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-serif text-lg">{t("Equipe Super Admin")}</h2>
                    <p className="text-xs text-muted-foreground">{t("Membros com acesso total à plataforma")}</p>
                  </div>
                  <button onClick={() => setShowTeamForm(!showTeamForm)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90">
                    <UserPlus size={14} /> {t("Adicionar")}
                  </button>
                </div>

                {showTeamForm && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    className="bg-card rounded-xl shadow-sm border border-border/50 p-5 space-y-3">
                    <h3 className="text-sm font-medium">{t("Buscar usuário para promover")}</h3>
                    <input value={teamUserSearch} onChange={e => searchUsersForTeam(e.target.value)}
                      placeholder={t("Digite o nome do usuário...")}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                    {searchResults.length > 0 && (
                      <div className="divide-y divide-border/30 rounded-lg border border-border overflow-hidden">
                        {searchResults.map(p => (
                          <button key={p.user_id} onClick={() => promoteToSuperAdmin(p.user_id)}
                            className="w-full flex items-center justify-between p-3 hover:bg-secondary/30 transition-colors text-left">
                            <span className="text-sm">{p.full_name || t("Sem nome")}</span>
                            <span className="text-xs text-accent font-medium">{t("Promover")}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}

                <div className="bg-card rounded-xl shadow-sm border border-border/50 overflow-hidden divide-y divide-border/30">
                  {teamMembers.map(m => {
                    const initials = m.full_name ? m.full_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "?";
                    const isMe = m.user_id === user?.id;
                    return (
                      <div key={m.user_id} className="flex items-center gap-3 p-4">
                        {m.avatar_url ? (
                          <img src={m.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-xs font-bold text-accent">
                            {initials}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {m.full_name || t("Sem nome")}
                            {isMe && <span className="text-xs text-muted-foreground ml-1">({t("você")})</span>}
                          </p>
                          <p className="text-xs text-accent font-medium flex items-center gap-1">
                            <Crown size={10} /> Super Admin
                          </p>
                        </div>
                        {!isMe && (
                          <button onClick={() => removeSuperAdmin(m.user_id)}
                            className="p-2 rounded-lg hover:bg-destructive/10 transition-colors" title={t("Remover da equipe")}>
                            <Trash2 size={14} className="text-destructive" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {teamMembers.length === 0 && (
                    <p className="p-8 text-sm text-muted-foreground text-center">{t("Nenhum membro na equipe")}</p>
                  )}
                </div>
              </div>
            )}

            {/* NOTICES TAB */}
            {activeTab === "notices" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-serif text-lg">{t("Avisos da Plataforma")}</h2>
                  <button onClick={() => setShowNoticeForm(!showNoticeForm)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90">
                    <Plus size={14} /> {t("Novo Aviso")}
                  </button>
                </div>

                {showNoticeForm && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    className="bg-card rounded-xl shadow-sm border border-border/50 p-5 space-y-3">
                    <input type="text" placeholder={t("Título do aviso")} value={noticeTitle}
                      onChange={e => setNoticeTitle(e.target.value)}
                      className="w-full bg-secondary/50 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 ring-accent/30" />
                    <textarea placeholder={t("Conteúdo do aviso")} value={noticeContent}
                      onChange={e => setNoticeContent(e.target.value)} rows={3}
                      className="w-full bg-secondary/50 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 ring-accent/30 resize-none" />
                    <div className="flex items-center gap-3">
                      <select value={noticePriority} onChange={e => setNoticePriority(e.target.value)}
                        className="bg-secondary/50 rounded-lg px-3 py-2 text-sm outline-none">
                        <option value="Normal">Normal</option>
                        <option value="Urgente">{t("Urgente")}</option>
                      </select>
                      <button onClick={createNotice}
                        className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90">
                        {t("Publicar")}
                      </button>
                    </div>
                  </motion.div>
                )}

                <div className="bg-card rounded-xl shadow-sm border border-border/50 overflow-hidden divide-y divide-border/30">
                  {notices.map(n => (
                    <div key={n.id} className="p-4 flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{n.title}</span>
                          {n.priority === "Urgente" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-600 font-semibold">{t("Urgente")}</span>
                          )}
                          {!n.is_active && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">{t("Inativo")}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{n.content}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleDateString("pt-BR")}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => toggleNotice(n.id, n.is_active)}
                          className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                          title={n.is_active ? t("Desativar") : t("Ativar")}>
                          {n.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button onClick={() => deleteNotice(n.id)}
                          className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-destructive">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {notices.length === 0 && (
                    <p className="p-8 text-sm text-muted-foreground text-center">{t("Nenhum aviso criado")}</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
