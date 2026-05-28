/**
 * Worship module V1 — localStorage per church.
 * No Supabase yet; prepares for future migration.
 */

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

const songsKey = (churchId: string) => `ecclesia_worship_songs_${churchId}`;
const setlistsKey = (churchId: string) => `ecclesia_worship_setlists_${churchId}`;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // quota exceeded — silently ignore
  }
}

export function uid(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Songs ─────────────────────────────────────────────────────────────────────

export function getSongs(churchId: string): WorshipSong[] {
  return readJson<WorshipSong[]>(songsKey(churchId), []);
}

export function saveSong(churchId: string, song: Omit<WorshipSong, "id" | "createdAt"> & { id?: string }): WorshipSong {
  const songs = getSongs(churchId);
  const now = new Date().toISOString();
  const entry: WorshipSong = {
    id: song.id ?? uid(),
    title: song.title.trim(),
    lyrics: song.lyrics.trim(),
    key: song.key?.trim() || undefined,
    category: song.category?.trim() || undefined,
    notes: song.notes?.trim() || undefined,
    createdAt: song.id ? (songs.find((s) => s.id === song.id)?.createdAt ?? now) : now,
  };
  const idx = songs.findIndex((s) => s.id === entry.id);
  if (idx >= 0) songs[idx] = entry;
  else songs.unshift(entry);
  writeJson(songsKey(churchId), songs);
  return entry;
}

export function deleteSong(churchId: string, id: string): void {
  writeJson(songsKey(churchId), getSongs(churchId).filter((s) => s.id !== id));
}

export function getSongById(churchId: string, id: string): WorshipSong | undefined {
  return getSongs(churchId).find((s) => s.id === id);
}

// ── Setlists ──────────────────────────────────────────────────────────────────

export function getSetlists(churchId: string): WorshipSetlist[] {
  return readJson<WorshipSetlist[]>(setlistsKey(churchId), []);
}

export function getSetlistById(churchId: string, id: string): WorshipSetlist | undefined {
  return getSetlists(churchId).find((s) => s.id === id);
}

export function saveSetlist(
  churchId: string,
  setlist: Omit<WorshipSetlist, "id" | "createdAt" | "updatedAt"> & { id?: string; createdAt?: string },
): WorshipSetlist {
  const setlists = getSetlists(churchId);
  const now = new Date().toISOString();
  const existing = setlist.id ? setlists.find((s) => s.id === setlist.id) : undefined;
  const entry: WorshipSetlist = {
    id: setlist.id ?? uid(),
    title: setlist.title.trim(),
    date: setlist.date,
    steps: setlist.steps,
    createdAt: existing?.createdAt ?? setlist.createdAt ?? now,
    updatedAt: now,
  };
  const idx = setlists.findIndex((s) => s.id === entry.id);
  if (idx >= 0) setlists[idx] = entry;
  else setlists.unshift(entry);
  writeJson(setlistsKey(churchId), setlists);
  return entry;
}

export function deleteSetlist(churchId: string, id: string): void {
  writeJson(setlistsKey(churchId), getSetlists(churchId).filter((s) => s.id !== id));
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

export function setlistToSlides(churchId: string, setlist: WorshipSetlist): ProjectionSlide[] {
  const slides: ProjectionSlide[] = [];
  for (const step of setlist.steps) {
    if (step.songId) {
      const song = getSongById(churchId, step.songId);
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
