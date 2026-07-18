import { supabase } from "@/integrations/supabase/client";
import { runScopedOrganizationQuery } from "@/lib/organizationScope";

export type InternalThreadStatus = "open" | "pending" | "answered" | "closed";

export type InternalThreadSource =
  | "campaign"
  | "community"
  | "group"
  | "pastoral"
  | "finance"
  | "secretariat"
  | "prayer"
  | "general";

export type InternalMessageType = "text" | "image" | "audio" | "video" | "document" | "system" | "deleted";

export type DbInternalThreadRow = {
  id: string;
  organization_id: string;
  campaign_id: string | null;
  member_id: string | null;
  created_by: string | null;
  assigned_to: string | null;
  subject: string;
  status: string;
  source: string;
  reply_enabled: boolean;
  last_message_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  call_room_token: string | null;
};

export type DbInternalMessageRow = {
  id: string;
  thread_id: string;
  organization_id: string;
  sender_user_id: string | null;
  sender_member_id: string | null;
  sender_role: string | null;
  body: string | null;
  message_type: string;
  reply_to_message_id: string | null;
  created_at: string;
  read_at: string | null;
  delivered_at: string | null;
};

export type DbInternalAttachmentRow = {
  id: string;
  message_id: string;
  thread_id: string;
  organization_id: string;
  uploaded_by: string | null;
  storage_bucket: string;
  storage_path: string;
  public_url: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  duration_seconds: number | null;
  created_at: string;
};

export type InternalThread = {
  id: string;
  organizationId: string;
  campaignId: string | null;
  memberId: string | null;
  createdBy: string | null;
  assignedTo: string | null;
  subject: string;
  status: InternalThreadStatus;
  source: InternalThreadSource;
  replyEnabled: boolean;
  lastMessageAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  participantName?: string;
  /** auth.users.id do outro participante — só resolvido para threads diretas (1:1). Usado para presença/avatar. */
  participantUserId?: string | null;
  participantAvatarUrl?: string | null;
  participantLastSeenAt?: string | null;
  /** Prévia da última mensagem (texto ou rótulo do tipo, ex: "📷 Foto"). */
  lastMessagePreview?: string | null;
  /** Quantidade de mensagens não lidas nesta thread para o usuário atual. */
  unreadCount?: number;
  /** Token aleatório usado para compor o nome da sala Jitsi (evita salas previsíveis). */
  callRoomToken?: string | null;
};

export type InternalMessageAttachment = {
  id: string;
  messageId: string;
  threadId: string;
  organizationId: string;
  storageBucket: string;
  storagePath: string;
  publicUrl: string | null;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  durationSeconds: number | null;
  createdAt: string;
};

export type InternalMessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";

export type InternalMessage = {
  id: string;
  threadId: string;
  organizationId: string;
  senderUserId: string | null;
  senderMemberId: string | null;
  senderRole: string | null;
  body: string | null;
  messageType: InternalMessageType;
  replyToMessageId: string | null;
  createdAt: string;
  readAt: string | null;
  deliveredAt: string | null;
  attachments: InternalMessageAttachment[];
  senderName?: string;
  senderAvatarUrl?: string | null;
  isOwn?: boolean;
  /** true enquanto a mensagem ainda não foi confirmada pelo servidor (envio otimista). */
  isPending?: boolean;
  /** true se o envio falhou e não foi persistido no servidor. */
  isFailed?: boolean;
};

/** Deriva o status real de exibição (relógio/check/check-duplo) — nunca simulado. */
export function getInternalMessageStatus(message: InternalMessage): InternalMessageStatus {
  if (message.isFailed) return "failed";
  if (message.isPending) return "pending";
  if (message.readAt) return "read";
  if (message.deliveredAt) return "delivered";
  return "sent";
}

export const INTERNAL_MESSAGE_BUCKET = "internal-message-media";

export const INTERNAL_ATTACHMENT_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export const INTERNAL_VIDEO_MIME = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

