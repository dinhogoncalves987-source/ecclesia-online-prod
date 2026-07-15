import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// FASE 4/8 (hardening P0): src/config/environment.ts agora recusa
// qualquer project ref que não seja um dos dois refs canônicos e IMUTÁVEIS
// deste projeto — um placeholder inventado (ex.: "testenvfakeref00") não
// passa mais dessa validação e quebra em cascata qualquer módulo que
// resolva o ambiente no import (src/config/modules.ts, src/lib/publicUrl.ts
// etc.), mesmo em testes que nada têm a ver com ambiente.
//
// O project ref de staging (qkiiwopkbcslquyfhdec) é um identificador
// PÚBLICO e imutável (não é segredo — é literalmente hardcoded como
// constante em src/config/environment.ts e citado à vontade na doc de
// ambientes), então usá-lo aqui como default de teste é seguro e é
// exatamente o que src/config/environment.test.ts já faz na própria
// fixture. Testes que precisem validar comportamento específico de
// produção/staging continuam usando `buildEnvironmentConfig(fixture)`
// diretamente em vez de depender destes defaults.
const TEST_ENV_DEFAULTS = {
  VITE_APP_ENV: "staging",
  VITE_SUPABASE_URL: "https://qkiiwopkbcslquyfhdec.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_fixture_only",
  VITE_EXPECTED_SUPABASE_PROJECT_REF: "qkiiwopkbcslquyfhdec",
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
