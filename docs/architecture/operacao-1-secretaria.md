# Operação 1 — Fundação compartilhada dos domínios + Secretaria

Documento de passagem. Ver também `docs/architecture/contrato-dominios-institucionais.md` para o
contrato entre os quatro domínios (Secretaria, Discipulado, Teologia, Missões).

## 1. Auditoria do estado anterior (resumo)

- **Pessoa/membro**: `public.members` (única tabela de pessoa). `members.user_id` já existia
  como ponte opcional para `auth.users` (índice único parcial). Endereços múltiplos
  (`member_addresses`) e família relacional (`member_family`) já existiam desde a Parte 1
  (fundação cadastral).
- **Organizações**: `public.organizations` (`parent_id` self-FK), autorização por
  `has_org_access_permission()` + `access_responsibility_definitions` +
  `organization_responsibles`, com herança via `is_organization_descendant_or_self()`.
- **Documentos**: `public.documents` (org-wide, sem `member_id`, sem confidencialidade) + bucket
  privado `member-documents` (usado hoje só pelo documento civil do membro, path
  `{organization_id}/{member_id}/civil-document.{ext}`).
- **Carteira**: `src/components/MemberWalletCard.tsx` + `src/pages/CarteiraEcclesia.tsx` — não
  alterados.
- **Cartas de Recomendação**: `public.recommendation_letters` — **achado importante**:
  `member_id` nessa tabela armazena o `auth.users.id` de quem solicitou a carta, **não**
  `members.id` (documentado na própria migration original). `member_transfers` por isso só
  referencia `recommendation_letters.id` como chave opaca, nunca cruza por `member_id`.
- **Auditoria/histórico existente**: nenhuma timeline institucional de membro existia com DDL
  real. Havia um **esboço `member_history`** apenas em `src/integrations/supabase/types.ts`
  (colunas: `id`, `member_id`, `organization_id`, `history_type`, `title`, `description`,
  `created_by`, `created_at`) **sem nenhuma migration correspondente e sem nenhum uso em
  `src/`** — tratado como inexistente e substituído por uma estrutura completa (ver seção 3).
- **Soft delete**: padrão do projeto é `is_active`/`active`/`status`, nunca `deleted_at`.
- **Permissões no frontend**: `useRole()` → `hasCapability(permission)` lendo
  `bootstrap.accessCapabilities` (RPC `get_my_access_capabilities()`), que lê
  `organization_responsibles` + `access_responsibility_definitions.permission_keys`.
- **Testes/validação**: `vitest run`, `npx tsc --noEmit`, `npx eslint .`,
  `npm run verify:production-bundle`. Migrations são testadas por leitura de arquivo (regex),
  nunca contra um banco real.

## 2. Decisões adotadas

1. **Uma timeline só**: `public.member_history`, alimentada exclusivamente pela função
   `register_member_history_event()`. Nenhuma tabela `events`/`activities` genérica com payload
   livre — cada domínio especializado (ocorrências, ordenações, transferências) tem sua própria
   tabela tipada e referencia a timeline via `source_table`/`source_id`.
2. **Confidencialidade por capability nova, não por role hardcoded**: `members.confidential`,
   concedida hoje só a `church_admin`/`responsible_pastor` (que já têm todas as permissões).
   `secretary`/`assistant_secretary`/`member_manager` continuam só com `members.read`/
   `members.write` — não veem ocorrências/eventos confidenciais.
3. **Vínculo organizacional com fonte única de verdade**: `members.organization_id`/`sector_id`/
   `congregation_id` continuam sendo "onde a pessoa está agora" (inalterado). O histórico
   (`member_organization_history`) é 100% **derivado por trigger** — sem policy de
   INSERT/UPDATE/DELETE para `authenticated` — nunca há duas fontes editáveis.
4. **Cargo/função não sobrescreve, mas também não sincroniza automaticamente**: criei
   `member_ordinations` como histórico complementar, mas **não** escrevo de volta em
   `members.member_role`/`administrative_role` a partir dele. Isso seria uma mudança de
   comportamento não solicitada — ver pendência na seção 9.
5. **Transferência não move o membro automaticamente**: `member_transfers` documenta o processo;
   a mudança real de congregação continua manual, pelo wizard existente (`Membros.tsx`), que já
   aciona o trigger de `member_organization_history` normalmente.
6. **Catálogo de cargo/função reaproveitado, não duplicado**: `member_ordinations.role_or_function`
   é texto livre no banco (sem CHECK), validado no frontend pelos mesmos catálogos
   `ECCLESIASTICAL_FUNCTIONS`/`ADMINISTRATIVE_ROLES` já usados no cadastro do membro — nenhum
   catálogo novo no banco.
