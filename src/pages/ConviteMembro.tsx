/**
 * Ativação pública do acesso de membro.
 *
 * A Secretaria gera o convite e, somente após um clique explícito, abre o
 * WhatsApp Business com link + código temporário preenchidos. Esta tela não
 * envia SMS, WhatsApp ou e-mail: ela apenas confirma token, telefone e código.
 * A sessão final continua sendo criada pelo fluxo oficial do Supabase Auth.
 */
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CheckCircle2,
  Church,
  KeyRound,
  Loader2,
  MapPin,
  Phone,
  ShieldCheck,
  User,
  XCircle,
} from "lucide-react";
import {
  acceptMemberInvite,
  getInviteByToken,
  verifyManualMemberInviteOtp,
  type MemberInvitePublic,
} from "@/lib/memberInvites";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useLanguage } from "@/hooks/useLanguage";

type Step = "loading" | "form" | "verifying" | "done" | "error";

const INVITE_ERRORS: Record<string, string> = {
  invalid_token: "Link de convite inválido.",
  not_found: "Convite não encontrado.",
  already_accepted: "Este convite já foi utilizado.",
  revoked: "Este convite foi revogado.",
  expired: "Este convite expirou. Solicite um novo à secretaria.",
  invalid_invite: "Convite inválido.",
  invalid_shape: "Resposta inválida ao verificar o convite.",
  http_error: "Não foi possível verificar este convite agora.",
  timeout: "A verificação demorou muito. Tente novamente.",
  network_error: "Falha de conexão. Confira sua internet e tente novamente.",
};

const OTP_ERRORS: Record<string, string> = {
  missing_phone_or_code: "Informe o número de WhatsApp e o código de seis dígitos.",
  invalid_arguments: "Confira o número e o código informados.",
  invite_not_found: "Convite não encontrado.",
  invite_not_pending: "Este convite expirou ou já foi utilizado.",
  phone_mismatch: "Este número não corresponde ao telefone ou WhatsApp cadastrado.",
  no_active_challenge: "Não existe um código ativo. Peça um novo código à secretaria.",
  challenge_expired: "O código expirou. Peça um novo código à secretaria.",
  max_attempts_exceeded: "O limite de tentativas foi atingido. Peça um novo código.",
  invalid_code: "Código incorreto. Confira os seis dígitos e tente novamente.",
  verification_failed: "Não foi possível verificar o código agora.",
  session_bridge_failed: "Não foi possível criar sua sessão agora.",
  session_verification_failed: "Não foi possível confirmar sua sessão agora.",
  linked_account_unavailable: "O acesso já vinculado está indisponível. Procure a secretaria.",
  member_already_linked: "Este cadastro já está vinculado a outra conta.",
  existing_org_access: "Esta conta já possui outro acesso nesta igreja.",
  network_error: "Falha de conexão. Confira sua internet e tente novamente.",
};

