/**
 * src/config/reviewMode.ts
 *
 * "Modo Avaliação" — camada de segurança que permite abrir o aplicativo
 * interno do Ecclesia (mesmo layout, mesmos componentes reais) sem
 * autenticação real e sem tocar no Supabase de produção/staging.
 *
 * DUPLO PORTÃO (dois portões, nunca um só):
 *   1. Portão de build: `VITE_PUBLIC_REVIEW_MODE=true`. Só existe em builds
 *      explicitamente marcados para avaliação (Vercel Preview). Ausente (ou
 *      qualquer valor diferente de "true") em produção/staging => este
 *      módulo inteiro fica inerte, não importa o que aconteça em runtime.
 *   2. Portão de sessão: só fica "ativo" na aba atual depois que o usuário
 *      navegou explicitamente para a rota pública `/avaliacao`. Guardado em
 *      `sessionStorage` (nunca `localStorage`) — desaparece ao fechar a aba,
 *      nunca atravessa abas/dispositivos.
 *
 * Por que dois portões em vez de só o flag de build? Se o flag de build
 * ligasse o modo mock para QUALQUER rota automaticamente, um usuário real
 * que abrisse `/login` ou `/admin` diretamente nesse mesmo deploy de Preview
 * também cairia no cliente simulado — o que violaria a regra "o aplicativo
 * normal continua exigindo autenticação normalmente". Com o portão de
 * sessão, só quem passou por `/avaliacao` nessa aba entra em modo simulado;
 * qualquer outra navegação direta usa o Supabase real, sem alteração de
 * comportamento.
 *
 * Este módulo NUNCA importa `@/integrations/supabase/client` nem qualquer
 * dependência pesada — é lido em todo `supabase.<algo>` (via Proxy), então
 * precisa ser extremamente barato e sem efeitos colaterais além do
 * sessionStorage.
 */

export const REVIEW_MODE_ENTRY_PATH = "/avaliacao";

const REVIEW_MODE_SESSION_KEY = "ecclesia.reviewMode.session.v1";

/** Portão 1 — decidido em build-time pela Vercel/Vite, imutável em runtime. */
export function isReviewModeBuildEnabled(): boolean {
  return import.meta.env.VITE_PUBLIC_REVIEW_MODE === "true";
}

function readSessionFlag(): boolean {
  try {
    return window.sessionStorage.getItem(REVIEW_MODE_SESSION_KEY) === "1";
  } catch {
    // sessionStorage indisponível (modo privado estrito, storage bloqueado):
    // nunca falha aberto — trata como "modo avaliação desligado".
    return false;
  }
}

/** Portão 2 — liga a simulação para o restante desta aba/sessão do navegador. */
export function activateReviewModeSession(): void {
  if (!isReviewModeBuildEnabled()) return;
  try {
    window.sessionStorage.setItem(REVIEW_MODE_SESSION_KEY, "1");
  } catch {
    // Se não for possível persistir, o modo simplesmente não ativa — nunca
    // lança, nunca finge que ativou.
  }
}

/** Desliga o portão de sessão (usado ao "Sair" dentro do modo avaliação). */
export function deactivateReviewModeSession(): void {
  try {
    window.sessionStorage.removeItem(REVIEW_MODE_SESSION_KEY);
  } catch {
    /* noop */
  }
}

/**
 * true somente quando AMBOS os portões estão abertos: o build foi marcado
 * para avaliação E esta aba passou pela rota `/avaliacao`. É esta função —
 * e só ela — que o cliente Supabase simulado consulta para decidir se
 * intercepta uma chamada ou deixa passar para o Supabase real.
 */
export function isReviewModeActive(): boolean {
  return isReviewModeBuildEnabled() && readSessionFlag();
}

/** Identidade fictícia fixa usada em todo o Modo Avaliação. */
export const REVIEW_MODE_PERSONA = {
  displayName: "Administrador Municipal (Avaliação)",
  roleLabel: "Administrador Municipal — Matriz Municipal de Caxias do Sul",
  organizationName: "Matriz Municipal de Caxias do Sul",
} as const;
