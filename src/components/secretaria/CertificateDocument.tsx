import { QRCodeSVG } from "qrcode.react";
import { BookOpen } from "lucide-react";
import { DocumentActions } from "@/components/DocumentActions";
import { generateOfficialDocumentPdf } from "@/lib/officialDocumentPdf";
import {
  type InstitutionalCertificate,
  type PublicInstitutionalCertificate,
} from "@/lib/officialDocuments";

type CertificateView = InstitutionalCertificate | PublicInstitutionalCertificate;

export type CertificateBranding = {
  name?: string | null;
  logoUrl?: string | null;
  city?: string | null;
  state?: string | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

function formatPeriod(value: string | null | undefined) {
  if (!value) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

function academicCourseLabel(certificate: CertificateView) {
  const course = certificate.course_name?.trim();
  if (!course) {
    return certificate.certificate_type === "formacao_teologica"
      ? "a formação teológica indicada"
      : "o curso indicado";
  }
  if (/^(o|a)\s+/i.test(course)) return course;
  if (/^curso\b/i.test(course)) return `o ${course}`;
  if (/^forma[cç][aã]o\b/i.test(course)) return `a ${course}`;
  return certificate.certificate_type === "formacao_teologica"
    ? `a formação em ${course}`
    : `o Curso de ${course}`;
}

function certificateStatement(certificate: CertificateView) {
  if (certificate.body_text) return certificate.body_text;

  switch (certificate.certificate_type) {
    case "apresentacao_crianca":
      return "foi apresentado(a) ao Senhor perante esta comunidade cristã, recebendo as orações e bênçãos da igreja.";
    case "batismo_aguas":
      return "foi batizado(a) nas águas, por profissão pública de fé em Jesus Cristo, conforme a doutrina e a prática desta igreja.";
    case "casamento":
      return "celebraram sua união matrimonial perante Deus e as testemunhas reunidas nesta comunidade cristã.";
    case "ministerial":
      return "recebeu o reconhecimento ministerial desta igreja, para servir com fidelidade, zelo e responsabilidade cristã.";
    case "curso_discipulado":
    case "formacao_teologica": {
      const course = academicCourseLabel(certificate);
      const workload = certificate.workload_hours
        ? ` com carga horária de ${certificate.workload_hours} horas`
        : "";
      const periodStart = formatPeriod(certificate.period_start);
      const periodEnd = formatPeriod(certificate.period_end);
      const period = periodStart && periodEnd
        ? `, realizado no período de ${periodStart} a ${periodEnd}`
        : "";

      return `concluiu com aproveitamento ${course}${workload}${period}.`;
    }
  }
}

export function CertificateDocument({
  certificate,
  showActions = true,
  branding,
}: {
  certificate: CertificateView;
  showActions?: boolean;
  branding?: CertificateBranding;
}) {
  const documentId = `certificate-document-${certificate.id}`;
  const token = "public_token" in certificate ? certificate.public_token : null;
  const validationUrl = token ? `${window.location.origin}/validar/certificado/${token}` : "";
  const fileName = `${certificate.certificate_number || "certificado"}-${certificate.recipient_name}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-") + ".pdf";
  const organizationName = branding?.name?.trim() || certificate.organization_name;
  const organizationLogoUrl = branding?.logoUrl?.trim() || certificate.organization_logo_url;
  const organizationCity = branding?.city?.trim() || certificate.organization_city;
  const organizationState = branding?.state?.trim() || certificate.organization_state;
  const locality = [organizationCity, organizationState].filter(Boolean).join(" - ");
  const recipient = certificate.secondary_recipient_name
    ? `${certificate.recipient_name} e ${certificate.secondary_recipient_name}`
    : certificate.recipient_name;
  const isAcademic = certificate.certificate_type === "curso_discipulado"
    || certificate.certificate_type === "formacao_teologica";
  const secondRole = isAcademic
    && !certificate.second_signer_name
    && (!certificate.second_signer_role || certificate.second_signer_role === "Secretaria da Igreja")
      ? "Coordenador do Curso"
      : certificate.second_signer_role || "Secretaria da Igreja";
  const revision = "revision" in certificate ? certificate.revision : 1;

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
          aria-label={`Certificado de ${certificate.recipient_name}`}
          className="relative mx-auto aspect-[297/210] w-[1120px] max-w-none overflow-hidden bg-[#fbfaf3] text-[#0b2851] shadow-sm"
          style={{
            fontFamily: "Arial, Helvetica, sans-serif",
            backgroundImage:
              "radial-gradient(circle at 50% 45%, rgba(184,143,51,0.08), transparent 38%), linear-gradient(120deg, rgba(255,255,255,0.88), rgba(247,244,230,0.94))",
          }}
        >
          <div className="pointer-events-none absolute inset-[13px] border-2 border-[#b78b2e]" />
          <div className="pointer-events-none absolute inset-[23px] border-2 border-[#102e58]" />

          <CornerOrnament position="top-left" />
          <CornerOrnament position="top-right" />
          <CornerOrnament position="bottom-left" />
          <CornerOrnament position="bottom-right" />

          {organizationLogoUrl && (
            <img
              src={organizationLogoUrl}
              alt=""
              crossOrigin="anonymous"
              data-certificate-watermark
              className="pointer-events-none absolute left-1/2 top-[53%] max-h-[64%] max-w-[55%] -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.08] saturate-50 mix-blend-multiply"
            />
          )}

          <div className="relative z-10 flex h-full flex-col px-[82px] pb-[42px] pt-[48px] text-center">
            <header className="grid min-h-[110px] grid-cols-[205px_1fr_155px] items-center gap-5">
              <div className="flex justify-center">
                {organizationLogoUrl ? (
                  <img
                    src={organizationLogoUrl}
                    crossOrigin="anonymous"
                    alt={`Logo ${organizationName}`}
                    data-certificate-logo
                    className="h-[106px] w-[190px] object-contain"
                  />
                ) : (
                  <div className="flex h-[104px] w-[104px] items-center justify-center rounded-full border-2 border-[#b78b2e] text-[#b78b2e]">
                    <span
                      className="text-[54px] leading-none"
                      style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                    >
                      Ω
                    </span>
                  </div>
                )}
              </div>

              <div className="self-center">
                <p
                  data-certificate-brand-name
                  className="mx-auto max-w-[600px] text-[32px] font-semibold uppercase leading-[1.15] tracking-[0.075em] text-[#102e58]"
                  style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
                >
                  {organizationName}
                </p>
                <GoldDivider className="mx-auto mt-3 w-[440px]" />
              </div>

              <AuthenticitySeal />
            </header>

            <main className="mt-1 flex min-h-0 flex-1 flex-col items-center">
              <h1
                className="text-[68px] font-normal uppercase leading-none tracking-[0.055em] text-[#0b2d5c]"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                Certificado
              </h1>

              <div className="mt-3 flex items-center justify-center gap-3 text-[#b78b2e]">
                <span className="h-px w-96 bg-[#b78b2e]" />
                <span className="size-2 rotate-45 border border-[#b78b2e] bg-[#fbfaf3]" />
                <BookOpen size={40} strokeWidth={1.25} />
                <span className="size-2 rotate-45 border border-[#b78b2e] bg-[#fbfaf3]" />
                <span className="h-px w-96 bg-[#b78b2e]" />
              </div>

              <p className="mt-4 text-[20px] text-[#102e58]">Certificamos que</p>

              <p
                className="mt-2 max-w-[850px] text-[39px] font-normal uppercase leading-tight tracking-[0.06em] text-[#0b2d5c]"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {recipient}
              </p>

              <GoldDivider className="mt-2 w-[430px]" />

              <p className="mt-4 max-w-[820px] text-[19px] leading-[1.45] text-[#102e58]">
                {certificateStatement(certificate)}
              </p>

              <p className="mt-auto text-[17px] text-[#102e58]">
                {certificate.location || locality || organizationName}, {formatDate(certificate.event_date)}
              </p>
            </main>

            <footer className="mt-7 grid grid-cols-[1fr_1fr_150px] grid-rows-[auto_auto] items-end gap-x-8 gap-y-3">
              <Signature
                name={certificate.signer_name}
                role={certificate.signer_role || "Pastor Presidente"}
              />
              <Signature name={certificate.second_signer_name} role={secondRole} />

              <div className="col-start-3 row-span-2 row-start-1 flex min-h-[112px] flex-col items-center justify-end">
                {validationUrl ? (
                  <>
                    <div className="border border-[#b78b2e] bg-white p-2">
                      <QRCodeSVG value={validationUrl} size={82} level="M" />
                    </div>
                    <p className="mt-1 text-[10px] font-semibold leading-tight text-[#102e58]">
                      Valide em Ecclesia
                    </p>
                  </>
                ) : (
                  <div className="flex h-[98px] w-[98px] items-center justify-center border border-[#b78b2e] text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b6a26]">
                    Rascunho
                  </div>
                )}
              </div>

              <div
                data-certificate-footer-meta
                className="col-span-2 row-start-2 text-[12px] leading-[1.45] text-[#102e58]"
              >
                <GoldDivider className="mx-auto mb-1 w-[150px]" />
                <p>
                  Certificado nº <span className="font-semibold">{certificate.certificate_number || "EM RASCUNHO"}</span>
                  {revision > 1 ? <span className="ml-2 text-[10px]">(revisão {revision})</span> : null}
                </p>
              </div>
            </footer>
          </div>
        </article>
      </div>
    </div>
  );
}

function GoldDivider({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-2 ${className}`} aria-hidden="true">
      <span className="h-px flex-1 bg-[#b78b2e]" />
      <span className="size-2 rotate-45 border border-[#b78b2e] bg-[#fbfaf3]" />
      <span className="h-px flex-1 bg-[#b78b2e]" />
    </div>
  );
}

