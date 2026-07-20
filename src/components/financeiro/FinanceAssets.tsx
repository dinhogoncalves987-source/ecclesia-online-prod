import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { useChurch } from "@/hooks/useChurchContext";
import { useRole } from "@/hooks/useRole";
import { formatFinanceCurrency } from "@/lib/financeDemo";
import { Building2, Loader2, MapPin, Plus, User } from "lucide-react";
import { DocExportMenu } from "@/components/shared/DocExportMenu";
import { buildFinanceExportItems } from "@/lib/docExport";
import { FinanceDetailModal } from "@/components/financeiro/FinanceDetailModal";
import { supabase } from "@/integrations/supabase/client";
import { runScopedOrganizationQuery, insertWithOrganizationScope } from "@/lib/organizationScope";
import { toast } from "sonner";

/**
 * CORREÇÃO 2026-07-22 (Fase E — restauração do Financeiro) — "Patrimônio"
 * usava FINANCE_ASSETS fixo de financeDemo.ts, e a troca de status era só
 * estado React local (nunca persistia). Agora é CRUD real sobre a nova
 * tabela public.finance_assets (migration 20260722090000_finance_assets.sql).
 * Sem nenhum valor fictício.
 */

type AssetStatus = "Ativo" | "Em manutenção" | "Baixado";

type AssetRow = {
  id: string;
  name: string;
  category: string;
  estimated_value: number;
  status: AssetStatus;
  responsible: string | null;
  location: string | null;
};

const STATUS_CLASS: Record<AssetStatus, string> = {
  Ativo: "bg-green-500/15 text-green-700",
  "Em manutenção": "bg-amber-500/15 text-amber-700",
  Baixado: "bg-muted text-muted-foreground",
};

const STATUS_FILTER = ["Todos", "Ativo", "Em manutenção", "Baixado"] as const;
type Filter = (typeof STATUS_FILTER)[number];

const EMPTY_FORM = { name: "", category: "", estimatedValue: "", responsible: "", location: "" };

function useFinanceAssets(organizationId: string | undefined) {
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!organizationId) { setAssets([]); setLoading(false); return; }
      setLoading(true);
      const { data, error } = await runScopedOrganizationQuery<AssetRow[]>("finance_assets", organizationId, query =>
        query.select("id, name, category, estimated_value, status, responsible, location").order("name"));
      if (!active) return;
      if (error) console.error("[FinanceAssets] load:", error);
      setAssets(data ?? []);
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, [organizationId, reloadToken]);

  return { assets, loading, reload: () => setReloadToken(k => k + 1) };
}

