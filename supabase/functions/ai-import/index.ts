import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authorization = req.headers.get("Authorization") ?? "";
    const jwt = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Autenticação obrigatória." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase auth environment is not configured");
    }
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser(jwt);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida ou expirada." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { fileContent, fileType, targetModule, fields } = await req.json();
    const fieldList = Array.isArray(fields) ? fields as unknown[] : [];
    const validFields = fieldList.every(field => {
      if (!field || typeof field !== "object") return false;
      const candidate = field as { key?: unknown; label?: unknown; required?: unknown };
      return typeof candidate.key === "string"
        && candidate.key.length > 0
        && candidate.key.length <= 80
        && typeof candidate.label === "string"
        && candidate.label.length > 0
        && candidate.label.length <= 120
        && (candidate.required === undefined || typeof candidate.required === "boolean");
    });
    if (
      typeof fileContent !== "string"
      || fileContent.length === 0
      || fileContent.length > 200_000
      || typeof targetModule !== "string"
      || targetModule.length > 80
      || fieldList.length === 0
      || fieldList.length > 80
      || !validFields
    ) {
      return new Response(JSON.stringify({ error: "Arquivo ou mapeamento inválido." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const fieldsDesc = fieldList.map(field => {
      const safe = field as { key: string; label: string; required?: boolean };
      return `- ${safe.key} (${safe.label})${safe.required ? " [OBRIGATÓRIO]" : ""}`;
    }).join("\n");

    const systemPrompt = `Você é um assistente especializado em extrair dados estruturados de documentos.
O usuário vai enviar o conteúdo de um arquivo (texto de CSV, PDF, ou descrição de imagem) e você deve extrair os dados para o módulo "${targetModule}".

CAMPOS DISPONÍVEIS:
${fieldsDesc}

REGRAS:
- Retorne APENAS um JSON válido, sem markdown, sem explicações
- O JSON deve ser um array de objetos com as chaves correspondentes aos campos
- Se um campo obrigatório não puder ser extraído, preencha com "N/A"
- Limpe e normalize os dados (remova espaços extras, formate telefones, etc.)
- Se o conteúdo não contiver dados relevantes, retorne um array vazio []
- Para valores monetários, retorne apenas o número (ex: 1500.00)
- Para tipos (Entrada/Saída), interprete a partir do contexto

EXEMPLO DE RESPOSTA:
[{"name":"João Silva","phone":"(11)99999-0001","role":"Membro"},{"name":"Maria Santos","phone":"(11)99999-0002","role":"Diácono"}]`;

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
          { role: "user", content: `Extraia os dados do seguinte conteúdo (tipo: ${fileType}):\n\n${fileContent}` },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Muitas requisições. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro ao conectar com a IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";
    
    // Try to extract JSON from the response
    let extracted;
    try {
      // Remove markdown code blocks if present
      const cleaned = content.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
      extracted = JSON.parse(cleaned);
    } catch {
      extracted = [];
    }

    return new Response(JSON.stringify({ data: extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-import error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
