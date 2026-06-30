import type { Church } from "@/hooks/useChurchContext";

const PLATFORM_ADMIN_ROLE_VALUES = new Set([
  "platform_admin",
  "super_admin",
  "superadmin",
  // Support agents — belong to the platform, not to a specific church
  "support_secretaria",
  "support_financeiro",
  "support_culto_louvor",
  "support_tecnico",
  "support_implantacao",
  "support_readonly",
]);

/** Congregação demo (Jardim América) — referência para platform admin sem org ativa. */
export const DEMO_ORGANIZATION_ID = "11111111-0000-0000-0000-000000000004";

/** Matches DB `is_platform_admin` / app role normalization. */
export function isPlatformAdminRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return PLATFORM_ADMIN_ROLE_VALUES.has(role.trim().toLowerCase());
}

/**
 * Choose active org for platform admins: saved preference, demo congregação, then first congregação.
 */
export function pickDefaultActiveChurch(
  churches: Church[],
  storedChurchId: string | null | undefined,
): Church | null {
  if (churches.length === 0) return null;

  if (storedChurchId) {
    const stored = churches.find((c) => c.id === storedChurchId);
    if (stored) return stored;
  }

  const demoById = churches.find((c) => c.id === DEMO_ORGANIZATION_ID);
  if (demoById) return demoById;

  const demoSlug = churches.find((c) => c.slug === "congregacao-jardim-america");
  if (demoSlug) return demoSlug;

  const congregacao = churches.filter((c) => c.organization_type === "congregacao");
  if (congregacao.length > 0) return congregacao[0];

  return churches[0];
}
