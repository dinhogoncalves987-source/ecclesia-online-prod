import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const bucketName = "platform-media";

// Modelo estável de geração de imagem da Gemini API (não a variante
// "-preview", que a documentação oficial marca como descontinuada).
// generateContent com este modelo exige generationConfig.responseModalities
// incluindo "IMAGE" — sem isso a API pode responder só texto.
const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";
const GEMINI_IMAGE_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`;
const GEMINI_TIMEOUT_MS = 60000;

const sanitizeFilePart = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .toLowerCase()
    .slice(0, 48) || "campanha";

const decodeBase64 = (base64: string) =>
  Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number) => {
  const controller = new AbortController();
  let timeout: number | undefined;

  try {
    return await Promise.race([
      fetch(url, { ...init, signal: controller.signal }),
      new Promise<Response>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error(`Request timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const buildImagePrompt = (title: string, shortDescription: string, fullContent: string, generationId: string) => `
Create a new photorealistic horizontal campaign banner image.

Campaign:
Title: ${title}
Short call: ${shortDescription}
Visual instructions and context: ${fullContent}

Mandatory requirements:
- photorealistic documentary image, not illustration, not drawing, not vector art, not 3D render
- modern cinematic humanitarian campaign look
- image must be based specifically on the campaign context above
- horizontal banner / cover composition, 16:9 safe composition
- fill the full frame edge-to-edge, no white borders, no side bands, no poster centered inside a canvas
- no text, no words, no captions, no logos, no watermark inside the image
- realistic people, realistic faces, realistic hands, no extra fingers, no distorted anatomy
- emotional, hopeful, reverent, high-end church mission campaign photography
- natural light, realistic depth of field, premium color grading
- keep important subjects in the central safe area

Generate a fresh unique image. Do not reuse previous compositions.
Uniqueness id: ${generationId}
`;

type GeminiImageResult =
  | { ok: true; bytes: Uint8Array; contentType: string; extension: string; provider: "gemini" }
  | { ok: false; status: number; error: string };

const generateWithGemini = async (prompt: string, apiKey: string): Promise<GeminiImageResult> => {
  let response: Response;

  try {
    response = await fetchWithTimeout(
      `${GEMINI_IMAGE_ENDPOINT}?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            responseModalities: ["IMAGE"],
          },
        }),
      },
      GEMINI_TIMEOUT_MS
    );
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: `Gemini timeout/network error: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    return {
      ok: false,
      status: response.status,
      error: `Gemini ${response.status}: ${errBody}`,
    };
  }

  let data: {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { data?: string; mimeType?: string };
          inline_data?: { data?: string; mime_type?: string };
        }>;
      };
    }>;
  };
  try {
    data = await response.json();
  } catch {
    return { ok: false, status: response.status, error: "Gemini returned an invalid (non-JSON) response" };
  }

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
  const inlineData = imagePart?.inlineData || imagePart?.inline_data;
  const base64Image = inlineData?.data;

  if (!base64Image) {
    return { ok: false, status: response.status, error: "Gemini did not return image bytes" };
  }

  const contentType =
    (inlineData as { mimeType?: string; mime_type?: string })?.mimeType ||
    (inlineData as { mimeType?: string; mime_type?: string })?.mime_type ||
    "image/png";
  return {
    ok: true,
    bytes: decodeBase64(base64Image),
    contentType,
    extension: contentType.includes("jpeg") ? "jpg" : "png",
    provider: "gemini",
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, short_description, full_content, generation_id, announcement_id } = await req.json();

    if (!title || !short_description || !full_content) {
      return new Response(
        JSON.stringify({ error: "title, short_description and full_content are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Supabase storage secrets are not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ imageUrl: null, error: "Image generation is not configured. Set GEMINI_API_KEY." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const generationId = generation_id || crypto.randomUUID();
    const prompt = buildImagePrompt(title, short_description, full_content, generationId);

    const result = await generateWithGemini(prompt, geminiApiKey);

    if (!result.ok) {
      // Log só status + mensagem do provedor — nunca a chave.
      console.error("Gemini image generation error:", result.status, result.error);

      let userMessage = "Real image generation failed. Please try again.";
      if (result.status === 429) {
        userMessage = "Image generation usage limit reached. Please wait a moment and try again.";
      } else if (result.status === 401 || result.status === 403) {
        userMessage = "Image generation authentication failed. Please contact support.";
      } else if (result.status === 0) {
        userMessage = "Image generation timed out. Please try again.";
      } else if (result.status >= 500) {
        userMessage = "Image provider is temporarily unavailable. Please try again.";
      } else if (result.error.includes("did not return image bytes")) {
        userMessage = "The AI did not return an image. Please try again.";
      }

      return new Response(
        JSON.stringify({ imageUrl: null, error: userMessage, details: [result.error] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const filePath = `platform-announcements/ai-${Date.now()}-${generationId}-${sanitizeFilePart(title)}.${result.extension}`;
    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(filePath, result.bytes, {
        contentType: result.contentType,
        upsert: false,
      });

    if (uploadError) {
      return new Response(
        JSON.stringify({ error: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath);
    const imageUrl = data.publicUrl;

    if (announcement_id) {
      const { error: updateError } = await supabase
        .from("platform_announcements")
        .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
        .eq("id", announcement_id);

      if (updateError) {
        return new Response(
          JSON.stringify({ error: updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ imageUrl, provider: result.provider, prompt }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno da função" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
