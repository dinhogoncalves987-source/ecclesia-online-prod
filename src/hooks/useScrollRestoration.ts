import { useEffect, type RefObject } from "react";
import { readScrollPosition, saveScrollPosition } from "@/lib/appResumeState";

const SAVE_THROTTLE_MS = 300;

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
    if (stored) {
      // Wait a frame so lazy-loaded page content has a chance to lay out —
      // scrolling before content exists is a no-op.
      requestAnimationFrame(() => {
        if (typeof stored.window === "number") {
          window.scrollTo({ top: stored.window, behavior: "auto" });
        }
        if (containerRef.current && typeof stored.container === "number") {
          containerRef.current.scrollTop = stored.container;
        }
      });
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
      if (throttleId !== null) window.clearTimeout(throttleId);
      window.removeEventListener("scroll", scheduleSave);
      container?.removeEventListener("scroll", scheduleSave);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", save);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);
}
