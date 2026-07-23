/**
 * Relatórios do Discipulado (OPERAÇÃO 2) — indicadores derivados de dados
 * reais (discipleship_classes/enrollments/attendance), nunca números
 * fictícios. Consulta por turma, mesma fonte de dado da Visão Geral.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  loadDiscipleshipClasses, loadDiscipleshipCourses, loadDiscipleshipEnrollmentsForClasses,
  loadDiscipleshipSessionsForClasses, loadDiscipleshipAttendanceForSessions,
  type DiscipleshipClassRow, type DiscipleshipCourseRow, type DiscipleshipEnrollmentRow,
} from "@/lib/discipleship/service";
import { calculateAttendancePercentage } from "@/lib/discipleship/rules";
import { DISCIPLESHIP_CLASS_STATUS_LABELS, type DiscipleshipClassStatus, type DiscipleshipAttendanceStatus } from "@/lib/discipleship/constants";
import { StatusPill, EmptyState } from "./discipuladoFormHelpers";

type ClassReportRow = {
  cls: DiscipleshipClassRow;
  courseName: string;
  activeStudents: number;
  completed: number;
  attendancePercentage: number | null;
};

export function DiscipuladoReports({ organizationId }: { organizationId: string }) {
  const [loading, setLoading] = useState(true);
  const [moduleUnavailable, setModuleUnavailable] = useState(false);
  const [rows, setRows] = useState<ClassReportRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [classesRes, coursesRes] = await Promise.all([
        loadDiscipleshipClasses(organizationId),
        loadDiscipleshipCourses(organizationId),
      ]);
      if (classesRes.error?.code === "42P01") {
        if (!cancelled) { setModuleUnavailable(true); setLoading(false); }
        return;
      }
      const classIds = classesRes.rows.map((c) => c.id);
      const [enrollmentsRes, sessionsRes] = await Promise.all([
        loadDiscipleshipEnrollmentsForClasses(classIds),
        loadDiscipleshipSessionsForClasses(classIds),
      ]);
      const sessionsByClass = new Map<string, string[]>();
      for (const s of sessionsRes.rows) {
        const list = sessionsByClass.get(s.class_id) ?? [];
        list.push(s.id);
        sessionsByClass.set(s.class_id, list);
      }
      const allSessionIds = sessionsRes.rows.map((s) => s.id);
      const attendanceRes = await loadDiscipleshipAttendanceForSessions(allSessionIds);
      const attendanceBySession = new Map<string, DiscipleshipAttendanceStatus[]>();
      for (const a of attendanceRes.rows) {
        const list = attendanceBySession.get(a.session_id) ?? [];
        list.push(a.status as DiscipleshipAttendanceStatus);
        attendanceBySession.set(a.session_id, list);
      }
      const courseNameById = new Map(coursesRes.rows.map((c: DiscipleshipCourseRow) => [c.id, c.name]));
      const enrollmentsByClass = new Map<string, DiscipleshipEnrollmentRow[]>();
      for (const e of enrollmentsRes.rows) {
        const list = enrollmentsByClass.get(e.class_id) ?? [];
        list.push(e);
        enrollmentsByClass.set(e.class_id, list);
      }

      const reportRows: ClassReportRow[] = classesRes.rows.map((cls) => {
        const enrollments = enrollmentsByClass.get(cls.id) ?? [];
        const sessionIds = sessionsByClass.get(cls.id) ?? [];
        const attendanceStatuses = sessionIds.flatMap((id) => attendanceBySession.get(id) ?? []);
        return {
          cls,
          courseName: courseNameById.get(cls.course_id) ?? "Curso",
          activeStudents: enrollments.filter((e) => e.status === "ativo" || e.status === "matriculado").length,
          completed: enrollments.filter((e) => e.status === "concluido").length,
          attendancePercentage: calculateAttendancePercentage(attendanceStatuses),
        };
      });

      if (!cancelled) {
        setRows(reportRows);
        setModuleUnavailable(false);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [organizationId]);

  const totals = useMemo(() => ({
    classes: rows.length,
    students: rows.reduce((sum, r) => sum + r.activeStudents, 0),
    completed: rows.reduce((sum, r) => sum + r.completed, 0),
  }), [rows]);

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="animate-spin" size={18} /> Carregando relatórios…</div>;
  }

  if (moduleUnavailable) {
    return <EmptyState title="Discipulado aguardando aplicação das migrations" description="Nenhum dado disponível até a aplicação das migrations neste ambiente." />;
  }

  if (rows.length === 0) {
    return <EmptyState title="Nenhuma turma para relatar ainda" description="Crie cursos e turmas para começar a acompanhar indicadores aqui." />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-serif flex items-center gap-2"><BarChart3 size={18} /> Relatórios por turma</h2>
        <p className="text-sm text-muted-foreground">{totals.classes} turma(s) · {totals.students} aluno(s) ativo(s) · {totals.completed} conclusão(ões)</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map(({ cls, courseName, activeStudents, completed, attendancePercentage }) => (
          <Card key={cls.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between gap-2">
                <span className="truncate">{cls.name}</span>
                <StatusPill label={DISCIPLESHIP_CLASS_STATUS_LABELS[cls.status as DiscipleshipClassStatus]} tone="info" />
              </CardTitle>
              <p className="text-xs text-muted-foreground truncate">{courseName}</p>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-2 text-center">
              <div><p className="text-lg font-serif">{activeStudents}</p><p className="text-[10px] text-muted-foreground uppercase">Ativos</p></div>
              <div><p className="text-lg font-serif">{completed}</p><p className="text-[10px] text-muted-foreground uppercase">Concluídos</p></div>
              <div><p className="text-lg font-serif">{attendancePercentage !== null ? `${attendancePercentage.toFixed(0)}%` : "—"}</p><p className="text-[10px] text-muted-foreground uppercase">Frequência</p></div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
