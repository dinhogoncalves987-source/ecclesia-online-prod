import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemberWalletCard, type WalletMember } from "./MemberWalletCard";

vi.mock("@/components/DocumentActions", () => ({
  DocumentActions: () => <div data-testid="document-actions" />,
}));

const member: WalletMember = {
  id: "11111111-1111-4111-8111-111111111111",
  full_name: "Edson G Roquete",
  member_code: "000123",
  member_role: "member",
  status: "Ativo",
  phone: null,
  email: null,
  joined_at: null,
};

describe("MemberWalletCard — identidade visual", () => {
  it("renders the configured church logo as a watermark on front, back and PDF copies", () => {
    const { container } = render(
      <MemberWalletCard
        member={member}
        churchName="Congregação Central"
        churchAcronym="IEAD"
        churchLogoUrl="https://example.com/logo.png"
      />,
    );

    const watermarks = container.querySelectorAll("[data-wallet-watermark]");
    expect(watermarks.length).toBeGreaterThanOrEqual(3);
    watermarks.forEach((watermark) => {
      expect(watermark).toHaveAttribute("src", "https://example.com/logo.png");
      expect(watermark).toHaveAttribute("crossorigin", "anonymous");
      expect(watermark).toHaveClass("grayscale", "invert", "mix-blend-screen");
    });

    fireEvent.click(screen.getByRole("button", { name: /verso/i }));
    expect(container.querySelector("#wallet-card-back [data-wallet-watermark]")).toBeTruthy();
    expect(container.querySelector("[data-wallet-preview]")).toHaveClass("max-w-sm");
    expect(container.querySelector("[data-wallet-church-acronym]")).toHaveTextContent("IEAD");
    expect(screen.queryByText("Nome completo")).not.toBeInTheDocument();
    expect(screen.queryByText(/Função:/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Membro").length).toBeGreaterThan(0);
  });

  it("keeps the wallet usable when the organization has no logo", () => {
    const { container } = render(
      <MemberWalletCard member={member} churchName="Congregação Central" churchLogoUrl={null} />,
    );

    expect(container.querySelectorAll("[data-wallet-watermark]")).toHaveLength(0);
    expect(screen.getAllByText("Edson G Roquete").length).toBeGreaterThan(0);
  });

  it("gera uma sigla curta quando a igreja ainda não configurou a própria sigla", () => {
    const { container } = render(
      <MemberWalletCard
        member={member}
        churchName="Assembleia de Deus Caxias do Sul"
        churchLogoUrl={null}
      />,
    );

    expect(container.querySelector("[data-wallet-church-acronym]")).toHaveTextContent("ADCS");
  });
});
