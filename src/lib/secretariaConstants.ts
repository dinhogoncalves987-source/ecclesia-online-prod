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
