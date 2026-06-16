import { AdminLayout } from "@/components/AdminLayout";
import {
  ClipboardList, Plus, X, Loader2, ChevronDown,
  CheckCircle2, Clock, AlertCircle, XCircle, FileQuestion,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { useRole } from "@/hooks/useRole";
import { useToast } from "@/hooks/use-toast";
import { canWriteSecretaria } from "@/lib/permissions";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type RequestType =
  | "declaracao_membro"
  | "atualizacao_cadastral"
  | "solicitacao_geral"
  | "segunda_via"
  | "contato_pastoral";

type RequestStatus =
  | "aberta"
  | "em_analise"
  | "aguardando_documento"
  | "concluida"
  | "rejeitada";

type AdmRequest = {
  id: string;
  organization_id: string;
  member_id: string | null;
  requester_name: string;
  request_type: RequestType;
  description: string | null;
  status: RequestStatus;
  internal_notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  declaracao_membro: "Declaração de Membro",
  atualizacao_cadastral: "Atualização Cadastral",
  solicitacao_geral: "Solicitação Geral",
  segunda_via: "Segunda Via de Documento",
  contato_pastoral: "Pedido de Contato Pastoral",
};

const STATUS_LABELS: Record<RequestStatus, string> = {
  aberta: "Aberta",
  em_analise: "Em Análise",
  aguardando_documento: "Aguardando Documento",
  concluida: "Concluída",
  rejeitada: "Rejeitada",
};

const STATUS_COLORS: Record<RequestStatus, string> = {
  aberta: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  em_analise: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  aguardando_documento: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  concluida: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  rejeitada: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
};

const STATUS_ICONS: Record<RequestStatus, React.ElementType> = {
  aberta: FileQuestion,
  em_analise: Clock,
  aguardando_documento: AlertCircle,
  concluida: CheckCircle2,
  rejeitada: XCircle,
};

const STATUS_ORDER: RequestStatus[] = [
  "aberta", "em_analise", "aguardando_documento", "concluida", "rejeitada",
];

const NEXT_STATUS: Record<RequestStatus, RequestStatus | null> = {
  aberta: "em_analise",
  em_analise: "aguardando_documento",
  aguardando_documento: "concluida",
  concluida: null,
  rejeitada: null,
};

const EMPTY_FORM = {
  requester_name: "",
  request_type: "solicitacao_geral" as RequestType,
  description: "",
  internal_notes: "",
};

export default function SolicitacoesAdministrativas() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { church, loading: churchLoading, isMatriz } = useChurch();
  const { canonicalRole, isAdmin } = useRole();
  // Nomenclatura adaptada por perfil: Matriz/Admin cria, Congregação solicita
  const isCreatorProfile = isMatriz || isAdmin;
  const actionLabel = isCreatorProfile ? "Nova Demanda" : "Nova Solicitação";
  const pageTitle = isCreatorProfile ? "Demandas Administrativas" : "Solicitações Administrativas";
  const pageDesc = isCreatorProfile
    ? "Registro e acompanhamento de demandas administrativas"
    : "Gerenciamento de pedidos recebidos pela secretaria";
  const canWrite = canWriteSecretaria(canonicalRole);

  const [requests, setRequests] = useState<AdmRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<RequestStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [detailRequest, setDetailRequest] = useState<AdmRequest | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [changingStatus, setChangingStatus] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    if (!church) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("administrative_requests")
      .select("*")
      .eq("organization_id", church.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erro ao carregar solicitações", description: error.message, variant: "destructive" });
      return;
    }
    setRequests((data ?? []) as AdmRequest[]);
    setLoading(false);
  }, [church, toast]);

  useEffect(() => {
    if (churchLoading) return;
    void fetchRequests();
  }, [fetchRequests, churchLoading]);

  const statusCounts = STATUS_ORDER.reduce(
    (acc, s) => ({ ...acc, [s]: requests.filter((r) => r.status === s).length }),
    {} as Record<RequestStatus, number>,
  );

  const filtered = requests.filter((r) => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        r.requester_name.toLowerCase().includes(q) ||
        REQUEST_TYPE_LABELS[r.request_type].toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleCreate = async () => {
    if (!church || !user || !form.requester_name.trim()) return;
    setSaving(true);

    const { error } = await supabase.from("administrative_requests").insert({
      organization_id: church.id,
      requester_name: form.requester_name.trim(),
      request_type: form.request_type,
      description: form.description.trim() || null,
      internal_notes: form.internal_notes.trim() || null,
      status: "aberta",
    });

    if (error) {
      toast({ title: "Erro ao criar solicitação", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Solicitação criada com sucesso" });
      setShowForm(false);
      setForm(EMPTY_FORM);
      void fetchRequests();
    }
    setSaving(false);
  };

  const handleStatusChange = async (req: AdmRequest, newStatus: RequestStatus) => {
    setChangingStatus(req.id);
    const update: Partial<AdmRequest> = { status: newStatus };
    if (newStatus === "concluida" || newStatus === "rejeitada") {
      update.completed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("administrative_requests")
      .update(update)
      .eq("id", req.id)
      .eq("organization_id", church!.id);

    if (error) {
      toast({ title: "Erro ao atualizar status", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Status alterado para: ${STATUS_LABELS[newStatus]}` });
      void fetchRequests();
      if (detailRequest?.id === req.id) {
        setDetailRequest({ ...detailRequest, status: newStatus });
      }
    }
    setChangingStatus(null);
  };

  const handleSaveNotes = async () => {
    if (!detailRequest || !church) return;
    setSavingNotes(true);

    const { error } = await supabase
      .from("administrative_requests")
      .update({ internal_notes: notesDraft.trim() || null })
      .eq("id", detailRequest.id)
      .eq("organization_id", church.id);

    if (error) {
      toast({ title: "Erro ao salvar observação", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Observação salva" });
      void fetchRequests();
    }
    setSavingNotes(false);
  };

  const openDetail = (req: AdmRequest) => {
    setDetailRequest(req);
    setNotesDraft(req.internal_notes ?? "");
  };

  if (churchLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList size={22} />
              {pageTitle}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {pageDesc}
            </p>
          </div>
          {canWrite && (
            <Button onClick={() => setShowForm(true)}>
              <Plus size={16} className="mr-1.5" />
              {actionLabel}
            </Button>
          )}
        </div>

        {/* Cards de status */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {STATUS_ORDER.map((s) => {
            const Icon = STATUS_ICONS[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() => setFilterStatus(filterStatus === s ? "all" : s)}
                className={cn(
                  "rounded-xl border p-3 text-left transition-all",
                  filterStatus === s
                    ? STATUS_COLORS[s]
                    : "bg-card border-border/50 hover:border-border",
                )}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon size={14} />
                  <span className="text-xs font-medium">{STATUS_LABELS[s]}</span>
                </div>
                <p className="text-2xl font-bold">{statusCounts[s] ?? 0}</p>
              </button>
            );
          })}
        </div>

        {/* Busca */}
        <div className="relative">
          <Input
            placeholder="Buscar por nome, tipo ou descrição..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-4"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardList size={40} className="text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground text-sm">
              {requests.length === 0
                ? "Nenhuma solicitação registrada ainda."
                : "Nenhuma solicitação encontrada com esses filtros."}
            </p>
            {canWrite && requests.length === 0 && (
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowForm(true)}>
                <Plus size={14} className="mr-1" />
                {isCreatorProfile ? "Registrar primeira demanda" : "Criar primeira solicitação"}
              </Button>
            )}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            <div className="space-y-2">
              {filtered.map((req) => {
                const StatusIcon = STATUS_ICONS[req.status];
                const nextStatus = NEXT_STATUS[req.status];
                return (
                  <motion.div
                    key={req.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-border/50 bg-card p-4 flex items-start gap-4 cursor-pointer hover:border-border transition-colors"
                    onClick={() => openDetail(req)}
                  >
                    <StatusIcon size={18} className="flex-shrink-0 mt-0.5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium text-sm truncate">{req.requester_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {REQUEST_TYPE_LABELS[req.request_type]}
                        </span>
                      </div>
                      {req.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{req.description}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/60 mt-1">
                        {format(new Date(req.created_at), "d MMM yyyy", { locale: ptBR })}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] px-2 py-0.5 border", STATUS_COLORS[req.status])}
                      >
                        {STATUS_LABELS[req.status]}
                      </Badge>
                      {canWrite && nextStatus && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleStatusChange(req, nextStatus);
                          }}
                          disabled={changingStatus === req.id}
                          className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                        >
                          {changingStatus === req.id ? (
                            <Loader2 size={10} className="animate-spin" />
                          ) : (
                            <ChevronDown size={10} />
                          )}
                          {STATUS_LABELS[nextStatus]}
                        </button>
                      )}
                      {canWrite && req.status === "em_analise" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleStatusChange(req, "rejeitada");
                          }}
                          disabled={changingStatus === req.id}
                          className="text-[10px] text-red-500 hover:underline"
                        >
                          Rejeitar
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </AnimatePresence>
        )}
      </div>

      {/* Modal: Nova Solicitação */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{actionLabel}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nome do solicitante *</label>
              <Input
                placeholder="Nome completo"
                value={form.requester_name}
                onChange={(e) => setForm((f) => ({ ...f, requester_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tipo de solicitação</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={form.request_type}
                onChange={(e) => setForm((f) => ({ ...f, request_type: e.target.value as RequestType }))}
              >
                {(Object.keys(REQUEST_TYPE_LABELS) as RequestType[]).map((t) => (
                  <option key={t} value={t}>{REQUEST_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Descrição</label>
              <textarea
                className="w-full min-h-[80px] resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Descreva a solicitação..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Observação interna</label>
              <textarea
                className="w-full min-h-[60px] resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Anotação interna da secretaria..."
                value={form.internal_notes}
                onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={saving || !form.requester_name.trim()}>
              {saving ? <Loader2 size={15} className="animate-spin mr-1.5" /> : null}
              Criar Solicitação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Detalhe da Solicitação */}
      <Dialog open={Boolean(detailRequest)} onOpenChange={(v) => !v && setDetailRequest(null)}>
        {detailRequest && (
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{REQUEST_TYPE_LABELS[detailRequest.request_type]}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Solicitante</span>
                <span className="text-sm font-medium">{detailRequest.requester_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge
                  variant="outline"
                  className={cn("text-xs border", STATUS_COLORS[detailRequest.status])}
                >
                  {STATUS_LABELS[detailRequest.status]}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Criado em</span>
                <span className="text-sm">
                  {format(new Date(detailRequest.created_at), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
              </div>
              {detailRequest.description && (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Descrição</p>
                  <p className="text-sm bg-muted/50 rounded-lg px-3 py-2">{detailRequest.description}</p>
                </div>
              )}
              {canWrite && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Observação interna</label>
                  <textarea
                    className="w-full min-h-[72px] resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Adicionar observação interna..."
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="w-full"
                  >
                    {savingNotes ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
                    Salvar Observação
                  </Button>
                </div>
              )}
              {canWrite && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {STATUS_ORDER.filter((s) => s !== detailRequest.status).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant="outline"
                      onClick={() => void handleStatusChange(detailRequest, s)}
                      disabled={changingStatus === detailRequest.id}
                      className={cn("text-xs", STATUS_COLORS[s])}
                    >
                      {STATUS_LABELS[s]}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </AdminLayout>
  );
}
