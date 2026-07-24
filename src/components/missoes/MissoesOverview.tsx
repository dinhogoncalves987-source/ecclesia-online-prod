/**
 * Visão Geral de Missões (OPERAÇÃO 4) — nunca números inventados: cada
 * contagem vem de get_missions_dashboard_summary(), uma RPC derivada em
 * tempo real (nenhuma tabela de relatório persistida). Erro de banco nunca
 * é tratado como lista vazia (ver §15 da operação) — se o carregamento
 * falhar, o card mostra o erro real, não "0".
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Send, Users2, Landmark, HeartHandshake, Compass } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useRole } from "@/hooks/useRole";
import { getMissionsDashboardSummary, type MissionsDashboardSummary } from "@/lib/missions/service";
import { EmptyState } from "./missoesFormHelpers";

export function MissoesOverview({ organizationId }: { organizationId: string }) {
  const { hasCapability } = useRole();
  const canViewFinance = hasCapability("finance.read");
  const [loading, setLoading] = useState(true);
  const [moduleUnavailable, setModuleUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [summary, setSummary] = useState<MissionsDashboardSummary | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await getMissionsDashboardSummary(organizationId);
    if (res.error && (res.error.includes("42P01") || res.error.toLowerCase().includes("does not exist") || res.error.toLowerCase().includes("could not find"))) {
      setModuleUnavailable(true);
      setLoading(false);
      return;
    }
    setLoadError(res.error);
    setSummary(res.row);
    setModuleUnavailable(false);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { void reload(); }, [reload]);

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="animate-spin" size={18} /> Carregando visão geral…</div>;
  }

  if (moduleUnavailable) {
    return (
      <EmptyState
        title="Missões aguardando aplicação das migrations"
        description="As tabelas missions_* ainda não existem neste ambiente. Um administrador precisa aplicar as migrations 20260731* antes que este módulo possa ser usado."
      />
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Não foi possível carregar a visão geral de Missões. {loadError}
      </div>
    );
  }

  if (!summary) {
    return <EmptyState title="Nenhum dado disponível ainda" description="Cadastre o primeiro missionário ou projeto para começar." />;
  }

  const totalMissionaries = summary.missionaries_candidato + summary.missionaries_em_preparacao + summary.missionaries_ativo
    + summary.missionaries_em_licenca + summary.missionaries_retornado + summary.missionaries_encerrado;

  const currency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const cards = [
    { icon: Send, label: "Missionários ativos", value: summary.missionaries_ativo },
    { icon: Compass, label: "Projetos ativos", value: summary.projects_ativo },
    { icon: HeartHandshake, label: "Apoiadores ativos", value: summary.supporters_ativo },
    { icon: Users2, label: "Compromissos ativos", value: summary.commitments_ativo },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-serif flex items-center gap-2"><Send size={20} /> Missões</h2>
        <p className="text-sm text-muted-foreground">
          Missionários, apoiadores, compromissos, projetos e financeiro missionário — tudo sobre a mesma pessoa
          cadastrada na Secretaria e sobre as mesmas transações reais do Financeiro.
        </p>
      </div>

      {totalMissionaries === 0 ? (
        <EmptyState
          title="Nenhum missionário cadastrado ainda"
          description="Comece pela aba “Missionários”: cadastre o primeiro missionário a partir de um membro já existente na Secretaria."
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {cards.map((c) => (
            <Card key={c.label}>
              <CardContent className="p-4 space-y-1">
                <c.icon size={16} className="text-muted-foreground" />
                <p className="text-2xl font-serif">{c.value}</p>
                <p className="text-xs text-muted-foreground">{c.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {canViewFinance
        && summary.expected_total_amount !== null
        && summary.received_total_amount !== null
        && summary.installments_pending_count !== null
        && summary.installments_pending_amount !== null
        && summary.installments_overdue_count !== null
        && summary.installments_overdue_amount !== null ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-medium flex items-center gap-1.5"><Landmark size={14} /> Previsto × Recebido</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Previsto</span>
                  <span className="font-medium">{currency(summary.expected_total_amount)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Recebido (transações reais)</span>
                  <span className="font-medium">{currency(summary.received_total_amount)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Valores derivados em tempo real do Financeiro — nunca uma segunda contabilidade.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-medium">Parcelas em aberto</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Pendentes</span>
                  <span className="font-medium">{summary.installments_pending_count} · {currency(summary.installments_pending_amount)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Atrasadas</span>
                  <span className="font-medium text-destructive">{summary.installments_overdue_count} · {currency(summary.installments_overdue_amount)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <EmptyState
            title="Indicadores financeiros protegidos"
            description="As informações de valores e parcelas aparecem somente para quem também possui finance.read."
          />
        )}

      {summary.missionaries_candidato + summary.missionaries_em_preparacao > 0 && (
        <EmptyState
          title={`${summary.missionaries_candidato + summary.missionaries_em_preparacao} missionário(s) em candidatura/preparação`}
          description="Acompanhe na aba “Missionários” para conduzir a preparação até o envio."
        />
      )}
    </div>
  );
}
