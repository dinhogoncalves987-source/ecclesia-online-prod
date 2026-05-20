import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type AssistantField = {
  key: string;
  label: string;
  required?: boolean;
  options?: string[];
};

type AssistantModule = "member" | "document" | "communication" | "financial";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const MAX_INPUT = 1500;

function buildSystemPrompt(
  module: AssistantModule,
  fields: AssistantField[],
  lang: string
): string {
  const langLabel: Record<string, string> = {
    pt: "Portuguese (pt-BR)",
    en: "English (en-US)",
    es: "Spanish (es-MX)",
  };
  const outputLang = langLabel[lang] ?? langLabel.pt;

  const moduleContext: Record<AssistantModule, Record<string, string>> = {
    member: {
      pt: "cadastro de membro de uma igreja evangélica",
      en: "church member registration",
      es: "registro de miembro de iglesia evangélica",
    },
    document: {
      pt: "documento institucional de uma igreja",
      en: "institutional church document",
      es: "documento institucional de una iglesia",
    },
    communication: {
      pt: "comunicado pastoral ou aviso da igreja",
      en: "pastoral announcement or church notice",
      es: "comunicado pastoral o aviso de la iglesia",
    },
    financial: {
      pt: "lançamento financeiro da tesouraria da igreja",
      en: "church treasury financial entry",
      es: "registro financiero de la tesorería de la iglesia",
    },
  };

  const ctx = moduleContext[module]?.[lang] ?? moduleContext[module]?.["pt"];

  const fieldsDesc = fields
    .map(
      (f) =>
        `- key="${f.key}" label="${f.label}"${f.required ? " [REQUIRED]" : " [optional]"}${
          f.options ? ` options: [${f.options.join(", ")}]` : ""
        }`
    )
    .join("\n");

  return `You are a structured data extraction assistant for ${ctx}.
The user describes the information in natural language. Extract it into a JSON object.

FIELDS TO EXTRACT:
${fieldsDesc}

RULES:
- Return ONLY a valid raw JSON object (no markdown, no code blocks, no explanations).
- JSON format: { "key": "value", ... }
- For optional missing fields: use empty string "".
- For required missing fields: use "?" to signal the field is missing.
- Normalize data: capitalize names properly, format phone numbers, trim whitespace.
- For monetary amounts: return only the number as string (e.g. "250.00").
- For transaction type: use "Entrada" for income/offerings, "Saida" for expenses.
- If options are provided for a field, pick the closest matching option.
- Infer reasonable defaults from context when possible (e.g. status "Ativo" for a new member).
- Respond in ${outputLang}.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth: require valid Bearer token (Supabase anon or user JWT)
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const module: AssistantModule = body.module ?? "member";
    const rawText: string = (body.text ?? "").slice(0, MAX_INPUT).trim();
    const lang: string = (body.lang ?? "pt").toLowerCase().split("-")[0];
    const fields: AssistantField[] = Array.isArray(body.fields) ? body.fields : [];

    if (!rawText) {
      return new Response(JSON.stringify({ error: "Empty input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = buildSystemPrompt(module, fields, lang);

    const geminiResp = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: rawText }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 600,
          responseMimeType: "text/plain",
        },
      }),
    });

    if (!geminiResp.ok) {
      const errBody = await geminiResp.text().catch(() => "");
      console.error("Gemini error:", geminiResp.status, errBody);
      const status = geminiResp.status === 429 ? 429 : 502;
      const msg =
        geminiResp.status === 429
          ? "Too many requests. Please wait a moment."
          : "AI service error. Please try again.";
      return new Response(JSON.stringify({ error: msg }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiData = await geminiResp.json();
    const rawContent: string =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Strip any accidental markdown wrapping
    const cleaned = rawContent
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    let extracted: Record<string, string> = {};
    try {
      const parsed = JSON.parse(cleaned);
      if (typeof parsed === "object" && !Array.isArray(parsed)) {
        extracted = parsed;
      }
    } catch {
      // Fallback: try to find JSON object in the text
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          extracted = JSON.parse(match[0]);
        } catch {
          extracted = {};
        }
      }
    }

    // Identify missing required fields
    const missing: string[] = fields
      .filter((f) => f.required && (!extracted[f.key] || extracted[f.key] === "?"))
      .map((f) => f.key);

    // Sanitize: convert "?" values to ""
    for (const key of Object.keys(extracted)) {
      if (extracted[key] === "?") extracted[key] = "";
    }

    return new Response(JSON.stringify({ data: extracted, missing }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("operational-assistant error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
