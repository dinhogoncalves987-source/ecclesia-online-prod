# Operação 2 — Discipulado completo sobre a fundação revisada do Ecclesia

Documento de passagem e revisão. Ver também `docs/architecture/contrato-dominios-institucionais.md` (contrato
entre os quatro domínios) e `docs/architecture/operacao-1-secretaria.md` (Operação 1, já revisada).

Entrega estrutural recebida na branch `handoff/sonnet-operacao-2-discipulado-20260723`, criada a
partir de `review/operacao-1-secretaria`. Revisão Codex executada na branch
`review/operacao-2-discipulado`. Nenhuma migration foi aplicada e nenhum deploy foi executado.

## 1. Estado encontrado antes da operação (auditoria)

- **Pessoa/membro**: `public.members` — única tabela de pessoa, com `member_addresses`,
  `member_family`, `member_history`, `member_occurrences`, `member_ordinations`,
  `member_transfers`, `member_organization_history` já criados pela Operação 1 (não aplicados).
  Busca por pessoa: `src/lib/memberSearch.ts` (`matchesMemberSearch`, usada por `Membros.tsx`).
- **Organizações**: `public.organizations` (`parent_id` self-FK), autorização por
  `has_org_access_permission(user_id, organization_id, permission_key)` +
  `access_responsibility_definitions` + `organization_responsibles`, herança via
  `is_organization_descendant_or_self()`.
- **Documentos**: `public.documents` (institucional, org-wide) + bucket privado `member-documents`
  (path `{organization_id}/{member_id}/...`).
- **Histórico institucional**: `public.member_history` + `register_member_history_event()` (RPC
  interna, `EXECUTE` restrito a `service_role`), com `history_type` fechado por `CHECK`. Antes desta
  operação NÃO cobria matrícula/formação — confirmado lendo a migration da Operação 1, não apenas
  `types.ts`.
- **Groups/departamentos**: `public.groups` existe, mas representa **pequenos grupos de comunhão**
  (líder, dia/hora de reunião) — semanticamente incompatível com "departamento curricular" do
  WinTechi (Infantil, Juvenil, Missões como categoria de curso). Decisão: não reaproveitar,
  não forçar `groups` a significar algo que não significa (ver seção 4).
- **Locais**: nenhuma tabela existente representa "sala/templo/residência/on-line" como local
  operacional de uma aula. `public.organizations` representa igreja/unidade, não um cômodo. Decisão:
  criar `discipleship_locations` como catálogo simples (ver seção 4).
- **Eventos/agenda**: `groups`/`group_members`/`schedule_assignments` existem para escala de
  ministérios — não representam turma, matrícula, currículo ou avaliação. Nenhuma reutilização
  forçada.
- **`access_responsibility_definitions`**: já hierárquico e cumulativo (Operação anterior à Op.1),
  com `permission_keys text[]`, `inherits_to_descendants`, `is_governance`. Padrão a seguir
  exatamente para as 3 responsabilidades novas.
- **Frontend/rotas**: `AdminLayout.tsx` (navegação por seções), `App.tsx` (rotas +
  `IS_STAGING_BUILD`), `src/config/modules.ts` (allowlist central de disponibilidade por ambiente),
  `ModuleGate` (gate de rota por módulo). Padrão de módulo staging-only já existente:
  Marketplace/Comunidade.
- **Testes/validação**: `vitest run`, `npx tsc --noEmit`, `npx eslint` nos arquivos alterados,
  `git diff --check`, `npm run build:staging`, `npm run verify:production-bundle`. Migrations são
  testadas por leitura de arquivo (regex), nunca contra um banco real (mesmo padrão da Operação 1).

## 2. Telas e funções identificadas no legado (WinTechi)

Cadastro de Alunos, Cadastro de Professores/Discipuladores, Acompanhamento (Curso Bíblico), Turmas,
Locais para Discipular, Departamentos, Lições de Estudo, Tipos de Curso, Relatórios cadastrais —
ver prompt da operação para a lista completa de campos observados em cada tela.

