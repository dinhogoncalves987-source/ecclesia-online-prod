import { environment } from "@/config/environment";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type InternalCallMode = "voice" | "video";
export type InternalCallStatus =
  | "ringing"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "ended"
  | "missed"
  | "failed";
export type InternalCallAction = "accept" | "reject" | "cancel" | "timeout" | "end" | "fail";
export type InternalCallSignalType = "offer" | "answer" | "ice";

type DbInternalCall = {
  id: string;
  organization_id: string;
  thread_id: string;
  caller_user_id: string;
  callee_user_id: string;
  mode: string;
  status: string;
  caller_name: string;
  caller_avatar_url: string | null;
  callee_name: string;
  callee_avatar_url: string | null;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  end_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type InternalCall = {
  id: string;
  organizationId: string;
  threadId: string;
  callerUserId: string;
  calleeUserId: string;
  mode: InternalCallMode;
  status: InternalCallStatus;
  callerName: string;
  callerAvatarUrl: string | null;
  calleeName: string;
  calleeAvatarUrl: string | null;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  endReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InternalCallSignal = {
  id: number;
  callId: string;
  senderUserId: string;
  recipientUserId: string;
  signalType: InternalCallSignalType;
  payload: Json;
  createdAt: string;
};

export type InternalCallIceConfiguration = {
  iceServers: RTCIceServer[];
  relayConfigured: boolean;
  relayRequired: boolean;
};

export function mapInternalCall(row: DbInternalCall): InternalCall {
  return {
    id: row.id,
    organizationId: row.organization_id,
    threadId: row.thread_id,
    callerUserId: row.caller_user_id,
    calleeUserId: row.callee_user_id,
    mode: row.mode as InternalCallMode,
    status: row.status as InternalCallStatus,
    callerName: row.caller_name,
    callerAvatarUrl: row.caller_avatar_url,
    calleeName: row.callee_name,
    calleeAvatarUrl: row.callee_avatar_url,
    startedAt: row.started_at,
    answeredAt: row.answered_at,
    endedAt: row.ended_at,
    endReason: row.end_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapInternalCallSignal(row: {
  id: number;
  call_id: string;
  sender_user_id: string;
  recipient_user_id: string;
  signal_type: string;
  payload: Json;
  created_at: string;
}): InternalCallSignal {
  return {
    id: row.id,
    callId: row.call_id,
    senderUserId: row.sender_user_id,
    recipientUserId: row.recipient_user_id,
    signalType: row.signal_type as InternalCallSignalType,
    payload: row.payload,
    createdAt: row.created_at,
  };
}

function asCall(data: Json | null): InternalCall {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("invalid_call_response");
  }
  return mapInternalCall(data as unknown as DbInternalCall);
}

export async function startInternalCall(threadId: string, mode: InternalCallMode): Promise<InternalCall> {
  const { data, error } = await supabase.rpc("start_internal_call", {
    _thread_id: threadId,
    _mode: mode,
  });
  if (error) throw error;
  return asCall(data);
}

export async function transitionInternalCall(
  callId: string,
  action: InternalCallAction,
  reason?: string,
): Promise<InternalCall> {
  const { data, error } = await supabase.rpc("transition_internal_call", {
    _call_id: callId,
    _action: action,
    _reason: reason ?? null,
  });
  if (error) throw error;
  return asCall(data);
}

export async function sendInternalCallSignal(
  callId: string,
  signalType: InternalCallSignalType,
  payload: Json,
): Promise<void> {
  const { error } = await supabase.rpc("send_internal_call_signal", {
    _call_id: callId,
    _signal_type: signalType,
    _payload: payload,
  });
  if (error) throw error;
}

export async function fetchInternalCall(callId: string): Promise<InternalCall | null> {
  const { data, error } = await supabase
    .from("internal_calls")
    .select("*")
    .eq("id", callId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapInternalCall(data as DbInternalCall) : null;
}

export async function fetchActiveInternalCall(userId: string): Promise<InternalCall | null> {
  const { data, error } = await supabase
    .from("internal_calls")
    .select("*")
    .or(`caller_user_id.eq.${userId},callee_user_id.eq.${userId}`)
    .in("status", ["ringing", "accepted"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapInternalCall(data as DbInternalCall) : null;
}

export async function fetchPendingInternalCallSignals(
  callId: string,
  recipientUserId: string,
): Promise<InternalCallSignal[]> {
  const { data, error } = await supabase
    .from("internal_call_signals")
    .select("*")
    .eq("call_id", callId)
    .eq("recipient_user_id", recipientUserId)
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => mapInternalCallSignal(row));
}

/**
 * Obtém credenciais TURN temporárias do relay próprio da Eclésia.
 * A credencial só é emitida para participante de chamada ativa. A release
 * exige relay próprio e nunca usa Google/Jitsi nem fallback silencioso.
 */
export async function fetchInternalCallIceConfiguration(
  callId: string,
): Promise<InternalCallIceConfiguration> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("authentication_required");

  const response = await fetch(`${environment.supabaseUrl}/functions/v1/get-internal-call-ice`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: environment.supabasePublishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ callId }),
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (result.error === "turn_not_configured") throw new Error("turn_not_configured");
    if (result.error === "active_call_not_found") throw new Error("active_call_not_found");
    throw new Error("turn_credentials_unavailable");
  }

  const result = await response.json().catch(() => ({})) as {
    iceServers?: RTCIceServer[];
    relayConfigured?: boolean;
    relayRequired?: boolean;
  };
  if (!Array.isArray(result.iceServers) || result.iceServers.length === 0) {
    throw new Error("turn_not_configured");
  }
  return {
    iceServers: result.iceServers,
    relayConfigured: result.relayConfigured === true,
    relayRequired: result.relayRequired !== false,
  };
}
