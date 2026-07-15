import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Valores fixos (nunca reais) para satisfazer src/config/environment.ts em
// testes. Qualquer teste que precise validar comportamento específico de
// produção/staging usa `buildEnvironmentConfig(fixture)` diretamente (ver
// src/config/environment.test.ts) em vez de depender destes defaults.
const TEST_ENV_DEFAULTS = {
  VITE_APP_ENV: "staging",
  VITE_SUPABASE_URL: "https://testenvfakeref00.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_fixture_only",
  VITE_EXPECTED_SUPABASE_PROJECT_REF: "testenvfakeref00",
  VITE_PUBLIC_APP_URL: "https://staging.test.example",
};

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    env: TEST_ENV_DEFAULTS,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