## 3. Tradução do legado para o modelo moderno

| WinTechi | Ecclesia moderno |
|---|---|
| Cadastro de Alunos | Matrícula de um `members.id` existente em `discipleship_enrollments` |
| Cadastro de Professores/Discipuladores | `discipleship_staff_assignments` (papel operacional sobre `members.id`, nunca nova pessoa) |
| Acompanhamento (Curso Bíblico) | Ficha da matrícula: `discipleship_enrollments` + `discipleship_attendance` + `discipleship_assessment_results` + `discipleship_followups`, com progresso calculado por `get_discipleship_enrollment_progress()` |
| Turmas | `discipleship_classes` (turma/coorte de um curso, com datas/capacidade/modalidade/local/status) |
| Locais para Discipular | `discipleship_locations` (catálogo operacional — nunca uma unidade organizacional) |
| Departamentos | `discipleship_departments` (catálogo curricular opcional, distinto de `groups`) |
| Lições de Estudo | `discipleship_lessons` (currículo ordenado do curso, sequência única) |
| Tipos de Curso | `discipleship_courses` (catálogo com regras de frequência/avaliação/conclusão configuráveis) |
| Relatórios cadastrais | Aba "Relatórios" do módulo — agregações reais sobre as tabelas acima, sem número fictício |

## 4. Decisões de domínio

1. **Locais**: `discipleship_locations` é catálogo simples (nome, tipo, capacidade, ativo) ligado a
   `organizations.id` — nunca substitui igreja/congregação/setor/distrito. Local é referenciado
   opcionalmente por `discipleship_classes` e `discipleship_sessions`.
2. **Departamentos**: `discipleship_departments` é catálogo opcional (FK nullable em
   `discipleship_courses.department_id`) — `groups` NÃO foi reaproveitado porque representa um
   conceito de comunhão (pequeno grupo com líder/reunião), não uma categoria curricular.
3. **Sem motor universal de cursos**: cada entidade (`courses`, `lessons`, `classes`,
   `enrollments`, `staff_assignments`, `sessions`, `attendance`, `assessments`,
   `assessment_results`, `followups`) é uma tabela tipada própria — nenhuma tabela genérica
   `events`/`records` com JSON livre.
4. **RLS direto vs. RPC**: catálogos simples sem máquina de estados (`locations`, `departments`,
   `courses`, `lessons`) usam policies RLS diretas de INSERT/UPDATE/DELETE por capability. Tabelas
   com máquina de estados ou risco de burla de autoria/estado (`classes.status`,
   `staff_assignments`, `enrollments`, `attendance`, `assessment_results`, `followups`) revogam
   escrita direta de `authenticated` e expõem só RPCs `SECURITY DEFINER` validadas — mesmo padrão de
   `member_occurrences` na Operação 1.
5. **Dependência cronológica documentada, não escondida**: `update_discipleship_enrollment_status()`
   (migration 2) consulta `discipleship_attendance`/`discipleship_assessment_results` (migration 3).
   Isso é seguro porque PL/pgSQL não valida a existência de tabelas no `CREATE FUNCTION`, só na
   primeira execução — e as 4 migrations sempre são aplicadas em sequência. Documentado no cabeçalho
   da migration 2.

## 5. Entidades criadas (12 tabelas, 4 migrations, nenhuma aplicada)

