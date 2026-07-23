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
  type DiscipleshipSessionRow,
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
  missingAttendance: number;
};

export function DiscipuladoReports({ organizationId }: { organizationId: string }) {
  const [loading, setLoading] = useState(true);
  const [moduleUnavailable, setModuleUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<ClassReportRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      const [classesRes, coursesRes] = await Promise.all([
        loadDiscipleshipClasses(organizationId),
        loadDiscipleshipCourses(organizationId),
      ]);
      if (classesRes.error?.code === "42P01") {
        if (!cancelled) { setModuleUnavailable(true); setLoading(false); }
        return;
      }
      if (classesRes.error || coursesRes.error) {
        if (!cancelled) {
          setLoadError(classesRes.error?.message ?? coursesRes.error?.message ?? "Não foi possível carregar os relatórios.");
          setLoading(false);
        }
        return;
      }
      const classIds = classesRes.rows.map((c) => c.id);
      const [enrollmentsRes, sessionsRes] = await Promise.all([
        loadDiscipleshipEnrollmentsForClasses(classIds),
        loadDiscipleshipSessionsForClasses(classIds),
      ]);
      if (enrollmentsRes.error || sessionsRes.error) {
        if (!cancelled) {
          setLoadError(enrollmentsRes.error?.message ?? sessionsRes.error?.message ?? "Não foi possível carregar os registros acadêmicos.");
          setLoading(false);
        }
        return;
      }
      const sessionsByClass = new Map<string, DiscipleshipSessionRow[]>();
      for (const s of sessionsRes.rows) {
        const list = sessionsByClass.get(s.class_id) ?? [];
        list.push(s);
        sessionsByClass.set(s.class_id, list);
      }
      const allSessionIds = sessionsRes.rows.map((s) => s.id);
      const attendanceRes = await loadDiscipleshipAttendanceForSessions(allSessionIds);
      if (attendanceRes.error) {
        if (!cancelled) {
          setLoadError(attendanceRes.error.message);
          setLoading(false);
        }
        return;
      }
      const attendanceByEnrollmentAndSession = new Map<string, DiscipleshipAttendanceStatus>();
      for (const a of attendanceRes.rows) {
        attendanceByEnrollmentAndSession.set(
          `${a.enrollment_id}:${a.session_id}`,
          a.status as DiscipleshipAttendanceStatus,
        );
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
        const completedSessions = (sessionsByClass.get(cls.id) ?? []).filter((session) => session.status === "realizada");
        const expectedStatuses: DiscipleshipAttendanceStatus[] = [];
        let missingAttendance = 0;
        for (const enrollment of enrollments) {
          const enrolledDate = enrollment.enrolled_at.slice(0, 10);
          const completedDate = enrollment.completed_at?.slice(0, 10) ?? null;
          for (const session of completedSessions) {
            if (session.session_date < enrolledDate || (completedDate && session.session_date > completedDate)) continue;
            const status = attendanceByEnrollmentAndSession.get(`${enrollment.id}:${session.id}`) ?? "nao_lancado";
            expectedStatuses.push(status);
            if (status === "nao_lancado") missingAttendance += 1;
          }
        }
        return {
          cls,
          courseName: courseNameById.get(cls.course_id) ?? "Curso",
          activeStudents: enrollments.filter((e) => e.status === "ativo" || e.status === "matriculado").length,
          completed: enrollments.filter((e) => e.status === "concluido").length,
          attendancePercentage: calculateAttendancePercentage(expectedStatuses),
          missingAttendance,
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

  if (loadError) {
    return <EmptyState title="Não foi possível carregar os relatórios" description={loadError} />;
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
        {rows.map(({ cls, courseName, activeStudents, completed, attendancePercentage, missingAttendance }) => (
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
              <div>
                <p className="text-lg font-serif">{attendancePercentage !== null ? `${attendancePercentage.toFixed(0)}%` : "—"}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Frequência</p>
                {missingAttendance > 0 && <p className="text-[10px] text-amber-600">{missingAttendance} pendente(s)</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
