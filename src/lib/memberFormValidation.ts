import { validateCpf } from "@/lib/cpfValidation";

/**
 * Resultado da validação de CPF no fluxo de cadastro/edição MANUAL de membro.
 *
 * Regras de produto (Parte 1 — Fundação Cadastral do Membro):
 *  - Cadastro manual comum: CPF é OBRIGATÓRIO, deve ter dígitos verificadores
 *    válidos, e não pode duplicar outro CPF já cadastrado na mesma
 *    organização.
 *  - A exceção de CPF pendente (`cpf_pending`) é reservada para a futura
 *    importação do sistema legado e NUNCA é setada pelo formulário manual —
 *    por isso esta função não aceita nem verifica esse flag: ela sempre
 *    valida como cadastro manual comum.
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
