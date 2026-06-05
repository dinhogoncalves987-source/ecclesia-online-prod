import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BOOLS_TIMEOUT_MS = 12_000;

type RawVerse = { verse?: number; num?: number; text?: string };

function getVersionCandidates(locale: string): string[] {
  const l = (locale || "pt").toLowerCase();
  if (l.startsWith("en")) return ["KJV"];
  if (l.startsWith("es")) return ["NVI", "RVR1960"];
  return ["ARA", "ACF"];
}

function cleanVerseText(text: string): string {
  return String(text || "")
    .replace(/<S>.*?<\/S>/gi, "")
    .replace(/<sup>.*?<\/sup>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseVerses(data: unknown): Array<{ num: number; text: string }> {
  if (!Array.isArray(data)) return [];
  return data
    .map((v: RawVerse) => ({
      num: Number(v.verse ?? v.num ?? 0),
      text: cleanVerseText(v.text ?? ""),
    }))
    .filter((v) => v.num > 0 && v.text.length > 0);
}

async function fetchChapterFromBolls(
  version: string,
  bookId: string,
  chapter: string,
): Promise<Array<{ num: number; text: string }>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BOOLS_TIMEOUT_MS);

  try {
    const resp = await fetch(
      `https://bolls.life/get-chapter/${version}/${bookId}/${chapter}/`,
      { signal: controller.signal },
    );

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error("Bolls API error:", version, resp.status, text.slice(0, 200));
      return [];
    }

    const data = await resp.json();
    return parseVerses(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Bolls fetch failed:", version, bookId, chapter, msg);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const bookId = url.searchParams.get("bookId") || "1";
    const chapter = url.searchParams.get("chapter") || "1";
    const locale = url.searchParams.get("locale") || "pt";

    const versions = getVersionCandidates(locale);
    let verses: Array<{ num: number; text: string }> = [];
    let usedVersion = versions[0];

    for (const version of versions) {
      verses = await fetchChapterFromBolls(version, bookId, chapter);
      if (verses.length > 0) {
        usedVersion = version;
        break;
      }
      // brief pause before fallback translation
      await new Promise((r) => setTimeout(r, 150));
    }

    if (verses.length === 0) {
      return new Response(
        JSON.stringify({
          verses: [],
          error: "Capítulo não encontrado ou indisponível no momento.",
          version: usedVersion,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ verses, version: usedVersion }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("bible-verses error:", e);
    return new Response(
      JSON.stringify({
        verses: [],
        error: e instanceof Error ? e.message : "Erro interno",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
