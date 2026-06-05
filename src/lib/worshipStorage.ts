/**
 * Culto & Louvor — Supabase-backed storage with in-memory cache.
 * Sync getters preserve the existing page API; call ensureWorshipLoaded() on mount.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { insertWithOrganizationScope, runScopedOrganizationQuery } from "@/lib/organizationScope";

export type WorshipSong = {
  id: string;
  title: string;
  lyrics: string;
  key?: string;
  category?: string;
  notes?: string;
  createdAt: string;
};

export type SetlistStepType =
  | "abertura"
  | "oracao"
  | "louvor"
  | "leitura"
  | "mensagem"
  | "encerramento";

export type SetlistStep = {
  id: string;
  type: SetlistStepType;
  title: string;
  content: string;
  songId?: string;
};

export type WorshipSetlist = {
  id: string;
  title: string;
  date?: string;
  steps: SetlistStep[];
  createdAt: string;
  updatedAt: string;
};

export const WORSHIP_ORG_NOT_READY_MSG =
  "Organização ainda não carregada. Tente novamente em alguns segundos.";

export class WorshipPersistError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "WorshipPersistError";
  }
}

export function worshipLoadErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof WorshipPersistError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

type OrgCache = {
  songs: WorshipSong[];
  setlists: WorshipSetlist[];
  loadPromise?: Promise<void>;
};

const cacheByOrg = new Map<string, OrgCache>();

const legacySongsKey = (churchId: string) => `ecclesia_worship_songs_${churchId}`;
const legacySetlistsKey = (churchId: string) => `ecclesia_worship_setlists_${churchId}`;
const legacyImportKey = (churchId: string) => `ecclesia_worship_imported_${churchId}`;

function isPersistedOrg(organizationId: string): boolean {
  return organizationId !== "local" && organizationId.length > 8;
}

function getOrgCache(organizationId: string): OrgCache {
  let entry = cacheByOrg.get(organizationId);
  if (!entry) {
    entry = { songs: [], setlists: [] };
    cacheByOrg.set(organizationId, entry);
  }
  return entry;
}

function readLegacyJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function uid(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function rowToSong(row: {
  id: string;
  title: string;
  lyrics: string;
  musical_key: string | null;
  category: string | null;
  notes: string | null;
  created_at: string;
}): WorshipSong {
  return {
    id: row.id,
    title: row.title,
    lyrics: row.lyrics ?? "",
    key: row.musical_key ?? undefined,
    category: row.category ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

function rowToSetlist(row: {
  id: string;
  title: string;
  service_date: string | null;
  steps: Json;
  created_at: string;
  updated_at: string;
}): WorshipSetlist {
  const steps = Array.isArray(row.steps) ? (row.steps as SetlistStep[]) : [];
  return {
    id: row.id,
    title: row.title,
    date: row.service_date ?? undefined,
    steps,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

async function fetchFromSupabase(organizationId: string): Promise<void> {
  const [songsResult, setlistsResult] = await Promise.all([
    runScopedOrganizationQuery("worship_songs", organizationId, (query) =>
      query.select("*").order("created_at", { ascending: false }),
    ),
    runScopedOrganizationQuery("worship_setlists", organizationId, (query) =>
      query.select("*").order("updated_at", { ascending: false }),
    ),
  ]);

  if (songsResult.error) {
    throw new WorshipPersistError("Failed to fetch worship songs", songsResult.error);
  }
  if (setlistsResult.error) {
    throw new WorshipPersistError("Failed to fetch worship setlists", setlistsResult.error);
  }

  const entry = getOrgCache(organizationId);
  entry.songs = ((songsResult.data ?? []) as Parameters<typeof rowToSong>[0][]).map(rowToSong);
  entry.setlists = ((setlistsResult.data ?? []) as Parameters<typeof rowToSetlist>[0][]).map(rowToSetlist);
}

async function importLegacyLocalStorage(organizationId: string): Promise<void> {
  if (typeof localStorage === "undefined") return;
  if (localStorage.getItem(legacyImportKey(organizationId))) return;

  const legacySongs = readLegacyJson<WorshipSong[]>(legacySongsKey(organizationId), []);
  const legacySetlists = readLegacyJson<WorshipSetlist[]>(legacySetlistsKey(organizationId), []);
  if (legacySongs.length === 0 && legacySetlists.length === 0) {
    localStorage.setItem(legacyImportKey(organizationId), "1");
    return;
  }

  const userId = await getUserId();

  for (const song of legacySongs) {
    const { error } = await insertWithOrganizationScope("worship_songs", organizationId, {
      id: song.id,
      created_by: userId,
      title: song.title,
      lyrics: song.lyrics,
      musical_key: song.key ?? null,
      category: song.category ?? null,
      notes: song.notes ?? null,
      created_at: song.createdAt,
    });
    if (error) {
      throw new WorshipPersistError(`Failed to import song "${song.title}"`, error);
    }
  }

  for (const setlist of legacySetlists) {
    const { error } = await insertWithOrganizationScope("worship_setlists", organizationId, {
      id: setlist.id,
      created_by: userId,
      title: setlist.title,
      service_date: setlist.date ?? null,
      steps: setlist.steps as Json,
      created_at: setlist.createdAt,
      updated_at: setlist.updatedAt,
    });
    if (error) {
      throw new WorshipPersistError(`Failed to import setlist "${setlist.title}"`, error);
    }
  }

  localStorage.setItem(legacyImportKey(organizationId), "1");
}

/** Load songs and setlists from Supabase into the in-memory cache. Safe to call repeatedly. */
export function ensureWorshipLoaded(organizationId: string): Promise<void> {
  if (!isPersistedOrg(organizationId)) return Promise.resolve();

  const entry = getOrgCache(organizationId);
  if (entry.loadPromise) return entry.loadPromise;

  entry.loadPromise = (async () => {
    try {
      await fetchFromSupabase(organizationId);
      if (entry.songs.length === 0 && entry.setlists.length === 0) {
        await importLegacyLocalStorage(organizationId);
        await fetchFromSupabase(organizationId);
      }
    } finally {
      entry.loadPromise = undefined;
    }
  })();

  return entry.loadPromise;
}