export const INTERNAL_AUDIO_MIME = [
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/mp4",
  "audio/webm",
  "audio/x-m4a",
  "audio/aac",
] as const;

export const INTERNAL_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const INTERNAL_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
export const INTERNAL_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const INTERNAL_AUDIO_MAX_BYTES = 20 * 1024 * 1024;

export function mapDbThreadToUi(row: DbInternalThreadRow): InternalThread {
  return {
    id: row.id,
    organizationId: row.organization_id,
    campaignId: row.campaign_id,
    memberId: row.member_id,
    createdBy: row.created_by,
    assignedTo: row.assigned_to,
    subject: row.subject,
    status: row.status as InternalThreadStatus,
    source: row.source as InternalThreadSource,
    replyEnabled: row.reply_enabled,
    lastMessageAt: row.last_message_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    callRoomToken: row.call_room_token,
  };
}

export function mapDbAttachmentToUi(row: DbInternalAttachmentRow): InternalMessageAttachment {
  return {
    id: row.id,
    messageId: row.message_id,
    threadId: row.thread_id,
    organizationId: row.organization_id,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    publicUrl: row.public_url,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: row.file_size,
    durationSeconds: row.duration_seconds,
    createdAt: row.created_at,
  };
}

export function mapDbMessageToUi(
  row: DbInternalMessageRow,
  attachments: InternalMessageAttachment[] = [],
): InternalMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    organizationId: row.organization_id,
    senderUserId: row.sender_user_id,
    senderMemberId: row.sender_member_id,
    senderRole: row.sender_role,
    body: row.body,
    messageType: row.message_type as InternalMessageType,
    replyToMessageId: row.reply_to_message_id,
    createdAt: row.created_at,
    readAt: row.read_at,
    deliveredAt: row.delivered_at,
    attachments,
  };
}

export type FetchThreadsOptions = {
  organizationId: string;
  source?: InternalThreadSource;
  campaignId?: string;
  currentUserId?: string | null;
};

export async function fetchThreadsBySource(
  options: FetchThreadsOptions,
): Promise<{ threads: InternalThread[]; fromDatabase: boolean }> {
  const { organizationId, source, campaignId } = options;

  try {
    const { data, error } = await runScopedOrganizationQuery<DbInternalThreadRow[]>(
      "internal_threads",
      organizationId,
      (query) => {
        let q = query
          .select("*")
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false });
        if (source) q = q.eq("source", source);
        if (campaignId) q = q.eq("campaign_id", campaignId);
        return q;
      },
    );

    if (error) {
      console.warn("[fetchThreadsBySource]", String((error as { message?: string }).message ?? error));
      return { threads: [], fromDatabase: false };
    }

    let threads = (data ?? []).map(mapDbThreadToUi);

    if (options.currentUserId) {
      const { data: hidden } = await supabase
        .from("internal_thread_hidden_for_user")
        .select("thread_id")
        .eq("user_id", options.currentUserId);
      const hiddenIds = new Set((hidden ?? []).map((h) => h.thread_id));
      if (hiddenIds.size > 0) threads = threads.filter((t) => !hiddenIds.has(t.id));
    }

    await enrichThreadParticipantNames(threads);
    await enrichThreadPreviewsAndUnread(threads, options.currentUserId);
    return { threads, fromDatabase: true };
  } catch (err) {
    console.warn("[fetchThreadsBySource]", err);
    return { threads: [], fromDatabase: false };
  }
}

/** "Apagar para mim" — oculta a conversa apenas para o usuário atual. Não afeta outros participantes nem mensagens. */
export async function hideInternalThreadForUser(
  threadId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("internal_thread_hidden_for_user")
    .upsert({ thread_id: threadId, user_id: userId }, { onConflict: "thread_id,user_id" });

  if (error) return { ok: false, error: String(error.message ?? error) };
  return { ok: true };
}

