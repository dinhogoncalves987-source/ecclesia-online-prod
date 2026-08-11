-- ============================================================================
-- PERFORMANCE: paginação real da tela Membros no servidor.
-- ============================================================================
-- Contexto (OPERAÇÃO PERFORMANCE SUPREMA — Ecclesia Online):
-- src/pages/Membros.tsx buscava TODOS os membros da organização (paginando em
-- lotes de 1.000 no cliente, `select("*")`) e só depois fatiava 100 por
-- página no navegador. Em uma organização com 7.121 membros isso resultava em
-- 8 requisições sequenciais e ~7.121 linhas completas transferidas para
-- exibir 100. Esta migration é 100% aditiva: cria a infraestrutura de
-- índice/RPC necessária para o frontend passar a paginar, filtrar e contar
-- no banco. Nenhuma coluna existente é alterada ou removida.
--
-- Decisão técnica sobre paginação (registrada conforme exigido):
-- optou-se por paginação OFFSET (`range()` do PostgREST) em vez de
-- cursor/keyset nesta rodada, porque a UI atual só avança/recua uma página
-- por vez (sem "pular para a página N"), o que mantém o OFFSET raso na
-- prática mesmo em bases grandes, e porque manter OFFSET evita reescrever a
-- navegação de "Anterior/Próxima" sob prazo apertado. Os índices abaixo
-- garantem que tanto o OFFSET quanto o COUNT(*) filtrado usem index scan.
-- Uma futura migração para keyset (WHERE (full_name, id) > (cursor)) fica
-- documentada em docs/PERFORMANCE_CONTRACT.md para quando a UI precisar de
-- volumes por organização muito maiores.

-- ── Busca textual: nome, apelido, código, CPF, telefone, WhatsApp, função ──
-- Substitui o filtro client-side de src/lib/memberSearch.ts (que exigia toda
-- a tabela em memória) por um único índice trigram sobre um blob textual
-- gerado automaticamamente pelo Postgres a partir dos mesmos campos já
-- pesquisados hoje. Uma única coluna/índice em vez de 8 índices trigram
-- separados reduz o custo de escrita (INSERT/UPDATE) por linha.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS search_blob text
  GENERATED ALWAYS AS (
    lower(
      coalesce(full_name, '') || ' ' ||
      coalesce(known_name, '') || ' ' ||
      coalesce(member_code, '') || ' ' ||
      coalesce(cpf, '') || ' ' ||
      coalesce(phone, '') || ' ' ||
      coalesce(whatsapp, '') || ' ' ||
      coalesce(member_role, '') || ' ' ||
      coalesce(administrative_role, '') || ' ' ||
      coalesce(email, '')
    )
  ) STORED;

COMMENT ON COLUMN public.members.search_blob IS
  'Coluna gerada (lower-case) usada exclusivamente pelo índice trigram idx_members_search_trgm para busca parcial server-side. Não editar manualmente — é recalculada automaticamente pelo Postgres a partir de full_name/known_name/member_code/cpf/phone/whatsapp/member_role/administrative_role/email.';

CREATE INDEX IF NOT EXISTS idx_members_search_trgm
  ON public.members USING gin (search_blob gin_trgm_ops);

-- ── Escopo hierárquico (setor/congregação/subsede) no servidor ────────────
-- Antes só existiam idx_members_org_status e idx_members_org_name. Filtrar
-- por congregação/setor (usado quando o usuário navega de Hierarquia →
-- Membros de uma unidade específica) fazia sequential scan.
CREATE INDEX IF NOT EXISTS idx_members_org_congregation
  ON public.members(organization_id, congregation_id);

CREATE INDEX IF NOT EXISTS idx_members_org_sector
  ON public.members(organization_id, sector_id);

-- ============================================================================
-- RPC: contadores por status, independentes da listagem paginada.
-- ============================================================================
-- SECURITY INVOKER: a função roda com o papel/JWT de quem chama, então a
-- policy "members org members read" (is_org_user) é aplicada normalmente —
-- não há elevação de privilégio nem necessidade de checagem manual de
-- permissão aqui. Se o usuário não tiver acesso à organização, o RLS
-- simplesmente não retorna linhas (nenhuma enumeração entre clientes).
--
-- Os dois parâmetros de escopo replicam exatamente as duas formas de filtro
-- hierárquico já usadas no frontend (src/pages/Membros.tsx):
--   • p_match_congregation_ids: lista fechada de congregation_id (caso
--     "subsede selecionada" — todas as congregações filhas da subsede).
--   • p_match_either_ids: um ou mais ids que podem casar tanto com
--     congregation_id quanto com sector_id (caso "setor" ou "congregação"
--     selecionados diretamente na Hierarquia).
-- Quando ambos são NULL, conta toda a organização (matriz), igual ao
-- comportamento atual sem contextFilter.
CREATE OR REPLACE FUNCTION public.member_status_counts(
  p_organization_id uuid,
  p_match_congregation_ids uuid[] DEFAULT NULL,
  p_match_either_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (status text, total bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT m.status, count(*)::bigint AS total
  FROM public.members m
  WHERE m.organization_id = p_organization_id
    AND (
      (p_match_congregation_ids IS NULL AND p_match_either_ids IS NULL)
      OR (p_match_congregation_ids IS NOT NULL AND m.congregation_id = ANY (p_match_congregation_ids))
      OR (p_match_either_ids IS NOT NULL AND (
            m.congregation_id = ANY (p_match_either_ids)
            OR m.sector_id = ANY (p_match_either_ids)
          ))
    )
  GROUP BY m.status;
$$;

COMMENT ON FUNCTION public.member_status_counts(uuid, uuid[], uuid[]) IS
  'Contadores de membros por status (Ativo/Inativo/Visitante/etc.), calculados no servidor via GROUP BY — nunca dependem do download da listagem. SECURITY INVOKER: herda RLS de public.members, sem checagem manual de permissão.';

REVOKE ALL ON FUNCTION public.member_status_counts(uuid, uuid[], uuid[]) FROM public;
REVOKE EXECUTE ON FUNCTION public.member_status_counts(uuid, uuid[], uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.member_status_counts(uuid, uuid[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.member_status_counts(uuid, uuid[], uuid[]) TO service_role;
