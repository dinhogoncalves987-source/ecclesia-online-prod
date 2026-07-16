import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useChurch } from "@/hooks/useChurchContext";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getPublicAppUrl } from "@/lib/publicUrl";
import { normalizeOrganizationType } from "@/lib/organizationHierarchy";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  BookOpen,
  Building2,
  Calendar,
  ChevronDown,
  Church as ChurchIcon,
  Edit,
  Layers,
  Loader2,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  Settings,
  Shield,
  Trash2,
  UserCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ChildOrganizationType = "matriz" | "setor" | "congregacao" | string;
type UnitStatus = "Ativa" | "Em implantação" | "Inativa" | "Arquivada";

const UNIT_STATUS_OPTIONS: UnitStatus[] = ["Ativa", "Em implantação", "Inativa", "Arquivada"];

const HIERARCHY_MODEL_OPTIONS = [
  { value: "convention_matriz_intermediate_local", label: "Convenção → Matriz → Setor → Congregação" },
  { value: "matriz_intermediate_local",           label: "Matriz → Setor → Congregação" },
  { value: "single_church",                       label: "Igreja independente (sem filhos)" },
  { value: "church_with_campuses",                label: "Igreja com Campuses" },
  { value: "custom",                              label: "Personalizado" },
];

const INTERMEDIATE_PRESETS = ["Setor", "Distrito", "Região", "Área", "Campo", "Zona", "Personalizado", "Nenhum"];
const LOCAL_PRESETS        = ["Congregação", "Igreja local", "Filial", "Campus", "Comunidade", "Templo", "Personalizado", "Nenhum"];

interface ChildOrganization {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  organization_type: ChildOrganizationType;
  parent_id: string | null;
  unit_status: string | null;
  zip_code: string | null;
  street: string | null;
  address_number: string | null;
  address_complement: string | null;
  neighborhood: string | null;
  website_url: string | null;
  country_code: string | null;
}

interface OrgForm {
  name: string;
  city: string;
  state: string;
  country_code: string;
  zip_code: string;
  street: string;
  address_number: string;
  address_complement: string;
  neighborhood: string;
  phone: string;
  email: string;
  website_url: string;
  unit_status: UnitStatus;
}

const EMPTY_ORG_FORM: OrgForm = {
  name: "", city: "", state: "", country_code: "BR",
  zip_code: "", street: "", address_number: "", address_complement: "", neighborhood: "",
  phone: "", email: "", website_url: "", unit_status: "Ativa",
};

interface NomenclatureForm {
  denomination_type: string;
  hierarchy_model: string;
  top_level_label: string;
  top_level_label_plural: string;
  municipal_level_label: string;
  municipal_level_label_plural: string;
  intermediate_level_label: string;
  intermediate_level_label_plural: string;
  local_unit_label: string;
  local_unit_label_plural: string;
  uses_convention_level: boolean;
  uses_municipal_level: boolean;
  uses_intermediate_level: boolean;
  uses_local_units: boolean;
}

type ResponsibleStatus = "active" | "pending";
type ResponsibleRole = "pastor" | "secretary" | "tesoureiro";

type ResponsibleUser = {
  name?: string | null;
  email?: string | null;
  role: ResponsibleRole;
  status: ResponsibleStatus;
  inviteId?: string;
  userId?: string;
};

type ResponsibleMap = {
  [organizationId: string]: {
    pastor?: ResponsibleUser;
    secretary?: ResponsibleUser;
    tesoureiro?: ResponsibleUser;
  };
};

function responsibilityToSlotRole(responsibility: string): ResponsibleRole | null {
  if (responsibility === "responsible_pastor" || responsibility === "church_admin") return "pastor";
  if (responsibility === "secretary") return "secretary";
  if (responsibility === "treasurer") return "tesoureiro";
  return null;
}

function displayName(r: ResponsibleUser): string {
  return r.name?.trim() || r.email?.trim() || "—";
}

/** Card de responsável: ativo, convite pendente ou ação + Definir */
function ResponsibleRoleCard({
  label,
  roleKey,
  responsible,
  Icon,
  onDefine,
  onManageAccess,
  renderProbeCards = false,
}: {
  label: string;
  roleKey: ResponsibleRole;
  responsible?: ResponsibleUser;
  Icon: React.ElementType;
  onDefine: (e: React.MouseEvent) => void;
  onManageAccess: (e: React.MouseEvent) => void;
  renderProbeCards?: boolean;
}) {
  return (
    <div className={`rounded-lg border border-border/50 px-3 py-2.5 ${
      renderProbeCards ? "bg-background" : "bg-background/60"
    }`}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
        <Icon size={10} /> {label}
      </p>
      {responsible?.status === "active" ? (
        <>
          <p className="text-xs font-semibold truncate">{displayName(responsible)}</p>
          {responsible.email && responsible.name && (
            <p className="text-[10px] text-muted-foreground truncate">{responsible.email}</p>
          )}
        </>
      ) : responsible?.status === "pending" ? (
        <>
          <span className="inline-flex text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-semibold">
            Convite pendente
          </span>
          <p className="text-xs font-semibold truncate mt-1">{displayName(responsible)}</p>
          {responsible.email && (
            <p className="text-[10px] text-muted-foreground truncate">{responsible.email}</p>
          )}
          <button type="button" onClick={onManageAccess}
            className="text-[10px] text-accent hover:underline mt-1">
            Gerenciar Acessos
          </button>
        </>
      ) : (
        <button type="button" onClick={onDefine}
          className="text-[11px] text-accent hover:underline italic">
          + Definir {label.toLowerCase()}
        </button>
      )}
    </div>
  );
}

// ── UI Helpers ────────────────────────────────────────────────────────────────

