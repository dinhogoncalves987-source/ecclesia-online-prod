# Gestão Ecclesia — candidato de release

- Data: 2026-07-29
- Branch de preparação: `codex/gestao-release-final-20260729`
- Base revisada: `6ddb67b`
- Escopo: Gestão administrativa. TV e Canal Eclésia não fazem parte desta release.
- Regra de promoção: staging primeiro; produção somente após homologação e autorização.

## Correção de escopo — 2026-07-30

Discipulado, Teologia e Missões são módulos operacionais da gestão e não
possuíam autorização para serem removidos ou ocultados. A configuração que os
marcava como `disabled` foi corrigida:

- os três módulos voltaram ao registro habilitado comum a staging e produção;
- as rotas voltaram a carregar as páginas reais, nunca `NotFound`;
- os itens continuam posicionados depois de Financeiro e antes de Relatórios;
- as permissões por capability continuam fail-closed;
- TV Digital e Canal Eclésia permanecem fora desta release;
- um teste de regressão agora bloqueia nova remoção silenciosa desses módulos.

## Consolidação do QA

O relatório exploratório do Sonnet foi confrontado com a versão atual do
código. Parte dos sintomas havia sido observada em uma publicação anterior e já
estava corrigida na base recebida, incluindo busca e formulário de membros,
upload institucional, estrutura de assembleias e ajustes recentes de
certificado/carteira.

Os bloqueios reais que ainda permaneciam foram tratados nesta entrega:

- QR seguro da carteira abre automaticamente em tamanho legível, com animação,
  alto nível de correção e opção explícita para reabrir em tela cheia;
- certificado em rascunho pode ser excluído com autorização; certificado emitido
  continua auditável e só pode ser revogado com motivo confirmado;
- rejeição de solicitação, exclusão de oração e exclusão financeira exigem
  confirmação;
- unidade eclesiástica não desaparece fisicamente: a remoção arquiva a unidade e
  preserva seu histórico;
- formulário financeiro, CSV e importadores passaram a preservar os campos
  contábeis da Assembleia de Deus;
- importação financeira em lote passou a validar autoria, organização,
  hierarquia, referências contábeis e mês fechado no banco;
- função de importação por IA passou a exigir sessão autenticada.

## Template financeiro da Assembleia de Deus

O schema já contém os campos necessários para registro, período, datas,
documento, grupo/conta contábil, portador, centro de custo, fornecedor,
contribuinte, distrito, congregação, coletor e tesoureiro.

O template versionado contém:

- 147 contas contábeis;
- 35 tipos de documento;
- 13 contas financeiras/portadores;
- 25 grupos contábeis.

A migration desta release protege a função interna de seed contra execução pela
API e faz backfill idempotente apenas da configuração contábil para
matrizes/sedes Assembleia de Deus já existentes. Ela não cria transações nem
dados de teste.

## Validações locais

- `npx tsc --noEmit -p tsconfig.app.json`: aprovado;
- testes: 66 arquivos e 1.013 testes aprovados;
- ESLint dos arquivos alterados: aprovado;
- `git diff --check`: aprovado;
- build de staging com o project ref canônico: aprovado;
- verificação do bundle de produção: aprovada, sem módulos exclusivos de staging.

O lint global ainda acusa dívida preexistente de tipagem em
`src/pages/SuperAdmin.tsx`, `src/pages/Biblia.tsx`,
`src/integrations/lovable/index.ts` e `tailwind.config.ts`. Esses arquivos não
foram modificados por esta correção e o problema não foi ocultado com
`eslint-disable`.

## Homologação remota ainda necessária

1. Aplicar `20260803140000_gestao_release_qa_fixes.sql` no Supabase staging.
2. Publicar `ai-import` no staging.
3. Publicar esta mesma revisão no Vercel staging.
4. Reexecutar o roteiro funcional no staging, com atenção ao QR, certificados,
   hierarquia e Financeiro.
5. Somente após aprovação, promover o mesmo commit, a mesma migration e a mesma
   Edge Function para produção, sem dados criados no staging.
