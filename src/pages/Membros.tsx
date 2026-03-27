import { AdminLayout } from "@/components/AdminLayout";
import { Users, Search, Plus, Filter, Phone, X, Mail } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

type Member = {
  id: number;
  name: string;
  role: string;
  status: "Ativo" | "Visitante" | "Inativo";
  phone: string;
  email: string;
  since: string;
};

const initialMembers: Member[] = [
  { id: 1, name: "Maria Silva", role: "Líder de Louvor", status: "Ativo", phone: "(11) 99999-0001", email: "maria@email.com", since: "2019" },
  { id: 2, name: "João Santos", role: "Diácono", status: "Ativo", phone: "(11) 99999-0002", email: "joao@email.com", since: "2017" },
  { id: 3, name: "Ana Oliveira", role: "Professora EBD", status: "Ativo", phone: "(11) 99999-0003", email: "ana@email.com", since: "2020" },
  { id: 4, name: "Pedro Costa", role: "Tesoureiro", status: "Ativo", phone: "(11) 99999-0004", email: "pedro@email.com", since: "2018" },
  { id: 5, name: "Raquel Lima", role: "Membro", status: "Ativo", phone: "(11) 99999-0005", email: "raquel@email.com", since: "2021" },
  { id: 6, name: "Lucas Ferreira", role: "Líder de Jovens", status: "Ativo", phone: "(11) 99999-0006", email: "lucas@email.com", since: "2022" },
  { id: 7, name: "Priscila Mendes", role: "Membro", status: "Visitante", phone: "(11) 99999-0007", email: "priscila@email.com", since: "2024" },
  { id: 8, name: "Daniel Rocha", role: "Músico", status: "Ativo", phone: "(11) 99999-0008", email: "daniel@email.com", since: "2020" },
];

export default function Membros() {
  const [members, setMembers] = useState(initialMembers);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "Ativo" | "Visitante" | "Inativo">("all");
  const [showForm, setShowForm] = useState(false);
  const [newMember, setNewMember] = useState({ name: "", role: "", phone: "", email: "" });

  const filtered = members.filter(m => {
    if (filterStatus !== "all" && m.status !== filterStatus) return false;
    if (searchQuery && !m.name.toLowerCase().includes(searchQuery.toLowerCase()) && !m.role.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const addMember = () => {
    if (!newMember.name) return;
    const member: Member = {
      id: Date.now(),
      name: newMember.name,
      role: newMember.role || "Membro",
      status: "Ativo",
      phone: newMember.phone,
      email: newMember.email,
      since: "2026",
    };
    setMembers([member, ...members]);
    setNewMember({ name: "", role: "", phone: "", email: "" });
    setShowForm(false);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif tracking-tight">Membros</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {members.length} cadastrados · {members.filter(m => m.status === "Ativo").length} ativos
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity self-start"
          >
            <Plus size={16} strokeWidth={1.5} /> Novo Membro
          </button>
        </div>

        {/* New member form */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="bg-card rounded-xl shadow-executive p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-serif text-base">Cadastrar Membro</h3>
                  <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-secondary">
                    <X size={16} strokeWidth={1.5} />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input placeholder="Nome completo" value={newMember.name} onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  <input placeholder="Função" value={newMember.role} onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  <input placeholder="Telefone" value={newMember.phone} onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  <input placeholder="E-mail" value={newMember.email} onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <button onClick={addMember} className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                  Salvar Membro
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Buscar por nome ou função..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-card rounded-lg shadow-[var(--shadow-sm)] text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <div className="flex bg-secondary/50 rounded-lg p-0.5">
            {(["all", "Ativo", "Visitante", "Inativo"] as const).map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  filterStatus === s ? "bg-card shadow-sm" : "text-muted-foreground"
                }`}>
                {s === "all" ? "Todos" : s}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block bg-card rounded-xl shadow-executive overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                <th className="px-5 py-3 font-medium">Nome</th>
                <th className="px-5 py-3 font-medium">Função</th>
                <th className="px-5 py-3 font-medium">Contato</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Desde</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="border-b border-border/30 hover:bg-secondary/30 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-xs font-medium text-accent">
                        {m.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                      </div>
                      <span className="font-medium">{m.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{m.role}</td>
                  <td className="px-5 py-3 text-muted-foreground">{m.phone}</td>
                  <td className="px-5 py-3">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      m.status === "Ativo" ? "bg-success/10 text-success" :
                      m.status === "Visitante" ? "bg-accent/10 text-accent" :
                      "bg-muted text-muted-foreground"
                    }`}>{m.status}</span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground tabular-nums">{m.since}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-sm text-muted-foreground">Nenhum membro encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden space-y-2">
          {filtered.map((m, i) => (
            <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <div className="bg-card rounded-xl shadow-executive p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-sm font-medium text-accent flex-shrink-0">
                  {m.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{m.name}</p>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                      m.status === "Ativo" ? "bg-success/10 text-success" :
                      m.status === "Visitante" ? "bg-accent/10 text-accent" :
                      "bg-muted text-muted-foreground"
                    }`}>{m.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{m.role}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone size={10} /> {m.phone}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">Nenhum membro encontrado.</p>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
