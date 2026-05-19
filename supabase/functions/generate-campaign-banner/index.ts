import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const bucketName = "platform-media";

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

const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs = 70000) => {
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

const generateWithOpenAi = async (prompt: string, apiKey: string) => {
  let response: Response;

  try {
    response = await fetchWithTimeout("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        n: 1,
        size: "1536x1024",
        quality: "medium",
        output_format: "png",
      }),
    }, 120000);
  } catch (error) {
    return {
      ok: false as const,
      error: `OpenAI timeout/network error: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }

  if (!response.ok) {
    return {
      ok: false as const,
      error: `OpenAI ${response.status}: ${await response.text()}`,
    };
  }

  const data = await response.json();
  const base64Image = data?.data?.[0]?.b64_json;

  if (!base64Image) {
    return { ok: false as const, error: "OpenAI did not return image bytes" };
  }

  return {
    ok: true as const,
    bytes: decodeBase64(base64Image),
    contentType: "image/png",
    extension: "png",
    provider: "openai",
  };
};

const generateWithGemini = async (prompt: string, apiKey: string) => {
  let response: Response;

  try {
    response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
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
        }),
      },
      25000
    );
  } catch (error) {
    return {
      ok: false as const,
      error: `Gemini timeout/network error: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }

  if (!response.ok) {
    return {
      ok: false as const,
      error: `Gemini ${response.status}: ${await response.text()}`,
    };
  }

  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((part: { inlineData?: { data?: string }; inline_data?: { data?: string } }) =>
    part.inlineData?.data || part.inline_data?.data
  );
  const inlineData = imagePart?.inlineData || imagePart?.inline_data;
  const base64Image = inlineData?.data;

  if (!base64Image) {
    return { ok: false as const, error: "Gemini did not return image bytes" };
  }

  const contentType = inlineData?.mimeType || inlineData?.mime_type || "image/png";
  return {
    ok: true as const,
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
    const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Supabase storage secrets are not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!openAiApiKey && !geminiApiKey) {
      return new Response(
        JSON.stringify({ imageUrl: null, error: "No real image provider is configured. Set OPENAI_API_KEY or GEMINI_API_KEY." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const generationId = generation_id || crypto.randomUUID();
    const prompt = buildImagePrompt(title, short_description, full_content, generationId);
    const errors: string[] = [];
    let generated:
      | { ok: true; bytes: Uint8Array; contentType: string; extension: string; provider: string }
      | null = null;

    if (geminiApiKey) {
      const result = await generateWithGemini(prompt, geminiApiKey);
      if (result.ok) {
        generated = result;
      } else {
        errors.push(result.error);
      }
    }

    if (!generated && openAiApiKey) {
      const result = await generateWithOpenAi(prompt, openAiApiKey);
      if (result.ok) {
        generated = result;
      } else {
        errors.push(result.error);
      }
    }

    if (!generated) {
      return new Response(
        JSON.stringify({ imageUrl: null, error: "Real image generation failed", details: errors }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const filePath = `platform-announcements/ai-${Date.now()}-${generationId}-${sanitizeFilePart(title)}.${generated.extension}`;
    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(filePath, generated.bytes, {
        contentType: generated.contentType,
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
      JSON.stringify({ imageUrl, provider: generated.provider, prompt }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno da função" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
