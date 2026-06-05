export type AdminRole =
  | "super_admin"
  | "church_admin"
  | "pastor"
  | "secretary"
  | "leader"
  | "tesoureiro"
  | "contador"
  | "member";

export type LegacyAppRole =
  | "superadmin"
  | "platform_admin"
  | "admin"
  | "pastor"
  | "secretary"
  | "tesoureiro"
  | "contador"
  | "obreiro"
  | "lider"
  | "membro"
  | AdminRole;

export const CANONICAL_ROLES: AdminRole[] = [
  "super_admin",
  "church_admin",
  "pastor",
  "secretary",
  "tesoureiro",
  "contador",
  "leader",
  "member",
];

export const normalizeRole = (role: LegacyAppRole | string | null | undefined): AdminRole => {
  switch (role) {
    case "platform_admin":
    case "super_admin":
    case "superadmin":
      return "super_admin";
    case "church_admin":
    case "admin":
      return "church_admin";
    case "pastor":
      return "pastor";
    case "secretary":
      return "secretary";
    case "tesoureiro":
      return "tesoureiro";
    case "contador":
      return "contador";
    case "leader":
    case "lider":
    case "obreiro":
      return "leader";
    case "member":
    case "membro":
    default:
      return "member";
  }
};

export const getHighestRole = (roles: Array<LegacyAppRole | string | null | undefined>): AdminRole => {
  const normalized = roles.map(normalizeRole);
  return CANONICAL_ROLES.find(role => normalized.includes(role)) || "member";
};

export const hasPermission = (
  currentRole: AdminRole | null | undefined,
  allowedRoles: AdminRole[],
) => {
  if (!currentRole) return false;
  return allowedRoles.includes(currentRole);
};

export const canManageChurch = (role: AdminRole | null | undefined) =>
  hasPermission(role, ["super_admin", "church_admin", "pastor", "secretary"]);

export const WORSHIP_WRITE_ROLES: AdminRole[] = [
  "super_admin",
  "church_admin",
  "pastor",
  "secretary",
  "leader",
];

export const canWriteWorship = (role: AdminRole | null | undefined) =>
  hasPermission(role, WORSHIP_WRITE_ROLES);

/** Secretaria: create/edit/delete em módulos administrativos da igreja. */
export const SECRETARIA_WRITE_ROLES: AdminRole[] = [
  "super_admin",
  "church_admin",
  "pastor",
  "secretary",
  "leader",
];

export const canWriteSecretaria = (role: AdminRole | null | undefined) =>
  hasPermission(role, SECRETARIA_WRITE_ROLES);

/** Escalas: excluir escala ou remover escalado (RLS sem leader). */
export const SECRETARIA_SCHEDULE_DELETE_ROLES: AdminRole[] = [
  "super_admin",
  "church_admin",
  "pastor",
  "secretary",
];

export const canDeleteSchedule = (role: AdminRole | null | undefined) =>
  hasPermission(role, SECRETARIA_SCHEDULE_DELETE_ROLES);

export const canSwitchChurch = (role: AdminRole | null | undefined) =>
  hasPermission(role, ["super_admin", "church_admin"]);
