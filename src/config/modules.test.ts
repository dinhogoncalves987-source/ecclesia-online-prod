import { describe, expect, it } from "vitest";
import { getModuleDefinition, isModuleEnabled, isRouteEnabled, MODULE_REGISTRY } from "./modules";

describe("isModuleEnabled", () => {
  it("enables 'both' modules in production", () => {
    expect(isModuleEnabled("dashboard", "production")).toBe(true);
    expect(isModuleEnabled("finance.treasury", "production")).toBe(true);
    expect(isModuleEnabled("finance.accounts", "production")).toBe(true);
    expect(isModuleEnabled("wallet", "production")).toBe(true);
    expect(isModuleEnabled("gatekeeper", "production")).toBe(true);
  });

  it("enables 'both' modules in staging", () => {
    expect(isModuleEnabled("dashboard", "staging")).toBe(true);
    expect(isModuleEnabled("finance.treasury", "staging")).toBe(true);
    expect(isModuleEnabled("finance.accounts", "staging")).toBe(true);
  });

  // CORREÇÃO 2026-07-24 (Fase H — restauração do Financeiro): "Inteligência"
  // passou a gerar alertas/insights/ações por regras determinísticas sobre
  // dados reais (mesma fonte do Executivo, src/lib/financeInsights.ts) —
  // não usa mais financeDemo como fonte de dado exibido. Promovida para
  // "both".
  it("enables finance.intelligence in production and staging (regras deterministicas sobre dados reais)", () => {
    expect(isModuleEnabled("finance.intelligence", "production")).toBe(true);
    expect(isModuleEnabled("finance.intelligence", "staging")).toBe(true);
  });

  // CORREÇÃO 2026-07-20 (Fase A — restauração do Financeiro): "Auditoria"
  // passou a consultar finance_transaction_audit_logs real (populada por
  // trigger em toda alteração de transactions) — não usa mais financeDemo
  // como fonte de dado exibido. Promovida individualmente para "both".
  it("enables finance.audit in production and staging (dados reais de auditoria)", () => {
    expect(isModuleEnabled("finance.audit", "production")).toBe(true);
    expect(isModuleEnabled("finance.audit", "staging")).toBe(true);
  });

  // CORREÇÃO 2026-07-20 (Fase B — restauração do Financeiro): "Campanhas"
  // consulta campaigns/campaign_contributions reais via useCampaigns() —
  // não usa mais campaignsDemo como fonte de dado exibido (só helpers
  // puros de formatação/cálculo sobre o array real). Promovida para "both".
  it("enables finance.campaigns in production and staging (dados reais de campanhas)", () => {
    expect(isModuleEnabled("finance.campaigns", "production")).toBe(true);
    expect(isModuleEnabled("finance.campaigns", "staging")).toBe(true);
  });

  // CORREÇÃO 2026-07-20 (Fase C — restauração do Financeiro): "Dízimos &
  // Ofertas" consulta transactions reais classificadas por categoria — ver
  // src/components/financeiro/FinanceTithesOfferings.tsx.
  it("enables finance.tithes in production and staging (dados reais de dizimos e ofertas)", () => {
    expect(isModuleEnabled("finance.tithes", "production")).toBe(true);
    expect(isModuleEnabled("finance.tithes", "staging")).toBe(true);
  });

  // CORREÇÃO 2026-07-20 (Fase D — restauração do Financeiro): "Orçamento"
  // passou a ler/gravar public.finance_budgets real (migration
  // 20260721090000_finance_budgets.sql), com "realizado" agregado de
  // transactions por centro de custo — não usa mais financeDemo como fonte
  // de dado exibido. Promovida para "both".
  it("enables finance.budget in production and staging (dados reais de orçamento)", () => {
    expect(isModuleEnabled("finance.budget", "production")).toBe(true);
    expect(isModuleEnabled("finance.budget", "staging")).toBe(true);
  });

  // CORREÇÃO 2026-07-22 (Fase E — restauração do Financeiro): "Patrimônio"
  // passou a fazer CRUD real sobre public.finance_assets (migration
  // 20260722090000_finance_assets.sql) — não usa mais financeDemo como fonte
  // de dado exibido. Promovida para "both".
  it("enables finance.assets in production and staging (CRUD real de patrimonio)", () => {
    expect(isModuleEnabled("finance.assets", "production")).toBe(true);
    expect(isModuleEnabled("finance.assets", "staging")).toBe(true);
  });

  // CORREÇÃO 2026-07-23 (Fase F — restauração do Financeiro): "Prestação de
  // Contas" passou a ler/gravar public.finance_accountability_reports/
  // _approvals real (migration 20260723090000_finance_accountability.sql)
  // — não usa mais financeDemo como fonte de dado exibido. Promovida para
  // "both".
  it("enables finance.accountability in production and staging (workflow de aprovacao real)", () => {
    expect(isModuleEnabled("finance.accountability", "production")).toBe(true);
    expect(isModuleEnabled("finance.accountability", "staging")).toBe(true);
  });

  // CORREÇÃO 2026-07-24 (Fase G — restauração do Financeiro): "Executivo"
  // passou a agregar transactions/campanhas/finance_budgets reais e a
  // árvore real de organizações para o consolidado por hierarquia — não usa
  // mais financeDemo como fonte de dado exibido. Promovida para "both".
  it("enables finance.executive in production and staging (agregacoes reais)", () => {
    expect(isModuleEnabled("finance.executive", "production")).toBe(true);
    expect(isModuleEnabled("finance.executive", "staging")).toBe(true);
  });

  it("classifies TV Digital and Canal Ecclésia as stage-only", () => {
    expect(isModuleEnabled("tv-digital", "production")).toBe(false);
    expect(isModuleEnabled("tv-digital", "staging")).toBe(true);
    expect(isModuleEnabled("canal-ecclesia", "production")).toBe(false);
    expect(isModuleEnabled("canal-ecclesia", "staging")).toBe(true);
  });

  it("disables in-testing modules (Marketplace, Comunidade) in production — telas de maquete, sem backend real", () => {
    for (const id of ["marketplace", "community"] as const) {
      expect(isModuleEnabled(id, "production")).toBe(false);
      expect(isModuleEnabled(id, "staging")).toBe(true);
    }
  });

  // OPERAÇÃO 2 (Discipulado) — backend real (discipleship_* tables/RPCs), mas
  // as migrations ainda NÃO foram aplicadas em nenhum banco (ver
  // docs/architecture/operacao-2-discipulado.md). Diferente de
  // Marketplace/Comunidade, isso não é "maquete sem backend" — é backend
  // pronto aguardando aplicação/validação. Permanece staging-only até lá.
  it("disables discipleship in production (migrations ainda não aplicadas) and enables in staging", () => {
    expect(isModuleEnabled("discipleship", "production")).toBe(false);
    expect(isModuleEnabled("discipleship", "staging")).toBe(true);
  });

  // OPERAÇÃO 3 (Teologia) — mesmo critério do Discipulado: backend real
  // (theology_* tables/RPCs, ver docs/architecture/operacao-3-teologia.md),
  // migrations ainda NÃO aplicadas em nenhum banco. Staging-only até lá.
  it("disables theology in production (migrations ainda não aplicadas) and enables in staging", () => {
    expect(isModuleEnabled("theology", "production")).toBe(false);
    expect(isModuleEnabled("theology", "staging")).toBe(true);
  });

  // OPERAÇÃO 4 (Missões) — mesmo critério do Discipulado/Teologia: backend
  // real (missions_* tables/RPCs, ver docs/architecture/operacao-4-missoes.md),
  // migrations ainda NÃO aplicadas em nenhum banco. Staging-only até lá.
  it("disables missions in production (migrations ainda não aplicadas) and enables in staging", () => {
    expect(isModuleEnabled("missions", "production")).toBe(false);
    expect(isModuleEnabled("missions", "staging")).toBe(true);
  });

  it("keeps official documents staging-only until homologation", () => {
    expect(isModuleEnabled("official-documents", "production")).toBe(false);
    expect(isModuleEnabled("official-documents", "staging")).toBe(true);
  });

  // CORREÇÃO 2026-07-17: Bíblia/IA, Culto & Louvor, Campanhas, Cartas de
  // Recomendação e Relatórios não dependem de dado fictício exibido ao
  // usuário (todos têm backend real no Supabase) — nunca deveriam ter sido
  // staging-only. Promovidos para "both" após regressão que os removeu do
  // menu de produção.
  //
  // CORREÇÃO 2026-07-20: "devotional" teve a mesma regressão — a edge
  // function daily-devotional (banco de versículos reais) e a página
  // pública /devocional de compartilhamento não dependem de dado fictício.
  // Promovido de volta para "both".
  it("enables Bíblia/IA, Culto & Louvor, Campanhas, Cartas de Recomendação, Relatórios e Devocional em produção e staging", () => {
    for (const id of ["bible-ai", "worship", "campaigns", "recommendation-letters", "reports", "devotional"] as const) {
      expect(isModuleEnabled(id, "production")).toBe(true);
      expect(isModuleEnabled(id, "staging")).toBe(true);
    }
  });

  it("denies unknown module ids by default", () => {
    // @ts-expect-error — id intencionalmente inválido para testar o default-deny
    expect(isModuleEnabled("not-a-real-module", "staging")).toBe(false);
  });
});

