import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Clock, Search, CheckCircle2, XCircle, Send, X,
  MapPin, Mail, Loader2, Inbox, Eye, Plus, Wand2, Download,
  Printer, Share2, MoreHorizontal, ScrollText, Link2, ChevronRight,
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
import { downloadCSVRaw, shareContent } from "@/lib/docExport";
import { RecommendationLetterForm } from "@/components/cartas/RecommendationLetterForm";
import { RecommendationLetterDocument } from "@/components/cartas/RecommendationLetterDocument";
import type { CreateRecommendationLetterInput } from "@/lib/recommendationLetterMutations";

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

// ── AI helper ─────────────────────────────────────────────────────────────────

type AiSuggestion = {
  destinationChurch: string;
  destinationCity: string;
  destinationState: string;
  reason: string;
  observations: string;
};

function cap(s: string): string {
  return s.trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function parseAiSuggestion(text: string): AiSuggestion {
  const t = text.trim();
  const lower = t.toLowerCase();

  // Destination city: look for "em [City]", "para [City]", "na [City]", "no [City]"
  const cityMatch = t.match(
    /\b(?:em|para|n[ao])\s+([A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÜÇ][A-Za-záàâãéèêíïóôõöúüç]+(?:\s+[A-Za-záàâãéèêíïóôõöúüç]+)*)/,
  );
  const destinationCity = cityMatch ? cap(cityMatch[1]) : "";

  // State abbreviation: two consecutive uppercase letters at word boundary
  const stateMatch = t.match(/\b([A-Z]{2})\b/);
  const destinationState = stateMatch ? stateMatch[1] : "";

  // Church name heuristic
  let destinationChurch = "";
  if (/assembl[eé]ia\s+de\s+deus|\bad\s+/i.test(lower))
    destinationChurch = "Assembleia de Deus";
  else if (/batista/i.test(lower))
    destinationChurch = "Igreja Batista";
  else if (/presbiteriana|ipb\b/i.test(lower))
    destinationChurch = "Igreja Presbiteriana";
  else if (/quadrangular|ieq\b/i.test(lower))
    destinationChurch = "Igreja do Evangelho Quadrangular";
  else if (/metodista/i.test(lower))
    destinationChurch = "Igreja Metodista";
  else if (/luterana/i.test(lower))
    destinationChurch = "Igreja Luterana";
  else if (/adventista/i.test(lower))
    destinationChurch = "Igreja Adventista do Sétimo Dia";
  else if (/pentecostal/i.test(lower))
    destinationChurch = "Igreja Pentecostal";

  // Situation type → reason + observations
  let reason = "";
  let observations = "";
  if (/transfer[eê]ncia|mud[ao]r[- ]?se|mud[aâ]nça|mudar\s/i.test(lower)) {
    reason = "Transferência de membro";
    observations = "Membro solicita carta de recomendação em razão de mudança de endereço para a área desta congregação.";
  } else if (/visita[nr]?|passando|pass[ao]r|temporári/i.test(lower)) {
    reason = "Visita à Igreja durante viagem";
    observations = "Solicitação de carta para apresentação e comunhão durante período de visita.";
  } else if (/miss[aã]o|mission[aá]rio|viagem\s+mission/i.test(lower)) {
    reason = "Participação em viagem missionária";
    observations = "Membro viajará como parte de equipe missionária e necessita de carta de apresentação pastoral.";
  } else if (/estud[ao]r?|universidade|faculdade/i.test(lower)) {
    reason = "Mudança para fins de estudo";
    observations = "Membro se mudará temporariamente para fins acadêmicos e solicita carta de apresentação à congregação local.";
  } else if (/trabalh[ao]r?|emprego|concurso|profissional/i.test(lower)) {
    reason = "Mudança por motivo profissional";
    observations = "Membro se transfere em razão de nova oportunidade de trabalho.";
  } else if (/present[ao]r?|comunh[aã]o|comunidade/i.test(lower)) {
    reason = "Apresentação a nova comunidade de fé";
    observations = "Membro solicita carta para apresentação formal e comunhão com nova congregação.";
  } else {
    reason = "Solicitação de carta de recomendação";
    observations = "Carta solicitada conforme necessidade informada pelo membro.";
  }

  return { destinationChurch, destinationCity, destinationState, reason, observations };
}

// ── CSV builder ───────────────────────────────────────────────────────────────

function buildLettersCsv(letters: RecommendationLetter[]): string {
  const header = ["Nome", "E-mail", "Igreja destino", "Cidade", "UF", "Motivo", "Status", "Solicitada em", "Aprovada em"];
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = letters.map((l) => [
    q(l.memberName),
    q(l.memberEmail ?? ""),
    q(l.destinationChurch),
    q(l.destinationCity),
    q(l.destinationState ?? ""),
    q(l.reason.replace(/\n/g, " ")),
    q(STATUS_LABELS[l.status]),
    q(l.requestedAt ? format(new Date(l.requestedAt), "dd/MM/yyyy") : ""),
    q(l.approvedAt  ? format(new Date(l.approvedAt),  "dd/MM/yyyy") : ""),
  ].join(";"));
  return [header.map(q).join(";"), ...rows].join("\n");
}

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
    letters, loading, fromDatabase, mutating,
    create, setUnderReview, approve, reject,
  } = useRecommendationLetters({
    organizationId: church?.id,
    currentUserId:  user?.id,
  });

  // ── UI state ─────────────────────────────────────────────────────────────
  const [filter, setFilter]             = useState<FilterValue>("all");
  const [selected, setSelected]         = useState<RecommendationLetter | null>(null);
  const [showDocument, setShowDocument] = useState(false);
  const [createOpen, setCreateOpen]     = useState(false);
  const [aiOpen, setAiOpen]             = useState(false);
  const [aiInput, setAiInput]           = useState("");
  const [aiParsed, setAiParsed]         = useState<AiSuggestion | null>(null);
  const [suggestion, setSuggestion]     = useState<AiSuggestion | null>(null);
  const [formKey, setFormKey]           = useState(0);

  const dateLoc = lang === "en" ? enUS : lang === "es" ? es : ptBR;
  const fmtDate = (iso: string | null) =>
    iso ? format(new Date(iso), "dd MMM yyyy · HH:mm", { locale: dateLoc }) : "—";
  const fmtDateShort = (iso: string | null) =>
    iso ? format(new Date(iso), "dd/MM/yyyy", { locale: dateLoc }) : "—";

  const defaultMemberName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name  as string | undefined) ??
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

  // ── Create handler ────────────────────────────────────────────────────────
  const handleCreate = async (input: CreateRecommendationLetterInput) => {
    const result = await create({
      ...input,
      originChurchName: church?.name ?? "",
      // Staff creating demo/manual letters: don't link to their own user id
      ...(canManage ? { memberId: null } : {}),
    });
    if (result.ok) {
      toast({
        title: t("Solicitação enviada!"),
        description: t("Sua carta de recomendação foi solicitada à secretaria."),
      });
      setCreateOpen(false);
    } else {
      toast({
        title: t("Erro ao solicitar"),
        description: result.error ?? t("Tente novamente"),
        variant: "destructive",
      });
    }
  };

  // ── Quick / modal action helpers ─────────────────────────────────────────
  const runAction = async (
    action: () => Promise<{ ok: boolean; error?: string }>,
    successMsg: string,
    closeModal = true,
  ) => {
    const result = await action();
    if (result.ok) {
      toast({ title: successMsg });
      if (closeModal) setSelected(null);
    } else {
      toast({
        title: t("Erro"),
        description: result.error ?? t("Tente novamente"),
        variant: "destructive",
      });
    }
  };

  // Quick action directly from the list row (no modal close needed)
  const quickReview  = (id: string) => runAction(() => setUnderReview(id), t("Marcada em análise"), false);
  const quickApprove = (id: string) => runAction(() => approve(id), t("Solicitação aprovada"), false);
  const quickReject  = (id: string) => runAction(() => reject(id), t("Solicitação rejeitada"), false);

  // ── AI helper ─────────────────────────────────────────────────────────────
  const handleAiSuggest = () => {
    if (!aiInput.trim()) return;
    setAiParsed(parseAiSuggestion(aiInput));
  };

  const handleApplySuggestion = () => {
    if (!aiParsed) return;
    setSuggestion(aiParsed);
    setFormKey((k) => k + 1);
    setAiOpen(false);
    setAiInput("");
    setAiParsed(null);
    setCreateOpen(true);
  };

  // ── Export actions ────────────────────────────────────────────────────────
  const handleExportCsv = () => {
    downloadCSVRaw(buildLettersCsv(letters), "cartas-recomendacao.csv");
    toast({ title: t("CSV exportado") });
  };

  const handlePrintReport = () => window.print();

  const handleShareSummary = () => {
    const total = letters.length;
    const text =
      `Cartas de Recomendação — ${church?.name ?? "Ecclesia"}\n` +
      `Total: ${total} | Aprovadas: ${counts.approved} | Pendentes: ${counts.requested} | Em análise: ${counts.under_review}`;
    shareContent({ title: t("Cartas de Recomendação"), text, url: window.location.href }).then(
      (r) => { if (r === "copied") toast({ title: t("Link copiado!") }); },
    );
  };

  // ── Summary card data ─────────────────────────────────────────────────────
  const summaryCards: { label: string; value: number; icon: typeof Clock; tint: string }[] = [
    { label: t("Pendentes"),  value: counts.requested,    icon: Clock,        tint: "text-amber-500 bg-amber-500/10"    },
    { label: t("Em análise"), value: counts.under_review, icon: Search,       tint: "text-blue-500 bg-blue-500/10"      },
    { label: t("Aprovadas"),  value: counts.approved,     icon: CheckCircle2, tint: "text-emerald-500 bg-emerald-500/10" },
    { label: t("Rejeitadas"), value: counts.rejected,     icon: XCircle,      tint: "text-rose-500 bg-rose-500/10"      },
  ];

  const filterChips: { value: FilterValue; label: string }[] = [
    { value: "all", label: t("Todas") },
    ...RECOMMENDATION_STATUSES.map((s) => ({ value: s, label: t(STATUS_LABELS[s]) })),
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      <div className="space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif font-bold text-foreground flex items-center gap-2">
              <ScrollText size={22} className="text-primary" />
              {t("Cartas de Recomendação")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {canManage
                ? t("Gerencie as cartas de recomendação da organização")
                : t("Solicite sua carta de recomendação e acompanhe o andamento")}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => { setSuggestion(null); setCreateOpen(true); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus size={15} />
              {t("Nova Solicitação")}
            </button>
            <button
              onClick={() => { setAiInput(""); setAiParsed(null); setAiOpen(true); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-colors border border-border/50"
            >
              <Wand2 size={14} className="text-violet-500" />
              {t("Criar com IA")}
            </button>

            {canManage && letters.length > 0 && (
              <ExportMenu
                onCsv={handleExportCsv}
                onPrint={handlePrintReport}
                onShare={handleShareSummary}
              />
            )}
          </div>
        </div>

        {/* ── Body ── */}
        {churchLoading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
            <Loader2 size={20} className="animate-spin" />
            <span>{t("Carregando...")}</span>
          </div>
        ) : !church ? (
          <div className="text-center py-12 text-muted-foreground">
            {t("Selecione uma igreja para continuar.")}
          </div>
        ) : canManage ? (
          /* ─── STAFF VIEW ────────────────────────────────────────────────── */
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

            {/* Filters */}
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
                  {chip.value !== "all" && (
                    <span className="ml-1.5 text-xs opacity-70">
                      {counts[chip.value as RecommendationLetterStatus] ?? 0}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* List or empty state */}
            {loading ? (
              <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
                <Loader2 size={20} className="animate-spin" />
                <span>{t("Carregando...")}</span>
              </div>
            ) : filtered.length === 0 ? (
              <PromptEmptyState
                isEmpty={letters.length === 0}
                fromDatabase={fromDatabase}
                onNew={() => setCreateOpen(true)}
                t={t}
              />
            ) : (
              <div className="space-y-3">
                {filtered.map((letter, i) => (
                  <LetterRow
                    key={letter.id}
                    letter={letter}
                    index={i}
                    canManage={canManage}
                    canApprove={canApprove}
                    canReview={canReview}
                    mutating={mutating}
                    fmtDate={fmtDateShort}
                    statusLabel={(s) => t(STATUS_LABELS[s])}
                    onOpen={() => { setSelected(letter); setShowDocument(false); }}
                    onReview={() => quickReview(letter.id)}
                    onApprove={() => quickApprove(letter.id)}
                    onReject={() => quickReject(letter.id)}
                    onViewDoc={() => { setSelected(letter); setShowDocument(true); }}
                    onCopyLink={() => {
                      navigator.clipboard.writeText(
                        `${window.location.origin}/validar/carta/${letter.publicToken}`,
                      ).then(() => toast({ title: t("Link copiado!") }));
                    }}
                    onShare={() =>
                      shareContent({
                        url: `${window.location.origin}/validar/carta/${letter.publicToken}`,
                        title: "Carta de Recomendação",
                        text: `Carta aprovada — ${letter.memberName}`,
                      }).then((r) => { if (r === "copied") toast({ title: t("Link copiado!") }); })
                    }
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          /* ─── MEMBER VIEW ────────────────────────────────────────────────── */
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
                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" /><span>{t("Carregando...")}</span>
                </div>
              ) : letters.length === 0 ? (
                <div className="text-center py-10">
                  <Inbox size={36} className="mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">{t("Nenhuma solicitação ainda")}</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    {t("Use o formulário ao lado para solicitar sua primeira carta.")}
                  </p>
                </div>
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
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1.5 font-medium flex items-center gap-1">
                          <Eye size={11} />
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
                <div className="flex items-start justify-between p-5 border-b border-border/50 gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-serif font-bold truncate">{selected.memberName}</h2>
                    <div className="mt-1">
                      <StatusBadge status={selected.status} label={t(STATUS_LABELS[selected.status])} />
                    </div>
                  </div>
                  <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-secondary flex-shrink-0" aria-label={t("Fechar")}>
                    <X size={18} />
                  </button>
                </div>

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
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{selected.reason}</p>
                  </div>
                  {selected.observations && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">{t("Observações")}</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{selected.observations}</p>
                    </div>
                  )}

                  <div className="rounded-xl bg-secondary/40 p-3 space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground mb-1">{t("Histórico")}</p>
                    <HistoryLine label={t("Solicitada em")}  value={fmtDate(selected.requestedAt)} />
                    {selected.reviewedAt && <HistoryLine label={t("Analisada em")} value={fmtDate(selected.reviewedAt)} />}
                    {selected.approvedAt && <HistoryLine label={t("Aprovada em")}  value={fmtDate(selected.approvedAt)} />}
                  </div>

                  {selected.status === "rejected" && (
                    <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3">
                      <p className="text-sm text-rose-600 dark:text-rose-400">
                        {t("Esta solicitação foi encerrada pela secretaria.")}
                      </p>
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-border/50 flex flex-wrap gap-2">
                  {selected.status === "approved" && (
                    <button
                      onClick={() => setShowDocument(true)}
                      className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-colors"
                    >
                      <Eye size={15} /> {t("Visualizar documento")}
                    </button>
                  )}
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

      {/* ── Document modal ───────────────────────────────────────────────────── */}
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
                <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 flex-shrink-0">
                  <div>
                    <h2 className="font-serif font-bold text-lg">{t("Carta de Recomendação")}</h2>
                    <p className="text-xs text-muted-foreground">{selected.memberName}</p>
                  </div>
                  <button onClick={() => setShowDocument(false)} className="p-1.5 rounded-lg hover:bg-secondary flex-shrink-0" aria-label={t("Fechar")}>
                    <X size={18} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-5">
                  <RecommendationLetterDocument
                    letter={selected}
                    onCopied={() => toast({ title: t("Link copiado!"), description: t("Link de validação copiado para a área de transferência.") })}
                  />
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* ── Create modal ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {createOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40"
              onClick={() => setCreateOpen(false)}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-lg bg-card rounded-2xl shadow-xl flex flex-col max-h-[90vh]"
              >
                <div className="flex items-center justify-between p-5 border-b border-border/50">
                  <div>
                    <h2 className="font-serif font-bold text-lg">{t("Nova Solicitação")}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {canManage
                        ? t("Preencha os dados para criar uma solicitação.")
                        : t("Preencha os dados da igreja de destino para solicitar sua carta.")}
                    </p>
                  </div>
                  <button onClick={() => setCreateOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary flex-shrink-0" aria-label={t("Fechar")}>
                    <X size={18} />
                  </button>
                </div>

                {suggestion && (
                  <div className="mx-5 mt-4 px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center gap-2">
                    <Wand2 size={13} className="text-violet-500 flex-shrink-0" />
                    <p className="text-xs text-violet-700 dark:text-violet-300">{t("Sugestão da IA aplicada. Revise os campos antes de enviar.")}</p>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto p-5">
                  <RecommendationLetterForm
                    key={formKey}
                    defaultMemberName={canManage ? "" : defaultMemberName}
                    defaultMemberEmail={canManage ? "" : (user?.email ?? "")}
                    showMemberIdentityFields={canManage || !defaultMemberName}
                    initialDestinationChurch={suggestion?.destinationChurch}
                    initialDestinationCity={suggestion?.destinationCity}
                    initialDestinationState={suggestion?.destinationState}
                    initialReason={suggestion?.reason}
                    initialObservations={suggestion?.observations}
                    submitting={mutating}
                    onSubmit={handleCreate}
                  />
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* ── AI modal ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {aiOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40"
              onClick={() => setAiOpen(false)}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md bg-card rounded-2xl shadow-xl"
              >
                <div className="flex items-center justify-between p-5 border-b border-border/50">
                  <div className="flex items-center gap-2">
                    <Wand2 size={18} className="text-violet-500" />
                    <h2 className="font-serif font-bold text-lg">{t("Criar com IA")}</h2>
                  </div>
                  <button onClick={() => setAiOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary" aria-label={t("Fechar")}>
                    <X size={18} />
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                      {t("Descreva a situação")}
                    </label>
                    <textarea
                      value={aiInput}
                      onChange={(e) => setAiInput(e.target.value)}
                      rows={3}
                      placeholder={t("Ex: o irmão João vai visitar a AD em Porto Alegre...")}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                    />
                  </div>

                  <button
                    onClick={handleAiSuggest}
                    disabled={!aiInput.trim()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-40"
                  >
                    <Wand2 size={14} />
                    {t("Sugerir preenchimento")}
                  </button>

                  {aiParsed && (
                    <div className="rounded-xl bg-secondary/60 border border-border p-4 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {t("Sugestão gerada")}
                      </p>
                      {aiParsed.destinationChurch && (
                        <SuggRow label={t("Igreja")} value={aiParsed.destinationChurch} />
                      )}
                      {aiParsed.destinationCity && (
                        <SuggRow label={t("Cidade")} value={`${aiParsed.destinationCity}${aiParsed.destinationState ? `/${aiParsed.destinationState}` : ""}`} />
                      )}
                      <SuggRow label={t("Motivo")} value={aiParsed.reason} />
                      {aiParsed.observations && (
                        <SuggRow label={t("Observações")} value={aiParsed.observations} />
                      )}

                      <button
                        onClick={handleApplySuggestion}
                        className="w-full mt-2 flex items-center justify-center gap-2 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                      >
                        <ChevronRight size={14} />
                        {t("Usar esta sugestão")}
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}

// ── Presentational components ─────────────────────────────────────────────────

function PromptEmptyState({
  isEmpty, fromDatabase, onNew, t,
}: {
  isEmpty: boolean;
  fromDatabase: boolean;
  onNew: () => void;
  t: (k: string) => string;
}) {
  return (
    <div className="text-center py-16">
      <div className="w-20 h-20 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
        <ScrollText size={36} className="text-primary" />
      </div>
      <h2 className="text-xl font-serif font-bold text-foreground mb-2">
        {isEmpty ? t("Nenhuma solicitação ainda") : t("Nenhuma solicitação neste filtro")}
      </h2>
      <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
        {!fromDatabase
          ? t("Não foi possível carregar as solicitações.")
          : isEmpty
          ? t("Crie uma solicitação de carta de recomendação para testar o fluxo da secretaria.")
          : t("As novas solicitações aparecerão aqui.")}
      </p>
      {isEmpty && fromDatabase && (
        <button
          onClick={onNew}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={15} />
          {t("Criar primeira solicitação")}
        </button>
      )}
    </div>
  );
}

// ── Letter row with quick actions ─────────────────────────────────────────────

type LetterRowProps = {
  letter: RecommendationLetter;
  index: number;
  canManage: boolean;
  canApprove: boolean;
  canReview: boolean;
  mutating: boolean;
  fmtDate: (iso: string | null) => string;
  statusLabel: (s: RecommendationLetterStatus) => string;
  onOpen: () => void;
  onReview: () => void;
  onApprove: () => void;
  onReject: () => void;
  onViewDoc: () => void;
  onCopyLink: () => void;
  onShare: () => void;
};

function LetterRow({
  letter, index, canManage, canApprove, canReview, mutating,
  fmtDate, statusLabel, onOpen, onReview, onApprove, onReject,
  onViewDoc, onCopyLink, onShare,
}: LetterRowProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      onClick={onOpen}
      className="bg-card rounded-xl border border-border/50 shadow-sm cursor-pointer hover:border-accent/40 hover:shadow-md transition-all overflow-hidden group"
    >
      {/* Main row */}
      <div className="flex items-center gap-4 p-4">
        <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
          <FileText size={20} className="text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-foreground truncate">{letter.memberName}</h3>
            <StatusBadge status={letter.status} label={statusLabel(letter.status)} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {letter.destinationChurch} · {letter.destinationCity}
            {letter.destinationState ? `/${letter.destinationState}` : ""}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{letter.reason}</p>
        </div>
        <div className="flex-shrink-0 hidden sm:flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground/60">{fmtDate(letter.requestedAt)}</span>
          <ChevronRight size={14} className="text-muted-foreground/40" />
        </div>
      </div>

      {/* Quick-action strip (staff only) */}
      {canManage && (
        <div
          className="border-t border-border/30 px-4 py-2 flex items-center gap-1.5 flex-wrap bg-secondary/30"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Status-dependent actions */}
          {canReview && letter.status === "requested" && (
            <QuickBtn
              label="Em análise"
              color="blue"
              disabled={mutating}
              icon={<Search size={11} />}
              onClick={onReview}
            />
          )}
          {canApprove && (letter.status === "requested" || letter.status === "under_review") && (
            <QuickBtn
              label="Aprovar"
              color="green"
              disabled={mutating}
              icon={<CheckCircle2 size={11} />}
              onClick={onApprove}
            />
          )}
          {canReview && (letter.status === "requested" || letter.status === "under_review") && (
            <QuickBtn
              label="Rejeitar"
              color="red"
              disabled={mutating}
              icon={<XCircle size={11} />}
              onClick={onReject}
            />
          )}

          {/* Approved actions */}
          {letter.status === "approved" && (
            <>
              <QuickBtn label="Ver documento" color="green" icon={<Eye size={11} />} onClick={onViewDoc} />
              <QuickBtn label="Copiar link"   color="gray"  icon={<Link2 size={11} />} onClick={onCopyLink} />
              <QuickBtn label="Compartilhar"  color="gray"  icon={<Share2 size={11} />} onClick={onShare} />
            </>
          )}

          {/* Open detail always */}
          <QuickBtn label="Abrir" color="gray" icon={<ChevronRight size={11} />} onClick={onOpen} />
        </div>
      )}
    </motion.div>
  );
}

// ── Tiny quick-action pill button ─────────────────────────────────────────────

const COLOR_MAP: Record<string, string> = {
  blue:  "bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20",
  green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20",
  red:   "bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20",
  gray:  "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80",
};

function QuickBtn({
  label, color, icon, onClick, disabled = false,
}: {
  label: string; color: string; icon: React.ReactNode;
  onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40 ${COLOR_MAP[color] ?? COLOR_MAP.gray}`}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Export drop-down ──────────────────────────────────────────────────────────

function ExportMenu({
  onCsv, onPrint, onShare,
}: {
  onCsv: () => void; onPrint: () => void; onShare: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const item = (label: string, Icon: typeof Download, action: () => void) => (
    <button
      key={label}
      type="button"
      onClick={() => { action(); setOpen(false); }}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-secondary transition-colors text-left"
    >
      <Icon size={14} className="text-muted-foreground" />
      {label}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary border border-border/50 text-sm font-medium hover:bg-secondary/80 transition-colors"
      >
        <MoreHorizontal size={15} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1.5 w-52 bg-card border border-border rounded-xl shadow-lg z-50 p-1.5"
          >
            {item("Exportar CSV",        Download,    onCsv)}
            {item("Imprimir relatório",  Printer,     onPrint)}
            {item("Compartilhar resumo", Share2,      onShare)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Minimal helpers ───────────────────────────────────────────────────────────

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

function SuggRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-xs text-foreground leading-snug">{value}</p>
    </div>
  );
}
