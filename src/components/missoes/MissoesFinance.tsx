/**
 * Financeiro Missionário (OPERAÇÃO 4) — NUNCA uma segunda contabilidade.
 * Esta tela é um CONTEXTO sobre o Financeiro real (public.transactions):
 * vincula uma transação já lançada no Financeiro a exatamente um contexto
 * missionário (parcela, projeto, missionário ou campanha) e mostra as
 * transações já vinculadas. O valor monetário nunca é copiado — sempre lido
 * em tempo real da transação real via list_missions_linked_transactions
 * (contrato §6).
 *
 * LIMITAÇÃO DOCUMENTADA (ver docs/architecture/operacao-4-missoes.md §16,
 * mesma limitação já registrada em TeologiaFinance.tsx): esta tela não
 * embute um seletor visual de transações do Financeiro — quem vincula
 * precisa ter o ID da transação já lançada lá. Nenhum pagamento é simulado.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Landmark, Loader2, Link2, Unlink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useRole } from "@/hooks/useRole";
import {
  loadMissionsMissionaries, loadMissionsProjects, getMissionsMemberLabels,
  linkMissionsTransaction, unlinkMissionsTransaction, listMissionsLinkedTransactions,
  type MissionsMissionaryRow, type MissionsProjectRow, type MissionsMemberLabel, type MissionsLinkedTransactionRow,
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
  const [memberLabels, setMemberLabels] = useState<Map<string, MissionsMemberLabel>>(new Map());
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
      const [mRes, pRes] = await Promise.all([loadMissionsMissionaries(organizationId), loadMissionsProjects(organizationId)]);
      if (cancelled) return;
      setMissionaries(mRes.rows);
      setProjects(pRes.rows);
      const memberIds = [...new Set(mRes.rows.map((m) => m.member_id))];
      if (memberIds.length > 0) {
        const labels = await getMissionsMemberLabels(organizationId, memberIds);
        if (!cancelled) setMemberLabels(new Map(labels.rows.map((m) => [m.id, m])));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [organizationId]);

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
        ) : (
          <FormInputLabeled
            label={contextKind === "parcela" ? "ID da parcela" : "ID da campanha"}
            value={contextId}
            onChange={setContextId}
            placeholder="UUID"
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
          onClose={() => setLinkDialogOpen(false)}
          onLinked={loadLinked}
        />
      )}
    </div>
  );
}

function LinkTransactionDialog({ contextKind, contextId, onClose, onLinked }: {
  contextKind: ContextKind;
  contextId: string;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [transactionId, setTransactionId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const linkType = CONTEXT_TO_LINK_TYPE[contextKind];

  const handleSave = async () => {
    if (!transactionId.trim()) { toast.error("Informe o ID da transação já lançada no Financeiro."); return; }
    setSaving(true);
    const { error } = await linkMissionsTransaction({
      transaction_id: transactionId.trim(),
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
            Informe o ID de uma transação já lançada no Financeiro (Tesouraria). Este vínculo não cria nem altera
            valores — apenas registra o contexto missionário da transação real.
          </p>
          <FormInputLabeled label="ID da transação" value={transactionId} onChange={setTransactionId} required placeholder="UUID da transação" />
          <FormTextareaLabeled label="Observações (opcional)" value={notes} onChange={setNotes} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Vinculando…" : "Vincular"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
