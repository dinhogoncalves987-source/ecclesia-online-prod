import { supabase } from "@/integrations/supabase/client";
import { insertWithOrganizationScope } from "@/lib/organizationScope";
import {
  INTERNAL_ATTACHMENT_MIME,
  INTERNAL_AUDIO_MAX_BYTES,
  INTERNAL_AUDIO_MIME,
  INTERNAL_DOCUMENT_MAX_BYTES,
  INTERNAL_IMAGE_MAX_BYTES,
  INTERNAL_MESSAGE_BUCKET,
  INTERNAL_VIDEO_MAX_BYTES,
  INTERNAL_VIDEO_MIME,
  mapDbAttachmentToUi,
  mapDbMessageToUi,
  mapDbThreadToUi,
  resolveMemberIdForUser,
  type DbInternalAttachmentRow,
  type DbInternalMessageRow,
  type DbInternalThreadRow,
  type InternalMessage,
  type InternalMessageAttachment,
  type InternalMessageType,
  type InternalThread,
} from "@/lib/internalMessages";

export type InternalMutationResult = {
  ok: boolean;
  id?: string;
  error?: string;
};

export type SendMessagePayload = {
  body?: string;
  messageType?: InternalMessageType;
  senderRole?: string | null;
};

function fileExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? `.${parts.pop()!.toLowerCase()}` : "";
}

export function validateInternalAttachment(file: File): string | null {
  const mime = file.type.toLowerCase();
  const ext = fileExtension(file.name);

  const isImage =
    mime.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp"].includes(ext);
  const isDoc =
    INTERNAL_ATTACHMENT_MIME.includes(mime as (typeof INTERNAL_ATTACHMENT_MIME)[number]) ||
    [".pdf", ".docx", ".xlsx"].includes(ext);
  const isVideo =
    INTERNAL_VIDEO_MIME.includes(mime as (typeof INTERNAL_VIDEO_MIME)[number]) ||
    [".mp4", ".webm", ".mov"].includes(ext);
  const isAudio =
    INTERNAL_AUDIO_MIME.includes(mime as (typeof INTERNAL_AUDIO_MIME)[number]) ||
    mime.startsWith("audio/") ||
    [".mp3", ".ogg", ".wav", ".m4a", ".aac"].includes(ext);

  if (isImage) {
    if (file.size > INTERNAL_IMAGE_MAX_BYTES) return "image_too_large";
    return null;
  }
  if (isDoc) {
    if (file.size > INTERNAL_DOCUMENT_MAX_BYTES) return "document_too_large";
    return null;
  }
  if (isVideo) {
    if (file.size > INTERNAL_VIDEO_MAX_BYTES) return "video_too_large";
    return null;
  }
  if (isAudio) {
    if (file.size > INTERNAL_AUDIO_MAX_BYTES) return "audio_too_large";
    return null;
  }
  return "invalid_type";
}

function buildStoragePath(organizationId: string, threadId: string, file: File): string {
  const ext = fileExtension(file.name).replace(/^\./, "") || "bin";
  return `${organizationId}/${threadId}/${crypto.randomUUID()}.${ext}`;
}

