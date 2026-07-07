/**
 * documentBranding.ts
 *
 * Helper para montar os dados institucionais da organização que serão
 * reutilizados em documentos, carteira de membro, cartas de recomendação,
 * relatórios financeiros e secretaria.
 *
 * Aplica fallbacks seguros: se um campo não estiver preenchido, usa o
 * próximo melhor valor em vez de retornar undefined.
 */

export interface OrganizationBranding {
  /** Nome completo oficial */
  officialName: string;
  /** Nome curto / exibição compacta */
  displayName: string;
  /** Sigla/iniciais (ex: IEADCS) */
  acronym: string;
  /** URL do logo principal */
  logoUrl: string | null;
  /** CNPJ formatado */
  cnpj: string | null;
  /** Endereço completo montado */
  address: string | null;
  /** Cidade */
  city: string | null;
  /** Estado */
  state: string | null;
  /** Telefone */
  phone: string | null;
  /** E-mail institucional */
  email: string | null;
  /** Nome do pastor presidente */
  pastorPresidentName: string | null;
  /** Texto de rodapé para documentos */
  footerText: string;
}

type OrgLike = {
  name: string;
  short_name?: string | null;
  acronym?: string | null;
  logo_url?: string | null;
  cnpj?: string | null;
  street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  phone?: string | null;
  email?: string | null;
  pastor_president_name?: string | null;
};

/** Gera sigla a partir do nome: pega a primeira letra de cada palavra relevante. */
function generateAcronym(name: string): string {
  return name
    .split(/\s+/)
    .filter(w => w.length > 2)
    .map(w => w[0].toUpperCase())
    .join("")
    .slice(0, 6);
}

/** Monta linha de endereço a partir dos campos fragmentados. */
function buildAddress(org: OrgLike): string | null {
  const parts: string[] = [];
  if (org.street) {
    let line = org.street;
    if (org.address_number) line += `, ${org.address_number}`;
    if (org.address_complement) line += ` - ${org.address_complement}`;
    parts.push(line);
  }
  if (org.neighborhood) parts.push(org.neighborhood);
  if (org.zip_code) parts.push(`CEP ${org.zip_code}`);
  return parts.length > 0 ? parts.join(" — ") : null;
}

/**
 * Retorna os dados de identidade visual/institucional prontos para uso em
 * documentos, com fallbacks seguros para todos os campos opcionais.
 */
export function getDocumentBranding(org: OrgLike): OrganizationBranding {
  const officialName = org.name;
  const displayName = org.short_name || org.name;
  const acronym = org.acronym || generateAcronym(org.name);
  const address = buildAddress(org);
  const cityState = [org.city, org.state].filter(Boolean).join(" - ");

  const footerParts: string[] = [officialName];
  if (org.cnpj) footerParts.push(`CNPJ: ${org.cnpj}`);
  if (cityState) footerParts.push(cityState);
  if (org.phone) footerParts.push(`Tel: ${org.phone}`);

  return {
    officialName,
    displayName,
    acronym,
    logoUrl: org.logo_url ?? null,
    cnpj: org.cnpj ?? null,
    address,
    city: org.city ?? null,
    state: org.state ?? null,
    phone: org.phone ?? null,
    email: org.email ?? null,
    pastorPresidentName: org.pastor_president_name ?? null,
    footerText: footerParts.join(" | "),
  };
}
