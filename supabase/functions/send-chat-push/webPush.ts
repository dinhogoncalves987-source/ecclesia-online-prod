/**
 * Web Push (RFC 8291 — payload encryption aes128gcm; RFC 8292 — VAPID) sem
 * nenhuma dependência npm/Node — só Web Crypto API (crypto.subtle), que o
 * runtime Deno das Edge Functions do Supabase suporta nativamente e de
 * forma estável.
 *
 * O pacote npm "web-push" foi deliberadamente evitado aqui: ele depende de
 * APIs internas do Node (crypto.createECDH/sign com PEM) que, em versões
 * do runtime Deno usadas por funções serverless, já causaram falhas
 * silenciosas de descriptografia no navegador (ver
 * https://github.com/web-push-libs/web-push/issues/904 e
 * https://github.com/denoland/deno/issues/23693). Implementar o protocolo
 * direto com Web Crypto evita essa classe de risco.
 */

function base64UrlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export type VapidKeys = {
  publicKey: string; // base64url, ponto não comprimido P-256 (65 bytes)
  privateKey: string; // base64url, escalar bruto de 32 bytes
};

/** Reconstrói um CryptoKey de assinatura ECDSA P-256 a partir das chaves VAPID brutas (mesmo formato gerado por `web-push generate-vapid-keys`). */
async function importVapidPrivateKey(vapid: VapidKeys): Promise<CryptoKey> {
  const pub = base64UrlToUint8Array(vapid.publicKey);
  const priv = base64UrlToUint8Array(vapid.privateKey);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error("VAPID publicKey inválida: esperado ponto P-256 não comprimido (65 bytes, prefixo 0x04)");
  }
  if (priv.length !== 32) {
    throw new Error("VAPID privateKey inválida: esperado escalar de 32 bytes");
  }
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d: uint8ArrayToBase64Url(priv),
    x: uint8ArrayToBase64Url(pub.slice(1, 33)),
    y: uint8ArrayToBase64Url(pub.slice(33, 65)),
    ext: true,
  };
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

async function buildVapidAuthorizationHeader(
  endpoint: string,
  vapid: VapidKeys,
  subject: string,
): Promise<string> {
  const audience = new URL(endpoint).origin;
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  };
  const encoder = new TextEncoder();
  const headerB64 = uint8ArrayToBase64Url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = uint8ArrayToBase64Url(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const privateKey = await importVapidPrivateKey(vapid);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    encoder.encode(signingInput),
  );

  const jwt = `${signingInput}.${uint8ArrayToBase64Url(new Uint8Array(signature))}`;
  return `vapid t=${jwt}, k=${vapid.publicKey}`;
}

/** HKDF conforme RFC 5869, usando HMAC-SHA256 puro (sem depender do algoritmo "HKDF" do WebCrypto, para controlar `info`/`L` byte a byte igual à RFC 8291). */
async function hmacSha256(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return new Uint8Array(sig);
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hmacSha256(salt, ikm);
  const infoAndCounter = concatBytes(info, new Uint8Array([1]));
  const okm = await hmacSha256(prk, infoAndCounter);
  return okm.slice(0, length);
}

export type PushSubscriptionKeys = {
  endpoint: string;
  p256dh: string; // base64url
  auth: string; // base64url
};

/**
 * Cifra o payload conforme RFC 8291 ("Message Encryption for Web Push")
 * usando "aes128gcm" (RFC 8188), e monta o corpo binário completo aceito
 * pelo serviço de push (FCM/Mozilla/APNs web push).
 */
async function encryptPayload(
  subscription: PushSubscriptionKeys,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const uaPublicRaw = base64UrlToUint8Array(subscription.p256dh);
  const authSecret = base64UrlToUint8Array(subscription.auth);

  const asKeyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublicJwk = await crypto.subtle.exportKey("jwk", asKeyPair.publicKey);
  const asPublicRaw = concatBytes(
    new Uint8Array([0x04]),
    base64UrlToUint8Array(asPublicJwk.x!),
    base64UrlToUint8Array(asPublicJwk.y!),
  );

  const uaPublicKey = await crypto.subtle.importKey(
    "raw",
    uaPublicRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: uaPublicKey },
    asKeyPair.privateKey,
    256,
  );
  const ecdhSecret = new Uint8Array(sharedSecretBits);

  const encoder = new TextEncoder();
  const authInfo = concatBytes(
    encoder.encode("WebPush: info\0"),
    uaPublicRaw,
    asPublicRaw,
  );
  const ikm = await hkdf(authSecret, ecdhSecret, authInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cekInfo = encoder.encode("Content-Encoding: aes128gcm\0");
  const cek = await hkdf(salt, ikm, cekInfo, 16);
  const nonceInfo = encoder.encode("Content-Encoding: nonce\0");
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  // Registro único (mensagem pequena): delimitador 0x02 = último registro, sem padding extra.
  const paddedPlaintext = concatBytes(plaintext, new Uint8Array([0x02]));

  const cekKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertextBits = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    cekKey,
    paddedPlaintext,
  );
  const ciphertext = new Uint8Array(ciphertextBits);

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096, false);
  const idLen = new Uint8Array([asPublicRaw.length]);

  return concatBytes(salt, recordSize, idLen, asPublicRaw, ciphertext);
}

export type SendWebPushResult = {
  ok: boolean;
  status: number;
  gone: boolean; // 404/410 — inscrição inválida, deve ser removida do banco
  error?: string;
};

export async function sendWebPush(
  subscription: PushSubscriptionKeys,
  payload: Record<string, unknown>,
  vapid: VapidKeys,
  subject: string,
): Promise<SendWebPushResult> {
  try {
    const encoder = new TextEncoder();
    const body = await encryptPayload(subscription, encoder.encode(JSON.stringify(payload)));
    const authorization = await buildVapidAuthorizationHeader(subscription.endpoint, vapid, subject);

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        TTL: "86400",
        Urgency: "high",
        Authorization: authorization,
      },
      body,
    });

    const gone = response.status === 404 || response.status === 410;
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { ok: false, status: response.status, gone, error: detail.slice(0, 300) };
    }
    return { ok: true, status: response.status, gone: false };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      gone: false,
      error: error instanceof Error ? error.message : "erro desconhecido ao enviar web push",
    };
  }
}