function inferMessageType(file: File): InternalMessageType {
  const mime = file.type.toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

/**
 * Busca conversa DIRETA (DM) existente entre dois usuários (source='direct'),
 * ou cria nova caso não exista. Garante no máximo 1 thread por par (org + users).
 *
 * REGRA: Não cria DM se o membro não tiver user_id vinculado.
 * Retorna error='member_not_activated' se isso ocorrer.
 */
export async function findOrCreateDirectThread(
  organizationId: string,
  userId: string,
  memberId: string,
  memberName: string,
  targetMemberUserId?: string | null,
): Promise<{ ok: boolean; thread?: InternalThread; isNew?: boolean; error?: string }> {
  // Verificar se o membro tem usuário vinculado (necessário para DM)
  if (!targetMemberUserId) {
    // Tentar buscar user_id do membro
    const { data: memberData } = await supabase
      .from("members")
      .select("user_id")
      .eq("id", memberId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    const resolvedUserId = (memberData as { user_id?: string | null } | null)?.user_id;

    if (!resolvedUserId) {
      return {
        ok: false,
        error: "member_not_activated",
      };
    }
    targetMemberUserId = resolvedUserId;
  }

  // Buscar thread direta existente
  const { data: existing, error: findError } = await supabase
    .from("internal_threads")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("source", "direct")
    .eq("created_by", userId)
    .eq("member_id", memberId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) {
    return { ok: false, error: String(findError.message ?? findError) };
  }

  if (existing) {
    return { ok: true, thread: mapDbThreadToUi(existing as DbInternalThreadRow), isNew: false };
  }

  // Criar nova thread direta
  const { data, error } = await insertWithOrganizationScope<DbInternalThreadRow>(
    "internal_threads",
    organizationId,
    {
      created_by: userId,
      member_id: memberId,
      subject: memberName.trim() || "Conversa direta",
      source: "direct",
      status: "open",
      reply_enabled: true,
    },
    (query) => query.select("*").single(),
  );

  if (error) {
    return { ok: false, error: String((error as { message?: string }).message ?? error) };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, error: "missing_thread" };

  return { ok: true, thread: mapDbThreadToUi(row as DbInternalThreadRow), isNew: true };
}

/**
 * Busca conversa de secretaria existente com um membro ou cria nova.
 * Para conversas administrativas (secretariat source).
 */
export async function findOrCreateSecretariatThread(
  organizationId: string,
  userId: string,
  memberId: string,
  memberName: string,
): Promise<{ ok: boolean; thread?: InternalThread; isNew?: boolean; error?: string }> {
  // Buscar thread existente com esse membro nessa organização
  const { data: existing, error: findError } = await supabase
    .from("internal_threads")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("source", "secretariat")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) {
    return { ok: false, error: String(findError.message ?? findError) };
  }

  if (existing) {
    return { ok: true, thread: mapDbThreadToUi(existing as DbInternalThreadRow), isNew: false };
  }

  // Criar nova thread de secretaria
  const { data, error } = await insertWithOrganizationScope<DbInternalThreadRow>(
    "internal_threads",
    organizationId,
    {
      created_by: userId,
      member_id: memberId,
      subject: memberName.trim() || "Conversa",
      source: "secretariat",
      status: "open",
      reply_enabled: true,
    },
    (query) => query.select("*").single(),
  );

  if (error) {
    return { ok: false, error: String((error as { message?: string }).message ?? error) };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, error: "missing_thread" };

  return { ok: true, thread: mapDbThreadToUi(row as DbInternalThreadRow), isNew: true };
}

/** Cria uma thread de secretaria com assunto/categoria fixos. */
export async function createSecretariatThread(
  organizationId: string,
  userId: string,
  subject: string,
): Promise<{ ok: boolean; thread?: InternalThread; error?: string }> {
  const { data, error } = await insertWithOrganizationScope<DbInternalThreadRow>(
    "internal_threads",
    organizationId,
    {
      created_by: userId,
      subject: subject.trim() || "Secretaria",
      source: "secretariat",
      status: "open",
      reply_enabled: true,
    },
    (query) => query.select("*").single(),
  );

  if (error) {
    return { ok: false, error: String((error as { message?: string }).message ?? error) };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, error: "missing_thread" };

  return { ok: true, thread: mapDbThreadToUi(row as DbInternalThreadRow) };
}

export async function createOrGetCampaignThread(
  organizationId: string,
  campaignId: string,
  subject: string,
  userId: string,
): Promise<{ ok: boolean; thread?: InternalThread; error?: string }> {
  // Conversa única por campanha: busca por campaign_id, sem filtrar por created_by
  const { data: existing, error: findError } = await supabase
    .from("internal_threads")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("campaign_id", campaignId)
    .eq("source", "campaign")
    .maybeSingle();

  if (findError) {
    return { ok: false, error: String(findError.message ?? findError) };
  }

  if (existing) {
    return { ok: true, thread: mapDbThreadToUi(existing as DbInternalThreadRow) };
  }

  const memberId = await resolveMemberIdForUser(organizationId, userId);

  const { data, error } = await insertWithOrganizationScope<DbInternalThreadRow>(
    "internal_threads",
    organizationId,
    {
      campaign_id: campaignId,
      member_id: memberId,
      created_by: userId,
      subject: subject.trim() || "Campanha",
      source: "campaign",
      status: "open",
      reply_enabled: true,
    },
    (query) => query.select("*").single(),
  );

  if (error) {
    const msg = String((error as { message?: string }).message ?? error);
    // Condição de corrida: outra requisição criou a thread simultaneamente
    if (msg.includes("duplicate key")) {
      const { data: retry } = await supabase
        .from("internal_threads")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("campaign_id", campaignId)
        .eq("source", "campaign")
        .maybeSingle();
      if (retry) return { ok: true, thread: mapDbThreadToUi(retry as DbInternalThreadRow) };
    }
    return { ok: false, error: msg };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, error: "missing_thread" };

  return { ok: true, thread: mapDbThreadToUi(row as DbInternalThreadRow) };
}

export async function fetchMemberCampaignThread(
  organizationId: string,
  campaignId: string,
  userId: string,
): Promise<InternalThread | null> {
  const { data, error } = await supabase
    .from("internal_threads")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("campaign_id", campaignId)
    .eq("created_by", userId)
    .maybeSingle();

  if (error || !data) return null;
  return mapDbThreadToUi(data as DbInternalThreadRow);
}

export type SendFirstCampaignMessageParams = {
  organizationId: string;
  campaignId: string;
  campaignTitle: string;
  userId: string;
  body: string;
  senderRole?: string | null;
  file?: File;
};

/** Cria thread da campanha (se necessário) e envia a primeira mensagem. */
export async function sendFirstCampaignMessage(
  params: SendFirstCampaignMessageParams,
): Promise<{ ok: boolean; thread?: InternalThread; message?: InternalMessage; error?: string }> {
  const threadResult = await createOrGetCampaignThread(
    params.organizationId,
    params.campaignId,
    params.campaignTitle,
    params.userId,
  );

  if (!threadResult.ok || !threadResult.thread) {
    return { ok: false, error: threadResult.error ?? "missing_thread" };
  }

  const messageResult = await sendInternalMessage(
    params.organizationId,
    threadResult.thread.id,
    params.userId,
    { body: params.body, senderRole: params.senderRole ?? "member" },
    params.file,
  );

  if (!messageResult.ok) {
    return { ok: false, thread: threadResult.thread, error: messageResult.error };
  }

  return {
    ok: true,
    thread: threadResult.thread,
    message: messageResult.message,
  };
}

export async function sendInternalMessage(
  organizationId: string,
  threadId: string,
  userId: string,
  payload: SendMessagePayload,
  file?: File,
): Promise<{ ok: boolean; message?: InternalMessage; error?: string }> {
  const body = payload.body?.trim() ?? "";
  const hasFile = Boolean(file);

  if (!body && !hasFile) {
    return { ok: false, error: "empty_message" };
  }

  if (hasFile && file) {
    const validation = validateInternalAttachment(file);
    if (validation) return { ok: false, error: validation };
  }

  const memberId = await resolveMemberIdForUser(organizationId, userId);
  const messageType = hasFile && file ? inferMessageType(file) : (payload.messageType ?? "text");

  const { data: msgData, error: msgError } = await insertWithOrganizationScope<DbInternalMessageRow>(
    "internal_messages",
    organizationId,
    {
      thread_id: threadId,
      sender_user_id: userId,
      sender_member_id: memberId,
      sender_role: payload.senderRole ?? null,
      body: body || null,
      message_type: messageType,
    },
    (query) => query.select("*").single(),
  );

  if (msgError) {
    return { ok: false, error: String((msgError as { message?: string }).message ?? msgError) };
  }

  const msgRow = (Array.isArray(msgData) ? msgData[0] : msgData) as DbInternalMessageRow | undefined;
  if (!msgRow) return { ok: false, error: "missing_message" };

  let attachments: InternalMessageAttachment[] = [];

  if (hasFile && file) {
    const uploadResult = await uploadInternalAttachment(
      organizationId,
      threadId,
      msgRow.id,
      userId,
      file,
    );
    if (!uploadResult.ok) {
      return { ok: false, error: uploadResult.error };
    }
    if (uploadResult.attachment) attachments = [uploadResult.attachment];
  }

  const message = mapDbMessageToUi(msgRow, attachments);
  message.isOwn = true;
  message.senderName = "Você";

  return { ok: true, message };
}

export async function uploadInternalAttachment(
  organizationId: string,
  threadId: string,
  messageId: string,
  userId: string,
  file: File,
): Promise<{ ok: boolean; attachment?: InternalMessageAttachment; error?: string }> {
  const validation = validateInternalAttachment(file);
  if (validation) return { ok: false, error: validation };

  const storagePath = buildStoragePath(organizationId, threadId, file);

  const { error: uploadError } = await supabase.storage
    .from(INTERNAL_MESSAGE_BUCKET)
    .upload(storagePath, file, { upsert: false, contentType: file.type || undefined });

  if (uploadError) {
    return { ok: false, error: String(uploadError.message ?? uploadError) };
  }

  const { data: urlData } = supabase.storage.from(INTERNAL_MESSAGE_BUCKET).getPublicUrl(storagePath);
  const publicUrl = urlData?.publicUrl ?? null;

  const { data, error } = await insertWithOrganizationScope<DbInternalAttachmentRow>(
    "internal_message_attachments",
    organizationId,
    {
      message_id: messageId,
      thread_id: threadId,
      uploaded_by: userId,
      storage_bucket: INTERNAL_MESSAGE_BUCKET,
      storage_path: storagePath,
      public_url: publicUrl,
      file_name: file.name,
      file_type: file.type || null,
      file_size: file.size,
    },
    (query) => query.select("*").single(),
  );

  if (error) {
    return { ok: false, error: String((error as { message?: string }).message ?? error) };
  }

  const row = (Array.isArray(data) ? data[0] : data) as DbInternalAttachmentRow | undefined;
  if (!row) return { ok: false, error: "missing_attachment" };

  return { ok: true, attachment: mapDbAttachmentToUi(row) };
}

/**
 * Opções de duração para mensagens temporárias em conversas normais.
 * null = desativado; número = duração em segundos.
 */
export type NormalEphemeralDuration = null | 86400 | 604800 | 2592000 | 7776000;

/**
 * Ativa, altera ou desativa mensagens temporárias em uma conversa normal (internal_threads).
 * Qualquer participante pode alterar — comportamento estilo WhatsApp.
 *
 * Quando ativado, aplica-se apenas a novas mensagens.
 * Para conversas normais, mensagens expiradas são ocultadas na UI (não deletadas fisicamente).
 */
export async function setThreadEphemeralDuration(
  organizationId: string,
  threadId: string,
  durationSeconds: NormalEphemeralDuration,
): Promise<InternalMutationResult> {
  const { error } = await supabase
    .from("internal_threads")
    .update({ ephemeral_duration: durationSeconds })
    .eq("id", threadId)
    .eq("organization_id", organizationId);

  if (error) return { ok: false, error: String(error.message ?? error) };
  return { ok: true, id: threadId };
}

export async function closeInternalThread(
  organizationId: string,
  threadId: string,
): Promise<InternalMutationResult> {
  const { error } = await supabase
    .from("internal_threads")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      reply_enabled: false,
    })
    .eq("id", threadId)
    .eq("organization_id", organizationId);

  if (error) return { ok: false, error: String(error.message ?? error) };
  return { ok: true, id: threadId };
}

