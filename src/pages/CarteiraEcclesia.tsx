import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { CreditCard, Search, Loader2, Ban } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { MemberWalletCard } from "@/components/MemberWalletCard";
import { runScopedOrganizationQuery } from "@/lib/organizationScope";
import { useChurch } from "@/hooks/useChurchContext";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

type WalletableMember = {
  id: string;
  full_name: string;
  member_role: string | null;
  administrative_role?: string | null;
  status: string;
  phone: string | null;
  email: string | null;
  joined_at: string | null;
  photo_url?: string | null;
  cpf?: string | null;
  rg?: string | null;
  birth_date?: string | null;
  baptized_at?: string | null;
  father_name?: string | null;
  mother_name?: string | null;
  congregation_id?: string | null;
  sector_id?: string | null;
};

// ── Wallet eligibility ────────────────────────────────────────────────────────

/** Status que permitem emissão de Carteira de Membro. */
const WALLET_ELIGIBLE_STATUSES = new Set([
  "Ativo",
  "Visitante",
  "Transferido",
  "Em disciplina",
  "Congregado",
]);

function canIssueWallet(status: string): boolean {
  return WALLET_ELIGIBLE_STATUSES.has(status);
}

// ── Badge styles ──────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  Ativo:          "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  Visitante:      "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  Congregado:     "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  Transferido:    "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  "Em disciplina":"bg-red-500/10 text-red-700 dark:text-red-400",
  Inativo:        "bg-muted text-muted-foreground",
  Falecido:       "bg-muted text-muted-foreground",
  Afastado:       "bg-orange-500/10 text-orange-700 dark:text-orange-400",
};

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CarteiraEcclesia() {
  const { t } = useLanguage();
  const { church, loading: churchLoading } = useChurch();
  const [members, setMembers] = useState<WalletableMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [walletMember, setWalletMember] = useState<WalletableMember | null>(null);

  // ── Load — uses select("*") to be resilient to pending migrations ──────────
  const loadMembers = useCallback(async () => {
    if (!church) return;
    const { data, error } = await runScopedOrganizationQuery<WalletableMember[]>(
      "members",
      church.id,
      (query) => query.select("*").order("full_name"),
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

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = members.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      m.full_name.toLowerCase().includes(q) ||
      (m.member_role ?? "").toLowerCase().includes(q) ||
      (m.status ?? "").toLowerCase().includes(q)
    );
  });

  const eligibleCount = filtered.filter(m => canIssueWallet(m.status)).length;
  const blockedCount  = filtered.filter(m => !canIssueWallet(m.status)).length;

  // ── Wallet open ────────────────────────────────────────────────────────────
  const handleOpenWallet = (m: WalletableMember) => {
    if (!canIssueWallet(m.status)) return; // blocked by status
    setWalletMember(m);
  };

  // ─────────────────────────────────────────────────────────────────────────
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

        {/* Busca + contadores */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Buscar por nome, função ou status...")}
              className="w-full pl-9 pr-4 py-2.5 bg-card rounded-lg shadow-sm text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 border border-border/50"
            />
          </div>
          {!loading && members.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {eligibleCount} {t("com carteira disponível")}
              {blockedCount > 0 && ` · ${blockedCount} ${t("bloqueado(s)")}`}
            </p>
          )}
        </div>

        {/* Content */}
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
                ? t("Tente outro nome, função ou status.")
                : t("Cadastre membros na aba Membros para emitir carteiras.")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((m) => {
              const eligible = canIssueWallet(m.status);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleOpenWallet(m)}
                  disabled={!eligible}
                  title={
                    eligible
                      ? `Emitir Carteira — ${m.full_name}`
                      : `Carteira indisponível para status "${m.status}"`
                  }
                  className={`rounded-xl p-4 flex items-center gap-3 text-left border transition-colors group
                    ${eligible
                      ? "bg-card hover:bg-secondary/30 border-border/50 cursor-pointer shadow-sm"
                      : "bg-muted/40 border-border/20 cursor-not-allowed opacity-60"
                    }`}
                >
                  {/* Avatar */}
                  {m.photo_url ? (
                    <img
                      src={m.photo_url}
                      alt={m.full_name}
                      className="w-11 h-11 rounded-full object-cover ring-2 ring-border flex-shrink-0"
                    />
                  ) : (
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 transition-colors
                      ${eligible
                        ? "bg-accent/10 text-accent group-hover:bg-accent/20"
                        : "bg-muted text-muted-foreground"
                      }`}>
                      {initials(m.full_name)}
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{m.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {m.member_role ?? t("Membro")}
                      {m.administrative_role && m.administrative_role !== "Nenhum" && (
                        <span className="text-muted-foreground/60"> · {m.administrative_role}</span>
                      )}
                    </p>
                    <span
                      className={`inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                        STATUS_BADGE[m.status] ?? STATUS_BADGE.Inativo
                      }`}
                    >
                      {t(m.status)}
                    </span>
                  </div>

                  {/* Action indicator */}
                  <div className={`flex-shrink-0 flex flex-col items-center gap-1 transition-opacity
                    ${eligible ? "opacity-50 group-hover:opacity-100" : "opacity-40"}`}>
                    {eligible ? (
                      <>
                        <CreditCard size={18} className="text-accent" />
                        <span className="text-[10px] text-muted-foreground">{t("Emitir")}</span>
                      </>
                    ) : (
                      <>
                        <Ban size={16} className="text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">{t("Bloqueado")}</span>
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Legend */}
        {!loading && filtered.length > 0 && blockedCount > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Carteira bloqueada para membros com status <strong>Inativo</strong> ou <strong>Falecido</strong>.
          </p>
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
              member={{
                ...walletMember,
                baptism_date: walletMember.baptized_at ?? null,
                parent_names:
                  [walletMember.father_name, walletMember.mother_name].filter(Boolean).join(" / ") || null,
              }}
              churchName={church?.name ?? "Ecclesia"}
              churchCity={church?.city ?? undefined}
              churchState={church?.state ?? undefined}
              onClose={() => setWalletMember(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
