# Pacote SQL Consolidado — Ecclesia Online Staging

## Objetivo

Aplicar com segurança todas as migrations pendentes do projeto no ambiente de staging do Supabase,  
sem risco de erro por duplicidade, sem destruir dados existentes e sem depender do Supabase CLI.

---

## Ordem de Execução

Execute os arquivos **nesta ordem exata** no **SQL Editor do Supabase Dashboard**:

| # | Arquivo | Finalidade |
|---|---------|------------|
| 1 | `00_check_staging_schema_before.sql` | Fotografa o estado atual — **não altera nada** |
| 2 | `01_apply_staging_schema_package.sql` | Aplica todas as mudanças de schema (idempotente) |
| 3 | `02_validate_staging_schema_after.sql` | Confirma que tudo foi aplicado corretamente |

> **Regra**: leia o output de cada passo antes de avançar para o próximo.

---

## Migrations Consolidadas

O arquivo `01_apply_staging_schema_package.sql` consolida as 10 migrations abaixo em ordem cronológica:

| Seção | Migration original | Conteúdo |
|-------|-------------------|----------|
| §1 | `20260617120000_members_extended_fields.sql` | 20 colunas estendidas em `members` + bucket `avatars` |
| §2 | `20260617130000_members_status_constraint_fix.sql` | Correção do CHECK constraint `members_status_check` |
| §3 | `20260617140000_member_invites.sql` | Tabela `member_invites`, RLS e funções de convite de membro |
| §4 | `20260617150000_fix_campaign_writer_rls.sql` | Funções RLS de campanhas (restringe a pastor/secretary) |
| §5 | `20260618120000_access_invites.sql` | Tabela `access_invites`, RLS e funções de convite de acesso |
| §6 | `20260618130000_fix_accept_access_invite_email_check.sql` | `accept_access_invite` com validação de e-mail |
| §7 | `20260622120000_members_civil_ecclesiastical.sql` | 9 colunas civil/eclesiásticas em `members` |
| §8 | `20260622140000_organizations_hierarchical_read_rls.sql` | RLS hierárquico em `organizations` via CTE recursiva |
| §9 | `20260623120000_organizations_unit_status.sql` | Coluna `unit_status` em `organizations` |
| §10 | `20260623150000_organizations_structural_config.sql` | 14 colunas multi-denominacionais em `organizations` |

---

## Idempotência — O que foi protegido

Todos os comandos do pacote são seguros para re-execução:

| Padrão usado | Onde |
|---|---|
| `ADD COLUMN IF NOT EXISTS` | Todas as colunas novas |
| `CREATE TABLE IF NOT EXISTS` | `member_invites`, `access_invites` |
| `CREATE INDEX IF NOT EXISTS` | Todos os indexes |
| `CREATE OR REPLACE FUNCTION` | Todas as funções SQL/PL/pgSQL |
| `DROP POLICY IF EXISTS` + `CREATE POLICY` | Todas as policies |
| `INSERT ... ON CONFLICT DO NOTHING` | Bucket `avatars` |
| `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL` | Constraint `members_status_check` |
| `DO $$ ... IF NOT EXISTS` | Policies de storage |

---

## Bug Identificado na Migration Original

A migration `20260617140000_member_invites.sql` continha um `RAISE NOTICE` **fora de um bloco DO**,
o que causaria erro de sintaxe no PostgreSQL se executada diretamente:

```sql
-- ❌ INVÁLIDO em SQL puro:
RAISE NOTICE 'member_invites: tabela e funções criadas ✓';

-- ✅ CORRETO (como está no pacote consolidado):
DO $$ BEGIN RAISE NOTICE 'member_invites: tabela e funções criadas ✓'; END $$;
```

Este bug foi **corrigido silenciosamente** no arquivo `01_apply_staging_schema_package.sql`.

---

## Migrations Potencialmente Já Aplicadas

De acordo com o histórico do projeto, estas duas migrations podem ter sido aplicadas manualmente antes:

- `20260622120000_members_civil_ecclesiastical.sql` — campos civil/eclesiásticos
- `20260622140000_organizations_hierarchical_read_rls.sql` — RLS hierárquico

**Não há risco** em rodar o pacote mesmo que essas migrations já existam.  
O arquivo `00_check_staging_schema_before.sql` indicará exatamente o que já está presente.

---

## Riscos Conhecidos

| Risco | Mitigação |
|---|---|
| `organizations admins insert children` exige que `public.is_valid_organization_hierarchy` exista | Esta função deve estar no schema base. O `00_check` mostrará erro se estiver ausente. |
| Policies de storage no `schema storage` requerem permissão de super admin no Supabase | Executar como `postgres` no SQL Editor (padrão do Dashboard). |
| Constraint `members_status_check` usa `DROP CONSTRAINT IF EXISTS` antes de recriar | Breve janela sem constraint (~ms). Seguro em staging. |

---

## O que Observar no Output

### `00_check_staging_schema_before.sql`
- Preste atenção nos `RAISE NOTICE` com "AUSENTE" — essas são as lacunas que o pacote vai preencher.
- Se todos os 10 itens já estiverem presentes, o `01_apply` pode ser pulado (mas é seguro rodar mesmo assim).

### `01_apply_staging_schema_package.sql`
- Cada `§N ... ✓` no output confirma uma seção aplicada.
- Qualquer `ERROR` interrompe a execução. Copie o erro e investigue.
- A mensagem final deve ser: `=== PACOTE STAGING APLICADO COM SUCESSO ===`

### `02_validate_staging_schema_after.sql`
- Cada linha deve começar com `[OK]`.
- Qualquer `[FALHA]` levanta `EXCEPTION` — indica que algo não foi aplicado.
- A última mensagem deve ser: `VALIDAÇÃO CONCLUÍDA — schema staging OK ✓`

---

## O que NÃO foi feito

- Nenhum `DROP TABLE`
- Nenhum `TRUNCATE`
- Nenhum `DELETE` em massa
- Nenhuma remoção de coluna
- Nenhuma alteração de dado existente
- Nenhum commit no repositório
- Nenhum deploy realizado
- Nenhum arquivo do app foi alterado

---

## Próximos Passos (após aplicação bem-sucedida)

1. Executar o seed de staging para popular dados de teste.
2. Testar o fluxo de convite de membro via WhatsApp.
3. Validar visibilidade hierárquica (Matriz enxerga Setores e Congregações).
4. Configurar os campos `denomination_type`, `hierarchy_model` e labels via SQL para o cenário de teste desejado.
5. Fazer commit das migrations e do pacote manual quando o staging estiver aprovado.

---

*Pacote gerado em 2026-06-23 — Ecclesia Online vNext*
