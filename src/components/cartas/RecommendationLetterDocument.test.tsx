import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecommendationLetterDocument } from "./RecommendationLetterDocument";
import type { RecommendationLetter } from "@/lib/recommendationLetters";

vi.mock("@/components/DocumentActions", () => ({
  DocumentActions: () => null,
}));

vi.mock("@/lib/officialDocumentPdf", () => ({
  generateOfficialDocumentPdf: vi.fn(),
}));

const letter: RecommendationLetter = {
  id: "recommendation-1",
  organizationId: "org-1",
  memberId: "member-1",
  memberName: "Edson G Roquete",
  memberEmail: null,
  destinationChurch: "Assembleia de Deus Porto Alegre",
  destinationCity: "Porto Alegre",
  destinationState: "RS",
  reason: "Viagem",
  observations: null,
  status: "approved",
  publicToken: "public-token",
  originChurchName: "Assembleia de Deus Caxias do Sul",
  requestedAt: "2026-07-29T12:00:00Z",
  reviewedAt: "2026-07-29T13:00:00Z",
  approvedAt: "2026-07-29T14:00:00Z",
  reviewedBy: "user-1",
  approvedBy: "user-1",
  createdAt: "2026-07-29T12:00:00Z",
  updatedAt: "2026-07-29T14:00:00Z",
};

describe("RecommendationLetterDocument", () => {
  it("usa o mesmo padrão institucional da transferência com logo e marca d'água", () => {
    const { container } = render(
      <RecommendationLetterDocument
        letter={letter}
        showActions={false}
        branding={{
          name: "Assembleia de Deus Caxias do Sul",
          logoUrl: "https://cdn.example.org/logo.png",
          city: "Caxias do Sul",
          state: "RS",
        }}
      />,
    );

    expect(screen.getByText("Carta de Recomendação")).toBeInTheDocument();
    expect(screen.getAllByText("Assembleia de Deus Caxias do Sul")).not.toHaveLength(0);
    expect(screen.getByText(letter.memberName)).toBeInTheDocument();
    expect(container.querySelector("[data-recommendation-logo]")).toHaveAttribute(
      "src",
      "https://cdn.example.org/logo.png",
    );
    expect(container.querySelector("[data-recommendation-watermark]")).toHaveAttribute(
      "src",
      "https://cdn.example.org/logo.png",
    );
  });

  it("reduz a folha inteira à largura do celular sem recortar o documento", () => {
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 360,
    });

    const { container } = render(
      <RecommendationLetterDocument letter={letter} showActions={false} />,
    );
    const viewport = container.querySelector(
      "[data-recommendation-preview-viewport]",
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
    expect(container.querySelector("[data-recommendation-preview-frame]")).toHaveStyle({
      width: "360px",
    });
    expect(container.querySelector("[data-recommendation-document-canvas]")).toHaveStyle({
      transform: `scale(${360 / 790})`,
    });

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth,
    });
  });
});
