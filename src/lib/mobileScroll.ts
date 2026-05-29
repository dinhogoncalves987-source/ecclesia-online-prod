const MOBILE_MAX_WIDTH = 767;

export function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches;
}

function getScrollParent(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement;
  while (parent) {
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === "auto" || overflowY === "scroll") return parent;
    parent = parent.parentElement;
  }
  return null;
}

function scrollByDelta(element: HTMLElement, delta: number) {
  const scrollParent = getScrollParent(element);
  if (scrollParent) scrollParent.scrollBy({ top: delta, behavior: "smooth" });
  else window.scrollBy({ top: delta, behavior: "smooth" });
}

type ScrollOptions = {
  block?: ScrollLogicalPosition;
  delay?: number;
  keyboardOffset?: number;
};

/** Scroll element into view on mobile, accounting for virtual keyboard (iOS/Android). */
export function scrollElementIntoView(
  element: HTMLElement | null | undefined,
  options?: ScrollOptions,
) {
  if (!element || !isMobileViewport()) return;

  const { block = "center", delay = 280, keyboardOffset = 24 } = options ?? {};

  const run = () => {
    element.scrollIntoView({ behavior: "smooth", block, inline: "nearest" });

    const vv = window.visualViewport;
    if (!vv) return;

    requestAnimationFrame(() => {
      const rect = element.getBoundingClientRect();
      const visibleBottom = vv.offsetTop + vv.height - keyboardOffset;
      if (rect.bottom > visibleBottom) {
        scrollByDelta(element, rect.bottom - visibleBottom);
      }
    });
  };

  if (delay > 0) setTimeout(run, delay);
  else run();
}
