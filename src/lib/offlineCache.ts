/**
 * Ecclesia Offline Cache — V1
 *
 * Storage: localStorage (simple, synchronous, ~5 MB limit)
 * Purpose: cache small read-only data so the app stays useful offline
 *
 * Intentionally excluded (never cache):
 *   - Financial data (transactions, balances)
 *   - Auth tokens (managed by Supabase client)
 *   - Member PII
 *   - Any writable data that needs conflict resolution
 *
 * Roadmap:
 *   V1 (current) — localStorage for devotional + daily verses
 *   V2            — IndexedDB for Bible chapters (via idb-keyval or native)
 *   V3            — Service Worker Cache Storage for Bible API responses
 */

const PREFIX = "ecclesia_cache_";
const DAY_MS = 24 * 60 * 60 * 1000;

// ── Internal helpers ──────────────────────────────────────────────────────────

type Entry<T> = { data: T; expiresAt: number };

function write<T>(key: string, data: T, ttlMs: number): void {
  try {
    const entry: Entry<T> = { data, expiresAt: Date.now() + ttlMs };
    localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // Quota exceeded or private browsing — silently ignore
  }
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry: Entry<T> = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

// ── Devotional (manhã / tarde / noite) ───────────────────────────────────────

export type CachedDevotional = {
  verse: string;
  reference: string;
  reflection: string;
  period: string;
};

const devotionalKey = (date: string, period: string, locale: string) =>
  `devotional_${date}_${period}_${locale}`;

export function getCachedDevotional(
  date: string,
  period: string,
  locale: string,
): CachedDevotional | null {
  return read<CachedDevotional>(devotionalKey(date, period, locale));
}

export function cacheDevotional(
  date: string,
  period: string,
  locale: string,
  data: CachedDevotional,
): void {
  write(devotionalKey(date, period, locale), data, DAY_MS);
}

// ── Daily verses (3 per day — future Supabase table) ─────────────────────────
//
// Shape mirrors the planned `daily_verses` Supabase table:
//   date DATE, position SMALLINT (1|2|3), locale TEXT, verse_text TEXT, reference TEXT

export type CachedDailyVerse = {
  position: 1 | 2 | 3;
  verse: string;
  reference: string;
};

const dailyVersesKey = (date: string, locale: string) =>
  `daily_verses_${date}_${locale}`;

export function getCachedDailyVerses(
  date: string,
  locale: string,
): CachedDailyVerse[] | null {
  return read<CachedDailyVerse[]>(dailyVersesKey(date, locale));
}

export function cacheDailyVerses(
  date: string,
  locale: string,
  verses: CachedDailyVerse[],
): void {
  write(dailyVersesKey(date, locale), verses, DAY_MS);
}

// ── Bible chapter (future IndexedDB migration) ────────────────────────────────
//
// Currently a no-op stub. When bible_verses table is seeded and Supabase
// queries replace bolls.life, these functions will cache chapter text
// so the Bible page works offline after first visit.
//
// V2 plan: replace localStorage with IndexedDB (much higher storage limit).

export type CachedBibleVerse = { num: number; text: string };

const bibleChapterKey = (translation: string, bookId: string, chapter: number) =>
  `bible_${translation}_${bookId}_ch${chapter}`;

export function getCachedBibleChapter(
  translation: string,
  bookId: string,
  chapter: number,
): CachedBibleVerse[] | null {
  return read<CachedBibleVerse[]>(bibleChapterKey(translation, bookId, chapter));
}

export function cacheBibleChapter(
  translation: string,
  bookId: string,
  chapter: number,
  verses: CachedBibleVerse[],
): void {
  // TTL: 30 days (Bible text doesn't change)
  write(bibleChapterKey(translation, bookId, chapter), verses, 30 * DAY_MS);
}

// ── Utility ───────────────────────────────────────────────────────────────────

/** Remove all Ecclesia cache entries from localStorage */
export function clearOfflineCache(): void {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // silently fail
  }
}

/** Estimated size of all cached entries in bytes */
export function offlineCacheBytes(): number {
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .reduce((total, k) => total + (localStorage.getItem(k)?.length ?? 0) * 2, 0);
  } catch {
    return 0;
  }
}
