import { supabase } from "@/integrations/supabase/client";

export type SecretariaMember = {
  id: string;
  full_name: string;
  known_name: string | null;
  member_code: string | null;
  baptized_at: string | null;
  baptism_place: string | null;
  spouse_name: string | null;
};

export type FamilyMemberCertificateOption = {
  id: string;
  member_id: string;
  related_member_id: string | null;
  relation: string;
  full_name: string;
  birth_date: string | null;
  gender: string | null;
};

export type TransferLetter = {
  id: string;
  member_id: string;
  member_name: string;
  member_code: string | null;
  organization_id: string;
  organization_name: string;
  organization_logo_url: string | null;
  origin_church_name: string;
  origin_city: string | null;
  origin_state: string | null;
  destination_church_name: string;
  destination_type: "interna" | "externa";
  destination_city: string | null;
  destination_state: string | null;
  destination_country: string | null;
  requested_at: string;
  approved_at: string | null;
  completed_at: string | null;
  status: "solicitada" | "aprovada" | "concluida" | "rejeitada" | "cancelada";
  reason: string | null;
  cancellation_reason: string | null;
  transfer_number: string | null;
  public_token: string | null;
  issued_at: string | null;
  signer_name: string | null;
  signer_role: string | null;
  document_id: string | null;
  created_at: string;
};

export type CertificateType =
  | "apresentacao_crianca"
  | "batismo_aguas"
  | "casamento"
  | "ministerial"
  | "curso_discipulado"
  | "formacao_teologica";

export type InstitutionalCertificate = {
  id: string;
  organization_id: string;
  certificate_type: CertificateType;
  source_module: "secretaria" | "discipulado" | "teologia";
  source_enrollment_id: string | null;
  member_id: string;
  family_member_id: string | null;
  related_member_id: string | null;
  recipient_name: string;
  secondary_recipient_name: string | null;
  title: string;
  body_text: string | null;
  event_date: string;
  location: string | null;
  course_name: string | null;
  workload_hours: number | null;
  period_start: string | null;
  period_end: string | null;
  signer_name: string | null;
  signer_role: string | null;
  second_signer_name: string | null;
  second_signer_role: string | null;
  document_id: string | null;
  certificate_number: string | null;
  public_token: string | null;
  status: "rascunho" | "emitido" | "revogado";
  issued_at: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
  created_at: string;
  organization_name: string;
  organization_logo_url: string | null;
  organization_city: string | null;
  organization_state: string | null;
  organization_cnpj: string | null;
  organization_phone: string | null;
  organization_email: string | null;
};

export type AcademicCertificateCandidate = {
  source_module: "discipulado" | "teologia";
  certificate_type: "curso_discipulado" | "formacao_teologica";
  enrollment_id: string;
  member_id: string;
  recipient_name: string;
  organization_id: string;
  class_name: string;
  course_name: string;
  workload_hours: number | null;
  period_start: string | null;
  period_end: string | null;
  completed_at: string;
};

export type PublicTransferLetter = {
  id: string;
  status: "concluida" | "cancelada";
  transfer_number: string;
  issued_at: string;
  member_name: string;
  member_code: string | null;
  origin_church_name: string;
  origin_city: string | null;
  origin_state: string | null;
  destination_church_name: string;
  destination_city: string | null;
  destination_state: string | null;
  destination_country: string | null;
  requested_at: string;
  approved_at: string | null;
  completed_at: string | null;
  reason: string | null;
  cancellation_reason: string | null;
  signer_name: string | null;
  signer_role: string | null;
  organization_name: string;
  organization_logo_url: string | null;
  organization_city: string | null;
  organization_state: string | null;
};

export type PublicInstitutionalCertificate = Omit<
  InstitutionalCertificate,
  "organization_id" | "source_module" | "source_enrollment_id" | "member_id" |
  "family_member_id" | "related_member_id" | "document_id" | "public_token" |
  "created_at"
>;

type ServiceResult<T> = { data: T; error: Error | null };

function normalizeRpcError(error: { message?: string } | null): Error | null {
  return error ? new Error(error.message || "Não foi possível concluir a operação.") : null;
}

export async function searchSecretariaMembers(
  organizationId: string,
  query = "",
): Promise<ServiceResult<SecretariaMember[]>> {
  const { data, error } = await supabase.rpc("search_secretaria_members", {
    p_organization_id: organizationId,
    p_query: query || undefined,
    p_limit: 30,
  });
  return { data: (data ?? []) as SecretariaMember[], error: normalizeRpcError(error) };
}

export async function listTransferLetters(
  organizationId: string,
): Promise<ServiceResult<TransferLetter[]>> {
  const { data, error } = await supabase.rpc("list_member_transfer_letters", {
    p_organization_id: organizationId,
  });
  return { data: (data ?? []) as unknown as TransferLetter[], error: normalizeRpcError(error) };
}

export async function createTransferLetter(input: {
  memberId: string;
  destinationType: "interna" | "externa";
  destinationOrganizationId?: string;
  destinationChurchName?: string;
  destinationCity?: string;
  destinationState?: string;
  destinationCountry?: string;
  requestedAt?: string;
  reason?: string;
}): Promise<ServiceResult<string | null>> {
  const { data, error } = await supabase.rpc("create_member_transfer_letter", {
    p_member_id: input.memberId,
    p_destination_type: input.destinationType,
    p_destination_organization_id: input.destinationOrganizationId,
    p_destination_church_name: input.destinationChurchName,
    p_destination_city: input.destinationCity,
    p_destination_state: input.destinationState,
    p_destination_country: input.destinationCountry || "Brasil",
    p_requested_at: input.requestedAt,
    p_reason: input.reason,
  });
  return { data: data ?? null, error: normalizeRpcError(error) };
}