export async function fetchThreadMessages(
  organizationId: string,
  threadId: string,
  currentUserId?: string | null,
): Promise<{ messages: InternalMessage[]; fromDatabase: boolean }> {
  try {
    const { data: messagesData, error: messagesError } = await supabase
      .from("internal_messages")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      console.warn("[fetchThreadMessages]", messagesError.message);
      return { messages: [], fromDatabase: false };
    }

    const rows = (messagesData ?? []) as DbInternalMessageRow[];
    if (rows.length === 0) {
      return { messages: [], fromDatabase: true };
    }

    const messageIds = rows.map((r) => r.id);
    const { data: attachmentsData } = await supabase
      .from("internal_message_attachments")
      .select("*")
      .eq("thread_id", threadId)
      .in("message_id", messageIds);

    const attachmentsByMessage = new Map<string, InternalMessageAttachment[]>();
    for (const att of (attachmentsData ?? []) as DbInternalAttachmentRow[]) {
      const list = attachmentsByMessage.get(att.message_id) ?? [];
      list.push(mapDbAttachmentToUi(att));
      attachmentsByMessage.set(att.message_id, list);
    }

    const messages = rows.map((row) => {
      const msg = mapDbMessageToUi(row, attachmentsByMessage.get(row.id) ?? []);
      msg.isOwn = Boolean(currentUserId && row.sender_user_id === currentUserId);
      return msg;
    });

    await enrichMessageSenderNames(messages);
    return { messages, fromDatabase: true };
  } catch (err) {
    console.warn("[fetchThreadMessages]", err);
    return { messages: [], fromDatabase: false };
  }
}

/**
 * Resolve o nome/avatar/user_id do "outro lado" de cada thread.
 * Prioriza member_id (identifica sem ambiguidade o membro de uma conversa
 * direta 1:1, independente de quem criou a linha da thread) — antes o
 * código usava sempre created_by, o que fazia uma conversa direta iniciada
 * pela secretaria mostrar o próprio nome do atendente em vez do membro.
 */
async function enrichThreadParticipantNames(threads: InternalThread[]): Promise<void> {
  const memberIds = [...new Set(threads.map((t) => t.memberId).filter(Boolean))] as string[];
  const memberByThreadId = new Map<string, { full_name: string; user_id: string | null }>();

  if (memberIds.length > 0) {
    const { data: memberRows } = await supabase
      .from("members")
      .select("id, full_name, user_id")
      .in("id", memberIds);

    const memberById = new Map(
      (memberRows ?? []).map((m) => [m.id, { full_name: m.full_name ?? "Membro", user_id: m.user_id ?? null }]),
    );
    for (const thread of threads) {
      if (thread.memberId) {
        const found = memberById.get(thread.memberId);
        if (found) memberByThreadId.set(thread.id, found);
      }
    }
  }

  const resolvedUserIds = [...new Set([...memberByThreadId.values()].map((m) => m.user_id).filter(Boolean))] as string[];
  const createdByIds = [...new Set(threads.map((t) => t.createdBy).filter(Boolean))] as string[];
  const allProfileIds = [...new Set([...resolvedUserIds, ...createdByIds])];

  const profileById = new Map<string, { full_name: string; avatar_url: string | null; last_seen_at: string | null }>();
  if (allProfileIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, full_name, avatar_url, last_seen_at")
      .in("user_id", allProfileIds);
    for (const p of data ?? []) {
      profileById.set(p.user_id, {
        full_name: p.full_name ?? "Membro",
        avatar_url: p.avatar_url ?? null,
        last_seen_at: p.last_seen_at ?? null,
      });
    }
  }

  for (const thread of threads) {
    const member = memberByThreadId.get(thread.id);
    const resolvedUserId = member?.user_id ?? thread.createdBy ?? null;
    const profile = resolvedUserId ? profileById.get(resolvedUserId) : undefined;

    if (member) {
      thread.participantName = member.full_name;
    } else if (thread.createdBy) {
      thread.participantName = profile?.full_name ?? "Membro";
    }
    thread.participantUserId = resolvedUserId;
    thread.participantAvatarUrl = profile?.avatar_url ?? null;
    thread.participantLastSeenAt = profile?.last_seen_at ?? null;
  }
}

