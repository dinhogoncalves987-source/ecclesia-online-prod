import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { markBoot } from "@/lib/bootPerf";
import { queryClient } from "@/lib/queryClient";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /**
   * True when this device has a persisted Supabase session token that we
   * have NOT been able to confirm yet (offline, flaky network, backend
   * unavailable, or the confirmation attempt simply timed out). This is
   * intentionally distinct from "unauthenticated": consumers must render a
   * recoverable reconnect UI here — never the login form — and must never
   * treat it as a logout.
   */
  connectionIssue: boolean;
  /** Manually re-attempts session resolution (for a "Tentar novamente" action). */
  retryConnection: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  connectionIssue: false,
  retryConnection: () => {},
  signOut: async () => {},
});

/**
 * A value found under a Supabase-looking storage key only counts as
 * evidence of "there is a session to confirm" if it actually looks like a
 * session payload — an object with a non-empty `access_token` string, which
 * is the shape `@supabase/auth-js` persists under
 * `sb-<project-ref>-auth-token`. Anything else (corrupted JSON, unrelated
 * value, `null`) is NOT treated as a persisted session.
 *
 * We never log the raw or parsed value anywhere — only the boolean result —
 * since it may contain live access/refresh tokens.
 */
function looksLikePersistedSession(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.access_token === "string" && candidate.access_token.length > 0;
}

/**
 * True when the error is a DEFINITIVE, non-retryable auth failure — the
 * refresh token itself is dead (invalid, not found, or expired) — as
 * opposed to a transient network/timeout failure. Retrying `getSession()`
 * can NEVER recover from this specific error: the token that was persisted
 * on this device no longer works, full stop. Treating it the same as a
 * network hiccup (see `connectionIssue`) is what caused the "Não foi
 * possível confirmar sua sessão" screen to trap users forever with a
 * "Tentar novamente" button that could never succeed.
 */
function isInvalidRefreshTokenError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message = typeof (error as { message?: unknown }).message === "string"
    ? (error as { message: string }).message
    : "";
  return /refresh token/i.test(message) && /(invalid|not found|expired)/i.test(message);
}

/** Removes any persisted Supabase session token from this device. Only
 * called after confirming the refresh token is definitively dead — never
 * for a transient/network failure. */
function clearPersistedSupabaseSession(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // localStorage indisponível (modo privado, storage bloqueado etc.)
  }
}

function hasPersistedSupabaseSession(): boolean {
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;

      const raw = window.localStorage.getItem(key);
      if (!raw) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // Corrupted/non-JSON value under a Supabase-looking key must never
        // crash the app, and garbage never counts as proof of a session.
        continue;
      }

      if (looksLikePersistedSession(parsed)) return true;
    }
  } catch {
    // localStorage indisponível (modo privado, storage bloqueado etc.)
  }
  return false;
}