function statusBadge(status: string | null) {
  const s = status ?? "Ativa";
  const map: Record<string, string> = {
    "Ativa":          "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    "Em implantação": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    "Inativa":        "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    "Arquivada":      "bg-secondary text-muted-foreground",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${map[s] ?? map["Ativa"]}`}>
      {s}
    </span>
  );
}

/** Atalho operacional. disabled com disabledReason mostra tooltip explicativo. */
function ShortcutBtn({
  icon: Icon, label, onClick, disabled, disabledReason,
}: {
  icon: React.ElementType;
  label: string;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={disabledReason ?? label}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
        disabled
          ? "border-border/30 text-muted-foreground/40 cursor-not-allowed"
          : "border-border hover:border-accent/50 hover:bg-accent/5 text-foreground hover:text-accent cursor-pointer"
      }`}
    >
      <Icon size={13} className="flex-shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

// Portuguese preposition helper
function connPrep(label: string): string {
  const l = label.toLowerCase().trim();
  if (["região", "área", "convenção"].includes(l) || l.startsWith("á") || l.startsWith("à")) return "à";
  return "ao";
}

// "Novo"/"Nova" — gênero gramatical do label configurável (ex.: "Distrito" é
// masculino, "Congregação"/"Matriz Municipal" são femininos). Heurística
// simples cobrindo os presets já oferecidos em INTERMEDIATE_PRESETS/LOCAL_PRESETS.
const MASCULINE_UNIT_WORDS = ["distrito", "setor", "campo", "campus", "território", "grupo", "ministério", "polo"];
function newUnitArticle(label: string): "Novo" | "Nova" {
  const firstWord = label.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (MASCULINE_UNIT_WORDS.includes(firstWord)) return "Novo";
  return "Nova";
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════════════════

export default function Congregacoes() {
  const { user }                                     = useAuth();
  const { isAdmin, hasCapability, loading: roleLoading } = useRole();
  const { church, isMatriz, refetch: refetchChurch } = useChurch();
  const { t }                            = useLanguage();
  const navigate                         = useNavigate();
  const location                         = useLocation();

  // TEMP render probe (Android/Redmi): remove after the controlled A/B test.
  const renderProbe = new URLSearchParams(location.search).get("renderProbe");
  const isCardsRenderProbe = location.pathname === "/admin/congregacoes"
    && (renderProbe === "cards" || renderProbe === "all");

  // ── Context state ──────────────────────────────────────────────────────────
  const [activeOrgType, setActiveOrgType]                 = useState<string | null>(null);
  const [activeOrgTypeResolved, setActiveOrgTypeResolved] = useState(false);

  // ── Data state ─────────────────────────────────────────────────────────────
  const [childOrganizations, setChildOrganizations] = useState<ChildOrganization[]>([]);
  const [sectorSubsedes, setSectorSubsedes]         = useState<ChildOrganization[]>([]); // only for setor context
  const [loading, setLoading]                       = useState(true);
  const [sectorCongregations, setSectorCongregations]   = useState<Record<string, ChildOrganization[]>>({});
  const [loadingCongregations, setLoadingCongregations] = useState<Record<string, boolean>>({});
  const [congregationCounts, setCongregationCounts]     = useState<Record<string, number>>({});
  const [responsiblesByOrg, setResponsiblesByOrg]       = useState<ResponsibleMap>({});

  // ── UI state ───────────────────────────────────────────────────────────────
  const [showForm, setShowForm]     = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm]             = useState<OrgForm>(EMPTY_ORG_FORM);
  // For setor context: which child type is being created (subsede vs congregacao)
  const [insertChildType, setInsertChildType] = useState<OrgType | null>(null);

  // ── Congregation modal ─────────────────────────────────────────────────────
  const [congModal, setCongModal] = useState<{ sectorId: string; sectorName: string } | null>(null);
  const [congForm, setCongForm]   = useState<OrgForm>(EMPTY_ORG_FORM);
  const [savingCong, setSavingCong] = useState(false);

  // ── Fraternas (agrupamentos laterais — visíveis em níveis estadual/nacional) ──
  type Fraterna = { id: string; name: string; affiliation_type: string; description: string | null; is_active: boolean };
  const [fraternas, setFraternas] = useState<Fraterna[]>([]);
  const [loadingFraternas, setLoadingFraternas] = useState(false);
  const [showFraterna, setShowFraterna] = useState(false);
  const [fraterna, setFraterna] = useState({ name: "", description: "", affiliation_type: "fraterna" });
  const [savingFraterna, setSavingFraterna] = useState(false);

  // ── Nomenclature config ────────────────────────────────────────────────────
  const [showNomenclatureForm, setShowNomenclatureForm] = useState(false);
  const [nomenclatureForm, setNomenclatureForm]         = useState<NomenclatureForm>({
    denomination_type: "", hierarchy_model: "",
    top_level_label: "", top_level_label_plural: "",
    municipal_level_label: "", municipal_level_label_plural: "",
    intermediate_level_label: "", intermediate_level_label_plural: "",
    local_unit_label: "", local_unit_label_plural: "",
    uses_convention_level: false, uses_municipal_level: true,
    uses_intermediate_level: true, uses_local_units: true,
  });
  const [savingNomenclature, setSavingNomenclature] = useState(false);

  // ── Computed flags ─────────────────────────────────────────────────────────
  // Normalizado (não comparação de string crua) — reconhece aliases legados
  // (ex.: "district", "church") e evita que uma matriz/setor real caia no
  // fallback genérico só por causa de um valor de organization_type diferente
  // do canônico. Ver organizationHierarchy.ts.
  const normalizedActiveOrgType = normalizeOrganizationType(activeOrgType);
  const isSetorContext          = normalizedActiveOrgType === "setor";
  const isSubsedeContext        = normalizedActiveOrgType === "subsede";
  const isConvencaoContext      = normalizedActiveOrgType === "state_convention";
  const isNationalContext       = normalizedActiveOrgType === "national_convention";
  const isInternationalContext  = normalizedActiveOrgType === "international_convention";
  const isCongregacaoContext    = normalizedActiveOrgType === "congregacao";
  const isAnyConventionContext  = isInternationalContext || isNationalContext || isConvencaoContext;
  const usesIntermediate   = isMatriz ? church?.uses_intermediate_level !== false : false;
  const usesLocalUnits     = church?.uses_local_units !== false;
  const isSingleChurchMode = (isMatriz
    && !isConvencaoContext
    && church?.uses_intermediate_level === false
    && church?.uses_local_units === false)
    || church?.hierarchy_model === "single_church";

  const canManageOrganizations = hasCapability("organization.manage");
  const canManageChildUnits = canManageOrganizations
    && (isMatriz || isSetorContext || isSubsedeContext || isConvencaoContext || isNationalContext || isInternationalContext)
    && (isMatriz || activeOrgTypeResolved)
    && !isSingleChurchMode
    && (isInternationalContext || isNationalContext
      ? true
      : isConvencaoContext
        ? church?.uses_municipal_level !== false
        : isSetorContext || isSubsedeContext
          ? usesLocalUnits
          // Matriz: pode criar Distrito/Setor (usesIntermediate) OU Congregação
          // direto (modo "pular nível"). O botão só deve ficar oculto quando
          // NENHUM dos dois modos está habilitado.
          : usesIntermediate || usesLocalUnits);

  // ── Label helpers — ZERO hardcode de denominação ───────────────────────────
  // Defaults seguem a nomenclatura padrão da Assembleia de Deus
  // (matriz → distrito/setor → congregação); cada organização pode
  // sobrescrever via "Estrutura" sem afetar este fallback.
  const topSingular         = church?.top_level_label              ?? "Convenção";
  const topPlural           = church?.top_level_label_plural       ?? "Convenções";
  const municipalSingular   = church?.municipal_level_label        ?? "Matriz Municipal";
  const municipalPlural     = church?.municipal_level_label_plural ?? "Matrizes Municipais";
  const intermediateSingular = church?.intermediate_level_label    ?? "Distrito";
  const intermediatePlural   = church?.intermediate_level_label_plural ?? "Distritos";
  const localSingular       = church?.local_unit_label             ?? "Congregação";
  const localPlural         = church?.local_unit_label_plural      ?? "Congregações";

  // Labels para nível nacional
  const nationalSingular = "Convenção Estadual";
  const nationalPlural   = "Convenções Estaduais";
  // Labels para nível internacional
  const intlSingular     = church?.hierarchy_model === "international_flexible"
    ? "Campo / Sede"
    : (church?.top_level_label ?? "Convenção Nacional");
  const intlPlural       = church?.hierarchy_model === "international_flexible"
    ? "Campos / Sedes"
    : (church?.top_level_label_plural ?? "Convenções Nacionais");

  const childSingular = isInternationalContext
    ? intlSingular
    : isNationalContext
      ? nationalSingular
      : isConvencaoContext
        ? municipalSingular
        : isSubsedeContext
          ? localSingular
          : isMatriz && usesIntermediate
            ? intermediateSingular
            : localSingular;

  const childPlural = isInternationalContext
    ? intlPlural
    : isNationalContext
      ? nationalPlural
      : isConvencaoContext
        ? municipalPlural
        : isSubsedeContext
          ? localPlural
          : isMatriz && usesIntermediate
            ? intermediatePlural
            : localPlural;

  // "Será vinculada ao/à [intermediate]"
  const parentConnPrep = connPrep(intermediateSingular);
  const parentConnText = `Será vinculada ${parentConnPrep} ${intermediateSingular.toLowerCase()}`;

  // Page text helpers
  const pageTitle    = () => {
    if (isInternationalContext) return "Estrutura Internacional";
    if (isNationalContext) return "Estrutura Nacional";
    if (isSingleChurchMode) return municipalSingular;
    if (isSubsedeContext) return localPlural;
    return childPlural;
  };
  const pageSubtitle = (): string => {
    if (isInternationalContext) return "Gerencie países, campos, sedes, convenções e igrejas vinculadas a esta organização internacional.";
    if (isNationalContext) return "Gerencie as convenções estaduais, matrizes, campos e igrejas vinculadas à estrutura nacional.";
    if (isSingleChurchMode) {
      return `Esta ${municipalSingular.toLowerCase()} opera de forma independente, sem unidades filhas. Gerencie dados, responsáveis e operações da própria unidade.`;
    }
    if (isConvencaoContext) return `Gerencie ${childPlural.toLowerCase()} vinculadas a esta ${topSingular.toLowerCase()}.`;
    if (isMatriz) {
      return usesIntermediate
        ? `Gerencie os ${childPlural.toLowerCase()} desta ${municipalSingular.toLowerCase()}.`
        : `Gerencie ${childPlural.toLowerCase()} desta ${municipalSingular.toLowerCase()}. Responsáveis são atribuídos separadamente.`;
    }
    if (isSetorContext) return `Gerencie subsedes e ${localPlural.toLowerCase()} deste ${intermediateSingular.toLowerCase()}.`;
    if (isSubsedeContext) {
      return `${localPlural} vinculadas à subsede ${church?.name ?? ""}. Gerencie as congregações desta subsede.`;
    }
    if (isCongregacaoContext) {
      return t("Esta é uma unidade local operacional. Gerencie membros, agenda e demais módulos abaixo — esta unidade não cria novas unidades filhas.");
    }
    return t("Esta unidade não cria novas unidades filhas. Membros e histórico permanecem na unidade quando responsáveis mudam.");
  };
  const emptyListMessage   = () => `Nenhum(a) ${childSingular.toLowerCase()} cadastrado(a).`;
  const newUnitButtonLabel = () => isSubsedeContext ? "Nova Congregação" : `${newUnitArticle(childSingular)} ${childSingular}`;
  const formTitle          = () => {
    if (editingId) return t("Editar unidade");
    if (isSubsedeContext) return "Nova Congregação";
    if (isSetorContext && insertChildType === "subsede") return "Nova Subsede";
    if (isSetorContext && insertChildType === "congregacao") return "Nova Congregação";
    return `${newUnitArticle(childSingular)} ${childSingular}`;
  };
  const primarySaveLabel   = () => editingId ? t("Salvar Alterações") : `Criar ${childSingular.toLowerCase()}`;

  const typeBadgeLabel = (orgType: string) => {
    if (orgType === "international_convention") return "Internacional";
    if (orgType === "national_convention") return "Sede Nacional";
    if (orgType === "state_convention") return church?.top_level_label   ?? "Convenção Estadual";
    if (orgType === "convencao")  return church?.top_level_label   ?? "Convenção / Regional";
    if (orgType === "matriz")     return church?.municipal_level_label ?? "Matriz Municipal";
    if (orgType === "sede")       return church?.municipal_level_label ?? "Sede";
    if (orgType === "setor")      return church?.intermediate_level_label ?? "Distrito";
    if (orgType === "subsede")    return "Subsede";
    if (orgType === "congregacao") return church?.local_unit_label ?? "Congregação";
    return orgType;
  };

  const currentUnitChildrenLabel = (): string => {
    if (isInternationalContext) return `${intlPlural} nesta Organização Internacional`;
    if (isNationalContext) return `${nationalPlural} nesta Sede Nacional`;
    if (isConvencaoContext) return `${municipalPlural} nesta ${topSingular.toLowerCase()}`;
    if (isMatriz) return `${childPlural} nesta ${municipalSingular.toLowerCase()}`;
    if (isSetorContext) return `${localPlural} neste ${intermediateSingular.toLowerCase()}`;
    if (isSubsedeContext) return `${localPlural} nesta subsede`;
    return "Unidades filhas";
  };

  // ── Responsáveis: vínculos ativos + convites pendentes ───────────────────
  const loadResponsiblesForOrgs = useCallback(async (orgIds: string[]) => {
    if (!orgIds.length) return;

    const map: ResponsibleMap = {};
    for (const id of orgIds) map[id] = {};

    // Uma única RPC hierárquica resolve perfis e convites sem depender de
    // policies permissivas ou de leituras diretas em unidades subordinadas.
    const { data, error } = await supabase.rpc("admin_list_hierarchy_responsibles", {
      _organization_ids: orgIds,
    });
    if (error) return;

    const payload = data as { responsibles?: Array<{
      organization_id: string;
      responsibility_type: string;
      status: ResponsibleStatus;
      user_id: string | null;
      invite_id: string | null;
      full_name: string | null;
      email: string | null;
    }> } | null;

    for (const responsible of payload?.responsibles ?? []) {
      const slot = responsibilityToSlotRole(responsible.responsibility_type);
      if (!slot || !map[responsible.organization_id] || map[responsible.organization_id][slot]) continue;
      map[responsible.organization_id][slot] = {
        name: responsible.full_name,
        email: responsible.email,
        role: slot,
        status: responsible.status,
        userId: responsible.user_id ?? undefined,
        inviteId: responsible.invite_id ?? undefined,
      };
    }

    setResponsiblesByOrg((prev) => ({ ...prev, ...map }));
  }, []);

  // ── loadFraternas (agrupamentos laterais) ─────────────────────────────────
  const loadFraternas = useCallback(async () => {
    if (!church?.id) return;
    setLoadingFraternas(true);
    try {
      const { data } = await supabase
        .from("organization_affiliations" as never)
        .select("id,name,affiliation_type,description,is_active")
        .eq("organization_id", church.id)
        .eq("is_active", true)
        .order("name");
      setFraternas((data as Fraterna[] | null) ?? []);
    } catch {
      // Tabela pode não existir ainda — ignorar silenciosamente
      setFraternas([]);
    }
    setLoadingFraternas(false);
  }, [church?.id]);

  const handleSaveFraterna = async () => {
    if (!fraterna.name.trim() || !church?.id) return;
    setSavingFraterna(true);
    try {
      await supabase.from("organization_affiliations" as never).insert({
        organization_id:  church.id,
        name:             fraterna.name.trim(),
        description:      fraterna.description || null,
        affiliation_type: fraterna.affiliation_type || "fraterna",
        is_active:        true,
      } as never);
      await loadFraternas();
      setShowFraterna(false);
      setFraterna({ name: "", description: "", affiliation_type: "fraterna" });
      toast({ title: t("Fraterna criada.") });
    } catch {
      toast({ title: t("Erro ao criar fraterna"), variant: "destructive" });
    }
    setSavingFraterna(false);
  };

  // ── Row mapper ─────────────────────────────────────────────────────────────
  const mapRow = (row: Record<string, unknown>): ChildOrganization => ({
    id:               row.id as string,
    name:             row.name as string,
    slug:             (row.slug as string) ?? "",
    city:             (row.city as string | null) ?? null,
    state:            (row.state as string | null) ?? null,
    phone:            (row.phone as string | null) ?? null,
    email:            (row.email as string | null) ?? null,
    organization_type: row.organization_type as string,
    parent_id:        (row.parent_id as string | null) ?? null,
    unit_status:      (row.unit_status as string | null) ?? null,
    zip_code:         (row.zip_code as string | null) ?? null,
    street:           (row.street as string | null) ?? null,
    address_number:   (row.address_number as string | null) ?? null,
    address_complement: (row.address_complement as string | null) ?? null,
    neighborhood:     (row.neighborhood as string | null) ?? null,
    website_url:      (row.website_url as string | null) ?? null,
    country_code:     (row.country_code as string | null) ?? null,
  });

  const ORG_SELECT = "id,name,slug,city,state,phone,email,organization_type,parent_id,unit_status,zip_code,street,address_number,address_complement,neighborhood,website_url,country_code";

  // ── loadCongregationsForSector ─────────────────────────────────────────────
  const loadCongregationsForSector = useCallback(async (sectorId: string, force = false) => {
    if (!force && sectorCongregations[sectorId] !== undefined) return;
    setLoadingCongregations((prev) => ({ ...prev, [sectorId]: true }));
    const { data, error } = await supabase.from("organizations").select(ORG_SELECT)
      .eq("parent_id", sectorId).eq("active", true).eq("organization_type", "congregacao").order("name");
    setLoadingCongregations((prev) => ({ ...prev, [sectorId]: false }));
    if (!error && data) {
      const congs = (data as Record<string, unknown>[]).map(mapRow);
      setSectorCongregations((prev) => ({ ...prev, [sectorId]: congs }));
      setCongregationCounts((prev) => ({ ...prev, [sectorId]: congs.length }));
      if (congs.length > 0) void loadResponsiblesForOrgs(congs.map((c) => c.id));
    }
  }, [sectorCongregations, loadResponsiblesForOrgs]);

  // ── activeOrgType ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!church?.id) { setActiveOrgType(null); setActiveOrgTypeResolved(false); return; }
    setActiveOrgTypeResolved(false);
    let cancelled = false;
    void supabase.from("organizations").select("organization_type").eq("id", church.id).single()
      .then(({ data, error }) => {
        if (cancelled) return;
        setActiveOrgType(error ? null : (data?.organization_type ?? null));
        setActiveOrgTypeResolved(true);
      });
    return () => { cancelled = true; };
  }, [church?.id]);

  // ── loadChildOrganizations ─────────────────────────────────────────────────
  const loadChildOrganizations = useCallback(async () => {
    if (!church) return;
    setLoading(true);

    // ── Internacional: carrega tudo que pode ser filho direto ─────────────
    if (normalizedActiveOrgType === "international_convention") {
      const { data, error } = await supabase.from("organizations").select(ORG_SELECT)
        .eq("parent_id", church.id).eq("active", true)
        .in("organization_type", ["national_convention", "state_convention", "convencao", "matriz", "sede"])
        .order("name");
      if (error) toast({ title: t("Erro ao carregar"), description: error.message, variant: "destructive" });
      else if (data) setChildOrganizations((data as Record<string, unknown>[]).map(mapRow));
      setLoading(false);
      return;
    }

    // ── Nacional: carrega Convenções Estaduais + Matrizes/Sedes diretas ────
    if (normalizedActiveOrgType === "national_convention") {
      const { data, error } = await supabase.from("organizations").select(ORG_SELECT)
        .eq("parent_id", church.id).eq("active", true)
        .in("organization_type", ["state_convention", "convencao", "matriz", "sede"]).order("name");
      if (error) toast({ title: t("Erro ao carregar"), description: error.message, variant: "destructive" });
      else if (data) setChildOrganizations((data as Record<string, unknown>[]).map(mapRow));
      setLoading(false);
      return;
    }

    // ── Estadual/Convenção: carrega Matrizes e Sedes ───────────────────────
    if (normalizedActiveOrgType === "state_convention") {
      const { data, error } = await supabase.from("organizations").select(ORG_SELECT)
        .eq("parent_id", church.id).eq("active", true)
        .in("organization_type", ["matriz", "sede"]).order("name");
      if (error) toast({ title: t("Erro ao carregar"), description: error.message, variant: "destructive" });
      else if (data) setChildOrganizations((data as Record<string, unknown>[]).map(mapRow));
      setLoading(false);
      return;
    }

    if (isMatriz) {
      const _usesIntermediate = church.uses_intermediate_level !== false;
      const { data, error } = await supabase.from("organizations").select(ORG_SELECT)
        .eq("parent_id", church.id).eq("active", true)
        .eq("organization_type", _usesIntermediate ? "setor" : "congregacao").order("name");
      if (error) {
        toast({ title: t("Erro ao carregar"), description: error.message, variant: "destructive" });
        setChildOrganizations([]);
      } else if (data) {
        const units = (data as Record<string, unknown>[]).map(mapRow);
        setChildOrganizations(units);
        if (units.length > 0) {
          if (_usesIntermediate) {
            const { data: congs } = await supabase.from("organizations")
              .select("id,parent_id").in("parent_id", units.map((u) => u.id))
              .eq("active", true).eq("organization_type", "congregacao");
            if (congs) {
              const counts: Record<string, number> = {};
              for (const c of congs) { counts[c.parent_id!] = (counts[c.parent_id!] ?? 0) + 1; }
              setCongregationCounts(counts);
            }
          }
          void loadResponsiblesForOrgs(units.map((u) => u.id));
        }
      }
      setLoading(false);
      return;
    }

    if (normalizedActiveOrgType === "setor") {
      // Load both subsedes and direct congregations as children of the setor
      const { data, error } = await supabase.from("organizations").select(ORG_SELECT)
        .eq("parent_id", church.id).eq("active", true)
        .in("organization_type", ["subsede", "congregacao"]).order("name");
      if (error) {
        toast({ title: t("Erro ao carregar"), description: error.message, variant: "destructive" });
        setSectorSubsedes([]);
        setChildOrganizations([]);
      } else if (data) {
        const all = (data as Record<string, unknown>[]).map(mapRow);
        setSectorSubsedes(all.filter(c => c.organization_type === "subsede"));
        setChildOrganizations(all.filter(c => c.organization_type === "congregacao"));
        if (all.length > 0) void loadResponsiblesForOrgs(all.map((c) => c.id));
      }
      setLoading(false);
      return;
    }

    if (normalizedActiveOrgType === "subsede") {
      const { data, error } = await supabase.from("organizations").select(ORG_SELECT)
        .eq("parent_id", church.id).eq("active", true).eq("organization_type", "congregacao").order("name");
      if (error) toast({ title: t("Erro ao carregar"), description: error.message, variant: "destructive" });
      else if (data) {
        const congs = (data as Record<string, unknown>[]).map(mapRow);
        setChildOrganizations(congs);
        if (congs.length > 0) void loadResponsiblesForOrgs(congs.map((c) => c.id));
      }
      setLoading(false);
      return;
    }

    setChildOrganizations([]);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [church, isMatriz, activeOrgType, t, loadResponsiblesForOrgs]);

  useEffect(() => {
    if (roleLoading) return;
    if (!user || !church) { setLoading(false); return; }
    if (!isMatriz && !activeOrgTypeResolved) return;
    void loadChildOrganizations();
    if (isInternationalContext || isNationalContext || isConvencaoContext) void loadFraternas();
  }, [user, roleLoading, church, isMatriz, activeOrgType, activeOrgTypeResolved, loadChildOrganizations, isInternationalContext, isNationalContext, isConvencaoContext, loadFraternas]);

  // ── Slug ───────────────────────────────────────────────────────────────────
  const generateSlug = (name: string) =>
    name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const insertOrganizationType = (overrideType?: OrgType): "international_convention" | "national_convention" | "state_convention" | "matriz" | "setor" | "subsede" | "congregacao" | null => {
    if (overrideType) return overrideType;
    if (isInternationalContext) {
      return church?.hierarchy_model === "international_flexible"
        ? "matriz"
        : "national_convention";
    }
    if (isNationalContext) return "state_convention";
    if (isConvencaoContext) return "matriz";
    if (isSetorContext) return null; // must be specified via overrideType
    if (isSubsedeContext) return "congregacao";
    if (isMatriz) return usesIntermediate ? "setor" : "congregacao";
    return "congregacao";
  };

  // ── handleSave ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: t("Nome é obrigatório"), variant: "destructive" }); return; }
    const payload = {
      name: form.name, city: form.city || null, state: form.state || null,
      country_code: form.country_code || null, zip_code: form.zip_code || null,
      street: form.street || null, address_number: form.address_number || null,
      address_complement: form.address_complement || null, neighborhood: form.neighborhood || null,
      phone: form.phone || null, email: form.email || null, website_url: form.website_url || null,
      unit_status: form.unit_status,
    };
    if (editingId) {
      const { error } = await supabase.from("organizations").update(payload).eq("id", editingId);
      if (error) toast({ title: t("Erro ao atualizar"), description: error.message, variant: "destructive" });
      else toast({ title: t("Dados da unidade atualizados.") });
    } else {
      const orgType = insertOrganizationType(insertChildType ?? undefined);
      if (!orgType) {
        toast({ title: t("Tipo de unidade inválido"), description: t("Selecione se deseja criar uma subsede ou congregação."), variant: "destructive" });
        return;
      }
      const { error } = await supabase.from("organizations").insert({
        ...payload, slug: generateSlug(form.name) + "-" + Date.now().toString(36),
        parent_id: church!.id, organization_type: orgType, active: true,
      });
      if (error) toast({ title: `${t("Erro ao criar")} ${childSingular.toLowerCase()}`, description: error.message, variant: "destructive" });
      else {
      const unitLabel = orgType === "state_convention" ? nationalSingular
        : orgType === "setor" ? intermediateSingular
        : orgType === "subsede" ? t("Subsede")
        : orgType === "matriz" ? municipalSingular : localSingular;
        toast({ title: `${unitLabel} ${t("criado(a).")}` });
      }
    }
    setForm(EMPTY_ORG_FORM); setShowForm(false); setEditingId(null); setInsertChildType(null);
    void loadChildOrganizations();
  };

  const handleEdit = (c: ChildOrganization) => {
    setForm({
      name: c.name, city: c.city ?? "", state: c.state ?? "", country_code: c.country_code ?? "BR",
      zip_code: c.zip_code ?? "", street: c.street ?? "", address_number: c.address_number ?? "",
      address_complement: c.address_complement ?? "", neighborhood: c.neighborhood ?? "",
      phone: c.phone ?? "", email: c.email ?? "", website_url: c.website_url ?? "",
      unit_status: (c.unit_status as UnitStatus) || "Ativa",
    });
    setEditingId(c.id); setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("organizations").delete().eq("id", id);
    if (error) toast({ title: t("Erro ao excluir"), description: error.message, variant: "destructive" });
    else { toast({ title: t("Unidade excluída.") }); void loadChildOrganizations(); }
  };

  // ── Modal (unidade local) ──────────────────────────────────────────────────
  const openNewLocalUnit = (sector: ChildOrganization) => {
    setCongForm({ ...EMPTY_ORG_FORM, city: sector.city ?? "", state: sector.state ?? "" });
    setCongModal({ sectorId: sector.id, sectorName: sector.name });
  };

  const handleSaveCongregation = async () => {
    if (!congModal) return;
    if (!congForm.name.trim()) { toast({ title: t("Nome é obrigatório"), variant: "destructive" }); return; }
    setSavingCong(true);
    const { error } = await supabase.from("organizations").insert({
      name: congForm.name, slug: generateSlug(congForm.name) + "-" + Date.now().toString(36),
      parent_id: congModal.sectorId, organization_type: "congregacao",
      city: congForm.city || null, state: congForm.state || null, country_code: congForm.country_code || null,
      zip_code: congForm.zip_code || null, street: congForm.street || null,
      address_number: congForm.address_number || null, address_complement: congForm.address_complement || null,
      neighborhood: congForm.neighborhood || null, phone: congForm.phone || null,
      email: congForm.email || null, website_url: congForm.website_url || null,
      unit_status: congForm.unit_status, active: true,
    });
    if (error) toast({ title: `${t("Erro ao criar")} ${localSingular.toLowerCase()}`, description: error.message, variant: "destructive" });
    else {
      toast({ title: `${localSingular} ${t("criada.")}`, description: `${parentConnText}: ${congModal.sectorName}.` });
      await loadCongregationsForSector(congModal.sectorId, true);
      setCongModal(null); setCongForm(EMPTY_ORG_FORM);
    }
    setSavingCong(false);
  };

  // ── Nomenclatura ───────────────────────────────────────────────────────────
  const openNomenclatureForm = () => {
    setNomenclatureForm({
      denomination_type:              church?.denomination_type ?? "",
      hierarchy_model:                church?.hierarchy_model ?? "",
      top_level_label:                church?.top_level_label ?? "",
      top_level_label_plural:         church?.top_level_label_plural ?? "",
      municipal_level_label:          church?.municipal_level_label ?? "",
      municipal_level_label_plural:   church?.municipal_level_label_plural ?? "",
      intermediate_level_label:       church?.intermediate_level_label ?? "",
      intermediate_level_label_plural: church?.intermediate_level_label_plural ?? "",
      local_unit_label:               church?.local_unit_label ?? "",
      local_unit_label_plural:        church?.local_unit_label_plural ?? "",
      uses_convention_level:  church?.uses_convention_level ?? false,
      uses_municipal_level:   church?.uses_municipal_level ?? true,
      uses_intermediate_level: church?.uses_intermediate_level ?? true,
      uses_local_units:       church?.uses_local_units ?? true,
    });
    setShowNomenclatureForm(true);
    // Close other panels
    setShowForm(false);
    setEditingId(null);
  };

  const handleSaveNomenclature = async () => {
    if (!church?.id) return;
    setSavingNomenclature(true);
    const { error } = await supabase.from("organizations").update({
      denomination_type:              nomenclatureForm.denomination_type || null,
      hierarchy_model:                nomenclatureForm.hierarchy_model || null,
      top_level_label:                nomenclatureForm.top_level_label || null,
      top_level_label_plural:         nomenclatureForm.top_level_label_plural || null,
      municipal_level_label:          nomenclatureForm.municipal_level_label || null,
      municipal_level_label_plural:   nomenclatureForm.municipal_level_label_plural || null,
      intermediate_level_label:       nomenclatureForm.intermediate_level_label || null,
      intermediate_level_label_plural: nomenclatureForm.intermediate_level_label_plural || null,
      local_unit_label:               nomenclatureForm.local_unit_label || null,
      local_unit_label_plural:        nomenclatureForm.local_unit_label_plural || null,
      uses_convention_level:  nomenclatureForm.uses_convention_level,
      uses_municipal_level:   nomenclatureForm.uses_municipal_level,
      uses_intermediate_level: nomenclatureForm.uses_intermediate_level,
      uses_local_units:       nomenclatureForm.uses_local_units,
    }).eq("id", church.id);

    if (error) {
      toast({ title: t("Erro ao salvar configuração"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("Configuração salva!"), description: t("Menu, títulos e formulários foram atualizados.") });
      setShowNomenclatureForm(false);
      await refetchChurch();
      void loadChildOrganizations();
    }
    setSavingNomenclature(false);
  };

  // ── Navigation helpers ─────────────────────────────────────────────────────
  const handleInviteResponsible = (c: ChildOrganization) => {
    navigate("/admin/gerenciar-acessos", {
      state: {
        contextOrganizationId:   c.id,
        contextOrganizationName: c.name,
        contextOrganizationType: c.organization_type,
        contextParentId:         c.parent_id,
        source:                  "hierarquia",
      },
    });
  };

  const openChatWithResponsible = (contact: { userId: string; name?: string | null; email?: string | null }) => {
    navigate("/admin/chat", {
      state: {
        openDm:   true,
        userId:   contact.userId,
        userName: contact.name ?? contact.email ?? "Responsável",
      },
    });
  };

  // Address one-liner
  const addressLine = (c: ChildOrganization): string | null => {
    const parts = [c.street, c.address_number, c.address_complement, c.neighborhood, c.city, c.state, c.zip_code].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
  };

  // ── Guard ──────────────────────────────────────────────────────────────────
  if (!roleLoading && !isAdmin) return <Navigate to="/admin" replace />;

  const showStructureConfig = (isMatriz || isConvencaoContext || isNationalContext) && canManageOrganizations;

  // ══════════════════════════════════════════════════════════════════════════
  // JSX
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <AdminLayout>
      <div className="space-y-6">

        {/* ── Page header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif tracking-tight flex items-center gap-2">
              <Building2 size={28} className="text-accent" />
              {pageTitle()}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{pageSubtitle()}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {showStructureConfig && (
              <button
                onClick={() => showNomenclatureForm ? setShowNomenclatureForm(false) : openNomenclatureForm()}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                  showNomenclatureForm
                    ? "bg-accent/10 border-accent/40 text-accent"
                    : "border-border hover:border-accent/50 hover:bg-accent/5 text-foreground hover:text-accent"
                }`}
              >
                <Settings size={15} />
                Estrutura
              </button>
            )}
            {canManageChildUnits && isSetorContext && (
              <>
                <button
                  onClick={() => {
                    setInsertChildType("subsede");
                    setShowForm(!showForm); setEditingId(null); setForm(EMPTY_ORG_FORM);
                    if (!showForm) setShowNomenclatureForm(false);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  <Plus size={16} /> Nova Subsede
                </button>
                <button
                  onClick={() => {
                    setInsertChildType("congregacao");
                    setShowForm(!showForm); setEditingId(null); setForm(EMPTY_ORG_FORM);
                    if (!showForm) setShowNomenclatureForm(false);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  <Plus size={16} /> Nova Congregação
                </button>
              </>
            )}
            {canManageChildUnits && !isSetorContext && (
              <button
                onClick={() => {
                  setInsertChildType(null);
                  setShowForm(!showForm); setEditingId(null); setForm(EMPTY_ORG_FORM);
                  if (!showForm) setShowNomenclatureForm(false);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <Plus size={16} /> {newUnitButtonLabel()}
              </button>
            )}
          </div>
        </div>

        {/* ── Nomenclature config — painel expansível no topo ── */}
        {showNomenclatureForm && (
          <div className="bg-card rounded-xl shadow-executive border border-accent/20 p-5 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <Layers size={15} className="text-accent" />
                  Estrutura e nomenclatura da organização
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Configure abaixo como esta organização chama seus níveis. Algumas igrejas usam Setor, outras Distrito, Região, Campo, Campus ou estrutura própria. Ao salvar, menu, títulos, botões e formulários atualizam imediatamente.
                </p>
              </div>
              <button type="button" onClick={() => setShowNomenclatureForm(false)}
                className="text-muted-foreground hover:text-foreground p-1 flex-shrink-0">
                <X size={16} />
              </button>
            </div>

            {/* Tipo + modelo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Tipo de denominação</label>
                <input value={nomenclatureForm.denomination_type}
                  onChange={(e) => setNomenclatureForm((f) => ({ ...f, denomination_type: e.target.value }))}
                  placeholder='Ex: Assembleia de Deus, Adventista, Church...'
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Modelo hierárquico</label>
                <select value={nomenclatureForm.hierarchy_model}
                  onChange={(e) => setNomenclatureForm((f) => ({ ...f, hierarchy_model: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
                  <option value="">— Selecionar —</option>
                  {HIERARCHY_MODEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            {/* Flags */}
            <div className="rounded-lg border border-border/40 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Níveis ativos</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([
                  { key: "uses_convention_level",  label: "Nível de Convenção" },
                  { key: "uses_municipal_level",   label: "Nível Municipal/Matriz" },
                  { key: "uses_intermediate_level", label: "Nível intermediário" },
                  { key: "uses_local_units",       label: "Unidades locais" },
                ] as const).map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer text-xs">
                    <input type="checkbox"
                      checked={nomenclatureForm[key] as boolean}
                      onChange={(e) => setNomenclatureForm((f) => ({ ...f, [key]: e.target.checked }))}
                      className="rounded border-border" />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* Nível intermediário */}
            {nomenclatureForm.uses_intermediate_level && (
              <div className="rounded-lg border border-border/30 p-4 space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Nível intermediário &nbsp;·&nbsp; <span className="text-muted-foreground/60 normal-case font-normal">ex: Setor, Distrito, Região</span>
                </p>
                {/* Quick presets */}
                <div className="flex flex-wrap gap-1.5">
                  {INTERMEDIATE_PRESETS.map((preset) => {
                    const plurals: Record<string, string> = {
                      Setor: "Setores", Distrito: "Distritos", Região: "Regiões",
                      Área: "Áreas", Campo: "Campos", Zona: "Zonas",
                    };
                    const isActive = preset === "Nenhum"
                      ? !nomenclatureForm.uses_intermediate_level
                      : preset === "Personalizado"
                        ? nomenclatureForm.uses_intermediate_level
                          && !INTERMEDIATE_PRESETS.slice(0, -2).includes(nomenclatureForm.intermediate_level_label)
                        : nomenclatureForm.intermediate_level_label === preset;
                    return (
                      <button key={preset} type="button"
                        onClick={() => {
                          if (preset === "Nenhum") {
                            setNomenclatureForm((f) => ({ ...f, uses_intermediate_level: false }));
                            return;
                          }
                          if (preset === "Personalizado") {
                            setNomenclatureForm((f) => ({ ...f, uses_intermediate_level: true }));
                            return;
                          }
                          setNomenclatureForm((f) => ({
                            ...f,
                            uses_intermediate_level: true,
                            intermediate_level_label: preset,
                            intermediate_level_label_plural: plurals[preset] ?? f.intermediate_level_label_plural,
                          }));
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                          isActive
                            ? "bg-accent text-accent-foreground border-accent"
                            : "border-border hover:border-accent/50 hover:bg-accent/5"
                        }`}>
                        {preset}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input value={nomenclatureForm.intermediate_level_label}
                    onChange={(e) => setNomenclatureForm((f) => ({ ...f, intermediate_level_label: e.target.value }))}
                    placeholder="Singular (ex: Setor, Distrito)"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                  <input value={nomenclatureForm.intermediate_level_label_plural}
                    onChange={(e) => setNomenclatureForm((f) => ({ ...f, intermediate_level_label_plural: e.target.value }))}
                    placeholder="Plural (ex: Setores, Distritos)"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                </div>
              </div>
            )}

            {/* Unidade local */}
            {nomenclatureForm.uses_local_units && (
              <div className="rounded-lg border border-border/30 p-4 space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Unidade local &nbsp;·&nbsp; <span className="text-muted-foreground/60 normal-case font-normal">ex: Congregação, Campus, Igreja local</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {LOCAL_PRESETS.map((preset) => {
                    const plurals: Record<string, string> = {
                      "Congregação": "Congregações", "Igreja local": "Igrejas locais",
                      "Filial": "Filiais", "Campus": "Campuses",
                      "Comunidade": "Comunidades", "Templo": "Templos",
                    };
                    const isActive = preset === "Nenhum"
                      ? !nomenclatureForm.uses_local_units
                      : preset === "Personalizado"
                        ? nomenclatureForm.uses_local_units
                          && !LOCAL_PRESETS.slice(0, -2).includes(nomenclatureForm.local_unit_label)
                        : nomenclatureForm.local_unit_label === preset;
                    return (
                      <button key={preset} type="button"
                        onClick={() => {
                          if (preset === "Nenhum") {
                            setNomenclatureForm((f) => ({ ...f, uses_local_units: false }));
                            return;
                          }
                          if (preset === "Personalizado") {
                            setNomenclatureForm((f) => ({ ...f, uses_local_units: true }));
                            return;
                          }
                          setNomenclatureForm((f) => ({
                            ...f,
                            uses_local_units: true,
                            local_unit_label: preset,
                            local_unit_label_plural: plurals[preset] ?? f.local_unit_label_plural,
                          }));
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                          isActive
                            ? "bg-accent text-accent-foreground border-accent"
                            : "border-border hover:border-accent/50 hover:bg-accent/5"
                        }`}>
                        {preset}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input value={nomenclatureForm.local_unit_label}
                    onChange={(e) => setNomenclatureForm((f) => ({ ...f, local_unit_label: e.target.value }))}
                    placeholder="Singular (ex: Congregação, Campus)"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                  <input value={nomenclatureForm.local_unit_label_plural}
                    onChange={(e) => setNomenclatureForm((f) => ({ ...f, local_unit_label_plural: e.target.value }))}
                    placeholder="Plural (ex: Congregações, Campuses)"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                </div>
              </div>
            )}

            {/* Labels opcionais: nível superior + municipal */}
            {(nomenclatureForm.uses_convention_level || nomenclatureForm.uses_municipal_level) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {nomenclatureForm.uses_convention_level && (
                  <div className="rounded-lg border border-border/30 p-3 space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nível superior</p>
                    <input value={nomenclatureForm.top_level_label}
                      onChange={(e) => setNomenclatureForm((f) => ({ ...f, top_level_label: e.target.value }))}
                      placeholder="Singular (Convenção, Rede…)"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                    <input value={nomenclatureForm.top_level_label_plural}
                      onChange={(e) => setNomenclatureForm((f) => ({ ...f, top_level_label_plural: e.target.value }))}
                      placeholder="Plural (Convenções, Redes…)"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                  </div>
                )}
                {nomenclatureForm.uses_municipal_level && (
                  <div className="rounded-lg border border-border/30 p-3 space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nível municipal</p>
                    <input value={nomenclatureForm.municipal_level_label}
                      onChange={(e) => setNomenclatureForm((f) => ({ ...f, municipal_level_label: e.target.value }))}
                      placeholder="Singular (Matriz Municipal, Sede…)"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                    <input value={nomenclatureForm.municipal_level_label_plural}
                      onChange={(e) => setNomenclatureForm((f) => ({ ...f, municipal_level_label_plural: e.target.value }))}
                      placeholder="Plural (Matrizes Municipais…)"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                  </div>
                )}
              </div>
            )}

            {/* Save */}
            <div className="flex gap-2 pt-1 border-t border-border/30">
              <button type="button" disabled={savingNomenclature} onClick={() => void handleSaveNomenclature()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2">
                {savingNomenclature && <Loader2 size={13} className="animate-spin" />}
                Salvar configuração
              </button>
              <button type="button" onClick={() => setShowNomenclatureForm(false)}
                className="px-4 py-2 bg-secondary text-foreground rounded-lg text-sm hover:bg-secondary/80 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* ── Main form (create / edit unit) ── */}
        {showForm && (
          <div className="bg-card rounded-xl shadow-executive p-5 space-y-5">
            <div>
              <h2 className="font-semibold text-sm">{formTitle()}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("Dados institucionais da unidade. Responsáveis são gerenciados em Gerenciar Acessos após a criação.")}
              </p>
            </div>

            {/* Dados da unidade */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Dados da unidade</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={`Nome da ${childSingular.toLowerCase()} *`}
                  className="sm:col-span-2 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground block mb-1">Status operacional</label>
                  <select value={form.unit_status} onChange={(e) => setForm((f) => ({ ...f, unit_status: e.target.value as UnitStatus }))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
                    {UNIT_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Localização */}
            <div className="border-t border-border/40 pt-4 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <MapPin size={11} /> Localização e endereço
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="Cidade" className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                <input value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                  placeholder="Estado (ex: RS)" className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                <input value={form.zip_code} onChange={(e) => setForm((f) => ({ ...f, zip_code: e.target.value }))}
                  placeholder="CEP" className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                <input value={form.neighborhood} onChange={(e) => setForm((f) => ({ ...f, neighborhood: e.target.value }))}
                  placeholder="Bairro" className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                <input value={form.street} onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))}
                  placeholder="Rua / Logradouro" className="sm:col-span-2 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                <input value={form.address_number} onChange={(e) => setForm((f) => ({ ...f, address_number: e.target.value }))}
                  placeholder="Número" className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                <input value={form.address_complement} onChange={(e) => setForm((f) => ({ ...f, address_complement: e.target.value }))}
                  placeholder="Complemento" className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
              </div>
            </div>

            {/* Contato */}
            <div className="border-t border-border/40 pt-4 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Phone size={11} /> Contato institucional
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="Telefone" className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="E-mail institucional" type="email" className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                <input value={form.website_url} onChange={(e) => setForm((f) => ({ ...f, website_url: e.target.value }))}
                  placeholder="Site (https://...)" className="sm:col-span-2 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
              </div>
            </div>

            {/* Responsáveis (somente em edição) */}
            {editingId && (
              <div className="border-t border-border/40 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Responsáveis</p>
                  <span className="text-[10px] text-muted-foreground">Gerenciados via Gerenciar Acessos</span>
                </div>
                {(() => {
                  const slots = responsiblesByOrg[editingId] ?? {};
                  const editingOrg = childOrganizations.find((o) => o.id === editingId);
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {([
                        { label: "Pastor responsável", key: "pastor" as const },
                        { label: "Secretário",         key: "secretary" as const },
                        { label: "Tesoureiro",         key: "tesoureiro" as const },
                      ]).map(({ label, key }) => {
                        const r = slots[key];
                        return (
                          <div key={label} className="rounded-lg border border-border/50 bg-secondary/30 px-3 py-2">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
                            {r ? (
                              <>
                                {r.status === "pending" && (
                                  <span className="inline-flex text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-semibold mb-1">
                                    Convite pendente
                                  </span>
                                )}
                                <p className="text-xs font-medium truncate">{displayName(r)}</p>
                                {r.email && <p className="text-[10px] text-muted-foreground truncate">{r.email}</p>}
                              </>
                            ) : (
                              <p className="text-xs text-muted-foreground italic">Não definido</p>
                            )}
                          </div>
                        );
                      })}
                      <div className="rounded-lg border border-border/50 bg-secondary/30 px-3 py-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Contato principal</p>
                        {(editingOrg?.phone ?? editingOrg?.email)
                          ? <p className="text-xs font-medium truncate">{editingOrg?.phone ?? editingOrg?.email}</p>
                          : <p className="text-xs text-muted-foreground italic">Preencha Telefone ou E-mail acima</p>}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={() => void handleSave()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                {primarySaveLabel()}
              </button>
              <button onClick={() => { setShowForm(false); setEditingId(null); }}
                className="px-4 py-2 bg-secondary text-foreground rounded-lg text-sm hover:bg-secondary/80 transition-colors">
                {t("Cancelar")}
              </button>
            </div>
          </div>
        )}

        {/* ── Subsedes list (setor context only) ── */}
        {isSetorContext && !loading && (
          <div className="bg-card rounded-xl shadow-executive overflow-hidden">
            {sectorSubsedes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground px-4">
                <Building2 size={40} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma subsede cadastrada.</p>
              </div>
            ) : (
              <>
                <div className="px-4 py-2.5 border-b border-border/50 bg-secondary/20">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subsedes</p>
                </div>
                <div className="divide-y divide-border">
                  {sectorSubsedes.map((c) => {
                    const isExpanded = expandedId === c.id;
                    const slots = responsiblesByOrg[c.id] ?? {};
                    const pastor    = slots.pastor;
                    const secretary = slots.secretary;

                    const navigateAccess = (presetRole: ResponsibleRole, openNew = false) => {
                      navigate("/admin/gerenciar-acessos", {
                        state: {
                          contextOrganizationId:   c.id,
                          contextOrganizationName: c.name,
                          contextOrganizationType: c.organization_type,
                          source: "hierarquia",
                          ...(openNew ? { openNewAccess: true, presetRole } : {}),
                        },
                      });
                    };

                    return (
                      <div key={c.id}>
                        <div
                          role="button" tabIndex={0}
                          onClick={() => { setExpandedId(isExpanded ? null : c.id); }}
                          onKeyDown={(e) => { if (e.key === "Enter") setExpandedId(isExpanded ? null : c.id); }}
                          className="p-4 hover:bg-secondary/30 transition-colors cursor-pointer select-none"
                        >
                          <div className="flex items-start gap-4">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isExpanded ? "bg-accent/30" : "bg-accent/20"}`}>
                              <ChurchIcon size={20} className="text-accent" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold">{c.name}</p>
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground font-semibold shrink-0">
                                  Subsede
                                </span>
                                {statusBadge(c.unit_status)}
                              </div>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                                {c.city && (
                                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                                    <MapPin size={10} /> {c.city}{c.state ? `, ${c.state}` : ""}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <span className="text-[11px] text-muted-foreground mr-1 hidden sm:inline">
                                {isExpanded ? "Recolher" : "Ver detalhes"}
                              </span>
                              <ChevronDown size={15} className={`text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="bg-muted/30 border-t border-border/40 px-4 pb-4 pt-3 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {([
                                { label: "Encarregado", roleKey: "pastor" as const,     Icon: BookOpen },
                                { label: "Secretário",  roleKey: "secretary" as const,  Icon: UserCheck },
                                { label: "Tesoureiro",  roleKey: "tesoureiro" as const, Icon: Wallet },
                              ]).map(({ label, roleKey, Icon }) => (
                                <ResponsibleRoleCard
                                  key={roleKey}
                                  label={label}
                                  roleKey={roleKey}
                                  responsible={slots[roleKey]}
                                  Icon={Icon}
                                  onDefine={(e) => { e.stopPropagation(); navigateAccess(roleKey, true); }}
                                  onManageAccess={(e) => { e.stopPropagation(); navigateAccess(roleKey, false); }}
                                />
                              ))}
                            </div>

                            <div className="pt-1 border-t border-border/40 space-y-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ações operacionais</p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                <ShortcutBtn icon={Shield} label="Gerenciar Acessos"
                                  onClick={(e) => { e.stopPropagation(); handleInviteResponsible(c); }} />
                                <ShortcutBtn icon={Users} label="Ver Membros"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate("/admin/membros", {
                                      state: {
                                        contextOrganizationId:   c.id,
                                        contextOrganizationName: c.name,
                                        contextOrganizationType: c.organization_type,
                                        source: "hierarquia",
                                      },
                                    });
                                  }}
                                />
                                <ShortcutBtn icon={Calendar} label="Agenda"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate("/admin/agenda", {
                                      state: { contextOrganizationId: c.id, contextOrganizationName: c.name, contextOrganizationType: c.organization_type },
                                    });
                                  }}
                                />
                                <ShortcutBtn icon={Wallet} label="Financeiro"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate("/admin/financeiro", {
                                      state: { contextOrganizationId: c.id, contextOrganizationName: c.name, contextOrganizationType: c.organization_type },
                                    });
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Congregações diretas header (setor context) ── */}
        {isSetorContext && !loading && childOrganizations.length > 0 && (
          <div className="mt-4 px-4 py-2.5 border-b border-border/50 bg-secondary/20 rounded-t-xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Congregações diretas</p>
          </div>
        )}

        {/* ── Child organizations list ── */}
        <div className={`bg-card ${isCardsRenderProbe ? "" : "shadow-executive overflow-hidden"} ${
          isSetorContext && childOrganizations.length > 0 ? "rounded-b-xl" : "rounded-xl"
        }`}>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : childOrganizations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground px-4">
              <Building2 size={48} className="mx-auto mb-3 opacity-30" />
              {isSingleChurchMode ? (
                <>
                  <p className="text-sm font-medium text-foreground">
                    {church?.name ?? municipalSingular}
                  </p>
                  <p className="text-sm mt-2">
                    Esta {municipalSingular.toLowerCase()} opera de forma independente, sem unidades filhas.
                  </p>
                  <p className="text-xs mt-2">
                    Use Gerenciar Acessos para responsáveis e os atalhos operacionais da unidade atual.
                  </p>
                </>
              ) : !canManageChildUnits && !isAnyConventionContext ? (
                <>
                  <p className="text-sm font-medium text-foreground">
                    {church?.name ?? localSingular}
                  </p>
                  <p className="text-sm mt-2">
                    Esta é uma unidade local operacional — não cria novas unidades filhas.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate("/admin/membros")}
                    className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    <Users size={14} /> Ir para Membros
                  </button>
                </>
              ) : isSetorContext ? (
                <>
                  <p className="text-sm">Nenhuma congregação direta cadastrada.</p>
                </>
              ) : (
                <>
                  <p className="text-sm">{emptyListMessage()}</p>
                  {showStructureConfig && !showNomenclatureForm && (
                    <p className="text-xs mt-2">
                      Configure a nomenclatura clicando em{" "}
                      <button type="button" onClick={openNomenclatureForm}
                        className="text-accent hover:underline font-medium">Estrutura</button>{" "}
                      no cabeçalho.
                    </p>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {childOrganizations.map((c) => {
                const isExpanded = expandedId === c.id;
                const slots = responsiblesByOrg[c.id] ?? {};
                const pastor    = slots.pastor;
                const secretary = slots.secretary;
                const chatContact = pastor?.status === "active" && pastor.userId
                  ? pastor
                  : secretary?.status === "active" && secretary.userId
                    ? secretary
                    : undefined;

                const navigateAccess = (presetRole: ResponsibleRole, openNew = false) => {
                  navigate("/admin/gerenciar-acessos", {
                    state: {
                      contextOrganizationId:   c.id,
                      contextOrganizationName: c.name,
                      contextOrganizationType: c.organization_type,
                      source: "hierarquia",
                      ...(openNew ? { openNewAccess: true, presetRole } : {}),
                    },
                  });
                };

                return (
                  <div key={c.id}>
                    {/* Row header */}
                    <div
                      role="button" tabIndex={0}
                      onClick={() => {
                        const next = isExpanded ? null : c.id;
                        setExpandedId(next);
                        if (next && isMatriz && c.organization_type === "setor")
                          void loadCongregationsForSector(c.id, true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        const next = isExpanded ? null : c.id;
                        setExpandedId(next);
                        if (next && isMatriz && c.organization_type === "setor")
                          void loadCongregationsForSector(c.id, true);
                      }}
                      className={`p-4 transition-colors cursor-pointer select-none ${
                        isCardsRenderProbe ? "hover:bg-secondary" : "hover:bg-secondary/30"
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          isCardsRenderProbe
                            ? "border border-accent"
                            : isExpanded ? "bg-accent/30" : "bg-accent/20"
                        }`}>
                          <ChurchIcon size={20} className="text-accent" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">{c.name}</p>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground font-semibold shrink-0">
                              {typeBadgeLabel(c.organization_type)}
                            </span>
                            {statusBadge(c.unit_status)}
                            {isMatriz && c.organization_type === "setor" && congregationCounts[c.id] !== undefined && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${
                                isCardsRenderProbe ? "bg-accent text-accent-foreground" : "bg-accent/15 text-accent"
                              }`}>
                                {congregationCounts[c.id]} {localPlural.toLowerCase()}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                            {c.city && (
                              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                                <MapPin size={10} /> {c.city}{c.state ? `, ${c.state}` : ""}
                              </span>
                            )}
                            {pastor && (
                              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                                <BookOpen size={10} />
                                {pastor.status === "pending" ? "Convite pendente: " : ""}
                                {displayName(pastor)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-[11px] text-muted-foreground mr-1 hidden sm:inline">
                            {isExpanded ? "Recolher" : "Ver detalhes"}
                          </span>
                          <ChevronDown size={15} className={`text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </div>
                      </div>
                    </div>

                    {/* Expanded panel */}
                    {isExpanded && (
                      <div className={`border-t border-border/40 px-4 pb-4 pt-3 space-y-4 ${
                        isCardsRenderProbe ? "bg-muted" : "bg-muted/30"
                      }`}>

                        {/* Responsáveis */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                          {([
                            { label: "Pastor responsável", roleKey: "pastor" as const,     Icon: BookOpen },
                            { label: "Secretário",         roleKey: "secretary" as const,  Icon: UserCheck },
                            { label: "Tesoureiro",         roleKey: "tesoureiro" as const, Icon: Wallet },
                          ]).map(({ label, roleKey, Icon }) => (
                            <ResponsibleRoleCard
                              key={roleKey}
                              label={label}
                              roleKey={roleKey}
                              responsible={slots[roleKey]}
                              Icon={Icon}
                              onDefine={(e) => {
                                e.stopPropagation();
                                navigateAccess(roleKey, true);
                              }}
                              onManageAccess={(e) => {
                                e.stopPropagation();
                                navigateAccess(roleKey, false);
                              }}
                              renderProbeCards={isCardsRenderProbe}
                            />
                          ))}
                          {/* Contato principal */}
                          <div className={`rounded-lg border border-border/50 px-3 py-2.5 ${
                            isCardsRenderProbe ? "bg-background" : "bg-background/60"
                          }`}>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                              <Phone size={10} /> Contato principal
                            </p>
                            {(c.phone ?? c.email)
                              ? <p className="text-xs font-semibold truncate">{c.phone ?? c.email}</p>
                              : <button type="button"
                                  onClick={(e) => { e.stopPropagation(); handleEdit(c); setExpandedId(null); }}
                                  className="text-[11px] text-accent hover:underline italic">
                                  + Adicionar contato
                                </button>
                            }
                          </div>
                        </div>

                        {/* Dados institucionais */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                          <div>
                            <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Status</p>
                            <div className="mt-0.5">{statusBadge(c.unit_status)}</div>
                          </div>
                          <div>
                            <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Tipo</p>
                            <p className="font-medium">{typeBadgeLabel(c.organization_type)}</p>
                          </div>
                          {addressLine(c) && (
                            <div className="sm:col-span-2">
                              <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Endereço</p>
                              <p className="font-medium text-xs">{addressLine(c)}</p>
                            </div>
                          )}
                          {c.website_url && (
                            <div>
                              <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Site</p>
                              <a href={c.website_url} target="_blank" rel="noreferrer"
                                className="font-medium text-xs text-accent hover:underline truncate block"
                                onClick={(e) => e.stopPropagation()}>
                                {c.website_url}
                              </a>
                            </div>
                          )}
                        </div>

                        {/* ── Ações operacionais (botões reais) ── */}
                        <div className="pt-1 border-t border-border/40 space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ações operacionais</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            <ShortcutBtn icon={Shield} label="Gerenciar Acessos"
                              onClick={(e) => { e.stopPropagation(); handleInviteResponsible(c); }} />

                            <ShortcutBtn icon={Users} label="Ver Membros"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate("/admin/membros", {
                                  state: {
                                    contextOrganizationId:   c.id,
                                    contextOrganizationName: c.name,
                                    contextOrganizationType: c.organization_type,
                                    source: "hierarquia",
                                  },
                                });
                              }}
                            />

                            <ShortcutBtn icon={Calendar} label="Agenda"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate("/admin/agenda", {
                                  state: {
                                    contextOrganizationId:   c.id,
                                    contextOrganizationName: c.name,
                                    contextOrganizationType: c.organization_type,
                                  },
                                });
                              }}
                            />

                            <ShortcutBtn icon={Wallet} label="Financeiro"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate("/admin/financeiro", {
                                  state: {
                                    contextOrganizationId:   c.id,
                                    contextOrganizationName: c.name,
                                    contextOrganizationType: c.organization_type,
                                  },
                                });
                              }}
                            />

                            {/* Chat: desabilitado até responsável ser definido */}
                            <ShortcutBtn
                              icon={MessageSquare}
                              label="Chat c/ responsável"
                              disabled={!chatContact}
                              disabledReason={
                                chatContact
                                  ? undefined
                                  : "Defina um responsável pela unidade antes de iniciar o chat."
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                if (chatContact?.userId) {
                                  openChatWithResponsible({
                                    userId: chatContact.userId,
                                    name: chatContact.name,
                                    email: chatContact.email,
                                  });
                                }
                              }}
                            />

                            {canManageChildUnits && (
                              <ShortcutBtn icon={Edit} label="Editar dados"
                                onClick={(e) => { e.stopPropagation(); handleEdit(c); setExpandedId(null); }} />
                            )}
                          </div>
                          {canManageChildUnits && (
                            <button
                              onClick={(e) => { e.stopPropagation(); void handleDelete(c.id); }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-destructive text-xs font-medium hover:bg-destructive/10 transition-colors border border-destructive/30 mt-1">
                              <Trash2 size={13} /> {t("Remover unidade")}
                            </button>
                          )}
                        </div>

                        {/* ── Unidades locais vinculadas (intermediário ativo sob Matriz) ── */}
                        {isMatriz && usesIntermediate && c.organization_type === "setor" && (
                          <div className="mt-3 pt-3 border-t border-border/30">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                <ChurchIcon size={11} /> {localPlural} vinculadas
                              </p>
                              {canManageChildUnits && (
                                <button type="button" onClick={(e) => { e.stopPropagation(); openNewLocalUnit(c); }}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90">
                                  <Plus size={11} /> Nova {localSingular}
                                </button>
                              )}
                            </div>

                            {loadingCongregations[c.id] ? (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 size={12} className="animate-spin" />
                                Carregando {localPlural.toLowerCase()}...
                              </div>
                            ) : !sectorCongregations[c.id] ? (
                              <p className="text-xs text-muted-foreground">Clique para expandir e carregar.</p>
                            ) : sectorCongregations[c.id].length === 0 ? (
                              <div className="text-xs text-muted-foreground flex flex-col items-start gap-2">
                                <span className="flex items-center gap-1.5 text-amber-600">
                                  <AlertCircle size={12} />
                                  Nenhum(a) {localSingular.toLowerCase()} vinculado(a) a este {intermediateSingular.toLowerCase()}.
                                </span>
                                {canManageChildUnits && (
                                  <button type="button" onClick={(e) => { e.stopPropagation(); openNewLocalUnit(c); }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90">
                                    <Plus size={11} /> Criar primeira {localSingular.toLowerCase()}
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {sectorCongregations[c.id].map((cong) => {
                                  const congPastor = responsiblesByOrg[cong.id]?.pastor;
                                  return (
                                    <div key={cong.id} className={`flex items-start justify-between gap-3 rounded-lg px-3 py-2.5 border border-border/40 ${
                                      isCardsRenderProbe ? "bg-background" : "bg-background/60"
                                    }`}>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <p className="text-sm font-medium truncate">{cong.name}</p>
                                          {statusBadge(cong.unit_status)}
                                        </div>
                                        <div className="flex flex-wrap gap-x-3 mt-1">
                                          {cong.city && (
                                            <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                                              <MapPin size={9} /> {cong.city}{cong.state ? `, ${cong.state}` : ""}
                                            </span>
                                          )}
                                          {congPastor ? (
                                            <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                                              <BookOpen size={9} />
                                              {congPastor.status === "pending" ? "Convite pendente: " : ""}
                                              {displayName(congPastor)}
                                            </span>
                                          ) : (
                                            <span className="text-[11px] text-muted-foreground/60 italic flex items-center gap-0.5">
                                              <BookOpen size={9} /> Pastor não definido
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex gap-1 flex-shrink-0">
                                        <button type="button"
                                          onClick={(e) => { e.stopPropagation(); handleInviteResponsible(cong); }}
                                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20">
                                          <Shield size={10} /> Acessos
                                        </button>
                                        <button type="button"
                                          onClick={(e) => { e.stopPropagation(); handleEdit(cong); setExpandedId(null); }}
                                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-secondary text-muted-foreground hover:text-foreground">
                                          <Edit size={10} /> Editar
                                        </button>
                                        <button type="button"
                                          onClick={(e) => { e.stopPropagation(); navigate("/admin/membros", {
                                            state: { contextOrganizationId: cong.id, contextOrganizationName: cong.name,
                                              contextOrganizationType: cong.organization_type, source: "hierarquia" },
                                          }); }}
                                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-secondary text-muted-foreground hover:text-foreground">
                                          <Users size={10} /> Membros
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Fraternas e Agrupamentos (nível estadual/nacional/internacional) ── */}
        {(isConvencaoContext || isNationalContext || isInternationalContext) && (
          <div className="bg-card rounded-xl shadow-executive overflow-hidden">
            <div className="p-4 border-b border-border/40 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <Layers size={15} className="text-accent" />
                  Fraternas e Agrupamentos
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Agrupamentos laterais (fraternas, eventos, grupos regionais). Não são parent de Matriz.
                </p>
              </div>
              {canManageOrganizations && (
                <button
                  onClick={() => setShowFraterna(!showFraterna)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:border-accent/50 hover:bg-accent/5 hover:text-accent transition-all">
                  <Plus size={13} /> Nova fraterna
                </button>
              )}
            </div>

            {showFraterna && (
              <div className="p-4 border-b border-border/30 bg-secondary/20 space-y-3">
                <input value={fraterna.name} onChange={(e) => setFraterna((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Nome da fraterna / agrupamento *"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                <select value={fraterna.affiliation_type} onChange={(e) => setFraterna((f) => ({ ...f, affiliation_type: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
                  <option value="fraterna">Fraterna</option>
                  <option value="regional_group">Grupo Regional</option>
                  <option value="event_group">Grupo de Evento</option>
                  <option value="pastoral_group">Grupo Pastoral</option>
                </select>
                <input value={fraterna.description} onChange={(e) => setFraterna((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Descrição (opcional)"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                <div className="flex gap-2">
                  <button type="button" disabled={savingFraterna} onClick={() => void handleSaveFraterna()}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5">
                    {savingFraterna ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                    Criar fraterna
                  </button>
                  <button type="button" onClick={() => setShowFraterna(false)}
                    className="px-4 py-2 bg-secondary text-foreground rounded-lg text-sm hover:bg-secondary/80">
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {loadingFraternas ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              </div>
            ) : fraternas.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Layers size={36} className="mx-auto mb-2 opacity-25" />
                <p className="text-sm">Nenhuma fraterna ou agrupamento cadastrado.</p>
                <p className="text-xs mt-1">Fraternas são agrupamentos laterais de igrejas, encontros ou eventos convencionais.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {fraternas.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <Layers size={14} className="text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{f.name}</p>
                      {f.description && <p className="text-xs text-muted-foreground truncate">{f.description}</p>}
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground font-semibold shrink-0 capitalize">
                      {f.affiliation_type.replace(/_/g, " ")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Current unit info ── */}
        {church && (
          <div className="bg-card rounded-xl shadow-executive p-5">
            <h2 className="font-medium text-sm mb-3 flex items-center gap-2">
              <ChurchIcon size={16} className="text-accent" /> Unidade atual
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{t("Nome")}</p>
                <p className="font-medium">{church.name}</p>
              </div>
              {church.city && (
                <div>
                  <p className="text-xs text-muted-foreground">{t("Cidade")}</p>
                  <p className="font-medium">{church.city}{church.state ? `, ${church.state}` : ""}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">{currentUnitChildrenLabel()}</p>
                <p className="font-medium">{childOrganizations.length}</p>
              </div>
              {showStructureConfig && (
                <div>
                  <p className="text-xs text-muted-foreground">Nomenclatura configurada</p>
                  <p className="font-medium">
                    {intermediateSingular} / {localSingular}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modal: Nova unidade local ── */}
      {congModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base flex items-center gap-2">
                <ChurchIcon size={16} className="text-accent" /> {`Nova ${localSingular}`}
              </h2>
              <button type="button" onClick={() => setCongModal(null)} className="text-muted-foreground hover:text-foreground p-1">
                <X size={18} />
              </button>
            </div>

            {/* Vínculo destacado */}
            <div className="rounded-lg bg-accent/10 border border-accent/20 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                {parentConnText}:{" "}
                <span className="font-semibold text-foreground">{congModal.sectorName}</span>
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Dados da unidade</p>
              <input value={congForm.name} onChange={(e) => setCongForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={`Nome da ${localSingular.toLowerCase()} *`}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Status operacional</label>
                <select value={congForm.unit_status} onChange={(e) => setCongForm((f) => ({ ...f, unit_status: e.target.value as UnitStatus }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
                  {UNIT_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <MapPin size={11} /> Localização
              </p>
              <div className="grid grid-cols-2 gap-3">
                <input value={congForm.city}  onChange={(e) => setCongForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="Cidade" className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                <input value={congForm.state} onChange={(e) => setCongForm((f) => ({ ...f, state: e.target.value }))}
                  placeholder="Estado" className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                <input value={congForm.zip_code} onChange={(e) => setCongForm((f) => ({ ...f, zip_code: e.target.value }))}
                  placeholder="CEP" className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                <input value={congForm.neighborhood} onChange={(e) => setCongForm((f) => ({ ...f, neighborhood: e.target.value }))}
                  placeholder="Bairro" className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                <input value={congForm.street} onChange={(e) => setCongForm((f) => ({ ...f, street: e.target.value }))}
                  placeholder="Rua" className="col-span-2 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                <input value={congForm.address_number} onChange={(e) => setCongForm((f) => ({ ...f, address_number: e.target.value }))}
                  placeholder="Número" className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                <input value={congForm.address_complement} onChange={(e) => setCongForm((f) => ({ ...f, address_complement: e.target.value }))}
                  placeholder="Complemento" className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Phone size={11} /> Contato
              </p>
              <div className="grid grid-cols-2 gap-3">
                <input value={congForm.phone} onChange={(e) => setCongForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="Telefone" className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                <input value={congForm.email} onChange={(e) => setCongForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="E-mail" type="email" className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
              </div>
            </div>

            <div className="rounded-lg bg-secondary/40 border border-border/30 px-3 py-2.5 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground mb-0.5">Responsáveis</p>
              Após criar, use <strong>Gerenciar Acessos</strong> no card da {localSingular.toLowerCase()} para definir pastor, secretário e tesoureiro.
            </div>

            <div className="flex gap-2 pt-1">
              <button type="button" disabled={savingCong} onClick={() => void handleSaveCongregation()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">
                {savingCong ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {`Criar ${localSingular.toLowerCase()}`}
              </button>
              <button type="button" onClick={() => setCongModal(null)}
                className="px-4 py-2.5 bg-secondary rounded-lg text-sm hover:bg-secondary/80">
                {t("Cancelar")}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
