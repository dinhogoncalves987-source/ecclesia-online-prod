type PdfOrientation = "portrait" | "landscape";

export async function generateOfficialDocumentPdf(
  elementId: string,
  fileName: string,
  orientation: PdfOrientation,
): Promise<{ blob: Blob; fileName: string } | null> {
  const element = document.getElementById(elementId);
  if (!element) return null;

  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  // A pré-visualização pode estar reduzida no celular. A captura usa uma
  // cópia isolada no tamanho original para manter A4 nítido e impedir que
  // overflow/transform do modal corte ornamentos ou outros elementos.
  const captureHost = document.createElement("div");
  captureHost.setAttribute("aria-hidden", "true");
  captureHost.style.position = "fixed";
  captureHost.style.left = "-20000px";
  captureHost.style.top = "0";
  captureHost.style.width = `${element.offsetWidth || 1120}px`;
  captureHost.style.height = `${element.offsetHeight || 792}px`;
  captureHost.style.overflow = "visible";
  captureHost.style.pointerEvents = "none";

  const captureElement = element.cloneNode(true) as HTMLElement;
  captureElement.id = `${elementId}-pdf-capture`;
  captureElement.style.position = "relative";
  captureElement.style.left = "0";
  captureElement.style.top = "0";
  captureElement.style.transform = "none";
  captureElement.style.transformOrigin = "top left";
  captureHost.appendChild(captureElement);
  document.body.appendChild(captureHost);

  const images = Array.from(captureElement.querySelectorAll("img"));
  await Promise.all(images.map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    });
  }));

  try {
    if (document.fonts?.ready) await document.fonts.ready;

    const canvas = await html2canvas(captureElement, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });
    const pdf = new jsPDF({ orientation, unit: "mm", format: "a4" });
    const pageWidth = orientation === "landscape" ? 297 : 210;
    const pageHeight = orientation === "landscape" ? 210 : 297;
    const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
    const width = canvas.width * ratio;
    const height = canvas.height * ratio;
    pdf.addImage(
      canvas.toDataURL("image/png"),
      "PNG",
      (pageWidth - width) / 2,
      (pageHeight - height) / 2,
      width,
      height,
      undefined,
      "FAST",
    );
    return { blob: pdf.output("blob"), fileName };
  } finally {
    captureHost.remove();
  }
}
