import { useEffect, useRef } from "react";
import { scrollElementIntoView } from "@/lib/mobileScroll";

const FOCUSABLE = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** Attach to a form/container — scrolls focused inputs into view on mobile. */
export function useMobileFocusScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (!FOCUSABLE.has(target.tagName)) return;
      scrollElementIntoView(target);
    };

    container.addEventListener("focusin", onFocusIn);
    return () => container.removeEventListener("focusin", onFocusIn);
  }, []);

  return ref;
}
