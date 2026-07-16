#!/usr/bin/env node
/**
 * scripts/reject-generic-build.mjs
 *
 * FASE 4 (hardening P0) — item 1: `npm run build` sem ambiente explícito
 * DEVE falhar, sempre, com uma mensagem clara — nunca "às vezes funciona"
 * dependendo do que sobrou num `.env` local. Antes desta correção, `build`
 * era só `vite build` (modo "production" por padrão do Vite); se o `.env`
 * local tivesse VITE_APP_ENV=staging + refs de staging válidos, o build
 * "genérico" silenciosamente produzia um build de staging — o oposto de
 * "falhar fechado".
 *
 * Este script nunca constrói nada: sempre falha, sempre com a mesma
 * mensagem, independentemente de qualquer variável de ambiente presente.
 * Use exclusivamente os comandos explícitos abaixo.
 */
console.error("");
console.error("❌ npm run build (genérico) foi desativado intencionalmente.");
console.error("");
console.error("   Este projeto exige o ambiente explícito no comando de build —");
console.error("   nunca infira produção/staging a partir de um .env local.");
console.error("");
console.error("   Use um destes comandos:");
console.error("     npm run build:production   (branch main / domínio oficial)");
console.error("     npm run build:staging      (branch staging / domínio de teste)");
console.error("");
process.exit(1);
