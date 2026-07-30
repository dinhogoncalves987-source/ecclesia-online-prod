import { validateCpf } from "@/lib/cpfValidation";

/**
 * Resultado da validação de CPF no fluxo de cadastro/edição MANUAL de membro.
 *
 * Regras de produto (Parte 1 — Fundação Cadastral do Membro):
 *  - Cadastro manual comum: CPF é OBRIGATÓRIO, deve ter dígitos verificadores
 *    válidos, e não pode duplicar outro CPF já cadastrado na mesma
 *    organização.
 *  - A exceção de CPF pendente (`cpf_pending`) é reservada para registros
 *    incompletos que aguardam revisão da Secretaria e NUNCA é setada pelo
 *    formulário manual — por isso esta função sempre valida o cadastro
 *    manual comum.
 */
export type CpfCheckResult =
  | { ok: true; normalized: string }
  | { ok: false; reason: "missing" | "invalid" | "duplicate" };

/**
 * Valida o CPF informado no formulário manual de membro.
 *
 * @param rawCpf CPF digitado no formulário (formatado ou não)
 * @param existingCpfsInOrg Set de CPFs (11 dígitos, já normalizados) de
 *   outros membros da mesma organização, EXCLUINDO o próprio membro em
 *   edição (o chamador deve montar esse set já sem o registro atual)
 */
export function checkCpfForManualSave(
  rawCpf: string | null | undefined,
  existingCpfsInOrg: ReadonlySet<string>,
): CpfCheckResult {
  if (!rawCpf || !rawCpf.trim()) {
    return { ok: false, reason: "missing" };
  }

  const normalized = validateCpf(rawCpf);
  if (!normalized) {
    return { ok: false, reason: "invalid" };
  }

  if (existingCpfsInOrg.has(normalized)) {
    return { ok: false, reason: "duplicate" };
  }

  return { ok: true, normalized };
}

/** Mensagens padrão para exibir ao usuário conforme o motivo de bloqueio. */
export const CPF_CHECK_MESSAGES: Record<CpfCheckResult extends { ok: false; reason: infer R } ? R : never, string> = {
  missing: "Informe o CPF antes de salvar.",
  invalid: "CPF inválido. Verifique os dígitos digitados.",
  duplicate: "Este CPF já está cadastrado para outro membro desta igreja.",
};

export type RequiredMemberContacts = {
  phone: string | null | undefined;
  whatsapp: string | null | undefined;
  email: string | null | undefined;
};

export type MemberContactCheckResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "missing_phone"
        | "missing_whatsapp"
        | "missing_email"
        | "invalid_email";
    };

const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Valida os contatos exigidos no cadastro operacional de um membro.
 *
 * Telefone e WhatsApp são campos independentes: podem conter o mesmo número
 * ou números diferentes. A função deliberadamente não compara os dois.
 */
export function checkRequiredMemberContacts(
  contacts: RequiredMemberContacts,
): MemberContactCheckResult {
  if (!contacts.phone?.trim()) {
    return { ok: false, reason: "missing_phone" };
  }
  if (!contacts.whatsapp?.trim()) {
    return { ok: false, reason: "missing_whatsapp" };
  }

  const email = contacts.email?.trim() ?? "";
  if (!email) {
    return { ok: false, reason: "missing_email" };
  }
  if (!SIMPLE_EMAIL_PATTERN.test(email)) {
    return { ok: false, reason: "invalid_email" };
  }

  return { ok: true };
}

export const MEMBER_CONTACT_CHECK_MESSAGES: Record<
  Exclude<MemberContactCheckResult, { ok: true }>["reason"],
  string
> = {
  missing_phone: "Informe o telefone.",
  missing_whatsapp: "Informe o WhatsApp.",
  missing_email: "Informe o e-mail.",
  invalid_email: "E-mail inválido. Verifique o endereço digitado.",
};
