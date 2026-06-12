import type { CampaignType } from "@/lib/campaignsDemo";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Building2,
  Calendar,
  Globe,
  Hammer,
  HeartHandshake,
  Megaphone,
  Music,
  Truck,
  Users,
} from "lucide-react";

/**
 * Render priority (future-safe):
 * 1. cover_image_url — uploaded image/banner
 * 2. cover_video_url — future video cover (not implemented)
 * 3. Local library — public/campaigns/{category}/ (see campaignImages.ts)
 * 4. CampaignAutoCover gradient — last resort without library URL
 */

export type CoverCategory =
  | "Reforma"
  | "Construção"
  | "Missões"
  | "Ação Social"
  | "Congresso"
  | "Evento"
  | "Instrumentos"
  | "Veículos"
  | "Emergencial"
  | "Livre";

export type CoverPriority = "low" | "normal" | "high" | "urgent";

export type CoverVariant = "card" | "hero" | "banner";

export type CoverTheme = {
  gradient: string;
  icon: LucideIcon;
  pattern: string;
  iconBg: string;
};

export const COVER_THEMES: Record<CoverCategory, CoverTheme> = {
  Reforma: {
    gradient: "from-slate-700 via-slate-600 to-amber-700",
    icon: Hammer,
    pattern: "radial-gradient(circle at 20% 80%, rgba(251,191,36,0.25) 0%, transparent 45%)",
    iconBg: "bg-amber-500/20 text-amber-100",
  },
  Construção: {
    gradient: "from-stone-700 via-orange-800 to-amber-600",
    icon: Building2,
    pattern: "linear-gradient(135deg, rgba(255,255,255,0.08) 25%, transparent 25%)",
    iconBg: "bg-orange-500/20 text-orange-100",
  },
  Missões: {
    gradient: "from-emerald-800 via-teal-700 to-cyan-600",
    icon: Globe,
    pattern: "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.15) 0%, transparent 40%)",
    iconBg: "bg-emerald-500/20 text-emerald-100",
  },
  "Ação Social": {
    gradient: "from-rose-700 via-pink-700 to-orange-600",
    icon: HeartHandshake,
    pattern: "radial-gradient(circle at 50% 100%, rgba(255,255,255,0.12) 0%, transparent 50%)",
    iconBg: "bg-rose-500/20 text-rose-100",
  },
  Congresso: {
    gradient: "from-indigo-800 via-violet-700 to-purple-600",
    icon: Users,
    pattern: "linear-gradient(45deg, rgba(255,255,255,0.06) 0%, transparent 50%)",
    iconBg: "bg-violet-500/20 text-violet-100",
  },
  Evento: {
    gradient: "from-blue-800 via-indigo-700 to-sky-600",
    icon: Calendar,
    pattern: "radial-gradient(circle at 10% 50%, rgba(147,197,253,0.2) 0%, transparent 45%)",
    iconBg: "bg-sky-500/20 text-sky-100",
  },
  Instrumentos: {
    gradient: "from-fuchsia-800 via-purple-700 to-violet-600",
    icon: Music,
    pattern: "linear-gradient(180deg, rgba(255,255,255,0.1) 0%, transparent 60%)",
    iconBg: "bg-fuchsia-500/20 text-fuchsia-100",
  },
  Veículos: {
    gradient: "from-zinc-700 via-slate-600 to-blue-700",
    icon: Truck,
    pattern: "linear-gradient(90deg, rgba(255,255,255,0.05) 50%, transparent 50%)",
    iconBg: "bg-blue-500/20 text-blue-100",
  },
  Emergencial: {
    gradient: "from-red-800 via-orange-700 to-amber-600",
    icon: AlertTriangle,
    pattern: "repeating-linear-gradient(-45deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 2px, transparent 2px, transparent 8px)",
    iconBg: "bg-red-500/25 text-red-100",
  },
  Livre: {
    gradient: "from-primary/90 via-primary/70 to-accent/80",
    icon: Megaphone,
    pattern: "radial-gradient(circle at 70% 30%, rgba(255,255,255,0.18) 0%, transparent 45%)",
    iconBg: "bg-white/15 text-white",
  },
};

export function normalizeCoverCategory(type: string): CoverCategory {
  const map: Record<string, CoverCategory> = {
    Reforma: "Reforma",
    reforma: "Reforma",
    Construção: "Construção",
    construcao: "Construção",
    Missões: "Missões",
    missoes: "Missões",
    "Ação Social": "Ação Social",
    acao_social: "Ação Social",
    Congresso: "Congresso",
    congresso: "Congresso",
    Evento: "Evento",
    evento: "Evento",
    Instrumentos: "Instrumentos",
    instrumentos: "Instrumentos",
    Veículos: "Veículos",
    veiculos: "Veículos",
    Emergencial: "Emergencial",
    emergencial: "Emergencial",
    Livre: "Livre",
    livre: "Livre",
    "Projeto Ministerial": "Livre",
    projeto_ministerial: "Livre",
  };
  return map[type] ?? "Livre";
}

export function normalizeCoverPriority(priority?: string, featured?: boolean): CoverPriority {
  if (priority === "low" || priority === "normal" || priority === "high" || priority === "urgent") {
    return priority;
  }
  if (featured) return "high";
  return "normal";
}

export function resolveCoverTheme(type: CampaignType | string): CoverTheme {
  return COVER_THEMES[normalizeCoverCategory(type)];
}