export async function reopenInternalThread(
  organizationId: string,
  threadId: string,
): Promise<InternalMutationResult> {
  const { error } = await supabase
    .from("internal_threads")
    .update({
      status: "open",
      closed_at: null,
      reply_enabled: true,
    })
    .eq("id", threadId)
    .eq("organization_id", organizationId);

  if (error) return { ok: false, error: String(error.message ?? error) };
  return { ok: true, id: threadId };
}

export async function deleteInternalMessage(
  organizationId: string,
  messageId: string,
): Promise<InternalMutationResult> {
  return deleteMessageForEveryone(organizationId, messageId);
}

/**
 * Apaga mensagem para TODOS os participantes da conversa.
 * Usa RPC SECURITY DEFINER para validar permissões (autor ou admin).
 */
export async function deleteMessageForEveryone(
  organizationId: string,
  messageId: string,
): Promise<InternalMutationResult> {
  // Tentativa via RPC (mais segura, valida permissões no servidor)
  const { data: rpcOk, error: rpcError } = await supabase.rpc(
    "delete_message_for_everyone",
    { p_message_id: messageId, p_organization_id: organizationId },
  );

  if (!rpcError && rpcOk) return { ok: true, id: messageId };

  // Fallback: atualização direta (para ambientes onde a RPC ainda não foi aplicada)
  const { error: updateError } = await supabase
    .from("internal_messages")
    .update({
      message_type: "deleted",
      body: null,
      deleted_for_everyone: true,
      deleted_at: new Date().toISOString(),
    })
    .eq("id", messageId)
    .eq("organization_id", organizationId);

  if (!updateError) return { ok: true, id: messageId };

  console.warn("[deleteMessageForEveryone] falha:", updateError.message);
  return { ok: false, error: updateError.message };
}

/**
 * Apaga mensagem APENAS para o usuário atual.
 * Os outros participantes continuam vendo a mensagem.
 * Registra em message_user_deletions.
 */
export async function deleteMessageForMe(
  organizationId: string,
  messageId: string,
  userId: string,
): Promise<InternalMutationResult> {
  const { error } = await supabase
    .from("message_user_deletions")
    .upsert(
      { message_id: messageId, user_id: userId },
      { onConflict: "message_id,user_id" },
    );

  if (error) {
    console.warn("[deleteMessageForMe] falha:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true, id: messageId };
}
