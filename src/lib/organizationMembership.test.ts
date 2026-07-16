import { describe, it, expect } from "vitest";
import * as organizationMembership from "@/lib/organizationMembership";

// FASE 2 — regressão: nenhuma autoassociação organizacional por slug deve
// existir mais no cliente. `ensureOrganizationMembership` chamava a RPC
// `join_organization_by_slug`, que permitia qualquer usuário autenticado se
// vincular como membro de qualquer organização apenas conhecendo o slug
// público. Essa função foi removida do módulo e a RPC foi revogada/dropada
// no banco (ver supabase/migrations/20260715141000_remove_open_slug_join.sql).
describe("organizationMembership — sem autoassociação por slug", () => {
  it("não exporta mais ensureOrganizationMembership", () => {
    expect((organizationMembership as Record<string, unknown>).ensureOrganizationMembership).toBeUndefined();
  });

  it("normalizeChurchSlug continua disponível apenas para fins cosméticos (UX)", () => {
    expect(organizationMembership.normalizeChurchSlug(" minha-igreja ")).toBe("minha-igreja");
    expect(organizationMembership.normalizeChurchSlug(null)).toBeNull();
    expect(organizationMembership.normalizeChurchSlug("")).toBeNull();
  });

  it("buildSignupMetadata NUNCA inclui church_slug (mesmo com slug de convite presente)", () => {
    organizationMembership.clearPendingChurchSlug();
    const metadata = organizationMembership.buildSignupMetadata("Fulano de Tal", "igreja-teste");
    expect(metadata).toEqual({ full_name: "Fulano de Tal" });
    expect((metadata as Record<string, unknown>).church_slug).toBeUndefined();
  });

  it("buildSignupMetadata nunca inclui church_slug mesmo sem slug de convite", () => {
    organizationMembership.clearPendingChurchSlug();
    const metadata = organizationMembership.buildSignupMetadata("Fulano de Tal", null);
    expect(metadata).toEqual({ full_name: "Fulano de Tal" });
  });

  it("não exporta mais getInviteChurchSlug (não deve ler nem depender de user_metadata.church_slug)", () => {
    expect((organizationMembership as Record<string, unknown>).getInviteChurchSlug).toBeUndefined();
  });
});
