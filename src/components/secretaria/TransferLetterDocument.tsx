import { useLayoutEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { DocumentActions } from "@/components/DocumentActions";
import { generateOfficialDocumentPdf } from "@/lib/officialDocumentPdf";
import type { PublicTransferLetter, TransferLetter } from "@/lib/officialDocuments";

type TransferView = TransferLetter | PublicTransferLetter;

const DOCUMENT_WIDTH = 790;
const DOCUMENT_HEIGHT = 1120;

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

export function TransferLetterDocument({
  letter,
  showActions = true,
}: {
  letter: TransferView;
  showActions?: boolean;
}) {
  const documentId = `transfer-document-${letter.id}`;
  const token = "public_token" in letter ? letter.public_token : null;
  const validationUrl = token ? `${window.location.origin}/validar/transferencia/${token}` : "";
  const fileName = `${letter.transfer_number || "carta-transferencia"}-${letter.member_name}`
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9-]+/g, "-") + ".pdf";
  const origin = [letter.origin_city, letter.origin_state].filter(Boolean).join("/");
  const destination = [
    letter.destination_church_name,
    [letter.destination_city, letter.destination_state].filter(Boolean).join("/"),
    letter.destination_country,
  ].filter(Boolean).join(" — ");
  const logo = "organization_logo_url" in letter ? letter.organization_logo_url : null;
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
          shareTitle="Carta de Transferência"
          shareText={`Carta de Transferência — ${letter.member_name}`}
          shareUrl={validationUrl || undefined}
          whatsappText={`Carta de Transferência — ${letter.member_name}${validationUrl ? `\nValidação: ${validationUrl}` : ""}`}
          emailSubject={`Carta de Transferência — ${letter.member_name}`}
          emailBody={`Segue a Carta de Transferência de ${letter.member_name}.${validationUrl ? `\n\nValidação: ${validationUrl}` : ""}`}
          onGeneratePdfBlob={() => generateOfficialDocumentPdf(documentId, fileName, "portrait")}
        />
      )}

      <div
        ref={previewViewportRef}
        data-transfer-preview-viewport
        className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border bg-muted/20 p-1 sm:p-2"
      >
        <div
          data-transfer-preview-frame
          className="relative mx-auto"
          style={{
            width: `${DOCUMENT_WIDTH * previewScale}px`,
            height: `${DOCUMENT_HEIGHT * previewScale}px`,
          }}
        >
          <article
            id={documentId}
            data-transfer-document-canvas
            className="absolute left-0 top-0 h-[1120px] w-[790px] max-w-none origin-top-left overflow-hidden bg-[#fbfaf3] px-20 py-16 text-[#102e58] shadow-sm"
            style={{
              transform: `scale(${previewScale})`,
              fontFamily: "Georgia, 'Times New Roman', serif",
              backgroundImage:
                "radial-gradient(circle at 50% 46%, rgba(184,143,51,0.08), transparent 38%), linear-gradient(120deg, rgba(255,255,255,0.9), rgba(247,244,230,0.96))",
            }}
          >
          <div
            aria-hidden="true"
            data-transfer-frame="outer"
            className="pointer-events-none absolute inset-[13px] border-2 border-[#b78b2e]"
          />
          <div
            aria-hidden="true"
            data-transfer-frame="inner"
            className="pointer-events-none absolute inset-[23px] border-2 border-[#102e58]"
          />
          {logo && (
            <img
              src={logo}
              alt=""
              crossOrigin="anonymous"
              data-transfer-watermark
              className="pointer-events-none absolute left-1/2 top-1/2 max-h-[46%] max-w-[56%] -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.08] saturate-50 mix-blend-multiply"
            />
          )}
          <div className="relative z-10 flex min-h-[990px] flex-col">
            <header className="border-b-2 border-[#b58a2c] pb-5 text-center">
              {logo && <img src={logo} crossOrigin="anonymous" alt="" className="mx-auto mb-3 h-20 w-24 object-contain" />}
              <p className="text-xl font-bold uppercase text-[#102e58]">{letter.organization_name || letter.origin_church_name}</p>
              <p className="mt-1 text-sm text-neutral-600">{origin}</p>
            </header>

            <div className="mt-10 flex items-center justify-between text-sm">
              <span>Documento eclesiástico oficial</span>
              <span className="font-mono font-semibold">{letter.transfer_number || "RASCUNHO"}</span>
            </div>
            <h1 className="my-10 text-center text-3xl font-bold uppercase tracking-wide">Carta de Transferência</h1>

            <p className="mb-7">À igreja <strong>{letter.destination_church_name}</strong>, {destination}.</p>
            <div className="space-y-6 text-justify text-[17px] leading-8">
              <p>Graça e paz.</p>
              <p>
                Por meio desta, comunicamos e confirmamos a transferência do(a) irmão(ã){" "}
                <strong>{letter.member_name}</strong>
                {letter.member_code ? `, matrícula ${letter.member_code},` : ","} que até esta data
                esteve vinculado(a) aos registros e à comunhão desta igreja.
              </p>
              <p>
                Solicitamos que seja recebido(a) em comunhão e acompanhado(a) pastoralmente,
                prosseguindo no serviço cristão junto à igreja de destino.
              </p>
              {letter.reason && <p><strong>Motivo informado:</strong> {letter.reason}</p>}
              <p>Rogamos as bênçãos de Deus sobre sua nova etapa de vida e ministério.</p>
            </div>

            <p className="mt-12">{origin || letter.origin_church_name}, {formatDate(letter.completed_at || letter.issued_at)}.</p>

            <div className="mt-24 w-80 border-t border-neutral-700 pt-2 text-center">
              <p className="font-semibold">{letter.signer_name || "Secretaria da Igreja"}</p>
              <p className="text-sm text-neutral-600">{letter.signer_role || "Pastor Presidente"}</p>
            </div>

            <footer className="mt-auto flex items-end justify-between gap-5 border-t border-neutral-300 pt-5">
              <div className="font-sans text-xs text-neutral-600">
                <p className="font-semibold text-neutral-800">Validação digital permanente</p>
                <p>{letter.status === "cancelada" ? "DOCUMENTO CANCELADO" : "Documento válido enquanto não cancelado."}</p>
                {validationUrl && <p className="mt-1 max-w-lg break-all text-[10px]">{validationUrl}</p>}
              </div>
              {validationUrl && <QRCodeSVG value={validationUrl} size={92} level="M" />}
            </footer>
          </div>
          </article>
        </div>
      </div>
    </div>
  );
}
