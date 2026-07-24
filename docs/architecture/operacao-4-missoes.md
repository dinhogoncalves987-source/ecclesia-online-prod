# Operação 4 — Missões completa sobre a fundação revisada do Ecclesia

Documento final da entrega estrutural **Sonnet**, revisada tecnicamente pelo **Codex** sobre a
branch `review/operacao-4-missoes`. Ver também
`docs/architecture/contrato-dominios-institucionais.md` (contrato entre os quatro domínios, seção
12) e `docs/architecture/operacao-3-teologia.md` (Operação 3 já revisada). A base veio da branch
`handoff/sonnet-operacao-4-missoes-20260723`, criada a partir de
`review/operacao-3-teologia`, portanto contém integralmente as Operações 1, 2 e 3 revisadas.
Nenhuma migration foi aplicada e nenhum push, PR, merge ou deploy foi executado durante a revisão
Codex. Esta é a **quarta e última** operação estrutural planejada da arquitetura do Ecclesia.

## 1. Estado encontrado antes da operação (auditoria)

- **Pessoa/membro**: `public.members` — única tabela de pessoa, com `member_addresses`,
  `member_family`, `member_history`, `member_occurrences`, `member_ordinations`,
  `member_transfers`, `member_organization_history` (Operação 1). Busca por pessoa em
  `src/lib/memberSearch.ts`.
- **Organizações**: `public.organizations` (`parent_id` self-FK), `has_org_access_permission()` +
  `access_responsibility_definitions` + `organization_responsibles`, herança via
  `is_organization_descendant_or_self()`.
- **Documentos**: `public.documents` + bucket privado `member-documents`.
- **Histórico institucional**: `public.member_history` + `register_member_history_event()`
  (interna, sem `EXECUTE` para `authenticated`). Catálogo `history_type` já contém, antes desta
  operação: os marcos genéricos da Secretaria (Operação 1), os 5 marcos de formação da Operação 2
  (`matricula`/`inicio_formacao`/`conclusao_formacao`/`desligamento_formacao`/`transferencia_turma`,
  reaproveitados sem alteração pela Operação 3). `source_module` já incluía `missoes` como valor
  previsto desde a Operação 1 — nunca usado em produção real até esta operação.
- **Campanhas (`public.campaigns`)**: módulo real de arrecadação já existente
  (`campaign_contributions`, componentes `Campanhas.tsx`/`FinanceCampaigns.tsx`), com
  `campaigns.type` já incluindo a categoria "missoes" nos dados de demonstração — auditado como
  candidato a ligação especializada em vez de recriação (ver seção 3).
- **Financeiro real**: `public.transactions`, `finance_accounts`, `finance_account_categories`,
  `finance_cost_centers`, `finance_monthly_closings`, `finance_transaction_audit_logs`, com
  categorias contábeis "Missoes" já cadastradas (códigos 1.04/2.04) desde
  `20260512100000_staging_treasury_mvp.sql`. Capabilities `finance.read`/`finance.write`/
  `finance.approve` resolvidas por `is_org_finance_reader`/`is_org_finance_writer` →
  `has_org_access_permission()`. Nenhum saldo/caixa/fechamento paralelo pode ser criado (contrato §6
  do prompt da operação).
- **Padrões das Operações 1/2/3 (pós-revisão Codex onde aplicável)**: escrita crítica só por RPC com
  `REVOKE INSERT, UPDATE, DELETE ... FROM authenticated` + `GRANT SELECT`; RPCs `SECURITY DEFINER`
  com `SET search_path = public`, validação de `auth.uid()`, capability e escopo organizacional
  real; `FOR UPDATE` em toda RPC que decide transição de estado ou concorrência; diretório de
  membros mínimo (`id`/`full_name`/`known_name`/`member_code`, limitado); helper de histórico
  interno que reconfirma escopo/capability do domínio antes de gravar em `member_history` (evita
  exigir `members.write` de quem só tem a capability do módulo); vínculo financeiro fino sem coluna
  monetária, exigindo capabilities de ambos os domínios simultaneamente. Todos replicados nesta
  operação com o vocabulário de Missões.
- **Frontend/rotas**: `AdminLayout.tsx`, `App.tsx` (`IS_STAGING_BUILD`), `src/config/modules.ts`
  (allowlist central), `ModuleGate`, `scripts/verify-production-bundle.mjs`. Padrão de módulo
  staging-only replicado de Discipulado/Teologia.
- **Testes/validação**: `vitest run`, `npx tsc --noEmit`, `npx eslint` nos arquivos alterados,
  `git diff --check`, `npm run build:staging`, `npm run build:production`, `npm run
  verify:production-bundle`. Migrations testadas por leitura de arquivo (regex sobre o texto SQL),
  nunca contra um banco real — mesmo padrão das Operações 1, 2 e 3.

## 2. Funções do WinTechi mapeadas

