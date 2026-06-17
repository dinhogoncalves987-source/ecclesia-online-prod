/**
 * Post-save invite modal.
 * Shown after creating a new member when they have a phone/whatsapp number.
 * Generates an invite token and offers WhatsApp + copy-link options.
 */
import { useState, useEffect, useCallback } from "react";
import { X, MessageCircle, Copy, Clock, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  createMemberInvite,
  revokeMemberInvites,
  buildInviteUrl,
  buildWhatsappLink,
  type InviteRecord,
} from "@/lib/memberInvites";

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
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MemberInviteModal({
  open, onClose,
  memberId, memberName, organizationId, churchName,
  sectorId, congregationId, invitedBy,
  phone,
}: Props) {
  const [invite, setInvite]     = useState<InviteRecord | null>(null);
  const [loading, setLoading]   = useState(false);
  const [copied, setCopied]     = useState(false);

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
        toast.error("Erro ao gerar convite", { description: error ?? "Tente novamente" });
        return;
      }
      setInvite(data);
    } finally {
      setLoading(false);
    }
  }, [memberId, organizationId, sectorId, congregationId, invitedBy]);

  useEffect(() => {
    if (open && !invite) generate();
  }, [open, invite, generate]);

  const inviteUrl = invite ? buildInviteUrl(invite.token) : "";

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast.success("Link copiado!");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Não foi possível copiar. Copie manualmente.", { description: inviteUrl });
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

  const expiresLabel = invite
    ? new Date(invite.expires_at).toLocaleDateString("pt-BR", {
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
              <h2 className="font-serif text-base font-semibold">Membro cadastrado!</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Envie o link de convite para <span className="font-medium text-foreground">{memberName}</span> ativar o acesso.
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

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">Gerando convite...</span>
            </div>
          )}

          {/* Invite ready */}
          {!loading && invite && (
            <>
              {/* Link preview */}
              <div className="bg-muted/40 rounded-lg px-3 py-2.5">
                <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide font-medium">Link de convite</p>
                <p className="text-xs text-foreground break-all leading-relaxed">{inviteUrl}</p>
              </div>

              {/* Expiry */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock size={13} />
                <span>Válido até {expiresLabel}</span>
                <button
                  onClick={handleRegenerate}
                  className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <RefreshCw size={11} /> Regenerar
                </button>
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-1">
                {phone && (
                  <button
                    onClick={handleWhatsApp}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#25D366] text-white rounded-lg text-sm font-medium hover:bg-[#1ebe5b] transition-colors"
                  >
                    <MessageCircle size={16} />
                    Enviar convite pelo WhatsApp
                  </button>
                )}

                <button
                  onClick={handleCopy}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-secondary text-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
                >
                  {copied
                    ? <><CheckCircle2 size={15} className="text-emerald-500" /> Link copiado!</>
                    : <><Copy size={15} /> Copiar link de convite</>
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
            Fazer depois
          </button>
        </div>

      </DialogContent>
    </Dialog>
  );
}
