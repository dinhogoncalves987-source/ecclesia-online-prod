import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Wallet, Users, Calendar, BookOpen, Heart,
  MessageSquare, BarChart3, Shield, ChevronRight, ArrowRight
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

const features = [
  { icon: LayoutDashboard, title: "Dashboard Executivo", desc: "Visão gerencial completa com métricas em tempo real." },
  { icon: Wallet, title: "Tesouraria", desc: "Controle financeiro robusto com relatórios detalhados." },
  { icon: Users, title: "Gestão de Membros", desc: "Cadastro completo de membros e visitantes." },
  { icon: Calendar, title: "Agenda Integrada", desc: "Calendário institucional para toda a comunidade." },
  { icon: BookOpen, title: "Bíblia Sagrada", desc: "Leitura confortável com modo noturno integrado." },
  { icon: Heart, title: "Pedidos de Oração", desc: "Acompanhamento pastoral e intercessão comunitária." },
  { icon: MessageSquare, title: "Comunicação", desc: "Avisos, mensagens e comunicados centralizados." },
  { icon: BarChart3, title: "Relatórios", desc: "Dados estratégicos para tomada de decisão." },
];

const transition = { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] };

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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
              Entrar
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-accent/5 to-transparent pointer-events-none" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-32 relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={transition}
            className="max-w-3xl"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent/10 rounded-full text-xs font-medium text-accent mb-6">
              <Shield size={12} />
              Gestão eclesiástica de excelência
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-serif tracking-tight leading-tight">
              A excelência na gestão{" "}
              <span className="text-accent">a serviço do Reino.</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
              Um sistema completo, sofisticado e confiável para administrar sua igreja com a seriedade que ela merece.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/admin" className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity">
                Acessar o Sistema <ArrowRight size={16} />
              </Link>
              <a href="#modulos" className="inline-flex items-center gap-2 px-6 py-3 bg-secondary rounded-lg font-medium hover:bg-secondary/80 transition-colors">
                Conhecer Módulos
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Modules */}
      <section id="modulos" className="py-20 bg-secondary/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-serif tracking-tight">Módulos do Sistema</h2>
            <p className="mt-3 text-muted-foreground max-w-lg mx-auto">
              Cada módulo foi projetado com precisão para atender às necessidades reais da sua igreja.
            </p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ...transition, delay: i * 0.05 }}
                className="bg-card p-5 rounded-xl shadow-executive hover:shadow-executive-hover transition-shadow"
              >
                <div className="p-2.5 bg-accent/10 rounded-lg w-fit mb-3">
                  <f.icon size={20} strokeWidth={1.5} className="text-accent" />
                </div>
                <h3 className="font-medium text-sm">{f.title}</h3>
                <p className="text-xs text-muted-foreground mt-1">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={transition}
            className="bg-primary text-primary-foreground rounded-2xl p-8 sm:p-12 text-center"
          >
            <h2 className="text-2xl sm:text-3xl font-serif tracking-tight">
              Pronto para transformar a gestão da sua igreja?
            </h2>
            <p className="mt-3 text-primary-foreground/70 max-w-md mx-auto">
              Comece agora e eleve o nível de organização da sua comunidade.
            </p>
            <Link to="/admin" className="inline-flex items-center gap-2 mt-6 px-6 py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:opacity-90 transition-opacity">
              Começar Agora <ArrowRight size={16} />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary rounded-md flex items-center justify-center">
              <span className="text-accent font-serif text-sm">Ω</span>
            </div>
            <span className="font-serif text-sm">Ecclesia Admin</span>
          </div>
          <p className="text-xs text-muted-foreground">© 2026 Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
