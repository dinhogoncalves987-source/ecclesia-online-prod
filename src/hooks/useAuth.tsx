import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { PENDING_CHURCH_SLUG_KEY } from "@/lib/organizationMembership";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Prevents calling updateUser more than once per OAuth sign-in
  const oauthSlugSyncedRef = useRef(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      // After a Google/OAuth sign-in, propagate the pending church_slug from localStorage
      // into user_metadata so the DB trigger equivalent behaviour is preserved.
      // Email/password signup already sets church_slug via buildSignupMetadata; this
      // brings OAuth into parity.
      if (_event === "SIGNED_IN" && session?.user && !oauthSlugSyncedRef.current) {
        const provider = session.user.app_metadata?.provider;
        const isOAuthProvider = Boolean(provider && provider !== "email");
        const alreadyHasSlug = Boolean(session.user.user_metadata?.church_slug);

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

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
