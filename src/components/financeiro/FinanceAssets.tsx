import { useLanguage } from "@/hooks/useLanguage";
import { FINANCE_ASSETS, formatFinanceCurrency, type AssetStatus } from "@/lib/financeDemo";
import { Building2, MapPin, User } from "lucide-react";

const statusClass: Record<AssetStatus, string> = {
  Ativo: "bg-green-500/15 text-green-700",
  "Em manutenção": "bg-amber-500/15 text-amber-700",
  Baixado: "bg-muted text-muted-foreground",
};

export function FinanceAssets() {
  const { t, lang } = useLanguage();
  const fmt = (v: number) => formatFinanceCurrency(v, lang);
  const totalValue = FINANCE_ASSETS.filter((a) => a.status !== "Baixado").reduce((s, a) => s + a.estimatedValue, 0);

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-xl p-5 shadow-sm border border-border/50 inline-block">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("Valor patrimonial estimado")}</p>
        <p className="text-2xl font-semibold mt-1 tabular-nums">{fmt(totalValue)}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {FINANCE_ASSETS.map((asset) => (
          <article key={asset.id} className="bg-card rounded-xl border border-border/50 shadow-sm p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Building2 size={16} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold leading-snug">{asset.name}</p>
                  <p className="text-xs text-muted-foreground">{t(asset.category)}</p>
                </div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusClass[asset.status]}`}>
                {t(asset.status)}
              </span>
            </div>
            <p className="text-lg font-semibold tabular-nums">{fmt(asset.estimatedValue)}</p>
            <div className="text-xs text-muted-foreground space-y-1 mt-auto">
              <p className="flex items-center gap-1.5"><User size={12} /> {asset.responsible}</p>
              <p className="flex items-center gap-1.5"><MapPin size={12} /> {asset.location}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
