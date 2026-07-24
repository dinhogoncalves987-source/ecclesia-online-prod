/**
 * Financeiro Missionário (OPERAÇÃO 4) — NUNCA uma segunda contabilidade.
 * Esta tela é um CONTEXTO sobre o Financeiro real (public.transactions):
 * vincula uma transação já lançada no Financeiro a exatamente um contexto
 * missionário (parcela, projeto, missionário ou campanha) e mostra as
 * transações já vinculadas. O valor monetário nunca é copiado — sempre lido
 * em tempo real da transação real via list_missions_linked_transactions
 * (contrato §6).
 *
 * A seleção usa uma RPC server-side limitada a transações confirmadas,
 * autorizadas e ainda não vinculadas. O usuário não precisa conhecer UUIDs
 * internos e nenhum pagamento é simulado.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Landmark, Loader2, Link2, Search, Unlink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useRole } from "@/hooks/useRole";
import {
  loadMissionsMissionaries, loadMissionsProjects, loadMissionsCampaigns,
  listMissionsCommitmentInstallmentsReport, getMissionsMemberLabels,
  searchMissionsAvailableTransactions,
  linkMissionsTransaction, unlinkMissionsTransaction, listMissionsLinkedTransactions,
  type MissionsMissionaryRow, type MissionsProjectRow, type MissionsMemberLabel, type MissionsLinkedTransactionRow,
  type MissionsCampaignRow, type MissionsCommitmentInstallmentReportRow, type MissionsAvailableTransactionRow,
} from "@/lib/missions/service";
import {
  MISSIONS_TRANSACTION_LINK_TYPES, MISSIONS_TRANSACTION_LINK_TYPE_LABELS, type MissionsTransactionLinkType,
} from "@/lib/missions/constants";
import { FormInputLabeled, FormSelectLabeled, FormTextareaLabeled, EmptyState } from "./missoesFormHelpers";

type ContextKind = "parcela" | "projeto" | "missionario" | "campanha";

const CONTEXT_TO_LINK_TYPE: Record<ContextKind, MissionsTransactionLinkType> = {
  parcela: "compromisso",
  projeto: "projeto",
  missionario: "missionario",
  campanha: "campanha",
};

export function MissoesFinance({ organizationId }: { organizationId: string }) {
  const { hasCapability } = useRole();
  const canViewFinance = hasCapability("finance.read");
  const canLinkFinance = hasCapability("finance.write") && hasCapability("missions.finance");
  const [loading, setLoading] = useState(true);
  const [missionaries, setMissionaries] = useState<MissionsMissionaryRow[]>([]);
  const [projects, setProjects] = useState<MissionsProjectRow[]>([]);
  const [campaigns, setCampaigns] = useState<MissionsCampaignRow[]>([]);
  const [installments, setInstallments] = useState<MissionsCommitmentInstallmentReportRow[]>([]);
  const [memberLabels, setMemberLabels] = useState<Map<string, MissionsMemberLabel>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [contextKind, setContextKind] = useState<ContextKind>("projeto");
  const [contextId, setContextId] = useState("");
  const [linked, setLinked] = useState<MissionsLinkedTransactionRow[]>([]);
  const [loadingLinked, setLoadingLinked] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (!canViewFinance) {
        setLoading(false);
        return;
      }
      const [mRes, pRes, cRes, iRes] = await Promise.all([
        loadMissionsMissionaries(organizationId),
        loadMissionsProjects(organizationId),
        loadMissionsCampaigns(organizationId),
        listMissionsCommitmentInstallmentsReport({ organization_id: organizationId }),
      ]);
      if (cancelled) return;
      setMissionaries(mRes.rows.filter((row) => ["em_preparacao", "ativo", "em_licenca"].includes(row.status)));
      setProjects(pRes.rows.filter((row) => ["planejado", "ativo", "suspenso"].includes(row.status)));
      setCampaigns(cRes.rows);
      setInstallments(iRes.rows.filter((row) => !["cancelado", "isento", "pago"].includes(row.status)));
      setLoadError(mRes.error?.message ?? pRes.error?.message ?? cRes.error?.message ?? iRes.error);
      const memberIds = [...new Set(mRes.rows.map((m) => m.member_id))];
      if (memberIds.length > 0) {
        const labels = await getMissionsMemberLabels(organizationId, memberIds);
        if (!cancelled) {
          setMemberLabels(new Map(labels.rows.map((m) => [m.id, m])));
          setLoadError((current) => current ?? labels.error?.message ?? null);
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [organizationId, canViewFinance]);

  const loadLinked = useCallback(async () => {
    if (!contextId) { setLinked([]); return; }
    setLoadingLinked(true);
    setLinkError(null);
    const result = await listMissionsLinkedTransactions({
      installment_id: contextKind === "parcela" ? contextId : undefined,
      project_id: contextKind === "projeto" ? contextId : undefined,
      missionary_id: contextKind === "missionario" ? contextId : undefined,
      campaign_id: contextKind === "campanha" ? contextId : undefined,
    });
    setLinked(result.rows);
    setLinkError(result.error);
    setLoadingLinked(false);
  }, [contextKind, contextId]);

  useEffect(() => { void loadLinked(); }, [loadLinked]);

  const handleUnlink = async (linkId: string) => {
    const { error } = await unlinkMissionsTransaction(linkId);
    if (error) { toast.error(`Não foi possível desvincular: ${error}`); return; }
    toast.success("Transação desvinculada.");
    loadLinked();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="animate-spin" size={18} /> Carregando financeiro missionário…</div>;
  }
  if (!canViewFinance) {
    return (
      <EmptyState
        title="Sem acesso ao Financeiro"
        description="Visualizar vínculos missionários exige finance.read. A gestão de Missões, sozinha, não concede acesso a dados financeiros."
      />
    );
  }
  if (loadError) {
    return (
      <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Não foi possível carregar os contextos financeiros de Missões. {loadError}
      </div>
    );
  }

  const memberLabel = (id: string) => {
    const m = memberLabels.get(id);
    return m ? (m.known_name || m.full_name) : "Missionário";
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-serif flex items-center gap-2"><Landmark size={18} /> Financeiro missionário</h2>
        <p className="text-sm text-muted-foreground">
          Contexto sobre o Financeiro real: vincule uma transação já lançada (contribuição, repasse) a uma parcela,
          projeto, missionário ou campanha. O valor e o fechamento continuam exclusivamente no Financeiro.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormSelectLabeled
          label="Tipo de contexto"
          value={contextKind}
          onChange={(v) => { setContextKind(v as ContextKind); setContextId(""); }}
          options={[
            { value: "projeto", label: "Projeto" },
            { value: "missionario", label: "Missionário" },
            { value: "parcela", label: "Parcela de compromisso" },
            { value: "campanha", label: "Campanha" },
          ]}
        />
        {contextKind === "projeto" ? (
          <FormSelectLabeled label="Projeto" value={contextId} onChange={setContextId} options={projects.map((p) => ({ value: p.id, label: p.name }))} />
        ) : contextKind === "missionario" ? (
          <FormSelectLabeled label="Missionário" value={contextId} onChange={setContextId} options={missionaries.map((m) => ({ value: m.id, label: memberLabel(m.member_id) }))} />
        ) : contextKind === "parcela" ? (
          <FormSelectLabeled
            label="Parcela"
            value={contextId}
            onChange={setContextId}
            options={installments.map((installment) => ({
              value: installment.installment_id,
              label: `${installment.supporter_member_name} · ${installment.reference_month} · ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(installment.expected_amount)}`,
            }))}
            placeholder="Selecione uma parcela em aberto"
          />
        ) : (
          <FormSelectLabeled
            label="Campanha"
            value={contextId}
            onChange={setContextId}
            options={campaigns.map((campaign) => ({ value: campaign.id, label: campaign.title }))}
            placeholder="Selecione uma campanha ativa"
          />
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Transações vinculadas</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setLinkDialogOpen(true)}
          disabled={!canLinkFinance || !contextId}
          title={!canLinkFinance ? "Exige finance.write e missions.finance" : undefined}
        >
          <Link2 size={14} className="mr-1.5" /> Vincular transação
        </Button>
      </div>

      {!contextId ? (
        <EmptyState title="Selecione um contexto" description="Escolha um projeto, missionário, parcela ou campanha acima para ver e vincular transações." />
      ) : loadingLinked ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-6"><Loader2 className="animate-spin" size={14} /> Carregando transações…</div>
      ) : linkError ? (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Não foi possível carregar as transações vinculadas. {linkError}
        </div>
      ) : linked.length === 0 ? (
        <EmptyState title="Nenhuma transação vinculada ainda" description="Vincule uma transação já lançada no Financeiro a este contexto missionário." />
      ) : (
        <div className="space-y-1.5">
          {linked.map((t) => (
            <Card key={t.link_id}>
              <CardContent className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm truncate">{t.transaction_description || MISSIONS_TRANSACTION_LINK_TYPE_LABELS[t.link_type as MissionsTransactionLinkType]}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(`${t.transaction_date}T00:00:00`).toLocaleDateString("pt-BR")} · {t.transaction_status}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="text-sm font-medium">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(t.amount)}
                  </p>
                  {canLinkFinance && (
                    <Button size="sm" variant="ghost" onClick={() => handleUnlink(t.link_id)} title="Desvincular">
                      <Unlink size={14} />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {linkDialogOpen && (
        <LinkTransactionDialog
          contextKind={contextKind}
          contextId={contextId}
          organizationId={organizationId}
          onClose={() => setLinkDialogOpen(false)}
          onLinked={loadLinked}
        />
      )}
    </div>
  );
}

function LinkTransactionDialog({ contextKind, contextId, organizationId, onClose, onLinked }: {
  contextKind: ContextKind;
  contextId: string;
  organizationId: string;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [query, setQuery] = useState("");
  const [transactions, setTransactions] = useState<MissionsAvailableTransactionRow[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<MissionsAvailableTransactionRow | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const linkType = CONTEXT_TO_LINK_TYPE[contextKind];

  const handleSearch = async () => {
    setSearching(true);
    setSearchError(null);
    const result = await searchMissionsAvailableTransactions(organizationId, query);
    setTransactions(result.rows);
    setSearchError(result.error);
    setSearching(false);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSearching(true);
      const result = await searchMissionsAvailableTransactions(organizationId, "");
      if (cancelled) return;
      setTransactions(result.rows);
      setSearchError(result.error);
      setSearching(false);
    })();
    return () => { cancelled = true; };
  }, [organizationId]);

  const handleSave = async () => {
    if (!selectedTransaction) { toast.error("Selecione uma transação do Financeiro."); return; }
    if (contextKind === "parcela" && selectedTransaction.transaction_type !== "Entrada") {
      toast.error("Uma parcela só pode receber uma transação de entrada.");
      return;
    }
    setSaving(true);
    const { error } = await linkMissionsTransaction({
      transaction_id: selectedTransaction.id,
      link_type: linkType,
      installment_id: contextKind === "parcela" ? contextId : null,
      project_id: contextKind === "projeto" ? contextId : null,
      missionary_id: contextKind === "missionario" ? contextId : null,
      campaign_id: contextKind === "campanha" ? contextId : null,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(`Não foi possível vincular a transação: ${error}`); return; }
    toast.success("Transação vinculada ao contexto missionário.");
    onClose();
    onLinked();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Vincular transação do Financeiro</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Selecione uma transação confirmada já lançada no Financeiro. Este vínculo não cria nem altera valores —
            apenas registra o contexto missionário da transação real.
          </p>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <FormInputLabeled
                label="Buscar por descrição ou categoria"
                value={query}
                onChange={setQuery}
                placeholder="Ex.: oferta missionária"
              />
            </div>
            <Button type="button" variant="outline" onClick={handleSearch} disabled={searching}>
              {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              <span className="sr-only">Buscar transações</span>
            </Button>
          </div>
          {searchError ? (
            <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              Não foi possível buscar transações. {searchError}
            </div>
          ) : transactions.length === 0 && !searching ? (
            <EmptyState
              title="Nenhuma transação disponível"
              description="Confirme o lançamento no Financeiro ou refine a busca. Transações pendentes e já vinculadas não aparecem."
            />
          ) : (
            <div className="max-h-56 space-y-1.5 overflow-y-auto">
              {transactions.map((transaction) => (
                <button
                  key={transaction.id}
                  type="button"
                  onClick={() => setSelectedTransaction(transaction)}
                  className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                    selectedTransaction?.id === transaction.id ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/40"
                  }`}
                >
                  <p className="text-sm font-medium">{transaction.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(`${transaction.transaction_date}T00:00:00`).toLocaleDateString("pt-BR")}
                    {" · "}{transaction.transaction_type}
                    {" · "}{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(transaction.amount)}
                  </p>
                </button>
              ))}
            </div>
          )}
          <FormTextareaLabeled label="Observações (opcional)" value={notes} onChange={setNotes} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !selectedTransaction}>{saving ? "Vinculando…" : "Vincular"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
