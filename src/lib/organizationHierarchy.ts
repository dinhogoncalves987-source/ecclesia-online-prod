/**
 * organizationHierarchy.ts — helper central de hierarquia organizacional.
 *
 * Plataforma multi-cliente, multi-raiz, internacional.
 * Centraliza toda a lógica de:
 *   - tipos canônicos e mapeamento de legados;
 *   - predicados de nível hierárquico;
 *   - tipos de filhos válidos por pai e modelo;
 *   - labels padrão e dinâmicos por configuração;
 *   - botões e títulos de criação estrutural.
 *
 * Objetivo: eliminar if (organization_type === "...") espalhados nos arquivos.
 * Sempre consultar este helper em vez de comparar strings de tipo diretamente.
 *
 * MODELOS / PERFIS DE HIERARQUIA (hierarchy_model):
 *   ad_brasil_national     — Nacional → Estadual → Matriz → Setor → Congregação
 *   international_flexible — Internacional → qualquer nível abaixo
 *   single_church          — Igreja única, sem filhos estruturais
 *   church_with_campuses   — Sede/Matriz → Campus/Congregação (sem setor)
 *   custom                 — personalizado, regras globais seguras
 */

import type { Church } from "@/hooks/useChurchContext";

// ── Tipos canônicos ──────────────────────────────────────────────────────────

export type OrgType =
  | "international_convention" // Internacional (Restauração Internacional, missões globais)
  | "national_convention"      // Sede Nacional (CGADB e equivalentes)
  | "state_convention"         // Convenção Estadual (CIEPADERGS, CIADESC, etc.)
  | "convencao"                // LEGADO — tratar como state_convention na lógica
  | "matriz"                   // Matriz Municipal / Campo / Ministério
  | "sede"                     // Sede / Igreja Central
  | "setor"                    // Setor / Distrito / Região / Área / Campo
  | "subsede"                  // Subsede — unidade intermediária entre distrito e congregação
  | "congregacao";             // Congregação / Campus / Igreja local / Filial

/** Modelos de hierarquia por cliente/organização. */
export type HierarchyModel =
  | "ad_brasil_national"
  | "international_flexible"
  | "single_church"
  | "church_with_campuses"
  | "custom";

/** Lista canônica ordenada do mais amplo ao mais local. */
export const CANONICAL_ORG_TYPES: OrgType[] = [
  "international_convention",
  "national_convention",
  "state_convention",
  "convencao",
  "matriz",
  "sede",
  "setor",
  "subsede",
  "congregacao",
];

// ── Mapeamento de tipos legados / alternativos ───────────────────────────────

const LEGACY_MAP: Record<string, OrgType> = {
  international_convention: "international_convention",
  national_convention:      "national_convention",
  state_convention:         "state_convention",
  convencao:                "state_convention",
  matriz:                   "matriz",
  sede:                     "sede",
  // EN legados tolerados em filtros antigos
  church:                   "matriz",
  setor:                    "setor",
  district:                 "setor",
  subsede:                  "subsede",
  sub_sede:                 "subsede",
  congregacao:              "congregacao",
  congregation:             "congregacao",
  campus:                   "congregacao",
  filial:                   "congregacao",
};

/**
 * Normaliza um tipo de organização para o canônico correspondente.
 * Retorna null se o tipo não for reconhecido.
 * Prefira checar null antes de usar o resultado.
 */
export function normalizeOrganizationType(
  type: string | null | undefined,
): OrgType | null {
  if (!type) return null;
  const lower = type.toLowerCase().trim();
  return LEGACY_MAP[lower] ?? null;
}

/**
 * Retorna o tipo canônico, com fallback para "congregacao" se desconhecido.
 * Use quando um tipo não-nulo é necessário e o fallback "congregacao" é seguro.
 */
export function getCanonicalType(type: string | null | undefined): OrgType {
  return normalizeOrganizationType(type) ?? "congregacao";
}

// ── Predicados de nível ──────────────────────────────────────────────────────

export function isInternationalLevel(type: string | null | undefined): boolean {
  return type === "international_convention";
}

export function isNationalLevel(type: string | null | undefined): boolean {
  return type === "national_convention";
}

export function isStateLevel(type: string | null | undefined): boolean {
  const t = normalizeOrganizationType(type);
  return t === "state_convention";
}

/**
 * true para qualquer nível de convenção/agrupamento supramunicipal:
 * international_convention, national_convention, state_convention, convencao.
 */
export function isConventionLevel(type: string | null | undefined): boolean {
  const t = normalizeOrganizationType(type);
  return (
    t === "international_convention" ||
    t === "national_convention" ||
    t === "state_convention"
  );
}

/** true para matriz e sede. */
export function isMatrizLevel(type: string | null | undefined): boolean {
  return type === "matriz" || type === "sede";
}