| # | Função WinTechi | Necessidade operacional real | Estrutura já existente no Ecclesia | Estrutura nova necessária | Tela moderna | Decisão | Pendência de produto |
|---|---|---|---|---|---|---|---|
| 1 | Contribuintes | Identificar quem se compromete a apoiar financeiramente missionário/projeto/campanha | `public.members` (pessoa) | `missions_supporters` (papel) | Aba "Apoiadores e Compromissos" | Reutilizar pessoa, criar papel | — |
| 2 | Missionários | Registrar quem está enviado/em campo, com dados públicos e confidenciais | `public.members` (pessoa) | `missions_missionaries` + `missions_missionary_confidential_info` | Aba "Missionários" | Reutilizar pessoa, criar papel com separação pública×confidencial | — |
| 3 | Lançamentos das Contribuições | Registrar recebimento real de um valor | `public.transactions` (Financeiro real) | `missions_transaction_links` (ligação, sem valor) | Aba "Financeiro Missionário" | **Não duplicar.** Lançamento continua no Financeiro; Missões só vincula o contexto | — |
| 4 | Movimentação de Pagamentos | Consultar o que já foi efetivamente pago, por contexto | `public.transactions` | `list_missions_linked_transactions()` (leitura via JOIN) | Aba "Financeiro Missionário" | Visão filtrada sobre transações reais — nunca cópia | — |
| 5 | Atualizar Saldos do Período — Portadores | Recalcular saldo de uma "conta" (portador) no período | `finance_accounts` já tem saldo derivado das transações reais | Nenhuma — Missões nunca calcula/armazena saldo próprio | Módulo Financeiro real (fora de Missões) | **Não replicar.** "Portador" = `finance_accounts` real | — |
| 6 | Resumo de Saldo dos Portadores | Ver saldo consolidado por portador | `finance_accounts` + relatórios do Financeiro real | Nenhuma | Módulo Financeiro real | Idem função 5 | — |
| 7 | Transferência — Portadores | Mover saldo entre contas | Motor financeiro real de transferência (fora do escopo desta operação auditar a fundo) | Nenhuma em Missões | Módulo Financeiro real | **Não duplicar.** Missões nunca move saldo entre contas | — |
| 8 | Inicializar Saldos — Portadores | Definir saldo inicial de uma conta nova | Cadastro de conta financeira real (`finance_accounts`) | Nenhuma | Módulo Financeiro real | Idem função 5/7 | — |
| 9 | Emissão de Recibos | Comprovar um recebimento para o apoiador | `public.documents` + transação real vinculada | Nenhuma tabela nova — recibo é documento associado a uma transação já vinculada | Aba "Financeiro Missionário" (futuro: anexar/gerar documento a partir do link) | **Lacuna documentada** (ver seção 19) — o Financeiro real não expõe hoje uma operação de "emissão de recibo" dedicada; esta operação não inventa uma | Decisão de produto: desenhar "recibo" uma única vez no Financeiro real, reutilizável por Teologia/Missões |
| 10 | Mensalidades a Receber | Saber o que está previsto, pendente e atrasado por apoiador | Nenhuma — conceito não existia fora do legado | `missions_supporter_commitments` + `missions_commitment_installments` (previsto, derivado, nunca "pago" manual) | Aba "Apoiadores e Compromissos" + RPC de relatório `list_missions_commitment_installments` | Estrutura nova justificada — mas status sempre derivado de transação real | — |
| 11 | Projetos em Ação | Acompanhar ações/projetos missionários com responsáveis, datas e indicadores | Nenhuma — `public.campaigns` é genérico de arrecadação, sem responsáveis/datas/campo de atuação | `missions_projects` + `missions_project_assignments` | Aba "Projetos e Ações" | Estrutura nova, com ligação opcional a `campaigns` quando o projeto também arrecada | — |
| 12 | Parâmetros de Missões | Definir conta/categoria/centro de custo/periodicidade padrão da organização | `finance_accounts`/`finance_account_categories`/`finance_cost_centers` já existem | `missions_settings` (aponta para os padrões reais, nunca duplica cadastro financeiro) | Aba "Configurações" | Estrutura fina de parâmetros, sem segredo/credencial | — |
| 13 | Períodos Contábeis | Fechar um período contábil | `finance_monthly_closings` (fechamento mensal real) | Nenhuma | Módulo Financeiro real | **Não duplicar.** Reutiliza o fechamento mensal geral existente | Mesma lacuna da Teologia: não há "fechamento por módulo" — decisão de produto futura se for exigido |
| 14 | Contas Contábeis — Missões | Classificar contabilmente um lançamento de Missões | `finance_account_categories` (já tem categoria "Missoes" desde 2026-05-12) | Nenhuma | Módulo Financeiro real (seleção de categoria no vínculo) | **Não duplicar.** "Conta Contábil" = `finance_account_categories` real | — |
| 15 | Grupos Contábeis | Agrupar contas contábeis | `finance_account_categories` (hierarquia própria, se existente) | Nenhuma | Módulo Financeiro real | Idem função 14 | — |
| 16 | Relatórios do Cadastro | Ver missionários por campo/situação | Nenhuma agregação existente | `list_missions_missionaries_by_field()` (derivado) | Aba "Relatórios" | RPC de leitura, nunca tabela de relatório | — |
| 17 | Relatórios Gerenciais | Ver indicadores por projeto (previsto × realizado) | Nenhuma agregação existente | `list_missions_project_indicators()`/`get_missions_dashboard_summary()` (derivados) | Aba "Visão Geral" + Aba "Relatórios" | RPCs de leitura, nunca tabela de relatório | — |

**Resumo da decisão de reutilização**: das 17 funções do WinTechi, **6 (funções 5, 6, 7, 8, 13, 14,
15 — na prática 7)** não geram nenhuma estrutura nova em Missões porque o problema operacional que
resolviam (saldo, transferência, conta contábil, fechamento) já é resolvido pelo Financeiro real;
**2 (funções 3, 4, 9)** tornam-se visões/vínculos sobre transações reais, sem duplicar valor; as
demais **8 funções** justificam as 9 tabelas novas do namespace `missions_*` descritas na seção 4.

## 3. Decisões de domínio (Campanhas × Missões, Teologia/Discipulado × Missões)

1. **`public.campaigns` não foi duplicado nem renomeado.** Auditoria confirmou que Campanhas é um
   módulo de arrecadação genérico (uma campanha, várias contribuições) sem os conceitos de
   missionário/campo de atuação/situação missionária. `missions_projects.campaign_id` é a **ligação
   especializada** pedida pelo contrato (§7): um projeto missionário PODE estar associado a uma
   campanha de arrecadação já existente, sem recriar a arrecadação em si.
   `missions_supporter_commitments` também aceita `campaign_id` como um dos três contextos possíveis
   de compromisso — um apoiador pode se comprometer com uma campanha existente sem que Missões crie
   uma segunda campanha.
