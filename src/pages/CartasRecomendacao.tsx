import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Clock,
  Search,
  CheckCircle2,
  XCircle,
  Send,
  X,
  MapPin,
  Mail,
  Loader2,
  Inbox,
  Eye,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR, enUS, es } from "date-fns/locale";

import { AdminLayout } from "@/components/AdminLayout";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { useRole } from "@/hooks/useRole";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { useRecommendationLetters } from "@/hooks/useRecommendationLetters";
import {
  RECOMMENDATION_STATUSES,
  type RecommendationLetter,
  type RecommendationLetterStatus,
} from "@/lib/recommendationLetters";
import { RecommendationLetterForm } from "@/components/cartas/RecommendationLetterForm";
import { RecommendationLetterDocument } from "@/components/cartas/RecommendationLetterDocument";

// ── Status presentation ───────────────────────────────────────────────────────

const STATUS_LABELS: Record<RecommendationLetterStatus, string> = {
  requested:    "Solicitada",
  under_review: "Em análise",
  approved:     "Aprovada",
  rejected:     "Rejeitada",
};

const STATUS_BADGE: Record<RecommendationLetterStatus, string> = {
  requested:    "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  under_review: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  approved:     "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  rejected:     "bg-rose-500/15 text-rose-600 dark:text-rose-400",
};

