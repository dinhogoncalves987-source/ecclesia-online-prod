/**
 * src/config/modules.ts
 *
 * Allowlist central de módulos por ambiente. Menu (AdminLayout) e roteamento
 * (App.tsx) usam SEMPRE `isModuleEnabled` / `isRouteEnabled` — a regra nunca
 * é duplicada entre os dois lugares.
 *
 * Importante:
 *   - Esconder um módulo aqui NUNCA substitui RLS no banco. As políticas de
 *     acesso continuam sendo a única defesa real dos dados; isto é apenas
 *     uma camada de produto/UX que evita expor funcionalidades ainda em
 *     teste, demo ou fora da release urgente de gestão.
 *   - Nenhum módulo é apagado por estar desabilitado em produção — apenas
 *     sua disponibilidade é controlada por ambiente (`env: "staging"`
 *     significa "preservado, disponível somente em staging").
 *   - TV Digital e Canal Eclésia pertencem ao produto e estão registrados
 *     aqui como stage-only; o código deles vive na branch histórica
 *     `staging-tv-canal` e não foi copiado/misturado nesta integração — ver
 *     docs/AMBIENTES_PRODUCAO_STAGING.md para o procedimento de restauração
 *     controlada na nova branch `staging`.
 */
import { environment } from "./environment";

export type ModuleId =
  // Allowlist urgente de produção (também disponível em staging)
  | "dashboard"
  | "members"
  | "congregations"
  | "institutional-config"
  | "access-management"
  | "platform-cockpit"
  | "agenda"
  | "documents"
  | "admin-chat"
  | "groups"
  | "schedules"
  | "prayer-requests"
  | "general-assembly"
  | "admin-requests"
  | "profile"
  | "finance.treasury"
  | "finance.tithes"
  | "wallet"
  | "member-invite"
  | "access-invite"
  | "gatekeeper"
  // Financeiro — restauradas fase a fase (Fases A-H, 2026-07-20 a
  // 2026-07-24); todas ligadas a dados reais, disponíveis em produção
  // (availability: "both" abaixo). Agrupadas aqui só por afinidade, não por
  // ambiente.
  | "finance.executive"
  | "finance.campaigns"
  | "finance.accounts"
  | "finance.budget"
  | "finance.assets"
  | "finance.accountability"
  | "finance.audit"
  | "finance.intelligence"
  // Preservados/em teste — habilitados apenas em staging
  | "recommendation-letters"
  | "bible-ai"
  | "devotional"
  | "worship"
  | "campaigns"
  | "marketplace"
  | "community"
  | "reports"
  // OPERAÇÃO 2 — Discipulado. Migrations criadas mas AINDA NÃO aplicadas em
  // nenhum ambiente (ver docs/architecture/operacao-2-discipulado.md) —
  // portanto staging-only por definição, nunca "both", até serem aplicadas e
  // validadas em staging real.
  | "discipleship"
  // OPERAÇÃO 3 — Teologia. Migrations criadas mas AINDA NÃO aplicadas em
  // nenhum ambiente (ver docs/architecture/operacao-3-teologia.md) —
  // staging-only por definição, mesmo padrão do Discipulado.
  | "theology"
  // OPERAÇÃO 4 — Missões. Migrations criadas mas AINDA NÃO aplicadas em
  // nenhum ambiente (ver docs/architecture/operacao-4-missoes.md) —
  // staging-only por definição, mesmo padrão do Discipulado/Teologia.
  | "missions"
  | "official-documents"
  // Stage-only, preservados na branch histórica staging-tv-canal
  | "tv-digital"
  | "canal-ecclesia";

type ModuleAvailability = "both" | "staging";

interface ModuleDefinition {
  id: ModuleId;
  availability: ModuleAvailability;
  label: string;
  note?: string;
}

