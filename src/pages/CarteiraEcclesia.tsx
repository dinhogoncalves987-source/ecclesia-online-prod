import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { CreditCard, Search, Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { MemberWalletCard } from "@/components/MemberWalletCard";
import { runScopedOrganizationQuery } from "@/lib/organizationScope";
import { useChurch } from "@/hooks/useChurchContext";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";

type WalletableMember = {
  id: string;
  full_name: string;
  member_role: string | null;
  status: string;
  phone: string | null;
  email: string | null;
  joined_at: string | null;
};

const STATUS_BADGE: Record<string, string> = {
  Ativo:        "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  Visitante:    "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  Inativo:      "bg-muted text-muted-foreground",
  Disciplinado: "bg-red-500/10 text-red-700 dark:text-red-400",
  Transferido:  "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  Falecido:     "bg-muted text-muted-foreground",
};

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

export default function CarteiraEcclesia() {
  const { t } = useLanguage();
  const { church, loading: churchLoading } = useChurch();
  const [members, setMembers] = useState<WalletableMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [walletMember, setWalletMember] = useState<WalletableMember | null>(null);

  const loadMembers = useCallback(async () => {
    if (!church) return;
    const { data, error } = await runScopedOrganizationQuery<WalletableMember[]>(
      "members",
      church.id,
      (query) =>
        query
          .select("id, full_name, member_role, status, phone, email, joined_at")
          .order("full_name"),
    );
    if (error) {
      toast.error(t("Erro ao carregar membros"));
      return;
    }
    setMembers(data || []);
  }, [church, t]);

  useEffect(() => {
    if (churchLoading) return;
    if (!church) { setLoading(false); return; }
    const load = async () => {
      setLoading(true);
      await loadMembers();
      setLoading(false);
    };
    load();
  }, [church, churchLoading, loadMembers]);

  const filtered = members.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      m.full_name.toLowerCase().includes(q) ||
      (m.member_role ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-serif font-bold flex items-center gap-2">
            <CreditCard size={22} className="text-primary" />
            {t("Carteira de Membro")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("Selecione um membro para visualizar, imprimir ou exportar a carteira digital")}
          </p>
        </div>

        {/* Busca */}
        <div className="relative max-w-sm">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Buscar por nome ou função...")}
            className="w-full pl-9 pr-4 py-2.5 bg-card rounded-lg shadow-sm text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 border border-border/50"
          />
        </div>

        {/* Estado de carregamento */}
        {loading || churchLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
              <CreditCard size={28} className="text-accent/50" />
            </div>
            <h3 className="font-serif text-lg font-semibold mb-1">
              {search ? t("Nenhum membro encontrado") : t("Nenhum membro cadastrado")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {search
                ? t("Tente outro nome ou função.")
                : t("Cadastre membros na aba Membros para emitir carteiras.")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setWalletMember(m)}
                className="bg-card rounded-xl p-4 flex items-center gap-3 hover:bg-secondary/30 transition-colors text-left shadow-sm border border-border/50 group"
              >
                <div className="w-11 h-11 rounded-full bg-accent/10 flex items-center justify-center text-sm font-semibold text-accent flex-shrink-0 group-hover:bg-accent/20 transition-colors">
                  {initials(m.full_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{m.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {m.member_role ?? t("Membro")}
                  </p>
                  {m.status && (
                    <span
                      className={`inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                        STATUS_BADGE[m.status] ?? STATUS_BADGE.Inativo
                      }`}
                    >
                      {t(m.status)}
                    </span>
                  )}
                </div>
                <div className="flex-shrink-0 flex flex-col items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                  <CreditCard size={18} className="text-accent" />
                  <span className="text-[10px] text-muted-foreground">{t("Visualizar")}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Modal carteira */}
      <Dialog
        open={Boolean(walletMember)}
        onOpenChange={(v) => { if (!v) setWalletMember(null); }}
      >
        <DialogContent className="max-w-sm">
          {walletMember && (
            <MemberWalletCard
              member={walletMember}
              churchName={church?.name ?? "Ecclesia"}
              onClose={() => setWalletMember(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
