import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, locale, hymnCatalog } = await req.json();

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "GEMINI_API_KEY is not configured"
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const normalizedLocale = typeof locale === "string" ? locale.toLowerCase() : "";
    const responseLanguage = normalizedLocale.startsWith("en")
      ? "English"
      : normalizedLocale.startsWith("es")
        ? "español"
        : normalizedLocale.startsWith("pt")
          ? "português brasileiro"
          : "mesmo idioma usado pelo usuário";

    const languageInstruction = `
Locale recebido:
${locale || "auto-detect"}

LANGUAGE OUTPUT RULES - HIGHEST PRIORITY:
- If locale starts with en, respond only in English, even if the user writes in another language.
- Si locale empieza con es, responder solo en español, aunque el usuario escriba en otro idioma.
- Se locale começar com pt ou pt-BR, responder apenas em português brasileiro, mesmo se o usuário escrever em outro idioma.
- If locale is missing, respond in the same language used by the user.
- Required output language for this answer: ${responseLanguage}.
- Do not mix languages in the same answer.
`;

    const systemPrompt = `
Você é o Assistente de Hinos da Harpa Digital integrado ao Ecclesia Admin.

${languageInstruction}

RESPONSABILIDADES:
- Sugerir hinos da Harpa Cristã.
- Montar escalas de louvor completas.
- Relacionar hinos com temas bíblicos.
- Relacionar hinos com versículos.
- Sugerir hinos para cultos específicos.
- Explicar significado dos hinos.
- Ajudar líderes de louvor.
- Organizar momentos de culto.

COMPORTAMENTO:
- Linguagem pastoral e acolhedora.
- Respostas organizadas e práticas.
- Use markdown simples.
- Cite número e nome dos hinos quando possível.
- Não invente hinos inexistentes.
- Seja direto e útil.

FORMATO:
- Escalas separadas por momentos do culto.
- Fácil leitura.
- Sem excesso de emojis.
- Linguagem humana.

CATÁLOGO DISPONÍVEL:
${hymnCatalog || "Catálogo não enviado."}
`;
    const userConversation = (messages || [])
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `
${systemPrompt}

CONVERSA:
${userConversation}
                  `,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: data.error?.message || "Erro ao conectar com Gemini",
          details: data
        }),
        {
          status: response.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const content =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return new Response(
      JSON.stringify({
        content
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );

  } catch (error) {

    return new Response(
      JSON.stringify({
        error: error instanceof Error
          ? error.message
          : "Erro interno da função"
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});