2. **Namespace próprio `missions_*`** para as 9 tabelas novas — identidade e FKs isoladas de
   Discipulado/Teologia/Campanhas, mas **padrões replicados** (RLS por capability, escrita crítica
   só por RPC, locks de concorrência, helper de histórico com reautorização de escopo, diretório
   mínimo de membros, vínculo financeiro fino).
3. **Missionário e apoiador são papéis distintos**, mesmo que a mesma pessoa possa ser as duas coisas
   (ex.: um ex-missionário que hoje só contribui). `missions_missionaries.member_id` é `UNIQUE`
   (um só registro de missionário por pessoa, com histórico de status preservado);
   `missions_supporters` é único por `(member_id, organization_id)` (uma pessoa pode ter vários
   compromissos, mas um único registro de apoiador por organização).
4. **Projeto cobre "responsáveis" e "missionários relacionados" com uma única tabela de
   participação** (`missions_project_assignments.role`), evitando duas tabelas quase idênticas — o
   mesmo raciocínio de unificação já usado por Teologia (`theology_staff_assignments`) e Discipulado.
5. **Compromisso é sempre para exatamente um contexto** (`missionario` **ou** `projeto` **ou**
   `campanha` — nunca dois, nunca nenhum, via `CHECK (num_nonnulls(...) = 1)`), e o **vínculo
   financeiro** aceita um quarto contexto possível (`installment_id`, a parcela específica), também
   sempre exatamente um. Isso permite tanto vincular uma transação a uma parcela prevista específica
   quanto a um projeto/missionário/campanha diretamente (contribuição espontânea sem compromisso
   formal).
6. **Nenhuma capability `missions.finance` substitui `finance.*` real.** Diferente de Teologia (que
   não criou uma capability financeira própria), Missões precisa dela porque o vínculo financeiro
   deve poder ser delegado a alguém que não é tesoureiro geral (`missions_treasurer`), mas essa
   pessoa **nunca** ganha `finance.read`/`finance.write` automaticamente — precisa das duas
   responsabilidades (financeira geral + missionária) para efetivamente tocar em
   `public.transactions`.

## 4. Modelo de domínio — entidades criadas (9 tabelas, 6 migrations, nenhuma aplicada)

| Migration | Tabelas/objetos |
|---|---|
| `20260731090000_missions_foundation.sql` | Capabilities novas + 3 responsabilidades operacionais + `missions_settings` |
| `20260731100000_missions_missionaries.sql` | `missions_missionaries` + `missions_missionary_confidential_info` + máquina de estados `update_missions_missionary_status` |
| `20260731110000_missions_projects.sql` | `missions_projects` + `missions_project_assignments` + máquina de estados `update_missions_project_status` |
| `20260731120000_missions_supporters_commitments.sql` | `missions_supporters` + `missions_supporter_commitments` + `missions_commitment_installments` + recomputo derivado `_recompute_missions_installment_status` |
| `20260731130000_missions_transaction_links.sql` | `missions_transaction_links` + RPCs `link_missions_transaction`/`unlink_missions_transaction`/`list_missions_linked_transactions` |
| `20260731140000_missions_history_and_reports.sql` | Extensão de catálogo `member_history` + helper `_register_missions_member_history` + triggers de histórico + diretório mínimo + RPCs de relatório derivado |

Todas as 6 migrations foram espelhadas byte a byte em `supabase-production/supabase/migrations/` e
listadas em `supabase/migration-manifest.json` na categoria `staging_feature` (verificado por
`src/config/missionsMigrations.test.ts`, teste `sha256` do conteúdo de cada arquivo nas duas
árvores).

## 5. Relações com `members` e `organizations`

- Toda participação (`missions_missionaries.member_id`, `missions_missionaries.coordinator_member_id`,
  `missions_supporters.member_id`, `missions_project_assignments.member_id`) referencia
  `public.members(id)`. Nenhuma tabela de pessoa própria do módulo.
- Toda entidade missionária (missionário, projeto, apoiador, compromisso, parcela, vínculo
  financeiro) referencia `public.organizations(id)`. Triggers de escopo garantem que a organização de
  cada entidade dependente é compatível com a organização "pai": missionário/apoiador validam que o
  membro pertence à árvore da organização informada
  (`_missions_missionaries_validate_scope`/`_missions_supporters_validate_scope`); coordenador do
  missionário também é validado no mesmo escopo; projeto valida que a campanha associada pertence à
  sua árvore (`_missions_projects_validate_scope`); associação de membro a projeto valida escopo real
  na própria RPC (`assign_missions_project_member`); compromisso valida que o contexto (missionário/
  projeto/campanha) está dentro do escopo do apoiador (`create_missions_commitment`); vínculo
  financeiro valida que o contexto missionário está dentro do escopo organizacional real da
  transação (`link_missions_transaction`).
- `missions_project_assignments.role = 'missionario'` exige que o membro já tenha registro em
  `missions_missionaries` — nunca uma FK direta (o registro de missionário pode estar em qualquer
  estado, incluindo candidatura, quando associado a um projeto futuro), mas sempre validado na RPC.

## 6. Regras de negócio implementadas

### 6.1 Missionários (públicos × confidenciais)

- `missions_missionaries`: situação, campo de atuação (país/estado/cidade/região/descrição), datas
  de envio/início/retorno/encerramento, coordenador institucional (opcional), notas públicas.
  Legível por `missions.read`.
- `missions_missionary_confidential_info`: documento pessoal, contato de emergência, notas de saúde
  e observações confidenciais — **tabela separada**, legível **somente** por
  `missions.confidential` (nunca por `missions.read`/`missions.manage` isolados). Mesmo princípio de
  separação de `members.confidential`, aplicado com tabela própria porque a confidencialidade aqui é
  constante por missionário, não um evento pontual.
