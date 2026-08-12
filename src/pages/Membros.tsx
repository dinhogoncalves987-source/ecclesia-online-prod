import { AdminLayout } from "@/components/AdminLayout";
import {
  Search, Plus, X, Trash2, Loader2, Upload, Pencil, CreditCard, Camera, ChevronLeft, ChevronRight,
  User, FileText, Phone, MapPin, Church, Briefcase, Users, BookOpen, Send, Building2,
  Shield, CalendarClock,
  type LucideIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { MemberWalletCard } from "@/components/MemberWalletCard";
import {
  DisciplinePeriodDialog,
  type DisciplinePeriodConfirmPayload,
  type DisciplinePeriodInfo,
} from "@/components/DisciplinePeriodDialog";
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
  isMemberStatus,
  type MemberStatus,
  ECCLESIASTICAL_FUNCTIONS,
  ADMINISTRATIVE_ROLES,
  GENDER_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  CIVIL_DOCUMENT_STATUS_OPTIONS,
  EDUCATION_LEVELS,
  ADMISSION_TYPES,
  FAMILY_RELATIONS,
  type FamilyRelation,
  ADDRESS_TYPES,
  getCivilDocLabel,
} from "@/lib/secretariaConstants";
import { readFormDraft } from "@/lib/appResumeState";
import { useResumableFormDraft, discardFormDraft } from "@/hooks/useResumableFormDraft";
import {
  checkCpfForManualSave,
  checkRequiredMemberContacts,
  CPF_CHECK_MESSAGES,
  MEMBER_CONTACT_CHECK_MESSAGES,
} from "@/lib/memberFormValidation";
import { checkOrganizationContext } from "@/lib/organizationContextGuard";

// ─── Types ───────────────────────────────────────────────────────────────────