// FASE 6 (separação de código por build) — mesma técnica de tree-shaking
// estático usada em src/App.tsx (`IS_STAGING_BUILD ? lazy(...) : null`):
// `import.meta.env.VITE_APP_ENV` é inlined pelo Vite como string literal em
// build time, então o ramo `true`/`false` abaixo é eliminado pelo
// Rollup/esbuild antes mesmo de gerar o bundle — o array
// `STAGING_ONLY_MODULES` (e todo texto/nota que ele carrega, incluindo os
// próprios ids "tv-digital"/"canal-ecclesia" e as notas
// "usa financeDemo"/"usa campaignsDemo") NUNCA chega ao bundle de produção.
// Antes desta correção, MODULE_REGISTRY era um único array sempre presente
// nos dois builds — os módulos reais (páginas/componentes) já eram
// corretamente excluídos da produção via lazy-loading condicional em
// App.tsx, mas os IDS/notas desta allowlist ainda apareciam como strings no
// chunk de entrada, o que scripts/verify-production-bundle.mjs
// corretamente reportava como violação de separação de ambientes.
const IS_STAGING_BUILD = import.meta.env.VITE_APP_ENV === "staging";

/** Allowlist urgente de produção — sempre presente nos dois builds. */
const PRODUCTION_MODULES: readonly ModuleDefinition[] = [
  { id: "dashboard", availability: "both", label: "Dashboard" },
  { id: "members", availability: "both", label: "Membros" },
  { id: "congregations", availability: "both", label: "Congregações e hierarquia" },
  { id: "institutional-config", availability: "both", label: "Configuração institucional" },
  { id: "access-management", availability: "both", label: "Gerenciamento de acessos" },
  { id: "platform-cockpit", availability: "both", label: "Cockpit da plataforma" },
  { id: "agenda", availability: "both", label: "Agenda" },
  { id: "documents", availability: "both", label: "Documentos" },
  { id: "admin-chat", availability: "both", label: "Comunicação / chat administrativo" },
  { id: "groups", availability: "both", label: "Pequenos grupos" },
  { id: "schedules", availability: "both", label: "Escalas" },
  { id: "prayer-requests", availability: "both", label: "Pedidos de oração" },
  { id: "general-assembly", availability: "both", label: "Assembleia geral" },
  { id: "admin-requests", availability: "both", label: "Solicitações administrativas" },
  { id: "profile", availability: "both", label: "Perfil" },

  { id: "finance.treasury", availability: "both", label: "Financeiro — Tesouraria" },

  // CORREÇÃO 2026-07-17 — "Contas" passou a consultar `transactions` real
  // (contas a pagar/receber com status/data reais, sem financeDemo como
  // fonte de dado exibido) — ver src/components/financeiro/FinanceAccounts.tsx.
  { id: "finance.accounts", availability: "both", label: "Financeiro — Contas" },

  // Hardening do fluxo de convite/carteira/portaria concluído e com testes
  // aprovados (revisão de segurança do commit ee86c3d + revisão do fluxo de
  // convite de membro) — habilitado na allowlist urgente de produção.
  { id: "wallet", availability: "both", label: "Carteira Ecclesia" },
  { id: "member-invite", availability: "both", label: "Convite de membro" },
  { id: "access-invite", availability: "both", label: "Convite de acesso" },
  { id: "gatekeeper", availability: "both", label: "Modo Porteiro" },

  // A Bíblia não depende de nenhuma tabela/migration ainda não promovida —
  // é um chat de IA (edge function bible-chat) sem escrita no banco. Nunca
  // deveria ter sido classificada como staging-only; corrigido em 2026-07-17
  // após regressão que removeu o módulo do menu de produção.
  { id: "bible-ai", availability: "both", label: "Bíblia / IA" },

  // CORREÇÃO 2026-07-17 — promovidos de STAGING_ONLY_MODULES: os quatro têm
  // backend real no Supabase (nenhum depende de dado fictício/financeDemo
  // ou campaignsDemo como fonte de dados exibida ao usuário):
  //   - worship: worship_songs / worship_setlists (src/lib/worshipStorage.ts)
  //   - campaigns: campaigns / campaign_updates / campaign_media, com
  //     fallback correto para lista vazia (nunca dado de demonstração) via
  //     useCampaigns()/fetchCampaignsForChurch — ver src/hooks/useCampaigns.tsx
  //   - recommendation-letters: recommendation_letters (src/lib/recommendationLetters.ts)
  //   - reports: consulta members/transactions/events/prayer_requests/
  //     groups/documents reais via runScopedOrganizationQuery — ver
  //     src/pages/Relatorios.tsx
  { id: "worship", availability: "both", label: "Culto & Louvor" },
  { id: "campaigns", availability: "both", label: "Campanhas" },
  { id: "recommendation-letters", availability: "both", label: "Cartas de Recomendação" },
  { id: "reports", availability: "both", label: "Relatórios" },

  // CORREÇÃO 2026-07-20 — "devotional" foi classificado como staging-only por
  // engano numa reorganização anterior (FASE 6), removendo do Dashboard de
  // produção o card do versículo do dia sem autorização e sem relação com
  // dado fictício: a edge function daily-devotional serve um banco de
  // versículos bíblicos reais (curado, sem financeDemo/campaignsDemo) e a
  // página pública /devocional (compartilhamento do versículo com os
  // irmãos) também não depende de nenhum dado de demonstração. Mesma
  // categoria de "bible-ai" — promovido de volta para "both".
  { id: "devotional", availability: "both", label: "Devocional" },

  // CORREÇÃO 2026-07-20 (Fase A — restauração do Financeiro) — "Auditoria"
  // consulta finance_transaction_audit_logs real, populada automaticamente
  // por trigger em todo INSERT/UPDATE/DELETE de `transactions` (ver
  // src/components/financeiro/FinanceAudit.tsx). Nunca usou dado fictício
  // como fonte exibida — só estava presa à allowlist urgente junto das
  // demais abas do Financeiro. Promovida individualmente; as demais abas
  // (Executivo, Campanhas, Orçamento, Patrimônio, Prestação de Contas,
  // Inteligência) seguem cada uma sua própria fase de restauração.
  { id: "finance.audit", availability: "both", label: "Financeiro — Auditoria" },

  // CORREÇÃO 2026-07-20 (Fase B — restauração do Financeiro) — "Campanhas"
  // já consultava campaigns/campaign_contributions reais via useCampaigns()
  // (mesma fonte da página /admin/campanhas); só a taxa operacional usava
  // uma estimativa fixa de 2,5% em vez de somar gateway_fee_amount +
  // platform_fee_amount reais — corrigido em
  // src/components/financeiro/FinanceCampaigns.tsx. Nunca dependeu de
  // campaignsDemo como fonte de dado exibido (só helpers puros de
  // formatação/cálculo, que operam sobre o array real).
  { id: "finance.campaigns", availability: "both", label: "Financeiro — Campanhas" },

  // CORREÇÃO 2026-07-20 (Fase C — restauração do Financeiro) — "Dízimos &
  // Ofertas" foi removida do render em 07/07/2026 (antes até da separação
  // de bundle por ambiente) e nunca chegou a ser reclassificada aqui por
  // não existir mais no código. Restaurada consultando `transactions` real
  // (classificadas por categoria) — ver
  // src/components/financeiro/FinanceTithesOfferings.tsx. A configuração de
  // PIX agora persiste em finance_accounts (mesma tabela do PixCard).
  { id: "finance.tithes", availability: "both", label: "Financeiro — Dízimos & Ofertas" },

  // CORREÇÃO 2026-07-20 (Fase D — restauração do Financeiro) — "Orçamento"
  // passou a ler/gravar public.finance_budgets real (migration
  // 20260721090000_finance_budgets.sql), com "realizado" agregado de
  // `transactions` real por centro de custo — ver
  // src/components/financeiro/FinanceBudget.tsx. Não depende mais de
  // financeDemo.
  { id: "finance.budget", availability: "both", label: "Financeiro — Orçamento" },

  // CORREÇÃO 2026-07-22 (Fase E — restauração do Financeiro) — "Patrimônio"
  // passou a fazer CRUD real sobre public.finance_assets (migration
  // 20260722090000_finance_assets.sql) — ver
  // src/components/financeiro/FinanceAssets.tsx. Não depende mais de
  // financeDemo.
  { id: "finance.assets", availability: "both", label: "Financeiro — Patrimônio" },

  // CORREÇÃO 2026-07-23 (Fase F — restauração do Financeiro) — "Prestação de
  // Contas": os "Relatórios históricos" passaram a ler/gravar
  // public.finance_accountability_reports/_approvals real (migration
  // 20260723090000_finance_accountability.sql) — ver
  // src/components/financeiro/FinanceAccountability.tsx. Os "Relatórios
  // Contábeis" (FinanceReports.tsx), dentro da mesma aba, já usavam dados
  // reais desde antes. Não depende mais de financeDemo.
  { id: "finance.accountability", availability: "both", label: "Financeiro — Prestação de Contas" },

  // CORREÇÃO 2026-07-24 (Fase G — restauração do Financeiro) — "Executivo"
  // passou a agregar `transactions`/campanhas/finance_budgets reais (mesmas
  // fontes já usadas em Tesouraria/Campanhas/Orçamento) e a árvore real de
  // organizações (useChurch().congregations) para o consolidado por
  // hierarquia — ver src/components/financeiro/FinanceExecutive.tsx e
  // src/lib/financeInsights.ts. Não depende mais de financeDemo.
  { id: "finance.executive", availability: "both", label: "Financeiro — Executivo" },

  // CORREÇÃO 2026-07-24 (Fase H — restauração do Financeiro) — "Inteligência"
  // passou a gerar alertas/insights/ações por regras determinísticas sobre
  // dados reais (mesma fonte de src/lib/financeInsights.ts usada pelo
  // Executivo — comparação de período, orçamento, status de campanha e
  // prestação de contas) — ver
  // src/components/financeiro/FinanceIntelligence.tsx. Sem IA generativa,
  // sem dado fictício. Não depende mais de financeDemo.
  { id: "finance.intelligence", availability: "both", label: "Financeiro — Inteligência" },
] as const;