export function clearWorshipCache(organizationId?: string): void {
  if (organizationId) {
    cacheByOrg.delete(organizationId);
    return;
  }
  cacheByOrg.clear();
}

// ── Songs ─────────────────────────────────────────────────────────────────────

export function getSongs(organizationId: string): WorshipSong[] {
  return getOrgCache(organizationId).songs;
}

async function persistSong(organizationId: string, entry: WorshipSong, isNew: boolean): Promise<void> {
  const payload = {
    title: entry.title,
    lyrics: entry.lyrics,
    musical_key: entry.key ?? null,
    category: entry.category ?? null,
    notes: entry.notes ?? null,
  };

  if (isNew) {
    const userId = await getUserId();
    const { error } = await insertWithOrganizationScope("worship_songs", organizationId, {
      id: entry.id,
      created_by: userId,
      created_at: entry.createdAt,
      ...payload,
    });
    if (error) throw new WorshipPersistError("Failed to save song", error);
    return;
  }

  const { error } = await supabase
    .from("worship_songs")
    .update(payload)
    .eq("id", entry.id)
    .eq("organization_id", organizationId);
  if (error) throw new WorshipPersistError("Failed to update song", error);
}

export async function saveSong(
  organizationId: string,
  song: Omit<WorshipSong, "id" | "createdAt"> & { id?: string },
): Promise<WorshipSong> {
  if (!isPersistedOrg(organizationId)) {
    throw new WorshipPersistError(WORSHIP_ORG_NOT_READY_MSG);
  }
  const cache = getOrgCache(organizationId);
  const now = new Date().toISOString();
  const existing = song.id ? cache.songs.find((s) => s.id === song.id) : undefined;
  const entry: WorshipSong = {
    id: song.id ?? uid(),
    title: song.title.trim(),
    lyrics: song.lyrics.trim(),
    key: song.key?.trim() || undefined,
    category: song.category?.trim() || undefined,
    notes: song.notes?.trim() || undefined,
    createdAt: existing?.createdAt ?? now,
  };

  await persistSong(organizationId, entry, !existing);

  const idx = cache.songs.findIndex((s) => s.id === entry.id);
  if (idx >= 0) cache.songs[idx] = entry;
  else cache.songs.unshift(entry);

  return entry;
}

async function persistDeleteSong(organizationId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from("worship_songs")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId);
  if (error) throw new WorshipPersistError("Failed to delete song", error);
}

export async function deleteSong(organizationId: string, id: string): Promise<void> {
  if (!isPersistedOrg(organizationId)) {
    throw new WorshipPersistError(WORSHIP_ORG_NOT_READY_MSG);
  }
  const cache = getOrgCache(organizationId);
  const previous = cache.songs;
  cache.songs = cache.songs.filter((s) => s.id !== id);

  try {
    await persistDeleteSong(organizationId, id);
  } catch (err) {
    cache.songs = previous;
    throw err;
  }
}

export function getSongById(organizationId: string, id: string): WorshipSong | undefined {
  return getSongs(organizationId).find((s) => s.id === id);
}

