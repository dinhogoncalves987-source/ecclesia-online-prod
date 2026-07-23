/**
 * Predicado de pesquisa textual de membros — extraído de src/pages/Membros.tsx
 * para ser testável isoladamente.
 *
 * IMPORTANTE (limitação conhecida, documentada na Parte 1): esta função
 * filtra sobre a lista de membros JÁ CARREGADA no cliente (todos os membros
 * da organização, buscados uma vez via `select("*")`), e não executa uma
 * query filtrada no banco. Esse é o mesmo comportamento que já existia antes
 * da Parte 1 (apenas os campos pesquisados foram ampliados) — não é uma
 * regressão introduzida aqui, mas é um risco de escala documentado no
 * relatório final: para organizações com muitos milhares de membros, mover
 * a busca para o servidor (ILIKE/full-text no Postgres) deve ser avaliado
 * futuramente.
 */
export type SearchableMember = {
  full_name: string;
  known_name?: string | null;
  member_code?: string | null;
  legacy_code?: string | null;
  legacy_registration?: string | null;
  cpf?: string | null;
  member_role?: string | null;
  administrative_role?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
};

export function matchesMemberSearch(member: SearchableMember, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;

  return (
    member.full_name.toLowerCase().includes(q) ||
    (member.known_name || "").toLowerCase().includes(q) ||
    (member.member_code || "").toLowerCase().includes(q) ||
    (member.legacy_code || "").toLowerCase().includes(q) ||
    (member.legacy_registration || "").toLowerCase().includes(q) ||
    (member.cpf || "").includes(q) ||
    (member.member_role || "").toLowerCase().includes(q) ||
    (member.administrative_role || "").toLowerCase().includes(q) ||
    (member.email || "").toLowerCase().includes(q) ||
    (member.phone || "").includes(q) ||
    (member.whatsapp || "").includes(q)
  );
}
