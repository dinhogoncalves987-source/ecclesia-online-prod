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
  | "wallet"
  | "member-invite"
  | "access-invite"
  | "gatekeeper"
  // Financeiro — abas que ainda usam financeDemo/campaignsDemo (staging)
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

/**
 * Registro central. `availability: "both"` = produção + staging.
 * `availability: "staging"` = somente staging (em teste, demo, ou
 * aguardando restauração controlada).
 */
export const MODULE_REGISTRY: readonly ModuleDefinition[] = [
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

  // Hardening do fluxo de convite/carteira/portaria concluído e com testes
  // aprovados (revisão de segurança do commit ee86c3d + revisão do fluxo de
  // convite de membro) — habilitado na allowlist urgente de produção.
  { id: "wallet", availability: "both", label: "Carteira Ecclesia" },
  { id: "member-invite", availability: "both", label: "Convite de membro" },
  { id: "access-invite", availability: "both", label: "Convite de acesso" },
  { id: "gatekeeper", availability: "both", label: "Modo Porteiro" },

  // Financeiro — abas que ainda dependem de financeDemo/campaignsDemo.
  {
    id: "finance.executive",
    availability: "staging",
    label: "Financeiro — Executivo",
    note: "usa financeDemo",
  },
  {
    id: "finance.campaigns",
    availability: "staging",
    label: "Financeiro — Campanhas",
    note: "usa campaignsDemo",
  },
  {
    id: "finance.accounts",
    availability: "staging",
    label: "Financeiro — Contas",
    note: "usa financeDemo",
  },
  {
    id: "finance.budget",
    availability: "staging",
    label: "Financeiro — Orçamento",
    note: "usa financeDemo",
  },
  {
    id: "finance.assets",
    availability: "staging",
    label: "Financeiro — Patrimônio",
    note: "usa financeDemo",
  },
  {
    id: "finance.accountability",
    availability: "staging",
    label: "Financeiro — Prestação de Contas",
    note: "usa financeDemo",
  },
  {
    id: "finance.audit",
    availability: "staging",
    label: "Financeiro — Auditoria",
    note: "usa financeDemo",
  },
  {
    id: "finance.intelligence",
    availability: "staging",
    label: "Financeiro — Inteligência",
    note: "usa financeDemo",
  },

  // Não constam na allowlist urgente de produção — permanecem em teste.
  { id: "recommendation-letters", availability: "staging", label: "Cartas de Recomendação" },
  { id: "bible-ai", availability: "staging", label: "Bíblia / IA" },
  { id: "devotional", availability: "staging", label: "Devocional" },
  { id: "worship", availability: "staging", label: "Culto & Louvor" },
  { id: "campaigns", availability: "staging", label: "Campanhas" },
  { id: "marketplace", availability: "staging", label: "Marketplace" },
  { id: "community", availability: "staging", label: "Comunidade" },
  { id: "reports", availability: "staging", label: "Relatórios" },

  // Stage-only — preservados em staging-tv-canal, restauração controlada
  // documentada em docs/AMBIENTES_PRODUCAO_STAGING.md. Nenhuma rota/arquivo
  // foi copiado para esta integração; os identificadores existem aqui só
  // para que a allowlist já os classifique corretamente quando restaurados.
  { id: "tv-digital", availability: "staging", label: "TV Digital", note: "restaurar de staging-tv-canal" },
  { id: "canal-ecclesia", availability: "staging", label: "Canal Ecclésia", note: "restaurar de staging-tv-canal" },
] as const;

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