// ── Setlists ──────────────────────────────────────────────────────────────────

export function getSetlists(organizationId: string): WorshipSetlist[] {
  return getOrgCache(organizationId).setlists;
}

export function getSetlistById(organizationId: string, id: string): WorshipSetlist | undefined {
  return getSetlists(organizationId).find((s) => s.id === id);
}

async function persistSetlist(organizationId: string, entry: WorshipSetlist, isNew: boolean): Promise<void> {
  const payload = {
    title: entry.title,
    service_date: entry.date ?? null,
    steps: entry.steps as Json,
  };

  if (isNew) {
    const userId = await getUserId();
    const { error } = await insertWithOrganizationScope("worship_setlists", organizationId, {
      id: entry.id,
      created_by: userId,
      created_at: entry.createdAt,
      updated_at: entry.updatedAt,
      ...payload,
    });
    if (error) throw new WorshipPersistError("Failed to save setlist", error);
    return;
  }

  const { error } = await supabase
    .from("worship_setlists")
    .update(payload)
    .eq("id", entry.id)
    .eq("organization_id", organizationId);
  if (error) throw new WorshipPersistError("Failed to update setlist", error);
}

export async function saveSetlist(
  organizationId: string,
  setlist: Omit<WorshipSetlist, "id" | "createdAt" | "updatedAt"> & { id?: string; createdAt?: string },
): Promise<WorshipSetlist> {
  if (!isPersistedOrg(organizationId)) {
    throw new WorshipPersistError(WORSHIP_ORG_NOT_READY_MSG);
  }
  const cache = getOrgCache(organizationId);
  const now = new Date().toISOString();
  const existing = setlist.id ? cache.setlists.find((s) => s.id === setlist.id) : undefined;
  const entry: WorshipSetlist = {
    id: setlist.id ?? uid(),
    title: setlist.title.trim(),
    date: setlist.date,
    steps: setlist.steps,
    createdAt: existing?.createdAt ?? setlist.createdAt ?? now,
    updatedAt: now,
  };

  await persistSetlist(organizationId, entry, !existing);

  const idx = cache.setlists.findIndex((s) => s.id === entry.id);
  if (idx >= 0) cache.setlists[idx] = entry;
  else cache.setlists.unshift(entry);

  return entry;
}

async function persistDeleteSetlist(organizationId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from("worship_setlists")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId);
  if (error) throw new WorshipPersistError("Failed to delete setlist", error);
}

export async function deleteSetlist(organizationId: string, id: string): Promise<void> {
  if (!isPersistedOrg(organizationId)) {
    throw new WorshipPersistError(WORSHIP_ORG_NOT_READY_MSG);
  }
  const cache = getOrgCache(organizationId);
  const previous = cache.setlists;
  cache.setlists = cache.setlists.filter((s) => s.id !== id);

  try {
    await persistDeleteSetlist(organizationId, id);
  } catch (err) {
    cache.setlists = previous;
    throw err;
  }
}

// ── Projection helpers ────────────────────────────────────────────────────────

export type ProjectionSlide = {
  id: string;
  title: string;
  body: string;
  type?: string;
};

export function lyricsToSlides(title: string, lyrics: string): ProjectionSlide[] {
  const stanzas = lyrics.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  if (stanzas.length === 0) {
    const lines = lyrics.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return [{ id: uid(), title, body: title, type: "louvor" }];
    return lines.map((line, i) => ({ id: `${i}`, title, body: line, type: "louvor" }));
  }
  return stanzas.map((stanza, i) => ({ id: `${i}`, title, body: stanza, type: "louvor" }));
}

export function setlistToSlides(organizationId: string, setlist: WorshipSetlist): ProjectionSlide[] {
  const slides: ProjectionSlide[] = [];
  for (const step of setlist.steps) {
    if (step.songId) {
      const song = getSongById(organizationId, step.songId);
      if (song) {
        slides.push(...lyricsToSlides(song.title, song.lyrics).map((s) => ({ ...s, type: step.type })));
        continue;
      }
    }
    if (step.content.trim()) {
      slides.push({ id: step.id, title: step.title, body: step.content.trim(), type: step.type });
    }
  }
  return slides;
}

export const STEP_TYPE_LABELS: Record<SetlistStepType, string> = {
  abertura: "Abertura",
  oracao: "Oração",
  louvor: "Louvor",
  leitura: "Leitura bíblica",
  mensagem: "Mensagem",
  encerramento: "Encerramento",
};

export const STEP_TYPES: SetlistStepType[] = [
  "abertura", "oracao", "louvor", "leitura", "mensagem", "encerramento",
];
