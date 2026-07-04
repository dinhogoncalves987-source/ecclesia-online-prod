import { supabase } from "@/integrations/supabase/client";
import { runScopedOrganizationQuery } from "@/lib/organizationScope";

export type InternalThreadStatus = "open" | "pending" | "answered" | "closed";

export type InternalThreadSource =
  | "campaign"
  | "community"
  | "group"
  | "ministry"
  | "pastoral"
  | "finance"
  | "secretariat"
  | "prayer"
  | "general"
  | "direct"
  | "broadcast"
  | "support";

export type InternalMessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "system"
  | "deleted"
  | "call"
  | "location";

export type DbInternalThreadRow = {
  id: string;
  organization_id: string;
  campaign_id: string | null;
  member_id: string | null;
  group_id: string | null;
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
  /** Duração em segundos para mensagens temporárias. NULL = desativado. */
  ephemeral_duration: number | null;
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
  deleted_for_everyone: boolean;
  deleted_by: string | null;
  deleted_at: string | null;
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
  groupId: string | null;
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
  /** Computed client-side from message_read_receipts. Not stored in DB. */
  unreadCount?: number;
  /**
   * Duração em segundos das mensagens temporárias (opt-in). NULL = desativado.
   * Qualquer participante pode ativar/alterar (comportamento WhatsApp).
   * Aplica-se apenas a NOVAS mensagens após ativação.
   */
  ephemeralDuration: number | null;
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
  deletedForEveryone: boolean;
  deletedBy: string | null;
  deletedAt: string | null;
  attachments: InternalMessageAttachment[];
  senderName?: string;
  isOwn?: boolean;
};

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
    groupId: row.group_id,
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
    ephemeralDuration: row.ephemeral_duration ?? null,
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
    deletedForEveryone: row.deleted_for_everyone ?? false,
    deletedBy: row.deleted_by ?? null,
    deletedAt: row.deleted_at ?? null,
    attachments,
  };
}

export type FetchThreadsOptions = {
  organizationId: string;
  source?: InternalThreadSource;
  campaignId?: string;
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

    const threads = (data ?? []).map(mapDbThreadToUi);
    await enrichThreadParticipantNames(threads);
    return { threads, fromDatabase: true };
  } catch (err) {
    console.warn("[fetchThreadsBySource]", err);
    return { threads: [], fromDatabase: false };
  }
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

    let rows = (messagesData ?? []) as DbInternalMessageRow[];
    if (rows.length === 0) {
      return { messages: [], fromDatabase: true };
    }

    // Filtrar mensagens apagadas para o usuário atual ("apagar para mim")
    if (currentUserId) {
      const { data: userDeletions } = await supabase
        .from("message_user_deletions")
        .select("message_id")
        .eq("user_id", currentUserId)
        .in("message_id", rows.map((r) => r.id));

      const deletedForMeIds = new Set(
        (userDeletions ?? []).map(
          (d) => (d as { message_id: string }).message_id,
        ),
      );

      if (deletedForMeIds.size > 0) {
        rows = rows.filter((r) => !deletedForMeIds.has(r.id));
      }
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

async function enrichThreadParticipantNames(threads: InternalThread[]): Promise<void> {
  const userIds = [...new Set(threads.map((t) => t.createdBy).filter(Boolean))] as string[];
  if (userIds.length === 0) return;

  const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
  const nameById = new Map((data ?? []).map((p) => [p.user_id, p.full_name ?? "Membro"]));

  for (const thread of threads) {
    if (thread.createdBy) {
      thread.participantName = nameById.get(thread.createdBy) ?? "Membro";
    }
  }
}

async function enrichMessageSenderNames(messages: InternalMessage[]): Promise<void> {
  const userIds = [...new Set(messages.map((m) => m.senderUserId).filter(Boolean))] as string[];
  if (userIds.length === 0) return;

  const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
  const nameById = new Map((data ?? []).map((p) => [p.user_id, p.full_name ?? "Membro"]));

  for (const msg of messages) {
    if (msg.senderUserId) {
      msg.senderName = nameById.get(msg.senderUserId) ?? (msg.isOwn ? "Você" : "Membro");
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

// ── Read Receipts ─────────────────────────────────────────────────────────────

/**
 * Marca todas as mensagens não-lidas de uma thread como lidas pelo usuário atual.
 * Também atualiza internal_messages.read_at para a primeira leitura (indicador ✓✓).
 * Chamado via RPC SECURITY DEFINER para evitar problemas de RLS.
 */
export async function markThreadMessagesRead(
  threadId: string,
  organizationId: string,
): Promise<void> {
  try {
    await supabase.rpc("mark_thread_messages_read", {
      p_thread_id: threadId,
      p_organization_id: organizationId,
    });
  } catch {
    // Silencioso — falha de leitura não deve interromper o chat
  }
}

/**
 * Retorna um mapa { thread_id → unread_count } para a organização dada.
 * Usa RPC para eficiência (uma única query no servidor).
 */
export async function fetchThreadUnreadCounts(
  organizationId: string,
): Promise<Record<string, number>> {
  try {
    const { data, error } = await supabase.rpc("get_unread_counts_by_org", {
      p_organization_id: organizationId,
    });
    if (error || !data) return {};
    const result: Record<string, number> = {};
    for (const row of data as Array<{ thread_id: string; unread_count: number }>) {
      result[row.thread_id] = Number(row.unread_count);
    }
    return result;
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────

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
