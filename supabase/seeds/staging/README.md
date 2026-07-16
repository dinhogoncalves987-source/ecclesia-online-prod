# `supabase/seeds/staging/` — estrutura proposta (não executada)

Este diretório é uma **proposta** de organização futura para os dados de
demonstração/seed que hoje vivem espalhados em `scripts/seed-*.mjs` e em
migrations mistas (ver `RELATORIO_CLASSIFICACAO_MIGRATIONS.md`, categorias
C e E). Nada foi movido ou executado nesta tarefa.

## Ideia geral

- `supabase/seeds/staging/*.sql` — seeds idempotentes (por `id` fixo,
  `INSERT ... ON CONFLICT DO UPDATE`), aplicáveis **somente** ao projeto
  Supabase de staging.
- Nunca aplicados via `supabase migration up` (que roda em qualquer
  ambiente) — apenas via um comando explícito e guardado (ex.: `npm run
  seeds:staging`), que reutiliza `scripts/lib/seedGuard.mjs` para recusar
  produção e exigir confirmação textual `SEED_STAGING="SEED_STAGING"`.

## Por que não mover os seeds existentes agora

Vários seeds hoje são scripts Node (`scripts/seed-*.mjs`) que já têm lógica
de diagnóstico/idempotência própria (contagem antes/depois, upsert por id
fixo, preservação de uploads). Migrar esse comportamento para SQL puro é uma
mudança de arquitetura maior do que o pedido desta tarefa ("preparar a
separação, sem aplicar"). A recomendação é:

1. Manter os scripts `seed-*.mjs` como estão (agora com guarda de ambiente
   — ver `scripts/lib/seedGuard.mjs`);
2. Quando uma migration da categoria **E** (estrutura + seed misturados) for
   promovida para produção, extrair a seção de seed correspondente para um
   arquivo novo aqui, em vez de deixá-la implícita dentro de uma migration
   de schema.

## Nenhuma ação executada

- Nenhum arquivo de dados foi criado aqui.
- Nenhuma migration foi movida.
- Nenhum seed foi executado contra staging ou produção.
