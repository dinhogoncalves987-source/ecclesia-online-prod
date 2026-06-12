import { useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { TITHES_OFFERINGS, formatFinanceCurrency } from "@/lib/financeDemo";
import { PixCard } from "@/components/financeiro/PixCard";
import { ExecutiveCard } from "@/components/ExecutiveCard";
import { DocExportMenu } from "@/components/shared/DocExportMenu";
import { buildFinanceExportItems } from "@/lib/docExport";
import { FinanceDetailModal } from "@/components/financeiro/FinanceDetailModal";
import { CheckCircle2, CreditCard, Heart, Info, TrendingUp, Users } from "lucide-react";

type CongregationRow = typeof TITHES_OFFERINGS.byCongregation[number];

export function FinanceTithesOfferings() {
  const { t, lang } = useLanguage();
  const fmt = (v: number) => formatFinanceCurrency(v, lang);
  const data = TITHES_OFFERINGS;

  const [selectedCongregation, setSelectedCongregation] = useState<CongregationRow | null>(null);
  const [showPixConfig, setShowPixConfig] = useState(false);
  const [pixKey, setPixKey] = useState("");
  const [pixSaved, setPixSaved] = useState(false);

  const cards = [
    { title: t("Dízimos do Mês"), value: fmt(data.monthlyTithes), icon: TrendingUp, trend: `+${data.growthVsPrevious}%` },
    { title: t("Ofertas do Mês"), value: fmt(data.monthlyOfferings), icon: Heart },
    { title: t("Ofertas missionárias"), value: fmt(data.missionaryOfferings), icon: Heart },
    { title: t("Ofertas especiais"), value: fmt(data.specialOfferings), icon: Heart },
    { title: t("Média por congregação"), value: fmt(data.avgPerCongregation), icon: Users },
  ];

  const buildCSV = () => {
    let csv = "Congregação,Dízimos,Ofertas,Total,Crescimento\n";
    data.byCongregation.forEach(row => {
      csv += `"${row.name}",${row.tithes},${row.offerings},${row.tithes + row.offerings},${row.growth}%\n`;
    });
    csv += `\n"Total Dízimos do Mês",${data.monthlyTithes}\n`;
    csv += `"Total Ofertas do Mês",${data.monthlyOfferings}\n`;
    csv += `"Crescimento vs. mês anterior",${data.growthVsPrevious}%\n`;
    return csv;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {cards.map((c, i) => (
          <ExecutiveCard key={c.title} {...c} index={i} />
        ))}
      </div>

      {/* Congregation table */}
      <section className="bg-card rounded-xl shadow-executive p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg font-semibold">{t("Por congregação")}</h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:block">
              {t("Crescimento vs. mês anterior")}: +{data.growthVsPrevious}%
            </span>
            <DocExportMenu
              align="end"
              items={buildFinanceExportItems({
                moduleTitle: t("Dízimos e Ofertas por Congregação"),
                summary: `Dízimos: ${fmt(data.monthlyTithes)} | Ofertas: ${fmt(data.monthlyOfferings)} | Crescimento: +${data.growthVsPrevious}%`,
                csvFn: buildCSV,
                csvFilename: "dizimos_ofertas.csv",
              })}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-left text-muted-foreground">
                <th className="pb-2 font-medium">{t("Congregação")}</th>
                <th className="pb-2 font-medium text-right">{t("Dízimos")}</th>
                <th className="pb-2 font-medium text-right">{t("Ofertas")}</th>
                <th className="pb-2 font-medium text-right">{t("Crescimento")}</th>
              </tr>
            </thead>
            <tbody>
              {data.byCongregation.map((row) => (
                <tr
                  key={row.name}
                  className="border-b border-border/30 hover:bg-secondary/20 cursor-pointer transition-colors group"
                  onClick={() => setSelectedCongregation(row)}
                >
                  <td className="py-3 font-medium group-hover:text-primary transition-colors">{row.name}</td>
                  <td className="py-3 text-right tabular-nums">{fmt(row.tithes)}</td>
                  <td className="py-3 text-right tabular-nums">{fmt(row.offerings)}</td>
                  <td className="py-3 text-right tabular-nums text-green-600">+{row.growth}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <PixCard />

      {/* PIX configuration CTA */}
      <div className="bg-accent/5 border border-accent/20 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-serif font-semibold">{t("Pagamento online")}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t("Configure PIX e recebimentos digitais para dízimos e ofertas.")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setPixSaved(false); setShowPixConfig(true); }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex-shrink-0"
        >
          <CreditCard size={16} /> {t("Configurar PIX")}
        </button>
      </div>

      {/* ── Congregation detail modal ──────────────────────────────── */}
      <FinanceDetailModal
        open={!!selectedCongregation}
        onClose={() => setSelectedCongregation(null)}
        title={selectedCongregation?.name ?? ""}
        subtitle="Dízimos e Ofertas"
        maxWidth="sm"
      >
        {selectedCongregation && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-secondary/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("Dízimos")}</p>
                <p className="text-xl font-bold tabular-nums mt-1">{fmt(selectedCongregation.tithes)}</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("Ofertas")}</p>
                <p className="text-xl font-bold tabular-nums mt-1">{fmt(selectedCongregation.offerings)}</p>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-secondary/30">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total do mês</p>
              <p className="text-2xl font-bold tabular-nums mt-1">
                {fmt(selectedCongregation.tithes + selectedCongregation.offerings)}
              </p>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-700 text-sm font-medium">
              <TrendingUp size={16} />
              Crescimento vs. mês anterior: +{selectedCongregation.growth}%
            </div>
          </div>
        )}
      </FinanceDetailModal>

      {/* ── PIX configuration modal ────────────────────────────────── */}
      <FinanceDetailModal
        open={showPixConfig}
        onClose={() => setShowPixConfig(false)}
        title={t("Configurar PIX")}
        subtitle="Recebimentos digitais — Dízimos e Ofertas"
        maxWidth="md"
      >
        {pixSaved ? (
          <div className="text-center py-4 space-y-3">
            <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
              <CheckCircle2 size={28} className="text-green-600" />
            </div>
            <p className="font-semibold text-lg">Configuração salva!</p>
            <p className="text-sm text-muted-foreground">
              A chave PIX foi registrada. Os recebimentos digitais serão exibidos no painel assim que ativados.
            </p>
            <button
              type="button"
              onClick={() => setShowPixConfig(false)}
              className="mt-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Concluir
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 text-sm">
              <Info size={16} className="text-primary flex-shrink-0 mt-0.5" />
              <p className="text-muted-foreground">
                Configure uma chave PIX para receber dízimos e ofertas digitalmente.
                Os valores serão consolidados automaticamente neste painel.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tipo de chave PIX
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {["CPF/CNPJ", "E-mail", "Telefone", "Aleatória"].map(type => (
                  <button
                    key={type}
                    type="button"
                    className="px-3 py-2 rounded-lg border border-border text-xs font-medium hover:border-primary/50 hover:bg-secondary/30 transition-colors"
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Chave PIX
              </label>
              <input
                type="text"
                value={pixKey}
                onChange={e => setPixKey(e.target.value)}
                placeholder="Digite a chave PIX da organização..."
                className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Nome do beneficiário
              </label>
              <input
                type="text"
                placeholder="Nome da igreja ou organização..."
                className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowPixConfig(false)}
                className="flex-1 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-secondary/30 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => setPixSaved(true)}
                disabled={!pixKey.trim()}
                className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Salvar configuração
              </button>
            </div>
          </div>
        )}
      </FinanceDetailModal>
    </div>
  );
}
