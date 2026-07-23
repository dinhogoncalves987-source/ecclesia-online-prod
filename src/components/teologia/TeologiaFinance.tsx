/**
 * Financeiro Acadêmico (OPERAÇÃO 3) — NUNCA um caixa/saldo/fechamento
 * paralelo. Esta tela é um CONTEXTO sobre o Financeiro real
 * (public.transactions): vincula uma transação já lançada no Financeiro a
 * uma matrícula/período de Teologia e mostra as transações já vinculadas.
 * O valor monetário nunca é copiado — sempre lido em tempo real da
 * transação real via RPC (list_theology_linked_transactions), ver §6.5 da
 * operação.
 *
 * LIMITAÇÃO DOCUMENTADA (ver docs/architecture/operacao-3-teologia.md §16):
 * esta tela não embute um seletor visual de transações do Financeiro — a
 * pessoa que vincula precisa ter o ID da transação já lançada lá. Construir
 * um seletor completo exigiria copiar/estender componentes financeiros
 * inteiros, o que a operação proíbe. Nenhum pagamento é simulado aqui.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Landmark, Loader2, Link2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useRole } from "@/hooks/useRole";
import {
  loadTheologyPeriods, loadTheologyClasses, loadTheologyEnrollmentsForMember, searchTheologyMembers,
  linkTheologyTransaction, listTheologyLinkedTransactions,
  type TheologyPeriodRow, type TheologyEnrollmentRow, type TheologyLinkedTransactionRow,
} from "@/lib/theology/service";
import { THEOLOGY_TRANSACTION_LINK_TYPES, THEOLOGY_TRANSACTION_LINK_TYPE_LABELS, type TheologyTransactionLinkType } from "@/lib/theology/constants";
import { FormInputLabeled, FormSelectLabeled, FormTextareaLabeled, EmptyState } from "./teologiaFormHelpers";
import { TeologiaMemberPicker } from "./TeologiaMemberPicker";

export function TeologiaFinance({ organizationId }: { organizationId: string }) {
  const { hasCapability } = useRole();
  const canViewFinance = hasCapability("finance.read");
  const canLinkFinance = hasCapability("finance.write") && hasCapability("theology.manage");
  const [loading, setLoading] = useState(true);
  const [moduleUnavailable, setModuleUnavailable] = useState(false);
  const [periods, setPeriods] = useState<TheologyPeriodRow[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [selectedMemberLabel, setSelectedMemberLabel] = useState<string>("");
  const [memberEnrollments, setMemberEnrollments] = useState<TheologyEnrollmentRow[]>([]);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState("");
  const [linkedTransactions, setLinkedTransactions] = useState<TheologyLinkedTransactionRow[]>([]);
  const [loadingLinked, setLoadingLinked] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const periodsRes = await loadTheologyPeriods(organizationId);
    if (periodsRes.error?.code === "42P01") {
      setModuleUnavailable(true);
      setLoading(false);
      return;
    }
    setPeriods(periodsRes.rows);
    setModuleUnavailable(false);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { void reload(); }, [reload]);

  const loadLinked = useCallback(async () => {
    if (!selectedEnrollmentId && !selectedPeriodId) { setLinkedTransactions([]); return; }
    setLoadingLinked(true);
    setLinkError(null);
    const result = await listTheologyLinkedTransactions({
      enrollment_id: selectedEnrollmentId || undefined,
      period_id: !selectedEnrollmentId ? selectedPeriodId || undefined : undefined,
    });
    setLinkedTransactions(result.rows);
    setLinkError(result.error);
    setLoadingLinked(false);
  }, [selectedEnrollmentId, selectedPeriodId]);

  useEffect(() => { void loadLinked(); }, [loadLinked]);

  const handleSelectMember = async (memberId: string, label: string) => {
    setSelectedMemberId(memberId);
    setSelectedMemberLabel(label);
    setSelectedEnrollmentId("");
    const { rows } = await loadTheologyEnrollmentsForMember(memberId);
    setMemberEnrollments(rows);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="animate-spin" size={18} /> Carregando financeiro acadêmico…</div>;
  }
  if (moduleUnavailable) {
    return <EmptyState title="Teologia aguardando aplicação das migrations" description="A tabela theology_periods ainda não existe neste ambiente." />;
  }
  if (!canViewFinance) {
    return (
      <EmptyState
        title="Sem acesso ao Financeiro"
        description="Visualizar vínculos acadêmicos exige finance.read. A gestão de Teologia, sozinha, não concede acesso a dados financeiros."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-serif flex items-center gap-2"><Landmark size={18} /> Financeiro Acadêmico</h2>
        <p className="text-sm text-muted-foreground">
          Contexto sobre o Financeiro real: vincule uma transação já lançada (matrícula, mensalidade, contribuição)
          a um aluno/período de Teologia. O valor e o fechamento continuam exclusivamente no Financeiro.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 p-3 rounded-lg border border-border/60">
          <p className="text-sm font-medium">Filtrar por período</p>
          <FormSelectLabeled
            label="Período letivo"
            value={selectedPeriodId}
            onChange={(v) => { setSelectedPeriodId(v); setSelectedEnrollmentId(""); setSelectedMemberId(null); }}
            options={periods.map((p) => ({ value: p.id, label: p.name }))}
            placeholder="Todos os períodos"
          />
        </div>
        <div className="space-y-2 p-3 rounded-lg border border-border/60">
          <p className="text-sm font-medium">Filtrar por aluno</p>
          {selectedMemberId ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm truncate">{selectedMemberLabel}</span>
              <Button size="sm" variant="ghost" onClick={() => { setSelectedMemberId(null); setSelectedEnrollmentId(""); setMemberEnrollments([]); }}>Trocar</Button>
            </div>
          ) : (
            <TeologiaMemberPicker organizationId={organizationId} onSelect={(m) => handleSelectMember(m.id, m.known_name || m.full_name)} />
          )}
          {selectedMemberId && memberEnrollments.length > 0 && (
            <FormSelectLabeled
              label="Matrícula"
              value={selectedEnrollmentId}
              onChange={setSelectedEnrollmentId}
              options={memberEnrollments.map((e) => ({ value: e.id, label: `Matrícula de ${new Date(e.enrolled_at).toLocaleDateString("pt-BR")}` }))}
            />
          )}
          {selectedMemberId && memberEnrollments.length === 0 && (
            <p className="text-xs text-muted-foreground">Este aluno não tem matrícula de Teologia.</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Transações vinculadas</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setLinkDialogOpen(true)}
          disabled={!canLinkFinance || (!selectedEnrollmentId && !selectedPeriodId)}
          title={!canLinkFinance ? "Exige finance.write e theology.manage" : undefined}
        >
          <Link2 size={14} className="mr-1.5" /> Vincular transação
        </Button>
      </div>

      {!selectedEnrollmentId && !selectedPeriodId ? (
        <EmptyState title="Selecione um período ou um aluno" description="Escolha um filtro acima para ver e vincular transações do contexto acadêmico." />
      ) : loadingLinked ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-6"><Loader2 className="animate-spin" size={14} /> Carregando transações…</div>
      ) : linkError ? (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Não foi possível carregar as transações vinculadas. {linkError}
        </div>
      ) : linkedTransactions.length === 0 ? (
        <EmptyState title="Nenhuma transação vinculada ainda" description="Vincule uma transação já lançada no Financeiro a este contexto acadêmico." />
      ) : (
        <div className="space-y-1.5">
          {linkedTransactions.map((t) => (
            <Card key={t.link_id}>
              <CardContent className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm truncate">{t.transaction_description || THEOLOGY_TRANSACTION_LINK_TYPE_LABELS[t.link_type as TheologyTransactionLinkType]}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(`${t.transaction_date}T00:00:00`).toLocaleDateString("pt-BR")} · {t.transaction_status}
                  </p>
                </div>
                <p className="text-sm font-medium shrink-0">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(t.amount)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {linkDialogOpen && (
        <LinkTransactionDialog
          enrollmentId={selectedEnrollmentId || null}
          periodId={!selectedEnrollmentId ? selectedPeriodId || null : null}
          onClose={() => setLinkDialogOpen(false)}
          onLinked={loadLinked}
        />
      )}
    </div>
  );
}

function LinkTransactionDialog({ enrollmentId, periodId, onClose, onLinked }: {
  enrollmentId: string | null;
  periodId: string | null;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [transactionId, setTransactionId] = useState("");
  const [linkType, setLinkType] = useState<TheologyTransactionLinkType>("matricula");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!transactionId.trim()) { toast.error("Informe o ID da transação já lançada no Financeiro."); return; }
    setSaving(true);
    const { error } = await linkTheologyTransaction({
      transaction_id: transactionId.trim(),
      link_type: linkType,
      enrollment_id: enrollmentId,
      period_id: periodId,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(`Não foi possível vincular a transação: ${error}`); return; }
    toast.success("Transação vinculada ao contexto acadêmico.");
    onClose();
    onLinked();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Vincular transação do Financeiro</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Informe o ID de uma transação já lançada no Financeiro (Tesouraria). Este vínculo não cria nem altera valores —
            apenas registra o contexto acadêmico da transação real.
          </p>
          <FormInputLabeled label="ID da transação" value={transactionId} onChange={setTransactionId} required placeholder="UUID da transação" />
          <FormSelectLabeled label="Tipo de vínculo" value={linkType} onChange={(v) => setLinkType(v as TheologyTransactionLinkType)} options={THEOLOGY_TRANSACTION_LINK_TYPES.map((t) => ({ value: t, label: THEOLOGY_TRANSACTION_LINK_TYPE_LABELS[t] }))} />
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
