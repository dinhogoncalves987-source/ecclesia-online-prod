import { useState, useEffect } from "react";
import { BookOpen, RefreshCw, Sparkles, Sun, CloudSun, Moon, Share2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { buildShareUrl, triggerShare } from "@/lib/share";
import { useChurch } from "@/hooks/useChurchContext";
import { motion } from "framer-motion";

interface Devotional {
  verse: string;
  reference: string;
  reflection: string;
  period: string;
}

type Period = "manha" | "tarde" | "noite";

const PERIOD_CONFIG: Record<Period, { labelKey: string; icon: typeof Sun; gradient: string; borderColor: string }> = {
  manha: {
    labelKey: "Devocional da Manhã",
    icon: Sun,
    gradient: "from-amber-500/10 via-orange-400/5 to-yellow-300/10",
    borderColor: "border-amber-400/30",
  },
  tarde: {
    labelKey: "Devocional da Tarde",
    icon: CloudSun,
    gradient: "from-sky-500/10 via-blue-400/5 to-cyan-300/10",
    borderColor: "border-sky-400/30",
  },
  noite: {
    labelKey: "Devocional da Noite",
    icon: Moon,
    gradient: "from-indigo-500/10 via-purple-400/5 to-violet-300/10",
    borderColor: "border-indigo-400/30",
  },
};

function getCurrentPeriod(): Period {
  const hour = new Date().getHours();
  if (hour < 13) return "manha";      // 00:00 - 12:59 → manhã (starts 07:00)
  if (hour < 18) return "tarde";       // 13:00 - 17:59 → tarde (starts 13:30)
  return "noite";                       // 18:00 - 23:59 → noite (starts 19:00)
}

export function DailyDevotional() {
  const { t, lang } = useLanguage();
  const { church } = useChurch();
  const [devotional, setDevotional] = useState<Devotional | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activePeriod, setActivePeriod] = useState<Period>(getCurrentPeriod);
  const [copied, setCopied] = useState(false);

  const buildUrl = () => {
    if (!devotional) return window.location.origin + "/share?type=devotional";
    const locale = lang === "en" ? "en" : lang === "es" ? "es" : "pt";
    return buildShareUrl({
      type: "devotional",
      title: t(PERIOD_CONFIG[activePeriod].labelKey),
      verse: devotional.verse,
      ref: devotional.reference,
      text: devotional.reflection || "",
      church: church?.slug || church?.id || "",
      lang: locale,
    });
  };

  const handleShare = async () => {
    if (!devotional) return;
    const url = buildUrl();
    const result = await triggerShare({
      url,
      title: t(PERIOD_CONFIG[activePeriod].labelKey),
      text: `"${devotional.verse}" — ${devotional.reference}`,
    });
    if (result === "copied") {
      setCopied(true);
      toast.success(t("Link copiado!"));
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopy = async () => {
    const url = buildUrl();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      await navigator.clipboard.writeText(`"${devotional?.verse}" — ${devotional?.reference}`);
    }
    setCopied(true);
    toast.success(t("Link copiado!"));
    setTimeout(() => setCopied(false), 2000);
  };

  const fetchDevotional = async (period: Period) => {
    setLoading(true);
    setError(false);
    setDevotional(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const locale = lang === "en" ? "en" : lang === "es" ? "es" : "pt";
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/daily-devotional?period=${period}&locale=${locale}`;
      const resp = await fetch(url, {
        headers: {
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const result = await resp.json();
      if (result.error) throw new Error(result.error);
      setDevotional(result as Devotional);
    } catch (e) {
      console.error("Error fetching devotional:", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevotional(activePeriod);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePeriod, lang]);

  const config = PERIOD_CONFIG[activePeriod];
  const PeriodIcon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`relative overflow-hidden bg-gradient-to-br ${config.gradient} rounded-xl p-5 sm:p-6 border ${config.borderColor}`}
    >
      {/* Decorative circle */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />

      <div className="relative z-10">
        {/* Header with period tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div className="flex items-center gap-2 flex-1">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
              <BookOpen size={16} className="text-primary" />
            </div>
            <h2 className="font-serif text-lg text-foreground">{t(config.labelKey)}</h2>
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-1 bg-background/60 rounded-lg p-1">
            {(["manha", "tarde", "noite"] as Period[]).map((p) => {
              const Icon = PERIOD_CONFIG[p].icon;
              const isActive = p === activePeriod;
              return (
                <button
                  key={p}
                  onClick={() => setActivePeriod(p)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                >
                  <Icon size={12} />
                  <span className="hidden sm:inline">
                    {p === "manha" ? t("Manhã") : p === "tarde" ? t("Tarde") : t("Noite")}
                  </span>
                </button>
              );
            })}
            <button
              onClick={() => fetchDevotional(activePeriod)}
              className="p-1.5 rounded-md hover:bg-secondary/50 transition-colors text-muted-foreground hover:text-foreground ml-1"
              title={t("Atualizar")}
            >
              <RefreshCw size={12} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-4 w-full bg-primary/10 rounded" />
            <div className="h-4 w-3/4 bg-primary/10 rounded" />
            <div className="h-3 w-1/4 bg-primary/10 rounded mt-1" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 py-2">
            <p className="text-xs text-muted-foreground flex-1">{t("Não foi possível carregar o devocional.")}</p>
            <button
              onClick={() => fetchDevotional(activePeriod)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-secondary/50 hover:bg-secondary text-xs font-medium transition-colors"
            >
              <RefreshCw size={11} /> {t("Tentar novamente")}
            </button>
          </div>
        ) : devotional ? (
          <>
            <blockquote className="text-sm sm:text-base italic text-foreground/90 leading-relaxed mb-2 pl-3 border-l-2 border-primary/40">
              "{devotional.verse}"
            </blockquote>
            <p className="text-xs font-semibold text-primary mb-3">— {devotional.reference}</p>

            {devotional.reflection && (
              <div className="flex gap-2 items-start bg-background/50 rounded-lg p-3">
                <Sparkles size={14} className="text-accent mt-0.5 flex-shrink-0" />
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{devotional.reflection}</p>
              </div>
            )}

            {/* Share & Copy buttons */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/30">
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors"
              >
                <Share2 size={13} /> {t("Compartilhar")}
              </button>
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/50 hover:bg-secondary text-foreground text-xs font-medium transition-colors"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? t("Copiado!") : t("Copiar")}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </motion.div>
  );
}
