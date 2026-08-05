import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, renderHook } from "@testing-library/react";
import { ChurchProvider } from "./useChurch";
import { useChurch } from "./useChurchContext";

const mockUseAuth = vi.fn();
const mockUseAuthBootstrap = vi.fn();
const mockUseSupportContext = vi.fn();
const fromMock = vi.fn();

vi.mock("./useAuth", () => ({ useAuth: () => mockUseAuth() }));
vi.mock("./useAuthBootstrap", () => ({ useAuthBootstrap: () => mockUseAuthBootstrap() }));
vi.mock("@/contexts/SupportContext", () => ({ useSupportContext: () => mockUseSupportContext() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));
function Probe() {
  const { church, churches, loading, hasActiveMembership, bootstrapError } = useChurch();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="bootstrapError">{String(bootstrapError)}</span>
      <span data-testid="hasActiveMembership">{String(hasActiveMembership)}</span>
      <span data-testid="church">{church ? church.id : "null"}</span>
      <span data-testid="churchesCount">{churches.length}</span>
    </div>
  );
}

function renderChurch() {
  return render(
    <ChurchProvider>
      <Probe />
    </ChurchProvider>,
  );
}

describe("ChurchProvider", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockUseAuthBootstrap.mockReset();
    mockUseSupportContext.mockReset();
    fromMock.mockReset();
    mockUseSupportContext.mockReturnValue({ isPlatformUser: false, activeSupportOrg: null, loadingPlatformRole: false });
  });

  // CENÁRIO OBRIGATÓRIO 6: falha real de bootstrap não deve fazer o
  // ChurchProvider concluir "sem vínculo" / disparar OrganizationPending.
  it("never resolves as 'no membership' when the shared bootstrap query really failed", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" } });
    mockUseAuthBootstrap.mockReturnValue({
      data: null,
      loading: false,
      isError: true,
      error: new Error("network error"),
      refetch: vi.fn(),
    });

    renderChurch();

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    expect(screen.getByTestId("bootstrapError").textContent).toBe("true");
    // Membership flag stays at its initial/stale value — never flips to a
    // confident "false" derived from an error.
    expect(screen.getByTestId("hasActiveMembership").textContent).toBe("false");
    expect(screen.getByTestId("church").textContent).toBe("null");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("resolves the active church normally when bootstrap succeeds with an active membership", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" } });
    mockUseAuthBootstrap.mockReturnValue({
      data: {
        platformRole: null,
        isSuperAdminRow: false,
        userRoles: [],
        memberships: [{ organization_id: "org-1", role: "church_admin", is_active: true }],
      },
      loading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    const orgResult = {
      data: [{ id: "org-1", parent_id: null, name: "Igreja 1", slug: "igreja-1", organization_type: "church" }],
      error: null,
    };
    const makeOrgQueryNode = (): unknown => {
      const node = {
        select: () => node,
        order: () => node,
        eq: () => node,
        in: () => node,
        then: (
          onFulfilled: (v: typeof orgResult) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => Promise.resolve(orgResult).then(onFulfilled, onRejected),
      };
      return node;
    };
    fromMock.mockReturnValue(makeOrgQueryNode());

    renderChurch();

    await waitFor(() => expect(screen.getByTestId("hasActiveMembership").textContent).toBe("true"));
    expect(screen.getByTestId("bootstrapError").textContent).toBe("false");
    expect(screen.getByTestId("church").textContent).toBe("org-1");
  });

  // Retomada da PWA — "contexto da organização ativa": o usuário pertence a
  // duas organizações e havia trocado para a segunda antes do app ter sido
  // reiniciado (kill de processo, fechar/reabrir, etc). Um novo mount do
  // ChurchProvider (equivalente a um reload completo) deve restaurar
  // exatamente a organização que estava ativa — não a primeira da lista —
  // lendo `ecclesia.activeChurchId.<userId>` do localStorage.
  it("restores the previously active organization (not the first one) from localStorage across a fresh mount", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" } });
    mockUseAuthBootstrap.mockReturnValue({
      data: {
        platformRole: null,
        isSuperAdminRow: false,
        userRoles: [],
        memberships: [
          { organization_id: "org-1", role: "church_admin", is_active: true },
          { organization_id: "org-2", role: "church_admin", is_active: true },
        ],
      },
      loading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    const orgResult = {
      data: [
        { id: "org-1", parent_id: null, name: "Igreja 1", slug: "igreja-1", organization_type: "church" },
        { id: "org-2", parent_id: null, name: "Igreja 2", slug: "igreja-2", organization_type: "church" },
      ],
      error: null,
    };
    const makeOrgQueryNode = (): unknown => {
      const node = {
        select: () => node,
        order: () => node,
        eq: () => node,
        in: () => node,
        then: (
          onFulfilled: (v: typeof orgResult) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => Promise.resolve(orgResult).then(onFulfilled, onRejected),
      };
      return node;
    };
    fromMock.mockReturnValue(makeOrgQueryNode());

    localStorage.setItem("ecclesia.activeChurchId.u1", "org-2");

    renderChurch();

    await waitFor(() => expect(screen.getByTestId("hasActiveMembership").textContent).toBe("true"));
    expect(screen.getByTestId("church").textContent).toBe("org-2");

    localStorage.removeItem("ecclesia.activeChurchId.u1");
  });
});

// ── Modo suporte (usuários de plataforma) — regressão da race condition ────
//
// Antes desta correção, `church` para isPlatformUser era escrito por DOIS
// efeitos concorrentes: um dentro de `fetchChurches` (disparado por QUALQUER
// mudança de referência do bootstrap, inclusive um refetch em segundo plano
// idêntico) que zerava `church`, e outro que o restaurava a partir de
// `activeSupportOrg` — mas só quando `activeSupportOrg` mudava de
// referência. Se o refetch do bootstrap ocorresse sem `activeSupportOrg`
// mudar, `church` ficava travado em `null` com `loading` já `false`,
// quebrando silenciosamente qualquer ação (`if (!church) return`) em
// andamento. Agora `church` é derivado diretamente de `activeSupportOrg`
// para usuários de plataforma — uma única fonte de verdade, sem gap.
describe("ChurchProvider — modo suporte (usuários de plataforma)", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockUseAuthBootstrap.mockReset();
    mockUseSupportContext.mockReset();
    fromMock.mockReset();
  });

  const SUPPORT_ORG_A = {
    id: "support-org-a",
    name: "Assembleia de Deus em Caxias do Sul",
    slug: "org-suporte-a",
    organization_type: "matriz",
    parent_id: null,
  };
  const SUPPORT_ORG_B = {
    id: "support-org-b",
    name: "Outra Organização",
    slug: "org-suporte-b",
    organization_type: "matriz",
    parent_id: null,
  };

  const platformBootstrapData = (extra: Record<string, unknown> = {}) => ({
    platformRole: "super_admin",
    isSuperAdminRow: true,
    userRoles: [],
    memberships: [],
    ...extra,
  });

  const emptyOrgQueryNode = (): unknown => {
    const result = { data: [], error: null };
    const node = {
      select: () => node,
      order: () => node,
      eq: () => node,
      in: () => node,
      then: (
        onFulfilled: (v: typeof result) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(result).then(onFulfilled, onRejected),
    };
    return node;
  };

  // CENÁRIO OBRIGATÓRIO 1: usuário de plataforma com activeSupportOrg definido.
  it("expõe activeSupportOrg como church quando isPlatformUser=true", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "admin-1" } });
    mockUseAuthBootstrap.mockReturnValue({
      data: platformBootstrapData(), loading: false, isError: false, error: null, refetch: vi.fn(),
    });
    mockUseSupportContext.mockReturnValue({
      isPlatformUser: true, activeSupportOrg: SUPPORT_ORG_A, loadingPlatformRole: false,
    });
    fromMock.mockReturnValue(emptyOrgQueryNode());

    const { result } = renderHook(() => useChurch(), { wrapper: ChurchProvider });

    await waitFor(() => expect(result.current.church?.id).toBe("support-org-a"));
    expect(result.current.loading).toBe(false);
    expect(result.current.profileChurchId).toBe("support-org-a");
  });

  // CENÁRIO OBRIGATÓRIO 2: refetch do bootstrap não transforma church em null.
  it("refetch em segundo plano do bootstrap NÃO zera church (regressão da race condition)", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "admin-1" } });
    mockUseSupportContext.mockReturnValue({
      isPlatformUser: true, activeSupportOrg: SUPPORT_ORG_A, loadingPlatformRole: false,
    });
    fromMock.mockReturnValue(emptyOrgQueryNode());
    mockUseAuthBootstrap.mockReturnValue({
      data: platformBootstrapData(), loading: false, isError: false, error: null, refetch: vi.fn(),
    });

    const { result, rerender } = renderHook(() => useChurch(), { wrapper: ChurchProvider });
    await waitFor(() => expect(result.current.church?.id).toBe("support-org-a"));

    // Simula exatamente o gatilho do bug original: `useAuthBootstrap` devolve
    // um novo objeto `data` (nova referência, ex.: refetchOnWindowFocus)
    // enquanto `activeSupportOrg` continua o mesmo.
    mockUseAuthBootstrap.mockReturnValue({
      data: platformBootstrapData({ _refetchedAt: 1 }),
      loading: false, isError: false, error: null, refetch: vi.fn(),
    });
    rerender();

    // `church` é derivado diretamente de `activeSupportOrg` — nunca passa
    // por `null`, nem mesmo momentaneamente.
    expect(result.current.church?.id).toBe("support-org-a");
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.church?.id).toBe("support-org-a");
  });

  // CENÁRIO OBRIGATÓRIO 3: troca do activeSupportOrg atualiza church corretamente.
  it("troca de activeSupportOrg atualiza church para a nova organização", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "admin-1" } });
    mockUseAuthBootstrap.mockReturnValue({
      data: platformBootstrapData(), loading: false, isError: false, error: null, refetch: vi.fn(),
    });
    fromMock.mockReturnValue(emptyOrgQueryNode());
    mockUseSupportContext.mockReturnValue({
      isPlatformUser: true, activeSupportOrg: SUPPORT_ORG_A, loadingPlatformRole: false,
    });

    const { result, rerender } = renderHook(() => useChurch(), { wrapper: ChurchProvider });
    await waitFor(() => expect(result.current.church?.id).toBe("support-org-a"));

    mockUseSupportContext.mockReturnValue({
      isPlatformUser: true, activeSupportOrg: SUPPORT_ORG_B, loadingPlatformRole: false,
    });
    rerender();

    await waitFor(() => expect(result.current.church?.id).toBe("support-org-b"));
    expect(result.current.profileChurchId).toBe("support-org-b");
  });

  // CENÁRIO OBRIGATÓRIO 4: ausência real de activeSupportOrg mantém ações
  // bloqueadas — enquanto a restauração ainda não terminou, `loading` fica
  // `true` (nunca expõe church=null como "pronto para uso"); só depois de
  // resolvida é que church=null + loading=false é um estado terminal válido
  // ("nenhuma organização selecionada", não um bug).
  it("sem activeSupportOrg resolvido, loading permanece true — nunca libera church=null como pronto", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "admin-1" } });
    mockUseAuthBootstrap.mockReturnValue({
      data: platformBootstrapData(), loading: false, isError: false, error: null, refetch: vi.fn(),
    });
    fromMock.mockReturnValue(emptyOrgQueryNode());
    mockUseSupportContext.mockReturnValue({
      isPlatformUser: true, activeSupportOrg: null, loadingPlatformRole: true,
    });

    const { result, rerender } = renderHook(() => useChurch(), { wrapper: ChurchProvider });
    expect(result.current.loading).toBe(true);
    expect(result.current.church).toBeNull();

    // Restauração concluída: de fato não há organização selecionada — este
    // é o estado terminal legítimo ("selecione uma organização"), distinto
    // do bug (que expunha church=null com loading=false por uma falha de
    // sincronização, não por ausência real de seleção).
    mockUseSupportContext.mockReturnValue({
      isPlatformUser: true, activeSupportOrg: null, loadingPlatformRole: false,
    });
    rerender();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.church).toBeNull();
  });

  // CENÁRIO OBRIGATÓRIO 5: usuário comum continua recebendo sua organização
  // normalmente — inclusive através de um refetch do bootstrap, que nunca
  // usou o caminho de `activeSupportOrg` e não deve ser afetado pela
  // correção. Cobre também a estabilidade de referência que os seletores
  // subordinados (ex.: `reloadSubOrgs` em Membros.tsx, que depende de
  // `[church]`) precisam para não recarregar/zerar espontaneamente.
  it("usuário comum (não-plataforma) mantém sua organização estável através de um refetch do bootstrap", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "member-1" } });
    mockUseSupportContext.mockReturnValue({ isPlatformUser: false, activeSupportOrg: null, loadingPlatformRole: false });

    const bootstrapForCommonUser = (extra: Record<string, unknown> = {}) => ({
      platformRole: null,
      isSuperAdminRow: false,
      userRoles: [],
      memberships: [{ organization_id: "org-common", role: "church_admin", is_active: true }],
      ...extra,
    });
    mockUseAuthBootstrap.mockReturnValue({
      data: bootstrapForCommonUser(), loading: false, isError: false, error: null, refetch: vi.fn(),
    });

    const orgResult = {
      data: [{ id: "org-common", parent_id: null, name: "Igreja Comum", slug: "igreja-comum", organization_type: "church" }],
      error: null,
    };
    const orgNode = (): unknown => {
      const node = {
        select: () => node,
        order: () => node,
        eq: () => node,
        in: () => node,
        then: (
          onFulfilled: (v: typeof orgResult) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => Promise.resolve(orgResult).then(onFulfilled, onRejected),
      };
      return node;
    };
    fromMock.mockReturnValue(orgNode());

    const { result, rerender } = renderHook(() => useChurch(), { wrapper: ChurchProvider });
    await waitFor(() => expect(result.current.church?.id).toBe("org-common"));

    mockUseAuthBootstrap.mockReturnValue({
      data: bootstrapForCommonUser({ _refetchedAt: 1 }),
      loading: false, isError: false, error: null, refetch: vi.fn(),
    });
    rerender();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.church?.id).toBe("org-common");
  });
});
