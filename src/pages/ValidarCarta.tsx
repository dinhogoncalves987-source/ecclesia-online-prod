/**
 * Public recommendation-letter validation page.
 * Route: /validar/carta/:token
 * No authentication required — the token is the access key.
 */
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2, ShieldCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { fetchLetterByToken, type RecommendationLetter } from "@/lib/recommendationLetters";
import { ThemeToggle } from "@/components/ThemeToggle";

// ── Standalone i18n (this page is outside the LanguageProvider) ───────────────
const COPY = {
  loading:        "Verificando carta...",
  invalid:        "Carta não encontrada ou ainda não aprovada.",
  invalidHint:    "Este link pode estar desatualizado, ou a carta ainda está em análise.",
  valid:          "Carta de Recomendação Válida",
  member:         "Membro",
  destination:    "Igreja destino",
  originChurch:   "Igreja de origem",
  city:           "Cidade",
  approvedAt:     "Data de aprovação",
  validCode:      "Código de validação",
  validHint:      "Este documento é verificado e emitido via Ecclesia Online.",
  backToHome:     "Ir para o Ecclesia Online",
  reason:         "Motivo da recomendação",
  platform:       "Ecclesia Online — Plataforma de Gestão Pastoral",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return format(new Date(iso), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
}

function shortCode(token: string): string {
  return token.replace(/-/g, "").slice(0, 8).toUpperCase();
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ValidarCarta() {
  const { token } = useParams<{ token: string }>();
  const [letter, setLetter] = useState<RecommendationLetter | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetchLetterByToken(token).then((result) => {
      setLetter(result);
      setLoading(false);
    });
  }, [token]);

  const validationUrl = token ? `${window.location.origin}/validar/carta/${token}` : "";
  const code = letter ? shortCode(letter.publicToken) : shortCode(token ?? "");

  const destinationFull = letter
    ? letter.destinationState
      ? `${letter.destinationCity}/${letter.destinationState}`
      : letter.destinationCity
    : "";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck size={20} className="text-primary" />
          <span className="font-semibold text-sm">{COPY.platform}</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="max-w-xl mx-auto px-4 py-10">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
            <Loader2 size={36} className="animate-spin" />
            <p>{COPY.loading}</p>
          </div>
        ) : !letter ? (
          /* ── Invalid / not found ── */
          <div className="text-center py-20">
            <XCircle size={52} className="mx-auto text-rose-500 mb-4" />
            <h1 className="text-xl font-bold text-foreground mb-2">{COPY.invalid}</h1>
            <p className="text-sm text-muted-foreground mb-8 max-w-xs mx-auto">
              {COPY.invalidHint}
            </p>
            <Link
              to="/"
              className="inline-block px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {COPY.backToHome}
            </Link>
          </div>
        ) : (
          /* ── Valid approved letter ── */
          <div className="space-y-6">
            {/* Status banner */}
            <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3">
              <CheckCircle2 size={22} className="text-emerald-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {COPY.valid}
                </p>
                <p className="text-xs text-muted-foreground">{COPY.validHint}</p>
              </div>
            </div>

            {/* Document card */}
            <div className="bg-white dark:bg-neutral-900 border border-border rounded-2xl shadow-sm overflow-hidden">
              {/* Document header */}
              <div className="bg-neutral-50 dark:bg-neutral-800 border-b border-border px-6 py-5 text-center">
                <p className="text-xs font-sans font-semibold tracking-widest text-muted-foreground uppercase mb-1">
                  Documento Eclesiástico Oficial
                </p>
                <h2 className="text-xl font-serif font-bold text-foreground">
                  Carta de Recomendação
                </h2>
                {letter.originChurchName && (
                  <p className="text-sm text-muted-foreground mt-1 font-sans">
                    {letter.originChurchName}
                  </p>
                )}
              </div>

              {/* Fields */}
              <div className="px-6 py-5 space-y-4">
                <Field label={COPY.member} value={letter.memberName} highlight />
                {letter.originChurchName && (
                  <Field label={COPY.originChurch} value={letter.originChurchName} />
                )}
                <Field label={COPY.destination} value={letter.destinationChurch} />
                <Field label={COPY.city} value={destinationFull} />
                <Field label={COPY.approvedAt} value={fmtDate(letter.approvedAt)} />
                {letter.reason && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      {COPY.reason}
                    </p>
                    <p className="text-sm text-foreground leading-relaxed">{letter.reason}</p>
                  </div>
                )}
              </div>

              {/* Validation footer */}
              <div className="border-t border-border px-6 py-5 flex items-end justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">{COPY.validCode}</p>
                  <p className="font-mono text-lg font-bold tracking-widest text-foreground">
                    {code}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 break-all">{validationUrl}</p>
                  <p className="text-[10px] text-muted-foreground/50 mt-2 font-sans">
                    {COPY.platform}
                  </p>
                </div>

                <div className="flex-shrink-0">
                  <QRCodeSVG
                    value={validationUrl}
                    size={80}
                    level="M"
                    bgColor="transparent"
                    fgColor="currentColor"
                    className="text-foreground"
                  />
                  <p className="text-[9px] text-muted-foreground text-center mt-1">
                    Verificar online
                  </p>
                </div>
              </div>
            </div>

            <p className="text-center text-xs text-muted-foreground/60">
              <Link to="/" className="hover:underline">
                {COPY.backToHome}
              </Link>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Small helper ──────────────────────────────────────────────────────────────

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-sm ${highlight ? "font-semibold text-foreground" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}
