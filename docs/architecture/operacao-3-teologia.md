# Operação 3 — Teologia completa sobre a fundação revisada do Ecclesia

Documento de passagem (entrega Sonnet, ainda **não revisada pelo Codex**). Ver também
`docs/architecture/contrato-dominios-institucionais.md` (contrato entre os quatro domínios) e
`docs/architecture/operacao-2-discipulado.md` (Operação 2, já revisada). Entrega estrutural
construída na branch `handoff/sonnet-operacao-3-teologia-20260723`, criada a partir de
`review/operacao-2-discipulado` (Operações 1 e 2 já revisadas presentes integralmente). Nenhuma
migration foi aplicada, nenhum commit/push/PR/deploy foi executado por este agente.

## 1. Estado encontrado antes da operação (auditoria)

- **Pessoa/membro**: `public.members` — única tabela de pessoa. `member_addresses`,
  `member_family`, `member_history`, `member_occurrences`, `member_ordinations`,
  `member_transfers`, `member_organization_history` (Operação 1), busca por pessoa em
  `src/lib/memberSearch.ts`.
- **Organizações**: `public.organizations` (`parent_id` self-FK), `has_org_access_permission()` +
  `access_responsibility_definitions` + `organization_responsibles`, herança via
  `is_organization_descendant_or_self()`.
- **Documentos**: `public.documents` + bucket privado `member-documents`
  (`{organization_id}/{member_id}/...`).
- **Histórico institucional**: `public.member_history` + `register_member_history_event()`
  (interna, `EXECUTE` restrito). O catálogo `history_type` **já** contém, desde a Operação 2, os 5
  marcos genéricos `matricula`, `inicio_formacao`, `conclusao_formacao`, `desligamento_formacao`,
  `transferencia_turma`, além de `certificado_emitido` (Operação 1) — confirmado lendo
  `src/lib/memberHistoryConstants.ts` e a migration `20260729120000_discipleship_permissions_and_history.sql`.
  **Nenhuma extensão de catálogo foi necessária nesta operação.**
- **Discipulado (`discipleship_*`)**: 12 tabelas auditadas (`discipleship_locations`,
  `discipleship_departments`, `discipleship_courses`, `discipleship_lessons`,
  `discipleship_classes`, `discipleship_staff_assignments`, `discipleship_enrollments`,
  `discipleship_sessions`, `discipleship_attendance`, `discipleship_assessments`,
  `discipleship_assessment_results`, `discipleship_followups`). Semântica de **um único curso por
  matrícula, sem matriz curricular** — incompatível com o modelo acadêmico de Teologia (programa →
  múltiplas matérias → múltiplas ofertas → múltiplas tentativas). Decisão detalhada na seção 4.
- **Financeiro real**: `public.transactions`, `finance_accounts`, `finance_account_categories`,
  `finance_cost_centers`, `finance_monthly_closings`, componentes `Financeiro.tsx`/
  `FinanceAccounts.tsx` etc., capabilities `finance.read`/`finance.write`/`finance.approve`. Nenhum
  saldo/caixa/fechamento paralelo pode ser criado (contrato §6.5 do prompt da operação).
- **Padrões de RLS/RPC/concorrência da Operação 2 (pós-revisão Codex)**: escrita crítica só por RPC
  com `REVOKE INSERT, UPDATE, DELETE ... FROM authenticated` + `GRANT SELECT`; `REVOKE UPDATE` amplo
  com `GRANT UPDATE (colunas operacionais)` para tabelas com máquina de estados mas edição parcial
  permitida; `FOR UPDATE` em RPCs que decidem capacidade/promoção; reordenação atômica com faixa
  temporária positiva (nunca `-sequence_number`, que colide com `CHECK (sequence_number > 0)`);
  diretório de membros mínimo (`search_discipleship_members`/`get_discipleship_member_labels`, só
  `id`/`full_name`/`known_name`/`member_code`, limitado a 50); helper de histórico interno que
  reconfirma escopo/capability antes de gravar em `member_history` (evita exigir `members.write` de
  professor/secretário). Todos replicados nesta operação com o vocabulário acadêmico de Teologia.
- **Frontend/rotas**: `AdminLayout.tsx`, `App.tsx` (`IS_STAGING_BUILD`), `src/config/modules.ts`
  (allowlist central), `ModuleGate`. Padrão de módulo staging-only replicado de Discipulado.
- **Testes/validação**: `vitest run`, `npx tsc --noEmit`, `npx eslint` nos arquivos alterados,
  `git diff --check`, `npm run build:staging`, `npm run build:production` (simulado localmente com
  `VERCEL=1`/`VERCEL_ENV=production` e valores públicos e não-secretos, já que a guarda de
  `scripts/check-environment.mjs` recusa build de produção fora da Vercel), `npm run
  verify:production-bundle`. Migrations são testadas por leitura de arquivo (regex sobre o texto
  SQL), nunca contra um banco real — mesmo padrão das Operações 1 e 2.

## 2. Funções do WinTechi mapeadas

