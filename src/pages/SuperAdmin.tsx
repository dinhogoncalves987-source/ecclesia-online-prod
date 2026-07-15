import { AdminLayout } from "@/components/AdminLayout";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useSupportContext } from "@/contexts/SupportContext";
import { useState, useEffect, useCallback, type ChangeEvent, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import {
  LayoutGrid, Building2, Users, Globe, Bell, Plus, Trash2, Loader2,
  ChevronDown, ChevronUp, Eye, EyeOff, Copy, Link2, UserPlus,
  Crown, Church, MapPin, Share2, Sparkles, Upload, PencilLine,
  Layers, Ticket, MessageSquare, Video, ClipboardList, Check,
  AlertCircle, Clock, ArrowRight, Search, Filter, X, ChevronRight,
  Activity, Wifi, WifiOff, Settings, MoreHorizontal, Tag, ExternalLink,
  Shield, RefreshCw, Hash, BookOpen, Inbox
} from "lucide-react";
import { toast } from "sonner";
import { PLATFORM_ROLE_LABELS, type PlatformRole } from "@/lib/platformSupportPermissions";
import { logSupportAudit } from "@/lib/platformSupportAudit";
import { isMatrizLevel, normalizeOrganizationType } from "@/lib/organizationHierarchy";

// ─── Types ───────────────────────────────────────────────────────────────────

type TabKey = "overview" | "churches" | "team" | "departments" | "tickets" | "conversas" | "reunioes" | "audit" | "notices";

interface ChurchSummary {
  id: string; name: string; slug: string; is_matriz: boolean;
  organization_type: string; city: string | null; state: string | null;
  pastor_name: string | null; parent_id: string | null;
  memberCount: number; children: ChurchSummary[];
}

interface PlatformNotice {
  id: string; organization_id: string | null; title: string;
  short_description: string; full_content: string; image_url: string | null;
  button_label: string | null; button_link: string | null; target_type: string;
  is_active: boolean; starts_at: string | null; ends_at: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}

interface Department {
  id: string; name: string; slug: string; description: string | null;
  is_active: boolean; sort_order: number; module_keys: string[];
  icon_key: string | null; color_key: string | null;
  created_at: string; updated_at: string;
  agent_count?: number; ticket_count?: number;
}

interface PlatformAgent {
  user_id: string; full_name: string | null; email: string | null;
  avatar_url: string | null; platform_role: string | null;
  departments?: Department[]; primary_dept?: Department | null;
  open_tickets?: number; resolved_tickets?: number;
  last_seen?: string | null; is_online?: boolean;
}

interface SupportTicket {
  id: string; title: string; organization_id: string | null;
  org_name?: string; department: string | null; department_id: string | null;
  dept_name?: string; module_key: string | null; status: string;
  priority: string; opened_by_user_id: string | null;
  assigned_to_user_id: string | null; agent_name?: string;
  metadata: Record<string, unknown> | null;
  created_at: string; updated_at: string;
}

interface AuditLog {
  id: string; actor_user_id: string | null; actor_name?: string;
  actor_platform_role: string | null; target_organization_id: string | null;
  org_name?: string; module_key: string | null; action: string;
  metadata: Record<string, unknown> | null; created_at: string;
}

interface OverviewMetrics {
  totalOrgs: number; matrizOrgs: number; totalUsers: number;
  platformAgents: number; activeDepartments: number;
  openTickets: number; inProgressTickets: number; urgentTickets: number;
  onlineAgents: number; orgsInSupport: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TICKET_STATUS_LABELS: Record<string, string> = {
  open: "Aberto", in_progress: "Em atendimento", waiting_church: "Aguardando igreja",
  waiting_support: "Aguardando suporte", escalated: "Escalado",
  resolved: "Resolvido", closed: "Fechado",
};
const TICKET_STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  in_progress: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  waiting_church: "bg-orange-500/15 text-orange-700",
  waiting_support: "bg-purple-500/15 text-purple-700",
  escalated: "bg-red-500/15 text-red-700",
  resolved: "bg-emerald-500/15 text-emerald-700",
  closed: "bg-secondary text-muted-foreground",
};
const TICKET_PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-500/20 text-red-700",
  high: "bg-orange-500/20 text-orange-700",
  normal: "bg-secondary text-muted-foreground",
  low: "bg-secondary text-muted-foreground",
};
/** Orienta o Super Admin, em modo suporte, a usar o fluxo estrutural correto
 * (Congregacoes.tsx) em vez do formulário genérico desta aba. */
