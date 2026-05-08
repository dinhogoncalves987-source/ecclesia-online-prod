import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};



serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const bookId = url.searchParams.get("bookId") || "1";
    const chapter = url.searchParams.get("chapter") || "1";
    const locale = url.searchParams.get("locale") || "pt";

    let version = "ARA";

    if (locale.startsWith("en")) version = "KJV";
    else if (locale.startsWith("es")) version = "RVA";

    const resp = await fetch(`https://bolls.life/get-chapter/${version}/${bookId}/${chapter}/`);

    if (!resp.ok) {
      const text = await resp.text();
      console.error("Bible API error:", resp.status, text);
      return new Response(
        JSON.stringify({ verses: [], error: "Capítulo não encontrado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await resp.json();

    const verses = Array.isArray(data)
      ? data.map((v: any) => ({ num: v.verse, text: String(v.text || "").replace(/<S>.*?<\/S>/g, "").replace(/<[^>]+>/g, "").trim() }))
      : [];

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


