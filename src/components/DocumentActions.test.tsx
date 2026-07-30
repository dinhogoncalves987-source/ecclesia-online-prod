import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentActions } from "@/components/DocumentActions";

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: toastMocks }));

const pdfResult = {
  blob: new Blob(["documento"], { type: "application/pdf" }),
  fileName: "documento-oficial.pdf",
};

describe("DocumentActions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.values(toastMocks).forEach((mock) => mock.mockClear());
  });

  it("compartilha o PDF real sem misturar texto ou URL no payload", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: vi.fn().mockReturnValue(true),
    });

    render(
      <DocumentActions
        actions={["share"]}
        shareTitle="Certificado"
        shareText="Texto que não deve acompanhar o arquivo"
        shareUrl="https://example.test/validar"
        onGeneratePdfBlob={vi.fn().mockResolvedValue(pdfResult)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Compartilhar" }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const payload = share.mock.calls[0][0] as ShareData;
    expect(payload.title).toBe("Certificado");
    expect(payload.text).toBeUndefined();
    expect(payload.url).toBeUndefined();
    expect(payload.files).toHaveLength(1);
    expect(payload.files?.[0]).toBeInstanceOf(File);
    expect(payload.files?.[0].name).toBe("documento-oficial.pdf");
    expect(payload.files?.[0].type).toBe("application/pdf");
  });

  it("oferece o mesmo PDF real ao WhatsApp e ao WhatsApp Business", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: vi.fn().mockReturnValue(true),
    });

    render(
      <DocumentActions
        actions={["whatsapp"]}
        shareTitle="Carteira de Membro"
        onGeneratePdfBlob={vi.fn().mockResolvedValue(pdfResult)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "WhatsApp / Business" }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share.mock.calls[0][0].files?.[0].name).toBe("documento-oficial.pdf");
  });

  it("mantém Compartilhar disponível e baixa o PDF quando o navegador não aceita arquivos", async () => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    const createObjectURL = vi.fn().mockReturnValue("blob:documento");
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(
      <DocumentActions
        actions={["share"]}
        shareUrl="https://example.test/validar"
        onGeneratePdfBlob={vi.fn().mockResolvedValue(pdfResult)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Compartilhar" }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(pdfResult.blob));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://example.test/validar");
    expect(toastMocks.info).toHaveBeenCalled();
  });

  it("usa a impressão especializada quando o documento fornece esse fluxo", async () => {
    const onPrint = vi.fn().mockResolvedValue(undefined);
    const browserPrint = vi.spyOn(window, "print").mockImplementation(() => undefined);

    render(
      <DocumentActions
        actions={["print"]}
        printElementId="documento-visivel"
        onPrint={onPrint}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Imprimir" }));

    await waitFor(() => expect(onPrint).toHaveBeenCalledTimes(1));
    expect(browserPrint).not.toHaveBeenCalled();
  });
});