| WinTechi | Ecclesia moderno |
|---|---|
| Instituto Teológico | `theology_institutes` (1 por organização, com parâmetros padrão de frequência/nota mínima) |
| Parâmetros — Teologia | Combinados em `theology_institutes.default_minimum_attendance_percentage`/`default_minimum_passing_score` — nenhuma tela/tabela de "parâmetros" isolada |
| Núcleos de Estudos | `theology_study_centers` (ponto operacional, nunca hierarquia paralela) |
| Unidades de Estudos, Livros ou Matérias | `theology_subjects` (catálogo reutilizável entre programas) |
| Tipos de Cursos | `theology_programs` |
| Tipos de Avaliação | `assessment_type` em `theology_assessments` (`prova`/`trabalho`/`participacao`/`pratica`/`outro`) — atributo, não tabela própria |
| Alunos Teologia | Matrícula de um `members.id` existente em `theology_enrollments` (nunca nova pessoa) |
| Manutenção de Listas para Frequência e Avaliação | `theology_sessions` (aula agendada/realizada) + ação "Marcar todos como presentes" com confirmação explícita na UI |
| Frequência e Avaliação — Lançamentos de Notas — Mod01/Mod02/Mod03 | **Um único modelo configurável** (`theology_assessment_models` + `theology_assessment_model_components`) — escala, nota mínima, arredondamento, pesos e obrigatoriedade por componente substituem os 3 menus fixos do legado |
| Avaliação — Notas por Aluno — Modelo01 | `theology_assessment_results` (nota por componente + tentativa), lançada via `record_theology_assessment_result` |
| Boletins — Frequência e Avaliação | Leitura derivada (`get_theology_student_transcript`) — nunca persistida como relatório |
| Históricos — Unidades Concluídas | Mesma RPC `get_theology_student_transcript` (uma linha por oferta/tentativa) |
| Formandos no Período Letivo | `list_theology_period_graduates` — elegibilidade derivada de unidades obrigatórias concluídas, nunca condicionada a pagamento |
| Emissão de Recibos / Lançamentos de Contribuições / Movimentação de Pagamentos / Fechamento Diário ou Período | **Não duplicados.** `theology_transaction_links` só documenta o contexto acadêmico de uma transação já lançada no Financeiro real (`public.transactions`); recibo, lançamento, movimentação e fechamento continuam exclusivamente no motor financeiro existente (ver seção 12) |
| Relatórios Cadastrais Teologia | Abas "Alunos e Boletins"/"Visão Geral" do módulo — agregações reais, sem número fictício |

## 3. Decisões de domínio (Discipulado × Teologia)

1. **Não há FK direta entre `theology_*` e `discipleship_*`.** Discipulado modela um curso simples
   (uma matrícula = um curso); Teologia precisa de matriz curricular (um programa tem N matérias em
   sequência, cada turma oferta essas matérias por período, e o aluno pode repetir uma matéria
   específica sem repetir o programa inteiro). Forçar Teologia sobre `discipleship_courses`/
   `discipleship_enrollments` exigiria alterar a semântica de Discipulado (regressão fora do
   escopo) ou um motor genérico universal (proibido pelo contrato).
2. **Namespace próprio `theology_*`** para as 19 tabelas novas — identidade e FKs isoladas de
   Discipulado, mas **padrões replicados** (não herdados por FK): RLS por capability, escrita
   crítica só por RPC, locks de concorrência, helper de histórico com reautorização de escopo,
   diretório mínimo de membros, contrato de certificado idempotente.
3. **Matéria (`theology_subjects`) é reutilizável entre programas** — uma mesma matéria pode compor
   a matriz curricular de mais de um programa (`theology_curriculum_items` é a tabela de ligação
   N:N com sequência e obrigatoriedade por programa). Isso não existe em Discipulado (`lessons`
   pertence a um único `course`).
4. **Tentativa/repetência é de primeira classe**: `theology_offering_enrollments.attempt_number`
   permite reprovar uma matéria e tentar de novo sem afetar a matrícula geral do aluno no programa
   (`theology_enrollments`). Discipulado não tem este conceito (curso único por matrícula).
5. **Modelo de avaliação configurável substitui Mod01/Mod02/Mod03**: em vez de 3 tabelas fixas do
   legado, `theology_assessment_models` + `theology_assessment_model_components` permitem qualquer
   combinação de pesos/componentes/escala por avaliação — e ficam **travados** (trigger
   `_theology_assessment_models_validate_lock`/`_theology_assessment_model_components_validate_lock`)
   depois que qualquer avaliação agendada/aplicada os usa, para nunca mudar a régua de correção de
   provas já lançadas.
6. **Financeiro não foi copiado nem generalizado** — `theology_transaction_links` é uma tabela de
   ligação fina (sem valor monetário) entre `theology_enrollments`/`theology_periods` e
   `public.transactions`, exigindo **ambas** as capabilities reais (`theology.*` + `finance.*`)
   simultaneamente para ler ou escrever (ver seção 12).

## 4. Modelo acadêmico mínimo — entidades criadas (19 tabelas, 6 migrations, nenhuma aplicada)

| Migration | Tabelas/objetos |
|---|---|
| `20260730090000_theology_foundation.sql` | Capabilities novas + 3 responsabilidades operacionais + `theology_institutes` + `theology_study_centers` + `theology_subjects` + `theology_programs` |
| `20260730100000_theology_curriculum.sql` | `theology_curriculum_items` (matriz curricular) + RPC `reorder_theology_curriculum_items` + trigger de ativação de programa (`_theology_programs_validate_activation`) |
| `20260730110000_theology_periods_classes_enrollments.sql` | `theology_periods` + RPC `update_theology_period_status` + `theology_classes` + RPC `update_theology_class_status` + `theology_class_offerings` + RPC `update_theology_class_offering_status` + `theology_staff_assignments` + RPCs `assign_theology_staff`/`end_theology_staff_assignment` + helpers `_is_theology_class_staff`/`_is_theology_offering_staff`/`can_operate_theology_class`/`can_operate_theology_offering` + `theology_enrollments` + RPCs `enroll_member_in_theology_class`/`update_theology_enrollment_status` + `theology_offering_enrollments` + RPCs `enroll_member_in_theology_offering`/`update_theology_offering_enrollment_status` |
| `20260730120000_theology_attendance_and_assessments.sql` | `theology_sessions` + RPC `update_theology_session_status` + `theology_attendance` + RPC `record_theology_attendance` + `theology_assessment_models` + `theology_assessment_model_components` + `theology_assessments` + RPC `update_theology_assessment_status` + `theology_assessment_results` + RPC `record_theology_assessment_result` + `theology_grade_audit_log` + RPC `amend_theology_assessment_result` |
| `20260730130000_theology_results_history_and_documents.sql` | Helper interno `_register_theology_member_history` + trigger `_theology_enrollments_register_history` + `search_theology_members`/`get_theology_member_labels` (diretório mínimo) + colunas `certificate_document_id`/`certificate_issued_at` em `theology_enrollments` + RPC `mark_theology_certificate_issued` + RPCs de leitura derivada `get_theology_student_transcript`/`list_theology_period_graduates` |
| `20260730140000_theology_finance_links_and_permissions.sql` | `theology_transaction_links` + RPCs `link_theology_transaction`/`list_theology_linked_transactions` |

