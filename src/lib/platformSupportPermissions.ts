/**
 * platformSupportPermissions.ts
 *
 * Matriz central de permissões da plataforma Ecclesia por perfil de suporte.
 *
 * FONTE DE VERDADE: este arquivo TypeScript é a regra executável.
 * A tabela `platform_support_permissions` no banco é espelho/referência.
 *
 * Perfis:
 *   super_admin          — acesso total à plataforma
 *   platform_admin       — acesso amplo (sem ações críticas de plataforma)
 *   support_secretaria   — módulos de secretaria de qualquer org
 *   support_financeiro   — módulos financeiros de qualquer org
 *   support_culto_louvor — módulos de culto e louvor de qualquer org
 *   support_tecnico      — módulos técnicos/estruturais de qualquer org
 *   support_implantacao  — módulos de implantação de qualquer org
 *   support_readonly     — leitura em todos os módulos autorizados
 */

export type PlatformRole =
  | "super_admin"
  | "platform_admin"
  | "support_secretaria"
  | "support_financeiro"
  | "support_culto_louvor"
  | "support_tecnico"
  | "support_implantacao"
  | "support_readonly";

export type ModuleKey =
  | "dashboard"
  | "conversas"
  | "biblia"
  | "culto_louvor"
  | "campanhas"
  | "secretaria"
  | "membros"
  | "carteira_membros"
  | "cartas_recomendacao"
  | "solicitacoes"
  | "documentos"
  | "comunicacao"
  | "agenda"
  | "escalas"
  | "pequenos_grupos"
  | "assembleia_geral"
  | "financeiro"
  | "relatorios"
  | "comunidade"
  | "marketplace"
  | "unidades_locais"
  | "gerenciador_acesso"
  | "configuracoes"
  | "auditoria"
  | "suporte";

export interface ModulePermission {
  canView:   boolean;
  canCreate: boolean;
  canEdit:   boolean;
  canDelete: boolean;
  canManage: boolean;
}

const FULL: ModulePermission    = { canView: true,  canCreate: true,  canEdit: true,  canDelete: true,  canManage: true  };
const READWRITE: ModulePermission = { canView: true,  canCreate: true,  canEdit: true,  canDelete: false, canManage: false };
const READONLY: ModulePermission  = { canView: true,  canCreate: false, canEdit: false, canDelete: false, canManage: false };
const NONE: ModulePermission      = { canView: false, canCreate: false, canEdit: false, canDelete: false, canManage: false };

/** Returns FULL for all modules listed, NONE for the rest. */
const allFull = (): Record<ModuleKey, ModulePermission> =>
  Object.fromEntries(
    (
      [
        "dashboard","conversas","biblia","culto_louvor","campanhas",
        "secretaria","membros","carteira_membros","cartas_recomendacao",
        "solicitacoes","documentos","comunicacao","agenda","escalas",
        "pequenos_grupos","assembleia_geral","financeiro","relatorios",
        "comunidade","marketplace","unidades_locais","gerenciador_acesso",
        "configuracoes","auditoria","suporte",
      ] as ModuleKey[]
    ).map((k) => [k, FULL]),
  ) as Record<ModuleKey, ModulePermission>;

