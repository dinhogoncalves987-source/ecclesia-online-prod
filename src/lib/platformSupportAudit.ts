/**
 * platformSupportAudit.ts
 *
 * Helper para registrar eventos de auditoria da plataforma de suporte.
 * Auditoria é append-only — nunca editar ou deletar registros.
 */

import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "support_context_selected"
  | "support_context_cleared"
  | "support_module_accessed"
  | "support_access_denied"
  | "support_ticket_created"
  | "support_ticket_assigned"
  | "support_ticket_accepted"
  | "support_ticket_transferred"
  | "support_ticket_escalated"
  | "support_ticket_resolved"
  | "support_ticket_closed"
  | "platform_access_updated"
  | "support_presence_changed";

interface AuditPayload {
  action: AuditAction;
  actorUserId: string;
  actorPlatformRole?: string | null;
  targetOrganizationId?: string | null;
  ticketId?: string | null;
  moduleKey?: string | null;
  entityTable?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Registra um evento de auditoria da plataforma.
 * Fire-and-forget — não lança exceção para não interromper fluxo.
 */
export async function logSupportAudit(payload: AuditPayload): Promise<void> {
  try {
    await supabase.from("platform_support_audit_logs").insert({
      actor_user_id:          payload.actorUserId,
      actor_platform_role:    payload.actorPlatformRole ?? null,
      target_organization_id: payload.targetOrganizationId ?? null,
      ticket_id:              payload.ticketId ?? null,
      module_key:             payload.moduleKey ?? null,
      action:                 payload.action,
      entity_table:           payload.entityTable ?? null,
      entity_id:              payload.entityId ?? null,
      metadata:               payload.metadata ?? null,
    });
  } catch {
    // Auditoria não deve quebrar o fluxo principal
  }
}