Todas as 6 migrations foram espelhadas byte a byte em `supabase-production/supabase/migrations/` e
listadas em `supabase/migration-manifest.json` na categoria `staging_feature` (verificado por
`src/config/theologyMigrations.test.ts`, teste `sha256` do conteúdo de cada arquivo nas duas
árvores).

## 5. Relações com `members` e `organizations`

- Toda participação (`theology_enrollments.member_id`, `theology_staff_assignments.member_id`,
  `theology_sessions.instructor_member_id`) referencia `public.members(id)`. Nenhuma tabela de
  pessoa própria do módulo.
- Toda entidade acadêmica (instituto, núcleo, matéria, programa, período, turma, modelo de
  avaliação) referencia `public.organizations(id)`. Triggers de escopo garantem que a organização
  de cada entidade dependente seja a mesma organização (ou uma descendente/ancestral, conforme o
  caso) da entidade "pai": núcleo/programa validam a árvore do instituto
  (`_theology_study_centers_validate_scope`/`_theology_programs_validate_scope`); matéria da matriz
  curricular valida a árvore do programa (`_theology_curriculum_items_validate_scope`); turma valida
  a árvore do programa/período/núcleo (`_theology_classes_validate_scope`); oferta valida que a
  matéria pertence à matriz do programa da turma (`_theology_class_offerings_validate_scope`);
  sessão valida que o instrutor é equipe ativa da oferta/turma
  (`_theology_sessions_validate_scope`); avaliação valida que o modelo pertence à árvore da turma e,
  se restrito a um programa, ao mesmo programa (`_theology_assessments_validate_scope`).
- `theology_enrollments.organization_id` é um **snapshot** da organização efetiva do membro no
  momento da matrícula (`COALESCE(congregation_id, sector_id, organization_id)`) — a autorização
  real sempre resolve pela organização da turma (via `theology_classes`), nunca por esse snapshot.

## 6. Regras acadêmicas implementadas

### 6.1 Modelos de avaliação (substituem Mod01/Mod02/Mod03)

- `theology_assessment_models`: escala (`scale_max_score`), nota mínima de aprovação
  (`minimum_passing_score` ≤ escala), regra de arredondamento (`nenhum`/`padrao`/`para_cima`/
  `para_baixo`), regra de recuperação textual opcional (`retake_rule`), ativo/inativo, opcionalmente
  restrito a um programa (`program_id`).
- `theology_assessment_model_components`: nome, peso (`weight > 0`), nota máxima do componente
  (`max_score > 0`), obrigatoriedade (`is_mandatory`), sequência única por modelo.
- **Trava de integridade**: depois que qualquer avaliação com status diferente de `rascunho` usa o
  modelo, os campos de cálculo do modelo (escala/nota mínima/arredondamento) e a lista de
  componentes (inserção/edição/remoção) ficam bloqueados — um modelo novo precisa ser criado para
  uma "nova versão", nunca editando o existente sob avaliações já lançadas.
- **Nota obrigatória antes do fechamento**: `update_theology_assessment_status()` só permite a
  transição para `publicada` quando todo componente obrigatório do modelo tem resultado lançado
  para toda tentativa aberta (`planejada`/`em_andamento`) da oferta — senão, bloqueia com a contagem
  exata de pendências.
- `src/lib/theology/rules.ts` espelha (só para UX) `sumComponentWeights`,
  `isValidAssessmentModelComponent`, `calculateWeightedAverageScore`, `isValidAssessmentScore`,
  `applyRoundingRule`, `findMissingMandatoryResults` — a autoridade final é sempre a RPC.

### 6.2 Frequência

- `theology_attendance.status`: `presente`/`ausente`/`justificado`/`nao_lancado` (padrão —
  "pendente" nunca desaparece do denominador operacional).
- Frequência só pode ser lançada quando a sessão está `realizada` (`record_theology_attendance`
  bloqueia lançamento em sessão `agendada`/`cancelada`).
- Nenhum "marcar todos como presentes automaticamente ao abrir a lista" — a RPC recebe um array
  explícito de `{offering_enrollment_id, status}`; a UI de "marcar todos como presentes" (quando
  implementada) chama a mesma RPC com uma ação explícita do usuário, nunca um default silencioso.
- `calculateAttendancePercentage`/`countPendingAttendance` (`src/lib/theology/rules.ts`) espelham o
  cálculo para exibição imediata.

### 6.3 Resultado por unidade e conclusão

- `theology_offering_enrollments.final_result`: `aprovado`/`reprovado`/`dispensado`;
  `theology_enrollments.final_result` (nível do programa): `aprovado`/`reprovado`/`sem_avaliacao`.
- Conclusão de matrícula (`update_theology_enrollment_status` → `concluido`) exige que **todas** as
  unidades obrigatórias ativas da matriz curricular do programa tenham uma tentativa
  `concluida`/`aprovado` associada — checagem real via `NOT EXISTS`, nunca um contador aproximado.