/** true para setor (e equivalentes). */
export function isIntermediateLevel(type: string | null | undefined): boolean {
  const t = normalizeOrganizationType(type);
  return t === "setor";
}

/** true para subsede (unidade entre distrito e congregação). */
export function isSubsedeLevel(type: string | null | undefined): boolean {
  const t = normalizeOrganizationType(type);
  return t === "subsede";
}

/** true para congregacao (e equivalentes locais). */
export function isLocalUnitLevel(type: string | null | undefined): boolean {
  const t = normalizeOrganizationType(type);
  return t === "congregacao";
}

/**
 * true se este tipo PODE ter filhos estruturais.
 * congregacao não pode ter filhos.
 * null/desconhecido → false (seguro).
 */
export function canHaveStructuralChildren(
  type: string | null | undefined,
): boolean {
  const t = normalizeOrganizationType(type);
  return t !== null && t !== "congregacao";
}
/**
 * true se a organização opera no modelo single_church.
 * Igreja simples não cria filhos estruturais, apenas usa módulos operacionais.
 */
export function isSingleChurchModel(church: Church | null): boolean {
  return church?.hierarchy_model === "single_church";
}

// ── Tipos de filhos esperados ────────────────────────────────────────────────

/**
 * Tipos de filhos aceitos para um dado tipo de pai.
 * Usado para validação frontend (espelhando a função SQL).
 */
export function getExpectedChildTypes(
  parentType: string | null | undefined,
): OrgType[] {
  const t = normalizeOrganizationType(parentType);
  switch (t) {
    case "international_convention":
      return ["national_convention", "state_convention", "convencao", "matriz", "sede"];
    case "national_convention":
      return ["state_convention", "convencao", "matriz", "sede"];
    case "state_convention":
      return ["matriz", "sede"];
    case "matriz":
    case "sede":
      return ["setor", "congregacao"];
    case "setor":
      return ["subsede", "congregacao"];
    case "subsede":
      return ["congregacao"];
    default:
      return [];
  }
}

/**
 * Tipo canônico do filho PRIMÁRIO para inserção.
 * Leva em conta o hierarchy_model para decisões de pular nível.
 *
 * Retorna null se o tipo pai não suportar filhos (congregacao, single_church, desconhecido).
 * Os consumidores devem verificar null antes de prosseguir.
 */
export function getInsertChildType(
  parentType: string | null | undefined,
  useIntermediateLevel = true,
  hierarchyModel?: string | null,
): OrgType | null {
  const t = normalizeOrganizationType(parentType);

  switch (t) {
    case "international_convention":
      // international_flexible pode criar national ou matriz diretamente
      if (hierarchyModel === "international_flexible") return "matriz";
      return "national_convention";

    case "national_convention":
      // ad_brasil_national: cria estadual primeiro
      if (hierarchyModel === "ad_brasil_national") return "state_convention";
      // outros: pode criar matriz diretamente
      return "state_convention";

    case "state_convention":
      return "matriz";

    case "matriz":
    case "sede":
      if (hierarchyModel === "church_with_campuses") return "congregacao";
      return useIntermediateLevel ? "setor" : "congregacao";

    case "setor":
      // Dois filhos válidos: subsede e congregacao.
      // A interface deve oferecer duas ações separadas (Nova Subsede / Nova
      // Congregação), não escolher um tipo automaticamente.
      return null;

    case "subsede":
      return "congregacao";

    case "congregacao":
    case null:
      // Seguro: congregacao e tipos desconhecidos não criam filhos estruturais
      return null;

    default:
      return null;
  }
}

/** Valida se uma hierarquia parent→child é permitida (mirror da função SQL). */
export function isValidHierarchy(
  parentType: string | null | undefined,
  childType: string,
): boolean {
  const childCanonical = normalizeOrganizationType(childType);
  if (!childCanonical) return false;
  return getExpectedChildTypes(parentType).includes(childCanonical);
}

// ── Labels padrão ────────────────────────────────────────────────────────────

const DEFAULT_LABELS: Record<OrgType, { singular: string; plural: string }> = {
  international_convention: { singular: "Organização Internacional", plural: "Organizações Internacionais" },
  national_convention:      { singular: "Sede Nacional",             plural: "Sedes Nacionais" },
  state_convention:         { singular: "Convenção Estadual",        plural: "Convenções Estaduais" },
  convencao:                { singular: "Convenção",                 plural: "Convenções" },
  matriz:                   { singular: "Matriz Municipal",          plural: "Matrizes Municipais" },
  sede:                     { singular: "Sede",                      plural: "Sedes" },
  setor:                    { singular: "Distrito",                  plural: "Distritos" },
  subsede:                  { singular: "Subsede",                   plural: "Subsedes" },
  congregacao:              { singular: "Congregação",               plural: "Congregações" },
};

