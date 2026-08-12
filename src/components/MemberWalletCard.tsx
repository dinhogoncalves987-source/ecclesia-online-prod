/**
 * MemberWalletCard — Carteira de Membro digital.
 *
 * Frente: logo da igreja, nome da igreja, avatar, cargo, matrícula, QR Code.
 * Verso:  CPF, filiação, batismo, pastor, disclaimer.
 *
 * PDF: gera arquivo 85mm × 54mm com frente + verso numa única chamada.
 * O usuário pode então compartilhar o arquivo via WhatsApp, Email ou Download.
 */

import { useRef, useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ChevronLeft, ChevronRight, Shield, QrCode, RefreshCw, Loader2, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DocumentActions } from "@/components/DocumentActions";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export type WalletMember = {
  id: string;
  full_name: string;
  member_code?: string | null;
  member_role: string | null;
  administrative_role?: string | null;
  status: string;
  phone: string | null;
  email: string | null;
  joined_at: string | null;
  photo_url?: string | null;
  cpf?: string | null;
  rg?: string | null;
  birth_date?: string | null;
  baptism_date?: string | null;
  congregation?: string | null;
  pastor_name?: string | null;
  parent_names?: string | null;
};

type Props = {
  member: WalletMember;
  churchName: string;
  churchAcronym?: string | null;
  churchCity?: string;
  churchState?: string;
  churchLogoUrl?: string | null;
  onClose?: () => void;
};

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function organizationInitials(name: string) {
  const ignoredWords = new Set(["a", "as", "da", "das", "de", "do", "dos", "e", "em"]);
  const initialsValue = name
    .trim()
    .split(/\s+/)
    .filter((word) => word && !ignoredWords.has(word.toLocaleLowerCase("pt-BR")))
    .map((word) => word[0])
    .join("")
    .slice(0, 8)
    .toLocaleUpperCase("pt-BR");

  return initialsValue || "IGREJA";
}