- **Override explícito e auditado**: `p_override_eligibility=true` permite concluir/reprovar
  ignorando a checagem acima, mas só quando quem chama tem `theology.manage` **e** fornece
  justificativa não vazia (`p_notes`) — nunca um botão livre sem capability/motivo.
- Estados finais (`concluido`/`reprovado`/`desistente`/`transferido`/`cancelado`) preservam
  histórico — nenhuma linha é apagada fisicamente.

### 6.4 Formatura

- `list_theology_period_graduates()` deriva elegibilidade em tempo real: matrícula em
  `ativo`/`concluido` **e** nenhuma matéria obrigatória ativa do programa sem tentativa
  `concluida`/`aprovado`. **Nenhuma referência a `transactions`/`finance_*`** nesta função — a
  formatura não depende de pagamento porque nenhuma regra institucional real e configurável
  condicionando isso foi encontrada no legado auditado (ver seção 13, limitações).

### 6.5 Integridade acadêmica (auditoria de nota)

- Lançamento comum (`record_theology_assessment_result`) só é aceito enquanto a avaliação está
  `aplicada` (antes de `publicada`).
- Depois de `publicada`, qualquer alteração de nota passa exclusivamente por
  `amend_theology_assessment_result()`: exige `theology.manage` (nunca `theology.teach` sozinho) e
  justificativa não vazia; grava `previous_score`/`new_score`/`justification`/`changed_by`/
  `changed_at` em `theology_grade_audit_log` **antes** do `UPDATE` da nota — nunca um `UPDATE`
  silencioso. `theology_grade_audit_log` não tem nenhuma policy de escrita direta (só a RPC
  `SECURITY DEFINER` grava lá).

## 7. Máquinas de estado

Todas as transições abaixo são validadas dentro de RPCs `SECURITY DEFINER` (nunca no frontend);
`src/lib/theology/rules.ts` espelha as mesmas tabelas de transição só para feedback imediato de UX.

- **Período letivo**: `planejamento → inscricoes_abertas → em_andamento → encerrado → arquivado`,
  com `cancelado` disponível a partir dos três primeiros estados. `encerrado` é bloqueado enquanto
  existir turma do período em `planejamento`/`inscricoes_abertas`/`em_andamento`.
- **Turma**: `planejamento → inscricoes_abertas → em_andamento → concluida/cancelada`, com
  arquivamento terminal (`arquivada`) a partir de `concluida`/`cancelada`, e **reabertura
  controlada** (`concluida`/`cancelada → em_andamento`) só pela RPC. `concluida` é bloqueada
  enquanto existir matrícula aberta, oferta aberta, ou sessão `agendada`.
- **Oferta de unidade**: `planejada → em_andamento → concluida/cancelada`. `concluida` é bloqueada
  enquanto existir tentativa de aluno `planejada`/`em_andamento`.
- **Matrícula (turma)**: `pendente → matriculado → ativo → concluido/reprovado/desistente/
  transferido/cancelado` — estados finais sem saída (histórico preservado).
- **Matrícula em oferta/tentativa**: `planejada → em_andamento → concluida/cancelada`, com suporte a
  nova tentativa (`attempt_number` incremental) depois que a anterior é encerrada.
- **Sessão/aula**: `agendada → realizada/cancelada`.
- **Avaliação**: `rascunho → agendada → aplicada → publicada`, com `cancelada` disponível a partir
  dos três primeiros estados.

## 8. Concorrência e fechamento

- `enroll_member_in_theology_class()` e `enroll_member_in_theology_offering()` fazem
  `SELECT ... FOR UPDATE` na turma/oferta antes de contar matrículas/tentativas ativas contra a
  capacidade — impede duas matrículas simultâneas ocuparem a última vaga.
- `update_theology_period_status()`/`update_theology_class_status()`/
  `update_theology_class_offering_status()` fazem `SELECT ... FOR UPDATE` na própria linha antes de
  validar a transição e as pendências de fechamento.
- `reorder_theology_curriculum_items()` faz `SELECT 1 ... FOR UPDATE` sobre todos os itens do
  programa antes de reordenar, e usa uma faixa temporária **positiva**
  (`sequence_number + v_offset`, nunca `-sequence_number`) para nunca colidir com o `CHECK
  (sequence_number > 0)` durante a reordenação atômica — mesma correção já validada na revisão
  Codex do Discipulado.
- Duplicidade impedida por índice único (não por lógica de aplicação): matrícula ativa única por
  turma (`theology_enrollments_unique_active_idx`), atribuição de equipe ativa única por
  turma/oferta/papel (`theology_staff_unique_active_idx`), tentativa aberta única por oferta/
  matrícula (`theology_offering_enrollments_open_idx`), resultado único por avaliação/componente/
  tentativa (`theology_assessment_results_unique_idx`), frequência única por sessão/tentativa
  (`theology_attendance_session_enrollment_idx`), transação vinculada uma única vez
  (`theology_transaction_links_transaction_idx`), sequência e matéria únicas por programa na matriz
  curricular (`theology_curriculum_items_program_sequence_idx`/`_program_subject_idx`).

## 9. Capabilities e responsabilidades

Capabilities novas (`src/lib/accessControl.ts` + `access_responsibility_definitions.permission_keys`):
`theology.read`, `theology.manage`, `theology.teach`, `theology.confidential`.
`church_admin`/`responsible_pastor` recebem as 4 idempotentemente (mesmo padrão de
`members.confidential`/`discipleship.*`). **Nenhuma capability `theology.finance` foi criada** — o
vínculo financeiro exige as capabilities financeiras reais (seção 12). Responsabilidades
operacionais novas:

