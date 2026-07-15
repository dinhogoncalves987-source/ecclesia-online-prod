# Relatório de Classificação — `supabase/migrations`

> Preparado como parte da Fase 6 (separação de ambientes). **Nenhuma migration
> foi editada, renomeada, movida ou aplicada** — este documento é somente
> leitura/planejamento, para revisão do Alfred/Codex antes de qualquer ação.

## Metodologia

Cada um dos 64 arquivos em `supabase/migrations/` foi classificado por nome +
inspeção do cabeçalho/comentários (e, nos casos ambíguos, uma leitura direta
das primeiras linhas do SQL). Categorias usadas:

- **A — Estrutura comum promovível**: DDL/RLS que serve produção e staging
  igualmente (tabelas, colunas, índices, funções, policies). Sem dados.
- **B — Correção comum promovível**: `ALTER`/`FIX`/hardening sobre estrutura
  já existente, sem inserir dados fixos de demonstração.
- **C — Seed/demo exclusivo de staging**: insere dados fixos de demonstração
  (organizações "AD Caxias", membros demo, campanhas demo, etc.). **Nunca**
  deve ser aplicado em produção.
- **D — Histórica/legada**: schema inicial (bootstrap do projeto) ou migration
  já superada por hardening posterior. Mantida no histórico, sem ação.
- **E — Precisa de revisão manual**: mistura estrutura/correção **e** seed no
  mesmo arquivo (confirmado por inspeção direta) — precisa ser dividida em
  "estrutura" + "seed" antes de qualquer promoção para produção.

Nenhuma migration desta lista foi alterada nesta execução.

## D — Histórica / legada (bootstrap inicial do projeto)

Migrations com sufixo UUID (geradas pela ferramenta original do projeto),
todas de 2026-03-27 a 2026-03-31 — schema fundacional, já aplicado
historicamente em ambos os bancos.

| Arquivo |
|---|
| `20260327175647_89b1a640-6c69-4554-b63c-aa799b86f33c.sql` |
| `20260327181456_f439fac6-ad8c-4835-990b-3e590d1f3a16.sql` |
| `20260327190519_7edefc4c-edb9-4ccc-b65b-5e6dd635cf07.sql` |
| `20260330180906_be3ab419-5cbc-4987-ae25-bb342f2a0242.sql` |
| `20260330235123_9edf7cd9-6782-4d72-80ac-784502c6dba5.sql` |
| `20260331011501_759b7b4a-22e7-46b5-a294-219cdcee209f.sql` |
| `20260331011516_7b14270a-386d-479c-be9e-9e5f34f51abc.sql` |
| `20260331030846_2ba0af0c-4e17-453b-a36e-48ccbc159875.sql` |
| `20260331031747_ffe79f77-39d3-48a6-8650-cbb447262b12.sql` |
| `20260331032742_95362c7f-1e6e-4b62-9117-4391e81cda7e.sql` |
| `20260331033247_920816ea-3460-4201-9bd0-0d09797ac150.sql` |
| `20260331033558_cfa3e0a6-c9da-4ea3-bb10-ea3ccbda332c.sql` |
| `20260331034316_7d6f60c8-4fd7-40ca-a622-02dc9d8428a1.sql` |
| `20260331051703_5c9d5cfc-1d4e-4cf1-baf3-fe50f4edd7cb.sql` |

Também histórica: `20260709190000_finalize_member_invite_activation.sql` —
criou a RPC `finalize_member_invite_activation` usada pela Edge Function
`activate-member-invite`, que foi identificada como vulnerabilidade P0
(account takeover) e **neutralizada** nesta revisão. A RPC foi revogada/
removida "indo para a frente" por `20260715120000_harden_remove_finalize_
member_invite_activation.sql` (nova migration, não uma edição da antiga).
**Não foi editada nem renomeada** — permanece intacta no histórico, conforme
regra de segurança.

## A — Estrutura comum promovível

Tabelas/colunas/RLS/funções sem dados fixos — seguras para promover a
produção quando a feature correspondente for liberada (ou já promovíveis
porque a feature já está na allowlist de produção).

| Arquivo | Módulo relacionado |
|---|---|
| `20260512090000_staging_core_baseline.sql` | base comum |
| `20260512100000_staging_treasury_mvp.sql` | Financeiro — Tesouraria (produção) |
| `20260513120000_staging_org_invite_link.sql` | Convite de acesso (produção) |
| `20260519140000_staging_documents_table.sql` | Documentos (produção) |
| `20260519150000_staging_schedules_table.sql` | Escalas (produção) |
| `20260519160000_staging_secretaria_core_tables.sql` | Secretaria/Membros (produção) |
| `20260526100000_staging_worship_tables.sql` | Culto & Louvor (staging-only — estrutura inofensiva de manter, feature desativada por módulo) |
| `20260527100000_assemblies_rls_platform_admin.sql` | Assembleia Geral (produção) |
| `20260527200000_assemblies_storage_rls.sql` | Assembleia Geral (produção) |
| `20260608160000_staging_campaigns_crud_fields.sql` | Campanhas (staging-only — estrutura inofensiva de manter) |
| `20260609100000_staging_internal_messages.sql` | Chat/Cockpit (produção) — confirmado sem seed embutido |
| `20260611120000_chat_campaign_single_thread.sql` | Chat/Cockpit (produção) |
| `20260616100000_administrative_requests.sql` | Solicitações administrativas (produção) |
| `20260617120000_members_extended_fields.sql` | Membros (produção) |
| `20260617140000_member_invites.sql` | Convite de membro (produção, hardened) |
| `20260618120000_access_invites.sql` | Gerenciamento de acessos (produção) |
| `20260707100000_production_finance_confiadcs_extension.sql` | Financeiro — CONFIADCS (produção, já nomeada "production") |
| `20260707200000_organizations_institutional_fields.sql` | Configuração institucional (produção) |
| `20260708_member_validation_tokens.sql` | Convite de membro (produção, hardened) |
| `20260615120000_staging_recommendation_letters.sql` | Cartas de Recomendação (staging-only por ora — não está na allowlist urgente de produção) |
| `20260615130000_recommendation_letters_public_token.sql` | idem acima |
| `20260608130000_staging_campaigns_finance_integration.sql` | Campanhas (staging-only) |
| `20260608150000_staging_campaign_media_storage.sql` | Campanhas (staging-only) |

