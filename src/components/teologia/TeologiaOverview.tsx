/**
 * Visão Geral da Teologia (OPERAÇÃO 3) — nunca números inventados: cada
 * contagem vem de uma consulta real. Erro de banco nunca é tratado como
 * lista vazia (ver §15 da operação) — se qualquer carregamento falhar, o
 * card mostra o erro real, não "0".
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Landmark, BookOpen, CalendarRange, Users2, GraduationCap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  loadTheologyInstitutes, loadTheologyPrograms, loadTheologyPeriods, loadTheologyClasses,
} from "@/lib/theology/service";
import { EmptyState } from "./teologiaFormHelpers";

export function TeologiaOverview({ organizationId }: { organizationId: string }) {
  const [loading, setLoading] = useState(true);
  const [moduleUnavailable, setModuleUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [counts, setCounts] = useState({ institutes: 0, programsActive: 0, periodsOpen: 0, classesActive: 0 });

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [institutesRes, programsRes, periodsRes, classesRes] = await Promise.all([
      loadTheologyInstitutes(organizationId),
      loadTheologyPrograms(organizationId),
      loadTheologyPeriods(organizationId),
      loadTheologyClasses(organizationId),
    ]);
    if (institutesRes.error?.code === "42P01") {
      setModuleUnavailable(true);
      setLoading(false);
      return;
    }
    const firstError = [institutesRes.error, programsRes.error, periodsRes.error, classesRes.error].find(Boolean);
    if (firstError) {
      setLoadError(firstError.message);
      setLoading(false);
      return;
    }
    setCounts({
      institutes: institutesRes.rows.length,
      programsActive: programsRes.rows.filter((p) => p.status === "ativo").length,
      periodsOpen: periodsRes.rows.filter((p) => p.status === "inscricoes_abertas" || p.status === "em_andamento").length,
      classesActive: classesRes.rows.filter((c) => c.status === "inscricoes_abertas" || c.status === "em_andamento").length,
    });
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
        title="Teologia aguardando aplicação das migrations"
        description="As tabelas theology_* ainda não existem neste ambiente. Um administrador precisa aplicar as migrations 20260730* antes que este módulo possa ser usado."
      />
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Não foi possível carregar a visão geral da Teologia. {loadError}
      </div>
    );
  }

  if (counts.institutes === 0) {
    return (
      <EmptyState
        title="Nenhum Instituto Teológico configurado ainda"
        description="Comece pela aba “Currículo”: configure o Instituto Teológico, depois cadastre núcleos, matérias e programas."
      />
    );
  }

  const cards = [
    { icon: Landmark, label: "Institutos", value: counts.institutes },
    { icon: BookOpen, label: "Programas ativos", value: counts.programsActive },
    { icon: CalendarRange, label: "Períodos em andamento/inscrição", value: counts.periodsOpen },
    { icon: Users2, label: "Turmas ativas", value: counts.classesActive },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-serif flex items-center gap-2"><GraduationCap size={20} /> Teologia</h2>
        <p className="text-sm text-muted-foreground">
          Instituto, núcleos, programas, matriz curricular, períodos, turmas, frequência, avaliação e boletim — tudo sobre a mesma pessoa cadastrada na Secretaria.
        </p>
      </div>
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
      {counts.programsActive === 0 && (
        <EmptyState title="Nenhum programa ativo" description="Cadastre uma matriz curricular na aba “Currículo” e ative o programa para poder abrir turmas." />
      )}
      {counts.programsActive > 0 && counts.periodsOpen === 0 && (
        <EmptyState title="Nenhum período letivo em andamento" description="Crie um período letivo na aba “Períodos e Turmas” para abrir turmas." />
      )}
    </div>
  );
}