describe("isRouteEnabled", () => {
  it("disables staging-only routes (maquetes sem backend real) in production", () => {
    expect(isRouteEnabled("/admin/marketplace", "production")).toBe(false);
    expect(isRouteEnabled("/admin/comunidade", "production")).toBe(false);
  });

  it("enables staging-only routes in staging", () => {
    expect(isRouteEnabled("/admin/marketplace", "staging")).toBe(true);
    expect(isRouteEnabled("/admin/comunidade", "staging")).toBe(true);
  });

  it.each([
    "/admin/tv",
    "/admin/tv/ao-vivo",
    "/tv",
    "/tv/canal-principal",
    "/canal",
    "/canal/meu-canal",
    "/video/video-id",
  ])("keeps TV/Canal route %s staging-only", (route) => {
    expect(isRouteEnabled(route, "production")).toBe(false);
    expect(isRouteEnabled(route, "staging")).toBe(true);
  });

  it("disables /admin/discipulado in production and enables in staging", () => {
    expect(isRouteEnabled("/admin/discipulado", "production")).toBe(false);
    expect(isRouteEnabled("/admin/discipulado", "staging")).toBe(true);
  });

  it("disables /admin/teologia in production and enables in staging", () => {
    expect(isRouteEnabled("/admin/teologia", "production")).toBe(false);
    expect(isRouteEnabled("/admin/teologia", "staging")).toBe(true);
  });

  // OPERAÇÃO 4 (Missões) — mesma allowlist staging-only de
  // Discipulado/Teologia (contrato §13 da operação).
  it("disables /admin/missoes in production and enables in staging", () => {
    expect(isRouteEnabled("/admin/missoes", "production")).toBe(false);
    expect(isRouteEnabled("/admin/missoes", "staging")).toBe(true);
  });

  it.each([
    "/admin/cartas-transferencia",
    "/admin/certificados",
  ])("keeps %s staging-only during homologation", (route) => {
    expect(isRouteEnabled(route, "production")).toBe(false);
    expect(isRouteEnabled(route, "staging")).toBe(true);
  });

  // CORREÇÃO 2026-07-17: /admin/biblia, /admin/culto*, /admin/campanhas,
  // /admin/cartas-recomendacao e /admin/relatorios devem funcionar em
  // produção também — todos com backend real, nenhum depende de dado
  // fictício.
  it("keeps Bíblia, Culto, Campanhas, Cartas de Recomendação e Relatórios enabled in both production and staging", () => {
    for (const path of [
      "/admin/biblia",
      "/admin/culto",
      "/admin/culto/telao",
      "/admin/campanhas",
      "/admin/cartas-recomendacao",
      "/admin/relatorios",
    ]) {
      expect(isRouteEnabled(path, "production")).toBe(true);
      expect(isRouteEnabled(path, "staging")).toBe(true);
    }
  });

  it("does not restrict routes absent from the route→module map", () => {
    expect(isRouteEnabled("/admin/membros", "production")).toBe(true);
    expect(isRouteEnabled("/admin/financeiro", "production")).toBe(true);
    expect(isRouteEnabled("/admin/porteiro", "production")).toBe(true);
  });
});

describe("MODULE_REGISTRY", () => {
  it("has no duplicate ids", () => {
    const ids = MODULE_REGISTRY.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns null for unknown module definitions", () => {
    // @ts-expect-error — id intencionalmente inválido
    expect(getModuleDefinition("not-a-real-module")).toBeNull();
  });
});
