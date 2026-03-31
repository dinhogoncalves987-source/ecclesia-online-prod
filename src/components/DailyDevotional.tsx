import { useState, useEffect } from "react";
import { BookOpen, RefreshCw, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { motion } from "framer-motion";

interface Devotional {
  verse: string;
  reference: string;
  reflection: string;
}

export function DailyDevotional() {
  const { t } = useLanguage();
  const [devotional, setDevotional] = useState<Devotional | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDevotional = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("daily-devotional");
      if (error) throw error;
      setDevotional(data as Devotional);
    } catch (e) {
      console.error("Error fetching devotional:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevotional();
  }, []);

  if (loading) {
    return (
      <div className="bg-gradient-to-r from-primary/10 via-accent/10 to-primary/5 rounded-xl p-5 sm:p-6 border border-primary/20 animate-pulse">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20" />
          <div className="h-5 w-40 bg-primary/20 rounded" />
        </div>
        <div className="h-4 w-full bg-primary/10 rounded mb-2" />
        <div className="h-4 w-3/4 bg-primary/10 rounded" />
      </div>
    );
  }

  if (!devotional) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-accent/5 to-secondary/30 rounded-xl p-5 sm:p-6 border border-primary/20"
    >
      {/* Decorative element */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
              <BookOpen size={16} className="text-primary" />
            </div>
            <h2 className="font-serif text-lg text-foreground">{t("Devocional do Dia")}</h2>
          </div>
          <button
            onClick={fetchDevotional}
            className="p-1.5 rounded-lg hover:bg-secondary/50 transition-colors text-muted-foreground hover:text-foreground"
            title={t("Atualizar")}
          >
            <RefreshCw size={14} />
          </button>
        </div>

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
      </div>
    </motion.div>
  );
}