- `src/lib/missions/rules.ts` espelha (só para UX) `isValidMissionaryStatusTransition`,
  `isMissionaryClosed` — a autoridade final é sempre a RPC.

### 6.2 Projetos e ações

- `missions_projects`: nome, descrição, objetivos, campo de atuação, datas, notas de metas,
  documento/anexo, ligação opcional a `campaigns`.
- `missions_project_assignments`: papel (`responsavel`/`coordenador`/`missionario`/`apoio`), datas de
  início/fim, único índice ativo por `(project_id, member_id, role)` — evita duplicar o mesmo papel
  ativo do mesmo membro no mesmo projeto.

### 6.3 Apoiadores e compromissos

- `missions_supporters`: papel único por `(member_id, organization_id)`, preferência de contato,
  situação.
- `missions_supporter_commitments`: periodicidade, valor comprometido, datas, contexto único
  (missionário **ou** projeto **ou** campanha).
- `missions_commitment_installments`: parcela esperada com mês de referência único por compromisso,
  valor esperado, valor pago (**sempre derivado**), status.

### 6.4 Parcela nunca é "paga" manualmente (contrato §7)

- `_recompute_missions_installment_status()` calcula `paid_amount` somando somente transações reais
  do tipo `Entrada`, com status financeiro real `Confirmado` ou `Pago`, vinculadas à parcela
  (`JOIN public.transactions`) e deriva o `status`:
  `pago` (recebido ≥ previsto), `parcial` (recebido > 0 e < previsto), `atrasado` (vencida sem
  recebimento), `pendente` (vence hoje sem recebimento) ou `previsto` (ainda não venceu).
  `cancelado`/`isento` são preservados, nunca recomputados.
- O único caminho de escrita manual é `set_missions_installment_exemption()`, restrito a
  `cancelado`/`isento`, e **bloqueado** se já existir valor pago real (`paid_amount > 0` ou
  `status = 'pago'`) — nunca é possível "cancelar" um recebimento que já aconteceu.
- Nenhuma RPC de Missões aceita `pago`/`parcial` como parâmetro manual — só a função interna de
  recomputo escreve esses dois valores, sempre a partir de `public.transactions` real.
- `src/lib/missions/rules.ts` espelha `deriveInstallmentStatus`/`canExemptOrCancelInstallment`/
  `isInstallmentClosed` — só para feedback imediato de UX; a gravação real é sempre pela RPC/trigger.

## 7. Máquinas de estado

Todas as transições abaixo são validadas dentro de RPCs `SECURITY DEFINER` (nunca no frontend);
`src/lib/missions/rules.ts` espelha as mesmas tabelas de transição só para feedback imediato de UX.

- **Missionário**: `candidato → em_preparacao/encerrado`, `em_preparacao → ativo/encerrado`,
  `ativo → em_licenca/retornado/encerrado`, `em_licenca → ativo/encerrado`,
  `retornado → em_preparacao/encerrado` (nova fase de envio), `encerrado` terminal.
- **Projeto**: `rascunho → planejado/cancelado`, `planejado → ativo/cancelado`,
  `ativo → suspenso/concluido/cancelado`, `suspenso → ativo/cancelado`, `concluido → arquivado`,
  `cancelado → arquivado`, `arquivado` terminal. A ativação também exige data de início vigente e
  ao menos um vínculo ativo com um missionário ainda elegível; concluir/cancelar encerra os vínculos
  ativos automaticamente.
- **Apoiador**: `ativo → inativo/encerrado`, `inativo → ativo/encerrado`, `encerrado` terminal.
- **Compromisso**: `ativo → pausado/encerrado/cancelado`, `pausado → ativo/encerrado/cancelado`,
  `encerrado`/`cancelado` terminais.
- **Parcela**: status sempre derivado (ver seção 6.4) — não é uma máquina de estados no sentido
  clássico de transição validada manualmente, e sim um cálculo determinístico sobre
  `paid_amount`/`due_date`, com `cancelado`/`isento` como únicos estados administrativos manuais.

## 8. Concorrência

- Toda RPC que decide transição de estado ou lê antes de escrever faz `SELECT ... FOR UPDATE` na
  própria linha antes de validar: `update_missions_missionary_status`,
  `update_missions_missionary_profile`, `update_missions_project_status`,
  `update_missions_project_profile`, `assign_missions_project_member`,
  `end_missions_project_assignment`, `update_missions_supporter_status`,
  `create_missions_commitment` (`FOR UPDATE` no apoiador), `update_missions_commitment_status`,
  `generate_missions_commitment_installment`, `_recompute_missions_installment_status`,
  `set_missions_installment_exemption`.
- Duplicidade impedida por índice único (não por lógica de aplicação): missionário único por membro
  (`member_id UNIQUE`), apoiador único por `(member_id, organization_id)`, papel ativo único por
  `(project_id, member_id, role) WHERE status='ativo'`, parcela única por
  `(commitment_id, reference_month)`, vínculo financeiro único por `transaction_id` (uma transação
  real nunca é contada duas vezes em contextos diferentes).

## 9. Capabilities e responsabilidades

Capabilities novas (`src/lib/accessControl.ts` + `access_responsibility_definitions.permission_keys`):
`missions.read`, `missions.manage`, `missions.finance`, `missions.confidential`.
`church_admin`/`responsible_pastor` recebem as 4 idempotentemente (mesmo padrão de
`members.confidential`/`discipleship.*`/`theology.*`). Responsabilidades operacionais novas:

| Responsabilidade | Permissões | Herda a descendentes | Governança |
|---|---|---|---|
| `missions_coordinator` | `missions.read`, `missions.manage`, `missions.finance` | não | não |
| `missions_secretary` | `missions.read`, `missions.manage` | não | não |
| `missions_treasurer` | `missions.read`, `missions.finance` | não | não |

