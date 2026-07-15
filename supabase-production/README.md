# Supabase de produção

Este diretório é o **workdir exclusivo da CLI para o banco de produção**.
Ele não cria um terceiro banco e não contém seeds, dados demo ou migrations
históricas do staging.

- Produção: `zsonukpxahaxffugavfu`
- Staging/teste: `qkiiwopkbcslquyfhdec` (continua no workdir raiz `supabase/`)
- Projeto não relacionado `xceleiro`: bloqueado pelos scripts do repositório

O primeiro arquivo deste histórico é uma migration-marcadora. A correção de
segurança correspondente já foi executada manualmente na produção em
2026-07-15. A marcadora somente verifica, em modo fail-closed, que o estado
esperado continua presente; não modifica schema nem dados de negócio.

Toda migration futura de produção deve nascer neste diretório, ser revisada
individualmente e passar pelo `scripts/supabase-guard.mjs`. Migrations do
workdir raiz `supabase/` jamais são promovidas em bloco para produção.