| Migration | Tabelas/objetos |
|---|---|
| `20260729090000_discipleship_foundation.sql` | Capabilities novas + 3 responsabilidades operacionais + `discipleship_locations` + `discipleship_departments` + `discipleship_courses` + `discipleship_lessons` + RPC `reorder_discipleship_lessons` |
| `20260729100000_discipleship_classes_and_enrollments.sql` | `discipleship_classes` + RPC `update_discipleship_class_status` + `discipleship_staff_assignments` + RPCs `assign_discipleship_staff`/`end_discipleship_staff_assignment` + helpers `_is_discipleship_class_staff`/`can_operate_discipleship_class` + `discipleship_enrollments` + RPCs `enroll_member_in_class`/`update_discipleship_enrollment_status` |
| `20260729110000_discipleship_learning_records.sql` | `discipleship_sessions` + RPC de estado `update_discipleship_session_status` + `discipleship_attendance` + RPC `record_discipleship_attendance` + `discipleship_assessments` + RPC de estado `update_discipleship_assessment_status` + `discipleship_assessment_results` + RPC `record_discipleship_assessment_result` + `discipleship_followups` + RPC `create_discipleship_followup` + RPC `get_discipleship_enrollment_progress` |
| `20260729120000_discipleship_permissions_and_history.sql` | Extensão da `CHECK` de `member_history.history_type` + helper interno de histórico com escopo validado + diretório mínimo de membros (`search_discipleship_members`/`get_discipleship_member_labels`) + contrato idempotente de certificado (`certificate_document_id`/`certificate_issued_at` + RPC `mark_discipleship_certificate_issued`) + trigger `_discipleship_enrollments_register_history` |

Todas as 4 migrations foram espelhadas byte a byte em `supabase-production/supabase/migrations/` e
listadas em `supabase/migration-manifest.json` na categoria `staging_feature` (ver teste
`src/config/discipleshipMigrations.test.ts`).

## 6. Relações com `members` e `organizations`

- Toda participação (`discipleship_enrollments.member_id`, `discipleship_staff_assignments.member_id`,
  `discipleship_sessions.instructor_member_id`) referencia `public.members(id)`. Nenhuma tabela de
  pessoa própria do módulo.
- Toda turma/local/curso/departamento referencia `public.organizations(id)`. Um trigger
  (`_discipleship_classes_validate_org_scope`) garante que a organização da turma seja a mesma do
  curso ou uma descendente (`is_organization_descendant_or_self`) — nunca uma organização de outra
  árvore/denominação.
- `discipleship_enrollments.organization_id` é um **snapshot** da organização efetiva do membro no
  momento da matrícula (`COALESCE(congregation_id, sector_id, organization_id)`), usado para
  indexação/relatórios — a autorização real sempre resolve pela organização da turma.

## 7. Regras de conclusão

`update_discipleship_enrollment_status()` bloqueia a transição para `concluido` quando o curso exige
frequência/avaliação e os registros reais não atingem o mínimo configurado
(`minimum_attendance_percentage`, `minimum_passing_score`), a menos que `p_override_eligibility =
true` seja passado explicitamente por quem tem `discipleship.manage` (exceção justificada, nunca um
botão livre). `src/lib/discipleship/rules.ts#checkCompletionEligibility` espelha a mesma lógica no
frontend só para feedback imediato — a autoridade final é sempre a RPC.

## 8. Integrações com `member_history`

Reaproveita 100% `public.member_history` — nenhuma timeline própria. Catálogo estendido (migration 4)
com 5 marcos genéricos, reutilizáveis por Teologia sem nova migration de catálogo:
`matricula`, `inicio_formacao`, `conclusao_formacao`, `desligamento_formacao`, `transferencia_turma`.
Um trigger (`_discipleship_enrollments_register_history`, AFTER INSERT/UPDATE OF status) registra
esses marcos automaticamente via helper interno próprio, que deriva e valida o escopo da organização
antes de chamar o registro institucional com `source_module='discipulado'`,
`source_table='discipleship_enrollments'` e `source_id`. Assim, professor e operador de Discipulado
não recebem implicitamente `members.write`. Presenças, aulas e notas **não** entram na
timeline (ficam em `discipleship_attendance`/`discipleship_assessment_results`, evitando poluição).
`certificado_emitido` (tipo já existente da Operação 1) é reaproveitado por
`mark_discipleship_certificate_issued()`.

