/**
 * Post-save invite modal.
 * Shown after creating a new member when they have a phone/whatsapp number.
 * Generates an invite token and offers WhatsApp + copy-link options.
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
  /** Phone OR WhatsApp number (raw, will be sanitised). */
  phone?:         string | null;
  /** Mantido somente para compatibilidade com chamadas antigas do componente. */
  email?:         string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MemberInviteModal({
  open, onClose,
  memberId, memberName, organizationId, churchName,
  sectorId, congregationId, invitedBy,
  phone,
}: Props) {
  const { t, lang } = useLanguage();
  const [invite, setInvite]     = useState<InviteRecord | null>(null);
  const [loading, setLoading]   = useState(false);
  const [openingWhatsapp, setOpeningWhatsapp] = useState(false);
  const [copied, setCopied]     = useState(false);
  const generationInFlightRef = useRef(false);
  const hasPhone = Boolean(phone?.trim());

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
    // explícito em "Preparar no WhatsApp Business".
    if (open && !invite && hasPhone) generate();
  }, [open, invite, hasPhone, generate]);

  const inviteUrl = invite ? buildInviteUrl(invite.token) : "";

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast.success(t("Link copiado!"));
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error(t("Não foi possível copiar. Copie manualmente."), { description: inviteUrl });
    }
  };

  const handleWhatsApp = async () => {
    if (!invite || !phone || openingWhatsapp) return;
    setOpeningWhatsapp(true);
    try {
      const otp = await generateManualMemberInviteOtp(invite.id);
      if (!otp.ok || !otp.code) {
        toast.error(t("Não foi possível preparar o código de acesso"), {
          description: otp.error ?? t("Tente novamente"),
        });
        return;
      }
      const waLink = buildWhatsappLink(phone, memberName, churchName, inviteUrl, otp.code);
      window.open(waLink, "_blank", "noopener,noreferrer");
      toast.success(t("Mensagem preparada"), {
        description: t("Revise e confirme o envio no WhatsApp Business."),
      });
    } finally {
      setOpeningWhatsapp(false);
    }
  };

  const handleRegenerate = async () => {
    await revokeMemberInvites(memberId);
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

          {/* Blocked: member has no registered WhatsApp/phone */}
          {!hasPhone && (
            <div className="flex flex-col items-center text-center gap-2 py-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-4">
              <AlertTriangle size={22} className="text-amber-600 dark:text-amber-400" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                {t("Cadastre o WhatsApp ou telefone deste membro antes de preparar o acesso.")}
              </p>
            </div>
          )}

          {/* Loading state */}
          {hasPhone && loading && (
            <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">{t("Gerando convite...")}</span>
            </div>
          )}

          {/* Invite ready */}
          {hasPhone && !loading && invite && (
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
                  onClick={handleWhatsApp}
                  disabled={openingWhatsapp}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#25D366] text-white rounded-lg text-sm font-medium hover:bg-[#1ebe5b] disabled:opacity-60 transition-colors"
                >
                  {openingWhatsapp
                    ? <Loader2 size={16} className="animate-spin" />
                    : <MessageCircle size={16} />}
                  {openingWhatsapp
                    ? t("Preparando código...")
                    : t("Preparar no WhatsApp Business")}
                </button>
                <p className="text-[11px] text-center text-muted-foreground">
                  {t("Nada é enviado automaticamente. Você revisa e confirma no WhatsApp.")}
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
