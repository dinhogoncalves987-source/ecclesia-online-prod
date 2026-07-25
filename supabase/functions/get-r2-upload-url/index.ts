/**
 * get-r2-upload-url — PARTE A/B (TV Digital + Canal Eclésia).
 *
 * Único ponto do sistema autorizado a assinar um upload direto para o
 * Cloudflare R2 (S3-compatible, AWS SigV4). O cliente NUNCA escolhe bucket
 * ou caminho livremente — envia apenas um `purpose` de uma lista fechada;
 * bucket, prefixo, tipo de conteúdo permitido e tamanho máximo são
 * determinados aqui, no servidor, a partir desse `purpose`.
 *
 * Regras de segurança (contrato §7):
 *   - exige usuário autenticado (Authorization: Bearer <jwt>);
 *   - valida organização + capability (tv.manage / canal.manage) antes de
 *     assinar qualquer coisa;
 *   - nunca aceita bucket/path arbitrário do cliente;
 *   - limita tipo de conteúdo e prefixo por purpose;
 *   - nunca expõe R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY ao cliente — a
 *     assinatura SigV4 é calculada aqui e só a URL final (já assinada) sai
 *     desta função;
 *   - falha fechado: sem credenciais R2 configuradas, retorna erro explícito
 *     (nunca uma URL "mock").
 *
 * Variáveis necessárias (Supabase Secrets, nunca no frontend):
 *   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET,
 *   R2_PUBLIC_URL
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

// ── Purposes permitidos — bucket/prefixo/capability NUNCA vêm do cliente ────
type Purpose = "canal-video" | "canal-thumbnail" | "tv-recording" | "tv-asset";

const PURPOSE_RULES: Record<Purpose, {
  prefix: string;
  capability: string;
  contentTypePattern: RegExp;
  maxSizeBytes: number;
}> = {
  "canal-video": {
    prefix: "canal/videos",
    capability: "canal.manage",
    contentTypePattern: /^video\//,
    maxSizeBytes: 5 * 1024 * 1024 * 1024,
  },
  "canal-thumbnail": {
    prefix: "canal/thumbnails",
    capability: "canal.manage",
    contentTypePattern: /^image\//,
    maxSizeBytes: 10 * 1024 * 1024,
  },
  "tv-recording": {
    prefix: "tv/recordings",
    capability: "tv.manage",
    contentTypePattern: /^video\//,
    maxSizeBytes: 20 * 1024 * 1024 * 1024,
  },
  "tv-asset": {
    prefix: "tv/assets",
    capability: "tv.manage",
    contentTypePattern: /^(image|video)\//,
    maxSizeBytes: 2 * 1024 * 1024 * 1024,
  },
};

function extensionFromContentType(contentType: string): string {
  const map: Record<string, string> = {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "video/x-matroska": "mkv",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  return map[contentType.toLowerCase()] ?? "bin";
}

// ── AWS SigV4 presigned URL (query-string) — sem dependências externas ─────

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(digest);
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key instanceof Uint8Array ? key : new Uint8Array(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

function amzDate(d: Date): { amzDate: string; dateStamp: string } {
  const iso = d.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

async function buildPresignedPutUrl(opts: {
  endpoint: string;
  bucket: string;
  key: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresSeconds: number;
  contentType: string;
}): Promise<string> {
  const { endpoint, bucket, key, accessKeyId, secretAccessKey, expiresSeconds, contentType } = opts;
  const url = new URL(endpoint);
  const host = url.host;
  const region = "auto";
  const service = "s3";
  const now = new Date();
  const { amzDate: xAmzDate, dateStamp } = amzDate(now);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${accessKeyId}/${credentialScope}`;

  const canonicalUri = `/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

  const queryParams: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": xAmzDate,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": "content-type;host",
  };
  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join("&");

  const canonicalHeaders = `content-type:${contentType.trim().toLowerCase()}\nhost:${host}\n`;
  const payloadHash = "UNSIGNED-PAYLOAD";

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    "content-type;host",
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    xAmzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = await hmac(new TextEncoder().encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const signature = toHex(await hmac(kSigning, stringToSign));

  return `${url.protocol}//${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const r2AccessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
    const r2SecretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
    const r2Endpoint = Deno.env.get("R2_ENDPOINT");
    const r2Bucket = Deno.env.get("R2_BUCKET");
    const r2PublicUrl = Deno.env.get("R2_PUBLIC_URL");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: "supabase_secrets_not_configured" }, 500);
    }
    // Fail-closed: nunca gera URL "mock" — se o R2 não estiver configurado,
    // o upload falha de forma explícita para o chamador.
    if (!r2AccessKeyId || !r2SecretAccessKey || !r2Endpoint || !r2Bucket || !r2PublicUrl) {
      return jsonResponse({ ok: false, error: "r2_not_configured" }, 503);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse({ ok: false, error: "unauthorized" }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userError } = await admin.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userError || !userData?.user) {
      return jsonResponse({ ok: false, error: "unauthorized" }, 401);
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const purpose = typeof body?.purpose === "string" ? (body.purpose as Purpose) : undefined;
    const organizationId = typeof body?.organizationId === "string" ? body.organizationId : "";
    const contentType = typeof body?.contentType === "string" ? body.contentType : "";
    const fileSizeBytes = typeof body?.fileSizeBytes === "number" ? body.fileSizeBytes : 0;

    if (!purpose || !(purpose in PURPOSE_RULES)) {
      return jsonResponse({ ok: false, error: "invalid_purpose" }, 400);
    }
    if (!organizationId) {
      return jsonResponse({ ok: false, error: "missing_organization_id" }, 400);
    }

    const rule = PURPOSE_RULES[purpose];

    if (!rule.contentTypePattern.test(contentType)) {
      return jsonResponse({ ok: false, error: "content_type_not_allowed" }, 400);
    }
    if (fileSizeBytes <= 0 || fileSizeBytes > rule.maxSizeBytes) {
      return jsonResponse({ ok: false, error: "file_too_large" }, 400);
    }

    const { data: hasPermission, error: permError } = await admin.rpc("has_org_access_permission", {
      _user_id: userId,
      _organization_id: organizationId,
      _permission_key: rule.capability,
    });
    if (permError) {
      console.error("get-r2-upload-url: permission check error", permError.message);
      return jsonResponse({ ok: false, error: "permission_check_failed" }, 500);
    }
    if (!hasPermission) {
      return jsonResponse({ ok: false, error: "forbidden" }, 403);
    }

    // Caminho gerado inteiramente no servidor — o cliente não controla nome
    // de arquivo, prefixo ou extensão final.
    const ext = extensionFromContentType(contentType);
    const timestamp = Date.now();
    const random = crypto.randomUUID().slice(0, 8);
    const storageKey = `${organizationId}/${rule.prefix}/${timestamp}-${random}.${ext}`;

    const uploadUrl = await buildPresignedPutUrl({
      endpoint: r2Endpoint,
      bucket: r2Bucket,
      key: storageKey,
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
      expiresSeconds: 600,
      contentType,
    });

    const publicUrl = `${r2PublicUrl.replace(/\/$/, "")}/${storageKey}`;

    return jsonResponse({
      ok: true,
      uploadUrl,
      publicUrl,
      storageKey,
      requiredHeaders: { "Content-Type": contentType.trim().toLowerCase() },
    });
  } catch (error) {
    console.error("get-r2-upload-url error:", error);
    return jsonResponse({ ok: false, error: "internal_error" }, 500);
  }
});
