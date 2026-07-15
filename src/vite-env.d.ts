/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_EXPECTED_SUPABASE_PROJECT_REF?: string;
  readonly VITE_PUBLIC_APP_URL?: string;
  readonly VITE_ENABLED_MODULES?: string;
}
