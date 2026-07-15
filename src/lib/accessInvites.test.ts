import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

vi.mock("@/lib/publicUrl", () => ({ getPublicAppUrl: () => "https://app.example.com" }));

import { createAccessInvite } from "./accessInvites";

const BASE = {
  organization_id: "org-1",
  invited_by: "user-1",
  full_name: "Pessoa",
  email: "pessoa@example.com",
  role: "member",
};

describe("createAccessInvite — fail closed", () => {
  beforeEach(() => fromMock.mockReset());

  it("rejects an empty e-mail before touching Supabase", async () => {
    const result = await createAccessInvite({ ...BASE, email: "   " });
    expect(result.error).toMatch(/e-mail é obrigatório/i);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects a platform/super-admin role before touching Supabase", async () => {
    const result = await createAccessInvite({ ...BASE, role: "super_admin" });
    expect(result.error).toMatch(/função inválida/i);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
