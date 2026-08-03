import { useEffect, type RefObject } from "react";
import { readScrollPosition, saveScrollPosition } from "@/lib/appResumeState";

const SAVE_THROTTLE_MS = 300;
// Reaplicar o scroll por até ~6s após o mount: a maioria das páginas admin
// carrega a lista via React Query (fetch assíncrono ao Supabase — em staging
// já observamos o fetch inicial levar bem mais que 1-2s), então no primeiro
// requestAnimationFrame o documento ainda está com a altura do
// esqueleto/loading — um único scrollTo() nesse momento é "clampado" pelo
// navegador ao conteúdo curto que existe agora e nunca é reaplicado quando a
// lista termina de carregar e a página cresce. Sem este retry, a posição
// salva (ex.: 900px) simplesmente não pega e o usuário volta para o topo.
//
// CONFIRMADO AO VIVO em staging (ecclesia-teste.vercel.app/admin/membros):
// uma primeira versão deste retry desistia cedo demais — na 1ª tentativa
// (ainda no esqueleto de loading, documento com a altura só da viewport) a
// heurística "conteúdo atual é curto demais para alcançar o alvo" already
// dava como concluído, então a lista carregava depois e a posição nunca era
// reaplicada. Por isso essa heurística de saída antecipada só é confiável
// depois de já ter dado um número mínimo de tentativas ao conteúdo
// assíncrono (RESTORE_MIN_ATTEMPTS_BEFORE_SHORT_CONTENT_EXIT).
const RESTORE_RETRY_INTERVAL_MS = 150;
const RESTORE_MAX_ATTEMPTS = 40; // ~6s no total
const RESTORE_MIN_ATTEMPTS_BEFORE_SHORT_CONTENT_EXIT = 10; // ~1.5s — dá tempo ao fetch inicial antes de aceitar "conteúdo curto demais" como definitivo
const RESTORE_TOLERANCE_PX = 4;

/**
 * Restores and continuously tracks scroll position per route, so returning
 * from a full app reload (Android killing the backgrounded WebView while a
 * picker/camera is open, a low-memory tab discard...) lands the user back
 * where they were reading/scrolling instead of at the top of the page.
 *
 * Two scroll containers are tracked because AdminLayout intentionally uses
 * different ones per breakpoint (see AdminLayout.tsx <main>): the window
 * itself on mobile (`overflow-visible`, whole document scrolls) and the
 * `<main>` element on desktop (`lg:overflow-y-auto`). Whichever one is
 * actually scrollable at restore time simply uses its stored value; the
 * other is a harmless no-op.
 */
export function useScrollRestoration(routeKey: string, containerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const stored = readScrollPosition(routeKey);
    let retryId: number | null = null;
    // Enquanto a restauração ainda está em andamento, os próprios
    // scrollTo()/scrollTop desta função disparam eventos "scroll" nativos —
    // sem esta guarda, o listener de save abaixo gravaria a posição
    // intermediária (ainda no meio do caminho para o alvo) por cima do
    // rascunho salvo, corrompendo o alvo antes mesmo dele "pegar".
    let isRestoring = Boolean(stored);
    if (stored) {
      let attempts = 0;
      const isTargetReached = (
        current: number,
        target: number | undefined,
        maxScrollable: number,
      ) => {
        if (typeof target !== "number" || target <= 0) return true;
        if (Math.abs(current - target) < RESTORE_TOLERANCE_PX) return true;
        // Só confia em "conteúdo curto demais para alcançar o alvo" depois
        // de um número mínimo de tentativas — na primeira tentativa (ainda
        // no esqueleto de loading) isso quase sempre seria um falso
        // positivo.
        return attempts >= RESTORE_MIN_ATTEMPTS_BEFORE_SHORT_CONTENT_EXIT && maxScrollable < target;
      };

      const attemptRestore = () => {
        attempts += 1;
        if (typeof stored.window === "number" && stored.window > 0) {
          window.scrollTo({ top: stored.window, behavior: "auto" });
        }
        const containerEl = containerRef.current;
        if (containerEl && typeof stored.container === "number" && stored.container > 0) {
          containerEl.scrollTop = stored.container;
        }

        const windowDone = isTargetReached(
          window.scrollY,
          stored.window,
          document.documentElement.scrollHeight - window.innerHeight,
        );
        const containerDone =
          !containerEl ||
          isTargetReached(containerEl.scrollTop, stored.container, containerEl.scrollHeight - containerEl.clientHeight);

        if ((windowDone && containerDone) || attempts >= RESTORE_MAX_ATTEMPTS) {
          isRestoring = false;
          return;
        }
        retryId = window.setTimeout(attemptRestore, RESTORE_RETRY_INTERVAL_MS);
      };

      // Wait a frame so lazy-loaded page content has a chance to lay out —
      // scrolling before content exists is a no-op.
      requestAnimationFrame(attemptRestore);
    }

    let throttleId: number | null = null;
    const save = () => {
      if (isRestoring) return;
      saveScrollPosition(
        routeKey,
        { window: window.scrollY, container: containerRef.current?.scrollTop },
        routeKey,
      );
    };
    const scheduleSave = () => {
      if (isRestoring || throttleId !== null) return;
      throttleId = window.setTimeout(() => {
        throttleId = null;
        save();
      }, SAVE_THROTTLE_MS);
    };

    window.addEventListener("scroll", scheduleSave, { passive: true });
    const container = containerRef.current;
    container?.addEventListener("scroll", scheduleSave, { passive: true });

    const onVisibility = () => { if (document.visibilityState === "hidden") save(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", save);

    return () => {
      if (retryId !== null) window.clearTimeout(retryId);
      if (throttleId !== null) window.clearTimeout(throttleId);
      window.removeEventListener("scroll", scheduleSave);
      container?.removeEventListener("scroll", scheduleSave);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", save);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);
}