type Member = {
  id: string;
  full_name: string;
  known_name: string | null;
  member_code: string | null;
  member_role: string | null;
  administrative_role: string | null;
  status: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  photo_url: string | null;
  birth_date: string | null;
  birth_place: string | null;
  gender: string | null;
  marital_status: string | null;
  cpf: string | null;
  cpf_pending: boolean;
  rg: string | null;
  rg_issuer: string | null;
  rg_issue_date: string | null;
  nationality: string | null;
  education_level: string | null;
  profession: string | null;
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
  baptism_place: string | null;
  conversion_date: string | null;
  admission_type: string | null;
  cgadb_number: string | null;
  congregation_id: string | null;
  sector_id: string | null;
  father_name: string | null;
  mother_name: string | null;
  spouse_name: string | null;
  notes: string | null;
  incomplete_registration: boolean;
  contact_pending: boolean;
  requires_review: boolean;
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

// Subconjunto de campos de Member realmente usado na listagem (linha da
// tabela/card). Buscar somente estas colunas — em vez de select("*") — evita
// transferir ~40 campos (endereço, dados eclesiásticos, documentos, notas
// etc.) que só são necessários quando a ficha completa é aberta (ver
// FETCH_MEMBER_DETAIL_COLUMNS / openEdit / openWalletFor, que buscam a ficha
// inteira sob demanda, um único registro por vez, indexado por id).
const MEMBER_LIST_COLUMNS =
  "id, full_name, member_code, member_role, administrative_role, status, phone, email, photo_url, birth_date, joined_at, congregation_id, sector_id, civil_document_status, marital_status";

type MemberListItem = Pick<
  Member,
  | "id"
  | "full_name"
  | "member_code"
  | "member_role"
  | "administrative_role"
  | "status"
  | "phone"
  | "email"
  | "photo_url"
  | "birth_date"
  | "joined_at"
  | "congregation_id"
  | "sector_id"
  | "civil_document_status"
  | "marital_status"
>;

// Opção leve para o seletor "vincular a membro existente" (aba Família) —
// nunca carrega a ficha inteira dos outros membros, apenas id + nome,
// limitado a MEMBER_LINK_OPTIONS_LIMIT registros (ver reloadFamilyLinkOptions).
type MemberLinkOption = { id: string; full_name: string };
const MEMBER_LINK_OPTIONS_LIMIT = 500;

const MEMBERS_VIEW_PAGE_SIZE = 100;

// Contadores do cabeçalho (por status) — resultado de public.member_status_counts,
// sempre calculados no servidor, nunca a partir da página atual de membros.
type MemberStatusCounts = Partial<Record<MemberStatus, number>>;

// ─── Família e Dependentes (public.member_family) ───────────────────────────

type FamilyEntry = {
  id: string;
  relation: FamilyRelation;
  full_name: string;
  related_member_id: string | null;
  birth_date: string | null;
  gender: string | null;
  cpf: string | null;
  phone: string | null;
  notes: string | null;
};

type FamilyDraft = {
  id: string | null; // null = novo, ainda não salvo
  relation: FamilyRelation | "";
  full_name: string;
  related_member_id: string | null;
  birth_date: string;
  gender: string;
  cpf: string;
  phone: string;
  notes: string;
};

const EMPTY_FAMILY_DRAFT: FamilyDraft = {
  id: null,
  relation: "",
  full_name: "",
  related_member_id: null,
  birth_date: "",
  gender: "",
  cpf: "",
  phone: "",
  notes: "",
};

const FAMILY_RELATION_LABELS: Record<string, string> = {
  pai: "Pai", mae: "Mãe", esposo: "Esposo", esposa: "Esposa",
  filho: "Filho", filha: "Filha", enteado: "Enteado", enteada: "Enteada",
  dependente: "Dependente", responsavel: "Responsável", outro: "Outro",
};

// ─── Endereços (public.member_addresses) ────────────────────────────────────

type AddressEntry = {
  id: string;
  address_type: string;
  zip_code: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  is_primary: boolean;
  is_active: boolean;
  notes: string | null;
};

type AddressDraft = {
  id: string | null;
  address_type: string;
  zip_code: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  country: string;
  is_primary: boolean;
  notes: string;
};

const EMPTY_ADDRESS_DRAFT: AddressDraft = {
  id: null,
  address_type: "comercial",
  zip_code: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  country: "Brasil",
  is_primary: false,
  notes: "",
};

const ADDRESS_TYPE_LABELS: Record<string, string> = {
  residencial: "Residencial", comercial: "Comercial",
  correspondencia: "Correspondência", anterior: "Anterior", outro: "Outro",
};

type FilterStatus = "all" | MemberStatus;

// Chave do rascunho de cadastro/edição de membro no snapshot de retomada da
// PWA (ver src/lib/appResumeState.ts). Nunca inclui foto/documento (File),
// que não sobrevivem a um kill de processo — apenas os campos de texto do
// formulário, restaurados quando o app é reaberto na mesma rota.
const MEMBER_CADASTRO_DRAFT_KEY = "membros.cadastro";

type MemberCadastroDraft = {
  modalOpen: boolean;
  isNewMember: boolean;
  editingId: string | null;
  activeTab: string;
  form: Omit<Member, "id">;
};

const EMPTY_FORM: Omit<Member, "id"> = {
  full_name: "",
  known_name: "",
  member_code: "",
  member_role: "Membro",
  administrative_role: "Nenhum",
  status: "Ativo",
  phone: "",
  whatsapp: "",
  email: "",
  photo_url: null,
  birth_date: "",
  birth_place: "",
  gender: "",
  marital_status: "",
  cpf: "",
  cpf_pending: false,
  rg: "",
  rg_issuer: "",
  rg_issue_date: "",
  nationality: "",
  education_level: "",
  profession: "",
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
  baptism_place: "",
  conversion_date: "",
  admission_type: "",
  cgadb_number: "",
  congregation_id: null,
  sector_id: null,
  father_name: "",
  mother_name: "",
  spouse_name: "",
  notes: "",
  incomplete_registration: false,
  contact_pending: false,
  requires_review: false,
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
  icon: LucideIcon;
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

// Estados considerados "em disciplina" para fins de fluxo de período —
// inclui o alias legado "Disciplinado" (nunca oferecido no <select>, mas
// presente em registros antigos como ANDRIELE, DANIEL e DORACI).
const DISCIPLINE_STATUSES = new Set(["Em disciplina", "Disciplinado"]);

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

  // ── Listagem paginada no servidor ────────────────────────────────────────
  // `members` contém SOMENTE a página atual (no máximo MEMBERS_VIEW_PAGE_SIZE
  // registros, colunas enxutas de MEMBER_LIST_COLUMNS) — nunca a organização
  // inteira. Ver reloadMembersPage/fetchMembersPage mais abaixo.
  const [members, setMembers] = useState<MemberListItem[]>([]);
  const [loading, setLoading] = useState(true); // somente a 1ª carga (sem cache) — nunca reaparece em troca de página/filtro com cache quente
  const [pageTransitioning, setPageTransitioning] = useState(false); // troca de página/filtro com cache frio: mantém linhas antigas visíveis + indicador discreto
  const [listError, setListError] = useState<string | null>(null);
  const [totalFilteredCount, setTotalFilteredCount] = useState(0); // total no escopo+filtro+busca atuais (para "1–100 de N" e totalPages) — só é exato quando não há busca ativa
  const [hasNextPage, setHasNextPage] = useState(false); // detectado pela linha extra (range PAGE_SIZE+1), nunca por count:"exact" — única fonte de verdade para o botão "Próxima" durante busca textual
  const [saving, setSaving] = useState(false);
  const [searchInput, setSearchInput] = useState(""); // valor bruto do campo de busca
  const [searchQuery, setSearchQuery] = useState(""); // valor após debounce — usado na query ao servidor
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [showImport, setShowImport] = useState(false);
  const [walletMember, setWalletMember] = useState<Member | null>(null);
  const [walletLoadingId, setWalletLoadingId] = useState<string | null>(null);

  // ── Período disciplinar (Fase 1C-H3) ────────────────────────────────────────
  // Estados canônicos considerados "em disciplina" para fins de UI — inclui o
  // alias legado "Disciplinado" (nunca oferecido no <select>, mas presente em
  // registros antigos). Ver contrato completo em applyMemberStatusChange.
  const [disciplineDialog, setDisciplineDialog] = useState<{
    mode: "enter" | "regularize" | "end";
    member: MemberListItem;
    targetStatus: MemberStatus;
    currentPeriod: DisciplinePeriodInfo | null;
  } | null>(null);
  const [disciplineSubmitting, setDisciplineSubmitting] = useState(false);

  // Trava de concorrência por membro (Fase 1C-H5, achado P2): um `Set`
  // síncrono (checado/atualizado fora de qualquer `setState`, portanto
  // efetivo no mesmo tick) impede que dois eventos disparados antes do
  // próximo render — duplo clique no select, seleção rápida, clique duplo em
  // "Período" — abram duas RPCs/diálogos concorrentes para o mesmo membro.
  // `mutatingMemberIds` é o espelho em estado React usado apenas para
  // desabilitar visualmente o select e o botão "Período" daquele membro;
  // outros membros nunca são afetados.
  const memberMutationLockRef = useRef<Set<string>>(new Set());
  const [mutatingMemberIds, setMutatingMemberIds] = useState<Set<string>>(new Set());

  const beginMemberMutation = (id: string): boolean => {
    if (memberMutationLockRef.current.has(id)) return false;
    memberMutationLockRef.current.add(id);
    setMutatingMemberIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    return true;
  };

  const endMemberMutation = (id: string) => {
    memberMutationLockRef.current.delete(id);
    setMutatingMemberIds(prev => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  // Contadores do cabeçalho — sempre por RPC independente (member_status_counts),
  // nunca derivados da página de membros carregada. null enquanto carregando
  // (renderiza "—", nunca "0" falso).
  const [statusCounts, setStatusCounts] = useState<MemberStatusCounts | null>(null);
  // Espelho síncrono de `statusCounts` para leitura dentro de fetchMembersPage
  // sem incluir o objeto inteiro nas dependências do useCallback (ver uso mais
  // abaixo, na correção do timeout do count exato).
  const statusCountsRef = useRef<MemberStatusCounts | null>(null);
  useEffect(() => { statusCountsRef.current = statusCounts; }, [statusCounts]);
  // Espelho de `totalFilteredCount` para uso como fallback dentro de
  // fetchMembersPage sem precisar incluí-lo nas dependências do useCallback
  // (evitaria recriar a função — e reexecutar o efeito que a chama — a cada
  // atualização de contagem).
  const totalFilteredCountRef = useRef(0);
  useEffect(() => { totalFilteredCountRef.current = totalFilteredCount; }, [totalFilteredCount]);

  // Modal form state
  const [modalOpen, setModalOpen] = useState(false);
  const [isNewMember, setIsNewMember] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  // Ficha completa do membro em edição (buscada sob demanda em openEdit — só
  // quando o membro é efetivamente aberto, nunca a partir da listagem
  // paginada). Alimenta os botões "Carteira" e "Gerenciar acessos" do rodapé
  // do modal, que antes dependiam de procurar o membro no array `members`
  // (que agora só tem a página atual, não a organização inteira).
  const [editingMemberFull, setEditingMemberFull] = useState<Member | null>(null);
  const [activeTab, setActiveTab] = useState("pessoal");
  const [form, setForm] = useState<Omit<Member, "id">>({ ...EMPTY_FORM });

  // Opções para "vincular a membro existente" na aba Família — lista leve
  // (id + nome, limitada) e independente da listagem paginada; ver
  // reloadFamilyLinkOptions.
  const [familyLinkOptions, setFamilyLinkOptions] = useState<MemberLinkOption[]>([]);

  // ── Retomada de cadastro após reinicialização da PWA ─────────────────────
  // Restaura (uma única vez, ao montar) um rascunho de cadastro/edição que
  // ficou aberto quando o app foi encerrado pelo Android/Chrome — por
  // exemplo, ao abrir a galeria/câmera para anexar foto e o processo em
  // segundo plano ser descartado por pressão de memória. Sem isto, o
  // usuário reabre o app e cai na lista de membros com o formulário e os
  // dados digitados perdidos (bug relatado: "reinicia e perde a tela").
  //
  // Restaura apenas se o rascunho foi salvo NESTA mesma rota
  // (readFormDraft já valida isso) e dentro da janela de validade do
  // snapshot (30 min, ver appResumeState.ts) — nunca ressuscita um
  // rascunho de dias atrás.
  const draftRestoredRef = useRef(false);
  useEffect(() => {
    if (draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    const draft = readFormDraft<MemberCadastroDraft>(MEMBER_CADASTRO_DRAFT_KEY, location.pathname);
    if (!draft || !draft.modalOpen) return;

    setIsNewMember(draft.isNewMember);
    setEditingId(draft.editingId);
    setActiveTab(draft.activeTab);
    setForm(draft.form);
    setModalOpen(true);
    // Foto/documento anexados (File) nunca sobrevivem a um reinício de
    // processo — o navegador não consegue devolver o arquivo para uma
    // página que não existia mais quando o seletor foi fechado. Isto é uma
    // limitação real do navegador/SO, não um bug do Ecclesia; avisamos o
    // usuário em vez de fingir que o anexo também foi restaurado.
    toast.info(t("Rascunho do cadastro restaurado"), {
      description: t("Se você tinha selecionado uma foto ou documento, selecione novamente."),
    });
  }, [location.pathname, t]);

  useResumableFormDraft<MemberCadastroDraft>(
    MEMBER_CADASTRO_DRAFT_KEY,
    location.pathname,
    modalOpen,
    { modalOpen, isNewMember, editingId, activeTab, form },
  );

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
    whatsapp: string | null;
    email: string | null;
  } | null>(null);

  // ── Família e dependentes (member_family) ────────────────────────────────
  // Para membro já existente (editingId != null): CRUD imediato no banco.
  // Para membro novo (ainda sem id): entradas ficam "pendentes" localmente e
  // são inseridas em lote depois que o INSERT do membro tiver sucesso.
  const [familyEntries, setFamilyEntries] = useState<FamilyEntry[]>([]);
  const [pendingFamilyEntries, setPendingFamilyEntries] = useState<FamilyDraft[]>([]);
  const [familyDraft, setFamilyDraft] = useState<FamilyDraft | null>(null);
  const [loadingFamily, setLoadingFamily] = useState(false);
  const [savingFamily, setSavingFamily] = useState(false);

  // ── Endereços adicionais (member_addresses) ──────────────────────────────
  // O endereço "principal" continua nos campos inline de members (compat com
  // dados existentes). Esta lista é para endereços SECUNDÁRIOS (comercial,
  // correspondência, anterior) — múltiplos por membro.
  const [addressEntries, setAddressEntries] = useState<AddressEntry[]>([]);
  const [pendingAddressEntries, setPendingAddressEntries] = useState<AddressDraft[]>([]);
  const [addressDraft, setAddressDraft] = useState<AddressDraft | null>(null);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);

  const loadFamilyEntries = useCallback(async (memberId: string) => {
    setLoadingFamily(true);
    const { data, error } = await supabase
      .from("member_family")
      .select("id, relation, full_name, related_member_id, birth_date, gender, cpf, phone, notes")
      .eq("member_id", memberId)
      .eq("is_active", true)
      .order("relation", { ascending: true });
    setLoadingFamily(false);
    if (error) {
      if (isMissingColumnError(error) || error.code === "42P01") {
        // Tabela member_family ainda não existe neste ambiente (migration
        // não aplicada) — não é um erro do usuário, apenas indisponibilidade
        // temporária da funcionalidade.
        console.warn("[Membros] member_family indisponível:", error.message);
        setFamilyEntries([]);
        return;
      }
      toast.error(t("Erro ao carregar família"), { description: error.message });
      return;
    }
    setFamilyEntries((data ?? []) as FamilyEntry[]);
  }, [t]);

  const loadAddressEntries = useCallback(async (memberId: string) => {
    setLoadingAddresses(true);
    const { data, error } = await supabase
      .from("member_addresses")
      .select("id, address_type, zip_code, street, number, complement, neighborhood, city, state, country, is_primary, is_active, notes")
      .eq("member_id", memberId)
      .eq("is_active", true)
      .order("address_type", { ascending: true });
    setLoadingAddresses(false);
    if (error) {
      if (isMissingColumnError(error) || error.code === "42P01") {
        console.warn("[Membros] member_addresses indisponível:", error.message);
        setAddressEntries([]);
        return;
      }
      toast.error(t("Erro ao carregar endereços"), { description: error.message });
      return;
    }
    setAddressEntries((data ?? []) as AddressEntry[]);
  }, [t]);

  const saveFamilyDraft = async () => {
    if (!familyDraft) return;
    if (!familyDraft.relation) { toast.error(t("Selecione o tipo de relação.")); return; }
    if (!familyDraft.full_name.trim()) { toast.error(t("Informe o nome do familiar.")); return; }

    if (!editingId) {
      // Membro novo ainda não salvo — enfileira localmente.
      setPendingFamilyEntries(prev => [...prev, familyDraft]);
      setFamilyDraft(null);
      return;
    }

    if (!church) return;
    setSavingFamily(true);
    try {
      const payload = {
        member_id: editingId,
        organization_id: church.id,
        relation: familyDraft.relation,
        full_name: familyDraft.full_name.trim(),
        related_member_id: familyDraft.related_member_id || null,
        birth_date: familyDraft.birth_date || null,
        gender: familyDraft.gender || null,
        cpf: familyDraft.cpf?.trim() || null,
        phone: familyDraft.phone?.trim() || null,
        notes: familyDraft.notes?.trim() || null,
      };
      const { error } = familyDraft.id
        ? await supabase.from("member_family").update(payload).eq("id", familyDraft.id)
        : await supabase.from("member_family").insert(payload);
      if (error) {
        if (error.code === "23505") {
          toast.error(t("Este familiar já está cadastrado com essa relação."));
        } else if (isMissingColumnError(error) || error.code === "42P01") {
          toast.error(t("Funcionalidade de família ainda não disponível neste ambiente (migration pendente)."));
        } else {
          toast.error(t("Erro ao salvar familiar"), { description: error.message });
        }
        return;
      }
      toast.success(t("Familiar salvo"));
      setFamilyDraft(null);
      await loadFamilyEntries(editingId);
    } finally {
      setSavingFamily(false);
    }
  };

  const removeFamilyEntry = async (entry: FamilyEntry) => {
    if (!confirm(`${t("Remover")} ${entry.full_name}?`)) return;
    // Soft delete (is_active = false) preserva histórico, conforme regra de
    // produto ("remover/desativar").
    const { error } = await supabase.from("member_family").update({ is_active: false }).eq("id", entry.id);
    if (error) { toast.error(t("Erro ao remover familiar"), { description: error.message }); return; }
    if (editingId) await loadFamilyEntries(editingId);
  };

  const removePendingFamilyEntry = (index: number) => {
    setPendingFamilyEntries(prev => prev.filter((_, i) => i !== index));
  };

  const saveAddressDraft = async () => {
    if (!addressDraft) return;
    if (!addressDraft.street.trim() && !addressDraft.zip_code.trim()) {
      toast.error(t("Informe ao menos o CEP ou o logradouro."));
      return;
    }

    if (!editingId) {
      setPendingAddressEntries(prev => [...prev, addressDraft]);
      setAddressDraft(null);
      return;
    }

    if (!church) return;
    setSavingAddress(true);
    try {
      const payload = {
        member_id: editingId,
        organization_id: church.id,
        address_type: addressDraft.address_type,
        zip_code: addressDraft.zip_code?.trim() || null,
        street: addressDraft.street?.trim() || null,
        number: addressDraft.number?.trim() || null,
        complement: addressDraft.complement?.trim() || null,
        neighborhood: addressDraft.neighborhood?.trim() || null,
        city: addressDraft.city?.trim() || null,
        state: addressDraft.state?.trim() || null,
        country: addressDraft.country?.trim() || "Brasil",
        is_primary: addressDraft.is_primary,
        notes: addressDraft.notes?.trim() || null,
      };
      const { error } = addressDraft.id
        ? await supabase.from("member_addresses").update(payload).eq("id", addressDraft.id)
        : await supabase.from("member_addresses").insert(payload);
      if (error) {
        if (error.code === "23505") {
          toast.error(t("Já existe um endereço principal ativo para este membro."));
        } else if (isMissingColumnError(error) || error.code === "42P01") {
          toast.error(t("Funcionalidade de endereços adicionais ainda não disponível neste ambiente (migration pendente)."));
        } else {
          toast.error(t("Erro ao salvar endereço"), { description: error.message });
        }
        return;
      }
      toast.success(t("Endereço salvo"));
      setAddressDraft(null);
      await loadAddressEntries(editingId);
    } finally {
      setSavingAddress(false);
    }
  };

  const removeAddressEntry = async (entry: AddressEntry) => {
    if (!confirm(t("Remover este endereço?"))) return;
    const { error } = await supabase.from("member_addresses").update({ is_active: false }).eq("id", entry.id);
    if (error) { toast.error(t("Erro ao remover endereço"), { description: error.message }); return; }
    if (editingId) await loadAddressEntries(editingId);
  };

  const removePendingAddressEntry = (index: number) => {
    setPendingAddressEntries(prev => prev.filter((_, i) => i !== index));
  };

  const setField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  // ── Load members — paginação, filtro, busca e contagem no servidor ─────────
  // Substitui o antigo reloadMembers (while(true) + select("*") trazendo os
  // 7.121 membros da organização para o navegador). Agora cada requisição
  // busca no máximo MEMBERS_VIEW_PAGE_SIZE + 1 linhas, com apenas as colunas
  // de MEMBER_LIST_COLUMNS, filtro/busca/ordenação executados pelo Postgres
  // (índices em supabase/migrations/20260808170000_members_server_side_listing_performance.sql).
  //
  // count:"exact" NUNCA é solicitado ao PostgREST aqui — nem na listagem
  // normal, nem durante busca textual. count:"exact" força uma segunda
  // consulta, sem range/limit, contando TODAS as linhas que casam com o
  // filtro para devolver o total exato; sob a RLS hierárquica de
  // public.members (has_org_access_permission → is_organization_descendant_or_self,
  // avaliada por linha porque depende de congregation_id/sector_id, que
  // variam entre membros), essa contagem completa é cara em escopos amplos
  // e foi a causa do "canceling statement due to statement timeout"
  // reportado — tanto na listagem sem busca (matriz inteira) quanto na busca
  // textual (o índice trigram acelera achar as linhas, mas count:"exact"
  // ainda precisa reavaliar RLS sobre TODO o conjunto candidato, não apenas
  // sobre a página exibida).
  //
  // Em vez de contar, pedimos sempre uma linha extra (range 0..PAGE_SIZE, ou
  // seja PAGE_SIZE+1 linhas): se vier a linha 101, existe próxima página
  // (hasNextPage=true) e ela é descartada da exibição; se vierem até 100,
  // não há próxima página. Sem busca, o total exibido ("1–100 de N") vem do
  // mesmo escopo já contado pela RPC independente member_status_counts (ver
  // efeito mais abaixo) — nunca de count:"exact". Com busca, não fabricamos
  // um total exato: mostramos "há mais resultados" enquanto hasNextPage for
  // true, e só exibimos um total quando a última página é alcançada (nesse
  // ponto o total é simplesmente offset + linhas retornadas, conhecido sem
  // nenhuma contagem adicional).
  const CACHE_TTL_MS = 60_000;
  const membersCacheRef = useRef(
    new Map<string, { items: MemberListItem[]; total: number; hasNextPage: boolean; ts: number }>(),
  );
  const membersRequestIdRef = useRef(0);
  const membersAbortRef = useRef<AbortController | null>(null);

  type MemberScope = { matchCongregationIds: string[] | null; matchEitherIds: string[] | null; empty: boolean };

  // Mesma regra de escopo hierárquico que existia no filtro client-side
  // (scopedMembers), agora aplicada como filtro de servidor:
  //  • subsede selecionada  → congregation_id IN (congregações filhas)
  //  • setor/congregação selecionados → congregation_id = id OU sector_id = id
  //  • nenhum contextFilter → toda a organização (matriz)
  const buildMemberScope = useCallback((): MemberScope => {
    if (!contextFilter) return { matchCongregationIds: null, matchEitherIds: null, empty: false };
    if (contextFilter.orgType === "subsede") {
      if (subsedeCongregationIds.length === 0) {
        return { matchCongregationIds: [], matchEitherIds: null, empty: true };
      }
      return { matchCongregationIds: subsedeCongregationIds, matchEitherIds: null, empty: false };
    }
    return { matchCongregationIds: null, matchEitherIds: [contextFilter.orgId], empty: false };
  }, [contextFilter, subsedeCongregationIds]);

  const memberScopeKey = contextFilter
    ? contextFilter.orgType === "subsede"
      ? `subsede:${contextFilter.orgId}:${subsedeCongregationIds.join(",")}`
      : `direct:${contextFilter.orgId}`
    : "all";

  const fetchMembersPage = useCallback(async (page: number, opts: { silent?: boolean } = {}) => {
    if (!church) return;
    const scope = buildMemberScope();
    const trimmedSearch = searchQuery.trim().toLowerCase();
    const cacheKey = `${church.id}|${memberScopeKey}|${filterStatus}|${trimmedSearch}|${page}`;

    // Subsede sem nenhuma congregação filha: resultado é sempre vazio — não
    // vale a pena ir ao servidor.
    if (scope.empty) {
      membersCacheRef.current.set(cacheKey, { items: [], total: 0, hasNextPage: false, ts: Date.now() });
      setMembers([]);
      setTotalFilteredCount(0);
      setHasNextPage(false);
      setListError(null);
      setLoading(false);
      setPageTransitioning(false);
      return;
    }

    const requestId = ++membersRequestIdRef.current;
    membersAbortRef.current?.abort(); // cancela qualquer requisição de página/filtro anterior ainda em voo
    const controller = new AbortController();
    membersAbortRef.current = controller;

    if (!opts.silent) setPageTransitioning(true);
    try {
      const from = (page - 1) * MEMBERS_VIEW_PAGE_SIZE;
      // range(from, from + PAGE_SIZE) pede PAGE_SIZE + 1 linhas (0-indexado,
      // inclusive nas duas pontas) — a linha extra nunca é exibida, serve
      // apenas para provar que existe próxima página sem precisar contar.
      const to = from + MEMBERS_VIEW_PAGE_SIZE;

      // Nunca solicitar count exato ao PostgREST aqui — ver comentário acima
      // de fetchMembersPage sobre o timeout que essa opção provoca sob RLS
      // hierárquica, tanto sem busca quanto com busca textual.
      let query = supabase
        .from("members")
        .select(MEMBER_LIST_COLUMNS)
        .eq("organization_id", church.id);

      if (scope.matchCongregationIds) {
        query = query.in("congregation_id", scope.matchCongregationIds);
      } else if (scope.matchEitherIds) {
        const orExpr = scope.matchEitherIds
          .flatMap(id => [`congregation_id.eq.${id}`, `sector_id.eq.${id}`])
          .join(",");
        query = query.or(orExpr);
      }

      if (filterStatus !== "all") {
        query = query.eq("status", filterStatus);
      }
      // Busca única contra a coluna gerada search_blob (índice GIN trigram) —
      // substitui matchesMemberSearch client-side, mesmos campos cobertos
      // (nome, apelido, código, CPF, telefone, WhatsApp, função, cargo, e-mail).
      if (trimmedSearch) {
        query = query.ilike("search_blob", `%${trimmedSearch}%`);
      }

      const { data, error } = await query
        .order("full_name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
        .abortSignal(controller.signal);

      if (requestId !== membersRequestIdRef.current) return; // resposta obsoleta — outra página/filtro já foi solicitada

      if (error) {
        if ((error as { name?: string; code?: string }).name === "AbortError") return;
        console.error("[Membros] Erro ao carregar página:", error);
        if (!opts.silent) {
          // Requisição visível (não é uma revalidação silenciosa em segundo
          // plano): sem dados confiáveis desta página, nunca deixar
          // "Próxima" habilitada com base numa resposta anterior obsoleta.
          setHasNextPage(false);
          setListError(error.message || t("Erro ao carregar membros"));
          toast.error(t("Erro ao carregar membros"), { description: error.message });
        }
        return;
      }

      const rows = (data as MemberListItem[]) ?? [];
      const pageHasNext = rows.length > MEMBERS_VIEW_PAGE_SIZE;
      const items = pageHasNext ? rows.slice(0, MEMBERS_VIEW_PAGE_SIZE) : rows; // descarta a 101ª linha (só serve para detectar próxima página)

      let total: number;
      if (!trimmedSearch) {
        // Sem busca: total vem do mesmo escopo já contado pela RPC de
        // cabeçalho (statusCountsRef). Enquanto a RPC ainda não respondeu
        // (raríssimo — ambas disparam em paralelo), evita regredir para 0
        // quando já existem linhas nesta página (isso mostraria "Nenhum
        // membro encontrado" junto da própria lista preenchida) usando o
        // maior valor conhecido; o efeito abaixo corrige o total tão logo a
        // RPC responder.
        const counts = statusCountsRef.current;
        const derived = counts
          ? (filterStatus === "all"
              ? Object.values(counts).reduce((a, b) => a + (b ?? 0), 0)
              : (counts[filterStatus as MemberStatus] ?? 0))
          : null;
        const previousKnown = membersCacheRef.current.get(cacheKey)?.total ?? totalFilteredCountRef.current;
        total = derived ?? Math.max(items.length, previousKnown);
      } else {
        // Com busca: nunca fabricamos um total exato (isso exigiria contar
        // — o próprio problema que estamos evitando). `total` aqui só é
        // usado como valor de fallback/cache; o texto exibido na UI usa
        // `hasNextPage` + `members.length` diretamente (ver seção de
        // paginação/render). Guardamos offset + linhas retornadas como a
        // melhor estimativa conhecida até agora (torna-se exata quando
        // `pageHasNext` é false, isto é, na última página).
        total = from + items.length;
      }
      membersCacheRef.current.set(cacheKey, { items, total, hasNextPage: pageHasNext, ts: Date.now() });
      setMembers(items);
      setTotalFilteredCount(total);
      setHasNextPage(pageHasNext);
      setListError(null);
      // Sem prefetch automático da próxima página: fetchMembersPage também
      // faz setMembers/setTotalFilteredCount/setHasNextPage, então um
      // prefetch em segundo plano poderia substituir silenciosamente a
      // página atualmente visível na tela (race condition) se o usuário
      // ainda estiver nela quando a resposta do prefetch chegasse. A página
      // seguinte só é buscada quando o usuário efetivamente clica em
      // "Próxima" (ver botão de paginação).
    } finally {
      if (requestId === membersRequestIdRef.current) {
        setLoading(false);
        setPageTransitioning(false);
      }
    }
  }, [church, buildMemberScope, memberScopeKey, filterStatus, searchQuery, t]);

  // Debounce curto (300ms) do campo de busca — evita uma requisição por tecla.
  useEffect(() => {
    const handle = setTimeout(() => setSearchQuery(searchInput), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    if (!user || churchLoading) return;
    if (!church) { setMembers([]); setTotalFilteredCount(0); setHasNextPage(false); setLoading(false); return; }

    const trimmedSearch = searchQuery.trim().toLowerCase();
    const cacheKey = `${church.id}|${memberScopeKey}|${filterStatus}|${trimmedSearch}|${currentPage}`;
    const cached = membersCacheRef.current.get(cacheKey);

    if (cached) {
      // Cache quente: exibe imediatamente (nunca zero falso, nunca spinner) e
      // revalida em segundo plano se os dados já não forem tão recentes.
      setMembers(cached.items);
      setTotalFilteredCount(cached.total);
      setHasNextPage(cached.hasNextPage);
      setListError(null);
      setLoading(false);
      setPageTransitioning(false);
      if (Date.now() - cached.ts > CACHE_TTL_MS) {
        void fetchMembersPage(currentPage, { silent: true });
      }
      return;
    }

    void fetchMembersPage(currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setLoading(true) condicional lê `members` sem precisar disparar o efeito quando `members` muda (evitaria loop)
  }, [user, church, churchLoading, memberScopeKey, filterStatus, searchQuery, currentPage, fetchMembersPage]);

  // Mostra o spinner grande de página inteira somente na 1ª carga real (sem
  // nenhuma linha ainda) — trocas subsequentes de página/filtro usam
  // pageTransitioning (indicador discreto, mantendo a tabela anterior visível).
  useEffect(() => {
    if (members.length === 0 && pageTransitioning) setLoading(true);
    else if (members.length > 0) setLoading(false);
  }, [members.length, pageTransitioning]);

  // ── Contadores do cabeçalho — RPC independente, nunca bloqueia a listagem ──
  // Escopo igual ao da listagem (hierarquia), mas independente de busca/status
  // selecionado no filtro de abas — mostra sempre o total por status da
  // unidade em foco, exatamente como antes (scopedMembers agrupado por status).
  useEffect(() => {
    if (!user || churchLoading || !church) return;
    let cancelled = false;
    const scope = buildMemberScope();
    if (scope.empty) {
      setStatusCounts({});
      return;
    }
    setStatusCounts(null); // "—" enquanto carrega — nunca 0 falso
    supabase
      .rpc("member_status_counts", {
        p_organization_id: church.id,
        p_match_congregation_ids: scope.matchCongregationIds,
        p_match_either_ids: scope.matchEitherIds,
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[Membros] Erro ao carregar contadores:", error.message);
          setStatusCounts({}); // degrada para "0" explícito em vez de "—" infinito
          return;
        }
        const counts: MemberStatusCounts = {};
        for (const row of (data ?? []) as { status: string; total: number }[]) {
          if (isMemberStatus(row.status)) counts[row.status] = Number(row.total);
        }
        setStatusCounts(counts);
      });
    return () => { cancelled = true; };
  }, [user, churchLoading, church, memberScopeKey, buildMemberScope]);

  // Mantém "1–100 de N" sincronizado com o total já contado pela RPC de
  // cabeçalho acima sempre que não há busca textual ativa — fetchMembersPage
  // nunca pede count:"exact" (ver comentário junto da consulta a
  // MEMBER_LIST_COLUMNS) para não repetir, a cada página, uma contagem
  // completa cara sob RLS hierárquica. Quando há busca, este efeito não
  // interfere — não existe total exato fabricado nesse caso; a UI de
  // paginação usa `hasNextPage` + `members.length` diretamente (ver seção de
  // paginação/render).
  useEffect(() => {
    if (searchQuery.trim()) return;
    if (!statusCounts) return; // ainda carregando — mantém o último total conhecido, nunca regride para 0
    const derived = filterStatus === "all"
      ? Object.values(statusCounts).reduce((a, b) => a + (b ?? 0), 0)
      : (statusCounts[filterStatus as MemberStatus] ?? 0);
    setTotalFilteredCount(derived);
  }, [statusCounts, filterStatus, searchQuery]);

  // Invalida o cache e recarrega a página atual + contadores após qualquer
  // escrita (criar/editar/excluir/mudar status/importar) — nunca reintroduz o
  // fetch-all: apenas repete a mesma consulta paginada de antes.
  const refreshAfterMutation = useCallback(async () => {
    membersCacheRef.current.clear();
    await fetchMembersPage(currentPage);
    if (church) {
      const scope = buildMemberScope();
      if (!scope.empty) {
        const { data, error } = await supabase.rpc("member_status_counts", {
          p_organization_id: church.id,
          p_match_congregation_ids: scope.matchCongregationIds,
          p_match_either_ids: scope.matchEitherIds,
        });
        if (!error) {
          const counts: MemberStatusCounts = {};
          for (const row of (data ?? []) as { status: string; total: number }[]) {
            if (isMemberStatus(row.status)) counts[row.status] = Number(row.total);
          }
          setStatusCounts(counts);
        }
      } else {
        setStatusCounts({});
      }
    }
  }, [fetchMembersPage, currentPage, church, buildMemberScope]);

  // Lista leve (id + nome, limitada) para "vincular a membro existente" na
  // aba Família do modal — nunca usa a listagem paginada (que só tem a
  // página atual) nem baixa a organização inteira.
  const reloadFamilyLinkOptions = useCallback(async () => {
    if (!church) return;
    const { data, error } = await supabase
      .from("members")
      .select("id, full_name")
      .eq("organization_id", church.id)
      .order("full_name", { ascending: true })
      .limit(MEMBER_LINK_OPTIONS_LIMIT);
    if (error) {
      console.warn("[Membros] Não foi possível carregar opções de família:", error.message);
      setFamilyLinkOptions([]);
      return;
    }
    setFamilyLinkOptions((data as MemberLinkOption[]) ?? []);
  }, [church]);

  // ── Load sub-organizations for selectors (matrix + setores + congregações) ────

  const reloadSubOrgs = useCallback(async () => {
    if (!church) return;

    // A estrutura municipal possui até três níveis abaixo da matriz:
    // setor → subsede → congregação. A consulta anterior parava no segundo
    // nível e deixava congregações de subsedes sem nome nos seletores/listas.
    const descendants: SubOrg[] = [];
    let parentIds = [church.id];

    for (let depth = 0; depth < 3 && parentIds.length > 0; depth += 1) {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, organization_type")
        .in("parent_id", parentIds)
        .eq("active", true)
        .order("name", { ascending: true });

      if (error) {
        console.error("[Membros] Erro ao carregar estrutura:", error);
        toast.error(t("Erro ao carregar estrutura"), { description: error.message });
        return;
      }

      const level = (data as SubOrg[] | null) ?? [];
      descendants.push(...level);
      parentIds = level.map((organization) => organization.id);
    }

    const all: SubOrg[] = [
      { id: church.id, name: church.name, organization_type: church.organization_type || "matriz" },
      ...descendants,
    ].sort((a, b) => a.name.localeCompare(b.name));
    setSubOrgs(all);
  }, [church, t]);

  useEffect(() => {
    if (!user || churchLoading) return;
    if (!church) return;
    void reloadSubOrgs();
  }, [user, church, churchLoading, reloadSubOrgs]);

  // ── Paginação/contagem exibida — inteiramente derivada do servidor ─────────
  // `members` já é a página atual (fetchMembersPage), nunca um array
  // carregado por completo e fatiado no cliente.
  //
  // Sem busca textual: `totalFilteredCount` é exato (RPC member_status_counts,
  // nunca count:"exact") e `totalPages`/`visiblePage` funcionam como antes.
  //
  // Com busca textual: não existe total exato (evitar count:"exact" é
  // exatamente o que corrige o timeout ao buscar) — a navegação usa
  // `hasNextPage` (detectado pela linha extra da própria consulta, ver
  // fetchMembersPage) em vez de `totalPages`. `visiblePage` passa a ser o
  // próprio `currentPage` (sem clamp por um total desconhecido); o efeito de
  // reset abaixo garante que trocar a busca sempre volta para a página 1.
  const visibleMembers = members;
  const isSearchActive = searchQuery.trim().length > 0;
  const totalPages = Math.max(1, Math.ceil(totalFilteredCount / MEMBERS_VIEW_PAGE_SIZE));
  const visiblePage = isSearchActive ? currentPage : Math.min(currentPage, totalPages);
  const pageStart = (visiblePage - 1) * MEMBERS_VIEW_PAGE_SIZE;
  // Mostra a paginação quando sabidamente há mais de uma página: sem busca,
  // pelo total exato; com busca, quando já passamos da 1ª página ou existe
  // próxima (nunca dependendo de um total fabricado).
  const showPagination = isSearchActive
    ? (visiblePage > 1 || hasNextPage)
    : totalFilteredCount > MEMBERS_VIEW_PAGE_SIZE;
  // Texto honesto de intervalo — nunca um total fabricado durante busca.
  const rangeLabel = isSearchActive
    ? (hasNextPage
        ? `${pageStart + 1}–${pageStart + visibleMembers.length} resultados — há mais resultados`
        : `${pageStart + 1}–${pageStart + visibleMembers.length} de ${pageStart + visibleMembers.length} resultados`)
    : `${pageStart + 1}–${Math.min(pageStart + MEMBERS_VIEW_PAGE_SIZE, totalFilteredCount)} de ${totalFilteredCount} membros`;

  useEffect(() => {
    setCurrentPage(1);
    // Limpa hasNextPage também: sem isto, uma busca/filtro/contexto novo
    // herdaria momentaneamente o hasNextPage=true da busca anterior,
    // habilitando "Próxima" antes de a nova página 1 responder.
    setHasNextPage(false);
  }, [searchQuery, filterStatus, contextFilter?.orgId]);

  useEffect(() => {
    if (isSearchActive) return; // sem total conhecido durante busca — nunca clampar por um totalPages fabricado
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages, isSearchActive]);

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
        return form.photo_url;
      }
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      return urlData?.publicUrl ?? null;
    } catch (e) {
      toast.warning(t("Erro inesperado no upload da foto."));
      return form.photo_url;
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
        return form.civil_document_url || null;
      }

      return path;
    } catch {
      toast.error(t("Erro inesperado no upload do documento civil."));
      return form.civil_document_url || null;
    } finally {
      setUploadingCivilDocument(false);
    }
  };

  const removeUploadedMemberAssets = async (
    memberId: string,
    photoUrl: string | null,
    civilDocumentUrl: string | null,
  ) => {
    const removals: Promise<unknown>[] = [];

    if (photoFile && photoUrl) {
      const photoPath = (() => {
        try {
          const url = new URL(photoUrl);
          const marker = "/storage/v1/object/public/avatars/";
          const markerIndex = url.pathname.indexOf(marker);
          return markerIndex >= 0
            ? decodeURIComponent(url.pathname.slice(markerIndex + marker.length))
            : null;
        } catch {
          return null;
        }
      })();
      if (photoPath) {
        removals.push(supabase.storage.from("avatars").remove([photoPath]));
      }
    }

    if (civilDocumentFile && civilDocumentUrl) {
      removals.push(supabase.storage.from("member-documents").remove([civilDocumentUrl]));
    }

    if (removals.length > 0) {
      await Promise.allSettled(removals);
    }

    const { error } = await supabase
      .from("members")
      .delete()
      .eq("id", memberId)
      .eq("organization_id", church?.id ?? "");

    if (error) {
      console.error("[Membros] failed to compensate incomplete member creation:", error.message);
      toast.error(t("O cadastro não foi concluído e precisa de revisão administrativa."), {
        description: t("Nenhum novo cadastro deve ser iniciado até esta pendência ser conferida."),
      });
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
    setEditingMemberFull(null);
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
    setFamilyEntries([]);
    setPendingFamilyEntries([]);
    setFamilyDraft(null);
    setAddressEntries([]);
    setPendingAddressEntries([]);
    setAddressDraft(null);
    setModalOpen(true);
    void reloadFamilyLinkOptions();
  };

  // Busca a ficha COMPLETA do membro sob demanda (um único registro, por id
  // — indexado, instantâneo) somente quando o membro é efetivamente aberto.
  // Antes, a edição usava o objeto já presente no array `members`, que
  // guardava a organização inteira (select("*") de todos os 7.121 membros);
  // agora `members` só tem a página atual com colunas enxutas
  // (MEMBER_LIST_COLUMNS), então a ficha completa precisa vir sob demanda.
  // O modal abre IMEDIATAMENTE (resposta visual ao clique) com um estado de
  // carregamento próprio (editLoading) enquanto a ficha chega.
  const openEdit = async (id: string) => {
    setIsNewMember(false);
    setEditingId(id);
    setEditingMemberFull(null);
    setEditLoading(true);
    setActiveTab("pessoal");
    setPhotoFile(null);
    setCivilDocumentFile(null);
    setPendingFamilyEntries([]);
    setFamilyDraft(null);
    setPendingAddressEntries([]);
    setAddressDraft(null);
    setModalOpen(true);
    void reloadFamilyLinkOptions();

    const { data, error } = await supabase
      .from("members")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      toast.error(t("Não foi possível carregar os dados do membro."), { description: error?.message });
      closeModal();
      setEditLoading(false);
      return;
    }

    const m = data as Member;
    setEditingMemberFull(m);
    setForm({
      full_name:         m.full_name,
      known_name:        m.known_name || "",
      member_code:       m.member_code || "",
      member_role:       m.member_role || "Membro",
      administrative_role: m.administrative_role || "Nenhum",
      status:            isMemberStatus(m.status) ? m.status : "Ativo",
      phone:             m.phone || "",
      whatsapp:          m.whatsapp || "",
      email:             m.email || "",
      photo_url:         m.photo_url || null,
      birth_date:        m.birth_date || "",
      birth_place:       m.birth_place || "",
      gender:            m.gender || "",
      marital_status:    m.marital_status || "",
      cpf:               m.cpf || "",
      cpf_pending:       m.cpf_pending ?? false,
      rg:                m.rg || "",
      rg_issuer:         m.rg_issuer || "",
      rg_issue_date:     m.rg_issue_date || "",
      nationality:       m.nationality || "",
      education_level:   m.education_level || "",
      profession:        m.profession || "",
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
      baptism_place:     m.baptism_place || "",
      conversion_date:   m.conversion_date || "",
      admission_type:    m.admission_type || "",
      cgadb_number:      m.cgadb_number || "",
      congregation_id:   m.congregation_id || null,
      sector_id:         m.sector_id || null,
      father_name:       m.father_name || "",
      mother_name:       m.mother_name || "",
      spouse_name:       m.spouse_name || "",
      notes:             m.notes || "",
      incomplete_registration: m.incomplete_registration ?? false,
      contact_pending:   m.contact_pending ?? false,
      requires_review:   m.requires_review ?? false,
      civil_document_type:   m.civil_document_type || getCivilDocLabel(m.marital_status || "") || "",
      civil_document_status: m.civil_document_status || "Pendente",
      civil_document_url:    m.civil_document_url || null,
      civil_document_uploaded_at: m.civil_document_uploaded_at || null,
      civil_document_notes:  m.civil_document_notes || "",
      holy_spirit_baptism_date: m.holy_spirit_baptism_date || "",
      consecration_date:        m.consecration_date || "",
    });
    setPhotoPreview(m.photo_url || null);
    setEditLoading(false);
    void loadFamilyEntries(m.id);
    void loadAddressEntries(m.id);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setEditingMemberFull(null);
    setEditLoading(false);
    setPhotoPreview(null);
    setPhotoFile(null);
    setCivilDocumentFile(null);
    setFamilyEntries([]);
    setPendingFamilyEntries([]);
    setFamilyDraft(null);
    setAddressEntries([]);
    setPendingAddressEntries([]);
    setAddressDraft(null);
    // Fechamento explícito (cancelar OU salvar com sucesso, que já chama
    // closeModal) — o rascunho de retomada deixa de fazer sentido a partir
    // daqui.
    discardFormDraft(MEMBER_CADASTRO_DRAFT_KEY);
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

  const isDuplicateCpfError = (err: { message?: string; code?: string } | null): boolean =>
    !!err && err.code === "23505" && !!err.message?.includes("members_org_cpf_unique_idx");

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
    email:       form.email?.trim().toLowerCase() || null,
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
      known_name:         form.known_name?.trim() || null,
      birth_place:        form.birth_place?.trim() || null,
      nationality:        form.nationality?.trim() || null,
      education_level:    form.education_level || null,
      profession:         form.profession?.trim() || null,
      whatsapp:           form.whatsapp?.trim() || null,
      gender:             form.gender || null,
      marital_status:     form.marital_status || null,
      cpf:                form.cpf?.trim() || null,
      cpf_pending:        form.cpf_pending,
      // RG fields kept for backward compat
      rg:                 form.rg?.trim() || null,
      rg_issuer:          form.rg_issuer?.trim() || null,
      rg_issue_date:      form.rg_issue_date || null,
      zip_code:           form.zip_code?.trim() || null,
      street:             form.street?.trim() || null,
      address_number:     form.address_number?.trim() || null,
      address_complement: form.address_complement?.trim() || null,
      neighborhood:       form.neighborhood?.trim() || null,
      conversion_date:    form.conversion_date || null,
      baptism_place:      form.baptism_place?.trim() || null,
      admission_type:     form.admission_type || null,
      cgadb_number:       form.cgadb_number?.trim() || null,
      administrative_role: form.administrative_role === "Nenhum" ? null : (form.administrative_role || null),
      father_name:        form.father_name?.trim() || null,
      mother_name:        form.mother_name?.trim() || null,
      spouse_name:        form.spouse_name?.trim() || null,
      sector_id:          form.sector_id || null,
      congregation_id:    form.congregation_id || null,
      incomplete_registration: form.incomplete_registration,
      contact_pending:    form.contact_pending,
      requires_review:    form.requires_review,
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
      const contactCheck = checkRequiredMemberContacts(form);
      // Comparação explícita (`=== false`), não `!contactCheck.ok`: com
      // strictNullChecks desligado neste projeto (tsconfig.json), o
      // narrowing de uniões discriminadas por booleano literal via negação
      // não é confiável no TypeScript — `=== false` narrowing funciona
      // corretamente mesmo assim (union declarada em
      // src/lib/memberFormValidation.ts).
      if (contactCheck.ok === false) {
        toast.error(t(MEMBER_CONTACT_CHECK_MESSAGES[contactCheck.reason]));
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
    const contactCheck = checkRequiredMemberContacts(form);
    // Comparação explícita — ver comentário equivalente em validateCurrentTabBeforeLeaving.
    if (contactCheck.ok === false) {
      toast.error(t(MEMBER_CONTACT_CHECK_MESSAGES[contactCheck.reason]));
      setActiveTab("contato");
      return;
    }
    if (!form.member_role) {
      toast.error(t("Função eclesiástica é obrigatória."));
      setActiveTab("funcao");
      return;
    }
    if (!user) return;
    const orgCheck = checkOrganizationContext(church?.id, churchLoading);
    // Comparação explícita do discriminante — ver nota em memberFormValidation
    // sobre strictNullChecks: false afetando o estreitamento de tipo aqui.
    if (orgCheck.ok === false) {
      toast.error(t(orgCheck.message));
      return;
    }
    if (!church) return; // já reportado acima — apenas estreita o tipo para o TypeScript.

    // ── Validação de CPF (obrigatório, dígito verificador válido, sem
    // duplicidade na organização) — cadastro manual NUNCA usa a exceção de
    // cpf_pending, reservada à futura importação do legado.
    let cpfLookup = await supabase
      .from("members")
      .select("id, cpf")
      .eq("organization_id", church.id)
      .eq("cpf_pending", false)
      .not("cpf", "is", null);
    if (cpfLookup.error && isMissingColumnError(cpfLookup.error)) {
      // cpf_pending ainda não existe neste ambiente (migration não aplicada)
      // — degrada para checar duplicidade sem distinguir pendentes, em vez
      // de bloquear o cadastro por completo.
      console.warn("[Membros] cpf_pending column missing, degrading duplicate check:", cpfLookup.error.message);
      cpfLookup = await supabase.from("members").select("id, cpf").eq("organization_id", church.id).not("cpf", "is", null);
    }
    if (cpfLookup.error) {
      toast.error(t("Erro ao validar CPF"), { description: cpfLookup.error.message });
      return;
    }
    const existingCpfs = new Set(
      (cpfLookup.data ?? [])
        .filter(row => row.id !== editingId)
        .map(row => (row.cpf ?? "").replace(/\D/g, ""))
        .filter(Boolean),
    );
    const cpfCheck = checkCpfForManualSave(form.cpf, existingCpfs);
    if ("reason" in cpfCheck) {
      toast.error(t(CPF_CHECK_MESSAGES[cpfCheck.reason]));
      setActiveTab("pessoal");
      return;
    }
    // Normaliza para 11 dígitos antes de gravar — mantém consistência para a
    // unicidade no banco (members_org_cpf_unique_idx) e para exibição via
    // formatCpf() em outros pontos do app. NÃO usamos setField() aqui: o
    // state do React só atualiza no próximo render, então buildExtendedPayload
    // (chamado logo abaixo, ainda síncrono nesta mesma execução) leria o CPF
    // antigo — por isso o valor normalizado é injetado diretamente no payload.
    const normalizedCpf = cpfCheck.normalized;
    setField("cpf", normalizedCpf);

    setSaving(true);
    try {
      // Salva a ficha inteira em uma única operação. A versão anterior fazia
      // primeiro um UPDATE "básico" e depois outro com CPF/endereço/dados
      // eclesiásticos; se o segundo falhasse, a UI dizia que parte havia sido
      // salva e deixava um cadastro incoerente. Agora o banco aceita tudo ou
      // rejeita tudo.
      const saveFullMember = async (
        memberId: string,
        photoUrl: string | null,
        civilDocumentUrl: string | null,
      ) => {
        const { error } = await supabase
          .from("members")
          .update({
            ...buildCorePayload(),
            ...buildExtendedPayload(photoUrl, civilDocumentUrl),
            cpf: normalizedCpf,
          })
          .eq("id", memberId)
          .select("id")
          .single();
        if (error && isDuplicateMemberCodeError(error)) {
          toast.error(t("Este código de membro já está em uso por outro membro desta igreja."), {
            description: t("Escolha outro código ou deixe o campo em branco."),
          });
          return false;
        }
        if (error && isDuplicateCpfError(error)) {
          toast.error(t("Já existe um membro com este CPF nesta igreja."));
          return false;
        }
        if (error && isMissingColumnError(error)) {
          console.warn("[Membros] member schema needs migrations:", error.message);
          toast.error(t("Não foi possível salvar a ficha completa porque há migrations pendentes no banco."));
          return false;
        }
        if (error) {
          toast.error(t("Erro ao salvar"), { description: error.message });
          return false;
        }
        return true;
      };

      if (isNewMember) {
        // INSERT atômico da ficha completa. Foto/documento são atualizados
        // depois do upload porque o path depende do id gerado.
        const { data: inserted, error: insErr } = await supabase
          .from("members")
          .insert({
            ...buildCorePayload(),
            ...buildExtendedPayload(null, null),
            cpf: normalizedCpf,
            created_by: user.id,
            organization_id: church.id,
          })
          .select("id")
          .single();

        if (insErr || !inserted) {
          console.error("[Membros] insert error:", insErr);
          if (isDuplicateCpfError(insErr)) {
            toast.error(t("Já existe um membro com este CPF nesta igreja."));
          } else if (isDuplicateMemberCodeError(insErr)) {
            toast.error(t("Este código de membro já está em uso por outro membro desta igreja."));
          } else {
            toast.error(t("Erro ao criar membro"), { description: insErr?.message ?? t("Falha ao inserir") });
          }
          return;
        }

        const newId = inserted.id;
        console.log("[Membros] new member created:", newId);

        const photoUrl  = await uploadPhotoIfNeeded(newId);
        const civilDocumentUrl = await uploadCivilDocumentIfNeeded(newId);
        const allSaved = await saveFullMember(newId, photoUrl, civilDocumentUrl);
        if (!allSaved) {
          await removeUploadedMemberAssets(newId, photoUrl, civilDocumentUrl);
          return;
        }

        // Família e endereços adicionados antes do membro existir ficaram em
        // fila local (pendingFamilyEntries/pendingAddressEntries). Se qualquer
        // parte falhar, compensamos o cadastro inteiro para não deixar uma
        // ficha parcialmente gravada que pareça concluída na interface.
        if (pendingFamilyEntries.length > 0) {
          const { error: familyErr } = await supabase.from("member_family").insert(
            pendingFamilyEntries.map(entry => ({
              member_id: newId,
              organization_id: church.id,
              relation: entry.relation,
              full_name: entry.full_name.trim(),
              related_member_id: entry.related_member_id || null,
              birth_date: entry.birth_date || null,
              gender: entry.gender || null,
              cpf: entry.cpf?.trim() || null,
              phone: entry.phone?.trim() || null,
              notes: entry.notes?.trim() || null,
            })),
          );
          if (familyErr) {
            console.error("[Membros] pending family insert failed:", familyErr.message);
            await removeUploadedMemberAssets(newId, photoUrl, civilDocumentUrl);
            toast.error(t("Cadastro cancelado porque os dados familiares não puderam ser salvos."));
            return;
          }
        }
        if (pendingAddressEntries.length > 0) {
          const { error: addressErr } = await supabase.from("member_addresses").insert(
            pendingAddressEntries.map(entry => ({
              member_id: newId,
              organization_id: church.id,
              address_type: entry.address_type,
              zip_code: entry.zip_code?.trim() || null,
              street: entry.street?.trim() || null,
              number: entry.number?.trim() || null,
              complement: entry.complement?.trim() || null,
              neighborhood: entry.neighborhood?.trim() || null,
              city: entry.city?.trim() || null,
              state: entry.state?.trim() || null,
              country: entry.country?.trim() || "Brasil",
              is_primary: entry.is_primary,
              notes: entry.notes?.trim() || null,
            })),
          );
          if (addressErr) {
            console.error("[Membros] pending address insert failed:", addressErr.message);
            await removeUploadedMemberAssets(newId, photoUrl, civilDocumentUrl);
            toast.error(t("Cadastro cancelado porque os endereços não puderam ser salvos."));
            return;
          }
        }

        toast.success(t("Membro cadastrado com sucesso!"));
        await refreshAfterMutation();
        if (openWallet) {
          // `form` já contém exatamente os dados recém-gravados (buildCorePayload
          // + buildExtendedPayload) — não é preciso procurar o novo membro na
          // listagem paginada (que pode nem incluir esta página).
          const saved: Member = { ...(form as Member), id: newId, photo_url: photoUrl, civil_document_url: civilDocumentUrl };
          setWalletMember(saved);
        }
        closeModal();

        // Open invite modal after creating a new member
        setInviteModal({
          open:       true,
          memberId:   newId,
          memberName: form.full_name.trim(),
          whatsapp:   form.whatsapp?.trim() || null,
          email:      form.email?.trim() || null,
        });

      } else {
        // ── EDIT existing member ─────────────────────────────────────────────
        if (!editingId) {
          toast.error(t("ID do membro não encontrado. Feche e tente novamente."));
          return;
        }

        console.log("[Membros][EDIT] id=", editingId);

        const photoUrl = await uploadPhotoIfNeeded(editingId);
        const civilDocumentUrl = await uploadCivilDocumentIfNeeded(editingId);
        const allSaved = await saveFullMember(editingId, photoUrl, civilDocumentUrl);
        if (!allSaved) return;
        toast.success(t("Membro atualizado com sucesso!"));

        await refreshAfterMutation();
        closeModal();
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────────

  const removeMember = async (m: Pick<Member, "id" | "full_name">) => {
    if (!church || !canPermanentlyDeleteMember) return;
    if (!confirm(`${t("Excluir definitivamente")} ${m.full_name}? ${t("Esta ação não pode ser desfeita.")}`)) return;

    const { error } = await supabase
      .from("members")
      .delete()
      .eq("id", m.id)
      .eq("organization_id", church.id);

    if (error) {
      toast.error(t("Não foi possível excluir o membro"), {
        description: `${t("O cadastro pode possuir histórico vinculado. Remova os vínculos ou mantenha-o inativo.")} ${error.message}`,
      });
      return;
    }

    toast.success(t("Membro excluído definitivamente"));
    await refreshAfterMutation();
  };

  // ── Status + período disciplinar (Fase 1C-H3) ───────────────────────────────
  // Toda mudança de status passa pela RPC transacional
  // `set_member_status_with_discipline` — não há mais caminho na interface que
  // atualize `members.status` diretamente via `.update()`. Campos disciplinares
  // vão nulos para status não disciplinares (a própria RPC decide o que fazer
  // com o período aberto, se houver).

  // Força o <select> de status a refletir visualmente o valor real persistido
  // — nunca fica preso na opção clicada quando a mudança é bloqueada,
  // cancelada ou falha (a única fonte de verdade é `m.status`, vindo do
  // servidor via refreshAfterMutation/fetchMembersPage).
  const resyncStatusSelect = (id: string) => {
    setMembers(prev => prev.map(x => (x.id === id ? { ...x } : x)));
  };

  const fetchDisciplinePeriod = async (
    memberId: string,
  ): Promise<{ ok: true; found: boolean; info: DisciplinePeriodInfo | null } | { ok: false }> => {
    const { data, error } = await supabase.rpc("get_current_member_discipline_period", {
      p_member_id: memberId,
    });
    if (error) {
      toast.error(t("Não foi possível consultar o período disciplinar."), { description: error.message });
      return { ok: false };
    }
    const payload = data as {
      found?: boolean;
      discipline_started_at?: string | null;
      discipline_expected_end_at?: string | null;
    } | null;
    if (!payload?.found) return { ok: true, found: false, info: null };
    return {
      ok: true,
      found: true,
      info: {
        startedAt: payload.discipline_started_at ?? null,
        expectedEndAt: payload.discipline_expected_end_at ?? null,
      },
    };
  };

  const applyMemberStatusChange = async (
    id: string,
    newStatus: MemberStatus,
    discipline: {
      startedAt?: string | null;
      expectedEndAt?: string | null;
      description?: string | null;
      endedAt?: string | null;
    } = {},
  ): Promise<boolean> => {
    if (!church) return false;
    const { error } = await supabase.rpc("set_member_status_with_discipline", {
      p_member_id: id,
      p_new_status: newStatus,
      p_discipline_started_at: discipline.startedAt ?? null,
      p_discipline_expected_end_at: discipline.expectedEndAt ?? null,
      p_discipline_description: discipline.description ?? null,
      p_discipline_ended_at: discipline.endedAt ?? null,
    });
    if (error) {
      toast.error(t("Erro ao atualizar"), { description: error.message });
      resyncStatusSelect(id);
      return false;
    }
    toast.success(t("Status atualizado"));
    await refreshAfterMutation();
    return true;
  };

  /**
   * onChange do <select> de status na listagem (desktop e mobile).
   *
   * A trava `beginMemberMutation`/`endMemberMutation` cobre toda a operação
   * para este membro — incluindo o tempo em que o diálogo disciplinar fica
   * aberto aguardando confirmação do usuário — para impedir que um segundo
   * evento (duplo clique, seleção rápida) dispare uma segunda RPC/diálogo
   * concorrente antes do próximo render desabilitar o select. Quando o fluxo
   * abre um diálogo, a trava só é liberada em `handleDisciplineDialogCancel`
   * ou `handleDisciplineDialogConfirm` (ver `keepLocked` abaixo); nos demais
   * casos, é sempre liberada em `finally`.
   */
  const handleStatusSelect = async (m: MemberListItem, newStatusRaw: string) => {
    if (!church) return;
    if (!isMemberStatus(newStatusRaw)) return;
    const newStatus = newStatusRaw;
    if (!beginMemberMutation(m.id)) return;
    let keepLocked = false;
    try {
      const wasInDiscipline = DISCIPLINE_STATUSES.has(m.status);
      const enteringDiscipline = newStatus === "Em disciplina" && !wasInDiscipline;
      const leavingDiscipline = wasInDiscipline && newStatus !== "Em disciplina";

      if (enteringDiscipline) {
        // Nunca preenche uma data silenciosamente: o selo/select só reflete
        // "Em disciplina" depois que o usuário confirmar o diálogo.
        resyncStatusSelect(m.id);
        setDisciplineDialog({ mode: "enter", member: m, targetStatus: newStatus, currentPeriod: null });
        keepLocked = true;
        return;
      }

      if (leavingDiscipline) {
        const lookup = await fetchDisciplinePeriod(m.id);
        resyncStatusSelect(m.id);
        if (!lookup.ok) return;
        if (!lookup.found) {
          toast.error(t("Registre o período disciplinar antes de alterar este status."));
          return;
        }
        setDisciplineDialog({ mode: "end", member: m, targetStatus: newStatus, currentPeriod: lookup.info });
        keepLocked = true;
        return;
      }

      await applyMemberStatusChange(m.id, newStatus);
    } finally {
      if (!keepLocked) endMemberMutation(m.id);
    }
  };

  /** Ação "Período" — disponível apenas para membros já em disciplina. */
  const openDisciplinePeriodAction = async (m: MemberListItem) => {
    if (!beginMemberMutation(m.id)) return;
    let keepLocked = false;
    try {
      const lookup = await fetchDisciplinePeriod(m.id);
      if (!lookup.ok) return;
      setDisciplineDialog({
        mode: "regularize",
        member: m,
        targetStatus: "Em disciplina",
        currentPeriod: lookup.found ? lookup.info : null,
      });
      keepLocked = true;
    } finally {
      if (!keepLocked) endMemberMutation(m.id);
    }
  };

  const handleDisciplineDialogCancel = () => {
    if (disciplineDialog) endMemberMutation(disciplineDialog.member.id);
    setDisciplineDialog(null);
  };

  const handleDisciplineDialogConfirm = async (payload: DisciplinePeriodConfirmPayload) => {
    if (!disciplineDialog) return;
    const memberId = disciplineDialog.member.id;
    setDisciplineSubmitting(true);
    try {
      const success = await applyMemberStatusChange(memberId, disciplineDialog.targetStatus, {
        startedAt: payload.startedAt,
        expectedEndAt: payload.expectedEndAt,
        description: payload.description,
        endedAt: payload.endedAt,
      });
      if (success) setDisciplineDialog(null);
    } finally {
      setDisciplineSubmitting(false);
      endMemberMutation(memberId);
    }
  };

  // ── Bulk import ──────────────────────────────────────────────────────────────

  const memberFields = [
    { key: "name",         label: t("Nome"),              required: true },
    { key: "member_code",  label: t("Código interno da igreja") },
    { key: "cpf",          label: t("CPF"),               required: true },
    { key: "phone",        label: t("Telefone"),          required: true },
    { key: "whatsapp",     label: t("WhatsApp"),          required: true },
    { key: "role",         label: t("Função") },
    { key: "email",        label: t("E-mail"),            required: true },
    { key: "status",       label: t("Status") },
  ];

  const memberTemplate = [
    { name: "João Silva",  member_code: "0001", cpf: "529.982.247-25", phone: "(11) 3333-0001", whatsapp: "(11) 99999-0001", role: "Diácono", email: "joao@email.com",  status: "Ativo" },
    { name: "Maria Souza", member_code: "0002", cpf: "111.444.777-35", phone: "(11) 99999-0002", whatsapp: "(11) 99999-0002", role: "Membro",  email: "maria@email.com", status: "Ativo" },
  ];

  const handleBulkImport = async (rows: Record<string, string>[]) => {
    if (!user || !church) return { success: 0, errors: 0 };
    if (rows.length === 0) return { success: 0, errors: 0 };

    const { data: currentMembers, error: lookupError } = await supabase
      .from("members")
      .select("cpf")
      .eq("organization_id", church.id)
      .not("cpf", "is", null);

    if (lookupError) {
      toast.error(t("Não foi possível validar os CPFs antes da importação."), {
        description: lookupError.message,
      });
      return { success: 0, errors: rows.length };
    }

    const knownCpfs = new Set(
      (currentMembers ?? [])
        .map(member => (member.cpf ?? "").replace(/\D/g, ""))
        .filter(Boolean),
    );

    const prepared: Record<string, string | null>[] = [];
    for (const row of rows) {
      const contactCheck = checkRequiredMemberContacts({
        phone: row.phone,
        whatsapp: row.whatsapp,
        email: row.email,
      });
      if (!row.name?.trim() || !row.cpf?.trim() || !contactCheck.ok) {
        toast.error(t("Importação cancelada: nome, CPF, telefone, WhatsApp e e-mail são obrigatórios."));
        return { success: 0, errors: rows.length };
      }

      const cpfCheck = checkCpfForManualSave(row.cpf, knownCpfs);
      if ("reason" in cpfCheck) {
        toast.error(t("Importação cancelada: há CPF inválido ou repetido no arquivo."));
        return { success: 0, errors: rows.length };
      }
      knownCpfs.add(cpfCheck.normalized);

      prepared.push({
        name: row.name.trim(),
        member_code: row.member_code?.trim() || null,
        cpf: cpfCheck.normalized,
        phone: row.phone.trim(),
        whatsapp: row.whatsapp.trim(),
        role: row.role?.trim() || "Membro",
        email: row.email.trim().toLowerCase(),
        status: row.status && isMemberStatus(row.status) ? row.status : "Ativo",
      });
    }

    const { data, error } = await supabase.rpc("import_members_batch", {
      p_organization_id: church.id,
      p_rows: prepared,
    });

    if (error) {
      console.error("[Membros] atomic bulk import failed:", error.message);
      toast.error(t("A importação inteira foi cancelada; nenhum membro foi gravado."), {
        description: error.message,
      });
      return { success: 0, errors: rows.length };
    }

    const result = data && typeof data === "object" && !Array.isArray(data)
      ? data as { success?: number; errors?: number }
      : {};
    const success = result.success ?? prepared.length;
    await refreshAfterMutation();
    return { success, errors: result.errors ?? 0 };
  };

  // ── Stats — sempre via RPC member_status_counts, nunca da página carregada ──
  // statusCounts === null enquanto a contagem carrega (renderiza "—", nunca
  // "0" falso); {} quando a organização/escopo legitimamente não tem membros.
  const countsLoading  = statusCounts === null;
  const countsTotal    = statusCounts ? Object.values(statusCounts).reduce((a, b) => a + (b ?? 0), 0) : 0;
  const activeCount     = statusCounts?.["Ativo"] ?? 0;
  const visitanteCount  = statusCounts?.["Visitante"] ?? 0;
  const falecidoCount   = statusCounts?.["Falecido"] ?? 0;
  const transferidoCount = statusCounts?.["Transferido"] ?? 0;

  const canPermanentlyDeleteMember =
    canWrite
    && (canonicalRole === "super_admin" || canonicalRole === "church_admin");

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

  // A Carteira precisa de campos (cpf, filiação, batismo) que não fazem parte
  // de MEMBER_LIST_COLUMNS — busca a ficha completa sob demanda, um único
  // registro por id, só quando o botão "Carteira" é realmente clicado.
  const openWalletFor = async (id: string) => {
    setWalletLoadingId(id);
    try {
      const { data, error } = await supabase.from("members").select("*").eq("id", id).maybeSingle();
      if (error || !data) {
        toast.error(t("Não foi possível carregar a carteira do membro."), { description: error?.message });
        return;
      }
      setWalletMember(data as Member);
    } finally {
      setWalletLoadingId(null);
    }
  };

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
              {countsLoading ? "—" : countsTotal} {t("cadastrados")} · {countsLoading ? "—" : activeCount} {t("ativos")} · {countsLoading ? "—" : visitanteCount} {t("visitantes")}
              {!countsLoading && falecidoCount > 0 && ` · ${falecidoCount} ${t("falecidos")}`}
              {!countsLoading && transferidoCount > 0 && ` · ${transferidoCount} ${t("transferidos")}`}
            </p>
          </div>
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <OperationalAssistant
                module="member"
                fields={[
                  { key: "name", label: t("Nome"), required: true },
                  { key: "member_code", label: t("Código interno da igreja") },
                  { key: "role", label: t("Função"), options: ["Pastor", "Diácono", "Diaconisa", "Obreiro", "Membro"] },
                  { key: "cpf", label: t("CPF"), required: true },
                  { key: "phone", label: t("Telefone"), required: true },
                  { key: "whatsapp", label: t("WhatsApp"), required: true },
                  { key: "email", label: t("E-mail"), required: true },
                ]}
                onConfirm={async data => {
                  if (!data.name || !user || !church) throw new Error(t("Nome obrigatório"));
                  const contactCheck = checkRequiredMemberContacts({
                    phone: data.phone,
                    whatsapp: data.whatsapp,
                    email: data.email,
                  });
                  // Comparação explícita — ver comentário em validateCurrentTabBeforeLeaving.
                  if (contactCheck.ok === false) {
                    throw new Error(t(MEMBER_CONTACT_CHECK_MESSAGES[contactCheck.reason]));
                  }
                  const { data: cpfRows, error: cpfLookupError } = await supabase
                    .from("members")
                    .select("cpf")
                    .eq("organization_id", church.id)
                    .not("cpf", "is", null);
                  if (cpfLookupError) throw new Error(cpfLookupError.message);
                  const existingCpfs = new Set(
                    (cpfRows ?? [])
                      .map(row => (row.cpf ?? "").replace(/\D/g, ""))
                      .filter(Boolean),
                  );
                  const cpfCheck = checkCpfForManualSave(data.cpf, existingCpfs);
                  // Comparação explícita — ver comentário em validateCurrentTabBeforeLeaving.
                  if (cpfCheck.ok === false) throw new Error(t(CPF_CHECK_MESSAGES[cpfCheck.reason]));
                  const { error } = await insertWithOrganizationScope("members", church.id, {
                    created_by: user.id, full_name: data.name, member_code: data.member_code?.trim() || null, member_role: data.role || "Membro",
                    cpf: cpfCheck.normalized,
                    phone: data.phone.trim(),
                    whatsapp: data.whatsapp.trim(),
                    email: data.email.trim().toLowerCase(),
                    joined_at: new Date().toISOString().split("T")[0], status: "Ativo",
                  });
                  if (error) throw new Error(String((error as { message?: string }).message || ""));
                  await refreshAfterMutation();
                  toast.success(t("Membro cadastrado!"));
                }}
                onEdit={data => {
                  setForm({
                    ...EMPTY_FORM,
                    full_name: data.name || "",
                    member_code: data.member_code || "",
                    member_role: data.role || "Membro",
                    cpf: data.cpf || "",
                    phone: data.phone || "",
                    whatsapp: data.whatsapp || "",
                    email: data.email || "",
                  });
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
              placeholder={t("Buscar por nome, CPF, código ou contato...")}
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
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
        {listError ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <p className="text-sm text-destructive">{t("Não foi possível carregar os membros.")}</p>
            <p className="text-xs text-muted-foreground max-w-md">{listError}</p>
            <button
              type="button"
              onClick={() => { setListError(null); void fetchMembersPage(currentPage); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-secondary rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
            >
              {t("Tentar novamente")}
            </button>
          </div>
        ) : (loading || churchLoading) && members.length === 0 ? (
          // Spinner de página inteira somente na 1ª carga real, sem nenhuma
          // linha em cache — trocas de página/filtro nunca voltam a este
          // estado (usam o indicador discreto de pageTransitioning abaixo,
          // mantendo a tabela anterior visível: "nenhum zero falso, nenhum
          // spinner indefinido bloqueando o conteúdo já conhecido").
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {pageTransitioning && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                <Loader2 size={12} className="animate-spin" /> {t("Atualizando...")}
              </div>
            )}
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
                  {visibleMembers.map(m => (
                    <tr key={m.id}
                      onClick={() => canWrite && openEdit(m.id)}
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
                            onChange={e => void handleStatusSelect(m, e.target.value)}
                            disabled={mutatingMemberIds.has(m.id)}
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${statusBadgeClass(m.status)}`}
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
                          <button type="button" onClick={() => navigate(`/admin/membros/${m.id}`)}
                            className="p-1 rounded hover:bg-secondary transition-colors" title={t("Ver perfil")}>
                            <User size={14} className="text-muted-foreground" />
                          </button>
                          <button type="button" onClick={() => openWalletFor(m.id)} disabled={walletLoadingId === m.id}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-accent/10 hover:bg-accent/20 text-accent text-[11px] font-medium transition-colors disabled:opacity-60"
                            title={t("Carteira de Membro")}>
                            {walletLoadingId === m.id ? <Loader2 size={12} className="animate-spin" /> : <CreditCard size={12} />} {t("Carteira")}
                          </button>
                          {canWrite && DISCIPLINE_STATUSES.has(m.status) && (
                            <button type="button" onClick={() => void openDisciplinePeriodAction(m)} disabled={mutatingMemberIds.has(m.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[11px] font-medium transition-colors disabled:opacity-60"
                              title={t("Período disciplinar")}>
                              {mutatingMemberIds.has(m.id) ? <Loader2 size={12} className="animate-spin" /> : <CalendarClock size={12} />} {t("Período")}
                            </button>
                          )}
                          {canWrite && (
                            <>
                              <button type="button" onClick={() => openEdit(m.id)}
                                className="p-1 rounded hover:bg-secondary transition-colors" title={t("Editar")}>
                                <Pencil size={14} className="text-muted-foreground" />
                              </button>
                              {canPermanentlyDeleteMember ? (
                                <button type="button" onClick={() => removeMember(m)}
                                  className="p-1 rounded hover:bg-destructive/10 transition-colors" title={t("Excluir definitivamente")}>
                                  <Trash2 size={14} className="text-muted-foreground" />
                                </button>
                              ) : (
                                <span className="p-1 text-[10px] text-muted-foreground" title={t("Exclusão disponível apenas para administradores")}>—</span>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {visibleMembers.length === 0 && (
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
              {visibleMembers.map((m, i) => (
                <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                  <div
                    role="button" tabIndex={0}
                    onClick={() => canWrite && openEdit(m.id)}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEdit(m.id); } }}
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
                            onChange={e => { e.stopPropagation(); void handleStatusSelect(m, e.target.value); }}
                            disabled={mutatingMemberIds.has(m.id)}
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border-0 flex-shrink-0 disabled:opacity-60 disabled:cursor-not-allowed ${statusBadgeClass(m.status)}`}
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
                      <button type="button" onClick={e => { e.stopPropagation(); navigate(`/admin/membros/${m.id}`); }}
                        className="p-1.5 rounded-lg hover:bg-secondary transition-colors" title={t("Ver perfil")}>
                        <User size={14} className="text-muted-foreground" />
                      </button>
                      <button type="button" onClick={e => { e.stopPropagation(); openWalletFor(m.id); }} disabled={walletLoadingId === m.id}
                        className="p-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 transition-colors disabled:opacity-60" title={t("Carteira")}>
                        {walletLoadingId === m.id ? <Loader2 size={14} className="animate-spin text-accent" /> : <CreditCard size={14} className="text-accent" />}
                      </button>
                      {canWrite && DISCIPLINE_STATUSES.has(m.status) && (
                        <button type="button" onClick={e => { e.stopPropagation(); void openDisciplinePeriodAction(m); }} disabled={mutatingMemberIds.has(m.id)}
                          className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 transition-colors disabled:opacity-60" title={t("Período disciplinar")}>
                          {mutatingMemberIds.has(m.id) ? <Loader2 size={14} className="animate-spin text-amber-600" /> : <CalendarClock size={14} className="text-amber-600" />}
                        </button>
                      )}
                      {canPermanentlyDeleteMember && (
                        <button type="button" onClick={e => { e.stopPropagation(); removeMember(m); }}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors" title={t("Excluir definitivamente")}>
                          <Trash2 size={14} className="text-muted-foreground" />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
              {visibleMembers.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  {t("Nenhum membro encontrado.")}
                </div>
              )}
            </div>

            {showPagination && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-1 pt-1">
                <p className="text-xs text-muted-foreground">
                  {rangeLabel}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={visiblePage === 1}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-secondary text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-secondary/80 transition-colors"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft size={14} /> Anterior
                  </button>
                  <span className="text-xs text-muted-foreground min-w-20 text-center">
                    {isSearchActive ? `Página ${visiblePage}` : `Página ${visiblePage} de ${totalPages}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => (isSearchActive ? (hasNextPage ? page + 1 : page) : Math.min(totalPages, page + 1)))}
                    disabled={isSearchActive ? !hasNextPage : visiblePage === totalPages}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-secondary text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-secondary/80 transition-colors"
                    aria-label="Próxima página"
                  >
                    Próxima <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Member Form Modal ──────────────────────────────────────────────────── */}

      <AnimatePresence>
        {modalOpen && (
          <Dialog open={modalOpen} onOpenChange={open => { if (!open) closeModal(); }}>
            <DialogContent className="w-[calc(100vw-1rem)] max-w-5xl p-0 gap-0 overflow-hidden max-h-[calc(100dvh-1rem)] sm:max-h-[90vh] flex flex-col">

            {/* Modal header */}
            <div className="flex items-center justify-between px-4 py-3 sm:px-5 sm:py-4 border-b border-border/50 flex-shrink-0 pr-12">
              <div>
                <h2 className="font-serif text-lg">{isNewMember ? "Cadastrar Membro" : "Editar Membro"}</h2>
                {!isNewMember && form.full_name && (
                  <p className="text-xs text-muted-foreground">{form.full_name}</p>
                )}
              </div>
            </div>

              {/* Tabs nav */}
              <div className="grid grid-cols-4 md:grid-cols-8 border-b border-border/50 flex-shrink-0 bg-background">
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
                      className={`min-w-0 flex items-center justify-center gap-1 px-1.5 py-2.5 sm:px-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                        activeTab === tab.id
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon size={13} className="flex-shrink-0" />
                      <span className="hidden xl:inline truncate">{tab.label}</span>
                      <span className="xl:hidden truncate">{tab.short}</span>
                    </button>
                  );
                })}
              </div>

              {/* Tab content */}
              <div className="min-w-0 overflow-y-auto flex-1 px-4 py-4 sm:px-5 sm:py-5">
                {editLoading ? (
                  // Ficha completa ainda sendo buscada (openEdit) — o modal já
                  // abriu instantaneamente ao clique; só o conteúdo aguarda.
                  <div className="flex items-center justify-center py-16">
                    <Loader2 size={24} className="animate-spin text-muted-foreground" />
                  </div>
                ) : (
                <>
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
                      <FormInput label="Nome conhecido" value={form.known_name || ""} onChange={v => setField("known_name", v)} placeholder="Como a pessoa é chamada no dia a dia" />
                      <FormInput
                        label="Código interno da igreja"
                        value={form.member_code || ""}
                        onChange={v => setField("member_code", v)}
                        placeholder={t("Opcional — identificador usado pela própria igreja")}
                      />
                      <FormInput label="Data de nascimento" value={form.birth_date || ""} onChange={v => setField("birth_date", v)} type="date" />
                      <FormSelect label="Sexo" value={form.gender || ""} onChange={v => setField("gender", v)} options={GENDER_OPTIONS} />
                      <FormSelect label="Estado civil" value={form.marital_status || ""} onChange={v => setField("marital_status", v)} options={MARITAL_STATUS_OPTIONS} />
                      <FormInput label="CPF" value={form.cpf || ""} onChange={v => setField("cpf", v)} required placeholder="000.000.000-00" />
                      <FormInput label="RG" value={form.rg || ""} onChange={v => setField("rg", v)} placeholder="Número do RG" />
                      <FormInput label="Naturalidade" value={form.birth_place || ""} onChange={v => setField("birth_place", v)} placeholder="Cidade / estado de nascimento" />
                      <FormInput label="Nacionalidade" value={form.nationality || ""} onChange={v => setField("nationality", v)} placeholder="Ex.: Brasileiro(a)" />
                      <FormSelect label="Escolaridade" value={form.education_level || ""} onChange={v => setField("education_level", v)} options={EDUCATION_LEVELS} />
                      <FormInput label="Profissão" value={form.profession || ""} onChange={v => setField("profession", v)} placeholder="Profissão" />
                    </div>

                    {(form.incomplete_registration || form.cpf_pending || form.contact_pending || form.requires_review) && (
                      <p className="border-t border-border/50 pt-4 text-xs text-amber-600 dark:text-amber-400">
                        ⚠️ Este cadastro possui pendências de validação. Essas marcações não podem ser alteradas manualmente.
                      </p>
                    )}
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
                    <FormInput label="WhatsApp" value={form.whatsapp || ""} onChange={v => setField("whatsapp", v)} required placeholder="(00) 00000-0000" type="tel" />
                    <div className="sm:col-span-2">
                      <FormInput label="E-mail" value={form.email || ""} onChange={v => setField("email", v)} required placeholder="email@exemplo.com" type="email" />
                    </div>
                  </div>
                )}

                {/* ── Tab 4: Endereço ── */}
                {activeTab === "endereco" && (() => {
                  const allAddressRows: Array<{ kind: "saved"; entry: AddressEntry } | { kind: "pending"; index: number; entry: AddressDraft }> = [
                    ...addressEntries.map(entry => ({ kind: "saved" as const, entry })),
                    ...pendingAddressEntries.map((entry, index) => ({ kind: "pending" as const, index, entry })),
                  ];
                  return (
                    <div className="space-y-5">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Endereço principal (residencial)</p>
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
                      </div>

                      {/* Endereços adicionais (member_addresses) — comercial,
                          correspondência, anterior. O residencial acima continua
                          sendo a fonte principal, por compatibilidade com dados
                          já existentes. */}
                      <div className="border-t border-border/50 pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Outros endereços {loadingAddresses && <Loader2 size={11} className="inline animate-spin ml-1" />}
                          </p>
                          {!addressDraft && (
                            <button type="button" onClick={() => setAddressDraft({ ...EMPTY_ADDRESS_DRAFT })}
                              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                              <Plus size={12} /> Adicionar endereço
                            </button>
                          )}
                        </div>

                        {allAddressRows.length === 0 && !addressDraft && (
                          <p className="text-sm text-muted-foreground">Nenhum endereço adicional cadastrado.</p>
                        )}

                        <div className="space-y-2">
                          {allAddressRows.map(row => (
                            <div key={row.kind === "saved" ? row.entry.id : `pending-addr-${row.index}`}
                              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {[row.entry.street, row.entry.number].filter(Boolean).join(", ") || "(sem logradouro)"}
                                  {row.kind === "pending" && <span className="ml-1.5 text-[10px] text-amber-600 dark:text-amber-400">(não salvo)</span>}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {ADDRESS_TYPE_LABELS[row.entry.address_type] || row.entry.address_type}
                                  {[row.entry.city, row.entry.state].filter(Boolean).length > 0 && ` · ${[row.entry.city, row.entry.state].filter(Boolean).join("/")}`}
                                  {row.kind === "saved" && row.entry.is_primary && " · principal"}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {row.kind === "saved" ? (
                                  <>
                                    <button type="button" onClick={() => setAddressDraft({
                                      id: row.entry.id,
                                      address_type: row.entry.address_type,
                                      zip_code: row.entry.zip_code ?? "",
                                      street: row.entry.street ?? "",
                                      number: row.entry.number ?? "",
                                      complement: row.entry.complement ?? "",
                                      neighborhood: row.entry.neighborhood ?? "",
                                      city: row.entry.city ?? "",
                                      state: row.entry.state ?? "",
                                      country: row.entry.country ?? "Brasil",
                                      is_primary: row.entry.is_primary,
                                      notes: row.entry.notes ?? "",
                                    })}
                                      className="p-1.5 rounded hover:bg-secondary" title={t("Editar")}>
                                      <Pencil size={13} className="text-muted-foreground" />
                                    </button>
                                    <button type="button" onClick={() => removeAddressEntry(row.entry)}
                                      className="p-1.5 rounded hover:bg-destructive/10" title={t("Remover")}>
                                      <Trash2 size={13} className="text-muted-foreground" />
                                    </button>
                                  </>
                                ) : (
                                  <button type="button" onClick={() => removePendingAddressEntry(row.index)}
                                    className="p-1.5 rounded hover:bg-destructive/10" title={t("Remover")}>
                                    <Trash2 size={13} className="text-muted-foreground" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {addressDraft && (
                          <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-muted-foreground">
                                  Tipo de endereço<span className="text-destructive ml-0.5">*</span>
                                </label>
                                <select
                                  value={addressDraft.address_type}
                                  onChange={e => setAddressDraft(prev => prev && { ...prev, address_type: e.target.value })}
                                  className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                >
                                  {ADDRESS_TYPES.map(a => (
                                    <option key={a} value={a}>{ADDRESS_TYPE_LABELS[a] ?? a}</option>
                                  ))}
                                </select>
                              </div>
                              <FormInput label="CEP" value={addressDraft.zip_code} onChange={v => setAddressDraft(prev => prev && { ...prev, zip_code: v })} placeholder="00000-000" />
                              <div className="sm:col-span-2">
                                <FormInput label="Rua / Logradouro" value={addressDraft.street} onChange={v => setAddressDraft(prev => prev && { ...prev, street: v })} placeholder="Nome da rua" />
                              </div>
                              <FormInput label="Número" value={addressDraft.number} onChange={v => setAddressDraft(prev => prev && { ...prev, number: v })} placeholder="Nº" />
                              <FormInput label="Complemento" value={addressDraft.complement} onChange={v => setAddressDraft(prev => prev && { ...prev, complement: v })} placeholder="Apto, casa, bloco..." />
                              <FormInput label="Bairro" value={addressDraft.neighborhood} onChange={v => setAddressDraft(prev => prev && { ...prev, neighborhood: v })} placeholder="Bairro" />
                              <FormInput label="Cidade" value={addressDraft.city} onChange={v => setAddressDraft(prev => prev && { ...prev, city: v })} placeholder="Cidade" />
                              <FormInput label="Estado (UF)" value={addressDraft.state} onChange={v => setAddressDraft(prev => prev && { ...prev, state: v })} placeholder="RS" />
                              <FormInput label="País" value={addressDraft.country} onChange={v => setAddressDraft(prev => prev && { ...prev, country: v })} placeholder="Brasil" />
                              <div className="flex items-center gap-2 pt-5">
                                <input
                                  type="checkbox"
                                  id="address-is-primary"
                                  checked={addressDraft.is_primary}
                                  onChange={e => setAddressDraft(prev => prev && { ...prev, is_primary: e.target.checked })}
                                  className="rounded border-input"
                                />
                                <label htmlFor="address-is-primary" className="text-xs text-muted-foreground">Marcar como principal (ativo)</label>
                              </div>
                            </div>
                            <div className="flex justify-end gap-2">
                              <button type="button" onClick={() => setAddressDraft(null)}
                                className="px-3 py-1.5 text-xs rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
                                Cancelar
                              </button>
                              <button type="button" onClick={saveAddressDraft} disabled={savingAddress}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50">
                                {savingAddress && <Loader2 size={12} className="animate-spin" />} Salvar endereço
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* ── Tab 5: Dados Eclesiásticos ── */}
                {activeTab === "eclesiastico" && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormInput label="Batismo nas águas" value={form.baptized_at || ""} onChange={v => setField("baptized_at", v)} type="date" />
                      <FormInput label="Local do batismo" value={form.baptism_place || ""} onChange={v => setField("baptism_place", v)} placeholder="Ex.: Templo sede" />
                      <FormInput label="Batismo com o Espírito Santo" value={form.holy_spirit_baptism_date || ""} onChange={v => setField("holy_spirit_baptism_date", v)} type="date" />
                      <FormInput label="Data de admissão" value={form.joined_at || ""} onChange={v => setField("joined_at", v)} type="date" />
                      <FormSelect label="Forma de admissão" value={form.admission_type || ""} onChange={v => setField("admission_type", v)} options={ADMISSION_TYPES} />
                      <FormInput label="Data de consagração" value={form.consecration_date || ""} onChange={v => setField("consecration_date", v)} type="date" />
                      <FormSelect label="Situação do membro" value={form.status} onChange={v => setField("status", v as MemberStatus)} options={MEMBER_STATUSES} required />
                      <FormInput label="Número CGADB" value={form.cgadb_number || ""} onChange={v => setField("cgadb_number", v)} placeholder="Número de cadastro na CGADB" />
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
                {activeTab === "familia" && (() => {
                  const allFamilyRows: Array<{ kind: "saved"; entry: FamilyEntry } | { kind: "pending"; index: number; entry: FamilyDraft }> = [
                    ...familyEntries.map(entry => ({ kind: "saved" as const, entry })),
                    ...pendingFamilyEntries.map((entry, index) => ({ kind: "pending" as const, index, entry })),
                  ];
                  return (
                    <div className="space-y-5">
                      {/* Campos legados — preservados para compatibilidade com dados
                          já existentes e outros módulos que ainda os leem. */}
                      <div className="grid grid-cols-1 gap-4">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Campos rápidos (compatibilidade)</p>
                        <FormInput label="Nome do pai" value={form.father_name || ""} onChange={v => setField("father_name", v)} placeholder="Nome completo do pai" />
                        <FormInput label="Nome da mãe" value={form.mother_name || ""} onChange={v => setField("mother_name", v)} placeholder="Nome completo da mãe" />
                        <FormInput label="Cônjuge" value={form.spouse_name || ""} onChange={v => setField("spouse_name", v)} placeholder="Nome do cônjuge" />
                      </div>

                      {/* Família e dependentes estruturados */}
                      <div className="border-t border-border/50 pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Família e dependentes {loadingFamily && <Loader2 size={11} className="inline animate-spin ml-1" />}
                          </p>
                          {!familyDraft && (
                            <button type="button" onClick={() => setFamilyDraft({ ...EMPTY_FAMILY_DRAFT })}
                              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                              <Plus size={12} /> Adicionar familiar
                            </button>
                          )}
                        </div>

                        {isNewMember && pendingFamilyEntries.length > 0 && (
                          <p className="text-[11px] text-muted-foreground">
                            Estes familiares serão salvos quando o membro for cadastrado.
                          </p>
                        )}

                        {allFamilyRows.length === 0 && !familyDraft && (
                          <p className="text-sm text-muted-foreground">Nenhum familiar ou dependente cadastrado.</p>
                        )}

                        <div className="space-y-2">
                          {allFamilyRows.map(row => (
                            <div key={row.kind === "saved" ? row.entry.id : `pending-${row.index}`}
                              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {row.entry.full_name}
                                  {row.kind === "pending" && <span className="ml-1.5 text-[10px] text-amber-600 dark:text-amber-400">(não salvo)</span>}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {FAMILY_RELATION_LABELS[row.entry.relation] || row.entry.relation}
                                  {row.entry.related_member_id && " · vinculado a membro existente"}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {row.kind === "saved" ? (
                                  <>
                                    <button type="button" onClick={() => setFamilyDraft({
                                      id: row.entry.id,
                                      relation: row.entry.relation,
                                      full_name: row.entry.full_name,
                                      related_member_id: row.entry.related_member_id,
                                      birth_date: row.entry.birth_date ?? "",
                                      gender: row.entry.gender ?? "",
                                      cpf: row.entry.cpf ?? "",
                                      phone: row.entry.phone ?? "",
                                      notes: row.entry.notes ?? "",
                                    })}
                                      className="p-1.5 rounded hover:bg-secondary" title={t("Editar")}>
                                      <Pencil size={13} className="text-muted-foreground" />
                                    </button>
                                    <button type="button" onClick={() => removeFamilyEntry(row.entry)}
                                      className="p-1.5 rounded hover:bg-destructive/10" title={t("Remover")}>
                                      <Trash2 size={13} className="text-muted-foreground" />
                                    </button>
                                  </>
                                ) : (
                                  <button type="button" onClick={() => removePendingFamilyEntry(row.index)}
                                    className="p-1.5 rounded hover:bg-destructive/10" title={t("Remover")}>
                                    <Trash2 size={13} className="text-muted-foreground" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Draft form (adicionar novo familiar) */}
                        {familyDraft && (
                          <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-muted-foreground">
                                  Tipo de relação<span className="text-destructive ml-0.5">*</span>
                                </label>
                                <select
                                  value={familyDraft.relation}
                                  onChange={e => setFamilyDraft(prev => prev && { ...prev, relation: e.target.value as FamilyRelation })}
                                  className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                >
                                  <option value="">— Selecionar —</option>
                                  {FAMILY_RELATIONS.map(r => (
                                    <option key={r} value={r}>{FAMILY_RELATION_LABELS[r] ?? r}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-muted-foreground">Vincular a membro existente (opcional)</label>
                                <select
                                  value={familyDraft.related_member_id || ""}
                                  onChange={e => {
                                    const relatedId = e.target.value || null;
                                    const related = familyLinkOptions.find(m => m.id === relatedId);
                                    setFamilyDraft(prev => prev && {
                                      ...prev,
                                      related_member_id: relatedId,
                                      full_name: related ? related.full_name : prev.full_name,
                                    });
                                  }}
                                  className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                >
                                  <option value="">— Não é membro —</option>
                                  {familyLinkOptions.filter(m => m.id !== editingId).map(m => (
                                    <option key={m.id} value={m.id}>{m.full_name}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="sm:col-span-2">
                                <FormInput
                                  label="Nome completo do familiar"
                                  value={familyDraft.full_name}
                                  onChange={v => setFamilyDraft(prev => prev && { ...prev, full_name: v })}
                                  required
                                  disabled={!!familyDraft.related_member_id}
                                  placeholder="Nome completo"
                                />
                              </div>
                              <FormInput label="Data de nascimento" value={familyDraft.birth_date} onChange={v => setFamilyDraft(prev => prev && { ...prev, birth_date: v })} type="date" />
                              <FormSelect label="Sexo" value={familyDraft.gender} onChange={v => setFamilyDraft(prev => prev && { ...prev, gender: v })} options={GENDER_OPTIONS} />
                              <FormInput label="CPF (opcional)" value={familyDraft.cpf} onChange={v => setFamilyDraft(prev => prev && { ...prev, cpf: v })} placeholder="Opcional para crianças/dependentes" />
                              <FormInput label="Telefone" value={familyDraft.phone} onChange={v => setFamilyDraft(prev => prev && { ...prev, phone: v })} placeholder="Pode ser o telefone do responsável" />
                              <div className="sm:col-span-2">
                                <FormInput label="Observações" value={familyDraft.notes} onChange={v => setFamilyDraft(prev => prev && { ...prev, notes: v })} placeholder="Observações (opcional)" />
                              </div>
                            </div>
                            <div className="flex justify-end gap-2">
                              <button type="button" onClick={() => setFamilyDraft(null)}
                                className="px-3 py-1.5 text-xs rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
                                Cancelar
                              </button>
                              <button type="button" onClick={saveFamilyDraft} disabled={savingFamily}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50">
                                {savingFamily && <Loader2 size={12} className="animate-spin" />} Salvar familiar
                              </button>
                            </div>
                          </div>
                        )}

                        <p className="text-[11px] text-muted-foreground">
                          Dependentes e crianças cadastrados aqui não aparecem na lista principal de membros e não contam como membros ativos.
                        </p>
                      </div>
                    </div>
                  );
                })()}

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
                </>
                )}
              </div>

              {/* Modal footer */}
              <div className="flex flex-col gap-3 px-4 py-3 border-t border-border/50 bg-background flex-shrink-0 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
                {/* Tab navigation arrows */}
                <div className="flex w-full items-center justify-between gap-1 sm:w-auto sm:justify-start">
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

                <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                  {!isNewMember && (
                    <>
                      {canAccess("/admin/gerenciar-acessos") && (
                        <button
                          type="button"
                          onClick={() => {
                            const member = editingMemberFull;
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
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
                        >
                          <Shield size={14} /> Gerenciar acessos
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { if (editingMemberFull) { closeModal(); setWalletMember(editingMemberFull); } }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
                      >
                        <CreditCard size={14} /> Carteira
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!editingId) return;
                          const contactCheck = checkRequiredMemberContacts(form);
                          // Comparação explícita — ver comentário em validateCurrentTabBeforeLeaving.
                          if (contactCheck.ok === false) {
                            toast.error(t(MEMBER_CONTACT_CHECK_MESSAGES[contactCheck.reason]));
                            setActiveTab("contato");
                            return;
                          }
                          setInviteModal({
                            open:       true,
                            memberId:   editingId,
                            memberName: form.full_name,
                            whatsapp:   form.whatsapp?.trim() || null,
                            email:      form.email?.trim() || null,
                          });
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
                      >
                        <Send size={13} /> Convite
                      </button>
                    </>
                  )}
                  <button type="button" onClick={closeModal}
                    className="px-4 py-2 text-sm rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
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
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
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
          <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto">
            <MemberWalletCard
              member={toWalletMember(walletMember)}
              churchName={church?.name ?? "Igreja"}
              churchAcronym={church?.acronym}
              churchCity={church?.city ?? undefined}
              churchState={church?.state ?? undefined}
              churchLogoUrl={church?.logo_url ?? null}
              onClose={() => setWalletMember(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Período disciplinar (Fase 1C-H3) */}
      {disciplineDialog && (
        <DisciplinePeriodDialog
          open={!!disciplineDialog}
          mode={disciplineDialog.mode}
          memberName={disciplineDialog.member.full_name}
          targetStatusLabel={t(disciplineDialog.targetStatus)}
          currentPeriod={disciplineDialog.currentPeriod}
          submitting={disciplineSubmitting}
          onCancel={handleDisciplineDialogCancel}
          onConfirm={payload => void handleDisciplineDialogConfirm(payload)}
        />
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
          whatsapp={inviteModal.whatsapp}
          email={inviteModal.email}
        />
      )}
    </AdminLayout>
  );
}