7. **Origem legada pronta, importação não implementada**: todas as 5 tabelas novas têm
   `legacy_source`/`legacy_module`/`legacy_code` + índice único parcial de idempotência. A rotina
   de importação do WinTechi não foi criada — é o objeto de uma operação futura.
8. **`register_member_history_event()` funciona também sem usuário autenticado**
   (`auth.uid() IS NULL`) — necessário para a futura importação em lote via service role, sem
   precisar de uma política "authenticated pode tudo".

## 3. Estruturas criadas

### Tabelas (5 migrations, nenhuma aplicada)

| Tabela | Papel |
|---|---|
| `member_history` | Timeline institucional compartilhada (consumida por Secretaria hoje; Discipulado/Teologia/Missões no futuro) |
| `member_occurrences` | Ocorrências pastorais/administrativas, com confidencialidade |
| `member_ordinations` | Histórico temporal de ordenações/cargos/nomeações |
| `member_transfers` | Transferências recebidas/emitidas, internas ou externas |
| `member_organization_history` | Histórico derivado de vínculo organizacional (não editável por usuário) |

### Função e triggers

- `register_member_history_event()` — porta única de escrita na timeline (SECURITY DEFINER).
- `member_occurrences_register_history` (AFTER INSERT) — toda ocorrência gera evento.
- `member_ordinations_register_history_insert`/`_update` — nomeação/ordenação no INSERT,
  encerramento quando `status` vira `encerrado`.
- `member_transfers_register_history_insert`/`_update` — evento no INSERT e em toda mudança de
  `status`.
- `members_seed_history_on_insert` (AFTER INSERT em `members`) — abre vínculo organizacional
  inicial e registra `cadastro` (sempre), `batismo`/`admissao` (quando já vierem preenchidos) —
  **sem exigir nenhuma alteração no wizard atual**.
- `members_track_organization_change` (AFTER UPDATE OF organization_id/sector_id/congregation_id
  em `members`) — fecha/abre vínculo + registra evento.
- `members_track_status_change` (AFTER UPDATE OF status em `members`) — registra
  "mudança de situação".

### Capability nova

`members.confidential` em `src/lib/accessControl.ts` (`ACCESS_PERMISSION_KEYS`) + `UPDATE`
idempotente em `access_responsibility_definitions.permission_keys` para `church_admin`/
`responsible_pastor`.

### Frontend

- `src/lib/memberHistoryConstants.ts` — catálogos/rótulos (tipos de evento, ocorrência, ordenação,
  transferência, vínculo organizacional, visibilidade).
- `src/lib/memberHistory.ts` — camada de serviço tipada (`loadMemberHistory`,
  `registerHistoryEvent`, `loadMemberOccurrences`/`createMemberOccurrence`,
  `loadMemberOrdinations`/`createMemberOrdination`/`endMemberOrdination`,
  `loadMemberTransfers`/`createMemberTransfer`/`updateMemberTransferStatus`,
  `loadMemberOrganizationHistory`).
- `src/pages/MemberProfile.tsx` — 4 novas seções dentro do perfil do membro (não uma tela nova):
  **Histórico Institucional** (timeline), **Ocorrências** (lista + modal de registro, com aviso
  quando o usuário não tem `members.confidential`), **Ordenações e Funções** (lista + modal +
  ação "Encerrar"), **Transferências** (lista + modal + ações "Aprovar"/"Concluir"). Reaproveita
  `Dialog`/`Textarea`/`Badge`/`Button` já existentes; segue o mesmo padrão visual das seções já
  presentes na página (Cards com `CardHeader`/`CardTitle`).

## 4. Migrations criadas (não aplicadas)

```
supabase/migrations/20260728090000_shared_institutional_history_foundation.sql
supabase/migrations/20260728100000_member_occurrences.sql
supabase/migrations/20260728110000_member_ordinations.sql
supabase/migrations/20260728120000_member_transfers.sql
supabase/migrations/20260728130000_member_organization_history.sql
```

Espelhadas byte-a-byte (hash SHA-256 idêntico, verificado por teste automatizado) em:

```
supabase-production/supabase/migrations/20260728090000_shared_institutional_history_foundation.sql
supabase-production/supabase/migrations/20260728100000_member_occurrences.sql
supabase-production/supabase/migrations/20260728110000_member_ordinations.sql
supabase-production/supabase/migrations/20260728120000_member_transfers.sql
supabase-production/supabase/migrations/20260728130000_member_organization_history.sql
```

Classificadas em `supabase/migration-manifest.json` → `staging_feature` (mesma categoria das
demais migrations de membro da Parte 1 — ainda não promovidas a `production_management`).

**Nenhuma migration foi aplicada** — nem em staging, nem em produção. Nenhum `supabase db push`,
nenhum SQL executado contra um banco real.