| Responsabilidade | Permissões | Herda a descendentes | Governança |
|---|---|---|---|
| `theology_coordinator` | `theology.read`, `theology.manage`, `theology.teach` | não | não |
| `theology_secretary` | `theology.read`, `theology.manage` | não | não |
| `theology_teacher` | `theology.read`, `theology.teach` | não | não |

Nenhuma das três recebe `theology.confidential` por conveniência. `theology.teach` sozinho não
autoriza operar qualquer turma/oferta da organização: `can_operate_theology_class()`/
`can_operate_theology_offering()` exigem `theology.manage` **ou** (`theology.teach` **e** atribuição
ativa real em `theology_staff_assignments`, via `_is_theology_class_staff`/
`_is_theology_offering_staff`, que casam `members.user_id` com o usuário autenticado). Emissão de
certificado e vínculo financeiro exigem sempre `theology.manage` — nunca delegados a
`theology.teach`.

## 10. Policies RLS

Todas as 19 tabelas têm `ENABLE ROW LEVEL SECURITY` (verificado por teste). Nenhuma policy usa
`USING (true)` ou `WITH CHECK (true)` (verificado por teste — nenhuma ocorrência em todo o texto SQL
das 6 migrations). Toda policy resolve autorização por `has_org_access_permission()` ou
`can_operate_theology_class/offering()` — nunca role hardcoded. Catálogos simples (institutos,
núcleos, matérias, programas, modelos de avaliação) usam `has_org_access_permission()` direto;
tabelas dependentes de turma/oferta resolvem a organização por `EXISTS (... JOIN theology_classes/
theology_class_offerings ...)` — nunca duplicam `organization_id` como segunda fonte de verdade fora
das tabelas que efetivamente a possuem. Tabelas com máquina de estados ou risco de burla de autoria
(`theology_staff_assignments`, `theology_enrollments`, `theology_offering_enrollments`,
`theology_attendance`, `theology_assessment_results`, `theology_grade_audit_log`,
`theology_transaction_links`) revogam INSERT/UPDATE/DELETE de `authenticated` e só concedem
`SELECT` — escrita exclusivamente por RPC. `theology_periods`/`theology_classes`/
`theology_class_offerings`/`theology_sessions`/`theology_assessments` revogam o `UPDATE` amplo e
concedem apenas colunas operacionais (nunca `status`/`organization_id`) via
`GRANT UPDATE (colunas...)`. `theology_transaction_links` exige **ambas** `theology.read` e
`finance.read` na policy de `SELECT` (nenhuma policy de escrita — só a RPC).

## 11. RPCs e funções internas

**22 RPCs públicas** (`GRANT EXECUTE ... TO authenticated`, todas com
`REVOKE ALL ... FROM PUBLIC, anon`): `reorder_theology_curriculum_items`,
`update_theology_period_status`, `update_theology_class_status`,
`update_theology_class_offering_status`, `assign_theology_staff`, `end_theology_staff_assignment`,
`enroll_member_in_theology_class`, `update_theology_enrollment_status`,
`enroll_member_in_theology_offering`, `update_theology_offering_enrollment_status`,
`update_theology_session_status`, `record_theology_attendance`,
`update_theology_assessment_status`, `record_theology_assessment_result`,
`amend_theology_assessment_result`, `search_theology_members`, `get_theology_member_labels`,
`mark_theology_certificate_issued`, `get_theology_student_transcript`,
`list_theology_period_graduates`, `link_theology_transaction`,
`list_theology_linked_transactions`.

**16 funções internas** (`REVOKE ALL FROM PUBLIC, anon, authenticated` — nunca chamáveis
diretamente pelo navegador, só por trigger ou por outra função `SECURITY DEFINER`):
`_theology_study_centers_validate_scope`, `_theology_programs_validate_scope`,
`_theology_curriculum_items_validate_scope`, `_theology_programs_validate_activation`,
`_theology_classes_validate_scope`, `_theology_class_offerings_validate_scope`,
`_is_theology_class_staff`, `_is_theology_offering_staff`, `can_operate_theology_class`,
`can_operate_theology_offering`, `_theology_sessions_validate_scope`,
`_theology_assessment_models_validate_lock`, `_theology_assessment_model_components_validate_lock`,
`_theology_assessments_validate_scope`, `_register_theology_member_history`,
`_theology_enrollments_register_history`.

## 12. Integração financeira (sem duplicar Financeiro)

- `theology_transaction_links` **não tem coluna de valor monetário** — apenas `transaction_id`
  (FK única para `public.transactions`), `organization_id` (snapshot validado), `enrollment_id`/
  `period_id` (contexto acadêmico, ao menos um obrigatório), `link_type`
  (`matricula`/`mensalidade`/`contribuicao`/`material`/`outro`).
- `link_theology_transaction()` exige **ambas** `finance.write` **e** `theology.manage` na
  organização real da transação — nunca `theology.manage` isolado. Valida que a transação existe,
  que a matrícula/período está na mesma árvore organizacional da transação, e que a transação ainda
  não tem vínculo (uma transação só pode ser vinculada uma vez).
- `list_theology_linked_transactions()` exige **ambas** `theology.read` **e** `finance.read`, e lê o
  valor/tipo/data/descrição/status sempre via `JOIN public.transactions` — nunca uma cópia do valor.
- Recibo, lançamento de contribuição, movimentação de pagamento e fechamento diário/período
  **continuam exclusivamente no motor financeiro existente** — o frontend de Teologia (aba
  "Financeiro Acadêmico") é uma **visão filtrada** sobre transações já lançadas no Financeiro real,
  nunca um caixa/conta/fechamento paralelo.