function structuralCreationGuidance(organizationType: string | null): string {
  const normalized = normalizeOrganizationType(organizationType);
  switch (normalized) {
    case "matriz":
    case "sede":
      return "Matriz → use \"Distritos\" e clique em \"Novo Distrito\" (ou \"Nova Congregação\" se esta matriz não usa nível intermediário).";
    case "setor":
      return "Distrito → use \"Nova Subsede\" ou \"Nova Congregação\" conforme necessário. Subsedes agrupam congregações abaixo do distrito.";
    case "subsede":
      return "Subsede → use \"Congregações\" e clique em \"Nova Congregação\".";
    case "congregacao":
      return "Congregação → unidade local operacional, sem criação de unidades filhas.";
    case "state_convention":
    case "national_convention":
    case "international_convention":
      return "Use o botão de criação contextual na estrutura desta organização.";
    default:
      return "Use o botão de criação contextual na estrutura desta organização.";
  }
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  set_support_org: "Ativou atendimento", clear_support_org: "Encerrou atendimento",
  accept_ticket: "Aceitou chamado", resolve_ticket: "Resolveu chamado",
  transfer_ticket: "Transferiu chamado", escalate_ticket: "Escalou chamado",
  create_agent: "Criou agente", update_agent: "Atualizou agente",
  deactivate_agent: "Desativou agente", create_department: "Criou departamento",
  update_department: "Atualizou departamento",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SuperAdmin() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useRole();
  const { setSupportOrg, isSupportModeActive, activeSupportOrg } = useSupportContext();
  const navigate = useNavigate();

  // ── General state ──
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  // ── Overview ──
  const [metrics, setMetrics] = useState<OverviewMetrics>({
    totalOrgs: 0, matrizOrgs: 0, totalUsers: 0, platformAgents: 0,
    activeDepartments: 0, openTickets: 0, inProgressTickets: 0,
    urgentTickets: 0, onlineAgents: 0, orgsInSupport: 0,
  });

  // ── Churches ──
  const [churches, setChurches] = useState<ChurchSummary[]>([]);
  const [flatChurches, setFlatChurches] = useState<ChurchSummary[]>([]);
  const [showChurchForm, setShowChurchForm] = useState(false);
  const [churchForm, setChurchForm] = useState({
    name: "", city: "", state: "", pastor_name: "", email: "", phone: "", address: "",
    organization_type: "matriz" as string, parent_id: "",
  });

  // ── Departments ──
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptLoading, setDeptLoading] = useState(false);
  const [showDeptForm, setShowDeptForm] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptForm, setDeptForm] = useState({
    name: "", slug: "", description: "", module_keys_raw: "", sort_order: 0, is_active: true,
  });

  // ── Team ──
  const [agents, setAgents] = useState<PlatformAgent[]>([]);
  const [agentLoading, setAgentLoading] = useState(false);
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [agentForm, setAgentForm] = useState({
    email: "", full_name: "", platform_role: "support_central" as string,
    primary_dept: "", secondary_depts: [] as string[],
    city: "", state: "", country: "Brasil",
    reference_church: "", referred_by: "", notes: "", phone: "",
  });
  const [agentFormStatus, setAgentFormStatus] = useState<"idle" | "saving" | "done">("idle");

  // ── Tickets ──
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketStatusFilter, setTicketStatusFilter] = useState<string>("all");
  const [ticketDeptFilter, setTicketDeptFilter] = useState<string>("all");
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
  const [transferModal, setTransferModal] = useState<{ ticketId: string; title: string } | null>(null);
  const [transferForm, setTransferForm] = useState({ department_id: "", agent_id: "", note: "" });

  // ── Audit ──
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditActionFilter, setAuditActionFilter] = useState("all");
  const [auditModuleFilter, setAuditModuleFilter] = useState("all");

  // ── Notices ──
  const [notices, setNotices] = useState<PlatformNotice[]>([]);
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

  // ─── Load ───────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);

    const [orgsRes, usersRes, agentsRes, deptRes, ticketsRes, presenceRes] = await Promise.all([
      supabase.from("organizations" as any).select("id, name, slug, organization_type, city, state, parent_id, active").eq("active", true),
      supabase.from("profiles").select("user_id", { count: "exact", head: true }),
      supabase.from("profiles").select("user_id").not("platform_role", "is", null),
      supabase.from("platform_support_departments" as any).select("id").eq("is_active", true),
      supabase.from("platform_support_tickets" as any).select("id, status, priority"),
      supabase.from("platform_support_agent_presence" as any).select("user_id, status").eq("status", "online"),
    ]);

    const allOrgs = (orgsRes.data as any[]) || [];
    const flat: ChurchSummary[] = allOrgs.map(c => ({
      id: c.id, name: c.name, slug: c.slug,
      is_matriz: isMatrizLevel(normalizeOrganizationType(c.organization_type)),
      organization_type: c.organization_type || "congregacao",
      city: c.city, state: c.state, pastor_name: null, parent_id: c.parent_id,
      memberCount: 0, children: [],
    }));
    setFlatChurches(flat);
    setChurches(buildTree(flat));

    const tix = (ticketsRes.data as any[]) || [];
    setMetrics({
      totalOrgs: allOrgs.length,
      matrizOrgs: allOrgs.filter((o: any) => isMatrizLevel(normalizeOrganizationType(o.organization_type))).length,
      totalUsers: usersRes.count || 0,
      platformAgents: (agentsRes.data || []).length,
      activeDepartments: (deptRes.data || []).length,
      openTickets: tix.filter(t => t.status === "open").length,
      inProgressTickets: tix.filter(t => t.status === "in_progress").length,
      urgentTickets: tix.filter(t => t.priority === "urgent").length,
      onlineAgents: (presenceRes.data || []).length,
      orgsInSupport: 0,
    });

    const noticesRes = await supabase.from("platform_announcements" as any).select("*").order("created_at", { ascending: false });
    setNotices((noticesRes.data as PlatformNotice[]) || []);

    setLoading(false);
  }, []);

  const loadDepartments = useCallback(async () => {
    setDeptLoading(true);
    const { data: depts } = await supabase
      .from("platform_support_departments" as any)
      .select("*")
      .order("sort_order", { ascending: true });

    if (!depts) { setDeptLoading(false); return; }

    const deptsWithCounts = await Promise.all((depts as Department[]).map(async (d) => {
      const [agentsCount, ticketsCount] = await Promise.all([
        supabase.from("platform_support_agent_departments" as any)
          .select("id", { count: "exact", head: true }).eq("department_id", d.id),
        supabase.from("platform_support_tickets" as any)
          .select("id", { count: "exact", head: true }).eq("department_id", d.id)
          .in("status", ["open", "in_progress"]),
      ]);
      return { ...d, agent_count: agentsCount.count || 0, ticket_count: ticketsCount.count || 0 };
    }));

    setDepartments(deptsWithCounts);
    setDeptLoading(false);
  }, []);

  const loadAgents = useCallback(async () => {
    setAgentLoading(true);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, avatar_url, platform_role")
      .not("platform_role", "is", null)
      .order("full_name");

    if (!profiles) { setAgentLoading(false); return; }

    const agentList: PlatformAgent[] = await Promise.all(profiles.map(async (p) => {
      const { data: deptLinks } = await supabase
        .from("platform_support_agent_departments" as any)
        .select("is_primary, department:platform_support_departments(*)")
        .eq("agent_user_id", p.user_id);

      const deptData = (deptLinks || []) as { is_primary: boolean; department: Department }[];
      const allDepts = deptData.map(d => d.department).filter(Boolean);
      const primaryDept = deptData.find(d => d.is_primary)?.department || allDepts[0] || null;

      const { data: presence } = await supabase
        .from("platform_support_agent_presence" as any)
        .select("status, last_seen")
        .eq("user_id", p.user_id)
        .maybeSingle();

      return {
        ...p,
        departments: allDepts,
        primary_dept: primaryDept,
        is_online: (presence as any)?.status === "online",
        last_seen: (presence as any)?.last_seen || null,
      };
    }));

    setAgents(agentList);
    setAgentLoading(false);
  }, []);

  const loadTickets = useCallback(async () => {
    setTicketLoading(true);
    const query = supabase
      .from("platform_support_tickets" as any)
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(100);

    const { data: tix } = await query;

    if (!tix) { setTicketLoading(false); return; }

    // Enrich with org names and dept names
    const orgIds = [...new Set((tix as any[]).map(t => t.organization_id).filter(Boolean))];
    const deptIds = [...new Set((tix as any[]).map(t => t.department_id).filter(Boolean))];
    const agentIds = [...new Set((tix as any[]).map(t => t.assigned_to_user_id).filter(Boolean))];

    const [orgsData, deptsData, agentsData] = await Promise.all([
      orgIds.length > 0 ? supabase.from("organizations" as any).select("id, name").in("id", orgIds) : { data: [] },
      deptIds.length > 0 ? supabase.from("platform_support_departments" as any).select("id, name").in("id", deptIds) : { data: [] },
      agentIds.length > 0 ? supabase.from("profiles").select("user_id, full_name").in("user_id", agentIds) : { data: [] },
    ]);

    const orgMap = Object.fromEntries(((orgsData.data || []) as any[]).map(o => [o.id, o.name]));
    const deptMap = Object.fromEntries(((deptsData.data || []) as any[]).map(d => [d.id, d.name]));
    const agentMap = Object.fromEntries(((agentsData.data || []) as any[]).map(a => [a.user_id, a.full_name]));

    const enriched = (tix as any[]).map(t => ({
      ...t,
      org_name: orgMap[t.organization_id] || t.organization_id || "—",
      dept_name: deptMap[t.department_id] || t.department || "—",
      agent_name: agentMap[t.assigned_to_user_id] || "Não atribuído",
    }));

    setTickets(enriched);
    setTicketLoading(false);
  }, []);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    const { data: logs } = await supabase
      .from("platform_support_audit_logs" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (!logs) { setAuditLoading(false); return; }

    const actorIds = [...new Set((logs as any[]).map(l => l.actor_user_id).filter(Boolean))];
    const orgIds = [...new Set((logs as any[]).map(l => l.target_organization_id).filter(Boolean))];

    const [actorsData, orgsData] = await Promise.all([
      actorIds.length > 0 ? supabase.from("profiles").select("user_id, full_name").in("user_id", actorIds) : { data: [] },
      orgIds.length > 0 ? supabase.from("organizations" as any).select("id, name").in("id", orgIds) : { data: [] },
    ]);

    const actorMap = Object.fromEntries(((actorsData.data || []) as any[]).map(a => [a.user_id, a.full_name]));
    const orgMap = Object.fromEntries(((orgsData.data || []) as any[]).map(o => [o.id, o.name]));

    const enriched = (logs as any[]).map(l => ({
      ...l,
      actor_name: actorMap[l.actor_user_id] || l.actor_user_id || "Sistema",
      org_name: orgMap[l.target_organization_id] || "—",
    }));

    setAuditLogs(enriched);
    setAuditLoading(false);
  }, []);

  useEffect(() => {
    if (roleLoading) return;
    if (!isSuperAdmin) { setLoading(false); return; }
    loadData();
  }, [isSuperAdmin, roleLoading, loadData]);

  useEffect(() => {
    if (!isSuperAdmin || roleLoading) return;
    if (activeTab === "departments") loadDepartments();
    if (activeTab === "team") loadAgents();
    if (activeTab === "tickets") loadTickets();
    if (activeTab === "audit") loadAudit();
  }, [activeTab, isSuperAdmin, roleLoading, loadDepartments, loadAgents, loadTickets, loadAudit]);

  // ─── Church helpers ──────────────────────────────────────────────────────────

  const buildTree = (flat: ChurchSummary[]): ChurchSummary[] => {
    const map = new Map<string, ChurchSummary>();
    flat.forEach(c => map.set(c.id, { ...c, children: [] }));
    const roots: ChurchSummary[] = [];
    map.forEach(c => {
      if (c.parent_id && map.has(c.parent_id)) map.get(c.parent_id)!.children.push(c);
      else roots.push(c);
    });
    return roots;
  };

  const generateSlug = (name: string) =>
    name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now().toString(36);

  const handleCreateChurch = async () => {
    if (!churchForm.name.trim()) { toast.error("Nome é obrigatório"); return; }
    const slug = generateSlug(churchForm.name);
    const { error } = await supabase.from("organizations" as any).insert({
      name: churchForm.name.trim(), slug, organization_type: churchForm.organization_type,
      parent_id: churchForm.parent_id || null, city: churchForm.city || null,
      state: churchForm.state || null, email: churchForm.email || null,
      phone: churchForm.phone || null, active: true,
      pastor_president_name: churchForm.pastor_name.trim() || null,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Igreja criada com sucesso!");
    setChurchForm({ name: "", city: "", state: "", pastor_name: "", email: "", phone: "", address: "", organization_type: "matriz", parent_id: "" });
    setShowChurchForm(false);
    loadData();
  };

  const handleDeleteChurch = async (id: string) => {
    const { error } = await supabase.from("organizations" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Igreja removida");
    loadData();
  };

  const handleCopyInvite = (slug: string, name: string) => {
    const url = `${window.location.origin}/signup?church=${encodeURIComponent(slug)}`;
    navigator.clipboard.writeText(url);
    toast.success(`Link copiado para ${name}`);
  };

  // ─── Department helpers ──────────────────────────────────────────────────────

  const openNewDeptForm = () => {
    setEditingDept(null);
    setDeptForm({ name: "", slug: "", description: "", module_keys_raw: "", sort_order: departments.length + 1, is_active: true });
    setShowDeptForm(true);
  };

  const openEditDeptForm = (dept: Department) => {
    setEditingDept(dept);
    setDeptForm({
      name: dept.name, slug: dept.slug, description: dept.description || "",
      module_keys_raw: dept.module_keys.join(", "), sort_order: dept.sort_order, is_active: dept.is_active,
    });
    setShowDeptForm(true);
  };

  const autoSlug = (name: string) =>
    name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

  const saveDept = async () => {
    if (!deptForm.name.trim()) { toast.error("Nome é obrigatório"); return; }
    const slug = deptForm.slug.trim() || autoSlug(deptForm.name);
    const moduleKeys = deptForm.module_keys_raw.split(",").map(s => s.trim()).filter(Boolean);
    const payload = {
      name: deptForm.name.trim(), slug, description: deptForm.description.trim() || null,
      sort_order: deptForm.sort_order, is_active: deptForm.is_active, module_keys: moduleKeys,
      updated_at: new Date().toISOString(),
    };

    if (editingDept) {
      const { error } = await supabase.from("platform_support_departments" as any).update(payload as any).eq("id", editingDept.id);
      if (error) { toast.error(error.message); return; }
      await logSupportAudit(user!.id, "update_department", null, null, "departments", { dept_id: editingDept.id, name: deptForm.name });
      toast.success("Departamento atualizado!");
    } else {
      const { error } = await supabase.from("platform_support_departments" as any).insert(payload as any);
      if (error) { toast.error(error.message); return; }
      await logSupportAudit(user!.id, "create_department", null, null, "departments", { slug, name: deptForm.name });
      toast.success("Departamento criado!");
    }

    setShowDeptForm(false);
    setEditingDept(null);
    loadDepartments();
  };

  const toggleDeptActive = async (dept: Department) => {
    const { error } = await supabase.from("platform_support_departments" as any)
      .update({ is_active: !dept.is_active, updated_at: new Date().toISOString() } as any).eq("id", dept.id);
    if (error) { toast.error(error.message); return; }
    toast.success(dept.is_active ? "Departamento desativado" : "Departamento ativado");
    loadDepartments();
  };

  // ─── Agent helpers ───────────────────────────────────────────────────────────

  const saveAgent = async () => {
    if (!agentForm.email.trim()) { toast.error("E-mail é obrigatório"); return; }
    setAgentFormStatus("saving");

    const { data: existing } = await supabase
      .from("profiles").select("user_id, full_name, platform_role").eq("email", agentForm.email.trim()).maybeSingle();

    if (!existing) {
      toast.error("Usuário não encontrado. O agente deve criar uma conta primeiro ou receber um convite de acesso.");
      setAgentFormStatus("idle");
      return;
    }

    // SEGURANÇA: platform_role não é mais gravável por UPDATE direto na
    // tabela (grants por coluna revogados de `authenticated` — ver migration
    // 20260715130000_harden_platform_role_escalation.sql). Só a RPC
    // admin_set_platform_role pode alterá-la, e ela mesma exige que quem
    // chama já seja is_platform_admin por uma fonte não editável pelo
    // usuário comum (super_admins / user_roles globais).
    const { data: roleResult, error: profileError } = await supabase.rpc("admin_set_platform_role", {
      _target_user_id: existing.user_id,
      _new_role: agentForm.platform_role,
    });
    const roleOk = (roleResult as { ok?: boolean; error?: string } | null)?.ok;
    if (profileError || !roleOk) {
      toast.error(profileError?.message ?? (roleResult as { error?: string } | null)?.error ?? "Falha ao definir a função");
      setAgentFormStatus("idle");
      return;
    }

    await supabase.from("platform_support_agents" as any).upsert({
      user_id: existing.user_id, is_active: true,
      notes: agentForm.notes || null,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: "user_id" });

    if (agentForm.primary_dept) {
      await supabase.from("platform_support_agent_departments" as any)
        .delete().eq("agent_user_id", existing.user_id);
      await supabase.from("platform_support_agent_departments" as any)
        .insert({ agent_user_id: existing.user_id, department_id: agentForm.primary_dept, is_primary: true } as any);
      for (const deptId of agentForm.secondary_depts) {
        if (deptId !== agentForm.primary_dept) {
          await supabase.from("platform_support_agent_departments" as any)
            .insert({ agent_user_id: existing.user_id, department_id: deptId, is_primary: false } as any);
        }
      }
    }

    await logSupportAudit(user!.id, "create_agent", null, null, "team", {
      target_user_id: existing.user_id, role: agentForm.platform_role,
    });

    toast.success(`Agente ${existing.full_name || agentForm.email} configurado com sucesso!`);
    setAgentFormStatus("done");
    setShowAgentForm(false);
    setAgentForm({
      email: "", full_name: "", platform_role: "support_central", primary_dept: "",
      secondary_depts: [], city: "", state: "", country: "Brasil",
      reference_church: "", referred_by: "", notes: "", phone: "",
    });
    loadAgents();
  };

  const updateAgentRole = async (userId: string, newRole: string) => {
    const { data, error } = await supabase.rpc("admin_set_platform_role", {
      _target_user_id: userId,
      _new_role: newRole,
    });
    const ok = (data as { ok?: boolean; error?: string } | null)?.ok;
    if (error || !ok) { toast.error(error?.message ?? (data as { error?: string } | null)?.error ?? "Falha ao atualizar a função"); return; }
    await logSupportAudit(user!.id, "update_agent", null, null, "team", { target_user_id: userId, new_role: newRole });
    toast.success("Função atualizada!");
    loadAgents();
  };

  const deactivateAgent = async (userId: string, name: string | null) => {
    const { data, error } = await supabase.rpc("admin_set_platform_role", {
      _target_user_id: userId,
      _new_role: null,
    });
    const ok = (data as { ok?: boolean; error?: string } | null)?.ok;
    if (error || !ok) { toast.error(error?.message ?? (data as { error?: string } | null)?.error ?? "Falha ao remover o agente"); return; }
    await supabase.from("platform_support_agent_departments" as any).delete().eq("agent_user_id", userId);
    await logSupportAudit(user!.id, "deactivate_agent", null, null, "team", { target_user_id: userId });
    toast.success(`${name || "Agente"} removido da equipe da plataforma`);
    loadAgents();
  };

  // ─── Ticket helpers ──────────────────────────────────────────────────────────

  const acceptTicket = async (ticketId: string) => {
    const { error } = await supabase.from("platform_support_tickets" as any)
      .update({ status: "in_progress", assigned_to_user_id: user!.id, updated_at: new Date().toISOString() } as any)
      .eq("id", ticketId);
    if (error) { toast.error(error.message); return; }
    await supabase.from("platform_support_ticket_events" as any).insert({
      ticket_id: ticketId, actor_user_id: user!.id, event_type: "status_change",
      payload: { from: "open", to: "in_progress" },
    } as any);
    toast.success("Chamado aceito!");
    loadTickets();
  };

  const resolveTicket = async (ticketId: string) => {
    const { error } = await supabase.from("platform_support_tickets" as any)
      .update({ status: "resolved", updated_at: new Date().toISOString() } as any)
      .eq("id", ticketId);
    if (error) { toast.error(error.message); return; }
    await supabase.from("platform_support_ticket_events" as any).insert({
      ticket_id: ticketId, actor_user_id: user!.id, event_type: "status_change",
      payload: { from: "in_progress", to: "resolved" },
    } as any);
    await logSupportAudit(user!.id, "resolve_ticket", null, null, "chamados", { ticket_id: ticketId });
    toast.success("Chamado resolvido!");
    loadTickets();
  };

  const submitTransfer = async () => {
    if (!transferModal || !transferForm.department_id) { toast.error("Selecione o departamento destino"); return; }
    const updates: any = {
      department_id: transferForm.department_id,
      status: "open",
      assigned_to_user_id: transferForm.agent_id || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("platform_support_tickets" as any)
      .update(updates).eq("id", transferModal.ticketId);
    if (error) { toast.error(error.message); return; }
    await supabase.from("platform_support_ticket_events" as any).insert({
      ticket_id: transferModal.ticketId, actor_user_id: user!.id, event_type: "transfer",
      payload: { department_id: transferForm.department_id, note: transferForm.note },
    } as any);
    await logSupportAudit(user!.id, "transfer_ticket", null, null, "chamados", {
      ticket_id: transferModal.ticketId, to_dept: transferForm.department_id,
    });
    toast.success("Chamado transferido!");
    setTransferModal(null);
    setTransferForm({ department_id: "", agent_id: "", note: "" });
    loadTickets();
  };

  const attendOrg = async (ticket: SupportTicket) => {
    if (!ticket.organization_id) { toast.error("Chamado sem organização vinculada"); return; }
    const { data: org } = await supabase.from("organizations" as any)
      .select("id, name, organization_type, city, state").eq("id", ticket.organization_id).maybeSingle();
    if (!org) { toast.error("Organização não encontrada"); return; }
    setSupportOrg(org as any);
    toast.success(`Atendendo: ${(org as any).name}`);
  };

  // ─── Notice helpers ──────────────────────────────────────────────────────────

  const uploadNoticeImage = async (file: File) => {
    setNoticeImagePreview(URL.createObjectURL(file));
    setNoticeImageUploading(true);
    const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "-");
    const filePath = `platform-announcements/${Date.now()}-${safeFileName}`;
    const { error } = await supabase.storage.from("platform-media").upload(filePath, file, { contentType: file.type, upsert: false });
    if (error) { setNoticeImageUploading(false); toast.error("Erro ao enviar imagem"); return; }
    const { data } = supabase.storage.from("platform-media").getPublicUrl(filePath);
    setNoticeImageUrl(data.publicUrl); setNoticeImagePreview(data.publicUrl);
    setNoticeImageUploading(false);
  };

  const handleNoticeImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return; await uploadNoticeImage(file);
  };

  const handleNoticeImageDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione uma imagem"); return; }
    await uploadNoticeImage(file);
  };

  const handleGenerateBannerAi = async () => {
    if (!noticeTitle.trim() || !noticeShortDescription.trim() || !noticeFullContent.trim()) {
      toast.error("Preencha título, resumo e conteúdo antes de gerar o banner"); return;
    }
    setNoticeBannerGenerating(true);
    const generationId = crypto.randomUUID();
    const { data, error } = await supabase.functions.invoke("generate-campaign-banner", {
      body: { title: noticeTitle.trim(), short_description: noticeShortDescription.trim(), full_content: noticeFullContent.trim(), generation_id: generationId, announcement_id: editingNoticeId },
    });
    setNoticeBannerGenerating(false);
    if (error) { toast.error(error.message || "Erro ao gerar banner"); return; }
    const result = data as { imageUrl?: string | null; error?: string } | null;
    if (result?.error) { toast.error(result.error); return; }
    if (!result?.imageUrl) { toast.error("A IA não retornou uma imagem"); return; }
    setNoticeImageUrl(result.imageUrl);
    setNoticeImagePreview(`${result.imageUrl}${result.imageUrl.includes("?") ? "&" : "?"}preview=${generationId}`);
    toast.success("Banner gerado com sucesso");
  };

  const createNotice = async () => {
    if (!noticeTitle.trim() || !noticeShortDescription.trim() || !noticeFullContent.trim() || !user) return;
    if (editingNoticeId) {
      const { error } = await supabase.from("platform_announcements" as any)
        .update({
          title: noticeTitle.trim(), short_description: noticeShortDescription.trim(),
          full_content: noticeFullContent.trim(), image_url: noticeImageUrl.trim() || null,
          button_label: noticeButtonLabel.trim() || null, button_link: noticeButtonLink.trim() || null,
          starts_at: noticeStartsAt || null, ends_at: noticeEndsAt || null, updated_at: new Date().toISOString(),
        } as any).eq("id", editingNoticeId).select();
      if (error) { toast.error(error.message); return; }
      toast.success("Aviso atualizado");
    } else {
      const { error } = await supabase.from("platform_announcements" as any).insert({
        title: noticeTitle.trim(), short_description: noticeShortDescription.trim(),
        full_content: noticeFullContent.trim(), image_url: noticeImageUrl.trim() || null,
        button_label: noticeButtonLabel.trim() || null, button_link: noticeButtonLink.trim() || null,
        target_type: noticeTargetType, is_active: true, created_by: user.id,
        starts_at: noticeStartsAt || null, ends_at: noticeEndsAt || null,
      } as any);
      if (error) { toast.error(error.message); return; }
      toast.success("Aviso publicado");
    }
    setNoticeTitle(""); setNoticeShortDescription(""); setNoticeFullContent(""); setNoticeImageUrl(""); setNoticeImagePreview("");
    setNoticeButtonLabel(""); setNoticeButtonLink(""); setNoticeStartsAt(""); setNoticeEndsAt("");
    setEditingNoticeId(null); setShowNoticeForm(false); loadData();
  };

  const toggleNotice = async (id: string, active: boolean) => {
    const { data, error } = await supabase.from("platform_announcements" as any)
      .update({ is_active: !active, updated_at: new Date().toISOString() } as any)
      .eq("id", id).select("id, is_active").single();
    if (error) { toast.error(error.message); return; }
    setNotices(items => items.map(item => item.id === id ? { ...item, is_active: Boolean((data as any)?.is_active) } : item));
    toast.success(!active ? "Aviso ativado" : "Aviso desativado");
  };

  const deleteNotice = async (id: string) => {
    await supabase.from("platform_announcements" as any).delete().eq("id", id);
    toast.success("Aviso removido"); loadData();
  };

  const handleEditAnnouncement = (n: PlatformNotice) => {
    setEditingNoticeId(n.id); setNoticeTitle(n.title || ""); setNoticeShortDescription(n.short_description || "");
    setNoticeFullContent(n.full_content || ""); setNoticeImageUrl(n.image_url || ""); setNoticeImagePreview(n.image_url || "");
    setNoticeButtonLabel(n.button_label || ""); setNoticeButtonLink(n.button_link || "");
    setNoticeStartsAt(n.starts_at ? new Date(n.starts_at).toISOString().slice(0, 16) : "");
    setNoticeEndsAt(n.ends_at ? new Date(n.ends_at).toISOString().slice(0, 16) : "");
    setNoticeTargetType((n.target_type as typeof noticeTargetType) || "global");
    setShowNoticeForm(true);
  };

  // ─── Render helpers ──────────────────────────────────────────────────────────

  const renderChurchTree = (items: ChurchSummary[], level = 0): React.ReactNode =>
    items.map(c => {
      const isHighlight = ["matriz", "sede", "convencao", "national_convention", "state_convention", "international_convention"].includes(c.organization_type);
      return (
        <div key={c.id}>
          <div className={`flex items-center justify-between p-3 hover:bg-secondary/20 transition-colors ${level > 0 ? "border-l-2 border-accent/20" : ""}`}
            style={{ paddingLeft: `${16 + level * 24}px` }}>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isHighlight ? "bg-accent/20" : "bg-secondary"}`}>
                <Church size={16} className={isHighlight ? "text-accent" : "text-muted-foreground"} />
              </div>
              <div className="min-w-0">
                <span className="text-sm font-medium truncate block">{c.name}</span>
                <p className="text-xs text-muted-foreground truncate">
                  {c.city || "Sem cidade"}{c.state ? `, ${c.state}` : ""} · {c.organization_type}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => handleCopyInvite(c.slug, c.name)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors" title="Copiar link de convite">
                <Link2 size={14} className="text-muted-foreground" />
              </button>
              <button onClick={() => handleDeleteChurch(c.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors">
                <Trash2 size={14} className="text-destructive" />
              </button>
            </div>
          </div>
          {c.children.length > 0 && renderChurchTree(c.children, level + 1)}
        </div>
      );
    });

  // ─── Access guard ────────────────────────────────────────────────────────────

  if (roleLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  if (!isSuperAdmin) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Acesso negado</p>
        </div>
      </AdminLayout>
    );
  }

  // ─── Tabs definition ─────────────────────────────────────────────────────────

  const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "overview",     label: "Visão Geral",  icon: LayoutGrid },
    { key: "churches",     label: "Organizações",  icon: Building2 },
    { key: "team",         label: "Equipe",        icon: Users },
    { key: "departments",  label: "Departamentos", icon: Layers },
    { key: "tickets",      label: "Chamados",      icon: Ticket },
    { key: "conversas",    label: "Conversas",     icon: MessageSquare },
    { key: "reunioes",     label: "Reuniões",      icon: Video },
    { key: "audit",        label: "Auditoria",     icon: ClipboardList },
    { key: "notices",      label: "Avisos",        icon: Bell },
  ];

  const matrizOrgs = flatChurches.filter(c => c.organization_type === "matriz" || c.organization_type === "sede");

  // ─── JSX ─────────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-accent/10 rounded-xl">
            <LayoutGrid size={24} className="text-accent" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif tracking-tight">Painel da Plataforma</h1>
            <p className="text-sm text-muted-foreground">Central de operação, suporte e gestão da plataforma Ecclesia.</p>
          </div>
        </div>

        {/* Tabs — scrollable on mobile */}
        <div className="flex gap-1 bg-secondary/30 rounded-lg p-1 overflow-x-auto">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${activeTab === tab.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <tab.icon size={14} /> <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* ── VISÃO GERAL ─────────────────────────────────────────────── */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {[
                    { label: "Total de Igrejas",       value: metrics.totalOrgs,          icon: Building2,   color: "text-blue-600 bg-blue-500/10" },
                    { label: "Igrejas Matriz/Sede",     value: metrics.matrizOrgs,         icon: Crown,       color: "text-indigo-600 bg-indigo-500/10" },
                    { label: "Total de Usuários",       value: metrics.totalUsers,         icon: Users,       color: "text-emerald-600 bg-emerald-500/10" },
                    { label: "Agentes da Plataforma",   value: metrics.platformAgents,     icon: Shield,      color: "text-amber-600 bg-amber-500/10" },
                    { label: "Departamentos Ativos",    value: metrics.activeDepartments,  icon: Layers,      color: "text-purple-600 bg-purple-500/10" },
                    { label: "Chamados Abertos",        value: metrics.openTickets,        icon: Ticket,      color: "text-orange-600 bg-orange-500/10" },
                    { label: "Em Atendimento",          value: metrics.inProgressTickets,  icon: Activity,    color: "text-cyan-600 bg-cyan-500/10" },
                    { label: "Chamados Urgentes",       value: metrics.urgentTickets,      icon: AlertCircle, color: "text-red-600 bg-red-500/10" },
                    { label: "Agentes Online",          value: metrics.onlineAgents,       icon: Wifi,        color: "text-green-600 bg-green-500/10" },
                  ].map((item, i) => (
                    <motion.div key={item.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                      className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${item.color} mb-2`}>
                        <item.icon size={18} />
                      </div>
                      <p className="text-xl font-bold">{item.value}</p>
                      <p className="text-[10px] text-muted-foreground">{item.label}</p>
                    </motion.div>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button onClick={() => setActiveTab("churches")}
                    className="flex items-center gap-3 p-4 bg-card rounded-xl border border-border/50 hover:border-accent/30 transition-colors text-left">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                      <Building2 size={20} className="text-accent" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Igrejas cadastradas</p>
                      <p className="text-xs text-muted-foreground">{metrics.totalOrgs} organizações ativas</p>
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground ml-auto" />
                  </button>
                  <button onClick={() => setActiveTab("team")}
                    className="flex items-center gap-3 p-4 bg-card rounded-xl border border-border/50 hover:border-accent/30 transition-colors text-left">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                      <UserPlus size={20} className="text-accent" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Equipe da plataforma</p>
                      <p className="text-xs text-muted-foreground">{metrics.platformAgents} agentes configurados</p>
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground ml-auto" />
                  </button>
                  <button onClick={() => setActiveTab("tickets")}
                    className="flex items-center gap-3 p-4 bg-card rounded-xl border border-border/50 hover:border-accent/30 transition-colors text-left">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                      <Ticket size={20} className="text-accent" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Central de chamados</p>
                      <p className="text-xs text-muted-foreground">
                        {metrics.openTickets} abertos · {metrics.inProgressTickets} em atendimento
                      </p>
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground ml-auto" />
                  </button>
                </div>
              </div>
            )}

            {/* ── ORGANIZAÇÕES ────────────────────────────────────────────── */}
            {activeTab === "churches" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-serif text-lg">Todas as Organizações</h2>
                  {!isSupportModeActive && (
                    <button onClick={() => setShowChurchForm(!showChurchForm)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90">
                      <Plus size={14} /> Nova Organização
                    </button>
                  )}
                </div>

                {isSupportModeActive && (
                  <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 flex items-start gap-3">
                    <Layers size={18} className="text-accent flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium">
                        Atendendo {activeSupportOrg?.name ?? "organização"} — use o fluxo estrutural da organização ativa
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {structuralCreationGuidance(activeSupportOrg?.organization_type ?? null)}
                      </p>
                      <button onClick={() => navigate("/admin/congregacoes")}
                        className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90">
                        <ArrowRight size={12} /> Ir para a estrutura da organização
                      </button>
                    </div>
                  </div>
                )}

                {!isSupportModeActive && showChurchForm && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    className="bg-card rounded-xl shadow-sm border border-border/50 p-5 space-y-4">
                    <h3 className="text-sm font-medium">Criar Nova Organização</h3>
                    <p className="text-xs text-muted-foreground -mt-2">
                      Use somente para cadastrar uma organização raiz nova (ex.: nova convenção/rede). Para distritos e congregações de uma organização já existente, use o fluxo estrutural em "Unidades Locais".
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        { key: "name", placeholder: "Nome da igreja *" },
                        { key: "pastor_name", placeholder: "Nome do pastor" },
                        { key: "city", placeholder: "Cidade" },
                        { key: "state", placeholder: "Estado / País" },
                        { key: "email", placeholder: "E-mail" },
                        { key: "phone", placeholder: "Telefone" },
                      ].map(f => (
                        <input key={f.key} value={(churchForm as any)[f.key]}
                          onChange={e => setChurchForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                          placeholder={f.placeholder}
                          className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <select value={churchForm.organization_type}
                        onChange={e => setChurchForm(f => ({ ...f, organization_type: e.target.value, parent_id: ["sede", "convencao", "national_convention"].includes(e.target.value) ? "" : f.parent_id }))}
                        className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
                        <option value="sede">Sede Internacional</option>
                        <option value="national_convention">Convenção Nacional</option>
                        <option value="state_convention">Convenção Estadual</option>
                        <option value="convencao">Convenção / Regional</option>
                        <option value="matriz">Matriz Municipal</option>
                        <option value="setor">Setor</option>
                        <option value="congregacao">Congregação</option>
                      </select>
                      {!["sede", "national_convention"].includes(churchForm.organization_type) && (
                        <select value={churchForm.parent_id}
                          onChange={e => setChurchForm(f => ({ ...f, parent_id: e.target.value }))}
                          className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
                          <option value="">Selecione a organização mãe...</option>
                          {flatChurches.map(c => (
                            <option key={c.id} value={c.id}>{c.name} ({c.organization_type})</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleCreateChurch}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90">
                        Criar Organização
                      </button>
                      <button onClick={() => setShowChurchForm(false)}
                        className="px-4 py-2 bg-secondary text-foreground rounded-lg text-sm hover:bg-secondary/80">
                        Cancelar
                      </button>
                    </div>
                  </motion.div>
                )}

                <div className="bg-card rounded-xl shadow-sm border border-border/50 overflow-hidden">
                  {churches.length === 0 ? (
                    <p className="p-8 text-sm text-muted-foreground text-center">Nenhuma igreja cadastrada</p>
                  ) : (
                    <div className="divide-y divide-border/30">{renderChurchTree(churches)}</div>
                  )}
                </div>
              </div>
            )}

            {/* ── EQUIPE ──────────────────────────────────────────────────── */}
            {activeTab === "team" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-serif text-lg">Equipe da Plataforma</h2>
                    <p className="text-xs text-muted-foreground">Agentes com acesso operacional à plataforma Ecclesia</p>
                  </div>
                  <button onClick={() => setShowAgentForm(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90">
                    <UserPlus size={14} /> Novo agente da plataforma
                  </button>
                </div>

                {/* New Agent Form */}
                {showAgentForm && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    className="bg-card rounded-xl shadow-sm border border-accent/20 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Novo agente da plataforma</h3>
                      <button onClick={() => setShowAgentForm(false)} className="p-1 rounded hover:bg-secondary"><X size={14} /></button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      O usuário deve ter uma conta ativa na plataforma. O e-mail é usado para encontrar o perfil e configurar o acesso.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input value={agentForm.email} onChange={e => setAgentForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="E-mail do agente *"
                        className="sm:col-span-2 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                      <div className="sm:col-span-2">
                        <label className="text-xs text-muted-foreground mb-1 block">Função da plataforma</label>
                        <select value={agentForm.platform_role}
                          onChange={e => setAgentForm(f => ({ ...f, platform_role: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
                          {Object.entries(PLATFORM_ROLE_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Departamento principal</label>
                        <select value={agentForm.primary_dept}
                          onChange={e => setAgentForm(f => ({ ...f, primary_dept: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
                          <option value="">Nenhum</option>
                          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Departamentos secundários</label>
                        <div className="flex flex-wrap gap-1 p-2 rounded-lg border border-border bg-background min-h-[38px]">
                          {departments.filter(d => d.id !== agentForm.primary_dept).map(d => (
                            <button key={d.id} type="button"
                              onClick={() => {
                                const ids = agentForm.secondary_depts;
                                setAgentForm(f => ({ ...f, secondary_depts: ids.includes(d.id) ? ids.filter(i => i !== d.id) : [...ids, d.id] }));
                              }}
                              className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${agentForm.secondary_depts.includes(d.id) ? "bg-accent/20 border-accent text-accent" : "border-border text-muted-foreground hover:border-accent/50"}`}>
                              {d.name}
                            </button>
                          ))}
                        </div>
                      </div>
                      <input value={agentForm.phone} onChange={e => setAgentForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="Telefone / WhatsApp"
                        className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                      <input value={agentForm.city} onChange={e => setAgentForm(f => ({ ...f, city: e.target.value }))}
                        placeholder="Cidade base"
                        className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                      <input value={agentForm.state} onChange={e => setAgentForm(f => ({ ...f, state: e.target.value }))}
                        placeholder="Estado base"
                        className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                      <input value={agentForm.country} onChange={e => setAgentForm(f => ({ ...f, country: e.target.value }))}
                        placeholder="País"
                        className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                      <input value={agentForm.reference_church} onChange={e => setAgentForm(f => ({ ...f, reference_church: e.target.value }))}
                        placeholder="Igreja de referência"
                        className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                      <input value={agentForm.referred_by} onChange={e => setAgentForm(f => ({ ...f, referred_by: e.target.value }))}
                        placeholder="Indicado por"
                        className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                      <textarea value={agentForm.notes} onChange={e => setAgentForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="Observação interna..." rows={2}
                        className="sm:col-span-2 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveAgent} disabled={agentFormStatus === "saving"}
                        className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60 flex items-center gap-2">
                        {agentFormStatus === "saving" && <Loader2 size={14} className="animate-spin" />}
                        Confirmar agente
                      </button>
                      <button onClick={() => setShowAgentForm(false)}
                        className="px-4 py-2 bg-secondary text-foreground rounded-lg text-sm hover:bg-secondary/80">
                        Cancelar
                      </button>
                    </div>
                  </motion.div>
                )}

                {agentLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
                ) : (
                  <div className="space-y-2">
                    {agents.length === 0 && (
                      <div className="bg-card rounded-xl p-8 text-center text-sm text-muted-foreground border border-border/50">
                        Nenhum agente da plataforma configurado.
                      </div>
                    )}
                    {agents.map(agent => {
                      const initials = agent.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "?";
                      const isExpanded = expandedAgent === agent.user_id;
                      const roleLabel = PLATFORM_ROLE_LABELS[agent.platform_role as PlatformRole] || agent.platform_role;
                      return (
                        <div key={agent.user_id} className="bg-card rounded-xl border border-border/50 overflow-hidden">
                          <div className="flex items-center gap-3 p-4">
                            <div className="relative flex-shrink-0">
                              {agent.avatar_url ? (
                                <img src={agent.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-xs font-bold text-accent">
                                  {initials}
                                </div>
                              )}
                              <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${agent.is_online ? "bg-green-500" : "bg-muted"}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">{agent.full_name || "Sem nome"}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent font-semibold">{roleLabel}</span>
                                {agent.is_online && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-700">Online</span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{agent.email || "—"}</p>
                              {(agent.departments?.length || 0) > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {agent.departments?.slice(0, 3).map(d => (
                                    <span key={d.id} className={`text-[10px] px-1.5 py-0.5 rounded-full ${d.id === agent.primary_dept?.id ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
                                      {d.name}
                                    </span>
                                  ))}
                                  {(agent.departments?.length || 0) > 3 && (
                                    <span className="text-[10px] text-muted-foreground">+{(agent.departments?.length || 0) - 3}</span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => setExpandedAgent(isExpanded ? null : agent.user_id)}
                                className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="border-t border-border/30 p-4 bg-secondary/20 space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1">Função da plataforma</p>
                                  <select defaultValue={agent.platform_role || ""}
                                    onChange={e => updateAgentRole(agent.user_id, e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-accent/30">
                                    {Object.entries(PLATFORM_ROLE_LABELS).map(([k, v]) => (
                                      <option key={k} value={k}>{v}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1">Departamento principal</p>
                                  <p className="text-sm">{agent.primary_dept?.name || "Não definido"}</p>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button onClick={() => deactivateAgent(agent.user_id, agent.full_name)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">
                                  <Trash2 size={12} /> Remover da equipe
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── DEPARTAMENTOS ───────────────────────────────────────────── */}
            {activeTab === "departments" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-serif text-lg">Departamentos de Suporte</h2>
                    <p className="text-xs text-muted-foreground">Departamentos dinâmicos — podem ser criados, editados e desativados</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => loadDepartments()} className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors" title="Recarregar">
                      <RefreshCw size={14} />
                    </button>
                    <button onClick={openNewDeptForm}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90">
                      <Plus size={14} /> Novo departamento
                    </button>
                  </div>
                </div>

                {/* Dept form */}
                {showDeptForm && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    className="bg-card rounded-xl shadow-sm border border-accent/20 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{editingDept ? "Editar departamento" : "Novo departamento"}</h3>
                      <button onClick={() => { setShowDeptForm(false); setEditingDept(null); }} className="p-1 rounded hover:bg-secondary"><X size={14} /></button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input value={deptForm.name}
                        onChange={e => setDeptForm(f => ({ ...f, name: e.target.value, slug: f.slug || autoSlug(e.target.value) }))}
                        placeholder="Nome do departamento *"
                        className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                      <input value={deptForm.slug}
                        onChange={e => setDeptForm(f => ({ ...f, slug: e.target.value }))}
                        placeholder="Slug único (auto-gerado)"
                        className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 font-mono" />
                      <textarea value={deptForm.description}
                        onChange={e => setDeptForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="Descrição..." rows={2}
                        className="sm:col-span-2 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none" />
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Módulos relacionados (separados por vírgula)</label>
                        <input value={deptForm.module_keys_raw}
                          onChange={e => setDeptForm(f => ({ ...f, module_keys_raw: e.target.value }))}
                          placeholder="ex: secretaria, membros, carteira_membros"
                          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 font-mono" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-muted-foreground">Ordem de exibição</label>
                        <input type="number" value={deptForm.sort_order}
                          onChange={e => setDeptForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                          className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                        <label className="flex items-center gap-2 text-xs mt-1 cursor-pointer">
                          <input type="checkbox" checked={deptForm.is_active}
                            onChange={e => setDeptForm(f => ({ ...f, is_active: e.target.checked }))} />
                          Ativo
                        </label>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveDept}
                        className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90">
                        {editingDept ? "Salvar alterações" : "Criar departamento"}
                      </button>
                      <button onClick={() => { setShowDeptForm(false); setEditingDept(null); }}
                        className="px-4 py-2 bg-secondary text-foreground rounded-lg text-sm hover:bg-secondary/80">
                        Cancelar
                      </button>
                    </div>
                  </motion.div>
                )}

                {deptLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
                ) : (
                  <div className="space-y-2">
                    {departments.length === 0 && (
                      <div className="bg-card rounded-xl p-8 text-center text-sm text-muted-foreground border border-border/50">
                        Nenhum departamento cadastrado. <br />
                        <span className="text-xs">A tabela <code className="font-mono">platform_support_departments</code> precisa existir no banco. Aplique a migration primeiro.</span>
                      </div>
                    )}
                    {departments.map(dept => (
                      <div key={dept.id} className={`bg-card rounded-xl border overflow-hidden transition-colors ${dept.is_active ? "border-border/50" : "border-border/20 opacity-60"}`}>
                        <div className="flex items-center justify-between p-4">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${dept.is_active ? "bg-accent/10" : "bg-secondary"}`}>
                              <Layers size={16} className={dept.is_active ? "text-accent" : "text-muted-foreground"} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">{dept.name}</span>
                                <span className="text-[10px] font-mono text-muted-foreground">{dept.slug}</span>
                                {!dept.is_active && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">Inativo</span>
                                )}
                              </div>
                              {dept.description && <p className="text-xs text-muted-foreground truncate">{dept.description}</p>}
                              <div className="flex flex-wrap gap-1 mt-1">
                                {dept.module_keys.slice(0, 5).map(mk => (
                                  <span key={mk} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{mk}</span>
                                ))}
                                {dept.module_keys.length > 5 && (
                                  <span className="text-[10px] text-muted-foreground">+{dept.module_keys.length - 5} módulos</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 ml-2">
                            <div className="text-right hidden sm:block">
                              <p className="text-sm font-bold">{dept.agent_count ?? "—"}</p>
                              <p className="text-[10px] text-muted-foreground">Agentes</p>
                            </div>
                            <div className="text-right hidden sm:block">
                              <p className="text-sm font-bold">{dept.ticket_count ?? "—"}</p>
                              <p className="text-[10px] text-muted-foreground">Chamados</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <button onClick={() => toggleDeptActive(dept)}
                                className="p-1.5 rounded-lg hover:bg-secondary transition-colors" title={dept.is_active ? "Desativar" : "Ativar"}>
                                {dept.is_active ? <EyeOff size={14} className="text-muted-foreground" /> : <Eye size={14} className="text-muted-foreground" />}
                              </button>
                              <button onClick={() => openEditDeptForm(dept)}
                                className="p-1.5 rounded-lg hover:bg-secondary transition-colors" title="Editar">
                                <PencilLine size={14} className="text-muted-foreground" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── CHAMADOS ────────────────────────────────────────────────── */}
            {activeTab === "tickets" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-serif text-lg">Central de Chamados</h2>
                  <button onClick={() => loadTickets()} className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors" title="Recarregar">
                    <RefreshCw size={14} />
                  </button>
                </div>

                {/* Status filter */}
                <div className="flex flex-wrap gap-1">
                  {[
                    { key: "all", label: "Todos" },
                    { key: "open", label: "Abertos" },
                    { key: "in_progress", label: "Em atendimento" },
                    { key: "waiting_church", label: "Aguardando igreja" },
                    { key: "waiting_support", label: "Aguardando suporte" },
                    { key: "escalated", label: "Escalados" },
                    { key: "resolved", label: "Resolvidos" },
                    { key: "closed", label: "Fechados" },
                  ].map(s => (
                    <button key={s.key} onClick={() => setTicketStatusFilter(s.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${ticketStatusFilter === s.key ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground hover:bg-secondary/80"}`}>
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* Dept filter — dynamic */}
                {departments.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <button onClick={() => setTicketDeptFilter("all")}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${ticketDeptFilter === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-secondary/80"}`}>
                      Todos depto.
                    </button>
                    {departments.filter(d => d.is_active).map(d => (
                      <button key={d.id} onClick={() => setTicketDeptFilter(d.id)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${ticketDeptFilter === d.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-secondary/80"}`}>
                        {d.name}
                      </button>
                    ))}
                  </div>
                )}

                {ticketLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
                ) : (
                  (() => {
                    const filtered = tickets.filter(t => {
                      if (ticketStatusFilter !== "all" && t.status !== ticketStatusFilter) return false;
                      if (ticketDeptFilter !== "all" && t.department_id !== ticketDeptFilter) return false;
                      return true;
                    });
                    return (
                      <div className="space-y-2">
                        {filtered.length === 0 && (
                          <div className="bg-card rounded-xl p-8 text-center text-sm text-muted-foreground border border-border/50">
                            Nenhum chamado para os filtros selecionados.
                          </div>
                        )}
                        {filtered.map(ticket => {
                          const isExpanded = expandedTicket === ticket.id;
                          return (
                            <div key={ticket.id} className="bg-card rounded-xl border border-border/50 overflow-hidden">
                              <div className="flex items-start justify-between p-4 gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${TICKET_STATUS_COLORS[ticket.status] || "bg-secondary text-muted-foreground"}`}>
                                      {TICKET_STATUS_LABELS[ticket.status] || ticket.status}
                                    </span>
                                    {ticket.priority !== "normal" && (
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${TICKET_PRIORITY_COLORS[ticket.priority] || ""}`}>
                                        {ticket.priority === "urgent" ? "Urgente" : ticket.priority === "high" ? "Alta" : ticket.priority}
                                      </span>
                                    )}
                                    {ticket.dept_name && ticket.dept_name !== "—" && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">{ticket.dept_name}</span>
                                    )}
                                  </div>
                                  <p className="text-sm font-medium truncate">{ticket.title || "Sem título"}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {ticket.org_name} · Agente: {ticket.agent_name} · {new Date(ticket.created_at).toLocaleDateString("pt-BR")}
                                  </p>
                                </div>
                                <button onClick={() => setExpandedTicket(isExpanded ? null : ticket.id)}
                                  className="p-1.5 rounded-lg hover:bg-secondary transition-colors flex-shrink-0">
                                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                              </div>

                              {isExpanded && (
                                <div className="border-t border-border/30 p-4 bg-secondary/20 space-y-3">
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                    <div><p className="text-muted-foreground">Organização</p><p className="font-medium">{ticket.org_name || "—"}</p></div>
                                    <div><p className="text-muted-foreground">Departamento</p><p className="font-medium">{ticket.dept_name || "—"}</p></div>
                                    <div><p className="text-muted-foreground">Módulo</p><p className="font-medium font-mono">{ticket.module_key || "—"}</p></div>
                                    <div><p className="text-muted-foreground">Agente</p><p className="font-medium">{ticket.agent_name}</p></div>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {ticket.status === "open" && (
                                      <button onClick={() => acceptTicket(ticket.id)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-accent text-accent-foreground hover:opacity-90 transition-colors">
                                        <Check size={12} /> Aceitar chamado
                                      </button>
                                    )}
                                    {ticket.status === "in_progress" && (
                                      <button onClick={() => resolveTicket(ticket.id)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-emerald-600 text-white hover:opacity-90 transition-colors">
                                        <Check size={12} /> Resolver
                                      </button>
                                    )}
                                    <button onClick={() => setTransferModal({ ticketId: ticket.id, title: ticket.title || "Chamado" })}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-colors">
                                      <ArrowRight size={12} /> Transferir
                                    </button>
                                    {ticket.organization_id && (
                                      <button onClick={() => attendOrg(ticket)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-colors">
                                        <ExternalLink size={12} /> Atender organização
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()
                )}

                {/* Transfer modal */}
                {transferModal && (
                  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-card rounded-xl shadow-xl border border-border p-5 w-full max-w-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Transferir chamado</h3>
                        <button onClick={() => setTransferModal(null)} className="p-1 rounded hover:bg-secondary"><X size={14} /></button>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{transferModal.title}</p>
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Departamento destino *</label>
                          <select value={transferForm.department_id}
                            onChange={e => setTransferForm(f => ({ ...f, department_id: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
                            <option value="">Selecione...</option>
                            {departments.filter(d => d.is_active).map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                        </div>
                        <textarea value={transferForm.note}
                          onChange={e => setTransferForm(f => ({ ...f, note: e.target.value }))}
                          placeholder="Observação sobre a transferência..." rows={2}
                          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={submitTransfer}
                          className="flex-1 px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90">
                          Transferir
                        </button>
                        <button onClick={() => setTransferModal(null)}
                          className="px-4 py-2 bg-secondary text-foreground rounded-lg text-sm hover:bg-secondary/80">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── CONVERSAS (fundação) ─────────────────────────────────────── */}
            {activeTab === "conversas" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <h2 className="font-serif text-lg">Conversas da Plataforma</h2>
                </div>
                <div className="bg-card rounded-xl p-8 text-center border border-border/50 space-y-3">
                  <MessageSquare size={32} className="text-muted-foreground mx-auto" />
                  <p className="text-sm font-medium">Comunicação interna da equipe</p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Conversas por agente, por departamento e vinculadas a chamados. <br />
                    Em implementação futura.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 mt-4">
                    {departments.filter(d => d.is_active).map(d => (
                      <div key={d.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/50 text-xs text-muted-foreground">
                        <Hash size={12} /> {d.name}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── REUNIÕES (fundação) ──────────────────────────────────────── */}
            {activeTab === "reunioes" && (
              <div className="space-y-4">
                <h2 className="font-serif text-lg">Reuniões Internas</h2>
                <div className="bg-card rounded-xl p-8 text-center border border-border/50 space-y-3">
                  <Video size={32} className="text-muted-foreground mx-auto" />
                  <p className="text-sm font-medium">Reuniões da equipe da plataforma</p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Reuniões por agente, por departamento e vinculadas a chamados. <br />
                    Em implementação futura.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                    {[
                      { icon: Plus, label: "Iniciar reunião", sub: "Reunião imediata" },
                      { icon: Clock, label: "Agendar reunião", sub: "Definir data/hora" },
                      { icon: Activity, label: "Reuniões ativas", sub: "0 em andamento" },
                    ].map(a => (
                      <div key={a.label} className="flex items-center gap-3 p-4 rounded-xl border border-border/30 opacity-50">
                        <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center">
                          <a.icon size={18} className="text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{a.label}</p>
                          <p className="text-xs text-muted-foreground">{a.sub}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── AUDITORIA ───────────────────────────────────────────────── */}
            {activeTab === "audit" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-serif text-lg">Auditoria da Plataforma</h2>
                  <button onClick={() => loadAudit()} className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors" title="Recarregar">
                    <RefreshCw size={14} />
                  </button>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-2">
                  <select value={auditActionFilter} onChange={e => setAuditActionFilter(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-accent/30">
                    <option value="all">Todas as ações</option>
                    {Object.entries(AUDIT_ACTION_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <select value={auditModuleFilter} onChange={e => setAuditModuleFilter(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-accent/30">
                    <option value="all">Todos os módulos</option>
                    <option value="chamados">Chamados</option>
                    <option value="team">Equipe</option>
                    <option value="departments">Departamentos</option>
                    <option value="suporte">Suporte</option>
                  </select>
                </div>

                {auditLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
                ) : (
                  (() => {
                    const filtered = auditLogs.filter(l => {
                      if (auditActionFilter !== "all" && l.action !== auditActionFilter) return false;
                      if (auditModuleFilter !== "all" && l.module_key !== auditModuleFilter) return false;
                      return true;
                    });
                    return (
                      <div className="bg-card rounded-xl border border-border/50 overflow-hidden">
                        {filtered.length === 0 ? (
                          <div className="p-8 text-center text-sm text-muted-foreground">Nenhum registro de auditoria encontrado.</div>
                        ) : (
                          <div className="divide-y divide-border/30">
                            {filtered.map(log => (
                              <div key={log.id} className="flex items-start gap-3 p-3 hover:bg-secondary/10 transition-colors">
                                <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                                  <ClipboardList size={14} className="text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-medium">{log.actor_name || "Sistema"}</span>
                                    <span className="text-xs text-muted-foreground">→</span>
                                    <span className="text-xs font-medium text-accent">
                                      {AUDIT_ACTION_LABELS[log.action] || log.action}
                                    </span>
                                    {log.module_key && (
                                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{log.module_key}</span>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {log.org_name !== "—" ? `${log.org_name} · ` : ""}{new Date(log.created_at).toLocaleString("pt-BR")}
                                  </p>
                                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                                    <p className="text-[10px] font-mono text-muted-foreground/70 mt-0.5 truncate">
                                      {JSON.stringify(log.metadata).slice(0, 120)}
                                    </p>
                                  )}
                                </div>
                                {log.actor_platform_role && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent font-medium shrink-0">
                                    {PLATFORM_ROLE_LABELS[log.actor_platform_role as PlatformRole] || log.actor_platform_role}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()
                )}
              </div>
            )}

            {/* ── AVISOS ──────────────────────────────────────────────────── */}
            {activeTab === "notices" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-serif text-lg">Avisos da Plataforma</h2>
                  <button onClick={() => { setEditingNoticeId(null); setShowNoticeForm(!showNoticeForm); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90">
                    <Plus size={14} /> Novo Aviso
                  </button>
                </div>

                {showNoticeForm && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    className="bg-card rounded-xl shadow-sm border border-border/50 p-5 space-y-3">
                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Título principal do banner</span>
                      <input type="text" placeholder="Título da campanha" value={noticeTitle}
                        onChange={e => setNoticeTitle(e.target.value)}
                        className="w-full bg-secondary/50 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 ring-accent/30" />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Texto/chamada do banner</span>
                      <input type="text" placeholder="Resumo curto da campanha" value={noticeShortDescription}
                        onChange={e => setNoticeShortDescription(e.target.value)}
                        className="w-full bg-secondary/50 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 ring-accent/30" />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Prompt visual da IA</span>
                      <textarea placeholder="Descreva a campanha, público, missão e atmosfera desejada" value={noticeFullContent}
                        onChange={e => setNoticeFullContent(e.target.value)} rows={3}
                        className="w-full bg-secondary/50 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 ring-accent/30 resize-none" />
                    </label>
                    <div className="space-y-3">
                      <p className="text-sm font-medium">Banner da campanha</p>
                      <div onDrop={handleNoticeImageDrop} onDragOver={e => e.preventDefault()}
                        className="rounded-xl border border-dashed border-border bg-secondary/30 p-4">
                        {noticeImagePreview ? (
                          <div className="flex aspect-video max-h-[360px] w-full items-center justify-center overflow-hidden rounded-lg bg-background/70">
                            <img src={noticeImagePreview} alt="" className="h-full w-full object-fill" />
                          </div>
                        ) : (
                          <div className="flex min-h-48 flex-col items-center justify-center rounded-lg bg-background/60 px-4 text-center">
                            <Upload size={28} className="text-muted-foreground mb-3" />
                            <p className="text-sm font-medium">Arraste uma imagem aqui ou escolha do computador</p>
                          </div>
                        )}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <label className="inline-flex cursor-pointer items-center gap-1.5 px-3 py-2 bg-accent text-accent-foreground rounded-lg text-xs font-medium hover:opacity-90">
                            <Upload size={14} /> Escolher imagem
                            <input type="file" accept="image/*" onChange={handleNoticeImageUpload} className="hidden" />
                          </label>
                          <button type="button" onClick={handleGenerateBannerAi} disabled={noticeBannerGenerating || noticeImageUploading}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary text-foreground rounded-lg text-xs font-medium hover:bg-secondary/80 disabled:opacity-60">
                            {noticeBannerGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                            {noticeBannerGenerating ? "Gerando banner..." : "Gerar banner com IA"}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="block space-y-1.5 sm:col-span-2">
                        <span className="text-xs font-medium text-muted-foreground">Escopo</span>
                        <div className="flex flex-wrap gap-2">
                          {(["global", "national", "regional", "members"] as const).map(scope => {
                            const scopeLabel: Record<string, string> = {
                              global: "Global (todas as organizações)", national: "Nacional",
                              regional: "Regional", members: "Membros (interno)",
                            };
                            return (
                              <button key={scope} type="button" onClick={() => setNoticeTargetType(scope)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${noticeTargetType === scope ? "bg-accent text-accent-foreground border-accent" : "bg-secondary/50 border-border text-muted-foreground hover:bg-secondary"}`}>
                                {scopeLabel[scope]}
                              </button>
                            );
                          })}
                        </div>
                      </label>
                      <input type="text" placeholder="Texto do botão" value={noticeButtonLabel}
                        onChange={e => setNoticeButtonLabel(e.target.value)}
                        className="bg-secondary/50 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 ring-accent/30" />
                      <input type="url" placeholder="Link da campanha" value={noticeButtonLink}
                        onChange={e => setNoticeButtonLink(e.target.value)}
                        className="bg-secondary/50 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 ring-accent/30" />
                      <input type="datetime-local" value={noticeStartsAt}
                        onChange={e => setNoticeStartsAt(e.target.value)}
                        className="bg-secondary/50 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 ring-accent/30" />
                      <input type="datetime-local" value={noticeEndsAt}
                        onChange={e => setNoticeEndsAt(e.target.value)}
                        className="bg-secondary/50 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 ring-accent/30" />
                    </div>
                    <button onClick={createNotice} disabled={noticeImageUploading || noticeBannerGenerating}
                      className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60">
                      {editingNoticeId ? "Salvar edição" : "Publicar"}
                    </button>
                  </motion.div>
                )}

                <div className="bg-card rounded-xl shadow-sm border border-border/50 overflow-hidden divide-y divide-border/30">
                  {notices.map(n => {
                    const scopeColors: Record<string, string> = {
                      global: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
                      national: "bg-blue-500/15 text-blue-700",
                      regional: "bg-teal-500/15 text-teal-700",
                      members: "bg-secondary text-muted-foreground",
                    };
                    const scopeLabels: Record<string, string> = { global: "Global", national: "Nacional", regional: "Regional", members: "Membros" };
                    return (
                      <div key={n.id} className="p-4 flex items-start justify-between gap-3">
                        {n.image_url && <img src={n.image_url} alt="" className="w-16 h-16 rounded-lg object-cover bg-secondary flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{n.title}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${n.is_active ? "bg-emerald-500/20 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                              {n.is_active ? "Ativo" : "Inativo"}
                            </span>
                            {n.target_type && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${scopeColors[n.target_type] ?? "bg-muted text-muted-foreground"}`}>
                                {scopeLabels[n.target_type] ?? n.target_type}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1">{new Date(n.starts_at ?? n.created_at).toLocaleDateString("pt-BR")}</p>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.full_content}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => toggleNotice(n.id, n.is_active)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                            {n.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          <button onClick={() => handleEditAnnouncement(n)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                            <PencilLine size={14} />
                          </button>
                          <button onClick={() => deleteNotice(n.id)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-destructive">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {notices.length === 0 && (
                    <p className="p-8 text-sm text-muted-foreground text-center">Nenhum aviso criado</p>
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