## 5. Políticas RLS adicionadas

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `member_history` | `members.read` (+ `members.confidential` se confidencial) | `members.write` (+ confidential) | `members.write` | — (sem policy, trilha não apagável) |
| `member_occurrences` | `members.read` (+ confidential) | `members.write` (+ confidential) | `members.write` (+ confidential) | — |
| `member_ordinations` | `members.read` | `members.write` | `members.write` | — |
| `member_transfers` | `members.read` | `members.write` | `members.write` | — |
| `member_organization_history` | `members.read` | — (só trigger SECURITY DEFINER) | — | — |

Todas resolvem a organização efetiva via `JOIN` com `members` +
`COALESCE(congregation_id, sector_id, organization_id)` — nunca confiam apenas na coluna
`organization_id` local, e nunca usam `USING (true)`/`WITH CHECK (true)` (verificado por teste).

## 6. Permissões utilizadas

`members.read`, `members.write` (já existentes) + `members.confidential` (nova, seção 3). Nenhuma
checagem de role hardcoded foi adicionada no frontend — tudo passa por `hasCapability()`/
`has_org_access_permission()`.

## 7. Integrações realizadas

- **Documentos**: `document_id` (FK para `public.documents`) em `member_history`,
  `member_occurrences`, `member_ordinations`, `member_transfers` — reaproveitado, não duplicado.
- **Bucket `member-documents`**: `attachment_path` nas mesmas 4 tabelas, para anexos pessoais
  privados (mesmo bucket/padrão de path do documento civil).
- **Cartas de Recomendação**: `member_transfers.recommendation_letter_id` (FK opaca por id, sem
  suposição sobre o significado de `member_id` naquela tabela — ver achado na seção 1).
- **Carteira, Agenda, Notificações, Auditoria de acesso**: não tocados nesta operação (nenhuma
  necessidade de integração segura identificada; documentado como não feito, não fingido).

## 8. Testes executados

- `npx vitest run` → **47 arquivos de teste, 418 testes, todos passando** (inclui os 46 testes
  novos de `src/config/institutionalHistoryMigrations.test.ts` e os 8 de
  `src/lib/memberHistoryConstants.test.ts`).
- `npx tsc --noEmit` → 0 erros.
- `npx eslint .` → 132 problemas pré-existentes, **nenhum novo** nos arquivos desta operação
  (confirmado filtrando a saída do lint pelos arquivos alterados/criados).
- `npm run verify:production-bundle` → build de produção concluído com sucesso; nenhum módulo
  staging-only vazou para o bundle de produção; `MemberProfile-*.js` presente no build.

**Limitação assumida**: `src/lib/memberHistory.ts` não tem teste unitário dedicado (é uma camada
fina sobre o Supabase client — testá-la exigiria mockar toda a cadeia `.from().select().eq()...`
e `.rpc()`, com baixo retorno de garantia real). A cobertura de regressão real está nas migrations
(que fixam o contrato de tabelas/RLS/funções que o service layer consome) e na verificação de
tipos (`tsc`), que já pegaria qualquer dessincronia de schema.

## 9. Problemas encontrados

- O esboço `member_history` em `types.ts` (sem DDL, sem uso) foi substituído pela estrutura real
  desta operação — não era um contrato em uso, então não há "migração" de dados a fazer.
- `recommendation_letters.member_id` não é o que o nome sugere (é `auth.users.id`, não
  `members.id`) — documentado para não confundir futuros agentes.

## 10. Pendências reais

1. **Importação do WinTechi**: estrutura pronta (campos legados + idempotência), rotina de
   importação ainda não escrita — objeto de operação futura, fora do escopo pedido.
2. **Sincronização opcional membro ↔ ordenação**: hoje `members.member_role`/
   `administrative_role` e `member_ordinations` não se atualizam automaticamente um ao outro. Se o
   produto decidir que a ficha do membro deve refletir a última ordenação ativa, isso precisa de
   uma decisão de produto explícita antes de qualquer trigger de sincronização bidirecional.
3. **Transferência → mudança de congregação**: hoje são dois passos manuais (registrar a
   transferência + editar a congregação do membro no wizard). Uma automação seria possível mas
   arriscada sem mais testes/decisão de produto.
4. **Teste dedicado do service layer** (`memberHistory.ts`) com mocks do Supabase client — não
   crítico hoje (ver seção 8), mas útil se a camada crescer.

## 11. Pontos de extensão preparados para Discipulado (e Teologia/Missões)

- `member_history.source_module` já aceita `'discipulado' | 'teologia' | 'missoes'` — nenhuma
  migration adicional necessária para o próximo módulo registrar eventos.