const ACCEPT_ERRORS: Record<string, string> = {
  not_authenticated: "Sua sessão expirou. Tente confirmar o código novamente.",
  user_mismatch: "A sessão confirmada não corresponde ao convite.",
  invite_not_found: "Convite não encontrado.",
  invite_not_pending: "Este convite já foi utilizado ou não está mais disponível.",
  invite_expired: "Este convite expirou. Solicite um novo à secretaria.",
  organization_mismatch: "O convite está inconsistente. Solicite um novo à secretaria.",
  member_not_found: "Membro não encontrado.",
  member_already_linked: "Este membro já está vinculado a outra conta.",
  existing_org_access: "Esta conta já possui outro acesso nesta igreja.",
  rpc_error: "Não foi possível concluir a ativação agora.",
  empty_response: "Não foi possível concluir a ativação agora.",
};

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export default function ConviteMembro() {
  const { token = "" } = useParams<{ token: string }>();
  const { t } = useLanguage();
  const [step, setStep] = useState<Step>("loading");
  const [invite, setInvite] = useState<MemberInvitePublic | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getInviteByToken(token).then(({ data, error: loadError }) => {
      if (cancelled) return;
      if (!data || loadError) {
        setError(t(INVITE_ERRORS[loadError ?? ""] ?? "Convite inválido."));
        setStep("error");
        return;
      }
      setInvite(data);
      setStep("form");
    }).catch(() => {
      if (!cancelled) {
        setError(t(INVITE_ERRORS.network_error));
        setStep("error");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  const handlePhoneChange = (value: string) => {
    setPhone(digitsOnly(value).slice(0, 13));
  };

  const handleCodeChange = (value: string) => {
    setCode(digitsOnly(value).slice(0, 6));
  };

  const handleActivate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (step === "verifying") return;
    if (phone.length < 10 || code.length !== 6) {
      setError(t("Informe um telefone válido e o código completo de seis dígitos."));
      return;
    }

    setStep("verifying");
    setError("");
    const verified = await verifyManualMemberInviteOtp(token, phone, code);
    if (!verified.ok || !verified.userId) {
      setError(t(OTP_ERRORS[verified.error ?? ""] ?? verified.message ?? "Não foi possível confirmar o código."));
      setStep("form");
      return;
    }

    const accepted = await acceptMemberInvite(token, verified.userId);
    if (!accepted.success) {
      setError(t(ACCEPT_ERRORS[accepted.error ?? ""] ?? accepted.message ?? "Não foi possível ativar o acesso."));
      setStep("form");
      return;
    }

    setStep("done");
    window.setTimeout(() => {
      window.location.href = "/admin";
    }, 1200);
  };

  const Header = () => (
    <header className="flex items-center justify-between px-5 sm:px-8 py-4 border-b border-border/40">
      <Link to="/" className="flex items-center gap-2">
        <Church size={20} className="text-primary" />
        <span className="font-serif font-semibold">{t("Ecclesia Online")}</span>
      </Link>
      <ThemeToggle />
    </header>
  );

  if (step === "loading" || step === "verifying") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <main className="flex-1 grid place-items-center px-4">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 size={22} className="animate-spin" />
            <span className="text-sm">
              {step === "loading" ? t("Verificando convite...") : t("Ativando seu acesso...")}
            </span>
          </div>
        </main>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <main className="flex-1 grid place-items-center px-4">
          <div className="max-w-sm text-center space-y-4">
            <XCircle size={50} className="text-destructive mx-auto" />
            <h1 className="font-serif text-xl font-semibold">{t("Convite inválido")}</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Link to="/login" className="inline-block text-sm text-primary hover:underline">
              {t("Ir para o login")}
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <main className="flex-1 grid place-items-center px-4">
          <div className="max-w-sm text-center space-y-4">
            <CheckCircle2 size={54} className="text-emerald-500 mx-auto" />
            <h1 className="font-serif text-2xl font-semibold">{t("Acesso ativado!")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("Bem-vindo(a),")} <strong>{invite?.member_name}</strong>.
            </p>
            <p className="text-xs text-muted-foreground">{t("Entrando no aplicativo...")}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <section className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
          <div className="px-6 py-5 border-b border-border/50 bg-primary/[0.04]">
            <div className="flex items-center gap-3">
              {invite?.member_photo ? (
                <img
                  src={invite.member_photo}
                  alt=""
                  className="w-14 h-14 rounded-full object-cover ring-2 ring-primary/20"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-primary/10 grid place-items-center">
                  <User size={24} className="text-primary" />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="font-serif text-lg font-semibold truncate">{invite?.member_name}</h1>
                <p className="text-sm text-muted-foreground">{invite?.member_role || t("Membro")}</p>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">
            <div className="rounded-xl bg-muted/45 px-4 py-3 space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Church size={14} className="text-primary" />
                <span>{invite?.church_name}</span>
              </div>
              {(invite?.church_city || invite?.church_state) && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin size={12} />
                  <span>{[invite?.church_city, invite?.church_state].filter(Boolean).join(" — ")}</span>
                </div>
              )}
            </div>

            <div className="text-center space-y-1">
              <ShieldCheck size={28} className="text-emerald-500 mx-auto" />
              <h2 className="font-semibold">{t("Confirme seu acesso")}</h2>
              <p className="text-xs text-muted-foreground">
                {t("Digite o mesmo número cadastrado e o código recebido da Secretaria.")}
              </p>
            </div>

            <form onSubmit={handleActivate} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium">{t("WhatsApp ou telefone")}</span>
                <div className="relative">
                  <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) => handlePhoneChange(event.target.value)}
                    placeholder="DDD + número"
                    className="w-full h-11 rounded-lg border border-input bg-background pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium">{t("Código de acesso")}</span>
                <div className="relative">
                  <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) => handleCodeChange(event.target.value)}
                    placeholder="000000"
                    className="w-full h-12 rounded-lg border border-input bg-background pl-10 pr-3 text-center font-mono text-xl tracking-[0.35em] outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </label>

              {error && (
                <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="w-full h-11 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                {t("Ativar meu acesso")}
              </button>
            </form>

            <p className="text-[11px] leading-relaxed text-center text-muted-foreground">
              {t("O código é pessoal, temporário e só pode ser usado uma vez.")}
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
