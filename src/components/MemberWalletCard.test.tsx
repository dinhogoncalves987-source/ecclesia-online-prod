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
        churchLogoUrl="https://example.com/logo.png"
      />,
    );

    const watermarks = container.querySelectorAll('img[aria-hidden="true"]');
    expect(watermarks.length).toBeGreaterThanOrEqual(3);
    watermarks.forEach((watermark) => {
      expect(watermark).toHaveAttribute("src", "https://example.com/logo.png");
      expect(watermark).toHaveAttribute("crossorigin", "anonymous");
    });

    fireEvent.click(screen.getByRole("button", { name: /verso/i }));
    expect(container.querySelector("#wallet-card-back img[aria-hidden='true']")).toBeTruthy();
  });

  it("keeps the wallet usable when the organization has no logo", () => {
    const { container } = render(
      <MemberWalletCard member={member} churchName="Congregação Central" churchLogoUrl={null} />,
    );

    expect(container.querySelectorAll('img[aria-hidden="true"]')).toHaveLength(0);
    expect(screen.getAllByText("Edson G Roquete").length).toBeGreaterThan(0);
  });
});