- **Lacuna documentada**: o legado WinTechi tinha "Emissão de Recibos" e "Fechamento Diário ou
  Período" como telas próprias de Teologia. O Financeiro real do Ecclesia não expõe uma operação de
  "recibo" dedicada nem um fechamento por módulo — apenas o fechamento mensal geral
  (`finance_monthly_closings`). Esta operação **não inventa** uma segunda contabilidade para suprir
  essa lacuna; documenta-a para decisão de produto futura (ver seção 13).

## 13. Boletim, histórico e certificados

- `get_theology_student_transcript(member_id, organization_id)` — leitura derivada (nunca
  persistida), uma linha por oferta/tentativa: turma, programa, matéria, tentativa, status da
  oferta, nota final, resultado final, obrigatoriedade, data de conclusão. Serve tanto para
  "Boletim" quanto para "Histórico de Unidades Concluídas" do legado — sem duplicar consulta.
- `theology_enrollments.certificate_document_id`/`certificate_issued_at` + RPC
  `mark_theology_certificate_issued(enrollment_id, document_id)`: exige `theology.manage`, matrícula
  `concluido`, documento existente na árvore organizacional da turma; **idempotente** (repetir a
  mesma chamada com o mesmo documento não gera novo registro nem novo evento de histórico). A
  **emissão visual** (PDF/layout) permanece fora do escopo — reaproveita o módulo Documentos já
  existente para o arquivo em si.
- Nenhum bucket, gerador de documento ou sistema de arquivos novo foi criado.

## 14. Integração com `member_history`

Reaproveita 100% `public.member_history` — nenhuma timeline própria. **Nenhuma extensão do catálogo
`history_type` foi necessária**: os 5 marcos genéricos criados na Operação 2
(`matricula`/`inicio_formacao`/`conclusao_formacao`/`desligamento_formacao`/`transferencia_turma`)
foram nomeados de propósito para reutilização por Teologia, e `certificado_emitido` já existia da
Operação 1. Um trigger (`_theology_enrollments_register_history`, AFTER INSERT/UPDATE OF status em
`theology_enrollments`) registra esses marcos automaticamente via helper interno próprio
(`_register_theology_member_history`), que reconfirma `can_operate_theology_class()` e o escopo
organizacional do membro antes de gravar com `source_module='teologia'`,
`source_table='theology_enrollments'` e `source_id`. Assim, coordenador/secretário/professor
autorizado no escopo da turma **não precisa de `members.write`** para registrar um marco acadêmico
legítimo. Presenças, aulas e notas **não** entram na timeline — ficam em `theology_attendance`/
`theology_assessment_results`, evitando poluir o histórico institucional.

## 15. Telas e fluxos

- `src/pages/Teologia.tsx` — 6 abas com scroll horizontal (Visão Geral, Currículo, Períodos e
  Turmas, Alunos e Boletins, Financeiro Acadêmico, Configurações), mesmo padrão visual de
  `Discipulado.tsx`/`Financeiro.tsx`.
- `src/components/teologia/`: `TeologiaOverview` (contadores reais — institutos, programas ativos,
  períodos abertos, turmas ativas, com loading/erro explícitos), `TeologiaCurriculum` (institutos,
  núcleos, matérias, programas e matriz curricular ordenada, com ativação de programa condicionada a
  ter ao menos uma matéria ativa), `TeologiaPeriodsClasses` (períodos, turmas, transições de
  status), `TeologiaClassDetail` (resumo/equipe/matrículas/ofertas de uma turma),
  `TeologiaOfferingDetail` (matrículas na oferta com tentativas, sessões, frequência, avaliações e
  notas), `TeologiaStudents` (busca de aluno + boletim/histórico via `get_theology_student_transcript`,
  e lista de formandos por período), `TeologiaFinance` (filtro de transações vinculadas por
  período/matrícula + vínculo manual, exigindo `finance.write`/`finance.approve` real —
  **não** `finance.manage`, que não existe como capability), `TeologiaSettings` (modelos de
  avaliação e componentes), `TeologiaMemberPicker` (busca server-side via `search_theology_members`,
  mesmo padrão do `DiscipuladoMemberPicker`), `teologiaFormHelpers.tsx` (re-export dos helpers
  genéricos de `discipuladoFormHelpers.tsx` — nenhuma duplicação visual).
- `src/lib/theology/{constants,rules,service}.ts` — catálogos espelhando os `CHECK`s do banco,
  regras puras testáveis (83 testes em `rules.test.ts`), e camada de serviço sobre o Supabase
  client.
- Rota `/admin/teologia` registrada em `App.tsx` (lazy, só quando `IS_STAGING_BUILD`), protegida por
  `ProtectedRoute` + `ModuleGate(moduleId="theology")`. Item de menu "Teologia" (ícone `Landmark`) em
  `AdminLayout.tsx`, visibilidade real controlada por `isRouteEnabled()`. Nenhum formulário de membro
  foi duplicado — a seleção de aluno/professor usa `TeologiaMemberPicker` (retorno mínimo, sem CPF/
  telefone/endereço) e a Teologia nunca baixa a lista completa de membros da organização (limite de
  50 por busca).

## 16. Responsividade

Mesmo padrão de `Discipulado.tsx`/`Financeiro.tsx`: abas com scroll horizontal em telas estreitas
(setas de navegação condicionais), cards em vez de tabelas largas para listas de turmas/matrículas/
ofertas em mobile, formulários em `flex-col` com labels e ajuda curta, botões com motivo de
desabilitação exibido via mensagem de erro/estado (nunca um botão silenciosamente inerte).

## 17. Testes executados e resultados reais

