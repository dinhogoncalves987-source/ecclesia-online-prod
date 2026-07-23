import { AdminLayout } from "@/components/AdminLayout";
import {
  Search, Plus, X, Trash2, Loader2, Upload, Pencil, CreditCard, Camera, ChevronRight,
  User, FileText, Phone, MapPin, Church, Briefcase, Users, BookOpen, Send, Building2,
  Shield,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { MemberWalletCard } from "@/components/MemberWalletCard";
import { MemberInviteModal } from "@/components/MemberInviteModal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { useLanguage } from "@/hooks/useLanguage";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";
import { BulkImportModal } from "@/components/BulkImportModal";
import { OperationalAssistant } from "@/components/OperationalAssistant";
import { insertWithOrganizationScope } from "@/lib/organizationScope";
import { canWriteSecretaria } from "@/lib/permissions";
import {
  MEMBER_STATUSES,
  MEMBER_STATUSES_NO_DELETE,
  isMemberStatus,
  type MemberStatus,
  ECCLESIASTICAL_FUNCTIONS,
  ADMINISTRATIVE_ROLES,
  GENDER_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  CIVIL_DOCUMENT_STATUS_OPTIONS,
  getCivilDocLabel,
} from "@/lib/secretariaConstants";

// ─── Types ───────────────────────────────────────────────────────────────────

type Member = {
  id: string;
  full_name: string;
  member_code: string | null;
  member_role: string | null;
  administrative_role: string | null;
  status: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  photo_url: string | null;
  birth_date: string | null;
  gender: string | null;
  marital_status: string | null;
  cpf: string | null;
  rg: string | null;
  rg_issuer: string | null;
  rg_issue_date: string | null;
  joined_at: string | null;
  address: string | null;
  zip_code: string | null;
  street: string | null;
  address_number: string | null;
  address_complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  baptized_at: string | null;
  conversion_date: string | null;
  congregation_id: string | null;
  sector_id: string | null;
  father_name: string | null;
  mother_name: string | null;
  spouse_name: string | null;
  notes: string | null;
  // Documentação civil
  civil_document_type: string | null;
  civil_document_status: string | null;
  civil_document_url: string | null;
  civil_document_uploaded_at: string | null;
  civil_document_notes: string | null;
  // Dados eclesiásticos adicionais
  holy_spirit_baptism_date: string | null;
  consecration_date: string | null;
};

type SubOrg = { id: string; name: string; organization_type: string };

type FilterStatus = "all" | MemberStatus;

const EMPTY_FORM: Omit<Member, "id"> = {
  full_name: "",
  member_code: "",
  member_role: "Membro",
  administrative_role: "Nenhum",
  status: "Ativo",
  phone: "",
  whatsapp: "",
  email: "",
  photo_url: null,
  birth_date: "",
  gender: "",
  marital_status: "",
  cpf: "",
  rg: "",
  rg_issuer: "",
  rg_issue_date: "",
  joined_at: "",
  address: null,
  zip_code: "",
  street: "",
  address_number: "",
  address_complement: "",
  neighborhood: "",
  city: "",
  state: "",
  baptized_at: "",
  conversion_date: "",
  congregation_id: null,
  sector_id: null,
  father_name: "",
  mother_name: "",
  spouse_name: "",
  notes: "",
  civil_document_type: "",
  civil_document_status: "Pendente",
  civil_document_url: null,
  civil_document_uploaded_at: null,
  civil_document_notes: "",
  holy_spirit_baptism_date: "",
  consecration_date: "",
};

// ─── Tabs definition ─────────────────────────────────────────────────────────

type Tab = {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  short: string;
};

const TABS: Tab[] = [
  { id: "pessoal",     label: "Dados Pessoais",       icon: User,    short: "Pessoal"   },
  { id: "documentos",  label: "Documentação Civil",   icon: FileText, short: "Doc. Civil" },
  { id: "contato",     label: "Contato",               icon: Phone,   short: "Contato"  },
  { id: "endereco",    label: "Endereço",              icon: MapPin,  short: "Endereço"  },
  { id: "eclesiastico",label: "Dados Eclesiásticos",   icon: Church,  short: "Igreja"   },
  { id: "funcao",      label: "Função / Cargo",        icon: Briefcase, short: "Cargo"  },
  { id: "familia",     label: "Família",               icon: Users,   short: "Família"  },
  { id: "observacoes", label: "Observações",           icon: BookOpen, short: "Obs."    },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function memberInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "Ativo":         return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "Visitante":     return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
    case "Congregado":    return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
    case "Falecido":      return "bg-slate-300/30 text-slate-600 dark:text-slate-400";
    case "Transferido":   return "bg-purple-500/10 text-purple-700 dark:text-purple-400";
    case "Em disciplina": return "bg-red-500/10 text-red-700 dark:text-red-400";
    case "Afastado":      return "bg-orange-500/10 text-orange-700 dark:text-orange-400";
    default:              return "bg-muted text-muted-foreground";
  }
}

