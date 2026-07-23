/** Status de membros suportados na Secretaria (demo pastoral). */
export const MEMBER_STATUSES = [
  "Ativo",
  "Inativo",
  "Transferido",
  "Em disciplina",
  "Afastado",
  "Falecido",
  "Visitante",
  "Congregado",
] as const;

export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/** Status que não devem ser removidos da base (apenas alteração de status). */
export const MEMBER_STATUSES_NO_DELETE: MemberStatus[] = ["Falecido", "Transferido"];

export const isMemberStatus = (value: string): value is MemberStatus =>
  (MEMBER_STATUSES as readonly string[]).includes(value);

/** Funções eclesiásticas controladas. */
export const ECCLESIASTICAL_FUNCTIONS = [
  "Membro",
  "Auxiliar",
  "Obreiro",
  "Diácono",
  "Diaconisa",
  "Presbítero",
  "Evangelista",
  "Pastor",
  "Missionário",
  "Cooperador",
] as const;

export type EcclesiasticalFunction = (typeof ECCLESIASTICAL_FUNCTIONS)[number];

/** Cargos administrativos controlados (separados da função eclesiástica). */
export const ADMINISTRATIVE_ROLES = [
  "Nenhum",
  "Secretário",
  "Tesoureiro",
  "Contador",
  "Administrador",
  "Líder de Jovens",
  "Líder Infantil",
  "Líder de Casais",
  "Líder de Louvor",
  "Líder de Pequeno Grupo",
  "Pastor Local",
  "Pastor Setorial",
  "Pastor Presidente",
] as const;

export type AdministrativeRole = (typeof ADMINISTRATIVE_ROLES)[number];

/** Opções de sexo. */
export const GENDER_OPTIONS = ["Masculino", "Feminino"] as const;

/** Opções de estado civil. */
export const MARITAL_STATUS_OPTIONS = [
  "Solteiro(a)",
  "Casado(a)",
  "Divorciado(a)",
  "Viúvo(a)",
  "Separado(a)",
  "União Estável",
] as const;

/** Status de documentação civil. */
export const CIVIL_DOCUMENT_STATUS_OPTIONS = [
  "Pendente",
  "Apresentado",
  "Validado",
  "Rejeitado",
] as const;

export type CivilDocumentStatus = (typeof CIVIL_DOCUMENT_STATUS_OPTIONS)[number];

/** Tipos de endereço para member_addresses. */
export const ADDRESS_TYPES = [
  "residencial",
  "comercial",
  "correspondencia",
  "anterior",
  "outro",
] as const;

export type AddressType = (typeof ADDRESS_TYPES)[number];

/** Tipos de relacionamento familiar. */
export const FAMILY_RELATIONS = [
  "pai",
  "mae",
  "esposo",
  "esposa",
  "filho",
  "filha",
  "enteado",
  "enteada",
  "dependente",
  "responsavel",
  "outro",
] as const;

export type FamilyRelation = (typeof FAMILY_RELATIONS)[number];

/** Relações que representam dependentes (não são membros). */
export const DEPENDENT_RELATIONS: FamilyRelation[] = ["filho", "filha", "enteado", "enteada", "dependente"];

/** Grau de instrução / escolaridade. */
export const EDUCATION_LEVELS = [
  "Não alfabetizado",
  "Fundamental incompleto",
  "Fundamental completo",
  "Médio incompleto",
  "Médio completo",
  "Superior incompleto",
  "Superior completo",
  "Pós-graduação",
  "Mestrado",
  "Doutorado",
] as const;

export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

/** Formas de admissão. */
export const ADMISSION_TYPES = [
  "Batismo",
  "Aclamação",
  "Carta de transferência",
  "Restauração",
] as const;

export type AdmissionType = (typeof ADMISSION_TYPES)[number];

/** Origens de registro legado. */
export const LEGACY_SOURCES = [
  "wintechi",
] as const;

export type LegacySource = (typeof LEGACY_SOURCES)[number];

/**
 * Retorna o documento civil exigido com base no estado civil.
 * Solteiro(a) → Certidão de nascimento
 * Casado(a)   → Certidão de casamento
 * Divorciado(a) → Certidão de divórcio
 */
export function getCivilDocLabel(maritalStatus: string): string | null {
  switch (maritalStatus) {
    case "Solteiro(a)": return "Certidão de nascimento";
    case "Casado(a)":   return "Certidão de casamento";
    case "Divorciado(a)": return "Certidão de divórcio";
    default: return null;
  }
}