export const PLATFORM_SUPPORT_PERMISSIONS: Record<PlatformRole, Record<ModuleKey, ModulePermission>> = {
  // ── Super Admin: tudo ──────────────────────────────────────────────────────
  super_admin: allFull(),

  // ── Platform Admin: tudo exceto ações críticas de plataforma ──────────────
  platform_admin: {
    ...allFull(),
    configuracoes: READONLY,
  },

  // ── Suporte Secretaria ─────────────────────────────────────────────────────
  support_secretaria: {
    dashboard:           READONLY,
    conversas:           READWRITE,
    biblia:              READONLY,
    culto_louvor:        NONE,
    campanhas:           NONE,
    secretaria:          READWRITE,
    membros:             READWRITE,
    carteira_membros:    READONLY,
    cartas_recomendacao: READWRITE,
    solicitacoes:        READWRITE,
    documentos:          READWRITE,
    comunicacao:         READWRITE,
    agenda:              READWRITE,
    escalas:             READWRITE,
    pequenos_grupos:     READWRITE,
    assembleia_geral:    READWRITE,
    financeiro:          NONE,
    relatorios:          NONE,
    comunidade:          NONE,
    marketplace:         NONE,
    unidades_locais:     NONE,
    gerenciador_acesso:  NONE,
    configuracoes:       NONE,
    auditoria:           NONE,
    suporte:             READONLY,
  },

  // ── Suporte Financeiro ─────────────────────────────────────────────────────
  support_financeiro: {
    dashboard:           READONLY,
    conversas:           READWRITE,
    biblia:              NONE,
    culto_louvor:        NONE,
    campanhas:           NONE,
    secretaria:          NONE,
    membros:             READONLY,
    carteira_membros:    NONE,
    cartas_recomendacao: NONE,
    solicitacoes:        NONE,
    documentos:          NONE,
    comunicacao:         NONE,
    agenda:              NONE,
    escalas:             NONE,
    pequenos_grupos:     NONE,
    assembleia_geral:    NONE,
    financeiro:          READWRITE,
    relatorios:          READONLY,
    comunidade:          NONE,
    marketplace:         NONE,
    unidades_locais:     NONE,
    gerenciador_acesso:  NONE,
    configuracoes:       NONE,
    auditoria:           NONE,
    suporte:             READONLY,
  },

  // ── Suporte Culto e Louvor ─────────────────────────────────────────────────
  support_culto_louvor: {
    dashboard:           READONLY,
    conversas:           READWRITE,
    biblia:              READONLY,
    culto_louvor:        READWRITE,
    campanhas:           READWRITE,
    secretaria:          NONE,
    membros:             NONE,
    carteira_membros:    NONE,
    cartas_recomendacao: NONE,
    solicitacoes:        NONE,
    documentos:          NONE,
    comunicacao:         NONE,
    agenda:              READONLY,
    escalas:             READWRITE,
    pequenos_grupos:     NONE,
    assembleia_geral:    NONE,
    financeiro:          NONE,
    relatorios:          NONE,
    comunidade:          NONE,
    marketplace:         NONE,
    unidades_locais:     NONE,
    gerenciador_acesso:  NONE,
    configuracoes:       NONE,
    auditoria:           NONE,
    suporte:             READONLY,
  },

  // ── Suporte Técnico ────────────────────────────────────────────────────────
  support_tecnico: {
    dashboard:           READONLY,
    conversas:           READWRITE,
    biblia:              NONE,
    culto_louvor:        NONE,
    campanhas:           NONE,
    secretaria:          NONE,
    membros:             NONE,
    carteira_membros:    NONE,
    cartas_recomendacao: NONE,
    solicitacoes:        NONE,
    documentos:          NONE,
    comunicacao:         NONE,
    agenda:              NONE,
    escalas:             NONE,
    pequenos_grupos:     NONE,
    assembleia_geral:    NONE,
    financeiro:          NONE,
    relatorios:          NONE,
    comunidade:          NONE,
    marketplace:         NONE,
    unidades_locais:     READWRITE,
    gerenciador_acesso:  READONLY,
    configuracoes:       READWRITE,
    auditoria:           READONLY,
    suporte:             READONLY,
  },

  // ── Suporte Implantação ────────────────────────────────────────────────────
  support_implantacao: {
    dashboard:           READONLY,
    conversas:           READWRITE,
    biblia:              NONE,
    culto_louvor:        NONE,
    campanhas:           NONE,
    secretaria:          READWRITE,
    membros:             READWRITE,
    carteira_membros:    NONE,
    cartas_recomendacao: NONE,
    solicitacoes:        READWRITE,
    documentos:          READWRITE,
    comunicacao:         NONE,
    agenda:              NONE,
    escalas:             NONE,
    pequenos_grupos:     NONE,
    assembleia_geral:    NONE,
    financeiro:          NONE,
    relatorios:          NONE,
    comunidade:          NONE,
    marketplace:         NONE,
    unidades_locais:     READWRITE,
    gerenciador_acesso:  READWRITE,
    configuracoes:       NONE,
    auditoria:           NONE,
    suporte:             READONLY,
  },

  // ── Suporte Somente Leitura ────────────────────────────────────────────────
  support_readonly: {
    dashboard:           READONLY,
    conversas:           READONLY,
    biblia:              READONLY,
    culto_louvor:        READONLY,
    campanhas:           READONLY,
    secretaria:          READONLY,
    membros:             READONLY,
    carteira_membros:    READONLY,
    cartas_recomendacao: READONLY,
    solicitacoes:        READONLY,
    documentos:          READONLY,
    comunicacao:         READONLY,
    agenda:              READONLY,
    escalas:             READONLY,
    pequenos_grupos:     READONLY,
    assembleia_geral:    READONLY,
    financeiro:          READONLY,
    relatorios:          READONLY,
    comunidade:          READONLY,
    marketplace:         READONLY,
    unidades_locais:     READONLY,
    gerenciador_acesso:  NONE,
    configuracoes:       NONE,
    auditoria:           NONE,
    suporte:             READONLY,
  },
};

/** All platform roles including support agents. */
export const ALL_PLATFORM_ROLES: PlatformRole[] = [
  "super_admin",
  "platform_admin",
  "support_secretaria",
  "support_financeiro",
  "support_culto_louvor",
  "support_tecnico",
  "support_implantacao",
  "support_readonly",
];

/** Display labels for platform roles. */
export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  super_admin:          "Super Admin",
  platform_admin:       "Administrador da Plataforma",
  support_secretaria:   "Suporte — Secretaria",
  support_financeiro:   "Suporte — Financeiro",
  support_culto_louvor: "Suporte — Culto e Louvor",
  support_tecnico:      "Suporte — Técnico",
  support_implantacao:  "Suporte — Implantação",
  support_readonly:     "Suporte — Somente Leitura",
};

/** Returns true if the given profile_role string is a platform-level role. */
export function isPlatformRole(role: string | null | undefined): role is PlatformRole {
  if (!role) return false;
  return (ALL_PLATFORM_ROLES as string[]).includes(role.toLowerCase().trim());
}

/** Returns the permissions for a given platform role + module. */
export function getPlatformModulePermission(
  platformRole: string | null | undefined,
  moduleKey: ModuleKey,
): ModulePermission {
  if (!platformRole || !isPlatformRole(platformRole)) return NONE;
  return PLATFORM_SUPPORT_PERMISSIONS[platformRole][moduleKey] ?? NONE;
}

/** Returns true if the given platform role can view the given module. */
export function platformCanView(
  platformRole: string | null | undefined,
  moduleKey: ModuleKey,
): boolean {
  return getPlatformModulePermission(platformRole, moduleKey).canView;
}

/** Returns the list of modules a platform role can view. */
export function getViewableModules(platformRole: string | null | undefined): ModuleKey[] {
  if (!platformRole || !isPlatformRole(platformRole)) return [];
  const perms = PLATFORM_SUPPORT_PERMISSIONS[platformRole];
  return (Object.keys(perms) as ModuleKey[]).filter((k) => perms[k].canView);
}
