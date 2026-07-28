import { useCallback, useEffect, useMemo, useState } from "react";
import { Award, Eye, FilePlus2, Loader2, Pencil, Search, Send, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/AdminLayout";
import { CertificateDocument } from "@/components/secretaria/CertificateDocument";
import { SecretariaMemberPicker } from "@/components/secretaria/SecretariaMemberPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useChurch } from "@/hooks/useChurchContext";
import {
  CERTIFICATE_TYPE_LABELS,
  createInstitutionalCertificate,
  issueInstitutionalCertificate,
  listAcademicCertificateCandidates,
  listInstitutionalCertificates,
  listMemberFamily,
  revokeInstitutionalCertificate,
  updateInstitutionalCertificate,
  type AcademicCertificateCandidate,
  type CertificateType,
  type FamilyMemberCertificateOption,
  type InstitutionalCertificate,
  type SecretariaMember,
} from "@/lib/officialDocuments";

const MANUAL_TYPES: CertificateType[] = [
  "apresentacao_crianca", "batismo_aguas", "casamento", "ministerial",
];

const STATUS_LABEL: Record<InstitutionalCertificate["status"], string> = {
  rascunho: "Rascunho",
  emitido: "Emitido",
  revogado: "Revogado",
};

export default function Certificados() {
  const { church, loading: churchLoading } = useChurch();
  const [certificates, setCertificates] = useState<InstitutionalCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<InstitutionalCertificate | null>(null);
  const [editing, setEditing] = useState<InstitutionalCertificate | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!church?.id) return;
    setLoading(true);
    const result = await listInstitutionalCertificates(church.id);
    setCertificates(result.data);
    setError(result.error?.message ?? null);
    setLoading(false);
  }, [church?.id]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    if (!term) return certificates;
    return certificates.filter((certificate) =>
      [certificate.recipient_name, certificate.secondary_recipient_name, certificate.title, certificate.certificate_number]
        .some((value) => value?.toLocaleLowerCase("pt-BR").includes(term)),
    );
  }, [certificates, query]);

  const issue = async (certificate: InstitutionalCertificate) => {
    setBusyId(certificate.id);
    const result = await issueInstitutionalCertificate(certificate.id);
    if (result.error) toast.error(result.error.message);
    else {
      toast.success("Certificado numerado, registrado e emitido.");
      await load();
    }
    setBusyId(null);
  };

  const revoke = async (certificate: InstitutionalCertificate) => {
    const reason = window.prompt("Informe o motivo da revogação:");
    if (!reason?.trim()) return;
    setBusyId(certificate.id);
    const revokeError = await revokeInstitutionalCertificate(certificate.id, reason);
    if (revokeError) toast.error(revokeError.message);
    else {
      toast.success("Certificado revogado. O QR continuará exibindo o estado real do documento.");
      await load();
    }
    setBusyId(null);
  };

  if (churchLoading || !church) {
    return <AdminLayout><p className="py-16 text-center text-sm text-muted-foreground">Carregando organização…</p></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h1 className="flex items-center gap-2 font-serif text-2xl sm:text-3xl"><Award /> Central de Certificados</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Um modelo institucional para certificados eclesiásticos, cursos, Discipulado e Teologia — com a identidade visual configurada pela igreja.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}><FilePlus2 size={16} className="mr-2" /> Novo certificado</Button>
        </div>

        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar pessoa, tipo ou número do certificado…"
            className="w-full rounded-xl border border-input bg-background py-2.5 pl-10 pr-3 text-sm"
          />
        </div>

        {loading ? (
          <p className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="animate-spin" /> Carregando certificados…</p>
        ) : error ? (
          <Card><CardContent className="py-12 text-center text-destructive">{error}</CardContent></Card>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="py-16 text-center"><Award className="mx-auto mb-3 text-muted-foreground" /><p className="font-semibold">Nenhum certificado encontrado</p><p className="mt-1 text-sm text-muted-foreground">Crie um certificado manual ou emita a partir de uma conclusão acadêmica real.</p></CardContent></Card>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {filtered.map((certificate) => (
              <Card key={certificate.id}>
                <CardContent className="flex h-full flex-col gap-4 p-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{certificate.recipient_name}</p>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{STATUS_LABEL[certificate.status]}</span>
                    </div>
                    <p className="mt-1 text-sm">{CERTIFICATE_TYPE_LABELS[certificate.certificate_type]}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {certificate.course_name ? `${certificate.course_name} • ` : ""}
                      {new Date(`${certificate.event_date}T12:00:00`).toLocaleDateString("pt-BR")}
                      {certificate.certificate_number ? ` • ${certificate.certificate_number}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setSelected(certificate)}><Eye size={15} className="mr-1" /> Visualizar</Button>
                    {certificate.status !== "revogado" && (
                      <Button size="sm" variant="outline" onClick={() => setEditing(certificate)}><Pencil size={15} className="mr-1" /> Editar</Button>
                    )}
                    {certificate.status === "rascunho" && (
                      <Button size="sm" disabled={busyId === certificate.id} onClick={() => void issue(certificate)}><Send size={15} className="mr-1" /> Emitir</Button>
                    )}
                    {certificate.status === "emitido" && (
                      <Button size="sm" variant="ghost" disabled={busyId === certificate.id} onClick={() => void revoke(certificate)}><ShieldX size={15} className="mr-1" /> Revogar</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <CreateCertificateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        organizationId={church.id}
        defaultLocation={[church.city, church.state].filter(Boolean).join(" - ")}
        defaultSigner={church.pastor_president_name || ""}
        onCreated={load}
      />
      {editing && (
        <EditCertificateDialog
          key={editing.id}
          certificate={editing}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          onUpdated={load}
        />
      )}
      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-7xl">
          <DialogHeader><DialogTitle>{selected?.title}</DialogTitle><DialogDescription>Pré-visualização do documento oficial em formato A4 paisagem.</DialogDescription></DialogHeader>
          {selected && selected.status !== "revogado" && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(selected);
                  setSelected(null);
                }}
              >
                <Pencil size={15} className="mr-1" /> Editar certificado
              </Button>
            </div>
          )}
          {selected && (
            <CertificateDocument
              certificate={selected}
              branding={{
                name: church.name,
                logoUrl: church.logo_url,
                city: church.city,
                state: church.state,
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function EditCertificateDialog({
  certificate,
  open,
  onOpenChange,
  onUpdated,
}: {
  certificate: InstitutionalCertificate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => Promise<void>;
}) {
  const [recipientName, setRecipientName] = useState(certificate.recipient_name);
  const [secondaryName, setSecondaryName] = useState(certificate.secondary_recipient_name || "");
  const [eventDate, setEventDate] = useState(certificate.event_date.slice(0, 10));
  const [location, setLocation] = useState(certificate.location || "");
  const [courseName, setCourseName] = useState(certificate.course_name || "");
  const [workloadHours, setWorkloadHours] = useState(
    certificate.workload_hours == null ? "" : String(certificate.workload_hours),
  );
  const [periodStart, setPeriodStart] = useState(certificate.period_start?.slice(0, 10) || "");
  const [periodEnd, setPeriodEnd] = useState(certificate.period_end?.slice(0, 10) || "");
  const [bodyText, setBodyText] = useState(certificate.body_text || "");
  const [signerName, setSignerName] = useState(certificate.signer_name || "");
  const [signerRole, setSignerRole] = useState(certificate.signer_role || "Pastor Presidente");
  const [secondSignerName, setSecondSignerName] = useState(certificate.second_signer_name || "");
  const [secondSignerRole, setSecondSignerRole] = useState(certificate.second_signer_role || "Secretaria da Igreja");
  const [correctionReason, setCorrectionReason] = useState("");
  const [saving, setSaving] = useState(false);
  const isIssued = certificate.status === "emitido";
  const isAcademic = certificate.certificate_type === "curso_discipulado"
    || certificate.certificate_type === "formacao_teologica";

  const submit = async () => {
    if (!recipientName.trim()) return toast.error("Informe o nome que deve aparecer no certificado.");
    if (certificate.certificate_type === "casamento" && !secondaryName.trim()) {
      return toast.error("Informe o nome do cônjuge.");
    }
    if (!eventDate) return toast.error("Informe a data do ato ou da conclusão.");
    if (isIssued && !correctionReason.trim()) {
      return toast.error("Informe o motivo da correção do certificado emitido.");
    }

    setSaving(true);
    const updateError = await updateInstitutionalCertificate({
      certificateId: certificate.id,
      recipientName: recipientName.trim(),
      secondaryRecipientName: secondaryName.trim() || undefined,
      eventDate,
      location: location.trim() || undefined,
      courseName: courseName.trim() || undefined,
      workloadHours: workloadHours.trim() ? Number(workloadHours) : undefined,
      periodStart: periodStart || undefined,
      periodEnd: periodEnd || undefined,
      bodyText: bodyText.trim() || undefined,
      signerName: signerName.trim() || undefined,
      signerRole: signerRole.trim() || undefined,
      secondSignerName: secondSignerName.trim() || undefined,
      secondSignerRole: secondSignerRole.trim() || undefined,
      correctionReason: correctionReason.trim() || undefined,
    });
    setSaving(false);
    if (updateError) return toast.error(updateError.message);

    toast.success(isIssued
      ? "Certificado corrigido. Número e QR Code foram preservados."
      : "Rascunho atualizado.");
    onOpenChange(false);
    await onUpdated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isIssued ? "Corrigir certificado emitido" : "Editar certificado"}</DialogTitle>
          <DialogDescription>
            {isIssued
              ? `O certificado ${certificate.certificate_number} manterá o mesmo número e QR Code. A versão anterior ficará registrada no histórico.`
              : "Revise os dados antes de emitir o documento oficial."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <span className="font-medium">{CERTIFICATE_TYPE_LABELS[certificate.certificate_type]}</span>
            <span className="ml-2 text-muted-foreground">Revisão {certificate.revision || 1}</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome no certificado" value={recipientName} onChange={setRecipientName} />
            {certificate.certificate_type === "casamento" && (
              <Field label="Nome do cônjuge" value={secondaryName} onChange={setSecondaryName} />
            )}
            <label className="text-sm">
              Data do ato/conclusão
              <input
                type="date"
                value={eventDate}
                onChange={(event) => setEventDate(event.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background p-2"
              />
            </label>
            <Field label="Local" value={location} onChange={setLocation} />
          </div>

          {isAcademic && (
            <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
              <Field label="Curso/formação" value={courseName} onChange={setCourseName} />
              <label className="text-sm">
                Carga horária
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={workloadHours}
                  onChange={(event) => setWorkloadHours(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background p-2"
                />
              </label>
              <label className="text-sm">
                Início do período
                <input
                  type="date"
                  value={periodStart}
                  onChange={(event) => setPeriodStart(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background p-2"
                />
              </label>
              <label className="text-sm">
                Fim do período
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(event) => setPeriodEnd(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background p-2"
                />
              </label>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Responsável pela assinatura" value={signerName} onChange={setSignerName} />
            <Field label="Função do responsável" value={signerRole} onChange={setSignerRole} />
            <Field label="Segunda assinatura" value={secondSignerName} onChange={setSecondSignerName} />
            <Field label="Função da segunda assinatura" value={secondSignerRole} onChange={setSecondSignerRole} />
          </div>

          <label className="block text-sm">
            Texto personalizado
            <textarea
              value={bodyText}
              onChange={(event) => setBodyText(event.target.value)}
              placeholder="Se vazio, será usado o texto institucional padrão."
              className="mt-1 min-h-24 w-full rounded-lg border border-input bg-background p-2"
            />
          </label>

          {isIssued && (
            <label className="block text-sm">
              Motivo da correção
              <textarea
                value={correctionReason}
                onChange={(event) => setCorrectionReason(event.target.value)}
                placeholder="Ex.: correção da data do batismo informada pela secretaria."
                className="mt-1 min-h-20 w-full rounded-lg border border-input bg-background p-2"
              />
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={saving} onClick={() => void submit()}>
            {saving && <Loader2 className="mr-2 animate-spin" size={16} />}
            {isIssued ? "Salvar correção" : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateCertificateDialog({
  open,
  onOpenChange,
  organizationId,
  defaultLocation,
  defaultSigner,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  defaultLocation: string;
  defaultSigner: string;
  onCreated: () => Promise<void>;
}) {
  const [type, setType] = useState<CertificateType>("batismo_aguas");
  const [member, setMember] = useState<SecretariaMember | null>(null);
  const [family, setFamily] = useState<FamilyMemberCertificateOption[]>([]);
  const [familyMemberId, setFamilyMemberId] = useState("");
  const [academic, setAcademic] = useState<AcademicCertificateCandidate[]>([]);
  const [academicId, setAcademicId] = useState("");
  const [secondaryName, setSecondaryName] = useState("");
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState(defaultLocation);
  const [bodyText, setBodyText] = useState("");
  const [signerName, setSignerName] = useState(defaultSigner);
  const [signerRole, setSignerRole] = useState("Pastor Presidente");
  const [secondSignerName, setSecondSignerName] = useState("");
  const [secondSignerRole, setSecondSignerRole] = useState("Secretaria da Igreja");
  const [saving, setSaving] = useState(false);

  const isAcademic = type === "curso_discipulado" || type === "formacao_teologica";
  const selectedAcademic = academic.find((candidate) => candidate.enrollment_id === academicId) ?? null;

  useEffect(() => {
    if (!open) return;
    void listAcademicCertificateCandidates(organizationId).then((result) => setAcademic(result.data));
  }, [open, organizationId]);

  useEffect(() => {
    if (!member?.id || type !== "apresentacao_crianca") {
      setFamily([]);
      setFamilyMemberId("");
      return;
    }
    void listMemberFamily(member.id).then((result) => setFamily(result.data));
  }, [member?.id, type]);

  useEffect(() => {
    if (type === "casamento") setSecondaryName(member?.spouse_name || "");
    if (type === "batismo_aguas" && member?.baptized_at) setEventDate(member.baptized_at);
    if (type === "batismo_aguas" && member?.baptism_place) setLocation(member.baptism_place);
  }, [type, member]);

  useEffect(() => {
    setSecondSignerRole(isAcademic ? "Coordenador do Curso" : "Secretaria da Igreja");
  }, [isAcademic]);

  const submit = async () => {
    const selectedMemberId = isAcademic ? selectedAcademic?.member_id : member?.id;
    if (!selectedMemberId) return toast.error(isAcademic ? "Selecione uma conclusão acadêmica." : "Selecione um membro.");
    if (type === "apresentacao_crianca" && !familyMemberId) return toast.error("Selecione a criança apresentada.");
    if (type === "casamento" && !secondaryName.trim()) return toast.error("Informe o nome do cônjuge.");

    setSaving(true);
    const result = await createInstitutionalCertificate({
      organizationId,
      certificateType: type,
      memberId: selectedMemberId,
      familyMemberId: familyMemberId || undefined,
      recipientName: selectedAcademic?.recipient_name,
      secondaryRecipientName: secondaryName || undefined,
      eventDate: selectedAcademic?.completed_at?.slice(0, 10) || eventDate,
      location,
      sourceModule: selectedAcademic?.source_module || "secretaria",
      sourceEnrollmentId: selectedAcademic?.enrollment_id,
      courseName: selectedAcademic?.course_name,
      workloadHours: selectedAcademic?.workload_hours ?? undefined,
      periodStart: selectedAcademic?.period_start ?? undefined,
      periodEnd: selectedAcademic?.period_end ?? undefined,
      bodyText,
      signerName,
      signerRole,
      secondSignerName,
      secondSignerRole,
    });
    setSaving(false);
    if (result.error) return toast.error(result.error.message);
    toast.success("Certificado criado como rascunho. Revise antes de emitir.");
    onOpenChange(false);
    await onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Novo certificado</DialogTitle><DialogDescription>O logo configurado para a igreja será usado no cabeçalho e como marca d’água.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <label className="block text-sm">Tipo de certificado
            <select value={type} onChange={(event) => { setType(event.target.value as CertificateType); setAcademicId(""); }} className="mt-1 w-full rounded-lg border border-input bg-background p-2">
              {Object.entries(CERTIFICATE_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          {isAcademic ? (
            <label className="block text-sm">Conclusão apta para certificação
              <select value={academicId} onChange={(event) => setAcademicId(event.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background p-2">
                <option value="">Selecionar…</option>
                {academic.filter((candidate) => candidate.certificate_type === type).map((candidate) => (
                  <option key={candidate.enrollment_id} value={candidate.enrollment_id}>
                    {candidate.recipient_name} — {candidate.course_name} ({candidate.class_name})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <SecretariaMemberPicker organizationId={organizationId} selected={member} onSelect={setMember} />
          )}

          {type === "apresentacao_crianca" && member && (
            <label className="block text-sm">Criança/dependente
              <select value={familyMemberId} onChange={(event) => setFamilyMemberId(event.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background p-2">
                <option value="">Selecionar…</option>
                {family.map((person) => <option key={person.id} value={person.id}>{person.full_name} — {person.relation}</option>)}
              </select>
            </label>
          )}

          {type === "casamento" && <Field label="Nome do cônjuge" value={secondaryName} onChange={setSecondaryName} />}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Data do ato/conclusão<input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background p-2" /></label>
            <Field label="Local" value={location} onChange={setLocation} />
            <Field label="Responsável pela assinatura" value={signerName} onChange={setSignerName} />
            <Field label="Função do responsável" value={signerRole} onChange={setSignerRole} />
            <Field label="Segunda assinatura (opcional)" value={secondSignerName} onChange={setSecondSignerName} />
            <Field label="Função da segunda assinatura" value={secondSignerRole} onChange={setSecondSignerRole} />
          </div>
          <label className="block text-sm">Texto personalizado (opcional)
            <textarea value={bodyText} onChange={(event) => setBodyText(event.target.value)} placeholder="Se vazio, será usado o texto institucional padrão para o tipo escolhido." className="mt-1 min-h-20 w-full rounded-lg border border-input bg-background p-2" />
          </label>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={saving} onClick={() => void submit()}>{saving && <Loader2 className="mr-2 animate-spin" size={16} />} Criar rascunho</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-sm">{label}<input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background p-2" /></label>;
}
