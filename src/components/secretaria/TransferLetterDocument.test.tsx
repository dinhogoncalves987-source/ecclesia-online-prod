import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TransferLetterDocument } from "./TransferLetterDocument";
import type { TransferLetter } from "@/lib/officialDocuments";

vi.mock("@/components/DocumentActions", () => ({
  DocumentActions: () => null,
}));

vi.mock("@/lib/officialDocumentPdf", () => ({
  generateOfficialDocumentPdf: vi.fn(),
}));

const letter: TransferLetter = {
  id: "transfer-1",
  member_id: "member-1",
  member_name: "Edson G Roquete",
  member_code: "000001",
  organization_id: "org-1",
  organization_name: "Assembleia de Deus Caxias do Sul",
  organization_logo_url: "https://cdn.example.org/logo.png",
  origin_church_name: "Assembleia de Deus Caxias do Sul",
  origin_city: "Caxias do Sul",
  origin_state: "RS",
  destination_church_name: "Assembleia de Deus Porto Alegre",
  destination_type: "externa",
  destination_city: "Porto Alegre",
  destination_state: "RS",
  destination_country: "Brasil",
  requested_at: "2026-07-29T12:00:00Z",
  approved_at: "2026-07-29T13:00:00Z",
  completed_at: "2026-07-29T14:00:00Z",
  status: "concluida",
  reason: "Mudança de cidade",
  cancellation_reason: null,
  transfer_number: "TRANSF-2026-000001",
  public_token: "public-token",
  issued_at: "2026-07-29T14:00:00Z",
  signer_name: "Pastor Presidente",
  signer_role: "Pastor Presidente",
  document_id: "document-1",
  created_at: "2026-07-29T12:00:00Z",
};

describe("TransferLetterDocument", () => {
  it("mantém a identidade institucional completa", () => {
    const { container } = render(
      <TransferLetterDocument letter={letter} showActions={false} />,
    );

    expect(screen.getByText("Carta de Transferência")).toBeInTheDocument();
    expect(screen.getByText(letter.organization_name)).toBeInTheDocument();
    expect(screen.getByText(letter.member_name)).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      letter.organization_logo_url,
    );
  });

  it("reduz a folha inteira à largura do celular sem rolagem horizontal", () => {
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 360,
    });

    const { container } = render(
      <TransferLetterDocument letter={letter} showActions={false} />,
    );
    const viewport = container.querySelector(
      "[data-transfer-preview-viewport]",
    ) as HTMLDivElement;
    Object.defineProperty(viewport, "clientWidth", {
      configurable: true,
      value: 790,
    });
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
      width: 790,
      height: 1120,
      top: 0,
      right: 790,
      bottom: 1120,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(viewport).toHaveClass("overflow-hidden");
    expect(container.querySelector("[data-transfer-preview-frame]")).toHaveStyle({
      width: "360px",
    });
    expect(container.querySelector("[data-transfer-document-canvas]")).toHaveStyle({
      transform: `scale(${360 / 790})`,
    });

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth,
    });
  });
});
