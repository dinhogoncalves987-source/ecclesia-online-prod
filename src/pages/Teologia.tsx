/**
 * Teologia (OPERAÇÃO 3) — módulo real sobre a Fundação Compartilhada, a
 * Secretaria e o Discipulado já revisados (ver
 * docs/architecture/operacao-3-teologia.md).
 *
 * Staging-only enquanto as migrations theology_* não forem aplicadas em
 * nenhum ambiente (ver src/config/modules.ts) — esta página só é
 * lazy-importada pelo App.tsx quando IS_STAGING_BUILD é true. Mesmo padrão
 * de abas com scroll horizontal de src/pages/Discipulado.tsx, para
 * consistência visual do cockpit.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { useChurch } from "@/hooks/useChurchContext";
import { Landmark, BookOpen, CalendarRange, GraduationCap, Settings2, ChevronLeft, ChevronRight } from "lucide-react";
import { TeologiaOverview } from "@/components/teologia/TeologiaOverview";
import { TeologiaCurriculum } from "@/components/teologia/TeologiaCurriculum";
import { TeologiaPeriodsClasses } from "@/components/teologia/TeologiaPeriodsClasses";
import { TeologiaStudents } from "@/components/teologia/TeologiaStudents";
import { TeologiaFinance } from "@/components/teologia/TeologiaFinance";
import { TeologiaSettings } from "@/components/teologia/TeologiaSettings";

const TABS = [
  { key: "overview", icon: Landmark, label: "Visão Geral" },
  { key: "curriculum", icon: BookOpen, label: "Currículo" },
  { key: "periods", icon: CalendarRange, label: "Períodos e Turmas" },
  { key: "students", icon: GraduationCap, label: "Alunos e Boletins" },
  { key: "finance", icon: Landmark, label: "Financeiro Acadêmico" },
  { key: "settings", icon: Settings2, label: "Configurações" },
] as const;

type TabKey = typeof TABS[number]["key"];

export default function Teologia() {
  const { church, loading: churchLoading } = useChurch();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const tabsRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    checkScroll();
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    el.addEventListener("scroll", checkScroll, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener("scroll", checkScroll); };
  }, [checkScroll]);

  const scrollTabs = (dir: "left" | "right") => {
    tabsRef.current?.scrollBy({ left: dir === "left" ? -160 : 160, behavior: "smooth" });
  };

  if (churchLoading) {
    return (
      <AdminLayout>
        <div className="py-16 text-center text-muted-foreground text-sm">Carregando organização…</div>
      </AdminLayout>
    );
  }

  if (!church) {
    return (
      <AdminLayout>
        <div className="py-16 text-center text-muted-foreground text-sm">
          Nenhuma organização ativa selecionada. Selecione uma igreja para acessar a Teologia.
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif tracking-tight">Teologia</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Instituto, núcleos, currículo, períodos, turmas, frequência, avaliação, boletim e formatura — tudo sobre a
            mesma pessoa cadastrada na Secretaria.
          </p>
        </div>

        <div className="relative">
          {canScrollLeft && (
            <button
              type="button"
              onClick={() => scrollTabs("left")}
              aria-label="Abas anteriores"
              className="absolute left-0 inset-y-0 z-10 px-1.5 flex items-center rounded-l-xl bg-gradient-to-r from-secondary via-secondary/90 to-transparent pointer-events-auto"
            >
              <ChevronLeft size={16} className="text-muted-foreground" />
            </button>
          )}
          <div
            ref={tabsRef}
            className="flex gap-1 bg-secondary/50 rounded-xl p-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    isActive ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon size={16} strokeWidth={1.5} />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>
          {canScrollRight && (
            <button
              type="button"
              onClick={() => scrollTabs("right")}
              aria-label="Próximas abas"
              className="absolute right-0 inset-y-0 z-10 px-1.5 flex items-center rounded-r-xl bg-gradient-to-l from-secondary via-secondary/90 to-transparent pointer-events-auto"
            >
              <ChevronRight size={16} className="text-muted-foreground" />
            </button>
          )}
        </div>

        {activeTab === "overview" && <TeologiaOverview organizationId={church.id} />}
        {activeTab === "curriculum" && <TeologiaCurriculum organizationId={church.id} />}
        {activeTab === "periods" && <TeologiaPeriodsClasses organizationId={church.id} />}
        {activeTab === "students" && <TeologiaStudents organizationId={church.id} />}
        {activeTab === "finance" && <TeologiaFinance organizationId={church.id} />}
        {activeTab === "settings" && <TeologiaSettings organizationId={church.id} />}
      </div>
    </AdminLayout>
  );
}
