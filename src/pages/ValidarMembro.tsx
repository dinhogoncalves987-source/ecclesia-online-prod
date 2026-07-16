/**
 * ValidarMembro — página pública de verificação da Carteira de Membro.
 * Acessada pelo QR Code impresso na carteira.
 * URL: /validar-membro/:id
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Loader2, Shield, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useLanguage } from "@/hooks/useLanguage";

type VerifyResult = {
  ok: boolean;
  full_name?: string;
  member_role?: string | null;
  status?: string;
  church_name?: string;
  joined_at?: string | null;
  code?: string;
};

function memberCode(id: string) {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  Ativo: { label: "Ativo", color: "text-emerald-600" },
  Inativo: { label: "Inativo", color: "text-slate-500" },
  Visitante: { label: "Visitante", color: "text-amber-600" },
  Transferido: { label: "Transferido", color: "text-blue-600" },
  Disciplinado: { label: "Disciplinado", color: "text-red-700" },
  Falecido: { label: "In Memoriam", color: "text-slate-600" },
};

export default function ValidarMembro() {
  const { t } = useLanguage();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<VerifyResult | null>(null);

  useEffect(() => {
    if (!id) {
      setResult({ ok: false });
      setLoading(false);
      return;
    }

    const verify = async () => {
      setLoading(true);

      const { data: member, error } = await supabase
        .from("members")
        .select("id, full_name, member_role, status, joined_at, organization_id")
        .eq("id", id)
        .maybeSingle();

      if (error || !member) {
        // RLS pode bloquear — mostrar mensagem de consulta à secretaria
        setResult({
          ok: false,
          code: memberCode(id),
        });
        setLoading(false);
        return;
      }

      // Buscar nome da igreja
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", member.organization_id)
        .maybeSingle();

      setResult({
        ok: true,
        full_name: member.full_name,
        member_role: member.member_role,
        status: member.status,
        church_name: org?.name ?? t("Igreja"),
        joined_at: member.joined_at,
        code: memberCode(id),
      });
      setLoading(false);
    };

    void verify();
  }, [id, t]);

  const now = format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 shadow-2xl">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-500/20 mb-3">
            <Shield size={28} className="text-blue-300" />
          </div>
          <h1 className="text-white font-bold text-lg">{t("Verificação de Membro")}</h1>
          <p className="text-slate-400 text-xs mt-0.5">{t("Ecclesia · Sistema de validação")}</p>
        </div>

        {/* Conteúdo */}
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 size={28} className="animate-spin text-blue-400" />
            <p className="text-slate-400 text-sm">{t("Consultando cadastro...")}</p>
          </div>
        ) : result?.ok ? (
          <div className="space-y-4">
            {/* Status */}
            <div className="flex items-center justify-center gap-2 py-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
              <CheckCircle2 size={18} className="text-emerald-400" />
              <span className="text-emerald-300 font-semibold text-sm">{t("Membro verificado")}</span>
            </div>

            {/* Dados */}
            <div className="space-y-3">
              <div className="border-b border-white/10 pb-3">
                <p className="text-slate-500 text-[10px] uppercase tracking-wider">{t("Nome completo")}</p>
                <p className="text-white font-semibold text-base mt-0.5">{result.full_name}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-slate-500 text-[10px] uppercase tracking-wider">{t("Status")}</p>
                  <p className={`font-semibold text-sm mt-0.5 uppercase ${STATUS_LABEL[result.status ?? "Ativo"]?.color ?? "text-slate-300"}`}>
                    {t(STATUS_LABEL[result.status ?? "Ativo"]?.label ?? result.status ?? "Ativo")}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 text-[10px] uppercase tracking-wider">{t("Cargo")}</p>
                  <p className="text-slate-200 text-sm mt-0.5">{t(result.member_role ?? "Membro")}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-slate-500 text-[10px] uppercase tracking-wider">{t("Igreja")}</p>
                  <p className="text-slate-200 text-sm mt-0.5">{result.church_name}</p>
                </div>
                {result.joined_at && (
                  <div>
                    <p className="text-slate-500 text-[10px] uppercase tracking-wider">{t("Membro desde")}</p>
                    <p className="text-slate-200 text-sm mt-0.5">
                      {format(new Date(result.joined_at), "MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                )}
              </div>

              <div className="border-t border-white/10 pt-3">
                <p className="text-slate-500 text-[10px] uppercase tracking-wider">{t("Matrícula")}</p>
                <p className="text-slate-300 font-mono text-sm mt-0.5">Nº {result.code}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 py-2 bg-amber-500/10 rounded-xl border border-amber-500/20">
              <XCircle size={18} className="text-amber-400" />
              <span className="text-amber-300 font-semibold text-sm">{t("Consulta indisponível")}</span>
            </div>
            <p className="text-slate-400 text-sm text-center leading-relaxed">
              {t("Para verificar este membro, entre em contato com a secretaria da igreja apresentando o código abaixo.")}
            </p>
            {result?.code && (
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">{t("Código de consulta")}</p>
                <p className="text-white font-mono text-lg tracking-widest">Nº {result.code}</p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-white/10 text-center">
          <p className="text-slate-600 text-[10px]">
            {t("Verificado em")} {now} · {t("Documento pessoal e intransferível")}
          </p>
          <p className="text-slate-700 text-[10px] mt-0.5">
            {t("Powered by Ecclesia Online")}
          </p>
        </div>
      </div>
    </div>
  );
}
