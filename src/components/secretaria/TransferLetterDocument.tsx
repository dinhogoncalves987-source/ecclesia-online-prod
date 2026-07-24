import { QRCodeSVG } from "qrcode.react";
import { DocumentActions } from "@/components/DocumentActions";
import { generateOfficialDocumentPdf } from "@/lib/officialDocumentPdf";
import type { PublicTransferLetter, TransferLetter } from "@/lib/officialDocuments";

type TransferView = TransferLetter | PublicTransferLetter;

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

  return (
    <div className="space-y-4">
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

      <div className="overflow-x-auto rounded-xl border bg-muted/20 p-2">
        <article
          id={documentId}
          className="relative mx-auto min-h-[1120px] min-w-[790px] max-w-[790px] overflow-hidden bg-white px-20 py-16 text-neutral-900 shadow-sm"
          style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
        >
          {logo && (
            <img
              src={logo}
              alt=""
              crossOrigin="anonymous"
              className="pointer-events-none absolute left-1/2 top-1/2 max-h-[45%] max-w-[55%] -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.045]"
            />
          )}
          <div className="relative z-10 flex min-h-[990px] flex-col">
            <header className="border-b-2 border-[#b58a2c] pb-5 text-center">
              {logo && <img src={logo} crossOrigin="anonymous" alt="" className="mx-auto mb-3 h-20 w-24 object-contain" />}
              <p className="text-xl font-bold uppercase">{letter.organization_name || letter.origin_church_name}</p>
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
  );
}
