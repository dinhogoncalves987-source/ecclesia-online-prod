# Supabase de produção

Este diretório é o **workdir exclusivo da CLI para o banco de produção**.
Ele não cria um terceiro banco e não contém seeds, dados demo ou migrations
históricas do staging.

- Produção: `zsonukpxahaxffugavfu`
- Staging/teste: `qkiiwopkbcslquyfhdec` (continua no workdir raiz `supabase/`)
- Projeto não relacionado `xceleiro`: bloqueado pelos scripts do repositório

## O que este diretório contém

`supabase-production/supabase/migrations/` contém **apenas**:

1. **Baseline** — `20260715170000_production_baseline_marker.sql`. O primeiro
   arquivo deste histórico é uma migration-marcadora. A correção de segurança
   correspondente já foi executada manualmente na produção em 2026-07-15. A
   marcadora somente verifica, em modo fail-closed, que o estado esperado
   continua presente; não modifica schema nem dados de negócio.
2. **Migrations novas, posteriores ao baseline** — toda migration nova de
   produção nasce com timestamp posterior a `20260715170000` e é escrita
   diretamente para rodar em produção (nunca copiada de staging sem revisão).
3. **Migrations comuns revisadas, byte a byte idênticas às de staging** — como
   `20260716110000_reconcile_common_management_integrity.sql`. Esse tipo de
   arquivo nasce em `supabase/migrations/` (staging), é revisado
   individualmente, e só então recebe uma cópia byte a byte idêntica aqui
   (mesmo hash SHA256). Staging executa o arquivo primeiro; produção executa
   exatamente o mesmo arquivo depois.

**Este diretório nunca contém** cópias em bloco de migrations históricas de
staging só porque elas foram classificadas como `production_management` — ver
`RELATORIO_CLASSIFICACAO_MIGRATIONS.md`, seção "Correção 2026-07-16", para o
histórico dessa decisão (commit `c94024e` foi corrigido justamente por violar
esta regra).

Toda migration futura de produção deve nascer neste diretório (ou, no caso de
migrations comuns, nascer em `supabase/migrations/` e ser copiada byte a byte
depois de revisada), ser revisada individualmente e passar pelo
`scripts/supabase-guard.mjs`. Migrations do workdir raiz `supabase/` jamais são
promovidas em bloco para produção.
