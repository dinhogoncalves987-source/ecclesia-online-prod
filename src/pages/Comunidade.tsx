import { useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { MessageCircle, Users, X, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const communityCards = [
  {
    id: 1,
    title: "Mural de Testemunhos",
    description: "Compartilhe e leia histórias de fé, milagres e transformações vividas pela comunidade.",
    emoji: "✨",
    color: "from-yellow-500/20 to-yellow-500/5",
    iconColor: "text-yellow-600 dark:text-yellow-400",
    iconBg: "bg-yellow-500/15",
  },
  {
    id: 2,
    title: "Pedidos de Oração",
    description: "Publique e interceda por pedidos de oração de irmãos ao redor do Brasil.",
    emoji: "🙏",
    color: "from-blue-500/20 to-blue-500/5",
    iconColor: "text-blue-600 dark:text-blue-400",
    iconBg: "bg-blue-500/15",
  },
  {
    id: 3,
    title: "Rede de Pastores",
    description: "Conecte-se com pastores e líderes, troque experiências e fortaleça o ministério.",
    emoji: "⛪",
    color: "from-purple-500/20 to-purple-500/5",
    iconColor: "text-purple-600 dark:text-purple-400",
    iconBg: "bg-purple-500/15",
  },
  {
    id: 4,
    title: "Eventos Regionais",
    description: "Descubra conferências, retiros, congressos e eventos cristãos próximos a você.",
    emoji: "📅",
    color: "from-green-500/20 to-green-500/5",
    iconColor: "text-green-600 dark:text-green-400",
    iconBg: "bg-green-500/15",
  },
  {
    id: 5,
    title: "Grupos de Jovens",
    description: "Espaço dedicado à juventude cristã — debates, projetos, louvor e ação social.",
    emoji: "🔥",
    color: "from-orange-500/20 to-orange-500/5",
    iconColor: "text-orange-600 dark:text-orange-400",
    iconBg: "bg-orange-500/15",
  },
  {
    id: 6,
    title: "Ministérios de Louvor",
    description: "Conecte músicos, adoradores e ministérios. Compartilhe repertórios e arranjos.",
    emoji: "🎵",
    color: "from-pink-500/20 to-pink-500/5",
    iconColor: "text-pink-600 dark:text-pink-400",
    iconBg: "bg-pink-500/15",
  },
  {
    id: 7,
    title: "Voluntariado",
    description: "Encontre oportunidades de servir em projetos sociais, missões e ações comunitárias.",
    emoji: "❤️",
    color: "from-red-500/20 to-red-500/5",
    iconColor: "text-red-600 dark:text-red-400",
    iconBg: "bg-red-500/15",
  },
  {
    id: 8,
    title: "Estudos Bíblicos",
    description: "Participe de grupos de estudo, lições expositivas e debates teológicos online.",
    emoji: "📖",
    color: "from-teal-500/20 to-teal-500/5",
    iconColor: "text-teal-600 dark:text-teal-400",
    iconBg: "bg-teal-500/15",
  },
];

export default function Comunidade() {
  const [showModal, setShowModal] = useState(false);

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <MessageCircle size={20} className="text-primary" strokeWidth={1.5} />
              </div>
              <h1 className="font-serif text-2xl font-semibold text-foreground">Comunidade</h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Uma rede cristã para igrejas, líderes e membros se conectarem e crescerem juntos.
            </p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent/10 border border-accent/20">
            <Sparkles size={14} className="text-accent" />
            <span className="text-xs font-semibold text-accent">Em desenvolvimento</span>
          </div>
        </div>

        {/* Coming soon banner */}
        <div className="rounded-2xl bg-gradient-to-r from-primary/10 via-accent/10 to-primary/5 border border-primary/20 px-6 py-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Users size={22} className="text-primary" strokeWidth={1.5} />
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">Comunidade chegando em breve</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Em breve igrejas, líderes e membros poderão interagir, compartilhar testemunhos, eventos e pedidos de oração.
            </p>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Igrejas cadastradas", value: "1.200+", icon: "⛪" },
            { label: "Membros conectados", value: "48.000+", icon: "👥" },
            { label: "Cidades alcançadas", value: "380+", icon: "📍" },
            { label: "Estados cobertos", value: "27", icon: "🇧🇷" },
          ].map((stat) => (
            <div key={stat.label} className="bg-card rounded-xl border border-border px-4 py-3 text-center">
              <div className="text-xl mb-1">{stat.icon}</div>
              <p className="text-lg font-bold text-foreground">{stat.value}</p>
              <p className="text-[11px] text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Community cards */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Funcionalidades previstas
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {communityCards.map((card) => (
              <div
                key={card.id}
                className="bg-card rounded-2xl border border-border shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 flex flex-col overflow-hidden group"
              >
                {/* Card header gradient */}
                <div className={`h-24 bg-gradient-to-br ${card.color} flex items-center justify-center relative`}>
                  <span className="text-4xl select-none">{card.emoji}</span>
                  <div className="absolute top-3 left-3">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-primary/90 text-primary-foreground">
                      Em breve
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 flex flex-col flex-1">
                  <h3 className="font-semibold text-foreground text-sm leading-snug">{card.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1.5 flex-1 leading-relaxed">{card.description}</p>
                  <button
                    onClick={() => setShowModal(true)}
                    className="mt-4 w-full py-2 rounded-lg border border-primary/40 text-primary text-xs font-semibold hover:bg-primary hover:text-primary-foreground active:scale-95 transition-all"
                  >
                    Acessar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50"
              onClick={() => setShowModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div className="bg-card rounded-2xl shadow-2xl border border-border p-8 w-full max-w-sm pointer-events-auto relative">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
                    <MessageCircle size={28} className="text-primary" strokeWidth={1.5} />
                  </div>
                  <h3 className="font-serif text-xl font-semibold text-foreground mb-2">
                    Comunidade em breve
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Em breve igrejas, líderes e membros poderão interagir, compartilhar testemunhos, eventos e pedidos de oração.
                  </p>
                  <button
                    onClick={() => setShowModal(false)}
                    className="mt-6 w-full px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
                  >
                    Entendido
                  </button>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground"
                >
                  <X size={16} />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}