export function getDefaultLabel(type: string | null | undefined): string {
  const t = normalizeOrganizationType(type) ?? "congregacao";
  return DEFAULT_LABELS[t].singular;
}

export function getDefaultPluralLabel(type: string | null | undefined): string {
  const t = normalizeOrganizationType(type) ?? "congregacao";
  return DEFAULT_LABELS[t].plural;
}

// ── Labels dinâmicos por configuração da organização ─────────────────────────

/**
 * Label do nível filho direto da organização atual, usando configuração personalizada.
 * Usa fallbacks padrão quando nenhum label personalizado está configurado.
 */
export function getChildrenLabel(
  church: Church | null,
  plural = true,
): string {
  if (!church) return plural ? "Unidades" : "Unidade";
  const t = church.organization_type;
  const model = church.hierarchy_model;

  if (t === "international_convention") {
    if (model === "international_flexible") {
      return plural ? "Campos / Países / Igrejas" : "Campo / País / Igreja";
    }
    return plural
      ? (church.top_level_label_plural ?? "Convenções / Países")
      : (church.top_level_label ?? "Convenção / País");
  }

  if (t === "national_convention") {
    return plural
      ? (church.top_level_label_plural ?? "Convenções Estaduais")
      : (church.top_level_label ?? "Convenção Estadual");
  }

  if (t === "state_convention" || t === "convencao") {
    return plural
      ? (church.municipal_level_label_plural ?? "Matrizes / Sedes")
      : (church.municipal_level_label ?? "Matriz / Sede");
  }

  if (t === "matriz" || t === "sede") {
    if (
      model === "church_with_campuses" ||
      church.uses_intermediate_level === false
    ) {
      return plural
        ? (church.local_unit_label_plural ?? "Congregações")
        : (church.local_unit_label ?? "Congregação");
    }
    return plural
      ? (church.intermediate_level_label_plural ?? "Setores")
      : (church.intermediate_level_label ?? "Setor");
  }

  if (t === "setor") {
    return plural
      ? (church.local_unit_label_plural ?? "Congregações")
      : (church.local_unit_label ?? "Congregação");
  }

  if (t === "subsede") {
    return plural
      ? (church.local_unit_label_plural ?? "Congregações")
      : (church.local_unit_label ?? "Congregação");
  }

  return plural ? "Unidades" : "Unidade";
}

/** Label do botão de criação de filho estrutural. */
export function getCreateButtonLabel(
  church: Church | null,
  customChildType?: OrgType | null,
): string {
  if (!church) return "Nova unidade";
  const t = church.organization_type;
  const model = church.hierarchy_model;

  if (isSingleChurchModel(church)) return "Nova unidade";

  if (t === "international_convention") {
    if (customChildType === "national_convention") return "Nova Convenção Nacional";
    if (customChildType === "state_convention") return "Nova Convenção Estadual";
    if (customChildType === "matriz") return "Nova Matriz / Campo";
    if (customChildType === "sede") return "Nova Sede";
    if (model === "international_flexible") return "Novo Campo / Sede";
    return "Nova Convenção Nacional";
  }

  if (t === "national_convention") {
    const singular = church.top_level_label ?? "Convenção Estadual";
    return `Nova ${singular}`;
  }

  if (t === "state_convention" || t === "convencao") {
    const singular = church.municipal_level_label ?? "Matriz / Sede";
    return `Nova ${singular}`;
  }

  if (t === "matriz" || t === "sede") {
    if (model === "church_with_campuses" || church.uses_intermediate_level === false) {
      return `Nova ${church.local_unit_label ?? "Congregação"}`;
    }
    return `Novo ${church.intermediate_level_label ?? "Setor"}`;
  }

  if (t === "setor") {
    // Dois filhos possíveis: subsede e congregacao.
    // O botão padrão usa o customChildType para decidir qual label mostrar.
    if (customChildType === "subsede") return "Nova Subsede";
    if (customChildType === "congregacao") return "Nova Congregação";
    return `Nova ${church.local_unit_label ?? "unidade"}`;
  }

  if (t === "subsede") {
    return `Nova ${church.local_unit_label ?? "Congregação"}`;
  }

  return "Nova unidade";
}

