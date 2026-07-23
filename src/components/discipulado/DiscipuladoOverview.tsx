/**
 * Visão Geral do Discipulado (OPERAÇÃO 2). Todos os números vêm de consultas
 * reais às tabelas discipleship_* — nenhum valor fictício. Enquanto as
 * migrations não forem aplicadas em nenhum ambiente, os cartões mostram o
 * estado vazio explicando isso (ver EmptyState).
 */
import { useEffect, useMemo, useState } from "react";
import { GraduationCap, Users, CheckCircle2, Percent, AlertTriangle, CalendarClock, Loader2, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  loadDiscipleshipCourses, loadDiscipleshipClasses, loadDiscipleshipEnrollmentsForClasses,
  loadDiscipleshipSessionsForClasses, loadDiscipleshipAttendanceForSessions,
  type DiscipleshipClassRow, type DiscipleshipCourseRow, type DiscipleshipEnrollmentRow,
  type DiscipleshipSessionRow,
} from "@/lib/discipleship/service";
import { calculateAttendancePercentage } from "@/lib/discipleship/rules";
import { DISCIPLESHIP_ATTENDANCE_COUNTED_STATUSES, type DiscipleshipAttendanceStatus } from "@/lib/discipleship/constants";
import { EmptyState } from "./discipuladoFormHelpers";

type OverviewData = {
  courses: DiscipleshipCourseRow[];
  classes: DiscipleshipClassRow[];
  enrollments: DiscipleshipEnrollmentRow[];
  upcomingSessions: Array<DiscipleshipSessionRow & { className: string; courseName: string }>;
  attendancePercentage: number | null;
  pendingCount: number;
};

export function DiscipuladoOverview({ organizationId }: { organizationId: string }) {
  const [loading, setLoading] = useState(true);
  const [moduleUnavailable, setModuleUnavailable] = useState(false);
  const [data, setData] = useState<OverviewData | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [coursesRes, classesRes] = await Promise.all([
        loadDiscipleshipCourses(organizationId),
        loadDiscipleshipClasses(organizationId),
      ]);

      // Tabela ainda não existe neste ambiente (migrations não aplicadas) —
      // nunca tratamos isso como "zero cursos", mas como módulo aguardando aplicação.
      if (coursesRes.error?.code === "42P01" || classesRes.error?.code === "42P01") {
        if (!cancelled) { setModuleUnavailable(true); setLoading(false); }
        return;
      }

      const classIds = classesRes.rows.map((c) => c.id);
      const [enrollmentsRes, sessionsRes] = await Promise.all([
        loadDiscipleshipEnrollmentsForClasses(classIds),
        loadDiscipleshipSessionsForClasses(classIds),
      ]);
      const sessionIds = sessionsRes.rows.map((s) => s.id);
      const attendanceRes = await loadDiscipleshipAttendanceForSessions(sessionIds);

      const classById = new Map(classesRes.rows.map((c) => [c.id, c]));
      const courseById = new Map(coursesRes.rows.map((c) => [c.id, c]));

      const today = new Date().toISOString().slice(0, 10);
      const upcomingSessions = sessionsRes.rows
        .filter((s) => s.status === "agendada" && s.session_date >= today)
        .slice(0, 5)
        .map((s) => {
          const cls = classById.get(s.class_id);
          const course = cls ? courseById.get(cls.course_id) : undefined;
          return { ...s, className: cls?.name ?? "Turma", courseName: course?.name ?? "Curso" };
        });

      const attendancePercentage = calculateAttendancePercentage(
        attendanceRes.rows
          .filter((a) => (DISCIPLESHIP_ATTENDANCE_COUNTED_STATUSES as readonly string[]).includes(a.status))
          .map((a) => a.status as DiscipleshipAttendanceStatus),
      );

      // Pendência simples: matrícula ativa numa turma cujo curso exige
      // frequência e cuja frequência lançada já está abaixo do mínimo.
      const attendanceByEnrollment = new Map<string, DiscipleshipAttendanceStatus[]>();
      for (const a of attendanceRes.rows) {
        const list = attendanceByEnrollment.get(a.enrollment_id) ?? [];
        list.push(a.status as DiscipleshipAttendanceStatus);
        attendanceByEnrollment.set(a.enrollment_id, list);
      }
      let pendingCount = 0;
      for (const enrollment of enrollmentsRes.rows) {
        if (enrollment.status !== "ativo") continue;
        const cls = classById.get(enrollment.class_id);
        const course = cls ? courseById.get(cls.course_id) : undefined;
        if (!course?.requires_attendance) continue;
        const pct = calculateAttendancePercentage(attendanceByEnrollment.get(enrollment.id) ?? []);
        if (pct !== null && pct < course.minimum_attendance_percentage) pendingCount += 1;
      }

      if (!cancelled) {
        setData({
          courses: coursesRes.rows,
          classes: classesRes.rows,
          enrollments: enrollmentsRes.rows,
          upcomingSessions,
          attendancePercentage,
          pendingCount,
        });
        setModuleUnavailable(false);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [organizationId]);

  const metrics = useMemo(() => {
    if (!data) return null;
    return {
      activeCourses: data.courses.filter((c) => c.status === "ativo").length,
      openClasses: data.classes.filter((c) => c.status === "inscricoes_abertas" || c.status === "em_andamento").length,
      activeStudents: data.enrollments.filter((e) => e.status === "ativo" || e.status === "matriculado").length,
      completions: data.enrollments.filter((e) => e.status === "concluido").length,
    };
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="animate-spin" size={18} /> Carregando visão geral…
      </div>
    );
  }

  if (moduleUnavailable) {
    return (
      <EmptyState
        title="Discipulado aguardando aplicação das migrations"
        description="As estruturas de banco deste módulo (discipleship_courses, discipleship_classes, etc.) ainda não foram aplicadas neste ambiente. Nenhum dado será exibido até a aplicação e validação das migrations em staging."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard icon={GraduationCap} label="Cursos ativos" value={metrics?.activeCourses ?? 0} />
        <MetricCard icon={Users} label="Turmas abertas" value={metrics?.openClasses ?? 0} />
        <MetricCard icon={Users} label="Alunos ativos" value={metrics?.activeStudents ?? 0} />
        <MetricCard icon={CheckCircle2} label="Conclusões" value={metrics?.completions ?? 0} />
        <MetricCard
          icon={Percent}
          label="Frequência média"
          value={data?.attendancePercentage !== null && data?.attendancePercentage !== undefined ? `${data.attendancePercentage.toFixed(0)}%` : "—"}
        />
        <MetricCard icon={AlertTriangle} label="Com pendência" value={data?.pendingCount ?? 0} tone={data && data.pendingCount > 0 ? "warning" : "neutral"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock size={18} /> Próximas aulas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!data || data.upcomingSessions.length === 0 ? (
            <EmptyState
              title="Nenhuma aula agendada"
              description="Registre um encontro numa turma em andamento para vê-lo aqui."
            />
          ) : (
            <div className="space-y-2">
              {data.upcomingSessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/60">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.courseName} — {s.className}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.session_date + "T00:00:00").toLocaleDateString("pt-BR")}
                      {s.session_time ? ` às ${s.session_time.slice(0, 5)}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, tone = "neutral" }: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: "neutral" | "warning";
}) {
  return (
    <Card className={tone === "warning" && Number(value) > 0 ? "border-amber-500/40" : ""}>
      <CardContent className="p-4 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Icon size={14} />
          <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
        </div>
        <span className="text-2xl font-serif">{value}</span>
      </CardContent>
    </Card>
  );
}
