import { QRCodeSVG } from "qrcode.react";
import { Shield, Printer } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export type WalletMember = {
  id: string;
  full_name: string;
  member_role: string | null;
  status: string;
  phone: string | null;
  email: string | null;
  joined_at: string | null;
};

type Props = {
  member: WalletMember;
  churchName: string;
  onClose?: () => void;
};

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  Ativo:        { label: "ATIVO",        cls: "bg-emerald-600 text-white" },
  Inativo:      { label: "INATIVO",      cls: "bg-slate-500 text-white" },
  Visitante:    { label: "VISITANTE",    cls: "bg-amber-500 text-white" },
  Transferido:  { label: "TRANSFERIDO",  cls: "bg-blue-600 text-white" },
  Disciplinado: { label: "DISCIPLINADO", cls: "bg-red-700 text-white" },
  Falecido:     { label: "IN MEMORIAM",  cls: "bg-slate-700 text-white" },
};

function memberInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function memberCode(id: string) {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export function MemberWalletCard({ member, churchName, onClose }: Props) {
  const statusInfo = STATUS_STYLE[member.status] ?? STATUS_STYLE.Ativo;
  const issueDate = format(new Date(), "dd/MM/yyyy", { locale: ptBR });
  const validUntil = format(
    new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
    "dd/MM/yyyy",
    { locale: ptBR },
  );
  const code = memberCode(member.id);
  const qrValue = `${window.location.origin}/admin/membros?code=${member.id}`;

  const handlePrint = () => window.print();

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      {/* Card */}
      <div
        id="wallet-card"
        className="relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl select-none"
        style={{ aspectRatio: "1.586" }}
      >
        {/* Fundo degradê institucional */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950" />
        {/* Detalhe decorativo */}
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-blue-600/20 -translate-y-1/2 translate-x-1/2 blur-2xl" />
        <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-emerald-600/15 translate-y-1/2 -translate-x-1/2 blur-2xl" />

        <div className="relative z-10 h-full p-4 flex flex-col justify-between">
          {/* Topo */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <Shield size={10} className="text-blue-300" />
                <span className="text-[8px] font-bold tracking-[0.2em] text-blue-200 uppercase">
                  Ecclesia
                </span>
              </div>
              <p className="text-[10px] text-slate-300 leading-tight max-w-[60%] line-clamp-2">
                {churchName}
              </p>
            </div>
            <span
              className={cn(
                "text-[8px] font-bold tracking-wider px-2 py-0.5 rounded-full uppercase",
                statusInfo.cls,
              )}
            >
              {statusInfo.label}
            </span>
          </div>

          {/* Corpo */}
          <div className="flex items-end justify-between gap-3">
            <div className="flex items-end gap-3">
              {/* Avatar */}
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-lg shadow-lg flex-shrink-0">
                {memberInitials(member.full_name)}
              </div>

              {/* Info */}
              <div className="pb-0.5">
                <p className="text-white font-bold text-sm leading-tight">
                  {member.full_name}
                </p>
                <p className="text-slate-300 text-[9px] mt-0.5">
                  {member.member_role ?? "Membro"}
                </p>
                <p className="text-slate-400 text-[8px] mt-1 font-mono tracking-widest">
                  Nº {code}
                </p>
              </div>
            </div>

            {/* QR Code */}
            <div className="bg-white rounded-lg p-1 flex-shrink-0 shadow">
              <QRCodeSVG value={qrValue} size={48} level="M" />
            </div>
          </div>

          {/* Rodapé */}
          <div className="flex items-center justify-between border-t border-slate-700/60 pt-1.5">
            <div className="space-y-0.5">
              <p className="text-[7px] text-slate-500 uppercase tracking-wide">Membro desde</p>
              <p className="text-[9px] text-slate-300 font-mono">
                {member.joined_at
                  ? format(new Date(member.joined_at), "dd/MM/yyyy")
                  : "—"}
              </p>
            </div>
            <div className="space-y-0.5 text-right">
              <p className="text-[7px] text-slate-500 uppercase tracking-wide">Emissão</p>
              <p className="text-[9px] text-slate-300 font-mono">{issueDate}</p>
            </div>
            <div className="space-y-0.5 text-right">
              <p className="text-[7px] text-slate-500 uppercase tracking-wide">Validade</p>
              <p className="text-[9px] text-slate-300 font-mono">{validUntil}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Ações */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-sm font-medium transition-colors"
        >
          <Printer size={14} />
          Imprimir
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors"
          >
            Fechar
          </button>
        )}
      </div>

      {/* Info abaixo */}
      <p className="text-[11px] text-muted-foreground text-center max-w-xs">
        Documento institucional Ecclesia · Válido mediante verificação de cadastro ativo
      </p>
    </div>
  );
}