## B — Correção comum promovível

| Arquivo |
|---|
| `20260513110000_fix_finance_audit_rls.sql` |
| `20260513111500_fix_finance_delete_audit_fk.sql` |
| `20260513121000_staging_organizations_child_insert_rls.sql` |
| `20260526200000_staging_secretaria_rls.sql` |
| `20260526300000_members_block_terminal_status_delete.sql` |
| `20260527300000_prayer_requests_normalize.sql` |
| `20260612150000_profiles_rls_restrict_select.sql` |
| `20260617130000_members_status_constraint_fix.sql` |
| `20260617150000_fix_campaign_writer_rls.sql` (Campanhas é staging-only, mas a correção de RLS em si é inócua de promover) |
| `20260618130000_fix_accept_access_invite_email_check.sql` |
| `20260708_fix_member_invites_permissions.sql` |
| `20260708_fix_member_invite_accept_safety.sql` |
| `20260709_member_invite_email_binding.sql` |
| `20260715120000_harden_remove_finalize_member_invite_activation.sql` (hardening desta revisão) |

## C — Seed/demo exclusivo de staging (nunca aplicar em produção)

| Arquivo |
|---|
| `20260519200000_demo_seed.sql` |
| `20260519200001_demo_seed_orgs.sql` |
| `20260519200002_demo_seed_full.sql` |
| `20260526110000_worship_demo_seed.sql` |
| `20260526700000_documents_demo_ad_caxias_content.sql` |
| `20260526800000_organizations_demo_ad_caxias.sql` |
| `20260526900000_members_demo_ad_caxias.sql` |
| `20260608140000_staging_campaigns_extra_seed.sql` |

## E — Precisa de revisão manual (estrutura + seed no mesmo arquivo)

Confirmado por inspeção direta do SQL: estes arquivos criam
tabela/coluna/RLS **e** inserem dados fixos de demonstração no mesmo
arquivo. Antes de promover a estrutura para produção, é preciso separar o
DDL/RLS (promovível) da seção de seed (fica em staging).

| Arquivo | Observação |
|---|---|
| `20260526400000_group_members_table_rls_seed.sql` | linha 1: "tabela + RLS + seed demo pastoral"; seed a partir da linha ~101 |
| `20260526500000_group_messages_table_rls_seed.sql` | mesmo padrão do arquivo acima (Pequenos Grupos) |
| `20260526600000_schedules_normalize_assignments_seed.sql` | cabeçalho confirma "RLS e seed demo" no mesmo arquivo |
| `20260527000000_assemblies_normalize_org_rls_seed.sql` | cabeçalho confirma "RLS e seed demo AD Caxias" no mesmo arquivo |

## Estratégia de reconciliação proposta (sem aplicar nada agora)

1. **Não mover nem editar** nenhuma migration já aplicada — as categorias
   acima são só um mapa para decisões futuras.
2. Ao promover uma feature de staging para produção:
   - Copiar (nunca mover) o DDL/RLS relevante (categorias A/B) para uma nova
     migration com timestamp novo, aplicada em produção;
   - Para os arquivos da categoria **E**, extrair manualmente apenas a parte
     de estrutura/RLS para a nova migration de produção — nunca a seção de
     seed;
   - Os arquivos da categoria **C** nunca são copiados para produção.
3. Estrutura futura de seeds propria (proposta, não criada agora com dados):
   `supabase/seeds/staging/` — ver `supabase/seeds/staging/README.md`.
4. Todos os scripts `seed-*.mjs`/`demo:*` agora exigem, antes de gravar
   qualquer linha: `APP_ENV=staging`, ref de staging confirmado via URL,
   recusa explícita do ref de produção e confirmação textual
   `SEED_STAGING="SEED_STAGING"` (ver `scripts/lib/seedGuard.mjs`).

## Observação de metodologia

Dado o volume (64 arquivos), a classificação acima é baseada primariamente em
nome de arquivo + cabeçalho/comentários, com inspeção direta do SQL nos casos
ambíguos (categoria E e alguns da A/B). Antes de qualquer promoção real para
produção, recomenda-se uma segunda leitura completa do arquivo específico que
será promovido.
