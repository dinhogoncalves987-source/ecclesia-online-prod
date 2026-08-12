import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MEMBER_STATUSES } from "@/lib/secretariaConstants";
import {
  MemberWalletCard,
  STATUS_PROFILES,
  getStatusProfile,
  qrLogoImageSettings,
  type WalletMember,
} from "./MemberWalletCard";

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

/**
 * FASE 1C-G2 — a carteira de ANDRIELE DOS SANTOS BRAZ (matrícula 019904,
 * status real "Em disciplina") mostrava o selo verde "Ativo" porque
 * `STATUS_BADGE` não conhecia a chave "Em disciplina" e caía no fallback
 * `?? STATUS_BADGE.Ativo`. Estes testes cobrem os 8 status canônicos de
 * `MEMBER_STATUSES`, o alias legado "Disciplinado" e o fallback seguro para
 * status ausente/desconhecido — nenhum deles pode declarar "Ativo" por
 * omissão.
 */
describe("MemberWalletCard — perfis de todos os status (Fase 1C-G2)", () => {
  const renderWithStatus = (status: string) =>
    render(
      <MemberWalletCard
        member={{ ...member, status }}
        churchName="Congregação Central"
        churchLogoUrl={null}
      />,
    );

  const frontBadge = (container: HTMLElement) =>
    container.querySelector("#wallet-card-front [data-wallet-status-badge]");

  const footer = (container: HTMLElement) => container.querySelector("[data-wallet-footer]");

  it("Ativo aparece em verde/esmeralda com rodapé de cadastro ativo", () => {
    const { container } = renderWithStatus("Ativo");
    expect(frontBadge(container)).toHaveTextContent("ATIVO");
    expect(frontBadge(container)).toHaveClass("bg-emerald-600");
    expect(footer(container)).toHaveTextContent(
      "Documento institucional · Válido mediante verificação de cadastro ativo",
    );
  });

  it("Inativo aparece em vermelho e o rodapé nunca declara cadastro ativo", () => {
    const { container } = renderWithStatus("Inativo");
    expect(frontBadge(container)).toHaveTextContent("INATIVO");
    expect(frontBadge(container)).toHaveClass("bg-red-600");
    expect(footer(container)).toHaveTextContent("Cadastro inativo");
    expect(footer(container)?.textContent).not.toContain("cadastro ativo");
  });

  it("Transferido aparece em azul", () => {
    const { container } = renderWithStatus("Transferido");
    expect(frontBadge(container)).toHaveTextContent("TRANSFERIDO");
    expect(frontBadge(container)).toHaveClass("bg-blue-600");
    expect(footer(container)).toHaveTextContent("Membro transferido");
  });

  it('"Em disciplina" aparece em âmbar/amarelo e NUNCA cai em Ativo (bug de ANDRIELE DOS SANTOS BRAZ)', () => {
    const { container } = renderWithStatus("Em disciplina");
    const badge = frontBadge(container);
    expect(badge).toHaveTextContent("EM DISCIPLINA");
    expect(badge).toHaveClass("bg-amber-500");
    expect(badge).not.toHaveClass("bg-emerald-600");
    expect(badge?.textContent).not.toBe("ATIVO");
    expect(footer(container)).toHaveTextContent("Membro em disciplina");
  });

  it("Afastado aparece em laranja", () => {
    const { container } = renderWithStatus("Afastado");
    expect(frontBadge(container)).toHaveTextContent("AFASTADO");
    expect(frontBadge(container)).toHaveClass("bg-orange-600");
    expect(footer(container)).toHaveTextContent("Membro afastado");
  });

  it("Falecido aparece com perfil escuro/In memoriam, preservando o padrão institucional", () => {
    const { container } = renderWithStatus("Falecido");
    expect(frontBadge(container)).toHaveTextContent("IN MEMORIAM");
    expect(frontBadge(container)).toHaveClass("bg-slate-700");
    expect(footer(container)).toHaveTextContent("In memoriam");
  });

  it("Visitante possui perfil próprio e distinto (não é verde nem âmbar)", () => {
    const { container } = renderWithStatus("Visitante");
    const badge = frontBadge(container);
    expect(badge).toHaveTextContent("VISITANTE");
    expect(badge).toHaveClass("bg-sky-500");
    expect(badge).not.toHaveClass("bg-emerald-600");
    expect(badge).not.toHaveClass("bg-amber-500");
    expect(footer(container)).toHaveTextContent("Visitante");
  });

  it("Congregado possui perfil próprio e distinto", () => {
    const { container } = renderWithStatus("Congregado");
    const badge = frontBadge(container);
    expect(badge).toHaveTextContent("CONGREGADO");
    expect(badge).toHaveClass("bg-violet-600");
    expect(badge).not.toHaveClass("bg-emerald-600");
    expect(footer(container)).toHaveTextContent("Congregado");
  });

  it('"Disciplinado" funciona apenas como alias legado, idêntico a "Em disciplina"', () => {
    expect(getStatusProfile("Disciplinado")).toEqual(getStatusProfile("Em disciplina"));
    const { container } = renderWithStatus("Disciplinado");
    expect(frontBadge(container)).toHaveTextContent("EM DISCIPLINA");
    expect(frontBadge(container)).toHaveClass("bg-amber-500");
  });

  it("status desconhecido nunca cai em Ativo — usa o valor real recebido, em cinza/slate neutro", () => {
    const { container } = renderWithStatus("Bloqueado");
    const badge = frontBadge(container);
    expect(badge).toHaveTextContent("BLOQUEADO");
    expect(badge).toHaveClass("bg-slate-500");
    expect(badge).not.toHaveClass("bg-emerald-600");
  });

  it("status ausente/vazio mostra \"STATUS NÃO INFORMADO\" — nunca Ativo", () => {
    const { container } = renderWithStatus("");
    const badge = frontBadge(container);
    expect(badge).toHaveTextContent("STATUS NÃO INFORMADO");
    expect(badge).toHaveClass("bg-slate-500");
    expect(badge).not.toHaveClass("bg-emerald-600");
  });

  it("todos os valores de MEMBER_STATUSES possuem apresentação explícita (nenhum cai no fallback genérico)", () => {
    for (const status of MEMBER_STATUSES) {
      expect(STATUS_PROFILES[status], `status sem perfil: ${status}`).toBeDefined();
      expect(STATUS_PROFILES[status].cls).not.toBe("");
    }
  });

  it("o texto compartilhado (WhatsApp/Email) reflete o selo real, nunca 'Ativa' fixo por omissão", () => {
    renderWithStatus("Em disciplina");
    expect(documentActionsProps.current?.shareText).toContain("Situação: EM DISCIPLINA");
    expect(documentActionsProps.current?.emailBody).toContain("Situação: EM DISCIPLINA");
  });
});

