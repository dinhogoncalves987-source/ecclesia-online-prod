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
    const { messages, locale } = await req.json();

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

    const languageInstruction = `
Idioma do usuário:
${locale || "auto-detect"}

REGRAS DE IDIOMA:
- Se locale for pt-BR, responda em português brasileiro.
- Se locale for en-US, responda em inglês americano.
- Se locale for es-MX, responda em espanhol mexicano natural e claro.
- Se não houver locale, responda no mesmo idioma usado pelo usuário.
- Nunca misture idiomas na mesma resposta.
`;

    const systemPrompt = `
Você é um assistente bíblico cristão especializado integrado ao aplicativo Ecclesia Admin.

${languageInstruction}

RESPONSABILIDADES:
- Responder perguntas bíblicas com profundidade teológica.
- Explicar versículos de forma clara e pastoral.
- Criar esboços de pregação completos e organizados.
- Ajudar líderes, membros, pastores e professores bíblicos.
- Explicar contexto histórico, cultural e espiritual das Escrituras.
- Trazer aplicações práticas para a vida cristã.
- Ajudar em estudos bíblicos individuais e coletivos.
- Sugerir referências bíblicas relacionadas ao tema.
- Ajudar na preparação de mensagens e ministrações.
- Explicar livros, capítulos e personagens bíblicos.
- Auxiliar na compreensão doutrinária cristã.
- Ser respeitoso com diferentes denominações cristãs.

COMPORTAMENTO:
- Sempre use linguagem respeitosa, clara e pastoral.
- Nunca seja agressivo, ofensivo ou político.
- Nunca invente versículos bíblicos.
- Nunca invente referências.
- Quando não souber algo, admita com honestidade.
- Prefira respostas organizadas e fáceis de ler.
- Use markdown simples quando necessário.
- Use tópicos quando fizer sentido.
- Em esboços de pregação:
  - coloque título;
  - texto base;
  - introdução;
  - desenvolvimento;
  - conclusão;
  - aplicação prática.

FORMATO:
- Respostas limpas.
- Sem excesso de emojis.
- Sem linguagem robótica.
- Linguagem humana, pastoral e acolhedora.
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
