/**
 * Ecclesia Canal — Tipos, Mappers e Funções de API
 *
 * Stack: Supabase (metadados) + Cloudflare R2 (vídeos)
 * Upload: URL assinada via Edge Function get-r2-upload-url → upload direto para R2.
 */

import { supabase } from "@/integrations/supabase/client";
import { uploadToR2, buildR2Path } from "@/lib/r2Upload";

// ── Enums ─────────────────────────────────────────────────────────────────────

export type EcclesiaCanalStatus = "active" | "inactive" | "archived";
export type EcclesiaVideoStatus = "processing" | "ready" | "failed" | "archived" | "draft";
export type EcclesiaVisibility = "public" | "org_members" | "private";
export type EcclesiaVideoCategory =
  | "culto" | "pregacao" | "louvor" | "estudo" | "infantil"
  | "jovens" | "mulheres" | "homens" | "missoes"
  | "testemunho" | "noticiario" | "general";

export const CATEGORY_LABELS: Record<EcclesiaVideoCategory, string> = {
  culto: "Culto", pregacao: "Pregação", louvor: "Louvor & Adoração",
  estudo: "Estudo Bíblico", infantil: "Infantil", jovens: "Jovens",
  mulheres: "Mulheres", homens: "Homens", missoes: "Missões",
  testemunho: "Testemunho", noticiario: "Noticiário", general: "Geral",
};

// ── Tipos ──────────────────────────────────────────────────────────────────────

export type EcclesiaChannel = {
  id: string;
  organizationId: string;
  ownerUserId: string | null;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  visibility: EcclesiaVisibility;
  status: EcclesiaCanalStatus;
  subscriberCount: number;
  videoCount: number;
  createdAt: string;
};

export type EcclesiaVideo = {
  id: string;
  channelId: string;
  organizationId: string;
  title: string;
  description: string | null;
  category: EcclesiaVideoCategory;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  r2StorageKey: string | null;
  playbackUrl: string | null;
  hlsUrl: string | null;
  tvLiveSessionId: string | null;
  visibility: EcclesiaVisibility;
  status: EcclesiaVideoStatus;
  uploadedBy: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: string | null;
  createdAt: string;
};

export type EcclesiaComment = {
  id: string;
  videoId: string;
  userId: string;
  parentCommentId: string | null;
  body: string;
  isDeleted: boolean;
  createdAt: string;
  userName: string;
  userAvatar: string | null;
  replyCount: number;
};

export type EcclesiaPlaylist = {
  id: string;
  channelId: string;
  organizationId: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  visibility: EcclesiaVisibility;
  videoCount: number;
  createdBy: string | null;
  createdAt: string;
};

export type EcclesiaPlaylistItem = {
  id: string;
  playlistId: string;
  videoId: string;
  position: number;
  video?: EcclesiaVideo;
};

export type WatchHistory = {
  videoId: string;
  lastPosition: number;
  watchedSeconds: number;
  completed: boolean;
};

