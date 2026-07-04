/**
 * Ecclesia Chat — Criptografia Ponta a Ponta (E2EE)
 *
 * Algoritmo: ECDH P-256 + AES-GCM 256
 * Chave privada: armazenada SOMENTE no dispositivo (IndexedDB via localForage)
 * Chave pública: registrada em chat_devices (por dispositivo, não em profiles)
 *
 * Fluxo:
 *   1. Usuário A e B possuem pares ECDH — um por dispositivo
 *   2. A busca a chave pública do dispositivo ativo de B via chat_devices
 *   3. Ambos derivam o mesmo segredo compartilhado via ECDH
 *   4. Derivam chave AES-GCM do segredo
 *   5. A cifra a mensagem → envia payload { iv, data }
 *   6. B decifra com a mesma chave derivada
 *
 * A experiência do usuário é totalmente transparente — sem QR, sem PIN, sem chave manual.
 */

// ── Utilitários de codificação ────────────────────────────────────────────────

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
  return buffer.buffer;
}

// ── Geração de par de chaves ECDH ─────────────────────────────────────────────

export type EcdhKeyPair = {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  publicKeyBase64: string; // SPKI base64 — enviado ao servidor
};

export async function generateEcdhKeyPair(): Promise<EcdhKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true, // extractable para exportar chave pública e serializar privada no IndexedDB
    ["deriveKey"],
  );

  const publicKeyBuffer = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const publicKeyBase64 = arrayBufferToBase64(publicKeyBuffer);

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    publicKeyBase64,
  };
}

// ── Importar chave pública do servidor ────────────────────────────────────────

export async function importPublicKey(spkiBase64: string): Promise<CryptoKey> {
  const buffer = base64ToArrayBuffer(spkiBase64);
  return crypto.subtle.importKey(
    "spki",
    buffer,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
}

// ── Derivar chave AES compartilhada ──────────────────────────────────────────

export async function deriveSharedAesKey(
  myPrivateKey: CryptoKey,
  theirPublicKey: CryptoKey,
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: theirPublicKey },
    myPrivateKey,
    { name: "AES-GCM", length: 256 },
    false, // não extraível — a chave derivada nunca sai do dispositivo
    ["encrypt", "decrypt"],
  );
}

// ── Cifragem / Decifragem ─────────────────────────────────────────────────────

export type EncryptedPayload = {
  iv: string;    // base64 — 12 bytes aleatórios
  data: string;  // base64 — ciphertext AES-GCM
};

export async function encryptMessage(
  aesKey: CryptoKey,
  plaintext: string,
): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encoded,
  );

  return {
    iv: arrayBufferToBase64(iv.buffer),
    data: arrayBufferToBase64(cipherBuffer),
  };
}

export async function decryptMessage(
  aesKey: CryptoKey,
  payload: EncryptedPayload,
): Promise<string> {
  const iv = new Uint8Array(base64ToArrayBuffer(payload.iv));
  const cipherBuffer = base64ToArrayBuffer(payload.data);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    cipherBuffer,
  );

  return new TextDecoder().decode(decrypted);
}

// ── Serialização da chave privada para IndexedDB ──────────────────────────────
// A chave privada é serializada como JWK para persistência segura no dispositivo.

export async function exportPrivateKey(privateKey: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey("jwk", privateKey);
  return JSON.stringify(jwk);
}

export async function importPrivateKey(serialized: string): Promise<CryptoKey> {
  const jwk = JSON.parse(serialized) as JsonWebKey;
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"],
  );
}

// ── Construção e parsing do payload ──────────────────────────────────────────

export function serializePayload(payload: EncryptedPayload): string {
  return JSON.stringify(payload);
}

export function parsePayload(raw: string): EncryptedPayload {
  return JSON.parse(raw) as EncryptedPayload;
}

// ── Device ID ─────────────────────────────────────────────────────────────────
// O device_id identifica este dispositivo de forma única e persistente.
// NÃO é a chave de criptografia — é apenas um identificador para o registro em chat_devices.
// Chave privada: fica em IndexedDB (localForage). NUNCA sai do dispositivo.

const DEVICE_ID_STORAGE_KEY = "ecclesia_device_id";

/**
 * Retorna o ID único deste dispositivo.
 * Gerado uma vez e persistido em localStorage.
 * Transparente ao usuário — sem QR, sem PIN, sem interação manual.
 */
export function getOrCreateDeviceId(): string {
  try {
    let deviceId = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
    }
    return deviceId;
  } catch {
    // Fallback para ambientes sem localStorage (SSR, etc.)
    return crypto.randomUUID();
  }
}