function memberCode(id: string) {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function maskCpf(cpf: string) {
  const clean = cpf.replace(/\D/g, "");
  if (clean.length !== 11) return cpf;
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9)}`;
}

/**
 * Perfis visuais de status da Carteira de Membro.
 *
 * Cada status canônico (ver `MEMBER_STATUSES` em `@/lib/secretariaConstants`)
 * possui selo, cor e rodapé próprios — nenhum deles declara "cadastro ativo"
 * exceto o próprio `Ativo`. "Disciplinado" é mantido apenas como alias legado
 * compatível, apontando para a mesma apresentação de "Em disciplina".
 *
 * O período disciplinar (início/término) ainda não é exibido aqui porque não
 * existem, hoje, campos estruturados no banco para isso — ver contrato da
 * migration do Alfred no relatório da Fase 1C-G2.
 */
export type StatusProfile = { label: string; cls: string; footer: string };

const ACTIVE_FOOTER = "Documento institucional · Válido mediante verificação de cadastro ativo";

export const STATUS_PROFILES: Record<string, StatusProfile> = {
  Ativo: {
    label: "ATIVO",
    cls: "bg-emerald-600 text-white",
    footer: ACTIVE_FOOTER,
  },
  Inativo: {
    label: "INATIVO",
    cls: "bg-red-600 text-white",
    footer: "Documento institucional · Cadastro inativo",
  },
  Transferido: {
    label: "TRANSFERIDO",
    cls: "bg-blue-600 text-white",
    footer: "Documento institucional · Membro transferido",
  },
  "Em disciplina": {
    label: "EM DISCIPLINA",
    cls: "bg-amber-500 text-white",
    footer: "Documento institucional · Membro em disciplina",
  },
  // Alias legado — mesma apresentação de "Em disciplina".
  Disciplinado: {
    label: "EM DISCIPLINA",
    cls: "bg-amber-500 text-white",
    footer: "Documento institucional · Membro em disciplina",
  },
  Afastado: {
    label: "AFASTADO",
    cls: "bg-orange-600 text-white",
    footer: "Documento institucional · Membro afastado",
  },
  Falecido: {
    label: "IN MEMORIAM",
    cls: "bg-slate-700 text-white",
    footer: "Documento institucional · In memoriam",
  },
  Visitante: {
    label: "VISITANTE",
    cls: "bg-sky-500 text-white",
    footer: "Documento institucional · Visitante",
  },
  Congregado: {
    label: "CONGREGADO",
    cls: "bg-violet-600 text-white",
    footer: "Documento institucional · Congregado",
  },
};

/**
 * Resolve o perfil visual de um status. Um status ausente ou desconhecido
 * NUNCA cai em `Ativo` — usa o valor real recebido (se houver) ou
 * "STATUS NÃO INFORMADO", sempre com apresentação neutra cinza/slate.
 */
export function getStatusProfile(status: string | null | undefined): StatusProfile {
  if (status && STATUS_PROFILES[status]) return STATUS_PROFILES[status];
  const trimmed = status?.trim();
  return {
    label: trimmed ? trimmed.toUpperCase() : "STATUS NÃO INFORMADO",
    cls: "bg-slate-500 text-white",
    footer: "Documento institucional · Situação cadastral a confirmar",
  };
}

/** Logo Ω dourado sobreposto ao centro do QR — máximo 15% da largura/altura. */
export const QR_LOGO_SRC = "/icons/ecclesia-omega-qr.png";
const QR_LOGO_MAX_RATIO = 0.15;

export function qrLogoImageSettings(qrSize: number) {
  const logoSize = Math.round(qrSize * QR_LOGO_MAX_RATIO);
  return {
    src: QR_LOGO_SRC,
    height: logoSize,
    width: logoSize,
    excavate: true,
  } as const;
}

// ── Frente ────────────────────────────────────────────────────────────────────

function CardFront({
  id, member, churchName, churchAcronym, churchLogoUrl, code, issueDate, validUntil, qrValue,
  onQrClick,
}: {
  id: string; member: WalletMember; churchName: string;
  churchAcronym?: string | null; churchLogoUrl?: string | null;
  code: string; issueDate: string; validUntil: string; qrValue: string;
  onQrClick?: () => void;
}) {
  const statusInfo = getStatusProfile(member.status);
  const churchDisplay = churchAcronym?.trim() || organizationInitials(churchName);

  return (
    <div
      id={id}
      data-wallet-card-face="front"
      className="relative w-full rounded-2xl overflow-hidden shadow-2xl select-none"
      style={{ aspectRatio: "85/54" }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950" />
      <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-blue-600/25 -translate-y-1/2 translate-x-1/2 blur-3xl" />
      <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-emerald-600/15 translate-y-1/2 -translate-x-1/2 blur-2xl" />
      {churchLogoUrl && (
        <img
          src={churchLogoUrl}
          alt=""
          aria-hidden="true"
          crossOrigin="anonymous"
          data-wallet-watermark
          className="pointer-events-none absolute left-1/2 top-1/2 aspect-square h-[66%] max-w-[58%] -translate-x-1/2 -translate-y-1/2 rounded-full object-contain opacity-[0.09] grayscale invert contrast-[1.65] mix-blend-screen"
        />
      )}

      <div className="relative z-10 h-full p-4 flex flex-col justify-between">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2">
            {churchLogoUrl && (
              <img
                src={churchLogoUrl}
                alt={churchName}
                crossOrigin="anonymous"
                className="w-7 h-7 rounded object-contain flex-shrink-0 mt-0.5"
              />
            )}
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                {!churchLogoUrl && <Shield size={9} className="text-blue-300" />}
                <span className="text-[8px] font-bold tracking-[0.18em] text-blue-200 uppercase">Carteira de Membro</span>
              </div>
              <p
                data-wallet-church-acronym
                className="text-[10px] font-semibold uppercase leading-tight tracking-[0.14em] text-slate-300"
              >
                {churchDisplay}
              </p>
            </div>
          </div>
          <span
            data-wallet-status-badge
            className={cn("flex-shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider", statusInfo.cls)}
          >
            {statusInfo.label}
          </span>
        </div>

        <div className="flex items-end justify-between gap-2">
          <div className="flex items-end gap-2.5">
            {member.photo_url ? (
              <img
                src={member.photo_url}
                alt={member.full_name}
                crossOrigin="anonymous"
                className="w-11 h-14 rounded-lg object-cover shadow-lg flex-shrink-0"
              />
            ) : (
              <div className="w-11 h-14 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-base shadow-lg flex-shrink-0">
                {initials(member.full_name)}
              </div>
            )}
            <div className="pb-0.5">
              <p className="text-[12px] font-bold leading-tight text-white">{member.full_name}</p>
              <p className="mt-1 text-[9px] font-medium text-slate-300">Membro</p>
            </div>
          </div>
          {qrValue && onQrClick ? (
            <motion.button
              layoutId="member-secure-qr"
              type="button"
              onClick={onQrClick}
              aria-label="Ampliar QR Code seguro"
              className="flex-shrink-0 rounded-lg bg-white p-1 shadow transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              <QRCodeSVG
                value={qrValue}
                size={40}
                level="H"
                marginSize={1}
                imageSettings={qrLogoImageSettings(40)}
              />
            </motion.button>
          ) : (
            <div className="bg-white rounded-lg p-1 flex-shrink-0 shadow">
              {qrValue ? (
                <QRCodeSVG
                  value={qrValue}
                  size={40}
                  level="H"
                  marginSize={1}
                  imageSettings={qrLogoImageSettings(40)}
                />
              ) : (
                <div className="w-[40px] h-[40px] flex items-center justify-center">
                  <QrCode size={16} className="text-slate-300" />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-700/50 pt-1.5">
          <div>
            <p className="text-[7px] uppercase tracking-wide text-slate-500">Matrícula</p>
            <p className="font-mono text-[9px] tracking-widest text-slate-200">Nº {code}</p>
          </div>
          <div className="text-right">
            <p className="text-[7px] uppercase tracking-wide text-slate-500">Emissão</p>
            <p className="font-mono text-[9px] text-slate-200">{issueDate}</p>
          </div>
          <div className="text-right">
            <p className="text-[7px] uppercase tracking-wide text-slate-500">Validade</p>
            <p className="font-mono text-[9px] text-slate-200">{validUntil}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Verso ─────────────────────────────────────────────────────────────────────

function CardBack({
  id,
  member,
  churchName,
  churchLogoUrl,
}: {
  id: string;
  member: WalletMember;
  churchName: string;
  churchLogoUrl?: string | null;
}) {
  return (
    <div
      id={id}
      data-wallet-card-face="back"
      className="relative w-full rounded-2xl overflow-hidden shadow-2xl select-none"
      style={{ aspectRatio: "85/54" }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-800" />
      <div className="absolute top-0 left-0 w-32 h-32 rounded-full bg-blue-600/15 -translate-y-1/2 -translate-x-1/2 blur-3xl" />
      {churchLogoUrl && (
        <img
          src={churchLogoUrl}
          alt=""
          aria-hidden="true"
          crossOrigin="anonymous"
          data-wallet-watermark
          className="pointer-events-none absolute left-1/2 top-1/2 aspect-square h-[64%] max-w-[56%] -translate-x-1/2 -translate-y-1/2 rounded-full object-contain opacity-[0.08] grayscale invert contrast-[1.65] mix-blend-screen"
        />
      )}

      <div className="relative z-10 h-full p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between border-b border-slate-700/50 pb-1.5">
          <p className="text-[8px] text-slate-400 font-medium">{churchName}</p>
          <p className="text-[7px] text-slate-500 font-bold tracking-widest uppercase">Verso</p>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {member.parent_names && (
            <div className="col-span-2">
              <p className="text-[6px] text-slate-500 uppercase tracking-wide">Filiação</p>
              <p className="text-[8px] text-slate-300">{member.parent_names}</p>
            </div>
          )}
          {member.cpf && (
            <div>
              <p className="text-[6px] text-slate-500 uppercase tracking-wide">CPF</p>
              <p className="text-[8px] text-slate-300 font-mono">{maskCpf(member.cpf)}</p>
            </div>
          )}
          {member.baptism_date && (
            <div>
              <p className="text-[6px] text-slate-500 uppercase tracking-wide">Batismo</p>
              <p className="text-[8px] text-slate-300">
                {format(new Date(member.baptism_date), "dd/MM/yyyy", { locale: ptBR })}
              </p>
            </div>
          )}
          {member.pastor_name && (
            <div>
              <p className="text-[6px] text-slate-500 uppercase tracking-wide">Pastor Presidente</p>
              <p className="text-[8px] text-slate-300">{member.pastor_name}</p>
            </div>
          )}
          {!member.cpf && !member.baptism_date && !member.parent_names && (
            <div className="col-span-2">
              <p className="text-[8px] text-slate-500 italic">Dados complementares registrados na secretaria</p>
            </div>
          )}
        </div>

        <div className="border-t border-slate-700/50 pt-1.5">
          <p className="text-[6.5px] text-slate-500 leading-tight">
            Documento de identificação pessoal e intransferível.
            Válido mediante consulta cadastral junto à secretaria da {churchName}.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function MemberWalletCard({ member, churchName, churchAcronym, churchCity, churchState, churchLogoUrl, onClose }: Props) {
  const [showBack, setShowBack] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // ── Dynamic QR state ────────────────────────────────────────────────────────
  const [qrState, setQrState] = useState<"idle" | "loading" | "ready" | "expired" | "error">("idle");
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrExpiresAt, setQrExpiresAt] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrTimeLeft, setQrTimeLeft] = useState(0);
  const [qrExpanded, setQrExpanded] = useState(false);

  // ── Countdown timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (qrState !== "ready" || !qrExpiresAt) return;
    const tick = () => {
      const remaining = Math.max(0, Math.floor((new Date(qrExpiresAt).getTime() - Date.now()) / 1000));
      setQrTimeLeft(remaining);
      if (remaining <= 0) setQrState("expired");
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [qrState, qrExpiresAt]);

  useEffect(() => {
    if (!qrExpanded) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setQrExpanded(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [qrExpanded]);

  useEffect(() => {
    if (qrState === "expired") setQrExpanded(false);
  }, [qrState]);

  const formatTimeLeft = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ── QR generation ───────────────────────────────────────────────────────────
  const handleGenerateQr = async () => {
    setQrState("loading");
    setQrError(null);
    try {
      const { data, error } = await supabase.rpc("generate_member_validation_token", {
        p_member_id: member.id,
      });
      if (error) throw error;
      if (!(data as { token?: string; expires_at?: string })?.token) throw new Error("token_missing");
      const payload = data as { token: string; expires_at: string };
      setQrToken(payload.token);
      setQrExpiresAt(payload.expires_at);
      setQrTimeLeft(300);
      setQrState("ready");
      setQrExpanded(true);
    } catch {
      setQrError("Não foi possível gerar o QR seguro agora.");
      setQrState("error");
    }
  };

  // Refs para os cards off-screen usados exclusivamente pelo gerador de PDF
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  const issueDate  = format(new Date(), "dd/MM/yyyy", { locale: ptBR });
  const validUntil = format(new Date(new Date().setFullYear(new Date().getFullYear() + 1)), "dd/MM/yyyy", { locale: ptBR });
  // O código interno definido pela própria igreja tem prioridade. Sem ele,
  // mantém a matrícula técnica gerada a partir do identificador do cadastro.
  const code           = member.member_code?.trim() || memberCode(member.id);
  // Perfil visual/textual do status atual — usado no selo, no rodapé e no
  // texto compartilhado (WhatsApp/Email). Nunca cai em "Ativo" por omissão.
  const statusProfile  = getStatusProfile(member.status);

  const qrValue = qrState === "ready" && qrToken
    ? `${window.location.origin}/admin/porteiro?token=${encodeURIComponent(qrToken)}`
    : "";

  const shareText = [
    `📋 CARTEIRA DE MEMBRO`,
    ``,
    `Nome: ${member.full_name}`,
    `Igreja: ${churchName}${churchCity ? ` · ${churchCity}${churchState ? `/${churchState}` : ""}` : ""}`,
    `Vínculo: Membro`,
    `Matrícula: Nº ${code}`,
    `Situação: ${statusProfile.label}`,
    ``,
    `Documento emitido pela igreja via Ecclesia Online.`,
  ].filter(Boolean).join("\n");

  // ── Geração de PDF real (html2canvas + jsPDF) ─────────────────────────────

  const fileName = `CarteiraMembro-${member.full_name.replace(/\s+/g, "-")}.pdf`;

  /** Captura exatamente as mesmas faces React exibidas na tela. */
  const renderWalletCanvases = async () => {
    const { default: html2canvas } = await import("html2canvas");
    const frontEl = document.getElementById("wallet-pdf-front");
    const backEl  = document.getElementById("wallet-pdf-back");
    if (!frontEl || !backEl) throw new Error("Elementos do cartão não encontrados");

    const images = Array.from(
      new Set([...frontEl.querySelectorAll("img"), ...backEl.querySelectorAll("img")]),
    );
    await Promise.all(images.map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        });
      }
      try {
        await image.decode();
      } catch {
        // O navegador pode não oferecer decode para algumas URLs antigas.
      }
    }));
    if (document.fonts?.ready) await document.fonts.ready;

    const captureOpts = {
      scale: 4,
      useCORS: true,
      allowTaint: false,
      backgroundColor: null,
      logging: false,
      width: frontEl.offsetWidth,
      height: frontEl.offsetHeight,
      windowWidth: frontEl.offsetWidth,
      windowHeight: frontEl.offsetHeight,
    };
    const frontCanvas = await html2canvas(frontEl, captureOpts);
    const backCanvas = await html2canvas(backEl, {
      ...captureOpts,
      width: backEl.offsetWidth,
      height: backEl.offsetHeight,
      windowWidth: backEl.offsetWidth,
      windowHeight: backEl.offsetHeight,
    });

    return { frontCanvas, backCanvas };
  };

  /** Renderiza frente + verso em duas páginas no tamanho físico de cartão. */
  const generateWalletPdfBlob = async (): Promise<{ blob: Blob; fileName: string } | null> => {
    try {
      const [{ jsPDF }, { frontCanvas, backCanvas }] = await Promise.all([
        import("jspdf"),
        renderWalletCanvases(),
      ]);

      const cardWidth = 85.6;
      const cardHeight = 53.98;
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: [cardWidth, cardHeight],
        compress: true,
      });

      pdf.addImage(
        frontCanvas.toDataURL("image/png"),
        "PNG",
        0,
        0,
        cardWidth,
        cardHeight,
        undefined,
        "FAST",
      );
      pdf.addPage([cardWidth, cardHeight], "landscape");
      pdf.addImage(
        backCanvas.toDataURL("image/png"),
        "PNG",
        0,
        0,
        cardWidth,
        cardHeight,
        undefined,
        "FAST",
      );

      return { blob: pdf.output("blob"), fileName };
    } catch (err) {
      console.error("[MemberWalletCard] Erro ao gerar PDF blob:", err);
      return null;
    }
  };

  /**
   * Imprime somente o PDF de duas páginas em tamanho de cartão. O documento
   * aberto no diálogo de impressão não contém modal, botões ou cabeçalhos da
   * aplicação.
   */
  const handlePrintWallet = async () => {
    const result = await generateWalletPdfBlob();
    if (!result) return;

    const url = URL.createObjectURL(result.blob);
    const iframe = document.createElement("iframe");
    iframe.title = "Impressão da carteira de membro";
    iframe.style.position = "fixed";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.border = "0";
    iframe.src = url;
    document.body.appendChild(iframe);

    iframe.addEventListener("load", () => {
      window.setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      }, 250);
    }, { once: true });

    window.setTimeout(() => {
      iframe.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  };

  const handleGeneratePdf = async () => {
    setGeneratingPdf(true);
    try {
      const result = await generateWalletPdfBlob();
      if (!result) return;
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const cardProps = { member, churchName, churchAcronym, churchLogoUrl, code, issueDate, validUntil, qrValue };

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="text-center">
        <p className="text-sm font-semibold">Carteira de Membro</p>
        <p className="text-xs text-muted-foreground">{member.full_name}</p>
      </div>

      {/* Card visível (frente ou verso) */}
      <div data-wallet-preview className="w-full max-w-sm">
        {showBack
          ? <CardBack id="wallet-card-back"  {...{ member, churchName, churchLogoUrl }} />
          : <CardFront id="wallet-card-front" {...cardProps} onQrClick={() => setQrExpanded(true)} />}
      </div>

      {/* Dynamic QR controls */}
      <div className="flex w-full max-w-sm flex-col items-center gap-2">
        {qrState === "idle" && (
          <button
            type="button"
            onClick={handleGenerateQr}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white transition-colors font-medium"
          >
            <QrCode size={14} /> Gerar QR seguro
          </button>
        )}

        {qrState === "loading" && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Gerando QR...
          </span>
        )}

        {qrState === "ready" && (
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              QR Code gerado com sucesso
            </span>
            <span className="text-[11px] text-muted-foreground">
              Este QR Code expira em 5 minutos.
            </span>
            <span className={`text-xs font-mono font-semibold ${qrTimeLeft <= 60 ? "text-red-500" : "text-foreground"}`}>
              {formatTimeLeft(qrTimeLeft)}
            </span>
            <button
              type="button"
              onClick={() => setQrExpanded(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/30 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-600/10 dark:text-emerald-400"
            >
              <QrCode size={14} /> Abrir QR em tela cheia
            </button>
          </div>
        )}

        {qrState === "expired" && (
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs text-red-500 font-medium">
              QR Code expirado. Gere um novo código.
            </span>
            <button
              type="button"
              onClick={handleGenerateQr}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white transition-colors font-medium"
            >
              <RefreshCw size={14} /> Gerar novo QR
            </button>
          </div>
        )}

        {qrState === "error" && (
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs text-red-500">{qrError}</span>
            <button
              type="button"
              onClick={handleGenerateQr}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-border hover:bg-secondary transition-colors font-medium"
            >
              <RefreshCw size={14} /> Tentar novamente
            </button>
          </div>
        )}
      </div>

      {/* Cards off-screen sempre renderizados — usados pelo PDF */}
      <div
        ref={pdfContainerRef}
        aria-hidden
        style={{ position: "fixed", left: "-9999px", top: "-9999px", width: 360, pointerEvents: "none" }}
      >
        <div style={{ marginBottom: 16 }}>
          <CardFront id="wallet-pdf-front" {...cardProps} />
        </div>
        <CardBack id="wallet-pdf-back" {...{ member, churchName, churchLogoUrl }} />
      </div>

      {/* Flip frente / verso */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setShowBack(false)}
          className={cn(
            "flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors",
            !showBack ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50",
          )}
        >
          <ChevronLeft size={12} /> Frente
        </button>
        <button
          type="button"
          onClick={() => setShowBack(true)}
          className={cn(
            "flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors",
            showBack ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50",
          )}
        >
          Verso <ChevronRight size={12} />
        </button>
      </div>

      {/* Ações do documento */}
      <DocumentActions
        printElementId={showBack ? "wallet-card-back" : "wallet-card-front"}
        shareTitle={`Carteira de Membro — ${member.full_name}`}
        shareText={shareText}
        shareUrl={window.location.origin}
        whatsappText={`Carteira de Membro — ${member.full_name} | ${churchName}`}
        emailSubject={`Carteira de Membro — ${member.full_name} — ${churchName}`}
        emailBody={shareText}
        actions={["pdf", "share", "whatsapp", "email", "print"]}
        onGeneratePdf={generatingPdf ? undefined : () => void handleGeneratePdf()}
        onGeneratePdfBlob={generatingPdf ? undefined : generateWalletPdfBlob}
        onPrint={generatingPdf ? undefined : handlePrintWallet}
        onGeneratingChange={setGeneratingPdf}
      />

      {generatingPdf && (
        <p className="text-xs text-muted-foreground animate-pulse">Gerando PDF da carteira...</p>
      )}

      <AnimatePresence>
        {qrExpanded && qrValue && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="QR Code seguro ampliado"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setQrExpanded(false);
            }}
          >
            <motion.div
              data-member-qr-expanded
              layoutId="member-secure-qr"
              className="relative flex w-full max-w-sm flex-col items-center rounded-3xl bg-white p-5 text-slate-950 shadow-2xl sm:p-7"
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
            >
              <button
                type="button"
                onClick={() => setQrExpanded(false)}
                aria-label="Fechar QR ampliado"
                className="absolute right-3 top-3 rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                <X size={20} />
              </button>
              <p className="pr-8 text-center text-sm font-semibold">Carteira de {member.full_name}</p>
              <p className="mb-4 mt-1 text-center text-xs text-slate-500">
                Aponte o leitor para o código. Ele expira em {formatTimeLeft(qrTimeLeft)}.
              </p>
              <div className="rounded-2xl border-4 border-emerald-600/20 bg-white p-3">
                <QRCodeSVG
                  value={qrValue}
                  size={288}
                  level="H"
                  marginSize={2}
                  imageSettings={qrLogoImageSettings(288)}
                  className="h-auto w-full max-w-[288px]"
                />
              </div>
              <p className="mt-4 text-center text-xs font-medium text-emerald-700">
                QR seguro para validação no modo porteiro
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-muted-foreground hover:text-foreground px-4 py-1.5 rounded-lg hover:bg-secondary transition-colors"
        >
          Fechar
        </button>
      )}

      <p className="text-[11px] text-muted-foreground text-center max-w-xs" data-wallet-footer>
        {statusProfile.footer}
      </p>
    </div>
  );
}
