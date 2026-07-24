/**
 * LoginOtpTeste — tela administrativa protegida (capability
 * `member_login.otp_test`) para gerar um código de teste do login por
 * telefone/WhatsApp (PARTE D). Gera UM desafio por vez, para UM membro,
 * revelado apenas nesta tela — nunca persistido em texto puro, nunca
 * registrado em log (ver supabase/migrations/
 * 20260802110000_member_login_otp_admin_test.sql).
 *
 * Este é o único caminho funcional de teste nesta operação: não existe
 * disparo automático de WhatsApp/SMS. O administrador informa o código ao
 * membro por fora deste sistema (pessoalmente, por exemplo) e o membro
 * digita o código na tela de login (`/login`, aba "Entrar com telefone").
 */
import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { useChurch } from "@/hooks/useChurchContext";
import { supabase } from "@/integrations/supabase/client";
import { adminGenerateManualTestOtp } from "@/lib/memberLoginOtp";
import { toast } from "@/hooks/use-toast";
import { Search, KeyRound, Copy, Loader2, ShieldAlert, Clock } from "lucide-react";

interface MemberSearchResult {
  id: string;
  full_name: string;
  phone: string | null;
  whatsapp: string | null;
}

function useCountdown(expiresAt: string | null): number {
  const [secondsLeft, setSecondsLeft] = useState(0);
  useEffect(() => {
    if (!expiresAt) {
      setSecondsLeft(0);
      return;
    }
    const target = new Date(expiresAt).getTime();
    const tick = () => setSecondsLeft(Math.max(0, Math.round((target - Date.now()) / 1000)));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [expiresAt]);
  return secondsLeft;
}

export default function LoginOtpTeste() {
  const { church } = useChurch();
  const orgId = church?.id ?? "";

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<MemberSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<MemberSearchResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [revealed, setRevealed] = useState<{ code: string; phone: string; expiresAt: string; memberName: string } | null>(null);

  const secondsLeft = useCountdown(revealed?.expiresAt ?? null);

  useEffect(() => {
    if (!orgId || search.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timeout = window.setTimeout(async () => {
      const { data, error } = await supabase
        .from("members")
        .select("id, full_name, phone, whatsapp")
        .eq("organization_id", orgId)
        .ilike("full_name", `%${search.trim()}%`)
        .order("full_name")
        .limit(10);
      if (!cancelled) {
        setSearching(false);
        if (!error && data) setResults(data as MemberSearchResult[]);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [search, orgId]);

  const handleGenerate = async (member: MemberSearchResult) => {
    setSelected(member);
    setGenerating(true);
    setRevealed(null);
    const result = await adminGenerateManualTestOtp(member.id);
    setGenerating(false);
    if (!result.ok) {
      const messages: Record<string, string> = {
        permission_denied: "Você não tem permissão para gerar códigos de teste.",
        manual_test_disabled: "O modo de teste manual não está ativo neste ambiente.",
        member_missing_phone: "Este membro não possui telefone/WhatsApp cadastrado.",
        member_not_found: "Membro não encontrado.",
        not_authenticated: "Sessão expirada. Entre novamente.",
      };
      toast({
        title: "Não foi possível gerar o código",
        description: messages[result.error] ?? result.error,
        variant: "destructive",
      });
      return;
    }
    setRevealed({
      code: result.code,
      phone: result.phoneNormalized,
      expiresAt: result.expiresAt,
      memberName: result.memberName ?? member.full_name,
    });
  };

  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-xl font-serif tracking-tight flex items-center gap-2">
            <KeyRound size={20} className="text-accent" /> Teste de entrada por telefone
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gere um código de teste para UM membro por vez. O código expira em poucos minutos,
            nunca é salvo em texto simples e cada geração fica registrada na auditoria.
          </p>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-3 flex gap-2 text-xs text-amber-800 dark:text-amber-300">
          <ShieldAlert size={16} className="shrink-0 mt-0.5" />
          <p>
            Este código só pode ser usado uma vez e apenas para o telefone deste membro. Informe-o
            pessoalmente — nunca por um canal que outra pessoa possa ver.
          </p>
        </div>

        <div className="bg-card rounded-xl shadow-sm border border-border p-4 space-y-3">
          <label htmlFor="otp-member-search" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Buscar membro pelo nome
          </label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              id="otp-member-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Digite ao menos 2 letras do nome"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>

          {searching && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Buscando…</p>
          )}

          {!searching && search.trim().length >= 2 && results.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum membro encontrado com esse nome nesta igreja.</p>
          )}

          <ul className="divide-y divide-border">
            {results.map((member) => {
              const phone = member.whatsapp || member.phone;
              return (
                <li key={member.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{member.full_name}</p>
                    <p className="text-xs text-muted-foreground">{phone || "Sem telefone cadastrado"}</p>
                  </div>
                  <button
                    type="button"
                    disabled={!phone || generating}
                    onClick={() => handleGenerate(member)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-1.5"
                  >
                    {generating && selected?.id === member.id && <Loader2 size={12} className="animate-spin" />}
                    Gerar código
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {revealed && (
          <div className="bg-card rounded-xl shadow-sm border border-accent/40 p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Código para {revealed.memberName} ({revealed.phone})
            </p>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-mono tracking-[0.4em] font-semibold">{revealed.code}</span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(revealed.code);
                  toast({ title: "Código copiado" });
                }}
                className="p-2 rounded-lg border border-border hover:bg-secondary transition-colors"
                aria-label="Copiar código"
              >
                <Copy size={16} />
              </button>
            </div>
            <p className={`text-xs flex items-center gap-1.5 ${secondsLeft <= 0 ? "text-destructive" : "text-muted-foreground"}`}>
              <Clock size={12} />
              {secondsLeft > 0
                ? `Expira em ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`
                : "Este código expirou — gere um novo."}
            </p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
