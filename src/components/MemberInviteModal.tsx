/**
 * Post-save invite modal.
 * Shown after creating a new member with a registered WhatsApp number.
 * Sends the invite link and access code as two separate manual messages.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { X, MessageCircle, Copy, Clock, CheckCircle2, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  createMemberInvite,
  generateManualMemberInviteOtp,
  revokeMemberInvites,
  buildInviteUrl,
  buildWhatsappLink,
  buildWhatsappCodeLink,
  type InviteRecord,
} from "@/lib/memberInvites";
import { useLanguage } from "@/hooks/useLanguage";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open:           boolean;
  onClose:        () => void;
  memberId:       string;
  memberName:     string;
  organizationId: string;
  churchName:     string;
  sectorId?:      string | null;
  congregationId?: string | null;
  invitedBy?:     string;
  /** WhatsApp do membro (raw, será normalizado ao abrir o aplicativo). */
  whatsapp?:      string | null;
  /** Mantido somente para compatibilidade com chamadas antigas do componente. */
  email?:         string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MemberInviteModal({
  open, onClose,
  memberId, memberName, organizationId, churchName,
  sectorId, congregationId, invitedBy,
  whatsapp,
}: Props) {
  const { t, lang } = useLanguage();
  const [invite, setInvite]     = useState<InviteRecord | null>(null);
  const [loading, setLoading]   = useState(false);
  const [openingCode, setOpeningCode] = useState(false);
  const [linkPrepared, setLinkPrepared] = useState(false);
  const [copied, setCopied]     = useState(false);
  const generationInFlightRef = useRef(false);
  const hasWhatsapp = Boolean(whatsapp?.trim());

  const generate = useCallback(async () => {
    if (generationInFlightRef.current) return;
    generationInFlightRef.current = true;
    setLoading(true);
    try {
      const { data, error } = await createMemberInvite({
        memberId,
        organizationId,
        sectorId:       sectorId ?? null,
        congregationId: congregationId ?? null,
        invitedBy,
        role: "member",
      });
      if (error || !data) {
        toast.error(t("Erro ao gerar convite"), { description: error ?? t("Tente novamente") });
        return;
      }
      setInvite(data);
    } finally {
      setLoading(false);
      generationInFlightRef.current = false;
    }
  }, [memberId, organizationId, sectorId, congregationId, invitedBy, t]);

  useEffect(() => {
    // Criar o registro não envia mensagem. O código só nasce depois do clique
    // explícito na segunda ação, após o link ter sido preparado.
    if (open && !invite && hasWhatsapp) generate();
  }, [open, invite, hasWhatsapp, generate]);

  const inviteUrl = invite ? buildInviteUrl(invite.token) : "";

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setLinkPrepared(true);
      toast.success(t("Link copiado!"));
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error(t("Não foi possível copiar. Copie manualmente."), { description: inviteUrl });
    }
  };

  const handleWhatsappLink = () => {
    if (!invite || !whatsapp) return;
    const waLink = buildWhatsappLink(whatsapp, memberName, churchName, inviteUrl);
    window.open(waLink, "_blank", "noopener,noreferrer");
    setLinkPrepared(true);
    toast.success(t("Primeira mensagem preparada"), {
      description: t("Envie o link e depois volte para preparar o código separado."),
    });
  };

  const handleWhatsappCode = async () => {
    if (!invite || !whatsapp || !linkPrepared || openingCode) return;
    setOpeningCode(true);
    try {
      const otp = await generateManualMemberInviteOtp(invite.id);
      if (!otp.ok || !otp.code) {
        toast.error(t("Não foi possível preparar o código de acesso"), {
          description: otp.error ?? t("Tente novamente"),
        });
        return;
      }
      const waLink = buildWhatsappCodeLink(whatsapp, memberName, otp.code);
      window.open(waLink, "_blank", "noopener,noreferrer");
      toast.success(t("Segunda mensagem preparada"), {
        description: t("Revise e envie o código separado no WhatsApp Business."),
      });
    } finally {
      setOpeningCode(false);
    }
  };

  const handleRegenerate = async () => {
    await revokeMemberInvites(memberId);
    setLinkPrepared(false);
    setInvite(null);
    await generate();
  };

  const handleDoLater = () => {
    onClose();
  };

  const dateLocale = lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "pt-BR";
  const expiresLabel = invite
    ? new Date(invite.expires_at).toLocaleDateString(dateLocale, {
        day:   "2-digit",
        month: "long",
        year:  "numeric",
      })
    : "";

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-border/50">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <CheckCircle2 size={18} className="text-emerald-500" />
              <DialogTitle className="font-serif text-base font-semibold">
                {t("Membro cadastrado com sucesso")}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              {t("Envie o link de ativação para que o membro crie o acesso ao aplicativo.")}
            </DialogDescription>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-secondary transition-colors mt-0.5"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">

          {/* Blocked: member has no registered WhatsApp */}
          {!hasWhatsapp && (
            <div className="flex flex-col items-center text-center gap-2 py-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-4">
              <AlertTriangle size={22} className="text-amber-600 dark:text-amber-400" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                {t("Cadastre o WhatsApp deste membro antes de preparar o acesso.")}
              </p>
            </div>
          )}

          {/* Loading state */}
          {hasWhatsapp && loading && (
            <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">{t("Gerando convite...")}</span>
            </div>
          )}

          {/* Invite ready */}
          {hasWhatsapp && !loading && invite && (
            <>
              {/* Link preview */}
              <div className="bg-muted/40 rounded-lg px-3 py-2.5">
                <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide font-medium">{t("Link de convite")}</p>
                <p className="text-xs text-foreground break-all leading-relaxed">{inviteUrl}</p>
              </div>

              {/* Expiry */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock size={13} />
                <span>{t("Válido até")} {expiresLabel}</span>
                <button
                  onClick={handleRegenerate}
                  className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <RefreshCw size={11} /> {t("Regenerar")}
                </button>
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-1">
                <button
                  onClick={handleWhatsappLink}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#25D366] text-white rounded-lg text-sm font-medium hover:bg-[#1ebe5b] disabled:opacity-60 transition-colors"
                >
                  <MessageCircle size={16} />
                  {t("1. Enviar link pelo WhatsApp")}
                </button>

                <button
                  onClick={handleWhatsappCode}
                  disabled={!linkPrepared || openingCode}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-secondary text-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 disabled:opacity-50 transition-colors"
                >
                  {openingCode
                    ? <Loader2 size={16} className="animate-spin" />
                    : <MessageCircle size={16} />}
                  {openingCode
                    ? t("Preparando código...")
                    : t("2. Enviar código pelo WhatsApp")}
                </button>
                <p className="text-[11px] text-center text-muted-foreground">
                  {t("Envie primeiro o link. Depois envie o código em uma segunda mensagem.")}
                </p>

                <button
                  onClick={handleCopy}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-secondary text-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
                >
                  {copied
                    ? <><CheckCircle2 size={15} className="text-emerald-500" /> {t("Link copiado!")}</>
                    : <><Copy size={15} /> {t("Copiar link")}</>
                  }
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <button
            onClick={handleDoLater}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-1.5"
          >
            {t("Fazer depois")}
          </button>
        </div>

      </DialogContent>
    </Dialog>
  );
}