function Signature({ name, role }: { name: string | null | undefined; role: string }) {
  return (
    <div className="text-center text-[#102e58]">
      <GoldDivider className="mx-auto w-[220px]" />
      {name ? (
        <p
          className="mt-1 text-[15px] font-semibold leading-tight"
          style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
        >
          {name}
        </p>
      ) : null}
      <p className={`${name ? "mt-0.5 text-[12px]" : "mt-2 text-[15px]"} font-medium leading-tight`}>
        {role}
      </p>
    </div>
  );
}

function AuthenticitySeal() {
  return (
    <div
      aria-label="Selo de autenticidade Ecclesia"
      className="relative mx-auto flex size-[118px] items-center justify-center rounded-full border border-[#88621d] p-[7px] text-[#735017] shadow-[0_2px_8px_rgba(80,55,10,0.22)]"
      style={{
        background:
          "repeating-conic-gradient(from 0deg, #d6ad50 0deg 4deg, #f0d88b 4deg 8deg)",
      }}
    >
      <div
        data-authenticity-seal-content
        className="flex size-full flex-col items-center justify-center rounded-full border-2 border-[#916921] px-2 py-1.5 bg-[radial-gradient(circle,#f5e4a9_0%,#d5a646_68%,#b3832d_100%)]"
      >
        <span
          data-ecclesia-symbol
          className="text-[30px] font-semibold leading-[0.8]"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Ω
        </span>
        <span className="mt-1 text-[11px] font-bold uppercase tracking-[0.14em]">Autêntico</span>
        <span className="text-[11px] font-bold uppercase tracking-[0.14em]">Ecclesia</span>
      </div>
    </div>
  );
}

function CornerOrnament({
  position,
}: {
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}) {
  const placement = {
    "top-left": "left-[32px] top-[30px]",
    "top-right": "right-[32px] top-[30px] scale-x-[-1]",
    "bottom-left": "bottom-[30px] left-[32px] scale-y-[-1]",
    "bottom-right": "bottom-[30px] right-[32px] scale-[-1]",
  }[position];

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      className={`pointer-events-none absolute z-[2] size-[82px] text-[#b78b2e] ${placement}`}
      fill="none"
    >
      <path d="M10 91C20 56 46 28 90 10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M22 69C10 67 8 57 12 48C23 52 28 59 22 69Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M34 51C23 47 22 37 28 29C38 35 42 43 34 51Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M49 37C42 27 47 18 56 14C61 25 58 33 49 37Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M32 64C37 52 48 51 56 56C49 66 41 69 32 64Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M49 46C55 35 66 34 74 40C67 50 58 53 49 46Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M66 29C73 19 84 20 91 27C83 35 74 37 66 29Z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