export async function setTransferStatus(
  transferId: string,
  status: "aprovada" | "rejeitada" | "cancelada",
): Promise<Error | null> {
  const { error } = await supabase.rpc("update_member_transfer_status", {
    p_transfer_id: transferId,
    p_status: status,
  });
  return normalizeRpcError(error);
}

export async function cancelTransferLetter(
  transferId: string,
  reason: string,
): Promise<Error | null> {
  const { error } = await supabase.rpc("cancel_member_transfer_letter", {
    p_transfer_id: transferId,
    p_reason: reason,
  });
  return normalizeRpcError(error);
}

export async function issueTransferLetter(
  transferId: string,
  signerName?: string,
  signerRole?: string,
): Promise<ServiceResult<string | null>> {
  const { data, error } = await supabase.rpc("issue_member_transfer_letter", {
    p_transfer_id: transferId,
    p_signer_name: signerName,
    p_signer_role: signerRole || "Pastor Presidente",
  });
  return { data: data ?? null, error: normalizeRpcError(error) };
}

export async function getPublicTransferLetter(
  token: string,
): Promise<ServiceResult<PublicTransferLetter | null>> {
  const { data, error } = await supabase.rpc("get_public_member_transfer_letter", {
    p_token: token,
  });
  return { data: (data as unknown as PublicTransferLetter) ?? null, error: normalizeRpcError(error) };
}

export async function listMemberFamily(
  memberId: string,
): Promise<ServiceResult<FamilyMemberCertificateOption[]>> {
  const { data, error } = await supabase.rpc("list_member_family_for_certificates", {
    p_member_id: memberId,
  });
  return { data: (data ?? []) as unknown as FamilyMemberCertificateOption[], error: normalizeRpcError(error) };
}

export async function listAcademicCertificateCandidates(
  organizationId: string,
): Promise<ServiceResult<AcademicCertificateCandidate[]>> {
  const { data, error } = await supabase.rpc("list_academic_certificate_candidates", {
    p_organization_id: organizationId,
  });
  return { data: (data ?? []) as unknown as AcademicCertificateCandidate[], error: normalizeRpcError(error) };
}

export async function listInstitutionalCertificates(
  organizationId: string,
): Promise<ServiceResult<InstitutionalCertificate[]>> {
  const { data, error } = await supabase.rpc("list_institutional_certificates", {
    p_organization_id: organizationId,
  });
  return { data: (data ?? []) as unknown as InstitutionalCertificate[], error: normalizeRpcError(error) };
}

export async function createInstitutionalCertificate(input: {
  organizationId: string;
  certificateType: CertificateType;
  memberId: string;
  familyMemberId?: string;
  relatedMemberId?: string;
  recipientName?: string;
  secondaryRecipientName?: string;
  eventDate?: string;
  location?: string;
  courseName?: string;
  workloadHours?: number;
  periodStart?: string;
  periodEnd?: string;
  sourceModule?: "secretaria" | "discipulado" | "teologia";
  sourceEnrollmentId?: string;
  bodyText?: string;
  signerName?: string;
  signerRole?: string;
  secondSignerName?: string;
  secondSignerRole?: string;
}): Promise<ServiceResult<string | null>> {
  const { data, error } = await supabase.rpc("create_institutional_certificate", {
    p_organization_id: input.organizationId,
    p_certificate_type: input.certificateType,
    p_member_id: input.memberId,
    p_family_member_id: input.familyMemberId,
    p_related_member_id: input.relatedMemberId,
    p_recipient_name: input.recipientName,
    p_secondary_recipient_name: input.secondaryRecipientName,
    p_event_date: input.eventDate,
    p_location: input.location,
    p_course_name: input.courseName,
    p_workload_hours: input.workloadHours,
    p_period_start: input.periodStart,
    p_period_end: input.periodEnd,
    p_source_module: input.sourceModule || "secretaria",
    p_source_enrollment_id: input.sourceEnrollmentId,
    p_body_text: input.bodyText,
    p_signer_name: input.signerName,
    p_signer_role: input.signerRole,
    p_second_signer_name: input.secondSignerName,
    p_second_signer_role: input.secondSignerRole,
  });
  return { data: data ?? null, error: normalizeRpcError(error) };
}

export async function issueInstitutionalCertificate(
  certificateId: string,
): Promise<ServiceResult<string | null>> {
  const { data, error } = await supabase.rpc("issue_institutional_certificate", {
    p_certificate_id: certificateId,
  });
  return { data: data ?? null, error: normalizeRpcError(error) };
}

export async function revokeInstitutionalCertificate(
  certificateId: string,
  reason: string,
): Promise<Error | null> {
  const { error } = await supabase.rpc("revoke_institutional_certificate", {
    p_certificate_id: certificateId,
    p_reason: reason,
  });
  return normalizeRpcError(error);
}

export async function getPublicInstitutionalCertificate(
  token: string,
): Promise<ServiceResult<PublicInstitutionalCertificate | null>> {
  const { data, error } = await supabase.rpc("get_public_institutional_certificate", {
    p_token: token,
  });
  return {
    data: (data as unknown as PublicInstitutionalCertificate) ?? null,
    error: normalizeRpcError(error),
  };
}

export const CERTIFICATE_TYPE_LABELS: Record<CertificateType, string> = {
  apresentacao_crianca: "Apresentação de Criança",
  batismo_aguas: "Batismo em Águas",
  casamento: "Casamento",
  ministerial: "Ministerial",
  curso_discipulado: "Curso e Discipulado",
  formacao_teologica: "Formação Teológica",
};