type FilterValue = "all" | RecommendationLetterStatus;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CartasRecomendacao() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, lang } = useLanguage();
  const { church, loading: churchLoading } = useChurch();
  const { hasRole } = useRole();

  const canManage  = hasRole(["super_admin", "church_admin", "secretary", "pastor"]);
  const canApprove = hasRole(["super_admin", "church_admin", "pastor"]);
  const canReview  = hasRole(["super_admin", "church_admin", "secretary", "pastor"]);

  const {
    letters,
    loading,
    fromDatabase,
    mutating,
    create,
    setUnderReview,
    approve,
    reject,
  } = useRecommendationLetters({
    organizationId: church?.id,
    currentUserId:  user?.id,
  });

  const [filter, setFilter] = useState<FilterValue>("all");
  const [selected, setSelected] = useState<RecommendationLetter | null>(null);
  const [showDocument, setShowDocument] = useState(false);

  const dateLoc   = lang === "en" ? enUS : lang === "es" ? es : ptBR;
  const fmtDate   = (iso: string | null) =>
    iso ? format(new Date(iso), "dd MMM yyyy · HH:mm", { locale: dateLoc }) : "—";

  const defaultMemberName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    "";

  // ── Summary counts ────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const base: Record<RecommendationLetterStatus, number> = {
      requested: 0, under_review: 0, approved: 0, rejected: 0,
    };
    for (const l of letters) base[l.status] += 1;
    return base;
  }, [letters]);

  const filtered = useMemo(
    () => filter === "all" ? letters : letters.filter((l) => l.status === filter),
    [letters, filter],
  );

  // ── Member request handler ─────────────────────────────────────────────────
  const handleCreate = async (input: Parameters<typeof create>[0]) => {
    const result = await create({
      ...input,
      originChurchName: church?.name ?? "",
    });
    if (result.ok) {
      toast({
        title: t("Solicitação enviada!"),
        description: t("Sua carta de recomendação foi solicitada à secretaria."),
      });
    } else {
      toast({
        title:       t("Erro ao solicitar"),
        description: result.error ?? t("Tente novamente"),
        variant:     "destructive",
      });
    }
  };

  // ── Status action handlers ─────────────────────────────────────────────────
  const runAction = async (
    action: () => Promise<{ ok: boolean; error?: string }>,
    successMsg: string,
  ) => {
    const result = await action();
    if (result.ok) {
      toast({ title: successMsg });
      setSelected(null);
    } else {
      toast({
        title:       t("Erro"),
        description: result.error ?? t("Tente novamente"),
        variant:     "destructive",
      });
    }
  };

  // ── Layout data ───────────────────────────────────────────────────────────
  const summaryCards: { label: string; value: number; icon: typeof Clock; tint: string }[] = [
    { label: t("Pendentes"),  value: counts.requested,    icon: Clock,         tint: "text-amber-500 bg-amber-500/10"   },
    { label: t("Em análise"), value: counts.under_review, icon: Search,        tint: "text-blue-500 bg-blue-500/10"     },
    { label: t("Aprovadas"),  value: counts.approved,     icon: CheckCircle2,  tint: "text-emerald-500 bg-emerald-500/10" },
    { label: t("Rejeitadas"), value: counts.rejected,     icon: XCircle,       tint: "text-rose-500 bg-rose-500/10"     },
  ];

  const filterChips: { value: FilterValue; label: string }[] = [
    { value: "all", label: t("Todas") },
    ...RECOMMENDATION_STATUSES.map((s) => ({ value: s, label: t(STATUS_LABELS[s]) })),
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif font-bold text-foreground">
              {t("Cartas de Recomendação")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {canManage
                ? t("Solicitações de carta de recomendação da igreja")
                : t("Solicite sua carta de recomendação e acompanhe o andamento")}
            </p>
          </div>
        </div>

        {churchLoading ? (
          <div className="text-center py-12 text-muted-foreground">{t("Carregando...")}</div>
        ) : !church ? (
          <div className="text-center py-12 text-muted-foreground">
            {t("Selecione uma igreja para continuar.")}
          </div>
        ) : canManage ? (
          /* ─── STAFF VIEW ───────────────────────────────────────────────── */
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {summaryCards.map((c) => (
                <div
                  key={c.label}
                  className="bg-card rounded-xl p-4 border border-border/50 shadow-sm flex items-center gap-3"
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${c.tint}`}>
                    <c.icon size={18} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold leading-none">{c.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Filter chips */}
            <div className="flex gap-2 flex-wrap">
              {filterChips.map((chip) => (
                <button
                  key={chip.value}
                  onClick={() => setFilter(chip.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    filter === chip.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* List */}
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">{t("Carregando...")}</div>
            ) : filtered.length === 0 ? (
              <EmptyState
                title={letters.length === 0 ? t("Nenhuma solicitação ainda") : t("Nenhuma solicitação neste filtro")}
                hint={!fromDatabase ? t("Não foi possível carregar as solicitações.") : t("As novas solicitações aparecerão aqui.")}
              />
            ) : (
              <div className="space-y-3">
                {filtered.map((letter, i) => (
                  <motion.div
                    key={letter.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => { setSelected(letter); setShowDocument(false); }}
                    className="bg-card rounded-xl p-4 shadow-sm border border-border/50 flex items-center gap-4 cursor-pointer hover:border-accent/40 hover:shadow-md transition-all"
                  >
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <FileText size={20} className="text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-foreground truncate">{letter.memberName}</h3>
                        <StatusBadge status={letter.status} label={t(STATUS_LABELS[letter.status])} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {letter.destinationChurch} · {letter.destinationCity}
                        {letter.destinationState ? `/${letter.destinationState}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground/80 mt-1 truncate">{letter.reason}</p>
                    </div>
                    <span className="text-[11px] text-muted-foreground/70 flex-shrink-0 hidden sm:block">
                      {fmtDate(letter.requestedAt)}
                    </span>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        ) : (
          /* ─── MEMBER VIEW ─────────────────────────────────────────────── */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-2xl p-5 border border-border/50 shadow-sm">
              <h2 className="text-base font-serif font-bold mb-1 flex items-center gap-2">
                <Send size={16} className="text-primary" />
                {t("Nova solicitação")}
              </h2>
              <p className="text-xs text-muted-foreground mb-4">
                {t("Preencha os dados da igreja de destino para solicitar sua carta.")}
              </p>
              <RecommendationLetterForm
                defaultMemberName={defaultMemberName}
                defaultMemberEmail={user?.email ?? ""}
                showMemberIdentityFields={!defaultMemberName}
                submitting={mutating}
                onSubmit={handleCreate}
              />
            </div>

            <div>
              <h2 className="text-base font-serif font-bold mb-3">{t("Minhas solicitações")}</h2>
              {loading ? (
                <div className="text-center py-12 text-muted-foreground">{t("Carregando...")}</div>
              ) : letters.length === 0 ? (
                <EmptyState
                  title={t("Nenhuma solicitação ainda")}
                  hint={t("Use o formulário ao lado para solicitar sua primeira carta.")}
                />
              ) : (
                <div className="space-y-3">
                  {letters.map((letter) => (
                    <div
                      key={letter.id}
                      onClick={() => { setSelected(letter); setShowDocument(false); }}
                      className="bg-card rounded-xl p-4 shadow-sm border border-border/50 cursor-pointer hover:border-accent/40 transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-foreground truncate flex-1">
                          {letter.destinationChurch}
                        </h3>
                        <StatusBadge status={letter.status} label={t(STATUS_LABELS[letter.status])} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {letter.destinationCity}
                        {letter.destinationState ? `/${letter.destinationState}` : ""} ·{" "}
                        {fmtDate(letter.requestedAt)}
                      </p>
                      {letter.status === "approved" && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1.5 font-medium">
                          {t("Carta aprovada — clique para visualizar o documento")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Detail modal ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selected && !showDocument && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40"
              onClick={() => setSelected(null)}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-lg bg-card rounded-2xl shadow-xl flex flex-col max-h-[88vh]"
              >
                {/* Modal header */}
                <div className="flex items-start justify-between p-5 border-b border-border/50 gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-serif font-bold truncate">{selected.memberName}</h2>
                    <div className="mt-1">
                      <StatusBadge status={selected.status} label={t(STATUS_LABELS[selected.status])} />
                    </div>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="p-1.5 rounded-lg hover:bg-secondary flex-shrink-0"
                    aria-label={t("Fechar")}
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Modal body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {selected.memberEmail && (
                    <DetailRow icon={Mail} label={t("E-mail")} value={selected.memberEmail} />
                  )}
                  <DetailRow
                    icon={MapPin}
                    label={t("Igreja destino")}
                    value={`${selected.destinationChurch} — ${selected.destinationCity}${
                      selected.destinationState ? `/${selected.destinationState}` : ""
                    }`}
                  />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{t("Motivo")}</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                      {selected.reason}
                    </p>
                  </div>
                  {selected.observations && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">{t("Observações")}</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                        {selected.observations}
                      </p>
                    </div>
                  )}

                  {/* Status history */}
                  <div className="rounded-xl bg-secondary/40 p-3 space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground mb-1">{t("Histórico")}</p>
                    <HistoryLine label={t("Solicitada em")} value={fmtDate(selected.requestedAt)} />
                    {selected.reviewedAt && (
                      <HistoryLine label={t("Analisada em")} value={fmtDate(selected.reviewedAt)} />
                    )}
                    {selected.approvedAt && (
                      <HistoryLine label={t("Aprovada em")} value={fmtDate(selected.approvedAt)} />
                    )}
                  </div>

                  {/* Rejected message */}
                  {selected.status === "rejected" && (
                    <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3">
                      <p className="text-sm text-rose-600 dark:text-rose-400">
                        {t("Esta solicitação foi encerrada pela secretaria.")}
                      </p>
                    </div>
                  )}
                </div>

                {/* Modal footer */}
                <div className="p-4 border-t border-border/50 flex flex-wrap gap-2">
                  {/* Approved → view document */}
                  {selected.status === "approved" && (
                    <button
                      onClick={() => setShowDocument(true)}
                      className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-colors"
                    >
                      <Eye size={15} />
                      {t("Visualizar documento")}
                    </button>
                  )}

                  {/* Staff actions for non-approved */}
                  {canManage && selected.status !== "approved" && (
                    <>
                      {canReview && selected.status === "requested" && (
                        <button
                          disabled={mutating}
                          onClick={() => runAction(() => setUnderReview(selected.id), t("Marcada em análise"))}
                          className="flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 text-sm font-medium hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                        >
                          {mutating ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                          {t("Colocar em análise")}
                        </button>
                      )}
                      {canApprove && (
                        <button
                          disabled={mutating}
                          onClick={() => runAction(() => approve(selected.id), t("Solicitação aprovada"))}
                          className="flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                        >
                          {mutating ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                          {t("Aprovar")}
                        </button>
                      )}
                      {canReview && selected.status !== "rejected" && (
                        <button
                          disabled={mutating}
                          onClick={() => runAction(() => reject(selected.id), t("Solicitação rejeitada"))}
                          className="flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm font-medium hover:bg-rose-500/20 transition-colors disabled:opacity-50"
                        >
                          {mutating ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />}
                          {t("Rejeitar")}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* ── Document modal (approved letters) ────────────────────────────────── */}
      <AnimatePresence>
        {selected && showDocument && selected.status === "approved" && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40"
              onClick={() => setShowDocument(false)}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className="w-full max-w-2xl bg-card rounded-2xl shadow-2xl flex flex-col max-h-[92vh]"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 flex-shrink-0">
                  <div>
                    <h2 className="font-serif font-bold text-lg">{t("Carta de Recomendação")}</h2>
                    <p className="text-xs text-muted-foreground">{selected.memberName}</p>
                  </div>
                  <button
                    onClick={() => setShowDocument(false)}
                    className="p-1.5 rounded-lg hover:bg-secondary flex-shrink-0"
                    aria-label={t("Fechar")}
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Document */}
                <div className="flex-1 overflow-y-auto p-5">
                  <RecommendationLetterDocument
                    letter={selected}
                    onCopied={() =>
                      toast({ title: t("Link copiado!"), description: t("Link de validação copiado para a área de transferência.") })
                    }
                  />
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}

// ── Presentational helpers ────────────────────────────────────────────────────

function StatusBadge({ status, label }: { status: RecommendationLetterStatus; label: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium flex-shrink-0 ${STATUS_BADGE[status]}`}>
      {label}
    </span>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
        <Icon size={15} className="text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground break-words">{value}</p>
      </div>
    </div>
  );
}

function HistoryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="text-center py-12">
      <Inbox size={48} className="mx-auto text-muted-foreground/30 mb-4" />
      <p className="text-muted-foreground font-medium">{title}</p>
      <p className="text-xs text-muted-foreground/70 mt-1">{hint}</p>
    </div>
  );
}