- **`src/config/theologyMigrations.test.ts` (novo, 132 testes)**: mirror byte a byte (`sha256`)
  staging/produção das 6 migrations, presença no manifest, dependência cronológica declarada,
  ausência de `DROP TABLE`/`TRUNCATE`, transação `BEGIN`/`COMMIT` + verificação pós-DDL em todas,
  nenhuma migration de Operação 1/2 reaberta, regra central de identidade (nenhuma tabela de
  pessoa/organização/documento/storage paralela), RLS habilitado nas 19 tabelas, ausência de
  `USING/WITH CHECK (true)`, toda policy usando capability real, revogação de escrita direta nas 7
  tabelas de máquina de estado + `GRANT UPDATE (colunas)` restrito nas 5 tabelas com edição parcial,
  `REVOKE ALL`/`GRANT EXECUTE` das 22 RPCs públicas e das 16 funções internas, índices únicos de
  concorrência/duplicidade, máquinas de estado protegidas contra lançamento em contexto fechado,
  auditoria de alteração de nota (ordem INSERT-antes-de-UPDATE verificada), invariantes de escopo
  organizacional em cada trigger de validação, professor limitado à própria atribuição,
  capabilities/responsabilidades cruzadas com `accessControl.ts`, metadados legados nas 13 tabelas
  relevantes com índice único parcial nas que têm identidade natural, integração com
  `member_history` (tipos reutilizados, sem extensão de catálogo, presença/nota fora da timeline),
  certificado idempotente, vínculo financeiro sem duplicar valor/saldo/fechamento, diretório mínimo
  de membros sem PII, formatura sem dependência de pagamento.
- **`src/lib/theology/rules.test.ts` (novo, 83 testes)**: frequência, pesos/escala de avaliação,
  média ponderada, arredondamento, elegibilidade de conclusão, todas as transições válidas/inválidas
  de período/turma/oferta/matrícula/matrícula-em-oferta, fechamento, capacidade, próxima tentativa.
- **`src/config/modules.test.ts` (estendido, +1 teste)**: `theology` desabilitado em produção/
  habilitado em staging.
- **`src/config/hierarchicalAccessResponsibilities.test.ts` (estendido)**: `theology_coordinator`/
  `theology_secretary`/`theology_teacher` reconhecidos somando o texto de
  `20260730090000_theology_foundation.sql` ao conjunto de migrations de responsabilidade — mesmo
  padrão já usado por Discipulado.

**Resultado real da suíte completa** (`npx vitest run`, executado neste ambiente):
**49 arquivos e 761 testes aprovados, 0 falhas**. `npx tsc --noEmit`: 0 erros. `npx eslint` nos
arquivos novos/alterados: 0 problemas. `git diff --check` (incluindo os arquivos novos, via
`git add -N .` seguido de reset): 0 erros de espaço em branco. `npm run build:staging`: build
concluído, chunk `Teologia-*.js` gerado como entrada lazy separada (confirmando tree-shaking
condicional). `npm run build:production` (simulado localmente com `VERCEL=1`/
`VERCEL_ENV=production` e valores públicos/não-secretos de projeto/domínio, necessário porque
`scripts/check-environment.mjs` recusa build de produção fora da Vercel): build concluído **sem**
nenhum chunk de Teologia/Discipulado. `npm run verify:production-bundle`: **"nenhum módulo
staging-only encontrado no build de produção"**.

## 18. Problemas encontrados e corrigidos durante a construção

- Lookup incorreto de nome de matéria em `TeologiaClassDetail.tsx` (usava `item.notes` em vez do
  `subject_id` do item de currículo) — corrigido carregando `theology_subjects` e construindo um
  mapa `subjectNameById`.
- Lookup incorreto de nome de aluno em `TeologiaOfferingDetail.tsx` (`memberNames` estava indexado
  por `member_id`, mas os diálogos de frequência/avaliação usavam `enrollment_id`) — corrigido
  carregando `theology_enrollments` no nível da turma e construindo um mapa
  `studentNameByEnrollmentId`.
- `FormInputLabeled` (componente genérico compartilhado com Discipulado) não aceitava `max` —
  adicionada a prop opcional de forma retrocompatível em vez de duplicar o componente para Teologia.
- `TeologiaFinance.tsx` checava a capability inexistente `finance.manage` — corrigido para
  `finance.write`/`finance.approve` (capabilities financeiras reais).
- `FormandosView` (`TeologiaStudents.tsx`) exibia apenas turma/programa sem identificar o aluno —
  corrigido buscando nomes via `get_theology_member_labels`.
- `hierarchicalAccessResponsibilities.test.ts` falhava por não reconhecer `theology_coordinator`
  como definido no banco — corrigido somando `20260730090000_theology_foundation.sql` ao conjunto
  de migrations de responsabilidade lido pelo teste.
- `npx tsc --noEmit` reportava falso "sem exit status" ao rodar em background neste ambiente Windows
  — causa raiz era uma política de sandbox incompatível (`workspace_readwrite` não suportado); a
  execução direta (não backgrounded) com permissão `all` funcionou normalmente.

## 19. Limitações reais

- Emissão **visual** do certificado (PDF/layout) não implementada — só o contrato de elegibilidade e
  registro (seção 13).
- Importação em lote do WinTechi não implementada — apenas metadados legados (`legacy_source`/
  `legacy_module`/`legacy_code` + índices únicos parciais) prontos para uma futura importação
  idempotente.
- **Lacuna financeira documentada** (seção 12): "Emissão de Recibos" e "Fechamento Diário ou
  Período" por módulo não têm operação equivalente segura no Financeiro real hoje — a Teologia usa
  o fechamento mensal geral existente; uma tela dedicada de "recibo por matrícula" precisaria ser
  desenhada no próprio Financeiro (fora do escopo desta operação) se for exigida no futuro.
- Nenhuma migration foi aplicada — o módulo não funciona em nenhum ambiente real ainda; é
  staging-only e staging não tem as tabelas até a aplicação manual.
