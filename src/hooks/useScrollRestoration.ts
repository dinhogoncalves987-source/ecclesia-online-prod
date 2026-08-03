import { useEffect, type RefObject } from "react";
import { readScrollPosition, saveScrollPosition } from "@/lib/appResumeState";

const SAVE_THROTTLE_MS = 300;
// Reaplicar o scroll por até ~2s após o mount: a maioria das páginas admin
// carrega a lista via React Query (fetch assíncrono ao Supabase), então no
// primeiro requestAnimationFrame o documento ainda está com a altura do
// esqueleto/loading — um único scrollTo() nesse momento é "clampado" pelo
// navegador ao conteúdo curto que existe agora e nunca é reaplicado quando a
// lista termina de carregar e a página cresce. Sem este retry, a posição
// salva (ex.: 900px) simplesmente não pega e o usuário volta para o topo.
const RESTORE_RETRY_INTERVAL_MS = 100;
const RESTORE_MAX_ATTEMPTS = 20; // ~2s no total, cobre o fetch inicial da maioria das páginas
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
    if (stored) {
      let attempts = 0;
      const isTargetReached = (
        current: number,
        target: number | undefined,
        maxScrollable: number,
      ) => {
        if (typeof target !== "number" || target <= 0) return true;
        // Aceita como concluído tanto quando o valor "pegou" (dentro da
        // tolerância) quanto quando o conteúdo atual já é curto demais para
        // rolar até o alvo — nesse segundo caso, insistir só re-agenda
        // tentativas inúteis até o limite de RESTORE_MAX_ATTEMPTS.
        return Math.abs(current - target) < RESTORE_TOLERANCE_PX || maxScrollable < target;
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

        if ((windowDone && containerDone) || attempts >= RESTORE_MAX_ATTEMPTS) return;
        retryId = window.setTimeout(attemptRestore, RESTORE_RETRY_INTERVAL_MS);
      };

      // Wait a frame so lazy-loaded page content has a chance to lay out —
      // scrolling before content exists is a no-op.
      requestAnimationFrame(attemptRestore);
    }

    let throttleId: number | null = null;
    const save = () => {
      saveScrollPosition(
        routeKey,
        { window: window.scrollY, container: containerRef.current?.scrollTop },
        routeKey,
      );
    };
    const scheduleSave = () => {
      if (throttleId !== null) return;
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
