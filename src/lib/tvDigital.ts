/**
 * Ecclesia TV Digital — Tipos, Mappers e Funções de API
 *
 * Stack: Supabase (metadados) + Cloudflare R2 (vídeos) + MediaMTX + HLS
 * Chave de stream: jamais armazenada em plaintext — apenas SHA-256 + last4.
 */

import { supabase } from "@/integrations/supabase/client";

// ── Enums / constantes ────────────────────────────────────────────────────────

export type TvChannelStatus = "active" | "inactive" | "archived";
export type TvChannelVisibility = "public" | "org_members" | "private";
export type TvStreamSourceType = "obs" | "mobile" | "computer" | "mock" | "scheduled";
export type TvStatusTransmissao = "offline" | "waiting" | "live" | "ended" | "error";
export type TvBlockType = "live" | "replay" | "program" | "interval" | "placeholder";
export type TvProgramType =
  | "culto" | "pregacao" | "louvor" | "estudo" | "infantil"
  | "jovens" | "mulheres" | "homens" | "missoes" | "intervalo"
  | "noticiario" | "general";

export const PROGRAM_TYPE_LABELS: Record<TvProgramType, string> = {
  culto: "Culto",
  pregacao: "Pregação",
  louvor: "Louvor & Adoração",
  estudo: "Estudo Bíblico",
  infantil: "Infantil",
  jovens: "Jovens",
  mulheres: "Mulheres",
  homens: "Homens",
  missoes: "Missões",
  intervalo: "Intervalo",
  noticiario: "Noticiário",
  general: "Geral",
};

export const STREAM_SOURCE_LABELS: Record<TvStreamSourceType, string> = {
  obs:       "Ecclesia Studio Kit",
  mobile:    "Celular",
  computer:  "Computador",
  mock:      "Simulação (Teste)",
  scheduled: "Automático",
};

// ── Tipos DB → UI ─────────────────────────────────────────────────────────────

export type TvChannel = {
  id: string;
  organizationId: string;
  churchId: string | null;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  visibility: TvChannelVisibility;
  status: TvChannelStatus;
  createdAt: string;
  updatedAt: string;
};

export type TvStreamKey = {
  id: string;
  organizationId: string;
  channelId: string;
  streamKeyLast4: string;
  streamKeyHash: string;
  streamSourceType: TvStreamSourceType;
  label: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
};

export type TvProgram = {
  id: string;
  organizationId: string;
  channelId: string;
  title: string;
  description: string | null;
  programType: TvProgramType;
  hostName: string | null;
  thumbnailUrl: string | null;
  defaultDurationMinutes: number;
  status: "active" | "inactive" | "archived";
  createdAt: string;
};

export type TvScheduleBlock = {
  id: string;
  organizationId: string;
  channelId: string;
  programId: string | null;
  startTime: string;
  endTime: string;
  recurrenceRule: string | null;
  blockType: TvBlockType;
  sourceVideoId: string | null;
  sourceAssetUrl: string | null;
  status: "scheduled" | "live" | "completed" | "cancelled";
  priority: number;
  createdAt: string;
  // Enriquecido
  programTitle?: string;
  programThumbnailUrl?: string;
};

