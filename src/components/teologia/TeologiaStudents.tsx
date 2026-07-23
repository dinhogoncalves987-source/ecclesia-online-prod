/**
 * Alunos, Boletins e Formandos (OPERAÇÃO 3) — traduz "Alunos Teologia",
 * "Boletins — Frequência e Avaliação", "Históricos — Unidades Concluídas"
 * e "Formandos no Período Letivo" do WinTechi. Nunca baixa a lista completa
 * de membros da organização — a busca é sempre server-side e escopada
 * (searchTheologyMembers), e o boletim vem de uma RPC derivada
 * (get_theology_student_transcript), nunca de dados persistidos/duplicados.
 */
import { useCallback, useEffect, useState } from "react";
import { GraduationCap, Loader2, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  getTheologyStudentTranscript, listTheologyPeriodGraduates, loadTheologyPeriods, getTheologyMemberLabels,
  type TheologyStudentTranscriptRow, type TheologyPeriodGraduateRow, type TheologyPeriodRow,
} from "@/lib/theology/service";
import { StatusPill, EmptyState, FormSelectLabeled } from "./teologiaFormHelpers";
import { TeologiaMemberPicker } from "./TeologiaMemberPicker";

export function TeologiaStudents({ organizationId }: { organizationId: string }) {
  const [view, setView] = useState<"boletim" | "formandos">("boletim");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-serif flex items-center gap-2"><GraduationCap size={18} /> Alunos e Boletins</h2>
        <p className="text-sm text-muted-foreground">
          Busque um aluno já cadastrado na Secretaria para ver seu boletim e histórico de unidades, ou liste os
          possíveis formandos de um período letivo.
        </p>
      </div>

      <div className="flex gap-1.5 border-b border-border pb-2">
        {([
          { key: "boletim" as const, label: "Boletim do aluno" },
          { key: "formandos" as const, label: "Formandos no período" },
        ]).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setView(t.key)}
            aria-current={view === t.key}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === "boletim" ? <BoletimView organizationId={organizationId} /> : <FormandosView organizationId={organizationId} />}
    </div>
  );
}

function BoletimView({ organizationId }: { organizationId: string }) {
  const [memberId, setMemberId] = useState<string | null>(null);
  const [memberLabel, setMemberLabel] = useState("");
  const [rows, setRows] = useState<TheologyStudentTranscriptRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    const result = await getTheologyStudentTranscript(id, organizationId);
    setRows(result.rows);
    setError(result.error);
    setLoading(false);
  }, [organizationId]);

  const handleSelect = (id: string, label: string) => {
    setMemberId(id);
    setMemberLabel(label);
    load(id);
  };

  return (
    <div className="space-y-3">
      {!memberId ? (
        <div className="p-3 rounded-lg border border-border/60">
          <p className="text-sm font-medium mb-2 flex items-center gap-1.5"><Search size={14} /> Buscar aluno</p>
          <TeologiaMemberPicker organizationId={organizationId} onSelect={(m) => handleSelect(m.id, m.known_name || m.full_name)} />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 p-3 rounded-lg border border-border/60">
          <p className="text-sm font-medium">{memberLabel}</p>
          <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => { setMemberId(null); setRows([]); }}>Trocar aluno</button>
        </div>
      )}

      {memberId && (
        loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-6"><Loader2 className="animate-spin" size={14} /> Carregando boletim…</div>
        ) : error ? (
          <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Não foi possível carregar o boletim. {error}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="Nenhuma matrícula de Teologia encontrada" description="Este aluno ainda não foi matriculado em nenhuma turma de Teologia." />
        ) : (
          <div className="space-y-3">
            {Object.entries(groupBy(rows, (r) => r.class_id)).map(([classId, classRows]) => (
              <Card key={classId}>
                <CardContent className="p-4 space-y-2">
                  <div>
                    <p className="font-medium">{classRows[0].class_name}</p>
                    <p className="text-xs text-muted-foreground">{classRows[0].program_name} · <StatusPill label={classRows[0].enrollment_status} tone="info" /></p>
                  </div>
                  {classRows.filter((r) => r.subject_name).length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhuma matéria cursada registrada ainda nesta turma.</p>
                  ) : (
                    <div className="space-y-1">
                      {classRows.filter((r) => r.subject_name).map((r) => (
                        <div key={r.offering_enrollment_id ?? r.subject_name} className="flex items-center justify-between gap-2 text-sm border-t border-border/40 pt-1.5 first:border-t-0 first:pt-0">
                          <span className="truncate">{r.subject_name}{r.attempt_number && r.attempt_number > 1 ? ` (tentativa ${r.attempt_number})` : ""}</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {r.final_grade !== null ? `Nota: ${r.final_grade}` : "Sem nota"}
                            {r.final_result ? ` · ${r.final_result}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function FormandosView({ organizationId }: { organizationId: string }) {
  const [periods, setPeriods] = useState<TheologyPeriodRow[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [rows, setRows] = useState<TheologyPeriodGraduateRow[]>([]);
  const [memberNames, setMemberNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadTheologyPeriods(organizationId).then((res) => { if (!cancelled) setPeriods(res.rows); });
    return () => { cancelled = true; };
  }, [organizationId]);

  useEffect(() => {
    if (!periodId) { setRows([]); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    listTheologyPeriodGraduates(periodId).then(async (res) => {
      if (cancelled) return;
      setRows(res.rows);
      setError(res.error);
      const memberIds = [...new Set(res.rows.map((r) => r.member_id))];
      if (memberIds.length > 0) {
        const labels = await getTheologyMemberLabels(organizationId, memberIds);
        if (!cancelled) setMemberNames(new Map(labels.rows.map((m) => [m.id, m.known_name || m.full_name])));
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [periodId, organizationId]);

  return (
    <div className="space-y-3">
      <FormSelectLabeled label="Período letivo" value={periodId} onChange={setPeriodId} options={periods.map((p) => ({ value: p.id, label: p.name }))} placeholder="Selecionar período" />

      {!periodId ? (
        <EmptyState title="Selecione um período letivo" description="Veja quais alunos cumprem os critérios reais de formatura (unidades obrigatórias concluídas, sem pendências)." />
      ) : loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-6"><Loader2 className="animate-spin" size={14} /> Carregando…</div>
      ) : error ? (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Não foi possível carregar os formandos. {error}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="Nenhum formando neste período ainda" description="Nenhum aluno cumpre todas as regras de conclusão neste período letivo até o momento." />
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.enrollment_id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border/60">
              <div className="min-w-0">
                <p className="text-sm truncate">{memberNames.get(r.member_id) ?? "Aluno"}</p>
                <p className="text-xs text-muted-foreground">{r.class_name} · {r.program_name}</p>
              </div>
              <StatusPill label={r.already_concluded ? "Já concluído" : "Elegível para conclusão"} tone={r.already_concluded ? "neutral" : "success"} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function groupBy<T, K extends string>(items: T[], keyFn: (item: T) => K): Record<K, T[]> {
  const result = {} as Record<K, T[]>;
  for (const item of items) {
    const key = keyFn(item);
    (result[key] ??= []).push(item);
  }
  return result;
}
