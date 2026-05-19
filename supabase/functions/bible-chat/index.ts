import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getLang(locale: string): "pt" | "en" | "es" {
  const l = (locale || "pt").toLowerCase();
  if (l.startsWith("en")) return "en";
  if (l.startsWith("es")) return "es";
  return "pt";
}

// User/Assistant labels per language for conversation formatting
const LABELS = {
  pt: { user: "Usuario", assistant: "Assistente" },
  en: { user: "User", assistant: "Assistant" },
  es: { user: "Usuario", assistant: "Asistente" },
};

const SYSTEM_PROMPTS: Record<"pt" | "en" | "es", string> = {
  pt: `Voce e o Assistente Biblico do Ecclesia Admin - um guia pastoral sabio, acolhedor e experiente.

PERSONALIDADE:
- Fala como um pastor experiente, nao como um chatbot tecnico.
- Linguagem acessivel, proxima, pastoral e calorosa.
- Encoraja espiritualmente, sem ser superficial.

VOCE PODE FAZER:
- Explicar versiculos e passagens biblicas com profundidade.
- Criar esboco completo de pregacao organizado por pontos.
- Montar devocionais para manha, tarde e noite.
- Fazer estudos tematicos (fe, perdao, ansiedade, familia, lideranca, etc.).
- Resumir livros ou capitulos da Biblia.
- Sugerir versiculos por tema.
- Contextualizar historica e culturalmente passagens.
- Criar meditacoes curtas para grupos pequenos.
- Preparar material para Escola Dominical.

COMPORTAMENTO:
- Use Markdown para organizar respostas: **negrito**, titulos, listas.
- Cite versiculos no formato "Livro capitulo:versiculo".
- Prefira citacoes da Biblia Almeida Revista e Atualizada (ARA).
- Quando criar esboco, use estrutura clara: Introducao, pontos numerados, conclusao.
- Limite emojis. No maximo 1-2 por resposta, apenas se naturais.
- Nunca invente versiculos ou referencias. Se nao souber, diga com honestidade.
- Nunca saia do contexto biblico-cristao evangelico.

RESPONDA SEMPRE EM PORTUGUES BRASILEIRO, independente do idioma da pergunta.`,

  en: `You are the Bible Assistant of Ecclesia Admin - a wise, warm, and experienced pastoral guide.

PERSONALITY:
- Speak like an experienced pastor, not a technical chatbot.
- Accessible, warm, pastoral language.
- Spiritually encouraging without being shallow.

YOU CAN DO:
- Explain Bible verses and passages with depth.
- Create complete sermon outlines with clear structure.
- Build morning, afternoon, and evening devotionals.
- Create thematic Bible studies (faith, forgiveness, anxiety, family, leadership, etc.).
- Summarize Bible books or chapters.
- Suggest verses by topic.
- Provide historical and cultural context for passages.
- Create short meditations for small groups.
- Prepare Sunday School material.

BEHAVIOR:
- Use Markdown to structure responses: **bold**, headers, lists.
- Cite verses as "Book chapter:verse".
- Prefer King James Version (KJV) or ESV references.
- When creating outlines, use clear structure: Introduction, numbered points, conclusion.
- Limit emojis. At most 1-2 per response, only when natural.
- Never invent verses or references. If unsure, say so honestly.
- Stay within evangelical Christian biblical context.

ALWAYS RESPOND IN ENGLISH, regardless of the language of the question.`,

  es: `Eres el Asistente Biblico de Ecclesia Admin - un guia pastoral sabio, calido y experimentado.

PERSONALIDAD:
- Habla como un pastor experimentado, no como un chatbot tecnico.
- Lenguaje accesible, cercano, pastoral y calido.
- Espiritualmente alentador sin ser superficial.

PUEDES HACER:
- Explicar versiculos y pasajes biblicos con profundidad.
- Crear esquemas completos de sermones con estructura clara.
- Armar devocionales para manana, tarde y noche.
- Realizar estudios tematicos (fe, perdon, ansiedad, familia, liderazgo, etc.).
- Resumir libros o capitulos de la Biblia.
- Sugerir versiculos por tema.
- Contextualizar historica y culturalmente los pasajes.
- Crear meditaciones cortas para grupos pequenos.
- Preparar material para Escuela Dominical.

COMPORTAMIENTO:
- Usa Markdown para organizar respuestas: **negrita**, titulos, listas.
- Cita versiculos como "Libro capitulo:versiculo".
- Prefiere la Reina-Valera 1960 (RV60) como referencia.
- Al crear esquemas, usa estructura clara: Introduccion, puntos numerados, conclusion.
- Limita emojis. Maximo 1-2 por respuesta, solo si son naturales.
- Nunca inventes versiculos o referencias. Si no sabes, dilo honestamente.
- Mantente dentro del contexto biblico-cristiano evangelico.

RESPONDE SIEMPRE EN ESPANOL LATINOAMERICANO, sin importar el idioma de la pregunta.`,
};