/**
 * Módulos "staging"-only: ids, labels e notas descritivas que só devem
 * existir no bundle de STAGING (ver IS_STAGING_BUILD acima). Nunca inclua
 * aqui nada que precise ser lido em produção — mesmo texto/comentário aqui
 * é código, e vaza para o chunk de entrada se não for eliminado por
 * tree-shaking.
 */
const STAGING_ONLY_MODULES: readonly ModuleDefinition[] = IS_STAGING_BUILD ? [
  // Não constam na allowlist urgente de produção — permanecem em teste.
  // ("bible-ai", "worship", "campaigns", "recommendation-letters",
  // "reports" e "devotional" foram promovidos para PRODUCTION_MODULES —
  // ver acima.)
  // Marketplace e Comunidade são telas de maquete (dado 100% fixo no
  // código-fonte, sem nenhuma tabela real no Supabase) — permanecem
  // staging-only até virarem funcionalidades reais, nunca por regressão.
  { id: "marketplace", availability: "staging", label: "Marketplace" },
  { id: "community", availability: "staging", label: "Comunidade" },

  // OPERAÇÃO 2 (2026-07-29) — Discipulado. Backend real (discipleship_*
  // tables/RPCs, ver supabase/migrations/20260729*), mas as migrations ainda
  // NÃO foram aplicadas em nenhum banco (staging ou produção) — permanece
  // staging-only até aplicação + validação. Promoção para "both" só depois
  // de: (1) aplicar as 4 migrations em staging, (2) validar RLS/RPCs com
  // dados reais, (3) só então promover para produção. Ver
  // docs/architecture/operacao-2-discipulado.md, seção "Disponibilidade".
  { id: "discipleship", availability: "staging", label: "Discipulado" },

  // OPERAÇÃO 3 (2026-07-30) — Teologia. Backend real (theology_* tables/
  // RPCs, ver supabase/migrations/20260730*), mas as migrations ainda NÃO
  // foram aplicadas em nenhum banco — permanece staging-only até aplicação +
  // validação, mesmo critério de promoção do Discipulado. Ver
  // docs/architecture/operacao-3-teologia.md, seção "Disponibilidade".
  { id: "theology", availability: "staging", label: "Teologia" },

  // OPERAÇÃO 4 (2026-07-31) — Missões. Backend real (missions_* tables/
  // RPCs, ver supabase/migrations/20260731*), mas as migrations ainda NÃO
  // foram aplicadas em nenhum banco — permanece staging-only até aplicação +
  // validação, mesmo critério de promoção do Discipulado/Teologia. Ver
  // docs/architecture/operacao-4-missoes.md, seção "Disponibilidade".
  { id: "missions", availability: "staging", label: "Missões" },

  // OPERAÇÃO 5 — Cartas de Transferência e Certificados Oficiais. Backend
  // real, QR permanente e documentos vinculados ao cadastro canônico, em
  // homologação exclusiva no staging antes de qualquer promoção.
  { id: "official-documents", availability: "staging", label: "Documentos Oficiais" },

  // Stage-only — preservados em staging-tv-canal, restauração controlada
  // documentada em docs/AMBIENTES_PRODUCAO_STAGING.md. Nenhuma rota/arquivo
  // foi copiado para esta integração; os identificadores existem aqui só
  // para que a allowlist já os classifique corretamente quando restaurados.
  { id: "tv-digital", availability: "staging", label: "TV Digital", note: "restaurar de staging-tv-canal" },
  { id: "canal-ecclesia", availability: "staging", label: "Canal Ecclésia", note: "restaurar de staging-tv-canal" },
] : [];

