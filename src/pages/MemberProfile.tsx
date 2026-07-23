import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, User, MapPin, Phone, Mail, Church, FileText, Users, Briefcase, Hash, AlertCircle,
  History, ShieldAlert, Lock, ArrowRightLeft, Plus, Award, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { useLanguage } from "@/hooks/useLanguage";
import { useRole } from "@/hooks/useRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  loadMemberHistory, loadMemberOccurrences, loadMemberOrdinations, loadMemberTransfers,
  createMemberOccurrence, createMemberOrdination, endMemberOrdination, createMemberTransfer,
  updateMemberTransferStatus,
  type MemberHistoryRow, type MemberOccurrenceRow, type MemberOrdinationRow, type MemberTransferRow,
} from "@/lib/memberHistory";
import {
  HISTORY_TYPE_LABELS, OCCURRENCE_TYPES, OCCURRENCE_TYPE_LABELS, SENSITIVE_OCCURRENCE_TYPES,
  OCCURRENCE_STATUS_LABELS, ORDINATION_TYPES, ORDINATION_TYPE_LABELS, TRANSFER_DIRECTIONS,
  TRANSFER_DIRECTION_LABELS, TRANSFER_LOCATION_TYPES, TRANSFER_LOCATION_TYPE_LABELS,
  TRANSFER_STATUS_LABELS, type Visibility,
} from "@/lib/memberHistoryConstants";
import { ECCLESIASTICAL_FUNCTIONS, ADMINISTRATIVE_ROLES } from "@/lib/secretariaConstants";

type MemberProfileData = {
  id: string;
  full_name: string;
  known_name: string | null;
  photo_url: string | null;
  member_code: string | null;
  legacy_code: string | null;
  legacy_registration: string | null;
  legacy_source: string | null;
  status: string;
  member_role: string | null;
  administrative_role: string | null;
  gender: string | null;
  marital_status: string | null;
  birth_date: string | null;
  birth_place: string | null;
  nationality: string | null;
  cpf: string | null;
  rg: string | null;
  education_level: string | null;
  profession: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  // Address
  street: string | null;
  address_number: string | null;
  address_complement: string | null;
  neighborhood: string | null;
  zip_code: string | null;
  city: string | null;
  state: string | null;
  // Eclesial
  baptized_at: string | null;
  baptism_place: string | null;
  holy_spirit_baptism_date: string | null;
  joined_at: string | null;
  admission_type: string | null;
  consecration_date: string | null;
  cgadb_number: string | null;
  // Documents
  civil_document_status: string | null;
  civil_document_type: string | null;
  civil_document_notes: string | null;
  // Family (inline fields)
  father_name: string | null;
  mother_name: string | null;
  spouse_name: string | null;
  // Notes
  notes: string | null;
  // Flags de cadastro incompleto (só a futura importação do legado seta)
  incomplete_registration: boolean;
  cpf_pending: boolean;
  contact_pending: boolean;
  requires_review: boolean;
};

type FamilyMember = {
  id: string;
  relation: string;
  full_name: string;
  birth_date: string | null;
  gender: string | null;
  is_active: boolean;
};

type MemberAddress = {
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
};

/**
 * Erro do PostgREST quando a tabela/coluna ainda não existe no schema cache
 * (migration correspondente não aplicada neste ambiente). Distinto de um
 * erro real de permissão/rede — usado para diferenciar "funcionalidade
 * ainda não disponível" de "algo quebrou".
 */
function isMissingSchemaError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || err.code === "PGRST204" || !!err.message?.startsWith("Could not find the '");
}

type SubOrgOption = { id: string; name: string };

