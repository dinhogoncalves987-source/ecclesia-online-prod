# Contrato de Performance — Ecclesia Online

> Este documento registra o contrato de desempenho definido na **OPERAÇÃO
> PERFORMANCE SUPREMA** (staging, `review/gestao-homologacao-20260728`) e a
> arquitetura adotada para a tela Membros como referência para todas as
> telas futuras. Nenhuma alteração de produção foi feita ao produzir este
> documento.

## 1. Por que este contrato existe

A tela Membros baixava **todos** os membros da organização para o navegador
(loop `while (true)` client-side, `select("*")`, 1.000 registros por
requisição) e só depois fatiava 100 por página no React. Numa organização
real de staging com **7.121 membros**, isso significava:

- 8 requisições sequenciais só para abrir a tela;
- ~7.121 linhas completas transferidas para exibir 100;
- contadores do cabeçalho ("0 cadastrados · 0 ativos · 0 visitantes") **falsos**
  durante todo o carregamento, porque eram calculados no cliente a partir do
  array ainda incompleto;
- um spinner de duração inaceitável e, em conexões mais lentas, uma tela
  aparentando estar quebrada.

Essa arquitetura não escala para clientes com milhares de igrejas e
potencialmente milhões de membros. Este contrato existe para que nenhuma
tela nova (ou tela antiga sendo alterada) reintroduza esse padrão.

## 2. Metas de tempo (SLO)

| Métrica | Meta |
|---|---|
| Resposta visual ao clique (feedback de que algo está acontecendo) | até 100 ms |
| Navegação com dados em cache (voltar a uma tela já visitada) | até 300 ms |
| Primeiros dados úteis (primeira página/linha real na tela) | ≤ 1 s (ideal) |
| Primeira abertura em condição normal de rede | ≤ 2 s (máximo) |
| Consultas comuns ao banco (uma página, um filtro, uma contagem) | ≤ 300 ms (ideal) |

## 3. Regras obrigatórias (não negociáveis)

1. **Nenhuma listagem baixa uma tabela inteira.** Toda tela de lista pagina
   no servidor (`.range()` ou keyset), nunca no cliente sobre um array já
   completo.
2. **Nenhuma tela mostra zero falso.** Contadores/estatísticas que ainda não
   têm resposta do servidor mostram `"—"`/skeleton — nunca `0`, que o usuário
   interpretaria como "não há nada".
3. **Nenhum spinner indefinido.** Toda consulta tem tratamento de erro e um
   caminho de saída (mensagem + botão "Tentar novamente").
4. **Nenhuma consulta N+1.** Uma tela não dispara uma consulta por item de
   uma lista já carregada; usa `IN (...)`, uma RPC agregadora, ou uma junção
   controlada.
5. **Nenhum recarregamento integral por Realtime.** Uma mudança pontual
   invalida/atualiza a página afetada, nunca força um novo fetch-all.
6. **O shell do aplicativo (menu, cabeçalho) permanece montado** durante a
   navegação entre módulos — só o conteúdo da rota troca.
7. **Voltar a uma tela exibe o cache anterior imediatamente** e revalida em
   segundo plano (nunca um novo spinner de página inteira para dados já
   vistos há pouco).
8. **O Service Worker nunca retém uma versão antiga indefinidamente** — toda
   release precisa ser detectável e aplicável sem o usuário precisar limpar
   cache manualmente.

## 4. Padrão de paginação (referência: tela Membros)

- **Tamanho de página:** 100 registros por requisição
  (`MEMBERS_VIEW_PAGE_SIZE` em `src/pages/Membros.tsx`).