function MemberAvatar({ member, size = "sm" }: { member: Pick<Member, "full_name" | "photo_url">; size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "lg" ? "w-16 h-16 text-base" : size === "md" ? "w-10 h-10 text-sm" : "w-8 h-8 text-xs";
  if (member.photo_url) {
    return (
      <img
        src={member.photo_url}
        alt={member.full_name}
        className={`${sizeClass} rounded-full object-cover ring-2 ring-background flex-shrink-0`}
      />
    );
  }
  return (
    <div className={`${sizeClass} rounded-full bg-accent/10 flex items-center justify-center font-semibold text-accent flex-shrink-0`}>
      {memberInitials(member.full_name)}
    </div>
  );
}

function FormInput({
  label, value, onChange, type = "text", placeholder, required, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean; disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
      />
    </div>
  );
}

function FormSelect({
  label, value, onChange, options, required,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: readonly string[] | string[]; required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">— Selecionar —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Membros() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { church, loading: churchLoading } = useChurch();
  const { canonicalRole, hasCapability, canAccess } = useRole();
  const canWrite = hasCapability("members.write") || canWriteSecretaria(canonicalRole);
  const location = useLocation();
  const navigate = useNavigate();

  // Context filter: when navigated from Hierarquia/Congregacoes
  type ContextFilter = { orgId: string; orgName: string; orgType: string } | null;
  const [contextFilter, setContextFilter] = useState<ContextFilter>(() => {
    const s = location.state as Record<string, unknown> | null;
    if (s?.contextOrganizationId && s?.contextOrganizationName) {
      return { orgId: s.contextOrganizationId as string, orgName: s.contextOrganizationName as string, orgType: (s.contextOrganizationType as string) ?? "" };
    }
    return null;
  });

  useEffect(() => {
    const s = location.state as Record<string, unknown> | null;
    if (s?.contextOrganizationId && s?.contextOrganizationName) {
      setContextFilter({
        orgId: s.contextOrganizationId as string,
        orgName: s.contextOrganizationName as string,
        orgType: (s.contextOrganizationType as string) ?? "",
      });
    }
  }, [location.state]);

  // When contextFilter is a subsede, load the congregation IDs under it
  useEffect(() => {
    if (!contextFilter || contextFilter.orgType !== "subsede") {
      setSubsedeCongregationIds([]);
      return;
    }
    let cancelled = false;
    supabase
      .from("organizations")
      .select("id")
      .eq("parent_id", contextFilter.orgId)
      .eq("active", true)
      .eq("organization_type", "congregacao")
      .then(({ data }) => {
        if (cancelled) return;
        setSubsedeCongregationIds((data ?? []).map((o: { id: string }) => o.id));
      });
    return () => { cancelled = true; };
  }, [contextFilter]);

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [showImport, setShowImport] = useState(false);
  const [walletMember, setWalletMember] = useState<Member | null>(null);

  // Modal form state
  const [modalOpen, setModalOpen] = useState(false);
  const [isNewMember, setIsNewMember] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("pessoal");
  const [form, setForm] = useState<Omit<Member, "id">>({ ...EMPTY_FORM });

  // Photo upload
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const civilDocumentInputRef = useRef<HTMLInputElement>(null);
  const [civilDocumentFile, setCivilDocumentFile] = useState<File | null>(null);
  const [uploadingCivilDocument, setUploadingCivilDocument] = useState(false);

  // Sub-organizations (sectors + congregations)
  const [subOrgs, setSubOrgs] = useState<SubOrg[]>([]);

  // Congregation IDs under a subsede (for subsede member context)
  const [subsedeCongregationIds, setSubsedeCongregationIds] = useState<string[]>([]);

  // Invite modal (shown after creating a new member)
  const [inviteModal, setInviteModal] = useState<{
    open: boolean;
    memberId: string;
    memberName: string;
    phone: string | null;
    email: string | null;
  } | null>(null);

  const setField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  // ── Load members ────────────────────────────────────────────────────────────

  const reloadMembers = useCallback(async () => {
    if (!church) return;
    // Filtro aplicado ANTES do order para garantir que o PostgREST respeite o escopo
    const { data, error } = await supabase
      .from("members")
      .select("*")
      .eq("organization_id", church.id)
      .order("full_name", { ascending: true });
    if (import.meta.env.DEV) {
      console.log("[Membros] Supabase retornou", data?.length ?? 0, data?.slice(0, 3));
    }
    if (error) { console.error("[Membros] Erro ao carregar:", error); toast.error(t("Erro ao carregar membros")); return; }
    setMembers((data as Member[]) || []);
  }, [church, t]);

  // ── Load sub-organizations for selectors (matrix + setores + congregações) ────

  const reloadSubOrgs = useCallback(async () => {
    if (!church) return;
    // Step 1: direct children of matrix (setores)
    const { data: children } = await supabase
      .from("organizations")
      .select("id, name, organization_type")
      .eq("parent_id", church.id)
      .eq("active", true);
    const childIds = (children || []).map(c => c.id);
    // Step 2: grandchildren (congregações under setores) — only if setores exist
    let grandchildren: SubOrg[] = [];
    if (childIds.length > 0) {
      const { data: gc } = await supabase
        .from("organizations")
        .select("id, name, organization_type")
        .in("parent_id", childIds)
        .eq("active", true);
      grandchildren = (gc as SubOrg[]) || [];
    }
    // Combine: include matrix itself + all descendants
    const all: SubOrg[] = [
      { id: church.id, name: church.name, organization_type: church.organization_type || "matriz" },
      ...((children as SubOrg[]) || []),
      ...grandchildren,
    ].sort((a, b) => a.name.localeCompare(b.name));
    setSubOrgs(all);
  }, [church]);

  useEffect(() => {
    if (!user || churchLoading) return;
    if (!church) { setMembers([]); setLoading(false); return; }
    const load = async () => {
      setLoading(true);
      await Promise.all([reloadMembers(), reloadSubOrgs()]);
      setLoading(false);
    };
    load();
  }, [user, church, churchLoading, reloadMembers, reloadSubOrgs]);

  // ── Filtering ───────────────────────────────────────────────────────────────

  // Membros da unidade em foco: toda a matriz (sem contextFilter) OU somente a
  // congregação/setor selecionado (com contextFilter). Contadores do cabeçalho
  // e o "Nenhum membro encontrado" devem ser calculados sobre este escopo —
  // nunca sobre o total da matriz quando uma congregação está selecionada.
  // Subsedes: lista membros de todas as congregações filhas da subsede.
  const scopedMembers = contextFilter
    ? contextFilter.orgType === "subsede"
      ? subsedeCongregationIds.length > 0
        ? members.filter(m =>
            m.congregation_id !== null &&
            subsedeCongregationIds.includes(m.congregation_id),
          )
        : [] // subsede sem congregações = lista vazia
      : members.filter(m =>
          m.congregation_id === contextFilter.orgId ||
          m.sector_id       === contextFilter.orgId,
        )
    : members;

  const filtered = scopedMembers.filter(m => {
    if (filterStatus !== "all" && m.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        m.full_name.toLowerCase().includes(q) ||
        (m.member_code || "").toLowerCase().includes(q) ||
        (m.member_role || "").toLowerCase().includes(q) ||
        (m.administrative_role || "").toLowerCase().includes(q) ||
        (m.email || "").toLowerCase().includes(q) ||
        (m.phone || "").includes(q)
      );
    }
    return true;
  });

  // ── Photo upload ─────────────────────────────────────────────────────────────

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error(t("Foto muito grande (máx. 5MB)")); return; }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  // Usa o bucket 'avatars' (existente desde migration inicial) com
  // path members/{memberId}.{ext} para separar de avatars de usuário.
  const uploadPhotoIfNeeded = async (memberId: string): Promise<string | null> => {
    if (!photoFile) return form.photo_url;
    setUploadingPhoto(true);
    try {
      const ext = photoFile.name.split(".").pop() || "jpg";
      const path = `members/${memberId}.${ext}`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, photoFile, { upsert: true, contentType: photoFile.type });
      if (error) {
        toast.warning(`${t("Foto não salva:")} ${error.message}`);
        return null;
      }
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      return urlData?.publicUrl ?? null;
    } catch (e) {
      toast.warning(t("Erro inesperado no upload da foto."));
      return null;
    } finally {
      setUploadingPhoto(false);
    }
  };

  // ── Open modal ───────────────────────────────────────────────────────────────

  const handleCivilDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error(t("Documento invalido. Use PDF, JPG, PNG ou WEBP."));
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error(t("Documento muito grande (max. 10MB)."));
      return;
    }

    setCivilDocumentFile(file);
  };

  const uploadCivilDocumentIfNeeded = async (memberId: string): Promise<string | null> => {
    if (!civilDocumentFile) return form.civil_document_url || null;
    if (!church) return null;

    setUploadingCivilDocument(true);
    try {
      const ext = civilDocumentFile.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
      const path = `${church.id}/${memberId}/civil-document.${ext}`;

      const { error } = await supabase.storage
        .from("member-documents")
        .upload(path, civilDocumentFile, { upsert: true, contentType: civilDocumentFile.type });

      if (error) {
        toast.error(t("Erro ao enviar documento civil"), { description: error.message });
        return null;
      }

      return path;
    } catch {
      toast.error(t("Erro inesperado no upload do documento civil."));
      return null;
    } finally {
      setUploadingCivilDocument(false);
    }
  };

  const openCivilDocument = async () => {
  if (civilDocumentFile) {
    const localUrl = URL.createObjectURL(civilDocumentFile);
    window.open(localUrl, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(localUrl), 60 * 1000);
    return;
  }

  if (!form.civil_document_url) return;

    if (form.civil_document_url.startsWith("http")) {
      window.open(form.civil_document_url, "_blank", "noopener,noreferrer");
      return;
    }

    const { data, error } = await supabase.storage
      .from("member-documents")
      .createSignedUrl(form.civil_document_url, 60 * 10);

    if (error || !data?.signedUrl) {
      toast.error(t("Nao foi possivel abrir o documento."), { description: error?.message });
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };
  // Ao cadastrar dentro de uma congregação/setor selecionado (contextFilter),
  // o novo membro precisa nascer já vinculado a essa unidade — senão ele cai
  // fora do escopo filtrado e "desaparece" da lista até o usuário reabrir a
  // tela sem filtro. organization_id continua sendo a matriz (church.id),
  // gravado separadamente em handleSave; aqui só decidimos sector_id/congregation_id.
  const SECTOR_TYPES = ["setor", "district"];
  const openNew = () => {
    setIsNewMember(true);
    setEditingId(null);
    const isSectorContext = !!contextFilter && SECTOR_TYPES.includes(contextFilter.orgType);
    setForm({
      ...EMPTY_FORM,
      sector_id:       isSectorContext ? contextFilter!.orgId : null,
      congregation_id: contextFilter && !isSectorContext ? contextFilter.orgId : null,
    });
    setPhotoPreview(null);
    setPhotoFile(null);
    setCivilDocumentFile(null);
    setActiveTab("pessoal");
    setModalOpen(true);
  };

  const openEdit = (m: Member) => {
    setIsNewMember(false);
    setEditingId(m.id);
    setForm({
      full_name:         m.full_name,
      member_code:       m.member_code || "",
      member_role:       m.member_role || "Membro",
      administrative_role: m.administrative_role || "Nenhum",
      status:            isMemberStatus(m.status) ? m.status : "Ativo",
      phone:             m.phone || "",
      whatsapp:          m.whatsapp || "",
      email:             m.email || "",
      photo_url:         m.photo_url || null,
      birth_date:        m.birth_date || "",
      gender:            m.gender || "",
      marital_status:    m.marital_status || "",
      cpf:               m.cpf || "",
      rg:                m.rg || "",
      rg_issuer:         m.rg_issuer || "",
      rg_issue_date:     m.rg_issue_date || "",
      joined_at:         m.joined_at || "",
      address:           m.address || null,
      zip_code:          m.zip_code || "",
      street:            m.street || "",
      address_number:    m.address_number || "",
      address_complement: m.address_complement || "",
      neighborhood:      m.neighborhood || "",
      city:              m.city || "",
      state:             m.state || "",
      baptized_at:       m.baptized_at || "",
      conversion_date:   m.conversion_date || "",
      congregation_id:   m.congregation_id || null,
      sector_id:         m.sector_id || null,
      father_name:       m.father_name || "",
      mother_name:       m.mother_name || "",
      spouse_name:       m.spouse_name || "",
      notes:             m.notes || "",
      civil_document_type:   m.civil_document_type || getCivilDocLabel(m.marital_status || "") || "",
      civil_document_status: m.civil_document_status || "Pendente",
      civil_document_url:    m.civil_document_url || null,
      civil_document_uploaded_at: m.civil_document_uploaded_at || null,
      civil_document_notes:  m.civil_document_notes || "",
      holy_spirit_baptism_date: m.holy_spirit_baptism_date || "",
      consecration_date:        m.consecration_date || "",
    });
    setPhotoPreview(m.photo_url || null);
    setPhotoFile(null);
    setCivilDocumentFile(null);
    setActiveTab("pessoal");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setPhotoPreview(null);
    setPhotoFile(null);
    setCivilDocumentFile(null);
  };

  // ── Schema / RLS error detection ─────────────────────────────────────────────

  /**
   * PGRST204 — column doesn't exist in PostgREST schema cache.
   * This means migration 20260617120000_members_extended_fields.sql has not
   * been applied yet.
   */
  const isMissingColumnError = (err: { message?: string; code?: string } | null): boolean =>
    !!err && (
      err.code === "PGRST204" ||
      (!!err.message && (
        err.message.includes("schema cache") ||
        err.message.startsWith("Could not find the '")
      ))
    );

  // Postgres 23505 (unique_violation) no índice parcial members_org_member_code_unique_idx —
  // ver migration 20260717190000_members_add_member_code.sql
  const isDuplicateMemberCodeError = (err: { message?: string; code?: string } | null): boolean =>
    !!err && err.code === "23505" && !!err.message?.includes("members_org_member_code_unique_idx");

  /**
   * PGRST116 — the UPDATE found 0 matching rows.
   * This is PostgREST's response when the USING clause of an RLS policy
   * blocks the row, or when no row with that ID exists.
   */
  const isNoRowsError = (err: { message?: string; code?: string } | null): boolean =>
    !!err && err.code === "PGRST116";

  /**
   * Core payload — ONLY columns that existed before migration 20260617120000.
   * These columns are guaranteed to exist in any environment.
   * Concatenates individual address fields into the legacy `address` column.
   */
  const buildCorePayload = () => ({
    full_name:   form.full_name.trim(),
    member_role: form.member_role || "Membro",
    status:      form.status,
    phone:       form.phone?.trim()  || null,
    email:       form.email?.trim()  || null,
    notes:       form.notes?.trim()  || null,
    joined_at:   form.joined_at      || null,
    baptized_at: form.baptized_at    || null,
    birth_date:  form.birth_date     || null,
    city:        form.city?.trim()   || null,
    state:       form.state?.trim()  || null,
    address: [form.street, form.address_number, form.neighborhood, form.city, form.state]
      .filter(Boolean).join(", ") || form.address || null,
  });

  /**
   * Extended payload — ONLY the new columns added by migration 20260617120000.
   * Separated from core so it can fail gracefully if the migration is not applied.
   */
  const buildExtendedPayload = (photoUrl: string | null, civilDocumentUrl: string | null) => {
    // civil_document_type: auto-compute from marital_status, fallback to form value
    const civilDocType = getCivilDocLabel(form.marital_status || "") || form.civil_document_type?.trim() || null;
    return {
      photo_url:          photoUrl,
      member_code:        form.member_code?.trim() || null,
      whatsapp:           form.whatsapp?.trim() || null,
      gender:             form.gender || null,
      marital_status:     form.marital_status || null,
      cpf:                form.cpf?.trim() || null,
      // RG fields kept for backward compat — not exposed in UI anymore
      rg:                 form.rg?.trim() || null,
      rg_issuer:          form.rg_issuer?.trim() || null,
      rg_issue_date:      form.rg_issue_date || null,
      zip_code:           form.zip_code?.trim() || null,
      street:             form.street?.trim() || null,
      address_number:     form.address_number?.trim() || null,
      address_complement: form.address_complement?.trim() || null,
      neighborhood:       form.neighborhood?.trim() || null,
      // conversion_date kept for backward compat — not exposed in UI anymore
      conversion_date:    form.conversion_date || null,
      administrative_role: form.administrative_role === "Nenhum" ? null : (form.administrative_role || null),
      father_name:        form.father_name?.trim() || null,
      mother_name:        form.mother_name?.trim() || null,
      spouse_name:        form.spouse_name?.trim() || null,
      sector_id:          form.sector_id || null,
      congregation_id:    form.congregation_id || null,
      // Documentação civil
      civil_document_type:   civilDocType,
      civil_document_status: form.civil_document_status || "Pendente",
      civil_document_url:    civilDocumentUrl,
      civil_document_uploaded_at: civilDocumentUrl ? (civilDocumentFile ? new Date().toISOString() : form.civil_document_uploaded_at || new Date().toISOString()) : null,
      civil_document_notes:  form.civil_document_notes?.trim() || null,
      // Dados eclesiásticos adicionais
      holy_spirit_baptism_date: form.holy_spirit_baptism_date || null,
      consecration_date:        form.consecration_date || null,
    };
  };

  // ── Wizard tab validation ────────────────────────────────────────────────────

  /**
   * Validates the current tab before allowing forward navigation.
   * Returns true if navigation is allowed, false (+ toast) if blocked.
   * Backward navigation is always allowed.
   */
  const validateCurrentTabBeforeLeaving = (fromTabId: string, toTabId: string): boolean => {
    const fromIdx = TABS.findIndex(t => t.id === fromTabId);
    const toIdx   = TABS.findIndex(t => t.id === toTabId);
    if (toIdx <= fromIdx) return true; // backward — always ok

    if (fromTabId === "pessoal") {
      if (!form.full_name.trim()) {
        toast.error(t("Informe o nome completo antes de continuar."));
        return false;
      }
      if (!form.cpf?.trim()) {
        toast.error(t("Informe o CPF antes de continuar."));
        return false;
      }
    }

    if (fromTabId === "contato") {
      if (!form.phone?.trim()) {
        toast.error(t("Informe o telefone antes de continuar."));
        return false;
      }
    }

    return true;
  };

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = async (openWallet = false) => {
    if (!form.full_name.trim()) {
      toast.error(t("Informe o nome completo antes de salvar."));
      setActiveTab("pessoal");
      return;
    }
    if (!form.cpf?.trim()) {
      toast.error(t("Informe o CPF antes de salvar."));
      setActiveTab("pessoal");
      return;
    }
    if (!form.phone?.trim()) {
      toast.error(t("Informe o telefone antes de salvar."));
      setActiveTab("contato");
      return;
    }
    if (!form.member_role) {
      toast.error(t("Função eclesiástica é obrigatória."));
      setActiveTab("funcao");
      return;
    }
    if (!user || !church) return;

    setSaving(true);
    try {
      // ── Helpers ───────────────────────────────────────────────────────────
      const tryExtended = async (memberId: string, photoUrl: string | null, civilDocumentUrl: string | null) => {
        const { error } = await supabase
          .from("members")
          .update(buildExtendedPayload(photoUrl, civilDocumentUrl))
          .eq("id", memberId)
          .select("id")
          .single();
        if (error && isDuplicateMemberCodeError(error)) {
          toast.error(t("Este código de membro já está em uso por outro membro desta igreja."), {
            description: t("Escolha outro código ou deixe o campo em branco."),
          });
          return false;
        }
        if (error && isMissingColumnError(error)) {
          console.warn("[Membros] extended fields need migration:", error.message);
          toast.warning(
            t("Dados básicos salvos. Para salvar foto, endereço, CPF e outros campos, aplique as migrations no Supabase Dashboard → SQL Editor:\n• 20260617120000_members_extended_fields.sql\n• 20260617130000_members_status_constraint_fix.sql"),
            { duration: 8000 }
          );
          return false;
        }
        if (error && !isNoRowsError(error)) {
          console.warn("[Membros] extended fields unexpected error:", error.message);
        }
        return !error;
      };

      if (isNewMember) {
        // ── INSERT: include all core fields directly ─────────────────────────
        const core = buildCorePayload();
        const { data: inserted, error: insErr } = await supabase
          .from("members")
          .insert({ ...core, created_by: user.id, organization_id: church.id })
          .select("id")
          .single();

        if (insErr || !inserted) {
          console.error("[Membros] insert error:", insErr);
          toast.error(t("Erro ao criar membro"), { description: insErr?.message ?? t("Falha ao inserir") });
          return;
        }

        const newId = inserted.id;
        console.log("[Membros] new member created:", newId);

        const photoUrl  = await uploadPhotoIfNeeded(newId);
        const civilDocumentUrl = await uploadCivilDocumentIfNeeded(newId);
        const allSaved  = await tryExtended(newId, photoUrl, civilDocumentUrl);
        if (allSaved) toast.success(t("Membro cadastrado com sucesso!"));

        await reloadMembers();
        if (openWallet) {
          const saved = members.find(m => m.id === newId) || { ...(form as Member), id: newId, photo_url: photoUrl, civil_document_url: civilDocumentUrl };
          setWalletMember(saved as Member);
        }
        closeModal();

        // Open invite modal after creating a new member
        const invitePhone = form.whatsapp?.trim() || form.phone?.trim() || null;
        setInviteModal({
          open:       true,
          memberId:   newId,
          memberName: form.full_name.trim(),
          phone:      invitePhone,
          email:      form.email?.trim() || null,
        });

      } else {
        // ── EDIT existing member ─────────────────────────────────────────────
        if (!editingId) {
          toast.error(t("ID do membro não encontrado. Feche e tente novamente."));
          return;
        }

        console.log("[Membros][EDIT] id=", editingId);

        // Step 1 — core fields (columns that always exist)
        const { data: coreRow, error: coreErr } = await supabase
          .from("members")
          .update(buildCorePayload())
          .eq("id", editingId)
          .select("id")
          .single();

        console.log("[Membros][EDIT core]:", { saved: coreRow?.id, error: coreErr?.code, msg: coreErr?.message });

        if (coreErr) {
          if (isNoRowsError(coreErr)) {
            toast.error(t("Permissão negada."), {
              description: t("Nenhuma linha atualizada. Verifique se você tem acesso para editar este membro (RLS)."),
            });
          } else {
            toast.error(t("Erro ao salvar"), { description: coreErr.message });
          }
          return;
        }

        // Step 2 — photo upload + extended columns (best-effort)
        const photoUrl = await uploadPhotoIfNeeded(editingId);
        const civilDocumentUrl = await uploadCivilDocumentIfNeeded(editingId);
        const allSaved = await tryExtended(editingId, photoUrl, civilDocumentUrl);
        if (allSaved) toast.success(t("Membro atualizado com sucesso!"));

        await reloadMembers();
        closeModal();
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────────

  const removeMember = async (m: Member) => {
    if (!church) return;
    if (!confirm(`${t("Remover")} ${m.full_name}? ${t("Esta ação não pode ser desfeita.")}`)) return;
    const { error } = await supabase.from("members").delete()
      .eq("id", m.id).eq("organization_id", church.id);
    if (error) { toast.error(t("Erro ao remover"), { description: error.message }); return; }
    toast.success(t("Membro removido"));
    await reloadMembers();
  };

  const updateMemberStatus = async (id: string, newStatus: MemberStatus) => {
    if (!church) return;
    const { error } = await supabase.from("members").update({ status: newStatus })
      .eq("id", id).eq("organization_id", church.id);
    if (error) { toast.error(t("Erro ao atualizar"), { description: error.message }); return; }
    toast.success(t("Status atualizado"));
    await reloadMembers();
  };

  // ── Bulk import ──────────────────────────────────────────────────────────────

  const memberFields = [
    { key: "name",         label: t("Nome"),              required: true },
    { key: "member_code",  label: t("Código do Membro") },
    { key: "cpf",          label: t("CPF"),               required: true },
    { key: "phone",        label: t("Telefone"),          required: true },
    { key: "role",         label: t("Função") },
    { key: "email",        label: t("E-mail") },
    { key: "status",       label: t("Status") },
  ];

  const memberTemplate = [
    { name: "João Silva",  member_code: "0001", cpf: "000.000.000-01", phone: "(11) 99999-0001", role: "Diácono", email: "joao@email.com",  status: "Ativo" },
    { name: "Maria Souza", member_code: "0002", cpf: "000.000.000-02", phone: "(11) 99999-0002", role: "Membro",  email: "maria@email.com", status: "Ativo" },
  ];

  const handleBulkImport = async (rows: Record<string, string>[]) => {
    if (!user || !church) return { success: 0, errors: 0 };
    let success = 0, errors = 0;
    for (const row of rows) {
      if (!row.name || !row.cpf || !row.phone) { errors++; continue; }
      const status = row.status && isMemberStatus(row.status) ? row.status : "Ativo";
      const { error } = await insertWithOrganizationScope("members", church.id, {
        created_by: user.id,
        full_name: row.name,
        member_code: row.member_code?.trim() || null,
        member_role: row.role || "Membro",
        cpf: row.cpf || null,
        phone: row.phone || null,
        email: row.email || null,
        joined_at: new Date().toISOString().split("T")[0],
        status,
      });
      if (error) {
        console.warn("[Membros] bulk import row failed:", String((error as { message?: string }).message || ""));
        errors++;
      } else {
        success++;
      }
    }
    if (success > 0) await reloadMembers();
    return { success, errors };
  };

  // ── Stats ────────────────────────────────────────────────────────────────────

  const activeCount     = scopedMembers.filter(m => m.status === "Ativo").length;
  const visitanteCount  = scopedMembers.filter(m => m.status === "Visitante").length;
  const falecidoCount   = scopedMembers.filter(m => m.status === "Falecido").length;
  const transferidoCount = scopedMembers.filter(m => m.status === "Transferido").length;

  const canDeleteMember = (m: Member) =>
    canWrite && !MEMBER_STATUSES_NO_DELETE.includes(m.status as MemberStatus);

  // ── Sub-org label helper ─────────────────────────────────────────────────────

  const orgName = (id: string | null) => subOrgs.find(o => o.id === id)?.name ?? null;

  // ── Wallet member with congregation name ─────────────────────────────────────

  const toWalletMember = (m: Member) => ({
    id: m.id,
    full_name: m.full_name,
    member_code: m.member_code,
    member_role: m.member_role,
    administrative_role: m.administrative_role,
    status: m.status,
    phone: m.phone,
    email: m.email,
    photo_url: m.photo_url,
    cpf: m.cpf,
    birth_date: m.birth_date,
    baptism_date: m.baptized_at,
    congregation: orgName(m.congregation_id) ?? orgName(m.sector_id) ?? null,
    pastor_name: null,
    parent_names: [m.father_name, m.mother_name].filter(Boolean).join(" / ") || null,
    joined_at: m.joined_at,
  });

  const filterOptions: FilterStatus[] = ["all", ...MEMBER_STATUSES];
  const sectors       = subOrgs.filter(o => o.organization_type === "setor" || o.organization_type === "district");
  const congregations = subOrgs.filter(o => o.organization_type === "congregacao" || o.organization_type === "congregation" || o.organization_type === "church");

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif tracking-tight">{t("Membros")}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {scopedMembers.length} {t("cadastrados")} · {activeCount} {t("ativos")} · {visitanteCount} {t("visitantes")}
              {falecidoCount > 0 && ` · ${falecidoCount} ${t("falecidos")}`}
              {transferidoCount > 0 && ` · ${transferidoCount} ${t("transferidos")}`}
            </p>
          </div>
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <OperationalAssistant
                module="member"
                fields={[
                  { key: "name", label: t("Nome"), required: true },
                  { key: "member_code", label: t("Código do Membro") },
                  { key: "role", label: t("Função"), options: ["Pastor", "Diácono", "Diaconisa", "Obreiro", "Membro"] },
                  { key: "phone", label: t("Telefone") },
                  { key: "email", label: t("E-mail") },
                ]}
                onConfirm={async data => {
                  if (!data.name || !user || !church) throw new Error(t("Nome obrigatório"));
                  const { error } = await insertWithOrganizationScope("members", church.id, {
                    created_by: user.id, full_name: data.name, member_code: data.member_code?.trim() || null, member_role: data.role || "Membro",
                    phone: data.phone || null, email: data.email || null,
                    joined_at: new Date().toISOString().split("T")[0], status: "Ativo",
                  });
                  if (error) throw new Error(String((error as { message?: string }).message || ""));
                  await reloadMembers();
                  toast.success(t("Membro cadastrado!"));
                }}
                onEdit={data => {
                  setForm({ ...EMPTY_FORM, full_name: data.name || "", member_code: data.member_code || "", member_role: data.role || "Membro", phone: data.phone || "", email: data.email || "" });
                  setIsNewMember(true); setEditingId(null); setActiveTab("pessoal"); setModalOpen(true);
                }}
              />
              <button
                onClick={() => setShowImport(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
              >
                <Upload size={14} strokeWidth={1.5} /> {t("Importar")}
              </button>
              <button
                onClick={openNew}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <Plus size={16} strokeWidth={1.5} /> {t("Novo Membro")}
              </button>
            </div>
          )}
        </div>

        {/* Context filter banner — shown when navigated from Hierarquia */}
        {contextFilter && (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-accent/10 border border-accent/20 text-sm">
            <Building2 size={15} className="text-accent flex-shrink-0" />
            <span className="flex-1">
              Visualizando membros de <strong>{contextFilter.orgName}</strong>
            </span>
            <button
              type="button"
              onClick={() => setContextFilter(null)}
              className="text-muted-foreground hover:text-foreground p-0.5"
              title="Mostrar todos os membros"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Search + Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder={t("Buscar por nome, função ou contato...")}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-card rounded-lg shadow-[var(--shadow-sm)] text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <div className="flex gap-1 flex-wrap bg-secondary/50 rounded-lg p-0.5 max-w-full overflow-x-auto">
            {filterOptions.map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${filterStatus === s ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
                {s === "all" ? t("Todos") : t(s)}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loading || churchLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block bg-card rounded-xl shadow-executive overflow-hidden">
              {/* overflow-x-auto isolado do overflow-hidden externo: mantém os cantos arredondados e ainda permite rolagem horizontal se a tabela não couber (evita conteúdo cortado silenciosamente) */}
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">{t("Membro")}</th>
                    <th className="px-4 py-3 font-medium">{t("Função / Cargo")}</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">{t("Local")}</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">{t("Contato")}</th>
                    <th className="px-4 py-3 font-medium">{t("Status")}</th>
                    <th className="px-4 py-3 font-medium w-28">{t("Ações")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(m => (
                    <tr key={m.id}
                      onClick={() => canWrite && openEdit(m)}
                      className={`border-b border-border/30 transition-colors ${canWrite ? "hover:bg-secondary/30 cursor-pointer" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <MemberAvatar member={m} size="sm" />
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-medium">{m.full_name}</p>
                              {m.civil_document_status === "Pendente" && m.marital_status && (
                                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" title="Documentação civil pendente">
                                  doc. pendente
                                </span>
                              )}
                              {m.civil_document_status === "Rejeitado" && (
                                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" title="Documentação civil rejeitada">
                                  doc. rejeitado
                                </span>
                              )}
                              {m.civil_document_status === "Validado" && (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0 inline-block" title="Documentação civil validada" />
                              )}
                            </div>
                            {(m.member_code || m.birth_date) && (
                              <p className="text-[11px] text-muted-foreground">
                                {m.member_code && <span className="font-mono">#{m.member_code}</span>}
                                {m.member_code && m.birth_date && " · "}
                                {m.birth_date && `Admissão: ${m.joined_at ?? "—"}`}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm text-foreground">{m.member_role || "—"}</p>
                          {m.administrative_role && m.administrative_role !== "Nenhum" && (
                            <p className="text-[11px] text-muted-foreground">{m.administrative_role}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell">
                        {orgName(m.congregation_id) || orgName(m.sector_id) || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">
                        {m.phone || m.email || "—"}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        {canWrite ? (
                          <select
                            value={isMemberStatus(m.status) ? m.status : "Ativo"}
                            onChange={e => updateMemberStatus(m.id, e.target.value as MemberStatus)}
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer ${statusBadgeClass(m.status)}`}
                          >
                            {MEMBER_STATUSES.map(s => (
                              <option key={s} value={s}>{t(s)}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusBadgeClass(m.status)}`}>
                            {t(m.status)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={() => setWalletMember(m)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-accent/10 hover:bg-accent/20 text-accent text-[11px] font-medium transition-colors"
                            title={t("Carteira de Membro")}>
                            <CreditCard size={12} /> {t("Carteira")}
                          </button>
                          {canWrite && (
                            <>
                              <button type="button" onClick={() => openEdit(m)}
                                className="p-1 rounded hover:bg-secondary transition-colors" title={t("Editar")}>
                                <Pencil size={14} className="text-muted-foreground" />
                              </button>
                              {canDeleteMember(m) ? (
                                <button type="button" onClick={() => removeMember(m)}
                                  className="p-1 rounded hover:bg-destructive/10 transition-colors" title={t("Remover")}>
                                  <Trash2 size={14} className="text-muted-foreground" />
                                </button>
                              ) : (
                                <span className="p-1 text-[10px] text-muted-foreground" title={t("Use alteração de status")}>—</span>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
                        {t("Nenhum membro encontrado.")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-2">
              {filtered.map((m, i) => (
                <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                  <div
                    role="button" tabIndex={0}
                    onClick={() => canWrite && openEdit(m)}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEdit(m); } }}
                    className="bg-card rounded-xl shadow-executive p-4 flex items-center gap-3 cursor-pointer hover:bg-secondary/20 transition-colors"
                  >
                    <MemberAvatar member={m} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">{m.full_name}</p>
                        {canWrite ? (
                          <select
                            value={isMemberStatus(m.status) ? m.status : "Ativo"}
                            onClick={e => e.stopPropagation()}
                            onChange={e => { e.stopPropagation(); updateMemberStatus(m.id, e.target.value as MemberStatus); }}
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border-0 flex-shrink-0 ${statusBadgeClass(m.status)}`}
                          >
                            {MEMBER_STATUSES.map(s => <option key={s} value={s}>{t(s)}</option>)}
                          </select>
                        ) : (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${statusBadgeClass(m.status)}`}>{t(m.status)}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-muted-foreground truncate">{m.member_role || "—"}</p>
                        {m.administrative_role && m.administrative_role !== "Nenhum" && (
                          <span className="text-[10px] text-muted-foreground/60">· {m.administrative_role}</span>
                        )}
                        {m.member_code && (
                          <span className="text-[10px] text-muted-foreground/60 font-mono">· #{m.member_code}</span>
                        )}
                      </div>
                      {orgName(m.congregation_id || m.sector_id) && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {orgName(m.congregation_id) || orgName(m.sector_id)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button type="button" onClick={e => { e.stopPropagation(); setWalletMember(m); }}
                        className="p-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 transition-colors" title={t("Carteira")}>
                        <CreditCard size={14} className="text-accent" />
                      </button>
                      {canWrite && canDeleteMember(m) && (
                        <button type="button" onClick={e => { e.stopPropagation(); removeMember(m); }}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors" title={t("Remover")}>
                          <Trash2 size={14} className="text-muted-foreground" />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
              {filtered.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  {t("Nenhum membro encontrado.")}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Member Form Modal ──────────────────────────────────────────────────── */}

      <AnimatePresence>
        {modalOpen && (
          <Dialog open={modalOpen} onOpenChange={open => { if (!open) closeModal(); }}>
            <DialogContent className="w-[calc(100vw-0.75rem)] sm:w-full max-w-2xl h-[calc(100dvh-0.75rem)] sm:h-auto p-0 gap-0 overflow-hidden max-h-[calc(100dvh-0.75rem)] sm:max-h-[90vh] flex flex-col">

              {/* Modal header */}
              <div className="flex items-center justify-between px-3 sm:px-5 py-3 sm:py-4 border-b border-border/50 flex-shrink-0">
                <div>
                  <h2 className="font-serif text-lg">{isNewMember ? "Cadastrar Membro" : "Editar Membro"}</h2>
                  {!isNewMember && form.full_name && (
                    <p className="text-xs text-muted-foreground">{form.full_name}</p>
                  )}
                </div>
                <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                  <X size={18} strokeWidth={1.5} />
                </button>
              </div>

              {/* Tabs nav */}
              <div className="flex border-b border-border/50 overflow-x-auto flex-shrink-0 bg-background">
                {TABS.map(tab => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        if (validateCurrentTabBeforeLeaving(activeTab, tab.id)) {
                          setActiveTab(tab.id);
                        }
                      }}
                      className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                        activeTab === tab.id
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon size={13} className="flex-shrink-0" />
                      <span className="hidden sm:inline">{tab.label}</span>
                      <span className="sm:hidden">{tab.short}</span>
                    </button>
                  );
                })}
              </div>

              {/* Tab content */}
              <div className="overflow-y-auto overscroll-contain flex-1 px-3 sm:px-5 py-4 sm:py-5">

                {/* ── Tab 1: Dados Pessoais ── */}
                {activeTab === "pessoal" && (
                  <div className="space-y-5">
                    {/* Photo upload */}
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        {photoPreview ? (
                          <img src={photoPreview} alt="Foto" className="w-20 h-20 rounded-full object-cover ring-2 ring-border" />
                        ) : (
                          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                            <User size={28} />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => photoInputRef.current?.click()}
                          className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:opacity-90 transition-opacity"
                          title="Alterar foto"
                        >
                          <Camera size={13} />
                        </button>
                        <input
                          ref={photoInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handlePhotoChange}
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Foto do membro</p>
                        <p className="text-xs text-muted-foreground">JPG, PNG · máx. 5MB</p>
                        {photoPreview && (
                          <button type="button" onClick={() => { setPhotoPreview(null); setPhotoFile(null); setField("photo_url", null); }}
                            className="text-xs text-destructive hover:underline mt-1">
                            Remover foto
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <FormInput label="Nome completo" value={form.full_name} onChange={v => setField("full_name", v)} required placeholder="Nome e sobrenome completos" />
                      </div>
                      <div className="sm:col-span-2">
                        <FormInput
                          label="Código do Membro"
                          value={form.member_code || ""}
                          onChange={v => setField("member_code", v)}
                          placeholder={t("Opcional — use o código do sistema anterior, se houver")}
                        />
                      </div>
                      <FormInput label="Data de nascimento" value={form.birth_date || ""} onChange={v => setField("birth_date", v)} type="date" />
                      <FormSelect label="Sexo" value={form.gender || ""} onChange={v => setField("gender", v)} options={GENDER_OPTIONS} />
                      <FormSelect label="Estado civil" value={form.marital_status || ""} onChange={v => setField("marital_status", v)} options={MARITAL_STATUS_OPTIONS} />
                      <FormInput label="CPF" value={form.cpf || ""} onChange={v => setField("cpf", v)} required placeholder="000.000.000-00" />
                    </div>
                  </div>
                )}

                {/* ── Tab 2: Documentação Civil ── */}
                {activeTab === "documentos" && (() => {
                  const civilDocLabel = getCivilDocLabel(form.marital_status || "");
                  const statusColors: Record<string, string> = {
                    Pendente:     "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
                    Apresentado:  "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
                    Validado:     "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
                    Rejeitado:    "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
                  };
                  return (
                    <div className="space-y-5">
                      {/* Info box: what document is expected */}
                      {civilDocLabel ? (
                        <div className="rounded-lg border border-border/60 bg-muted/40 p-4 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Documento exigido</p>
                          <p className="text-sm font-semibold">{civilDocLabel}</p>
                          <p className="text-xs text-muted-foreground">
                            Baseado no estado civil: <span className="font-medium">{form.marital_status}</span>
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">
                            Selecione o <strong>estado civil</strong> na aba Dados Pessoais para ver o documento exigido.
                          </p>
                        </div>
                      )}

                      {/* Status badge + selector */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-muted-foreground">Status da documentação</label>
                          {form.civil_document_status && (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColors[form.civil_document_status] ?? "bg-muted text-muted-foreground"}`}>
                              {form.civil_document_status}
                            </span>
                          )}
                        </div>
                        <select
                          value={form.civil_document_status || "Pendente"}
                          onChange={e => setField("civil_document_status", e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          {CIVIL_DOCUMENT_STATUS_OPTIONS.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>

                      {/* Notes */}
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-muted-foreground">Observações sobre a documentação</label>
                        <textarea
                          value={form.civil_document_notes || ""}
                          onChange={e => setField("civil_document_notes", e.target.value)}
                          rows={3}
                          placeholder="Ex: Certidão entregue em mãos, aguardando validação..."
                          className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                        />
                      </div>

                      {/* Civil document upload */}
                      <div className="rounded-lg border border-dashed border-border/60 p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <FileText size={20} className="text-muted-foreground/60 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">Documento civil</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {civilDocumentFile ? civilDocumentFile.name : form.civil_document_url ? "Documento anexado" : "PDF, JPG, PNG ou WEBP - max. 10MB"}
                            </p>
                            {form.civil_document_uploaded_at && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                Enviado em {new Date(form.civil_document_uploaded_at).toLocaleDateString("pt-BR")}
                              </p>
                            )}
                          </div>
                        </div>

                        <input
                          ref={civilDocumentInputRef}
                          type="file"
                          accept="application/pdf,image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={handleCivilDocumentChange}
                        />

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => civilDocumentInputRef.current?.click()}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
                          >
                            <Upload size={14} /> Selecionar arquivo
                          </button>

                          {(civilDocumentFile || form.civil_document_url) && (
                            <button
                              type="button"
                              onClick={openCivilDocument}
                              className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
                            >
                              <FileText size={14} /> Visualizar documento
                            </button>
                          )}

                          {(civilDocumentFile || form.civil_document_url) && (
                            <button
                              type="button"
                              onClick={() => {
                                setCivilDocumentFile(null);
                                setField("civil_document_url", null);
                                setField("civil_document_uploaded_at", null);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              Remover documento
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* ── Tab 3: Contato ── */}
                {activeTab === "contato" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormInput label="Telefone" value={form.phone || ""} onChange={v => setField("phone", v)} required placeholder="(00) 00000-0000" type="tel" />
                    <FormInput label="WhatsApp" value={form.whatsapp || ""} onChange={v => setField("whatsapp", v)} placeholder="(00) 00000-0000" type="tel" />
                    <div className="sm:col-span-2">
                      <FormInput label="E-mail" value={form.email || ""} onChange={v => setField("email", v)} placeholder="email@exemplo.com" type="email" />
                    </div>
                  </div>
                )}

                {/* ── Tab 4: Endereço ── */}
                {activeTab === "endereco" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormInput label="CEP" value={form.zip_code || ""} onChange={v => setField("zip_code", v)} placeholder="00000-000" />
                    <div className="sm:col-span-2">
                      <FormInput label="Rua / Logradouro" value={form.street || ""} onChange={v => setField("street", v)} placeholder="Nome da rua" />
                    </div>
                    <FormInput label="Número" value={form.address_number || ""} onChange={v => setField("address_number", v)} placeholder="Nº" />
                    <FormInput label="Complemento" value={form.address_complement || ""} onChange={v => setField("address_complement", v)} placeholder="Apto, casa, bloco..." />
                    <FormInput label="Bairro" value={form.neighborhood || ""} onChange={v => setField("neighborhood", v)} placeholder="Bairro" />
                    <FormInput label="Cidade" value={form.city || ""} onChange={v => setField("city", v)} placeholder="Cidade" />
                    <FormInput label="Estado (UF)" value={form.state || ""} onChange={v => setField("state", v)} placeholder="RS" />
                  </div>
                )}

                {/* ── Tab 5: Dados Eclesiásticos ── */}
                {activeTab === "eclesiastico" && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormInput label="Batismo nas águas" value={form.baptized_at || ""} onChange={v => setField("baptized_at", v)} type="date" />
                      <FormInput label="Batismo com o Espírito Santo" value={form.holy_spirit_baptism_date || ""} onChange={v => setField("holy_spirit_baptism_date", v)} type="date" />
                      <FormInput label="Data de admissão" value={form.joined_at || ""} onChange={v => setField("joined_at", v)} type="date" />
                      <FormInput label="Data de consagração" value={form.consecration_date || ""} onChange={v => setField("consecration_date", v)} type="date" />
                      <FormSelect label="Situação do membro" value={form.status} onChange={v => setField("status", v as MemberStatus)} options={MEMBER_STATUSES} required />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Sector selector */}
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-muted-foreground">Setor / Distrito</label>
                        <select
                          value={form.sector_id || ""}
                          onChange={e => setField("sector_id", e.target.value || null)}
                          className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="">— Nenhum —</option>
                          {sectors.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                          {sectors.length === 0 && (
                            <option disabled>Nenhum setor cadastrado</option>
                          )}
                        </select>
                      </div>

                      {/* Congregation selector */}
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-muted-foreground">Congregação onde congrega</label>
                        <select
                          value={form.congregation_id || ""}
                          onChange={e => setField("congregation_id", e.target.value || null)}
                          className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="">— Selecionar —</option>
                          {subOrgs.map(o => (
                            <option key={o.id} value={o.id}>
                              {o.name} ({o.organization_type})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Tab 6: Função / Cargo ── */}
                {activeTab === "funcao" && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <FormSelect
                          label="Função eclesiástica"
                          value={form.member_role || "Membro"}
                          onChange={v => setField("member_role", v)}
                          options={ECCLESIASTICAL_FUNCTIONS}
                          required
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          A função eclesiástica representa o ministério do membro na igreja.
                        </p>
                      </div>
                      <div className="sm:col-span-2">
                        <FormSelect
                          label="Cargo administrativo"
                          value={form.administrative_role || "Nenhum"}
                          onChange={v => setField("administrative_role", v)}
                          options={ADMINISTRATIVE_ROLES}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          O cargo administrativo é a função de gestão, separado da ordem ministerial.
                        </p>
                      </div>
                    </div>

                    {/* Preview */}
                    {(form.member_role || form.administrative_role) && (
                      <div className="bg-muted/50 rounded-lg p-4 space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Exibição na Carteira</p>
                        <p className="text-sm"><span className="text-muted-foreground">Função eclesiástica:</span> {form.member_role || "—"}</p>
                        {form.administrative_role && form.administrative_role !== "Nenhum" && (
                          <p className="text-sm"><span className="text-muted-foreground">Cargo:</span> {form.administrative_role}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Tab 7: Família ── */}
                {activeTab === "familia" && (
                  <div className="grid grid-cols-1 gap-4">
                    <FormInput label="Nome do pai" value={form.father_name || ""} onChange={v => setField("father_name", v)} placeholder="Nome completo do pai" />
                    <FormInput label="Nome da mãe" value={form.mother_name || ""} onChange={v => setField("mother_name", v)} placeholder="Nome completo da mãe" />
                    <FormInput label="Cônjuge" value={form.spouse_name || ""} onChange={v => setField("spouse_name", v)} placeholder="Nome do cônjuge" />
                  </div>
                )}

                {/* ── Tab 8: Observações ── */}
                {activeTab === "observacoes" && (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-muted-foreground">Observações internas da secretaria</label>
                      <textarea
                        value={form.notes || ""}
                        onChange={e => setField("notes", e.target.value)}
                        rows={5}
                        placeholder="Anotações da secretaria, histórico pastoral, observações administrativas..."
                        className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                      />
                      <p className="text-xs text-muted-foreground">Visível apenas para secretaria e liderança.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal footer */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 px-3 sm:px-5 py-3 sm:py-4 border-t border-border/50 bg-background flex-shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {/* Tab navigation arrows */}
                <div className="flex w-full sm:w-auto items-center justify-between sm:justify-start gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const idx = TABS.findIndex(t => t.id === activeTab);
                      if (idx > 0) setActiveTab(TABS[idx - 1].id);
                    }}
                    disabled={activeTab === TABS[0].id}
                    className="px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-30"
                  >
                    ← Anterior
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {TABS.findIndex(t => t.id === activeTab) + 1}/{TABS.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const idx = TABS.findIndex(t => t.id === activeTab);
                      const nextTab = TABS[idx + 1];
                      if (nextTab && validateCurrentTabBeforeLeaving(activeTab, nextTab.id)) {
                        setActiveTab(nextTab.id);
                      }
                    }}
                    disabled={activeTab === TABS[TABS.length - 1].id}
                    className="px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-30 flex items-center gap-1"
                  >
                    Próximo <ChevronRight size={12} />
                  </button>
                </div>

                <div className="flex w-full sm:w-auto items-center justify-end gap-1.5 sm:gap-2">
                  {!isNewMember && (
                    <>
                      {canAccess("/admin/gerenciar-acessos") && (
                        <button
                          type="button"
                          onClick={() => {
                            const member = members.find((item) => item.id === editingId);
                            if (!member) return;
                            const targetOrganizationId = member.congregation_id
                              ?? member.sector_id
                              ?? contextFilter?.orgId
                              ?? church?.id;
                            if (!targetOrganizationId) return;
                            closeModal();
                            navigate("/admin/gerenciar-acessos", {
                              state: {
                                openNewAccess: true,
                                presetMemberId: member.id,
                                presetMemberName: member.full_name,
                                contextOrganizationId: targetOrganizationId,
                                contextOrganizationName: contextFilter?.orgName ?? church?.name ?? "Unidade do membro",
                                contextOrganizationType: contextFilter?.orgType ?? "",
                                source: "member_profile",
                              },
                            });
                          }}
                          aria-label="Gerenciar acessos"
                          title="Gerenciar acessos"
                          className="inline-flex h-9 w-9 sm:h-auto sm:w-auto flex-shrink-0 items-center justify-center gap-1.5 sm:px-3 sm:py-2 bg-secondary rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
                        >
                          <Shield size={14} /> <span className="hidden sm:inline">Gerenciar acessos</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { const m = members.find(x => x.id === editingId); if (m) { closeModal(); setWalletMember(m); } }}
                        aria-label="Abrir carteira"
                        title="Carteira"
                        className="inline-flex h-9 w-9 sm:h-auto sm:w-auto flex-shrink-0 items-center justify-center gap-1.5 sm:px-3 sm:py-2 bg-secondary rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
                      >
                        <CreditCard size={14} /> <span className="hidden sm:inline">Carteira</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!editingId) return;
                          setInviteModal({
                            open:       true,
                            memberId:   editingId,
                            memberName: form.full_name,
                            phone:      form.whatsapp?.trim() || form.phone?.trim() || null,
                            email:      form.email?.trim() || null,
                          });
                        }}
                        aria-label="Enviar convite"
                        title="Convite"
                        className="inline-flex h-9 w-9 sm:h-auto sm:w-auto flex-shrink-0 items-center justify-center gap-1.5 sm:px-3 sm:py-2 bg-secondary rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
                      >
                        <Send size={13} /> <span className="hidden sm:inline">Convite</span>
                      </button>
                    </>
                  )}
                  <button type="button" onClick={closeModal}
                    className="flex-shrink-0 px-2.5 sm:px-4 py-2 text-sm rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const idx = TABS.findIndex(t => t.id === activeTab);
                      if (idx < TABS.length - 1) {
                        const nextTab = TABS[idx + 1];
                        if (validateCurrentTabBeforeLeaving(activeTab, nextTab.id)) {
                          setActiveTab(nextTab.id);
                        }
                        return;
                      }
                      handleSave(false);
                    }}
                    disabled={saving || uploadingPhoto || uploadingCivilDocument}
                    className="inline-flex flex-shrink-0 items-center gap-2 px-3 sm:px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {(saving || uploadingPhoto || uploadingCivilDocument) && <Loader2 size={14} className="animate-spin" />}
                    {activeTab === TABS[TABS.length - 1].id
                      ? saving ? "Salvando..." : uploadingPhoto ? "Enviando foto..." : uploadingCivilDocument ? "Enviando documento..." : "Salvar Membro"
                      : "Pr\u00F3ximo"}
                    {activeTab !== TABS[TABS.length - 1].id && <ChevronRight size={14} />}
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>

      {/* Wallet modal */}
      {walletMember && (
        <Dialog open={!!walletMember} onOpenChange={open => { if (!open) setWalletMember(null); }}>
          <DialogContent className="max-w-sm">
            <MemberWalletCard
              member={toWalletMember(walletMember)}
              churchName={church?.name ?? "Igreja"}
              churchCity={church?.city ?? undefined}
              churchState={church?.state ?? undefined}
              churchLogoUrl={church?.logo_url ?? null}
              onClose={() => setWalletMember(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Bulk import */}
      <BulkImportModal
        open={showImport}
        title={t("Importar Membros")}
        fields={memberFields}
        templateData={memberTemplate}
        onImport={handleBulkImport}
        onClose={() => setShowImport(false)}
      />

      {/* Invite modal */}
      {inviteModal && (
        <MemberInviteModal
          open={inviteModal.open}
          onClose={() => setInviteModal(null)}
          memberId={inviteModal.memberId}
          memberName={inviteModal.memberName}
          organizationId={church?.id ?? ""}
          churchName={church?.name ?? "Igreja"}
          sectorId={form.sector_id}
          congregationId={form.congregation_id}
          invitedBy={user?.id}
          phone={inviteModal.phone}
          email={inviteModal.email}
        />
      )}
    </AdminLayout>
  );
}
