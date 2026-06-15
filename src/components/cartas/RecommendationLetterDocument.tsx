import { QRCodeSVG } from "qrcode.react";
import { Printer, Link2, Share2, MessageCircle, Mail, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { openWhatsApp, openMailto, shareContent } from "@/lib/docExport";
import type { RecommendationLetter } from "@/lib/recommendationLetters";

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildValidationUrl(token: string): string {
  return `${window.location.origin}/validar/carta/${token}`;
}

function shortCode(token: string): string {
  return token.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return format(new Date(iso), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
}

// ── Print helper ─────────────────────────────────────────────────────────────

function printDocumentDiv(id: string): void {
  const el = document.getElementById(id);
  if (!el) { window.print(); return; }

  const style = document.createElement("style");
  style.id = "__carta-print-override";
  style.textContent = `
    @media print {
      body > * { visibility: hidden !important; }
      #${id}, #${id} * { visibility: visible !important; }
      #${id} {
        position: fixed !important;
        top: 0 !important; left: 0 !important;
        width: 100% !important; height: auto !important;
        background: white !important;
        padding: 0 !important; margin: 0 !important;
        box-shadow: none !important;
        overflow: visible !important;
      }
    }
  `;
  document.head.appendChild(style);
  window.print();
  document.head.removeChild(style);
}

// ── Props ────────────────────────────────────────────────────────────────────

type Props = {
  letter: RecommendationLetter;
  /** Show the action toolbar (print, share, etc.). Default: true. */
  showActions?: boolean;
  /** Callback from parent when copy-link succeeds (for toast). */
  onCopied?: () => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function RecommendationLetterDocument({
  letter,
  showActions = true,
  onCopied,
}: Props) {
  const docId = `carta-doc-${letter.id}`;
  const validationUrl = buildValidationUrl(letter.publicToken);
  const code = shortCode(letter.publicToken);

  const churchName = letter.originChurchName || "Esta Igreja";
  const approvedDateStr = fmtDate(letter.approvedAt);

  const destinationFull = letter.destinationState
    ? `${letter.destinationCity}/${letter.destinationState}`
    : letter.destinationCity;

  // ── Action handlers ─────────────────────────────────────────────────────
  const handlePrint = () => printDocumentDiv(docId);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(validationUrl);
      onCopied?.();
    } catch {
      // silently fail
    }
  };

  const handleShare = () =>
    shareContent({
      url: validationUrl,
      title: "Carta de Recomendação — Ecclesia Online",
      text: `Carta de Recomendação emitida em nome de ${letter.memberName}. Verifique em: ${validationUrl}`,
    });

  const handleWhatsApp = () =>
    openWhatsApp(
      `Carta de Recomendação — ${letter.memberName}\n` +
        `Igreja destino: ${letter.destinationChurch} — ${destinationFull}\n` +
        `Código de validação: ${code}\n` +
        `Verificar em: ${validationUrl}`,
    );

  const handleEmail = () =>
    openMailto(
      `Carta de Recomendação — ${letter.memberName}`,
      `Prezado(a),\n\nSegue a Carta de Recomendação emitida em nome de ${letter.memberName} para a Igreja ${letter.destinationChurch}, situada em ${destinationFull}.\n\nCódigo de validação: ${code}\nLink de verificação: ${validationUrl}\n\nEmitido por Ecclesia Online.`,
    );

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      {showActions && (
        <div className="flex flex-wrap gap-2 print:hidden">
          <ActionButton icon={Printer} label="Imprimir / PDF" onClick={handlePrint} />
          <ActionButton icon={Link2} label="Copiar link" onClick={handleCopyLink} />
          <ActionButton icon={Share2} label="Compartilhar" onClick={handleShare} />
          <ActionButton icon={MessageCircle} label="WhatsApp" onClick={handleWhatsApp} />
          <ActionButton icon={Mail} label="E-mail" onClick={handleEmail} />
        </div>
      )}

      {/* ── Document body ── */}
      <div
        id={docId}
        className="bg-white text-neutral-900 rounded-xl border border-neutral-200 p-4 sm:p-8 font-serif leading-relaxed"
        style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <CheckCircle2 size={20} className="text-emerald-600" />
            <span className="text-xs font-sans font-semibold tracking-widest text-emerald-700 uppercase">
              Documento Eclesiástico Oficial
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-wide uppercase text-neutral-800 mt-1">
            Carta de Recomendação
          </h1>
          <div className="h-px bg-neutral-300 mt-4" />
          <p className="text-sm text-neutral-600 mt-2 font-sans">{churchName}</p>
        </div>

        {/* Greeting */}
        <div className="mb-6">
          <p className="text-sm text-neutral-700 mb-1">À</p>
          <p className="font-semibold">{letter.destinationChurch}</p>
          <p className="text-sm text-neutral-600">{destinationFull}</p>
        </div>

        {/* Body */}
        <div className="space-y-4 text-[15px] leading-relaxed text-neutral-800 mb-8">
          <p>Prezados irmãos em Cristo,</p>
          <p>
            Recomendamos o(a) irmão(ã){" "}
            <strong>{letter.memberName}</strong>, membro desta Igreja, à comunhão
            da Igreja{" "}
            <strong>{letter.destinationChurch}</strong>, situada em{" "}
            <strong>{destinationFull}</strong>, declarando que, até a presente data,
            encontra-se em plena comunhão conforme os registros disponíveis nesta
            secretaria.
          </p>
          {letter.reason && (
            <p>
              <span className="font-semibold">Motivo: </span>
              {letter.reason}
            </p>
          )}
          <p>
            Rogamos ao Senhor que abençoe generosamente este(a) servo(a) em sua
            nova comunidade de fé.
          </p>
        </div>

        {/* Date + signature */}
        <div className="mb-8">
          <p className="text-sm text-neutral-600 mb-6">
            Emitida em {approvedDateStr}.
          </p>
          <div className="border-t border-neutral-400 pt-2 w-72">
            <p className="text-sm font-semibold text-neutral-800">
              Secretaria da Igreja
            </p>
            <p className="text-xs text-neutral-500">{churchName}</p>
          </div>
        </div>

        {/* Validation footer */}
        <div className="border-t border-neutral-200 pt-5 flex items-end justify-between gap-6">
          <div className="text-xs text-neutral-500 space-y-1 font-sans">
            <p className="font-semibold text-neutral-700">Validação digital</p>
            <p>
              Código:{" "}
              <span className="font-mono font-bold text-neutral-800 tracking-widest">
                {code}
              </span>
            </p>
            <p className="break-all text-neutral-400" style={{ fontSize: "10px" }}>
              {validationUrl}
            </p>
            <p className="mt-2 text-neutral-400 text-[10px]">
              Emitido por Ecclesia Online — Plataforma de Gestão Pastoral
            </p>
          </div>

          <div className="flex-shrink-0">
            <QRCodeSVG
              value={validationUrl}
              size={88}
              level="M"
              bgColor="#ffffff"
              fgColor="#1a1a1a"
            />
            <p className="text-[9px] text-neutral-400 text-center mt-1 font-sans">
              Escanear para validar
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small helper ─────────────────────────────────────────────────────────────

function ActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Printer;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors"
    >
      <Icon size={14} />
      {label}
    </button>
  );
}