- `TeologiaOverview`/`TeologiaStudents` fazem algumas leituras agregadas client-side (contagens
  simples) em vez de RPCs agregadoras dedicadas — aceitável no volume esperado de um módulo novo,
  candidato a RPC de relatório se o volume crescer (mesma ressalva já registrada para Discipulado).

## 20. Instruções manuais não executadas

1. Revisar as 6 migrations e aplicá-las em **staging** primeiro (`supabase db push` manual, nunca
   por este agente), sempre em ordem cronológica.
2. Validar RLS/RPCs com dados reais de teste em staging (matrícula, frequência, avaliação,
   fechamento de turma/oferta, emissão de certificado, vínculo financeiro).
3. Só então promover `theology` de `"staging"` para `"both"` em `src/config/modules.ts` (e remover a
   condicional `IS_STAGING_BUILD` em `App.tsx`), aplicar em produção, e então liberar o item de menu
   para todas as organizações.
4. Decidir produto sobre a lacuna financeira da seção 12 (recibo/fechamento por módulo) antes de
   apresentar a Teologia como substituição completa do legado nesse ponto.
5. Nenhum push, PR, deploy ou aplicação de migration deve ocorrer antes da homologação manual e da
   revisão Codex deste patch.

## 21. Pontos de extensão para Missões

- `members`/`organizations`/`has_org_access_permission()`/`is_organization_descendant_or_self()` —
  reutilizar diretamente; nenhuma pessoa/organização paralela foi criada nesta operação.
- `member_history` — Missões deve usar `source_module='missoes'` (já presente no enum desde a
  Operação 1/2) e, se precisar de marcos próprios, estender o catálogo por migration nova (nunca
  reabrindo `20260729120000`/`20260730130000`).
- Padrão de matrícula/tentativa (`enrollments` + `offering_enrollments` com `attempt_number`,
  máquina de estados, capacidade sob lock, unicidade de matrícula ativa) — reutilizável se Missões
  tiver semântica de "projeto/campo com múltiplas fases/ciclos" comparável; **decisão real só deve
  ser tomada auditando o modelo de Missões**, nunca antecipada aqui.
- Modelo de avaliação configurável (`assessment_models` + `assessment_model_components` + trava
  pós-uso) — padrão genérico o suficiente para qualquer domínio que precise de "nota"/"critério"
  configurável sem reabrir tabela fixa.
- Helper de histórico com reautorização de escopo antes de gravar em `member_history` (evita exigir
  `members.write` de operador de módulo) — mesmo padrão a replicar.
- Vínculo financeiro fino (`transaction_links` sem valor monetário, exigindo capabilities de ambos
  os domínios) — mesmo padrão caso Missões precise ligar contribuições/campanhas a transações reais.
- Documentos/certificados: mesmo contrato de elegibilidade + `documents` + `member_history` tipo
  `certificado_emitido`.
- Capabilities/responsabilidades: mesmo padrão de nomenclatura (`<dominio>.read/manage/teach/
  confidential`) e escopo (`inheritsToDescendants`, `governance`).
- **Nenhum campo, tabela, capability ou tela de Missões foi criado nesta operação** — pertence à
  Operação 4.

## 22. Riscos que o próximo agente/revisor deve observar

1. **Migrations não aplicadas**: qualquer tentativa de usar o módulo em staging real vai falhar até
   as 6 migrations serem aplicadas manualmente, em ordem, com preflight validado.
2. **Dependência cronológica intencional** entre a migration 3
   (`theology_periods_classes_enrollments`) e a migration 4
   (`theology_attendance_and_assessments`): `update_theology_class_status()` consulta
   `theology_sessions` (criada só na migration 4), protegido por
   `to_regclass('public.theology_sessions') IS NOT NULL` — documentado no cabeçalho da migration 3,
   mas qualquer reordenação futura das 6 migrations quebra silenciosamente até a primeira execução
   real de `update_theology_class_status()`.
3. **`20260716130000_hierarchical_access_responsibilities.sql` está em `production_management`** —
   não deve ser reescrita por nenhuma operação futura; novas responsabilidades sempre em migration
   nova (já seguido aqui).
4. **Lacuna financeira não resolvida** (seção 12/19) — se a Operação 4 (Missões) também precisar de
   "recibo"/"fechamento por módulo", vale desenhar essa capacidade uma única vez no Financeiro real
   em vez de cada domínio documentar a mesma lacuna isoladamente.
5. **Esta entrega ainda não passou pela revisão Codex** (diferente do que os documentos das
   Operações 1/2 registram após revisão) — os testes/builds da seção 17 foram executados pelo agente
   construtor (Sonnet) neste mesmo turno; a revisão deve repetir a validação de forma independente
   antes de qualquer aplicação de migration.

## 23. Confirmação final

- Nenhum `git commit` foi executado.
- Nenhum `git push` foi executado.
- Nenhum PR foi aberto.
- Nenhum merge foi executado.
- Nenhum deploy (Vercel ou outro) foi realizado.
- Nenhuma migration foi aplicada (`supabase db push` nunca executado; nenhum SQL executado contra
  staging ou produção; nenhum `supabase migration repair`).
- Nenhum seed e nenhuma importação de dado real foi executada.
- Chat, Autenticação, perfil do membro, módulos WinTechi legados e as migrations das Operações 1/2
  não foram alterados. `src/pages/GerenciarAcessos.tsx` só recebeu o filtro estritamente necessário
  para isolar responsabilidades `theology_*` do Gerenciador de Acessos de produção enquanto o módulo
  for staging-only — mesmo padrão já aplicado para `discipleship_*`.
- A Operação 4 (Missões) não foi iniciada: nenhuma tabela, tela, rota ou capability de Missões foi
  criada.