## 9. Documentos e anexos

- `discipleship_followups.document_id` referencia `public.documents(id)`; `attachment_path` segue o
  mesmo padrão de path `{organization_id}/{member_id}/...` do bucket `member-documents`, validado na
  RPC `create_discipleship_followup()`.
- `discipleship_enrollments.certificate_document_id` referencia `public.documents(id)`. A **emissão
  visual** (PDF/layout) do certificado está fora do escopo desta operação — o que foi entregue é o
  **contrato**: elegibilidade calculável + registro auditado quando um documento (emitido por fora,
  no módulo Documentos já existente) é vinculado à matrícula concluída via
  `mark_discipleship_certificate_issued()`. Nenhum gerador genérico de documento foi criado; nenhuma
  emissão falsa foi simulada.
- Nenhum bucket novo foi criado.

## 10. Capabilities e responsabilidades

Capabilities novas (`src/lib/accessControl.ts` + `access_responsibility_definitions.permission_keys`):
`discipleship.read`, `discipleship.manage`, `discipleship.teach`, `discipleship.confidential`.
`church_admin`/`responsible_pastor` recebem as 4 idempotentemente (mesmo padrão de
`members.confidential` na Op. 1). Responsabilidades operacionais novas:

| Responsabilidade | Permissões | Herda a descendentes | Governança |
|---|---|---|---|
| `discipleship_coordinator` | `discipleship.read`, `discipleship.manage`, `discipleship.teach` | não | não |
| `discipleship_secretary` | `discipleship.read`, `discipleship.manage` | não | não |
| `discipleship_teacher` | `discipleship.read`, `discipleship.teach` | não | não |

Nenhuma das três recebe `discipleship.confidential` por conveniência (mesmo padrão de `secretary`
não ter `members.confidential`). `discipleship.teach` sozinho não basta para operar qualquer turma —
`can_operate_discipleship_class()` também exige que a pessoa (via `members.user_id`) esteja
efetivamente atribuída (`discipleship_staff_assignments`, status `ativo`) àquela turma específica.

## 11. Policies RLS

Todas as 12 tabelas têm `ENABLE ROW LEVEL SECURITY`. Nenhuma policy usa `USING (true)` ou
`WITH CHECK (true)` (testado). Catálogos simples usam `has_org_access_permission()` direto;
tabelas dependentes de turma resolvem a organização por `EXISTS (... JOIN discipleship_classes ...)`
— nunca duplicam `organization_id` como segunda fonte de verdade fora de `discipleship_classes`/
`discipleship_enrollments` (que guardam um snapshot documentado). Tabelas com máquina de estados
revogam INSERT/UPDATE/DELETE de `authenticated` e só concedem `SELECT` — escrita exclusivamente por
RPC (`discipleship_staff_assignments`, `discipleship_enrollments`, `discipleship_attendance`,
`discipleship_assessment_results`, `discipleship_followups`). `discipleship_classes` revoga o
`UPDATE` amplo e concede apenas colunas operacionais (nunca `status`, `organization_id`,
`course_id`) via `GRANT UPDATE (colunas...)`.

## 12. RPCs e máquinas de estado

15 RPCs públicas (`GRANT EXECUTE ... TO authenticated`, todas com `REVOKE ALL FROM PUBLIC, anon`):
`reorder_discipleship_lessons`, `update_discipleship_class_status`, `assign_discipleship_staff`,
`end_discipleship_staff_assignment`, `enroll_member_in_class`, `update_discipleship_enrollment_status`,
`update_discipleship_session_status`, `record_discipleship_attendance`,
`update_discipleship_assessment_status`, `record_discipleship_assessment_result`,
`create_discipleship_followup`, `get_discipleship_enrollment_progress`,
`search_discipleship_members`, `get_discipleship_member_labels`,
`mark_discipleship_certificate_issued`. Mais 3 funções internas (revogadas também de
`authenticated`) diretamente ligadas à operação, além dos triggers internos de validação:
`_is_discipleship_class_staff`, `can_operate_discipleship_class` e
`_register_discipleship_member_history`.

