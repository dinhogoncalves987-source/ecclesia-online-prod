import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { useChurch } from "@/hooks/useChurchContext";
import { useRole } from "@/hooks/useRole";
import { formatFinanceCurrency } from "@/lib/financeDemo";
import { PixCard } from "@/components/financeiro/PixCard";
import { ExecutiveCard } from "@/components/ExecutiveCard";
import { DocExportMenu } from "@/components/shared/DocExportMenu";
import { buildFinanceExportItems } from "@/lib/docExport";
import { FinanceDetailModal } from "@/components/financeiro/FinanceDetailModal";
import { supabase } from "@/integrations/supabase/client";
import { runScopedOrganizationQuery } from "@/lib/organizationScope";
import { toast } from "sonner";
import { CheckCircle2, CreditCard, Heart, Info, Loader2, TrendingUp, Users } from "lucide-react";
import { useFinanceDashboardAggregates } from "@/hooks/useFinanceDashboardAggregates";
import {
  buildCongregationOfferingsRows,
  distinctCongregationIdsWithOfferings,
  sumCongregationCategoryByKind,
} from "@/lib/financeDashboardAggregates";
import { currentMonthKey, monthDateRange, previousMonthKey } from "@/lib/financeDateRanges";

/**
 * CORREÇÃO 2026-07-20 (Fase C — restauração do Financeiro) — a aba
 * "Dízimos & Ofertas" foi removida do render em 07/07/2026 (commit
 * d394a1d) e nunca teve dado real: os totais vinham de
 * `financeDemo.TITHES_OFFERINGS` (fixo em código). A categoria "Ofertas
 * especiais" não tem um valor contábil dedicado hoje (nenhuma organização
 * semeia essa categoria em finance_account_categories) — é reconhecida
 * heuristicamente pelo nome da categoria conter "especial"; fica em zero
 * até a igreja cadastrar essa categoria, o que é mais correto do que um
 * número fictício. A configuração de PIX persiste em `finance_accounts`
 * (mesma tabela lida pelo PixCard).
 *
 * CORREÇÃO 2026-08-14 (CORREÇÃO C3.1 — eliminar fetch-all) — este
 * componente recebia `transactions: TreasuryTransaction[]` (array completo
 * da organização) via prop e agrupava tudo em memória por
 * congregation_id/categoria. Agora usa finance_dashboard_aggregates
 * (bucket by_congregation_category, mês atual + mês anterior) — nenhuma
 * transação crua chega ao cliente; apenas totais já agrupados por
 * congregação e categoria.
 */

