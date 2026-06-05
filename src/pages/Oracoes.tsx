import { AdminLayout } from "@/components/AdminLayout";
import { Heart, Plus, X, User, Clock, ChevronRight, Copy, Share2, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { useRole } from "@/hooks/useRole";
import { canDeleteSchedule } from "@/lib/permissions";
import { triggerShare } from "@/lib/share";
import { format } from "date-fns";
import { ptBR, enUS, es } from "date-fns/locale";

type PrayerRequest = {
  id: string;
  title: string;
  description: string | null;
  is_private: boolean | null;
  status: string | null;
  created_at: string;
  user_id: string | null;
};

export default function Oracoes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, lang } = useLanguage();
  const { church, loading: churchLoading } = useChurch();
  const { canonicalRole } = useRole();
  const canMarkStaff = canDeleteSchedule(canonicalRole);
  const canDeleteStaff = canDeleteSchedule(canonicalRole);

  const dateLoc = lang === "en" ? enUS : lang === "es" ? es : ptBR;

  const [requests, setRequests] = useState<PrayerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [detailPrayer, setDetailPrayer] = useState<PrayerRequest | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [filter, setFilter] = useState<"Todos" | "Ativo" | "Respondido">("Todos");
  const [markingAnswered, setMarkingAnswered] = useState(false);

  const fetchRequests = async () => {
    if (!church) return;
    const { data, error } = await supabase
      .from("prayer_requests")
      .select("*")
      .eq("organization_id", church.id)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: t("Erro"), description: error.message, variant: "destructive" });
      return;
    }
    setRequests((data as PrayerRequest[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (churchLoading) return;
    if (!church) {
      setLoading(false);
      return;
    }
    fetchRequests();
  }, [church, churchLoading]);

  useEffect(() => {
    if (!detailPrayer) return;
    const updated = requests.find((r) => r.id === detailPrayer.id);
    if (updated) setDetailPrayer(updated);
    else setDetailPrayer(null);
  }, [requests]);

  const openDetail = (req: PrayerRequest) => setDetailPrayer(req);
  const closeDetail = () => setDetailPrayer(null);

  const prayerStatus = (req: PrayerRequest) => req.status ?? "Ativo";
  const isAnswered = (req: PrayerRequest) => prayerStatus(req) === "Respondido";

  const formatPrayerDate = (req: PrayerRequest) =>
    format(new Date(req.created_at), "dd MMM yyyy", { locale: dateLoc });

  const authorLabel = (req: PrayerRequest) =>
    req.is_private ? t("Anônimo") : t("Membro");

  const buildShareText = (req: PrayerRequest) => {
    const status = prayerStatus(req);
    const desc = req.description ?? "";
    return [
      "Pedido de Oração",
      req.title,
      desc,
      `${t("Status")}: ${t(status)}`,
      "Ecclesia Online",
    ]
      .filter(Boolean)
      .join("\n\n");
  };

  const handleCopyText = async (req: PrayerRequest) => {
    try {
      await navigator.clipboard.writeText(buildShareText(req));
      toast({ title: t("Texto copiado!") });
    } catch {
      toast({ title: t("Erro"), description: t("Não foi possível copiar"), variant: "destructive" });
    }
  };

  const handleShare = async (req: PrayerRequest) => {
    const text = buildShareText(req);
    const result = await triggerShare({
      url: window.location.href,
      title: req.title,
      text,
    });
    if (result === "copied") toast({ title: t("Texto copiado!") });
    else if (result === "shared") toast({ title: t("Pedido compartilhado") });
  };

  const handleAdd = async () => {
    if (!title.trim() || !user || !church) return;
    const { error } = await supabase.from("prayer_requests").insert({
      user_id: user.id,
      created_by: user.id,
      organization_id: church.id,
      title: title.trim(),
      description: description.trim() || null,
      is_private: isAnonymous,
      status: "Ativo",
    } as Record<string, unknown>);
    if (error) {
      toast({ title: t("Erro"), description: error.message, variant: "destructive" });
      return;
    }
    setTitle("");
    setDescription("");
    setIsAnonymous(false);
    setShowForm(false);
    toast({ title: t("Pedido registrado!") });
    fetchRequests();
  };

  const handleMarkAnswered = async (id: string) => {
    if (!church || !canMarkStaff) return;
    setMarkingAnswered(true);
    const { error } = await supabase
      .from("prayer_requests")
      .update({ status: "Respondido" })
      .eq("id", id)
      .eq("organization_id", church.id);
    setMarkingAnswered(false);
    if (error) {
      toast({ title: t("Erro ao responder"), description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: t("Pedido respondido") });
    fetchRequests();
  };

  const handleDelete = async (id: string) => {
    if (!church) return;
    const { error } = await supabase
      .from("prayer_requests")
      .delete()
      .eq("id", id)
      .eq("organization_id", church.id);
    if (error) {
      toast({ title: t("Erro"), description: error.message, variant: "destructive" });
      return;
    }
    if (detailPrayer?.id === id) closeDetail();
    toast({ title: t("Pedido removido") });
    fetchRequests();
  };

  const canDelete = (req: PrayerRequest) => {
    if (canonicalRole === "leader") return false;
    return canDeleteStaff || req.user_id === user?.id;
  };

  const filtered =
    filter === "Todos" ? requests : requests.filter((r) => prayerStatus(r) === filter);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif font-bold text-foreground">{t("Pedidos de Oração")}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("Compartilhe e interceda pelos pedidos da comunidade")}
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus size={16} /> {t("Novo Pedido")}
          </button>
        </div>

        <div className="flex gap-2">
          {(["Todos", "Ativo", "Respondido"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(f)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">{t("Carregando...")}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 max-w-sm mx-auto">
            <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
              <Heart size={28} className="text-accent/50" />
            </div>
            <h3 className="font-serif text-lg font-semibold text-foreground mb-2">
              {filter === "Todos" ? t("Nenhum pedido ainda") : t("Nenhum pedido com este filtro")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {filter === "Todos"
                ? t("Seja o primeiro a compartilhar um pedido de oração com a comunidade.")
                : t("Tente mudar o filtro para ver outros pedidos.")}
            </p>
            {filter === "Todos" && (
              <button
                onClick={() => setShowForm(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent rounded-lg text-sm font-medium hover:bg-accent/20 transition-colors"
              >
                <Plus size={14} /> {t("Novo Pedido")}
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((req, i) => (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-card rounded-xl p-5 shadow-sm border border-border/50 flex flex-col gap-3 cursor-pointer hover:bg-secondary/30 transition-colors"
                onClick={() => openDetail(req)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground">{req.title}</h3>
                    {req.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{req.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        isAnswered(req)
                          ? "bg-green-500/10 text-green-600"
                          : "bg-accent/10 text-accent"
                      }`}
                    >
                      {t(prayerStatus(req))}
                    </span>
                    <ChevronRight size={16} className="text-muted-foreground" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <User size={12} />
                      {authorLabel(req)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {format(new Date(req.created_at), "dd MMM", { locale: dateLoc })}
                    </span>
                  </div>
                  {canDelete(req) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(req.id);
                      }}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Detail modal */}
      <AnimatePresence>
        {detailPrayer && !showForm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40"
              onClick={closeDetail}
            />
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 24 }}
                className="w-full sm:max-w-lg bg-card rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border/50 px-5 py-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground mb-1">{t("Detalhes do pedido")}</p>
                    <h2 className="text-lg font-serif font-bold text-foreground">{detailPrayer.title}</h2>
                    <div className="flex items-center gap-2 flex-wrap mt-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          isAnswered(detailPrayer)
                            ? "bg-green-500/10 text-green-600 font-medium"
                            : "bg-accent/10 text-accent font-medium"
                        }`}
                      >
                        {t(prayerStatus(detailPrayer))}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock size={12} />
                        {formatPrayerDate(detailPrayer)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeDetail}
                    className="p-1.5 rounded-lg hover:bg-secondary flex-shrink-0"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="px-5 py-4 space-y-5">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyText(detailPrayer)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-xs font-medium hover:bg-secondary/80 transition-colors"
                    >
                      <Copy size={14} /> {t("Copiar")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleShare(detailPrayer)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-xs font-medium hover:bg-secondary/80 transition-colors"
                    >
                      <Share2 size={14} /> {t("Compartilhar")}
                    </button>
                    {canMarkStaff && !isAnswered(detailPrayer) && (
                      <button
                        type="button"
                        onClick={() => handleMarkAnswered(detailPrayer.id)}
                        disabled={markingAnswered}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-600 text-xs font-medium hover:bg-green-500/20 transition-colors disabled:opacity-50"
                      >
                        <CheckCircle size={14} />
                        {markingAnswered ? t("Carregando...") : t("Marcar respondido")}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-secondary/30 p-3">
                      <p className="text-xs text-muted-foreground mb-1">{t("Autor")}</p>
                      <p className="font-medium text-foreground flex items-center gap-1.5">
                        <User size={14} className="text-accent" />
                        {authorLabel(detailPrayer)}
                      </p>
                      {detailPrayer.is_private && (
                        <p className="text-[10px] text-muted-foreground mt-1">{t("Pedido enviado anonimamente")}</p>
                      )}
                    </div>
                    <div className="rounded-xl bg-secondary/30 p-3">
                      <p className="text-xs text-muted-foreground mb-1">{t("Status")}</p>
                      <p className="font-medium text-foreground">{t(prayerStatus(detailPrayer))}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2">{t("Descrição")}</h3>
                    {detailPrayer.description ? (
                      <div className="rounded-xl bg-secondary/30 p-4">
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {detailPrayer.description}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">{t("Sem descrição registrada")}</p>
                    )}
                  </div>

                  {isAnswered(detailPrayer) && (
                    <div className="flex items-center gap-2 rounded-xl bg-green-500/10 px-4 py-3 text-sm text-green-600">
                      <CheckCircle size={16} />
                      {t("Este pedido já foi respondido pela equipe pastoral")}
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Create modal */}
      <AnimatePresence>
        {showForm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40"
              onClick={() => setShowForm(false)}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md bg-card rounded-2xl p-6 shadow-xl max-h-[85vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-lg font-serif font-bold mb-1">{t("Novo Pedido de Oração")}</h2>
                <p className="text-xs text-muted-foreground mb-4">
                  {t("Seu pedido será compartilhado com a comunidade da igreja.")}
                </p>
                <div className="space-y-3">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t("Título do pedido")}
                    className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
                  />
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t("Descrição (opcional)")}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm resize-none"
                  />
                  <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isAnonymous}
                      onChange={(e) => setIsAnonymous(e.target.checked)}
                      className="rounded"
                    />
                    {t("Enviar de forma anônima")}
                  </label>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => setShowForm(false)}
                    className="flex-1 py-2 rounded-lg bg-secondary text-sm font-medium"
                  >
                    {t("Cancelar")}
                  </button>
                  <button
                    onClick={handleAdd}
                    className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
                  >
                    {t("Enviar Pedido")}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}
