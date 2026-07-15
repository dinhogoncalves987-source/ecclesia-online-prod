import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { PENDING_CHURCH_SLUG_KEY } from "@/lib/organizationMembership";
import { markBoot } from "@/lib/bootPerf";

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
  const oauthSlugSyncedRef = useRef(false);
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

      // After a Google/OAuth sign-in, propagate the pending church_slug from localStorage
      // into user_metadata so the DB trigger equivalent behaviour is preserved.
      // Email/password signup already sets church_slug via buildSignupMetadata; this
      // brings OAuth into parity.
      if (event === "SIGNED_IN" && nextSession?.user && !oauthSlugSyncedRef.current) {
        const provider = nextSession.user.app_metadata?.provider;
        const isOAuthProvider = Boolean(provider && provider !== "email");
        const alreadyHasSlug = Boolean(nextSession.user.user_metadata?.church_slug);

        if (isOAuthProvider && !alreadyHasSlug) {
          const pending = localStorage.getItem(PENDING_CHURCH_SLUG_KEY)?.trim();
          if (pending) {
            oauthSlugSyncedRef.current = true;
            // Deferred: Supabase warns against calling auth methods synchronously
            // inside onAuthStateChange. setTimeout(0) runs after the callback returns.
            setTimeout(() => {
              supabase.auth
                .updateUser({ data: { church_slug: pending } })
                .catch((err) => {
                  console.warn("[Auth] Failed to sync church_slug to OAuth user metadata:", err);
                  oauthSlugSyncedRef.current = false;
                });
            }, 0);
          }
        }
      }
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
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, connectionIssue, retryConnection, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