Máquinas de estado (espelhadas em `src/lib/discipleship/rules.ts` só para UX, autoridade real na RPC):

- **Turma**: `planejamento → inscrições_abertas → em_andamento → concluída/cancelada`, com
  arquivamento terminal a partir de `concluída`/`cancelada`, e reabertura controlada
  (`concluída`/`cancelada → em_andamento`) somente pela RPC.
- **Matrícula**: `lista_espera → matriculado → ativo → concluído/desistente/transferido/cancelado`
  (estados finais não têm saída — histórico preservado, nunca apagado fisicamente).

## 13. Migrations

4 migrations cronológicas (`20260729090000`–`20260729120000`), cada uma com preflight (`DO $$
... RAISE EXCEPTION` se dependência ausente), `BEGIN`/`COMMIT`, e verificação final pós-DDL. Nenhuma
foi aplicada em nenhum banco. Espelhadas byte a byte em `supabase-production/` e listadas em
`supabase/migration-manifest.json` (`staging_feature`).

## 14. Frontend e rotas

- `src/pages/Discipulado.tsx` — página com abas (Visão Geral, Cursos e Lições, Turmas,
  Participantes, Relatórios), mesmo padrão visual de abas roláveis de `src/pages/Financeiro.tsx`.
- `src/components/discipulado/*` — `DiscipuladoOverview`, `DiscipuladoCourses`, `DiscipuladoClasses`,
  `DiscipuladoClassDetail` (resumo/equipe/alunos/encontros/avaliações), `DiscipuladoParticipants`,
  `DiscipuladoReports`, `DiscipuladoMemberPicker` (busca server-side por RPC com retorno mínimo,
  sem baixar CPF, contato ou toda a base de membros),
  `discipuladoFormHelpers.tsx` (inputs nativos, no mesmo padrão de `MemberProfile.tsx`).
- `src/lib/discipleship/{constants,rules,service}.ts` — catálogos espelhando os `CHECK`s do banco,
  regras puras testáveis, e camada de serviço sobre o Supabase client.
- Rota `/admin/discipulado` registrada em `App.tsx` (lazy, só quando `IS_STAGING_BUILD`), protegida
  por `ProtectedRoute` + `ModuleGate(moduleId="discipleship")`. Item de menu em `AdminLayout.tsx`
  (seção "Espiritual"). Nenhum formulário de membro foi duplicado — `DiscipuladoParticipants` linka
  para `/admin/membros/:id` (perfil institucional já existente).

## 15. Relatórios

Aba "Relatórios" (`DiscipuladoReports.tsx`) agrega por turma: alunos ativos, conclusões, frequência
média e lançamentos de presença pendentes. O denominador esperado considera apenas aulas realizadas
dentro do período de cada matrícula; ausências de lançamento são exibidas como pendência em vez de
serem escondidas. Tudo é calculado sobre `discipleship_enrollments`,
`discipleship_sessions` e `discipleship_attendance` reais, nunca número fictício.

## 16. Metadados legados

Todas as 12 tabelas têm `legacy_source`/`legacy_module`/`legacy_code`. 7 tabelas com identidade
natural própria (`locations`, `departments`, `courses`, `lessons`, `classes`, `enrollments`,
`sessions`) têm índice único parcial `WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL`
para idempotência de importação futura. A importação em lote do WinTechi **não foi implementada**
nesta operação.

## 17. Testes executados após a revisão Codex

