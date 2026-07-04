/**
 * Edge Function: get-r2-upload-url
 *
 * Gera URL pré-assinada para upload direto de arquivos ao Cloudflare R2.
 * O cliente envia o arquivo DIRETO ao R2 — nunca passa pelo Supabase.
 *
 * POST /functions/v1/get-r2-upload-url
 * Body: { bucket: string, path: string, contentType: string, organizationId: string }
 * Response: { uploadUrl: string, publicUrl: string, storageKey: string }
 *
 * Variáveis de ambiente necessárias (Supabase Secrets):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID") ?? "";
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID") ?? "";
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY") ?? "";
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL") ?? "";

// ── Gerar URL pré-assinada S3-compatible (R2) ────────────────────────────────

async function generateR2PresignedUrl(
  bucket: string,
  key: string,
  contentType: string,
  expiresInSeconds = 3600,
): Promise<string> {
  // R2 é compatível com S3 — usa endpoint específico da conta
  const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";

  const date = new Date();
  const dateStamp = date.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = date.toISOString().replace(/[:-]/g, "").slice(0, 15) + "Z";

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${R2_ACCESS_KEY_ID}/${credentialScope}`;

  const canonicalUri = `/${bucket}/${key}`;
  const queryParams = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresInSeconds),
    "X-Amz-SignedHeaders": "content-type;host",
  });

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    queryParams.toString(),
    `content-type:${contentType}\nhost:${R2_ACCOUNT_ID}.r2.cloudflarestorage.com\n`,
    "content-type;host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(canonicalRequest),
  );
  const hashedCanonicalRequest = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hashedCanonicalRequest,
  ].join("\n");

  // Derivar signing key
  async function hmacSha256(key: ArrayBuffer | string, data: string): Promise<ArrayBuffer> {
    const keyMaterial =
      typeof key === "string"
        ? await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
        : await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return crypto.subtle.sign("HMAC", keyMaterial, encoder.encode(data));
  }

  const signingKey = await hmacSha256(
    await hmacSha256(
      await hmacSha256(
        await hmacSha256(`AWS4${R2_SECRET_ACCESS_KEY}`, dateStamp),
        region,
      ),
      service,
    ),
    "aws4_request",
  );

  const signatureBuffer = await hmacSha256(signingKey, stringToSign);
  const signature = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  queryParams.set("X-Amz-Signature", signature);

  return `${endpoint}${canonicalUri}?${queryParams.toString()}`;
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Verificar autenticação do usuário
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await userSupabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { bucket, path, contentType, organizationId } = await req.json();

  if (!bucket || !path || !contentType) {
    return new Response(JSON.stringify({ error: "bucket, path e contentType são obrigatórios" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Construir storage key com user/org para namespacing
  const storageKey = `${organizationId ?? user.id}/${path}`;

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    // Modo mock: retornar URL falsa para desenvolvimento
    return new Response(
      JSON.stringify({
        uploadUrl: `https://mock-r2.example.com/${bucket}/${storageKey}?mock=true`,
        publicUrl: `${R2_PUBLIC_URL || "https://cdn.ecclesia.com.br"}/${storageKey}`,
        storageKey,
        mock: true,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const uploadUrl = await generateR2PresignedUrl(bucket, storageKey, contentType);
    const publicUrl = `${R2_PUBLIC_URL}/${storageKey}`;

    return new Response(
      JSON.stringify({ uploadUrl, publicUrl, storageKey }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("R2 presigned URL error:", err);
    return new Response(JSON.stringify({ error: "presigned_url_failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
