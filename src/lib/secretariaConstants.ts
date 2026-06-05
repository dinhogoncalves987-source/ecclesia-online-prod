/** Status de membros suportados na Secretaria (demo pastoral). */
export const MEMBER_STATUSES = [
  "Ativo",
  "Inativo",
  "Disciplinado",
  "Transferido",
  "Falecido",
  "Visitante",
] as const;

export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/** Status que não devem ser removidos da base (apenas alteração de status). */
export const MEMBER_STATUSES_NO_DELETE: MemberStatus[] = ["Falecido", "Transferido"];

export const isMemberStatus = (value: string): value is MemberStatus =>
  (MEMBER_STATUSES as readonly string[]).includes(value);