Nenhuma das três recebe `missions.confidential` por conveniência. `missions_treasurer` recebe
`missions.finance` mas **não** `missions.manage` e **nenhuma** capability `finance.*` — para
efetivamente vincular uma transação, essa pessoa também precisa de uma responsabilidade financeira
geral real (`treasurer`/`assistant_treasurer`), porque toda RPC financeira de Missões verifica
`finance.write`/`finance.read` **e** `missions.finance` **separadamente**, na organização real de
cada lado do vínculo — nunca uma capability substitui a outra.

## 10. Policies RLS

Todas as 9 tabelas têm `ENABLE ROW LEVEL SECURITY` (verificado por teste). Nenhuma policy usa
`USING (true)` ou `WITH CHECK (true)` (verificado por teste — nenhuma ocorrência em todo o texto SQL
das 6 migrations). Toda policy resolve autorização por `has_org_access_permission()` — nunca role
hardcoded. Tabelas simples (`missions_settings`, `missions_missionaries`, `missions_projects`,
`missions_supporters`) usam `has_org_access_permission()` direto sobre `organization_id`;
`missions_supporter_commitments` e `missions_commitment_installments` exigem conjuntamente
`missions.read` e `finance.read`; tabelas dependentes
(`missions_project_assignments`) resolvem a organização por `EXISTS (... JOIN missions_projects ...)`.
`missions_missionary_confidential_info` exige `missions.confidential` via `EXISTS (JOIN
missions_missionaries)`. `missions_transaction_links` exige **ambas** `finance.read` (organização da
transação) e `missions.read` (organização do contexto — resolvida por 4 `EXISTS` alternativos, um por
tipo de contexto) na policy de `SELECT` — sem policy de escrita (só a RPC). Todas as 9 tabelas
revogam INSERT/UPDATE/DELETE de `authenticated` e só concedem `SELECT` — escrita exclusivamente por
RPC.

## 11. RPCs e funções internas

**27 RPCs públicas** (`GRANT EXECUTE ... TO authenticated`, todas com `REVOKE ALL ... FROM PUBLIC,
anon`): `upsert_missions_settings`, `create_missions_missionary`,
`update_missions_missionary_profile`, `update_missions_missionary_status`,
`upsert_missions_missionary_confidential_info`, `create_missions_project`,
`update_missions_project_profile`, `update_missions_project_status`,
`assign_missions_project_member`, `end_missions_project_assignment`, `create_missions_supporter`,
`update_missions_supporter_status`, `create_missions_commitment`,
`update_missions_commitment_status`, `generate_missions_commitment_installment`,
`refresh_missions_installment_status`, `set_missions_installment_exemption`,
`link_missions_transaction`, `unlink_missions_transaction`, `list_missions_linked_transactions`,
`search_missions_available_transactions`, `search_missions_members`,
`get_missions_member_labels`, `get_missions_dashboard_summary`,
`list_missions_missionaries_by_field`, `list_missions_project_indicators`,
`list_missions_commitment_installments`.

**8 funções internas** (`REVOKE ALL FROM PUBLIC, anon, authenticated` — nunca chamáveis diretamente
pelo navegador, só por trigger ou por outra função `SECURITY DEFINER`):
`_missions_missionaries_validate_scope`, `_missions_projects_validate_scope`,
`_missions_supporters_validate_scope`, `_recompute_missions_installment_status`,
`_missions_transaction_links_after_delete`, `_register_missions_member_history`,
`_missions_missionaries_register_history`, `_missions_project_assignments_register_history`.

## 12. Integração financeira (sem duplicar Financeiro)

- `missions_transaction_links` **não tem coluna de valor monetário** — apenas `transaction_id` (FK
  única para `public.transactions`), `organization_id` (snapshot validado), `link_type`
  (`compromisso`/`projeto`/`missionario`/`campanha`), e exatamente um dos quatro contextos
  (`installment_id`/`project_id`/`missionary_id`/`campaign_id`), via
  `CHECK (num_nonnulls(...) = 1)`.
- `link_missions_transaction()` exige `finance.write` na organização real da transação **e**
  `missions.finance` na organização real do contexto missionário — nunca uma capability substituindo
  a outra. Caixa central pode vincular contexto descendente; caixa local não vincula contexto
  missionário superior (`is_organization_descendant_or_self`). Uma transação só pode ser vinculada
  uma vez (índice único em `transaction_id`) e precisa estar `Confirmado`/`Pago`; uma parcela aceita
  apenas transação de `Entrada`. Ao vincular uma parcela, recomputa o status dela imediatamente.
- `unlink_missions_transaction()` exige as mesmas duas capabilities e recomputa a parcela afetada
  após remover o vínculo.
- `list_missions_linked_transactions()` exige `missions.read` **e** `finance.read` e revalida cada
  linha contra a organização real do contexto e da transação, apesar de ser `SECURITY DEFINER`.
  Valor/tipo/data/descrição/status vêm sempre de `JOIN public.transactions`.
- `search_missions_available_transactions()` é o seletor server-side da interface: retorna no
  máximo 50 transações `Confirmado`/`Pago`, ainda não vinculadas e pertencentes à organização
  financeira autorizada. O usuário nunca precisa conhecer ou copiar UUIDs internos.
- "Portadores" do WinTechi = `finance_accounts` reais (configuráveis como padrão em
  `missions_settings.default_finance_account_id`); "Contas/Grupos Contábeis" =
  `finance_account_categories` reais (`default_account_category_id`); saldo, transferência,
  inicialização de saldo, fechamento de período e recibo **continuam exclusivamente no motor
  financeiro existente** — o frontend de Missões (aba "Financeiro Missionário") é uma **visão
  filtrada** sobre transações já lançadas no Financeiro real, nunca um caixa/conta/fechamento
  paralelo.
