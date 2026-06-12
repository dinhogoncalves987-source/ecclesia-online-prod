import { useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { FINANCE_ASSETS, formatFinanceCurrency, type AssetStatus } from "@/lib/financeDemo";
import { Building2, MapPin, User } from "lucide-react";
import { DocExportMenu } from "@/components/shared/DocExportMenu";
import { buildFinanceExportItems } from "@/lib/docExport";
import { FinanceDetailModal } from "@/components/financeiro/FinanceDetailModal";

const STATUS_CLASS: Record<AssetStatus, string> = {
  Ativo: "bg-green-500/15 text-green-700",
  "Em manutenção": "bg-amber-500/15 text-amber-700",
  Baixado: "bg-muted text-muted-foreground",
};

const STATUS_FILTER = ["Todos", "Ativo", "Em manutenção", "Baixado"] as const;
type Filter = (typeof STATUS_FILTER)[number];

type AssetItem = typeof FINANCE_ASSETS[number];

export function FinanceAssets() {
  const { t, lang } = useLanguage();
  const fmt = (v: number) => formatFinanceCurrency(v, lang);

  const [filter, setFilter] = useState<Filter>("Todos");
  const [selectedAsset, setSelectedAsset] = useState<AssetItem | null>(null);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, AssetStatus>>({});

  const getStatus = (asset: AssetItem): AssetStatus => statusOverrides[asset.id] ?? asset.status;

  const filtered = filter === "Todos"
    ? FINANCE_ASSETS
    : FINANCE_ASSETS.filter(a => getStatus(a) === filter);

  const activeAssets = FINANCE_ASSETS.filter(a => getStatus(a) !== "Baixado");
  const totalValue = activeAssets.reduce((s, a) => s + a.estimatedValue, 0);
  const maintenanceCount = FINANCE_ASSETS.filter(a => getStatus(a) === "Em manutenção").length;

  const buildCSV = () => {
    let csv = "Bem,Categoria,Valor estimado,Status,Responsável,Localização\n";
    FINANCE_ASSETS.forEach(a => {
      csv += `"${a.name}","${a.category}",${a.estimatedValue},"${getStatus(a)}","${a.responsible}","${a.location}"\n`;
    });
    return csv;
  };

  const cycleStatus = (id: string) => {
    const cur = statusOverrides[id] ?? FINANCE_ASSETS.find(a => a.id === id)?.status ?? "Ativo";
    const next: AssetStatus = cur === "Ativo" ? "Em manutenção" : cur === "Em manutenção" ? "Ativo" : "Ativo";
    setStatusOverrides(p => ({ ...p, [id]: next }));
    if (selectedAsset?.id === id) {
      setSelectedAsset(prev => prev ? { ...prev, status: next } : null);
    }
  };

  const selectedStatus = selectedAsset ? getStatus(selectedAsset) : "Ativo";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("Valor total estimado")}</p>
          <p className="text-2xl font-semibold mt-1 tabular-nums">{fmt(totalValue)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{activeAssets.length} {t("Ativos")}</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("Em manutenção")}</p>
          <p className="text-2xl font-semibold mt-1">{maintenanceCount}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("Bens")}</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("Baixados")}</p>
          <p className="text-2xl font-semibold mt-1">{FINANCE_ASSETS.filter(a => getStatus(a) === "Baixado").length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("Bens fora de uso")}</p>
        </div>
      </div>

      <section className="bg-card rounded-xl shadow-executive overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-border/40">
          <h3 className="font-serif text-lg font-semibold flex-1">{t("Painel de ativos")}</h3>

          <div className="flex bg-secondary/50 rounded-lg p-0.5">
            {STATUS_FILTER.map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filter === f ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "Todos" ? t("Todos") : t(f)}
              </button>
            ))}
          </div>

          <DocExportMenu
            align="end"
            items={buildFinanceExportItems({
              moduleTitle: t("Patrimônio — Inventário de Ativos"),
              summary: `${activeAssets.length} ativos | Valor total: ${fmt(totalValue)}`,
              csvFn: buildCSV,
              csvFilename: "patrimonio.csv",
            })}
          />
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(asset => {
            const status = getStatus(asset);
            return (
              <article
                key={asset.id}
                className="rounded-xl border border-border/50 bg-secondary/20 p-4 flex flex-col gap-3 cursor-pointer hover:border-primary/30 hover:bg-secondary/40 transition-all group"
                onClick={() => setSelectedAsset(asset)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                      <Building2 size={16} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold leading-snug text-sm group-hover:text-primary transition-colors">{asset.name}</p>
                      <p className="text-xs text-muted-foreground">{t(asset.category)}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${STATUS_CLASS[status]}`}>
                    {t(status)}
                  </span>
                </div>

                <p className="text-lg font-bold tabular-nums">{fmt(asset.estimatedValue)}</p>

                <div className="text-xs text-muted-foreground space-y-1 mt-auto border-t border-border/30 pt-2">
                  <p className="flex items-center gap-1.5"><User size={11} /> {asset.responsible}</p>
                  <p className="flex items-center gap-1.5"><MapPin size={11} /> {asset.location}</p>
                </div>
              </article>
            );
          })}
          {filtered.length === 0 && (
            <p className="col-span-full text-center text-sm text-muted-foreground py-8">
              {t("Nenhum ativo encontrado")}
            </p>
          )}
        </div>
      </section>

      {/* ── Asset detail modal ──────────────────────────────────────── */}
      <FinanceDetailModal
        open={!!selectedAsset}
        onClose={() => setSelectedAsset(null)}
        title={selectedAsset?.name ?? ""}
        subtitle={selectedAsset ? t(selectedAsset.category) : undefined}
        maxWidth="sm"
      >
        {selectedAsset && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-secondary/30 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Valor estimado</p>
              <p className="text-3xl font-bold tabular-nums">{fmt(selectedAsset.estimatedValue)}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Status atual</p>
                <span className={`inline-block mt-1 text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${STATUS_CLASS[selectedStatus]}`}>
                  {t(selectedStatus)}
                </span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Categoria</p>
                <p className="font-medium mt-1">{t(selectedAsset.category)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><User size={11} /> Responsável</p>
                <p className="font-medium mt-1">{selectedAsset.responsible}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin size={11} /> Localização</p>
                <p className="font-medium mt-1">{selectedAsset.location}</p>
              </div>
            </div>

            {selectedStatus !== "Baixado" && (
              <button
                type="button"
                onClick={() => cycleStatus(selectedAsset.id)}
                className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedStatus === "Ativo"
                    ? "bg-amber-500/10 text-amber-700 hover:bg-amber-500/20"
                    : "bg-green-500/10 text-green-700 hover:bg-green-500/20"
                }`}
              >
                {selectedStatus === "Ativo" ? "Registrar manutenção" : "Marcar como ativo"}
              </button>
            )}
          </div>
        )}
      </FinanceDetailModal>
    </div>
  );
}