/**
 * Preenche a prévia da última mensagem e a contagem de não lidas por
 * thread — dados reais, uma única consulta batched (evita N+1).
 */
async function enrichThreadPreviewsAndUnread(
  threads: InternalThread[],
  currentUserId?: string | null,
): Promise<void> {
  if (threads.length === 0) return;
  const threadIds = threads.map((t) => t.id);

  const { data } = await supabase
    .from("internal_messages")
    .select("id, thread_id, body, message_type, created_at, sender_user_id, read_at")
    .in("thread_id", threadIds)
    .order("created_at", { ascending: true });

  const rows = data ?? [];
  const lastByThread = new Map<string, { body: string | null; message_type: string }>();
  const unreadByThread = new Map<string, number>();

  const previewLabel = (body: string | null, type: string): string => {
    if (type === "deleted") return "Mensagem apagada";
    if (body) return body;
    if (type === "image") return "📷 Foto";
    if (type === "video") return "🎥 Vídeo";
    if (type === "audio") return "🎤 Áudio";
    if (type === "document") return "📄 Documento";
    return "";
  };

  for (const row of rows) {
    // rows já vêm em ordem crescente de created_at — a última sobrescreve
    lastByThread.set(row.thread_id, { body: row.body, message_type: row.message_type });

    if (currentUserId && !row.read_at && row.sender_user_id !== currentUserId) {
      unreadByThread.set(row.thread_id, (unreadByThread.get(row.thread_id) ?? 0) + 1);
    }
  }

  for (const thread of threads) {
    const last = lastByThread.get(thread.id);
    thread.lastMessagePreview = last ? previewLabel(last.body, last.message_type) : null;
    thread.unreadCount = unreadByThread.get(thread.id) ?? 0;
  }
}

async function enrichMessageSenderNames(messages: InternalMessage[]): Promise<void> {
  const userIds = [...new Set(messages.map((m) => m.senderUserId).filter(Boolean))] as string[];
  if (userIds.length === 0) return;

  const { data } = await supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", userIds);
  const profileById = new Map((data ?? []).map((p) => [p.user_id, p]));

  for (const msg of messages) {
    if (msg.senderUserId) {
      const profile = profileById.get(msg.senderUserId);
      msg.senderName = profile?.full_name ?? (msg.isOwn ? "Você" : "Membro");
      msg.senderAvatarUrl = profile?.avatar_url ?? null;
    } else if (msg.messageType === "system") {
      msg.senderName = "Sistema";
    }
  }
}

export async function resolveMemberIdForUser(
  organizationId: string,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("members")
    .select("id, user_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  return (data as { id?: string } | null)?.id ?? null;
}

/** Busca uma thread específica por ID (ex: abrir a partir de uma notificação/link). */
export async function fetchThreadById(
  organizationId: string,
  threadId: string,
): Promise<InternalThread | null> {
  try {
    const { data, error } = await supabase
      .from("internal_threads")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", threadId)
      .maybeSingle();

    if (error || !data) return null;
    const thread = mapDbThreadToUi(data as DbInternalThreadRow);
    await enrichThreadParticipantNames([thread]);
    return thread;
  } catch {
    return null;
  }
}

/** Busca a thread compartilhada de uma campanha (modelo conversa única). */
export async function fetchCampaignSharedThread(
  organizationId: string,
  campaignId: string,
): Promise<InternalThread | null> {
  try {
    const { data, error } = await supabase
      .from("internal_threads")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("campaign_id", campaignId)
      .eq("source", "campaign")
      .maybeSingle();

    if (error || !data) return null;
    const thread = mapDbThreadToUi(data as DbInternalThreadRow);
    await enrichThreadParticipantNames([thread]);
    return thread;
  } catch {
    return null;
  }
}
