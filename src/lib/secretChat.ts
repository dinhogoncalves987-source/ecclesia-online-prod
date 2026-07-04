/**
 * Ecclesia Chat — Conversas Secretas (E2EE)
 *
 * Responsável por:
 *   - Geração/carregamento do par de chaves ECDH por dispositivo
 *   - Registro do dispositivo em chat_devices (chave pública por device, não em profiles)
 *   - Derivação de chave compartilhada por conversa
 *   - Envio de mensagens cifradas via transient_secret_messages
 *   - Remoção IMEDIATA do envelope do servidor após entrega
 *   - Armazenamento local de mensagens (localForage/IndexedDB)
 *   - Mensagens temporárias (ephemeral_duration — opt-in, separado do E2EE)
 *   - NUNCA persiste plaintext no servidor
 *
 * Arquitetura de chaves:
 *   - Chave PRIVADA: IndexedDB (localForage). Jamais enviada ao servidor.
 *   - Chave PÚBLICA: registrada em chat_devices. Compartilhada para derivar segredo.
 *   - profiles.public_key_ecdh: mantido apenas como fallback de compatibilidade.
 */

import localforage from "localforage";
import { supabase } from "@/integrations/supabase/client";
import {
  decryptMessage,
  deriveSharedAesKey,
  encryptMessage,
  exportPrivateKey,
  generateEcdhKeyPair,
  getOrCreateDeviceId,
  importPrivateKey,
  importPublicKey,
  parsePayload,
  serializePayload,
  type EcdhKeyPair,
  type EncryptedPayload,
} from "@/lib/e2eEncryption";

// Re-export para que o hook não precise importar de dois lugares
export type { EcdhKeyPair } from "@/lib/e2eEncryption";

// ── Stores localForage ────────────────────────────────────────────────────────

const keysStore = localforage.createInstance({
  name: "ecclesia_secure",
  storeName: "ecdh_keys",
});

const secretMessagesStore = localforage.createInstance({
  name: "ecclesia_secure",
  storeName: "secret_messages",
});

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type SecretMessage = {
  id: string;
  threadId: string;
  senderId: string;
  recipientId: string;
  plaintext: string;
  messageType: "text" | "image" | "audio" | "video" | "document" | "deleted";
  createdAt: string;
  deliveredAt: string | null;
  isOwn: boolean;
  /** Timestamp de expiração (para mensagens temporárias) */
  expiresAt?: string | null;
};

export type SecretThread = {
  id: string;
  participantA: string;
  participantB: string;
  lastActivityAt: string;
  otherUserId: string;
  otherUserName?: string;
  ephemeralDuration?: number | null;
};

/**
 * Opções de duração para mensagens temporárias.
 * null = desativado; número = segundos.
 */
export type EphemeralDuration = null | 86400 | 604800 | 2592000 | 7776000;

export const EPHEMERAL_DURATION_OPTIONS: { value: EphemeralDuration; label: string }[] = [
  { value: null, label: "Desativado" },
  { value: 86400, label: "24 horas" },
  { value: 604800, label: "7 dias" },
  { value: 2592000, label: "30 dias" },
  { value: 7776000, label: "90 dias" },
];

type TransientSecretMessageRow = {
  id: string;
  thread_id: string;
  sender_id: string;
  recipient_id: string;
  encrypted_payload: string;
  message_type: string;
  created_at: string;
  delivered_at: string | null;
};

// ── Gerenciamento de chaves ECDH por dispositivo ──────────────────────────────

const PRIVATE_KEY_STORE_KEY = "ecdh_private_key_v1";
const PUBLIC_KEY_STORE_KEY = "ecdh_public_key_v1";

/**
 * Registra (ou atualiza) a chave pública deste dispositivo em chat_devices.
 * Transparente ao usuário — sem confirmação manual.
 */
export async function registerDevice(
  userId: string,
  publicKeyBase64: string,
): Promise<boolean> {
  const deviceId = getOrCreateDeviceId();
  const { error } = await supabase
    .from("chat_devices")
    .upsert(
      {
        user_id: userId,
        device_id: deviceId,
        public_key_ecdh: publicKeyBase64,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "user_id,device_id" },
    );
  return !error;
}

/**
 * Obtém ou gera o par de chaves ECDH deste dispositivo.
 * Chave privada: IndexedDB (nunca sai do dispositivo).
 * Chave pública: registrada em chat_devices.
 */
