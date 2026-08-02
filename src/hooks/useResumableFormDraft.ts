import { useEffect, useRef } from "react";
import { saveFormDraft, clearFormDraft } from "@/lib/appResumeState";

const DEBOUNCE_MS = 500;

/**
 * Keeps a form/UI draft mirrored into the resume snapshot (sessionStorage)
 * for as long as `enabled` is true, so it survives the app being fully
 * unmounted and reloaded by the OS/browser (Android killing a backgrounded
 * WebView while the system camera/gallery/file picker is open, a
 * low-memory tab discard, etc).
 *
 * This hook only handles the SAVE side. Restoring is deliberately left to
 * the caller (read once via `readFormDraft(formKey, location.pathname)` in
 * a mount effect) because hydrating several `useState` setters atomically
 * from one draft object is page-specific.
 *
 * Save triggers:
 *   - Debounced on every `value` change while `enabled` (normal typing).
 *   - Immediately (no debounce) on `visibilitychange` -> hidden and on
 *     `pagehide` — these fire right before Android backgrounds/suspends the
 *     page for a picker/camera intent, which is exactly the moment a
 *     pending debounce could otherwise be lost to a process kill.
 */
export function useResumableFormDraft<T>(formKey: string, path: string, enabled: boolean, value: T): void {
  const valueRef = useRef(value);
  valueRef.current = value;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) return;

    const flush = () => {
      if (!enabledRef.current) return;
      saveFormDraft(formKey, path, valueRef.current);
    };

    const timeoutId = window.setTimeout(flush, DEBOUNCE_MS);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [formKey, path, enabled, value]);
}

/** Discards a named form/UI draft — call after an explicit save or cancel. */
export function discardFormDraft(formKey: string): void {
  clearFormDraft(formKey);
}