- `src/config/discipleshipMigrations.test.ts` (novo): mirror byte a byte staging/produção,
  manifest, regra central de identidade, RLS habilitado nas 12 tabelas, ausência de
  `USING/WITH CHECK (true)`, revogações de escrita direta, `REVOKE ALL`/`GRANT EXECUTE` de todas as
  RPCs públicas e internas, índices únicos de regra de negócio, máquinas de estado protegidas,
  capabilities/responsabilidades (cruzado com `accessControl.ts`), metadados legados, integração
  com `member_history`, dependência cronológica e não-destrutividade.
- `src/lib/discipleship/rules.test.ts` (novo): frequência, média ponderada, validação de nota,
  elegibilidade de conclusão, todas as transições válidas/inválidas de turma e matrícula,
  fechamento de turma/matrícula, capacidade.
- `src/config/modules.test.ts` (estendido): `discipleship` desabilitado em produção/habilitado em
  staging (módulo e rota).
- `src/config/hierarchicalAccessResponsibilities.test.ts` (corrigido): o teste "cobre exatamente as
  responsabilidades declaradas no frontend" lia só a migration `20260716130000` (já em
  `production_management`, não pode ser reescrita); passou a somar o texto de
  `20260729090000_discipleship_foundation.sql` — mesmo padrão que Teologia/Missões deverão seguir.

Resultado final local da suíte completa: **47 arquivos e 545 testes aprovados, 0 falhas**.
Também foram executados `tsc --noEmit`, ESLint dos arquivos alterados, build de staging, build de
produção, verificação do bundle de produção e `git diff --check`; os resultados finais devem
acompanhar o patch de revisão.

## 18. Limitações reais

- Emissão **visual** do certificado (PDF/layout) não implementada — só o contrato de elegibilidade e
  registro (ver seção 9).
- Importação em lote do WinTechi não implementada — apenas metadados legados prontos.
- Nenhuma migration foi aplicada — o módulo não funciona em nenhum ambiente real ainda; é
  staging-only e staging não tem as tabelas até a aplicação manual.
- `DiscipuladoParticipants`/`DiscipuladoReports` fazem leituras agregadas client-side em vez de
  RPCs agregadoras dedicadas — aceitável no volume esperado de um módulo novo, mas candidato a RPC
  de relatório se o volume crescer.

## 19. Instruções manuais não executadas

1. Revisar as 4 migrations e aplicá-las em **staging** primeiro (`supabase db push` manual,
   nunca por este agente).
2. Validar RLS/RPCs com dados reais de teste em staging.
3. Só então promover `discipleship` de `"staging"` para `"both"` em `src/config/modules.ts` (e
   remover a condicional `IS_STAGING_BUILD` em `App.tsx`), aplicar em produção, e então liberar o
   item de menu para todas as organizações.
4. Nenhum push, PR, deploy ou aplicação de migration deve ocorrer antes da homologação manual do
   patch de revisão.

## 20. Pontos de extensão para Teologia

- `members`/`organizations`/`has_org_access_permission()`/`is_organization_descendant_or_self()` —
  reutilizar diretamente.
- Padrão de matrícula (`enrollments` com máquina de estados + capacidade + unicidade de ativa) —
  reutilizável se Teologia tiver a mesma semântica de curso/turma.
- `member_history` — os 5 tipos novos (`matricula`, `inicio_formacao`, `conclusao_formacao`,
  `desligamento_formacao`, `transferencia_turma`) foram nomeados **genericamente de propósito** para
  Teologia reutilizar sem nova migration de catálogo.
- Frequência (`calculateAttendancePercentage`), avaliação ponderada
  (`calculateWeightedAverageScore`) e elegibilidade de conclusão — mesmas funções puras em
  `src/lib/discipleship/rules.ts` podem ser generalizadas/copiadas se a semântica for realmente
  igual (contrato compartilhado só quando comprovado, nunca antecipado).
- Certificados: mesmo contrato de elegibilidade + `documents` + `member_history` tipo
  `certificado_emitido` (já existente da Op. 1, reaproveitável).
