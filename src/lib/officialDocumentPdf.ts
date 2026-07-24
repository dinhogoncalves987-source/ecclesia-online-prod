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

  const canvas = await html2canvas(element, {
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
}
