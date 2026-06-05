import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Music2, Library, ClipboardList, BookOpen,
  Monitor, Sparkles, ChevronRight,
} from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { useLanguage } from "@/hooks/useLanguage";
import { Badge } from "@/components/ui/badge";
import { useChurch } from "@/hooks/useChurchContext";
import { toast } from "sonner";
import { ensureWorshipLoaded, getSongs, getSetlists, worshipLoadErrorMessage } from "@/lib/worshipStorage";

type Feature = {
  icon: React.ElementType;
  titleKey: string;
  descKey: string;
  href: string;
  colorClass: string;
};

const FEATURES: Feature[] = [
  {
    icon: Library,
    titleKey: "Biblioteca de Músicas",
    descKey: "Cadastre hinos e músicas da sua igreja",
    href: "/admin/culto/biblioteca",
    colorClass: "text-accent bg-accent/10",
  },
  {
    icon: ClipboardList,
    titleKey: "Roteiros de Culto",
    descKey: "Monte a programação completa do culto com ordem, letras e versículos",
    href: "/admin/culto/roteiros",
    colorClass: "text-blue-500 bg-blue-500/10",
  },
  {
    icon: BookOpen,
    titleKey: "Bíblia no Culto",
    descKey: "Acesse passagens bíblicas e integre versículos ao roteiro do culto",
    href: "/admin/biblia",
    colorClass: "text-emerald-500 bg-emerald-500/10",
  },
  {
    icon: Monitor,
    titleKey: "Telão de Projeção",
    descKey: "Projete letras e versículos para a congregação em tempo real",
    href: "/admin/culto/telao",
    colorClass: "text-purple-500 bg-purple-500/10",
  },
  {
    icon: Sparkles,
    titleKey: "Assistente de Culto IA",
    descKey: "Sugestões de hinos, montagem de escalas e conexões bíblicas com IA",
    href: "/admin/culto/assistente",
    colorClass: "text-amber-500 bg-amber-500/10",
  },
];

export default function CultoLouvor() {
  const { t } = useLanguage();
  const { church } = useChurch();
  const organizationId = church?.id;
  const [, refreshCounts] = useState(0);

  useEffect(() => {
    if (!organizationId) return;
    void ensureWorshipLoaded(organizationId)
      .then(() => refreshCounts((n) => n + 1))
      .catch((err) => {
        toast.error(
          worshipLoadErrorMessage(err, t("Erro ao carregar resumo de Culto & Louvor")),
        );
      });
  }, [organizationId, t]);

  const songCount = organizationId ? getSongs(organizationId).length : 0;
  const setlistCount = organizationId ? getSetlists(organizationId).length : 0;

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-serif font-bold text-foreground flex items-center gap-2">
            <Music2 className="text-accent" size={28} />
            {t("Culto & Louvor")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("Prepare, celebre e dirija seus cultos")}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card rounded-xl p-4 border border-border/50 text-center">
            <p className="text-2xl font-bold text-accent">{songCount}</p>
            <p className="text-xs text-muted-foreground">{t("Músicas cadastradas")}</p>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border/50 text-center">
            <p className="text-2xl font-bold text-blue-500">{setlistCount}</p>
            <p className="text-xs text-muted-foreground">{t("Roteiros salvos")}</p>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border/50 text-center">
            <p className="text-2xl font-bold text-emerald-500">5</p>
            <p className="text-xs text-muted-foreground">{t("Recursos Ativos")}</p>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border/50 text-center">
            <p className="text-2xl font-bold text-amber-500">1</p>
            <p className="text-xs text-muted-foreground">{t("IA em preparação")}</p>
          </div>
        </div>

        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            {t("Recursos do módulo")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <Link
                key={feature.titleKey}
                to={feature.href}
                className="bg-card rounded-2xl p-5 border border-border/50 flex flex-col gap-4 transition-all duration-200 hover:shadow-md hover:border-border"
              >
                <div className="flex items-start justify-between">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${feature.colorClass}`}>
                    <feature.icon size={22} />
                  </div>
                  <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-0 font-medium">
                    {t("Ativo")}
                  </Badge>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground text-sm leading-snug">
                    {t(feature.titleKey)}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                    {t(feature.descKey)}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-xs text-accent font-medium">
                  {t("Acessar")}
                  <ChevronRight size={14} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
