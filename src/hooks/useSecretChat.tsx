import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  decryptAndSaveIncoming,
  deleteSecretMessageLocally,
  fetchAndDeliverPendingMessages,
  findOrCreateSecretThread,
  getOrCreateEcdhKeyPair,
  getSharedKey,
  loadSecretMessagesLocally,
  sendSecretDeleteEvent,
  sendSecretMessage,
  setSecretThreadEphemeralDuration,
  type EcdhKeyPair,
  type EphemeralDuration,
  type SecretMessage,
  type SecretThread,
} from "@/lib/secretChat";

type Options = {
  myUserId?: string | null;
  theirUserId?: string | null;
  organizationId?: string;
  enabled?: boolean;
};

export function useSecretChat({
  myUserId,
  theirUserId,
  organizationId,
  enabled = true,
}: Options) {
  const [thread, setThread] = useState<SecretThread | null>(null);
  const [messages, setMessages] = useState<SecretMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keyPairRef = useRef<EcdhKeyPair | null>(null);
  const sharedKeyRef = useRef<CryptoKey | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Inicialização: chaves + registro de dispositivo + thread ─────────────
  useEffect(() => {
    if (!myUserId || !theirUserId || !enabled) return;

    setLoading(true);
    setError(null);

    const init = async () => {
      // 1. Obter/criar par de chaves ECDH (registra em chat_devices automaticamente)
      const keyPair = await getOrCreateEcdhKeyPair(myUserId);
      if (!keyPair) {
        setError("Não foi possível inicializar as chaves de criptografia.");
        setLoading(false);
        return;
      }
      keyPairRef.current = keyPair;

      // 2. Obter chave compartilhada com o outro usuário
      const sharedKey = await getSharedKey(myUserId, theirUserId, keyPair);
      if (!sharedKey) {
        setError(
          "O outro usuário ainda não ativou a criptografia. Peça para ele abrir o aplicativo.",
        );
        setLoading(false);
        return;
      }
      sharedKeyRef.current = sharedKey;

      // 3. Obter/criar thread secreta
      const secretThread = await findOrCreateSecretThread(
        myUserId,
        theirUserId,
        organizationId,
      );
      if (!secretThread) {
        setError("Não foi possível criar a conversa secreta.");
        setLoading(false);
        return;
      }
      setThread(secretThread);

      // 4. Carregar mensagens locais (respeitando expiração se ephemeral ativo)
      const localMsgs = await loadSecretMessagesLocally(
        secretThread.id,
        secretThread.ephemeralDuration,
      );
      setMessages(localMsgs);

      // 5. Entregar envelopes pendentes do servidor (destinatário estava offline)
      const pending = await fetchAndDeliverPendingMessages(
        secretThread.id,
        myUserId,
        sharedKey,
        secretThread.ephemeralDuration,
      );

      if (pending.length > 0) {
        setMessages((prev) => {
          const map = new Map(prev.map((m) => [m.id, m]));
          for (const msg of pending) {
            if (msg.messageType === "deleted") {
              // msg.plaintext é o ID da mensagem deletada
              map.delete(msg.plaintext);
            } else {
              map.set(msg.id, msg);
            }
          }
          return [...map.values()].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          );
        });
      }

      setReady(true);
      setLoading(false);
    };

    void init();
  }, [myUserId, theirUserId, organizationId, enabled]);

  // ── Realtime: receber novos envelopes cifrados ────────────────────────────
  useEffect(() => {
    if (!thread || !myUserId || !sharedKeyRef.current || !ready) return;

    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`secret_msgs:${thread.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transient_secret_messages",
          filter: `thread_id=eq.${thread.id}`,
        },
        async (payload) => {
          const event = payload.new as {
            id: string;
            thread_id: string;
            sender_id: string;
            recipient_id: string;
            encrypted_payload: string;
            message_type: string;
            created_at: string;
            delivered_at: string | null;
          };

          // Ignorar mensagens enviadas por mim (já salvas localmente ao enviar)
          if (event.sender_id === myUserId) return;
          // Ignorar mensagens destinadas a outros (multi-dispositivo futuro)
          if (event.recipient_id !== myUserId) return;

          const msg = await decryptAndSaveIncoming(
            event,
            sharedKeyRef.current!,
            myUserId,
            thread.ephemeralDuration,
          );

          if (!msg) return;

          if (msg.messageType === "deleted") {
            // msg.plaintext = ID da mensagem que o remetente deletou para todos
            setMessages((prev) => prev.filter((m) => m.id !== msg.plaintext));
          } else {
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
          }
        },
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [thread, myUserId, ready]);

  // ── Enviar mensagem ───────────────────────────────────────────────────────
  const send = useCallback(
    async (plaintext: string) => {
      if (!thread || !myUserId || !theirUserId || !sharedKeyRef.current) {
        return { ok: false, error: "not_ready" };
      }

      setSending(true);
      const result = await sendSecretMessage(
        thread.id,
        myUserId,
        theirUserId,
        plaintext,
        sharedKeyRef.current,
        "text",
        thread.ephemeralDuration,
      );
      setSending(false);

      if (result.ok && result.id) {
        const newMsg: SecretMessage = {
          id: result.id,
          threadId: thread.id,
          senderId: myUserId,
          recipientId: theirUserId,
          plaintext,
          messageType: "text",
          createdAt: new Date().toISOString(),
          deliveredAt: null,
          isOwn: true,
          expiresAt: thread.ephemeralDuration
            ? new Date(Date.now() + thread.ephemeralDuration * 1000).toISOString()
            : null,
        };
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      }

      return result;
    },
    [thread, myUserId, theirUserId],
  );

  // ── Apagar para mim (local only) ─────────────────────────────────────────
  const deleteForMe = useCallback(
    async (messageId: string) => {
      if (!thread) return { ok: false };
      await deleteSecretMessageLocally(thread.id, messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      return { ok: true };
    },
    [thread],
  );

  // ── Apagar para todos (envia evento cifrado + remove local) ──────────────
  const deleteForAll = useCallback(
    async (messageId: string) => {
      if (!thread || !myUserId || !theirUserId || !sharedKeyRef.current) {
        return { ok: false, error: "not_ready" };
      }

      // Enviar evento de exclusão cifrado para o outro dispositivo
      const ok = await sendSecretDeleteEvent(
        thread.id,
        myUserId,
        theirUserId,
        messageId,
        sharedKeyRef.current,
      );

      // Remover localmente independentemente do resultado do envio
      await deleteSecretMessageLocally(thread.id, messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));

      return { ok };
    },
    [thread, myUserId, theirUserId],
  );

  // ── Configurar mensagens temporárias ─────────────────────────────────────
  const setEphemeral = useCallback(
    async (duration: EphemeralDuration) => {
      if (!thread) return { ok: false };
      const ok = await setSecretThreadEphemeralDuration(thread.id, duration);
      if (ok) {
        setThread((prev) => (prev ? { ...prev, ephemeralDuration: duration } : prev));
      }
      return { ok };
    },
    [thread],
  );

  return {
    thread,
    messages,
    loading,
    sending,
    ready,
    error,
    send,
    deleteForMe,
    deleteForAll,
    setEphemeral,
  };
}
