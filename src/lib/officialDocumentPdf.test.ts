import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const html2canvasMock = vi.hoisted(() => vi.fn());
const addImageMock = vi.hoisted(() => vi.fn());
const outputMock = vi.hoisted(() => vi.fn(() => new Blob(["pdf"], { type: "application/pdf" })));

vi.mock("html2canvas", () => ({ default: html2canvasMock }));
vi.mock("jspdf", () => ({
  default: vi.fn().mockImplementation(() => ({
    addImage: addImageMock,
    output: outputMock,
  })),
}));

import { generateOfficialDocumentPdf } from "@/lib/officialDocumentPdf";

describe("generateOfficialDocumentPdf", () => {
  beforeEach(() => {
    html2canvasMock.mockReset();
    addImageMock.mockClear();
    outputMock.mockClear();
    html2canvasMock.mockImplementation(async (element: HTMLElement) => {
      expect(element.id).toBe("certificate-pdf-capture");
      expect(element.style.transform).toBe("none");
      expect(element).not.toBe(document.getElementById("certificate"));
      return {
        width: 2240,
        height: 1584,
        toDataURL: () => "data:image/png;base64,certificate",
      };
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("captura uma cópia em tamanho original e remove o hospedeiro temporário", async () => {
    const certificate = document.createElement("article");
    certificate.id = "certificate";
    certificate.style.width = "1120px";
    certificate.style.height = "792px";
    certificate.style.transform = "scale(0.3)";
    document.body.appendChild(certificate);

    const result = await generateOfficialDocumentPdf(
      "certificate",
      "certificado.pdf",
      "landscape",
    );

    expect(result?.fileName).toBe("certificado.pdf");
    expect(result?.blob.type).toBe("application/pdf");
    expect(html2canvasMock).toHaveBeenCalledTimes(1);
    expect(addImageMock).toHaveBeenCalledTimes(1);
    expect(document.getElementById("certificate-pdf-capture")).toBeNull();
    expect(certificate.style.transform).toBe("scale(0.3)");
  });
});
