import "@testing-library/jest-dom";

// The Node runtime used by this Vitest environment ships its own
// experimental global `localStorage` (guarded behind `--localstorage-file`,
// which we don't configure), which shadows jsdom's implementation with a
// stub that has no working methods. Replace it with a small in-memory
// Storage implementation so any code touching localStorage in tests
// (auth session detection, pending invite slugs, etc.) works as expected.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

for (const target of [window, globalThis] as const) {
  Object.defineProperty(target, "localStorage", {
    value: new MemoryStorage(),
    writable: true,
    configurable: true,
  });
  Object.defineProperty(target, "sessionStorage", {
    value: new MemoryStorage(),
    writable: true,
    configurable: true,
  });
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
