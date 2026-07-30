import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemberWalletCard, type WalletMember } from "./MemberWalletCard";

const {
  rpcMock,
  documentActionsProps,
  html2canvasMock,
  jsPdfMock,
  addImageMock,
  addPageMock,
} = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  documentActionsProps: { current: null as Record<string, unknown> | null },
  html2canvasMock: vi.fn(),
  jsPdfMock: vi.fn(),
  addImageMock: vi.fn(),
  addPageMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: rpcMock },
}));

vi.mock("@/components/DocumentActions", () => ({
  DocumentActions: (props: Record<string, unknown>) => {
    documentActionsProps.current = props;
    return <div data-testid="document-actions" />;
  },
}));

vi.mock("html2canvas", () => ({ default: html2canvasMock }));
vi.mock("jspdf", () => ({ jsPDF: jsPdfMock }));

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
      expect(watermark).toHaveClass("rounded-full", "grayscale", "invert", "mix-blend-screen");
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

  it("amplia automaticamente o QR seguro para leitura por scanner", async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        token: "token-seguro-de-teste",
        expires_at: new Date(Date.now() + 300_000).toISOString(),
      },
      error: null,
    });

    const { container } = render(
      <MemberWalletCard member={member} churchName="Congregação Central" churchLogoUrl={null} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Gerar QR seguro" }));

    expect(await screen.findByRole("dialog", { name: "QR Code seguro ampliado" })).toBeInTheDocument();
    const expandedQr = container.querySelector("[data-member-qr-expanded] div svg");
    expect(expandedQr).toHaveAttribute("width", "288");
    expect(screen.getByRole("button", { name: "Fechar QR ampliado" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "QR Code seguro ampliado" })).toHaveStyle({ opacity: "0" });
    });
  });

  it("gera frente e verso idênticos ao online em duas páginas no tamanho físico do cartão", async () => {
    const canvas = { toDataURL: vi.fn(() => "data:image/png;base64,teste") };
    html2canvasMock.mockResolvedValue(canvas);
    addImageMock.mockReset();
    addPageMock.mockReset();
    jsPdfMock.mockImplementation(() => ({
      addImage: addImageMock,
      addPage: addPageMock,
      output: vi.fn(() => new Blob(["pdf"], { type: "application/pdf" })),
    }));

    const { container } = render(
      <MemberWalletCard
        member={{ ...member, member_role: "leader", administrative_role: "Auxiliar" }}
        churchName="Assembleia de Deus Caxias do Sul"
        churchLogoUrl={null}
      />,
    );

    const generatePdf = documentActionsProps.current?.onGeneratePdfBlob as
      | (() => Promise<{ blob: Blob; fileName: string } | null>)
      | undefined;
    expect(generatePdf).toBeTypeOf("function");
    await generatePdf?.();

    expect(jsPdfMock).toHaveBeenCalledWith({
      orientation: "landscape",
      unit: "mm",
      format: [85.6, 53.98],
      compress: true,
    });
    expect(addImageMock).toHaveBeenCalledTimes(2);
    expect(addImageMock.mock.calls[0].slice(1)).toEqual([
      "PNG", 0, 0, 85.6, 53.98, undefined, "FAST",
    ]);
    expect(addImageMock.mock.calls[1].slice(1)).toEqual([
      "PNG", 0, 0, 85.6, 53.98, undefined, "FAST",
    ]);
    expect(addPageMock).toHaveBeenCalledWith([85.6, 53.98], "landscape");
    expect(screen.queryByText("Auxiliar")).not.toBeInTheDocument();
    expect(screen.getAllByText("Membro").length).toBeGreaterThan(0);
    const visibleFront = container.querySelector("#wallet-card-front") as HTMLElement;
    const pdfFront = container.querySelector("#wallet-pdf-front") as HTMLElement;
    expect(pdfFront.className).toBe(visibleFront.className);
    expect(pdfFront.getAttribute("style")).toBe(visibleFront.getAttribute("style"));
    expect(pdfFront).toHaveTextContent("Edson G Roquete");
    expect(pdfFront).toHaveTextContent("Membro");
    expect(pdfFront).not.toHaveTextContent("QR Code seguro disponível");
    expect(html2canvasMock).toHaveBeenCalledWith(
      pdfFront,
      expect.objectContaining({
        scale: 4,
        useCORS: true,
        allowTaint: false,
        backgroundColor: null,
      }),
    );
    expect(documentActionsProps.current?.onPrint).toBeTypeOf("function");
    expect(documentActionsProps.current?.printElementId).toBe("wallet-card-front");
  });
});