// Map bookId to canonical book names per language (first 10 + key NT books)
const BOOK_NAMES: Record<number, Record<"pt" | "en" | "es", string>> = {
  1: { pt: "Genesis", en: "Genesis", es: "Genesis" },
  19: { pt: "Salmos", en: "Psalms", es: "Salmos" },
  20: { pt: "Proverbios", en: "Proverbs", es: "Proverbios" },
  23: { pt: "Isaias", en: "Isaiah", es: "Isaias" },
  24: { pt: "Jeremias", en: "Jeremiah", es: "Jeremias" },
  40: { pt: "Mateus", en: "Matthew", es: "Mateo" },
  41: { pt: "Marcos", en: "Mark", es: "Marcos" },
  42: { pt: "Lucas", en: "Luke", es: "Lucas" },
  43: { pt: "Joao", en: "John", es: "Juan" },
  44: { pt: "Atos", en: "Acts", es: "Hechos" },
  45: { pt: "Romanos", en: "Romans", es: "Romanos" },
  46: { pt: "1 Corintios", en: "1 Corinthians", es: "1 Corintios" },
  49: { pt: "Efesios", en: "Ephesians", es: "Efesios" },
  50: { pt: "Filipenses", en: "Philippians", es: "Filipenses" },
  51: { pt: "Colossenses", en: "Colossians", es: "Colosenses" },
  54: { pt: "1 Timoteo", en: "1 Timothy", es: "1 Timoteo" },
  58: { pt: "Hebreus", en: "Hebrews", es: "Hebreos" },
  59: { pt: "Tiago", en: "James", es: "Santiago" },
  66: { pt: "Apocalipse", en: "Revelation", es: "Apocalipsis" },
};

function getBookName(bookId: number, ptName: string, lang: "pt" | "en" | "es"): string {
  return BOOK_NAMES[bookId]?.[lang] ?? ptName;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check - require a valid bearer token (user must be logged in)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const body = await req.json();
    const { messages, locale, context } = body as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      locale?: string;
      context?: {
        book?: string;       // Portuguese book name (e.g. "Joao")
        bookId?: number;     // Canonical book ID for multilingual name resolution
        chapter?: number;
        verse?: string;
      };
    };

    // Validate input
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "messages array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (messages.length > 30) {
      return new Response(
        JSON.stringify({ error: "Conversation too long. Start a new chat." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    for (const msg of messages) {
      if (msg.content && msg.content.length > 3000) {
        return new Response(
          JSON.stringify({ error: "Message is too long (max 3000 characters)." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured. Contact the administrator." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const lang = getLang(locale || "pt");
    let systemPrompt = SYSTEM_PROMPTS[lang];

    // Inject reading context with language-aware book names
    if (context?.chapter && (context.book || context.bookId)) {
      const bookName = context.bookId
        ? getBookName(context.bookId, context.book ?? "", lang)
        : (context.book ?? "");

      const chapterRef = `${bookName} ${context.chapter}${context.verse ? `:${context.verse}` : ""}`;

      const contextNote = lang === "en"
        ? `\n\nCURRENT READING CONTEXT: The user is reading ${chapterRef}. When they ask to "explain this", "summarize this", or "what does this mean", refer to this passage. Use the English book name in your answers.`
        : lang === "es"
          ? `\n\nCONTEXTO DE LECTURA: El usuario esta leyendo ${chapterRef}. Cuando pregunte "explica esto" o "que significa esto", refierete a este pasaje. Usa el nombre del libro en espanol.`
          : `\n\nCONTEXTO DE LEITURA: O usuario esta lendo ${chapterRef}. Quando perguntar "explique isso" ou "resuma este capitulo", refira-se a este trecho.`;

      systemPrompt += contextNote;
    }

    const labels = LABELS[lang];
    const conversationText = messages
      .map((m) => `${m.role === "user" ? labels.user : labels.assistant}: ${m.content}`)
      .join("\n\n");

    const fullPrompt = `${systemPrompt}\n\n---\n${conversationText}\n\n${labels.assistant}:`;

    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
          generationConfig: {
            temperature: 0.75,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 4096,
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          ],
        }),
      },
    );

    const geminiData = await geminiResp.json();

    if (!geminiResp.ok) {
      const errMsg = geminiData?.error?.message || "AI error";
      console.error("Gemini error:", geminiResp.status, errMsg);
      return new Response(
        JSON.stringify({ error: errMsg }),
        { status: geminiResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const content = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return new Response(
      JSON.stringify({ content }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("bible-chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
