import { useState, useEffect, useCallback } from "react";
import { BookOpen, RefreshCw, Sparkles, Sun, CloudSun, Moon, Share2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import { buildShareUrl, triggerShare } from "@/lib/share";
import { useChurch } from "@/hooks/useChurchContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { getCachedDevotional, cacheDevotional } from "@/lib/offlineCache";
import { fetchEdgeFunction } from "@/lib/edgeFetch";

interface Devotional {
  verse: string;
  reference: string;
  reflection: string;
  period: string;
  reflectionSource?: "ai" | "static" | "cache";
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

const STATIC_REFLECTION: Record<Period, Record<"pt" | "en" | "es", string>> = {
  manha: {
    pt: "Que esta manhã encontre um coração aberto à voz de Deus.\nAntes das demandas do dia, reserve um momento para ouvir o Senhor e entregar a Ele suas expectativas.\nEsta palavra é direção, não apenas inspiração: ela quer moldar suas atitudes, palavras e decisões.\nQuando surgir pressa ou ansiedade, volte a esta verdade e caminhe com calma, sabendo que Deus vai à sua frente.\nPratique hoje uma fé concreta: cumprimente alguém com gentileza, cumpra uma tarefa com integridade ou ore antes de responder.\nNão precisa resolver tudo de uma vez; basta dar o próximo passo confiando na fidelidade dEle.\nQue a luz desta manhã ilumine cada escolha e que você sinta a presença do Senhor em cada detalhe do dia.",
    en: "May this morning find your heart open to God's voice.\nBefore the day's demands, take a moment to listen to the Lord and surrender your expectations to Him.\nThis word is guidance, not just inspiration: it is meant to shape your attitudes, words, and decisions.\nWhen hurry or anxiety arise, return to this truth and walk calmly, knowing God goes before you.\nPractice faith in a concrete way today: greet someone kindly, work with integrity, or pray before you respond.\nYou do not need to solve everything at once; simply take the next step trusting in His faithfulness.\nMay the light of this morning guide every choice, and may you sense the Lord's presence in each detail of the day.",
    es: "Que esta mañana encuentre tu corazón abierto a la voz de Dios.\nAntes de las exigencias del día, dedica un momento para escuchar al Señor y entregarle tus expectativas.\nEsta palabra es dirección, no solo inspiración: quiere moldear tus actitudes, palabras y decisiones.\nCuando surjan prisa o ansiedad, vuelve a esta verdad y camina con calma, sabiendo que Dios va delante de ti.\nPractica hoy una fe concreta: saluda con amabilidad, trabaja con integridad u ora antes de responder.\nNo necesitas resolverlo todo de una vez; da el siguiente paso confiando en Su fidelidad.\nQue la luz de esta mañana guíe cada elección y sientas la presencia del Señor en cada detalle del día.",
  },
  tarde: {
    pt: "No meio deste dia, faça uma pausa e renove suas forças na presença do Senhor.\nTalvez a manhã tenha sido corrida ou cansativa; mesmo assim, Deus não se afastou de você.\nEsta palavra é um lembrete de que você não caminha sozinho e que há graça para continuar.\nReavalié o que ainda pode ser feito com paz: priorize o essencial e entregue a Deus o que não depende de você.\nEscolha uma aplicação prática para esta tarde — pedir perdão, ajudar alguém ou concluir algo com excelência.\nNão compare seu ritmo com o dos outros; caminhe fielmente no tempo que o Senhor lhe deu.\nQue esta tarde seja marcada por perseverança serena e pela certeza de que Ele sustenta cada passo.",
    en: "In the middle of this day, pause and renew your strength in the Lord's presence.\nPerhaps the morning was busy or tiring; even so, God has not moved away from you.\nThis word reminds you that you do not walk alone and that there is grace to keep going.\nReassess what can still be done with peace: prioritize what matters and surrender what is beyond your control.\nChoose one practical application for this afternoon — ask forgiveness, help someone, or finish a task with excellence.\nDo not compare your pace with others; walk faithfully in the time the Lord has given you.\nMay this afternoon be marked by calm perseverance and the certainty that He upholds every step.",
    es: "En medio de este día, haz una pausa y renueva tus fuerzas en la presencia del Señor.\nQuizá la mañana fue apresurada o cansada; aun así, Dios no se ha alejado de ti.\nEsta palabra te recuerda que no caminas solo y que hay gracia para continuar.\nReevalúa lo que aún puede hacerse con paz: prioriza lo esencial y entrégale a Dios lo que no depende de ti.\nElige una aplicación práctica para esta tarde — pedir perdón, ayudar a alguien o terminar algo con excelencia.\nNo compares tu ritmo con el de otros; camina fielmente en el tiempo que el Señor te ha dado.\nQue esta tarde esté marcada por perseverancia serena y la certeza de que Él sostiene cada paso.",
  },
  noite: {
    pt: "Ao encerrar este dia, descanse na paz de quem confia em Deus.\nOlhe para trás com gratidão pelas provisões recebidas, mesmo nas pequenas coisas que passaram despercebidas.\nPerdoe o que ficou pendente em você e entregue a Deus o que ainda pesa no coração.\nEsta palavra convida ao descanso da alma, não apenas do corpo — o Senhor cuida de quem Lhe pertence.\nAntes de dormir, nomeie uma bênção do dia e uma preocupação que você coloca nas mãos dEle.\nAmanhã é nova graça; hoje, apenas receba o amor do Pai e deixe que Ele acalme seus pensamentos.\nQue a paz de Cristo guarde seu coração e que você durma seguro sob o cuidado fiel do Senhor.",
    en: "As you close this day, rest in the peace of those who trust in God.\nLook back with gratitude for the provisions received, even in small things that went unnoticed.\nForgive what remains unfinished in you and surrender to God what still weighs on your heart.\nThis word invites rest for the soul, not just the body — the Lord cares for those who belong to Him.\nBefore sleeping, name one blessing from the day and one worry you place in His hands.\nTomorrow is new grace; tonight, simply receive the Father's love and let Him quiet your thoughts.\nMay the peace of Christ guard your heart, and may you sleep secure under the Lord's faithful care.",
    es: "Al cerrar este día, descansa en la paz de quien confía en Dios.\nMira atrás con gratitud por las provisiones recibidas, incluso en las cosas pequeñas que pasaron desapercibidas.\nPerdona lo que quedó pendiente en ti y entrégale a Dios lo que aún pesa en tu corazón.\nEsta palabra invita al descanso del alma, no solo del cuerpo — el Señor cuida de quien Le pertenece.\nAntes de dormir, nombra una bendición del día y una preocupación que pones en Sus manos.\nMañana es nueva gracia; esta noche, recibe el amor del Padre y deja que Él calme tus pensamientos.\nQue la paz de Cristo guarde tu corazón y duermas seguro bajo el cuidado fiel del Señor.",
  },
};

function isReflectionTooShort(reflection: string): boolean {
  const trimmed = reflection.trim();
  if (!trimmed) return true;
  if (trimmed.length < 180) return true;
  const sentences = trimmed.split(/[.!?…]+/).filter((s) => s.trim().length > 8);
  return sentences.length < 4;
}

function getCurrentPeriod(): Period {
  const hour = new Date().getHours();
  if (hour < 13) return "manha";
  if (hour < 18) return "tarde";
  return "noite";
}

function getLocalDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getLocale(lang: string): "pt" | "en" | "es" {
  if (lang === "en") return "en";
  if (lang === "es") return "es";
  return "pt";
}

function normalizeDevotional(raw: Record<string, unknown>, period: Period): Devotional {
  const reflection = String(raw.reflection ?? raw.text ?? "").trim();
  return {
    verse: String(raw.verse ?? "").trim(),
    reference: String(raw.reference ?? "").trim(),
    reflection,
    period: String(raw.period ?? period),
    reflectionSource: (raw.reflectionSource as Devotional["reflectionSource"]) ?? (reflection ? "ai" : "static"),
  };
}

function withFallbackReflection(data: Devotional, period: Period, locale: "pt" | "en" | "es"): Devotional {
  if (data.reflection.trim() && !isReflectionTooShort(data.reflection)) return data;
  return {
    ...data,
    reflection: STATIC_REFLECTION[period][locale],
    reflectionSource: "static",
  };
}

const REFRESH_REFLECTION: Record<"pt" | "en" | "es", string> = {
  pt: "Meditação atualizada. Medite nesta palavra e peça ao Senhor sabedoria para aplicá-la hoje.",
  en: "Meditation updated. Reflect on this word and ask the Lord for wisdom to apply it today.",
  es: "Meditación actualizada. Medita en esta palabra y pide al Señor sabiduría para aplicarla hoy.",
};

function withRefreshReflection(data: Devotional, locale: "pt" | "en" | "es"): Devotional {
  if (data.reflection.trim() && !isReflectionTooShort(data.reflection)) return data;
  return {
    ...data,
    reflection: REFRESH_REFLECTION[locale],
    reflectionSource: "static",
  };
}

export function DailyDevotional() {
  const { t, lang } = useLanguage();
  const { church } = useChurch();
  const isOnline = useOnlineStatus();
  const [devotional, setDevotional] = useState<Devotional | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [activePeriod, setActivePeriod] = useState<Period>(getCurrentPeriod);
  const [copied, setCopied] = useState(false);

  const locale = getLocale(lang);

  const buildUrl = () => {
    if (!devotional) return window.location.origin + "/share?type=devotional";
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

  const fetchDevotional = useCallback(async (period: Period, options?: { refresh?: boolean }) => {
    const isRefresh = options?.refresh === true;
    if (isRefresh) setRefreshing(true);
    else if (!devotional) setLoading(true);
    setError(false);
    if (!isRefresh) setFromCache(false);

    const today = getLocalDateString();

    // Normal load offline: use cache only
    if (!isOnline && !isRefresh) {
      const cached = getCachedDevotional(today, period, locale);
      if (cached?.verse) {
        setDevotional(withFallbackReflection({ ...cached, reflectionSource: "cache" }, period, locale));
        setFromCache(true);
      } else {
        setError(true);
      }
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Normal load online: show cache immediately, then refresh in background
    if (!isRefresh) {
      const cached = getCachedDevotional(today, period, locale);
      if (cached?.verse) {
        setDevotional(withFallbackReflection({ ...cached, reflectionSource: "cache" }, period, locale));
        setFromCache(true);
        setLoading(false);
      }
    }

    try {
      const params: Record<string, string> = { period, locale };
      if (isRefresh) {
        params.seed = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        params.forceRefresh = "1";
      }

      const result = await fetchEdgeFunction<Record<string, unknown>>("daily-devotional", params, {
        timeoutMs: 35_000,
        cache: isRefresh ? "no-store" : "default",
      });

      if (result.error) throw new Error(String(result.error));

      const normalized = normalizeDevotional(result, period);
      const data = isRefresh
        ? withRefreshReflection(normalized, locale)
        : withFallbackReflection(normalized, period, locale);
      if (!data.verse) throw new Error("Empty verse");

      setDevotional(data);
      setFromCache(false);
      cacheDevotional(today, period, locale, {
        verse: data.verse,
        reference: data.reference,
        reflection: data.reflection,
        period: data.period,
      });
    } catch (e) {
      console.error("Error fetching devotional:", e);
      if (isRefresh) {
        setError(true);
        toast.error("Não foi possível carregar o devocional.");
      } else {
        const cached = getCachedDevotional(today, period, locale);
        if (cached?.verse) {
          setDevotional(withFallbackReflection({ ...cached, reflectionSource: "cache" }, period, locale));
          setFromCache(true);
        } else {
          setError(true);
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isOnline, locale]);

  useEffect(() => {
    fetchDevotional(activePeriod);
  }, [activePeriod, fetchDevotional]);

  const config = PERIOD_CONFIG[activePeriod];
  const showSkeleton = loading && !devotional;
  const reflectionText = devotional?.reflection?.trim() ?? "";

  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br ${config.gradient} rounded-xl p-5 sm:p-6 border ${config.borderColor} animate-in fade-in duration-500`}
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />

      <div className="relative z-10">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div className="flex items-center gap-2 flex-1">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
              <BookOpen size={16} className="text-primary" />
            </div>
            <h2 className="font-serif text-lg text-foreground">{t(config.labelKey)}</h2>
          </div>

          <div className="flex items-center gap-1 bg-background/60 rounded-lg p-1">
            {(["manha", "tarde", "noite"] as Period[]).map((p) => {
              const Icon = PERIOD_CONFIG[p].icon;
              const isActive = p === activePeriod;
              return (
                <button
                  key={p}
                  type="button"
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
              type="button"
              onClick={() => fetchDevotional(activePeriod, { refresh: true })}
              disabled={refreshing || loading}
              className="p-1.5 rounded-md hover:bg-secondary/50 transition-colors text-muted-foreground hover:text-foreground ml-1 disabled:opacity-50"
              title={t("Atualizar")}
            >
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {showSkeleton ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-4 w-full bg-primary/10 rounded" />
            <div className="h-4 w-3/4 bg-primary/10 rounded" />
            <div className="h-3 w-1/4 bg-primary/10 rounded mt-1" />
            <div className="h-16 w-full bg-primary/10 rounded mt-3" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 py-2">
            <p className="text-xs text-muted-foreground flex-1">{t("Não foi possível carregar o devocional.")}</p>
            <button
              type="button"
              onClick={() => fetchDevotional(activePeriod, { refresh: true })}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-secondary/50 hover:bg-secondary text-xs font-medium transition-colors"
            >
              <RefreshCw size={11} /> {t("Tentar novamente")}
            </button>
          </div>
        ) : devotional ? (
          <>
            <blockquote className="text-sm sm:text-base italic text-foreground/90 leading-relaxed mb-2 pl-3 border-l-2 border-primary/40">
              &ldquo;{devotional.verse}&rdquo;
            </blockquote>
            <p className="text-xs font-semibold text-primary mb-3">— {devotional.reference}</p>

            <div className="flex gap-2 items-start bg-background/50 rounded-lg p-3">
              <Sparkles size={14} className="text-accent mt-0.5 flex-shrink-0" />
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {reflectionText || STATIC_REFLECTION[activePeriod][locale]}
              </p>
            </div>

            {(fromCache || devotional.reflectionSource === "static") && (
              <p className="text-[10px] text-muted-foreground/60 mt-1 text-right">
                {fromCache ? t("Exibindo conteúdo salvo") : t("Reflexão pastoral")}
              </p>
            )}

            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/30">
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors"
              >
                <Share2 size={13} /> {t("Compartilhar")}
              </button>
              <button
                type="button"
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
    </div>
  );
}