export default function MemberProfile() {
  const { memberId } = useParams<{ memberId: string }>();
  const navigate = useNavigate();
  const { church } = useChurch();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const { hasCapability } = useRole();
  const canConfidential = hasCapability("members.confidential");
  const [member, setMember] = useState<MemberProfileData | null>(null);
  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [addresses, setAddresses] = useState<MemberAddress[]>([]);
  const [loading, setLoading] = useState(true);
  // Erro real (não "tabela ainda não existe") que impediu o carregamento de
  // dados complementares (família/endereços). Exibido de forma visível — o
  // requisito explícito é NUNCA esconder erro real de banco com um
  // try/catch silencioso.
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Fundação histórica institucional (OPERAÇÃO 1) ─────────────────────
  const [history, setHistory] = useState<MemberHistoryRow[]>([]);
  const [occurrences, setOccurrences] = useState<MemberOccurrenceRow[]>([]);
  const [ordinations, setOrdinations] = useState<MemberOrdinationRow[]>([]);
  const [transfers, setTransfers] = useState<MemberTransferRow[]>([]);
  const [subOrgs, setSubOrgs] = useState<SubOrgOption[]>([]);

  const [occDialogOpen, setOccDialogOpen] = useState(false);
  const [ordDialogOpen, setOrdDialogOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [savingSection, setSavingSection] = useState(false);

  const load = useCallback(async () => {
    if (!memberId || !church) return;
    setLoading(true);
    setLoadError(null);

    const { data, error } = await supabase
      .from("members")
      .select("*")
      .eq("id", memberId)
      .eq("organization_id", church.id)
      .single();
    if (error || !data) {
      console.error("[MemberProfile] erro ao carregar membro:", error);
      toast({
        title: t("Membro não encontrado"),
        description: error?.message ?? t("O membro não existe ou você não tem permissão para vê-lo."),
        variant: "destructive",
      });
      navigate("/admin/membros");
      return;
    }
    setMember(data as MemberProfileData);

    // Família (member_family) — tratamento explícito: distingue "tabela
    // ainda não existe neste ambiente" (aviso silencioso, esperado antes da
    // migration ser aplicada) de um erro real de banco/permissão (exibido
    // ao usuário, nunca escondido).
    const famResult = await supabase
      .from("member_family")
      .select("id, relation, full_name, birth_date, gender, is_active")
      .eq("member_id", memberId)
      .eq("is_active", true)
      .order("relation");
    if (famResult.error) {
      if (isMissingSchemaError(famResult.error)) {
        console.warn("[MemberProfile] member_family indisponível neste ambiente:", famResult.error.message);
      } else {
        console.error("[MemberProfile] erro ao carregar família:", famResult.error);
        setLoadError(prev => prev ?? `${t("Erro ao carregar família")}: ${famResult.error!.message}`);
      }
      setFamily([]);
    } else {
      setFamily((famResult.data ?? []) as FamilyMember[]);
    }

    // Endereços adicionais (member_addresses) — mesmo tratamento explícito.
    const addrResult = await supabase
      .from("member_addresses")
      .select("id, address_type, zip_code, street, number, complement, neighborhood, city, state, country, is_primary")
      .eq("member_id", memberId)
      .eq("is_active", true)
      .order("address_type");
    if (addrResult.error) {
      if (isMissingSchemaError(addrResult.error)) {
        console.warn("[MemberProfile] member_addresses indisponível neste ambiente:", addrResult.error.message);
      } else {
        console.error("[MemberProfile] erro ao carregar endereços:", addrResult.error);
        setLoadError(prev => prev ?? `${t("Erro ao carregar endereços")}: ${addrResult.error!.message}`);
      }
      setAddresses([]);
    } else {
      setAddresses((addrResult.data ?? []) as MemberAddress[]);
    }

    // Fundação histórica institucional — mesmo tratamento defensivo: tabela
    // ainda não aplicada neste ambiente = aviso silencioso; erro real = exibido.
    const handleFoundationResult = <T,>(
      label: string,
      result: { rows: T[]; error: { code?: string; message: string } | null },
      setter: (rows: T[]) => void,
    ) => {
      if (result.error) {
        if (isMissingSchemaError(result.error)) {
          console.warn(`[MemberProfile] ${label} indisponível neste ambiente:`, result.error.message);
        } else {
          console.error(`[MemberProfile] erro ao carregar ${label}:`, result.error);
          setLoadError(prev => prev ?? `${t("Erro ao carregar")} ${label}: ${result.error!.message}`);
        }
        setter([]);
      } else {
        setter(result.rows);
      }
    };

    const [historyResult, occResult, ordResult, transferResult] = await Promise.all([
      loadMemberHistory(memberId),
      loadMemberOccurrences(memberId),
      loadMemberOrdinations(memberId),
      loadMemberTransfers(memberId),
    ]);
    handleFoundationResult("histórico institucional", historyResult, setHistory);
    handleFoundationResult("ocorrências", occResult, setOccurrences);
    handleFoundationResult("ordenações", ordResult, setOrdinations);
    handleFoundationResult("transferências", transferResult, setTransfers);

    setLoading(false);
  }, [memberId, church, navigate, t, toast]);

  useEffect(() => { void load(); }, [load]);

  // Unidades internas (matriz + setores + congregações) para o seletor de
  // transferência interna — mesmo padrão de carregamento de Membros.tsx.
  useEffect(() => {
    if (!church) return;
    (async () => {
      const { data: children } = await supabase
        .from("organizations")
        .select("id, name")
        .eq("parent_id", church.id)
        .eq("active", true);
      const childIds = (children ?? []).map((c) => c.id);
      let grandchildren: SubOrgOption[] = [];
      if (childIds.length > 0) {
        const { data: gc } = await supabase
          .from("organizations")
          .select("id, name")
          .in("parent_id", childIds)
          .eq("active", true);
        grandchildren = (gc as SubOrgOption[]) ?? [];
      }
      const all: SubOrgOption[] = [
        { id: church.id, name: church.name },
        ...((children as SubOrgOption[]) ?? []),
        ...grandchildren,
      ].sort((a, b) => a.name.localeCompare(b.name));
      setSubOrgs(all);
    })();
  }, [church]);

  // ── Formulários da fundação histórica institucional ────────────────────
  const [occForm, setOccForm] = useState({
    occurrence_type: "outro" as string,
    occurred_at: new Date().toISOString().slice(0, 10),
    valid_until: "",
    description: "",
    visibility: "normal" as Visibility,
  });
  const [ordForm, setOrdForm] = useState({
    role_or_function: "",
    ordination_type: "nomeacao" as string,
    ordination_date: "",
    start_date: new Date().toISOString().slice(0, 10),
    authority_name: "",
    notes: "",
  });
  const [transferForm, setTransferForm] = useState({
    direction: "recebida" as string,
    origin_type: "interna" as string,
    origin_organization_id: "",
    origin_church_name: "",
    destination_type: "interna" as string,
    destination_organization_id: "",
    destination_church_name: "",
    requested_at: new Date().toISOString().slice(0, 10),
    reason: "",
  });

  const resetOccForm = () => setOccForm({
    occurrence_type: "outro", occurred_at: new Date().toISOString().slice(0, 10),
    valid_until: "", description: "", visibility: "normal",
  });
  const resetOrdForm = () => setOrdForm({
    role_or_function: "", ordination_type: "nomeacao", ordination_date: "",
    start_date: new Date().toISOString().slice(0, 10), authority_name: "", notes: "",
  });
  const resetTransferForm = () => setTransferForm({
    direction: "recebida", origin_type: "interna", origin_organization_id: "",
    origin_church_name: "", destination_type: "interna", destination_organization_id: "",
    destination_church_name: "", requested_at: new Date().toISOString().slice(0, 10), reason: "",
  });

  const handleAddOccurrence = async () => {
    if (!member || !church) return;
    if (!occForm.occurrence_type) {
      toast({ title: t("Selecione o tipo de ocorrência"), variant: "destructive" });
      return;
    }
    setSavingSection(true);
    const { row, error } = await createMemberOccurrence({
      member_id: member.id,
      organization_id: church.id,
      occurrence_type: occForm.occurrence_type,
      occurred_at: occForm.occurred_at,
      valid_until: occForm.valid_until || null,
      description: occForm.description || null,
      status: "registrada",
      visibility: occForm.visibility,
      created_by: user?.id ?? null,
    });
    setSavingSection(false);
    if (error || !row) {
      toast({ title: t("Erro ao registrar ocorrência"), description: error ?? undefined, variant: "destructive" });
      return;
    }
    toast({ title: t("Ocorrência registrada") });
    setOccDialogOpen(false);
    resetOccForm();
    void load();
  };

  const handleAddOrdination = async () => {
    if (!member || !church) return;
    if (!ordForm.role_or_function.trim()) {
      toast({ title: t("Informe a função ou cargo"), variant: "destructive" });
      return;
    }
    setSavingSection(true);
    const { row, error } = await createMemberOrdination({
      member_id: member.id,
      organization_id: church.id,
      role_or_function: ordForm.role_or_function.trim(),
      ordination_type: ordForm.ordination_type,
      ordination_date: ordForm.ordination_date || null,
      start_date: ordForm.start_date,
      authority_name: ordForm.authority_name || null,
      notes: ordForm.notes || null,
      created_by: user?.id ?? null,
    });
    setSavingSection(false);
    if (error || !row) {
      toast({ title: t("Erro ao registrar ordenação/nomeação"), description: error ?? undefined, variant: "destructive" });
      return;
    }
    toast({ title: t("Ordenação/nomeação registrada") });
    setOrdDialogOpen(false);
    resetOrdForm();
    void load();
  };

  const handleEndOrdination = async (row: MemberOrdinationRow) => {
    const { error } = await endMemberOrdination(row.id, new Date().toISOString().slice(0, 10));
    if (error) {
      toast({ title: t("Erro ao encerrar função"), description: error, variant: "destructive" });
      return;
    }
    toast({ title: t("Função encerrada") });
    void load();
  };

  const handleAddTransfer = async () => {
    if (!member || !church) return;
    setSavingSection(true);
    const { row, error } = await createMemberTransfer({
      member_id: member.id,
      organization_id: church.id,
      direction: transferForm.direction,
      origin_type: transferForm.origin_type,
      origin_organization_id: transferForm.origin_type === "interna" ? (transferForm.origin_organization_id || null) : null,
      origin_church_name: transferForm.origin_type === "externa" ? (transferForm.origin_church_name || null) : null,
      destination_type: transferForm.destination_type,
      destination_organization_id: transferForm.destination_type === "interna" ? (transferForm.destination_organization_id || null) : null,
      destination_church_name: transferForm.destination_type === "externa" ? (transferForm.destination_church_name || null) : null,
      requested_at: transferForm.requested_at || null,
      reason: transferForm.reason || null,
      status: "solicitada",
      requested_by: user?.id ?? null,
    });
    setSavingSection(false);
    if (error || !row) {
      toast({ title: t("Erro ao registrar transferência"), description: error ?? undefined, variant: "destructive" });
      return;
    }
    toast({ title: t("Transferência registrada") });
    setTransferDialogOpen(false);
    resetTransferForm();
    void load();
  };

  const handleAdvanceTransferStatus = async (row: MemberTransferRow, nextStatus: string) => {
    const dates: { approved_at?: string; completed_at?: string } = {};
    const today = new Date().toISOString().slice(0, 10);
    if (nextStatus === "aprovada") dates.approved_at = today;
    if (nextStatus === "concluida") dates.completed_at = today;
    const { error } = await updateMemberTransferStatus(row.id, nextStatus, dates);
    if (error) {
      toast({ title: t("Erro ao atualizar transferência"), description: error, variant: "destructive" });
      return;
    }
    toast({ title: t("Transferência atualizada") });
    void load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!member) return null;

  const relationLabel = (relation: string): string => {
    const labels: Record<string, string> = {
      pai: "Pai", mae: "Mãe", esposo: "Esposo", esposa: "Esposa",
      filho: "Filho", filha: "Filha", enteado: "Enteado(a)",
      dependente: "Dependente", responsavel: "Responsável", outro: "Outro",
    };
    return labels[relation] ?? relation;
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/membros")}>
          <ArrowLeft size={20} />
        </Button>
        <div className="flex items-center gap-3">
          {member.photo_url ? (
            <img src={member.photo_url} alt="" className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <div className="h-12 w-12 rounded-full bg-primary/15 flex items-center justify-center">
              <User size={22} className="text-primary" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-serif">{member.full_name}</h1>
            {member.known_name && <p className="text-sm text-muted-foreground">"{member.known_name}"</p>}
          </div>
        </div>
        <Badge variant={member.status === "Ativo" ? "default" : "secondary"} className="ml-auto">
          {member.status}
        </Badge>
      </div>

      {/* Erro real ao carregar dados complementares — nunca escondido */}
      {loadError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-2 text-sm text-destructive py-3">
            <AlertCircle size={16} className="flex-shrink-0" />
            {loadError}
          </CardContent>
        </Card>
      )}

      {/* Dados Pessoais */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><User size={18} />{t("Dados Pessoais")}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <InfoRow label={t("Nome completo")} value={member.full_name} />
          <InfoRow label={t("Nome conhecido")} value={member.known_name} />
          <InfoRow label={t("Sexo")} value={member.gender} />
          <InfoRow label={t("Estado civil")} value={member.marital_status} />
          <InfoRow label={t("Data de nascimento")} value={member.birth_date} />
          <InfoRow label={t("Naturalidade")} value={member.birth_place} />
          <InfoRow label={t("Nacionalidade")} value={member.nationality} />
          <InfoRow label={t("Escolaridade")} value={member.education_level} />
          <InfoRow label={t("Profissão")} value={member.profession} />
          <InfoRow label={t("CPF")} value={member.cpf} mono />
          <InfoRow label={t("RG")} value={member.rg} />
        </CardContent>
      </Card>

      {/* Identificadores */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Hash size={18} />{t("Identificadores")}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <InfoRow label={t("Código Ecclesia")} value={member.member_code} mono />
          <InfoRow label={t("Código legado")} value={member.legacy_code} mono />
          <InfoRow label={t("Matrícula antiga")} value={member.legacy_registration} mono />
          <InfoRow label={t("Origem legado")} value={member.legacy_source} />
        </CardContent>
      </Card>

      {/* Contato */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Phone size={18} />{t("Contato")}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <InfoRow label={t("Telefone")} value={member.phone} icon={<Phone size={14} />} />
          <InfoRow label="WhatsApp" value={member.whatsapp} icon={<Phone size={14} />} />
          <InfoRow label="E-mail" value={member.email} icon={<Mail size={14} />} className="sm:col-span-2" />
        </CardContent>
      </Card>

      {/* Endereço */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><MapPin size={18} />{t("Endereço")}</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{t("Residencial (principal)")}</p>
            {formatAddress(member) || <span className="text-muted-foreground">{t("Nenhum endereço cadastrado")}</span>}
          </div>
          {addresses.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border/50">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("Outros endereços")}</p>
              {addresses.map(a => (
                <div key={a.id} className="flex items-start gap-2">
                  <Badge variant="outline" className="text-xs flex-shrink-0">{ADDRESS_TYPE_LABELS[a.address_type] ?? a.address_type}</Badge>
                  <span>
                    {[a.street, a.number, a.complement, a.neighborhood, a.city, a.state, a.zip_code].filter(Boolean).join(", ") || t("Sem detalhes")}
                    {a.is_primary && <span className="text-xs text-muted-foreground"> · {t("principal")}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dados Eclesiásticos */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Church size={18} />{t("Dados Eclesiásticos")}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <InfoRow label={t("Função eclesiástica")} value={member.member_role} />
          <InfoRow label={t("Cargo administrativo")} value={member.administrative_role} />
          <InfoRow label={t("Data de admissão")} value={member.joined_at} />
          <InfoRow label={t("Forma de admissão")} value={member.admission_type} />
          <InfoRow label={t("Batismo nas águas")} value={member.baptized_at} />
          <InfoRow label={t("Local do batismo")} value={member.baptism_place} />
          <InfoRow label={t("Batismo c/ Espírito Santo")} value={member.holy_spirit_baptism_date} />
          <InfoRow label={t("Consagração")} value={member.consecration_date} />
          <InfoRow label={t("Nº CGADB")} value={member.cgadb_number} mono />
        </CardContent>
      </Card>

      {/* Documentação Civil */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileText size={18} />{t("Documentação Civil")}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <InfoRow label={t("Documento")} value={member.civil_document_type} />
          <InfoRow label={t("Status")} value={member.civil_document_status} />
          <InfoRow label={t("Observações")} value={member.civil_document_notes} className="sm:col-span-2" />
        </CardContent>
      </Card>

      {/* Família */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Users size={18} />{t("Família")}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {/* Inline fields (legacy) */}
          {(member.father_name || member.mother_name || member.spouse_name) && (
            <div className="space-y-1 mb-3 pb-3 border-b border-border/50">
              {member.father_name && <p><span className="text-muted-foreground">{t("Pai")}:</span> {member.father_name}</p>}
              {member.mother_name && <p><span className="text-muted-foreground">{t("Mãe")}:</span> {member.mother_name}</p>}
              {member.spouse_name && <p><span className="text-muted-foreground">{t("Cônjuge")}:</span> {member.spouse_name}</p>}
            </div>
          )}
          {/* Relational family */}
          {family.length === 0 && !member.father_name && !member.mother_name && !member.spouse_name && (
            <p className="text-muted-foreground">{t("Nenhum familiar cadastrado")}</p>
          )}
          {family.map((f) => (
            <div key={f.id} className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">{relationLabel(f.relation)}</Badge>
              <span>{f.full_name}</span>
              {f.birth_date && <span className="text-xs text-muted-foreground ml-auto">{f.birth_date}</span>}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Função / Cargo */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Briefcase size={18} />{t("Função / Cargo")}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <InfoRow label={t("Função eclesiástica")} value={member.member_role} />
          <InfoRow label={t("Cargo administrativo")} value={member.administrative_role} />
        </CardContent>
      </Card>

      {/* Histórico Institucional (timeline compartilhada) */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><History size={18} />{t("Histórico Institucional")}</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {history.length === 0 ? (
            <p className="text-muted-foreground">{t("Nenhum evento registrado ainda.")}</p>
          ) : (
            <ol className="relative border-l border-border/60 pl-4 space-y-4">
              {history.map((h) => (
                <li key={h.id} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {HISTORY_TYPE_LABELS[h.history_type as keyof typeof HISTORY_TYPE_LABELS] ?? h.history_type}
                    </Badge>
                    {h.visibility === "confidential" && (
                      <Badge variant="secondary" className="text-xs gap-1"><Lock size={10} />{t("Confidencial")}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(h.occurred_at).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  <p className="font-medium mt-0.5">{h.title}</p>
                  {h.description && <p className="text-muted-foreground text-xs mt-0.5">{h.description}</p>}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Ocorrências */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2"><ShieldAlert size={18} />{t("Ocorrências")}</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setOccDialogOpen(true)}>
            <Plus size={14} className="mr-1" />{t("Registrar")}
          </Button>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          {occurrences.length === 0 ? (
            <p className="text-muted-foreground">{t("Nenhuma ocorrência registrada.")}</p>
          ) : (
            occurrences.map((o) => (
              <div key={o.id} className="flex items-start gap-2 pb-2 border-b border-border/40 last:border-0 last:pb-0">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {OCCURRENCE_TYPE_LABELS[o.occurrence_type as keyof typeof OCCURRENCE_TYPE_LABELS] ?? o.occurrence_type}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {OCCURRENCE_STATUS_LABELS[o.status as keyof typeof OCCURRENCE_STATUS_LABELS] ?? o.status}
                    </Badge>
                    {o.visibility === "confidential" && (
                      <Badge variant="secondary" className="text-xs gap-1"><Lock size={10} />{t("Confidencial")}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(o.occurred_at).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  {o.description && <p className="text-xs text-muted-foreground mt-1">{o.description}</p>}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Ordenações e Funções */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2"><Award size={18} />{t("Ordenações e Funções")}</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setOrdDialogOpen(true)}>
            <Plus size={14} className="mr-1" />{t("Registrar")}
          </Button>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          {ordinations.length === 0 ? (
            <p className="text-muted-foreground">{t("Nenhuma ordenação ou nomeação registrada.")}</p>
          ) : (
            ordinations.map((o) => (
              <div key={o.id} className="flex items-start gap-2 pb-2 border-b border-border/40 last:border-0 last:pb-0">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{o.role_or_function}</span>
                    <Badge variant={o.status === "ativo" ? "default" : "secondary"} className="text-xs">
                      {o.status === "ativo" ? t("Ativo") : o.status === "encerrado" ? t("Encerrado") : t("Revogado")}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ORDINATION_TYPE_LABELS[o.ordination_type as keyof typeof ORDINATION_TYPE_LABELS] ?? o.ordination_type}
                    {" · "}{new Date(o.start_date).toLocaleDateString("pt-BR")}
                    {o.end_date && ` – ${new Date(o.end_date).toLocaleDateString("pt-BR")}`}
                  </p>
                  {o.authority_name && <p className="text-xs text-muted-foreground">{t("Autoridade")}: {o.authority_name}</p>}
                </div>
                {o.status === "ativo" && (
                  <Button size="sm" variant="ghost" onClick={() => handleEndOrdination(o)}>
                    {t("Encerrar")}
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Transferências */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2"><ArrowRightLeft size={18} />{t("Transferências")}</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setTransferDialogOpen(true)}>
            <Plus size={14} className="mr-1" />{t("Registrar")}
          </Button>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          {transfers.length === 0 ? (
            <p className="text-muted-foreground">{t("Nenhuma transferência registrada.")}</p>
          ) : (
            transfers.map((tr) => (
              <div key={tr.id} className="flex items-start gap-2 pb-2 border-b border-border/40 last:border-0 last:pb-0">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {TRANSFER_DIRECTION_LABELS[tr.direction as keyof typeof TRANSFER_DIRECTION_LABELS] ?? tr.direction}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {TRANSFER_STATUS_LABELS[tr.status as keyof typeof TRANSFER_STATUS_LABELS] ?? tr.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {tr.direction === "recebida"
                      ? `${t("Origem")}: ${tr.origin_church_name || subOrgs.find(s => s.id === tr.origin_organization_id)?.name || "—"}`
                      : `${t("Destino")}: ${tr.destination_church_name || subOrgs.find(s => s.id === tr.destination_organization_id)?.name || "—"}`}
                  </p>
                  {tr.reason && <p className="text-xs text-muted-foreground">{tr.reason}</p>}
                </div>
                {tr.status !== "concluida" && tr.status !== "rejeitada" && tr.status !== "cancelada" && (
                  <div className="flex gap-1">
                    {tr.status === "solicitada" && (
                      <Button size="sm" variant="ghost" onClick={() => handleAdvanceTransferStatus(tr, "aprovada")}>
                        {t("Aprovar")}
                      </Button>
                    )}
                    {tr.status === "aprovada" && (
                      <Button size="sm" variant="ghost" onClick={() => handleAdvanceTransferStatus(tr, "concluida")}>
                        <CheckCircle2 size={14} className="mr-1" />{t("Concluir")}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Observações */}
      {member.notes && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileText size={18} />{t("Observações")}</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap text-muted-foreground">
            {member.notes}
          </CardContent>
        </Card>
      )}

      {/* Flags de cadastro incompleto (apenas para staff) */}
      {(member.incomplete_registration || member.cpf_pending || member.contact_pending || member.requires_review) && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader><CardTitle className="flex items-center gap-2 text-amber-700"><AlertCircle size={18} />{t("Atenção: cadastro pendente")}</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {member.incomplete_registration && <p className="flex items-center gap-2">⚠️ {t("Cadastro incompleto (origem legada)")}</p>}
            {member.cpf_pending && <p className="flex items-center gap-2">⚠️ {t("CPF pendente")}</p>}
            {member.contact_pending && <p className="flex items-center gap-2">⚠️ {t("Contato pendente")}</p>}
            {member.requires_review && <p className="flex items-center gap-2">⚠️ {t("Requer revisão da Secretaria")}</p>}
          </CardContent>
        </Card>
      )}

      {/* Dialog: nova ocorrência */}
      <Dialog open={occDialogOpen} onOpenChange={(open) => { setOccDialogOpen(open); if (!open) resetOccForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Registrar ocorrência")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <FormSelectLabeled
              label={t("Tipo de ocorrência")}
              value={occForm.occurrence_type}
              onChange={(v) => setOccForm(f => ({
                ...f,
                occurrence_type: v,
                visibility: SENSITIVE_OCCURRENCE_TYPES.includes(v as typeof SENSITIVE_OCCURRENCE_TYPES[number]) && canConfidential
                  ? "confidential" : f.visibility,
              }))}
              options={OCCURRENCE_TYPES.map((o) => ({ value: o, label: OCCURRENCE_TYPE_LABELS[o] }))}
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <FormDateField label={t("Data")} value={occForm.occurred_at} onChange={(v) => setOccForm(f => ({ ...f, occurred_at: v }))} />
              <FormDateField label={t("Válido até")} value={occForm.valid_until} onChange={(v) => setOccForm(f => ({ ...f, valid_until: v }))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">{t("Descrição")}</label>
              <Textarea value={occForm.description} onChange={(e) => setOccForm(f => ({ ...f, description: e.target.value }))} rows={3} />
            </div>
            {canConfidential ? (
              <FormSelectLabeled
                label={t("Visibilidade")}
                value={occForm.visibility}
                onChange={(v) => setOccForm(f => ({ ...f, visibility: v as Visibility }))}
                options={[
                  { value: "normal", label: t("Visível à secretaria") },
                  { value: "confidential", label: t("Confidencial (somente governança)") },
                ]}
              />
            ) : (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Lock size={12} />{t("Você não tem permissão para registrar ocorrências confidenciais — esta ocorrência será visível à secretaria.")}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOccDialogOpen(false)}>{t("Cancelar")}</Button>
            <Button onClick={handleAddOccurrence} disabled={savingSection}>{t("Salvar")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: nova ordenação/nomeação */}
      <Dialog open={ordDialogOpen} onOpenChange={(open) => { setOrdDialogOpen(open); if (!open) resetOrdForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Registrar ordenação ou nomeação")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <FormSelectLabeled
              label={t("Função ou cargo")}
              value={ordForm.role_or_function}
              onChange={(v) => setOrdForm(f => ({ ...f, role_or_function: v }))}
              options={[...ECCLESIASTICAL_FUNCTIONS, ...ADMINISTRATIVE_ROLES].map((r) => ({ value: r, label: r }))}
              required
            />
            <FormSelectLabeled
              label={t("Tipo")}
              value={ordForm.ordination_type}
              onChange={(v) => setOrdForm(f => ({ ...f, ordination_type: v }))}
              options={ORDINATION_TYPES.map((o) => ({ value: o, label: ORDINATION_TYPE_LABELS[o] }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormDateField label={t("Data de ordenação")} value={ordForm.ordination_date} onChange={(v) => setOrdForm(f => ({ ...f, ordination_date: v }))} />
              <FormDateField label={t("Início")} value={ordForm.start_date} onChange={(v) => setOrdForm(f => ({ ...f, start_date: v }))} required />
            </div>
            <FormTextField label={t("Autoridade responsável")} value={ordForm.authority_name} onChange={(v) => setOrdForm(f => ({ ...f, authority_name: v }))} />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">{t("Observações")}</label>
              <Textarea value={ordForm.notes} onChange={(e) => setOrdForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOrdDialogOpen(false)}>{t("Cancelar")}</Button>
            <Button onClick={handleAddOrdination} disabled={savingSection}>{t("Salvar")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: nova transferência */}
      <Dialog open={transferDialogOpen} onOpenChange={(open) => { setTransferDialogOpen(open); if (!open) resetTransferForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Registrar transferência")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <FormSelectLabeled
              label={t("Direção")}
              value={transferForm.direction}
              onChange={(v) => setTransferForm(f => ({ ...f, direction: v }))}
              options={TRANSFER_DIRECTIONS.map((d) => ({ value: d, label: TRANSFER_DIRECTION_LABELS[d] }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormSelectLabeled
                label={transferForm.direction === "recebida" ? t("Tipo de origem") : t("Tipo de destino")}
                value={transferForm.direction === "recebida" ? transferForm.origin_type : transferForm.destination_type}
                onChange={(v) => setTransferForm(f => transferForm.direction === "recebida" ? { ...f, origin_type: v } : { ...f, destination_type: v })}
                options={TRANSFER_LOCATION_TYPES.map((l) => ({ value: l, label: TRANSFER_LOCATION_TYPE_LABELS[l] }))}
              />
              {(transferForm.direction === "recebida" ? transferForm.origin_type : transferForm.destination_type) === "interna" ? (
                <FormSelectLabeled
                  label={transferForm.direction === "recebida" ? t("Unidade de origem") : t("Unidade de destino")}
                  value={transferForm.direction === "recebida" ? transferForm.origin_organization_id : transferForm.destination_organization_id}
                  onChange={(v) => setTransferForm(f => transferForm.direction === "recebida" ? { ...f, origin_organization_id: v } : { ...f, destination_organization_id: v })}
                  options={subOrgs.map((s) => ({ value: s.id, label: s.name }))}
                />
              ) : (
                <FormTextField
                  label={transferForm.direction === "recebida" ? t("Nome da igreja de origem") : t("Nome da igreja de destino")}
                  value={transferForm.direction === "recebida" ? transferForm.origin_church_name : transferForm.destination_church_name}
                  onChange={(v) => setTransferForm(f => transferForm.direction === "recebida" ? { ...f, origin_church_name: v } : { ...f, destination_church_name: v })}
                />
              )}
            </div>
            <FormDateField label={t("Data da solicitação")} value={transferForm.requested_at} onChange={(v) => setTransferForm(f => ({ ...f, requested_at: v }))} />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">{t("Motivo / observação")}</label>
              <Textarea value={transferForm.reason} onChange={(e) => setTransferForm(f => ({ ...f, reason: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTransferDialogOpen(false)}>{t("Cancelar")}</Button>
            <Button onClick={handleAddTransfer} disabled={savingSection}>{t("Salvar")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ label, value, icon, mono, className }: {
  label: string;
  value: string | null | undefined;
  icon?: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  if (!value) return null;
  return (
    <div className={className}>
      <span className="text-muted-foreground">{icon} {label}</span>
      <p className={`mt-0.5 ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
    </div>
  );
}

function FormSelectLabeled({ label, value, onChange, options, required }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">— {"Selecionar"} —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function FormTextField({ label, value, onChange, required }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}

function FormDateField({ label, value, onChange, required }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}

function formatAddress(m: MemberProfileData): string | null {
  // BUG corrigido: a versão original referenciava `m.complement`, campo que
  // nunca existiu em MemberProfileData (o campo real é `address_complement`)
  // — o complemento do endereço residencial nunca era exibido.
  const parts = [m.street, m.address_number, m.address_complement, m.neighborhood, m.city, m.state, m.zip_code].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

const ADDRESS_TYPE_LABELS: Record<string, string> = {
  residencial: "Residencial", comercial: "Comercial",
  correspondencia: "Correspondência", anterior: "Anterior", outro: "Outro",
};