// Safety net: if the network is fully unavailable and we never get a
// definitive answer, don't leave the user stuck on a loading spinner
// forever. Normal resolution always finishes in milliseconds because
// getSession()/onAuthStateChange read from localStorage first.
//
// CORREÇÃO CRÍTICA: this timeout may ONLY conclude "unauthenticated" when
// there was never a persisted token to begin with. If a token IS persisted,
// timing out must surface `connectionIssue = true` (a recoverable
// "reconnecting" state) — it must NEVER commit(null), NEVER clear
// user/session, and NEVER be treated as a logout. Only an explicit
// SIGNED_OUT event from Supabase can log out a device that had a
// persisted token.
const RESOLUTION_TIMEOUT_MS = 8000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [session, setSessionState] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionIssue, setConnectionIssue] = useState(false);

  // Refs mirror state for use inside the auth listener/timeout, which are
  // registered once (effect deps: []) and would otherwise see stale
  // closures.
  const userRef = useRef<User | null>(null);
  const resolvedOnceRef = useRef(false);
  const hadPersistedSessionRef = useRef(false);
  const timeoutIdRef = useRef<number | null>(null);
  const attemptRef = useRef<() => void>(() => {});

  useEffect(() => {
    hadPersistedSessionRef.current = hasPersistedSupabaseSession();

    const clearPendingTimeout = () => {
      if (timeoutIdRef.current !== null) {
        window.clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
    };

    const commit = (nextSession: Session | null) => {
      const nextUser = nextSession?.user ?? null;
      userRef.current = nextUser;
      resolvedOnceRef.current = true;
      // A definitive resolution — successful or "confirmed no session" —
      // always neutralizes any pending timeout and clears the reconnect
      // state. This is what lets a session that arrives AFTER a timeout
      // already fired (e.g. the user clicked "Tentar novamente" and
      // network came back) fully recover the app.
      clearPendingTimeout();
      setConnectionIssue(false);
      setSessionState(nextSession);
      setUserState(nextUser);
      setLoading(false);
      markBoot("session resolved");
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // An explicit sign-out is always authoritative, regardless of any
      // previously persisted token.
      if (event === "SIGNED_OUT") {
        commit(null);
        return;
      }

      // Guard against treating a transient hiccup (e.g. a failed background
      // token refresh right after reopening the PWA with flaky network) as a
      // logout: never downgrade an already-authenticated user to null unless
      // the SDK explicitly reported SIGNED_OUT above.
      if (!nextSession && userRef.current && hadPersistedSessionRef.current) {
        return;
      }

      commit(nextSession);

      // SEGURANÇA (FASE 2 — hardening P0): este listener NUNCA mais escreve
      // church_slug em user_metadata após login OAuth. Isso propagava o slug
      // pendente do localStorage para user_metadata "para preservar o
      // comportamento equivalente ao trigger" — ou seja, era exatamente o
      // mecanismo de autoassociação por slug, só que para o fluxo OAuth.
      // handle_new_user() não lê mais church_slug (ver migration
      // 20260715141000_remove_open_slug_join.sql) e este listener não deve
      // reabrir o mesmo vetor escrevendo o campo de volta.
    });

    const attemptGetSession = () => {
      supabase.auth
        .getSession()
        .then(({ data: { session: initialSession } }) => {
          // Already resolved with a real user via onAuthStateChange (e.g. its
          // INITIAL_SESSION event fired first) — a null result here would just
          // be a redundant/stale read, not a logout.
          if (!initialSession && resolvedOnceRef.current && userRef.current) {
            return;
          }
          commit(initialSession);
        })
        .catch((error) => {
          console.warn("[Auth] getSession falhou (possível instabilidade de rede):", error);
          if (resolvedOnceRef.current) return;

          if (isInvalidRefreshTokenError(error)) {
            // O token persistido está definitivamente morto — nenhuma
            // quantidade de "Tentar novamente" vai resolver isso, porque o
            // erro não é de rede. Limpa o token local e resolve como
            // deslogado (vai para /login), em vez de travar em
            // connectionIssue para sempre.
            console.warn("[Auth] Refresh token inválido/expirado — limpando sessão local.");
            clearPersistedSupabaseSession();
            hadPersistedSessionRef.current = false;
            commit(null);
            return;
          }

          if (hadPersistedSessionRef.current) {
            // There IS a token on this device — a failed confirmation
            // attempt must surface as a recoverable reconnect state, NEVER
            // as commit(null)/logout.
            setConnectionIssue(true);
            return;
          }

          // No token was ever persisted — a failed getSession() here is
          // indistinguishable from "genuinely no session", so it's safe to
          // resolve as unauthenticated.
          commit(null);
        });
    };
    attemptRef.current = attemptGetSession;

    attemptGetSession();

    timeoutIdRef.current = window.setTimeout(() => {
      timeoutIdRef.current = null;
      if (resolvedOnceRef.current) return;

      if (hadPersistedSessionRef.current) {
        // A token exists locally but we couldn't confirm it within the
        // timeout. This must NEVER become commit(null) — surface a
        // recoverable "reconnecting" state with a retry action instead of
        // silently logging the user out.
        console.warn("[Auth] Confirmação de sessão excedeu o tempo limite; mantendo sessão local e oferecendo reconexão.");
        setConnectionIssue(true);
        return;
      }

      console.warn("[Auth] Tempo limite de resolução de sessão atingido; nenhum token persistido — assumindo sem sessão.");
      commit(null);
    }, RESOLUTION_TIMEOUT_MS);

    return () => {
      subscription.unsubscribe();
      clearPendingTimeout();
    };
  }, []);

  const retryConnection = useCallback(() => {
    if (resolvedOnceRef.current) return;
    setConnectionIssue(false);
    attemptRef.current();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    // CORREÇÃO (cache stale pós-login): sem isto, o React Query mantém em
    // memória o resultado do último bootstrap (roles/memberships/org ativa)
    // pelo `gcTime` configurado (10 min) mesmo após o logout. Se o usuário
    // fizer login novamente na mesma aba/PWA dentro desse intervalo — e seu
    // vínculo de organização tiver sido corrigido/criado nesse meio-tempo —
    // o app reaproveitaria o resultado antigo (memberships vazio) em vez de
    // buscar de novo, exibindo "sem igreja vinculada" mesmo com o banco
    // correto. `clear()` remove TODO o cache (não só o bootstrap), o que é
    // seguro aqui: o app está prestes a mostrar a tela de login, então não
    // há UI presa observando dados obsoletos.
    queryClient.clear();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, connectionIssue, retryConnection, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