- `register_member_history_event()` (RPC) / `registerHistoryEvent()` (wrapper TS) — chamar com o
  `source_module` correto e, quando fizer sentido, `source_table`/`source_id` apontando para a
  tabela de matrícula específica de Discipulado.
- Padrão de `legacy_source`/`legacy_module`/`legacy_code` + índice único parcial — copiar em
  qualquer tabela nova de matrícula/participação.
- Padrão de confidencialidade (`visibility` + capability dedicada) — copiar se Discipulado também
  tiver dados sensíveis (ex.: acompanhamento de aluno).
- Nenhuma tabela, rota, tipo ou componente funcional de Discipulado/Teologia/Missões foi criado.

## 12. Arquivos alterados/criados nesta operação

**Migrations (novas, staging + produção, 10 arquivos):**
`20260728090000_shared_institutional_history_foundation.sql`,
`20260728100000_member_occurrences.sql`, `20260728110000_member_ordinations.sql`,
`20260728120000_member_transfers.sql`, `20260728130000_member_organization_history.sql` (×2
árvores).

**Backend/config:**
`supabase/migration-manifest.json` (5 novas entradas em `staging_feature`).

**Frontend (novos):**
`src/lib/memberHistoryConstants.ts`, `src/lib/memberHistory.ts`,
`src/lib/memberHistoryConstants.test.ts`, `src/config/institutionalHistoryMigrations.test.ts`.

**Frontend (alterados):**
`src/lib/accessControl.ts` (capability `members.confidential`),
`src/integrations/supabase/types.ts` (tipos das 5 tabelas + RPC
`register_member_history_event`), `src/pages/MemberProfile.tsx` (4 novas seções).

**Documentação (novos):**
`docs/architecture/contrato-dominios-institucionais.md`,
`docs/architecture/operacao-1-secretaria.md`.

## 13. Instruções manuais ainda necessárias (não executadas)

1. Revisar as 5 migrations novas e movê-las de `staging_feature` para `production_management` no
   `migration-manifest.json` quando for a hora de promover.
2. Aplicar as migrations em staging primeiro (`supabase db push` apontando para staging),
   confirmar `SELECT * FROM member_history LIMIT 1` etc., depois aplicar em produção.
3. Regenerar `src/integrations/supabase/types.ts` via `supabase gen types` após aplicar em
   staging, e comparar com os tipos manuais escritos aqui (devem coincidir; se o gerador produzir
   nomes de FK diferentes, isso é só cosmético).
4. Depois de aplicado, validar manualmente em staging: cadastrar um membro novo e confirmar que
   `member_history` recebe o evento "Cadastro" e `member_organization_history` abre a primeira
   linha — sem precisar tocar em nenhum código, só efeito do trigger.
5. Decidir (produto) se `member_ordinations` deve sincronizar com
   `members.member_role`/`administrative_role` (ver pendência 2 da seção 10) antes de construir
   Discipulado sobre essa base, caso Discipulado precise dessa sincronização.

## 14. Riscos que o próximo agente deve observar

- **Não reintroduzir role hardcoded**: qualquer nova policy/tela deve usar
  `has_org_access_permission()`/`hasCapability()`, nunca `has_org_role(..., ARRAY['admin', ...])`.
- **`recommendation_letters.member_id` não é `members.id`** — nunca fazer `JOIN` direto assumindo
  isso; usar sempre o id opaco da carta.
- **Triggers em `members`**: `members_seed_history_on_insert`,
  `members_track_organization_change`, `members_track_status_change` disparam em qualquer INSERT/
  UPDATE relevante em `members`, inclusive de scripts/seeds futuros. Eles são defensivos
  (`IS DISTINCT FROM`, `IF NOT NULL`) e não deveriam falhar em cenários normais, mas qualquer nova
  migration que faça `INSERT`/`UPDATE` em massa em `members` deve considerar o volume de linhas de
  histórico geradas (uma timeline por evento — esperado, mas relevante para importação em lote do
  WinTechi, que vai gerar potencialmente milhões de linhas ao longo de ~6 anos de dados; considerar
  particionamento/arquivamento se o volume real for muito grande).
- **`member_organization_history` não tem policy de escrita para `authenticated`** — se um agente
  futuro precisar corrigir um vínculo histórico manualmente, isso exigirá uma RPC
  `SECURITY DEFINER` dedicada (não abrir a tabela para INSERT/UPDATE direto, ou a garantia de
  "fonte única" se perde).
- **`members.confidential`** só foi concedida a `church_admin`/`responsible_pastor` nesta
  operação — se Discipulado precisar de um papel intermediário com acesso a dados confidenciais
  (ex.: um "coordenador pastoral" sem ser `church_admin`), isso é uma nova responsabilidade a
  cadastrar em `access_responsibility_definitions`, não um bypass no código.
