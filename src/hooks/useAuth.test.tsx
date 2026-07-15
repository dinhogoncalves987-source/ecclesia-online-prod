import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { AuthProvider, useAuth } from "./useAuth";

const signOutMock = vi.fn().mockResolvedValue({ error: null });
const getSessionMock = vi.fn();
const onAuthStateChangeMock = vi.fn();

type AuthStateChangeCallback = (event: string, session: unknown) => void;
let authStateChangeCallback: AuthStateChangeCallback | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (...args: unknown[]) => onAuthStateChangeMock(...args),
      getSession: (...args: unknown[]) => getSessionMock(...args),
      signOut: (...args: unknown[]) => signOutMock(...args),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

function AuthProbe() {
  const { user, loading, connectionIssue, retryConnection } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="connectionIssue">{String(connectionIssue)}</span>
      <span data-testid="user">{user ? user.id : "null"}</span>
      <button data-testid="retry" onClick={retryConnection}>Tentar novamente</button>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    signOutMock.mockClear();
    getSessionMock.mockReset();
    onAuthStateChangeMock.mockReset();
    localStorage.clear();
    authStateChangeCallback = null;
    onAuthStateChangeMock.mockImplementation((callback: AuthStateChangeCallback) => {
      authStateChangeCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  // CENÁRIO OBRIGATÓRIO 1: token persistido + getSession rejeita.
  it("with a persisted token, a rejected getSession() never logs out — before or after the 8s timeout", async () => {
    vi.useFakeTimers();
    localStorage.setItem("sb-testproject-auth-token", JSON.stringify({ access_token: "abc" }));
    getSessionMock.mockRejectedValue(new Error("network error"));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    // Let the rejected getSession() promise settle.
    await vi.advanceTimersByTimeAsync(0);

    // Before the 8s timeout: still resolving, definitely not logged out.
    expect(signOutMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("user").textContent).toBe("null");
    expect(screen.getByTestId("loading").textContent).toBe("true");

    // Advance well past the 8s safety timeout.
    await vi.advanceTimersByTimeAsync(8100);

    // After the timeout: must surface a reconnect state — NEVER commit(null)
    // and NEVER signOut. This is the core fix for PROBLEMA CRÍTICO 1.
    expect(signOutMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("user").textContent).toBe("null");
    expect(screen.getByTestId("connectionIssue").textContent).toBe("true");
  });

  // CENÁRIO OBRIGATÓRIO 2: sem token persistido + sessão nunca resolve.
  it("with no persisted token, a session that never resolves finalizes as unauthenticated after the timeout", async () => {
    vi.useFakeTimers();
    getSessionMock.mockReturnValue(new Promise(() => {})); // never settles

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await vi.advanceTimersByTimeAsync(8100);

    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(screen.getByTestId("user").textContent).toBe("null");
    expect(screen.getByTestId("connectionIssue").textContent).toBe("false");
    expect(signOutMock).not.toHaveBeenCalled();
  });

  // CENÁRIO OBRIGATÓRIO 3: evento SIGNED_OUT explícito.
  it("an explicit SIGNED_OUT event clears the session even though a token was persisted", async () => {
    localStorage.setItem("sb-testproject-auth-token", JSON.stringify({ access_token: "abc" }));
    const fakeSession = { user: { id: "user-123" } };
    getSessionMock.mockResolvedValue({ data: { session: fakeSession } });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("user-123"));

    authStateChangeCallback?.("SIGNED_OUT", null);

    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("null"));
    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(screen.getByTestId("connectionIssue").textContent).toBe("false");
  });

  it("resolves to unauthenticated (without calling signOut) when there was never a persisted session", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    expect(screen.getByTestId("user").textContent).toBe("null");
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("resolves to authenticated once getSession returns a valid persisted session", async () => {
    const fakeSession = { user: { id: "user-123" } };
    getSessionMock.mockResolvedValue({ data: { session: fakeSession } });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("user-123"));
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

  // CENÁRIO OBRIGATÓRIO 7 (aplicado ao próprio AuthProvider): "Tentar
  // novamente" chama retry e recupera o fluxo quando a consulta seguinte
  // funciona.
  it("retryConnection re-attempts resolution and recovers once the network comes back", async () => {
    vi.useFakeTimers();
    localStorage.setItem("sb-testproject-auth-token", JSON.stringify({ access_token: "abc" }));
    getSessionMock.mockRejectedValueOnce(new Error("network error"));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await vi.advanceTimersByTimeAsync(8100);
    expect(screen.getByTestId("connectionIssue").textContent).toBe("true");

    const fakeSession = { user: { id: "user-123" } };
    getSessionMock.mockResolvedValueOnce({ data: { session: fakeSession } });

    fireEvent.click(screen.getByTestId("retry"));
    await vi.advanceTimersByTimeAsync(0);

    expect(screen.getByTestId("connectionIssue").textContent).toBe("false");
    expect(screen.getByTestId("user").textContent).toBe("user-123");
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("never treats a corrupted/garbage value under a sb-*-auth-token key as a real persisted session", async () => {
    vi.useFakeTimers();
    // Garbage that isn't valid JSON, and a value that IS valid JSON but
    // doesn't look like a session payload — neither should count as "a
    // token was persisted".
    localStorage.setItem("sb-testproject-auth-token", "{not-json");
    getSessionMock.mockReturnValue(new Promise(() => {}));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await vi.advanceTimersByTimeAsync(8100);

    // No valid persisted session was found, so the timeout must resolve as
    // unauthenticated — not get stuck in a reconnect state forever.
    expect(screen.getByTestId("connectionIssue").textContent).toBe("false");
    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(screen.getByTestId("user").textContent).toBe("null");
  });
});