export async function getOrCreateEcdhKeyPair(userId: string): Promise<EcdhKeyPair | null> {
  try {
    const storedPrivate = await keysStore.getItem<string>(
      `${PRIVATE_KEY_STORE_KEY}:${userId}`,
    );
    const storedPublic = await keysStore.getItem<string>(
      `${PUBLIC_KEY_STORE_KEY}:${userId}`,
    );

    if (storedPrivate && storedPublic) {
      const privateKey = await importPrivateKey(storedPrivate);
      const publicKey = await importPublicKey(storedPublic);
      const keyPair: EcdhKeyPair = { privateKey, publicKey, publicKeyBase64: storedPublic };
      // Atualizar last_seen_at no registro de dispositivo (sem await para não bloquear)
      void registerDevice(userId, storedPublic);
      return keyPair;
    }

    // Gerar novo par de chaves
    const keyPair = await generateEcdhKeyPair();
    const serializedPrivate = await exportPrivateKey(keyPair.privateKey);

    await keysStore.setItem(`${PRIVATE_KEY_STORE_KEY}:${userId}`, serializedPrivate);
    await keysStore.setItem(`${PUBLIC_KEY_STORE_KEY}:${userId}`, keyPair.publicKeyBase64);

    // Registrar na tabela chat_devices (arquitetura definitiva)
    await registerDevice(userId, keyPair.publicKeyBase64);

    // Manter profiles.public_key_ecdh por compatibilidade temporária com clientes antigos
    void supabase
      .from("profiles")
      .update({ public_key_ecdh: keyPair.publicKeyBase64 })
      .eq("user_id", userId);

    return keyPair;
  } catch {
    return null;
  }
}

// ── Derivar chave compartilhada por conversa ──────────────────────────────────

const sharedKeyCache = new Map<string, CryptoKey>();

/**
 * Deriva a chave AES compartilhada com outro usuário.
 * Fonte primária: chat_devices (dispositivo ativo mais recente).
 * Fallback: profiles.public_key_ecdh (compatibilidade com versão anterior).
 */
export async function getSharedKey(
  myUserId: string,
  theirUserId: string,
  myKeyPair: EcdhKeyPair,
): Promise<CryptoKey | null> {
  const cacheKey = `${myUserId}:${theirUserId}`;
  if (sharedKeyCache.has(cacheKey)) return sharedKeyCache.get(cacheKey)!;

  try {
    // Fonte primária: dispositivo ativo mais recente em chat_devices
    const { data: device } = await supabase
      .from("chat_devices")
      .select("public_key_ecdh")
      .eq("user_id", theirUserId)
      .is("revoked_at", null)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let theirPublicKeyBase64 =
      (device as { public_key_ecdh?: string } | null)?.public_key_ecdh;

    // Fallback: profiles.public_key_ecdh (compatibilidade temporária)
    if (!theirPublicKeyBase64) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("public_key_ecdh")
        .eq("user_id", theirUserId)
        .maybeSingle();

      theirPublicKeyBase64 =
        (profile as { public_key_ecdh?: string | null } | null)?.public_key_ecdh ??
        undefined;
    }

    if (!theirPublicKeyBase64) return null;

    const theirPublicKey = await importPublicKey(theirPublicKeyBase64);
    const sharedKey = await deriveSharedAesKey(myKeyPair.privateKey, theirPublicKey);
    sharedKeyCache.set(cacheKey, sharedKey);
    return sharedKey;
  } catch {
    return null;
  }
}

/** Invalida o cache de chave compartilhada (ex: após troca de dispositivo). */
export function invalidateSharedKeyCache(myUserId?: string, theirUserId?: string): void {
  if (myUserId && theirUserId) {
    sharedKeyCache.delete(`${myUserId}:${theirUserId}`);
  } else {
    sharedKeyCache.clear();
  }
}

// ── Thread secreta ────────────────────────────────────────────────────────────

export async function findOrCreateSecretThread(
  myUserId: string,
  theirUserId: string,
  organizationId?: string,
): Promise<SecretThread | null> {
  const [a, b] = [myUserId, theirUserId].sort();

  const { data: existing } = await supabase
    .from("secret_threads")
    .select("*")
    .eq("participant_a", a)
    .eq("participant_b", b)
    .maybeSingle();

  if (existing) {
    const row = existing as {
      id: string;
      participant_a: string;
      participant_b: string;
      last_activity_at: string;
      ephemeral_duration: number | null;
    };
    return {
      id: row.id,
      participantA: row.participant_a,
      participantB: row.participant_b,
      lastActivityAt: row.last_activity_at,
      otherUserId: theirUserId,
      ephemeralDuration: row.ephemeral_duration ?? null,
    };
  }

  const { data: created, error } = await supabase
    .from("secret_threads")
    .insert({ participant_a: a, participant_b: b, organization_id: organizationId })
    .select("*")
    .single();

  if (error || !created) return null;

  const row = created as {
    id: string;
    participant_a: string;
    participant_b: string;
    last_activity_at: string;
    ephemeral_duration: number | null;
  };
  return {
    id: row.id,
    participantA: row.participant_a,
    participantB: row.participant_b,
    lastActivityAt: row.last_activity_at,
    otherUserId: theirUserId,
    ephemeralDuration: row.ephemeral_duration ?? null,
  };
}

