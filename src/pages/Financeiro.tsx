import { AdminLayout } from "@/components/AdminLayout";
import { ExecutiveCard } from "@/components/ExecutiveCard";
import { Wallet, TrendingUp, TrendingDown, PiggyBank, Plus, Download, X, Search } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState, useMemo } from "react";

type Transaction = {
  id: number;
  date: string;
  desc: string;
  type: "Entrada" | "Saída";
  value: string;
  amount: number;
  status: "Confirmado" | "Pago" | "Pendente";
  category: string;
};

const initialTransactions: Transaction[] = [
  { id: 1, date: "14/03", desc: "Dízimos — Culto Dominical", type: "Entrada", value: "R$ 12.450", amount: 12450, status: "Confirmado", category: "Dízimos" },
  { id: 2, date: "13/03", desc: "Ofertas Missionárias", type: "Entrada", value: "R$ 3.200", amount: 3200, status: "Confirmado", category: "Ofertas" },
  { id: 3, date: "12/03", desc: "Conta de Energia — Templo", type: "Saída", value: "R$ 1.850", amount: 1850, status: "Pago", category: "Utilidades" },
  { id: 4, date: "11/03", desc: "Manutenção do Ar-condicionado", type: "Saída", value: "R$ 2.300", amount: 2300, status: "Pago", category: "Manutenção" },
  { id: 5, date: "10/03", desc: "Dízimos — Culto de Quarta", type: "Entrada", value: "R$ 4.800", amount: 4800, status: "Confirmado", category: "Dízimos" },
  { id: 6, date: "09/03", desc: "Material de Escola Dominical", type: "Saída", value: "R$ 450", amount: 450, status: "Pendente", category: "Material" },
  { id: 7, date: "08/03", desc: "Ofertas Especiais — Construção", type: "Entrada", value: "R$ 8.500", amount: 8500, status: "Confirmado", category: "Ofertas" },
  { id: 8, date: "07/03", desc: "Salário — Secretária", type: "Saída", value: "R$ 3.200", amount: 3200, status: "Pago", category: "Pessoal" },
  { id: 9, date: "06/03", desc: "Ofertas — Culto da Juventude", type: "Entrada", value: "R$ 1.950", amount: 1950, status: "Confirmado", category: "Ofertas" },
];

