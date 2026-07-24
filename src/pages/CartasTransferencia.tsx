import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Check, Eye, FilePlus2, Loader2, Search, Send, X } from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/AdminLayout";
import { SecretariaMemberPicker } from "@/components/secretaria/SecretariaMemberPicker";
import { TransferLetterDocument } from "@/components/secretaria/TransferLetterDocument";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useChurch } from "@/hooks/useChurchContext";
import { supabase } from "@/integrations/supabase/client";
import {
  cancelTransferLetter, createTransferLetter, issueTransferLetter, listTransferLetters, setTransferStatus,
  type SecretariaMember, type TransferLetter,
} from "@/lib/officialDocuments";

type DestinationOrganization = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
};

const STATUS_LABEL: Record<TransferLetter["status"], string> = {
  solicitada: "Solicitada",
  aprovada: "Aprovada",
  concluida: "Emitida",
  rejeitada: "Rejeitada",
  cancelada: "Cancelada",
};

export default function CartasTransferencia() {
  const { church, loading: churchLoading } = useChurch();
  const [letters, setLetters] = useState<TransferLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<TransferLetter | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!church?.id) return;
    setLoading(true);
    const result = await listTransferLetters(church.id);
    setLetters(result.data);
    setError(result.error?.message ?? null);
    setLoading(false);
  }, [church?.id]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    if (!term) return letters;
    return letters.filter((letter) =>
      [letter.member_name, letter.member_code, letter.destination_church_name, letter.transfer_number]
        .some((value) => value?.toLocaleLowerCase("pt-BR").includes(term)),
    );
  }, [letters, query]);

  const changeStatus = async (letter: TransferLetter, status: "aprovada" | "rejeitada" | "cancelada") => {
    setBusyId(letter.id);
    const actionError = await setTransferStatus(letter.id, status);
    if (actionError) toast.error(actionError.message);
    else {
      toast.success(status === "aprovada" ? "Transferência aprovada." : status === "cancelada" ? "Transferência cancelada." : "Transferência rejeitada.");
      await load();
    }
    setBusyId(null);
  };

  const issue = async (letter: TransferLetter) => {
    setBusyId(letter.id);
    const result = await issueTransferLetter(letter.id);
    if (result.error) toast.error(result.error.message);
    else {
      toast.success("Carta numerada e emitida com QR permanente.");
      await load();
    }
    setBusyId(null);
  };

  const cancel = async (letter: TransferLetter) => {
    const reason = window.prompt("Informe o motivo do cancelamento:");
    if (!reason?.trim()) return;
    setBusyId(letter.id);
    const actionError = await cancelTransferLetter(letter.id, reason);
    if (actionError) toast.error(actionError.message);
    else {
      toast.success("Transferência cancelada. O QR continuará mostrando essa situação.");
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
            <h1 className="flex items-center gap-2 font-serif text-2xl sm:text-3xl"><ArrowRightLeft /> Cartas de Transferência</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Transferências internas ou externas com fluxo de aprovação, número oficial, PDF e validação por QR.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}><FilePlus2 size={16} className="mr-2" /> Nova transferência</Button>
        </div>

        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar membro, destino, matrícula ou número…"
            className="w-full rounded-xl border border-input bg-background py-2.5 pl-10 pr-3 text-sm"
          />
        </div>

        {loading ? (
          <p className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="animate-spin" /> Carregando cartas…</p>
        ) : error ? (
          <Card><CardContent className="py-12 text-center text-destructive">{error}</CardContent></Card>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="py-16 text-center"><p className="font-semibold">Nenhuma transferência encontrada</p><p className="mt-1 text-sm text-muted-foreground">Crie a primeira solicitação; a carta só será emitida depois da aprovação.</p></CardContent></Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((letter) => (
              <Card key={letter.id}>
                <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{letter.member_name}</p>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{STATUS_LABEL[letter.status]}</span>
                      {letter.transfer_number && <span className="font-mono text-xs text-muted-foreground">{letter.transfer_number}</span>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {letter.destination_type === "interna" ? "Transferência interna" : "Transferência externa"} para{" "}
                      <strong className="text-foreground">{letter.destination_church_name}</strong>
                      {letter.destination_city ? ` — ${letter.destination_city}/${letter.destination_state || ""}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Solicitada em {new Date(`${letter.requested_at}T12:00:00`).toLocaleDateString("pt-BR")}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {letter.status === "solicitada" && (
                      <>
                        <Button size="sm" disabled={busyId === letter.id} onClick={() => void changeStatus(letter, "aprovada")}><Check size={15} className="mr-1" /> Aprovar</Button>
                        <Button size="sm" variant="outline" disabled={busyId === letter.id} onClick={() => void changeStatus(letter, "rejeitada")}><X size={15} className="mr-1" /> Rejeitar</Button>
                      </>
                    )}
                    {letter.status === "aprovada" && (
                      <Button size="sm" disabled={busyId === letter.id} onClick={() => void issue(letter)}><Send size={15} className="mr-1" /> Emitir carta</Button>
                    )}
                    {letter.status === "concluida" && (
                      <Button size="sm" variant="outline" onClick={() => setSelected(letter)}><Eye size={15} className="mr-1" /> Visualizar</Button>
                    )}
                    {["solicitada", "aprovada", "concluida"].includes(letter.status) && (
                      <Button size="sm" variant="ghost" disabled={busyId === letter.id} onClick={() => void cancel(letter)}>Cancelar</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <CreateTransferDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        organizationId={church.id}
        onCreated={load}
      />
      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-6xl">
          <DialogHeader><DialogTitle>Carta de Transferência</DialogTitle><DialogDescription>Documento oficial pronto para impressão, PDF ou compartilhamento.</DialogDescription></DialogHeader>
          {selected && <TransferLetterDocument letter={selected} />}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function CreateTransferDialog({
  open,
  onOpenChange,
  organizationId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  onCreated: () => Promise<void>;
}) {
  const [member, setMember] = useState<SecretariaMember | null>(null);
  const [type, setType] = useState<"interna" | "externa">("externa");
  const [organizations, setOrganizations] = useState<DestinationOrganization[]>([]);
  const [destinationOrganizationId, setDestinationOrganizationId] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("Brasil");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase.from("organizations").select("id,name,city,state").neq("id", organizationId).eq("active", true).order("name")
      .then(({ data }) => setOrganizations((data ?? []) as DestinationOrganization[]));
  }, [open, organizationId]);

  const submit = async () => {
    if (!member) return toast.error("Selecione o membro.");
    if (type === "interna" && !destinationOrganizationId) return toast.error("Selecione a unidade de destino.");
    if (type === "externa" && !name.trim()) return toast.error("Informe a igreja de destino.");
    setSaving(true);
    const result = await createTransferLetter({
      memberId: member.id,
      destinationType: type,
      destinationOrganizationId: type === "interna" ? destinationOrganizationId : undefined,
      destinationChurchName: type === "externa" ? name : undefined,
      destinationCity: city,
      destinationState: state,
      destinationCountry: country,
      reason,
    });
    setSaving(false);
    if (result.error) return toast.error(result.error.message);
    toast.success("Solicitação de transferência criada.");
    onOpenChange(false);
    await onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Nova transferência</DialogTitle><DialogDescription>Selecione o membro e informe o destino. A emissão acontecerá somente após aprovação.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <SecretariaMemberPicker organizationId={organizationId} selected={member} onSelect={setMember} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Tipo
              <select value={type} onChange={(event) => setType(event.target.value as "interna" | "externa")} className="mt-1 w-full rounded-lg border border-input bg-background p-2">
                <option value="externa">Igreja externa</option><option value="interna">Unidade Ecclesia</option>
              </select>
            </label>
            {type === "interna" ? (
              <label className="text-sm">Unidade de destino
                <select value={destinationOrganizationId} onChange={(event) => setDestinationOrganizationId(event.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background p-2">
                  <option value="">Selecionar…</option>
                  {organizations.map((org) => <option key={org.id} value={org.id}>{org.name} {org.city ? `— ${org.city}/${org.state || ""}` : ""}</option>)}
                </select>
              </label>
            ) : (
              <Field label="Igreja de destino" value={name} onChange={setName} />
            )}
            <Field label="Cidade" value={city} onChange={setCity} />
            <Field label="Estado/UF" value={state} onChange={setState} />
            {type === "externa" && <Field label="País" value={country} onChange={setCountry} />}
          </div>
          <label className="block text-sm">Motivo/observação
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-input bg-background p-2" />
          </label>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={saving} onClick={() => void submit()}>{saving && <Loader2 className="mr-2 animate-spin" size={16} />} Criar solicitação</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-sm">{label}<input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background p-2" /></label>;
}
