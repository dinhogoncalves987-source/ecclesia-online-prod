/**
 * Catálogo de responsabilidades e permissões operacionais do Ecclesia.
 *
 * Princípio central: a pessoa continua sendo membro. Responsabilidades são
 * autorizações cumulativas, vinculadas a uma unidade e nunca reescrevem
 * `members.member_role` nem substituem outras responsabilidades.
 *
 * O banco continua sendo a autoridade final. Este catálogo espelha a migration
 * `20260716130000_hierarchical_access_responsibilities.sql` apenas para montar a
 * interface e decidir visibilidade; toda concessão/revogação é validada por RPC.
 */

export const ACCESS_PERMISSION_KEYS = [
  "access.manage",
  "organization.manage",
  "members.read",
  "members.write",
  "members.invite",
  // Acesso a ocorrências/histórico pastoral marcados como confidenciais
  // (ver 20260728090000_shared_institutional_history_foundation.sql).
  // NÃO é concedida automaticamente a quem só tem members.read/write —
  // apenas a quem já possui todas as permissões de governança.
  "members.confidential",
  "finance.read",
  "finance.write",
  "finance.approve",
  "documents.read",
  "documents.write",
  "agenda.read",
  "agenda.write",
  "communications.read",
  "communications.write",
  "groups.read",
  "groups.manage",
  "schedules.read",
  "schedules.write",
  "worship.read",
  "worship.write",
  "gatekeeper.use",
  "requests.read",
  "requests.manage",
  "chat.secretaria",
] as const;

export type AccessPermission = (typeof ACCESS_PERMISSION_KEYS)[number];

export const ACCESS_RESPONSIBILITY_KEYS = [
  "church_admin",
  "responsible_pastor",
  "access_manager",
  "secretary",
  "assistant_secretary",
  "treasurer",
  "assistant_treasurer",
  "accountant",
  "member_manager",
  "documents_manager",
  "schedule_manager",
  "communications_manager",
  "worship_manager",
  "group_manager",
  "gatekeeper",
  "requests_manager",
] as const;

export type AccessResponsibility = (typeof ACCESS_RESPONSIBILITY_KEYS)[number];

export type ResponsibilityCategory =
  | "governance"
  | "secretariat"
  | "finance"
  | "operations"
  | "ministries";

export interface AccessResponsibilityDefinition {
  key: AccessResponsibility;
  label: string;
  description: string;
  category: ResponsibilityCategory;
  permissions: readonly AccessPermission[];
  inheritsToDescendants: boolean;
  governance: boolean;
}

const ALL_OPERATIONAL_PERMISSIONS = ACCESS_PERMISSION_KEYS.filter(
  (permission) => permission !== "access.manage",
);

export const ACCESS_RESPONSIBILITIES: readonly AccessResponsibilityDefinition[] = [
  {
    key: "church_admin",
    label: "Administrador da unidade",
    description: "Administração da unidade e, quando aplicável, de toda a estrutura abaixo dela.",
    category: "governance",
    permissions: ACCESS_PERMISSION_KEYS,
    inheritsToDescendants: true,
    governance: true,
  },
  {
    key: "responsible_pastor",
    label: "Pastor responsável",
    description: "Responsabilidade pastoral e administrativa na unidade e em suas unidades subordinadas.",
    category: "governance",
    permissions: ACCESS_PERMISSION_KEYS,
    inheritsToDescendants: true,
    governance: true,
  },
  {
    key: "access_manager",
    label: "Gestor de acessos",
    description: "Delega trabalhos e responsabilidades dentro do limite hierárquico recebido.",
    category: "governance",
    permissions: ["access.manage", "members.read"],
    inheritsToDescendants: true,
    governance: true,
  },
  {
    key: "secretary",
    label: "Secretário(a)",
    description: "Opera membros, documentos, agenda, comunicação, solicitações e chat da secretaria.",
    category: "secretariat",
    permissions: [
      "members.read", "members.write", "members.invite", "documents.read",
      "documents.write", "agenda.read", "agenda.write", "communications.read",
      "communications.write", "requests.read", "requests.manage", "chat.secretaria",
    ],
    inheritsToDescendants: false,
    governance: false,
  },
  {
    key: "assistant_secretary",
    label: "Subsecretário(a)",
    description: "Apoia a secretaria em membros, documentos, agenda e solicitações.",
    category: "secretariat",
    permissions: [
      "members.read", "members.write", "members.invite", "documents.read",
      "documents.write", "agenda.read", "agenda.write", "requests.read",
      "requests.manage", "chat.secretaria",
    ],
    inheritsToDescendants: false,
    governance: false,
  },
  {
    key: "treasurer",
    label: "Tesoureiro(a)",
    description: "Opera e aprova o financeiro da unidade.",
    category: "finance",
    permissions: ["finance.read", "finance.write", "finance.approve"],
    inheritsToDescendants: false,
    governance: false,
  },
  {
    key: "assistant_treasurer",
    label: "Subtesoureiro(a)",
    description: "Apoia os lançamentos financeiros sem poder de aprovação final.",
    category: "finance",
    permissions: ["finance.read", "finance.write"],
    inheritsToDescendants: false,
    governance: false,
  },
  {
    key: "accountant",
    label: "Contador(a)",
    description: "Consulta o financeiro e seus relatórios para conferência contábil.",
    category: "finance",
    permissions: ["finance.read"],
    inheritsToDescendants: false,
    governance: false,
  },
  {
    key: "member_manager",
    label: "Operador de membros",
    description: "Trabalha exclusivamente no cadastro e na validação de membros.",
    category: "secretariat",
    permissions: ["members.read", "members.write", "members.invite"],
    inheritsToDescendants: false,
    governance: false,
  },
  {
    key: "documents_manager",
    label: "Operador de documentos",
    description: "Cria e organiza documentos da unidade.",
    category: "operations",
    permissions: ["documents.read", "documents.write"],
    inheritsToDescendants: false,
    governance: false,
  },
  {
    key: "schedule_manager",
    label: "Coordenador de agenda e escalas",
    description: "Organiza agenda, eventos e escalas da unidade.",
    category: "operations",
    permissions: ["agenda.read", "agenda.write", "schedules.read", "schedules.write"],
    inheritsToDescendants: false,
    governance: false,
  },
  {
    key: "communications_manager",
    label: "Responsável por comunicação",
    description: "Publica comunicados e administra a comunicação da unidade.",
    category: "operations",
    permissions: ["communications.read", "communications.write"],
    inheritsToDescendants: false,
    governance: false,
  },
  {
    key: "worship_manager",
    label: "Responsável por culto e louvor",
    description: "Organiza repertórios, roteiros e recursos do culto quando o módulo estiver liberado.",
    category: "ministries",
    permissions: ["worship.read", "worship.write", "schedules.read", "schedules.write"],
    inheritsToDescendants: false,
    governance: false,
  },
  {
    key: "group_manager",
    label: "Coordenador de grupos e departamentos",
    description: "Cria e coordena grupos e departamentos da unidade.",
    category: "ministries",
    permissions: ["groups.read", "groups.manage", "schedules.read", "schedules.write"],
    inheritsToDescendants: false,
    governance: false,
  },
  {
    key: "gatekeeper",
    label: "Porteiro / recepção",
    description: "Valida a carteira e o QR Code dos membros sem alterar o perfil da pessoa.",
    category: "operations",
    permissions: ["gatekeeper.use", "members.read"],
    inheritsToDescendants: false,
    governance: false,
  },
  {
    key: "requests_manager",
    label: "Operador de solicitações",
    description: "Atende e acompanha solicitações administrativas da unidade.",
    category: "operations",
    permissions: ["requests.read", "requests.manage", "members.read"],
    inheritsToDescendants: false,
    governance: false,
  },
] as const;