const formatCurrency = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function Financeiro() {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [filterType, setFilterType] = useState<"all" | "Entrada" | "Saída">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [newTx, setNewTx] = useState({ desc: "", type: "Entrada" as "Entrada" | "Saída", value: "", category: "" });

  const filtered = transactions.filter(t => {
    if (filterType !== "all" && t.type !== filterType) return false;
    if (searchQuery && !t.desc.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const summary = useMemo(() => {
    const totalReceita = transactions.filter(t => t.type === "Entrada").reduce((s, t) => s + t.amount, 0);
    const totalDespesa = transactions.filter(t => t.type === "Saída").reduce((s, t) => s + t.amount, 0);
    const saldo = totalReceita - totalDespesa;
    return [
      { title: "Receita Total", value: formatCurrency(totalReceita), trend: "+10,8%", icon: TrendingUp },
      { title: "Despesas Totais", value: formatCurrency(totalDespesa), trend: "-3,2%", trendLabel: "redução", icon: TrendingDown },
      { title: "Saldo Atual", value: formatCurrency(saldo), icon: Wallet },
      { title: "Reserva", value: "R$ 85.200", icon: PiggyBank },
    ];
  }, [transactions]);

  const addTransaction = () => {
    if (!newTx.desc || !newTx.value) return;
    const raw = newTx.value.replace(/[^\d,\.]/g, "").replace(",", ".");
    const amount = parseFloat(raw) || 0;
    if (amount <= 0) return;
    const tx: Transaction = {
      id: Date.now(),
      date: new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      desc: newTx.desc,
      type: newTx.type,
      value: formatCurrency(amount),
      amount,
      status: "Pendente",
      category: newTx.category || "Geral",
    };
    setTransactions([tx, ...transactions]);
    setNewTx({ desc: "", type: "Entrada", value: "", category: "" });
    setShowForm(false);
  };

  const handleFormKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); addTransaction(); }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif tracking-tight">Financeiro</h1>
            <p className="text-sm text-muted-foreground mt-1">Tesouraria e controle contábil</p>
          </div>
          <div className="flex gap-2">
            <button className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors">
              <Download size={14} strokeWidth={1.5} /> Exportar
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus size={16} strokeWidth={1.5} /> Lançamento
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {summary.map((s, i) => (
            <ExecutiveCard key={s.title} {...s} index={i} />
          ))}
        </div>

        {/* New transaction form */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="bg-card rounded-xl shadow-executive p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-serif text-base">Novo Lançamento</h3>
                  <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-secondary">
                    <X size={16} strokeWidth={1.5} />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" onKeyDown={handleFormKeyDown}>
                  <input placeholder="Descrição" value={newTx.desc} onChange={(e) => setNewTx({ ...newTx, desc: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  <input placeholder="Valor (ex: 1500)" value={newTx.value} onChange={(e) => setNewTx({ ...newTx, value: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  <select value={newTx.type} onChange={(e) => setNewTx({ ...newTx, type: e.target.value as "Entrada" | "Saída" })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                    <option>Entrada</option>
                    <option>Saída</option>
                  </select>
                  <input placeholder="Categoria" value={newTx.category} onChange={(e) => setNewTx({ ...newTx, category: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <button onClick={addTransaction} className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                  Salvar Lançamento
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Transactions table */}
        <div className="bg-card rounded-xl shadow-executive overflow-hidden">
          <div className="p-5 border-b border-border/50">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="font-serif text-lg">Movimentações Recentes</h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    placeholder="Buscar..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-input bg-background text-xs w-full sm:w-40 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="flex bg-secondary/50 rounded-lg p-0.5">
                  {(["all", "Entrada", "Saída"] as const).map(f => (
                    <button key={f} onClick={() => setFilterType(f)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                        filterType === f ? "bg-card shadow-sm" : "text-muted-foreground"
                      }`}>
                      {f === "all" ? "Todos" : f === "Entrada" ? "Entradas" : "Saídas"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Data</th>
                  <th className="px-5 py-3 font-medium">Descrição</th>
                  <th className="px-5 py-3 font-medium">Tipo</th>
                  <th className="px-5 py-3 font-medium">Valor</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-b border-border/30 hover:bg-secondary/30 transition-colors">
                    <td className="px-5 py-3 text-muted-foreground tabular-nums">{t.date}</td>
                    <td className="px-5 py-3 font-medium">{t.desc}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-medium ${t.type === "Entrada" ? "text-success" : "text-destructive"}`}>{t.type}</span>
                    </td>
                    <td className="px-5 py-3 font-medium tabular-nums">{t.value}</td>
                    <td className="px-5 py-3">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        t.status === "Confirmado" ? "bg-success/10 text-success" :
                        t.status === "Pago" ? "bg-primary/10 text-primary" :
                        "bg-accent/10 text-accent"
                      }`}>{t.status}</span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-sm text-muted-foreground">Nenhuma movimentação encontrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden p-4 space-y-2">
            {filtered.map((t) => (
              <div key={t.id} className="p-3 rounded-lg bg-secondary/30">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>{t.date}</span>
                  <span className={t.type === "Entrada" ? "text-success font-medium" : "text-destructive font-medium"}>{t.type}</span>
                </div>
                <p className="text-sm font-medium">{t.desc}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm font-medium tabular-nums">{t.value}</span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    t.status === "Confirmado" ? "bg-success/10 text-success" :
                    t.status === "Pago" ? "bg-primary/10 text-primary" :
                    "bg-accent/10 text-accent"
                  }`}>{t.status}</span>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">Nenhuma movimentação encontrada.</p>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
