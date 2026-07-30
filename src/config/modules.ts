/**
 * Registro central da release do Ecclesia.
 *
 * Staging e produção executam o mesmo código e expõem os mesmos módulos.
 * O ambiente muda somente domínio, credenciais e dados. Funcionalidades
 * ainda não homologadas ficam desabilitadas nos dois ambientes e continuam
 * sendo desenvolvidas em branches/previews próprias.
 *
 * Esta trava de produto não substitui RLS: o banco continua sendo a defesa
 * real dos dados e das ações autorizadas.
 */
export type ModuleId =
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
  | "finance.executive"
  | "finance.campaigns"
  | "finance.accounts"
  | "finance.budget"
  | "finance.assets"
  | "finance.accountability"
  | "finance.audit"
  | "finance.intelligence"
  | "recommendation-letters"
  | "bible-ai"
  | "devotional"
  | "worship"
  | "campaigns"
  | "marketplace"
  | "community"
  | "reports"
  | "discipleship"
  | "theology"
  | "missions"
  | "official-documents"
  | "tv-digital"
  | "canal-ecclesia";

type ModuleAvailability = "both" | "disabled";

interface ModuleDefinition {
  id: ModuleId;
  availability: ModuleAvailability;
  label: string;
}

const ENABLED_MODULES: readonly ModuleDefinition[] = [
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
  { id: "wallet", availability: "both", label: "Carteira Ecclesia" },
  { id: "member-invite", availability: "both", label: "Convite de membro" },
  { id: "access-invite", availability: "both", label: "Convite de acesso" },
  { id: "gatekeeper", availability: "both", label: "Modo Porteiro" },
  { id: "bible-ai", availability: "both", label: "Bíblia / IA" },
  { id: "worship", availability: "both", label: "Culto & Louvor" },
  { id: "campaigns", availability: "both", label: "Campanhas" },
  { id: "recommendation-letters", availability: "both", label: "Cartas de Recomendação" },
  { id: "reports", availability: "both", label: "Relatórios" },
  { id: "devotional", availability: "both", label: "Devocional" },
  { id: "finance.treasury", availability: "both", label: "Financeiro — Tesouraria" },
  { id: "finance.tithes", availability: "both", label: "Financeiro — Dízimos & Ofertas" },
  { id: "finance.executive", availability: "both", label: "Financeiro — Executivo" },
  { id: "finance.campaigns", availability: "both", label: "Financeiro — Campanhas" },
  { id: "finance.accounts", availability: "both", label: "Financeiro — Contas" },
  { id: "finance.budget", availability: "both", label: "Financeiro — Orçamento" },
  { id: "finance.assets", availability: "both", label: "Financeiro — Patrimônio" },
  { id: "finance.accountability", availability: "both", label: "Financeiro — Prestação de Contas" },
  { id: "finance.audit", availability: "both", label: "Financeiro — Auditoria" },
  { id: "finance.intelligence", availability: "both", label: "Financeiro — Inteligência" },
  { id: "official-documents", availability: "both", label: "Documentos Oficiais" },
  { id: "discipleship", availability: "both", label: "Discipulado" },
  { id: "theology", availability: "both", label: "Teologia" },
  { id: "missions", availability: "both", label: "Missões" },
] as const;

const DEFERRED_MODULES: readonly ModuleDefinition[] = [
  { id: "marketplace", availability: "disabled", label: "Marketplace" },
  { id: "community", availability: "disabled", label: "Comunidade" },
  { id: "tv-digital", availability: "disabled", label: "TV Digital" },
  { id: "canal-ecclesia", availability: "disabled", label: "Canal Eclésia" },
] as const;

/** Registro idêntico nos dois ambientes. */
export const MODULE_REGISTRY: readonly ModuleDefinition[] = [
  ...ENABLED_MODULES,
  ...DEFERRED_MODULES,
];

const REGISTRY_BY_ID: ReadonlyMap<ModuleId, ModuleDefinition> = new Map(
  MODULE_REGISTRY.map((definition) => [definition.id, definition]),
);

/**
 * `appEnv` foi mantido apenas para compatibilidade com chamadas existentes.
 * A resposta não pode variar por ambiente.
 */
export function isModuleEnabled(id: ModuleId, _appEnv?: "production" | "staging"): boolean {
  return REGISTRY_BY_ID.get(id)?.availability === "both";
}

export function getModuleDefinition(id: ModuleId): ModuleDefinition | null {
  return REGISTRY_BY_ID.get(id) ?? null;
}

export function listEnabledModules(_appEnv?: "production" | "staging"): ModuleId[] {
  return MODULE_REGISTRY.filter((module) => module.availability === "both").map((module) => module.id);
}

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

export function isRouteEnabled(path: string, appEnv?: "production" | "staging"): boolean {
  const moduleId = ROUTE_MODULE_MAP[path];
  return moduleId ? isModuleEnabled(moduleId, appEnv) : true;
}

export function getModuleIdForRoute(path: string): ModuleId | null {
  return ROUTE_MODULE_MAP[path] ?? null;
}