/**
 * FASE 1C-G2 — símbolo Ω dourado sobreposto ao centro dos três QRCodeSVG da
 * Carteira: pequeno clicável (frente visível), pequeno não clicável (clone
 * off-screen usado por PDF/impressão/compartilhamento) e ampliado (modal).
 */
describe("MemberWalletCard — Ω dourado no QR (Fase 1C-G2)", () => {
  it("qrLogoImageSettings usa o ativo oficial, habilita excavate e nunca excede 15% do QR", () => {
    for (const size of [40, 288]) {
      const settings = qrLogoImageSettings(size);
      expect(settings.src).toBe("/icons/ecclesia-omega-qr.png");
      expect(settings.excavate).toBe(true);
      expect(settings.width).toBeGreaterThan(0);
      expect(settings.height).toBeGreaterThan(0);
      expect(settings.width / size).toBeLessThanOrEqual(0.15);
      expect(settings.height / size).toBeLessThanOrEqual(0.15);
    }
  });

  it("os três QRs (clicável, clone off-screen e ampliado) exibem o Ω dourado após a geração", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { token: "token-omega", expires_at: new Date(Date.now() + 300_000).toISOString() },
      error: null,
    });

    const { container } = render(
      <MemberWalletCard member={member} churchName="Congregação Central" churchLogoUrl={null} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Gerar QR seguro" }));
    await screen.findByRole("dialog", { name: "QR Code seguro ampliado" });

    const clickableLogo = container.querySelector("#wallet-card-front image");
    const pdfCloneLogo = container.querySelector("#wallet-pdf-front image");
    const expandedLogo = container.querySelector("[data-member-qr-expanded] image");

    for (const logo of [clickableLogo, pdfCloneLogo, expandedLogo]) {
      expect(logo).not.toBeNull();
      expect(logo).toHaveAttribute("href", "/icons/ecclesia-omega-qr.png");
    }
  });
});
