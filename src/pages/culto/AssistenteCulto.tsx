import { useState } from "react";
import { Link } from "react-router-dom";
import { AdminLayout } from "@/components/AdminLayout";
import { useLanguage } from "@/hooks/useLanguage";
import { Sparkles, ArrowLeft, Send } from "lucide-react";

const EXAMPLE_PROMPTS = [
  "Sugira 3 hinos de adoração para abertura de culto dominical",
  "Monte um roteiro simples de culto de 60 minutos",
  "Quais versículos combinam com o tema 'gratidão'?",
  "Sugira uma escala de louvor para este domingo",
];

export default function AssistenteCulto() {
  const { t } = useLanguage();
  const [input, setInput] = useState("");

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <Link to="/admin/culto" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2">
            <ArrowLeft size={14} /> {t("Culto & Louvor")}
          </Link>
          <h1 className="text-2xl font-serif font-bold flex items-center gap-2">
            <Sparkles className="text-amber-500" size={26} />
            {t("Assistente de Culto IA")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("Em breve: sugestões inteligentes para culto e louvor")}</p>
        </div>

        <div className="bg-gradient-to-br from-amber-500/10 to-transparent rounded-2xl border border-amber-500/20 p-5">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("O assistente IA ajudará a sugerir hinos, montar roteiros e conectar passagens bíblicas. A integração completa será disponibilizada em breve.")}
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("Exemplos de prompts")}</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setInput(prompt)}
                className="text-left text-xs px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground max-w-full"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("Descreva o que você precisa para o culto...")}
            rows={4}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none"
          />
          <button
            type="button"
            disabled
            title={t("Em breve")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/40 text-primary-foreground/60 text-sm font-medium cursor-not-allowed"
          >
            <Send size={14} /> {t("Enviar")} — {t("Em breve")}
          </button>
        </div>
      </div>
    </AdminLayout>
  );
}