export type TvLiveSession = {
  id: string;
  organizationId: string;
  channelId: string;
  scheduleBlockId: string | null;
  programId: string | null;
  streamKeyId: string | null;
  streamSourceType: TvStreamSourceType | null;
  statusTransmissao: TvStatusTransmissao;
  ingestUrl: string | null;
  playbackUrl: string | null;
  hlsUrl: string | null;
  rtmpUrl: string | null;
  startedAt: string | null;
  endedAt: string | null;
  lastHeartbeatAt: string | null;
  viewerCount: number;
  peakViewerCount: number;
  recordingStatus: "idle" | "recording" | "processing" | "completed" | "failed";
  r2StorageKey: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type TvReplay = {
  id: string;
  organizationId: string;
  channelId: string;
  liveSessionId: string | null;
  programId: string | null;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  hlsUrl: string | null;
  r2StorageKey: string | null;
  durationSeconds: number | null;
  fileSizeBytes: number | null;
  status: "processing" | "ready" | "failed" | "archived";
  recordedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
};

/** Resultado da RPC get_current_tv_block */
export type TvCurrentBlock =
  | { type: "live"; sessionId: string; hlsUrl: string | null; rtmpUrl: string | null; viewerCount: number; startedAt: string; offsetSeconds: 0 }
  | { type: "replay"; blockId: string; programId: string | null; hlsUrl: string | null; offsetSeconds: number; replayId: string; replayTitle: string; replayDuration: number | null; blockStart: string; blockEnd: string }
  | { type: "program"; blockId: string; programId: string | null; hlsUrl: string | null; offsetSeconds: number; blockStart: string; blockEnd: string }
  | { type: "interval"; blockId: string; sourceUrl: string | null; offsetSeconds: number; blockStart: string; blockEnd: string }
  | { type: "offline" };

// ── Mappers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapChannel(r: any): TvChannel {
  return {
    id: r.id, organizationId: r.organization_id, churchId: r.church_id ?? null,
    name: r.name, slug: r.slug, description: r.description ?? null,
    logoUrl: r.logo_url ?? null, coverUrl: r.cover_url ?? null,
    visibility: r.visibility, status: r.status,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapProgram(r: any): TvProgram {
  return {
    id: r.id, organizationId: r.organization_id, channelId: r.tv_channel_id,
    title: r.title, description: r.description ?? null, programType: r.program_type,
    hostName: r.host_name ?? null, thumbnailUrl: r.thumbnail_url ?? null,
    defaultDurationMinutes: r.default_duration_minutes ?? 60,
    status: r.status, createdAt: r.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapScheduleBlock(r: any): TvScheduleBlock {
  return {
    id: r.id, organizationId: r.organization_id, channelId: r.tv_channel_id,
    programId: r.program_id ?? null, startTime: r.start_time, endTime: r.end_time,
    recurrenceRule: r.recurrence_rule ?? null, blockType: r.block_type,
    sourceVideoId: r.source_video_id ?? null, sourceAssetUrl: r.source_asset_url ?? null,
    status: r.status, priority: r.priority ?? 0, createdAt: r.created_at,
    programTitle: r.program_title ?? undefined,
    programThumbnailUrl: r.thumbnail_url ?? undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapLiveSession(r: any): TvLiveSession {
  return {
    id: r.id, organizationId: r.organization_id, channelId: r.tv_channel_id,
    scheduleBlockId: r.schedule_block_id ?? null, programId: r.program_id ?? null,
    streamKeyId: r.stream_key_id ?? null, streamSourceType: r.stream_source_type ?? null,
    statusTransmissao: r.status_transmissao, ingestUrl: r.ingest_url ?? null,
    playbackUrl: r.playback_url ?? null, hlsUrl: r.hls_url ?? null,
    rtmpUrl: r.rtmp_url ?? null, startedAt: r.started_at ?? null,
    endedAt: r.ended_at ?? null, lastHeartbeatAt: r.last_heartbeat_at ?? null,
    viewerCount: r.viewer_count ?? 0, peakViewerCount: r.peak_viewer_count ?? 0,
    recordingStatus: r.recording_status ?? "idle", r2StorageKey: r.r2_storage_key ?? null,
    errorMessage: r.error_message ?? null, createdAt: r.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapReplay(r: any): TvReplay {
  return {
    id: r.id, organizationId: r.organization_id, channelId: r.tv_channel_id,
    liveSessionId: r.live_session_id ?? null, programId: r.program_id ?? null,
    title: r.title, description: r.description ?? null,
    thumbnailUrl: r.thumbnail_url ?? null, hlsUrl: r.hls_url ?? null,
    r2StorageKey: r.r2_storage_key ?? null, durationSeconds: r.duration_seconds ?? null,
    fileSizeBytes: r.file_size_bytes ?? null, status: r.status,
    recordedAt: r.recorded_at ?? null, publishedAt: r.published_at ?? null,
    createdAt: r.created_at,
  };
}

// ── API: Canais ───────────────────────────────────────────────────────────────

export async function fetchTvChannels(
  organizationId: string,
): Promise<TvChannel[]> {
  const { data, error } = await supabase
    .from("tv_channels")
    .select("*")
    .eq("organization_id", organizationId)
    .neq("status", "archived")
    .order("name");
  if (error) { console.warn("[fetchTvChannels]", error.message); return []; }
  return (data ?? []).map(mapChannel);
}

export async function fetchTvChannelBySlug(
  organizationId: string,
  slug: string,
): Promise<TvChannel | null> {
  const { data } = await supabase
    .from("tv_channels")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("slug", slug)
    .maybeSingle();
  return data ? mapChannel(data) : null;
}

export async function upsertTvChannel(
  organizationId: string,
  payload: Partial<TvChannel> & { name: string; slug: string },
  channelId?: string,
): Promise<{ ok: boolean; channel?: TvChannel; error?: string }> {
  const row = {
    organization_id: organizationId,
    name: payload.name.trim(),
    slug: payload.slug.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
    description: payload.description ?? null,
    logo_url: payload.logoUrl ?? null,
    cover_url: payload.coverUrl ?? null,
    visibility: payload.visibility ?? "org_members",
    status: payload.status ?? "active",
  };

  const query = channelId
    ? supabase.from("tv_channels").update(row).eq("id", channelId).eq("organization_id", organizationId).select("*").single()
    : supabase.from("tv_channels").insert(row).select("*").single();

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };
  return { ok: true, channel: mapChannel(data) };
}

export async function deleteTvChannel(
  organizationId: string,
  channelId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("tv_channels")
    .update({ status: "archived" })
    .eq("id", channelId)
    .eq("organization_id", organizationId);
  return !error;
}

// ── API: Stream Keys ──────────────────────────────────────────────────────────

/**
 * Gera um par (rawKey, hash).
 * rawKey é mostrado UMA ÚNICA VEZ ao admin e nunca armazenado.
 * Apenas o hash SHA-256 + os últimos 4 chars são persistidos.
 */
export async function generateStreamKey(): Promise<{ rawKey: string; hash: string; last4: string }> {
  const rawKey = `ecclesia_${crypto.randomUUID().replace(/-/g, "")}`;
  const encoded = new TextEncoder().encode(rawKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  const last4 = rawKey.slice(-4);
  return { rawKey, hash, last4 };
}

export async function createStreamKey(
  organizationId: string,
  channelId: string,
  sourceType: TvStreamSourceType,
  label: string | null,
  hash: string,
  last4: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("tv_stream_keys").insert({
    organization_id: organizationId,
    tv_channel_id: channelId,
    stream_key_hash: hash,
    stream_key_last4: last4,
    stream_source_type: sourceType,
    label,
    created_by: userId,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function fetchStreamKeys(channelId: string): Promise<TvStreamKey[]> {
  const { data, error } = await supabase
    .from("tv_stream_keys")
    .select("*")
    .eq("tv_channel_id", channelId)
    .order("created_at", { ascending: false });
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, organizationId: r.organization_id, channelId: r.tv_channel_id,
    streamKeyLast4: r.stream_key_last4, streamKeyHash: r.stream_key_hash,
    streamSourceType: r.stream_source_type, label: r.label ?? null,
    isActive: r.is_active, lastUsedAt: r.last_used_at ?? null, createdAt: r.created_at,
  }));
}

export async function revokeStreamKey(keyId: string): Promise<boolean> {
  const { error } = await supabase
    .from("tv_stream_keys")
    .update({ is_active: false })
    .eq("id", keyId);
  return !error;
}

// ── API: Programas ────────────────────────────────────────────────────────────

export async function fetchTvPrograms(channelId: string): Promise<TvProgram[]> {
  const { data, error } = await supabase
    .from("tv_programs")
    .select("*")
    .eq("tv_channel_id", channelId)
    .neq("status", "archived")
    .order("title");
  if (error) return [];
  return (data ?? []).map(mapProgram);
}

export async function upsertTvProgram(
  organizationId: string,
  channelId: string,
  payload: Partial<TvProgram> & { title: string },
  programId?: string,
): Promise<{ ok: boolean; program?: TvProgram; error?: string }> {
  const row = {
    organization_id: organizationId,
    tv_channel_id: channelId,
    title: payload.title.trim(),
    description: payload.description ?? null,
    program_type: payload.programType ?? "general",
    host_name: payload.hostName ?? null,
    thumbnail_url: payload.thumbnailUrl ?? null,
    default_duration_minutes: payload.defaultDurationMinutes ?? 60,
    status: payload.status ?? "active",
  };

  const query = programId
    ? supabase.from("tv_programs").update(row).eq("id", programId).select("*").single()
    : supabase.from("tv_programs").insert(row).select("*").single();

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };
  return { ok: true, program: mapProgram(data) };
}

// ── API: Grade de Programação ─────────────────────────────────────────────────

export async function fetchScheduleBlocks(
  channelId: string,
  fromDate?: Date,
  days = 7,
): Promise<TvScheduleBlock[]> {
  const from = (fromDate ?? new Date()).toISOString();
  const { data, error } = await supabase.rpc("get_tv_schedule", {
    p_channel_id: channelId,
    p_from: from,
    p_days: days,
  });
  if (error) {
    console.warn("[fetchScheduleBlocks]", error.message);
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.block_id, organizationId: "", channelId: r.channel_id,
    programId: r.program_id ?? null, startTime: r.start_time, endTime: r.end_time,
    recurrenceRule: null, blockType: r.block_type,
    sourceVideoId: null, sourceAssetUrl: null, status: r.status,
    priority: 0, createdAt: r.start_time,
    programTitle: r.program_title,
    programThumbnailUrl: r.thumbnail_url,
  }));
}

export async function upsertScheduleBlock(
  organizationId: string,
  channelId: string,
  payload: {
    programId?: string | null;
    startTime: string;
    endTime: string;
    blockType: TvBlockType;
    recurrenceRule?: string | null;
    sourceAssetUrl?: string | null;
    priority?: number;
  },
  blockId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const row = {
    organization_id: organizationId,
    tv_channel_id: channelId,
    program_id: payload.programId ?? null,
    start_time: payload.startTime,
    end_time: payload.endTime,
    block_type: payload.blockType,
    recurrence_rule: payload.recurrenceRule ?? null,
    source_asset_url: payload.sourceAssetUrl ?? null,
    priority: payload.priority ?? 0,
    status: "scheduled",
  };

  const query = blockId
    ? supabase.from("tv_schedule_blocks").update(row).eq("id", blockId).select("id").single()
    : supabase.from("tv_schedule_blocks").insert(row).select("id").single();

  const { error } = await query;
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ── API: Sessões ao Vivo ──────────────────────────────────────────────────────

export async function fetchLiveSession(channelId: string): Promise<TvLiveSession | null> {
  const { data } = await supabase
    .from("tv_live_sessions")
    .select("*")
    .eq("tv_channel_id", channelId)
    .eq("status_transmissao", "live")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? mapLiveSession(data) : null;
}

export async function fetchRecentSessions(
  organizationId: string,
  limit = 10,
): Promise<TvLiveSession[]> {
  const { data } = await supabase
    .from("tv_live_sessions")
    .select("*")
    .eq("organization_id", organizationId)
    .in("status_transmissao", ["live", "ended", "waiting"])
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map(mapLiveSession);
}

/** Inicia uma transmissão mock (para testes sem OBS). */
export async function startMockLiveSession(
  organizationId: string,
  channelId: string,
  hlsUrl: string,
  programId?: string | null,
): Promise<{ ok: boolean; session?: TvLiveSession; error?: string }> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("tv_live_sessions")
    .insert({
      organization_id: organizationId,
      tv_channel_id: channelId,
      program_id: programId ?? null,
      stream_source_type: "mock",
      status_transmissao: "live",
      hls_url: hlsUrl,
      playback_url: hlsUrl,
      started_at: now,
      last_heartbeat_at: now,
    })
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, session: mapLiveSession(data) };
}

export async function endLiveSession(sessionId: string): Promise<boolean> {
  const { error } = await supabase
    .from("tv_live_sessions")
    .update({
      status_transmissao: "ended",
      ended_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
  return !error;
}

// ── API: Pseudo-live ──────────────────────────────────────────────────────────

export async function getCurrentTvBlock(
  channelId: string,
  at?: Date,
): Promise<TvCurrentBlock> {
  const { data, error } = await supabase.rpc("get_current_tv_block", {
    p_channel_id: channelId,
    p_at: (at ?? new Date()).toISOString(),
  });

  if (error || !data) return { type: "offline" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;

  if (d.type === "live") {
    return {
      type: "live",
      sessionId: d.session_id,
      hlsUrl: d.hls_url ?? null,
      rtmpUrl: d.rtmp_url ?? null,
      viewerCount: d.viewer_count ?? 0,
      startedAt: d.started_at,
      offsetSeconds: 0,
    };
  }
  if (d.type === "replay") {
    return {
      type: "replay",
      blockId: d.block_id,
      programId: d.program_id ?? null,
      hlsUrl: d.hls_url ?? null,
      offsetSeconds: d.offset_seconds ?? 0,
      replayId: d.replay_id,
      replayTitle: d.replay_title,
      replayDuration: d.replay_duration ?? null,
      blockStart: d.block_start,
      blockEnd: d.block_end,
    };
  }
  if (d.type === "interval") {
    return {
      type: "interval",
      blockId: d.block_id,
      sourceUrl: d.source_url ?? null,
      offsetSeconds: d.offset_seconds ?? 0,
      blockStart: d.block_start,
      blockEnd: d.block_end,
    };
  }
  if (d.type === "program") {
    return {
      type: "program",
      blockId: d.block_id,
      programId: d.program_id ?? null,
      hlsUrl: d.hls_url ?? null,
      offsetSeconds: d.offset_seconds ?? 0,
      blockStart: d.block_start,
      blockEnd: d.block_end,
    };
  }
  return { type: "offline" };
}

// ── API: Replays ──────────────────────────────────────────────────────────────

export async function fetchReplays(channelId: string): Promise<TvReplay[]> {
  const { data } = await supabase
    .from("tv_replays")
    .select("*")
    .eq("tv_channel_id", channelId)
    .in("status", ["ready", "processing"])
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []).map(mapReplay);
}

// ── Utilitários ───────────────────────────────────────────────────────────────

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}min`;
  return `${m}min ${s.toString().padStart(2, "0")}s`;
}

export function statusBadge(status: TvStatusTransmissao): {
  label: string;
  color: string;
} {
  const map: Record<TvStatusTransmissao, { label: string; color: string }> = {
    live:    { label: "AO VIVO", color: "bg-red-600 text-white" },
    waiting: { label: "AGUARDANDO", color: "bg-yellow-500 text-black" },
    offline: { label: "OFFLINE", color: "bg-gray-600 text-white" },
    ended:   { label: "ENCERRADO", color: "bg-gray-500 text-white" },
    error:   { label: "ERRO", color: "bg-red-800 text-white" },
  };
  return map[status] ?? map.offline;
}

// ── Heartbeat: status visual ──────────────────────────────────────────────────

export type HeartbeatHealth = "ok" | "warning" | "dead" | "unknown";

export function heartbeatHealth(lastHeartbeatAt: string | null): HeartbeatHealth {
  if (!lastHeartbeatAt) return "unknown";
  const ageSec = Math.floor((Date.now() - new Date(lastHeartbeatAt).getTime()) / 1000);
  if (ageSec < 45) return "ok";
  if (ageSec < 90) return "warning";
  return "dead";
}

export function heartbeatLabel(lastHeartbeatAt: string | null): string {
  if (!lastHeartbeatAt) return "Sem heartbeat";
  const ageSec = Math.floor((Date.now() - new Date(lastHeartbeatAt).getTime()) / 1000);
  if (ageSec < 60) return `${ageSec}s atrás`;
  const m = Math.floor(ageSec / 60);
  return `${m}min atrás`;
}

// ── API: Canais + auto-publish ────────────────────────────────────────────────

export type TvChannelFull = TvChannel & {
  autoPublishToCanal: boolean;
  defaultCanalChannelId: string | null;
  maxRecordingMinutes: number;
  heartbeatIntervalSec: number;
};

function mapChannelFull(d: Record<string, unknown>): TvChannelFull {
  return {
    id:                    String(d.id),
    organizationId:        String(d.organization_id),
    churchId:              (d.church_id as string | null) ?? null,
    name:                  String(d.name),
    slug:                  String(d.slug),
    description:           (d.description as string | null) ?? null,
    logoUrl:               (d.logo_url as string | null) ?? null,
    coverUrl:              (d.cover_url as string | null) ?? null,
    visibility:            d.visibility as TvChannelFull["visibility"],
    status:                d.status as TvChannelFull["status"],
    autoPublishToCanal:    Boolean(d.auto_publish_to_canal ?? false),
    defaultCanalChannelId: (d.default_canal_channel_id as string | null) ?? null,
    maxRecordingMinutes:   Number(d.max_recording_minutes ?? 240),
    heartbeatIntervalSec:  Number(d.heartbeat_interval_sec ?? 30),
    createdAt:             String(d.created_at),
    updatedAt:             String(d.updated_at),
  };
}

export async function fetchTvChannelFull(channelId: string): Promise<TvChannelFull | null> {
  const { data } = await supabase
    .from("tv_channels")
    .select("*, auto_publish_to_canal, default_canal_channel_id, max_recording_minutes, heartbeat_interval_sec")
    .eq("id", channelId)
    .maybeSingle();
  return data ? mapChannelFull(data as Record<string, unknown>) : null;
}

export async function updateTvChannelAutoPublish(
  channelId: string,
  autoPublish: boolean,
  canalChannelId: string | null,
): Promise<boolean> {
  const { error } = await supabase
    .from("tv_channels")
    .update({
      auto_publish_to_canal:     autoPublish,
      default_canal_channel_id:  canalChannelId,
    })
    .eq("id", channelId);
  return !error;
}

// ── API: Publish TV session → Canal manually ─────────────────────────────────

export async function publishSessionToCanal(
  sessionId: string,
  canalChannelId: string,
  title: string,
  category = "culto",
): Promise<{ ok: boolean; videoId?: string; error?: string }> {
  const { data, error } = await supabase.rpc("import_tv_session_to_canal", {
    p_session_id:   sessionId,
    p_channel_id:   canalChannelId,
    p_title:        title,
    p_category:     category,
    p_description:  null,
  });
  if (error) return { ok: false, error: error.message };
  const result = data as Record<string, unknown> | null;
  if (!result?.ok) return { ok: false, error: String(result?.error ?? "Erro desconhecido") };
  return { ok: true, videoId: String(result.video_id) };
}

// ── API: Generate recurring schedule instances ────────────────────────────────

export async function generateRecurringInstances(
  blockId: string,
  weeksAhead = 4,
): Promise<{ created: number; error?: string }> {
  const { data, error } = await supabase.rpc("generate_recurring_instances", {
    p_block_id: blockId,
    p_weeks:    weeksAhead,
  });
  if (error) return { created: 0, error: error.message };
  return { created: Number(data ?? 0) };
}

// ── RRULE: Expander simples (frontend) ───────────────────────────────────────
// Suporta: FREQ=WEEKLY;BYDAY=SU,MO,...   FREQ=DAILY;INTERVAL=N

const DAY_MAP: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

export interface RruleBlock {
  id:             string;
  startTime:      string;     // ISO datetime do template
  endTime:        string;
  recurrenceRule: string;
  [key: string]:  unknown;
}

export function expandRruleBlocks<T extends RruleBlock>(
  blocks: T[],
  fromDate: Date,
  days: number,
): T[] {
  const expanded: T[] = [];
  const toDate = new Date(fromDate.getTime() + days * 86_400_000);

  for (const block of blocks) {
    if (!block.recurrenceRule) { expanded.push(block); continue; }

    const rule      = block.recurrenceRule.toUpperCase();
    const freqMatch = rule.match(/FREQ=(\w+)/);
    if (!freqMatch) { expanded.push(block); continue; }

    const freq     = freqMatch[1];
    const interval = Number(rule.match(/INTERVAL=(\d+)/)?.[1] ?? 1);
    const byday    = rule.match(/BYDAY=([A-Z,]+)/)?.[1]?.split(",").map((d) => DAY_MAP[d] ?? -1) ?? [];

    const templateStart = new Date(block.startTime);
    const templateEnd   = new Date(block.endTime);
    const duration      = templateEnd.getTime() - templateStart.getTime();
    const templateTime  = {
      h: templateStart.getHours(),
      m: templateStart.getMinutes(),
      s: templateStart.getSeconds(),
    };

    const cursor = new Date(fromDate);
    cursor.setHours(0, 0, 0, 0);
    let dayIndex = 0;

    while (cursor < toDate) {
      const dow = cursor.getDay();
      let match = false;

      if (freq === "WEEKLY" && byday.includes(dow)) match = true;
      if (freq === "DAILY"  && dayIndex % interval === 0) match = true;

      if (match) {
        const inst = new Date(cursor);
        inst.setHours(templateTime.h, templateTime.m, templateTime.s, 0);
        const instEnd = new Date(inst.getTime() + duration);

        expanded.push({
          ...block,
          id:        `${block.id}_${inst.toISOString().slice(0, 10)}`,
          startTime: inst.toISOString(),
          endTime:   instEnd.toISOString(),
          recurrenceRule: "",   // instância concreta não é recorrente
        });
      }

      cursor.setDate(cursor.getDate() + 1);
      dayIndex++;
    }
  }

  return expanded.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

// ── Recording status label ────────────────────────────────────────────────────

export type RecordingStatus = "idle" | "none" | "recording" | "processing" | "uploaded" | "failed";

export function recordingStatusBadge(status: RecordingStatus): { label: string; color: string } {
  const map: Record<RecordingStatus, { label: string; color: string }> = {
    idle:       { label: "—",            color: "bg-gray-200 text-gray-700" },
    none:       { label: "—",            color: "bg-gray-200 text-gray-700" },
    recording:  { label: "Gravando",     color: "bg-red-100 text-red-700" },
    processing: { label: "Processando",  color: "bg-yellow-100 text-yellow-700" },
    uploaded:   { label: "Pronto no R2", color: "bg-green-100 text-green-700" },
    failed:     { label: "Falhou",       color: "bg-red-200 text-red-800" },
  };
  return map[status] ?? map.idle;
}

// ════════════════════════════════════════════════════════════════════════════
// ── PRODUÇÕES AO VIVO — fluxo baseado em device_id ──────────────────────────
// ════════════════════════════════════════════════════════════════════════════

export type ProductionMode = "temple" | "external" | "podcast";

export const PRODUCTION_MODE_LABELS: Record<ProductionMode, string> = {
  temple:   "Templo",
  external: "Externo",
  podcast:  "Podcast",
};

/** Produção ao vivo retornada pela RPC list_active_productions */
export interface LiveProduction {
  liveSessionId:      string;
  channelId:          string;
  channelName:        string;
  title:              string;
  mode:               ProductionMode;
  statusTransmissao:  TvStatusTransmissao;
  directorUserId:     string | null;
  directorDeviceId:   string | null;
  directorLastSeenAt: string | null;
  cameraCount:        number;
  studioRoomId:       string | null;
  roomName:           string | null;
  startedAt:          string | null;
  createdAt:          string;
}

/** Sessão de câmera retornada pelos RPCs */
export interface ProductionCamera {
  id:               string;
  userId:           string | null;
  deviceId:         string | null;
  cameraName:       string;
  cameraNumber:     number;
  deviceType:       string;
  role:             "director" | "camera";
  status:           string;
  isOnAir:          boolean;
  sourceType:       string;
  lastHeartbeatAt:  string | null;
  connectedAt:      string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLiveProduction(r: any): LiveProduction {
  return {
    liveSessionId:      String(r.live_session_id),
    channelId:          String(r.channel_id),
    channelName:        String(r.channel_name ?? ""),
    title:              String(r.title ?? "Produção ao vivo"),
    mode:               (r.mode ?? "temple") as ProductionMode,
    statusTransmissao:  (r.status_transmissao ?? "waiting") as TvStatusTransmissao,
    directorUserId:     (r.director_user_id as string | null) ?? null,
    directorDeviceId:   (r.director_device_id as string | null) ?? null,
    directorLastSeenAt: (r.director_last_seen_at as string | null) ?? null,
    cameraCount:        Number(r.camera_count ?? 0),
    studioRoomId:       (r.studio_room_id as string | null) ?? null,
    roomName:           (r.room_name as string | null) ?? null,
    startedAt:          (r.started_at as string | null) ?? null,
    createdAt:          String(r.created_at),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProductionCamera(r: any): ProductionCamera {
  return {
    id:               String(r.id),
    userId:           (r.user_id as string | null) ?? null,
    deviceId:         (r.device_id as string | null) ?? null,
    cameraName:       String(r.camera_name ?? "Câmera"),
    cameraNumber:     Number(r.camera_number ?? 0),
    deviceType:       String(r.device_type ?? "mobile"),
    role:             (r.role ?? "camera") as "director" | "camera",
    status:           String(r.status ?? "waiting"),
    isOnAir:          Boolean(r.is_on_air),
    sourceType:       String(r.source_type ?? "logged_device"),
    lastHeartbeatAt:  (r.last_heartbeat_at as string | null) ?? null,
    connectedAt:      (r.connected_at as string | null) ?? null,
  };
}

/** Lista produções ativas da organização. */
export async function listActiveLiveProductions(
  organizationId: string,
  channelId?: string | null,
): Promise<{ ok: boolean; productions: LiveProduction[]; error?: string }> {
  const { data, error } = await supabase.rpc("list_active_productions", {
    p_org_id:     organizationId,
    p_channel_id: channelId ?? null,
  });
  if (error) {
    console.error("[listActiveLiveProductions]", error.message);
    return { ok: false, productions: [], error: error.message };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ok: true, productions: (data ?? []).map((r: any) => mapLiveProduction(r)) };
}

/** Cria uma nova produção ao vivo (sessão + sala de estúdio). */
export async function createLiveProduction(
  organizationId: string,
  payload: {
    channelId:        string;
    title:            string;
    mode:             ProductionMode;
    directorDeviceId: string;
  },
): Promise<{ ok: boolean; liveSessionId?: string; studioRoomId?: string; roomName?: string; error?: string }> {
  const { data, error } = await supabase.rpc("create_live_production", {
    p_org_id:              organizationId,
    p_channel_id:          payload.channelId,
    p_title:               payload.title.trim(),
    p_mode:                payload.mode,
    p_director_device_id:  payload.directorDeviceId,
  });
  if (error) {
    console.error("[createLiveProduction]", error.message);
    return { ok: false, error: error.message };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = (data as any[])?.[0];
  if (!row) return { ok: false, error: "Resposta inválida do servidor." };
  return {
    ok: true,
    liveSessionId: String(row.live_session_id),
    studioRoomId:  String(row.studio_room_id),
    roomName:      String(row.room_name),
  };
}

/**
 * Assume a direção de uma produção neste dispositivo.
 * p_force = true → assumir mesmo que outro dispositivo seja o diretor atual.
 */
export async function claimProductionDirector(
  liveSessionId:    string,
  directorDeviceId: string,
  force = false,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  const { data, error } = await supabase.rpc("claim_production_director", {
    p_live_session_id:    liveSessionId,
    p_director_device_id: directorDeviceId,
    p_force:              force,
  });
  if (error) {
    console.error("[claimProductionDirector]", error.message);
    return { ok: false, error: error.message };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = (data as any[])?.[0];
  if (!row?.ok) return { ok: false, message: String(row?.message ?? "") };
  return { ok: true, message: String(row.message) };
}

/** Entra na produção como câmera via live_session_id + device_id. */
export async function joinProductionAsCamera(
  liveSessionId: string,
  payload: {
    deviceId:   string;
    cameraName: string;
    deviceType: "mobile" | "desktop" | "browser";
    sourceType: "logged_device" | "external_link" | "local_demo";
  },
): Promise<{
  ok:               boolean;
  cameraSessionId?: string;
  cameraNumber?:    number;
  roomName?:        string;
  studioRoomId?:    string;
  error?:           string;
}> {
  const { data, error } = await supabase.rpc("join_production_as_camera", {
    p_live_session_id: liveSessionId,
    p_device_id:       payload.deviceId,
    p_camera_name:     payload.cameraName,
    p_device_type:     payload.deviceType,
    p_source_type:     payload.sourceType,
  });
  if (error) {
    console.error("[joinProductionAsCamera]", error.message);
    return { ok: false, error: error.message };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = (data as any[])?.[0];
  if (!row) return { ok: false, error: "Câmera não registrada." };
  return {
    ok:               true,
    cameraSessionId:  String(row.camera_session_id),
    cameraNumber:     Number(row.camera_number),
    roomName:         String(row.room_name),
    studioRoomId:     String(row.studio_room_id),
  };
}

/** Desconecta câmera de uma produção. */
export async function leaveProductionCamera(
  cameraSessionId: string,
): Promise<boolean> {
  const { error } = await supabase.rpc("disconnect_camera", {
    p_camera_session_id: cameraSessionId,
  });
  return !error;
}

/** Heartbeat do diretor. */
export async function directorHeartbeat(
  liveSessionId:    string,
  directorDeviceId: string,
): Promise<void> {
  await supabase.rpc("director_heartbeat", {
    p_live_session_id:    liveSessionId,
    p_director_device_id: directorDeviceId,
  });
}

/** Heartbeat de câmera. */
export async function cameraHeartbeat(cameraSessionId: string): Promise<void> {
  await supabase.rpc("update_camera_heartbeat", {
    p_camera_session_id: cameraSessionId,
  });
}

/** Encerra a produção ao vivo (diretor ou admin). */
export async function endLiveProduction(
  liveSessionId:    string,
  directorDeviceId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("end_live_production", {
    p_live_session_id:    liveSessionId,
    p_director_device_id: directorDeviceId,
  });
  if (error) {
    console.error("[endLiveProduction]", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: Boolean(data) };
}

/** Lista câmeras ativas de uma produção. */
export async function listProductionCameras(
  liveSessionId: string,
): Promise<ProductionCamera[]> {
  const { data, error } = await supabase
    .from("tv_camera_sessions")
    .select("*")
    .eq("live_session_id", liveSessionId)
    .eq("role", "camera")
    .not("status", "in", "(disconnected,error)")
    .order("camera_number", { ascending: true });
  if (error) { console.warn("[listProductionCameras]", error.message); return []; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => mapProductionCamera(r));
}

/** Coloca câmera no ar (corte ao vivo). */
export async function cutToProductionCamera(
  cameraSessionId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("set_camera_on_air", {
    p_camera_session_id: cameraSessionId,
  });
  if (error) { console.error("[cutToProductionCamera]", error.message); return false; }
  return Boolean(data);
}

/** Verifica se o diretor atual está online (heartbeat < 90s). */
export function isDirectorOnline(directorLastSeenAt: string | null): boolean {
  if (!directorLastSeenAt) return false;
  const ageSec = (Date.now() - new Date(directorLastSeenAt).getTime()) / 1000;
  return ageSec < 90;
}

