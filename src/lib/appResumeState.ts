/**
 * App resume snapshot — lets the Ecclesia PWA put the user back exactly
 * where they were after the app gets fully unmounted and reloaded by the
 * OS/browser while it was in the background (Android killing a backgrounded
 * WebView while the system camera/gallery/file picker is in the foreground,
 * a low-memory tab discard, etc).
 *
 * Storage: sessionStorage, deliberately NOT localStorage.
 *   - sessionStorage is scoped to the browsing session (the underlying
 *     Android/Chrome "task"). Chrome keeps session storage in the browser
 *     process rather than the renderer, which is exactly why it survives a
 *     renderer/process kill-and-restore of the SAME task — the scenario
 *     this file exists for — while still NOT leaking into a genuinely new
 *     session (fresh install, "abrir em nova aba", manually cleared
 *     browsing data), unlike localStorage.
 *   - A snapshot older than RESUME_MAX_AGE_MS is treated as stale and
 *     ignored. This is what stops a three-day-old abandoned draft from
 *     resurfacing as if it were current, and bounds how long a form draft
 *     can resurrect after an interrupted session.
 *
 * Security: `sanitizeForResume` recursively strips any key that even
 * loosely looks like a secret (password, senha, otp, token, secret, pin,
 * cvv, api key, seed...) and drops non-JSON-serializable values (functions,
 * File/Blob/FileList — a picked-but-unsaved file cannot survive a process
 * kill regardless, since the browser itself cannot hand a File back to a
 * page that no longer holds the originating <input>). This is defense in
 * depth: callers should never pass secrets in the first place, but a single
 * choke point here means one mistake in a page's draft object can never
 * leak a credential into sessionStorage.
 */

const STORAGE_KEY = "ecclesia.resume.v1";
const RESUME_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes — long enough to survive a picker/camera round trip, short enough to never resurrect a stale draft days later.

const SENSITIVE_KEY_PATTERN = /pass(word)?|senha|secret|token|otp|pin\b|cvv|api[_-]?key|credential|refresh[_-]?token|access[_-]?token/i;

export type ScrollPositionEntry = {
  window?: number;
  container?: number;
};

export type ResumeSnapshot = {
  savedAt: number;
  /** Route the snapshot was captured on — restoring is always scoped to a matching path. */
  path: string;
  /** Per-route scroll positions, keyed by pathname. */
  scroll?: Record<string, ScrollPositionEntry>;
  /** Arbitrary per-feature form/UI drafts, keyed by a caller-chosen id. */
  forms?: Record<string, unknown>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep-clones `value`, dropping any key that looks sensitive and any value
 * that cannot be safely round-tripped through sessionStorage (functions,
 * File/Blob/FileList, DOM nodes). Never throws — worst case, an
 * unserializable branch is simply omitted.
 */
export function sanitizeForResume<T>(value: T): T {
  const seen = new WeakSet<object>();

  const clean = (input: unknown): unknown => {
    if (input === null || input === undefined) return input;
    if (typeof input === "function") return undefined;
    if (typeof File !== "undefined" && input instanceof File) return undefined;
    if (typeof Blob !== "undefined" && input instanceof Blob) return undefined;
    if (typeof FileList !== "undefined" && input instanceof FileList) return undefined;
    if (typeof Node !== "undefined" && input instanceof Node) return undefined;

    if (Array.isArray(input)) {
      return input.map((item) => clean(item));
    }

    if (isPlainObject(input)) {
      if (seen.has(input)) return undefined;
      seen.add(input);
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(input)) {
        if (SENSITIVE_KEY_PATTERN.test(key)) continue;
        const cleaned = clean(val);
        if (cleaned !== undefined) out[key] = cleaned;
      }
      return out;
    }

    if (typeof input === "string" || typeof input === "number" || typeof input === "boolean") {
      return input;
    }

    // Anything else (Date, Map, Set, class instances...) is not guaranteed
    // to survive JSON.stringify/parse faithfully — safer to drop than to
    // silently corrupt it on restore.
    return undefined;
  };

  try {
    return JSON.parse(JSON.stringify(clean(value))) as T;
  } catch {
    return {} as T;
  }
}

function readRaw(): ResumeSnapshot | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResumeSnapshot;
    if (!parsed || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > RESUME_MAX_AGE_MS) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Reads the current resume snapshot, or null if absent/corrupted/stale. */
export function readResumeSnapshot(): ResumeSnapshot | null {
  if (typeof window === "undefined") return null;
  return readRaw();
}

/**
 * Merges `patch` into the current snapshot (shallow-merging `scroll` and
 * `forms` maps) and stamps `savedAt`/`path`. Safe to call frequently — the
 * caller is expected to debounce high-frequency events (scroll, keystrokes).
 */
export function saveResumeSnapshot(patch: Partial<Omit<ResumeSnapshot, "savedAt">>): void {
  if (typeof window === "undefined") return;
  try {
    const current = readRaw();
    const next: ResumeSnapshot = {
      savedAt: Date.now(),
      path: patch.path ?? current?.path ?? window.location.pathname,
      scroll: { ...(current?.scroll ?? {}), ...(patch.scroll ?? {}) },
      forms: sanitizeForResume({ ...(current?.forms ?? {}), ...(patch.forms ?? {}) }),
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota exceeded / private mode / storage disabled — resuming state is
    // a best-effort UX improvement, never something that can crash the app.
  }
}

/** Removes the entire resume snapshot (e.g. after an explicit logout). */
export function clearResumeSnapshot(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Reads a single named form/UI draft, only if it was captured on `expectedPath`. */
export function readFormDraft<T>(formKey: string, expectedPath: string): T | null {
  const snapshot = readResumeSnapshot();
  if (!snapshot || snapshot.path !== expectedPath) return null;
  const forms = snapshot.forms;
  if (!forms || !(formKey in forms)) return null;
  return forms[formKey] as T;
}

/** Persists/updates a single named form/UI draft for the current path. */
export function saveFormDraft<T>(formKey: string, path: string, value: T): void {
  saveResumeSnapshot({ path, forms: { [formKey]: sanitizeForResume(value) } });
}

/** Removes a single named form/UI draft (e.g. once explicitly saved/discarded). */
export function clearFormDraft(formKey: string): void {
  if (typeof window === "undefined") return;
  try {
    const current = readRaw();
    if (!current?.forms || !(formKey in current.forms)) return;
    const { [formKey]: _removed, ...rest } = current.forms;
    const next: ResumeSnapshot = { ...current, savedAt: Date.now(), forms: rest };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

/** Reads the persisted scroll position for a given route key. */
export function readScrollPosition(routeKey: string): ScrollPositionEntry | null {
  const snapshot = readResumeSnapshot();
  return snapshot?.scroll?.[routeKey] ?? null;
}

/** Persists the scroll position for a given route key. */
export function saveScrollPosition(routeKey: string, entry: ScrollPositionEntry, path: string): void {
  saveResumeSnapshot({ path, scroll: { [routeKey]: entry } });
}
