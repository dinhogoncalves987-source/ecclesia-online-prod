import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { TITHES_OFFERINGS, formatFinanceCurrency } from "@/lib/financeDemo";
import { PixCard } from "@/components/financeiro/PixCard";
import { ExecutiveCard } from "@/components/ExecutiveCard";
import { CreditCard, Heart, TrendingUp, Users } from "lucide-react";

export function FinanceTithesOfferings() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const fmt = (v: number) => formatFinanceCurrency(v, lang);
  const data = TITHES_OFFERINGS;

  const cards = [
    { title: t("Dízimos do Mês"), value: fmt(data.monthlyTithes), icon: TrendingUp, trend: `+${data.growthVsPrevious}%` },
    { title: t("Ofertas do Mês"), value: fmt(data.monthlyOfferings), icon: Heart },
    { title: t("Ofertas missionárias"), value: fmt(data.missionaryOfferings), icon: Heart },
    { title: t("Ofertas especiais"), value: fmt(data.specialOfferings), icon: Heart },
    { title: t("Média por congregação"), value: fmt(data.avgPerCongregation), icon: Users },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {cards.map((c, i) => (
          <ExecutiveCard key={c.title} {...c} index={i} />
        ))}
      </div>

      <section className="bg-card rounded-xl shadow-executive p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg font-semibold">{t("Por congregação")}</h3>
          <span className="text-xs text-muted-foreground">
            {t("Crescimento vs. mês anterior")}: +{data.growthVsPrevious}%
          </span>
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
                <tr key={row.name} className="border-b border-border/30">
                  <td className="py-3 font-medium">{row.name}</td>
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

      <div className="bg-accent/5 border border-accent/20 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-serif font-semibold">{t("Pagamento online")}</h3>
          <p className="text-sm text-muted-foreground mt-1">{t("Configure PIX e recebimentos digitais para dízimos e ofertas.")}</p>
        </div>
        <button
          type="button"
          onClick={() => toast({ title: t("Pagamento online"), description: t("Em breve disponível") })}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          <CreditCard size={16} /> {t("Configurar PIX")}
        </button>
      </div>
    </div>
  );
}