/**
 * Registro central. `availability: "both"` = produção + staging.
 * `availability: "staging"` = somente staging (em teste, demo, ou
 * aguardando restauração controlada). Em build de produção,
 * `STAGING_ONLY_MODULES` é sempre `[]` (tree-shaken) — ver IS_STAGING_BUILD.
 */
export const MODULE_REGISTRY: readonly ModuleDefinition[] = [
  ...PRODUCTION_MODULES,
  ...STAGING_ONLY_MODULES,
];

const REGISTRY_BY_ID: ReadonlyMap<ModuleId, ModuleDefinition> = new Map(
  MODULE_REGISTRY.map((definition) => [definition.id, definition]),
);

/**
 * True quando o módulo está habilitado no ambiente atual. Módulos
 * desconhecidos (não registrados) são negados por padrão.
 */
export function isModuleEnabled(id: ModuleId, appEnv: "production" | "staging" = environment.appEnv): boolean {
  const definition = REGISTRY_BY_ID.get(id);
  if (!definition) return false;
  if (definition.availability === "both") return true;
  return appEnv === "staging";
}

export function getModuleDefinition(id: ModuleId): ModuleDefinition | null {
  return REGISTRY_BY_ID.get(id) ?? null;
}

export function listEnabledModules(appEnv: "production" | "staging" = environment.appEnv): ModuleId[] {
  return MODULE_REGISTRY.filter((m) => isModuleEnabled(m.id, appEnv)).map((m) => m.id);
}

