/**
 * Ecclesia Chat — Grupos e Ministérios
 * Funções para criar, buscar e gerenciar grupos de chat e seus participantes.
 */

import { supabase } from "@/integrations/supabase/client";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type ChatGroupType = "group" | "ministry" | "leadership" | "support" | "broadcast";
export type ChatGroupRole = "owner" | "admin" | "member";

export type ChatGroup = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  groupType: ChatGroupType;
  createdBy: string | null;
  isActive: boolean;
  maxParticipants: number;
  createdAt: string;
  updatedAt: string;
  participantCount?: number;
};

export type ChatGroupParticipant = {
  id: string;
  groupId: string;
  userId: string;
  organizationId: string;
  role: ChatGroupRole;
  joinedAt: string;
  mutedUntil: string | null;
  isActive: boolean;
  displayName?: string;
  avatarUrl?: string;
};

type DbChatGroupRow = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  group_type: string;
  created_by: string | null;
  is_active: boolean;
  max_participants: number;
  created_at: string;
  updated_at: string;
};

type DbParticipantRow = {
  id: string;
  group_id: string;
  user_id: string;
  organization_id: string;
  role: string;
  joined_at: string;
  muted_until: string | null;
  is_active: boolean;
};

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapDbGroupToUi(row: DbChatGroupRow): ChatGroup {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    avatarUrl: row.avatar_url,
    groupType: row.group_type as ChatGroupType,
    createdBy: row.created_by,
    isActive: row.is_active,
    maxParticipants: row.max_participants,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDbParticipantToUi(row: DbParticipantRow): ChatGroupParticipant {
  return {
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    organizationId: row.organization_id,
    role: row.role as ChatGroupRole,
    joinedAt: row.joined_at,
    mutedUntil: row.muted_until,
    isActive: row.is_active,
  };
}

// ── Buscar grupos por organização ─────────────────────────────────────────────

export async function fetchChatGroups(
  organizationId: string,
  groupType?: ChatGroupType,
): Promise<ChatGroup[]> {
  let query = supabase
    .from("chat_groups")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name");

  if (groupType) {
    query = query.eq("group_type", groupType);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return (data as DbChatGroupRow[]).map(mapDbGroupToUi);
}

// ── Buscar grupos do usuário atual ────────────────────────────────────────────

export async function fetchUserChatGroups(
  organizationId: string,
  userId: string,
): Promise<ChatGroup[]> {
  const { data, error } = await supabase
    .from("chat_group_participants")
    .select("group_id, chat_groups(*)")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  if (error || !data) return [];

  return (data as Array<{ chat_groups: DbChatGroupRow | null }>)
    .filter((row) => row.chat_groups)
    .map((row) => mapDbGroupToUi(row.chat_groups!));
}

// ── Criar grupo ───────────────────────────────────────────────────────────────

export async function createChatGroup(
  organizationId: string,
  createdBy: string,
  name: string,
  groupType: ChatGroupType,
  description?: string,
): Promise<{ ok: boolean; group?: ChatGroup; error?: string }> {
  const { data, error } = await supabase
    .from("chat_groups")
    .insert({
      organization_id: organizationId,
      created_by: createdBy,
      name,
      group_type: groupType,
      description: description ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "create_failed" };
  }

  // Auto-adicionar o criador como owner
  await supabase.from("chat_group_participants").insert({
    group_id: (data as DbChatGroupRow).id,
    user_id: createdBy,
    organization_id: organizationId,
    role: "owner",
  });

  return { ok: true, group: mapDbGroupToUi(data as DbChatGroupRow) };
}

// ── Participantes ─────────────────────────────────────────────────────────────

export async function fetchGroupParticipants(
  groupId: string,
): Promise<ChatGroupParticipant[]> {
  const { data, error } = await supabase
    .from("chat_group_participants")
    .select("*")
    .eq("group_id", groupId)
    .eq("is_active", true);

  if (error || !data) return [];
  return (data as DbParticipantRow[]).map(mapDbParticipantToUi);
}

export async function addGroupParticipant(
  groupId: string,
  userId: string,
  organizationId: string,
  role: ChatGroupRole = "member",
): Promise<boolean> {
  const { error } = await supabase.from("chat_group_participants").upsert(
    { group_id: groupId, user_id: userId, organization_id: organizationId, role, is_active: true },
    { onConflict: "group_id,user_id" },
  );
  return !error;
}

export async function removeGroupParticipant(
  groupId: string,
  userId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("chat_group_participants")
    .update({ is_active: false })
    .eq("group_id", groupId)
    .eq("user_id", userId);
  return !error;
}