- **Lacuna documentada** (mesma da Teologia): o legado WinTechi tinha "Emissão de Recibos",
  "Atualizar/Resumo/Transferência/Inicializar Saldos — Portadores" e "Períodos Contábeis" como telas
  próprias. O Financeiro real do Ecclesia resolve saldo/transferência/fechamento de forma central
  (não por módulo) e não expõe uma operação de "recibo" dedicada. Esta operação **não inventa** uma
  segunda contabilidade para suprir essas lacunas; documenta-as para decisão de produto futura (ver
  seção 19), mesma recomendação já registrada pela Teologia de resolver isso **uma única vez** no
  Financeiro real.

## 13. Histórico, diretório e relatórios

- **Histórico**: catálogo `member_history.history_type` estendido com 4 marcos próprios —
  `envio_missionario`, `retorno_missionario`, `encerramento_atividade_missionaria`,
  `vinculacao_projeto_missionario` — semanticamente distintos dos marcos de formação de
  Discipulado/Teologia (envio/retorno não é matrícula). `_register_missions_member_history()`
  reconfirma `missions.manage` e o escopo organizacional do membro antes de gravar com
  `source_module='missoes'`. Triggers automáticos: `_missions_missionaries_register_history` (após
  mudança de status: `em_preparacao→ativo` = envio, `→retornado` = retorno, `→encerrado` =
  encerramento) e `_missions_project_assignments_register_history` (após vínculo com papel
  `missionario` a um projeto). Movimentações financeiras comuns (vínculo de transação) **não** geram
  evento na timeline pessoal.
- **Diretório mínimo**: `search_missions_members`/`get_missions_member_labels` retornam somente
  `id`/`full_name`/`known_name`/`member_code` — nunca CPF/telefone/endereço — limitados a 50
  resultados por busca.
- **Relatórios derivados** (contrato §12), nenhum persistido: `get_missions_dashboard_summary`
  (contagens por situação de missionário, projetos ativos/planejados, apoiadores/compromissos
  ativos; campos financeiros ficam `NULL` sem `finance.read`);
  `list_missions_missionaries_by_field` (agrupamento por país/estado/região, só missionários em
  atividade); `list_missions_project_indicators` (previsto de compromissos ativos × realizado de
  transações de entrada `Confirmado`/`Pago`, por projeto); `list_missions_commitment_installments`
  (parcelas com nome do apoiador, contexto e filtro de atraso). Os dois relatórios monetários exigem
  simultaneamente `missions.read` e `finance.read`.

## 14. Telas e fluxos

- `src/pages/Missoes.tsx` — 7 abas com scroll horizontal (Visão Geral, Missionários, Apoiadores e
  Compromissos, Projetos e Ações, Financeiro Missionário, Relatórios, Configurações), mesmo padrão
  visual de `Teologia.tsx`/`Discipulado.tsx`/`Financeiro.tsx`.
- `src/components/missoes/`: `MissoesOverview` (contadores e indicadores reais via
  `get_missions_dashboard_summary`, com loading/erro explícitos e distinção de migration ausente),
  `MissoesMissionaries` (lista, criação, edição de perfil público, transições de status, painel de
  informações confidenciais gated por `missions.confidential`), `MissoesProjects` (lista, criação,
  edição, transições de status, pré-requisitos de ativação visíveis e associação de membros com
  papel), `MissoesSupporters` (apoiadores,
  compromissos por contexto, geração de parcelas, isenção/cancelamento), `MissoesFinance` (vínculo de
  transações reais por busca/seleção segura, exigindo as duas capabilities), `MissoesReports`
  (relatórios monetários ocultos sem `finance.read`), `MissoesSettings` (parâmetros organizacionais
  com seletores das estruturas reais do Financeiro), `MissoesMemberPicker` (busca
  server-side via `search_missions_members`, mesmo padrão do `TeologiaMemberPicker`/
  `DiscipuladoMemberPicker`), `missoesFormHelpers.tsx` (re-export dos helpers genéricos de
  `discipuladoFormHelpers.tsx` — nenhuma duplicação visual).
- `src/lib/missions/{constants,rules,service}.ts` — catálogos espelhando os `CHECK`s do banco, regras
  puras testáveis (`rules.test.ts`), e camada de serviço sobre o Supabase client.
- Rota `/admin/missoes` registrada em `App.tsx` (lazy, só quando `IS_STAGING_BUILD`), protegida por
  `ProtectedRoute` + `ModuleGate(moduleId="missions")`. Item de menu "Missões" (ícone `Send`) em
  `AdminLayout.tsx`, visibilidade real controlada por `isRouteEnabled()`. Nenhum formulário de membro
  foi duplicado — a seleção de pessoa usa `MissoesMemberPicker` (retorno mínimo, sem CPF/telefone/
  endereço).

## 15. Responsividade

Mesmo padrão de `Teologia.tsx`/`Discipulado.tsx`/`Financeiro.tsx`: abas com scroll horizontal em
telas estreitas (setas de navegação condicionais aparecendo só quando há conteúdo a rolar em cada
direção), cards em vez de tabelas largas para listas de missionários/projetos/compromissos em
mobile, formulários em coluna única com labels e ajuda curta, modais dentro dos limites da tela,
botões utilizáveis por toque, navegação compatível com a barra inferior existente do Ecclesia.

## 16. Testes criados