export function FinanceAssets() {
  const { t, lang } = useLanguage();
  const { church } = useChurch();
  const { hasRole, hasCapability } = useRole();
  const canWriteFinance = hasCapability("finance.write") || hasRole(["super_admin", "church_admin", "tesoureiro", "contador"]);
  const fmt = (v: number) => formatFinanceCurrency(v, lang);

  const { assets, loading, reload } = useFinanceAssets(church?.id);

  const [filter, setFilter] = useState<Filter>("Todos");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewAsset, setShowNewAsset] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const selectedAsset = assets.find(a => a.id === selectedId) ?? null;

  const filtered = filter === "Todos" ? assets : assets.filter(a => a.status === filter);
  const activeAssets = assets.filter(a => a.status !== "Baixado");
  const totalValue = activeAssets.reduce((s, a) => s + Number(a.estimated_value), 0);
  const maintenanceCount = assets.filter(a => a.status === "Em manutenção").length;
  const writtenOffCount = assets.filter(a => a.status === "Baixado").length;

  const buildCSV = () => {
    let csv = "Bem,Categoria,Valor estimado,Status,Responsável,Localização\n";
    assets.forEach(a => {
      csv += `"${a.name}","${a.category}",${a.estimated_value},"${a.status}","${a.responsible ?? ""}","${a.location ?? ""}"\n`;
    });
    return csv;
  };

  const nextStatus = useMemo(() => {
    if (!selectedAsset) return null;
    if (selectedAsset.status === "Ativo") return "Em manutenção" as AssetStatus;
    if (selectedAsset.status === "Em manutenção") return "Ativo" as AssetStatus;
    return null;
  }, [selectedAsset]);

  const cycleStatus = async () => {
    if (!selectedAsset || !nextStatus) return;
    setUpdatingStatus(true);
    const { error } = await supabase.from("finance_assets").update({ status: nextStatus }).eq("id", selectedAsset.id);
    setUpdatingStatus(false);
    if (error) {
      console.error("[FinanceAssets] cycleStatus:", error);
      toast.error(t("Não foi possível atualizar o status."));
      return;
    }
    reload();
  };

  const createAsset = async () => {
    if (!church || !form.name.trim() || !form.category.trim()) return;
    const value = Number(form.estimatedValue.replace(",", "."));
    if (!Number.isFinite(value) || value < 0) { toast.error(t("Informe um valor estimado válido.")); return; }
    setSaving(true);
    const { error } = await insertWithOrganizationScope("finance_assets", church.id, {
      name: form.name.trim(),
      category: form.category.trim(),
      estimated_value: value,
      responsible: form.responsible.trim() || null,
      location: form.location.trim() || null,
      status: "Ativo",
    });
    setSaving(false);
    if (error) {
      console.error("[FinanceAssets] createAsset:", error);
      toast.error(t("Não foi possível cadastrar o bem."));
      return;
    }
    toast.success(t("Bem cadastrado!"));
    setForm(EMPTY_FORM);
    setShowNewAsset(false);
    reload();
  };

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
          <p className="text-2xl font-semibold mt-1">{writtenOffCount}</p>
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

          {canWriteFinance && (
            <button
              type="button"
              onClick={() => setShowNewAsset(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-secondary/30 transition-colors"
            >
              <Plus size={13} /> {t("Novo bem")}
            </button>
          )}

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

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground gap-2 text-sm">
            <Loader2 size={16} className="animate-spin" /> {t("Carregando...")}
          </div>
        ) : (
          <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map(asset => (
              <article
                key={asset.id}
                className="rounded-xl border border-border/50 bg-secondary/20 p-4 flex flex-col gap-3 cursor-pointer hover:border-primary/30 hover:bg-secondary/40 transition-all group"
                onClick={() => setSelectedId(asset.id)}
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
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${STATUS_CLASS[asset.status]}`}>
                    {t(asset.status)}
                  </span>
                </div>

                <p className="text-lg font-bold tabular-nums">{fmt(Number(asset.estimated_value))}</p>

                <div className="text-xs text-muted-foreground space-y-1 mt-auto border-t border-border/30 pt-2">
                  <p className="flex items-center gap-1.5"><User size={11} /> {asset.responsible || t("Não informado")}</p>
                  <p className="flex items-center gap-1.5"><MapPin size={11} /> {asset.location || t("Não informado")}</p>
                </div>
              </article>
            ))}
            {filtered.length === 0 && (
              <p className="col-span-full text-center text-sm text-muted-foreground py-8">
                {t("Nenhum ativo encontrado")}
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── Asset detail modal ──────────────────────────────────────── */}
      <FinanceDetailModal
        open={!!selectedAsset}
        onClose={() => setSelectedId(null)}
        title={selectedAsset?.name ?? ""}
        subtitle={selectedAsset ? t(selectedAsset.category) : undefined}
        maxWidth="sm"
      >
        {selectedAsset && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-secondary/30 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{t("Valor estimado")}</p>
              <p className="text-3xl font-bold tabular-nums">{fmt(Number(selectedAsset.estimated_value))}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{t("Status atual")}</p>
                <span className={`inline-block mt-1 text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${STATUS_CLASS[selectedAsset.status]}`}>
                  {t(selectedAsset.status)}
                </span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("Categoria")}</p>
                <p className="font-medium mt-1">{t(selectedAsset.category)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><User size={11} /> {t("Responsável")}</p>
                <p className="font-medium mt-1">{selectedAsset.responsible || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin size={11} /> {t("Localização")}</p>
                <p className="font-medium mt-1">{selectedAsset.location || "—"}</p>
              </div>
            </div>

            {canWriteFinance && nextStatus && (
              <button
                type="button"
                onClick={cycleStatus}
                disabled={updatingStatus}
                className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                  selectedAsset.status === "Ativo"
                    ? "bg-amber-500/10 text-amber-700 hover:bg-amber-500/20"
                    : "bg-green-500/10 text-green-700 hover:bg-green-500/20"
                }`}
              >
                {updatingStatus && <Loader2 size={14} className="inline animate-spin mr-2" />}
                {selectedAsset.status === "Ativo" ? t("Registrar manutenção") : t("Marcar como ativo")}
              </button>
            )}
          </div>
        )}
      </FinanceDetailModal>

      {/* ── New asset modal ─────────────────────────────────────────── */}
      <FinanceDetailModal
        open={showNewAsset}
        onClose={() => setShowNewAsset(false)}
        title={t("Novo bem patrimonial")}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Nome")}</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder={t("Ex.: Van 15 lugares — Missões")}
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Categoria")}</label>
            <input
              type="text"
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              placeholder={t("Ex.: Veículos, Equipamentos de som...")}
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Valor estimado")}</label>
            <input
              type="text"
              inputMode="decimal"
              value={form.estimatedValue}
              onChange={e => setForm(f => ({ ...f, estimatedValue: e.target.value }))}
              placeholder="0,00"
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Responsável")}</label>
              <input
                type="text"
                value={form.responsible}
                onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Localização")}</label>
              <input
                type="text"
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowNewAsset(false)}
              className="flex-1 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-secondary/30 transition-colors"
            >
              {t("Cancelar")}
            </button>
            <button
              type="button"
              onClick={createAsset}
              disabled={!form.name.trim() || !form.category.trim() || saving}
              className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />} {t("Cadastrar")}
            </button>
          </div>
        </div>
      </FinanceDetailModal>
    </div>
  );
}
