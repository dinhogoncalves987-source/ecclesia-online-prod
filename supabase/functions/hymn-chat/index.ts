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
    const { messages, hymnCatalog } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `Você é o Assistente de Hinos da Harpa Digital, especializado no hinário cristão evangélico. Você conhece profundamente os hinos do Cantor Cristão e da tradição evangélica brasileira.

CATÁLOGO DE HINOS DISPONÍVEIS NO SISTEMA:
${hymnCatalog}

SUAS RESPONSABILIDADES:
- Sugerir hinos por tema, ocasião, sentimento ou passagem bíblica
- Montar escalas de louvor completas para cultos (com ordem sugerida)
- Explicar o significado e contexto histórico dos hinos
- Conectar hinos com passagens bíblicas relevantes
- Informar se um hino específico está ou não no nosso catálogo
- Ajudar líderes de louvor a planejar momentos de adoração

REGRAS IMPORTANTES:
- SEMPRE sugira hinos que existem no nosso catálogo (números 1 a 560)
- Cite sempre o NÚMERO e o TÍTULO do hino ao sugerir
- Se o usuário pedir algo que não temos, informe e sugira alternativas do catálogo
- Responda SEMPRE em português brasileiro
- Use linguagem pastoral e acolhedora
- Formate respostas com markdown para boa legibilidade
- Ao montar escalas de louvor, organize por momentos: abertura, adoração, louvor, ofertório, encerramento

EXEMPLOS DE PERGUNTAS QUE VOCÊ DEVE SABER RESPONDER:
- "Quais hinos temos sobre graça?" → Liste os hinos da categoria Graça
- "Monte uma escala para culto de domingo" → Sugira 4-6 hinos organizados por momentos
- "O hino 35 está no nosso hinário?" → Sim, é "Que Segurança"
- "Qual hino combina com João 3:16?" → Sugira hinos sobre salvação/amor de Deus
- "Preciso de hinos para um culto de Natal" → Sugira hinos natalinos e de adoração`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Muitas requisições. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos em Configurações." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "Erro ao conectar com a IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("hymn-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