- **`src/config/missionsMigrations.test.ts` (novo)**: mirror byte a byte (`sha256`) staging/produção
  das 6 migrations, presença no manifest como `staging_feature`, dependência cronológica declarada no
  preflight de cada migration, ausência de `DROP TABLE`/`TRUNCATE`, transação `BEGIN`/`COMMIT` +
  verificação pós-DDL em todas, nenhuma migration de Operação 1/2/3 reaberta, regra central de
  identidade (nenhuma tabela de pessoa/organização/documento/storage/campanha paralela), RLS
  habilitado nas 9 tabelas, ausência de `USING/WITH CHECK (true)`, toda policy usando capability
  real, revogação de escrita direta nas 9 tabelas, `REVOKE ALL`/`GRANT EXECUTE` das 27 RPCs públicas
  e das funções internas, índices únicos de concorrência/duplicidade, máquinas de estado protegidas
  contra lançamento em contexto inválido/fechado, regra "parcela nunca paga sem transação real"
  (recomputo por soma de `Entrada`, preservação de `cancelado`/`isento`, bloqueio de
  cancelamento/isenção com valor pago real, ausência de parâmetro manual `pago`/`parcial`), vínculo
  financeiro sem duplicar valor/saldo/conta/fechamento (ausência de coluna monetária, leitura via
  `JOIN transactions`, exatamente um contexto no compromisso e no vínculo, transação vinculada uma
  única vez, verificação separada de `finance.*` e `missions.finance` em `link`/`unlink`/`list`),
  invariantes de escopo organizacional em cada trigger/RPC de validação, capabilities/
  responsabilidades cruzadas com `accessControl.ts` (incluindo a garantia de que `missions_treasurer`
  nunca recebe `missions.manage`/`finance.*` automaticamente), metadados legados nas 5 tabelas
  relevantes com índice único parcial, integração com `member_history` (4 novos tipos, extensão
  aditiva do catálogo, triggers de status/associação, ausência de evento para movimentação financeira
  comum), diretório mínimo de membros sem PII, relatórios derivados sem segundo motor genérico,
  parâmetros organizacionais sem segredo/credencial.
- **`src/lib/missions/rules.test.ts` (já existente nesta entrega)**: todas as transições válidas/
  inválidas de missionário/projeto/apoiador/compromisso, derivação de status de parcela (preservação de
  cancelado/isento, pago/parcial/atrasado/pendente/previsto), regra de cancelamento/isenção,
  contexto único do vínculo financeiro, cálculo de percentual de realização.
- **`src/config/modules.test.ts` (estendido, +2 testes)**: `missions` desabilitado em produção/
  habilitado em staging; `/admin/missoes` desabilitado em produção/habilitado em staging.
- **`scripts/verify-production-bundle.mjs` (estendido)**: `pages/Missoes` adicionado à lista de termos
  proibidos no bundle de produção, mesmo padrão de `pages/Discipulado`/`pages/Teologia`.

## 17. Comandos executados e resultados reais

Validação real executada após a revisão Codex:

- `npx vitest run`: **51 arquivos, 947 testes aprovados, 0 falhas**.
- `npx vitest run src/config/missionsMigrations.test.ts
  src/config/hierarchicalAccessResponsibilities.test.ts src/config/modules.test.ts
  src/lib/missions/rules.test.ts`: **4 arquivos, 216 testes aprovados, 0 falhas**.
- `npx tsc --noEmit`: **0 erros**.
- `npx eslint` nos arquivos de Missões e integrações alteradas: **0 erros e 0 warnings**.
- `git diff --check`: sem problemas de whitespace.
- Comparação byte a byte das 6 migrations em `supabase/migrations/` e
  `supabase-production/supabase/migrations/`: sem divergências.
- `npm run build:staging`: sucesso; chunk lazy `Missoes-*.js` emitido, junto dos módulos
  Discipulado/Teologia já revisados.
- `npm run build:production`, com as variáveis públicas canônicas e guarda de ambiente simulando
  Vercel/main: sucesso; nenhum chunk de Missões/Discipulado/Teologia emitido.
- `npm run verify:production-bundle`: sucesso; **83 arquivos** verificados e nenhum termo de módulo
  staging-only encontrado no bundle de produção.

Os avisos impressos por alguns testes de autenticação são saídas esperadas dos cenários que simulam
falha de rede/refresh token e não representam falha da suíte.

## 18. Problemas encontrados e corrigidos durante a construção

A revisão Codex encontrou e corrigiu problemas além do acabamento visual:

- **Pagamento pendente contado como recebido**: recomputação e indicadores aceitavam qualquer
  transação de entrada. Agora somente `Entrada` com status `Confirmado` ou `Pago` compõe
  `paid_amount`/realizado; a RPC de vínculo também recusa transação pendente.
- **Autorização incompleta ao desvincular**: a operação confiava em organização armazenada no link.
  Agora trava e relê a transação real, resolve novamente a organização do contexto e exige
  `finance.write` e `missions.finance` nos dois lados corretos da hierarquia.
- **Exposição de valores sem permissão financeira**: dashboard e relatórios monetários podiam ser
  consumidos apenas com `missions.read`. Valores do dashboard agora ficam `NULL` sem
  `finance.read`, e relatórios de projetos/parcelas exigem as duas capabilities.
- **Seleção por UUID**: vínculos, compromissos e parâmetros pediam identificadores internos ao
  usuário. Foram substituídos por seletores de missionário/projeto/campanha/parcela/conta/categoria/
  centro de custo e por busca server-side de transações confirmadas ainda não vinculadas.
- **Estados fechados permissivos**: perfis encerrados/fechados agora são imutáveis; projetos fechados
  não recebem novos vínculos; conclusão/cancelamento encerra participações; apoiador encerrado é
  terminal; compromisso e parcela exigem locks e capabilities financeira/missionária.
- **Ativação de projeto sem prontidão operacional**: agora exige data de início vigente e vínculo
  ativo com um missionário cujo cadastro continua elegível. A interface explica os pré-requisitos e
  desabilita a ação até a condição básica ser atendida; o banco continua sendo a autoridade final.
- **Compromisso fora do contexto correto**: criação agora valida estado do apoiador, contexto aberto,
  direção hierárquica e `missions.finance` no contexto real. Referência mensal, vencimento e validade
  do compromisso são validados; isenção/cancelamento exige justificativa e ausência de pagamento.
