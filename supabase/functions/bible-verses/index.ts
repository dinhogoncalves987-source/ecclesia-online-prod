import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Bible API - using ABibliaDigital
const BIBLE_API = "https://www.abibliadigital.com.br/api";

// Book ID mapping (ABibliaDigital uses abbreviations)
const bookIdMap: Record<number, string> = {
  1: "gn", 2: "ex", 3: "lv", 4: "nm", 5: "dt",
  6: "js", 7: "jz", 8: "rt", 9: "1sm", 10: "2sm",
  11: "1rs", 12: "2rs", 13: "1cr", 14: "2cr", 15: "ed",
  16: "ne", 17: "et", 18: "jó", 19: "sl", 20: "pv",
  21: "ec", 22: "ct", 23: "is", 24: "jr", 25: "lm",
  26: "ez", 27: "dn", 28: "os", 29: "jl", 30: "am",
  31: "ob", 32: "jn", 33: "mq", 34: "na", 35: "hc",
  36: "sf", 37: "ag", 38: "zc", 39: "ml",
  40: "mt", 41: "mc", 42: "lc", 43: "jo", 44: "at",
  45: "rm", 46: "1co", 47: "2co", 48: "gl", 49: "ef",
  50: "fp", 51: "cl", 52: "1ts", 53: "2ts", 54: "1tm",
  55: "2tm", 56: "tt", 57: "fm", 58: "hb", 59: "tg",
  60: "1pe", 61: "2pe", 62: "1jo", 63: "2jo", 64: "3jo",
  65: "jd", 66: "ap",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const bookId = parseInt(url.searchParams.get("bookId") || "1");
    const chapter = parseInt(url.searchParams.get("chapter") || "1");

    const abbrev = bookIdMap[bookId] || "gn";

    const resp = await fetch(
      `${BIBLE_API}/verses/nvi/${abbrev}/${chapter}`,
      { headers: { Accept: "application/json" } }
    );

    if (!resp.ok) {
      // Fallback: try almeida (ra)
      const fallback = await fetch(
        `${BIBLE_API}/verses/ra/${abbrev}/${chapter}`,
        { headers: { Accept: "application/json" } }
      );
      
      if (!fallback.ok) {
        return new Response(
          JSON.stringify({ verses: [], error: "Capítulo não encontrado" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await fallback.json();
      const verses = (data.verses || []).map((v: any) => ({
        num: v.number,
        text: v.text,
      }));

      return new Response(
        JSON.stringify({ verses }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await resp.json();
    const verses = (data.verses || []).map((v: any) => ({
      num: v.number,
      text: v.text,
    }));

    return new Response(
      JSON.stringify({ verses }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("bible-verses error:", e);
    return new Response(
      JSON.stringify({ verses: [], error: e instanceof Error ? e.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