- **Estratégia escolhida: OFFSET (`range()` do PostgREST), não keyset.**
  Decisão registrada tecnicamente (também comentada na própria migration
  `supabase/migrations/20260808170000_members_server_side_listing_performance.sql`):
  a UI atual só avança/recua uma página por vez (não existe "pular para a
  página N"), o que mantém o OFFSET raso na prática mesmo em bases grandes;
  manter OFFSET evitou reescrever a navegação "Anterior/Próxima" sob prazo
  apertado. Os índices da migration garantem que tanto o `range()` quanto o
  `COUNT(*)` filtrado usem index scan em vez de sequential scan.
- **Quando migrar para keyset:** se uma organização individual crescer a
  ponto de o usuário navegar dezenas de páginas adiante rotineiramente (o
  custo do OFFSET cresce com a posição), migrar para
  `WHERE (full_name, id) > (cursor_name, cursor_id) ORDER BY full_name, id`.
  Isso exigirá trocar "Anterior/Próxima por número de página" por
  "Anterior/Próxima por cursor" na UI — mudança de contrato de navegação,
  não apenas de índice.
- Toda página só seleciona as colunas necessárias para a linha da lista
  (`MEMBER_LIST_COLUMNS`); a ficha completa (`select("*")`) só é buscada sob
  demanda, quando o registro é aberto (edição, carteira).

## 5. Padrão de contadores

- Contadores (total, por status, etc.) vêm de uma **RPC agregadora
  independente** (`public.member_status_counts`, `GROUP BY` no servidor),
  nunca de `array.length`/`array.reduce` sobre a página carregada.
- A lista é renderizada **sem esperar** os contadores (chamadas paralelas,
  não sequenciais).
- Enquanto os contadores carregam, o estado é `null` na UI, renderizado como
  `"—"` — nunca `0` antes de o servidor confirmar `0`.
- RPCs de contagem usam `SECURITY INVOKER` sempre que viável (herdam RLS da
  tabela de origem automaticamente, sem checagem manual de permissão nem
  risco de enumeração entre organizações). Quando `SECURITY DEFINER` for
  indispensável em uma futura RPC, ela deve: fixar `search_path`, validar
  `auth.uid()`/organização ativa, limitar aos descendentes autorizados,
  revogar `PUBLIC` e conceder apenas ao papel correto.

## 6. Padrão de busca

- Busca textual usa uma única coluna gerada (`GENERATED ALWAYS AS ... STORED`)
  concatenando os campos pesquisáveis (nome, apelido, código, CPF, telefone,
  WhatsApp, função, cargo, e-mail), normalizada em minúsculas, indexada com
  `pg_trgm`/GIN (`idx_members_search_trgm`) para permitir `ILIKE '%termo%'`
  eficiente mesmo em buscas parciais/no meio da string.
- Uma coluna/índice gerado por tela, em vez de um índice trigram por campo
  pesquisado — reduz o custo de escrita (`INSERT`/`UPDATE`) por linha.
- Busca no campo de texto tem **debounce de 300 ms** antes de disparar a
  consulta ao servidor.
- Toda requisição de busca/filtro/página **cancela a anterior ainda em voo**
  (`AbortController` + `abortSignal`), para que uma resposta antiga nunca
  sobrescreva uma mais nova.

## 7. Padrão de hierarquia / multi-tenancy

- Toda consulta de listagem e de contagem é filtrada por
  `organization_id = <organização atual>` no servidor — nunca confiar no
  frontend para isolar dados entre organizações.
- Escopo hierárquico (subsede → congregações filhas; setor/congregação
  específicos) é resolvido com, no máximo, os IDs já carregados da árvore
  organizacional local (nunca uma lista de milhares de IDs montada no
  cliente, nunca todas as organizações da conta para decidir o escopo).
- RLS permanece a defesa de isolamento real: mesmo que uma consulta tivesse
  um bug de escopo, a política `is_org_user`/equivalente impede o retorno de
  linhas de outra organização.

## 8. Padrão de cache/prefetch no cliente

- Cache local por chave `organização|escopo|filtro|busca|página`, com TTL de
  60 s (`CACHE_TTL_MS`).
- Ao entrar numa tela/página já em cache: exibe os dados em cache
  **imediatamente** (nenhum spinner, nenhum zero falso) e, se o cache tiver
  mais de 60 s, revalida **silenciosamente** em segundo plano
  (`{ silent: true }`), sem esconder os dados já exibidos nem mostrar um
  novo spinner de página inteira.
- Prefetch: ao carregar uma página em primeiro plano, a próxima página é
  buscada silenciosamente em segundo plano (nunca encadeando um prefetch a
  partir de outro prefetch, para não varrer todas as páginas restantes de
  uma só vez).
- Qualquer escrita (criar/editar/excluir/mudar status/importar) invalida o
  cache local e recarrega apenas a página atual + os contadores — nunca
  reintroduz um fetch-all.

## 9. Regras de Realtime

- Uma mudança pontual (ex.: um membro editado) deve invalidar/atualizar
  apenas a página/registro afetado. Nenhuma subscription pode disparar um
  recarregamento completo de uma listagem paginada a partir de um único
  evento.
- Dados sensíveis (financeiro, mensagens, documentos privados) nunca são
  colocados em cache do Service Worker; Realtime e dados autenticados
  passam sempre pela rede.

## 10. Estratégia de PWA / Service Worker

Já implementada e coberta por teste de guarda
(`src/config/pwaReleaseFreshness.test.ts`):

- `registerType: "autoUpdate"` + `skipWaiting: true` + `clientsClaim: true`
  (`vite.config.ts`) — o novo Service Worker assume o controle assim que
  instalado, sem exigir ação manual do usuário.
- `src/components/PWAUpdatePrompt.tsx` verifica atualização no registro, ao
  voltar ao primeiro plano (`visibilitychange`), ao reconectar (`online`) e
  a cada 5 minutos enquanto o app permanece aberto.
- Ao detectar troca real de controlador (`controllerchange`) — nunca na
  primeira instalação —, recarrega a página **uma única vez**
  (`reloadingRef` evita loop de reload).
- Precache restrito ao app shell (JS/CSS/HTML/ícones essenciais);
  `globIgnores` exclui explicitamente campanhas, mídia e chamadas ao
  Supabase do precache. Cache em tempo de execução (`runtimeCaching`) é
  limitado a fontes do Google, ícones e imagens de campanha — nunca dados
  autenticados, financeiros ou de mensagens.
- `src/lib/pwaMigration.ts` faz limpeza de caches antigos (`caches.delete`)
  sem nunca desregistrar o Service Worker atual, para não derrubar a sessão
  do usuário.

## 11. P0/P1/P2 — auditoria global de rotas

Classificação usada nesta operação:

- **P0** — trava, quebra, ou baixa dados sem limite (mesma severidade do bug
  original de Membros) ou representa vazamento real entre organizações.
- **P1** — atraso perceptível ou consulta claramente ineficiente em escala
  real (ex.: depender do limite implícito de ~1.000 linhas do PostgREST para
  uma tabela que plausivelmente excede isso, sem paginação visível ao
  usuário; `await` sequencial que poderia ser paralelo; N+1).
- **P2** — otimização futura, sem risco perceptível no volume de dados atual.

**P0 confirmado e corrigido nesta operação:** tela Membros
(`src/pages/Membros.tsx`) — único ponto do código com o padrão de loop
`while (true)` baixando a tabela inteira. Uma varredura por esse mesmo
padrão (`while (true)`/`while (hasMore)` seguido de acumulação em array) no
restante de `src/` não encontrou nenhuma outra ocorrência — é o único P0
dessa classe no repositório nesta data.

**P1 documentados para próxima rodada** (não alterados nesta operação, para
não introduzir refatoração de escopo amplo sob prazo apertado, conforme
proibição explícita de "não fazer refatoração massiva apenas para
padronizar estilo" e "não alterar regras de negócio sem evidência e
necessidade" — mudar essas consultas envolve lógica de saldo/relatório que
precisa de revisão do responsável antes de qualquer alteração):

- `src/pages/Financeiro.tsx` — `select("*")` sobre `transactions` filtrado
  por `organization_id`, ordenado por `date`, sem `.range()`/`.limit()`
  explícito: depende do teto implícito do PostgREST (tipicamente 1.000
  linhas). Uma organização com mais de 1.000 lançamentos ao longo dos anos
  passaria a ver uma lista/relatório truncado silenciosamente. Recomendação:
  aplicar o mesmo padrão de Membros (paginação server-side + agregações via
  RPC para totais/saldos, nunca somados no cliente sobre a lista truncada).
- Demais telas com `select("*")` sem paginação (`Documentos.tsx`,
  `Comunicacao.tsx`, `SolicitacoesAdministrativas.tsx`, `Oracoes.tsx`,
  `Grupos.tsx`, `AssembleiaGeral.tsx`, `CarteiraEcclesia.tsx`,
  `MemberProfile.tsx`, `SuperAdmin.tsx`) — mesmo risco de truncamento
  silencioso acima de ~1.000 linhas; volume atual em staging não confirma
  isso como problema real hoje, mas deve ser resolvido com o mesmo padrão
  antes que qualquer uma dessas tabelas se aproxime desse volume por
  organização.

**P2:** uso de `select("*")` em tabelas de baixo volume/poucas colunas onde
o custo é desprezível hoje (ex.: registros de configuração por organização).
Não é necessário agir agora; revisar caso a caso quando essas telas forem
tocadas por outro motivo.

## 12. Checklist obrigatório para toda tela nova (ou lista existente sendo alterada)

- [ ] A consulta principal é paginada no servidor (`.range()` ou keyset) —
      nunca um array completo fatiado no cliente.
- [ ] O tamanho de página é fixo e razoável (referência: 100).
- [ ] Filtros, busca e ordenação executam no banco, não em
      `Array.prototype.filter/sort` sobre dados já carregados.
- [ ] Contadores/totais vêm de uma consulta/RPC agregadora independente, não
      de `.length`/`.reduce` sobre a lista paginada.
- [ ] A lista renderiza sem esperar os contadores (nenhum bloqueio mútuo).
- [ ] Estado de carregamento nunca mostra `0`/vazio antes de confirmar
      "zero" no servidor.
- [ ] Erros de consulta são visíveis, com ação de "tentar novamente" —
      nunca falha silenciosa nem spinner eterno.
- [ ] Toda consulta tem escopo explícito de `organization_id` (e, quando
      aplicável, hierarquia) — nunca confia apenas no frontend.
- [ ] Requisições obsoletas são canceladas (`AbortController`) ao trocar
      filtro/página/busca rapidamente.
- [ ] Detalhes pesados (ficha completa, histórico, anexos) só são buscados
      quando o item é aberto — nunca pré-carregados na listagem.
- [ ] Apenas as colunas necessárias para a linha da lista são selecionadas.
- [ ] Qualquer subscription Realtime atualiza/invalida somente o registro
      ou página afetada.

## 13. Guardas automatizadas

- `src/config/membersServerSidePaginationGuard.test.ts` — varre o
  código-fonte de `src/pages/Membros.tsx` e falha se: o padrão de loop
  fetch-all for reintroduzido; o tamanho de página deixar de ser 100; a
  contagem deixar de vir de `count: "exact"`/RPC; a listagem voltar a usar
  `select("*")`; a busca/filtro voltarem a ser client-side; os contadores
  deixarem de iniciar em `null` (`"—"`); qualquer consulta perder o escopo
  de `organization_id`; o cancelamento de requisições obsoletas for
  removido; o debounce de busca for removido; o tratamento de erro
  (retry) for removido.
- `src/config/membersServerSideListingMigration.test.ts` — garante que a
  migration de performance (índices + RPC) permaneça aditiva, idêntica
  byte-a-byte entre staging e produção, com a RPC em `SECURITY INVOKER`,
  `search_path` fixo e sem acesso `PUBLIC`, e corretamente classificada em
  `production_management` no manifesto de migrations.
- `src/config/pwaReleaseFreshness.test.ts` (já existente) — garante que a
  estratégia de atualização do Service Worker (`autoUpdate` + reload único +
  limpeza de cache sem desregistrar o worker) não regrida.