- Capabilities/responsabilidades: mesmo padrão de 3 responsabilidades operacionais + 1 capability
  confidencial nunca concedida por conveniência.
- **Não implementado nesta operação** — cabe à Operação 3.

## 21. Pontos de extensão para Missões

- `members` como pessoa (um concluinte do Discipulado poderá futuramente participar de Missões sem
  nova pessoa).
- `organizations` como origem/vínculo institucional.
- `member_history` como timeline institucional única — Missões deve usar `source_module='missoes'`
  (já presente no enum) e, se precisar, estender o catálogo por migration nova (nunca reabrindo as
  já promovidas).
- `documents`/`member-documents` e origem legada (`legacy_source`/`legacy_module`/`legacy_code`).
- Responsabilidades e capabilities — mesmo padrão de nomenclatura e escopo (`inheritsToDescendants`,
  `governance`).
- **Nenhum campo, tabela ou tela de missionários/contribuintes/projetos foi criado** — pertence à
  Operação 4.

## 22. Riscos que o próximo agente deve observar

1. **Migrations não aplicadas**: qualquer tentativa de usar o módulo em staging real vai falhar até
   as 4 migrations serem aplicadas manualmente, em ordem, com preflight validado.
2. **`20260716130000_hierarchical_access_responsibilities.sql` está em `production_management`** —
   não deve ser reescrita por nenhuma operação futura; novas responsabilidades sempre em migration
   nova (ver correção na seção 17, item 4).
3. **Dependência cronológica intencional** entre migrations 2 e 3 (`update_discipleship_enrollment_status`
   lê tabelas criadas depois) — documentada, mas qualquer reordenação futura das migrations quebra
   silenciosamente até a primeira execução real.
4. **`groups` permanece não reaproveitado** para departamento — se uma operação futura tentar unificar,
   revisar se a semântica de comunhão vs. currículo realmente convergiu antes de forçar.
5. **`discipleship_assessments` tem colunas legadas mas nenhum índice único parcial de legado** —
   decisão consciente desta operação (a unicidade natural da tabela, título+turma, não foi
   modelada como legado); revisar se a importação real do WinTechi precisar de idempotência aqui.

## 23. Principais correções da revisão Codex

- Fechadas as brechas de escopo entre árvores organizacionais em curso, turma, local, professor,
  matrícula, documento e acompanhamento.
- Corrigidas reordenação atômica de lições, corrida de capacidade e promoção de lista de espera.
- Conclusão de turma/matrícula agora bloqueia pendências acadêmicas reais; override exige
  `discipleship.manage` e justificativa explícita.
- Frequência só pode ser lançada em aula realizada; avaliação só recebe nota quando aplicada; notas
  são normalizadas para a escala 0–10.
- Estados de aula e avaliação ganharam RPCs próprias, sem alteração direta do campo `status`.
- Histórico institucional não concede `members.write` a professor por efeito colateral.
- Certificado ficou idempotente e valida o escopo organizacional do documento.
- Busca de aluno passou a ser server-side e mínima, sem exposição de PII desnecessária.
- Rota por capability passou a falhar fechada; responsabilidades de módulo staging-only não aparecem
  no Gerenciador de Acessos de produção.
- Interface ganhou cadastros de local/departamento, acompanhamento confidencial, feedback explícito
  de erros, estados operacionais e layouts móveis corrigidos.

## 24. Confirmação final da revisão

- A entrega Sonnet já existe como commit/push na branch de handoff; a revisão Codex é preparada como
  patch separado sobre esse commit.
- Nenhum push da revisão foi executado.
- Nenhum PR foi aberto pela revisão.
- Nenhuma migration foi aplicada (`supabase db push` nunca executado; nenhum SQL executado contra
  staging ou produção).
- Nenhum deploy foi realizado.
- Chat, Financeiro, login por telefone, VPS, Cloudflare, WhatsApp, Teologia e Missões funcionais não
  foram alterados.