export const ACCESS_RESPONSIBILITY_BY_KEY = new Map(
  ACCESS_RESPONSIBILITIES.map((definition) => [definition.key, definition]),
);

export const RESPONSIBILITY_CATEGORY_LABELS: Record<ResponsibilityCategory, string> = {
  governance: "Governo e delegação",
  secretariat: "Secretaria",
  finance: "Financeiro",
  operations: "Operações",
  ministries: "Grupos e ministérios",
};

export const ROUTE_ACCESS_PERMISSIONS: Partial<Record<string, AccessPermission>> = {
  "/admin/financeiro": "finance.read",
  "/admin/membros": "members.read",
  "/admin/grupos": "groups.read",
  "/admin/documentos": "documents.read",
  "/admin/gerenciar-acessos": "access.manage",
  "/admin/congregacoes": "access.manage",
  "/admin/chat-secretaria": "chat.secretaria",
  "/admin/solicitacoes": "requests.read",
  "/admin/porteiro": "gatekeeper.use",
};

export function isAccessResponsibility(value: string): value is AccessResponsibility {
  return (ACCESS_RESPONSIBILITY_KEYS as readonly string[]).includes(value);
}

const LEGACY_ROLE_RESPONSIBILITY: Readonly<Record<string, AccessResponsibility>> = {
  church_admin: "church_admin",
  pastor: "responsible_pastor",
  secretary: "secretary",
  tesoureiro: "treasurer",
  contador: "accountant",
  leader: "group_manager",
  porteiro: "gatekeeper",
};

/** Compatibilidade de leitura para convites criados antes das responsabilidades cumulativas. */
export function responsibilitiesFromInvite(
  responsibilityTypes: readonly string[] | null | undefined,
  legacyRole: string | null | undefined,
): AccessResponsibility[] {
  const normalized = (responsibilityTypes ?? []).filter(isAccessResponsibility);
  if (normalized.length > 0) return [...new Set(normalized)];
  const legacyResponsibility = legacyRole ? LEGACY_ROLE_RESPONSIBILITY[legacyRole] : undefined;
  return legacyResponsibility ? [legacyResponsibility] : [];
}

export function permissionsForResponsibilities(
  responsibilities: Iterable<string>,
): Set<AccessPermission> {
  const permissions = new Set<AccessPermission>();
  for (const responsibility of responsibilities) {
    const definition = ACCESS_RESPONSIBILITY_BY_KEY.get(responsibility as AccessResponsibility);
    for (const permission of definition?.permissions ?? []) permissions.add(permission);
  }
  return permissions;
}

export function mergeAccessResponsibilities(
  current: Iterable<AccessResponsibility>,
  granted: Iterable<AccessResponsibility>,
): Set<AccessResponsibility> {
  return new Set([...current, ...granted]);
}

export function operationalPermissionCount(): number {
  return ALL_OPERATIONAL_PERMISSIONS.length;
}