// ── Mappers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapChannel(r: any): EcclesiaChannel {
  return {
    id: r.id, organizationId: r.organization_id,
    ownerUserId: r.owner_user_id ?? null,
    name: r.name, slug: r.slug, description: r.description ?? null,
    logoUrl: r.logo_url ?? null, bannerUrl: r.banner_url ?? null,
    visibility: r.visibility, status: r.status,
    subscriberCount: r.subscriber_count ?? 0,
    videoCount: r.video_count ?? 0,
    createdAt: r.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapVideo(r: any): EcclesiaVideo {
  return {
    id: r.id, channelId: r.channel_id, organizationId: r.organization_id,
    title: r.title, description: r.description ?? null,
    category: r.category ?? "general",
    durationSeconds: r.duration_seconds ?? null,
    thumbnailUrl: r.thumbnail_url ?? null,
    r2StorageKey: r.r2_storage_key ?? null,
    playbackUrl: r.playback_url ?? null,
    hlsUrl: r.hls_url ?? null,
    tvLiveSessionId: r.tv_live_session_id ?? null,
    visibility: r.visibility, status: r.status,
    uploadedBy: r.uploaded_by ?? null,
    viewCount: r.view_count ?? 0, likeCount: r.like_count ?? 0,
    commentCount: r.comment_count ?? 0,
    publishedAt: r.published_at ?? null,
    createdAt: r.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapComment(r: any): EcclesiaComment {
  return {
    id: r.id, videoId: r.video_id, userId: r.user_id,
    parentCommentId: r.parent_comment_id ?? null,
    body: r.body, isDeleted: r.is_deleted ?? false,
    createdAt: r.created_at,
    userName: r.user_name ?? "Usuário",
    userAvatar: r.user_avatar ?? null,
    replyCount: Number(r.reply_count ?? 0),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapPlaylist(r: any): EcclesiaPlaylist {
  return {
    id: r.id, channelId: r.channel_id, organizationId: r.organization_id,
    title: r.title, description: r.description ?? null,
    thumbnailUrl: r.thumbnail_url ?? null,
    visibility: r.visibility, videoCount: r.video_count ?? 0,
    createdBy: r.created_by ?? null, createdAt: r.created_at,
  };
}

// ── API: Canais ───────────────────────────────────────────────────────────────

export async function fetchEcclesiaChannels(
  organizationId: string,
): Promise<EcclesiaChannel[]> {
  const { data } = await supabase
    .from("ecclesia_channels")
    .select("*")
    .eq("organization_id", organizationId)
    .neq("status", "archived")
    .order("name");
  return (data ?? []).map(mapChannel);
}

export async function fetchEcclesiaChannelBySlug(
  organizationId: string,
  slug: string,
): Promise<EcclesiaChannel | null> {
  const { data } = await supabase
    .from("ecclesia_channels")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("slug", slug)
    .maybeSingle();
  return data ? mapChannel(data) : null;
}

export async function upsertEcclesiaChannel(
  organizationId: string,
  payload: Partial<EcclesiaChannel> & { name: string; slug: string },
  channelId?: string,
): Promise<{ ok: boolean; channel?: EcclesiaChannel; error?: string }> {
  const row = {
    organization_id: organizationId,
    name: payload.name.trim(),
    slug: payload.slug.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
    description: payload.description ?? null,
    logo_url: payload.logoUrl ?? null,
    banner_url: payload.bannerUrl ?? null,
    visibility: payload.visibility ?? "org_members",
    status: payload.status ?? "active",
  };

  const q = channelId
    ? supabase.from("ecclesia_channels").update(row).eq("id", channelId).select("*").single()
    : supabase.from("ecclesia_channels").insert(row).select("*").single();

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, channel: mapChannel(data) };
}

// ── API: Vídeos ───────────────────────────────────────────────────────────────

export async function fetchChannelVideos(
  channelId: string,
  limit = 24,
): Promise<EcclesiaVideo[]> {
  const { data } = await supabase
    .from("ecclesia_videos")
    .select("*")
    .eq("channel_id", channelId)
    .eq("status", "ready")
    .order("published_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map(mapVideo);
}

export async function fetchVideoById(videoId: string): Promise<EcclesiaVideo | null> {
  const { data } = await supabase
    .from("ecclesia_videos")
    .select("*")
    .eq("id", videoId)
    .maybeSingle();
  return data ? mapVideo(data) : null;
}

export async function fetchOrgVideos(
  organizationId: string,
  limit = 24,
): Promise<EcclesiaVideo[]> {
  const { data } = await supabase
    .from("ecclesia_videos")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "ready")
    .order("published_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map(mapVideo);
}

export async function fetchAdminVideos(channelId: string): Promise<EcclesiaVideo[]> {
  const { data } = await supabase
    .from("ecclesia_videos")
    .select("*")
    .eq("channel_id", channelId)
    .neq("status", "archived")
    .order("created_at", { ascending: false });
  return (data ?? []).map(mapVideo);
}

export async function createVideo(
  organizationId: string,
  channelId: string,
  payload: {
    title: string;
    description?: string | null;
    category?: EcclesiaVideoCategory;
    r2StorageKey: string;
    playbackUrl: string;
    durationSeconds?: number | null;
    thumbnailUrl?: string | null;
    visibility?: EcclesiaVisibility;
  },
): Promise<{ ok: boolean; videoId?: string; error?: string }> {
  const { data, error } = await supabase
    .from("ecclesia_videos")
    .insert({
      channel_id: channelId,
      organization_id: organizationId,
      title: payload.title.trim(),
      description: payload.description ?? null,
      category: payload.category ?? "general",
      r2_storage_key: payload.r2StorageKey,
      playback_url: payload.playbackUrl,
      duration_seconds: payload.durationSeconds ?? null,
      thumbnail_url: payload.thumbnailUrl ?? null,
      visibility: payload.visibility ?? "org_members",
      status: "ready",
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, videoId: data.id };
}

export async function updateVideoStatus(
  videoId: string,
  status: EcclesiaVideoStatus,
): Promise<boolean> {
  const { error } = await supabase
    .from("ecclesia_videos")
    .update({ status })
    .eq("id", videoId);
  return !error;
}

// ── API: Upload para R2 ───────────────────────────────────────────────────────

export async function uploadVideoToR2(
  file: File,
  organizationId: string,
  onProgress?: (pct: number) => void,
): Promise<{ ok: boolean; storageKey?: string; publicUrl?: string; error?: string }> {
  const path = buildR2Path(organizationId, "canal/videos", file);
  const result = await uploadToR2({
    file,
    bucket: "ecclesia-media",
    path,
    organizationId,
    onProgress,
  });
  return result;
}

// ── API: Curtidas ─────────────────────────────────────────────────────────────

export async function checkUserLiked(videoId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("ecclesia_video_likes")
    .select("id")
    .eq("video_id", videoId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

export async function toggleLike(
  videoId: string,
  isLiked: boolean,
): Promise<boolean> {
  if (isLiked) {
    const { error } = await supabase
      .from("ecclesia_video_likes")
      .delete()
      .eq("video_id", videoId)
      .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "");
    return !error;
  } else {
    const { error } = await supabase
      .from("ecclesia_video_likes")
      .insert({ video_id: videoId, user_id: (await supabase.auth.getUser()).data.user?.id ?? "" });
    return !error;
  }
}

// ── API: Comentários ──────────────────────────────────────────────────────────

export async function fetchComments(
  videoId: string,
  limit = 20,
  offset = 0,
): Promise<EcclesiaComment[]> {
  const { data, error } = await supabase.rpc("get_video_comments", {
    p_video_id: videoId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) { console.warn("[fetchComments]", error.message); return []; }
  return (data ?? []).map(mapComment);
}

export async function fetchReplies(parentCommentId: string): Promise<EcclesiaComment[]> {
  const { data } = await supabase
    .from("ecclesia_video_comments")
    .select(`id, video_id, user_id, parent_comment_id, body, is_deleted, created_at,
             profiles!ecclesia_video_comments_user_id_fkey(full_name, avatar_url)`)
    .eq("parent_comment_id", parentCommentId)
    .eq("is_deleted", false)
    .order("created_at");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, videoId: r.video_id, userId: r.user_id,
    parentCommentId: r.parent_comment_id,
    body: r.body, isDeleted: r.is_deleted ?? false,
    createdAt: r.created_at,
    userName: r.profiles?.full_name ?? "Usuário",
    userAvatar: r.profiles?.avatar_url ?? null,
    replyCount: 0,
  }));
}

export async function addComment(
  videoId: string,
  body: string,
  parentCommentId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("ecclesia_video_comments").insert({
    video_id: videoId,
    body: body.trim(),
    parent_comment_id: parentCommentId ?? null,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteComment(commentId: string): Promise<boolean> {
  const { error } = await supabase
    .from("ecclesia_video_comments")
    .update({ is_deleted: true })
    .eq("id", commentId);
  return !error;
}

// ── API: Inscrições ───────────────────────────────────────────────────────────

export async function checkSubscribed(
  channelId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("ecclesia_subscriptions")
    .select("id")
    .eq("channel_id", channelId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

export async function toggleSubscription(
  channelId: string,
  isSubscribed: boolean,
): Promise<boolean> {
  const uid = (await supabase.auth.getUser()).data.user?.id ?? "";
  if (isSubscribed) {
    const { error } = await supabase
      .from("ecclesia_subscriptions")
      .delete()
      .eq("channel_id", channelId)
      .eq("user_id", uid);
    return !error;
  } else {
    const { error } = await supabase
      .from("ecclesia_subscriptions")
      .insert({ channel_id: channelId, user_id: uid });
    return !error;
  }
}

// ── API: Histórico ────────────────────────────────────────────────────────────

export async function fetchWatchHistory(videoId: string): Promise<WatchHistory | null> {
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) return null;
  const { data } = await supabase
    .from("ecclesia_watch_history")
    .select("video_id, last_position, watched_seconds, completed")
    .eq("video_id", videoId)
    .eq("user_id", uid)
    .maybeSingle();
  if (!data) return null;
  return {
    videoId: data.video_id,
    lastPosition: data.last_position ?? 0,
    watchedSeconds: data.watched_seconds ?? 0,
    completed: data.completed ?? false,
  };
}

export async function saveWatchPosition(
  videoId: string,
  lastPosition: number,
  durationSeconds?: number | null,
): Promise<void> {
  await supabase.rpc("upsert_watch_history", {
    p_video_id: videoId,
    p_last_position: Math.floor(lastPosition),
    p_duration: durationSeconds ?? null,
  });
}

// ── API: Playlists ────────────────────────────────────────────────────────────

export async function fetchChannelPlaylists(channelId: string): Promise<EcclesiaPlaylist[]> {
  const { data } = await supabase
    .from("ecclesia_video_playlists")
    .select("*")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false });
  return (data ?? []).map(mapPlaylist);
}

export async function upsertPlaylist(
  organizationId: string,
  channelId: string,
  payload: { title: string; description?: string | null; visibility?: EcclesiaVisibility },
  playlistId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const row = {
    organization_id: organizationId,
    channel_id: channelId,
    title: payload.title.trim(),
    description: payload.description ?? null,
    visibility: payload.visibility ?? "org_members",
  };
  const q = playlistId
    ? supabase.from("ecclesia_video_playlists").update(row).eq("id", playlistId).select("id")
    : supabase.from("ecclesia_video_playlists").insert(row).select("id");
  const { error } = await q;
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function addVideoToPlaylist(
  playlistId: string,
  videoId: string,
  position: number,
): Promise<boolean> {
  const { error } = await supabase
    .from("ecclesia_playlist_items")
    .insert({ playlist_id: playlistId, video_id: videoId, position });
  return !error;
}

export async function fetchPlaylistVideos(
  playlistId: string,
): Promise<(EcclesiaPlaylistItem & { video: EcclesiaVideo })[]> {
  const { data } = await supabase
    .from("ecclesia_playlist_items")
    .select("*, ecclesia_videos(*)")
    .eq("playlist_id", playlistId)
    .order("position");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, playlistId: r.playlist_id, videoId: r.video_id,
    position: r.position,
    video: mapVideo(r.ecclesia_videos),
  }));
}

// ── API: Import TV → Canal ────────────────────────────────────────────────────

export async function importTvSessionToCanal(
  sessionId: string,
  channelId: string,
  title: string,
  category: EcclesiaVideoCategory = "culto",
  description?: string | null,
): Promise<{ ok: boolean; videoId?: string; error?: string }> {
  const { data, error } = await supabase.rpc("import_tv_session_to_canal", {
    p_session_id: sessionId,
    p_channel_id: channelId,
    p_title: title,
    p_category: category,
    p_description: description ?? null,
  });

  if (error) return { ok: false, error: error.message };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  if (!d?.ok) return { ok: false, error: d?.error ?? "Erro desconhecido." };
  return { ok: true, videoId: d.video_id };
}

// ── Utilitários ───────────────────────────────────────────────────────────────

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function slugify(text: string): string {
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days}d`;
  return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
