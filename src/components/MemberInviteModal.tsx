/**
 * Post-save invite modal.
 * Shown after creating a new member when they have a phone/whatsapp number.
 * Generates an invite token and offers WhatsApp + copy-link options.
 */
import { useState, useEffect, useCallback } from "react";
import { X, MessageCircle, Copy, Clock, CheckCircle2, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  createMemberInvite,
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
  /**
   * Registered e-mail of the member — required to generate the digital invite.
   * The invite binds the Auth account to this fixed e-mail, so without it the
   * invite cannot be created.
   */
  email?:         string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MemberInviteModal({
  open, onClose,
  memberId, memberName, organizationId, churchName,
  sectorId, congregationId, invitedBy,
  phone, email,
}: Props) {
  const { t, lang } = useLanguage();
  const [invite, setInvite]     = useState<InviteRecord | null>(null);
  const [loading, setLoading]   = useState(false);
  const [copied, setCopied]     = useState(false);

  const hasEmail = !!email && email.trim().length > 0;

  const generate = useCallback(async () => {
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
    }
  }, [memberId, organizationId, sectorId, congregationId, invitedBy]);

  useEffect(() => {
    // The invite binds the Auth account to the member's registered e-mail —
    // without an e-mail there is nothing to bind, so we never generate it.
    if (open && !invite && hasEmail) generate();
  }, [open, invite, hasEmail, generate]);

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

  const handleWhatsApp = () => {
    if (!invite || !phone) return;
    const waLink = buildWhatsappLink(phone, memberName, churchName, inviteUrl);
    window.open(waLink, "_blank", "noopener,noreferrer");
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
              <h2 className="font-serif text-base font-semibold">{t("Membro cadastrado com sucesso")}</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("Envie o link de ativação para que o membro crie o acesso ao aplicativo.")}
            </p>
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

          {/* Blocked: member has no registered e-mail */}
          {!hasEmail && (
            <div className="flex flex-col items-center text-center gap-2 py-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-4">
              <AlertTriangle size={22} className="text-amber-600 dark:text-amber-400" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                {t("Cadastre um e-mail para este membro antes de enviar o convite digital.")}
              </p>
            </div>
          )}

          {/* Loading state */}
          {hasEmail && loading && (
            <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">{t("Gerando convite...")}</span>
            </div>
          )}

          {/* Invite ready */}
          {hasEmail && !loading && invite && (
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
                {phone ? (
                  <button
                    onClick={handleWhatsApp}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#25D366] text-white rounded-lg text-sm font-medium hover:bg-[#1ebe5b] transition-colors"
                  >
                    <MessageCircle size={16} />
                    {t("Enviar pelo WhatsApp")}
                  </button>
                ) : (
                  <p className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-center">
                    {t("Este membro não possui telefone cadastrado. Copie o link e envie manualmente.")}
                  </p>
                )}

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