/**
 * Mapa rota → módulo, usado tanto pelo menu (AdminLayout) quanto pelo
 * roteamento (App.tsx) através de `isRouteEnabled`. Rotas ausentes deste
 * mapa não são controladas por ambiente (apenas por papel/role, via
 * useRole().canAccess) — nunca precisaram sair da allowlist urgente.
 */
const ROUTE_MODULE_MAP: Readonly<Record<string, ModuleId>> = {
  "/admin/campanhas": "campaigns",
  "/admin/biblia": "bible-ai",
  "/admin/culto": "worship",
  "/admin/culto/biblioteca": "worship",
  "/admin/culto/roteiros": "worship",
  "/admin/culto/telao": "worship",
  "/admin/culto/assistente": "worship",
  "/admin/cartas-recomendacao": "recommendation-letters",
  "/admin/relatorios": "reports",
  "/admin/marketplace": "marketplace",
  "/admin/comunidade": "community",
  "/admin/discipulado": "discipleship",
  "/admin/teologia": "theology",
  "/admin/missoes": "missions",
  "/admin/cartas-transferencia": "official-documents",
  "/admin/certificados": "official-documents",
};

/**
 * True quando a rota (path exato, sem parâmetros dinâmicos) está habilitada
 * no ambiente atual. Usa a mesma allowlist de `isModuleEnabled` — nunca uma
 * regra paralela.
 */
export function isRouteEnabled(path: string, appEnv: "production" | "staging" = environment.appEnv): boolean {
  const moduleId = ROUTE_MODULE_MAP[path];
  if (!moduleId) return true;
  return isModuleEnabled(moduleId, appEnv);
}

export function getModuleIdForRoute(path: string): ModuleId | null {
  return ROUTE_MODULE_MAP[path] ?? null;
}