/** Título principal da página de estrutura organizacional. */
export function getStructurePageTitle(church: Church | null): string {
  if (!church) return "Estrutura";
  const t = church.organization_type;
  const model = church.hierarchy_model;

  if (t === "international_convention") return "Estrutura Internacional";
  if (t === "national_convention") return "Estrutura Nacional";

  if (t === "state_convention" || t === "convencao") {
    return church.top_level_label ?? "Estrutura Estadual";
  }

  if (t === "matriz" || t === "sede") {
    if (isSingleChurchModel(church)) return church.name;
    if (model === "church_with_campuses" || church.uses_intermediate_level === false) {
      return church.local_unit_label_plural ?? "Congregações";
    }
    return church.intermediate_level_label_plural ?? "Setores";
  }

  if (t === "setor") return church.local_unit_label_plural ?? "Distritos";
  if (t === "subsede") return church.local_unit_label_plural ?? "Congregações";
  if (t === "congregacao") return church.name;

  return "Estrutura";
}

/** Subtítulo da página de estrutura organizacional. */
export function getStructurePageSubtitle(church: Church | null): string {
  if (!church) return "";
  const t = church.organization_type;
  const model = church.hierarchy_model;

  if (t === "international_convention") {
    return "Gerencie países, campos, sedes, convenções e igrejas vinculadas a esta organização internacional.";
  }
  if (t === "national_convention") {
    return "Gerencie as convenções estaduais, matrizes, campos e igrejas vinculadas à estrutura nacional.";
  }
  if (t === "state_convention" || t === "convencao") {
    return "Gerencie matrizes, campos, ministérios, sedes e agrupamentos vinculados a esta convenção estadual.";
  }
  if (t === "matriz" || t === "sede") {
    if (isSingleChurchModel(church)) {
      return "Esta unidade opera de forma independente. Use os módulos abaixo para secretaria, financeiro e agenda.";
    }
    if (model === "church_with_campuses" || church.uses_intermediate_level === false) {
      const label = (church.local_unit_label_plural ?? "congregações").toLowerCase();
      return `Cadastre ${label} vinculadas a esta unidade.`;
    }
    const label = (church.intermediate_level_label_plural ?? "setores").toLowerCase();
    return `Cadastre ${label} vinculados a esta unidade. Unidades são permanentes; responsáveis podem mudar sem recriar a unidade.`;
  }
  if (t === "setor") {
    const label = (church.local_unit_label_plural ?? "congregações").toLowerCase();
    return `Cadastre subsedes e ${label} vinculadas a este ${(church.intermediate_level_label ?? "distrito").toLowerCase()}.`;
  }
  if (t === "subsede") {
    const label = (church.local_unit_label_plural ?? "congregações").toLowerCase();
    return `Cadastre ${label} vinculadas a esta subsede.`;
  }
  if (t === "congregacao") {
    return "Dados operacionais desta unidade local. Responsáveis, membros, financeiro e agenda estão nos módulos específicos.";
  }

  return "";
}

/** Label do item de navegação do menu lateral. */
export function getNavChildrenLabel(church: Church | null): string {
  if (!church) return "Unidades";
  const t = church.organization_type;
  const model = church.hierarchy_model;

  if (t === "international_convention") {
    if (model === "international_flexible") return "Campos / Países";
    return church.top_level_label_plural ?? "Convenções / Países";
  }
  if (t === "national_convention") {
    return church.top_level_label_plural ?? "Convenções Estaduais";
  }
  if (t === "state_convention" || t === "convencao") {
    return church.municipal_level_label_plural ?? "Matrizes / Sedes";
  }
  if (t === "matriz" || t === "sede") {
    if (isSingleChurchModel(church)) return church.municipal_level_label ?? "Minha Igreja";
    if (church.uses_local_units === false && church.uses_intermediate_level === false) {
      return church.municipal_level_label ?? "Minha unidade";
    }
    if (model === "church_with_campuses" || church.uses_intermediate_level === false) {
      return church.local_unit_label_plural ?? "Unidades locais";
    }
    return church.intermediate_level_label_plural ?? "Unidades";
  }
  if (t === "setor") return church.local_unit_label_plural ?? "Unidades locais";
  if (t === "subsede") return church.local_unit_label_plural ?? "Congregações";
  return church.local_unit_label_plural ?? "Unidades locais";
}

/** Badge de tipo de organização para exibição na UI. */
export function getTypeBadgeLabel(
  type: string | null | undefined,
  church?: Church | null,
): string {
  const t = normalizeOrganizationType(type);
  switch (t) {
    case "international_convention":
      return "Internacional";
    case "national_convention":
      return "Sede Nacional";
    case "state_convention":
      return church?.top_level_label ?? "Convenção Estadual";
    case "convencao":
      return church?.top_level_label ?? "Convenção";
    case "matriz":
      return church?.municipal_level_label ?? "Matriz Municipal";
    case "sede":
      return church?.municipal_level_label ?? "Sede";
    case "setor":
      return church?.intermediate_level_label ?? "Distrito";
    case "subsede":
      return "Subsede";
    case "congregacao":
      return church?.local_unit_label ?? "Congregação";
    default:
      return type ?? "Unidade";
  }
}
