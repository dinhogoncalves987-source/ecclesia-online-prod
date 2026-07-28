import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CertificateDocument } from "./CertificateDocument";
import type { InstitutionalCertificate } from "@/lib/officialDocuments";

vi.mock("@/components/DocumentActions", () => ({
  DocumentActions: () => null,
}));

vi.mock("@/lib/officialDocumentPdf", () => ({
  generateOfficialDocumentPdf: vi.fn(),
}));

const certificate = {
  id: "cert-1",
  organization_id: "org-1",
  certificate_type: "curso_discipulado",
  status: "emitido",
  member_id: "member-1",
  family_member_id: null,
  recipient_name: "Graziela da Silva",
  secondary_recipient_name: null,
  event_date: "2026-07-24",
  location: "Caxias do Sul",
  source_module: "discipulado",
  source_enrollment_id: "enrollment-1",
  related_member_id: null,
  course_name: "o Curso de Discipulado Cristão",
  workload_hours: 40,
  period_start: "2026-03-01",
  period_end: "2026-07-01",
  title: "Certificado de conclusão",
  body_text: null,
  signer_name: null,
  signer_role: "Pastor Presidente",
  second_signer_name: null,
  second_signer_role: "Coordenador do Curso",
  organization_name: "Assembleia de Deus em Caxias do Sul",
  organization_cnpj: null,
  organization_city: "Caxias do Sul",
  organization_state: "RS",
  organization_logo_url: "https://cdn.example.org/logo.png",
  organization_phone: null,
  organization_email: null,
  certificate_number: "CERT-2026-000184",
  public_token: "public-token",
  issued_at: "2026-07-24T15:00:00Z",
  revoked_at: null,
  revocation_reason: null,
  document_id: "document-1",
  created_at: "2026-07-24T14:00:00Z",
  updated_at: "2026-07-24T15:00:00Z",
  revision: 1,
  corrected_at: null,
  last_correction_reason: null,
} satisfies InstitutionalCertificate;

describe("CertificateDocument", () => {
  it("reproduz o modelo institucional aprovado com identidade dinâmica", () => {
    const { container } = render(
      <CertificateDocument certificate={certificate} showActions={false} />,
    );

    expect(screen.getByRole("heading", { name: "Certificado" })).toBeInTheDocument();
    expect(screen.getByText("Assembleia de Deus em Caxias do Sul")).toBeInTheDocument();
    expect(screen.getByText("Graziela da Silva")).toBeInTheDocument();
    expect(screen.getByText(/Curso de Discipulado Cristão/)).toBeInTheDocument();
    expect(screen.getByLabelText("Selo de autenticidade Ecclesia")).toBeInTheDocument();
    expect(screen.getByText(/CERT-2026-000184/)).toBeInTheDocument();
    expect(container.querySelector("[data-certificate-logo]")).toHaveAttribute(
      "src",
      certificate.organization_logo_url,
    );
    expect(container.querySelector("[data-certificate-watermark]")).toHaveAttribute(
      "src",
      certificate.organization_logo_url,
    );
    expect(container.querySelector("[data-certificate-watermark]")).toHaveClass(
      "mix-blend-multiply",
    );
    expect(container.querySelector("svg[height='82']")).toBeInTheDocument();
    expect(container.querySelector("[data-certificate-footer-meta]")).not.toHaveClass(
      "-bottom-[34px]",
    );
    expect(screen.getByText("Valide em Ecclesia")).toBeInTheDocument();
    expect(container.querySelector("[data-certificate-footer-meta]")).not.toHaveTextContent(
      "Valide em",
    );
    expect(container.querySelector("[data-ecclesia-symbol]")).toHaveTextContent("Ω");
    expect(container.querySelector("svg.lucide-flame")).not.toBeInTheDocument();
    const ornaments = container.querySelectorAll("[data-certificate-ornament]");
    expect(ornaments).toHaveLength(4);
    ornaments.forEach((ornament) => {
      expect(ornament.tagName).toBe("IMG");
      expect(ornament.getAttribute("src")).toContain("data:image/svg+xml");
    });
    expect(container.querySelector("[data-certificate-preview-viewport]")).toHaveClass(
      "overflow-hidden",
    );
    expect(container.querySelector("[data-certificate-preview-viewport]")).not.toHaveClass(
      "overflow-x-auto",
    );
    expect(container.querySelector("[data-certificate-preview-frame]")).toHaveStyle({
      width: "1120px",
      height: "792px",
    });
    expect(container.querySelector("[data-official-document-canvas]")).toHaveStyle({
      transform: "scale(1)",
    });
  });

  it("mantém o mesmo número e sinaliza a revisão corrigida", () => {
    render(
      <CertificateDocument
        certificate={{ ...certificate, revision: 2 }}
        showActions={false}
      />,
    );

    expect(screen.getByText("(revisão 2)")).toBeInTheDocument();
    expect(screen.getByText(/CERT-2026-000184/)).toBeInTheDocument();
  });

  it("usa a identidade atual da igreja no painel administrativo", () => {
    const { container } = render(
      <CertificateDocument
        certificate={{
          ...certificate,
          organization_name: "Nome antigo",
          organization_logo_url: null,
        }}
        branding={{
          name: "Igreja Matriz Atual",
          logoUrl: "https://cdn.example.org/logo-atual.png",
          city: "Caxias do Sul",
          state: "RS",
        }}
        showActions={false}
      />,
    );

    expect(container.querySelector("[data-certificate-brand-name]")).toHaveTextContent(
      "Igreja Matriz Atual",
    );
    expect(container.querySelector("[data-certificate-logo]")).toHaveAttribute(
      "src",
      "https://cdn.example.org/logo-atual.png",
    );
    expect(container.querySelector("[data-certificate-watermark]")).toHaveAttribute(
      "src",
      "https://cdn.example.org/logo-atual.png",
    );
    expect(screen.queryByText("Nome antigo")).not.toBeInTheDocument();
  });
});
