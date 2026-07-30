import { useLayoutEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { DocumentActions } from "@/components/DocumentActions";
import { generateOfficialDocumentPdf } from "@/lib/officialDocumentPdf";
import type { RecommendationLetter } from "@/lib/recommendationLetters";

const DOCUMENT_WIDTH = 790;
const DOCUMENT_HEIGHT = 1120;

export type RecommendationLetterBranding = {
  name?: string | null;
  logoUrl?: string | null;
  city?: string | null;
  state?: string | null;
};

function buildValidationUrl(token: string): string {
  return `${window.location.origin}/validar/carta/${token}`;
}

function shortCode(token: string): string {
  return token.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function safeFileName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-");
}

type Props = {
  letter: RecommendationLetter;
  showActions?: boolean;
  approverLabel?: string;
  branding?: RecommendationLetterBranding;
};

export function RecommendationLetterDocument({
  letter,
  showActions = true,
  approverLabel,
  branding,
}: Props) {
  const documentId = `recommendation-document-${letter.id}`;
  const validationUrl = buildValidationUrl(letter.publicToken);
  const code = shortCode(letter.publicToken);
  const fileName = `${safeFileName(`carta-recomendacao-${letter.memberName}`)}.pdf`;
  const churchName = branding?.name?.trim() || letter.originChurchName || "Esta Igreja";
  const logoUrl = branding?.logoUrl?.trim() || null;
  const origin = [branding?.city, branding?.state].filter(Boolean).join("/");
  const destination = [
    letter.destinationChurch,
    [letter.destinationCity, letter.destinationState].filter(Boolean).join("/"),
  ].filter(Boolean).join(" — ");
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);

  useLayoutEffect(() => {
    const viewport = previewViewportRef.current;
    if (!viewport) return;

    const updateScale = () => {
      const styles = window.getComputedStyle(viewport);
      const horizontalPadding =
        Number.parseFloat(styles.paddingLeft || "0")
        + Number.parseFloat(styles.paddingRight || "0");
      const screenWidth = window.visualViewport?.width || window.innerWidth;
      const availableWidth = Math.max(
        1,
        Math.min(
          viewport.clientWidth || Number.POSITIVE_INFINITY,
          viewport.getBoundingClientRect().width || Number.POSITIVE_INFINITY,
          screenWidth,
        ) - horizontalPadding,
      );
      setPreviewScale(Math.min(1, availableWidth / DOCUMENT_WIDTH));
    };

    updateScale();
    const frame = window.requestAnimationFrame(updateScale);
    window.addEventListener("resize", updateScale);
    window.addEventListener("orientationchange", updateScale);
    window.visualViewport?.addEventListener("resize", updateScale);

    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateScale);
    observer?.observe(viewport);

    return () => {
      observer?.disconnect();
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateScale);
      window.removeEventListener("orientationchange", updateScale);
      window.visualViewport?.removeEventListener("resize", updateScale);
    };
  }, []);

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-hidden">
      {showActions && (
        <DocumentActions
          printElementId={documentId}
          shareTitle={`Carta de Recomendação — ${letter.memberName}`}
          shareText={`Carta de Recomendação emitida por ${churchName} para ${letter.memberName}.`}
          shareUrl={validationUrl}
          whatsappText={`Carta de Recomendação — ${letter.memberName}\nDestino: ${destination}\nValidação: ${validationUrl}`}
          emailSubject={`Carta de Recomendação — ${letter.memberName}`}
          emailBody={`Segue a Carta de Recomendação emitida por ${churchName} para ${letter.memberName}.\n\nValidação: ${validationUrl}`}
          onGeneratePdfBlob={() =>
            generateOfficialDocumentPdf(documentId, fileName, "portrait")
          }
        />
      )}

      <div
        ref={previewViewportRef}
        data-recommendation-preview-viewport
        className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border bg-muted/20 p-1 sm:p-2"
      >
        <div
          data-recommendation-preview-frame
          className="relative mx-auto"
          style={{
            width: `${DOCUMENT_WIDTH * previewScale}px`,
            height: `${DOCUMENT_HEIGHT * previewScale}px`,
          }}
        >
          <article
            id={documentId}
            data-recommendation-document-canvas
            className="absolute left-0 top-0 h-[1120px] w-[790px] max-w-none origin-top-left overflow-hidden bg-[#fbfaf3] px-20 pb-20 pt-14 text-[#102e58] shadow-sm"
            style={{
              transform: `scale(${previewScale})`,
              fontFamily: "Georgia, 'Times New Roman', serif",
              backgroundImage:
                "radial-gradient(circle at 50% 46%, rgba(184,143,51,0.08), transparent 38%), linear-gradient(120deg, rgba(255,255,255,0.9), rgba(247,244,230,0.96))",
            }}
          >
            <div
              aria-hidden="true"
              data-recommendation-frame="outer"
              className="pointer-events-none absolute inset-[13px] border-2 border-[#b78b2e]"
            />
            <div
              aria-hidden="true"
              data-recommendation-frame="inner"
              className="pointer-events-none absolute inset-[23px] border-2 border-[#102e58]"
            />
            {logoUrl && (
              <img
                src={logoUrl}
                alt=""
                crossOrigin="anonymous"
                data-recommendation-watermark
                className="pointer-events-none absolute left-1/2 top-1/2 max-h-[46%] max-w-[56%] -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.08] saturate-50 mix-blend-multiply"
              />
            )}

            <div className="relative z-10 flex h-full min-h-0 flex-col pb-2">
              <header className="border-b-2 border-[#b58a2c] pb-4 text-center">
                {logoUrl && (
                  <img
                    src={logoUrl}
                    crossOrigin="anonymous"
                    alt={`Logo ${churchName}`}
                    data-recommendation-logo
                    className="mx-auto mb-2 h-16 w-20 object-contain"
                  />
                )}
                <p className="text-xl font-bold uppercase text-[#102e58]">{churchName}</p>
                {origin && <p className="mt-1 text-sm text-neutral-600">{origin}</p>}
              </header>

              <div className="mt-7 flex items-center justify-between text-sm">
                <span>Documento eclesiástico oficial</span>
                <span className="font-mono font-semibold">CARTA-{code}</span>
              </div>

              <h1 className="my-7 text-center text-3xl font-bold uppercase tracking-wide">
                Carta de Recomendação
              </h1>

              <p className="mb-5">
                À igreja <strong>{destination}</strong>.
              </p>

              <div className="space-y-4 text-justify text-[16px] leading-7">
                <p>Graça e paz.</p>
                <p>
                  Por meio desta, recomendamos o(a) irmão(ã){" "}
                  <strong>{letter.memberName}</strong>, membro desta igreja, à comunhão
                  da igreja de destino, declarando que, até a presente data, encontra-se
                  em plena comunhão conforme os registros desta secretaria.
                </p>
                {letter.reason && (
                  <p><strong>Motivo informado:</strong> {letter.reason}</p>
                )}
                <p>
                  Solicitamos que seja recebido(a) com amor cristão e acompanhado(a)
                  pastoralmente durante sua permanência junto a essa comunidade de fé.
                </p>
                <p>
                  Rogamos as bênçãos de Deus sobre sua vida, família e serviço cristão.
                </p>
              </div>

              <p className="mt-8">
                {origin || churchName}, {formatDate(letter.approvedAt)}.
              </p>

              <div className="mt-14 w-80 border-t border-neutral-700 pt-2 text-center">
                <p className="font-semibold">{approverLabel || "Secretaria da Igreja"}</p>
                <p className="text-sm text-neutral-600">{churchName}</p>
              </div>

              <footer
                data-recommendation-footer
                className="mt-auto flex shrink-0 items-end justify-between gap-5 border-t border-neutral-300 pt-4"
              >
                <div className="font-sans text-xs text-neutral-600">
                  <p className="font-semibold text-neutral-800">Validação digital permanente</p>
                  <p>Código: <span className="font-mono font-bold">{code}</span></p>
                  <p className="mt-1 max-w-lg break-all text-[10px]">{validationUrl}</p>
                </div>
                <div className="shrink-0 text-center">
                  <QRCodeSVG
                    value={validationUrl}
                    size={84}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#1a1a1a"
                  />
                  <p className="mt-1 font-sans text-[9px] text-neutral-500">
                    Escanear para validar
                  </p>
                </div>
              </footer>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
