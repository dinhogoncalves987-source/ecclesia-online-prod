import { useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { ShoppingBag, Tag, Star, X, Package } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const products = [
  {
    id: 1,
    name: "Bíblia de Estudo Premium",
    category: "Livros & Bíblias",
    price: "R$ 289,90",
    badge: "Mais vendido",
    emoji: "📖",
    description: "Edição luxo com notas teológicas, mapas coloridos e concordância bíblica completa.",
  },
  {
    id: 2,
    name: "Harpa Cristã Luxo",
    category: "Livros & Bíblias",
    price: "R$ 49,90",
    badge: "Clássico",
    emoji: "🎵",
    description: "Hinário completo encadernado em couro ecológico com letras ampliadas.",
  },
  {
    id: 3,
    name: "Kit Santa Ceia",
    category: "Artigos para Culto",
    price: "R$ 129,00",
    badge: "Kit completo",
    emoji: "🍷",
    description: "Conjunto com cálices individuais, saquinhos de pão e pingadeira para até 100 pessoas.",
  },
  {
    id: 4,
    name: "Microfone para Culto",
    category: "Equipamentos",
    price: "R$ 599,00",
    badge: "Profissional",
    emoji: "🎤",
    description: "Microfone dinâmico cardioide com fio, ideal para pregações e louvores ao vivo.",
  },
  {
    id: 5,
    name: "Curso de Liderança Pastoral",
    category: "Capacitação",
    price: "R$ 197,00",
    badge: "Online",
    emoji: "🎓",
    description: "12 módulos com certificado, cobrindo gestão, pregação, aconselhamento e discipulado.",
  },
  {
    id: 6,
    name: "Congresso de Jovens 2025",
    category: "Eventos",
    price: "R$ 85,00",
    badge: "Evento",
    emoji: "🙌",
    description: "3 dias de ensino, louvor e comunhão para jovens de 15 a 30 anos. Inclui hospedagem.",
  },
  {
    id: 7,
    name: "Pack Livros de Discipulado",
    category: "Livros & Bíblias",
    price: "R$ 159,00",
    badge: "Pack 5 livros",
    emoji: "📚",
    description: "Coleção essencial para discipulado: bases da fé, vida cristã, oração e ministério.",
  },
  {
    id: 8,
    name: "Pacote de Mídia para Igreja",
    category: "Comunicação",
    price: "R$ 249,00",
    badge: "Pack digital",
    emoji: "🖥️",
    description: "Templates editáveis para Instagram, stories, slides de pregação e banner para culto.",
  },
];

const categoryColors: Record<string, string> = {
  "Livros & Bíblias": "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "Artigos para Culto": "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  "Equipamentos": "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  "Capacitação": "bg-green-500/10 text-green-600 dark:text-green-400",
  "Eventos": "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  "Comunicação": "bg-pink-500/10 text-pink-600 dark:text-pink-400",
};

export default function Marketplace() {
  const [showModal, setShowModal] = useState(false);

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <ShoppingBag size={20} className="text-primary" strokeWidth={1.5} />
              </div>
              <h1 className="font-serif text-2xl font-semibold text-foreground">Marketplace</h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Produtos e recursos para igrejas, ministérios e líderes cristãos.
            </p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent/10 border border-accent/20">
            <Star size={14} className="text-accent fill-accent" />
            <span className="text-xs font-semibold text-accent">Ecclesia Premium</span>
          </div>
        </div>

        {/* Coming soon banner */}
        <div className="rounded-2xl bg-gradient-to-r from-primary/10 via-accent/10 to-primary/5 border border-primary/20 px-6 py-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Package size={22} className="text-primary" strokeWidth={1.5} />
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">Marketplace chegando em breve</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Conectaremos igrejas, editoras, livrarias, músicos, fornecedores e ministérios em um só lugar.
            </p>
          </div>
        </div>

        {/* Products grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.map((product) => (
            <div
              key={product.id}
              className="bg-card rounded-2xl border border-border shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 overflow-hidden flex flex-col group"
            >
              {/* Product image area */}
              <div className="h-36 bg-gradient-to-br from-secondary to-secondary/50 flex items-center justify-center relative">
                <span className="text-5xl select-none">{product.emoji}</span>
                <div className="absolute top-3 left-3">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-accent/90 text-accent-foreground backdrop-blur-sm">
                    <Tag size={9} />
                    Em breve
                  </span>
                </div>
              </div>

              {/* Content */}
              <div className="p-4 flex flex-col flex-1">
                <div className="mb-1">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${categoryColors[product.category] ?? "bg-secondary text-muted-foreground"}`}>
                    {product.category}
                  </span>
                </div>
                <h3 className="font-semibold text-foreground text-sm leading-snug mt-1">{product.name}</h3>
                <p className="text-xs text-muted-foreground mt-1 flex-1 line-clamp-2">{product.description}</p>

                <div className="flex items-center justify-between mt-4">
                  <span className="text-base font-bold text-primary">{product.price}</span>
                  <button
                    onClick={() => setShowModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 active:scale-95 transition-all"
                  >
                    Ver detalhes
                  </button>
                </div>
              </div>
            </div>
          ))}
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
              <div className="bg-card rounded-2xl shadow-2xl border border-border p-8 w-full max-w-sm pointer-events-auto">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
                    <ShoppingBag size={28} className="text-primary" strokeWidth={1.5} />
                  </div>
                  <h3 className="font-serif text-xl font-semibold text-foreground mb-2">
                    Marketplace em breve
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Estamos preparando um ambiente seguro para conectar igrejas, editoras, livrarias, músicos, fornecedores e ministérios.
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
