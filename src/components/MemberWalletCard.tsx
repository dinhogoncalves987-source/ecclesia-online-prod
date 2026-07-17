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
import { ChevronLeft, ChevronRight, Shield, QrCode, RefreshCw, Loader2 } from "lucide-react";
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
  churchCity?: string;
  churchState?: string;
  churchLogoUrl?: string | null;
  onClose?: () => void;
};

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function memberCode(id: string) {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function maskCpf(cpf: string) {
  const clean = cpf.replace(/\D/g, "");
  if (clean.length !== 11) return cpf;
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9)}`;
}

const ROLE_LABEL: Record<string, string> = {
  member:      "Membro",
  leader:      "Líder",
  co_leader:   "Co-líder",
  pastor:      "Pastor",
  secretary:   "Secretário(a)",
  treasurer:   "Tesoureiro(a)",
  deacon:      "Diácono/Diaconisa",
  elder:       "Presbítero",
  church_admin:"Administrador",
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  Ativo:       { label: "ATIVO",        cls: "bg-emerald-600 text-white" },
  Inativo:     { label: "INATIVO",      cls: "bg-slate-500 text-white"   },
  Visitante:   { label: "VISITANTE",    cls: "bg-amber-500 text-white"   },
  Transferido: { label: "TRANSFERIDO",  cls: "bg-blue-600 text-white"    },
  Disciplinado:{ label: "DISCIPLINADO", cls: "bg-red-700 text-white"     },
  Falecido:    { label: "IN MEMORIAM",  cls: "bg-slate-700 text-white"   },
};

// ── Frente ────────────────────────────────────────────────────────────────────

function CardFront({
  id, member, churchName, churchCity, churchState, churchLogoUrl, code, issueDate, validUntil, qrValue, pdfQrPlaceholder,
}: {
  id: string; member: WalletMember; churchName: string;
  churchCity?: string; churchState?: string; churchLogoUrl?: string | null;
  code: string; issueDate: string; validUntil: string; qrValue: string; pdfQrPlaceholder?: string;
}) {
  const statusInfo = STATUS_BADGE[member.status] ?? STATUS_BADGE.Ativo;
  const roleLabel  = ROLE_LABEL[member.member_role ?? ""] ?? member.member_role ?? "Membro";
  const churchDisplay = [churchName, churchCity && churchState ? `${churchCity} - ${churchState}` : (churchCity || churchState)].filter(Boolean).join("\n");

  return (
    <div
      id={id}
      className="relative w-full rounded-2xl overflow-hidden shadow-2xl select-none"
      style={{ aspectRatio: "85/54" }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950" />
      <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-blue-600/25 -translate-y-1/2 translate-x-1/2 blur-3xl" />
      <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-emerald-600/15 translate-y-1/2 -translate-x-1/2 blur-2xl" />

      <div className="relative z-10 h-full p-4 flex flex-col justify-between">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2">
            {churchLogoUrl && (
              <img
                src={churchLogoUrl}
                alt={churchName}
                className="w-7 h-7 rounded object-contain flex-shrink-0 mt-0.5"
              />
            )}
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                {!churchLogoUrl && <Shield size={9} className="text-blue-300" />}
                <span className="text-[7px] font-bold tracking-[0.18em] text-blue-200 uppercase">Carteira de Membro</span>
              </div>
              <p className="text-[9px] text-slate-300 leading-tight max-w-[55%] line-clamp-2 whitespace-pre-line">{churchDisplay}</p>
            </div>
          </div>
          <span className={cn("text-[7px] font-bold tracking-wider px-1.5 py-0.5 rounded-full uppercase flex-shrink-0", statusInfo.cls)}>
            {statusInfo.label}
          </span>
        </div>

        <div className="flex items-end justify-between gap-2">
          <div className="flex items-end gap-2.5">
            {member.photo_url ? (
              <img
                src={member.photo_url}
                alt={member.full_name}
                className="w-11 h-14 rounded-lg object-cover shadow-lg flex-shrink-0"
              />
            ) : (
              <div className="w-11 h-14 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-base shadow-lg flex-shrink-0">
                {initials(member.full_name)}
              </div>
            )}
            <div className="pb-0.5">
              <p className="text-[8px] text-slate-400 uppercase tracking-wide">Nome completo</p>
              <p className="text-white font-bold text-[10px] leading-tight mt-0.5">{member.full_name}</p>
              <p className="text-slate-400 text-[8px] mt-1">
                <span className="text-slate-500">Função:</span> {roleLabel}
              </p>
              {member.administrative_role && member.administrative_role !== "Nenhum" && (
                <p className="text-slate-400 text-[8px]">
                  <span className="text-slate-500">Cargo:</span> {member.administrative_role}
                </p>
              )}
              {member.congregation && (
                <p className="text-slate-400 text-[8px]">
                  <span className="text-slate-500">Congregação:</span> {member.congregation}
                </p>
              )}
            </div>
          </div>
          <div className="bg-white rounded-lg p-1 flex-shrink-0 shadow">
            {pdfQrPlaceholder ? (
              <div className="w-[40px] h-[40px] flex items-center justify-center p-0.5">
                <span className="text-[5px] text-slate-500 text-center leading-tight">{pdfQrPlaceholder}</span>
              </div>
            ) : qrValue ? (
              <QRCodeSVG value={qrValue} size={40} level="M" />
            ) : (
              <div className="w-[40px] h-[40px] flex items-center justify-center">
                <QrCode size={16} className="text-slate-300" />
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-700/50 pt-1.5">
          <div>
            <p className="text-[6px] text-slate-500 uppercase tracking-wide">Matrícula</p>
            <p className="text-[8px] text-slate-300 font-mono tracking-widest">Nº {code}</p>
          </div>
          <div className="text-right">
            <p className="text-[6px] text-slate-500 uppercase tracking-wide">Emissão</p>
            <p className="text-[8px] text-slate-300 font-mono">{issueDate}</p>
          </div>
          <div className="text-right">
            <p className="text-[6px] text-slate-500 uppercase tracking-wide">Validade</p>
            <p className="text-[8px] text-slate-300 font-mono">{validUntil}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Verso ─────────────────────────────────────────────────────────────────────

function CardBack({ id, member, churchName }: { id: string; member: WalletMember; churchName: string }) {
  return (
    <div
      id={id}
      className="relative w-full rounded-2xl overflow-hidden shadow-2xl select-none"
      style={{ aspectRatio: "85/54" }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-800" />
      <div className="absolute top-0 left-0 w-32 h-32 rounded-full bg-blue-600/15 -translate-y-1/2 -translate-x-1/2 blur-3xl" />

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

export function MemberWalletCard({ member, churchName, churchCity, churchState, churchLogoUrl, onClose }: Props) {
  const [showBack, setShowBack] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // ── Dynamic QR state ────────────────────────────────────────────────────────
  const [qrState, setQrState] = useState<"idle" | "loading" | "ready" | "expired" | "error">("idle");
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrExpiresAt, setQrExpiresAt] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrTimeLeft, setQrTimeLeft] = useState(0);

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
    } catch {
      setQrError("Não foi possível gerar o QR seguro agora.");
      setQrState("error");
    }
  };

  // Refs para os cards off-screen usados exclusivamente pelo gerador de PDF
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  const issueDate  = format(new Date(), "dd/MM/yyyy", { locale: ptBR });
  const validUntil = format(new Date(new Date().setFullYear(new Date().getFullYear() + 1)), "dd/MM/yyyy", { locale: ptBR });
  // Código informado pela igreja (migrado do sistema antigo) tem prioridade;
  // sem ele, mantém a matrícula técnica gerada a partir do id — ver DEC-001
  // / migration 20260717190000_members_add_member_code.sql.
  const code           = member.member_code?.trim() || memberCode(member.id);

  const qrValue = qrState === "ready" && qrToken
    ? `${window.location.origin}/admin/porteiro?token=${encodeURIComponent(qrToken)}`
    : "";

  const pdfQrPlaceholder = "QR Code seguro disponível apenas na carteira digital.";
  const roleLabel      = ROLE_LABEL[member.member_role ?? ""] ?? member.member_role ?? "Membro";

  const shareText = [
    `📋 CARTEIRA DE MEMBRO`,
    ``,
    `Nome: ${member.full_name}`,
    `Igreja: ${churchName}${churchCity ? ` · ${churchCity}${churchState ? `/${churchState}` : ""}` : ""}`,
    `Função: ${roleLabel}`,
    member.administrative_role && member.administrative_role !== "Nenhum" ? `Cargo: ${member.administrative_role}` : null,
    member.congregation ? `Congregação: ${member.congregation}` : null,
    `Matrícula: Nº ${code}`,
    `Situação: ${member.status || "Ativa"}`,
    ``,
    `Documento emitido pela igreja via Ecclesia Online.`,
  ].filter(Boolean).join("\n");

  // ── Geração de PDF real (html2canvas + jsPDF) ─────────────────────────────

  const fileName = `CarteiraMembro-${member.full_name.replace(/\s+/g, "-")}.pdf`;

  /** Renderiza frente + verso e devolve um Blob PDF sem salvar no disco. */
  const generateWalletPdfBlob = async (): Promise<{ blob: Blob; fileName: string } | null> => {
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const frontEl = document.getElementById("wallet-pdf-front");
      const backEl  = document.getElementById("wallet-pdf-back");
      if (!frontEl || !backEl) throw new Error("Elementos do cartão não encontrados");

      const captureOpts = { scale: 3, useCORS: true, allowTaint: true, backgroundColor: null, logging: false };
      const frontCanvas = await html2canvas(frontEl, captureOpts);
      const backCanvas  = await html2canvas(backEl,  captureOpts);

      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [85, 54] });
      pdf.addImage(frontCanvas.toDataURL("image/jpeg", 0.97), "JPEG", 0, 0, 85, 54);
      pdf.addPage([85, 54], "landscape");
      pdf.addImage(backCanvas.toDataURL("image/jpeg", 0.97), "JPEG", 0, 0, 85, 54);

      return { blob: pdf.output("blob"), fileName };
    } catch (err) {
      console.error("[MemberWalletCard] Erro ao gerar PDF blob:", err);
      return null;
    }
  };

  const handleGeneratePdf = async () => {
    setGeneratingPdf(true);
    try {
      const result = await generateWalletPdfBlob();
      if (!result) { window.print(); return; }
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

  const cardProps = { member, churchName, churchCity, churchState, churchLogoUrl, code, issueDate, validUntil, qrValue };

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="text-center">
        <p className="text-sm font-semibold">Carteira de Membro</p>
        <p className="text-xs text-muted-foreground">{member.full_name}</p>
      </div>

      {/* Card visível (frente ou verso) */}
      <div className="w-full max-w-xs">
        {showBack
          ? <CardBack id="wallet-card-back"  {...{ member, churchName }} />
          : <CardFront id="wallet-card-front" {...cardProps} />}
      </div>

      {/* Dynamic QR controls */}
      <div className="flex flex-col items-center gap-2 w-full max-w-xs">
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
          <CardFront id="wallet-pdf-front" {...cardProps} qrValue="" pdfQrPlaceholder={pdfQrPlaceholder} />
        </div>
        <CardBack id="wallet-pdf-back" {...{ member, churchName }} />
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
        onGeneratingChange={setGeneratingPdf}
      />

      {generatingPdf && (
        <p className="text-xs text-muted-foreground animate-pulse">Gerando PDF da carteira...</p>
      )}

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-muted-foreground hover:text-foreground px-4 py-1.5 rounded-lg hover:bg-secondary transition-colors"
        >
          Fechar
        </button>
      )}

      <p className="text-[11px] text-muted-foreground text-center max-w-xs">
        Documento institucional · Válido mediante verificação de cadastro ativo
      </p>
    </div>
  );
}
