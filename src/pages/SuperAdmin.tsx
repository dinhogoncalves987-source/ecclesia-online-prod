import { AdminLayout } from "@/components/AdminLayout";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useState, useEffect, type ChangeEvent, type DragEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import {
  Shield, Building2, Users, Globe, Bell, Plus, Trash2, Loader2,
  ChevronDown, ChevronUp, Eye, EyeOff, Copy, Link2, UserPlus,
  Crown, Church, MapPin, Share2, Sparkles, Upload, PencilLine
} from "lucide-react";
import { toast } from "sonner";

interface ChurchSummary {
  id: string;
  name: string;
  slug: string;
  is_matriz: boolean;
  organization_type: string;
  city: string | null;
  state: string | null;
  pastor_name: string | null;
  parent_id: string | null;
  memberCount: number;
  children: ChurchSummary[];
}

interface PlatformNotice {
  id: string;
  organization_id: string | null;
  title: string;
  short_description: string;
  full_content: string;
  image_url: string | null;
  button_label: string | null;
  button_link: string | null;
  target_type: string;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
  const { isSuperAdmin, loading: roleLoading } = useRole();
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
    organization_type: "matriz" as string, parent_id: "",
  });

  // Notice form
  const [showNoticeForm, setShowNoticeForm] = useState(false);
  const [editingNoticeId, setEditingNoticeId] = useState<string | null>(null);
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeShortDescription, setNoticeShortDescription] = useState("");
  const [noticeFullContent, setNoticeFullContent] = useState("");
  const [noticeImageUrl, setNoticeImageUrl] = useState("");
  const [noticeImagePreview, setNoticeImagePreview] = useState("");
  const [noticeImageUploading, setNoticeImageUploading] = useState(false);
  const [noticeBannerGenerating, setNoticeBannerGenerating] = useState(false);
  const [noticeButtonLabel, setNoticeButtonLabel] = useState("");
  const [noticeButtonLink, setNoticeButtonLink] = useState("");
  const [noticeStartsAt, setNoticeStartsAt] = useState("");
  const [noticeEndsAt, setNoticeEndsAt] = useState("");
  const [noticeTargetType, setNoticeTargetType] = useState<"global" | "national" | "regional" | "members">("global");

  // Team form
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [teamUserSearch, setTeamUserSearch] = useState("");
  const [searchResults, setSearchResults] = useState<{ user_id: string; full_name: string | null }[]>([]);

  useEffect(() => {
    if (roleLoading) return;
    if (!isSuperAdmin) { setLoading(false); return; }
    loadData();
  }, [isSuperAdmin, roleLoading]);

  const loadData = async () => {
    setLoading(true);

    const [churchesRes, usersCountRes, noticesRes, rolesRes] = await Promise.all([
      supabase.from("organizations" as any).select("*").eq("active", true).order("name"),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("platform_announcements" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles" as any).select("id, user_id, role").in("role", ["superadmin", "super_admin"]),
    ]);

    const allChurches = churchesRes.data || [];
    const memberCounts: Record<string, number> = {};

    // Batch count memberships per organization
    if (allChurches.length > 0) {
      const { data: memberships } = await supabase.from("organization_users" as any).select("organization_id").eq("is_active", true);
      if (memberships) {
        for (const membership of memberships as any[]) {
          if (membership.organization_id) {
            memberCounts[membership.organization_id] = (memberCounts[membership.organization_id] || 0) + 1;
          }
        }
      }
    }

    const flat: ChurchSummary[] = (allChurches as any[]).map(c => ({
      id: c.id, name: c.name, slug: c.slug, is_matriz: c.organization_type === "matriz" || c.organization_type === "sede",
      organization_type: c.organization_type || "congregacao",
      city: c.city, state: c.state, pastor_name: null,
      parent_id: c.parent_id,
      memberCount: memberCounts[c.id] || 0, children: [],
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
      if (c.parent_id && map.has(c.parent_id)) {
        map.get(c.parent_id)!.children.push(c);
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
    const { error } = await supabase.from("organizations" as any).insert({
      name: churchForm.name.trim(), slug,
      organization_type: churchForm.organization_type,
      parent_id: churchForm.parent_id || null,
      city: churchForm.city || null, state: churchForm.state || null,
      email: churchForm.email || null,
      phone: churchForm.phone || null,
      active: true,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success(t("Igreja criada com sucesso!"));
    setChurchForm({ name: "", city: "", state: "", pastor_name: "", email: "", phone: "", address: "", organization_type: "matriz", parent_id: "" });
    setShowChurchForm(false);
    loadData();
  };

  const handleDeleteChurch = async (id: string) => {
    const { error } = await supabase.from("organizations" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("Igreja removida"));
    loadData();
  };

  const handleCopyInvite = (slug: string, name: string) => {
    const url = `${window.location.origin}/signup?church=${encodeURIComponent(slug)}`;
    navigator.clipboard.writeText(url);
    toast.success(`${t("Link copiado para")} ${name}`);
  };

  const uploadNoticeImage = async (file: File) => {
    setNoticeImagePreview(URL.createObjectURL(file));
    setNoticeImageUploading(true);

    const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "-");
    const filePath = `platform-announcements/${Date.now()}-${safeFileName}`;
    const { error } = await supabase.storage.from("platform-media").upload(filePath, file, {
      contentType: file.type,
      upsert: false,
    });

    if (error) {
      setNoticeImageUploading(false);
      toast.error(t("Erro ao enviar imagem"));
      return;
    }

    const { data } = supabase.storage.from("platform-media").getPublicUrl(filePath);
    setNoticeImageUrl(data.publicUrl);
    setNoticeImagePreview(data.publicUrl);
    setNoticeImageUploading(false);
  };

  const handleNoticeImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadNoticeImage(file);
  };

  const handleNoticeImageDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("Selecione uma imagem"));
      return;
    }
    await uploadNoticeImage(file);
  };

  const handleGenerateBannerAi = async () => {
    if (!noticeTitle.trim() || !noticeShortDescription.trim() || !noticeFullContent.trim()) {
      toast.error(t("Preencha título, resumo e conteúdo da campanha antes de gerar o banner"));
      return;
    }

    setNoticeBannerGenerating(true);
    const generationId = crypto.randomUUID();
    const { data, error } = await supabase.functions.invoke("generate-campaign-banner", {
      body: {
        title: noticeTitle.trim(),
        short_description: noticeShortDescription.trim(),
        full_content: noticeFullContent.trim(),
        generation_id: generationId,
        announcement_id: editingNoticeId,
      },
    });
    setNoticeBannerGenerating(false);

    if (error) {
      console.error("Erro ao gerar banner com IA", error);
      toast.error(error.message || t("Erro ao gerar banner com IA"));
      return;
    }

    const result = data as { imageUrl?: string | null; error?: string; details?: string[] } | null;
    if (result?.error) {
      console.error("Erro ao gerar banner com IA", result);
      toast.error(result.error);
      return;
    }

    const imageUrl = result?.imageUrl;
    if (!imageUrl) {
      toast.error(t("A IA não retornou uma imagem"));
      return;
    }

    setNoticeImageUrl(imageUrl);
    setNoticeImagePreview(`${imageUrl}${imageUrl.includes("?") ? "&" : "?"}preview=${generationId}`);
    toast.success(t("Banner gerado com sucesso"));
  };

  const createNotice = async () => {
    if (!noticeTitle.trim() || !noticeShortDescription.trim() || !noticeFullContent.trim() || !user) return;
    if (editingNoticeId) {
      const updatePayload = {
        title: noticeTitle.trim(),
        short_description: noticeShortDescription.trim(),
        full_content: noticeFullContent.trim(),
        image_url: noticeImageUrl.trim() || null,
        button_label: noticeButtonLabel.trim() || null,
        button_link: noticeButtonLink.trim() || null,
        starts_at: noticeStartsAt || null,
        ends_at: noticeEndsAt || null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("platform_announcements" as any)
        .update(updatePayload as any)
        .eq("id", editingNoticeId)
        .select();
      if (error) {
        console.error("Erro ao atualizar aviso", { updatePayload, error });
        toast.error(error.message || t("Erro ao atualizar aviso"));
        return;
      }
      toast.success(t("Aviso atualizado com sucesso"));
      setEditingNoticeId(null);
      setShowNoticeForm(false);
      loadData();
      return;
    }
    const payload = {
      title: noticeTitle.trim(),
      short_description: noticeShortDescription.trim(),
      full_content: noticeFullContent.trim(),
      image_url: noticeImageUrl.trim() || null,
      button_label: noticeButtonLabel.trim() || null,
      button_link: noticeButtonLink.trim() || null,
      target_type: noticeTargetType,
      is_active: true,
      created_by: user.id,
      starts_at: noticeStartsAt || null,
      ends_at: noticeEndsAt || null,
    };
    const { error } = await supabase.from("platform_announcements" as any).insert(payload as any);
    if (error) {
      console.error("Erro ao criar campanha", { payload, error });
      toast.error(error.message || t("Erro ao criar aviso"));
      return;
    }
    toast.success(t("Aviso criado com sucesso"));
    setNoticeTitle("");
    setNoticeShortDescription("");
    setNoticeFullContent("");
    setNoticeImageUrl("");
    setNoticeImagePreview("");
    setNoticeImageUploading(false);
    setNoticeBannerGenerating(false);
    setEditingNoticeId(null);
    setNoticeButtonLabel("");
    setNoticeButtonLink("");
    setNoticeStartsAt("");
    setNoticeEndsAt("");
    setNoticeTargetType("global");
    setShowNoticeForm(false);
    loadData();
  };

  const truncateText = (text: string, maxLength = 160) =>
    text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;

  const toDateTimeLocal = (value: string | null) =>
    value ? new Date(value).toISOString().slice(0, 16) : "";

  const toggleNotice = async (id: string, active: boolean) => {
    const nextActive = !active;
    const { data, error } = await supabase
      .from("platform_announcements" as any)
      .update({ is_active: nextActive, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, is_active")
      .single();

    if (error) {
      console.error("Erro ao alterar status do aviso", { id, nextActive, error });
      toast.error(error.message || t("Erro ao alterar status do aviso"));
      return;
    }

    setNotices(items => items.map(item => item.id === id ? { ...item, is_active: Boolean((data as { is_active?: boolean } | null)?.is_active) } : item));
    toast.success(nextActive ? t("Aviso ativado") : t("Aviso desativado"));
  };

  const handleEditAnnouncement = (announcement: PlatformNotice) => {
    setEditingNoticeId(announcement.id);
    setNoticeTitle(announcement.title || "");
    setNoticeShortDescription(announcement.short_description || "");
    setNoticeFullContent(announcement.full_content || "");
    setNoticeImageUrl(announcement.image_url || "");
    setNoticeImagePreview(announcement.image_url || "");
    setNoticeButtonLabel(announcement.button_label || "");
    setNoticeButtonLink(announcement.button_link || "");
    setNoticeStartsAt(toDateTimeLocal(announcement.starts_at));
    setNoticeEndsAt(toDateTimeLocal(announcement.ends_at));
    setNoticeTargetType((announcement.target_type as typeof noticeTargetType) || "global");
    setShowNoticeForm(true);
  };

  const deleteNotice = async (id: string) => {
    await supabase.from("platform_announcements" as any).delete().eq("id", id);
    toast.success(t("Aviso removido"));
    loadData();
  };

  const searchUsersForTeam = async (query: string) => {
    setTeamUserSearch(query);
    if (query.length < 2) { setSearchResults([]); return; }
    const { data } = await supabase.from("profiles")
      .select("user_id, full_name, email")
      .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(8);
    const existingIds = teamMembers.map(m => m.user_id);
    setSearchResults((data || []).filter(p => !existingIds.includes(p.user_id)));
  };

  const promoteToSuperAdmin = async (userId: string) => {
    const { error: roleError } = await supabase.from("user_roles" as any).upsert(
      { user_id: userId, role: "superadmin" } as any,
      { onConflict: "user_id" }
    );
    if (roleError) { toast.error(roleError.message); return; }
    await supabase.from("super_admins").upsert({ user_id: userId } as any, { onConflict: "user_id" });
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

  if (!isSuperAdmin) {
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

  const sedeChurches = flatChurches.filter(c => c.organization_type === "sede");
  const matrizChurches = flatChurches.filter(c => c.organization_type === "matriz" || (c.is_matriz && c.organization_type !== "sede"));

  const renderChurchTree = (items: ChurchSummary[], level = 0) => (
    items.map(c => {
      const iconHighlight =
        c.organization_type === "matriz" ||
        c.organization_type === "sede" ||
        c.organization_type === "convencao";
      return (
      <div key={c.id}>
        <div className={`flex items-center justify-between p-3 hover:bg-secondary/20 transition-colors ${level > 0 ? "border-l-2 border-accent/20" : ""}`}
          style={{ paddingLeft: `${16 + level * 24}px` }}>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconHighlight ? "bg-accent/20" : "bg-secondary"}`}>
              <Church size={16} className={iconHighlight ? "text-accent" : "text-muted-foreground"} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{c.name}</span>
                {c.organization_type === "sede" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-600 font-semibold shrink-0">
                    {t("Sede")}
                  </span>
                )}
                {c.organization_type === "convencao" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-700 font-semibold shrink-0">
                    {t("Convenção / Regional")}
                  </span>
                )}
                {c.organization_type === "matriz" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/20 text-accent font-semibold shrink-0">
                    {t("Matriz municipal")}
                  </span>
                )}
                {c.organization_type === "setor" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-500/15 text-teal-800 dark:text-teal-200 font-semibold shrink-0">
                    {t("Setor")}
                  </span>
                )}
                {c.organization_type === "congregacao" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground font-semibold shrink-0">
                    {t("Congregação")}
                  </span>
                )}
                {!["sede", "convencao", "matriz", "setor", "congregacao"].includes(c.organization_type) && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold shrink-0">
                    {c.organization_type}
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
    );
    })
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
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium">{t("Nível:")}</label>
                        <select value={churchForm.organization_type}
                          onChange={e => setChurchForm(f => ({
                            ...f,
                            organization_type: e.target.value,
                            parent_id: e.target.value === "sede" || e.target.value === "convencao" ? "" : f.parent_id,
                          }))}
                          className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
                          <option value="sede">{t("Sede Internacional")}</option>
                          <option value="convencao">Convenção / Regional</option>
                          <option value="matriz">Matriz municipal</option>
                          <option value="congregacao">{t("Congregação")}</option>
                        </select>
                      </div>

                      {churchForm.organization_type !== "sede" && (
                        <select value={churchForm.parent_id}
                          onChange={e => setChurchForm(f => ({ ...f, parent_id: e.target.value }))}
                          className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
                          <option value="">{t("Selecione a igreja mãe...")}</option>
                          {flatChurches.filter(c => {
                            if (churchForm.organization_type === "convencao") {
                              return c.organization_type === "sede";
                            }
                            if (churchForm.organization_type === "matriz") {
                              return c.organization_type === "sede" || c.organization_type === "convencao";
                            }
                            return true;
                          }).map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name} (
                              {c.organization_type === "sede"
                                ? t("Sede")
                                : c.organization_type === "convencao"
                                  ? "Convenção / Regional"
                                  : c.organization_type === "matriz"
                                    ? "Matriz municipal"
                                    : c.organization_type === "setor"
                                      ? "Setor"
                                      : t("Congregação")}
                              )
                            </option>
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
                  <button onClick={() => { setEditingNoticeId(null); setShowNoticeForm(!showNoticeForm); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90">
                    <Plus size={14} /> {t("Novo Aviso")}
                  </button>
                </div>

                {showNoticeForm && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    className="bg-card rounded-xl shadow-sm border border-border/50 p-5 space-y-3">
                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">{t("Título principal do banner")}</span>
                      <input type="text" placeholder={t("Título da campanha")} value={noticeTitle}
                        onChange={e => setNoticeTitle(e.target.value)}
                        className="w-full bg-secondary/50 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 ring-accent/30" />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">{t("Texto/chamada do banner")}</span>
                      <input type="text" placeholder={t("Resumo curto da campanha")} value={noticeShortDescription}
                        onChange={e => setNoticeShortDescription(e.target.value)}
                        className="w-full bg-secondary/50 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 ring-accent/30" />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">{t("Prompt visual da IA")}</span>
                      <textarea placeholder={t("Descreva a campanha, público, missão e atmosfera desejada")} value={noticeFullContent}
                        onChange={e => setNoticeFullContent(e.target.value)} rows={3}
                        className="w-full bg-secondary/50 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 ring-accent/30 resize-none" />
                    </label>
                    <div className="space-y-3">
                      <p className="text-sm font-medium">{t("Banner da campanha")}</p>
                      <div onDrop={handleNoticeImageDrop} onDragOver={e => e.preventDefault()}
                        className="rounded-xl border border-dashed border-border bg-secondary/30 p-4">
                        {noticeImagePreview ? (
                          <div className="flex aspect-video max-h-[360px] w-full items-center justify-center overflow-hidden rounded-lg bg-background/70">
                            <img src={noticeImagePreview} alt="" className="h-full w-full object-fill" />
                          </div>
                        ) : (
                          <div className="flex min-h-48 flex-col items-center justify-center rounded-lg bg-background/60 px-4 text-center">
                            <Upload size={28} className="text-muted-foreground mb-3" />
                            <p className="text-sm font-medium">{t("Arraste uma imagem aqui ou escolha do computador")}</p>
                            <p className="text-xs text-muted-foreground mt-1">{t("A IA usará título, resumo e conteúdo da campanha para sugerir um banner")}</p>
                          </div>
                        )}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <label className="inline-flex cursor-pointer items-center gap-1.5 px-3 py-2 bg-accent text-accent-foreground rounded-lg text-xs font-medium hover:opacity-90">
                            <Upload size={14} /> {t("Escolher imagem")}
                            <input type="file" accept="image/*" onChange={handleNoticeImageUpload} className="hidden" />
                          </label>
                          <button type="button" onClick={handleGenerateBannerAi} disabled={noticeBannerGenerating || noticeImageUploading}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary text-foreground rounded-lg text-xs font-medium hover:bg-secondary/80 disabled:opacity-60">
                            {noticeBannerGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                            {noticeBannerGenerating ? t("Gerando banner...") : t("Gerar banner com IA")}
                          </button>
                          {(noticeImageUploading || noticeBannerGenerating) && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Loader2 size={12} className="animate-spin" /> {noticeBannerGenerating ? t("Criando imagem com IA...") : t("Enviando imagem...")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="block space-y-1.5 sm:col-span-2">
                        <span className="text-xs font-medium text-muted-foreground">{t("Escopo")}</span>
                        <div className="flex flex-wrap gap-2">
                          {(["global", "national", "regional", "members"] as const).map(scope => {
                            const scopeLabel: Record<string, string> = {
                              global: t("Global (todas as organizações)"),
                              national: t("Nacional"),
                              regional: t("Regional"),
                              members: t("Membros (interno)"),
                            };
                            return (
                              <button key={scope} type="button"
                                onClick={() => setNoticeTargetType(scope)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                  noticeTargetType === scope
                                    ? "bg-accent text-accent-foreground border-accent"
                                    : "bg-secondary/50 border-border text-muted-foreground hover:bg-secondary"
                                }`}>
                                {scopeLabel[scope]}
                              </button>
                            );
                          })}
                        </div>
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground">{t("Texto do botão")}</span>
                        <input type="text" placeholder={t("Ex: Doar agora")} value={noticeButtonLabel}
                          onChange={e => setNoticeButtonLabel(e.target.value)}
                          className="w-full bg-secondary/50 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 ring-accent/30" />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground">{t("Link da campanha/doação")}</span>
                        <input type="url" placeholder={t("https://...")} value={noticeButtonLink}
                          onChange={e => setNoticeButtonLink(e.target.value)}
                          className="w-full bg-secondary/50 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 ring-accent/30" />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground">{t("Data de início")}</span>
                        <input type="datetime-local" value={noticeStartsAt}
                          onChange={e => setNoticeStartsAt(e.target.value)}
                          className="w-full bg-secondary/50 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 ring-accent/30" />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground">{t("Data de encerramento")}</span>
                        <input type="datetime-local" value={noticeEndsAt}
                          onChange={e => setNoticeEndsAt(e.target.value)}
                          className="w-full bg-secondary/50 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 ring-accent/30" />
                      </label>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={createNotice} disabled={noticeImageUploading || noticeBannerGenerating}
                        className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60">
                        {editingNoticeId ? t("Salvar edição") : t("Publicar")}
                      </button>
                    </div>
                  </motion.div>
                )}

                        <div className="bg-card rounded-xl shadow-sm border border-border/50 overflow-hidden divide-y divide-border/30">
                  {notices.map(n => {
                    const scopeColors: Record<string, string> = {
                      global: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
                      national: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
                      regional: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
                      members: "bg-secondary text-muted-foreground",
                    };
                    const scopeLabels: Record<string, string> = {
                      global: t("Global"),
                      national: t("Nacional"),
                      regional: t("Regional"),
                      members: t("Membros (interno)"),
                    };
                    return (
                      <div key={n.id} className="p-4 flex items-start justify-between gap-3">
                        {n.image_url && (
                          <img src={n.image_url} alt="" className="w-16 h-16 rounded-lg object-cover bg-secondary flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{n.title}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${n.is_active ? "bg-emerald-500/20 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                              {n.is_active ? t("Ativo") : t("Inativo")}
                            </span>
                            {n.target_type && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${scopeColors[n.target_type] ?? "bg-muted text-muted-foreground"}`}>
                                {scopeLabels[n.target_type] ?? n.target_type}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {new Date(n.starts_at ?? n.created_at).toLocaleDateString()}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">{truncateText(n.full_content)}</p>
                          {(n.button_label || n.button_link) && (
                            <p className="text-xs text-accent font-medium mt-1 flex items-center gap-1 truncate">
                              <Link2 size={12} /> {n.button_label || t("Link")} {n.button_link ? `- ${n.button_link}` : ""}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => toggleNotice(n.id, n.is_active)}
                            className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                            title={n.is_active ? t("Desativar") : t("Ativar")}>
                            {n.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          <button onClick={() => handleEditAnnouncement(n)}
                            className="p-1.5 rounded-lg text-foreground/70 hover:text-accent hover:bg-accent/10 transition-colors"
                            title={t("Editar")}>
                            <PencilLine size={14} />
                          </button>
                          <button onClick={() => deleteNotice(n.id)}
                            className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-destructive">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
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