// ── Enviar mensagem secreta ───────────────────────────────────────────────────

export async function sendSecretMessage(
  threadId: string,
  senderId: string,
  recipientId: string,
  plaintext: string,
  sharedKey: CryptoKey,
  messageType: Exclude<SecretMessage["messageType"], "deleted"> = "text",
  ephemeralDuration?: number | null,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const payload: EncryptedPayload = await encryptMessage(sharedKey, plaintext);
    const serialized = serializePayload(payload);

    const { data, error } = await supabase
      .from("transient_secret_messages")
      .insert({
        thread_id: threadId,
        sender_id: senderId,
        recipient_id: recipientId,
        encrypted_payload: serialized,
        message_type: messageType,
      })
      .select("id, created_at")
      .single();

    if (error || !data) return { ok: false, error: error?.message ?? "insert_failed" };

    const row = data as { id: string; created_at: string };

    const expiresAt =
      ephemeralDuration
        ? new Date(Date.now() + ephemeralDuration * 1000).toISOString()
        : null;

    const localMsg: SecretMessage = {
      id: row.id,
      threadId,
      senderId,
      recipientId,
      plaintext,
      messageType,
      createdAt: row.created_at,
      deliveredAt: null,
      isOwn: true,
      expiresAt,
    };
    await saveSecretMessageLocally(localMsg);

    await supabase
      .from("secret_threads")
      .update({ last_activity_at: row.created_at })
      .eq("id", threadId);

    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Envia evento de "apagar para todos" na conversa secreta.
 * O payload cifrado contém apenas o ID da mensagem a ser deletada.
 * O destinatário ao receber, remove do seu IndexedDB.
 */
export async function sendSecretDeleteEvent(
  threadId: string,
  senderId: string,
  recipientId: string,
  messageIdToDelete: string,
  sharedKey: CryptoKey,
): Promise<boolean> {
  try {
    const payload = await encryptMessage(sharedKey, messageIdToDelete);
    const serialized = serializePayload(payload);

    const { error } = await supabase.from("transient_secret_messages").insert({
      thread_id: threadId,
      sender_id: senderId,
      recipient_id: recipientId,
      encrypted_payload: serialized,
      message_type: "deleted",
    });

    return !error;
  } catch {
    return false;
  }
}

// ── Armazenamento local (IndexedDB) ──────────────────────────────────────────

const threadMessagesKey = (threadId: string) => `thread:${threadId}:messages`;

export async function saveSecretMessageLocally(msg: SecretMessage): Promise<void> {
  const key = threadMessagesKey(msg.threadId);
  const existing = (await secretMessagesStore.getItem<SecretMessage[]>(key)) ?? [];

  if (!existing.some((m) => m.id === msg.id)) {
    existing.push(msg);
    existing.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    await secretMessagesStore.setItem(key, existing);
  }
}

export async function loadSecretMessagesLocally(
  threadId: string,
  ephemeralDuration?: number | null,
): Promise<SecretMessage[]> {
  const messages =
    (await secretMessagesStore.getItem<SecretMessage[]>(threadMessagesKey(threadId))) ?? [];

  // Remover mensagens expiradas se ephemeral estiver ativo
  if (ephemeralDuration && ephemeralDuration > 0) {
    const now = Date.now();
    const active = messages.filter((m) => {
      const expiry = m.expiresAt
        ? new Date(m.expiresAt).getTime()
        : new Date(m.createdAt).getTime() + ephemeralDuration * 1000;
      return expiry > now;
    });
    if (active.length !== messages.length) {
      await secretMessagesStore.setItem(threadMessagesKey(threadId), active);
      return active;
    }
  }

  return messages;
}

export async function deleteSecretMessageLocally(
  threadId: string,
  messageId: string,
): Promise<void> {
  const key = threadMessagesKey(threadId);
  const existing = (await secretMessagesStore.getItem<SecretMessage[]>(key)) ?? [];
  const updated = existing.filter((m) => m.id !== messageId);
  await secretMessagesStore.setItem(key, updated);
}

export async function clearSecretThread(threadId: string): Promise<void> {
  await secretMessagesStore.removeItem(threadMessagesKey(threadId));
}

// ── Descriptografar e processar mensagem recebida ─────────────────────────────

/**
 * Descriptografa um envelope recebido, salva localmente e REMOVE o envelope do servidor.
 *
 * Para eventos de exclusão (message_type = 'deleted'):
 *   - plaintext = ID da mensagem a ser deletada do armazenamento local
 *   - Retorna um SecretMessage com messageType='deleted' e plaintext=messageIdDeletado
 *   - O hook usa isso para remover a mensagem do estado local
 *
 * IMPORTANTE: O envelope é SEMPRE deletado do servidor após processamento bem-sucedido.
 */
export async function decryptAndSaveIncoming(
  event: TransientSecretMessageRow,
  sharedKey: CryptoKey,
  myUserId: string,
  ephemeralDuration?: number | null,
): Promise<SecretMessage | null> {
  try {
    const payload = parsePayload(event.encrypted_payload);
    const plaintext = await decryptMessage(sharedKey, payload);

    if (event.message_type === "deleted") {
      // plaintext é o ID da mensagem que o remetente quer deletar para todos
      await deleteSecretMessageLocally(event.thread_id, plaintext);

      // Remover envelope do servidor imediatamente
      await supabase
        .from("transient_secret_messages")
        .delete()
        .eq("id", event.id);

      // Retornar sinal para que o hook atualize o estado local
      return {
        id: event.id,
        threadId: event.thread_id,
        senderId: event.sender_id,
        recipientId: event.recipient_id,
        plaintext, // contém o messageId deletado
        messageType: "deleted",
        createdAt: event.created_at,
        deliveredAt: new Date().toISOString(),
        isOwn: false,
      };
    }

    const expiresAt =
      ephemeralDuration
        ? new Date(
            new Date(event.created_at).getTime() + ephemeralDuration * 1000,
          ).toISOString()
        : null;

    const msg: SecretMessage = {
      id: event.id,
      threadId: event.thread_id,
      senderId: event.sender_id,
      recipientId: event.recipient_id,
      plaintext,
      messageType: event.message_type as SecretMessage["messageType"],
      createdAt: event.created_at,
      deliveredAt: new Date().toISOString(),
      isOwn: event.sender_id === myUserId,
      expiresAt,
    };

    await saveSecretMessageLocally(msg);

    // REMOVER envelope do servidor imediatamente após descriptografia bem-sucedida
    // O servidor não deve manter envelopes após entrega confirmada.
    await supabase
      .from("transient_secret_messages")
      .delete()
      .eq("id", event.id);

    return msg;
  } catch {
    return null;
  }
}

/**
 * Busca e entrega todos os envelopes pendentes para uma thread específica.
 * Chamado no init do hook (recuperação de mensagens enquanto estava offline).
 * Cada envelope é deletado do servidor após descriptografia bem-sucedida.
 */
export async function fetchAndDeliverPendingMessages(
  threadId: string,
  myUserId: string,
  sharedKey: CryptoKey,
  ephemeralDuration?: number | null,
): Promise<SecretMessage[]> {
  try {
    const { data } = await supabase
      .from("transient_secret_messages")
      .select("*")
      .eq("thread_id", threadId)
      .eq("recipient_id", myUserId)
      .is("delivered_at", null)
      .order("created_at", { ascending: true });

    const pending = (data ?? []) as TransientSecretMessageRow[];
    const delivered: SecretMessage[] = [];

    for (const event of pending) {
      const msg = await decryptAndSaveIncoming(event, sharedKey, myUserId, ephemeralDuration);
      if (msg) delivered.push(msg);
    }

    return delivered;
  } catch {
    return [];
  }
}

// ── Mensagens temporárias ─────────────────────────────────────────────────────

/**
 * Ativa, altera ou desativa mensagens temporárias em uma conversa secreta.
 * Qualquer participante pode alterar — comportamento estilo WhatsApp.
 */
export async function setSecretThreadEphemeralDuration(
  threadId: string,
  durationSeconds: EphemeralDuration,
): Promise<boolean> {
  const { error } = await supabase
    .from("secret_threads")
    .update({ ephemeral_duration: durationSeconds })
    .eq("id", threadId);
  return !error;
}
