import { QRCodeSVG } from "qrcode.react";
import { Award } from "lucide-react";
import { DocumentActions } from "@/components/DocumentActions";
import { generateOfficialDocumentPdf } from "@/lib/officialDocumentPdf";
import {
  CERTIFICATE_TYPE_LABELS,
  type InstitutionalCertificate,
  type PublicInstitutionalCertificate,
} from "@/lib/officialDocuments";

type CertificateView = InstitutionalCertificate | PublicInstitutionalCertificate;

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

function certificateBody(certificate: CertificateView) {
  if (certificate.body_text) return certificate.body_text;
  const recipient = certificate.secondary_recipient_name
    ? `${certificate.recipient_name} e ${certificate.secondary_recipient_name}`
    : certificate.recipient_name;
  switch (certificate.certificate_type) {
    case "apresentacao_crianca":
      return `Certificamos que ${recipient} foi apresentado(a) ao Senhor perante esta comunidade cristã, recebendo as orações e bênçãos da igreja.`;
    case "batismo_aguas":
      return `Certificamos que ${recipient} foi batizado(a) nas águas, por profissão pública de fé em Jesus Cristo, conforme a doutrina e a prática desta igreja.`;
    case "casamento":
      return `Certificamos que ${recipient} celebraram sua união matrimonial perante Deus e as testemunhas reunidas nesta comunidade cristã.`;
    case "ministerial":
      return `Certificamos que ${recipient} recebeu o reconhecimento ministerial desta igreja, para servir com fidelidade, zelo e responsabilidade cristã.`;
    case "curso_discipulado":
    case "formacao_teologica":
      return `Certificamos que ${recipient} concluiu com aproveitamento ${certificate.course_name || "a formação indicada"}, cumprindo os requisitos acadêmicos estabelecidos pela instituição.`;
  }
}

export function CertificateDocument({
  certificate,
  showActions = true,
}: {
  certificate: CertificateView;
  showActions?: boolean;
}) {
  const documentId = `certificate-document-${certificate.id}`;
  const token = "public_token" in certificate ? certificate.public_token : null;
  const validationUrl = token ? `${window.location.origin}/validar/certificado/${token}` : "";
  const fileName = `${certificate.certificate_number || "certificado"}-${certificate.recipient_name}`
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9-]+/g, "-") + ".pdf";
  const locality = [certificate.organization_city, certificate.organization_state].filter(Boolean).join(" - ");

  return (
    <div className="space-y-4">
      {showActions && (
        <DocumentActions
          printElementId={documentId}
          shareTitle={certificate.title}
          shareText={`${certificate.title} — ${certificate.recipient_name}`}
          shareUrl={validationUrl || undefined}
          whatsappText={`${certificate.title} — ${certificate.recipient_name}${validationUrl ? `\nValidação: ${validationUrl}` : ""}`}
          emailSubject={`${certificate.title} — ${certificate.recipient_name}`}
          emailBody={`Segue ${certificate.title} emitido em nome de ${certificate.recipient_name}.${validationUrl ? `\n\nValidação: ${validationUrl}` : ""}`}
          onGeneratePdfBlob={() => generateOfficialDocumentPdf(documentId, fileName, "landscape")}
        />
      )}

      <div className="overflow-x-auto rounded-xl border bg-muted/20 p-2">
        <article
          id={documentId}
          className="relative mx-auto aspect-[297/210] min-w-[900px] overflow-hidden bg-[#fffdf7] text-[#27231d] shadow-sm"
          style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
        >
          <div className="absolute inset-3 border-[3px] border-[#b58a2c]" />
          <div className="absolute inset-5 border border-[#cfb36d]" />

          {certificate.organization_logo_url && (
            <img
              src={certificate.organization_logo_url}
              alt=""
              crossOrigin="anonymous"
              className="pointer-events-none absolute left-1/2 top-1/2 max-h-[62%] max-w-[52%] -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.055]"
            />
          )}

          <div className="relative z-10 flex h-full flex-col items-center px-20 py-12 text-center">
            <div className="flex min-h-20 items-center justify-center gap-4">
              {certificate.organization_logo_url ? (
                <img
                  src={certificate.organization_logo_url}
                  crossOrigin="anonymous"
                  alt={`Logo ${certificate.organization_name}`}
                  className="h-16 w-20 object-contain"
                />
              ) : (
                <Award className="text-[#b58a2c]" size={52} strokeWidth={1.2} />
              )}
              <div className="text-left">
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#8a6a24]">Documento eclesiástico oficial</p>
                <p className="max-w-xl text-lg font-semibold uppercase tracking-wide">{certificate.organization_name}</p>
              </div>
            </div>

            <p className="mt-5 text-sm uppercase tracking-[0.5em] text-[#8a6a24]">Certificado</p>
            <h1 className="mt-1 text-[38px] font-bold leading-tight">{CERTIFICATE_TYPE_LABELS[certificate.certificate_type]}</h1>
            <div className="my-4 h-px w-44 bg-[#b58a2c]" />

            <p className="text-base">Conferido a</p>
            <p className="mt-1 max-w-3xl text-[30px] font-bold italic leading-tight">
              {certificate.secondary_recipient_name
                ? `${certificate.recipient_name} & ${certificate.secondary_recipient_name}`
                : certificate.recipient_name}
            </p>
            <p className="mt-4 max-w-4xl text-[16px] leading-7">{certificateBody(certificate)}</p>

            {(certificate.course_name || certificate.workload_hours) && (
              <p className="mt-3 text-sm font-semibold">
                {certificate.course_name}
                {certificate.workload_hours ? ` — Carga horária: ${certificate.workload_hours} horas` : ""}
              </p>
            )}

            <p className="mt-auto text-sm">
              {certificate.location || locality || certificate.organization_name}, {formatDate(certificate.event_date)}.
            </p>

            <div className="mt-7 grid w-full grid-cols-[1fr_150px_1fr] items-end gap-8">
              <Signature name={certificate.signer_name} role={certificate.signer_role || "Pastor Presidente"} />
              <div className="flex flex-col items-center text-[10px]">
                {validationUrl ? <QRCodeSVG value={validationUrl} size={74} level="M" /> : <Award size={42} className="text-[#b58a2c]" />}
                <span className="mt-1 font-sans">{validationUrl ? "Escaneie para validar" : "Rascunho"}</span>
              </div>
              <Signature name={certificate.second_signer_name} role={certificate.second_signer_role || "Secretaria da Igreja"} />
            </div>

            <div className="mt-4 flex w-full items-center justify-between border-t border-[#d8c797] pt-2 font-sans text-[10px] text-neutral-600">
              <span>{certificate.organization_cnpj ? `CNPJ ${certificate.organization_cnpj}` : locality}</span>
              <span className="font-mono font-semibold">{certificate.certificate_number || "DOCUMENTO EM RASCUNHO"}</span>
              <span>Ecclesia Online</span>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}

function Signature({ name, role }: { name: string | null | undefined; role: string }) {
  return (
    <div className="text-center">
      <div className="border-t border-neutral-700 pt-1">
        <p className="text-sm font-semibold">{name || "Assinatura responsável"}</p>
        <p className="font-sans text-[10px] uppercase tracking-wide text-neutral-600">{role}</p>
      </div>
    </div>
  );
}