function pctGrowth(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

type CongregationRow = { id: string; name: string; tithes: number; offerings: number; growth: number };

export function FinanceTithesOfferings({ reloadToken }: { reloadToken?: number }) {
  const { t, lang } = useLanguage();
  const { church } = useChurch();
  const { hasRole, hasCapability } = useRole();
  const canWriteFinance = hasCapability("finance.write") || hasRole(["super_admin", "church_admin", "tesoureiro"]);
  const fmt = (v: number) => formatFinanceCurrency(v, lang);

  const [selectedCongregation, setSelectedCongregation] = useState<CongregationRow | null>(null);
  const [showPixConfig, setShowPixConfig] = useState(false);
  const [pixKeyInput, setPixKeyInput] = useState("");
  const [pixBeneficiary, setPixBeneficiary] = useState("");
  const [pixSaving, setPixSaving] = useState(false);
  const [pixSaved, setPixSaved] = useState(false);
  const [pixRefreshKey, setPixRefreshKey] = useState(0);
  const [congregationNames, setCongregationNames] = useState<Map<string, string>>(new Map());

  const thisMonthKey = currentMonthKey();
  const lastMonthKey = previousMonthKey(thisMonthKey);
  const thisMonthRange = useMemo(() => monthDateRange(thisMonthKey), [thisMonthKey]);
  const lastMonthRange = useMemo(() => monthDateRange(lastMonthKey), [lastMonthKey]);

  const thisMonth = useFinanceDashboardAggregates({
    organizationId: church?.id, dateFrom: thisMonthRange.from, dateTo: thisMonthRange.to, reloadToken,
  });
  const lastMonth = useFinanceDashboardAggregates({
    organizationId: church?.id, dateFrom: lastMonthRange.from, dateTo: lastMonthRange.to, reloadToken,
  });

  const loading = thisMonth.status === "loading" || thisMonth.status === "idle"
    || lastMonth.status === "loading" || lastMonth.status === "idle";

  const thisMonthBuckets = thisMonth.data?.byCongregationCategory ?? [];
  const lastMonthBuckets = lastMonth.data?.byCongregationCategory ?? [];

  useEffect(() => {
    const ids = Array.from(new Set([
      ...distinctCongregationIdsWithOfferings(thisMonthBuckets),
      ...distinctCongregationIdsWithOfferings(lastMonthBuckets),
    ]));
    if (ids.length === 0) { setCongregationNames(new Map()); return; }
    let active = true;
    supabase.from("organizations").select("id, name").in("id", ids).then(({ data }) => {
      if (!active) return;
      setCongregationNames(new Map((data ?? []).map(o => [o.id, o.name])));
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thisMonthBuckets, lastMonthBuckets]);

  const summary = useMemo(() => {
    const monthlyTithes = sumCongregationCategoryByKind(thisMonthBuckets, "tithe");
    const monthlyOfferings = sumCongregationCategoryByKind(thisMonthBuckets, "offering");
    const missionaryOfferings = sumCongregationCategoryByKind(thisMonthBuckets, "missionary");
    const specialOfferings = sumCongregationCategoryByKind(thisMonthBuckets, "special");

    const prevTithes = sumCongregationCategoryByKind(lastMonthBuckets, "tithe");
    const prevOfferings = sumCongregationCategoryByKind(lastMonthBuckets, "offering");
    const prevMissionary = sumCongregationCategoryByKind(lastMonthBuckets, "missionary");
    const prevSpecial = sumCongregationCategoryByKind(lastMonthBuckets, "special");

    const totalThisMonth = monthlyTithes + monthlyOfferings + missionaryOfferings + specialOfferings;
    const totalLastMonth = prevTithes + prevOfferings + prevMissionary + prevSpecial;
    const growthVsPrevious = pctGrowth(totalThisMonth, totalLastMonth);

    const congregationIdsThisMonth = distinctCongregationIdsWithOfferings(thisMonthBuckets);
    const avgPerCongregation = congregationIdsThisMonth.length > 0
      ? totalThisMonth / congregationIdsThisMonth.length
      : totalThisMonth;

    return { monthlyTithes, monthlyOfferings, missionaryOfferings, specialOfferings, growthVsPrevious, avgPerCongregation };
  }, [thisMonthBuckets, lastMonthBuckets]);

  const byCongregation = useMemo<CongregationRow[]>(() => {
    const currentRows = buildCongregationOfferingsRows(thisMonthBuckets);
    const previousRows = buildCongregationOfferingsRows(lastMonthBuckets);
    const previousById = new Map(previousRows.map(r => [r.congregationId, r]));
    return currentRows
      .map(row => {
        const prev = previousById.get(row.congregationId);
        return {
          id: row.congregationId,
          name: congregationNames.get(row.congregationId) ?? t("Congregação"),
          tithes: row.tithes,
          offerings: row.offerings,
          growth: pctGrowth(row.tithes + row.offerings, (prev?.tithes ?? 0) + (prev?.offerings ?? 0)),
        };
      })
      .filter(row => row.tithes > 0 || row.offerings > 0)
      .sort((a, b) => (b.tithes + b.offerings) - (a.tithes + a.offerings));
  }, [thisMonthBuckets, lastMonthBuckets, congregationNames, t]);

  const cards = [
    { title: t("Dízimos do Mês"), value: fmt(summary.monthlyTithes), icon: TrendingUp, trend: `${summary.growthVsPrevious >= 0 ? "+" : ""}${summary.growthVsPrevious}%` },
    { title: t("Ofertas do Mês"), value: fmt(summary.monthlyOfferings), icon: Heart },
    { title: t("Ofertas missionárias"), value: fmt(summary.missionaryOfferings), icon: Heart },
    { title: t("Ofertas especiais"), value: fmt(summary.specialOfferings), icon: Heart },
    { title: t("Média por congregação"), value: fmt(summary.avgPerCongregation), icon: Users },
  ];

  const buildCSV = () => {
    let csv = "Congregação,Dízimos,Ofertas,Total,Crescimento\n";
    byCongregation.forEach(row => {
      csv += `"${row.name}",${row.tithes},${row.offerings},${row.tithes + row.offerings},${row.growth}%\n`;
    });
    csv += `\n"Total Dízimos do Mês",${summary.monthlyTithes}\n`;
    csv += `"Total Ofertas do Mês",${summary.monthlyOfferings}\n`;
    csv += `"Crescimento vs. mês anterior",${summary.growthVsPrevious}%\n`;
    return csv;
  };

  const openPixConfig = async () => {
    setPixSaved(false);
    setPixKeyInput("");
    setPixBeneficiary("");
    if (church) {
      const { data } = await runScopedOrganizationQuery<{ name: string; pix_key: string | null }[]>(
        "finance_accounts", church.id, query => query.select("name, pix_key").eq("type", "pix").eq("is_active", true).limit(1),
      );
      const existing = data?.[0];
      if (existing) {
        setPixBeneficiary(existing.name ?? "");
        setPixKeyInput(existing.pix_key ?? "");
      }
    }
    setShowPixConfig(true);
  };

  const savePixConfig = async () => {
    if (!church || !pixKeyInput.trim()) return;
    setPixSaving(true);
    const { data: existing } = await runScopedOrganizationQuery<{ id: string }[]>(
      "finance_accounts", church.id, query => query.select("id").eq("type", "pix").limit(1),
    );
    const beneficiary = pixBeneficiary.trim() || "PIX";
    const existingId = existing?.[0]?.id;
    const { error } = existingId
      ? await supabase.from("finance_accounts").update({ name: beneficiary, pix_key: pixKeyInput.trim(), is_active: true }).eq("id", existingId).eq("organization_id", church.id)
      : await supabase.from("finance_accounts").insert({ organization_id: church.id, name: beneficiary, type: "pix", pix_key: pixKeyInput.trim(), is_active: true });
    setPixSaving(false);
    if (error) {
      console.error("[FinanceTithesOfferings] savePixConfig:", error);
      toast.error(t("Não foi possível salvar a configuração de PIX."));
      return;
    }
    setPixSaved(true);
    setPixRefreshKey(k => k + 1);
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
              {t("Crescimento vs. mês anterior")}: {summary.growthVsPrevious >= 0 ? "+" : ""}{summary.growthVsPrevious}%
            </span>
            <DocExportMenu
              align="end"
              items={buildFinanceExportItems({
                moduleTitle: t("Dízimos e Ofertas por Congregação"),
                summary: `Dízimos: ${fmt(summary.monthlyTithes)} | Ofertas: ${fmt(summary.monthlyOfferings)} | Crescimento: ${summary.growthVsPrevious >= 0 ? "+" : ""}${summary.growthVsPrevious}%`,
                csvFn: buildCSV,
                csvFilename: "dizimos_ofertas.csv",
              })}
            />
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground gap-2 text-sm">
            <Loader2 size={16} className="animate-spin" /> {t("Carregando...")}
          </div>
        ) : byCongregation.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            {t("Nenhum lançamento de dízimo ou oferta vinculado a uma congregação neste mês.")}
          </p>
        ) : (
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
                {byCongregation.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border/30 hover:bg-secondary/20 cursor-pointer transition-colors group"
                    onClick={() => setSelectedCongregation(row)}
                  >
                    <td className="py-3 font-medium group-hover:text-primary transition-colors">{row.name}</td>
                    <td className="py-3 text-right tabular-nums">{fmt(row.tithes)}</td>
                    <td className="py-3 text-right tabular-nums">{fmt(row.offerings)}</td>
                    <td className={`py-3 text-right tabular-nums ${row.growth >= 0 ? "text-green-600" : "text-destructive"}`}>
                      {row.growth >= 0 ? "+" : ""}{row.growth}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PixCard refreshKey={pixRefreshKey} />

      {/* PIX configuration CTA */}
      {canWriteFinance && (
        <div className="bg-accent/5 border border-accent/20 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-serif font-semibold">{t("Pagamento online")}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t("Configure PIX e recebimentos digitais para dízimos e ofertas.")}
            </p>
          </div>
          <button
            type="button"
            onClick={openPixConfig}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex-shrink-0"
          >
            <CreditCard size={16} /> {t("Configurar PIX")}
          </button>
        </div>
      )}

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
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm font-medium ${selectedCongregation.growth >= 0 ? "bg-green-500/10 text-green-700" : "bg-destructive/10 text-destructive"}`}>
              <TrendingUp size={16} />
              Crescimento vs. mês anterior: {selectedCongregation.growth >= 0 ? "+" : ""}{selectedCongregation.growth}%
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
            <p className="font-semibold text-lg">{t("Configuração salva!")}</p>
            <p className="text-sm text-muted-foreground">
              {t("A chave PIX foi registrada. Os recebimentos digitais serão exibidos no painel assim que ativados.")}
            </p>
            <button
              type="button"
              onClick={() => setShowPixConfig(false)}
              className="mt-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {t("Concluir")}
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 text-sm">
              <Info size={16} className="text-primary flex-shrink-0 mt-0.5" />
              <p className="text-muted-foreground">
                {t("Configure uma chave PIX para receber dízimos e ofertas digitalmente. Os valores serão consolidados automaticamente neste painel.")}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("Chave PIX")}
              </label>
              <input
                type="text"
                value={pixKeyInput}
                onChange={e => setPixKeyInput(e.target.value)}
                placeholder={t("Digite a chave PIX da organização...")}
                className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("Nome do beneficiário")}
              </label>
              <input
                type="text"
                value={pixBeneficiary}
                onChange={e => setPixBeneficiary(e.target.value)}
                placeholder={t("Nome da igreja ou organização...")}
                className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowPixConfig(false)}
                className="flex-1 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-secondary/30 transition-colors"
              >
                {t("Cancelar")}
              </button>
              <button
                type="button"
                onClick={savePixConfig}
                disabled={!pixKeyInput.trim() || pixSaving}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pixSaving && <Loader2 size={14} className="animate-spin" />} {t("Salvar configuração")}
              </button>
            </div>
          </div>
        )}
      </FinanceDetailModal>
    </div>
  );
}
