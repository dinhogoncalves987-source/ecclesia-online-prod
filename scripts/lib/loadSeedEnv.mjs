/**
 * scripts/lib/loadSeedEnv.mjs
 *
 * FASE 5 — fonte ÚNICA e padronizada de variáveis de ambiente para todos os
 * scripts `seed-*.mjs`/`demo:*`. Antes, cada script tinha seu próprio parser
 * `loadEnvFile` ad-hoc, lendo uma combinação diferente e inconsistente de
 * `.env` / `.env.staging` / `.env.local` — o que tornava fácil, por engano,
 * um script ler credenciais de um arquivo e outro de outro.
 *
 * Agora todos os scripts de seed leem exclusivamente de:
 *   1. `.env.seed` (arquivo exclusivo de seed, nunca comitado — ver
 *      `.env.seed.example` para o modelo) na raiz do projeto;
 *   2. `process.env` (variáveis exportadas no shell/CI têm prioridade sobre
 *      o arquivo, para permitir sobrescrever em pipelines sem editar disco).
 *
 * Nunca lê `.env`, `.env.local` ou `.env.staging` — esses arquivos são do
 * frontend (Vite) e não devem ser a fonte de credenciais de service_role
 * usadas por scripts de seed.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const SEED_ENV_PATH = path.join(ROOT, ".env.seed");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

/**
 * Carrega o ambiente de seed: `.env.seed` como base, sobrescrito por
 * `process.env` quando a variável já estiver exportada. Nunca lança —
 * arquivo ausente resulta apenas em objeto vazio (a guarda de segurança
 * `assertSafeToSeedStaging` é quem decide se isso é aceitável).
 *
 * @returns {Record<string, string | undefined>}
 */
export function loadSeedEnv() {
  const fromFile = parseEnvFile(SEED_ENV_PATH);
  return { ...fromFile, ...process.env };
}
