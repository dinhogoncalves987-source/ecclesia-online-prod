import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchThreadMessages,
  mapDbAttachmentToUi,
  mapDbMessageToUi,
  type DbInternalAttachmentRow,
  type DbInternalMessageRow,
  type InternalMessage,
} from "@/lib/internalMessages";
import {
  deleteInternalMessage,
  markInternalThreadDelivered,
  markInternalThreadRead,
  sendInternalMessage,
  type SendMessagePayload,
} from "@/lib/internalMessageMutations";

type Options = {
  organizationId?: string;
  threadId?: string | null;
  currentUserId?: string | null;
  senderRole?: string | null;
  enabled?: boolean;
};

// União por id preservando ordem cronológica — usado para reconciliar o
// snapshot de um load() com mensagens que já chegaram via Realtime (ou
// otimistas) enquanto a busca estava em andamento, em vez de simplesmente
// substituir o estado (o que descartava mensagens recém-chegadas).
function mergeMessagesById(prev: InternalMessage[], fresh: InternalMessage[]): InternalMessage[] {
  const byId = new Map(prev.map((m) => [m.id, m]));
  for (const m of fresh) byId.set(m.id, m);
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

/**
 * Mensagens de uma conversa aberta, com tempo real de verdade:
 *  - INSERT/UPDATE em internal_messages filtrados por thread_id via
 *    Supabase Realtime — mensagens do outro participante aparecem
 *    imediatamente, sem precisar sair/voltar à conversa ou atualizar.
 *  - Anexos chegam por um INSERT separado em internal_message_attachments
 *    (a mensagem já existe; o anexo é mesclado quando chega).
 *  - Envio otimista: a mensagem aparece na hora com status "pending"
 *    (relógio) e é substituída pelo registro real quando o servidor
 *    confirma — nunca duplicada (dedupe por id real).
 *  - Reconexão: ao voltar a ficar visível/online, ou se o canal cair,
 *    refaz a busca para recuperar mensagens perdidas durante a queda.
 */
export function useInternalMessages({
  organizationId,
  threadId,
  currentUserId,
  senderRole,
  enabled = true,
}: Options) {
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fromDatabase, setFromDatabase] = useState(false);
  const knownIdsRef = useRef<Set<string>>(new Set());
  // Thread cuja última carga (load) já foi refletida no estado local — usado
  // para (a) limpar mensagens antigas ao trocar de conversa e (b) descartar
  // um load() que resolve depois que a conversa já mudou de novo.
  const loadedThreadIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId || !threadId || !enabled) {
      setMessages([]);
      setFromDatabase(false);
      setLoading(false);
      knownIdsRef.current = new Set();
      loadedThreadIdRef.current = null;
      return;
    }

    // Trocou de conversa: limpa o estado antes de buscar, para não misturar
    // mensagens da conversa anterior com a nova durante o merge abaixo.
    if (loadedThreadIdRef.current !== threadId) {
      setMessages([]);
      knownIdsRef.current = new Set();
      loadedThreadIdRef.current = threadId;
    }

    setLoading(true);
    const result = await fetchThreadMessages(organizationId, threadId, currentUserId);

    // A conversa mudou de novo enquanto esta busca estava em andamento —
    // descarta o resultado (evita sobrescrever a conversa atual com dados
    // de uma busca antiga/atrasada da conversa anterior).
    if (loadedThreadIdRef.current !== threadId) return;

    // Merge por id em vez de substituir — se uma mensagem chegou via
    // Realtime (INSERT/UPDATE) enquanto este load() estava em andamento
    // (corrida comum ao reconectar, focar a aba, ou no SUBSCRIBED inicial),
    // ela não pode ser perdida quando o resultado desta busca (potencialmente
    // mais antigo) chega depois. Isso é o que antes só se corrigia saindo e
    // voltando à conversa (o que força um novo load() "limpo").
    setMessages((prev) => mergeMessagesById(prev, result.messages));
    // Mantém ids já conhecidos via Realtime (não só os desta busca), para o
    // handler de INSERT abaixo continuar deduplicando corretamente.
    for (const m of result.messages) knownIdsRef.current.add(m.id);
    setFromDatabase(result.fromDatabase);
    setLoading(false);

    if (result.fromDatabase && result.messages.some((m) => !m.isOwn && !m.deliveredAt)) {
      void markInternalThreadDelivered(threadId);
    }

    // Abrir a conversa marca como lidas as mensagens recebidas — é isso que
    // faz o badge de não lidas (sidebar/ícone do app) zerar para esta thread.
    if (result.fromDatabase && result.messages.some((m) => !m.isOwn && !m.readAt)) {
      void markInternalThreadRead(threadId);
    }
  }, [organizationId, threadId, currentUserId, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const refetch = useCallback(async () => {
    await load();
  }, [load]);

  // ── Tempo real ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!organizationId || !threadId || !enabled) return;

    const channel = supabase
      .channel(`internal-messages-thread-${threadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "internal_messages", filter: `organization_id=eq.${organizationId}` },
        (payload) => {
          const row = payload.new as DbInternalMessageRow;
          if (row.thread_id !== threadId) return;
          if (knownIdsRef.current.has(row.id)) return;
          knownIdsRef.current.add(row.id);

          const isOwn = Boolean(currentUserId && row.sender_user_id === currentUserId);
          const msg = mapDbMessageToUi(row, []);
          msg.isOwn = isOwn;

          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, msg];
          });

          void enrichIncomingSender(msg, currentUserId).then((enriched) => {
            if (!enriched) return;
            setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...enriched } : m)));
          });

          // Mensagem de outra pessoa recebida em tempo real: já foi
          // "entregue" de fato (o cliente a recebeu agora). Se a conversa
          // está aberta, também marca como lida (visualizada na hora).
          if (!isOwn) {
            void markInternalThreadDelivered(threadId);
            if (document.visibilityState === "visible") {
              void markInternalThreadRead(threadId);
            }
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "internal_messages", filter: `organization_id=eq.${organizationId}` },
        (payload) => {
          const row = payload.new as DbInternalMessageRow;
          if (row.thread_id !== threadId) return;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === row.id
                ? {
                    ...m,
                    body: row.body,
                    messageType: row.message_type as InternalMessage["messageType"],
                    readAt: row.read_at,
                    deliveredAt: row.delivered_at,
                    attachments: row.message_type === "deleted" ? [] : m.attachments,
                  }
                : m,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "internal_message_attachments", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const row = payload.new as DbInternalAttachmentRow;
          const attachment = mapDbAttachmentToUi(row);
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== row.message_id) return m;
              if (m.attachments.some((a) => a.id === attachment.id)) return m;
              return { ...m, attachments: [...m.attachments, attachment] };
            }),
          );
        },
      )
      .subscribe((status) => {
        // Reconexão após queda: recupera mensagens perdidas durante o gap.
        if (status === "SUBSCRIBED") void load();
      });

    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    const onOnline = () => void load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      void supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, threadId, enabled, currentUserId]);

  const send = useCallback(
    async (payload: SendMessagePayload, file?: File) => {
      if (!organizationId || !threadId || !currentUserId) {
        return { ok: false as const, error: "not_authenticated" };
      }

      // Envio otimista: mostra a mensagem imediatamente com status
      // "pending" (relógio) — nunca finge entrega/leitura, só o envio local.
      const tempId = `temp-${crypto.randomUUID()}`;
      const optimistic: InternalMessage = {
        id: tempId,
        threadId,
        organizationId,
        senderUserId: currentUserId,
        senderMemberId: null,
        senderRole: payload.senderRole ?? senderRole ?? null,
        body: payload.body?.trim() || null,
        // Só é exibida quando NÃO há arquivo (envio de texto puro) — ver
        // condição abaixo; para uploads o tipo real é definido pelo servidor.
        messageType: payload.messageType ?? "text",
        replyToMessageId: null,
        createdAt: new Date().toISOString(),
        readAt: null,
        deliveredAt: null,
        attachments: [],
        senderName: "Você",
        isOwn: true,
        isPending: true,
      };
      if (!file) setMessages((prev) => [...prev, optimistic]);

      setSending(true);
      const result = await sendInternalMessage(
        organizationId,
        threadId,
        currentUserId,
        { ...payload, senderRole: payload.senderRole ?? senderRole ?? null },
        file,
      );
      setSending(false);

      if (result.ok && result.message) {
        knownIdsRef.current.add(result.message.id);
        setMessages((prev) => {
          const withoutTemp = prev.filter((m) => m.id !== tempId);
          if (withoutTemp.some((m) => m.id === result.message!.id)) return withoutTemp;
          return [...withoutTemp, result.message!];
        });
      } else if (!file) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, isPending: false, isFailed: true } : m)),
        );
      }

      return result;
    },
    [organizationId, threadId, currentUserId, senderRole],
  );

  const remove = useCallback(
    async (messageId: string) => {
      if (!organizationId) return { ok: false as const, error: "missing_org" };

      setDeleting(true);
      const result = await deleteInternalMessage(organizationId, messageId);
      setDeleting(false);

      if (result.ok) {
        // DB confirmou a exclusão: atualiza estado local
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, messageType: "deleted" as const, body: null, attachments: [] }
              : m,
          ),
        );
      }
      // Se DB falhou, NÃO atualiza estado local — a mensagem permanece visível
      // para refletir a realidade do banco. Ver relatório de auditoria para SQL de correção.

      return result;
    },
    [organizationId],
  );

  return { messages, loading, sending, deleting, fromDatabase, refetch, send, remove };
}

async function enrichIncomingSender(
  message: InternalMessage,
  currentUserId?: string | null,
): Promise<Partial<InternalMessage> | null> {
  if (!message.senderUserId) return null;
  if (message.senderUserId === currentUserId) return { senderName: "Você" };

  const { data } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("user_id", message.senderUserId)
    .maybeSingle();

  if (!data) return null;
  return { senderName: data.full_name ?? "Membro", senderAvatarUrl: data.avatar_url ?? null };
}
