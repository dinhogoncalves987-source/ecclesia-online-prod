import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Wallet, Users, Calendar, BookOpen, Heart,
  MessageSquare, BarChart3, Shield, ChevronRight, ArrowRight
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useLanguage } from "@/hooks/useLanguage";

const transition = { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] };

export default function Landing() {
  const { t } = useLanguage();

  const features = [
    { icon: LayoutDashboard, title: t("Dashboard Executivo"), desc: t("Visão gerencial completa com métricas em tempo real."), path: "/admin" },
    { icon: Wallet, title: t("Tesouraria"), desc: t("Controle financeiro robusto com relatórios detalhados."), path: "/admin/financeiro" },
    { icon: Users, title: t("Gestão de Membros"), desc: t("Cadastro completo de membros e visitantes."), path: "/admin/membros" },
    { icon: Calendar, title: t("Agenda Integrada"), desc: t("Calendário institucional para toda a comunidade."), path: "/admin/agenda" },
    { icon: BookOpen, title: t("Bíblia Sagrada"), desc: t("Leitura confortável com modo noturno integrado."), path: "/admin/biblia" },
    { icon: Heart, title: t("Pedidos de Oração"), desc: t("Acompanhamento pastoral e intercessão comunitária."), path: "/admin/oracoes" },
    { icon: MessageSquare, title: t("Comunicação"), desc: t("Avisos, mensagens e comunicados centralizados."), path: "/admin/comunicacao" },
    { icon: BarChart3, title: t("Relatórios"), desc: t("Dados estratégicos para tomada de decisão."), path: "/admin/relatorios" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-accent font-serif text-xl">Ω</span>
            </div>
            <span className="font-serif text-xl tracking-tight">Ecclesia</span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link to="/admin" className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
              {t("Entrar")}
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-accent/5 to-transparent pointer-events-none" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-32 relative">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={transition} className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent/10 rounded-full text-xs font-medium text-accent mb-6">
              <Shield size={12} />
              {t("Gestão eclesiástica de excelência")}
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-serif tracking-tight leading-tight">
              {t("A excelência na gestão")}{" "}
              <span className="text-accent">{t("a serviço do Reino.")}</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
              {t("Um sistema completo, sofisticado e confiável para administrar sua igreja com a seriedade que ela merece.")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/admin" className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity">
                {t("Acessar o Sistema")} <ArrowRight size={16} />
              </Link>
              <a href="#modulos" className="inline-flex items-center gap-2 px-6 py-3 bg-secondary rounded-lg font-medium hover:bg-secondary/80 transition-colors">
                {t("Conhecer Módulos")}
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      <section id="modulos" className="py-20 bg-secondary/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-serif tracking-tight">{t("Módulos do Sistema")}</h2>
            <p className="mt-3 text-muted-foreground max-w-lg mx-auto">
              {t("Cada módulo foi projetado com precisão para atender às necessidades reais da sua igreja.")}
            </p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((f) => (
              <Link key={f.title} to={f.path} className="bg-card p-5 rounded-xl shadow-executive hover:shadow-executive-hover transition-shadow block">
                <div className="p-2.5 bg-accent/10 rounded-lg w-fit mb-3">
                  <f.icon size={20} strokeWidth={1.5} className="text-accent" />
                </div>
                <h3 className="font-medium text-sm">{f.title}</h3>
                <p className="text-xs text-muted-foreground mt-1">{f.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={transition}
            className="bg-primary text-primary-foreground rounded-2xl p-8 sm:p-12 text-center">
            <h2 className="text-2xl sm:text-3xl font-serif tracking-tight">
              {t("Pronto para transformar a gestão da sua igreja?")}
            </h2>
            <p className="mt-3 text-primary-foreground/70 max-w-md mx-auto">
              {t("Comece agora e eleve o nível de organização da sua comunidade.")}
            </p>
            <Link to="/admin" className="inline-flex items-center gap-2 mt-6 px-6 py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:opacity-90 transition-opacity">
              {t("Começar Agora")} <ArrowRight size={16} />
            </Link>
          </motion.div>
        </div>
      </section>

      <footer className="border-t border-border/50 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary rounded-md flex items-center justify-center">
              <span className="text-accent font-serif text-sm">Ω</span>
            </div>
            <span className="font-serif text-sm">Ecclesia Admin</span>
          </div>
          <p className="text-xs text-muted-foreground">© 2026 {t("Todos os direitos reservados.")}</p>
        </div>
      </footer>
    </div>
  );
}