- **Configurações financeiras sem isolamento suficiente**: alteração de conta/categoria/centro de
  custo padrão exige `finance.read`; quem não possui a capability preserva os valores já gravados e
  ainda pode editar parâmetros operacionais. O valor zero de dias de alerta deixou de ser
  sobrescrito por fallback indevido.
- **Estado de tela obsoleto e erro silencioso**: seleções de missionário/projeto/apoiador/compromisso
  são sincronizadas após recarga, e falhas ao buscar contextos aparecem explicitamente em vez de
  produzir listas vazias que pareciam “sem cadastro”.
- **Superfície de funções internas**: funções `SECURITY DEFINER` de trigger/helper tiveram
  `EXECUTE` revogado de `PUBLIC`, `anon` e `authenticated`; o teste do helper de histórico foi
  corrigido para verificar o `GRANT` exato, sem falso positivo de regex.
- **Teste de responsabilidades incompleto**: o teste agregador passou a incluir a migration de
  Missões em vez de interpretar as três novas responsabilidades como regressão da fundação anterior.

## 19. Limitações reais

- **Lacuna financeira documentada** (seção 12): "Emissão de Recibos" e as 4 funções de "Portadores"
  (atualizar/resumir/transferir/inicializar saldo) não têm operação equivalente por módulo no
  Financeiro real hoje — Missões usa o motor financeiro central existente (saldo derivado de
  `finance_accounts`, fechamento mensal geral), sem inventar uma segunda contabilidade. Uma tela
  dedicada de "recibo" precisaria ser desenhada no próprio Financeiro (fora do escopo desta operação)
  se for exigida no futuro — mesma recomendação já registrada pela Teologia.
- Nenhuma migration foi aplicada — o módulo não funciona em nenhum ambiente real ainda; é
  staging-only e staging não tem as tabelas até a aplicação manual.
- Importação em lote do WinTechi não implementada — apenas metadados legados (`legacy_source`/
  `legacy_module`/`legacy_code` + índices únicos parciais nas 5 tabelas com identidade natural)
  prontos para uma futura importação idempotente.
- `MissoesOverview`/`MissoesReports` dependem de RPCs agregadoras dedicadas (nunca leitura agregada
  client-side) — mas nenhuma delas foi validada contra volume real de dados, já que nenhuma migration
  foi aplicada.
- Os testes de migration são estáticos e não substituem homologação real de RLS, concorrência e
  volume em um projeto Supabase de staging.

## 20. Próximos passos seguros de homologação

1. Aplicar as 6 migrations em **staging**
   primeiro (`supabase db push` manual, nunca por este agente), sempre em ordem cronológica.
2. Validar RLS/RPCs com usuários de permissões diferentes: somente Missões, somente Financeiro,
   ambas e nenhuma; incluir hierarquia matriz/distrito/congregação.
3. Homologar o fluxo completo: missionário, transição de status, projeto e ativação, apoiador,
   compromisso, parcela, vínculo/desvínculo financeiro, histórico e relatórios.
4. Testar concorrência e volume em staging, especialmente vínculo único de transação e geração da
   mesma parcela por duas sessões.
5. Só então promover `missions` de `"staging"` para `"both"` em `src/config/modules.ts` (e remover a
   condicional `IS_STAGING_BUILD` em `App.tsx`), aplicar em produção, e então liberar o item de menu
   para todas as organizações.
6. Decidir produto sobre a lacuna financeira da seção 12/19 (recibo/portadores) — idealmente resolvida
   uma única vez no Financeiro real, beneficiando também a Teologia.
7. Nenhuma promoção ou aplicação em produção deve ocorrer antes da homologação manual em staging.

## 21. Fechamento da arquitetura das quatro operações

Com a entrega estrutural da Operação 4, os quatro domínios funcionais planejados para o Ecclesia
(Secretaria, Discipulado, Teologia, Missões) compartilham a mesma pessoa (`members`), a mesma árvore
organizacional (`organizations`), a mesma timeline institucional (`member_history`), o mesmo
repositório de documentos (`documents`/`member-documents`) e o mesmo motor financeiro
(`transactions`/`finance_*`) — sem nenhuma tabela de pessoa, organização, histórico, documento ou
contabilidade paralela criada por qualquer uma das quatro operações. Ver seção 13 de
`docs/architecture/contrato-dominios-institucionais.md` para o detalhamento de como cada operação se
encaixa sem duplicação de domínio. Com a revisão técnica Codex e a suíte local concluídas (seção
17), a arquitetura está no mesmo nível de revisão das Operações 2 e 3; permanece pendente somente a
homologação com banco e dados reais em staging.

## 22. Confirmação final

- A revisão Codex foi preparada em commit local para geração de patch de handoff; nenhum commit foi
  criado em branch remota por este agente.
- Nenhum `git push` foi executado pelo Codex.
- Nenhum PR foi aberto.
- Nenhum merge foi executado.
- Nenhum deploy (Vercel ou outro) foi realizado.
- Nenhuma migration foi aplicada (`supabase db push` nunca executado; nenhum SQL executado contra
  staging ou produção; nenhum `supabase migration repair`).
- Nenhum seed e nenhuma importação de dado real foi executada.
- Chat, autenticação, perfil do membro, responsividade geral fora de Missões, módulos legados fora de
  Missões, Financeiro fora das integrações estritamente necessárias e as migrations das Operações
  1/2/3 não foram alterados. `src/pages/GerenciarAcessos.tsx` só recebeu o filtro estritamente
  necessário para isolar responsabilidades `missions_*` do Gerenciador de Acessos de produção
  enquanto o módulo for staging-only — mesmo padrão já aplicado para `discipleship_*`/`theology_*`.
- A revisão técnica Codex e as validações locais foram concluídas; a próxima etapa é homologação
  manual em staging, não promoção automática.
