import { QueryClient } from "@tanstack/react-query";

/**
 * Singleton QueryClient, shared across the whole SPA lifetime.
 *
 * Lives in its own module (rather than inline in App.tsx) so that
 * non-component code — notably `useAuth`'s `signOut()` — can import it
 * without creating a circular dependency (App.tsx already imports
 * `AuthProvider` from `useAuth.tsx`).
 */
export const queryClient = new QueryClient();
