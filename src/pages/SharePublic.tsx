import { useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { BookOpen, Sparkles, Sun, CloudSun, Moon, UserPlus, ArrowRight, Heart, MessageSquare } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

// ─── Standalone i18n for this public page (no useLanguage hook dependency) ───
type Lang = "pt" | "en" | "es";

function getLang(raw?: string | null): Lang {
  const l = (raw || "pt").toLowerCase();
  if (l.startsWith("en")) return "en";
  if (l.startsWith("es")) return "es";
  return "pt";
}

const COPY: Record<string, Record<Lang, string>> = {
  tagline:          { pt: "Plataforma de Gestão Pastoral", en: "Church Management Platform", es: "Plataforma de Gestión Pastoral" },
  sharedBy:         { pt: "Compartilhado pelo", en: "Shared by", es: "Compartido por" },
  devotionalTitle:  { pt: "Devocional do Dia", en: "Daily Devotional", es: "Devocional del Día" },
  bibleTitle:       { pt: "Assistente Bíblico", en: "Bible Assistant", es: "Asistente Bíblico" },
  messageTitle:     { pt: "Mensagem Pastoral", en: "Pastoral Message", es: "Mensaje Pastoral" },
  reflection:       { pt: "Reflexão", en: "Reflection", es: "Reflexión" },
  discoverEcclesia: { pt: "Conhecer o Ecclesia", en: "Discover Ecclesia", es: "Conocer Ecclesia" },
  joinAsMember:     { pt: "Entrar como membro", en: "Join as a member", es: "Unirme como miembro" },
  joinThisChurch:   { pt: "Entrar nesta igreja", en: "Join this church", es: "Unirme a esta iglesia" },
  desc: {
    pt: "O Ecclesia conecta igrejas, membros e ministérios com tecnologia e espiritualidade.",
    en: "Ecclesia connects churches, members, and ministries with technology and spirituality.",
    es: "Ecclesia conecta iglesias, miembros y ministerios con tecnología y espiritualidad.",
  },
  features: {
    pt: "Bíblia com IA • Devocionais • Gestão de Membros • Financeiro",
    en: "AI Bible • Devotionals • Member Management • Treasury",
    es: "Biblia con IA • Devocionales • Gestión de Miembros • Finanzas",
  },
  manha:   { pt: "Manhã", en: "Morning", es: "Mañana" },
  tarde:   { pt: "Tarde", en: "Afternoon", es: "Tarde" },
  noite:   { pt: "Noite", en: "Evening", es: "Noche" },
};

const t = (key: string, lang: Lang): string => COPY[key]?.[lang] ?? key;

const PERIOD_ICONS: Record<string, typeof Sun> = {
  manha: Sun,
  tarde: CloudSun,
  noite: Moon,
};

const TYPE_ICONS: Record<string, typeof BookOpen> = {
  devotional: BookOpen,
  bible: Sparkles,
  message: Heart,
};

// Resolve default title from type
function defaultTitle(type: string, lang: Lang): string {
  if (type === "devotional") return t("devotionalTitle", lang);
  if (type === "bible")      return t("bibleTitle", lang);
  return t("messageTitle", lang);
}

export default function SharePublic() {
  const [params] = useSearchParams();

  const type    = (params.get("type") || "message").slice(0, 20);
  const title   = (params.get("title") || "").slice(0, 80);
  const verse   = (params.get("verse") || "").slice(0, 300);
  const ref     = (params.get("ref") || "").slice(0, 50);
  const text    = (params.get("text") || "").slice(0, 600);
  const church  = (params.get("church") || "").replace(/[^a-z0-9-]/gi, "").slice(0, 80);
  const lang    = getLang(params.get("lang"));

  const displayTitle = title || defaultTitle(type, lang);
  const periodKey = (title || "").toLowerCase().includes("manh") ? "manha"
    : (title || "").toLowerCase().includes("tarde") || (title || "").toLowerCase().includes("afternoon") ? "tarde"
    : (title || "").toLowerCase().includes("noit") || (title || "").toLowerCase().includes("evening") ? "noite"
    : undefined;

  const PeriodIcon = periodKey ? PERIOD_ICONS[periodKey] : undefined;
  const TypeIcon = TYPE_ICONS[type] || MessageSquare;

  const signupHref = church ? `/signup?church=${church}` : "/signup";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 py-4 border-b border-border/40">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-accent font-serif text-lg leading-none">Ω</span>
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">Ecclesia</p>
            <p className="text-[10px] text-muted-foreground leading-tight">{t("tagline", lang)}</p>
          </div>
        </Link>
        <ThemeToggle />
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10 space-y-8">
        {/* Content card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="bg-card border border-border/50 rounded-2xl shadow-executive overflow-hidden"
        >
          {/* Card header */}
          <div className="px-6 pt-6 pb-4 border-b border-border/30 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
              {PeriodIcon
                ? <PeriodIcon size={20} className="text-accent" />
                : <TypeIcon size={20} className="text-accent" />
              }
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">Ecclesia</p>
              <h1 className="text-base font-serif font-medium truncate">{displayTitle}</h1>
            </div>
          </div>

          {/* Card body */}
          <div className="px-6 py-5 space-y-4">
            {/* Verse */}
            {verse && (
              <div>
                <blockquote className="text-base sm:text-lg italic leading-relaxed text-foreground/90 pl-4 border-l-2 border-accent/50">
                  "{verse}"
                </blockquote>
                {ref && (
                  <p className="mt-2 text-sm font-semibold text-accent pl-4">— {ref}</p>
                )}
              </div>
            )}

            {/* Reflection / text */}
            {text && (
              <div className="flex gap-3 items-start bg-secondary/40 rounded-xl p-4">
                <Sparkles size={16} className="text-accent mt-0.5 flex-shrink-0" />
                <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
              </div>
            )}

            {/* If only title, no content */}
            {!verse && !text && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {type === "devotional" ? t("devotionalTitle", lang) : t("bibleTitle", lang)}
              </p>
            )}
          </div>
        </motion.div>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.15 }}
          className="space-y-3"
        >
          {/* Primary: join this church */}
          {church && (
            <Link to={signupHref}
              className="flex items-center justify-between w-full px-5 py-4 bg-accent text-accent-foreground rounded-xl font-semibold hover:opacity-90 transition-opacity shadow-md"
            >
              <div className="flex items-center gap-3">
                <UserPlus size={18} />
                <span>{t("joinThisChurch", lang)}</span>
              </div>
              <ArrowRight size={18} />
            </Link>
          )}

          {/* Secondary: join as member */}
          <Link to={signupHref}
            className="flex items-center justify-between w-full px-5 py-4 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition-opacity"
          >
            <div className="flex items-center gap-3">
              <UserPlus size={18} />
              <span>{t("joinAsMember", lang)}</span>
            </div>
            <ArrowRight size={18} />
          </Link>

          {/* Tertiary: discover */}
          <Link to="/"
            className="flex items-center justify-between w-full px-5 py-4 bg-card border border-border/50 rounded-xl font-medium hover:bg-secondary/50 transition-colors text-foreground"
          >
            <div className="flex items-center gap-3">
              <BookOpen size={18} className="text-accent" />
              <span>{t("discoverEcclesia", lang)}</span>
            </div>
            <ArrowRight size={18} className="text-muted-foreground" />
          </Link>
        </motion.div>

        {/* Platform description */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="text-center space-y-2 pb-6"
        >
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-accent font-serif text-base leading-none">Ω</span>
            </div>
            <span className="font-serif text-lg">Ecclesia Admin</span>
          </div>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">{t("desc", lang)}</p>
          <p className="text-xs text-muted-foreground/60 mt-2">{t("features", lang)}</p>
        </motion.div>
      </main>
    </div>
  );
}
