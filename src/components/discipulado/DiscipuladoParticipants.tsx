/**
 * Participantes (OPERAÇÃO 2) — localiza uma pessoa já existente em
 * public.members (reaproveitando o seletor escopado do módulo, nunca um novo
 * cadastro) e mostra SOMENTE os dados do Discipulado dessa
 * pessoa, com link para o perfil institucional completo do membro
 * (src/pages/MemberProfile.tsx) — sem duplicar o formulário de membros.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, ExternalLink, GraduationCap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  loadDiscipleshipEnrollmentsForMember, loadDiscipleshipClassesByIds, loadDiscipleshipCoursesByIds,
  type DiscipleshipEnrollmentRow,
} from "@/lib/discipleship/service";
import { DISCIPLESHIP_ENROLLMENT_STATUS_LABELS, type DiscipleshipEnrollmentStatus } from "@/lib/discipleship/constants";
import { StatusPill, EmptyState } from "./discipuladoFormHelpers";
import { DiscipuladoMemberPicker } from "./DiscipuladoMemberPicker";

type PickableMember = { id: string; full_name: string; known_name: string | null };

export function DiscipuladoParticipants({ organizationId }: { organizationId: string }) {
  const [selected, setSelected] = useState<PickableMember | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-serif">Participantes</h2>
        <p className="text-sm text-muted-foreground">Localize um membro já cadastrado para ver seu histórico no Discipulado.</p>
      </div>

      {!selected ? (
        <Card>
          <CardContent className="p-4">
            <DiscipuladoMemberPicker organizationId={organizationId} onSelect={setSelected} />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <button onClick={() => setSelected(null)} className="text-sm text-primary hover:underline">← Buscar outra pessoa</button>
          <ParticipantHistory member={selected} />
        </div>
      )}
    </div>
  );
}

function ParticipantHistory({ member }: { member: PickableMember }) {
  const [loading, setLoading] = useState(true);
  const [enrollments, setEnrollments] = useState<DiscipleshipEnrollmentRow[]>([]);
  const [classInfoByClassId, setClassInfoByClassId] = useState<Map<string, { class: string; course: string }>>(new Map());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const enrollmentsRes = await loadDiscipleshipEnrollmentsForMember(member.id);
      const classIds = [...new Set(enrollmentsRes.rows.map((e) => e.class_id))];
      const classesRes = await loadDiscipleshipClassesByIds(classIds);
      const courseIds = [...new Set(classesRes.rows.map((c) => c.course_id))];
      const coursesRes = await loadDiscipleshipCoursesByIds(courseIds);
      const courseNameById = new Map(coursesRes.rows.map((c) => [c.id, c.name]));
      const classInfo = new Map(
        classesRes.rows.map((c) => [c.id, { class: c.name, course: courseNameById.get(c.course_id) ?? "Curso" }]),
      );
      if (!cancelled) {
        setEnrollments(enrollmentsRes.rows);
        setClassInfoByClassId(classInfo);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [member.id]);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium flex items-center gap-2"><GraduationCap size={16} /> {member.known_name || member.full_name}</p>
          <Link to={`/admin/membros/${member.id}`} className="text-xs text-primary hover:underline flex items-center gap-1">
            Ver perfil institucional <ExternalLink size={12} />
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4"><Loader2 className="animate-spin" size={14} /> Carregando…</div>
        ) : enrollments.length === 0 ? (
          <EmptyState title="Nenhuma matrícula no Discipulado" description="Esta pessoa ainda não foi matriculada em nenhuma turma." />
        ) : (
          <div className="space-y-1.5">
            {enrollments.map((e) => {
              const info = classInfoByClassId.get(e.class_id);
              return (
                <div key={e.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border/60">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{info?.course ?? "Curso"} — {info?.class ?? "Turma"}</p>
                    <p className="text-xs text-muted-foreground">Matriculado em {new Date(e.enrolled_at).toLocaleDateString("pt-BR")}</p>
                  </div>
                  <StatusPill label={DISCIPLESHIP_ENROLLMENT_STATUS_LABELS[e.status as DiscipleshipEnrollmentStatus]} tone="info" />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
